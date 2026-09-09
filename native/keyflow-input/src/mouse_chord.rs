//! Dedicated mouse-button chord detection.
//!
//! The raw mouse observer owns physical button state. This module only decides
//! whether Left + Right were pressed closely enough to count as one deliberate
//! chord, and latches until both buttons are released so one press toggles once.

use std::sync::Mutex;
use std::time::Duration;

const CHORD_WINDOW: Duration = Duration::from_millis(180);

#[derive(Debug, Default)]
struct MouseChordState {
    enabled: bool,
    left_down: bool,
    right_down: bool,
    left_at: Option<Duration>,
    right_at: Option<Duration>,
    latched: bool,
}

impl MouseChordState {
    fn configure(&mut self, enabled: bool) {
        self.enabled = enabled;
        self.reset_buttons();
    }

    fn update(&mut self, left: bool, down: bool, at: Duration) -> bool {
        if left {
            self.left_down = down;
            self.left_at = down.then_some(at);
        } else {
            self.right_down = down;
            self.right_at = down.then_some(at);
        }

        if !self.left_down && !self.right_down {
            self.latched = false;
        }
        if !self.enabled || self.latched || !self.left_down || !self.right_down {
            return false;
        }

        let Some(left_at) = self.left_at else { return false };
        let Some(right_at) = self.right_at else { return false };
        let gap = left_at.abs_diff(right_at);
        if gap > CHORD_WINDOW {
            return false;
        }

        self.latched = true;
        true
    }

    fn reset_buttons(&mut self) {
        self.left_down = false;
        self.right_down = false;
        self.left_at = None;
        self.right_at = None;
        self.latched = false;
    }
}

static STATE: Mutex<MouseChordState> = Mutex::new(MouseChordState {
    enabled: false,
    left_down: false,
    right_down: false,
    left_at: None,
    right_at: None,
    latched: false,
});

pub fn configure(enabled: bool) {
    STATE.lock().unwrap_or_else(|p| p.into_inner()).configure(enabled);
}

pub fn on_button(left: bool, down: bool, at: Duration) -> bool {
    STATE.lock().unwrap_or_else(|p| p.into_inner()).update(left, down, at)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(value: u64) -> Duration { Duration::from_millis(value) }

    #[test]
    fn chord_fires_once_until_both_buttons_release() {
        let mut state = MouseChordState::default();
        state.configure(true);
        assert!(!state.update(true, true, ms(10)));
        assert!(state.update(false, true, ms(40)));
        assert!(!state.update(false, true, ms(45)));
        assert!(!state.update(true, false, ms(50)));
        assert!(!state.update(true, true, ms(60)));
        assert!(!state.update(false, false, ms(70)));
        assert!(!state.update(true, false, ms(80)));
        assert!(!state.update(false, true, ms(100)));
        assert!(state.update(true, true, ms(120)));
    }

    #[test]
    fn slow_overlap_and_disabled_mode_do_not_fire() {
        let mut state = MouseChordState::default();
        state.configure(true);
        assert!(!state.update(true, true, ms(10)));
        assert!(!state.update(false, true, ms(250)));
        state.configure(false);
        assert!(!state.update(true, true, ms(300)));
        assert!(!state.update(false, true, ms(310)));
    }
}
