//! WH_KEYBOARD_LL hook: per-key policy + feeding the native trigger engine.
//!
//! Design:
//! - The decision logic lives in the pure `decide()` function so it can be
//!   unit-tested without Windows.
//! - Own injected events (dwExtraInfo == marker) are forwarded silently and
//!   never re-processed, so remap output cannot recursively trigger KeyFlow.
//! - Every non-own physical key event feeds TriggerEngine (down AND up) so
//!   gesture state stays consistent even for swallowed keys. The engine's
//!   `Triggered` results — not raw key events — are what Electron routes on.
//! - Deadlines (double-tap windows, hold thresholds) are met via a single
//!   SetTimer on the hook thread; the WM_TIMER handler runs the engine's
//!   timer_event and reschedules.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::SyncSender;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, HHOOK, KillTimer, LLKHF_EXTENDED, LLKHF_INJECTED,
    LLKHF_LOWER_IL_INJECTED, SetTimer, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_TIMER, KBDLLHOOKSTRUCT, MSG,
};

use crate::config::{KeyBehavior, CONFIG};
use crate::inject::send_vk;
use crate::keymap::{EMERGENCY_BYPASS_MASK, is_f12, modifier_bit};
use crate::protocol::{OWN_INJECTED_MARKER, OutMessage, PROTOCOL_VERSION};
use crate::trigger::{EvState, Fired, KeyEvent, TriggerEngine};

const TIMER_ID: usize = 0x4B46; // "KF"

/// Sender shared with main.rs. Messages are dropped (try_send) when Electron
/// is not reading fast enough — losing a key report is safer than blocking
/// the hook thread.
pub static SENDER: Mutex<Option<SyncSender<String>>> = Mutex::new(None);

static PRESSED: AtomicU32 = AtomicU32::new(0);
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
/// Development diagnostics: when false (production default) raw key events are
/// NOT reported; only Triggered/Bypass/CapturedKey flow to Electron.
static KEY_STREAM: AtomicBool = AtomicBool::new(false);
/// When set, the next physical key is reported once as CapturedKey.
static CAPTURING: AtomicBool = AtomicBool::new(false);

/// Monotonic epoch for the engine clock. All `at` durations are relative to it.
static EPOCH: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
fn now_at() -> Duration {
    EPOCH.get_or_init(Instant::now).elapsed()
}

/// The native gesture engine. Shared between the hook callback, the timer
/// handler and main.rs's configure/pause paths.
pub static ENGINE: Mutex<Option<TriggerEngine>> = Mutex::new(None);

pub fn queue(line: String) {
    if let Ok(guard) = SENDER.lock() {
        if let Some(sender) = guard.as_ref() {
            let _ = sender.try_send(line);
        }
    }
}

/// Reload the engine's rules from CONFIG. Call after every Configure.
pub fn reload_engine() {
    reload_engine_with_hyper(None);
}

pub fn reload_engine_with_hyper(hyper_key: Option<crate::protocol::HyperKeySpec>) {
    let cfg = CONFIG.lock().unwrap_or_else(|p| p.into_inner());
    let rules = cfg.rules().to_vec();
    let threshold = cfg.typing_idle_threshold();
    drop(cfg);

    let mut engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
    if engine.is_none() {
        *engine = Some(TriggerEngine::new());
    }
    let e = engine.as_mut().unwrap();
    e.set_typing_idle_threshold(threshold);
    e.set_hyper_key(hyper_key);
    e.reload(rules);
}

pub fn set_engine_paused(paused: bool) {
    if let Ok(mut engine) = ENGINE.lock() {
        if let Some(e) = engine.as_mut() {
            e.set_paused(paused);
        }
    }
}

pub fn set_key_stream(enabled: bool) {
    KEY_STREAM.store(enabled, Ordering::SeqCst);
}

pub fn arm_capture() {
    CAPTURING.store(true, Ordering::SeqCst);
}

/// Action taken for a key on the hook thread.
#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    /// Forward to Windows, report raw key (diagnostics only).
    Pass,
    /// Forward to Windows, do not report.
    PassSilent,
    /// Swallow, report raw key (diagnostics only).
    Consume,
    /// Swallow, do not report.
    ConsumeMute,
    /// Swallow and SendInput the given replacement (down events only).
    ConsumeRemap(u32),
}

pub fn decide(down: bool, own: bool, bypass: bool, behavior: KeyBehavior) -> Decision {
    if own || bypass {
        return Decision::PassSilent;
    }
    match behavior {
        KeyBehavior::Pass => Decision::Pass,
        KeyBehavior::Suppress => Decision::Consume,
        KeyBehavior::Disable => Decision::ConsumeMute,
        KeyBehavior::Remap(to) if down => Decision::ConsumeRemap(to),
        KeyBehavior::Remap(_) => Decision::ConsumeMute,
    }
}

#[inline]
fn emit_fired(fired: &[Fired]) {
    for f in fired {
        queue(
            OutMessage::Triggered {
                version: PROTOCOL_VERSION,
                shortcut_id: f.id.clone(),
                generation: f.generation,
            }
            .to_json(),
        );
    }
}

/// (Re)arm the single deadline timer to the engine's nearest deadline, if any.
/// Must run on the hook thread (it owns the message queue). kbd.time from the
/// last event is used as a jitter-free reference point.
fn reschedule_deadline() {
    unsafe {
        let _ = KillTimer(std::ptr::null_mut(), TIMER_ID);
        let deadline = ENGINE
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .as_ref()
            .and_then(|e| e.next_deadline());
        if let Some(until) = deadline {
            let now = now_at();
            let ms = until.saturating_sub(now).as_millis().clamp(1, 65_536) as u32;
            if ms <= u32::MAX as u32 {
                let _ = SetTimer(std::ptr::null_mut(), TIMER_ID, ms, None);
            }
        }
    }
}

fn report_key(state: &'static str, kbd: &KBDLLHOOKSTRUCT, extended: bool, injected: bool, lower: bool) {
    if !KEY_STREAM.load(Ordering::SeqCst) {
        return; // production: raw key events are off
    }
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed) + 1;
    queue(
        OutMessage::Key {
            version: PROTOCOL_VERSION,
            sequence,
            state,
            vk: kbd.vkCode,
            scan_code: kbd.scanCode,
            extended,
            injected,
            lower_integrity_injected: lower,
        }
        .to_json(),
    );
}

/// The hook callback. `lparam` is only valid while inside the callback.
unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let call_next = || CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    if code < 0 {
        return call_next();
    }

    let msg = wparam as u32;
    let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
    if !down && !up {
        return call_next();
    }

    let kbd = &*(lparam as *const KBDLLHOOKSTRUCT);
    let extended = kbd.flags & LLKHF_EXTENDED != 0;
    let injected = kbd.flags & LLKHF_INJECTED != 0;
    let lower = kbd.flags & LLKHF_LOWER_IL_INJECTED != 0;
    let own = kbd.dwExtraInfo == OWN_INJECTED_MARKER;

    // Track Ctrl/Alt/Shift/F12 state (sticky-proof: clears on key-up).
    let mut mask = PRESSED.load(Ordering::SeqCst);
    let bit = if is_f12(kbd.vkCode) { 8 } else { modifier_bit(kbd.vkCode) };
    if down {
        mask |= bit;
    } else {
        mask &= !bit;
    }
    PRESSED.store(mask, Ordering::SeqCst);

    // Bypass chord activation reports a Bypass message so Electron can log it.
    if down && is_f12(kbd.vkCode) && mask & EMERGENCY_BYPASS_MASK == EMERGENCY_BYPASS_MASK {
        if let Ok(mut cfg) = CONFIG.lock() {
            cfg.latch_bypass();
        }
        queue(OutMessage::Bypass { version: PROTOCOL_VERSION, active: true }.to_json());
        return call_next();
    }

    let (behavior, bypass) = {
        let cfg = CONFIG.lock().unwrap_or_else(|p| p.into_inner());
        (cfg.behavior_of(kbd.vkCode), cfg.is_bypass())
    };

    // Capture mode: the next NON-injected key is captured once, unchanged.
    if CAPTURING.load(Ordering::SeqCst) && down && !own && !injected {
        CAPTURING.store(false, Ordering::SeqCst);
        if let Ok(mut engine) = ENGINE.lock() {
            if let Some(e) = engine.as_mut() {
                e.reset();
                reschedule_deadline();
            }
        }
        queue(
            OutMessage::CapturedKey {
                version: PROTOCOL_VERSION,
                vk: kbd.vkCode,
                scan_code: kbd.scanCode,
                extended,
                name: crate::keymap::vk_name(kbd.vkCode).to_string(),
            }
            .to_json(),
        );
    }

    // Feed the gesture engine with every non-own key (down AND up) so its
    // gesture state and modifier tracking stay consistent, then emit any
    // completed gestures and re-arm the deadline timer.
    if !own && !bypass {
        let fired = {
            let mut engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(e) = engine.as_mut() {
                e.key_event(KeyEvent {
                    state: if down { EvState::Down } else { EvState::Up },
                    vk: kbd.vkCode,
                    scan: kbd.scanCode,
                    extended,
                    repeat: false,
                    at: now_at(),
                })
            } else {
                Vec::new()
            }
        };
        emit_fired(&fired);
        reschedule_deadline();
    }

    let is_hyper_suppressed = {
        let engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
        engine.as_ref().map_or(false, |e| e.is_hyper_key_suppressed(kbd.vkCode))
    };

    let decision = if !own && !bypass && is_hyper_suppressed {
        Decision::Consume
    } else {
        decide(down, own, bypass, behavior)
    };
    match decision {
        Decision::Pass => {
            report_key(if down { "down" } else { "up" }, kbd, extended, injected, lower);
            call_next()
        }
        Decision::PassSilent => call_next(),
        Decision::Consume => {
            report_key(if down { "down" } else { "up" }, kbd, extended, injected, lower);
            1
        }
        Decision::ConsumeMute => 1,
        Decision::ConsumeRemap(to) => {
            send_vk(to, kbd.scanCode, extended, true);
            1
        }
    }
}

/// Handle a WM_TIMER from the deadline timer.
unsafe fn handle_timer() {
    let fired = {
        let mut engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
        engine.as_mut().map(|e| e.timer_event(now_at())).unwrap_or_default()
    };
    emit_fired(&fired);
    reschedule_deadline();
}

pub fn install_hook() -> HHOOK {
    unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), std::ptr::null_mut(), 0) }
}

/// Unhook with a bounded retry loop; WH_KEYBOARD_LL can briefly fail if the
/// callback is still being dispatched.
pub fn uninstall_hook(hook: HHOOK) {
    for _ in 0..10 {
        if !hook.is_null() && unsafe { UnhookWindowsHookEx(hook) } != 0 {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

/// Runs the hook message loop until WM_QUIT arrives. WM_TIMER from the
/// deadline timer runs the engine's timer_event.
pub fn message_loop() {
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            if msg.message == WM_TIMER && msg.wParam == TIMER_ID {
                handle_timer();
                continue;
            }
            let _ = TranslateMessage(&msg);
            let _ = DispatchMessageW(&msg);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pass_through_and_report() {
        assert_eq!(decide(true, false, false, KeyBehavior::Pass), Decision::Pass);
    }

    #[test]
    fn suppress_consumes_but_reports() {
        assert_eq!(decide(true, false, false, KeyBehavior::Suppress), Decision::Consume);
        // Up events of a suppressed key are swallowed too.
        assert_eq!(decide(false, false, false, KeyBehavior::Suppress), Decision::Consume);
    }

    #[test]
    fn disable_is_muted() {
        assert_eq!(decide(true, false, false, KeyBehavior::Disable), Decision::ConsumeMute);
    }

    #[test]
    fn remap_down_injects_up_is_muted() {
        assert_eq!(decide(true, false, false, KeyBehavior::Remap(87)), Decision::ConsumeRemap(87));
        assert_eq!(decide(false, false, false, KeyBehavior::Remap(87)), Decision::ConsumeMute);
    }

    #[test]
    fn own_injection_never_reprocesses() {
        assert_eq!(decide(true, true, false, KeyBehavior::Disable), Decision::PassSilent);
    }

    #[test]
    fn bypass_latch_passes_everything() {
        assert_eq!(decide(true, false, true, KeyBehavior::Disable), Decision::PassSilent);
    }
}