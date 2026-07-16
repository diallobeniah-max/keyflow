use tauri::{AppHandle, Emitter};

/// Starts KeyFlow's global hook layer.
///
/// Browser mode cannot listen globally, so this file is where the real Windows app
/// will use WH_KEYBOARD_LL and WH_MOUSE_LL via SetWindowsHookExW.
///
/// Privacy rule for the final implementation:
/// - Load configured shortcuts from AppState.
/// - Ignore keys that are not configured.
/// - Do not build a buffer of typed words.
/// - Emit only shortcut candidate events to the frontend/engine.
/// - Respect pause, safe mode, blacklist, and password-field pause heuristics.
pub fn start_global_hooks(app: AppHandle) {
    let _ = app.emit("keyflow://hooks-status", "Global hooks scaffold started");
    // TODO Windows implementation outline:
    // 1. Spawn a dedicated hook thread.
    // 2. Call SetWindowsHookExW(WH_KEYBOARD_LL, ...).
    // 3. Call SetWindowsHookExW(WH_MOUSE_LL, ...).
    // 4. On WM_KEYDOWN/WM_KEYUP or mouse events, map virtual key to KeyFlow token.
    // 5. If token is configured, forward event to engine.
    // 6. Return 1 to suppress original key only when shortcut.suppressKey is true.
    // 7. Otherwise call CallNextHookEx.
}

pub fn restart_global_hooks(app: AppHandle) {
    let _ = app.emit("keyflow://hooks-status", "Global hooks restarted");
    start_global_hooks(app);
}
