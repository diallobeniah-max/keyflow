//! Application scoping: the cached foreground application identity and the
//! scope-matching rules for app-specific shortcuts.
//!
//! Design:
//! - Foreground detection is EVENT-DRIVEN via `SetWinEventHook` on its own
//!   message-loop thread. The hook never enumerates or queries processes on
//!   keyboard events — keyboard matching only compares against the CACHED
//!   active app, read through a Mutex.
//! - Identity is the NORMALIZED executable path (`normalize_path`: lowercase,
//!   `/` -> `\`). Window titles are display metadata only and never
//!   participate in matching.
//! - Fail-open: when the foreground identity cannot be resolved, the cached
//!   active app is cleared and every app-specific rule is inactive, so the
//!   source key always passes through.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

/// The cached foreground application identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveApp {
    pub executable_path: String,
    pub process_name: Option<String>,
    pub display_name: Option<String>,
}

static ACTIVE: LazyLock<Mutex<Option<ActiveApp>>> = LazyLock::new(|| Mutex::new(None));
/// Bumped on every foreground change so the hook can lazily run scope cleanup
/// (release scoped remaps, reset scoped gestures) exactly once per switch.
static GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn current() -> Option<ActiveApp> {
    ACTIVE.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

pub fn generation() -> u64 {
    GENERATION.load(Ordering::Relaxed)
}

pub fn set_active(app: Option<ActiveApp>) {
    *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = app;
    GENERATION.fetch_add(1, Ordering::Relaxed);
}

/// Normalized Windows path identity: trimmed, `/` folded to `\`, trailing
/// nulls removed, lowercased (Windows paths are case-insensitive).
pub fn normalize_path(path: &str) -> String {
    path.trim()
        .replace('/', "\\")
        .trim_end_matches('\0')
        .to_lowercase()
}

/// True when `scope` matches the given active application. A global scope
/// (None) is handled by the caller; this only answers "does this app-specific
/// scope apply right now". Unresolvable foreground (None) never matches.
pub fn scope_matches(scope: &crate::protocol::AppScope, active: Option<&ActiveApp>) -> bool {
    let Some(app) = active else {
        return false;
    };
    if !scope.executable_path.trim().is_empty() {
        return normalize_path(&scope.executable_path) == normalize_path(&app.executable_path);
    }
    if let Some(pn) = &scope.process_name {
        if !pn.trim().is_empty() {
            return app
                .process_name
                .as_deref()
                .map_or(false, |ap| ap.to_lowercase() == pn.to_lowercase());
        }
    }
    false
}

// ── Foreground watcher thread ───────────────────────────────────────────────

use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, EVENT_SYSTEM_FOREGROUND, GetForegroundWindow, GetMessageW, GetWindowTextW,
    GetWindowThreadProcessId, MSG, TranslateMessage, WINEVENT_OUTOFCONTEXT,
};

/// Resolve the foreground window to an executable identity, or None when the
/// foreground is not resolvable (fail-open).
fn resolve_from_hwnd(hwnd: HWND) -> Option<ActiveApp> {
    unsafe {
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return None;
        }
        let path = crate::drag_switcher::process_path(pid)?;
        let process_name = crate::drag_switcher::process_name(pid);
        let mut title_buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
        let display_name = if len > 0 {
            let t = String::from_utf16_lossy(&title_buf[..len as usize]).trim().to_string();
            if t.is_empty() { None } else { Some(t) }
        } else {
            None
        };
        Some(ActiveApp {
            executable_path: path,
            process_name: if process_name.is_empty() { None } else { Some(process_name) },
            display_name,
        })
    }
}

unsafe extern "system" fn fg_callback(
    _h_event_hook: *mut core::ffi::c_void,
    _event: u32,
    _hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _dw_event_thread: u32,
    _dwms_event_time: u32,
) {
    let hwnd = GetForegroundWindow();
    set_active(resolve_from_hwnd(hwnd));
}

/// Spawn the foreground watcher thread. It registers a SetWinEventHook for
/// EVENT_SYSTEM_FOREGROUND and runs a message loop, updating the cached active
/// app on every switch. Also resolves the initial foreground once.
pub fn spawn_foreground_watcher() {
    std::thread::Builder::new()
        .name("keyflow-foreground".to_string())
        .spawn(|| unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                std::ptr::null_mut(),
                Some(fg_callback),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            // Initial resolution regardless of hook availability.
            set_active(resolve_from_hwnd(GetForegroundWindow()));
            if hook.is_null() {
                eprintln!("[app-scope] SetWinEventHook failed; app scoping inactive (fail-open)");
                return;
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                let _ = TranslateMessage(&msg);
                let _ = DispatchMessageW(&msg);
            }
            let _ = UnhookWinEvent(hook);
        })
        .expect("failed to spawn foreground watcher");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::AppScope;

    fn scope(path: &str, process: Option<&str>) -> AppScope {
        AppScope {
            scope_type: "executable".to_string(),
            executable_path: path.to_string(),
            process_name: process.map(|s| s.to_string()),
            display_name: None,
        }
    }

    fn active(path: &str, process: &str) -> ActiveApp {
        ActiveApp {
            executable_path: path.to_string(),
            process_name: Some(process.to_string()),
            display_name: Some("Some Window".to_string()),
        }
    }

    #[test]
    fn app_scope_photoshop_matches_photoshop() {
        let s = scope(r"C:\Program Files\Adobe\Photoshop\Photoshop.exe", Some("Photoshop"));
        let a = active(r"C:\Program Files\Adobe\Photoshop\Photoshop.exe", "Photoshop");
        assert!(scope_matches(&s, Some(&a)));
    }

    #[test]
    fn app_scope_photoshop_rejects_chrome() {
        let s = scope(r"C:\Program Files\Adobe\Photoshop\Photoshop.exe", Some("Photoshop"));
        let a = active(r"C:\Program Files\Google\Chrome\Application\chrome.exe", "chrome");
        assert!(!scope_matches(&s, Some(&a)));
    }

    #[test]
    fn app_scope_path_normalization() {
        assert_eq!(normalize_path(r"C:\Program Files\App\a.exe"), "c:\\program files\\app\\a.exe");
        assert_eq!(normalize_path("C:/Program Files/App/a.exe"), "c:\\program files\\app\\a.exe");
        assert_eq!(normalize_path("  c:\\app\\x.exe\0"), "c:\\app\\x.exe");
    }

    #[test]
    fn app_scope_case_normalization() {
        let s = scope(r"C:\Program Files\APP\Notepad.exe", None);
        let a = active(r"c:\program files\app\notePad.EXE", "notepad");
        assert!(scope_matches(&s, Some(&a)));
    }

    #[test]
    fn window_title_changes_do_not_affect_identity() {
        let s = scope(r"C:\Windows\System32\notepad.exe", Some("notepad"));
        let a1 = active(r"C:\Windows\System32\notepad.exe", "notepad");
        let a2 = active(r"C:\Windows\System32\notepad.exe", "notepad");
        // display_name is pure metadata; matching only compares executable identity.
        let a2 = ActiveApp { display_name: Some("Totally different title".to_string()), ..a2 };
        assert!(scope_matches(&s, Some(&a1)));
        assert!(scope_matches(&s, Some(&a2)));
    }

    #[test]
    fn missing_foreground_identity_fail_open() {
        let s = scope(r"C:\Program Files\Adobe\Photoshop\Photoshop.exe", Some("Photoshop"));
        assert!(!scope_matches(&s, None), "no cached app => scoped rule inactive (fail-open)");
    }

    #[test]
    fn process_name_fallback_matches() {
        let s = scope("", Some("Photoshop"));
        let a = active(r"c:\whatever\Photoshop.exe", "Photoshop");
        assert!(scope_matches(&s, Some(&a)));
        let b = active(r"c:\whatever\chrome.exe", "chrome");
        assert!(!scope_matches(&s, Some(&b)));
    }

    #[test]
    fn empty_scope_never_matches() {
        let s = AppScope::default();
        let a = active(r"C:\x\y.exe", "y");
        assert!(!scope_matches(&s, Some(&a)), "no identity => no match (never globally-implied here)");
    }
}
