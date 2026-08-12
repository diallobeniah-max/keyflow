//! Window control module: manages Always-on-Top (HWND_TOPMOST) and DWM window border highlights.
//! Completely isolated from the low-level keyboard hook callback.

use std::ffi::CString;
use windows_sys::Win32::Foundation::{GetLastError, HWND};
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowA, GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowLongPtrW,
    GetWindowTextW, IsWindow, IsWindowVisible, SetWindowPos, GWL_EXSTYLE, HWND_NOTOPMOST,
    HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, WS_EX_TOPMOST,
};

const DWMWA_BORDER_COLOR: u32 = 34;
const DWMWA_COLOR_DEFAULT: u32 = 0xFFFFFFFF;

type DwmSetWindowAttributeFn = unsafe extern "system" fn(
    hwnd: HWND,
    dw_attribute: u32,
    pv_attribute: *const std::ffi::c_void,
    cb_attribute: u32,
) -> i32;

/// Parse a hex color string (e.g. "#4F7CFF", "4F7CFF", "0x4F7CFF") into Win32 COLORREF (0x00BBGGRR).
pub fn parse_color_to_colorref(color_str: &str) -> u32 {
    let clean = color_str
        .trim()
        .trim_start_matches('#')
        .trim_start_matches("0x")
        .trim_start_matches("0X");
    if let Ok(num) = u32::from_str_radix(clean, 16) {
        let (r, g, b) = match clean.len() {
            6 => ((num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF),
            8 => ((num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF), // Ignore alpha if present
            3 => {
                let r = ((num >> 8) & 0xF) * 0x11;
                let g = ((num >> 4) & 0xF) * 0x11;
                let b = (num & 0xF) * 0x11;
                (r, g, b)
            }
            _ => (0x4F, 0x7C, 0xFF), // Fallback to KeyFlow accent
        };
        // COLORREF is 0x00BBGGRR
        (b << 16) | (g << 8) | r
    } else {
        // Default KeyFlow accent #4F7CFF -> R=0x4F, G=0x7C, B=0xFF -> 0x00FF7C4F
        0x00FF7C4F
    }
}

fn set_dwm_border_color(hwnd: HWND, color: Option<u32>) -> bool {
    unsafe {
        let dwmapi = LoadLibraryA(b"dwmapi.dll\0".as_ptr());
        if dwmapi.is_null() {
            return false;
        }
        let proc = GetProcAddress(dwmapi, b"DwmSetWindowAttribute\0".as_ptr());
        if proc.is_none() {
            return false;
        }
        let dwm_set_attr: DwmSetWindowAttributeFn = std::mem::transmute(proc);

        let color_val = color.unwrap_or(DWMWA_COLOR_DEFAULT);
        let hr = dwm_set_attr(
            hwnd,
            DWMWA_BORDER_COLOR,
            &color_val as *const u32 as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        hr == 0
    }
}

fn is_system_or_shell_window(hwnd: HWND) -> bool {
    unsafe {
        if hwnd.is_null() {
            return true;
        }
        if hwnd == GetShellWindow() || hwnd == GetDesktopWindow() {
            return true;
        }
        // Taskbar check
        let tray_class = CString::new("Shell_TrayWnd").unwrap();
        let taskbar = FindWindowA(tray_class.as_ptr() as *const u8, std::ptr::null());
        if !taskbar.is_null() && hwnd == taskbar {
            return true;
        }
        // Secondary taskbar
        let sec_tray_class = CString::new("Shell_SecondaryTrayWnd").unwrap();
        let sec_taskbar = FindWindowA(sec_tray_class.as_ptr() as *const u8, std::ptr::null());
        if !sec_taskbar.is_null() && hwnd == sec_taskbar {
            return true;
        }
        // Desktop worker windows
        let progman_class = CString::new("Progman").unwrap();
        let progman = FindWindowA(progman_class.as_ptr() as *const u8, std::ptr::null());
        if !progman.is_null() && hwnd == progman {
            return true;
        }
        false
    }
}

fn get_window_title(hwnd: HWND) -> String {
    unsafe {
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

#[derive(serde::Serialize)]
pub struct WindowTopmostResult {
    pub ok: bool,
    pub action: String,
    pub mode: String,
    pub is_topmost: bool,
    pub hwnd: usize,
    pub title: String,
    pub highlight_applied: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Execute Always-on-Top action on the current foreground window.
pub fn execute_topmost(mode: &str, color_str: &str, highlight: bool) -> WindowTopmostResult {
    let mode_lower = mode.to_ascii_lowercase();
    let hwnd = unsafe { GetForegroundWindow() };

    if hwnd.is_null() || unsafe { IsWindow(hwnd) } == 0 || unsafe { IsWindowVisible(hwnd) } == 0 {
        return WindowTopmostResult {
            ok: false,
            action: "alwaysOnTop".to_string(),
            mode: mode_lower,
            is_topmost: false,
            hwnd: 0,
            title: String::new(),
            highlight_applied: false,
            error: Some("No valid foreground window found".to_string()),
        };
    }

    if is_system_or_shell_window(hwnd) {
        return WindowTopmostResult {
            ok: false,
            action: "alwaysOnTop".to_string(),
            mode: mode_lower,
            is_topmost: false,
            hwnd: hwnd as usize,
            title: get_window_title(hwnd),
            highlight_applied: false,
            error: Some("Cannot pin Windows desktop or system shell window".to_string()),
        };
    }

    let title = get_window_title(hwnd);
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    let is_currently_topmost = (ex_style & WS_EX_TOPMOST) != 0;

    let target_topmost = match mode_lower.as_str() {
        "pin" => true,
        "unpin" => false,
        _ => !is_currently_topmost, // default: toggle
    };

    let insert_after = if target_topmost {
        HWND_TOPMOST
    } else {
        HWND_NOTOPMOST
    };

    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW;
    let set_pos_ok = unsafe { SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, flags) };

    if set_pos_ok == 0 {
        let err_code = unsafe { GetLastError() };
        return WindowTopmostResult {
            ok: false,
            action: "alwaysOnTop".to_string(),
            mode: mode_lower,
            is_topmost: is_currently_topmost,
            hwnd: hwnd as usize,
            title,
            highlight_applied: false,
            error: Some(format!("SetWindowPos failed with Win32 error {}", err_code)),
        };
    }

    let mut highlight_applied = false;
    if target_topmost && highlight {
        let colorref = parse_color_to_colorref(color_str);
        highlight_applied = set_dwm_border_color(hwnd, Some(colorref));
    } else {
        // Reset border highlight when unpinned or highlight disabled
        let _ = set_dwm_border_color(hwnd, None);
    }

    WindowTopmostResult {
        ok: true,
        action: "alwaysOnTop".to_string(),
        mode: mode_lower,
        is_topmost: target_topmost,
        hwnd: hwnd as usize,
        title,
        highlight_applied,
        error: None,
    }
}

/// Entry point when invoked via CLI: `keyflow-input --window-topmost [--mode <toggle|pin|unpin>] [--color <hex>] [--no-highlight]`
pub fn run_window_topmost_cli(args: &[String]) -> std::process::ExitCode {
    let mut mode = "toggle";
    let mut color = "#4F7CFF";
    let mut highlight = true;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--mode" if i + 1 < args.len() => {
                mode = &args[i + 1];
                i += 2;
            }
            "--color" if i + 1 < args.len() => {
                color = &args[i + 1];
                i += 2;
            }
            "--no-highlight" => {
                highlight = false;
                i += 1;
            }
            _ => {
                i += 1;
            }
        }
    }

    let result = execute_topmost(mode, color, highlight);
    let json = serde_json::to_string(&result).unwrap_or_else(|_| r#"{"ok":false}"#.to_string());
    println!("{json}");

    if result.ok {
        std::process::ExitCode::SUCCESS
    } else {
        std::process::ExitCode::from(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_color_to_colorref() {
        // #4F7CFF -> R=0x4F, G=0x7C, B=0xFF -> 0x00FF7C4F
        assert_eq!(parse_color_to_colorref("#4F7CFF"), 0x00FF7C4F);
        assert_eq!(parse_color_to_colorref("4F7CFF"), 0x00FF7C4F);
        assert_eq!(parse_color_to_colorref("0x4F7CFF"), 0x00FF7C4F);

        // #00D2FF (Cyan) -> R=0x00, G=0xD2, B=0xFF -> 0x00FFD200
        assert_eq!(parse_color_to_colorref("#00D2FF"), 0x00FFD200);

        // #34C78A (Emerald) -> R=0x34, G=0xC7, B=0x8A -> 0x008AC734
        assert_eq!(parse_color_to_colorref("#34C78A"), 0x008AC734);

        // #E65B65 (Rose) -> R=0xE6, G=0x5B, B=0x65 -> 0x00655BE6
        assert_eq!(parse_color_to_colorref("#E65B65"), 0x00655BE6);

        // Fallback for invalid
        assert_eq!(parse_color_to_colorref("invalid"), 0x00FF7C4F);
    }

    #[test]
    fn test_is_system_window_null() {
        assert!(is_system_or_shell_window(std::ptr::null_mut()));
    }
}
