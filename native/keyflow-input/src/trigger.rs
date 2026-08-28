//! Native trigger state machine. Rust is authoritative for keyboard gesture
//! recognition: tap counts, double/triple windows, hold thresholds, hyper key chords,
//! and single-versus-double / tap-versus-hold arbitrations all live here.
//!
//! Time is monotonic and injectable: every event carries an absolute `at`
//! (Duration since the engine epoch). Tests drive the machine deterministically
//! with synthetic durations; the hook feeds `now.duration_since(epoch)`.
//!
//! Design notes:
//! - A completed gesture resets its state immediately, so the next gesture
//!   starts fresh. There is NO cross-gesture cooldown that could swallow the
//!   first tap of the next pair (default cooldown is 0).
//! - Fires happen on the DOWN that completes a multi-tap (double/triple),
//!   exactly like the old TypeScript matcher but now inside the native helper.
//! - Hold fires once via a deadline; releasing early cancels it and a
//!   quick tap never fires a hold-only rule.
//! - Hyper Key: a designated physical key acts as a VIRTUAL modifier chord
//!   (Ctrl+Alt+Win, optional Shift). Hyper recognition is purely logical:
//!   `mods = physical_mods | hyper_mods`. KeyFlow NEVER sends Ctrl/Alt/Win
//!   through SendInput just to recognize a Hyper shortcut
//!   (HYPER RECOGNITION != OS MODIFIER INJECTION). A modifier Hyper key
//!   (Right Alt / Ctrl / Shift / Win variants) activates the virtual mask
//!   immediately on physical down and has NO Quick Press / tap. Non-modifier
//!   Hyper keys (Caps Lock / F-keys / Apps) may keep tap-vs-chord. Releasing a
//!   non-modifier Hyper key alone fires the optional Hyper tap action.
//! - Typing Protection: printable keys in rapid succession indicate active
//!   typing. Standalone printable gestures (e.g. single-tap 'F' or double-tap 'F')
//!   only arm when the user is idle before the gesture starts, preventing accidental
//!   activations when typing words like "coffee" or "office".
//! - Non-printable keys like CapsLock, Escape, F1-F24, and modifier combinations
//!   (e.g. Ctrl+Shift+C, Hyper+T) are completely immune to typing protection.

use std::collections::HashMap;
use std::time::Duration;

use crate::app_scope::ActiveApp;
use crate::config::{Rule, MOD_BIT_ALT, MOD_BIT_CTRL, MOD_BIT_SHIFT, MOD_BIT_WIN};
use crate::protocol::{HyperKeySpec, TriggerKind};

pub const MOD_BIT_HYPER: u32 = 0b0001_0000; // bit 4 = 16

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvState {
    Down,
    Up,
}

#[derive(Debug, Clone, Copy)]
pub struct KeyEvent {
    pub state: EvState,
    pub vk: u32,
    pub scan: u32,
    pub extended: bool,
    pub repeat: bool,
    /// True when the OS flags the event as injected (SendInput from another
    /// process, AltGr companion, etc.). Injected events pass through to Windows
    /// but must never re-enter matching as fresh physical input.
    pub injected: bool,
    pub at: Duration,
}

/// A completed gesture the hook must enqueue for Electron.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fired {
    pub id: String,
    pub generation: u64,
}

#[derive(Debug)]
struct Hold {
    rule: usize,
    deadline: Duration,
    fired: bool,
}

#[derive(Debug)]
struct TapOrHold {
    single_rules: Vec<usize>,
    hold_rule: usize,
    deadline: Duration,
    fired: bool,
}

#[derive(Debug)]
struct KeyGesture {
    taps: u32,
    first_tap_at: Option<Duration>,
    tap_reset_at: Option<Duration>,
    deferred_singles: Vec<usize>,
    singles_at: Option<Duration>,
    hold: Option<Hold>,
    tap_or_hold: Option<TapOrHold>,
    tth_armed: bool,
    tth_disarm_at: Option<Duration>,
    /// When Double AND Triple rules coexist on the same key, a 2nd tap alone is
    /// not decisive. The double is deferred to the tap-window close so a fast
    /// 3rd tap upgrades to triple (single/double/triple is one shared group).
    pending_double: Option<(usize, Duration)>,
}

impl Default for KeyGesture {
    fn default() -> Self {
        KeyGesture {
            taps: 0,
            first_tap_at: None,
            tap_reset_at: None,
            deferred_singles: Vec::new(),
            singles_at: None,
            hold: None,
            tap_or_hold: None,
            tth_armed: false,
            tth_disarm_at: None,
            pending_double: None,
        }
    }
}

impl KeyGesture {
    /// True while any state is pending (used to prune idle gestures).
    fn is_live(&self) -> bool {
        self.taps > 0
            || self.tap_reset_at.is_some()
            || !self.deferred_singles.is_empty()
            || self.singles_at.is_some()
            || self.hold.is_some()
            || self.tap_or_hold.is_some()
            || self.tth_armed
            || self.tth_disarm_at.is_some()
            || self.pending_double.is_some()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HyperState {
    Idle,
    Active,
}

pub struct TriggerEngine {
    rules: Vec<Rule>,
    pressed: HashMap<u32, Duration>, // vk -> when this press started
    /// Logical modifier mask used for rule matching. Always derived:
    /// `physical_mods | hyper_mods`. Never mutated directly.
    mods: u32,
    /// Modifiers held by REAL physical key events (excluding the Hyper
    /// physical key itself and AltGr companion Left Ctrl). This is the
    /// user's own input — KeyFlow must never release it.
    physical_mods: u32,
    /// VIRTUAL Hyper modifier mask used only for logical rule matching
    /// (`mods = physical_mods | hyper_mods`). KeyFlow never sends these bits as
    /// real Windows modifier key-downs — Hyper recognition is logical state,
    /// not SendInput. Cleared on Hyper UP / reset / reload / shutdown.
    hyper_mods: u32,
    gestures: HashMap<u32, KeyGesture>,
    cooldowns: HashMap<usize, Duration>,
    generation: u64,
    paused: bool,
    typing_idle_threshold: Duration,
    last_typing_down_at: Option<Duration>,
    last_typing_vk: Option<u32>,
    is_in_typing_burst: bool,
    hyper_spec: Option<HyperKeySpec>,
    hyper_state: HyperState,
    hyper_physical_down: bool,
    /// Only meaningful for NON-modifier Hyper keys (Caps Lock / F-keys / Apps):
    /// a tap-vs-chord state is acceptable there. Modifier Hyper keys never set
    /// this — Raycast parity means no Quick Press / tap on a modifier key.
    hyper_tap_pending: bool,
    hyper_repeat_count: u32,
    /// Cached foreground application. Scoped rules only match while it is the
    /// active application; None (unresolved) keeps every scoped rule inactive
    /// (fail-open). Updated by the hook on foreground change / reload.
    active_app: Option<ActiveApp>,
}

pub fn is_configured_hyper_physical_key(vk: u32, spec: &Option<HyperKeySpec>) -> bool {
    let Some(h) = spec.as_ref() else { return false; };
    if !h.enabled || h.vk == 0 {
        return false;
    }
    if h.vk == vk {
        return true;
    }
    match (h.vk, vk) {
        (0xA5, 0x12) | (0x12, 0xA5) => true,
        (0xA3, 0x11) | (0x11, 0xA3) => true,
        (0x5D, 0x5B) | (0x5B, 0x5D) => true,
        _ => false,
    }
}

/// True when the configured Hyper key is itself a Windows modifier key
/// (Ctrl / Alt / Shift / Win variants). Raycast parity: such a key activates
/// the Hyper modifier chord immediately and has NO Quick Press / tap behavior.
/// Non-modifier keys (Caps Lock, F1–F12, Apps, Scroll/Num Lock) may keep the
/// tap-vs-chord gesture model.
pub fn is_modifier_hyper_key(spec: &Option<HyperKeySpec>) -> bool {
    let Some(h) = spec.as_ref() else { return false; };
    h.enabled && crate::keymap::modifier_bit(h.vk) != 0
}

/// AltGr companion detection. Windows synthesizes a Left Ctrl (VK_LCONTROL)
/// around a physical Right Alt (VK_RMENU) press; that companion must never be
/// treated as a genuine physical modifier. It is either OS-injected (most
/// keyboards) or arrives while the Right-Alt Hyper key is already active.
fn is_altgr_companion_event(ev: KeyEvent, spec: &Option<HyperKeySpec>, hyper_physical_down: bool) -> bool {
    let Some(h) = spec.as_ref() else { return false; };
    if !h.enabled {
        return false;
    }
    // Only Right Alt (VK_RMENU) produces an AltGr companion Left Ctrl.
    if h.vk != 0xA5 {
        return false;
    }
    if ev.vk != 0xA2 {
        return false;
    }
    if ev.injected {
        // OS-generated AltGr companion: ignore outright.
        return true;
    }
    // Belt-and-suspenders for drivers that do not mark the companion injected:
    // the VIRTUAL Hyper mask already covers Ctrl, so a Left Ctrl while Hyper is
    // active can never be a fresh physical modifier for matching purposes.
    hyper_physical_down
}

impl TriggerEngine {
    pub fn new() -> Self {
        TriggerEngine {
            rules: Vec::new(),
            pressed: HashMap::new(),
            mods: 0,
            physical_mods: 0,
            hyper_mods: 0,
            gestures: HashMap::new(),
            cooldowns: HashMap::new(),
            generation: 0,
            paused: false,
            typing_idle_threshold: Duration::from_millis(crate::config::DEFAULT_TYPING_IDLE_MS as u64),
            last_typing_down_at: None,
            last_typing_vk: None,
            is_in_typing_burst: false,
            hyper_spec: None,
            hyper_state: HyperState::Idle,
            hyper_physical_down: false,
            hyper_tap_pending: false,
            hyper_repeat_count: 0,
            active_app: None,
        }
    }

    fn assert_hyper_invariants(&self) {
        match self.hyper_state {
            HyperState::Idle => {
                if self.hyper_physical_down || self.hyper_mods != 0 || self.hyper_tap_pending {
                    eprintln!(
                        "[hyper-invariant-error #{}] Idle state invalid: physicalDown={} tapPending={} hyperMods={:#b}",
                        self.generation, self.hyper_physical_down, self.hyper_tap_pending, self.hyper_mods
                    );
                }
            }
            HyperState::Active => {
                if !self.hyper_physical_down {
                    eprintln!("[hyper-invariant-error #{}] Active state invalid: physicalDown=false", self.generation);
                }
            }
        }
    }

    /// Set the idle threshold before printable keys can trigger standalone gestures.
    /// Duration::ZERO disables typing protection.
    pub fn set_typing_idle_threshold(&mut self, threshold: Duration) {
        self.typing_idle_threshold = threshold;
    }

    pub fn is_in_typing_burst(&self) -> bool {
        self.is_in_typing_burst
    }

    pub fn set_hyper_key(&mut self, spec: Option<HyperKeySpec>) {
        self.deactivate_hyper_virtual();
        self.hyper_spec = spec;
        self.hyper_state = HyperState::Idle;
        self.hyper_physical_down = false;
        self.hyper_tap_pending = false;
        self.hyper_mods = 0;
        self.hyper_repeat_count = 0;
        self.mods = self.physical_mods | self.hyper_mods;
        self.assert_hyper_invariants();
    }

    pub fn is_hyper_active(&self) -> bool {
        self.hyper_physical_down
    }

    pub fn is_hyper_key_suppressed(&self, vk: u32) -> bool {
        if let Some(spec) = &self.hyper_spec {
            spec.enabled && spec.suppress_original && is_configured_hyper_physical_key(vk, &self.hyper_spec)
        } else {
            false
        }
    }

    /// Activate the VIRTUAL Hyper modifier chord (Ctrl+Alt+Win + optional
    /// Shift) in `hyper_mods`. This is purely logical state for matching — it
    /// does NOT call SendInput. A modifier Hyper key activates it on physical
    /// down; a non-modifier Hyper key activates it lazily on the first
    /// secondary key. `[hyper-sendinput]` is never emitted from this path: if
    /// a future change reintroduces real modifier injection for Hyper
    /// recognition, the inject-count contract tests fail.
    fn activate_hyper_virtual(&mut self) {
        if self.hyper_mods != 0 {
            return;
        }
        let include_shift = self.hyper_spec.as_ref().map_or(false, |s| s.include_shift);
        self.hyper_mods = if include_shift {
            MOD_BIT_CTRL | MOD_BIT_ALT | MOD_BIT_WIN | MOD_BIT_SHIFT
        } else {
            MOD_BIT_CTRL | MOD_BIT_ALT | MOD_BIT_WIN
        };
        self.mods = self.physical_mods | self.hyper_mods;
        eprintln!("[hyper-logical] mods={}", crate::keymap::mods_display(self.hyper_mods));
    }

    /// Clear the VIRTUAL Hyper modifier mask. Never sends key-ups: Hyper never
    /// physically held Ctrl/Alt/Win, so there is nothing to release through
    /// SendInput. The user's genuinely-held physical modifiers are untouched.
    fn deactivate_hyper_virtual(&mut self) {
        if self.hyper_mods == 0 {
            return;
        }
        self.hyper_mods = 0;
        self.mods = self.physical_mods | self.hyper_mods;
        eprintln!("[hyper-logical] cleared");
    }

    /// Replace the compiled rule set; clear all gesture state.
    pub fn reload(&mut self, rules: Vec<Rule>) {
        self.rules = rules;
        self.reset();
    }

    /// Full state reset (pause, resume, reconfigure, bypass).
    pub fn reset(&mut self) {
        self.deactivate_hyper_virtual();
        self.pressed.clear();
        self.physical_mods = 0;
        self.mods = 0;
        self.gestures.clear();
        self.cooldowns.clear();
        self.last_typing_down_at = None;
        self.last_typing_vk = None;
        self.is_in_typing_burst = false;
        self.hyper_state = HyperState::Idle;
        self.hyper_physical_down = false;
        self.hyper_tap_pending = false;
        self.hyper_mods = 0;
        self.hyper_repeat_count = 0;
        self.assert_hyper_invariants();
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
        if paused {
            self.reset();
        }
    }

    /// Debug/diagnostic: whether the engine is currently paused.
    pub fn paused(&self) -> bool {
        self.paused
    }

    /// Debug/diagnostic: the set of vks currently considered pressed by the
    /// engine (for consume-after-up tracking).
    pub fn pressed_set(&self) -> Vec<u32> {
        self.pressed.keys().copied().collect()
    }

    /// Update the cached foreground application. On a real change, clears
    /// gesture state for keys that have app-scoped rules so a tap sequence
    /// never carries across into another application. Global gesture state is
    /// untouched (an Alt+Tab mid double-tap must not cancel global gestures).
    pub fn set_active_app(&mut self, app: Option<ActiveApp>) {
        if self.active_app == app {
            return;
        }
        let changed_keys: Vec<u32> = self
            .rules
            .iter()
            .filter(|r| r.app_scope.is_some())
            .map(|r| r.vk)
            .collect();
        self.active_app = app;
        if !changed_keys.is_empty() {
            for vk in changed_keys {
                self.gestures.remove(&vk);
            }
        }
    }

    pub fn active_app(&self) -> Option<&ActiveApp> {
        self.active_app.as_ref()
    }

    /// The single nearest deadline the hook must SetTimer for, if any.
    pub fn next_deadline(&self) -> Option<Duration> {
        let mut best: Option<Duration> = None;
        for g in self.gestures.values() {
            for d in [g.tap_reset_at, g.singles_at, g.tth_disarm_at] {
                if let Some(d) = d {
                    best = Some(best.map_or(d, |b| b.min(d)));
                }
            }
            if let Some((_, fire_at)) = g.pending_double {
                best = Some(best.map_or(fire_at, |b| b.min(fire_at)));
            }
            if let Some(h) = &g.hold {
                best = Some(best.map_or(h.deadline, |b| b.min(h.deadline)));
            }
            if let Some(t) = &g.tap_or_hold {
                best = Some(best.map_or(t.deadline, |b| b.min(t.deadline)));
            }
        }
        best
    }

    /// Process a raw physical key event. Returns completed gestures.
    pub fn key_event(&mut self, ev: KeyEvent) -> Vec<Fired> {
        if self.paused {
            return Vec::new();
        }
        // Update modifier state first so matching sees the right mask.
        // Physical modifier state and Hyper-owned state are tracked separately:
        // `mods` is always `physical_mods | hyper_mods`.
        let mut fired = self.run_deadlines(ev.at);
        let bit = crate::keymap::modifier_bit(ev.vk);
        let is_hyper_key = is_configured_hyper_physical_key(ev.vk, &self.hyper_spec);
        let is_altgr = is_altgr_companion_event(ev, &self.hyper_spec, self.hyper_physical_down);

        if is_hyper_key {
            // The Hyper physical key never contributes its own modifier bit;
            // Hyper satisfies its chord via the VIRTUAL modifier mask instead.
            if bit != 0 {
                self.physical_mods &= !bit;
            }
        } else if is_altgr {
            // AltGr companion Left Ctrl: never poisons physical modifier state.
            eprintln!("[altgr] companion LCtrl ignored vk={} injected={}", ev.vk, ev.injected);
        } else if bit != 0 {
            match ev.state {
                EvState::Down => self.physical_mods |= bit,
                EvState::Up => self.physical_mods &= !bit,
            }
        }
        self.mods = self.physical_mods | self.hyper_mods;

        match ev.state {
            EvState::Down => fired.extend(self.on_down(ev)),
            EvState::Up => fired.extend(self.on_up(ev)),
        }
        self.mods = self.physical_mods | self.hyper_mods;
        fired
    }

    /// Timer tick: resolve all deadlines that have elapsed.
    pub fn timer_event(&mut self, at: Duration) -> Vec<Fired> {
        if self.paused {
            return Vec::new();
        }
        self.run_deadlines(at)
    }

    fn on_down(&mut self, ev: KeyEvent) -> Vec<Fired> {
        // ── AltGr Synthetic Left Ctrl Neutralization ─────────────────────────
        if is_altgr_companion_event(ev, &self.hyper_spec, self.hyper_physical_down) {
            return Vec::new();
        }

        // ── Hyper Key State & Repeat Filter ────────────────────────────────
        if is_configured_hyper_physical_key(ev.vk, &self.hyper_spec) {
            if self.hyper_physical_down {
                self.hyper_repeat_count += 1;
                if self.hyper_repeat_count == 1 || self.hyper_repeat_count % 10 == 0 {
                    eprintln!(
                        "[hyper-state #{}] repeatedHyperDown ignored=true count={}",
                        self.generation, self.hyper_repeat_count
                    );
                }
                return Vec::new();
            }
            self.generation += 1;
            self.hyper_physical_down = true;
            self.hyper_state = HyperState::Active;
            self.hyper_repeat_count = 0;
            eprintln!("[hyper-physical] hyperDown vk={}", ev.vk);
            eprintln!("[hyper-state] Idle -> Active");
            if is_modifier_hyper_key(&self.hyper_spec) {
                // Raycast parity: a modifier Hyper key activates the VIRTUAL
                // Ctrl+Alt+Win mask immediately on physical down. No tap-vs-
                // chord state machine, and no SendInput.
                self.hyper_tap_pending = false;
                self.activate_hyper_virtual();
            } else {
                // Non-modifier Hyper key (Caps Lock / F-keys / Apps): the
                // tap-vs-chord gesture model is acceptable here. The virtual
                // mask is established lazily on the first secondary key.
                self.hyper_tap_pending = true;
                eprintln!("[hyper-state] reason=non-modifier-hyper-down (tap pending)");
            }
            self.assert_hyper_invariants();

            // Track multi-tap gestures (Double / Triple tap) on the physical Hyper key
            let matching = self.matching_rules(ev);
            let multi: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| matches!(self.rules[ri].kind, TriggerKind::Double | TriggerKind::Triple))
                .collect();
            if !multi.is_empty() {
                let mut pending: Vec<(usize, Duration)> = Vec::new();
                {
                    let gesture = self.gestures.entry(ev.vk).or_default();
                    let window = multi
                        .iter()
                        .map(|&ri| self.rules[ri].tap_interval)
                        .min()
                        .unwrap_or(crate::config::DEFAULT_TAP_INTERVAL_MS);
                    let window = Duration::from_millis(window as u64);
                    let is_fresh = gesture.taps == 0 || gesture.first_tap_at.map_or(true, |t| ev.at - t > window);
                    if is_fresh {
                        gesture.taps = 1;
                        gesture.first_tap_at = Some(ev.at);
                        gesture.pending_double = None;
                    } else {
                        gesture.taps += 1;
                    }
                    gesture.tap_reset_at = Some(gesture.first_tap_at.unwrap() + window);
                    let has_triple = multi.iter().any(|&ri| self.rules[ri].kind == TriggerKind::Triple);
                    if has_triple && gesture.taps < 3 {
                        if let Some(&ri) = multi.iter().find(|&&ri| self.rules[ri].kind == TriggerKind::Double) {
                            if gesture.taps >= 2 {
                                gesture.pending_double =
                                    Some((ri, gesture.first_tap_at.unwrap_or(ev.at) + window));
                                gesture.deferred_singles.clear();
                                gesture.singles_at = None;
                            }
                        }
                    } else {
                        for &ri in &multi {
                            let target = if self.rules[ri].kind == TriggerKind::Triple { 3 } else { 2 };
                            if gesture.taps == target {
                                let within = gesture.first_tap_at.map_or(true, |t| ev.at - t <= window);
                                if within {
                                    pending.push((ri, ev.at));
                                    gesture.taps = 0;
                                    gesture.first_tap_at = None;
                                    gesture.tap_reset_at = None;
                                    gesture.deferred_singles.clear();
                                    gesture.singles_at = None;
                                    gesture.pending_double = None;
                                    break;
                                }
                            }
                        }
                    }
                }
                if !pending.is_empty() {
                    return self.apply_pending(pending);
                }
            }

            return Vec::new();
        }

        if self.pressed.contains_key(&ev.vk) {
            // Auto-repeat or a stuck key — never a fresh gesture.
            return Vec::new();
        }
        self.pressed.insert(ev.vk, ev.at);

        if self.hyper_physical_down {
            // Secondary key while Hyper is active. No new state transition and
            // no SendInput: the virtual mask is already active (modifier Hyper
            // keys activate on Hyper DOWN; non-modifier Hyper keys activate
            // here lazily once).
            eprintln!("[hyper-secondary] down vk={}", ev.vk);
            if self.hyper_tap_pending {
                self.hyper_tap_pending = false;
                self.activate_hyper_virtual();
                eprintln!("[hyper-chord] tapCancelled=true secondary vk={}", ev.vk);
            }
            if let Some(hyper) = &self.hyper_spec {
                self.gestures.remove(&hyper.vk);
            }
            self.assert_hyper_invariants();
        }

        // ── Typing Burst Model ──────────────────────────────────────────────
        let is_printable = crate::keymap::is_printable_vk(ev.vk)
            && (self.mods & !crate::keymap::modifier_bit(ev.vk) & !MOD_BIT_HYPER == 0);

        if is_printable && self.typing_idle_threshold > Duration::ZERO {
            let time_since_last = self.last_typing_down_at.map(|t| ev.at.saturating_sub(t));
            if let Some(elapsed) = time_since_last {
                if elapsed <= self.typing_idle_threshold {
                    if self.last_typing_vk != Some(ev.vk) {
                        self.is_in_typing_burst = true;
                        self.gestures.clear();
                    }
                } else {
                    self.is_in_typing_burst = false;
                }
            } else {
                self.is_in_typing_burst = false;
            }
            self.last_typing_down_at = Some(ev.at);
            self.last_typing_vk = Some(ev.vk);
        }

        let matching = self.matching_rules(ev);
        if matching.is_empty() {
            return Vec::new();
        }

        let suppress_gestures = is_printable && self.is_in_typing_burst && self.typing_idle_threshold > Duration::ZERO;

        let mut pending: Vec<(usize, Duration)> = Vec::new();
        {
            let gesture = self.gestures.entry(ev.vk).or_default();

            let tth_rules: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| self.rules[ri].kind == TriggerKind::TapThenHold)
                .collect();
            if !tth_rules.is_empty() && !suppress_gestures {
                if gesture.tth_armed {
                    gesture.tth_armed = false;
                    gesture.tth_disarm_at = None;
                    if let Some(&ri) = tth_rules.first() {
                        if gesture.hold.is_none() {
                            let d = self.rules[ri].hold_duration as u64;
                            gesture.hold = Some(Hold {
                                rule: ri,
                                deadline: ev.at + Duration::from_millis(d),
                                fired: false,
                            });
                        }
                    }
                }
            }

            let multi: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| matches!(self.rules[ri].kind, TriggerKind::Double | TriggerKind::Triple))
                .collect();
            let has_multi = !multi.is_empty();
            if !multi.is_empty() {
                if suppress_gestures {
                    gesture.taps = 0;
                    gesture.first_tap_at = None;
                    gesture.tap_reset_at = None;
                    gesture.pending_double = None;
                } else {
                    let window = multi
                        .iter()
                        .map(|&ri| self.rules[ri].tap_interval)
                        .min()
                        .unwrap_or(crate::config::DEFAULT_TAP_INTERVAL_MS);
                    let window = Duration::from_millis(window as u64);
                    let is_fresh = gesture.taps == 0 || gesture.first_tap_at.map_or(true, |t| ev.at - t > window);
                    if is_fresh {
                        gesture.taps = 1;
                        gesture.first_tap_at = Some(ev.at);
                        gesture.pending_double = None;
                    } else {
                        gesture.taps += 1;
                    }
                    gesture.tap_reset_at = Some(gesture.first_tap_at.unwrap() + window);
                    let has_triple = multi.iter().any(|&ri| self.rules[ri].kind == TriggerKind::Triple);
                    if has_triple && gesture.taps < 3 {
                        // Double + Triple on the same key: a 2nd tap is not
                        // decisive yet. Defer the double to the window close so
                        // a fast 3rd tap upgrades to triple; the deferred
                        // single is suppressed too (the user clearly intends a
                        // multi-tap).
                        if let Some(&ri) = multi.iter().find(|&&ri| self.rules[ri].kind == TriggerKind::Double) {
                            if gesture.taps >= 2 {
                                gesture.pending_double =
                                    Some((ri, gesture.first_tap_at.unwrap_or(ev.at) + window));
                                gesture.deferred_singles.clear();
                                gesture.singles_at = None;
                            }
                        }
                    } else {
                        // Exact-tap match only: with a triple present, the 3rd
                        // tap fires the triple (never the double); without a
                        // triple the 2nd tap fires the double.
                        for &ri in &multi {
                            let target = if self.rules[ri].kind == TriggerKind::Triple { 3 } else { 2 };
                            if gesture.taps == target {
                                let within = gesture.first_tap_at.map_or(true, |t| ev.at - t <= window);
                                if within {
                                    pending.push((ri, ev.at));
                                    gesture.taps = 0;
                                    gesture.first_tap_at = None;
                                    gesture.tap_reset_at = None;
                                    gesture.deferred_singles.clear();
                                    gesture.singles_at = None;
                                    gesture.pending_double = None;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            let singles: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| matches!(self.rules[ri].kind, TriggerKind::Single | TriggerKind::Combo))
                .collect();
            let hold_rules: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| self.rules[ri].kind == TriggerKind::Hold)
                .collect();

            if !singles.is_empty() {
                for &ri in &singles {
                    let is_standalone_printable_single = is_printable && self.rules[ri].required_mods == 0;
                    if is_standalone_printable_single && suppress_gestures {
                        continue;
                    }
                    if has_multi && !suppress_gestures {
                        if gesture.deferred_singles.is_empty() {
                            let window = multi.iter().map(|&ri| self.rules[ri].tap_interval).min().unwrap_or(crate::config::DEFAULT_TAP_INTERVAL_MS);
                            gesture.deferred_singles.push(ri);
                            gesture.singles_at = Some(ev.at + Duration::from_millis(window as u64));
                        }
                    } else {
                        pending.push((ri, ev.at));
                    }
                }
            }

            if let Some(&hold_ri) = hold_rules.first() {
                if !suppress_gestures {
                    if !singles.is_empty() {
                        if gesture.tap_or_hold.is_none() {
                            let d = self.rules[hold_ri].hold_duration as u64;
                            gesture.tap_or_hold = Some(TapOrHold {
                                single_rules: singles,
                                hold_rule: hold_ri,
                                deadline: ev.at + Duration::from_millis(d),
                                fired: false,
                            });
                        }
                    } else if gesture.hold.is_none() {
                        let d = self.rules[hold_ri].hold_duration as u64;
                        gesture.hold = Some(Hold {
                            rule: hold_ri,
                            deadline: ev.at + Duration::from_millis(d),
                            fired: false,
                        });
                    }
                }
            }
        }
        self.apply_pending(pending)
    }

    fn on_up(&mut self, ev: KeyEvent) -> Vec<Fired> {
        let press_start = self.pressed.remove(&ev.vk);

        // Hyper key release handling
        if is_configured_hyper_physical_key(ev.vk, &self.hyper_spec) {
            if !self.hyper_physical_down {
                // Stray hyper UP (post-reset / post-reload): nothing to clean.
                return Vec::new();
            }
            let mut pending = Vec::new();
            self.generation += 1;
            eprintln!("[hyper-physical] hyperUp vk={}", ev.vk);

            if is_modifier_hyper_key(&self.hyper_spec) {
                // Raycast parity: clear the VIRTUAL mask and go Idle. No tap
                // action, no __keyflow_hyper_tap__, and nothing to release via
                // SendInput because Hyper never injected anything.
                self.deactivate_hyper_virtual();
                eprintln!("[hyper-state] Active -> Idle reason=modifier-hyper-up (virtual mask cleared, no tap)");
            } else if self.hyper_tap_pending {
                // Non-modifier Hyper key released alone = Quick Press / tap.
                self.hyper_tap_pending = false;
                eprintln!("[hyper-state] Active -> Idle reason=non-modifier-hyper-up (TAP-DETECTED)");
                let matching = self.matching_rules(ev);
                let has_multi = matching.iter().any(|&ri| matches!(self.rules[ri].kind, TriggerKind::Double | TriggerKind::Triple));
                if !has_multi {
                    if let Some(hyper) = &self.hyper_spec {
                        if let Some(act_id) = &hyper.tap_action_id {
                            if !act_id.is_empty() && act_id != "none" {
                                pending.push(Fired {
                                    id: act_id.clone(),
                                    generation: self.generation,
                                });
                            }
                        }
                    }
                }
            } else {
                // Non-modifier Hyper key released after a chord: clear the
                // virtual mask (nothing physically injected to release).
                self.deactivate_hyper_virtual();
                eprintln!("[hyper-state] Active -> Idle reason=non-modifier-hyper-up (chord, virtual mask cleared)");
            }
            self.hyper_state = HyperState::Idle;
            self.hyper_physical_down = false;
            self.hyper_tap_pending = false;
            self.hyper_repeat_count = 0;
            self.mods = self.physical_mods | self.hyper_mods;
            self.assert_hyper_invariants();

            return pending;
        }

        if self.hyper_physical_down {
            eprintln!("[hyper-secondary] up vk={}", ev.vk);
        }

        let mut pending: Vec<(usize, Duration)> = Vec::new();
        {
            let Some(gesture) = self.gestures.get_mut(&ev.vk) else {
                return Vec::new();
            };
            if let Some(t) = gesture.tap_or_hold.take() {
                if !t.fired {
                    pending.extend(t.single_rules.into_iter().map(|ri| (ri, ev.at)));
                }
                return self.apply_pending(pending);
            }
            if let Some(h) = gesture.hold.as_mut() {
                if !h.fired {
                    gesture.hold = None;
                }
                return Vec::new();
            }
            let tth_ri = self.rules.iter().position(|r| r.kind == TriggerKind::TapThenHold && matches_key(r, ev));
            if let Some(ri) = tth_ri {
                let quick = press_start.map_or(true, |start| ev.at - start < Duration::from_millis(self.rules[ri].tap_interval as u64));
                if quick && gesture.hold.is_none() {
                    gesture.tth_armed = true;
                    let window = Duration::from_millis(self.rules[ri].tap_interval as u64);
                    gesture.tth_disarm_at = Some(ev.at + window);
                }
            }
        }
        self.apply_pending(pending)
    }

    fn run_deadlines(&mut self, at: Duration) -> Vec<Fired> {
        let mut pending: Vec<(usize, Duration)> = Vec::new();
        let mut clear = Vec::new();
        for (&vk, g) in self.gestures.iter_mut() {
            if let Some(t) = g.tap_reset_at {
                if t <= at {
                    g.taps = 0;
                    g.first_tap_at = None;
                    g.tap_reset_at = None;
                }
            }
            if let Some((ri, fire_at)) = g.pending_double {
                if fire_at <= at {
                    g.pending_double = None;
                    // A 3rd tap inside the window upgrades to triple (and the
                    // triple-firing branch clears pending_double), so reaching
                    // this deadline means no upgrade arrived: fire the double.
                    pending.push((ri, at));
                }
            }
            if let Some(s) = g.singles_at {
                if s <= at {
                    let singles = std::mem::take(&mut g.deferred_singles);
                    g.singles_at = None;
                    pending.extend(singles.into_iter().map(|ri| (ri, at)));
                }
            }
            if let Some(d) = g.tth_disarm_at {
                if d <= at {
                    g.tth_armed = false;
                    g.tth_disarm_at = None;
                }
            }
            if let Some(h) = g.hold.as_mut() {
                if !h.fired && h.deadline <= at {
                    h.fired = true;
                    pending.push((h.rule, at));
                }
            }
            if let Some(t) = g.tap_or_hold.as_mut() {
                if !t.fired && t.deadline <= at {
                    t.fired = true;
                    pending.push((t.hold_rule, at));
                }
            }
            if !g.is_live() {
                clear.push(vk);
            }
        }
        for vk in clear {
            self.gestures.remove(&vk);
        }
        self.apply_pending(pending)
    }

    fn apply_pending(&mut self, pending: Vec<(usize, Duration)>) -> Vec<Fired> {
        let mut fired = Vec::new();
        for (ri, at) in pending {
            if let Some(f) = self.try_fire(ri, at) {
                fired.push(f);
            }
        }
        fired
    }

    fn fire(&mut self, ri: usize, at: Duration) -> Fired {
        let rule = &self.rules[ri];
        self.generation += 1;
        let fired = Fired { id: rule.id.clone(), generation: self.generation };
        if self.hyper_physical_down {
            eprintln!("[hyper-trigger] emitted id={}", fired.id);
        }
        let cd = Duration::from_millis(rule.cooldown as u64);
        if !cd.is_zero() {
            self.cooldowns.insert(ri, at + cd);
        }
        fired
    }

    fn try_fire(&mut self, ri: usize, at: Duration) -> Option<Fired> {
        let cd = self.cooldowns.get(&ri).copied();
        if let Some(until) = cd {
            if until > at {
                return None;
            }
        }
        Some(self.fire(ri, at))
    }

    fn matching_rules(&self, ev: KeyEvent) -> Vec<usize> {
        let active = self.active_app.as_ref();
        let is_hyper = is_configured_hyper_physical_key(ev.vk, &self.hyper_spec);
        let self_bit = crate::keymap::modifier_bit(ev.vk);
        let effective_mods = if is_hyper {
            (self.mods & !self.hyper_mods) & !self_bit
        } else if self_bit != 0 {
            self.mods & !self_bit
        } else {
            self.mods
        };
        let matched: Vec<usize> = self.rules
            .iter()
            .enumerate()
            .filter(|(_, r)| matches_key(r, ev) && r.required_mods == effective_mods && r.applies_in(active))
            .map(|(i, _)| i)
            .collect();

        // App-specific wins over Everywhere for the SAME (key, trigger kind,
        // mods). When a scoped rule matched, drop the global rule of the same
        // signature so the two never fire together. Different kinds or
        // different apps coexist.
        let scoped_signatures: Vec<(u32, TriggerKind, u32)> = matched
            .iter()
            .filter(|&&ri| self.rules[ri].app_scope.is_some())
            .map(|&ri| (self.rules[ri].vk, self.rules[ri].kind, self.rules[ri].required_mods))
            .collect();
        if scoped_signatures.is_empty() {
            if self.hyper_physical_down && !matched.is_empty() {
                self.emit_hyper_match(&matched);
            }
            return matched;
        }
        let shadowed: Vec<usize> = matched
            .into_iter()
            .filter(|&ri| {
                let r = &self.rules[ri];
                if r.app_scope.is_some() {
                    return true;
                }
                !scoped_signatures.contains(&(r.vk, r.kind, r.required_mods))
            })
            .collect();
        if self.hyper_physical_down && !shadowed.is_empty() {
            self.emit_hyper_match(&shadowed);
        }
        shadowed
    }

    fn emit_hyper_match(&self, matched: &[usize]) {
        for &ri in matched {
            eprintln!(
                "[hyper-match] candidate id={} vk={} requiredMods={} currentMods={} matched=true",
                self.rules[ri].id,
                self.rules[ri].vk,
                crate::keymap::mods_display(self.rules[ri].required_mods),
                crate::keymap::mods_display(self.mods)
            );
        }
    }
}

fn matches_key(rule: &Rule, ev: KeyEvent) -> bool {
    if rule.vk != ev.vk {
        return false;
    }
    if rule.special_scan != 0 {
        if ev.scan != 0 && rule.special_scan != ev.scan {
            return false;
        }
        if rule.extended != ev.extended {
            return false;
        }
    }
    true
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_TAP_INTERVAL_MS;

    fn rule(id: &str, vk: u32, kind: TriggerKind) -> Rule {
        rule_with(id, vk, kind, 0, false, 0)
    }

    fn rule_with_mods(id: &str, vk: u32, kind: TriggerKind, mods: u32) -> Rule {
        rule_with(id, vk, kind, 0, false, mods)
    }

    fn rule_with(id: &str, vk: u32, kind: TriggerKind, scan: u32, extended: bool, required_mods: u32) -> Rule {
        Rule {
            id: id.to_string(),
            vk,
            special_scan: scan,
            extended,
            kind,
            tap_interval: DEFAULT_TAP_INTERVAL_MS,
            hold_duration: 400,
            cooldown: 0,
            required_mods,
            app_scope: None,
        }
    }

    fn down(engine: &mut TriggerEngine, vk: u32, at: u64) -> Vec<Fired> {
        down_inj(engine, vk, false, at)
    }

    fn up(engine: &mut TriggerEngine, vk: u32, at: u64) -> Vec<Fired> {
        up_inj(engine, vk, false, at)
    }

    fn down_inj(engine: &mut TriggerEngine, vk: u32, injected: bool, at: u64) -> Vec<Fired> {
        engine.key_event(KeyEvent {
            state: EvState::Down,
            vk,
            scan: 0,
            extended: false,
            repeat: false,
            injected,
            at: Duration::from_millis(at),
        })
    }

    fn up_inj(engine: &mut TriggerEngine, vk: u32, injected: bool, at: u64) -> Vec<Fired> {
        engine.key_event(KeyEvent {
            state: EvState::Up,
            vk,
            scan: 0,
            extended: false,
            repeat: false,
            injected,
            at: Duration::from_millis(at),
        })
    }

    fn tap(engine: &mut TriggerEngine, vk: u32, at: u64) -> Vec<Fired> {
        let mut f = down(engine, vk, at);
        f.extend(up(engine, vk, at + 30));
        f
    }

    fn helpers() -> (TriggerEngine, u64) {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("caps", 0x14, TriggerKind::Single), rule("f-double", 0x46, TriggerKind::Double)]);
        (e, 0)
    }

    fn modifier_hyper(spec_vk: u32) -> HyperKeySpec {
        HyperKeySpec {
            enabled: true,
            vk: spec_vk,
            include_shift: false,
            suppress_original: true,
            // Modifier Hyper keys never carry a tap action on the wire.
            tap_action_id: None,
        }
    }

    const HYPER_MODS: u32 = MOD_BIT_CTRL | MOD_BIT_ALT | MOD_BIT_WIN;

    #[test]
    fn single_fires_on_down() {
        let (mut e, mut t) = helpers();
        let fired = down(&mut e, 0x14, t);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "caps");
        assert_eq!(fired[0].generation, 1);
        up(&mut e, 0x14, t + 1);
        t += 1000;
        let fired = down(&mut e, 0x14, t);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].generation, 2);
    }

    #[test]
    fn double_fires_on_second_down_within_window() {
        let (mut e, mut t) = helpers();
        down(&mut e, 0x46, t);
        up(&mut e, 0x46, t + 1);
        t += 100;
        let fired = down(&mut e, 0x46, t);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "f-double");
    }

    #[test]
    fn generic_triggers_work_across_multiple_keys() {
        let mut e = TriggerEngine::new();
        // Configure generic triggers on G, K, P, H
        e.reload(vec![
            rule("g-double", 0x47, TriggerKind::Double), // G
            rule("k-single", 0x4B, TriggerKind::Single), // K
            rule("p-single", 0x50, TriggerKind::Single), // P
            rule("h-hold", 0x48, TriggerKind::Hold),     // H
        ]);

        // G Double tap
        let mut f = down(&mut e, 0x47, 0);
        f.extend(up(&mut e, 0x47, 30));
        f.extend(down(&mut e, 0x47, 120));
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "g-double");

        // K Single tap after idle
        let f2 = tap(&mut e, 0x4B, 800);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "k-single");

        // H Hold
        down(&mut e, 0x48, 1500);
        let f3 = e.timer_event(Duration::from_millis(2000));
        assert_eq!(f3.len(), 1);
        assert_eq!(f3[0].id, "h-hold");
    }

    // ── Raycast-Parity Modifier Hyper Key Tests ──────────────────────────────
    //
    // A modifier Hyper key (Right Alt / any Ctrl/Alt/Shift/Win variant)
    // activates the VIRTUAL Ctrl+Alt+Win mask immediately on physical down and
    // has NO Quick Press / tap behavior. Critically, Hyper recognition NEVER
    // calls SendInput — `test_inject_count()` must stay ZERO for the whole
    // modifier-Hyper contract. These tests model exactly that.

    #[test]
    fn modifier_hyper_down_is_virtual() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5))); // Right Alt

        // Right Alt DOWN -> VIRTUAL Ctrl+Alt+Win logical state immediately active.
        let f0 = down(&mut e, 0xA5, 0);
        assert!(f0.is_empty());
        assert!(e.is_hyper_active());
        assert_eq!(e.hyper_state, HyperState::Active);
        assert_eq!(e.mods, HYPER_MODS, "logical Ctrl+Alt+Win active immediately");
        assert_eq!(
            crate::inject::test_inject_count(),
            0,
            "ZERO SendInput modifier events for Hyper recognition"
        );

        // Release alone -> NO tap action, virtual mask cleared, back to Idle.
        let f_up = up(&mut e, 0xA5, 50);
        assert!(f_up.is_empty(), "modifier Hyper key must never fire a tap action");
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
        assert_eq!(crate::inject::test_inject_count(), 0, "release never sends key-ups either");
    }

    #[test]
    fn modifier_hyper_repeat_down() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        down(&mut e, 0xA5, 0);
        assert_eq!(crate::inject::test_inject_count(), 0, "no SendInput on activation");

        // 30 Windows key-repeat downs while held must be fully ignored.
        for i in 1..=30 {
            let f = down(&mut e, 0xA5, i * 20);
            assert!(f.is_empty(), "repeat down {} must be ignored", i);
        }
        assert_eq!(crate::inject::test_inject_count(), 0, "repeats must not inject");
        assert_eq!(e.hyper_state, HyperState::Active);
        assert_eq!(e.mods, HYPER_MODS, "state unchanged by repeats");

        // A chord still works after all the repeats.
        let fy = down(&mut e, 0x59, 900);
        assert_eq!(fy.len(), 1);
        assert_eq!(fy[0].id, "sc-hyper-y");
        up(&mut e, 0x59, 920);
        let f_up = up(&mut e, 0xA5, 960);
        assert!(f_up.is_empty());
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
        assert_eq!(crate::inject::test_inject_count(), 0, "no SendInput anywhere in the cycle");
    }

    #[test]
    fn modifier_hyper_y_matches_virtual_mods() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        down(&mut e, 0xA5, 0);
        assert_eq!(e.mods, HYPER_MODS);

        // Hyper + Y fires exactly one shortcut through the normal matcher.
        let f1 = down(&mut e, 0x59, 50);
        assert_eq!(f1.len(), 1, "exactly one Hyper+Y");
        assert_eq!(f1[0].id, "sc-hyper-y");
        let f2 = up(&mut e, 0x59, 80);
        assert!(f2.is_empty());
        assert_eq!(e.mods, HYPER_MODS, "Hyper stays active while Right Alt held");

        let f3 = up(&mut e, 0xA5, 120);
        assert!(f3.is_empty(), "no __keyflow_hyper_tap__ for modifier Hyper");
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
        assert_eq!(crate::inject::test_inject_count(), 0, "ZERO SendInput across the whole Hyper+Y");
    }

    #[test]
    fn modifier_hyper_t_matches_virtual_mods() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_t = rule_with_mods("sc-hyper-t", 0x54, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_t]);

        down(&mut e, 0xA5, 0);
        assert_eq!(e.mods, HYPER_MODS);

        let f1 = down(&mut e, 0x54, 50);
        assert_eq!(f1.len(), 1, "exactly one Hyper+T");
        assert_eq!(f1[0].id, "sc-hyper-t");
        up(&mut e, 0x54, 80);
        assert_eq!(e.mods, HYPER_MODS, "Hyper stays active while Right Alt held");

        let f2 = up(&mut e, 0xA5, 120);
        assert!(f2.is_empty(), "no tap action for modifier Hyper");
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
        assert_eq!(crate::inject::test_inject_count(), 0, "ZERO SendInput across the whole Hyper+T");
    }

    #[test]
    fn modifier_hyper_multiple_secondary_keys_same_hold() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        let hyper_t = rule_with_mods("sc-hyper-t", 0x54, TriggerKind::Single, HYPER_MODS);
        let hyper_n = rule_with_mods("sc-hyper-n", 0x4E, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y, hyper_t, hyper_n]);

        down(&mut e, 0xA5, 0);
        assert_eq!(e.mods, HYPER_MODS);

        for (vk, id) in [(0x59, "sc-hyper-y"), (0x54, "sc-hyper-t"), (0x4E, "sc-hyper-n")] {
            let f = down(&mut e, vk, 50);
            assert_eq!(f.len(), 1, "{} must fire", id);
            assert_eq!(f[0].id, id);
            up(&mut e, vk, 80);
            assert_eq!(e.hyper_state, HyperState::Active, "Hyper stays active for entire physical hold");
            assert_eq!(e.mods, HYPER_MODS, "no modifier churn on secondary key up");
        }

        let f_up = up(&mut e, 0xA5, 200);
        assert!(f_up.is_empty());
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
    }

    #[test]
    fn modifier_hyper_unmatched_recovery() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        // Right Alt DOWN, Q (unassigned) down/up, Right Alt UP.
        down(&mut e, 0xA5, 0);
        let fq = down(&mut e, 0x51, 50);
        assert!(fq.is_empty(), "unmatched Q must not trigger");
        up(&mut e, 0x51, 80);
        assert_eq!(e.mods, HYPER_MODS);
        let f_alt_up = up(&mut e, 0xA5, 120);
        assert!(f_alt_up.is_empty());
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);

        // Immediately after, Right Alt + Y must work with zero residue.
        down(&mut e, 0xA5, 200);
        let fy = down(&mut e, 0x59, 230);
        assert_eq!(fy.len(), 1, "Y must work immediately after unmatched chord");
        assert_eq!(fy[0].id, "sc-hyper-y");
        up(&mut e, 0x59, 260);
        let f_up = up(&mut e, 0xA5, 300);
        assert!(f_up.is_empty());
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
    }

    #[test]
    fn modifier_hyper_100_y_cycles() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        for cycle in 0..100 {
            let base = cycle * 80;
            down(&mut e, 0xA5, base);
            let f = down(&mut e, 0x59, base + 20);
            assert_eq!(f.len(), 1, "cycle {} Hyper+Y failed", cycle);
            assert_eq!(f[0].id, "sc-hyper-y");
            up(&mut e, 0x59, base + 40);
            let f_up = up(&mut e, 0xA5, base + 60);
            assert!(f_up.is_empty(), "cycle {} tap must not fire", cycle);
            assert_eq!(e.hyper_state, HyperState::Idle, "cycle {} not idle", cycle);
            assert_eq!(e.mods, 0, "cycle {} stuck modifiers", cycle);
        }
        assert_eq!(
            crate::inject::test_inject_count(),
            0,
            "100 Hyper+Y cycles must never call SendInput"
        );
    }

    #[test]
    fn modifier_hyper_mixed_100_cycles() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        let hyper_t = rule_with_mods("sc-hyper-t", 0x54, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y, hyper_t]);

        for cycle in 0..100 {
            let base = cycle * 100;
            down(&mut e, 0xA5, base);
            match cycle % 3 {
                0 => {
                    let f = down(&mut e, 0x59, base + 20);
                    assert_eq!(f.len(), 1);
                    assert_eq!(f[0].id, "sc-hyper-y");
                    up(&mut e, 0x59, base + 40);
                }
                1 => {
                    let f = down(&mut e, 0x54, base + 20);
                    assert_eq!(f.len(), 1);
                    assert_eq!(f[0].id, "sc-hyper-t");
                    up(&mut e, 0x54, base + 40);
                }
                _ => {
                    let f = down(&mut e, 0x51, base + 20); // unassigned Q
                    assert!(f.is_empty(), "cycle {} unmatched Q must not trigger", cycle);
                    up(&mut e, 0x51, base + 40);
                }
            }
            let f_up = up(&mut e, 0xA5, base + 60);
            assert!(f_up.is_empty());
            assert_eq!(e.hyper_state, HyperState::Idle, "cycle {} corruption", cycle);
            assert_eq!(e.mods, 0, "cycle {} stuck modifiers", cycle);
        }
    }

    #[test]
    fn modifier_hyper_physical_modifier_ownership() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        // User is physically holding Left Ctrl before Hyper starts.
        down(&mut e, 0xA2, 0);
        assert_eq!(e.mods, MOD_BIT_CTRL);

        // Right Alt Hyper down/up must NOT release the user's physical Ctrl.
        down(&mut e, 0xA5, 50);
        assert_eq!(e.mods, HYPER_MODS, "hyper ctrl|alt|win + physical ctrl union");
        let f_up = up(&mut e, 0xA5, 100);
        assert!(f_up.is_empty());
        assert_eq!(e.mods, MOD_BIT_CTRL, "physical Ctrl must remain logically held after Hyper release");
        assert_eq!(
            crate::inject::test_inject_count(),
            0,
            "virtual Hyper model never touches physical Ctrl via SendInput"
        );

        // Releasing the physical Ctrl clears it normally.
        up(&mut e, 0xA2, 150);
        assert_eq!(e.mods, 0);
        assert_eq!(e.physical_mods, 0);
    }

    #[test]
    fn modifier_hyper_altgr_companion_sequence() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        // Model the Windows Right Alt (VK_RMENU) sequence observed physically:
        // an OS-injected Left Ctrl (0xA2) companion around the RMENU hold.
        down_inj(&mut e, 0xA2, true, 0); // companion LCtrl (injected)
        down(&mut e, 0xA5, 1);           // Right Alt hyper down -> establish mods
        assert_eq!(e.mods, HYPER_MODS, "companion Ctrl must not poison the mask");
        assert_eq!(e.physical_mods, 0, "companion must not register as a physical modifier");

        let fy = down(&mut e, 0x59, 30);
        assert_eq!(fy.len(), 1, "chord works despite AltGr companion");
        assert_eq!(fy[0].id, "sc-hyper-y");
        up(&mut e, 0x59, 50);

        up(&mut e, 0xA5, 80);            // hyper up -> clear virtual mask
        up_inj(&mut e, 0xA2, true, 81);  // companion LCtrl up
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0, "no stale Ctrl remains after the AltGr sequence");
        assert_eq!(e.physical_mods, 0);
        assert_eq!(
            crate::inject::test_inject_count(),
            0,
            "no SendInput generated merely for Hyper recognition"
        );
    }

    #[test]
    fn modifier_hyper_altgr_companion_non_injected_while_active() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y]);

        // Belt: even a non-injected Left Ctrl arriving while Right-Alt Hyper is
        // active is an AltGr companion and must not add a stale Ctrl.
        down(&mut e, 0xA5, 0);
        assert_eq!(e.mods, HYPER_MODS);
        down(&mut e, 0xA2, 10);
        assert_eq!(e.mods, HYPER_MODS, "companion LCtrl must not add Ctrl");
        up(&mut e, 0xA2, 20);
        up(&mut e, 0xA5, 30);
        assert_eq!(e.mods, 0);
        assert_eq!(e.physical_mods, 0);
    }

    #[test]
    fn modifier_hyper_include_shift_chord() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0xA5,
            include_shift: true,
            suppress_original: true,
            tap_action_id: None,
        }));
        let hyper_p = rule_with_mods("sc-hyper-shift-p", 0x50, TriggerKind::Single, MOD_BIT_CTRL | MOD_BIT_ALT | MOD_BIT_SHIFT | MOD_BIT_WIN);
        e.reload(vec![hyper_p]);

        down(&mut e, 0xA5, 0);
        assert_eq!(e.mods, MOD_BIT_CTRL | MOD_BIT_ALT | MOD_BIT_SHIFT | MOD_BIT_WIN);
        assert_eq!(crate::inject::test_inject_count(), 0, "includeShift must not cause SendInput");
        let fired = down(&mut e, 0x50, 50);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "sc-hyper-shift-p");
        up(&mut e, 0x50, 80);
        let f_up = up(&mut e, 0xA5, 120);
        assert!(f_up.is_empty());
        assert_eq!(crate::inject::test_inject_count(), 0, "no SendInput with includeShift either");
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
    }

    #[test]
    fn modifier_hyper_shutdown_reload_cleanup() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_y = rule_with_mods("sc-hyper-y", 0x59, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_y.clone()]);

        down(&mut e, 0xA5, 0);
        down(&mut e, 0x59, 20);
        assert_eq!(crate::inject::test_inject_count(), 0, "virtual mask needs no SendInput");

        // Config reload / shutdown path while Hyper is active: clear the
        // VIRTUAL mask (nothing physically injected to release) and return to
        // a clean Idle.
        e.reload(vec![hyper_y]);
        assert_eq!(crate::inject::test_inject_count(), 0, "reload sends nothing");
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert!(!e.is_hyper_active());
        assert_eq!(e.mods, 0);

        // Hyper still works cleanly after the reload.
        down(&mut e, 0xA5, 100);
        assert_eq!(e.mods, HYPER_MODS);
        let fy = down(&mut e, 0x59, 130);
        assert_eq!(fy.len(), 1);
        assert_eq!(fy[0].id, "sc-hyper-y");
        up(&mut e, 0x59, 160);
        let f_up = up(&mut e, 0xA5, 200);
        assert!(f_up.is_empty());
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
    }

    #[test]
    fn modifier_hyper_reconfiguration_live() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        assert_eq!(e.is_hyper_key_suppressed(0xA5), true);
        assert_eq!(e.is_hyper_key_suppressed(0x5D), false); // Apps key not hyper

        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0x5D,
            include_shift: false,
            suppress_original: true,
            tap_action_id: Some("tap-2".to_string()),
        }));
        assert_eq!(e.is_hyper_key_suppressed(0xA5), false); // old key stops acting as hyper
        assert_eq!(e.is_hyper_key_suppressed(0x5D), true);  // new key is hyper
    }

    // ── Non-Modifier Hyper Keys (Caps Lock / F-keys) ─────────────────────────
    // Quick Press / tap-vs-chord is preserved for these: they are not
    // modifiers, so a delayed tap-vs-chord state machine is acceptable.

    #[test]
    fn non_modifier_hyper_tap_fires_when_released_alone() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0x14, // Caps Lock
            include_shift: false,
            suppress_original: true,
            tap_action_id: Some("hyper-tap-popup".to_string()),
        }));

        let f1 = down(&mut e, 0x14, 0);
        assert!(f1.is_empty());
        assert!(e.is_hyper_active());
        assert_eq!(e.mods, 0, "no modifiers established until a chord key appears");

        let f2 = up(&mut e, 0x14, 100);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "hyper-tap-popup");
        assert!(!e.is_hyper_active());
        assert_eq!(e.mods, 0);
    }

    #[test]
    fn non_modifier_hyper_chord_fires_and_cancels_tap() {
        crate::inject::test_inject_reset();
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0x14, // Caps Lock
            include_shift: false,
            suppress_original: true,
            tap_action_id: Some("hyper-tap-popup".to_string()),
        }));
        let hyper_t = rule_with_mods("sc-hyper-t", 0x54, TriggerKind::Single, HYPER_MODS);
        e.reload(vec![hyper_t]);

        down(&mut e, 0x14, 0);
        assert_eq!(e.mods, 0, "modifiers established lazily on first secondary key");

        let f1 = down(&mut e, 0x54, 50);
        assert_eq!(f1.len(), 1);
        assert_eq!(f1[0].id, "sc-hyper-t");
        assert_eq!(e.mods, HYPER_MODS);
        assert_eq!(crate::inject::test_inject_count(), 0, "non-modifier chord is virtual too");
        up(&mut e, 0x54, 80);

        let f2 = up(&mut e, 0x14, 150);
        assert!(f2.is_empty(), "no tap after chord");
        assert_eq!(crate::inject::test_inject_count(), 0, "no SendInput for the non-modifier chord cycle");
        assert_eq!(e.hyper_state, HyperState::Idle);
        assert_eq!(e.mods, 0);
    }

    /// Critical regression: Hyper chords must fire identically whether WASD
    /// Navigation Mode is on or off. Navigation consumes only W/A/S/D before
    /// the engine; T/Y/any-other chord keys must still reach the engine and
    /// fire. The engine itself never sees the consumed WASD letters.
    #[test]
    fn hyper_chords_work_with_navigation_mode_on_and_off() {
        crate::inject::test_inject_reset();
        use crate::navigation_mode::NavigationMode;

        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0xA5, // Right Alt
            include_shift: false,
            suppress_original: true,
            tap_action_id: None,
        }));
        e.reload(vec![rule_with_mods("sc-hyper-t", 0x54, TriggerKind::Single, HYPER_MODS)]);

        // W as a plain single-tap rule must NOT be matchable while nav is on.
        let mut nav = NavigationMode::new();
        nav.set_active(true);

        // W is consumed by navigation and never reaches the engine.
        let (outcome, inj) = nav.handle(true, 0x57);
        assert_eq!(outcome, crate::navigation_mode::NavOutcome::Consumed);
        assert_eq!(inj, vec![(crate::navigation_mode::VK_UP, true)]);
        nav.handle(false, 0x57);

        // Hyper + T still fires while navigation is active.
        down(&mut e, 0xA5, 0);
        let f1 = down(&mut e, 0x54, 30);
        assert_eq!(f1.len(), 1, "Hyper+T must fire while WASD navigation is on");
        assert_eq!(f1[0].id, "sc-hyper-t");
        up(&mut e, 0x54, 60);
        up(&mut e, 0xA5, 90);
        assert!(!e.is_hyper_active());

        // And still fires after navigation turns off (fresh chord).
        nav.set_active(false);
        down(&mut e, 0xA5, 200);
        let f2 = down(&mut e, 0x54, 230);
        assert_eq!(f2.len(), 1, "Hyper+T must fire after WASD navigation turns off");
        assert_eq!(f2[0].id, "sc-hyper-t");
        up(&mut e, 0x54, 260);
        up(&mut e, 0xA5, 290);

        assert_eq!(
            crate::inject::test_inject_count(),
            0,
            "navigation injections are tracked by NavigationMode, not the engine"
        );
    }

    // ── Single / Double / Triple shared-gesture-group arbitration ────────────

    fn no_typing(e: &mut TriggerEngine) {
        e.set_typing_idle_threshold(Duration::ZERO);
    }

    #[test]
    fn triple_fires_on_third_down_within_window() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-triple", 0x46, TriggerKind::Triple)]);
        let mut f = tap(&mut e, 0x46, 0);
        f.extend(tap(&mut e, 0x46, 100));
        f.extend(down(&mut e, 0x46, 200));
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "f-triple");
        assert_eq!(f[0].generation, 1);
    }

    #[test]
    fn single_and_double_share_one_key() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-single", 0x46, TriggerKind::Single), rule("f-double", 0x46, TriggerKind::Double)]);
        // Two quick taps = double (single is deferred and cancelled).
        let mut f = tap(&mut e, 0x46, 0);
        f.extend(down(&mut e, 0x46, 100));
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "f-double");
        up(&mut e, 0x46, 130);
        // One isolated tap = single, fired at the tap-window close.
        tap(&mut e, 0x46, 500);
        let f2 = e.timer_event(Duration::from_millis(800));
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "f-single");
    }

    #[test]
    fn double_after_window_falls_back_to_single() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-single", 0x46, TriggerKind::Single), rule("f-double", 0x46, TriggerKind::Double)]);
        tap(&mut e, 0x46, 0);
        // Window closes with only one tap -> single fires.
        let f1 = e.timer_event(Duration::from_millis(300));
        assert_eq!(f1.len(), 1);
        assert_eq!(f1[0].id, "f-single");
        // The next pair is a fresh double.
        let mut f2 = tap(&mut e, 0x46, 400);
        f2.extend(down(&mut e, 0x46, 500));
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "f-double");
    }

    #[test]
    fn triple_upgrades_when_double_and_triple_coexist() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![
            rule("f-single", 0x46, TriggerKind::Single),
            rule("f-double", 0x46, TriggerKind::Double),
            rule("f-triple", 0x46, TriggerKind::Triple),
        ]);
        // 2nd tap must NOT fire the double immediately — the 3rd upgrades it.
        let f = tap(&mut e, 0x46, 0);
        assert!(f.is_empty());
        assert!(e.timer_event(Duration::from_millis(60)).is_empty(), "double deferred while triple pending");
        let def = down(&mut e, 0x46, 100);
        assert!(def.is_empty(), "2nd tap defers the double while a triple may arrive");
        up(&mut e, 0x46, 130);
        let f3 = down(&mut e, 0x46, 200);
        assert_eq!(f3.len(), 1);
        assert_eq!(f3[0].id, "f-triple", "fast 3rd tap upgrades to triple");
        up(&mut e, 0x46, 230);
        assert!(e.timer_event(Duration::from_millis(400)).is_empty(), "gesture fully resolved, no stray deadline");
    }

    #[test]
    fn deferred_double_fires_when_no_third_tap() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![
            rule("f-single", 0x46, TriggerKind::Single),
            rule("f-double", 0x46, TriggerKind::Double),
            rule("f-triple", 0x46, TriggerKind::Triple),
        ]);
        tap(&mut e, 0x46, 0);
        let f = down(&mut e, 0x46, 100);
        assert!(f.is_empty(), "2nd tap defers while triple is configured");
        up(&mut e, 0x46, 130);
        // No 3rd tap: at the window close the DOUBLE fires (not the single).
        let f2 = e.timer_event(Duration::from_millis(300));
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "f-double");
    }

    #[test]
    fn repeat_down_is_filtered_from_tap_count() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double)]);
        down(&mut e, 0x46, 0);
        // 30 auto-repeat downs while held are not fresh taps.
        for i in 1..=30 {
            assert!(down(&mut e, 0x46, i * 10).is_empty(), "repeat {i} must be ignored");
        }
        // Still held after 30 repeats: the repeats never counted as taps, so
        // no double fires from them alone.
        assert!(e.timer_event(Duration::from_millis(250)).is_empty(), "repeats must not inflate the tap count");
        up(&mut e, 0x46, 300);
        // Two quick real taps then fire exactly one double.
        tap(&mut e, 0x46, 500);
        let f = down(&mut e, 0x46, 600);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "f-double");
    }

    #[test]
    fn unmatched_second_key_does_not_cancel_pending_double() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double)]);
        tap(&mut e, 0x46, 0);
        // An unrelated key down/up must not disturb F's pending gesture.
        down(&mut e, 0x47, 100);
        up(&mut e, 0x47, 120);
        let f = down(&mut e, 0x46, 200);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "f-double");
    }

    #[test]
    fn different_keys_do_not_share_tap_state() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double), rule("g-double", 0x47, TriggerKind::Double)]);
        tap(&mut e, 0x46, 0);
        tap(&mut e, 0x47, 50);
        let f = down(&mut e, 0x46, 100);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "f-double", "F pair completes independently of G");
        let g = down(&mut e, 0x47, 150);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].id, "g-double");
    }

    #[test]
    fn four_taps_yield_two_doubles() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double)]);
        let mut f = tap(&mut e, 0x46, 0);
        f.extend(down(&mut e, 0x46, 100));
        assert_eq!(f.len(), 1, "first pair fires on 2nd tap");
        assert_eq!(f[0].id, "f-double");
        up(&mut e, 0x46, 130);
        tap(&mut e, 0x46, 200);
        let f2 = down(&mut e, 0x46, 300);
        assert_eq!(f2.len(), 1, "second pair fires independently");
        assert_eq!(f2[0].id, "f-double");
    }

    #[test]
    fn triple_resets_after_firing() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-triple", 0x46, TriggerKind::Triple)]);
        let mut f = tap(&mut e, 0x46, 0);
        f.extend(tap(&mut e, 0x46, 100));
        f.extend(down(&mut e, 0x46, 200));
        assert_eq!(f.len(), 1, "first triple");
        up(&mut e, 0x46, 230);
        // A fresh 3-tap group fires a second triple.
        tap(&mut e, 0x46, 400);
        tap(&mut e, 0x46, 500);
        let f2 = down(&mut e, 0x46, 600);
        assert_eq!(f2.len(), 1, "second triple after reset");
        assert_eq!(f2[0].id, "f-triple");
    }

    #[test]
    fn single_fires_when_alone_every_cycle() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-single", 0x46, TriggerKind::Single)]);
        for cycle in 0..100 {
            let f = tap(&mut e, 0x46, cycle * 300);
            assert_eq!(f.len(), 1, "cycle {cycle}");
            assert_eq!(f[0].id, "f-single");
            assert_eq!(f[0].generation, (cycle + 1) as u64, "cycle {cycle}");
        }
    }

    #[test]
    fn one_hundred_double_cycles() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double)]);
        for cycle in 0..100 {
            let base = cycle * 250;
            tap(&mut e, 0x46, base);
            let f = down(&mut e, 0x46, base + 100);
            assert_eq!(f.len(), 1, "cycle {cycle}");
            assert_eq!(f[0].id, "f-double");
            up(&mut e, 0x46, base + 130);
        }
    }

    #[test]
    fn one_hundred_triple_cycles() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-triple", 0x46, TriggerKind::Triple)]);
        for cycle in 0..100 {
            let base = cycle * 300;
            tap(&mut e, 0x46, base);
            tap(&mut e, 0x46, base + 100);
            let f = down(&mut e, 0x46, base + 200);
            assert_eq!(f.len(), 1, "cycle {cycle}");
            assert_eq!(f[0].id, "f-triple");
            up(&mut e, 0x46, base + 230);
        }
    }

    #[test]
    fn mixed_single_double_triple_200_cycles() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![
            rule("f-single", 0x46, TriggerKind::Single),
            rule("f-double", 0x46, TriggerKind::Double),
            rule("f-triple", 0x46, TriggerKind::Triple),
        ]);
        for cycle in 0..200 {
            let base = cycle * 500;
            match cycle % 3 {
                // Single: one tap, window closes -> single fires.
                0 => {
                    tap(&mut e, 0x46, base);
                    let f = e.timer_event(Duration::from_millis(base + 300));
                    assert_eq!(f.len(), 1, "single cycle {cycle}");
                    assert_eq!(f[0].id, "f-single");
                }
                // Double: two taps, no third -> double fires at window close.
                1 => {
                    tap(&mut e, 0x46, base);
                    down(&mut e, 0x46, base + 100);
                    up(&mut e, 0x46, base + 130);
                    let f = e.timer_event(Duration::from_millis(base + 300));
                    assert_eq!(f.len(), 1, "double cycle {cycle}");
                    assert_eq!(f[0].id, "f-double");
                }
                // Triple: three taps -> triple upgrades.
                _ => {
                    tap(&mut e, 0x46, base);
                    tap(&mut e, 0x46, base + 100);
                    let f = down(&mut e, 0x46, base + 200);
                    assert_eq!(f.len(), 1, "triple cycle {cycle}");
                    assert_eq!(f[0].id, "f-triple");
                    up(&mut e, 0x46, base + 230);
                }
            }
        }
    }

    #[test]
    fn pause_reset_clears_gesture_state() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double)]);
        tap(&mut e, 0x46, 0);
        e.set_paused(true);
        e.set_paused(false);
        // After pause/resume the first tap is fresh: one tap must NOT fire.
        let f = tap(&mut e, 0x46, 100);
        assert!(f.is_empty());
        // The next tap completes a fresh double.
        let f2 = down(&mut e, 0x46, 200);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "f-double");
    }

    #[test]
    fn reload_clears_gesture_state() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-double", 0x46, TriggerKind::Double)]);
        tap(&mut e, 0x46, 0);
        e.reload(vec![rule("g-single", 0x47, TriggerKind::Single)]);
        // F is no longer configured: nothing pending, no stale state.
        assert!(e.timer_event(Duration::from_millis(300)).is_empty());
        let f = down(&mut e, 0x46, 400);
        assert!(f.is_empty(), "unconfigured key must not fire after reload");
    }

    #[test]
    fn shutdown_reset_cleans_up() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![rule("f-triple", 0x46, TriggerKind::Triple)]);
        tap(&mut e, 0x46, 0);
        tap(&mut e, 0x46, 100);
        e.reset(); // shutdown/cleanup path
        assert!(e.timer_event(Duration::from_millis(300)).is_empty(), "no stale deadline after reset");
        let f = down(&mut e, 0x46, 400);
        assert!(f.is_empty(), "reset tap count: 1 tap must not fire triple");
    }

    #[test]
    fn non_printable_keys_immune_to_typing_protection() {
        let mut e = TriggerEngine::new();
        // Default typing protection is active (threshold 400ms).
        e.reload(vec![rule("f12-single", 0x7B, TriggerKind::Single)]);
        // A fast printable burst on a DIFFERENT key arms the burst state.
        down(&mut e, 0x41, 0); // A
        up(&mut e, 0x41, 20);
        down(&mut e, 0x42, 30); // B (different printable -> burst)
        up(&mut e, 0x42, 50);
        // F12 is NOT printable: it must fire even mid-burst.
        let f = down(&mut e, 0x7B, 60);
        assert_eq!(f.len(), 1, "F12 fires during typing burst");
        assert_eq!(f[0].id, "f12-single");
    }

    #[test]
    fn printable_single_suppressed_during_typing_burst() {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("a-single", 0x41, TriggerKind::Single)]);
        // Typing burst: A, then B quickly (different printable key).
        down(&mut e, 0x41, 0);
        up(&mut e, 0x41, 20);
        down(&mut e, 0x42, 30);
        up(&mut e, 0x42, 50);
        assert!(e.is_in_typing_burst(), "A then B is a typing burst");
        // A standalone printable single must NOT fire inside the burst.
        let f = down(&mut e, 0x41, 60);
        assert!(f.is_empty(), "printable single suppressed during burst");
        up(&mut e, 0x41, 80);
        // After the burst idles out, a fresh A fires normally.
        let f2 = down(&mut e, 0x41, 1000);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "a-single");
    }

    // ── App-Specific (Scoped) Shortcuts ──────────────────────────────────────

    fn scoped_rule(id: &str, vk: u32, kind: TriggerKind, path: &str) -> Rule {
        Rule {
            app_scope: Some(crate::protocol::AppScope {
                scope_type: "executable".to_string(),
                executable_path: path.to_string(),
                process_name: None,
                display_name: None,
            }),
            ..rule_with(id, vk, kind, 0, false, 0)
        }
    }

    const PS_PATH: &str = r"C:\Program Files\Adobe\Photoshop\Photoshop.exe";
    const NP_PATH: &str = r"C:\Windows\System32\notepad.exe";

    fn ps_app() -> ActiveApp {
        ActiveApp {
            executable_path: PS_PATH.to_string(),
            process_name: Some("Photoshop".to_string()),
            display_name: None,
        }
    }

    fn np_app() -> ActiveApp {
        ActiveApp {
            executable_path: NP_PATH.to_string(),
            process_name: Some("notepad".to_string()),
            display_name: None,
        }
    }

    #[test]
    fn scoped_single_tap_fires_only_in_app() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![scoped_rule("ps-p", 0x50, TriggerKind::Single, PS_PATH)]);
        e.set_active_app(Some(ps_app()));
        let f = down(&mut e, 0x50, 0);
        assert_eq!(f.len(), 1, "scoped single fires inside the app");
        assert_eq!(f[0].id, "ps-p");
        up(&mut e, 0x50, 20);

        // Outside the app the rule is inactive (fail-open: key passes through).
        e.set_active_app(Some(np_app()));
        assert!(down(&mut e, 0x50, 100).is_empty(), "scoped rule inactive outside app");
    }

    #[test]
    fn scoped_double_tap() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![scoped_rule("ps-f", 0x46, TriggerKind::Double, PS_PATH)]);
        e.set_active_app(Some(ps_app()));
        down(&mut e, 0x46, 0);
        up(&mut e, 0x46, 10);
        let f = down(&mut e, 0x46, 100);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "ps-f");
    }

    #[test]
    fn scoped_triple_tap() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![scoped_rule("ps-t", 0x54, TriggerKind::Triple, PS_PATH)]);
        e.set_active_app(Some(ps_app()));
        let mut f = tap(&mut e, 0x54, 0);
        f.extend(tap(&mut e, 0x54, 100));
        f.extend(down(&mut e, 0x54, 200));
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "ps-t");
    }

    #[test]
    fn gesture_reset_on_foreground_change() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![scoped_rule("ps-f", 0x46, TriggerKind::Double, PS_PATH)]);
        e.set_active_app(Some(ps_app()));
        // First tap of the scoped double in Photoshop.
        down(&mut e, 0x46, 0);
        up(&mut e, 0x46, 10);
        // Foreground switches to Notepad mid-sequence: scoped gesture state is
        // cleared, so the next tap must NOT complete the double.
        e.set_active_app(Some(np_app()));
        assert!(down(&mut e, 0x46, 100).is_empty(), "scoped double must not complete after app switch");
        up(&mut e, 0x46, 120);
        // Returning to Photoshop starts a fresh sequence.
        e.set_active_app(Some(ps_app()));
        down(&mut e, 0x46, 300);
        up(&mut e, 0x46, 310);
        let f = down(&mut e, 0x46, 400);
        assert_eq!(f.len(), 1, "fresh scoped double after returning to the app");
        assert_eq!(f[0].id, "ps-f");
    }

    #[test]
    fn scoped_hyper() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.set_hyper_key(Some(modifier_hyper(0xA5)));
        let hyper_rule = Rule {
            app_scope: Some(crate::protocol::AppScope {
                scope_type: "executable".to_string(),
                executable_path: PS_PATH.to_string(),
                process_name: None,
                display_name: None,
            }),
            ..rule_with_mods("ps-hyper-t", 0x54, TriggerKind::Single, HYPER_MODS)
        };
        e.reload(vec![hyper_rule]);
        e.set_active_app(Some(ps_app()));

        down(&mut e, 0xA5, 0);
        let f = down(&mut e, 0x54, 50);
        assert_eq!(f.len(), 1, "Hyper+T fires while Photoshop is active");
        assert_eq!(f[0].id, "ps-hyper-t");
        up(&mut e, 0x54, 70);
        let f_up = up(&mut e, 0xA5, 100);
        assert!(f_up.is_empty());

        // In Notepad the scoped Hyper rule is inactive.
        e.set_active_app(Some(np_app()));
        down(&mut e, 0xA5, 200);
        assert!(down(&mut e, 0x54, 230).is_empty(), "scoped Hyper inactive outside app");
        up(&mut e, 0x54, 250);
        let f_up = up(&mut e, 0xA5, 280);
        assert!(f_up.is_empty());
        assert_eq!(e.hyper_state, HyperState::Idle);
    }

    #[test]
    fn specific_overrides_global_rule() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        // Global F double + Photoshop-only F double (shadowed while active).
        let global = rule("global-f", 0x46, TriggerKind::Double);
        e.reload(vec![global, scoped_rule("ps-f", 0x46, TriggerKind::Double, PS_PATH)]);
        e.set_active_app(Some(ps_app()));

        down(&mut e, 0x46, 0);
        up(&mut e, 0x46, 10);
        let f = down(&mut e, 0x46, 100);
        assert_eq!(f.len(), 1, "exactly one F double fires while Photoshop active");
        assert_eq!(f[0].id, "ps-f", "app-specific must shadow the global rule");
        up(&mut e, 0x46, 110);

        // Outside the app the global rule takes over.
        e.set_active_app(Some(np_app()));
        down(&mut e, 0x46, 300);
        up(&mut e, 0x46, 310);
        let f2 = down(&mut e, 0x46, 400);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "global-f", "global rule applies outside the app");
    }

    #[test]
    fn same_trigger_different_apps_fire_independently() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![
            scoped_rule("ps-f", 0x46, TriggerKind::Double, PS_PATH),
            scoped_rule("np-f", 0x46, TriggerKind::Double, NP_PATH),
        ]);
        e.set_active_app(Some(ps_app()));
        down(&mut e, 0x46, 0);
        up(&mut e, 0x46, 10);
        let f = down(&mut e, 0x46, 100);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "ps-f");
        up(&mut e, 0x46, 110);

        e.set_active_app(Some(np_app()));
        down(&mut e, 0x46, 300);
        up(&mut e, 0x46, 310);
        let f2 = down(&mut e, 0x46, 400);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "np-f");
    }

    /// Reproduces the reported "shortcut works once then dies" regression:
    /// a normal modifier+key shortcut (Ctrl+Shift+C) pressed 10 times must
    /// fire 10 times, with the engine returning to a fully clean state after
    /// every release (no stuck modifiers, no stuck pressed keys, no stuck
    /// gestures, no pause). A different shortcut (Win+N) must still match
    /// immediately afterward.
    #[test]
    fn repeated_ctrl_shift_c_ten_times_then_different_shortcut() {
        let mut e = TriggerEngine::new();
        // Ctrl = MOD_BIT_CTRL(1), Shift = MOD_BIT_SHIFT(4) -> required_mods = 5.
        let ctrl_shift_c = rule_with_mods("sc-ctrlshiftc", 0x43, TriggerKind::Single, MOD_BIT_CTRL | MOD_BIT_SHIFT);
        let win_n = rule_with_mods("sc-winn", 0x4E, TriggerKind::Single, MOD_BIT_WIN);
        e.reload(vec![ctrl_shift_c, win_n]);

        let mut total = 0usize;
        for cycle in 0..10u64 {
            let base = cycle * 1000;
            down(&mut e, 0x11, base); // Ctrl down
            down(&mut e, 0x10, base + 1); // Shift down
            let f = down(&mut e, 0x43, base + 2); // C down -> fire
            total += f.len();
            assert_eq!(f.len(), 1, "cycle {} must fire ctrl+shift+c", cycle);
            assert_eq!(f[0].id, "sc-ctrlshiftc");
            up(&mut e, 0x43, base + 10);
            up(&mut e, 0x10, base + 11);
            up(&mut e, 0x11, base + 12);

            assert_eq!(e.physical_mods, 0, "cycle {} stuck physical mods", cycle);
            assert!(e.pressed.is_empty(), "cycle {} stuck pressed keys", cycle);
            assert!(!e.paused, "cycle {} engine paused", cycle);
            assert!(e.gestures.is_empty(), "cycle {} stale gestures", cycle);
        }
        assert_eq!(total, 10, "expected exactly 10 ctrl+shift+c fires");

        // A DIFFERENT shortcut must still work immediately afterward.
        down(&mut e, 0x5B, 50000); // Win down
        let f = down(&mut e, 0x4E, 50001); // N down -> Win+N
        assert_eq!(f.len(), 1, "win+n must still match after 10 ctrl+shift+c presses");
        assert_eq!(f[0].id, "sc-winn");
        up(&mut e, 0x4E, 50010);
        up(&mut e, 0x5B, 50011);
        assert_eq!(e.physical_mods, 0, "stuck mods after win+n");
    }

    #[test]
    fn one_hundred_foreground_switch_cycles() {
        let mut e = TriggerEngine::new();
        no_typing(&mut e);
        e.reload(vec![
            scoped_rule("ps-p", 0x50, TriggerKind::Single, PS_PATH),
            scoped_rule("np-p", 0x50, TriggerKind::Single, NP_PATH),
        ]);
        for cycle in 0..100 {
            let app = if cycle % 2 == 0 { ps_app() } else { np_app() };
            let expected = if cycle % 2 == 0 { "ps-p" } else { "np-p" };
            e.set_active_app(Some(app));
            let base = cycle as u64 * 40;
            let f = down(&mut e, 0x50, base);
            assert_eq!(f.len(), 1, "cycle {cycle} must fire exactly the matching app rule");
            assert_eq!(f[0].id, expected, "cycle {cycle} fired the wrong rule");
            up(&mut e, 0x50, base + 20);
            assert_eq!(e.gestures.len(), 0, "cycle {cycle} left stale gesture state");
        }
    }
}
