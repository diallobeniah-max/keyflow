//! Key injection for remap mode. Uses SendInput with a KeyFlow marker in
//! dwExtraInfo so the hook can recognize its own output.

use std::mem::size_of;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, INPUT, INPUT_0,
    INPUT_KEYBOARD, MapVirtualKeyW, MAPVK_VK_TO_VSC, SendInput,
};

/// Must match the Electron-side NATIVE_INPUT_MARKER.
pub const OWN_MARKER: usize = super::protocol::OWN_INJECTED_MARKER;

// Canonical Win32 media/volume virtual-key codes. These are the ONLY accepted
// values for these keys; legacy constants (0xB5/0xB6/0xB7/0xCD) were wrong and
// must not be reintroduced. Keep in sync with electron/vk-catalog.ts.
pub const VK_VOLUME_MUTE: u32 = 0xAD;
pub const VK_VOLUME_DOWN: u32 = 0xAE;
pub const VK_VOLUME_UP: u32 = 0xAF;
pub const VK_MEDIA_NEXT_TRACK: u32 = 0xB0;
pub const VK_MEDIA_PREV_TRACK: u32 = 0xB1;
pub const VK_MEDIA_STOP: u32 = 0xB2;
pub const VK_MEDIA_PLAY_PAUSE: u32 = 0xB3;

/// All media/volume VKs the helper can inject. None of them are extended keys.
pub const MEDIA_VKS: [u32; 7] = [
    VK_VOLUME_MUTE,
    VK_VOLUME_DOWN,
    VK_VOLUME_UP,
    VK_MEDIA_NEXT_TRACK,
    VK_MEDIA_PREV_TRACK,
    VK_MEDIA_STOP,
    VK_MEDIA_PLAY_PAUSE,
];

/// Down/up injection pair for one media key: a tap is exactly [down, up].
/// Pure so tests can assert the contract without calling real SendInput.
pub fn media_inject_plan(vk: u32) -> [(u32, bool); 2] {
    [(vk, true), (vk, false)]
}

// Test-only count of real `send_vk` calls, so tests can assert that Hyper
// recognition NEVER calls SendInput (virtual modifier model: zero injects).
// Thread-local so parallel cargo test threads never cross-contaminate counts.
// Zero cost in production (compiled out of non-test builds).
#[cfg(test)]
thread_local! {
    static TEST_INJECT_COUNT: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

#[cfg(test)]
pub fn test_inject_count() -> u32 {
    TEST_INJECT_COUNT.with(|c| c.get())
}

#[cfg(test)]
pub fn test_inject_reset() {
    TEST_INJECT_COUNT.with(|c| c.set(0));
}

/// Send a real key press/release via SendInput. Returns false on failure.
/// Tests must NOT call this (it injects into the live session).
pub fn send_vk(vk: u32, scan_code: u32, extended: bool, down: bool) -> bool {
    #[cfg(test)]
    TEST_INJECT_COUNT.with(|c| c.set(c.get() + 1));
    let mut flags = 0u32;
    if extended {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }
    let scan = if scan_code != 0 {
        scan_code
    } else {
        unsafe { MapVirtualKeyW(vk, MAPVK_VK_TO_VSC) }
    };
    let mut input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk as u16,
                wScan: scan as u16,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: OWN_MARKER,
            },
        },
    };
    let _ = KEYEVENTF_UNICODE;
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

    #[test]
    fn media_vk_constants_match_electron_catalog() {
        // electron/vk-catalog.ts and electron/actions.ts VIRTUAL_KEYS.
        assert_eq!(VK_VOLUME_MUTE, 0xAD);
        assert_eq!(VK_VOLUME_DOWN, 0xAE);
        assert_eq!(VK_VOLUME_UP, 0xAF);
        assert_eq!(VK_MEDIA_NEXT_TRACK, 0xB0);
        assert_eq!(VK_MEDIA_PREV_TRACK, 0xB1);
        assert_eq!(VK_MEDIA_STOP, 0xB2);
        assert_eq!(VK_MEDIA_PLAY_PAUSE, 0xB3);
    }

    fn assert_tap(vk: u32) {
        let plan = media_inject_plan(vk);
        assert_eq!(plan, [(vk, true), (vk, false)]);
    }

    #[test]
    fn media_play_pause_down_up() {
        assert_tap(VK_MEDIA_PLAY_PAUSE);
    }

    #[test]
    fn media_next_track_down_up() {
        assert_tap(VK_MEDIA_NEXT_TRACK);
    }

    #[test]
    fn media_previous_track_down_up() {
        assert_tap(VK_MEDIA_PREV_TRACK);
    }

    #[test]
    fn media_stop_down_up() {
        assert_tap(VK_MEDIA_STOP);
    }

    #[test]
    fn volume_up_down_up() {
        assert_tap(VK_VOLUME_UP);
    }

    #[test]
    fn volume_down_down_up() {
        assert_tap(VK_VOLUME_DOWN);
    }

    #[test]
    fn volume_mute_down_up() {
        assert_tap(VK_VOLUME_MUTE);
    }
}
