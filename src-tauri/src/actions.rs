use std::process::Command;
use tauri::AppHandle;

pub fn open_app(path: &str, args: &str) -> Result<(), String> {
    if path.trim().is_empty() { return Err("Missing app path".into()); }
    let mut cmd = Command::new(path);
    for arg in args.split_whitespace() { cmd.arg(arg); }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn open_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() { return Err("Missing path".into()); }
    Command::new("explorer").arg(path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn open_url(url: &str) -> Result<(), String> {
    if url.trim().is_empty() { return Err("Missing URL".into()); }
    Command::new("cmd").args(["/C", "start", "", url]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run_command(command: &str, args: &str) -> Result<(), String> {
    if command.trim().is_empty() { return Err("Missing command".into()); }
    let mut cmd = Command::new(command);
    for arg in args.split_whitespace() { cmd.arg(arg); }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run_powershell(script: &str) -> Result<(), String> {
    Command::new("powershell").args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run_batch(path: &str) -> Result<(), String> {
    Command::new("cmd").args(["/C", path]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn paste_text(_text: &str) -> Result<(), String> {
    // TODO: put text on clipboard, then SendInput Ctrl+V.
    Ok(())
}

pub fn type_text(_text: &str) -> Result<(), String> {
    // TODO: send Unicode input through SendInput.
    Ok(())
}

pub fn send_keys(_keys: &str) -> Result<(), String> {
    // TODO: parse shortcut strings like Ctrl+C and send via SendInput.
    Ok(())
}

pub fn volume_control(_action: &str) -> Result<(), String> {
    // TODO: send VK_VOLUME_UP/DOWN/MUTE or use audio endpoint APIs.
    Ok(())
}

pub fn media_control(_action: &str) -> Result<(), String> {
    // TODO: send VK_MEDIA_PLAY_PAUSE/NEXT/PREV/STOP.
    Ok(())
}

pub fn take_screenshot() -> Result<(), String> {
    send_keys("Win+Shift+S")
}

pub fn lock_screen() -> Result<(), String> {
    Command::new("rundll32.exe").args(["user32.dll,LockWorkStation"]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn show_notification(_app: &AppHandle, _title: &str, _body: &str) -> Result<(), String> {
    // TODO: add tauri-plugin-notification or Windows toast implementation.
    Ok(())
}

pub fn window_control(_action: &str, _direction: Option<&str>) -> Result<(), String> {
    // TODO: inspect foreground window and call ShowWindow/SetWindowPos.
    Ok(())
}

// Brightness control usually needs WMI / monitor DDC-CI / WinRT display APIs.
// This stub keeps the command surface ready for the real Windows implementation.
pub fn brightness_control(action: &str) -> Result<(), String> {
    println!("brightness_control: {}", action);
    Ok(())
}
