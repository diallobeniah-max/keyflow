//! WASD Navigation Mode: maps W/A/S/D to Up/Left/Down/Right while active.
//!
//! Pure state machine — no Windows calls. The hook applies the returned
//! injection lists via SendInput (extended scan, KeyFlow marker); tests assert
//! on the lists directly.
//!
//! Safety model:
//! - Everything passes through untouched while the mode is off or paused.
//! - WASD physical keys are consumed while active (the original letter never
//!   reaches Windows); the mapped arrow is injected in its place.
//! - Holding a key autorepeats the arrow (repeat downs re-affirm the injection)
//!   but a single physical press never yields more than one arrow down and a
//!   single physical release yields exactly one arrow up — no duplicate state.
//! - Disabling while a WASD key is physically held releases the arrow and marks
//!   that key `waiting_up` so its still-down press cannot leak a fresh arrow;
//!   the flag clears on that key's physical release.
//! - Held arrows are always released on disable, pause, and reload.

pub const VK_W: u32 = 0x57;
pub const VK_A: u32 = 0x41;
pub const VK_S: u32 = 0x53;
pub const VK_D: u32 = 0x44;
pub const VK_LEFT: u32 = 0x25;
pub const VK_UP: u32 = 0x26;
pub const VK_RIGHT: u32 = 0x27;
pub const VK_DOWN: u32 = 0x28;

const BIT_W: u8 = 0b0001;
const BIT_A: u8 = 0b0010;
const BIT_S: u8 = 0b0100;
const BIT_D: u8 = 0b1000;

/// A single key injection `(vk, down)` to be sent via SendInput.
pub type Inject = (u32, bool);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavOutcome {
    /// Not a WASD key, or the mode is off/paused: pass through untouched.
    Pass,
    /// Handled by navigation; the event must not reach Windows or the engine.
    Consumed,
}

#[derive(Debug)]
pub struct NavigationMode {
    active: bool,
    paused: bool,
    /// Arrows currently injected (i.e. physical WASD keys held).
    held: u8,
    /// Physical WASD keys that were down when the mode turned off; their next
    /// physical release must not map to a fresh arrow.
    waiting_up: u8,
}

impl NavigationMode {
    pub const fn new() -> Self {
        Self {
            active: false,
            paused: false,
            held: 0,
            waiting_up: 0,
        }
    }

    pub fn is_active(&self) -> bool {
        self.active
    }

    /// Enable/disable the mode. Disabling releases held arrows; keys that were
    /// physically down when the mode turned off are marked `waiting_up` and
    /// stay marked until their physical release, even across a re-enable.
    pub fn set_active(&mut self, enabled: bool) -> Vec<Inject> {
        if enabled == self.active {
            return Vec::new();
        }
        self.active = enabled;
        if enabled {
            Vec::new()
        } else {
            self.release_all()
        }
    }

    /// Pause/resume. Pausing releases held arrows so they never stick.
    pub fn set_paused(&mut self, paused: bool) -> Vec<Inject> {
        if paused == self.paused {
            return Vec::new();
        }
        self.paused = paused;
        if paused {
            self.release_all()
        } else {
            Vec::new()
        }
    }

    /// Release every held arrow (disable, pause, reload, shutdown).
    pub fn release_all(&mut self) -> Vec<Inject> {
        let mut out = Vec::new();
        if self.held & BIT_W != 0 {
            out.push((VK_UP, false));
        }
        if self.held & BIT_A != 0 {
            out.push((VK_LEFT, false));
        }
        if self.held & BIT_S != 0 {
            out.push((VK_DOWN, false));
        }
        if self.held & BIT_D != 0 {
            out.push((VK_RIGHT, false));
        }
        self.waiting_up = self.held;
        self.held = 0;
        out
    }

    /// Route one key event. Returns whether it was consumed plus any arrow
    /// injections to perform.
    pub fn handle(&mut self, down: bool, vk: u32) -> (NavOutcome, Vec<Inject>) {
        let (bit, arrow) = match vk {
            VK_W => (BIT_W, VK_UP),
            VK_A => (BIT_A, VK_LEFT),
            VK_S => (BIT_S, VK_DOWN),
            VK_D => (BIT_D, VK_RIGHT),
            _ => return (NavOutcome::Pass, Vec::new()),
        };
        if down {
            if !self.active || self.paused {
                return (NavOutcome::Pass, Vec::new());
            }
            // Physically held when the mode turned off: swallow this repeat so
            // the still-down key cannot leak a fresh arrow; the flag clears on
            // its physical release.
            if self.waiting_up & bit != 0 {
                return (NavOutcome::Consumed, Vec::new());
            }
            self.held |= bit;
            // Inject on every physical down so autorepeat follows the OS; held
            // is idempotent so a press is never injected twice.
            (NavOutcome::Consumed, vec![(arrow, true)])
        } else {
            // Always clear the wait flag on release so a future press after a
            // re-enable is never swallowed.
            let was_held = self.held & bit != 0;
            self.held &= !bit;
            self.waiting_up &= !bit;
            if !self.active || self.paused {
                return (NavOutcome::Pass, Vec::new());
            }
            if was_held {
                (NavOutcome::Consumed, vec![(arrow, false)])
            } else {
                (NavOutcome::Consumed, Vec::new())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Run a W press: down (inject Up down), then up (inject Up up).
    fn press(mode: &mut NavigationMode, vk: u32, injects: &mut Vec<Inject>) {
        let (_o, mut a) = mode.handle(true, vk);
        injects.append(&mut a);
        let (_o, mut b) = mode.handle(false, vk);
        injects.append(&mut b);
    }

    #[test]
    fn default_off() {
        let mut mode = NavigationMode::new();
        assert!(!mode.is_active());
        let (o, inj) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Pass);
        assert!(inj.is_empty());
    }

    #[test]
    fn toggle_on() {
        let mut mode = NavigationMode::new();
        assert!(mode.set_active(true).is_empty());
        assert!(mode.is_active());
    }

    #[test]
    fn toggle_off() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        assert!(mode.set_active(false).is_empty());
        assert!(!mode.is_active());
        let (o, _) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Pass);
    }

    #[test]
    fn w_to_up() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let (o, inj) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(inj, vec![(VK_UP, true)]);
    }

    #[test]
    fn a_to_left() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let (o, inj) = mode.handle(true, VK_A);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(inj, vec![(VK_LEFT, true)]);
    }

    #[test]
    fn s_to_down() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let (o, inj) = mode.handle(true, VK_S);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(inj, vec![(VK_DOWN, true)]);
    }

    #[test]
    fn d_to_right() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let (o, inj) = mode.handle(true, VK_D);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(inj, vec![(VK_RIGHT, true)]);
    }

    #[test]
    fn suppresses_original_letters() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        // A physical W/A/S/D must never be injected as its letter (W=0x57 etc.).
        let (o, inj) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(!inj.iter().any(|(vk, _)| *vk == VK_W));
        let (o, inj) = mode.handle(true, VK_A);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(!inj.iter().any(|(vk, _)| *vk == VK_A));
        let (o, inj) = mode.handle(true, VK_S);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(!inj.iter().any(|(vk, _)| *vk == VK_S));
        let (o, inj) = mode.handle(true, VK_D);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(!inj.iter().any(|(vk, _)| *vk == VK_D));
    }

    #[test]
    fn keyup_releases_arrow() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let _ = mode.handle(true, VK_W);
        let (o, inj) = mode.handle(false, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(inj, vec![(VK_UP, false)]);
    }

    #[test]
    fn repeat_does_not_duplicate_state() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        // Hold W: first down + two OS autorepeat downs + one up.
        let (_, a) = mode.handle(true, VK_W);
        assert_eq!(a, vec![(VK_UP, true)]);
        let (o, a) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(a, vec![(VK_UP, true)]); // autorepeat re-affirms, never double-injects a release
        let (o, a) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(a, vec![(VK_UP, true)]);
        let (o, b) = mode.handle(false, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(b, vec![(VK_UP, false)]);
        // Pressing again after release starts fresh.
        let (_, c) = mode.handle(true, VK_W);
        assert_eq!(c, vec![(VK_UP, true)]);
    }

    #[test]
    fn disable_releases_held_arrow() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let _ = mode.handle(true, VK_W);
        let inj = mode.set_active(false);
        assert_eq!(inj, vec![(VK_UP, false)]);
        assert!(!mode.is_active());
    }

    #[test]
    fn disable_while_physical_key_held_no_letter_leak() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        // W held down -> Up injected.
        let _ = mode.handle(true, VK_W);
        // Mode off while W still physically down: release arrow, mark waiting_up.
        let inj = mode.set_active(false);
        assert_eq!(inj, vec![(VK_UP, false)]);
        // While off the still-held W passes through normally (letters restored).
        let (o, a) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Pass);
        assert!(a.is_empty());
        // Re-enable while W is still down: its repeats must be swallowed, not
        // mapped to a fresh arrow.
        mode.set_active(true);
        let (o, a) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(a.is_empty());
        // Physical release clears the wait and is swallowed too.
        let (o, b) = mode.handle(false, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(b.is_empty());
        // A fresh press now maps normally.
        let (o, c) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(c, vec![(VK_UP, true)]);
    }

    #[test]
    fn shutdown_cleanup() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let mut injects = Vec::new();
        press(&mut mode, VK_W, &mut injects);
        press(&mut mode, VK_A, &mut injects);
        press(&mut mode, VK_S, &mut injects);
        press(&mut mode, VK_D, &mut injects);
        // Hold W+A again, then force a full cleanup.
        let _ = mode.handle(true, VK_W);
        let _ = mode.handle(true, VK_A);
        let inj = mode.release_all();
        assert_eq!(inj, vec![(VK_UP, false), (VK_LEFT, false)]);
        assert_eq!(mode.held, 0);
    }

    #[test]
    fn reload_cleanup() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let _ = mode.handle(true, VK_S);
        let _ = mode.handle(true, VK_D);
        // Reconfiguring (set_active(false) then true) must release held arrows.
        let inj = mode.set_active(false);
        assert_eq!(inj, vec![(VK_DOWN, false), (VK_RIGHT, false)]);
        mode.set_active(true);
        assert!(mode.set_active(true).is_empty()); // idempotent re-enable
        assert_eq!(mode.held, 0);
    }

    #[test]
    fn own_marker_not_reprocessed() {
        // Injected arrow events (SendInput output) are not WASD keys: they must
        // pass straight through and never re-enter mapping.
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        for arrow in [VK_UP, VK_LEFT, VK_DOWN, VK_RIGHT] {            let (o, inj) = mode.handle(true, arrow);
            assert_eq!(o, NavOutcome::Pass);
            assert!(inj.is_empty());
        }
    }

    #[test]
    fn physical_ctrl_preserved() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        for vk in [0x11, 0x10, 0x12, 0x5B, 0x1B] {
            let (o, inj) = mode.handle(true, vk);
            assert_eq!(o, NavOutcome::Pass);
            assert!(inj.is_empty());
        }
    }

    #[test]
    fn toggle_cycles_do_not_leak() {
        let mut mode = NavigationMode::new();
        for _ in 0..100 {
            mode.set_active(true);
            mode.set_active(false);
        }
        assert_eq!(mode.held, 0);
        assert_eq!(mode.waiting_up, 0);
        assert!(!mode.is_active());
    }

    #[test]
    fn wasd_cycles_do_not_leak() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let mut injects = Vec::new();
        for _ in 0..100 {
            press(&mut mode, VK_W, &mut injects);
        }
        let ups = injects.iter().filter(|(_, d)| !*d).count();
        let downs = injects.iter().filter(|(_, d)| *d).count();
        assert_eq!(ups, 100);
        assert_eq!(downs, 100);
        assert_eq!(mode.held, 0);
        assert_eq!(mode.waiting_up, 0);
    }

    #[test]
    fn hyper_independent() {
        // While WASD navigation is active, every non-WASD key still passes
        // through untouched so Hyper chords on T/Y/etc. keep working.
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        for vk in [0x54, 0x59, 0x45, 0x43] {
            let (o, inj) = mode.handle(true, vk);
            assert_eq!(o, NavOutcome::Pass);
            assert!(inj.is_empty());
        }
        let (o, _) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
    }

    #[test]
    fn paused_passes_everything() {
        let mut mode = NavigationMode::new();
        mode.set_active(true);
        let _ = mode.handle(true, VK_W);
        let inj = mode.set_paused(true);
        assert_eq!(inj, vec![(VK_UP, false)]);
        // Paused: WASD passes through, no injection.
        let (o, a) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Pass);
        assert!(a.is_empty());
        assert!(mode.set_paused(false).is_empty());
        // Unpaused while W is still physically down: swallow its repeat (it was
        // held through the pause), then a fresh press maps normally.
        let (o, b) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(b.is_empty());
        let (o, c) = mode.handle(false, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert!(c.is_empty());
        let (o, d) = mode.handle(true, VK_W);
        assert_eq!(o, NavOutcome::Consumed);
        assert_eq!(d, vec![(VK_UP, true)]);
    }
}