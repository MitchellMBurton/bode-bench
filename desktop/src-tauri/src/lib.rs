use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{Manager, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

type JobHandle = Arc<Mutex<ClipExportJob>>;

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum SourceKind {
  Audio,
  Video,
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
enum QualityMode {
  CopyFast,
  ExactMaster,
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum ExportToolStatus {
  Ready,
  Missing { reason: String },
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
    return value.trim().parse::<f64>().ok().map(|microseconds| microseconds / 1_000_000.0);
  }
  if let Some(value) = line.strip_prefix("out_time_ms=") {
    return value.trim().parse::<f64>().ok().map(|microseconds| microseconds / 1_000_000.0);
  }
  None
}

fn build_ffmpeg_args(request: &StartClipExportRequest) -> Result<Vec<OsString>, String> {
  let duration = clip_duration_seconds(request)?;
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

  Ok(args)
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

  let finder = if cfg!(target_os = "windows") { "where" } else { "which" };
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
  script.push_str(build_save_dialog_title(request.source_kind, request.quality_mode));
  script.push_str("'; \
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
  script.push_str(&ps_single_quote(build_source_file_filter(request.source_kind)));
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
  let jobs = state.jobs.lock().map_err(|_| "Export queue is unavailable.".to_string())?;
  jobs
    .get(job_id)
    .cloned()
    .ok_or_else(|| "Clip export job was not found.".into())
}

fn has_active_export(state: &ClipExportManager) -> Result<bool, String> {
  let jobs = state.jobs.lock().map_err(|_| "Export queue is unavailable.".to_string())?;
  for job in jobs.values() {
    let guard = job.lock().map_err(|_| "Export job state is unavailable.".to_string())?;
    if guard.status.is_active() {
      return Ok(true);
    }
  }
  Ok(false)
}

fn insert_job(state: &ClipExportManager, job_id: String, job: JobHandle) -> Result<(), String> {
  let mut jobs = state.jobs.lock().map_err(|_| "Export queue is unavailable.".to_string())?;
  jobs.insert(job_id, job);
  Ok(())
}

fn run_clip_export(job: JobHandle, ffmpeg_path: PathBuf, request: StartClipExportRequest) {
  let args = match build_ffmpeg_args(&request) {
    Ok(args) => args,
    Err(error) => {
      set_job_status(&job, ClipExportStatus::Failed { error_text: error });
      return;
    }
  };

  if let Some(parent) = Path::new(&request.destination_path).parent() {
    if let Err(error) = std::fs::create_dir_all(parent) {
      set_job_status(&job, ClipExportStatus::Failed { error_text: error.to_string() });
      return;
    }
  }

  let mut child = match Command::new(ffmpeg_path)
    .args(args)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .spawn()
  {
    Ok(child) => child,
    Err(error) => {
      set_job_status(&job, ClipExportStatus::Failed { error_text: error.to_string() });
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
        set_job_status(
          &job,
          ClipExportStatus::Completed {
            output_path: request.destination_path.clone(),
          },
        );
        return;
      }
      Ok(Some(_)) => {
        set_job_status(&job, ClipExportStatus::Failed { error_text: last_error });
        return;
      }
      Ok(None) => {
        thread::sleep(Duration::from_millis(120));
      }
      Err(error) => {
        set_job_status(&job, ClipExportStatus::Failed { error_text: error.to_string() });
        return;
      }
    }
  }
}

#[tauri::command]
fn probe_export_tools(app: tauri::AppHandle) -> ExportToolStatus {
  if let Some(path) = resolve_tool_path(&app, "ffmpeg.exe").or_else(|| resolve_tool_path(&app, "ffmpeg")) {
    log::info!("ffmpeg ready: {}", path.display());
    return ExportToolStatus::Ready;
  }
  log::warn!("ffmpeg not found in bundled resources or PATH");
  ExportToolStatus::Missing {
    reason: "ffmpeg was not found in the app bundle or on this system.".into(),
  }
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

  let ffmpeg_path = resolve_tool_path(&app, "ffmpeg.exe")
    .or_else(|| resolve_tool_path(&app, "ffmpeg"))
    .ok_or_else(|| "ffmpeg was not found in the app bundle or on this system.".to_string())?;
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
    ffmpeg_path.display()
  );

  let job_id = format!("clip-export-{}", state.next_job.fetch_add(1, Ordering::SeqCst));
  let job = Arc::new(Mutex::new(ClipExportJob {
    status: ClipExportStatus::Queued {
      progress_percent: 0.0,
      message: "Queued export...".into(),
    },
    cancel_flag: Arc::new(AtomicBool::new(false)),
  }));
  insert_job(&state, job_id.clone(), job.clone())?;

  thread::spawn(move || {
    run_clip_export(job, ffmpeg_path, request);
  });

  Ok(StartClipExportResponse { job_id })
}

#[tauri::command]
fn get_clip_export_status(
  state: State<'_, ClipExportManager>,
  job_id: String,
) -> Result<ClipExportStatus, String> {
  let job = get_job(&state, &job_id)?;
  let guard = job.lock().map_err(|_| "Export job state is unavailable.".to_string())?;
  Ok(guard.status.clone())
}

#[tauri::command]
fn cancel_clip_export(
  state: State<'_, ClipExportManager>,
  job_id: String,
) -> Result<(), String> {
  let job = get_job(&state, &job_id)?;
  let guard = job.lock().map_err(|_| "Export job state is unavailable.".to_string())?;
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
    build_ffmpeg_args, build_save_dialog_filter, build_save_dialog_title, parse_ffmpeg_progress_seconds,
    ClipExportStatus, QualityMode, SourceKind, StartClipExportRequest, StartClipExportResponse,
  };

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
    });
    let video = args_as_strings(&StartClipExportRequest {
      source_path: "C:/video/source.mov".into(),
      source_kind: SourceKind::Video,
      start_s: 3.0,
      end_s: 9.25,
      quality_mode: QualityMode::CopyFast,
      destination_path: "C:/exports/clip.mp4".into(),
    });

    assert!(audio.windows(2).any(|pair| pair == ["-c", "copy"]));
    assert!(audio.iter().any(|arg| arg == "C:/exports/clip.flac"));
    assert!(video.windows(2).any(|pair| pair == ["-c:v", "libx264"]));
    assert!(video.windows(2).any(|pair| pair == ["-preset", "veryfast"]));
    assert!(video.windows(2).any(|pair| pair == ["-crf", "22"]));
    assert!(video.windows(2).any(|pair| pair == ["-c:a", "aac"]));
    assert!(video.windows(2).any(|pair| pair == ["-b:a", "192k"]));
    assert!(video.windows(2).any(|pair| pair == ["-movflags", "+faststart"]));
    assert!(!video.windows(2).any(|pair| pair == ["-c", "copy"]));
    assert!(video.iter().any(|arg| arg == "C:/exports/clip.mp4"));

    let input_index = video.iter().position(|arg| arg == "-i").expect("video fast args include input");
    let seek_index = video.iter().position(|arg| arg == "-ss").expect("video fast args include seek");
    assert!(input_index < seek_index, "video fast export should decode before seeking for exact boundaries");
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
    });
    let video = args_as_strings(&StartClipExportRequest {
      source_path: "C:/video/source.mov".into(),
      source_kind: SourceKind::Video,
      start_s: 3.0,
      end_s: 9.25,
      quality_mode: QualityMode::ExactMaster,
      destination_path: "C:/exports/clip.mp4".into(),
    });

    assert!(audio.windows(2).any(|pair| pair == ["-c:a", "pcm_s24le"]));
    assert!(video.windows(2).any(|pair| pair == ["-c:v", "libx264"]));
    assert!(video.windows(2).any(|pair| pair == ["-b:a", "320k"]));
  }

  #[test]
  fn parses_ffmpeg_progress_lines() {
    assert_eq!(parse_ffmpeg_progress_seconds("out_time=00:00:12.340000"), Some(12.34));
    assert_eq!(parse_ffmpeg_progress_seconds("out_time_us=8000000"), Some(8.0));
    assert_eq!(parse_ffmpeg_progress_seconds("progress=continue"), None);
  }

  #[test]
  fn builds_save_dialog_filters_for_fast_and_master_modes() {
    assert!(build_save_dialog_filter(SourceKind::Audio, QualityMode::CopyFast).contains("Audio source containers"));
    assert!(build_save_dialog_filter(SourceKind::Audio, QualityMode::ExactMaster).contains("WAV master"));
    assert!(build_save_dialog_filter(SourceKind::Video, QualityMode::CopyFast).contains("MP4 review"));
    assert!(build_save_dialog_filter(SourceKind::Video, QualityMode::ExactMaster).contains("MP4 master"));
  }

  #[test]
  fn builds_clear_save_dialog_titles() {
    assert_eq!(build_save_dialog_title(SourceKind::Audio, QualityMode::CopyFast), "Save Fast Copy");
    assert_eq!(build_save_dialog_title(SourceKind::Video, QualityMode::CopyFast), "Save Fast Review");
    assert_eq!(build_save_dialog_title(SourceKind::Video, QualityMode::ExactMaster), "Save Exact Master");
  }

  #[test]
  fn serializes_export_responses_in_camel_case() {
    let running = serde_json::to_value(ClipExportStatus::Running {
      progress_percent: 48.0,
      message: "Exporting 48%".into(),
    }).expect("running status serializes");
    assert_eq!(running["status"], "running");
    assert_eq!(running["progressPercent"], 48.0);
    assert!(running.get("progress_percent").is_none());

    let completed = serde_json::to_value(ClipExportStatus::Completed {
      output_path: "C:/exports/clip.mp4".into(),
    }).expect("completed status serializes");
    assert_eq!(completed["status"], "completed");
    assert_eq!(completed["outputPath"], "C:/exports/clip.mp4");
    assert!(completed.get("output_path").is_none());

    let failed = serde_json::to_value(ClipExportStatus::Failed {
      error_text: "boom".into(),
    }).expect("failed status serializes");
    assert_eq!(failed["errorText"], "boom");
    assert!(failed.get("error_text").is_none());

    let response = serde_json::to_value(StartClipExportResponse {
      job_id: "clip-export-7".into(),
    }).expect("start response serializes");
    assert_eq!(response["jobId"], "clip-export-7");
    assert!(response.get("job_id").is_none());
  }
}
