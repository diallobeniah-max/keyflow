//! Shortcut configuration consumed by the native trigger engine.
//!
//! Canonical behavior values (`pass`/`suppress`/`disable`/`remap`) are
//! produced by Electron's single `shortcutBehavior()` function and carried
//! explicitly in the configure message. The helper stores them alongside the
//! trigger rules so the hook can decide suppression synchronously.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use crate::protocol::{BehaviorKind, KeySpec, ShortcutSpec, TriggerKind};

/// Milliseconds, the single canonical native timing default location.
/// Shortcuts may override per-rule; 0 means "use the default".
pub const DEFAULT_TAP_INTERVAL_MS: u32 = 220;
pub const DEFAULT_DOUBLE_INTERVAL_MS: u32 = 220;
pub const DEFAULT_TRIPLE_INTERVAL_MS: u32 = 220;
pub const DEFAULT_HOLD_DURATION_MS: u32 = 400;
pub const DEFAULT_COOLDOWN_MS: u32 = 0; // no cooldown swallows the next gesture's first tap

/// Process-wide configuration, replaced wholesale on each Configure message.
pub static CONFIG: LazyLock<Mutex<Config>> = LazyLock::new(|| Mutex::new(Config::new()));

/// A compiled trigger rule for the gesture engine.
#[derive(Clone, Debug)]
pub struct Rule {
    pub id: String,
    pub vk: u32,
    pub special_scan: u32, // 0 = match on vk
    pub extended: bool,
    pub kind: TriggerKind,
    pub tap_interval: u32,
    pub hold_duration: u32,
    pub cooldown: u32,
    pub required_mods: u32, // bitmap: bit0 Ctrl, bit1 Alt, bit2 Shift, bit3 Win
}

/// Per-key suppression decision, derived from the plain (no-modifier) rules.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeyBehavior {
    Pass,
    Suppress,
    Disable,
    Remap(u32),
}

impl From<BehaviorKind> for KeyBehavior {
    fn from(b: BehaviorKind) -> Self {
        match b {
            BehaviorKind::Pass => KeyBehavior::Pass,
            BehaviorKind::Suppress => KeyBehavior::Suppress,
            BehaviorKind::Disable => KeyBehavior::Disable,
            BehaviorKind::Remap(to) => KeyBehavior::Remap(to),
        }
    }
}

/// Modifier bitmap bits — must stay in sync with keymap::modifier_bit.
pub const MOD_BIT_CTRL: u32 = 0b0001;
pub const MOD_BIT_ALT: u32 = 0b0010;
pub const MOD_BIT_SHIFT: u32 = 0b0100;
pub const MOD_BIT_WIN: u32 = 0b1000;

#[derive(Debug)]
pub struct Config {
    rules: Vec<Rule>,
    /// vk -> behavior for the hook's synchronous suppression decision.
    behavior: HashMap<u32, KeyBehavior>,
    /// Legacy fallback (single-key policy mode). Prefer rules.
    keys: HashMap<u32, KeyBehavior>,
    paused: bool,
    bypass: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config { rules: Vec::new(), behavior: HashMap::new(), keys: HashMap::new(), paused: false, bypass: false }
    }
}

impl Config {
    pub fn new() -> Self {
        Config::default()
    }

    /// Full replacement from the canonical shortcut configuration.
    pub fn apply_shortcuts(&mut self, specs: &[ShortcutSpec]) {
        self.rules.clear();
        self.behavior.clear();
        // Keep legacy keys when no shortcuts are present (self-test fallback).
        if specs.is_empty() {
            self.keys.clear();
            return;
        }
        self.keys.clear();
for spec in specs.iter().filter(|s| s.enabled) {
                let Some(kind) = spec.trigger.kind() else {
                    // sequence and unknown kinds are skipped, never fatal.
                    continue;
                };
                let behavior = spec.resolved_behavior();
                let required_mods = mod_bits_for(&spec.modifiers);
                // Only pass/suppress behaviors own a gesture rule (they fire an
                // action). disable/remap are pure hook-side policy and never fire.
                if matches!(behavior, BehaviorKind::Pass | BehaviorKind::Suppress) {
                    self.rules.push(Rule {
                        id: spec.id.clone(),
                        vk: spec.key.vk,
                        special_scan: spec.key.scan_code,
                        extended: spec.key.extended,
                        kind,
                        tap_interval: pick(spec.trigger.tap_interval, default_interval_for(kind)),
                        hold_duration: pick(spec.trigger.hold_duration, DEFAULT_HOLD_DURATION_MS),
                        cooldown: pick(spec.trigger.cooldown, DEFAULT_COOLDOWN_MS),
                        required_mods,
                    });
                }
            // Only plain (no-modifier) keys participate in hook suppression.
            if required_mods == 0 && !matches!(behavior, BehaviorKind::Pass) {
                self.behavior.insert(spec.key.vk, behavior.into());
            }
        }
        self.bypass = false;
    }

    pub fn apply(&mut self, specs: &[KeySpec]) {
        self.rules.clear();
        self.behavior.clear();
        self.keys.clear();
        for spec in specs {
            let mode = match spec.mode.as_str() {
                "suppress" => KeyBehavior::Suppress,
                "disable" => KeyBehavior::Disable,
                "remap" if spec.remap_to != 0 => KeyBehavior::Remap(spec.remap_to),
                _ => KeyBehavior::Pass,
            };
            self.keys.insert(spec.vk, mode);
        }
        self.bypass = false;
    }

    pub fn rules(&self) -> &[Rule] {
        &self.rules
    }

    /// Synchronous per-key decision for the hook callback. Paused/safe/bypass
    /// always pass through; unknown keys pass; legacy `keys` table is consulted
    /// only when no native shortcut rules were installed.
    pub fn behavior_of(&self, vk: u32) -> KeyBehavior {
        if self.paused || self.bypass {
            return KeyBehavior::Pass;
        }
        self.behavior.get(&vk).copied().unwrap_or_else(|| self.keys.get(&vk).copied().unwrap_or(KeyBehavior::Pass))
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
    }

    /// Emergency bypass latch: once engaged, everything passes through until
    /// a fresh configure arrives.
    pub fn latch_bypass(&mut self) {
        self.bypass = true;
    }

    pub fn is_bypass(&self) -> bool {
        self.bypass
    }
}

fn pick(override_ms: u32, default_ms: u32) -> u32 {
    if override_ms == 0 {
        default_ms
    } else {
        override_ms
    }
}

fn default_interval_for(kind: TriggerKind) -> u32 {
    match kind {
        TriggerKind::Triple => DEFAULT_TRIPLE_INTERVAL_MS,
        _ => DEFAULT_DOUBLE_INTERVAL_MS,
    }
}

fn mod_bits_for(mods: &[u32]) -> u32 {
    let mut bits = 0u32;
    for m in mods {
        bits |= match *m {
            0x10 | 0xa0 | 0xa1 => MOD_BIT_SHIFT,
            0x11 | 0xa2 | 0xa3 => MOD_BIT_CTRL,
            0x12 | 0xa4 | 0xa5 => MOD_BIT_ALT,
            0x5b | 0x5c => MOD_BIT_WIN,
            _ => 0,
        };
    }
    bits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::KeyIdentity;

    fn spec(id: &str, vk: u32, kind: &str, behavior: &str, mods: &[u32]) -> ShortcutSpec {
        ShortcutSpec {
            id: id.to_string(),
            name: None,
            key: KeyIdentity { vk, scan_code: 0, extended: false },
            modifiers: mods.to_vec(),
            trigger: crate::protocol::TriggerSpec {
                kind_raw: kind.to_string(),
                tap_interval: 0,
                hold_duration: 0,
                cooldown: 0,
                delay: 0,
            },
            behavior: behavior.to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
        }
    }

    #[test]
    fn caps_lock_screenshot_derives_suppress() {
        let mut cfg = Config::new();
        cfg.apply_shortcuts(&[spec("sc-3w02ys1", 20, "single", "suppress", &[])]);
        assert_eq!(cfg.behavior_of(20), KeyBehavior::Suppress);
        assert_eq!(cfg.rules().len(), 1);
        // A different key is untouched.
        assert_eq!(cfg.behavior_of(70), KeyBehavior::Pass);
    }

    #[test]
    fn combo_shortcuts_pass_but_still_route() {
        let mut cfg = Config::new();
        cfg.apply_shortcuts(&[spec("ctrl-k", 75, "single", "pass", &[0x11])]);
        // Combo key itself is never suppressed at the hook level.
        assert_eq!(cfg.behavior_of(75), KeyBehavior::Pass);
        // But the rule exists for the gesture engine.
        assert_eq!(cfg.rules().len(), 1);
        assert_eq!(cfg.rules()[0].required_mods, MOD_BIT_CTRL);
    }

    #[test]
    fn disabled_shortcut_not_installed() {
        let mut s = spec("off", 20, "single", "suppress", &[]);
        s.enabled = false;
        let mut cfg = Config::new();
        cfg.apply_shortcuts(&[s]);
        assert!(cfg.rules().is_empty());
        assert_eq!(cfg.behavior_of(20), KeyBehavior::Pass);
    }

    #[test]
    fn pause_overrides_everything() {
        let mut cfg = Config::new();
        cfg.apply_shortcuts(&[spec("c", 20, "single", "suppress", &[])]);
        cfg.set_paused(true);
        assert_eq!(cfg.behavior_of(20), KeyBehavior::Pass);
    }

    #[test]
    fn bypass_resets_on_reconfigure() {
        let mut cfg = Config::new();
        cfg.apply_shortcuts(&[spec("c", 20, "single", "suppress", &[])]);
        cfg.latch_bypass();
        assert_eq!(cfg.behavior_of(20), KeyBehavior::Pass);
        cfg.apply_shortcuts(&[spec("c", 20, "single", "suppress", &[])]);
        assert_eq!(cfg.behavior_of(20), KeyBehavior::Suppress);
    }
}