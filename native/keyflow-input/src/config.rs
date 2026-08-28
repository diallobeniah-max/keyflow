//! Shortcut configuration consumed by the native trigger engine.
//!
//! Canonical behavior values (`pass`/`suppress`/`disable`/`remap`) are
//! produced by Electron's single `shortcutBehavior()` function and carried
//! explicitly in the configure message. The helper stores them alongside the
//! trigger rules so the hook can decide suppression synchronously.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use crate::app_scope::{self, ActiveApp};
use crate::protocol::{AppScope, BehaviorKind, KeySpec, ShortcutSpec, TriggerKind};

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
    /// Application scope. None = global ("everywhere"). A scoped rule only
    /// matches while the scope's application is the cached foreground process.
    pub app_scope: Option<AppScope>,
}

impl Rule {
    /// Whether this rule applies for the given active application.
    pub fn applies_in(&self, active: Option<&ActiveApp>) -> bool {
        match &self.app_scope {
            None => true,
            Some(scope) => app_scope::scope_matches(scope, active),
        }
    }
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

/// One app-scoped per-key behavior entry. A scoped behavior must NOT enter the
/// global `behavior` map, or it would leak into every other application.
#[derive(Clone, Debug)]
struct ScopedBehavior {
    vk: u32,
    scope: AppScope,
    behavior: KeyBehavior,
}

#[derive(Debug)]
pub struct Config {
    rules: Vec<Rule>,
    /// vk -> behavior for the hook's synchronous suppression decision. Global
    /// ("everywhere") rules only; app-scoped rules live in `scoped`.
    behavior: HashMap<u32, KeyBehavior>,
    /// App-scoped per-key behaviors. Resolved against the cached active app.
    scoped: Vec<ScopedBehavior>,
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
            scoped: Vec::new(),
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
    ///
    /// **Atomic**: all specs are compiled into temporary structures first.
    /// Only after successful compilation is the active rule set swapped in.
    /// A malformed or unsupported spec is silently skipped (never fatal), but
    /// the old working configuration is never cleared until the replacement
    /// is fully built.
    pub fn apply_shortcuts(&mut self, specs: &[ShortcutSpec]) {
        // Empty config: wipe everything (intentional full clear).
        if specs.is_empty() {
            self.rules.clear();
            self.behavior.clear();
            self.scoped.clear();
            self.keys.clear();
            return;
        }

        // --- Phase 1: Build candidate config into temporaries ---
        let mut new_rules: Vec<Rule> = Vec::with_capacity(specs.len());
        let mut new_behavior: HashMap<u32, KeyBehavior> = HashMap::new();
        let mut new_scoped: Vec<ScopedBehavior> = Vec::new();

        for spec in specs.iter().filter(|s| s.enabled) {
            let vk = spec.key.vk;
            let mods = spec.modifiers.iter().fold(0u32, |acc, m| {
                match m.to_lowercase().as_str() {
                    "ctrl" | "control" => acc | MOD_BIT_CTRL,
                    "alt" | "menu" => acc | MOD_BIT_ALT,
                    "shift" => acc | MOD_BIT_SHIFT,
                    "win" | "meta" => acc | MOD_BIT_WIN,
                    "hyper" => acc | MOD_BIT_HYPER,
                    _ => {
                        if let Ok(num) = m.parse::<u32>() {
                            if num == MOD_BIT_HYPER {
                                acc | MOD_BIT_HYPER
                            } else {
                                let bit = crate::keymap::modifier_bit(num);
                                if bit != 0 { acc | bit } else { acc | num }
                            }
                        } else {
                            acc
                        }
                    }
                }
            });

            // App scope: Some(executable) when the shortcut is app-specific.
            let app_scope = spec
                .app_scope
                .clone()
                .filter(|s| !s.is_global());

            // Direct remaps are per-key DOWN/UP behaviors, NOT gesture rules.
            let resolved = spec.resolved_behavior();
            if mods == 0 && vk != 0 && matches!(resolved, BehaviorKind::Remap(_)) {
                let behavior: KeyBehavior = resolved.into();
                if let Some(scope) = app_scope {
                    push_scoped_behavior_into(&mut new_scoped, vk, scope, behavior);
                } else {
                    let prev = new_behavior.get(&vk).copied().unwrap_or(KeyBehavior::Pass);
                    new_behavior.insert(vk, merge_behavior(prev, behavior));
                }
                continue;
            }

            let Some(kind) = spec.trigger.kind() else {
                // sequence and unknown kinds are skipped, never fatal.
                continue;
            };

            let special_scan = spec.key.scan_code;
            let extended = spec.key.extended;
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

            new_rules.push(Rule {
                id: spec.id.clone(),
                vk,
                special_scan,
                extended,
                kind,
                tap_interval,
                hold_duration,
                cooldown,
                required_mods: mods,
                app_scope: app_scope.clone(),
            });

            // Derive per-key suppression policy for unmodified keys.
            if mods == 0 && vk != 0 {
                let behavior: KeyBehavior = spec.resolved_behavior().into();
                if let Some(scope) = app_scope {
                    push_scoped_behavior_into(&mut new_scoped, vk, scope, behavior);
                } else {
                    let prev = new_behavior.get(&vk).copied().unwrap_or(KeyBehavior::Pass);
                    new_behavior.insert(vk, merge_behavior(prev, behavior));
                }
            }
        }

        // --- Phase 2: Atomic swap — only now do we touch self ---
        self.rules = new_rules;
        self.behavior = new_behavior;
        self.scoped = new_scoped;
        self.keys.clear();
    }

    /// Register an app-scoped per-key behavior, merging with any existing
    /// behavior for the same key AND scope.
    fn push_scoped_behavior(&mut self, vk: u32, scope: AppScope, behavior: KeyBehavior) {
        for entry in self.scoped.iter_mut() {
            if entry.vk == vk && entry.scope == scope {
                entry.behavior = merge_behavior(entry.behavior, behavior);
                return;
            }
        }
        self.scoped.push(ScopedBehavior { vk, scope, behavior });
    }

    /// Legacy single-key policy replacement (self-test fallback).
    pub fn apply(&mut self, specs: &[KeySpec]) {
        self.keys.clear();
        self.rules.clear();
        self.behavior.clear();
        self.scoped.clear();
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

    /// Synchronous suppression lookup for the hook thread, resolved against the
    /// cached active application. App-scoped behaviors shadow the global map
    /// only while their application is active; otherwise the global (or Pass)
    /// behavior applies — the source key is never swallowed outside its scope.
    pub fn behavior_of(&self, vk: u32, active: Option<&ActiveApp>) -> KeyBehavior {
        if self.paused || self.bypass {
            return KeyBehavior::Pass;
        }
        let mut resolved: Option<KeyBehavior> = None;
        for entry in &self.scoped {
            if entry.vk != vk {
                continue;
            }
            if app_scope::scope_matches(&entry.scope, active) {
                resolved = Some(merge_behavior(resolved.unwrap_or(KeyBehavior::Pass), entry.behavior));
            }
        }
        if let Some(b) = resolved {
            return b;
        }
        if let Some(&b) = self.behavior.get(&vk) {
            return b;
        }
        if let Some(&b) = self.keys.get(&vk) {
            return b;
        }
        KeyBehavior::Pass
    }

    /// Global-only lookup (legacy convenience / tests).
    pub fn behavior_for(&self, vk: u32) -> KeyBehavior {
        self.behavior_of(vk, None)
    }

    /// Whether any rule for `vk` is app-scoped. Used to reset scoped gesture
    /// state on foreground change without touching global gesture state.
    pub fn has_scoped_rules_for(&self, vk: u32) -> bool {
        self.rules.iter().any(|r| r.vk == vk && r.app_scope.is_some())
    }
}

/// Push an app-scoped per-key behavior into a temporary Vec, merging with any
/// existing entry for the same key AND scope. Used during the atomic config
/// build phase (before self is modified).
fn push_scoped_behavior_into(scoped: &mut Vec<ScopedBehavior>, vk: u32, scope: AppScope, behavior: KeyBehavior) {
    for entry in scoped.iter_mut() {
        if entry.vk == vk && entry.scope == scope {
            entry.behavior = merge_behavior(entry.behavior, behavior);
            return;
        }
    }
    scoped.push(ScopedBehavior { vk, scope, behavior });
}

/// Most-restrictive behavior wins when multiple rules target the same key:
/// Disable > Suppress > Remap > Pass.
fn merge_behavior(prev: KeyBehavior, behavior: KeyBehavior) -> KeyBehavior {
    match (prev, behavior) {
        (KeyBehavior::Disable, _) | (_, KeyBehavior::Disable) => KeyBehavior::Disable,
        (KeyBehavior::Suppress, _) | (_, KeyBehavior::Suppress) => KeyBehavior::Suppress,
        (KeyBehavior::Remap(to), _) | (_, KeyBehavior::Remap(to)) => KeyBehavior::Remap(to),
        _ => KeyBehavior::Pass,
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
            app_scope: None,
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
            app_scope: None,
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
            modifiers: vec!["ctrl".to_string()],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
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
            modifiers: vec!["hyper".to_string()],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.rules()[0].required_mods, MOD_BIT_HYPER);
    }

    #[test]
    fn remap_shortcut_installs_behavior_without_rule() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-remap-tab".to_string(),
            name: Some("3 -> Tab".to_string()),
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x09,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[spec]);
        // The per-key remap behavior is installed…
        assert_eq!(c.behavior_for(0x33), KeyBehavior::Remap(0x09));
        // …but NO gesture rule is created (a delayed Single would double-fire).
        assert_eq!(c.rules().len(), 0, "remap shortcuts must not create trigger rules");
    }

    #[test]
    fn remap_shortcut_ignored_when_disabled() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-remap-off".to_string(),
            name: Some("3 -> Tab".to_string()),
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x09,
            enabled: false,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.behavior_for(0x33), KeyBehavior::Pass);
        assert_eq!(c.rules().len(), 0);
    }

    #[test]
    fn tap_shortcut_still_creates_rule() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-f-double".to_string(),
            name: Some("F double".to_string()),
            key: KeyIdentity { vk: 0x46, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "double".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.rules().len(), 1, "tap shortcuts still create trigger rules");
        assert_eq!(c.rules()[0].kind, TriggerKind::Double);
        assert_eq!(c.behavior_for(0x46), KeyBehavior::Suppress);
    }

    fn scoped_spec(scope: Option<crate::protocol::AppScope>) -> ShortcutSpec {
        ShortcutSpec {
            id: "sc-scoped".to_string(),
            name: Some("3 -> Tab (Photoshop)".to_string()),
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x09,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: scope,
        }
    }

    fn photoshop_scope() -> crate::protocol::AppScope {
        crate::protocol::AppScope {
            scope_type: "executable".to_string(),
            executable_path: r"C:\Program Files\Adobe\Photoshop\Photoshop.exe".to_string(),
            process_name: Some("Photoshop".to_string()),
            display_name: None,
        }
    }

    fn chrome_app() -> crate::app_scope::ActiveApp {
        crate::app_scope::ActiveApp {
            executable_path: r"C:\Program Files\Google\Chrome\Application\chrome.exe".to_string(),
            process_name: Some("chrome".to_string()),
            display_name: None,
        }
    }

    fn photoshop_app() -> crate::app_scope::ActiveApp {
        crate::app_scope::ActiveApp {
            executable_path: r"C:\Program Files\Adobe\Photoshop\Photoshop.exe".to_string(),
            process_name: Some("Photoshop".to_string()),
            display_name: None,
        }
    }

    #[test]
    fn scoped_remap_active_app_maps_target() {
        let mut c = Config::new();
        c.apply_shortcuts(&[scoped_spec(Some(photoshop_scope()))]);
        assert_eq!(c.behavior_of(0x33, Some(&photoshop_app())), KeyBehavior::Remap(0x09));
        // No gesture rule is created for a remap.
        assert_eq!(c.rules().len(), 0);
    }

    #[test]
    fn scoped_remap_outside_app_preserves_source() {
        let mut c = Config::new();
        c.apply_shortcuts(&[scoped_spec(Some(photoshop_scope()))]);
        // In Chrome the scoped remap is INACTIVE -> Pass (source preserved).
        assert_eq!(c.behavior_of(0x33, Some(&chrome_app())), KeyBehavior::Pass);
        // With no cached foreground the rule also fails open.
        assert_eq!(c.behavior_of(0x33, None), KeyBehavior::Pass);
    }

    #[test]
    fn scoped_behavior_never_enters_global_map() {
        let mut c = Config::new();
        c.apply_shortcuts(&[scoped_spec(Some(photoshop_scope()))]);
        // `behavior_for` (global lookup, no active app) must be Pass — the
        // scoped remap must not leak into other applications.
        assert_eq!(c.behavior_for(0x33), KeyBehavior::Pass);
    }

    #[test]
    fn specific_overrides_global_while_active() {
        let mut c = Config::new();
        // Global 3 -> Enter remap + Photoshop-only 3 -> Tab remap.
        let global = ShortcutSpec {
            id: "sc-global".to_string(),
            name: None,
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x0d,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[global, scoped_spec(Some(photoshop_scope()))]);
        assert_eq!(c.behavior_of(0x33, Some(&photoshop_app())), KeyBehavior::Remap(0x09), "app-specific wins while active");
        assert_eq!(c.behavior_of(0x33, Some(&chrome_app())), KeyBehavior::Remap(0x0d), "global applies outside");
        assert_eq!(c.behavior_of(0x33, None), KeyBehavior::Remap(0x0d), "global applies when app unknown");
    }

    #[test]
    fn same_trigger_same_app_conflicts_scoped() {
        // Two scoped remaps for the SAME key and SAME app merge; the last
        // (most-restrictive) behavior is installed once — never both.
        let mut c = Config::new();
        let a = ShortcutSpec {
            id: "sc-a".to_string(),
            name: None,
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x09,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: Some(photoshop_scope()),
        };
        let b = ShortcutSpec {
            id: "sc-b".to_string(),
            name: None,
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: Some(photoshop_scope()),
        };
        c.apply_shortcuts(&[a, b]);
        // Suppress is more restrictive than Remap -> single merged behavior.
        assert_eq!(c.behavior_of(0x33, Some(&photoshop_app())), KeyBehavior::Suppress);
        assert_eq!(c.behavior_of(0x33, Some(&chrome_app())), KeyBehavior::Pass);
    }

    #[test]
    fn same_trigger_different_apps_coexist() {
        let mut c = Config::new();
        let ps = ShortcutSpec {
            id: "sc-ps".to_string(),
            name: None,
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x09,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: Some(photoshop_scope()),
        };
        let notepad_scope = crate::protocol::AppScope {
            scope_type: "executable".to_string(),
            executable_path: r"C:\Windows\System32\notepad.exe".to_string(),
            process_name: Some("notepad".to_string()),
            display_name: None,
        };
        let notepad = ShortcutSpec {
            id: "sc-np".to_string(),
            name: None,
            key: KeyIdentity { vk: 0x33, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "remap".to_string(),
            remap_to: 0x5b, // Win
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: Some(notepad_scope),
        };
        c.apply_shortcuts(&[ps, notepad]);
        let notepad_app = crate::app_scope::ActiveApp {
            executable_path: r"C:\Windows\System32\notepad.exe".to_string(),
            process_name: Some("notepad".to_string()),
            display_name: None,
        };
        assert_eq!(c.behavior_of(0x33, Some(&photoshop_app())), KeyBehavior::Remap(0x09));
        assert_eq!(c.behavior_of(0x33, Some(&notepad_app)), KeyBehavior::Remap(0x5b));
        assert_eq!(c.behavior_of(0x33, Some(&chrome_app())), KeyBehavior::Pass, "different apps never cross-contaminate");
    }

    #[test]
    fn scoped_gesture_rule_is_scope_tagged() {
        let mut c = Config::new();
        let spec = ShortcutSpec {
            id: "sc-f2".to_string(),
            name: None,
            key: KeyIdentity { vk: 0x46, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "double".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: Some(photoshop_scope()),
        };
        c.apply_shortcuts(&[spec]);
        assert_eq!(c.rules().len(), 1);
        assert!(c.rules()[0].app_scope.is_some());
        assert!(c.has_scoped_rules_for(0x46));
        assert!(!c.has_scoped_rules_for(0x47));
        assert_eq!(c.behavior_of(0x46, Some(&photoshop_app())), KeyBehavior::Suppress);
        assert_eq!(c.behavior_of(0x46, Some(&chrome_app())), KeyBehavior::Pass);
    }

    #[test]
    fn config_update_replaces_old_rules() {
        let mut c = Config::new();
        // Install Rule A: Ctrl+Shift+T → single.
        let spec_a = ShortcutSpec {
            id: "sc-a".to_string(),
            name: Some("Rule A".to_string()),
            key: KeyIdentity { vk: 0x54, scan_code: 0, extended: false },
            modifiers: vec!["ctrl".to_string(), "shift".to_string()],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[spec_a.clone()]);
        assert_eq!(c.rules().len(), 1, "first config: one rule");
        assert_eq!(c.rules()[0].id, "sc-a");

        // Config update: Rule A stays + new Rule B (K single).
        let spec_b = ShortcutSpec {
            id: "sc-b".to_string(),
            name: Some("Rule B".to_string()),
            key: KeyIdentity { vk: 0x4B, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[spec_a, spec_b]);
        assert_eq!(c.rules().len(), 2, "config update: both rules present");
        assert!(c.rules().iter().any(|r| r.id == "sc-a"), "Rule A survived");
        assert!(c.rules().iter().any(|r| r.id == "sc-b"), "Rule B installed");
        assert_eq!(c.behavior_for(0x4B), KeyBehavior::Suppress, "K suppressed");
    }

    #[test]
    fn unknown_trigger_kind_skipped_valid_rules_survive() {
        let mut c = Config::new();
        let valid = ShortcutSpec {
            id: "sc-valid".to_string(),
            name: Some("Valid".to_string()),
            key: KeyIdentity { vk: 0x54, scan_code: 0, extended: false },
            modifiers: vec!["ctrl".to_string(), "shift".to_string()],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        let unknown_trigger = ShortcutSpec {
            id: "sc-bad".to_string(),
            name: Some("Bad trigger".to_string()),
            key: KeyIdentity { vk: 0x4B, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "sequence".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[valid, unknown_trigger]);
        assert_eq!(c.rules().len(), 1, "only the valid rule is installed");
        assert_eq!(c.rules()[0].id, "sc-valid");
    }

    #[test]
    fn config_update_after_save_preserves_existing() {
        // Regression test: matches the exact user scenario:
        // 1. Config with Ctrl+Shift+T → working.
        // 2. Save new shortcut K → config update with both.
        // 3. Both must work after update.
        let mut c = Config::new();
        let ctrl_shift_t = ShortcutSpec {
            id: "sc-cst".to_string(),
            name: Some("AlwaysOnTop".to_string()),
            key: KeyIdentity { vk: 0x54, scan_code: 0, extended: false },
            modifiers: vec!["ctrl".to_string(), "shift".to_string()],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "pass".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[ctrl_shift_t.clone()]);
        assert_eq!(c.rules().len(), 1);

        // Simulate 10 triggers of Ctrl+Shift+T (they succeed).
        for _ in 0..10 {
            let rules = c.rules();
            let matched: Vec<_> = rules.iter().filter(|r| r.vk == 0x54 && r.required_mods == (MOD_BIT_CTRL | MOD_BIT_SHIFT)).collect();
            assert_eq!(matched.len(), 1, "Rule A matches");
        }

        // Now save a new shortcut K → single → screenshot.
        let k_single = ShortcutSpec {
            id: "sc-k".to_string(),
            name: Some("Screenshot".to_string()),
            key: KeyIdentity { vk: 0x4B, scan_code: 0, extended: false },
            modifiers: vec![],
            trigger: TriggerSpec { kind_raw: "single".to_string(), ..Default::default() },
            behavior: "suppress".to_string(),
            remap_to: 0,
            enabled: true,
            suppress_key: None,
            key_behavior: None,
            app_scope: None,
        };
        c.apply_shortcuts(&[ctrl_shift_t, k_single]);
        assert_eq!(c.rules().len(), 2, "both rules installed after config update");

        // Ctrl+Shift+T MUST STILL WORK after config update.
        let cst_rules: Vec<_> = c.rules().iter().filter(|r| r.vk == 0x54 && r.required_mods == (MOD_BIT_CTRL | MOD_BIT_SHIFT)).collect();
        assert_eq!(cst_rules.len(), 1, "Ctrl+Shift+T rule survives config update");

        // K must also work.
        let k_rules: Vec<_> = c.rules().iter().filter(|r| r.vk == 0x4B && r.required_mods == 0).collect();
        assert_eq!(k_rules.len(), 1, "K rule installed");
        assert_eq!(c.behavior_for(0x4B), KeyBehavior::Suppress, "K is suppressed");

        // Repeat Ctrl+Shift+T 10 more times.
        for i in 0..10 {
            let rules = c.rules();
            let matched: Vec<_> = rules.iter().filter(|r| r.vk == 0x54 && r.required_mods == (MOD_BIT_CTRL | MOD_BIT_SHIFT)).collect();
            assert_eq!(matched.len(), 1, "Ctrl+Shift+T still matches after update (attempt {})", i + 1);
        }
    }
}