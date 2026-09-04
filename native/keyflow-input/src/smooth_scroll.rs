//! System-Wide Smooth Scrolling Engine for Windows.
//!
//! Intercepts physical mouse-wheel ticks via a low-level mouse hook (WH_MOUSE_LL),
//! suppresses the coarse 120-unit jumps, and injects fluid sub-pixel wheel increments
//! using pulse easing and momentum accumulation.
//!
//! Features:
//! - Dedicated high-performance animation thread: zero latency, not dependent on Win32 WM_TIMER.
//! - Marker dwExtraInfo check (0x4B46_5353 = "KFSS") + INJECTING atomic guard to prevent re-interception.
//! - Direction reversal: immediate cancellation of opposite momentum.
//! - Trackpad / high-res pass-through: non-120 deltas pass through untouched.
//! - Fractional delta preservation: sub-integer remainders accumulate without rounding loss.
//! - Lock-free injection: Mutex released before calling SendInput to eliminate contention.
//! - Fail-open: unhooks or passes through when disabled, paused, or shutting down.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_MOUSE, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_WHEEL, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, HHOOK, MSLLHOOKSTRUCT, SetWindowsHookExW, UnhookWindowsHookEx,
    WH_MOUSE_LL, WM_MOUSEHWHEEL, WM_MOUSEWHEEL,
};

/// Dedicated marker in dwExtraInfo to identify our own injected smooth scroll events.
pub const SMOOTH_SCROLL_MARKER: usize = 0x4B46_5353; // "KFSS"

/// Target animation frame interval (~120Hz).
const FRAME_INTERVAL: Duration = Duration::from_millis(8);

#[derive(Debug, Clone)]
pub struct SmoothScrollConfig {
    pub enabled: bool,
    pub preset: String,
    pub step_size: u32,
    pub animation_time_ms: u32,
    pub acceleration_enabled: bool,
    pub acceleration_delta_ms: u32,
    pub acceleration_max: f32,
    pub trackpad_pass_through: bool,
    pub horizontal_scrolling: bool,
}

impl Default for SmoothScrollConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            preset: "smooth".to_string(),
            step_size: 100,
            animation_time_ms: 300,
            acceleration_enabled: true,
            acceleration_delta_ms: 60,
            acceleration_max: 3.0,
            trackpad_pass_through: true,
            horizontal_scrolling: true,
        }
    }
}

#[derive(Debug, Clone)]
struct Impulse {
    total_delta: f32,
    injected_so_far: f32,
    start_time: Instant,
    duration_ms: f32,
    is_horizontal: bool,
}

struct EngineState {
    config: SmoothScrollConfig,
    active_impulses: Vec<Impulse>,
    last_event_time: Option<Instant>,
    last_direction_y: i32,
    last_direction_x: i32,
    paused: bool,
    shutdown: bool,
}

impl EngineState {
    fn new() -> Self {
        Self {
            config: SmoothScrollConfig::default(),
            active_impulses: Vec::new(),
            last_event_time: None,
            last_direction_y: 0,
            last_direction_x: 0,
            paused: false,
            shutdown: false,
        }
    }
}

static STATE: Mutex<Option<EngineState>> = Mutex::new(None);
static CVAR: Condvar = Condvar::new();
static HOOK: AtomicUsize = AtomicUsize::new(0);
static IS_ACTIVE: AtomicBool = AtomicBool::new(false);
static WORKER_STARTED: AtomicBool = AtomicBool::new(false);
static INJECTING: AtomicBool = AtomicBool::new(false);

/// Easing curve (SmoothScroll pulse algorithm).
fn pulse(x: f32) -> f32 {
    let t = x.clamp(0.0, 1.0);
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

/// Initialize the smooth scroll engine state and spawn the animation worker thread.
pub fn init() {
    let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
    if state.is_none() {
        *state = Some(EngineState::new());
    }
    drop(state);

    if !WORKER_STARTED.swap(true, Ordering::SeqCst) {
        thread::Builder::new()
            .name("keyflow-smooth-scroll".to_string())
            .spawn(worker_thread_loop)
            .expect("failed to spawn smooth scroll worker thread");
    }
}

/// Update configuration from Electron.
pub fn configure(config: SmoothScrollConfig) {
    eprintln!(
        "[smooth-scroll] configure enabled={} preset={} step_size={} anim_time={} accel={} max={}",
        config.enabled, config.preset, config.step_size, config.animation_time_ms,
        config.acceleration_enabled, config.acceleration_max
    );

    let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(s) = state.as_mut() {
        s.config = config;
        let active = s.config.enabled && s.config.preset != "native" && !s.paused;
        IS_ACTIVE.store(active, Ordering::SeqCst);

        if !active {
            s.active_impulses.clear();
        } else {
            CVAR.notify_one();
        }
    }
}

/// Set pause state (e.g. when KeyFlow is globally paused or in Safe Mode).
pub fn set_paused(paused: bool) {
    let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(s) = state.as_mut() {
        s.paused = paused;
        let active = s.config.enabled && s.config.preset != "native" && !paused;
        IS_ACTIVE.store(active, Ordering::SeqCst);
        if paused {
            s.active_impulses.clear();
        }
    }
}

/// Install the global low-level mouse hook on the hook thread.
pub fn install_hook(hinstance: HINSTANCE) {
    if HOOK.load(Ordering::SeqCst) != 0 {
        return; // Already installed
    }

    let hook = unsafe {
        SetWindowsHookExW(
            WH_MOUSE_LL,
            Some(mouse_ll_wheel_proc),
            hinstance,
            0,
        )
    };

    if hook.is_null() {
        eprintln!(
            "[smooth-scroll] failed to install WH_MOUSE_LL hook: {}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
    } else {
        eprintln!("[smooth-scroll] WH_MOUSE_LL hook installed successfully: 0x{:x}", hook as usize);
        HOOK.store(hook as usize, Ordering::SeqCst);
    }
}

/// Uninstall the global low-level mouse hook on shutdown.
pub fn uninstall_hook() {
    let hook_handle = HOOK.swap(0, Ordering::SeqCst);
    if hook_handle != 0 {
        unsafe {
            let _ = UnhookWindowsHookEx(hook_handle as HHOOK);
        }
        eprintln!("[smooth-scroll] WH_MOUSE_LL hook uninstalled");
    }
    let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(s) = state.as_mut() {
        s.shutdown = true;
        s.active_impulses.clear();
        CVAR.notify_all();
    }
}

/// Low-level mouse hook procedure.
unsafe extern "system" fn mouse_ll_wheel_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg = wparam as u32;
        if msg == WM_MOUSEWHEEL || msg == WM_MOUSEHWHEEL {
            let hook_struct = &*(lparam as *const MSLLHOOKSTRUCT);

            // 1. Never re-intercept our own injected events
            if hook_struct.dwExtraInfo == SMOOTH_SCROLL_MARKER || INJECTING.load(Ordering::Acquire) {
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }

            // 2. If active, attempt to smooth the physical wheel event
            if IS_ACTIVE.load(Ordering::Relaxed) {
                if handle_wheel_event(msg, hook_struct) {
                    // Suppress original coarse notch from reaching target window
                    return 1;
                }
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

/// Handle a physical wheel event: returns true if intercepted & suppressed.
fn handle_wheel_event(msg: u32, hook_struct: &MSLLHOOKSTRUCT) -> bool {
    let raw_delta = ((hook_struct.mouseData >> 16) as i16) as i32;
    if raw_delta == 0 {
        return false;
    }

    let mut state_guard = match STATE.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let state = match state_guard.as_mut() {
        Some(s) => s,
        None => return false,
    };

    if !state.config.enabled || state.config.preset == "native" || state.paused {
        return false;
    }

    let is_horizontal = msg == WM_MOUSEHWHEEL;

    if is_horizontal && !state.config.horizontal_scrolling {
        return false;
    }

    // Trackpad / high-res pass-through:
    // Precision trackpads send non-multiples of 120 or small fractional deltas.
    if state.config.trackpad_pass_through {
        if raw_delta.abs() < 60 || raw_delta % 120 != 0 {
            return false;
        }
    }

    let now = Instant::now();
    let current_dir = if raw_delta > 0 { 1 } else { -1 };

    // Direction reversal: cancel opposing momentum immediately for instant responsiveness
    if is_horizontal {
        if state.last_direction_x != 0 && current_dir != state.last_direction_x {
            state.active_impulses.retain(|imp| !imp.is_horizontal);
        }
        state.last_direction_x = current_dir;
    } else {
        if state.last_direction_y != 0 && current_dir != state.last_direction_y {
            state.active_impulses.retain(|imp| imp.is_horizontal);
        }
        state.last_direction_y = current_dir;
    }

    // Calculate acceleration multiplier
    let mut multiplier = 1.0f32;
    if state.config.acceleration_enabled && state.config.acceleration_max > 1.0 {
        if let Some(last_time) = state.last_event_time {
            let elapsed_ms = now.duration_since(last_time).as_millis() as f32;
            if elapsed_ms < state.config.acceleration_delta_ms as f32 && elapsed_ms > 0.0 {
                let factor = (1.0 + 50.0 / elapsed_ms) / 2.0;
                multiplier = factor.clamp(1.0, state.config.acceleration_max);
            }
        }
    }
    state.last_event_time = Some(now);

    // Calculate total delta for this impulse
    let base_delta = (raw_delta as f32) * (state.config.step_size as f32 / 100.0);
    let total_delta = base_delta * multiplier;

    let impulse = Impulse {
        total_delta,
        injected_so_far: 0.0,
        start_time: now,
        duration_ms: (state.config.animation_time_ms.max(50) as f32),
        is_horizontal,
    };

    state.active_impulses.push(impulse);
    CVAR.notify_one();

    true
}

/// Dedicated animation worker thread loop.
fn worker_thread_loop() {
    let mut fractional_y = 0.0f32;
    let mut fractional_x = 0.0f32;

    loop {
        let mut guard = match STATE.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };

        // Wait until there are active impulses or shutdown
        while let Some(ref s) = *guard {
            if s.shutdown {
                return;
            }
            if !s.active_impulses.is_empty()
                && !s.paused
                && s.config.enabled
                && s.config.preset != "native"
            {
                break;
            }
            // Reset fractional accumulators when queue is idle
            fractional_y = 0.0;
            fractional_x = 0.0;
            guard = CVAR.wait(guard).unwrap_or_else(|p| p.into_inner());
        }

        let state = match guard.as_mut() {
            Some(s) if !s.shutdown => s,
            _ => return,
        };

        let now = Instant::now();
        let mut delta_y = 0.0f32;
        let mut delta_x = 0.0f32;

        state.active_impulses.retain_mut(|imp| {
            let elapsed_ms = now.duration_since(imp.start_time).as_millis() as f32;
            let finished = elapsed_ms >= imp.duration_ms;

            let progress = if finished { 1.0 } else { (elapsed_ms / imp.duration_ms).clamp(0.0, 1.0) };
            let eased = pulse(progress);
            let target_injected = imp.total_delta * eased;
            let step = target_injected - imp.injected_so_far;

            imp.injected_so_far = target_injected;

            if imp.is_horizontal {
                delta_x += step;
            } else {
                delta_y += step;
            }

            !finished
        });

        // Accumulate into fractional accumulators
        fractional_y += delta_y;
        fractional_x += delta_x;

        let send_y = fractional_y.trunc() as i32;
        let send_x = fractional_x.trunc() as i32;

        if send_y != 0 {
            fractional_y -= send_y as f32;
        }
        if send_x != 0 {
            fractional_x -= send_x as f32;
        }

        let has_more = !state.active_impulses.is_empty();

        // Release mutex lock BEFORE calling SendInput!
        drop(guard);

        if send_y != 0 {
            inject_wheel(send_y, false);
        }
        if send_x != 0 {
            inject_wheel(send_x, true);
        }

        if has_more {
            thread::sleep(FRAME_INTERVAL);
        }
    }
}

/// Injects a synthetic wheel event tagged with SMOOTH_SCROLL_MARKER.
fn inject_wheel(delta: i32, is_horizontal: bool) {
    if delta == 0 {
        return;
    }

    let flags = if is_horizontal {
        MOUSEEVENTF_HWHEEL
    } else {
        MOUSEEVENTF_WHEEL
    };

    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: delta as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: SMOOTH_SCROLL_MARKER,
            },
        },
    };

    INJECTING.store(true, Ordering::Release);
    unsafe {
        SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
    }
    INJECTING.store(false, Ordering::Release);
}
