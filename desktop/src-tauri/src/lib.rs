use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(build_log_plugin())
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
