//! Key injection for remap mode. Uses SendInput with a KeyFlow marker in
//! dwExtraInfo so the hook can recognize its own output.

use std::mem::size_of;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, INPUT, INPUT_0,
    INPUT_KEYBOARD, SendInput,
};

/// Must match the Electron-side NATIVE_INPUT_MARKER.
pub const OWN_MARKER: usize = super::protocol::OWN_INJECTED_MARKER;

/// Send a real key press/release via SendInput. Returns false on failure.
/// Tests must NOT call this (it injects into the live session).
pub fn send_vk(vk: u32, scan_code: u32, extended: bool, down: bool) -> bool {
    let mut flags = 0u32;
    if extended {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }
    let mut input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk as u16,
                wScan: scan_code as u16,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: OWN_MARKER,
            },
        },
    };
    // Keep KEYEVENTF_UNICODE referenced so the constant stays compiled in on
    // all feature combinations (harmless; we never use the unicode path yet).
    let _ = KEYEVENTF_UNICODE;
    // ponytail: vk path only; scan-code pass-through for unusual layouts would
    // need the scancode flag variant. Add when a layout needs it.
    unsafe { SendInput(1, &mut input as *const INPUT, size_of::<INPUT>() as i32) == 1 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marker_matches_electron_constant() {
        // Kept in sync with electron/native-input-helper.ts NATIVE_INPUT_MARKER.
        assert_eq!(OWN_MARKER, 0x4B46_574B);
    }
}
