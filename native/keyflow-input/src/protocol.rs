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
    /// Auth handshake message sent when connected via authenticated named pipe.
    Auth {
        version: u32,
        token: String,
    },
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

#[derive(Debug, Deserialize)]
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
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSpec {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub key: KeyIdentity,
    #[serde(default)]
    pub modifiers: Vec<u32>,
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
        #[serde(default)]
        shortcuts: Vec<ShortcutSpec>,
        /// Legacy per-key policy list; applied only when `shortcuts` is empty.
        #[serde(default)]
        keys: Vec<KeySpec>,
        #[serde(default)]
        typing_protection: Option<String>,
        #[serde(default)]
        typing_idle_ms: Option<u32>,
        #[serde(default)]
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
    /// Development diagnostics only: when enabled the helper also streams raw
    /// `key` events. Production leaves this off.
    SetKeyStream {
        #[serde(default)]
        version: u32,
        #[serde(default)]
        enabled: bool,
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
        assert!(matches!(parse_line(r#"{"type":"setKeyStream","enabled":true}"#), Some(InMessage::SetKeyStream { enabled: true, .. })));
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
    fn ready_json_shape() {
        let json = OutMessage::Ready { version: 1, pid: 42 }.to_json();
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
}
