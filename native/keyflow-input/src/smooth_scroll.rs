//! System-Wide Smooth Scrolling Engine for Windows.
//!
//! Intercepts physical mouse-wheel ticks via a low-level mouse hook (WH_MOUSE_LL),
//! suppresses the coarse 120-unit jumps, and injects fluid sub-pixel wheel increments
//! using pulse easing and momentum accumulation.
//!
//! Features:
//! - Marker dwExtraInfo check (0x4B46_5353 = "KFSS") to prevent re-intercepting own injected events.
//! - Direction reversal: immediate cancellation of opposite momentum.
//! - Trackpad / high-res pass-through: non-120 deltas pass through untouched.
//! - High-precision animation timer (~120Hz) driving SendInput micro-wheel events.
//! - Fail-open: unhooks or passes through when disabled, paused, or shutting down.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use windows_sys::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_MOUSE, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_WHEEL, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, HHOOK, KillTimer, SetTimer, SetWindowsHookExW, UnhookWindowsHookEx,
    WH_MOUSE_LL, WM_MOUSEHWHEEL, WM_MOUSEWHEEL,
};

/// Dedicated marker in dwExtraInfo to identify our own injected smooth scroll events.
pub const SMOOTH_SCROLL_MARKER: usize = 0x4B46_5353; // "KFSS"

/// Timer ID used for the animation tick on the hook thread message queue.
const SCROLL_TIMER_ID: usize = 0x4B53_4352; // "KSCR"

/// Target animation frame interval in ms (~120Hz).
const TICK_INTERVAL_MS: u32 = 8;

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
}

impl Default for SmoothScrollConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            preset: "smooth".to_string(),
            step_size: 100,
            animation_time_ms: 400,
            acceleration_enabled: true,
            acceleration_delta_ms: 50,
            acceleration_max: 3.0,
            trackpad_pass_through: true,
        }
    }
}

/// A queued scroll impulse.
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
    timer_active: bool,
    paused: bool,
}

impl EngineState {
    fn new() -> Self {
        Self {
            config: SmoothScrollConfig::default(),
            active_impulses: Vec::new(),
            last_event_time: None,
            last_direction_y: 0,
            last_direction_x: 0,
            timer_active: false,
            paused: false,
        }
    }
}

static STATE: Mutex<Option<EngineState>> = Mutex::new(None);
static HOOK: AtomicUsize = AtomicUsize::new(0);
static IS_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Struct matching MSLLHOOKSTRUCT from Win32.
#[repr(C)]
pub struct MSLLHOOKSTRUCT {
    pub pt: POINT,
    pub mouse_data: u32,
    pub flags: u32,
    pub time: u32,
    pub extra_info: usize,
}

/// Easing curve (SmoothScroll pulse algorithm).
fn pulse(x: f32) -> f32 {
    let t = x.clamp(0.0, 1.0);
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

/// Initialize the smooth scroll engine state.
pub fn init() {
    let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
    if state.is_none() {
        *state = Some(EngineState::new());
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
        let was_enabled = s.config.enabled && s.config.preset != "native";
        s.config = config;
        let now_enabled = s.config.enabled && s.config.preset != "native" && !s.paused;

        IS_ACTIVE.store(now_enabled, Ordering::SeqCst);

        if !now_enabled && was_enabled {
            s.active_impulses.clear();
            stop_timer(s);
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
            stop_timer(s);
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
        stop_timer(s);
        s.active_impulses.clear();
    }
}

/// Low-level mouse hook procedure.
unsafe extern "system" fn mouse_ll_wheel_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg = wparam as u32;
        if msg == WM_MOUSEWHEEL || msg == WM_MOUSEHWHEEL {
            let hook_struct = &*(lparam as *const MSLLHOOKSTRUCT);

            // 1. Never re-intercept our own injected events
            if hook_struct.extra_info == SMOOTH_SCROLL_MARKER {
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
    // Extract wheel delta: high 16 bits of mouse_data signed
    let raw_delta = ((hook_struct.mouse_data >> 16) as i16) as i32;
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

    // Trackpad / high-res detection:
    // Precision trackpads send non-multiple of 120 or small fractional deltas.
    // If trackpad pass-through is enabled, pass them through.
    if state.config.trackpad_pass_through {
        if raw_delta.abs() < 60 || raw_delta % 120 != 0 {
            return false; // High-precision or trackpad event: let OS handle directly
        }
    }

    let now = Instant::now();
    let current_dir = if raw_delta > 0 { 1 } else { -1 };

    // Direction reversal check: if user spins wheel in the opposite direction,
    // cancel existing momentum instantly for responsive feel.
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
    // Default WHEEL_DELTA is 120. Scale relative to config.step_size.
    let base_delta = (raw_delta as f32) * (state.config.step_size as f32 / 100.0);
    let total_delta = base_delta * multiplier;

    let impulse = Impulse {
        total_delta,
        injected_so_far: 0.0,
        start_time: now,
        duration_ms: state.config.animation_time_ms.max(50) as f32,
        is_horizontal,
    };

    state.active_impulses.push(impulse);

    // Start timer on hook thread if not running
    start_timer(state);

    true
}

/// Called periodically from WM_TIMER (or high-resolution timer).
pub fn on_timer_tick() {
    let mut state_guard = match STATE.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let state = match state_guard.as_mut() {
        Some(s) => s,
        None => return,
    };

    if state.active_impulses.is_empty() {
        stop_timer(state);
        return;
    }

    let now = Instant::now();
    let mut delta_y = 0.0f32;
    let mut delta_x = 0.0f32;

    state.active_impulses.retain_mut(|imp| {
        let elapsed_ms = now.duration_since(imp.start_time).as_millis() as f32;
        let finished = elapsed_ms >= imp.duration_ms;

        let progress = if finished { 1.0 } else { elapsed_ms / imp.duration_ms };
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

    // Inject the calculated micro-wheel deltas via SendInput
    if delta_y.abs() >= 0.5 {
        let dy = delta_y.round() as i32;
        if dy != 0 {
            inject_wheel(dy, false);
        }
    }
    if delta_x.abs() >= 0.5 {
        let dx = delta_x.round() as i32;
        if dx != 0 {
            inject_wheel(dx, true);
        }
    }

    if state.active_impulses.is_empty() {
        stop_timer(state);
    }
}

/// Injects a synthetic wheel event tagged with SMOOTH_SCROLL_MARKER.
fn inject_wheel(delta: i32, is_horizontal: bool) {
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

    unsafe {
        SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
    }
}

fn start_timer(state: &mut EngineState) {
    if !state.timer_active {
        state.timer_active = true;
        unsafe {
            SetTimer(std::ptr::null_mut(), SCROLL_TIMER_ID, TICK_INTERVAL_MS, None);
        }
    }
}

fn stop_timer(state: &mut EngineState) {
    if state.timer_active {
        state.timer_active = false;
        unsafe {
            let _ = KillTimer(std::ptr::null_mut(), SCROLL_TIMER_ID);
        }
    }
}

/// Returns true if the WM_TIMER message belongs to the smooth scroll engine.
pub fn is_scroll_timer(timer_id: usize) -> bool {
    timer_id == SCROLL_TIMER_ID
}
