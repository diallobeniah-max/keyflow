//! Clipboard accelerator ownership.
//!
//! Windows reserves Win-key chords such as Win+V. Normal per-key suppression
//! must never consume a letter globally, so the native hook owns only the
//! explicitly configured clipboard chord and only while its full modifier mask
//! is held.

use crate::app_scope::{self, ActiveApp};
use crate::config::{MOD_BIT_CTRL, MOD_BIT_WIN};
use crate::protocol::AppScope;
use std::sync::Mutex;

const VK_CONTROL: u32 = 0x11;

#[derive(Default)]
struct StartMenuMaskState {
    active_vk: Option<u32>,
}

impl StartMenuMaskState {
    fn update(&mut self, vk: u32, down: bool, owns_shortcut: bool, modifiers: u32) -> bool {
        if !down {
            if self.active_vk == Some(vk) || vk == 0x5B || vk == 0x5C {
                self.active_vk = None;
            }
            return false;
        }

        // Windows opens Start on Win-up when the only other physical key was
        // swallowed by our hook. A brief Ctrl tap marks the Win press as used,
        // matching the menu-mask technique used by established hook tools.
        // Do this once per owned chord, and only when Ctrl is not already held.
        if owns_shortcut
            && modifiers & MOD_BIT_WIN != 0
            && modifiers & MOD_BIT_CTRL == 0
            && self.active_vk.is_none()
        {
            self.active_vk = Some(vk);
            return true;
        }

        false
    }
}

static START_MENU_MASK_STATE: Mutex<StartMenuMaskState> =
    Mutex::new(StartMenuMaskState { active_vk: None });

#[derive(Clone, Debug)]
pub struct ClipboardShortcut {
    pub vk: u32,
    pub required_mods: u32,
    pub app_scope: Option<AppScope>,
}

impl ClipboardShortcut {
    pub fn matches(&self, vk: u32, modifiers: u32, active: Option<&ActiveApp>) -> bool {
        self.vk == vk
            && self.required_mods == modifiers
            && self
                .app_scope
                .as_ref()
                .map_or(true, |scope| app_scope::scope_matches(scope, active))
    }
}

/// Returns the harmless modifier key that should be tapped to prevent the
/// Windows Start menu from opening when an owned Win chord is released.
pub fn start_menu_mask_key(
    vk: u32,
    down: bool,
    owns_shortcut: bool,
    modifiers: u32,
) -> Option<u32> {
    let mut state = START_MENU_MASK_STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    state
        .update(vk, down, owns_shortcut, modifiers)
        .then_some(VK_CONTROL)
}

pub fn reset_start_menu_mask() {
    START_MENU_MASK_STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .active_vk = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_configured_complete_chord_is_owned() {
        let shortcut = ClipboardShortcut {
            vk: 0x56,
            required_mods: 0b1000,
            app_scope: None,
        };
        assert!(shortcut.matches(0x56, 0b1000, None)); // Win+V
        assert!(!shortcut.matches(0x56, 0, None)); // V alone
        assert!(!shortcut.matches(0x56, 0b1100, None)); // Win+Shift+V
        assert!(!shortcut.matches(0x43, 0b1000, None)); // Win+C
    }

    #[test]
    fn win_shortcut_requests_one_menu_mask_per_press() {
        let mut state = StartMenuMaskState::default();
        assert!(state.update(0x56, true, true, MOD_BIT_WIN));
        assert!(!state.update(0x56, true, true, MOD_BIT_WIN));
        assert!(!state.update(0x56, false, true, MOD_BIT_WIN));
        assert!(state.update(0x56, true, true, MOD_BIT_WIN));
    }

    #[test]
    fn unowned_or_non_win_shortcuts_never_request_a_menu_mask() {
        let mut state = StartMenuMaskState::default();
        assert!(!state.update(0x56, true, false, MOD_BIT_WIN));
        assert!(!state.update(0x56, true, true, 0));
        assert!(!state.update(0x56, true, true, MOD_BIT_WIN | MOD_BIT_CTRL));
    }

    #[test]
    fn unrelated_key_up_does_not_rearm_the_same_press() {
        let mut state = StartMenuMaskState::default();
        assert!(state.update(0x56, true, true, MOD_BIT_WIN));
        assert!(!state.update(0x43, false, false, MOD_BIT_WIN));
        assert!(!state.update(0x56, true, true, MOD_BIT_WIN));
        assert!(!state.update(0x56, false, true, MOD_BIT_WIN));
        assert!(state.update(0x56, true, true, MOD_BIT_WIN));
    }

    #[test]
    fn releasing_win_before_the_target_also_resets_the_mask() {
        let mut state = StartMenuMaskState::default();
        assert!(state.update(0x56, true, true, MOD_BIT_WIN));
        assert!(!state.update(0x5B, false, false, 0));
        assert!(state.update(0x56, true, true, MOD_BIT_WIN));
    }
}
