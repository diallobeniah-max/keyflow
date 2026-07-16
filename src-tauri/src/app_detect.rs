pub fn focused_app_exe() -> Result<String, String> {
    // TODO: use GetForegroundWindow + GetWindowThreadProcessId + QueryFullProcessImageNameW.
    Ok("explorer.exe".to_string())
}
