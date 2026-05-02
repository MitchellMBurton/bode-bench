use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{Manager, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

type JobHandle = Arc<Mutex<ClipExportJob>>;

#[derive(Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum SourceKind {
  Audio,
  Video,
}

#[derive(Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum QualityMode {
  CopyFast,
  ExactMaster,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportTuning {
  volume: f64,
  playback_rate: f64,
  pitch_semitones: f64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportToolFeatures {
  rubberband_filter: bool,
  volume_filter: bool,
  setpts_filter: bool,
  libx264_encoder: bool,
  aac_encoder: bool,
  pcm_s24le_encoder: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportToolReport {
  ffmpeg_path: String,
  ffmpeg_version: String,
  ffprobe_path: Option<String>,
  features: ExportToolFeatures,
  warnings: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum ExportToolStatus {
  Ready {
    report: ExportToolReport,
  },
  Missing {
    reason: String,
    report: Option<ExportToolReport>,
  },
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportPresetManifest {
  id: String,
  label: String,
  container: String,
  audio_codec: Option<String>,
  video_codec: Option<String>,
  quality_mode: QualityMode,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessorManifest {
  kind: String,
  name: String,
  version: Option<String>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipExportManifestSeed {
  job_id: String,
  source_asset_id: String,
  label: String,
  range_label: String,
  range_note: Option<String>,
  preset: ExportPresetManifest,
  processor: ProcessorManifest,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipExportManifestRange {
  label: String,
  note: Option<String>,
  start_s: f64,
  end_s: f64,
  duration_s: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipExportManifestArtifact {
  id: String,
  role: String,
  path: String,
  sha256: Option<String>,
  created_at_ms: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipExportManifest {
  schema: &'static str,
  version: u8,
  job_id: String,
  desktop_job_id: String,
  label: String,
  source_asset_id: String,
  source_path: String,
  source_kind: SourceKind,
  range: ClipExportManifestRange,
  quality_mode: QualityMode,
  tuning: Option<ExportTuning>,
  preset: ExportPresetManifest,
  processor: ProcessorManifest,
  tool_report: ExportToolReport,
  ffmpeg_args: Vec<String>,
  completed_at_ms: u64,
  artifacts: Vec<ClipExportManifestArtifact>,
}

#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum PickClipExportDestinationResult {
  Selected { path: String },
  Canceled,
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
enum ClipExportStatus {
  Queued {
    #[serde(rename = "progressPercent")]
    progress_percent: f64,
    message: String,
  },
  Running {
    #[serde(rename = "progressPercent")]
    progress_percent: f64,
    message: String,
  },
  Completed {
    #[serde(rename = "outputPath")]
    output_path: String,
    #[serde(rename = "manifestPath")]
    manifest_path: Option<String>,
    #[serde(rename = "manifestError")]
    manifest_error: Option<String>,
  },
  Failed {
    #[serde(rename = "errorText")]
    error_text: String,
  },
  Canceled,
}

impl ClipExportStatus {
  fn is_active(&self) -> bool {
    matches!(self, Self::Queued { .. } | Self::Running { .. })
  }
}

struct ClipExportJob {
  status: ClipExportStatus,
  cancel_flag: Arc<AtomicBool>,
}

struct ClipExportManager {
  next_job: AtomicU64,
  jobs: Mutex<HashMap<String, JobHandle>>,
}

impl Default for ClipExportManager {
  fn default() -> Self {
    Self {
      next_job: AtomicU64::new(1),
      jobs: Mutex::new(HashMap::new()),
    }
  }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickClipExportDestinationRequest {
  default_directory: Option<String>,
  default_file_name: String,
  source_kind: SourceKind,
  quality_mode: QualityMode,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickSourceMediaFileRequest {
  filename: String,
  source_kind: SourceKind,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartClipExportRequest {
  source_path: String,
  source_kind: SourceKind,
  start_s: f64,
  end_s: f64,
  quality_mode: QualityMode,
  destination_path: String,
  tuning: Option<ExportTuning>,
  manifest: ClipExportManifestSeed,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StartClipExportResponse {
  #[serde(rename = "jobId")]
  job_id: String,
}

fn build_log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
  let mut builder = tauri_plugin_log::Builder::default()
    .rotation_strategy(RotationStrategy::KeepSome(6))
    .timezone_strategy(TimezoneStrategy::UseLocal)
    .max_file_size(512_000);

  if cfg!(debug_assertions) {
    builder = builder
      .level(log::LevelFilter::Debug)
      .clear_targets()
      .target(Target::new(TargetKind::Stdout))
      .target(Target::new(TargetKind::LogDir {
        file_name: Some("runtime".into()),
      }));
  } else {
    builder = builder
      .level(log::LevelFilter::Info)
      .clear_targets()
      .target(Target::new(TargetKind::LogDir {
        file_name: Some("runtime".into()),
      }));
  }

  builder.build()
}

fn clip_duration_seconds(request: &StartClipExportRequest) -> Result<f64, String> {
  if !request.start_s.is_finite() || !request.end_s.is_finite() {
    return Err("Clip export times must be finite.".into());
  }
  if request.start_s < 0.0 || request.end_s <= request.start_s {
    return Err("Clip export requires a non-zero range.".into());
  }
  Ok(request.end_s - request.start_s)
}

fn format_ffmpeg_seconds(seconds: f64) -> String {
  format!("{seconds:.6}")
}

fn format_ffmpeg_scalar(value: f64) -> String {
  format!("{value:.6}")
}

fn validate_tuning(tuning: Option<&ExportTuning>) -> Result<(), String> {
  let Some(tuning) = tuning else {
    return Ok(());
  };

  if !tuning.volume.is_finite() || tuning.volume < 0.0 {
    return Err("Clip export volume must be a finite non-negative value.".into());
  }
  if !tuning.playback_rate.is_finite() || tuning.playback_rate <= 0.0 {
    return Err("Clip export playback rate must be a finite positive value.".into());
  }
  if !tuning.pitch_semitones.is_finite() {
    return Err("Clip export pitch must be finite.".into());
  }
  Ok(())
}

fn has_meaningful_tuning(tuning: Option<&ExportTuning>) -> bool {
  tuning.is_some_and(|tuning| {
    (tuning.volume - 1.0).abs() > 0.0001
      || (tuning.playback_rate - 1.0).abs() > 0.0001
      || tuning.pitch_semitones.abs() > 0.0001
  })
}

fn build_audio_filter_chain(tuning: &ExportTuning) -> Option<String> {
  let mut filters = Vec::new();

  if (tuning.playback_rate - 1.0).abs() > 0.0001 || tuning.pitch_semitones.abs() > 0.0001 {
    let pitch_ratio = 2_f64.powf(tuning.pitch_semitones / 12.0);
    filters.push(format!(
      "rubberband=tempo={}:pitch={}:formant=preserved",
      format_ffmpeg_scalar(tuning.playback_rate),
      format_ffmpeg_scalar(pitch_ratio)
    ));
  }

  if (tuning.volume - 1.0).abs() > 0.0001 {
    filters.push(format!("volume={}", format_ffmpeg_scalar(tuning.volume)));
  }

  if filters.is_empty() {
    None
  } else {
    Some(filters.join(","))
  }
}

fn build_video_filter_chain(tuning: &ExportTuning) -> Option<String> {
  if (tuning.playback_rate - 1.0).abs() <= 0.0001 {
    return None;
  }
  Some(format!(
    "setpts=PTS/{}",
    format_ffmpeg_scalar(tuning.playback_rate)
  ))
}

fn parse_timecode_to_seconds(value: &str) -> Option<f64> {
  let mut parts = value.trim().split(':');
  let hours = parts.next()?.parse::<f64>().ok()?;
  let minutes = parts.next()?.parse::<f64>().ok()?;
  let seconds = parts.next()?.parse::<f64>().ok()?;
  Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn parse_ffmpeg_progress_seconds(line: &str) -> Option<f64> {
  if let Some(value) = line.strip_prefix("out_time=") {
    return parse_timecode_to_seconds(value);
  }
  if let Some(value) = line.strip_prefix("out_time_us=") {
    return value
      .trim()
      .parse::<f64>()
      .ok()
      .map(|microseconds| microseconds / 1_000_000.0);
  }
  if let Some(value) = line.strip_prefix("out_time_ms=") {
    return value
      .trim()
      .parse::<f64>()
      .ok()
      .map(|microseconds| microseconds / 1_000_000.0);
  }
  None
}

fn build_ffmpeg_args(request: &StartClipExportRequest) -> Result<Vec<OsString>, String> {
  let duration = clip_duration_seconds(request)?;
  validate_tuning(request.tuning.as_ref())?;
  if matches!(
    (request.source_kind, request.quality_mode),
    (SourceKind::Audio, QualityMode::CopyFast)
  ) && request.tuning.is_some()
  {
    return Err("FAST COPY is unavailable when Include current tuning is enabled. Use EXACT MASTER for tuned audio exports.".into());
  }

  let audio_filter = request.tuning.as_ref().and_then(build_audio_filter_chain);
  let video_filter = request.tuning.as_ref().and_then(build_video_filter_chain);
  let mut args = vec![
    OsString::from("-hide_banner"),
    OsString::from("-nostdin"),
    OsString::from("-progress"),
    OsString::from("pipe:2"),
    OsString::from("-nostats"),
    OsString::from("-y"),
  ];

  match (request.source_kind, request.quality_mode) {
    (SourceKind::Audio, QualityMode::CopyFast) => {
      args.extend([
        OsString::from("-ss"),
        OsString::from(format_ffmpeg_seconds(request.start_s)),
        OsString::from("-t"),
        OsString::from(format_ffmpeg_seconds(duration)),
        OsString::from("-i"),
        OsString::from(&request.source_path),
        OsString::from("-map"),
        OsString::from("0"),
        OsString::from("-c"),
        OsString::from("copy"),
        OsString::from(&request.destination_path),
      ]);
    }
    (SourceKind::Video, QualityMode::CopyFast) => {
      args.extend([
        OsString::from("-i"),
        OsString::from(&request.source_path),
        OsString::from("-ss"),
        OsString::from(format_ffmpeg_seconds(request.start_s)),
        OsString::from("-t"),
        OsString::from(format_ffmpeg_seconds(duration)),
        OsString::from("-map"),
        OsString::from("0:v:0"),
        OsString::from("-map"),
        OsString::from("0:a?"),
      ]);
      if let Some(filter) = video_filter.as_ref() {
        args.extend([OsString::from("-vf"), OsString::from(filter)]);
      }
      if let Some(filter) = audio_filter.as_ref() {
        args.extend([OsString::from("-af"), OsString::from(filter)]);
      }
      args.extend([
        OsString::from("-c:v"),
        OsString::from("libx264"),
        OsString::from("-preset"),
        OsString::from("veryfast"),
        OsString::from("-crf"),
        OsString::from("22"),
        OsString::from("-pix_fmt"),
        OsString::from("yuv420p"),
        OsString::from("-c:a"),
        OsString::from("aac"),
        OsString::from("-b:a"),
        OsString::from("192k"),
        OsString::from("-movflags"),
        OsString::from("+faststart"),
        OsString::from(&request.destination_path),
      ]);
    }
    (SourceKind::Audio, QualityMode::ExactMaster) => {
      args.extend([
        OsString::from("-i"),
        OsString::from(&request.source_path),
        OsString::from("-ss"),
        OsString::from(format_ffmpeg_seconds(request.start_s)),
        OsString::from("-t"),
        OsString::from(format_ffmpeg_seconds(duration)),
        OsString::from("-vn"),
        OsString::from("-map"),
        OsString::from("0:a:0?"),
      ]);
      if let Some(filter) = audio_filter.as_ref() {
        args.extend([OsString::from("-af"), OsString::from(filter)]);
      }
      args.extend([
        OsString::from("-c:a"),
        OsString::from("pcm_s24le"),
        OsString::from(&request.destination_path),
      ]);
    }
    (SourceKind::Video, QualityMode::ExactMaster) => {
      args.extend([
        OsString::from("-i"),
        OsString::from(&request.source_path),
        OsString::from("-ss"),
        OsString::from(format_ffmpeg_seconds(request.start_s)),
        OsString::from("-t"),
        OsString::from(format_ffmpeg_seconds(duration)),
        OsString::from("-map"),
        OsString::from("0:v:0"),
        OsString::from("-map"),
        OsString::from("0:a?"),
      ]);
      if let Some(filter) = video_filter.as_ref() {
        args.extend([OsString::from("-vf"), OsString::from(filter)]);
      }
      if let Some(filter) = audio_filter.as_ref() {
        args.extend([OsString::from("-af"), OsString::from(filter)]);
      }
      args.extend([
        OsString::from("-c:v"),
        OsString::from("libx264"),
        OsString::from("-preset"),
        OsString::from("slow"),
        OsString::from("-crf"),
        OsString::from("18"),
        OsString::from("-pix_fmt"),
        OsString::from("yuv420p"),
        OsString::from("-c:a"),
        OsString::from("aac"),
        OsString::from("-b:a"),
        OsString::from("320k"),
        OsString::from("-movflags"),
        OsString::from("+faststart"),
        OsString::from(&request.destination_path),
      ]);
    }
  }

  if request.tuning.is_some() && !has_meaningful_tuning(request.tuning.as_ref()) {
    log::info!("clip export tuning enabled but no-op values were supplied");
  }

  Ok(args)
}

const CLIP_EXPORT_MANIFEST_SCHEMA: &str = "bode-bench.clip-export-manifest";

fn current_time_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as u64)
    .unwrap_or(0)
}

fn clip_export_manifest_path(output_path: &str) -> PathBuf {
  PathBuf::from(format!("{output_path}.manifest.json"))
}

fn ffmpeg_args_as_strings(args: &[OsString]) -> Vec<String> {
  args
    .iter()
    .map(|value| value.to_string_lossy().to_string())
    .collect()
}

fn build_clip_export_manifest(
  desktop_job_id: &str,
  request: &StartClipExportRequest,
  tool_report: &ExportToolReport,
  ffmpeg_args: &[OsString],
  completed_at_ms: u64,
) -> Result<ClipExportManifest, String> {
  let duration_s = clip_duration_seconds(request)?;
  let seed = &request.manifest;
  let mut processor = seed.processor.clone();
  processor.kind = "ffmpeg".into();
  processor.name = "ffmpeg".into();
  processor.version = Some(tool_report.ffmpeg_version.clone());

  Ok(ClipExportManifest {
    schema: CLIP_EXPORT_MANIFEST_SCHEMA,
    version: 1,
    job_id: seed.job_id.clone(),
    desktop_job_id: desktop_job_id.to_string(),
    label: seed.label.clone(),
    source_asset_id: seed.source_asset_id.clone(),
    source_path: request.source_path.clone(),
    source_kind: request.source_kind,
    range: ClipExportManifestRange {
      label: seed.range_label.clone(),
      note: seed.range_note.clone(),
      start_s: request.start_s,
      end_s: request.end_s,
      duration_s,
    },
    quality_mode: request.quality_mode,
    tuning: request.tuning.clone(),
    preset: seed.preset.clone(),
    processor,
    tool_report: tool_report.clone(),
    ffmpeg_args: ffmpeg_args_as_strings(ffmpeg_args),
    completed_at_ms,
    artifacts: vec![ClipExportManifestArtifact {
      id: format!("{}-media", seed.job_id),
      role: "media".into(),
      path: request.destination_path.clone(),
      sha256: None,
      created_at_ms: completed_at_ms,
    }],
  })
}

fn write_clip_export_manifest(
  desktop_job_id: &str,
  request: &StartClipExportRequest,
  tool_report: &ExportToolReport,
  ffmpeg_args: &[OsString],
) -> Result<String, String> {
  let manifest_path = clip_export_manifest_path(&request.destination_path);
  let manifest = build_clip_export_manifest(
    desktop_job_id,
    request,
    tool_report,
    ffmpeg_args,
    current_time_ms(),
  )?;
  let contents = serde_json::to_string_pretty(&manifest)
    .map_err(|error| format!("Failed to serialize export manifest: {error}"))?;
  std::fs::write(&manifest_path, format!("{contents}\n"))
    .map_err(|error| format!("Failed to write export manifest: {error}"))?;
  Ok(manifest_path.display().to_string())
}

fn resolve_bundled_tool_path(app: &tauri::AppHandle, binary: &str) -> Option<PathBuf> {
  let resource_dir = app.path().resource_dir().ok()?;
  let path = resource_dir.join("resources").join("ffmpeg").join(binary);
  path.is_file().then_some(path)
}

fn resolve_tool_path(app: &tauri::AppHandle, binary: &str) -> Option<PathBuf> {
  if let Some(path) = resolve_bundled_tool_path(app, binary) {
    return Some(path);
  }

  let finder = if cfg!(target_os = "windows") {
    "where"
  } else {
    "which"
  };
  let output = Command::new(finder).arg(binary).output().ok()?;
  if !output.status.success() {
    return None;
  }

  String::from_utf8_lossy(&output.stdout)
    .lines()
    .map(str::trim)
    .find(|line| !line.is_empty())
    .map(PathBuf::from)
}

fn run_tool_capture(path: &Path, args: &[&str]) -> Result<String, String> {
  let output = Command::new(path)
    .args(args)
    .output()
    .map_err(|error| format!("Failed to run {}: {error}", path.display()))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      format!("{} exited without diagnostic output.", path.display())
    } else {
      stderr
    });
  }

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  if stdout.trim().is_empty() {
    Ok(String::from_utf8_lossy(&output.stderr).to_string())
  } else {
    Ok(stdout)
  }
}

fn first_non_empty_line(value: &str) -> String {
  value
    .lines()
    .map(str::trim)
    .find(|line| !line.is_empty())
    .unwrap_or("ffmpeg version unknown")
    .to_string()
}

fn ffmpeg_listing_contains(output: &str, token: &str) -> bool {
  output
    .lines()
    .any(|line| line.split_whitespace().any(|part| part == token))
}

fn missing_required_export_features(features: &ExportToolFeatures) -> Vec<&'static str> {
  let mut missing = Vec::new();
  if !features.rubberband_filter {
    missing.push("rubberband filter");
  }
  if !features.volume_filter {
    missing.push("volume filter");
  }
  if !features.setpts_filter {
    missing.push("setpts filter");
  }
  if !features.libx264_encoder {
    missing.push("libx264 encoder");
  }
  if !features.aac_encoder {
    missing.push("aac encoder");
  }
  if !features.pcm_s24le_encoder {
    missing.push("pcm_s24le encoder");
  }
  missing
}

fn build_export_tool_report(app: &tauri::AppHandle) -> Result<ExportToolReport, String> {
  let ffmpeg_path = resolve_tool_path(app, "ffmpeg.exe")
    .or_else(|| resolve_tool_path(app, "ffmpeg"))
    .ok_or_else(|| "ffmpeg was not found in the app bundle or on this system.".to_string())?;
  let ffprobe_path =
    resolve_tool_path(app, "ffprobe.exe").or_else(|| resolve_tool_path(app, "ffprobe"));
  let version = first_non_empty_line(&run_tool_capture(
    &ffmpeg_path,
    &["-hide_banner", "-version"],
  )?);
  let filters = run_tool_capture(&ffmpeg_path, &["-hide_banner", "-filters"])?;
  let encoders = run_tool_capture(&ffmpeg_path, &["-hide_banner", "-encoders"])?;
  let features = ExportToolFeatures {
    rubberband_filter: ffmpeg_listing_contains(&filters, "rubberband"),
    volume_filter: ffmpeg_listing_contains(&filters, "volume"),
    setpts_filter: ffmpeg_listing_contains(&filters, "setpts"),
    libx264_encoder: ffmpeg_listing_contains(&encoders, "libx264"),
    aac_encoder: ffmpeg_listing_contains(&encoders, "aac"),
    pcm_s24le_encoder: ffmpeg_listing_contains(&encoders, "pcm_s24le"),
  };
  let mut warnings = Vec::new();
  if ffprobe_path.is_none() {
    warnings
      .push("ffprobe was not found; future source metadata checks will be unavailable.".into());
  }

  Ok(ExportToolReport {
    ffmpeg_path: ffmpeg_path.display().to_string(),
    ffmpeg_version: version,
    ffprobe_path: ffprobe_path.map(|path| path.display().to_string()),
    features,
    warnings,
  })
}

fn build_export_tool_status(app: &tauri::AppHandle) -> ExportToolStatus {
  match build_export_tool_report(app) {
    Ok(report) => {
      let missing_features = missing_required_export_features(&report.features);
      if missing_features.is_empty() {
        ExportToolStatus::Ready { report }
      } else {
        ExportToolStatus::Missing {
          reason: format!(
            "ffmpeg is missing required export support: {}.",
            missing_features.join(", ")
          ),
          report: Some(report),
        }
      }
    }
    Err(reason) => ExportToolStatus::Missing {
      reason,
      report: None,
    },
  }
}

fn ps_single_quote(value: &str) -> String {
  value.replace('\'', "''")
}

fn build_save_dialog_filter(source_kind: SourceKind, quality_mode: QualityMode) -> &'static str {
  match (source_kind, quality_mode) {
    (SourceKind::Audio, QualityMode::CopyFast) => {
      "Audio source containers|*.wav;*.flac;*.aiff;*.aif;*.mp3;*.m4a;*.aac;*.ogg;*.opus|All files (*.*)|*.*"
    }
    (SourceKind::Audio, QualityMode::ExactMaster) => "WAV master (*.wav)|*.wav|All files (*.*)|*.*",
    (SourceKind::Video, QualityMode::CopyFast) => "MP4 review (*.mp4)|*.mp4|All files (*.*)|*.*",
    (SourceKind::Video, QualityMode::ExactMaster) => "MP4 master (*.mp4)|*.mp4|All files (*.*)|*.*",
  }
}

fn build_save_dialog_title(source_kind: SourceKind, quality_mode: QualityMode) -> &'static str {
  match (source_kind, quality_mode) {
    (SourceKind::Video, QualityMode::CopyFast) => "Save Fast Review",
    (_, QualityMode::CopyFast) => "Save Fast Copy",
    (_, QualityMode::ExactMaster) => "Save Exact Master",
  }
}

fn build_source_file_filter(source_kind: SourceKind) -> &'static str {
  match source_kind {
    SourceKind::Audio => {
      "Audio source containers|*.wav;*.flac;*.aiff;*.aif;*.mp3;*.m4a;*.aac;*.ogg;*.opus|All files (*.*)|*.*"
    }
    SourceKind::Video => {
      "Video source containers|*.mp4;*.mov;*.mkv;*.webm;*.m4v;*.avi;*.mpg;*.mpeg|All files (*.*)|*.*"
    }
  }
}

fn run_powershell_capture(script: &str) -> Result<String, String> {
  let output = Command::new("powershell")
    .args([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ])
    .output()
    .map_err(|error| format!("Failed to run PowerShell: {error}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
      return Err("PowerShell Save As dialog failed.".into());
    }
    return Err(stderr);
  }

  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn open_save_as_dialog(
  request: &PickClipExportDestinationRequest,
) -> Result<PickClipExportDestinationResult, String> {
  let mut script = String::from(
    "Add-Type -AssemblyName System.Windows.Forms; \
     $dialog = New-Object System.Windows.Forms.SaveFileDialog; \
     $dialog.Title = '",
  );
  script.push_str(build_save_dialog_title(
    request.source_kind,
    request.quality_mode,
  ));
  script.push_str(
    "'; \
     $dialog.OverwritePrompt = $true; \
     $dialog.RestoreDirectory = $true; \
     $dialog.CheckPathExists = $true; \
     $dialog.AddExtension = $true; \
     $dialog.Filter = '",
  );
  script.push_str(&ps_single_quote(build_save_dialog_filter(
    request.source_kind,
    request.quality_mode,
  )));
  script.push_str("'; ");
  script.push_str("$dialog.FileName = '");
  script.push_str(&ps_single_quote(&request.default_file_name));
  script.push_str("'; ");
  if let Some(directory) = request.default_directory.as_deref() {
    if !directory.trim().is_empty() {
      script.push_str("$dialog.InitialDirectory = '");
      script.push_str(&ps_single_quote(directory));
      script.push_str("'; ");
    }
  }
  script.push_str("if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }");

  let path = run_powershell_capture(&script)?;
  if path.is_empty() {
    return Ok(PickClipExportDestinationResult::Canceled);
  }
  Ok(PickClipExportDestinationResult::Selected { path })
}

#[cfg(not(target_os = "windows"))]
fn open_save_as_dialog(
  _request: &PickClipExportDestinationRequest,
) -> Result<PickClipExportDestinationResult, String> {
  Err("Save As dialog is only implemented for the Windows desktop build right now.".into())
}

#[cfg(target_os = "windows")]
fn open_source_media_file(
  request: &PickSourceMediaFileRequest,
) -> Result<PickClipExportDestinationResult, String> {
  let mut script = String::from(
    "Add-Type -AssemblyName System.Windows.Forms; \
     $dialog = New-Object System.Windows.Forms.OpenFileDialog; \
     $dialog.Title = 'Locate Original Source Media'; \
     $dialog.CheckFileExists = $true; \
     $dialog.Multiselect = $false; \
     $dialog.Filter = '",
  );
  script.push_str(&ps_single_quote(build_source_file_filter(
    request.source_kind,
  )));
  script.push_str("'; ");
  script.push_str("$dialog.FileName = '");
  script.push_str(&ps_single_quote(&request.filename));
  script.push_str("'; ");
  script.push_str("if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }");

  let path = run_powershell_capture(&script)?;
  if path.is_empty() {
    return Ok(PickClipExportDestinationResult::Canceled);
  }
  Ok(PickClipExportDestinationResult::Selected { path })
}

#[cfg(not(target_os = "windows"))]
fn open_source_media_file(
  _request: &PickSourceMediaFileRequest,
) -> Result<PickClipExportDestinationResult, String> {
  Err("Source file selection is only implemented for the Windows desktop build right now.".into())
}

fn set_job_status(job: &JobHandle, status: ClipExportStatus) {
  let mut guard = job.lock().expect("export job lock poisoned");
  guard.status = status;
}

fn get_job(state: &ClipExportManager, job_id: &str) -> Result<JobHandle, String> {
  let jobs = state
    .jobs
    .lock()
    .map_err(|_| "Export queue is unavailable.".to_string())?;
  jobs
    .get(job_id)
    .cloned()
    .ok_or_else(|| "Clip export job was not found.".into())
}

fn has_active_export(state: &ClipExportManager) -> Result<bool, String> {
  let jobs = state
    .jobs
    .lock()
    .map_err(|_| "Export queue is unavailable.".to_string())?;
  for job in jobs.values() {
    let guard = job
      .lock()
      .map_err(|_| "Export job state is unavailable.".to_string())?;
    if guard.status.is_active() {
      return Ok(true);
    }
  }
  Ok(false)
}

fn insert_job(state: &ClipExportManager, job_id: String, job: JobHandle) -> Result<(), String> {
  let mut jobs = state
    .jobs
    .lock()
    .map_err(|_| "Export queue is unavailable.".to_string())?;
  jobs.insert(job_id, job);
  Ok(())
}

fn run_clip_export(
  job: JobHandle,
  desktop_job_id: String,
  ffmpeg_path: PathBuf,
  tool_report: ExportToolReport,
  request: StartClipExportRequest,
) {
  let args = match build_ffmpeg_args(&request) {
    Ok(args) => args,
    Err(error) => {
      set_job_status(&job, ClipExportStatus::Failed { error_text: error });
      return;
    }
  };

  if let Some(parent) = Path::new(&request.destination_path).parent() {
    if let Err(error) = std::fs::create_dir_all(parent) {
      set_job_status(
        &job,
        ClipExportStatus::Failed {
          error_text: error.to_string(),
        },
      );
      return;
    }
  }

  let mut child = match Command::new(ffmpeg_path)
    .args(&args)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .spawn()
  {
    Ok(child) => child,
    Err(error) => {
      set_job_status(
        &job,
        ClipExportStatus::Failed {
          error_text: error.to_string(),
        },
      );
      return;
    }
  };

  let stderr = child.stderr.take().expect("ffmpeg stderr must exist");
  let (progress_tx, progress_rx) = std::sync::mpsc::channel::<String>();
  thread::spawn(move || {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
      if let Ok(line) = line {
        if progress_tx.send(line).is_err() {
          return;
        }
      }
    }
  });

  let clip_duration = clip_duration_seconds(&request).expect("clip duration was already validated");
  let cancel_flag = {
    let guard = job.lock().expect("export job lock poisoned");
    guard.cancel_flag.clone()
  };
  let mut last_error = String::from("ffmpeg exited without a detailed error.");
  let deadline = Instant::now() + Duration::from_secs(2 * 60 * 60);
  set_job_status(
    &job,
    ClipExportStatus::Running {
      progress_percent: 0.0,
      message: "Starting ffmpeg...".into(),
    },
  );

  loop {
    while let Ok(line) = progress_rx.try_recv() {
      if let Some(out_seconds) = parse_ffmpeg_progress_seconds(&line) {
        let progress_percent = ((out_seconds / clip_duration) * 100.0).clamp(0.0, 99.0);
        set_job_status(
          &job,
          ClipExportStatus::Running {
            progress_percent,
            message: format!("Exporting {:.0}%", progress_percent),
          },
        );
        continue;
      }

      let trimmed = line.trim();
      if trimmed.is_empty()
        || trimmed.starts_with("bitrate=")
        || trimmed.starts_with("frame=")
        || trimmed.starts_with("progress=")
      {
        continue;
      }
      last_error = trimmed.to_string();
    }

    if cancel_flag.load(Ordering::SeqCst) {
      let _ = child.kill();
      let _ = child.wait();
      set_job_status(&job, ClipExportStatus::Canceled);
      return;
    }

    match child.try_wait() {
      Ok(Some(status)) if status.success() => {
        let (manifest_path, manifest_error) =
          match write_clip_export_manifest(&desktop_job_id, &request, &tool_report, &args) {
            Ok(path) => (Some(path), None),
            Err(error) => {
              log::warn!("clip export manifest was not written: {error}");
              (None, Some(error))
            }
          };
        set_job_status(
          &job,
          ClipExportStatus::Completed {
            output_path: request.destination_path.clone(),
            manifest_path,
            manifest_error,
          },
        );
        return;
      }
      Ok(Some(_)) => {
        set_job_status(
          &job,
          ClipExportStatus::Failed {
            error_text: last_error,
          },
        );
        return;
      }
      Ok(None) => {
        if Instant::now() >= deadline {
          let _ = child.kill();
          let _ = child.wait();
          set_job_status(
            &job,
            ClipExportStatus::Failed {
              error_text: "Export timed out after 2 hours.".into(),
            },
          );
          return;
        }
        thread::sleep(Duration::from_millis(120));
      }
      Err(error) => {
        set_job_status(
          &job,
          ClipExportStatus::Failed {
            error_text: error.to_string(),
          },
        );
        return;
      }
    }
  }
}

#[tauri::command]
fn probe_export_tools(app: tauri::AppHandle) -> ExportToolStatus {
  let status = build_export_tool_status(&app);
  match &status {
    ExportToolStatus::Ready { report } => {
      log::info!(
        "ffmpeg ready: {} ({}) ffprobe={}",
        report.ffmpeg_path,
        report.ffmpeg_version,
        report.ffprobe_path.as_deref().unwrap_or("missing")
      );
    }
    ExportToolStatus::Missing { reason, .. } => {
      log::warn!("export tools unavailable: {reason}");
    }
  }
  status
}

#[tauri::command]
fn pick_clip_export_destination(
  request: PickClipExportDestinationRequest,
) -> Result<PickClipExportDestinationResult, String> {
  open_save_as_dialog(&request)
}

#[tauri::command]
fn pick_source_media_file(
  request: PickSourceMediaFileRequest,
) -> Result<PickClipExportDestinationResult, String> {
  open_source_media_file(&request)
}

#[tauri::command]
fn source_media_path_exists(path: String) -> bool {
  Path::new(&path).is_file()
}

#[tauri::command]
fn start_clip_export(
  app: tauri::AppHandle,
  state: State<'_, ClipExportManager>,
  request: StartClipExportRequest,
) -> Result<StartClipExportResponse, String> {
  if has_active_export(&state)? {
    log::warn!("export rejected because another job is still active");
    return Err("Only one clip export can run at a time in this simplified workflow.".into());
  }

  let tool_report = build_export_tool_report(&app)?;
  let missing_features = missing_required_export_features(&tool_report.features);
  if !missing_features.is_empty() {
    return Err(format!(
      "ffmpeg is missing required export support: {}.",
      missing_features.join(", ")
    ));
  }
  let ffmpeg_path = PathBuf::from(&tool_report.ffmpeg_path);
  clip_duration_seconds(&request)?;
  if !Path::new(&request.source_path).is_file() {
    let message = format!("Source file was not found: {}", request.source_path);
    log::warn!("{message}");
    return Err(message);
  }
  log::info!(
    "export requested: source={} destination={} ffmpeg={}",
    request.source_path,
    request.destination_path,
    tool_report.ffmpeg_path
  );

  let job_id = format!(
    "clip-export-{}",
    state.next_job.fetch_add(1, Ordering::SeqCst)
  );
  let job = Arc::new(Mutex::new(ClipExportJob {
    status: ClipExportStatus::Queued {
      progress_percent: 0.0,
      message: "Queued export...".into(),
    },
    cancel_flag: Arc::new(AtomicBool::new(false)),
  }));
  insert_job(&state, job_id.clone(), job.clone())?;

  let desktop_job_id = job_id.clone();
  thread::spawn(move || {
    run_clip_export(job, desktop_job_id, ffmpeg_path, tool_report, request);
  });

  Ok(StartClipExportResponse { job_id })
}

#[tauri::command]
fn get_clip_export_status(
  state: State<'_, ClipExportManager>,
  job_id: String,
) -> Result<ClipExportStatus, String> {
  let job = get_job(&state, &job_id)?;
  let guard = job
    .lock()
    .map_err(|_| "Export job state is unavailable.".to_string())?;
  Ok(guard.status.clone())
}

#[tauri::command]
fn cancel_clip_export(state: State<'_, ClipExportManager>, job_id: String) -> Result<(), String> {
  let job = get_job(&state, &job_id)?;
  let guard = job
    .lock()
    .map_err(|_| "Export job state is unavailable.".to_string())?;
  guard.cancel_flag.store(true, Ordering::SeqCst);
  Ok(())
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    Command::new("explorer")
      .arg(format!("/select,{path}"))
      .spawn()
      .map_err(|error| format!("Failed to reveal export: {error}"))?;
    return Ok(());
  }

  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg("-R")
      .arg(&path)
      .spawn()
      .map_err(|error| format!("Failed to reveal export: {error}"))?;
    return Ok(());
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let parent = Path::new(&path)
      .parent()
      .ok_or_else(|| "Export folder could not be resolved.".to_string())?;
    Command::new("xdg-open")
      .arg(parent)
      .spawn()
      .map_err(|error| format!("Failed to reveal export: {error}"))?;
    return Ok(());
  }

  #[allow(unreachable_code)]
  Err("Reveal output is not implemented for this platform.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(build_log_plugin())
    .manage(ClipExportManager::default())
    .invoke_handler(tauri::generate_handler![
      probe_export_tools,
      pick_clip_export_destination,
      pick_source_media_file,
      source_media_path_exists,
      start_clip_export,
      get_clip_export_status,
      cancel_clip_export,
      reveal_in_folder
    ])
    .setup(|app| {
      let package = app.package_info();
      log::info!(
        "starting {} {} ({})",
        package.name,
        package.version,
        app.config().identifier
      );

      match app.path().app_log_dir() {
        Ok(log_dir) => log::info!("desktop logs: {}", log_dir.display()),
        Err(error) => log::warn!("failed to resolve desktop log directory: {error}"),
      }

      if let Some(window) = app.get_webview_window("main") {
        let size = window.inner_size()?;
        log::info!("main window ready: {}x{}", size.width, size.height);
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::{
    build_clip_export_manifest, build_ffmpeg_args, build_save_dialog_filter,
    build_save_dialog_title, clip_export_manifest_path, parse_ffmpeg_progress_seconds,
    ClipExportManifestSeed, ClipExportStatus, ExportPresetManifest, ExportToolFeatures,
    ExportToolReport, ExportToolStatus, ExportTuning, ProcessorManifest, QualityMode, SourceKind,
    StartClipExportRequest, StartClipExportResponse,
  };

  fn manifest_seed() -> ClipExportManifestSeed {
    ClipExportManifestSeed {
      job_id: "job-1".into(),
      source_asset_id: "source-flac:120.000".into(),
      label: "R1 EXACT MASTER".into(),
      range_label: "R1".into(),
      range_note: Some("inspect transient".into()),
      preset: ExportPresetManifest {
        id: "audio-exact-master".into(),
        label: "PCM 24 MASTER".into(),
        container: "wav".into(),
        audio_codec: Some("pcm_s24le".into()),
        video_codec: None,
        quality_mode: QualityMode::ExactMaster,
      },
      processor: ProcessorManifest {
        kind: "ffmpeg".into(),
        name: "ffmpeg".into(),
        version: None,
      },
    }
  }

  fn tool_report() -> ExportToolReport {
    ExportToolReport {
      ffmpeg_path: "C:/app/ffmpeg.exe".into(),
      ffmpeg_version: "ffmpeg version 8.1".into(),
      ffprobe_path: Some("C:/app/ffprobe.exe".into()),
      features: ExportToolFeatures {
        rubberband_filter: true,
        volume_filter: true,
        setpts_filter: true,
        libx264_encoder: true,
        aac_encoder: true,
        pcm_s24le_encoder: true,
      },
      warnings: vec![],
    }
  }

  fn args_as_strings(request: &StartClipExportRequest) -> Vec<String> {
    build_ffmpeg_args(request)
      .expect("ffmpeg args")
      .into_iter()
      .map(|value| value.to_string_lossy().to_string())
      .collect()
  }

  #[test]
  fn builds_fast_copy_args_for_audio_and_video() {
    let audio = args_as_strings(&StartClipExportRequest {
      source_path: "C:/audio/source.flac".into(),
      source_kind: SourceKind::Audio,
      start_s: 12.0,
      end_s: 18.5,
      quality_mode: QualityMode::CopyFast,
      destination_path: "C:/exports/clip.flac".into(),
      tuning: None,
      manifest: manifest_seed(),
    });
    let video = args_as_strings(&StartClipExportRequest {
      source_path: "C:/video/source.mov".into(),
      source_kind: SourceKind::Video,
      start_s: 3.0,
      end_s: 9.25,
      quality_mode: QualityMode::CopyFast,
      destination_path: "C:/exports/clip.mp4".into(),
      tuning: None,
      manifest: manifest_seed(),
    });

    assert!(audio.windows(2).any(|pair| pair == ["-c", "copy"]));
    assert!(audio.iter().any(|arg| arg == "C:/exports/clip.flac"));
    assert!(video.windows(2).any(|pair| pair == ["-c:v", "libx264"]));
    assert!(video.windows(2).any(|pair| pair == ["-preset", "veryfast"]));
    assert!(video.windows(2).any(|pair| pair == ["-crf", "22"]));
    assert!(video.windows(2).any(|pair| pair == ["-c:a", "aac"]));
    assert!(video.windows(2).any(|pair| pair == ["-b:a", "192k"]));
    assert!(video
      .windows(2)
      .any(|pair| pair == ["-movflags", "+faststart"]));
    assert!(!video.windows(2).any(|pair| pair == ["-c", "copy"]));
    assert!(video.iter().any(|arg| arg == "C:/exports/clip.mp4"));

    let input_index = video
      .iter()
      .position(|arg| arg == "-i")
      .expect("video fast args include input");
    let seek_index = video
      .iter()
      .position(|arg| arg == "-ss")
      .expect("video fast args include seek");
    assert!(
      input_index < seek_index,
      "video fast export should decode before seeking for exact boundaries"
    );
  }

  #[test]
  fn builds_exact_master_args_for_audio_and_video() {
    let audio = args_as_strings(&StartClipExportRequest {
      source_path: "C:/audio/source.flac".into(),
      source_kind: SourceKind::Audio,
      start_s: 12.0,
      end_s: 18.5,
      quality_mode: QualityMode::ExactMaster,
      destination_path: "C:/exports/clip.wav".into(),
      tuning: None,
      manifest: manifest_seed(),
    });
    let video = args_as_strings(&StartClipExportRequest {
      source_path: "C:/video/source.mov".into(),
      source_kind: SourceKind::Video,
      start_s: 3.0,
      end_s: 9.25,
      quality_mode: QualityMode::ExactMaster,
      destination_path: "C:/exports/clip.mp4".into(),
      tuning: None,
      manifest: manifest_seed(),
    });

    assert!(audio.windows(2).any(|pair| pair == ["-c:a", "pcm_s24le"]));
    assert!(video.windows(2).any(|pair| pair == ["-c:v", "libx264"]));
    assert!(video.windows(2).any(|pair| pair == ["-b:a", "320k"]));
  }

  #[test]
  fn builds_tuned_video_exports_with_audio_and_video_filters() {
    let request = StartClipExportRequest {
      source_path: "C:/video/source.mov".into(),
      source_kind: SourceKind::Video,
      start_s: 3.0,
      end_s: 9.25,
      quality_mode: QualityMode::CopyFast,
      destination_path: "C:/exports/clip.mp4".into(),
      tuning: Some(ExportTuning {
        volume: 0.66,
        playback_rate: 1.15,
        pitch_semitones: 2.0,
      }),
      manifest: manifest_seed(),
    };

    let fast = args_as_strings(&request);
    assert!(fast
      .windows(2)
      .any(|pair| pair == ["-vf", "setpts=PTS/1.150000"]));
    assert!(fast
      .iter()
      .any(|arg| arg.contains("rubberband=tempo=1.150000:pitch=1.122462:formant=preserved")));
    assert!(fast.iter().any(|arg| arg.contains("volume=0.660000")));

    let master = args_as_strings(&StartClipExportRequest {
      quality_mode: QualityMode::ExactMaster,
      ..request
    });
    assert!(master
      .windows(2)
      .any(|pair| pair == ["-vf", "setpts=PTS/1.150000"]));
    assert!(master
      .iter()
      .any(|arg| arg.contains("rubberband=tempo=1.150000:pitch=1.122462:formant=preserved")));
    assert!(master.iter().any(|arg| arg.contains("volume=0.660000")));
    assert!(master.windows(2).any(|pair| pair == ["-preset", "slow"]));
  }

  #[test]
  fn builds_tuned_audio_master_exports_and_rejects_fast_copy() {
    let request = StartClipExportRequest {
      source_path: "C:/audio/source.flac".into(),
      source_kind: SourceKind::Audio,
      start_s: 12.0,
      end_s: 18.5,
      quality_mode: QualityMode::ExactMaster,
      destination_path: "C:/exports/clip.wav".into(),
      tuning: Some(ExportTuning {
        volume: 0.75,
        playback_rate: 0.9,
        pitch_semitones: -1.0,
      }),
      manifest: manifest_seed(),
    };

    let master = args_as_strings(&request);
    assert!(master
      .iter()
      .any(|arg| arg.contains("rubberband=tempo=0.900000:pitch=0.943874:formant=preserved")));
    assert!(master.iter().any(|arg| arg.contains("volume=0.750000")));
    assert!(master.windows(2).any(|pair| pair == ["-c:a", "pcm_s24le"]));

    let fast_error = build_ffmpeg_args(&StartClipExportRequest {
      quality_mode: QualityMode::CopyFast,
      destination_path: "C:/exports/clip.flac".into(),
      ..request
    })
    .expect_err("tuned audio fast copy should fail");
    assert!(fast_error.contains("FAST COPY is unavailable"));
  }

  #[test]
  fn parses_ffmpeg_progress_lines() {
    assert_eq!(
      parse_ffmpeg_progress_seconds("out_time=00:00:12.340000"),
      Some(12.34)
    );
    assert_eq!(
      parse_ffmpeg_progress_seconds("out_time_us=8000000"),
      Some(8.0)
    );
    assert_eq!(parse_ffmpeg_progress_seconds("progress=continue"), None);
  }

  #[test]
  fn builds_save_dialog_filters_for_fast_and_master_modes() {
    assert!(
      build_save_dialog_filter(SourceKind::Audio, QualityMode::CopyFast)
        .contains("Audio source containers")
    );
    assert!(
      build_save_dialog_filter(SourceKind::Audio, QualityMode::ExactMaster).contains("WAV master")
    );
    assert!(
      build_save_dialog_filter(SourceKind::Video, QualityMode::CopyFast).contains("MP4 review")
    );
    assert!(
      build_save_dialog_filter(SourceKind::Video, QualityMode::ExactMaster).contains("MP4 master")
    );
  }

  #[test]
  fn builds_clear_save_dialog_titles() {
    assert_eq!(
      build_save_dialog_title(SourceKind::Audio, QualityMode::CopyFast),
      "Save Fast Copy"
    );
    assert_eq!(
      build_save_dialog_title(SourceKind::Video, QualityMode::CopyFast),
      "Save Fast Review"
    );
    assert_eq!(
      build_save_dialog_title(SourceKind::Video, QualityMode::ExactMaster),
      "Save Exact Master"
    );
  }

  #[test]
  fn serializes_export_responses_in_camel_case() {
    let running = serde_json::to_value(ClipExportStatus::Running {
      progress_percent: 48.0,
      message: "Exporting 48%".into(),
    })
    .expect("running status serializes");
    assert_eq!(running["status"], "running");
    assert_eq!(running["progressPercent"], 48.0);
    assert!(running.get("progress_percent").is_none());

    let completed = serde_json::to_value(ClipExportStatus::Completed {
      output_path: "C:/exports/clip.mp4".into(),
      manifest_path: Some("C:/exports/clip.mp4.manifest.json".into()),
      manifest_error: None,
    })
    .expect("completed status serializes");
    assert_eq!(completed["status"], "completed");
    assert_eq!(completed["outputPath"], "C:/exports/clip.mp4");
    assert_eq!(
      completed["manifestPath"],
      "C:/exports/clip.mp4.manifest.json"
    );
    assert!(completed.get("manifest_path").is_none());
    assert!(completed.get("output_path").is_none());

    let failed = serde_json::to_value(ClipExportStatus::Failed {
      error_text: "boom".into(),
    })
    .expect("failed status serializes");
    assert_eq!(failed["errorText"], "boom");
    assert!(failed.get("error_text").is_none());

    let response = serde_json::to_value(StartClipExportResponse {
      job_id: "clip-export-7".into(),
    })
    .expect("start response serializes");
    assert_eq!(response["jobId"], "clip-export-7");
    assert!(response.get("job_id").is_none());

    let tools = serde_json::to_value(ExportToolStatus::Ready {
      report: ExportToolReport {
        ffmpeg_path: "C:/app/ffmpeg.exe".into(),
        ffmpeg_version: "ffmpeg version 8.1".into(),
        ffprobe_path: Some("C:/app/ffprobe.exe".into()),
        features: ExportToolFeatures {
          rubberband_filter: true,
          volume_filter: true,
          setpts_filter: true,
          libx264_encoder: true,
          aac_encoder: true,
          pcm_s24le_encoder: true,
        },
        warnings: vec![],
      },
    })
    .expect("tool status serializes");
    assert_eq!(tools["kind"], "ready");
    assert_eq!(tools["report"]["ffmpegPath"], "C:/app/ffmpeg.exe");
    assert_eq!(tools["report"]["features"]["pcmS24leEncoder"], true);
  }

  #[test]
  fn builds_export_manifest_with_tool_report() {
    let request = StartClipExportRequest {
      source_path: "C:/audio/source.flac".into(),
      source_kind: SourceKind::Audio,
      start_s: 12.0,
      end_s: 18.5,
      quality_mode: QualityMode::ExactMaster,
      destination_path: "C:/exports/clip.wav".into(),
      tuning: None,
      manifest: manifest_seed(),
    };

    let args = build_ffmpeg_args(&request).expect("ffmpeg args");
    let manifest =
      build_clip_export_manifest("clip-export-7", &request, &tool_report(), &args, 1234)
        .expect("manifest builds");
    let value = serde_json::to_value(manifest).expect("manifest serializes");

    assert_eq!(value["schema"], "bode-bench.clip-export-manifest");
    assert_eq!(value["version"], 1);
    assert_eq!(value["jobId"], "job-1");
    assert_eq!(value["desktopJobId"], "clip-export-7");
    assert_eq!(value["sourcePath"], "C:/audio/source.flac");
    assert_eq!(value["range"]["startS"], 12.0);
    assert_eq!(value["range"]["durationS"], 6.5);
    assert_eq!(value["processor"]["version"], "ffmpeg version 8.1");
    assert_eq!(value["toolReport"]["ffmpegPath"], "C:/app/ffmpeg.exe");
    assert_eq!(value["ffmpegArgs"][0], "-hide_banner");
    assert_eq!(
      value["ffmpegArgs"]
        .as_array()
        .expect("ffmpeg args array")
        .last()
        .expect("output path arg"),
      "C:/exports/clip.wav"
    );
    assert_eq!(value["artifacts"][0]["role"], "media");
    assert_eq!(
      clip_export_manifest_path("C:/exports/clip.wav")
        .to_string_lossy()
        .as_ref(),
      "C:/exports/clip.wav.manifest.json"
    );
  }
}
