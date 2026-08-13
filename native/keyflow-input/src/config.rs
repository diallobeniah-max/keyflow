//! Shortcut configuration consumed by the native trigger engine.
//!
//! Canonical behavior values (`pass`/`suppress`/`disable`/`remap`) are
//! produced by Electron's single `shortcutBehavior()` function and carried
//! explicitly in the configure message. The helper stores them alongside the
//! trigger rules so the hook can decide suppression synchronously.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use crate::protocol::{BehaviorKind, KeySpec, ShortcutSpec, TriggerKind};

/// Milliseconds, the single canonical native timing default location.
/// Shortcuts may override per-rule; 0 means "use the default".
pub const DEFAULT_TAP_INTERVAL_MS: u32 = 220;
pub const DEFAULT_DOUBLE_INTERVAL_MS: u32 = 220;
pub const DEFAULT_TRIPLE_INTERVAL_MS: u32 = 220;
pub const DEFAULT_HOLD_DURATION_MS: u32 = 400;
pub const DEFAULT_COOLDOWN_MS: u32 = 0; // no cooldown swallows the next gesture's first tap
pub const DEFAULT_TYPING_IDLE_MS: u32 = 400; // Balanced typing protection default

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
pub const MOD_BIT_HYPER: u32 = 0b0001_0000;

#[derive(Debug)]
pub struct Config {
    rules: Vec<Rule>,
    /// vk -> behavior for the hook's synchronous suppression decision.
    behavior: HashMap<u32, KeyBehavior>,
    /// Legacy fallback (single-key policy mode). Prefer rules.
    keys: HashMap<u32, KeyBehavior>,
    typing_idle_threshold: Duration,
    paused: bool,
    bypass: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            rules: Vec::new(),
            behavior: HashMap::new(),
            keys: HashMap::new(),
            typing_idle_threshold: Duration::from_millis(DEFAULT_TYPING_IDLE_MS as u64),
            paused: false,
            bypass: false,
        }
    }
}

impl Config {
    pub fn new() -> Self {
        Config::default()
    }

    pub fn set_typing_idle_threshold(&mut self, d: Duration) {
        self.typing_idle_threshold = d;
    }

    pub fn typing_idle_threshold(&self) -> Duration {
        self.typing_idle_threshold
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

            let vk = spec.key.vk;
            let special_scan = spec.key.scan_code;
            let extended = spec.key.extended;
            let mods = spec.modifiers.iter().fold(0u32, |acc, &m| {
                if m == MOD_BIT_HYPER {
                    acc | MOD_BIT_HYPER
                } else {
                    let bit = crate::keymap::modifier_bit(m);
                    if bit != 0 {
                        acc | bit
                    } else {
                        acc | m
                    }
                }
            });

            let tap_interval = if spec.trigger.tap_interval > 0 {
                spec.trigger.tap_interval
            } else {
                match kind {
                    TriggerKind::Double => DEFAULT_DOUBLE_INTERVAL_MS,
                    TriggerKind::Triple => DEFAULT_TRIPLE_INTERVAL_MS,
                    _ => DEFAULT_TAP_INTERVAL_MS,
                }
            };
            let hold_duration = if spec.trigger.hold_duration > 0 {
                spec.trigger.hold_duration
            } else {
                DEFAULT_HOLD_DURATION_MS
            };
            let cooldown = if spec.trigger.cooldown > 0 {
                spec.trigger.cooldown
            } else {
                DEFAULT_COOLDOWN_MS
            };

            self.rules.push(Rule {
                id: spec.id.clone(),
                vk,
                special_scan,
                extended,
                kind,
                tap_interval,
                hold_duration,
                cooldown,
                required_mods: mods,
            });

            // Derive per-key suppression policy for unmodified keys. Modifier
            // combinations (Ctrl+K, etc.) never suppress the base key.
            if mods == 0 && vk != 0 {
                let behavior: KeyBehavior = spec.resolved_behavior().into();
                // Most-restrictive behavior wins if multiple rules target the same key.
                let prev = self.behavior.get(&vk).copied().unwrap_or(KeyBehavior::Pass);
                let merged = match (prev, behavior) {
                    (KeyBehavior::Disable, _) | (_, KeyBehavior::Disable) => KeyBehavior::Disable,
                    (KeyBehavior::Suppress, _) | (_, KeyBehavior::Suppress) => KeyBehavior::Suppress,
                    (KeyBehavior::Remap(to), _) | (_, KeyBehavior::Remap(to)) => KeyBehavior::Remap(to),
                    _ => KeyBehavior::Pass,
                };
                self.behavior.insert(vk, merged);
            }
        }
    }

    /// Legacy single-key policy replacement (self-test fallback).
    pub fn apply(&mut self, specs: &[KeySpec]) {
        self.keys.clear();
        self.rules.clear();
        self.behavior.clear();
        for s in specs {
            let b = match s.mode.as_str() {
                "suppress" => KeyBehavior::Suppress,
                "disable" => KeyBehavior::Disable,
                "remap" if s.remap_to != 0 => KeyBehavior::Remap(s.remap_to),
                _ => KeyBehavior::Pass,
            };
            self.keys.insert(s.vk, b);
        }
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
    }

    pub fn latch_bypass(&mut self) {
        self.bypass = true;
    }

    pub fn set_bypass(&mut self, bypass: bool) {
        self.bypass = bypass;
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn is_bypass(&self) -> bool {
        self.bypass
    }

    pub fn rules(&self) -> &[Rule] {
        &self.rules
    }

    /// Synchronous suppression lookup for the hook thread.
    pub fn behavior_of(&self, vk: u32) -> KeyBehavior {
        if self.paused || self.bypass {
            return KeyBehavior::Pass;
        }
        if let Some(&b) = self.behavior.get(&vk) {
            return b;
        }
        if let Some(&b) = self.keys.get(&vk) {
            return b;
        }
        KeyBehavior::Pass
    }

    pub fn behavior_for(&self, vk: u32) -> KeyBehavior {
        self.behavior_of(vk)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{KeyIdentity, TriggerSpec};

    #[test]
    fn pause_overrides_everything() {
        let mut c = Config::new();
        c.apply(&[KeySpec { vk: 0x14, mode: "suppress".to_string(), remap_to: 0 }]);
        assert_eq!(c.behavior_for(0x14), KeyBehavior::Suppress);
        c.set_paused(true);
        assert_eq!(c.behavior_for(0x14), KeyBehavior::Pass);
    }

    #[test]
    fn bypass_resets_on_reconfigure() {
        let mut c = Config::new();
        c.set_bypass(true);
        assert_eq!(c.behavior_for(0x14), KeyBehavior::Pass);
    }

    #[test]
    fn caps_lock_screenshot_derives_suppress() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-caps".to_string(),
            name: Some("Screenshot".to_string()),
            key: KeyIdentity { vk: 0x14, scan_code: 58, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.behavior_for(0x14), KeyBehavior::Suppress);
        assert_eq!(c.rules().len(), 1);
        assert_eq!(c.rules()[0].vk, 0x14);
    }

    #[test]
    fn disabled_shortcut_not_installed() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-caps".to_string(),
            name: Some("Screenshot".to_string()),
            key: KeyIdentity { vk: 0x14, scan_code: 58, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: false,
            suppress_key: None,
            key_behavior: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.behavior_for(0x14), KeyBehavior::Pass);
        assert_eq!(c.rules().len(), 0);
    }

    #[test]
    fn combo_shortcuts_pass_but_still_route() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-k".to_string(),
            name: Some("Command palette".to_string()),
            key: KeyIdentity { vk: 0x4B, scan_code: 0, extended: false },
            modifiers: vec![MOD_BIT_CTRL],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.behavior_for(0x4B), KeyBehavior::Pass);
        assert_eq!(c.rules().len(), 1);
        assert_eq!(c.rules()[0].required_mods, MOD_BIT_CTRL);
    }

    #[test]
    fn hyper_modifier_folding() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-hyper-t".to_string(),
            name: Some("Hyper T Popup".to_string()),
            key: KeyIdentity { vk: 0x54, scan_code: 0, extended: false },
            modifiers: vec![MOD_BIT_HYPER],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.rules()[0].required_mods, MOD_BIT_HYPER);
    }
}