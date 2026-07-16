use crate::{actions, app_detect, hooks, state::AppState, storage};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn load_state(state: State<AppState>) -> Result<Option<Value>, String> {
    let loaded = storage::load_state()?;
    *state.current_json.lock() = loaded.clone();
    Ok(loaded)
}

#[tauri::command]
pub fn save_state(data: Value, state: State<AppState>) -> Result<(), String> {
    storage::save_state(&data)?;
    *state.current_json.lock() = Some(data);
    Ok(())
}

#[tauri::command]
pub fn open_app(path: String, args: String) -> Result<(), String> { actions::open_app(&path, &args) }
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> { actions::open_path(&path) }
#[tauri::command]
pub fn open_website(url: String) -> Result<(), String> { actions::open_url(&url) }
#[tauri::command]
pub fn run_command(command: String, args: String) -> Result<(), String> { actions::run_command(&command, &args) }
#[tauri::command]
pub fn run_powershell(script: String) -> Result<(), String> { actions::run_powershell(&script) }
#[tauri::command]
pub fn run_batch(path: String) -> Result<(), String> { actions::run_batch(&path) }
#[tauri::command]
pub fn paste_text(text: String) -> Result<(), String> { actions::paste_text(&text) }
#[tauri::command]
pub fn type_text(text: String) -> Result<(), String> { actions::type_text(&text) }
#[tauri::command]
pub fn send_keys(keys: String) -> Result<(), String> { actions::send_keys(&keys) }
#[tauri::command]
pub fn volume_control(action: String) -> Result<(), String> { actions::volume_control(&action) }
#[tauri::command]
pub fn media_control(action: String) -> Result<(), String> { actions::media_control(&action) }
#[tauri::command]
pub fn toggle_mute() -> Result<(), String> { actions::volume_control("toggle") }
#[tauri::command]
pub fn take_screenshot() -> Result<(), String> { actions::take_screenshot() }
#[tauri::command]
pub fn lock_screen() -> Result<(), String> { actions::lock_screen() }
#[tauri::command]
pub fn open_settings(uri: String) -> Result<(), String> { actions::open_url(&uri) }
#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> { actions::show_notification(&app, &title, &body) }
#[tauri::command]
pub fn copy_selected() -> Result<(), String> { actions::send_keys("Ctrl+C") }
#[tauri::command]
pub fn open_clipboard_history() -> Result<(), String> { actions::send_keys("Win+V") }
#[tauri::command]
pub fn window_control(action: String, direction: Option<String>) -> Result<(), String> { actions::window_control(&action, direction.as_deref()) }
#[tauri::command]
pub fn restart_keyboard_listener(app: AppHandle) -> Result<(), String> { hooks::restart_global_hooks(app); Ok(()) }
#[tauri::command]
pub fn focused_app() -> Result<String, String> { app_detect::focused_app_exe() }

#[tauri::command]
pub fn brightness_control(action: String) -> Result<(), String> {
    crate::actions::brightness_control(&action)
}
