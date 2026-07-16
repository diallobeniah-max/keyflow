mod actions;
mod app_detect;
mod commands;
mod conflict;
mod engine;
mod hooks;
mod models;
mod state;
mod storage;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::save_state,
            commands::open_app,
            commands::open_path,
            commands::open_website,
            commands::run_command,
            commands::run_powershell,
            commands::run_batch,
            commands::paste_text,
            commands::type_text,
            commands::send_keys,
            commands::volume_control,
            commands::media_control,
            commands::toggle_mute,
            commands::brightness_control,
            commands::take_screenshot,
            commands::lock_screen,
            commands::open_settings,
            commands::show_notification,
            commands::copy_selected,
            commands::open_clipboard_history,
            commands::window_control,
            commands::restart_keyboard_listener,
            commands::focused_app
        ])
        .setup(|app| {
            tray::create_tray(app.handle())?;
            hooks::start_global_hooks(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running KeyFlow");
}
