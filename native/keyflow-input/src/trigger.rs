//! Native trigger state machine. Rust is authoritative for keyboard gesture
//! recognition: tap counts, double/triple windows, hold thresholds and the
//! single-versus-double / tap-versus-hold arbitrations all live here.
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
//! - Fire decisions are collected as (rule-index, at) while gesture state is
//!   mutably borrowed, then applied afterwards, so no borrow of `self.rules`
//!   is held while mutating the engine.

use std::collections::HashMap;
use std::time::Duration;

use crate::config::Rule;
use crate::protocol::TriggerKind;

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
        if bit != 0 {
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

        let matching = self.matching_rules(ev);
        if matching.is_empty() {
            return Vec::new();
        }

        let mut pending: Vec<(usize, Duration)> = Vec::new();
        {
            let gesture = self.gestures.entry(ev.vk).or_default();

            // Tap-then-hold: a held second press arms a hold; the first quick
            // tap armed `tth_armed` on release.
            let tth_rules: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| self.rules[ri].kind == TriggerKind::TapThenHold)
                .collect();
            if !tth_rules.is_empty() {
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
                // else: first press — decided on release.
            }

            // Double / triple tap counting.
            let multi: Vec<usize> = matching
                .iter()
                .copied()
                .filter(|&ri| matches!(self.rules[ri].kind, TriggerKind::Double | TriggerKind::Triple))
                .collect();
            let has_multi = !multi.is_empty();
            if !multi.is_empty() {
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
                            // Completed gesture: state resets immediately so the
                            // next pair starts fresh. No cooldown is left behind.
                            gesture.taps = 0;
                            gesture.first_tap_at = None;
                            gesture.tap_reset_at = None;
                            gesture.deferred_singles.clear();
                            gesture.singles_at = None;
                            break;
                        }
                    }
                }
                // A multi gesture is pending: singles are deferred below so the
                // double-tap decision can complete before any single fires.
            }

            // Single / combo: immediate unless a multi is competing.
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
                if has_multi {
                    if gesture.deferred_singles.is_empty() {
                        let window = multi.iter().map(|&ri| self.rules[ri].tap_interval).min().unwrap_or(crate::config::DEFAULT_TAP_INTERVAL_MS);
                        gesture.deferred_singles = singles.clone();
                        gesture.singles_at = Some(ev.at + Duration::from_millis(window as u64));
                    }
                } else {
                    for &ri in &singles {
                        pending.push((ri, ev.at));
                    }
                }
            }

            // Hold, and the tap-versus-hold arbitration when single+hold compete.
            if let Some(&hold_ri) = hold_rules.first() {
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
        self.apply_pending(pending)
    }

    fn on_up(&mut self, ev: KeyEvent) -> Vec<Fired> {
        let press_start = self.pressed.remove(&ev.vk);
        let mut pending: Vec<(usize, Duration)> = Vec::new();
        {
            let Some(gesture) = self.gestures.get_mut(&ev.vk) else {
                return Vec::new();
            };
            // Tap-versus-hold: released before threshold -> the tap wins.
            if let Some(t) = gesture.tap_or_hold.take() {
                if !t.fired {
                    pending.extend(t.single_rules.into_iter().map(|ri| (ri, ev.at)));
                }
                return self.apply_pending(pending);
            }
            // Plain hold released before threshold: cancelled (quick tap != hold).
            if let Some(h) = gesture.hold.as_mut() {
                if !h.fired {
                    gesture.hold = None;
                }
                return Vec::new();
            }
            // Tap-then-hold first press: a quick tap arms tth.
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

    /// Apply collected fire decisions, respecting per-rule cooldowns.
    fn apply_pending(&mut self, pending: Vec<(usize, Duration)>) -> Vec<Fired> {
        let mut fired = Vec::new();
        for (ri, at) in pending {
            if let Some(f) = self.try_fire(ri, at) {
                fired.push(f);
            }
        }
        fired
    }

    /// Fire a rule respecting its (default-zero) cooldown.
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
        rule_with(id, vk, kind, 0, false)
    }

    fn rule_with(id: &str, vk: u32, kind: TriggerKind, scan: u32, extended: bool) -> Rule {
        Rule {
            id: id.to_string(),
            vk,
            special_scan: scan,
            extended,
            kind,
            tap_interval: DEFAULT_TAP_INTERVAL_MS,
            hold_duration: 400,
            cooldown: 0,
            required_mods: 0,
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

    fn helpers() -> (TriggerEngine, u64) {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("caps", 20, TriggerKind::Single), rule("f-double", 70, TriggerKind::Double)]);
        (e, 0)
    }

    #[test]
    fn single_fires_on_down() {
        let (mut e, mut t) = helpers();
        let fired = down(&mut e, 20, t);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "caps");
        assert_eq!(fired[0].generation, 1);
        up(&mut e, 20, (t + 1) as u64);
        // Second press: fresh gesture, next generation.
        t += 1000;
        let fired = down(&mut e, 20, t);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].generation, 2);
    }

    #[test]
    fn double_fires_on_second_down_within_window() {
        let (mut e, mut t) = helpers();
        // First tap: nothing fires (deferred), deadlines set.
        down(&mut e, 70, t);
        up(&mut e, 70, (t + 1) as u64);
        t += 100;
        // Second tap within window: double fires.
        let fired = down(&mut e, 70, t);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "f-double");
    }

    #[test]
    fn two_singles_do_not_form_a_double() {
        let (mut e, mut t) = helpers();
        down(&mut e, 70, t);
        up(&mut e, 70, (t + 1) as u64);
        // Singles window elapses without a second press: nothing fires.
        t += 1000;
        let fired = e.timer_event(Duration::from_millis(t));
        assert!(fired.is_empty());
    }

    #[test]
    fn double_resets_so_next_pair_is_fresh() {
        let (mut e, mut t) = helpers();
        down(&mut e, 70, t);
        up(&mut e, 70, (t + 1) as u64);
        t += 100;
        down(&mut e, 70, t); // double fires, state cleared
        up(&mut e, 70, (t + 1) as u64);
        t += 1000;
        // A single press long after must be a fresh gesture, not a triple.
        let fired = down(&mut e, 70, t);
        assert!(fired.is_empty(), "single F long after double must not fire");
    }

    #[test]
    fn hold_fires_via_deadline() {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("hold", 20, TriggerKind::Hold)]);
        let t = 0;
        down(&mut e, 20, t);
        assert!(e.next_deadline().is_some());
        let fired = e.timer_event(Duration::from_millis(500));
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "hold");
    }

    #[test]
    fn quick_tap_does_not_fire_hold() {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("hold", 20, TriggerKind::Hold)]);
        down(&mut e, 20, 0);
        let fired = up(&mut e, 20, 50);
        assert!(fired.is_empty());
        // After the deadline, nothing fires either (hold was cancelled).
        let fired = e.timer_event(Duration::from_millis(600));
        assert!(fired.is_empty());
    }

    #[test]
    fn tap_or_hold_release_fires_single() {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("single", 20, TriggerKind::Single), rule("hold", 20, TriggerKind::Hold)]);
        down(&mut e, 20, 0);
        let fired = up(&mut e, 20, 50); // quick release -> tap wins
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "single");
    }

    #[test]
    fn tap_or_hold_threshold_fires_hold() {
        let mut e = TriggerEngine::new();
        e.reload(vec![rule("single", 20, TriggerKind::Single), rule("hold", 20, TriggerKind::Hold)]);
        down(&mut e, 20, 0);
        let fired = e.timer_event(Duration::from_millis(500)); // held past threshold
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "hold");
    }

    #[test]
    fn cooldown_gates_fire_but_not_tap_accumulation() {
        let mut e = TriggerEngine::new();
        let mut r = rule("cd", 20, TriggerKind::Double);
        r.cooldown = 500;
        e.reload(vec![r]);
        // First double fires.
        let fired = down(&mut e, 20, 0);
        assert_eq!(fired.len(), 0);
        up(&mut e, 20, 10);
        let fired = down(&mut e, 20, 100);
        assert_eq!(fired.len(), 1);
        // Second pair starts immediately AFTER, still in cooldown -> suppressed.
        up(&mut e, 20, 110);
        let fired = down(&mut e, 20, 200);
        assert!(fired.is_empty(), "cooldown must suppress the fire");
        // Cooldown do NOT reset tap counting for the following pair.
        up(&mut e, 20, 210);
        let fired = down(&mut e, 20, 300);
        assert!(fired.is_empty());
    }
}