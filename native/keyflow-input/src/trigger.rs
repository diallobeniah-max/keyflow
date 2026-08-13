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
//! - Hyper Key: a designated physical key acts as a custom native modifier chord (bit 4 = 16).
//!   Holding Hyper + pressing key resolves Hyper chord; releasing Hyper alone without other keys
//!   fires the optional Hyper tap action.
//! - Typing Protection: printable keys in rapid succession indicate active
//!   typing. Standalone printable gestures (e.g. single-tap 'F' or double-tap 'F')
//!   only arm when the user is idle before the gesture starts, preventing accidental
//!   activations when typing words like "coffee" or "office".
//! - Non-printable keys like CapsLock, Escape, F1-F24, and modifier combinations
//!   (e.g. Ctrl+Shift+C, Hyper+T) are completely immune to typing protection.

use std::collections::HashMap;
use std::time::Duration;

use crate::config::Rule;
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

#[derive(Debug, Default)]
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
    }
}

pub struct TriggerEngine {
    rules: Vec<Rule>,
    pressed: HashMap<u32, Duration>, // vk -> when this press started
    mods: u32,
    gestures: HashMap<u32, KeyGesture>,
    cooldowns: HashMap<usize, Duration>,
    generation: u64,
    paused: bool,
    typing_idle_threshold: Duration,
    last_typing_down_at: Option<Duration>,
    last_typing_vk: Option<u32>,
    is_in_typing_burst: bool,
    hyper_spec: Option<HyperKeySpec>,
    hyper_active: bool,
    hyper_tap_pending: bool,
}

impl TriggerEngine {
    pub fn new() -> Self {
        TriggerEngine {
            rules: Vec::new(),
            pressed: HashMap::new(),
            mods: 0,
            gestures: HashMap::new(),
            cooldowns: HashMap::new(),
            generation: 0,
            paused: false,
            typing_idle_threshold: Duration::from_millis(crate::config::DEFAULT_TYPING_IDLE_MS as u64),
            last_typing_down_at: None,
            last_typing_vk: None,
            is_in_typing_burst: false,
            hyper_spec: None,
            hyper_active: false,
            hyper_tap_pending: false,
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
        self.hyper_spec = spec;
        self.hyper_active = false;
        self.hyper_tap_pending = false;
        self.mods &= !MOD_BIT_HYPER;
    }

    pub fn is_hyper_active(&self) -> bool {
        self.hyper_active
    }

    pub fn is_hyper_key_suppressed(&self, vk: u32) -> bool {
        if let Some(spec) = &self.hyper_spec {
            spec.enabled && spec.vk == vk && spec.suppress_original
        } else {
            false
        }
    }

    /// Replace the compiled rule set; clear all gesture state.
    pub fn reload(&mut self, rules: Vec<Rule>) {
        self.rules = rules;
        self.reset();
    }

    /// Full state reset (pause, resume, reconfigure, bypass).
    pub fn reset(&mut self) {
        self.pressed.clear();
        self.mods = 0;
        self.gestures.clear();
        self.cooldowns.clear();
        self.last_typing_down_at = None;
        self.last_typing_vk = None;
        self.is_in_typing_burst = false;
        self.hyper_active = false;
        self.hyper_tap_pending = false;
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
        self.reset();
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
        let mut fired = self.run_deadlines(ev.at);
        let bit = crate::keymap::modifier_bit(ev.vk);
        let is_hyper_key = self.hyper_spec.as_ref().map_or(false, |h| h.enabled && h.vk == ev.vk);

        if is_hyper_key {
            match ev.state {
                EvState::Down => {
                    if bit != 0 {
                        self.mods &= !bit;
                    }
                    self.mods |= MOD_BIT_HYPER;
                }
                EvState::Up => {
                    if bit != 0 {
                        self.mods &= !bit;
                    }
                    self.mods &= !MOD_BIT_HYPER;
                }
            }
        } else if bit != 0 {
            match ev.state {
                EvState::Down => self.mods |= bit,
                EvState::Up => self.mods &= !bit,
            }
        }

        match ev.state {
            EvState::Down => fired.extend(self.on_down(ev)),
            EvState::Up => fired.extend(self.on_up(ev)),
        }
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
        if self.pressed.contains_key(&ev.vk) {
            // Auto-repeat or a stuck key — never a fresh gesture.
            return Vec::new();
        }
        self.pressed.insert(ev.vk, ev.at);

        // ── Hyper Key State ─────────────────────────────────────────────────
        if let Some(hyper) = &self.hyper_spec {
            if hyper.enabled && ev.vk == hyper.vk {
                self.hyper_active = true;
                self.hyper_tap_pending = true;
                self.mods |= MOD_BIT_HYPER;
                return Vec::new();
            }
        }

        if self.hyper_active {
            // A non-hyper key is pressed while Hyper is active -> cancels tap action!
            self.hyper_tap_pending = false;
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
                    } else {
                        gesture.taps += 1;
                    }
                    gesture.tap_reset_at = Some(gesture.first_tap_at.unwrap() + window);
                    for &ri in &multi {
                        let target = if self.rules[ri].kind == TriggerKind::Triple { 3 } else { 2 };
                        if gesture.taps >= target {
                            let within = gesture.first_tap_at.map_or(true, |t| ev.at - t <= window);
                            if within {
                                pending.push((ri, ev.at));
                                gesture.taps = 0;
                                gesture.first_tap_at = None;
                                gesture.tap_reset_at = None;
                                gesture.deferred_singles.clear();
                                gesture.singles_at = None;
                                break;
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
        if let Some(hyper) = self.hyper_spec.clone() {
            if hyper.enabled && ev.vk == hyper.vk {
                self.hyper_active = false;
                self.mods &= !MOD_BIT_HYPER;
                let mut pending = Vec::new();
                if self.hyper_tap_pending {
                    self.hyper_tap_pending = false;
                    if let Some(act_id) = &hyper.tap_action_id {
                        if !act_id.is_empty() {
                            self.generation += 1;
                            pending.push(Fired {
                                id: act_id.clone(),
                                generation: self.generation,
                            });
                        }
                    }
                }
                return pending;
            }
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
        self.rules
            .iter()
            .enumerate()
            .filter(|(_, r)| matches_key(r, ev) && r.required_mods == self.mods)
            .map(|(i, _)| i)
            .collect()
    }
}

fn matches_key(rule: &Rule, ev: KeyEvent) -> bool {
    if rule.vk != ev.vk {
        return false;
    }
    if rule.special_scan != 0 && ev.scan != 0 && rule.special_scan != ev.scan {
        return false;
    }
    if rule.extended != ev.extended {
        return false;
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
        }
    }

    fn down(engine: &mut TriggerEngine, vk: u32, at: u64) -> Vec<Fired> {
        engine.key_event(KeyEvent {
            state: EvState::Down,
            vk,
            scan: 0,
            extended: false,
            repeat: false,
            at: Duration::from_millis(at),
        })
    }

    fn up(engine: &mut TriggerEngine, vk: u32, at: u64) -> Vec<Fired> {
        engine.key_event(KeyEvent {
            state: EvState::Up,
            vk,
            scan: 0,
            extended: false,
            repeat: false,
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

    // ── Hyper Key System Tests ──────────────────────────────────────────────

    #[test]
    fn test_hyper_key_tap_action_fires_when_released_alone() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0xA5, // Right Alt
            suppress_original: true,
            tap_action_id: Some("hyper-tap-popup".to_string()),
        }));

        // Press Right Alt down -> no trigger yet
        let f1 = down(&mut e, 0xA5, 0);
        assert!(f1.is_empty());
        assert!(e.is_hyper_active());

        // Release Right Alt alone -> fires tap action!
        let f2 = up(&mut e, 0xA5, 100);
        assert_eq!(f2.len(), 1);
        assert_eq!(f2[0].id, "hyper-tap-popup");
        assert!(!e.is_hyper_active());
    }

    #[test]
    fn test_hyper_key_chord_fires_and_cancels_tap_action() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0xA5, // Right Alt
            suppress_original: true,
            tap_action_id: Some("hyper-tap-popup".to_string()),
        }));

        // Rule for Hyper + T (0x54): required_mods = MOD_BIT_HYPER (16)
        let hyper_t = rule_with_mods("sc-aot-hyper-t", 0x54, TriggerKind::Single, MOD_BIT_HYPER);
        e.reload(vec![hyper_t]);

        // Press Right Alt down
        down(&mut e, 0xA5, 0);
        assert!(e.is_hyper_active());

        // Press T down while Right Alt is held -> Hyper + T chord fires!
        let f1 = down(&mut e, 0x54, 50);
        assert_eq!(f1.len(), 1);
        assert_eq!(f1[0].id, "sc-aot-hyper-t");

        up(&mut e, 0x54, 80);

        // Release Right Alt -> tap action MUST NOT fire!
        let f2 = up(&mut e, 0xA5, 150);
        assert!(f2.is_empty(), "Releasing Hyper after a chord must NOT fire tap action!");
    }

    #[test]
    fn test_hyper_plus_modifier_chord() {
        let mut e = TriggerEngine::new();
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0xA5, // Right Alt
            suppress_original: true,
            tap_action_id: None,
        }));

        // Rule for Hyper + Shift + P: mods = MOD_BIT_HYPER (16) | MOD_BIT_SHIFT (4) = 20
        let hyper_shift_p = rule_with_mods("sc-hyper-shift-p", 0x50, TriggerKind::Single, 16 | 4);
        e.reload(vec![hyper_shift_p]);

        // Press Right Alt down
        down(&mut e, 0xA5, 0);
        // Press Left Shift down
        down(&mut e, 0xA0, 10);
        // Press P down
        let fired = down(&mut e, 0x50, 50);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "sc-hyper-shift-p");
    }

    #[test]
    fn test_hyper_key_reconfiguration_live() {
        let mut e = TriggerEngine::new();
        // Configure Right Alt (0xA5)
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0xA5,
            suppress_original: true,
            tap_action_id: Some("tap-1".to_string()),
        }));
        assert_eq!(e.is_hyper_key_suppressed(0xA5), true);
        assert_eq!(e.is_hyper_key_suppressed(0x5D), false); // Apps key not hyper

        // Reconfigure Hyper key to Apps key (0x5D)
        e.set_hyper_key(Some(HyperKeySpec {
            enabled: true,
            vk: 0x5D,
            suppress_original: true,
            tap_action_id: Some("tap-2".to_string()),
        }));
        assert_eq!(e.is_hyper_key_suppressed(0xA5), false); // Old key stops acting as hyper
        assert_eq!(e.is_hyper_key_suppressed(0x5D), true); // New key is hyper
    }
}