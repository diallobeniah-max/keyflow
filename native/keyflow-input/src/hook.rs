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

use crate::app_scope;
use crate::config::{KeyBehavior, CONFIG};
use crate::drag_switcher;
use crate::inject::send_vk;
use crate::keymap::{EMERGENCY_BYPASS_MASK, is_f12, modifier_bit};
use crate::navigation_mode::{NavOutcome, NavigationMode};
use crate::protocol::{OWN_INJECTED_MARKER, OutMessage, PROTOCOL_VERSION};
use crate::remap;
use crate::trigger::{EvState, Fired, KeyEvent, TriggerEngine};

const TIMER_ID: usize = 0x4B46; // "KF"

/// Sender shared with main.rs. Messages are dropped (try_send) when Electron
/// is not reading fast enough — losing a key report is safer than blocking
/// the hook thread.
pub static SENDER: Mutex<Option<SyncSender<String>>> = Mutex::new(None);

static PRESSED: AtomicU32 = AtomicU32::new(0);
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
/// Foreground generation observed by the hook thread. Bumping it (see
/// app_scope::set_active) triggers on_foreground_change on the next key event.
static LAST_FOREGROUND_GEN: AtomicU64 = AtomicU64::new(0);
/// Development diagnostics: when false (production default) raw key events are
/// NOT reported; only Triggered/Bypass/CapturedKey flow to Electron.
static KEY_STREAM: AtomicBool = AtomicBool::new(false);
/// When set, the next physical key is reported once as CapturedKey.
static CAPTURING: AtomicBool = AtomicBool::new(false);
/// The vk captured by the last capture — its matching keyUP is consumed so a
/// captured remap source (or Caps Lock) never leaks its original behavior.
static CAPTURED_VK: AtomicU32 = AtomicU32::new(0);
/// Self-healing deadline for capture mode. Capture disarms on the first
/// captured key, but if arming races a UI teardown (beginCapture ack arrives
/// after the renderer cancelled) the hook can be left armed forever, swallowing
/// every subsequent key. The deadline lets the next keydown disarm a stale
/// capture instead of dying silently.
static CAPTURE_DEADLINE: Mutex<Option<Instant>> = Mutex::new(None);
/// Development key-state trace (opt-in via KEYFLOW_DEBUG_KEYS) so a physical
/// "works once then dies" repro can show the exact first differing state.
static DEBUG_KEYS: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
fn debug_keys() -> bool {
    *DEBUG_KEYS.get_or_init(|| std::env::var("KEYFLOW_DEBUG_KEYS").is_ok())
}

/// Monotonic epoch for the engine clock. All `at` durations are relative to it.
static EPOCH: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
pub fn now_at() -> Duration {
    EPOCH.get_or_init(Instant::now).elapsed()
}

/// The native gesture engine. Shared between the hook callback, the timer
/// handler and main.rs's configure/pause paths.
pub static ENGINE: Mutex<Option<TriggerEngine>> = Mutex::new(None);

/// WASD Navigation Mode state. Only ever touched from the hook thread via
/// `handle` (inside hook_proc) and from the protocol reader via the setters;
/// short critical sections make that safe.
static NAV: Mutex<NavigationMode> = Mutex::new(NavigationMode::new());

fn apply_injects(injects: &[(u32, bool)]) {
    for &(vk, down) in injects {
        // Arrow keys need the extended flag; scan code 0 lets Windows resolve.
        send_vk(vk, 0, true, down);
    }
}

fn apply_injects3(injects: &[(u32, bool, bool)]) {
    for &(vk, down, extended) in injects {
        send_vk(vk, 0, extended, down);
    }
}

/// Release every injected remap target key (pause / reload / shutdown / bypass).
pub fn release_remaps() {
    let injects = remap::release_all();
    apply_injects3(&injects);
}

pub fn set_wasd_navigation(enabled: bool) {
    let mut nav = NAV.lock().unwrap_or_else(|p| p.into_inner());
    let injects = nav.set_active(enabled);
    drop(nav);
    apply_injects(&injects);
}

pub fn set_wasd_paused(paused: bool) {
    let mut nav = NAV.lock().unwrap_or_else(|p| p.into_inner());
    let injects = nav.set_paused(paused);
    drop(nav);
    apply_injects(&injects);
}

pub fn release_wasd_arrows() {
    let mut nav = NAV.lock().unwrap_or_else(|p| p.into_inner());
    let injects = nav.release_all();
    drop(nav);
    apply_injects(&injects);
}

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

    // Reconfiguring invalidates remap ownership: release any injected target
    // keys so none stay stuck, and hide an open drag switcher overlay.
    release_remaps();
    drag_switcher::hide_all(crate::drag_switcher::HideReason::Reload);

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
    eprintln!("[key-capture] start");
    CAPTURING.store(true, Ordering::SeqCst);
    *CAPTURE_DEADLINE.lock().unwrap() = Some(Instant::now() + Duration::from_secs(8));
}

pub fn disarm_capture() {
    CAPTURING.store(false, Ordering::SeqCst);
    CAPTURED_VK.store(0, Ordering::SeqCst);
    *CAPTURE_DEADLINE.lock().unwrap() = None;
}

/// Reconcile scoped state after the foreground app changed: release any held
/// remap whose rule no longer applies, apply the released-target UP injections,
/// and hand the new active app to the engine (which resets scoped gesture state
/// without touching global gestures). Runs on the hook thread only.
fn on_foreground_change() {
    let app = app_scope::current();
    let injects = {
        let cfg = CONFIG.lock().unwrap_or_else(|p| p.into_inner());
        remap::on_scope_change(|vk| cfg.behavior_of(vk, app.as_ref()))
    };
    apply_injects3(&injects);
    if let Ok(mut engine) = ENGINE.lock() {
        if let Some(e) = engine.as_mut() {
            e.set_active_app(app);
        }
    }
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
    /// Swallow and SendInput the given replacement key with true hold
    /// semantics: source DOWN injects target DOWN, source UP injects target UP.
    ConsumeRemap(u32),
}

pub fn decide(_down: bool, own: bool, bypass: bool, behavior: KeyBehavior) -> Decision {
    if own || bypass {
        return Decision::PassSilent;
    }
    match behavior {
        KeyBehavior::Pass => Decision::Pass,
        KeyBehavior::Suppress => Decision::Consume,
        KeyBehavior::Disable => Decision::ConsumeMute,
        KeyBehavior::Remap(to) => Decision::ConsumeRemap(to),
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

/// (Re)arm the single deadline timer to the nearest deadline, if any. Must run
/// on the hook thread (it owns the message queue). kbd.time from the last
/// event is used as a jitter-free reference point. The deadline is the earlier
/// of the gesture engine's next deadline and the drag switcher's corner dwell.
pub(crate) fn reschedule_deadline() {
    unsafe {
        let _ = KillTimer(std::ptr::null_mut(), TIMER_ID);
        let now = now_at();
        let deadline = {
            let engine_deadline = ENGINE
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .as_ref()
                .and_then(|e| e.next_deadline());
            let switcher_deadline = drag_switcher::next_deadline(now);
            match (engine_deadline, switcher_deadline) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (a, b) => a.or(b),
            }
        };
        if let Some(until) = deadline {
            let ms = until.saturating_sub(now).as_millis().clamp(1, 65_536) as u32;
            if ms <= u32::MAX as u32 {
                let _ = SetTimer(std::ptr::null_mut(), TIMER_ID, ms, None);
            }
        }
    }
}

/// Like `reschedule_deadline` but takes a pre-computed engine deadline to avoid
/// re-locking ENGINE. Used from `hook_proc_inner` where the ENGINE lock was
/// already held to process the key event.
pub(crate) fn reschedule_deadline_with(engine_deadline: Option<Duration>) {
    unsafe {
        let _ = KillTimer(std::ptr::null_mut(), TIMER_ID);
        let now = now_at();
        let switcher_deadline = drag_switcher::next_deadline(now);
        let deadline = match (engine_deadline, switcher_deadline) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        };
        if let Some(until) = deadline {
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
///
/// Wrapped in `catch_unwind` by `hook_proc` so an unexpected panic in
/// per-key processing can never unwind across the FFI boundary — that would
/// unload the LL hook and kill EVERY shortcut. On panic we log and pass the
/// key through so the engine (and the user's keyboard) stays alive.
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

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
        hook_proc_inner(code, wparam, lparam)
    }));
    match result {
        Ok(r) => r,
        Err(_) => {
            eprintln!(
                "[hook] PANIC caught in hook callback; passing event through to keep keyboard alive"
            );
            call_next()
        }
    }
}

/// Body of the hook callback. Split out so `hook_proc` can wrap it in
/// `catch_unwind`. See `hook_proc`.
unsafe fn hook_proc_inner(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let call_next = || CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    let msg = wparam as u32;
    let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
    if !down && !up {
        return call_next();
    }

    let kbd = &*(lparam as *const KBDLLHOOKSTRUCT);

    // Foreground change detection: when the app-scope generation bumped, the
    // active application changed. Reconcile scoped remaps/gestures on the hook
    // thread (single place that owns engine state mutations).
    let gen = app_scope::generation();
    if gen != LAST_FOREGROUND_GEN.load(Ordering::SeqCst) {
        LAST_FOREGROUND_GEN.store(gen, Ordering::SeqCst);
        on_foreground_change();
    }

    // Drag Corner Switcher cancel: Escape while the overlay is open hides it.
    // The Escape still reaches Windows so the OS can cancel the Explorer drag.
    if down && kbd.vkCode == 0x1B && drag_switcher::is_shown() {
        drag_switcher::handle_escape();
    }
    let extended = kbd.flags & LLKHF_EXTENDED != 0;
    let injected = kbd.flags & LLKHF_INJECTED != 0;
    let lower = kbd.flags & LLKHF_LOWER_IL_INJECTED != 0;
    let own = kbd.dwExtraInfo == OWN_INJECTED_MARKER;

    // Capture mode runs BEFORE any shortcut matching: the next genuine physical
    // key is captured once and consumed (down AND matching up) so a captured
    // remap source never types its original char and Caps Lock never toggles.
    // The captured press produces NO normal shortcut/hyper/remap logs.
    let captured_vk = CAPTURED_VK.load(Ordering::SeqCst);
    if captured_vk != 0 && !down && kbd.vkCode == captured_vk {
        CAPTURED_VK.store(0, Ordering::SeqCst);
        return 1;
    }
    // Self-heal: a stale armed capture (deadline elapsed) is disarmed on the
    // next keydown so it can never permanently swallow physical keys. After
    // disarm the key falls through to normal shortcut matching below.
    if CAPTURING.load(Ordering::SeqCst) {
        let expired = CAPTURE_DEADLINE
            .lock()
            .ok()
            .and_then(|d| *d)
            .map(|t| Instant::now() >= t)
            .unwrap_or(false);
        if expired {
            CAPTURING.store(false, Ordering::SeqCst);
            CAPTURED_VK.store(0, Ordering::SeqCst);
            eprintln!(
                "[key-capture] self-heal: disarmed stale capture on key vk=0x{:x}",
                kbd.vkCode
            );
        }
    }
    if CAPTURING.load(Ordering::SeqCst) && down && !own && !injected {
        // Escape cancels an in-progress capture. It is NOT captured as a key:
        // the renderer exits the listening state instead. The matching key-up
        // is allowed through (CAPTURING is already cleared).
        if kbd.vkCode == 0x1B {
            CAPTURING.store(false, Ordering::SeqCst);
            CAPTURED_VK.store(0, Ordering::SeqCst);
            eprintln!("[key-capture] escape cancel");
            queue(
                OutMessage::CaptureCancelled {
                    version: PROTOCOL_VERSION,
                }
                .to_json(),
            );
            return 1;
        }
        CAPTURING.store(false, Ordering::SeqCst);
        {
            let mut engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(e) = engine.as_mut() {
                e.reset();
            }
        }
        reschedule_deadline_with(None);
        eprintln!(
            "[key-capture] physical vk=0x{:x} scan={} key={}",
            kbd.vkCode,
            kbd.scanCode,
            crate::keymap::vk_name(kbd.vkCode)
        );
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
        eprintln!(
            "[key-capture] emitted key={} stop reason=captured",
            crate::keymap::vk_name(kbd.vkCode)
        );
        return 1;
    }

    let is_hyper_candidate = kbd.vkCode == 0xA5 || kbd.vkCode == 0xA3 || kbd.vkCode == 0x91 || kbd.vkCode == 0x5D || kbd.vkCode == 0x12 || kbd.vkCode == 0x11 || kbd.vkCode == 0xA2;
    if is_hyper_candidate {
        eprintln!(
            "[hyper-forensic] RAW msg={} vk={} scanCode={} flags={} extended={} injected={} lowerIntegrityInjected={} extraInfo={:#x}",
            if down { "keydown" } else { "keyup" },
            kbd.vkCode,
            kbd.scanCode,
            kbd.flags,
            extended,
            injected,
            lower,
            kbd.dwExtraInfo
        );
    }

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
        // Emergency bypass: never leave injected navigation arrows stuck down.
        release_wasd_arrows();
        release_remaps();
        crate::system_cursor::restore_default_cursor();
        drag_switcher::hide_all(crate::drag_switcher::HideReason::Bypass);
        queue(OutMessage::Bypass { version: PROTOCOL_VERSION, active: true }.to_json());
        return call_next();
    }

    // A source key released by a scope change awaits its physical UP; swallow
    // both the (inert) re-press and the UP itself so nothing half-injected
    // leaks into the OS. Cleared on UP by remap::swallow_awaiting.
    if remap::swallow_awaiting(down, kbd.vkCode) {
        return 1;
    }

    let (behavior, bypass) = {
        let cfg = CONFIG.lock().unwrap_or_else(|p| p.into_inner());
        (cfg.behavior_of(kbd.vkCode, app_scope::current().as_ref()), cfg.is_bypass())
    };

    // Step 6 — Hyper suppression & active chord check: quick ENGINE lock.
    let (is_hyper_suppressed, is_hyper_chord_active) = {
        let engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(e) = engine.as_ref() {
            (e.is_hyper_key_suppressed(kbd.vkCode), e.is_hyper_active())
        } else {
            (false, false)
        }
    };

    // Step 7 — WASD Navigation Mode: while active, W/A/S/D
    // are consumed and replaced by arrow injections. When Hyper is held
    // (e.g. Hyper+W to toggle navigation mode off), it passes to the trigger engine so the shortcut fires!
    // Standard modifiers (like Shift for text selection, Ctrl for word hopping) work seamlessly.
    if !own && !bypass && !injected && !is_hyper_suppressed && !is_hyper_chord_active {
        let (outcome, injects) = {
            let mut nav = NAV.lock().unwrap_or_else(|p| p.into_inner());
            nav.handle(down, kbd.vkCode)
        };
        if outcome == NavOutcome::Consumed {
            apply_injects(&injects);
            report_key(if down { "down" } else { "up" }, kbd, extended, injected, lower);
            return 1;
        }
    }

    // Feed the gesture engine with every non-own, non-injected key (down AND
    // up) so its gesture state and modifier tracking stay consistent, then emit
    // any completed gestures and re-arm the deadline timer.
    //
    // Combined with next_deadline query in a single ENGINE lock to reduce
    // contention with the reader thread's reload_engine_with_hyper.
    if !own && !bypass && !injected {
        let (fired, paused, pressed, deadline) = {
            let mut engine = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(e) = engine.as_mut() {
                let fired = e.key_event(KeyEvent {
                    state: if down { EvState::Down } else { EvState::Up },
                    vk: kbd.vkCode,
                    scan: kbd.scanCode,
                    extended,
                    repeat: false,
                    injected,
                    at: now_at(),
                });
                let paused = e.paused();
                let pressed = e.pressed_set();
                let deadline = e.next_deadline();
                (fired, paused, pressed, deadline)
            } else {
                (Vec::new(), false, Vec::new(), None)
            }
        };
        // ENGINE lock dropped.
        if debug_keys() {
            eprintln!(
                "[key-state] vk=0x{:x} down={} own={} injected={} capture_active={} paused={} physical_mods=0x{:x} pressed={:?} fired={}",
                kbd.vkCode,
                down,
                own,
                injected,
                CAPTURING.load(Ordering::SeqCst),
                paused,
                PRESSED.load(Ordering::SeqCst),
                pressed,
                fired.len()
            );
        }
        emit_fired(&fired);
        // Reschedule deadline without re-locking ENGINE (we already have the deadline).
        reschedule_deadline_with(deadline);
    }

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
            // True hold-preserving remap: source DOWN -> target DOWN, source
            // UP -> target UP. Auto-repeat downs are ignored by the engine and
            // the extended flag comes from the TARGET key's canonical catalog.
            if let Some((target, tdown, textended)) = remap::handle_key(down, kbd.vkCode, to) {
                send_vk(target, 0, textended, tdown);
            }
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
    // Drag Corner Switcher corner dwell (fires the Show once dwell elapses).
    drag_switcher::on_timer(now_at());
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
            if msg.message == WM_TIMER && crate::smooth_scroll::is_scroll_timer(msg.wParam) {
                crate::smooth_scroll::on_timer_tick();
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
    fn remap_down_and_up_inject_target() {
        // True hold semantics: BOTH down and up route through the remap engine
        // so the target key is released on source UP (no stuck keys).
        assert_eq!(decide(true, false, false, KeyBehavior::Remap(87)), Decision::ConsumeRemap(87));
        assert_eq!(decide(false, false, false, KeyBehavior::Remap(87)), Decision::ConsumeRemap(87));
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