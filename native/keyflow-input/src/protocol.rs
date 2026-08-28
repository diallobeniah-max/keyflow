//! Newline-delimited JSON protocol between Electron and keyflow-input.exe.
//! Helper stdout is protocol only; diagnostics go to stderr.

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;

/// Shared marker written into `dwExtraInfo` of KeyFlow-generated SendInput
/// events so the hook can recognize its own remap output and never re-trigger.
pub const OWN_INJECTED_MARKER: usize = 0x4B46_574B; // "KF" + "WK"

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OutMessage {
    Ready {
        version: u32,
        pid: u32,
        #[serde(default)]
        build: Option<String>,
    },
    Key {
        version: u32,
        sequence: u64,
        state: &'static str,
        vk: u32,
        #[serde(rename = "scanCode")]
        scan_code: u32,
        extended: bool,
        injected: bool,
        #[serde(rename = "lowerIntegrityInjected")]
        lower_integrity_injected: bool,
    },
    Pong {
        version: u32,
    },
    Ack {
        version: u32,
        r#for: String,
        #[serde(rename = "configVersion", default)]
        config_version: u64,
        #[serde(default)]
        count: usize,
        #[serde(rename = "hyperEnabled", default)]
        hyper_enabled: Option<bool>,
        #[serde(rename = "hyperPhysicalVk", default)]
        hyper_physical_vk: Option<u32>,
        #[serde(rename = "includeShift", default)]
        include_shift: Option<bool>,
        #[serde(rename = "tapSyntheticId", default)]
        tap_synthetic_id: Option<String>,
        #[serde(default)]
        status: String,
        #[serde(default)]
        error: Option<String>,
    },
    Bypass {
        version: u32,
        active: bool,
    },
    /// A completed keyboard gesture. This is the only thing Electron routes on.
    Triggered {
        version: u32,
        #[serde(rename = "shortcutId")]
        shortcut_id: String,
        generation: u64,
    },
    /// One-off response to BeginCapture.
    CapturedKey {
        version: u32,
        vk: u32,
        #[serde(rename = "scanCode")]
        scan_code: u32,
        extended: bool,
        name: String,
    },
    /// Explicit acknowledgement that the keyboard hook has actually armed
    /// capture mode. Electron waits for this before reporting capture as active,
    /// so the UI never claims "listening" while the native hook is not armed.
    CaptureArmed {
        version: u32,
    },
    /// Capture was cancelled (currently only by pressing Escape while listening).
    /// Distinct from CapturedKey: the renderer must NOT create a shortcut for
    /// this event — it should simply exit the listening state.
    CaptureCancelled {
        version: u32,
    },
    /// Result of a media/volume key injection request (InjectKey). Electron
    /// correlates by `seq` so concurrent actions can't cross results.
    Injected {
        version: u32,
        #[serde(rename = "seq")]
        sequence: u64,
        ok: bool,
        /// GetLastError() value when SendInput failed, otherwise null.
        #[serde(default)]
        error: Option<u32>,
    },
    /// Auth handshake message sent when connected via authenticated named pipe.
    Auth {
        version: u32,
        token: String,
    },
    /// Drag Corner Switcher: the overlay must appear. Carries the enumerated
    /// eligible window list so Electron renders tiles without a second query.
    DragSwitcherShow {
        version: u32,
        #[serde(rename = "monitorIndex")]
        monitor_index: i32,
        #[serde(rename = "monitorLeft")]
        monitor_left: i32,
        #[serde(rename = "monitorTop")]
        monitor_top: i32,
        #[serde(rename = "monitorRight")]
        monitor_right: i32,
        #[serde(rename = "monitorBottom")]
        monitor_bottom: i32,
        #[serde(rename = "workLeft")]
        work_left: i32,
        #[serde(rename = "workTop")]
        work_top: i32,
        #[serde(rename = "workRight")]
        work_right: i32,
        #[serde(rename = "workBottom")]
        work_bottom: i32,
        #[serde(rename = "cursorX")]
        cursor_x: i32,
        #[serde(rename = "cursorY")]
        cursor_y: i32,
        #[serde(rename = "sourceHwnd")]
        source_hwnd: String,
        #[serde(rename = "hoverDwellMs")]
        hover_dwell_ms: u32,
        #[serde(default)]
        windows: Vec<WindowEntry>,
    },
    /// Drag Corner Switcher: cursor moved while the overlay is visible. Sent at
    /// most at ~60Hz so Electron can hit-test tile geometry without polling.
    DragSwitcherMove {
        version: u32,
        x: i32,
        y: i32,
    },
    /// Drag Corner Switcher: the overlay must hide. `reason` is one of
    /// mouseUp / escape / sourceGone / disabled / paused / reload / shutdown /
    /// bypass / noWindows / activate.
    DragSwitcherHide {
        version: u32,
        reason: String,
    },
    /// Result of a DragSwitcherActivate request. `reason` is one of
    /// activated / restored-and-activated / activation-denied / window-invalid.
    WindowActivationResult {
        version: u32,
        hwnd: String,
        success: bool,
        reason: String,
    },
    /// Response to a ListApps request: the running applications available to
    /// scope a shortcut to (executable identity + friendly display info).
    AppList {
        version: u32,
        #[serde(default)]
        apps: Vec<AppInfo>,
    },
    /// Response to a GetActiveApp request: the cached foreground application,
    /// or all-empty fields when the foreground is not resolvable (fail-open).
    ActiveApp {
        version: u32,
        #[serde(rename = "executablePath", default)]
        executable_path: String,
        #[serde(rename = "processName", default)]
        process_name: Option<String>,
        #[serde(rename = "displayName", default)]
        display_name: Option<String>,
    },
}

/// One running application offered by the app picker. Identity is the
/// normalized executable path; `process_name`/`display_name` are friendly
/// metadata only (window titles never participate in matching).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub executable_path: String,
    #[serde(default)]
    pub process_name: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    /// App icon as a base64 BMP, or None (renderer falls back to a monogram).
    #[serde(default)]
    pub icon: Option<String>,
}

/// One eligible top-level window tile for the Drag Corner Switcher overlay.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowEntry {
    /// HWND as a decimal string (JS Number cannot hold a full 64-bit HWND).
    pub hwnd: String,
    /// Trimmed window title (may be empty).
    pub title: String,
    /// Process base name without ".exe" (e.g. "Notepad", "explorer").
    pub app: String,
    /// App icon as a base64 BMP, or None when extraction failed (renderer
    /// falls back to a monogram tile).
    #[serde(default)]
    pub icon: Option<String>,
}

impl OutMessage {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.to_string())
    }
}

/// A single KBDLLHOOKSTRUCT vk/scan/extended identity.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyIdentity {
    pub vk: u32,
    #[serde(default)]
    pub scan_code: u32,
    #[serde(default)]
    pub extended: bool,
}

/// Canonical per-shortcut key behavior. Derived by Electron in ONE function
/// (`shortcutBehavior`); the helper trusts the explicit value and falls back to
/// legacy `suppressKey`/`keyBehavior` fields only when it is absent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BehaviorKind {
    Pass,
    Suppress,
    Disable,
    Remap(u32),
}

impl BehaviorKind {
    pub fn parse(value: &str, remap_to: u32) -> BehaviorKind {
        match value {
            "suppress" => BehaviorKind::Suppress,
            "disable" => BehaviorKind::Disable,
            "remap" if remap_to != 0 => BehaviorKind::Remap(remap_to),
            _ => BehaviorKind::Pass,
        }
    }
}

/// Trigger kinds KeyFlow's native engine recognizes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerKind {
    Single,
    Double,
    Triple,
    Hold,
    Combo,
    TapThenHold,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerSpec {
    #[serde(rename = "kind", default = "default_trigger_kind")]
    pub kind_raw: String,
    /// ms; 0 = use the engine default. Never wall-clock.
    #[serde(default)]
    pub tap_interval: u32,
    #[serde(default)]
    pub hold_duration: u32,
    #[serde(default)]
    pub cooldown: u32,
    #[serde(default)]
    pub delay: u32,
}

impl Default for TriggerSpec {
    fn default() -> Self {
        TriggerSpec {
            kind_raw: "single".to_string(),
            tap_interval: 0,
            hold_duration: 0,
            cooldown: 0,
            delay: 0,
        }
    }
}

impl TriggerSpec {
    pub fn kind(&self) -> Option<TriggerKind> {
        match self.kind_raw.as_str() {
            "single" => Some(TriggerKind::Single),
            "double" => Some(TriggerKind::Double),
            "triple" => Some(TriggerKind::Triple),
            "hold" | "longPress" => Some(TriggerKind::Hold),
            "combo" => Some(TriggerKind::Combo),
            "tapThenHold" => Some(TriggerKind::TapThenHold),
            // "sequence" has no implemented spec; ignored by the engine.
            _ => None,
        }
    }
}

fn default_trigger_kind() -> String {
    "single".to_string()
}

/// A complete shortcut definition as sent by Electron.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSpec {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub key: KeyIdentity,
    #[serde(default)]
    pub modifiers: Vec<String>,
    #[serde(default)]
    pub trigger: TriggerSpec,
    #[serde(default)]
    pub behavior: String,
    #[serde(default)]
    pub remap_to: u32,
    #[serde(default)]
    pub enabled: bool,
    /// Legacy fields: only consulted when `behavior` is empty/unset. The
    /// canonical value is produced by Electron's shortcutBehavior().
    #[serde(default)]
    pub suppress_key: Option<bool>,
    #[serde(default)]
    pub key_behavior: Option<String>,
    /// Optional application scope: when present and of type "executable", the
    /// shortcut only applies while that application is the foreground process.
    #[serde(default)]
    pub app_scope: Option<AppScope>,
}

/// Application scope for a shortcut ("Works In"). `scope_type` is "executable"
/// for app-specific shortcuts; "everywhere" (or an absent scope) is global.
/// Identity for matching is the normalized `executable_path`; window titles
/// never participate in matching.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppScope {
    #[serde(default)]
    pub scope_type: String,
    #[serde(default)]
    pub executable_path: String,
    #[serde(default)]
    pub process_name: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
}

impl AppScope {
    /// True when this scope is global ("everywhere" or empty identity).
    pub fn is_global(&self) -> bool {
        self.scope_type != "executable" || self.executable_path.trim().is_empty()
    }
}

impl ShortcutSpec {
    /// Resolve the canonical behavior: explicit `behavior` wins, legacy fields
    /// are the compatibility fallback for old saved data.
    pub fn resolved_behavior(&self) -> BehaviorKind {
        if self.enabled && !self.behavior.is_empty() {
            return BehaviorKind::parse(&self.behavior, self.remap_to);
        }
        if self.enabled {
            if let Some(kb) = &self.key_behavior {
                if !kb.is_empty() && kb != "passThrough" {
                    return BehaviorKind::parse(kb, self.remap_to);
                }
            }
            if self.suppress_key.unwrap_or(false) {
                return BehaviorKind::Suppress;
            }
        }
        BehaviorKind::Pass
    }
}

/// Legacy per-key policy (pre-shortcut architecture). Kept so old tests and
/// the self-test can still exercise the raw hook policy paths.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeySpec {
    pub vk: u32,
    /// "pass" | "suppress" | "disable" | "remap"
    #[serde(default = "default_mode")]
    pub mode: String,
    /// Target vk when mode == "remap".
    #[serde(default)]
    pub remap_to: u32,
}

fn default_mode() -> String {
    "pass".to_string()
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HyperKeySpec {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub vk: u32,
    #[serde(default)]
    pub include_shift: bool,
    #[serde(default = "default_true")]
    pub suppress_original: bool,
    #[serde(default)]
    pub tap_action_id: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Inbound commands. `version` fields are protocol-versioned for future
/// compatibility; they are deserialized but not yet acted on.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[allow(dead_code)]
pub enum InMessage {
    /// New canonical configuration: complete shortcut definitions. This is
    /// what the native trigger engine consumes.
    Configure {
        #[serde(default)]
        version: u32,
        #[serde(rename = "configVersion", default)]
        config_version: u64,
        #[serde(default)]
        shortcuts: Vec<ShortcutSpec>,
        /// Legacy per-key policy list; applied only when `shortcuts` is empty.
        #[serde(default)]
        keys: Vec<KeySpec>,
        #[serde(default)]
        typing_protection: Option<String>,
        #[serde(default)]
        typing_idle_ms: Option<u32>,
        // rename_all = "camelCase" on the enum renames variants, NOT the fields
        // of struct-variants. Without this explicit rename, Electron's
        // `hyperKey` was silently dropped (defaulted to None) on deserialize.
        #[serde(default, rename = "hyperKey")]
        hyper_key: Option<HyperKeySpec>,
    },
    Pause {
        #[serde(default)]
        version: u32,
    },
    Resume {
        #[serde(default)]
        version: u32,
    },
    Ping {
        #[serde(default)]
        version: u32,
    },
    /// Next non-injected physical key is reported as `capturedKey` once, then
    /// capture mode exits automatically. Used by the shortcut-creation UI.
    BeginCapture {
        #[serde(default)]
        version: u32,
    },
    /// Abort an active capture without reporting a key (picker close, page
    /// unmount, app loses capture, helper reload/shutdown). Also disarms the
    /// captured-key UP swallow.
    StopKeyCapture {
        #[serde(default)]
        version: u32,
    },
    /// Development diagnostics only: when enabled the helper also streams raw
    /// `key` events. Production leaves this off.
    SetKeyStream {
        #[serde(default)]
        version: u32,
        #[serde(default)]
        enabled: bool,
    },
    /// Enable/disable WASD Navigation Mode (W/A/S/D map to arrow keys).
    SetWasdNavigation {
        #[serde(default)]
        version: u32,
        #[serde(default)]
        enabled: bool,
        #[serde(default)]
        cursor_size: u32,
        #[serde(default)]
        cursor_path: Option<String>,
    },
    /// Inject one real SendInput key event (used for media/volume keys, which
    /// keybd_event cannot deliver reliably). The helper replies with Injected.
    /// The event carries OWN_INJECTED_MARKER so the hook never reprocesses it.
    InjectKey {
        #[serde(default)]
        version: u32,
        vk: u32,
        #[serde(default)]
        extended: bool,
        #[serde(default)]
        down: bool,
        #[serde(default)]
        seq: u64,
    },
    /// Configure the Drag Corner Switcher V2 (defaults: disabled, top-right
    /// zone, activation dwell 250ms, hover dwell 400ms, corner size 16px).
    /// `zones` is the hot-area bitmask (presets compose from one engine).
    SetDragSwitcher {
        #[serde(default)]
        version: u32,
        #[serde(default)]
        enabled: bool,
        /// Enabled hot-zone bitmask (ZONE_TL=1 .. ZONE_BOTTOM=0x80).
        #[serde(default)]
        zones: u8,
        /// Activation dwell in ms; 0 = Instant.
        #[serde(rename = "activationMs", default)]
        activation_ms: u32,
        #[serde(rename = "hoverMs", default)]
        hover_ms: u32,
        #[serde(rename = "cornerSize", default)]
        corner_size: u32,
    },
    /// Activate a target window from the Drag Corner Switcher overlay. The
    /// helper replies with WindowActivationResult.
    DragSwitcherActivate {
        #[serde(default)]
        version: u32,
        hwnd: String,
    },
    /// List the running applications for the app picker. The helper replies
    /// with AppList.
    ListApps {
        #[serde(default)]
        version: u32,
    },
    /// Query the cached foreground application (current context). The helper
    /// replies with ActiveApp (fail-open: empty identity when unresolved).
    GetActiveApp {
        #[serde(default)]
        version: u32,
    },
    Shutdown {
        #[serde(default)]
        version: u32,
    },
}

/// Parse one incoming line. Returns None for lines that are not valid JSON
/// objects with a known "type" (malformed input is ignored, never fatal).
pub fn parse_line(line: &str) -> Option<InMessage> {
    if line.trim().is_empty() {
        return None;
    }
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|v| serde_json::from_value::<InMessage>(v).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_configure_with_keys() {
        let msg = parse_line(r#"{"type":"configure","version":1,"keys":[{"vk":20,"mode":"suppress"},{"vk":70,"mode":"pass"}]}"#).unwrap();
        match msg {
            InMessage::Configure { version, keys, .. } => {
                assert_eq!(version, 1);
                assert_eq!(keys.len(), 2);
                assert_eq!(keys[0].vk, 20);
                assert_eq!(keys[0].mode, "suppress");
                assert_eq!(keys[1].vk, 70);
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn parses_remap_spec() {
        let msg = parse_line(r#"{"type":"configure","keys":[{"vk":70,"mode":"remap","remapTo":87}]}"#).unwrap();
        match msg {
            InMessage::Configure { keys, .. } => {
                assert_eq!(keys[0].remap_to, 87);
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn parses_ping_pause_resume_shutdown() {
        assert!(matches!(parse_line(r#"{"type":"ping"}"#), Some(InMessage::Ping { .. })));
        assert!(matches!(parse_line(r#"{"type":"pause"}"#), Some(InMessage::Pause { .. })));
        assert!(matches!(parse_line(r#"{"type":"resume"}"#), Some(InMessage::Resume { .. })));
        assert!(matches!(parse_line(r#"{"type":"shutdown"}"#), Some(InMessage::Shutdown { .. })));
        assert!(matches!(parse_line(r#"{"type":"beginCapture"}"#), Some(InMessage::BeginCapture { .. })));
        assert!(matches!(parse_line(r#"{"type":"stopKeyCapture"}"#), Some(InMessage::StopKeyCapture { .. })));
        assert!(matches!(parse_line(r#"{"type":"setKeyStream","enabled":true}"#), Some(InMessage::SetKeyStream { enabled: true, .. })));
        assert!(matches!(parse_line(r#"{"type":"setWasdNavigation","enabled":true}"#), Some(InMessage::SetWasdNavigation { enabled: true, .. })));
        assert!(matches!(parse_line(r#"{"type":"setWasdNavigation","enabled":false}"#), Some(InMessage::SetWasdNavigation { enabled: false, .. })));
    }

    #[test]
    fn parses_shortcut_configure() {
        let msg = parse_line(
            r#"{"type":"configure","version":1,"shortcuts":[{"id":"sc-f-popup","name":"Popup","key":{"vk":70,"scanCode":33,"extended":false},"modifiers":[],"trigger":{"kind":"double","tapInterval":220},"behavior":"pass","enabled":true}]}"#,
        )
        .unwrap();
        match msg {
            InMessage::Configure { shortcuts, .. } => {
                assert_eq!(shortcuts.len(), 1);
                let s = &shortcuts[0];
                assert_eq!(s.id, "sc-f-popup");
                assert_eq!(s.key.vk, 70);
                assert_eq!(s.key.scan_code, 33);
                assert_eq!(s.trigger.kind(), Some(TriggerKind::Double));
                assert_eq!(s.resolved_behavior(), BehaviorKind::Pass);
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn caps_lock_screenshot_resolves_to_suppress() {
        let msg = parse_line(
            r#"{"type":"configure","shortcuts":[{"id":"sc-3w02ys1","name":"Screenshot","key":{"vk":20,"scanCode":58},"modifiers":[],"trigger":{"kind":"single","tapInterval":220},"behavior":"suppress","enabled":true}]}"#,
        )
        .unwrap();
        match msg {
            InMessage::Configure { shortcuts, .. } => {
                assert_eq!(shortcuts[0].resolved_behavior(), BehaviorKind::Suppress);
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn legacy_behavior_fields_are_compat_fallback() {
        let msg = parse_line(
            r#"{"type":"configure","shortcuts":[{"id":"old","key":{"vk":20},"trigger":{"kind":"single"},"enabled":true,"suppressKey":true}]}"#,
        )
        .unwrap();
        match msg {
            InMessage::Configure { shortcuts, .. } => {
                assert_eq!(shortcuts[0].resolved_behavior(), BehaviorKind::Suppress);
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn disabled_shortcuts_never_suppress() {
        let msg = parse_line(
            r#"{"type":"configure","shortcuts":[{"id":"off","key":{"vk":20},"trigger":{"kind":"single"},"behavior":"suppress","enabled":false}]}"#,
        )
        .unwrap();
        match msg {
            InMessage::Configure { shortcuts, .. } => {
                assert_eq!(shortcuts[0].resolved_behavior(), BehaviorKind::Pass);
            }
            _ => panic!("expected configure"),
        }
    }

    /// Exact wire contract Electron sends at runtime (see
    /// NativeInputHelper.sendConfigure). This guards the real serialized shape,
    /// including the hyperKey field, from silently drifting. A modifier Hyper
    /// key (Right Alt) carries NO tapActionId on the wire — Raycast parity.
    #[test]
    fn parses_exact_runtime_configure_with_hyper() {
        let json = r#"{"type":"configure","version":1,"configVersion":0,"shortcuts":[{"id":"sc-f-popup","name":"Popup","key":{"vk":70,"scanCode":33,"extended":false},"modifiers":[],"trigger":{"kind":"double","tapInterval":220},"behavior":"pass","enabled":true}],"hyperKey":{"enabled":true,"vk":165,"includeShift":false,"suppressOriginal":true}}"#;
        let msg = parse_line(json).unwrap();
        match msg {
            InMessage::Configure { shortcuts, hyper_key, .. } => {
                assert_eq!(shortcuts.len(), 1);
                let h = hyper_key.expect("hyperKey must deserialize from the exact wire JSON");
                assert!(h.enabled, "hyper.enabled must be true");
                assert_eq!(h.vk, 165, "hyper.vk must be 165 (Right Alt)");
                assert!(!h.include_shift);
                assert!(h.suppress_original);
                assert_eq!(
                    h.tap_action_id.as_deref(),
                    None,
                    "modifier Hyper keys must not carry a tapActionId on the wire"
                );
            }
            _ => panic!("expected configure"),
        }
    }

        /// Production compile path end-to-end: the EXACT JSON Electron emits for
    /// Hyper + Y and Hyper + T (compileHyperModifiers folds "hyper" ->
    /// ["ctrl","alt","win"] when includeShift is off). This JSON is parsed the
    /// way main.rs parses it, compiled by Config::apply_shortcuts the way the
    /// configure handler compiles it, and consumed by the real TriggerEngine.
    #[test]
    fn production_compile_path_y_and_t_fire_chords() {
        use crate::config::Config;
        use crate::trigger::{EvState, KeyEvent, TriggerEngine};

        let json = r#"{"type":"configure","version":1,"configVersion":3,"shortcuts":[
            {"id":"sc-hyper-y","name":"Hyper + Y","key":{"vk":89,"scanCode":0,"extended":false},"modifiers":["ctrl","alt","win"],"trigger":{"kind":"single","tapInterval":0,"holdDuration":0,"cooldown":0,"delay":0},"behavior":"pass","remapTo":0,"enabled":true},
            {"id":"sc-hyper-t","name":"Hyper + T","key":{"vk":84,"scanCode":0,"extended":false},"modifiers":["ctrl","alt","win"],"trigger":{"kind":"single","tapInterval":0,"holdDuration":0,"cooldown":0,"delay":0},"behavior":"pass","remapTo":0,"enabled":true}
        ],"hyperKey":{"enabled":true,"vk":165,"includeShift":false,"suppressOriginal":true}}"#;

        crate::inject::test_inject_reset();
        let msg = parse_line(json).unwrap();
        let (shortcuts, hyper_key) = match msg {
            InMessage::Configure { shortcuts, hyper_key, .. } => (shortcuts, hyper_key),
            _ => panic!("expected configure"),
        };

        // 1. Compile exactly as main.rs does.
        let mut cfg = Config::new();
        cfg.apply_shortcuts(&shortcuts);
        let rules = cfg.rules().to_vec();
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].vk, 89, "Y must compile to vk=89");
        assert_eq!(rules[1].vk, 84, "T must compile to vk=84");
        assert_eq!(rules[0].required_mods, crate::config::MOD_BIT_CTRL | crate::config::MOD_BIT_ALT | crate::config::MOD_BIT_WIN);
        assert_eq!(rules[1].required_mods, crate::config::MOD_BIT_CTRL | crate::config::MOD_BIT_ALT | crate::config::MOD_BIT_WIN);

        // 2. Consume through the production engine.
        let mut engine = TriggerEngine::new();
        engine.set_hyper_key(hyper_key.clone());
        engine.reload(rules);

        // Hyper + Y: Right Alt (0xA5) down, then Y (0x59? no — Y vk is 89) down.
        let down = |e: &mut TriggerEngine, vk: u32, at: u64| {
            e.key_event(KeyEvent { state: EvState::Down, vk, scan: 0, extended: false, repeat: false, injected: false, at: std::time::Duration::from_millis(at) })
        };
        let up = |e: &mut TriggerEngine, vk: u32, at: u64| {
            e.key_event(KeyEvent { state: EvState::Up, vk, scan: 0, extended: false, repeat: false, injected: false, at: std::time::Duration::from_millis(at) })
        };

        down(&mut engine, 0xA5, 0);
        let fy = down(&mut engine, 89, 30);
        assert_eq!(fy.len(), 1, "Hyper + Y must fire through the production engine");
        assert_eq!(fy[0].id, "sc-hyper-y");
        up(&mut engine, 89, 50);
        let f_up_y = up(&mut engine, 0xA5, 80);
        assert!(f_up_y.is_empty(), "no tap after Hyper+Y chord");
        assert!(!engine.is_hyper_active(), "engine must return to Idle after Hyper+Y");

        // Hyper + T after a clean reset.
        down(&mut engine, 0xA5, 200);
        let ft = down(&mut engine, 84, 230);
        assert_eq!(ft.len(), 1, "Hyper + T must fire through the production engine");
        assert_eq!(ft[0].id, "sc-hyper-t");
        up(&mut engine, 84, 250);
        let f_up_t = up(&mut engine, 0xA5, 280);
        assert!(f_up_t.is_empty());
        assert!(!engine.is_hyper_active(), "engine must return to Idle after Hyper+T");
        assert_eq!(
            crate::inject::test_inject_count(),
            0,
            "production Hyper+Y/T must never call SendInput (virtual recognition)"
        );
    }

    #[test]
    fn sequence_trigger_has_no_spec_and_is_ignored() {
        let spec = TriggerSpec {
            kind_raw: "sequence".to_string(),
            tap_interval: 0,
            hold_duration: 0,
            cooldown: 0,
            delay: 0,
        };
        assert_eq!(spec.kind(), None);
    }

    #[test]
    fn malformed_lines_are_ignored_not_fatal() {
        assert!(parse_line("").is_none());
        assert!(parse_line("not json").is_none());
        assert!(parse_line(r#"{"type":"unknown"}"#).is_none());
        assert!(parse_line(r#"{"keys":[]}"#).is_none());
        assert!(parse_line(r#"null"#).is_none());
        assert!(parse_line(r#"{"type":"configure","keys":[{"vk":"x"}]}"#).is_none());
    }

    #[test]
    fn parses_inject_key() {
        let msg = parse_line(r#"{"type":"injectKey","version":1,"vk":179,"extended":false,"down":true,"seq":7}"#).unwrap();
        match msg {
            InMessage::InjectKey { vk, extended, down, seq, .. } => {
                assert_eq!(vk, 0xB3, "PlayPause must be 0xB3");
                assert!(!extended);
                assert!(down);
                assert_eq!(seq, 7);
            }
            _ => panic!("expected injectKey"),
        }
    }

    #[test]
    fn parses_set_drag_switcher() {
        let msg = parse_line(
            r#"{"type":"setDragSwitcher","version":1,"enabled":true,"zones":2,"activationMs":250,"hoverMs":400,"cornerSize":16}"#,
        )
        .unwrap();
        match msg {
            InMessage::SetDragSwitcher { enabled, zones, activation_ms, hover_ms, corner_size, .. } => {
                assert!(enabled);
                assert_eq!(zones, 2);
                assert_eq!(activation_ms, 250);
                assert_eq!(hover_ms, 400);
                assert_eq!(corner_size, 16);
            }
            _ => panic!("expected setDragSwitcher"),
        }
    }

    #[test]
    fn set_drag_switcher_defaults_zones_to_top_right() {
        // Backward-compatible wire shape: absent V2 fields default safely.
        let msg = parse_line(r#"{"type":"setDragSwitcher","version":1,"enabled":true}"#).unwrap();
        match msg {
            InMessage::SetDragSwitcher { enabled, zones, activation_ms, hover_ms, corner_size, .. } => {
                assert!(enabled);
                assert_eq!(zones, 0, "0 means 'unspecified' -> machine picks top-right");
                assert_eq!(activation_ms, 0, "0 activation = Instant (opt-in default)");
                assert_eq!(hover_ms, 0);
                assert_eq!(corner_size, 0);
            }
            _ => panic!("expected setDragSwitcher"),
        }
    }

    #[test]
    fn parses_drag_switcher_activate() {
        let msg = parse_line(r#"{"type":"dragSwitcherActivate","version":1,"hwnd":"123456"}"#).unwrap();
        match msg {
            InMessage::DragSwitcherActivate { hwnd, .. } => {
                assert_eq!(hwnd, "123456");
            }
            _ => panic!("expected dragSwitcherActivate"),
        }
    }

    #[test]
    fn drag_switcher_show_json_shape() {
        let json = OutMessage::DragSwitcherShow {
            version: 1,
            monitor_index: 0,
            monitor_left: 0,
            monitor_top: 0,
            monitor_right: 1920,
            monitor_bottom: 1080,
            work_left: 0,
            work_top: 0,
            work_right: 1920,
            work_bottom: 1040,
            cursor_x: 1900,
            cursor_y: 10,
            source_hwnd: "65570".to_string(),
            hover_dwell_ms: 400,
            windows: vec![WindowEntry {
                hwnd: "65570".to_string(),
                title: "Notepad".to_string(),
                app: "Notepad".to_string(),
                icon: Some("Qk1".to_string()),
            }],
        }
        .to_json();
        assert!(json.contains(r#""type":"dragSwitcherShow""#));
        assert!(json.contains(r#""monitorIndex":0"#));
        assert!(json.contains(r#""windows""#));
        assert!(json.contains(r#""hoverDwellMs":400"#));
    }

    #[test]
    fn drag_switcher_move_json_shape() {
        let json = OutMessage::DragSwitcherMove { version: 1, x: 1900, y: 12 }.to_json();
        assert!(json.contains(r#""type":"dragSwitcherMove""#));
        assert!(json.contains(r#""x":1900"#));
        assert!(json.contains(r#""y":12"#));
    }

    #[test]
    fn drag_switcher_hide_json_shape() {
        let json = OutMessage::DragSwitcherHide { version: 1, reason: "mouseUp".to_string() }.to_json();
        assert!(json.contains(r#""type":"dragSwitcherHide""#));
        assert!(json.contains(r#""reason":"mouseUp""#));
    }

    #[test]
    fn window_activation_result_json_shape() {
        let json = OutMessage::WindowActivationResult {
            version: 1,
            hwnd: "65570".to_string(),
            success: true,
            reason: "activated".to_string(),
        }
        .to_json();
        assert!(json.contains(r#""type":"windowActivationResult""#));
        assert!(json.contains(r#""success":true"#));
        assert!(json.contains(r#""reason":"activated""#));
    }

    #[test]
    fn injected_json_shape() {
        let json = OutMessage::Injected { version: 1, sequence: 7, ok: true, error: None }.to_json();
        assert!(json.contains(r#""type":"injected""#));
        assert!(json.contains(r#""seq":7"#));
        assert!(json.contains(r#""ok":true"#));
    }

    #[test]
    fn ready_json_shape() {
        let json = OutMessage::Ready { version: 1, pid: 42, build: None }.to_json();
        assert!(json.contains(r#""type":"ready""#));
        assert!(json.contains(r#""pid":42"#));
    }

    #[test]
    fn key_json_shape() {
        let json = OutMessage::Key {
            version: 1,
            sequence: 7,
            state: "down",
            vk: 20,
            scan_code: 58,
            extended: false,
            injected: false,
            lower_integrity_injected: false,
        }
        .to_json();
        assert!(json.contains(r#""type":"key""#));
        assert!(json.contains(r#""sequence":7"#));
        assert!(json.contains(r#""state":"down""#));
        assert!(json.contains(r#""vk":20"#));
        assert!(json.contains(r#""scanCode":58"#));
    }

    #[test]
    fn parses_scoped_shortcut_spec() {
        let msg = parse_line(
            r#"{"type":"configure","shortcuts":[{"id":"sc-ps","name":"3 -> Tab","key":{"vk":51,"scanCode":0,"extended":false},"modifiers":[],"trigger":{"kind":"single"},"behavior":"remap","remapTo":9,"enabled":true,"appScope":{"scopeType":"executable","executablePath":"C:\\Program Files\\Adobe\\Photoshop\\Photoshop.exe","processName":"Photoshop","displayName":"Adobe Photoshop"}}]}"#,
        )
        .unwrap();
        match msg {
            InMessage::Configure { shortcuts, .. } => {
                let scope = shortcuts[0].app_scope.as_ref().expect("appScope must deserialize");
                assert_eq!(scope.scope_type, "executable");
                assert_eq!(scope.executable_path, r"C:\Program Files\Adobe\Photoshop\Photoshop.exe");
                assert_eq!(scope.process_name.as_deref(), Some("Photoshop"));
                assert_eq!(scope.display_name.as_deref(), Some("Adobe Photoshop"));
                assert!(!scope.is_global());
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn missing_app_scope_defaults_to_global() {
        let msg = parse_line(r#"{"type":"configure","shortcuts":[{"id":"g","key":{"vk":51},"trigger":{"kind":"single"},"behavior":"pass","enabled":true}]}"#).unwrap();
        match msg {
            InMessage::Configure { shortcuts, .. } => {
                assert!(shortcuts[0].app_scope.is_none(), "absent appScope must be None (global)");
            }
            _ => panic!("expected configure"),
        }
    }

    #[test]
    fn everywhere_scope_is_global() {
        let scope: AppScope = serde_json::from_str(r#"{"scopeType":"everywhere","executablePath":""}"#).unwrap();
        assert!(scope.is_global());
    }

    #[test]
    fn parses_list_apps_and_app_list_shape() {
        assert!(matches!(parse_line(r#"{"type":"listApps","version":1}"#), Some(InMessage::ListApps { .. })));
        let json = OutMessage::AppList {
            version: 1,
            apps: vec![AppInfo {
                executable_path: r"C:\Windows\System32\notepad.exe".to_string(),
                process_name: Some("notepad".to_string()),
                display_name: Some("Untitled - Notepad".to_string()),
                icon: Some("Qk1".to_string()),
            }],
        }
        .to_json();
        assert!(json.contains(r#""type":"appList""#));
        assert!(json.contains(r#""executablePath""#));
        assert!(json.contains(r#""processName":"notepad""#));
    }

    #[test]
    fn parses_get_active_app_and_active_app_shape() {
        assert!(matches!(parse_line(r#"{"type":"getActiveApp","version":1}"#), Some(InMessage::GetActiveApp { .. })));
        let json = OutMessage::ActiveApp {
            version: 1,
            executable_path: r"C:\Windows\System32\notepad.exe".to_string(),
            process_name: Some("notepad".to_string()),
            display_name: Some("Untitled - Notepad".to_string()),
        }
        .to_json();
        assert!(json.contains(r#""type":"activeApp""#));
        assert!(json.contains(r#""executablePath""#));
        assert!(json.contains(r#""processName":"notepad""#));
    }

    #[test]
    fn active_app_fail_open_shape() {
        let json = OutMessage::ActiveApp {
            version: 1,
            executable_path: String::new(),
            process_name: None,
            display_name: None,
        }
        .to_json();
        assert!(json.contains(r#""type":"activeApp""#));
        assert!(json.contains(r#""executablePath":""#));
    }
}
