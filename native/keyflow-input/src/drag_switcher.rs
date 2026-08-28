//! Drag Corner Switcher V2: raw-input-driven drag detection + hot-area engine.
//!
//! V2 contract (Cycle 5):
//! - Mouse observation uses Win32 Raw Input (`raw_mouse.rs`), NOT WH_MOUSE_LL.
//!   The old low-level mouse hook is removed so a single mouse source exists.
//! - Position is ALWAYS the real cursor position (GetCursorPos); relative raw
//!   deltas are never integrated.
//! - Trigger = physical left DOWN + cursor movement past the system drag
//!   threshold (SM_CXDRAG/SM_CYDRAG) + entering one of the ENABLED hot areas on
//!   the CURRENT monitor + an activation dwell (timer-driven because the cursor
//!   can park with no further WM_INPUT). Activation dwell of 0ms = Instant.
//! - Hot areas: 8 zones — TL/TR/BL/BR corners (12–20px) plus Top/Left/Right/
//!   Bottom edges excluding corner overlap. DPI/monitor aware; current monitor
//!   via MonitorFromPoint. Zones come as a bitmask so "Top Right" / "All
//!   Corners" / "All Edges" / "Custom" presets are one engine, not one config.
//! - Source is identified as WindowFromPoint → GetAncestor(GA_ROOT) → PID →
//!   exe (never GetForegroundWindow alone) and reported in `[drag-v2]` logs.
//! - Hover switching keeps the original left button down (we never synthesize
//!   a mouse UP and never cancel the OLE drag). Non-drag hot-area hovering
//!   (no button down / no threshold) does NOTHING.
//! - `[drag-v2]` forensic logs fire on TRANSITIONS only (no per-event flood):
//!   rawMouseRegistered, leftDown, source, thresholdPassed, regionEnter,
//!   dwellStarted, dwellComplete, showRequested, electronShowReceived,
//!   tileHover, activationResult, hide.
//!
//! The drag state machine (`DragSwitcher`) is pure (injectable time + monitor
//! geometry + a log sink) so it is unit-testable without Windows; the Win32
//! shell (window enumeration, icon extraction, activation) lives below it.

use std::mem::size_of;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetMonitorInfoW, GetObjectW, MonitorFromPoint,
    SelectObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows_sys::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows_sys::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, DestroyIcon, EnumWindows, GetAncestor, GetClassNameW, GetCursorPos, GetForegroundWindow,
    GetIconInfo, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow, ShowWindow, SW_RESTORE, WS_EX_TOOLWINDOW, GA_ROOT,
    GA_ROOTOWNER, GWL_EXSTYLE, ICONINFO,
};

use crate::protocol::{OutMessage, PROTOCOL_VERSION, WindowEntry};

pub const DEFAULT_CORNER_DWELL_MS: u64 = 250;
pub const DEFAULT_HOVER_DWELL_MS: u64 = 400;
pub const DEFAULT_CORNER_SIZE: i32 = 16;
/// Alt-Tab-like window list cap: bounds the Show message and the overlay grid.
const MAX_WINDOWS: usize = 30;

// ── Zone bitmask ─────────────────────────────────────────────────────────────

/// Hot-area zones. Bitmask so presets compose from the same engine.
pub const ZONE_TL: u8 = 0x01; // top-left corner
pub const ZONE_TR: u8 = 0x02; // top-right corner
pub const ZONE_BL: u8 = 0x04; // bottom-left corner
pub const ZONE_BR: u8 = 0x08; // bottom-right corner
pub const ZONE_TOP: u8 = 0x10; // top edge (excluding corners)
pub const ZONE_LEFT: u8 = 0x20; // left edge (excluding corners)
pub const ZONE_RIGHT: u8 = 0x40; // right edge (excluding corners)
pub const ZONE_BOTTOM: u8 = 0x80; // bottom edge (excluding corners)

/// Preset masks for the simplified UI (one engine, four presets).
pub const PRESET_TOP_RIGHT: u8 = ZONE_TR;
pub const PRESET_ALL_CORNERS: u8 = ZONE_TL | ZONE_TR | ZONE_BL | ZONE_BR;
pub const PRESET_ALL_EDGES: u8 = ZONE_TOP | ZONE_LEFT | ZONE_RIGHT | ZONE_BOTTOM;
pub const PRESET_ALL: u8 = PRESET_ALL_CORNERS | PRESET_ALL_EDGES;

pub fn zone_label(zone: u8) -> &'static str {
    match zone {
        ZONE_TL => "TL",
        ZONE_TR => "TR",
        ZONE_BL => "BL",
        ZONE_BR => "BR",
        ZONE_TOP => "Top",
        ZONE_LEFT => "Left",
        ZONE_RIGHT => "Right",
        ZONE_BOTTOM => "Bottom",
        _ => "?",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HideReason {
    MouseUp,
    Escape,
    SourceGone,
    Disabled,
    Paused,
    Reload,
    Shutdown,
    Bypass,
    NoWindows,
}

impl HideReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            HideReason::MouseUp => "mouseUp",
            HideReason::Escape => "escape",
            HideReason::SourceGone => "sourceGone",
            HideReason::Disabled => "disabled",
            HideReason::Paused => "paused",
            HideReason::Reload => "reload",
            HideReason::Shutdown => "shutdown",
            HideReason::Bypass => "bypass",
            HideReason::NoWindows => "noWindows",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwitcherEvent {
    None,
    Show,
    Hide(HideReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonitorInfo {
    /// Identity for monitor-change detection (the HMONITOR pointer value).
    pub index: isize,
    pub monitor: Rect,
    pub work_area: Rect,
}

/// Pure drag-switcher state machine. `at` is monotonic (from hook::now_at).
pub struct DragSwitcher {
    enabled: bool,
    zones: u8,
    activation_dwell: Duration,
    hover_dwell: Duration,
    corner_size: i32,
    drag_threshold: (i32, i32),
    button_down: bool,
    dragging: bool,
    drag_start: (i32, i32),
    source_hwnd: usize,
    source_exe: String,
    active_monitor: Option<MonitorInfo>,
    current_zone: Option<u8>,
    zone_enter_at: Option<Duration>,
    /// Last hot-corner zone entered on PLAIN movement (no drag). Used to log
    /// `[hot-corner] enter/leave zone=X` transitions for runtime verification.
    hot_corner_zone: Option<u8>,
    cursor: (i32, i32),
    emitting: bool,
    logs: Vec<String>,
}

impl DragSwitcher {
    pub const fn new() -> Self {
        DragSwitcher {
            enabled: false,
            zones: PRESET_TOP_RIGHT,
            activation_dwell: Duration::from_millis(DEFAULT_CORNER_DWELL_MS),
            hover_dwell: Duration::from_millis(DEFAULT_HOVER_DWELL_MS),
            corner_size: DEFAULT_CORNER_SIZE,
            drag_threshold: (4, 4),
            button_down: false,
            dragging: false,
            drag_start: (0, 0),
            source_hwnd: 0,
            source_exe: String::new(),
            active_monitor: None,
            current_zone: None,
            zone_enter_at: None,
            hot_corner_zone: None,
            cursor: (0, 0),
            emitting: false,
            logs: Vec::new(),
        }
    }

    /// Configure the machine. `zones` is the enabled-zone bitmask (presets
    /// compose from the same mask). Activation dwell of 0ms = Instant.
    pub fn configure(
        &mut self,
        zones: u8,
        activation_ms: u32,
        hover_ms: u32,
        corner_size: u32,
        drag_threshold: (i32, i32),
    ) {
        self.zones = if zones != 0 { zones } else { PRESET_TOP_RIGHT };
        self.activation_dwell = Duration::from_millis(activation_ms as u64);
        self.hover_dwell = Duration::from_millis(hover_ms.max(1) as u64);
        if corner_size >= 12 && corner_size <= 20 {
            self.corner_size = corner_size as i32;
        }
        if drag_threshold.0 > 0 && drag_threshold.1 > 0 {
            self.drag_threshold = drag_threshold;
        }
    }

    pub fn hover_dwell_ms(&self) -> u32 {
        self.hover_dwell.as_millis() as u32
    }

    pub fn set_enabled(&mut self, enabled: bool) -> SwitcherEvent {
        if self.enabled == enabled {
            return SwitcherEvent::None;
        }
        self.enabled = enabled;
        if !enabled {
            let was_emitting = self.emitting;
            self.reset_drag();
            self.log("disabled");
            if was_emitting {
                return SwitcherEvent::Hide(HideReason::Disabled);
            }
        }
        SwitcherEvent::None
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn is_emitting(&self) -> bool {
        self.emitting
    }

    pub fn source_hwnd(&self) -> usize {
        self.source_hwnd
    }

    fn reset_drag(&mut self) {
        self.button_down = false;
        self.dragging = false;
        self.active_monitor = None;
        self.current_zone = None;
        self.zone_enter_at = None;
        self.emitting = false;
    }

    fn log(&mut self, msg: &str) {
        self.logs.push(msg.to_string());
    }

    /// Drain forensic logs emitted since the last drain. Called by the shell
    /// after every event so `[drag-v2]` lines fire on transitions only.
    pub fn drain_logs(&mut self) -> Vec<String> {
        std::mem::take(&mut self.logs)
    }

    /// Physical left button DOWN (from raw input). Captures the drag source
    /// via WindowFromPoint → GA_ROOT → PID → exe (the shell resolves it).
    pub fn handle_left_down(
        &mut self,
        x: i32,
        y: i32,
        source_hwnd: usize,
        source_exe: String,
        injected: bool,
        _at: Duration,
    ) -> SwitcherEvent {
        if !self.enabled || injected {
            return SwitcherEvent::None;
        }
        self.reset_drag();
        self.button_down = true;
        self.drag_start = (x, y);
        self.cursor = (x, y);
        self.source_hwnd = source_hwnd;
        self.source_exe = source_exe;
        self.log("leftDown");
        if !self.source_exe.is_empty() {
            self.log(&format!("source={}", self.source_exe));
        }
        SwitcherEvent::None
    }

    pub fn handle_mouse_move(&mut self, x: i32, y: i32, monitor: Option<MonitorInfo>, at: Duration) -> SwitcherEvent {
        self.cursor = (x, y);
        if !self.enabled || !self.button_down {
            return SwitcherEvent::None;
        }
        if !self.dragging {
            let dx = (x - self.drag_start.0).abs();
            let dy = (y - self.drag_start.1).abs();
            if dx < self.drag_threshold.0 && dy < self.drag_threshold.1 {
                return SwitcherEvent::None;
            }
            self.dragging = true;
            self.log("thresholdPassed");
        }
        if let Some(m) = monitor {
            let changed = match self.active_monitor {
                Some(am) => am.index != m.index,
                None => true,
            };
            if changed {
                self.active_monitor = Some(m);
                self.current_zone = None;
                self.zone_enter_at = None;
            }
        }
        let zone = self
            .active_monitor
            .map_or(None, |am| zone_at(am.work_area, x, y, self.corner_size, self.zones));
        if zone != self.current_zone {
            match zone {
                Some(z) => {
                    self.log(&format!("regionEnter={}", zone_label(z)));
                    self.current_zone = Some(z);
                    self.zone_enter_at = Some(at);
                    self.log("dwellStarted");
                    if self.activation_dwell.is_zero() {
                        // Instant activation: fire immediately on entry.
                        self.log("dwellComplete");
                        self.log("showRequested");
                        self.emitting = true;
                        return SwitcherEvent::Show;
                    }
                }
                None => {
                    self.current_zone = None;
                    self.zone_enter_at = None;
                }
            }
        }
        SwitcherEvent::None
    }

    /// Track plain-movement hot-corner transitions (no drag needed). Logs
    /// `hotCorner enter zone=X` / `leave zone=X` transitions into the same
    /// drainable buffer; the shell re-emits them with the `[hot-corner]`
    /// prefix so the runtime-verification corner test is auditable before any
    /// drag. Never fires the switcher itself.
    pub fn track_hot_corner(&mut self, x: i32, y: i32, monitor: Option<MonitorInfo>) {
        if !self.enabled {
            self.hot_corner_zone = None;
            return;
        }
        let zone = monitor.map_or(None, |m| zone_at(m.work_area, x, y, self.corner_size, self.zones));
        if zone == self.hot_corner_zone {
            return;
        }
        if let Some(z) = self.hot_corner_zone {
            self.log(&format!("leave zone={}", zone_label(z)));
        }
        self.hot_corner_zone = zone;
        if let Some(z) = zone {
            self.log(&format!("enter zone={}", zone_label(z)));
        }
    }

    pub fn handle_mouse_up(&mut self, _at: Duration) -> SwitcherEvent {
        if !self.button_down {
            return SwitcherEvent::None;
        }
        let was = self.emitting;
        self.reset_drag();
        if was {
            self.log("hide=mouseUp");
            SwitcherEvent::Hide(HideReason::MouseUp)
        } else {
            SwitcherEvent::None
        }
    }

    pub fn handle_escape(&mut self) -> SwitcherEvent {
        if !self.emitting {
            return SwitcherEvent::None;
        }
        self.reset_drag();
        self.log("hide=escape");
        SwitcherEvent::Hide(HideReason::Escape)
    }

    pub fn handle_source_gone(&mut self) -> SwitcherEvent {
        if !self.emitting {
            return SwitcherEvent::None;
        }
        self.reset_drag();
        self.log("hide=sourceGone");
        SwitcherEvent::Hide(HideReason::SourceGone)
    }

    /// Timer tick while parked in the hot area: fire the Show once the
    /// activation dwell elapses and the cursor is still inside the zone. This
    /// is what makes the feature work when the user stops moving the mouse.
    pub fn on_timer(&mut self, at: Duration) -> SwitcherEvent {
        if !self.enabled || !self.button_down || !self.dragging || self.emitting {
            return SwitcherEvent::None;
        }
        let Some(enter) = self.zone_enter_at else {
            return SwitcherEvent::None;
        };
        if at < enter + self.activation_dwell {
            return SwitcherEvent::None;
        }
        let still_in_zone = self.active_monitor.map_or(false, |am| {
            zone_at(am.work_area, self.cursor.0, self.cursor.1, self.corner_size, self.zones).is_some()
        });
        if !still_in_zone {
            self.current_zone = None;
            self.zone_enter_at = None;
            return SwitcherEvent::None;
        }
        self.zone_enter_at = None;
        self.log("dwellComplete");
        self.log("showRequested");
        self.emitting = true;
        SwitcherEvent::Show
    }

    /// Nearest pending activation-dwell deadline, if any (merged with the
    /// gesture engine's deadline by the hook's single SetTimer).
    pub fn next_deadline(&self, at_now: Duration) -> Option<Duration> {
        if !self.enabled || !self.button_down || !self.dragging || self.emitting {
            return None;
        }
        self.zone_enter_at
            .map(|enter| enter + self.activation_dwell)
            .filter(|d| *d > at_now)
    }

    /// After a Show was rejected (no eligible windows): stay armed for the same
    /// drag but require re-entering the zone, so the enumerate-once cost is not
    /// re-paid every dwell while parked.
    pub fn cancel_show(&mut self) {
        self.emitting = false;
        self.current_zone = None;
        self.zone_enter_at = None;
    }
}

/// Which enabled zone contains the point, if any. Corners win over edges when
/// they overlap (checked first). Work area is the DPI-aware monitor work rect.
pub fn zone_at(work: Rect, x: i32, y: i32, size: i32, zones: u8) -> Option<u8> {
    let size = size.max(1);
    let tl = zones & ZONE_TL != 0 && x >= work.left && x < work.left + size && y >= work.top && y < work.top + size;
    let tr = zones & ZONE_TR != 0 && x > work.right - size && x <= work.right && y >= work.top && y < work.top + size;
    let bl = zones & ZONE_BL != 0 && x >= work.left && x < work.left + size && y > work.bottom - size && y <= work.bottom;
    let br = zones & ZONE_BR != 0 && x > work.right - size && x <= work.right && y > work.bottom - size && y <= work.bottom;
    if tl {
        return Some(ZONE_TL);
    }
    if tr {
        return Some(ZONE_TR);
    }
    if bl {
        return Some(ZONE_BL);
    }
    if br {
        return Some(ZONE_BR);
    }
    let top = zones & ZONE_TOP != 0 && y >= work.top && y < work.top + size && x > work.left + size && x < work.right - size;
    let left = zones & ZONE_LEFT != 0 && x >= work.left && x < work.left + size && y > work.top + size && y < work.bottom - size;
    let right = zones & ZONE_RIGHT != 0 && x > work.right - size && x <= work.right && y > work.top + size && y < work.bottom - size;
    let bottom = zones & ZONE_BOTTOM != 0 && y > work.bottom - size && y <= work.bottom && x > work.left + size && x < work.right - size;
    if top {
        return Some(ZONE_TOP);
    }
    if left {
        return Some(ZONE_LEFT);
    }
    if right {
        return Some(ZONE_RIGHT);
    }
    if bottom {
        return Some(ZONE_BOTTOM);
    }
    None
}

// ── Win32 shell ──────────────────────────────────────────────────────────────

static SWITCHER: Mutex<DragSwitcher> = Mutex::new(DragSwitcher::new());
/// KeyFlow's own Electron process pid (windows of this pid are excluded from
/// the switcher's window list).
static PARENT_PID: AtomicU32 = AtomicU32::new(0);

static ENUM_RESULTS: Mutex<Vec<WindowEntry>> = Mutex::new(Vec::new());

pub fn set_parent_pid(pid: u32) {
    PARENT_PID.store(pid, Ordering::SeqCst);
}

fn system_drag_threshold() -> (i32, i32) {
    unsafe {
        let x = GetSystemMetrics(0x70); // SM_CXDRAG
        let y = GetSystemMetrics(0x71); // SM_CYDRAG
        (if x > 0 { x } else { 4 }, if y > 0 { y } else { 4 })
    }
}

/// Reconfigure the switcher (SetDragSwitcher V2: zones bitmask + dwells).
pub fn configure(enabled: bool, zones: u8, activation_ms: u32, hover_ms: u32, corner_size: u32) {
    let (dx, dy) = system_drag_threshold();
    let (ev, logs) = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        s.configure(zones, activation_ms, hover_ms, corner_size, (dx, dy));
        let ev = s.set_enabled(enabled);
        let logs = s.drain_logs();
        (ev, logs)
    };
    emit_logs(logs);
    apply_event(ev);
}

pub fn is_enabled() -> bool {
    SWITCHER.lock().unwrap_or_else(|p| p.into_inner()).is_enabled()
}

pub fn is_shown() -> bool {
    SWITCHER.lock().unwrap_or_else(|p| p.into_inner()).is_emitting()
}

/// Raw-input left button state change (from raw_mouse.rs). This is the V2
/// replacement for the old WH_MOUSE_LL down/up path.
pub fn on_raw_mouse_down(down: bool, at: Duration) {
    if !down {
        let (ev, logs) = {
            let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
            let ev = s.handle_mouse_up(at);
            let logs = s.drain_logs();
            (ev, logs)
        };
        emit_logs(logs);
        apply_event(ev);
        return;
    }
    let pt = unsafe { cursor_pos() };
    let (hwnd, exe) = unsafe { source_at(pt) };
    let (ev, logs) = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        let ev = s.handle_left_down(pt.0, pt.1, hwnd, exe, false, at);
        let logs = s.drain_logs();
        (ev, logs)
    };
    emit_logs(logs);
    apply_event(ev);
}

/// Raw-input movement (position taken from GetCursorPos, never integrated).
/// Tracks hot-corner enter/leave transitions on plain movement FIRST (the
/// runtime-verification corner test), then drives the drag machine.
pub fn on_raw_mouse_move(x: i32, y: i32, at: Duration) {
    let (hot_corner_logs, ev, logs) = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        let monitor = unsafe { monitor_from_point(x, y) };
        s.track_hot_corner(x, y, monitor);
        let corner_logs = s.drain_logs();
        let ev = s.handle_mouse_move(x, y, monitor, at);
        let logs = s.drain_logs();
        (corner_logs, ev, logs)
    };
    for line in hot_corner_logs {
        eprintln!("[hot-corner] {line}");
    }
    emit_logs(logs);
    apply_event(ev);
}

/// Keyboard-hook Escape cancellation (only meaningful while the overlay is up).
pub fn handle_escape() {
    let (ev, logs) = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        let ev = s.handle_escape();
        let logs = s.drain_logs();
        (ev, logs)
    };
    emit_logs(logs);
    apply_event(ev);
}

/// Force-hide for pause / reload / shutdown / bypass.
pub fn hide_all(reason: HideReason) {
    let (ev, logs) = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        if !s.is_emitting() && !s.is_enabled() {
            (SwitcherEvent::None, Vec::new())
        } else {
            // Reset the drag entirely so a parked zone cannot re-fire after
            // the disruptive lifecycle event.
            let was = s.is_emitting();
            s.reset_drag();
            s.log(&format!("hide={}", reason.as_str()));
            let logs = s.drain_logs();
            if was {
                (SwitcherEvent::Hide(reason), logs)
            } else {
                (SwitcherEvent::None, logs)
            }
        }
    };
    emit_logs(logs);
    apply_event(ev);
}

/// Timer tick from the hook thread (WM_TIMER): drive the activation dwell.
pub fn on_timer(at: Duration) {
    let (ev, logs) = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        let ev = s.on_timer(at);
        let logs = s.drain_logs();
        (ev, logs)
    };
    emit_logs(logs);
    apply_event(ev);
}

pub fn next_deadline(at_now: Duration) -> Option<Duration> {
    SWITCHER.lock().unwrap_or_else(|p| p.into_inner()).next_deadline(at_now)
}

fn emit_logs(logs: Vec<String>) {
    for line in logs {
        eprintln!("[drag-v2] {line}");
    }
}

fn apply_event(ev: SwitcherEvent) {
    match ev {
        SwitcherEvent::Show => show_switcher(),
        SwitcherEvent::Hide(reason) => {
            queue(
                OutMessage::DragSwitcherHide {
                    version: PROTOCOL_VERSION,
                    reason: reason.as_str().to_string(),
                }
                .to_json(),
            );
        }
        SwitcherEvent::None => {}
    }
}

fn show_switcher() {
    let snapshot = {
        let s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        match s.active_monitor {
            Some(m) => Some((m, s.cursor, s.source_hwnd(), s.hover_dwell_ms())),
            None => None,
        }
    };
    let Some((monitor, cursor, source_hwnd, hover_dwell_ms)) = snapshot else {
        cancel_show(HideReason::NoWindows);
        return;
    };
    let windows = enumerate_windows();
    if windows.is_empty() {
        cancel_show(HideReason::NoWindows);
        return;
    }
    queue(
        OutMessage::DragSwitcherShow {
            version: PROTOCOL_VERSION,
            monitor_index: monitor.index as i32,
            monitor_left: monitor.monitor.left,
            monitor_top: monitor.monitor.top,
            monitor_right: monitor.monitor.right,
            monitor_bottom: monitor.monitor.bottom,
            work_left: monitor.work_area.left,
            work_top: monitor.work_area.top,
            work_right: monitor.work_area.right,
            work_bottom: monitor.work_area.bottom,
            cursor_x: cursor.0,
            cursor_y: cursor.1,
            source_hwnd: source_hwnd.to_string(),
            hover_dwell_ms,
            windows,
        }
        .to_json(),
    );
}

fn cancel_show(reason: HideReason) {
    let logs = {
        let mut s = SWITCHER.lock().unwrap_or_else(|p| p.into_inner());
        s.cancel_show();
        s.drain_logs()
    };
    emit_logs(logs);
    queue(
        OutMessage::DragSwitcherHide {
            version: PROTOCOL_VERSION,
            reason: reason.as_str().to_string(),
        }
        .to_json(),
    );
}

fn queue(line: String) {
    crate::hook::queue(line);
}

// ── Cursor / source helpers ──────────────────────────────────────────────────

unsafe fn cursor_pos() -> (i32, i32) {
    let mut pt = POINT { x: 0, y: 0 };
    if GetCursorPos(&mut pt) != 0 {
        (pt.x, pt.y)
    } else {
        (0, 0)
    }
}

/// Source of a drag at the given screen point: WindowFromPoint →
/// GetAncestor(GA_ROOT) → PID → exe path (never GetForegroundWindow alone).
unsafe fn source_at((x, y): (i32, i32)) -> (usize, String) {
    use windows_sys::Win32::UI::WindowsAndMessaging::WindowFromPoint;
    let pt = POINT { x, y };
    let under = WindowFromPoint(pt);
    let root = GetAncestor(under, GA_ROOT);
    if root.is_null() {
        return (0, String::new());
    }
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(root, &mut pid);
    if pid == 0 {
        return (root as usize, String::new());
    }
    let exe = process_path(pid).unwrap_or_default();
    (root as usize, exe)
}

unsafe fn pid_of(hwnd: HWND) -> u32 {
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    pid
}

pub(crate) unsafe fn process_path(pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if h.is_null() {
        return None;
    }
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
    let _ = CloseHandle(h);
    if ok == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..len as usize]))
}

pub(crate) unsafe fn process_name(pid: u32) -> String {
    process_path(pid)
        .and_then(|p| {
            let name = p.rsplit('\\').next().unwrap_or(&p).to_string();
            let name = name.strip_suffix(".exe").unwrap_or(&name).to_string();
            Some(name)
        })
        .unwrap_or_default()
}

unsafe fn monitor_from_point(x: i32, y: i32) -> Option<MonitorInfo> {
    let hmonitor = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
    if hmonitor.is_null() {
        return None;
    }
    let mut mi: MONITORINFO = std::mem::zeroed();
    mi.cbSize = size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(hmonitor, &mut mi) == 0 {
        return None;
    }
    Some(MonitorInfo {
        index: hmonitor as isize,
        monitor: Rect {
            left: mi.rcMonitor.left,
            top: mi.rcMonitor.top,
            right: mi.rcMonitor.right,
            bottom: mi.rcMonitor.bottom,
        },
        work_area: Rect {
            left: mi.rcWork.left,
            top: mi.rcWork.top,
            right: mi.rcWork.right,
            bottom: mi.rcWork.bottom,
        },
    })
}

/// Enumerate eligible top-level windows for the switcher overlay. Runs ONCE per
/// show (never per mouse-move). Excludes KeyFlow's own windows, the shell/
/// desktop, invisible/cloaked/tool/owned/zero-size windows and windows without
/// a title. Icons are extracted per app (fallback: renderer monogram).
fn enumerate_windows() -> Vec<WindowEntry> {
    if let Ok(mut results) = ENUM_RESULTS.lock() {
        results.clear();
    }
    let own_pid = PARENT_PID.load(Ordering::SeqCst);
    unsafe {
        EnumWindows(Some(collect_proc), own_pid as LPARAM);
    }
    let results = ENUM_RESULTS.lock().unwrap_or_else(|p| p.into_inner());
    results.iter().take(MAX_WINDOWS).cloned().collect()
}

unsafe extern "system" fn collect_proc(hwnd: HWND, own_pid: LPARAM) -> BOOL {
    if let Some(entry) = collect_window(hwnd, own_pid as u32) {
        if let Ok(mut v) = ENUM_RESULTS.lock() {
            v.push(entry);
        }
    }
    1
}

unsafe fn collect_window(hwnd: HWND, own_pid: u32) -> Option<WindowEntry> {
    if IsWindowVisible(hwnd) == 0 {
        return None;
    }
    // Owned windows (dialogs/popups) and tool windows are not app switcher tiles.
    if GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & (WS_EX_TOOLWINDOW as isize) != 0 {
        return None;
    }
    if GetAncestor(hwnd, GA_ROOTOWNER) != hwnd {
        return None;
    }
    // Cloaked (hidden to UIA/Alt-Tab) windows are skipped.
    let mut cloaked: i32 = 0;
    if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as u32, &mut cloaked as *mut i32 as *mut _, size_of::<i32>() as u32) == 0
        && cloaked != 0
    {
        return None;
    }
    let mut rc: RECT = std::mem::zeroed();
    if GetWindowRect(hwnd, &mut rc) == 0 || rc.right - rc.left <= 0 || rc.bottom - rc.top <= 0 {
        return None;
    }
    let mut title_buf = [0u16; 256];
    let len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
    if len <= 0 {
        return None;
    }
    let title = String::from_utf16_lossy(&title_buf[..len as usize]).trim().to_string();
    if title.is_empty() {
        return None;
    }
    let pid = pid_of(hwnd);
    if pid == own_pid || pid == 0 {
        return None; // KeyFlow's own windows are never switcher targets.
    }
    // Shell/desktop surfaces are not app windows.
    let mut class_buf = [0u16; 64];
    let class_len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), class_buf.len() as i32);
    if class_len > 0 {
        let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
        if matches!(class_name.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Windows.UI.Core.CoreWindow") {
            return None;
        }
    }
    let app = process_name(pid);
    let icon = process_path(pid).and_then(|p| window_icon_bmp(&p));
    Some(WindowEntry {
        hwnd: (hwnd as usize).to_string(),
        title: title.chars().take(128).collect(),
        app,
        icon,
    })
}

// ── Running-app list for the app picker ──────────────────────────────────────

/// One running app candidate: the app identity the scope is built from.
struct RunningApp {
    executable_path: String,
    process_name: String,
    icon: Option<String>,
}

static RUNNING_APPS: std::sync::Mutex<Vec<RunningApp>> = std::sync::Mutex::new(Vec::new());

/// Enumerate distinct running applications (deduped by normalized executable
/// path) for the renderer's app picker. Uses the same eligibility rules as the
/// switcher overlay but captures the executable path (the app-scope identity).
/// Never called per key event — only on demand for ListApps.
pub fn running_apps() -> Vec<crate::protocol::AppInfo> {
    use std::collections::HashMap;
    if let Ok(mut v) = RUNNING_APPS.lock() {
        v.clear();
    }
    let own_pid = PARENT_PID.load(Ordering::SeqCst);
    unsafe {
        EnumWindows(Some(running_apps_proc), own_pid as LPARAM);
    }
    let mut by_path: HashMap<String, crate::protocol::AppInfo> = HashMap::new();
    let list = RUNNING_APPS.lock().unwrap_or_else(|p| p.into_inner());
    for app in list.iter().take(MAX_WINDOWS) {
        if app.executable_path.is_empty() {
            continue;
        }
        by_path
            .entry(app.executable_path.to_lowercase())
            .or_insert_with(|| crate::protocol::AppInfo {
                executable_path: app.executable_path.clone(),
                process_name: Some(app.process_name.clone()),
                display_name: Some(app.process_name.clone()),
                icon: app.icon.clone(),
            });
    }
    let mut apps: Vec<crate::protocol::AppInfo> = by_path.into_values().collect();
    apps.sort_by(|a, b| {
        a.process_name
            .as_deref()
            .unwrap_or("")
            .to_lowercase()
            .cmp(&b.process_name.as_deref().unwrap_or("").to_lowercase())
    });
    apps
}

unsafe extern "system" fn running_apps_proc(hwnd: HWND, own_pid: LPARAM) -> BOOL {
    // Minimal eligibility: visible, non-tool, rooted, uncloaked window whose
    // process is resolvable — without needing a title.
    if IsWindowVisible(hwnd) == 0 {
        return 1;
    }
    if GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & (WS_EX_TOOLWINDOW as isize) != 0 {
        return 1;
    }
    if GetAncestor(hwnd, GA_ROOTOWNER) != hwnd {
        return 1;
    }
    let mut cloaked: i32 = 0;
    if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as u32, &mut cloaked as *mut i32 as *mut _, size_of::<i32>() as u32) == 0
        && cloaked != 0
    {
        return 1;
    }
    let pid = pid_of(hwnd);
    if pid == 0 || pid == own_pid as u32 {
        return 1;
    }
    let path = process_path(pid);
    let name = process_name(pid);
    let path = match path {
        Some(p) if !p.is_empty() => p,
        _ => return 1,
    };
    if name.is_empty() {
        return 1;
    }
    if let Ok(mut v) = RUNNING_APPS.lock() {
        v.push(RunningApp {
            executable_path: path.clone(),
            process_name: name,
            icon: window_icon_bmp(&path),
        });
    }
    1
}

// ── Icon extraction (base64 BMP) ─────────────────────────────────────────────

unsafe fn window_icon_bmp(exe_path: &str) -> Option<String> {
    let mut sfi: SHFILEINFOW = std::mem::zeroed();
    let wide = wide_string(exe_path);
    let res = SHGetFileInfoW(wide.as_ptr(), 0, &mut sfi, size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON);
    if res == 0 || sfi.hIcon.is_null() {
        return None;
    }
    let mut ii: ICONINFO = std::mem::zeroed();
    if GetIconInfo(sfi.hIcon, &mut ii) == 0 {
        DestroyIcon(sfi.hIcon);
        return None;
    }
    if ii.hbmColor.is_null() {
        if !ii.hbmMask.is_null() {
            DeleteObject(ii.hbmMask);
        }
        DestroyIcon(sfi.hIcon);
        return None;
    }
    let mut bm: BITMAP = std::mem::zeroed();
    if GetObjectW(ii.hbmColor, size_of::<BITMAP>() as i32, &mut bm as *mut _ as *mut _) == 0 {
        DeleteObject(ii.hbmColor);
        if !ii.hbmMask.is_null() {
            DeleteObject(ii.hbmMask);
        }
        DestroyIcon(sfi.hIcon);
        return None;
    }
    let w = bm.bmWidth;
    let h = bm.bmHeight;
    if w <= 0 || h <= 0 || w > 256 || h > 256 {
        DeleteObject(ii.hbmColor);
        if !ii.hbmMask.is_null() {
            DeleteObject(ii.hbmMask);
        }
        DestroyIcon(sfi.hIcon);
        return None;
    }
    let mut bmi: BITMAPINFO = std::mem::zeroed();
    bmi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
    bmi.bmiHeader.biWidth = w;
    bmi.bmiHeader.biHeight = h;
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    let mut pixels = vec![0u8; (w * h * 4) as usize];
    let hdc = CreateCompatibleDC(std::ptr::null_mut());
    let old = SelectObject(hdc, ii.hbmColor);
    let got = GetDIBits(hdc, ii.hbmColor, 0, h as u32, pixels.as_mut_ptr() as *mut _, &mut bmi, DIB_RGB_COLORS);
    SelectObject(hdc, old);
    DeleteDC(hdc);
    DeleteObject(ii.hbmColor);
    if !ii.hbmMask.is_null() {
        DeleteObject(ii.hbmMask);
    }
    DestroyIcon(sfi.hIcon);
    if got == 0 {
        return None;
    }
    Some(bmp_base64(w, h, &pixels))
}

fn bmp_base64(width: i32, height: i32, bgra: &[u8]) -> String {
    let mut bmp: Vec<u8> = Vec::with_capacity(54 + bgra.len());
    // BITMAPFILEHEADER
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&(54u32 + bgra.len() as u32).to_le_bytes());
    bmp.extend_from_slice(&0u16.to_le_bytes());
    bmp.extend_from_slice(&0u16.to_le_bytes());
    bmp.extend_from_slice(&54u32.to_le_bytes());
    // BITMAPINFOHEADER
    bmp.extend_from_slice(&40u32.to_le_bytes());
    bmp.extend_from_slice(&(width as u32).to_le_bytes());
    bmp.extend_from_slice(&(height as u32).to_le_bytes());
    bmp.extend_from_slice(&1u16.to_le_bytes());
    bmp.extend_from_slice(&32u16.to_le_bytes());
    bmp.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    bmp.extend_from_slice(&(bgra.len() as u32).to_le_bytes());
    bmp.extend_from_slice(&0i32.to_le_bytes()); // x ppm
    bmp.extend_from_slice(&0i32.to_le_bytes()); // y ppm
    bmp.extend_from_slice(&0u32.to_le_bytes()); // colors used
    bmp.extend_from_slice(&0u32.to_le_bytes()); // important colors
    bmp.extend_from_slice(bgra);
    base64_encode(&bmp)
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
    }
    out
}

fn wide_string(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// ── Window activation ────────────────────────────────────────────────────────

/// Activate a target window with the least-invasive Win32 calls. Returns
/// (success, reason): activated / restored-and-activated / activation-denied /
/// window-invalid. Never claims success unless GetForegroundWindow agrees.
pub fn activate_window(hwnd_str: &str) -> (bool, &'static str) {
    let Ok(hwnd) = hwnd_str.trim().parse::<usize>() else {
        return (false, "window-invalid");
    };
    let hwnd = hwnd as HWND;
    unsafe {
        if IsWindow(hwnd) == 0 {
            return (false, "window-invalid");
        }
        let mut reason = "activated";
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
            reason = "restored-and-activated";
        }
        // Classic foreground acquisition: attach our thread input to the
        // current foreground thread so SetForegroundWindow is permitted. The
        // user's physical drag is real input, so this normally succeeds.
        let fg = GetForegroundWindow();
        if !fg.is_null() {
            let fg_tid = GetWindowThreadProcessId(fg, std::ptr::null_mut());
            let cur_tid = GetCurrentThreadId();
            let _ = AttachThreadInput(cur_tid, fg_tid, 1);
            let _ = SetForegroundWindow(hwnd);
            let _ = AttachThreadInput(cur_tid, fg_tid, 0);
        } else {
            let _ = SetForegroundWindow(hwnd);
        }
        let _ = BringWindowToTop(hwnd);
        if GetForegroundWindow() == hwnd {
            (true, reason)
        } else {
            (false, "activation-denied")
        }
    }
}

// ── Pure state machine tests ─────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(index: isize, right: i32, bottom: i32) -> MonitorInfo {
        MonitorInfo {
            index,
            monitor: Rect { left: 0, top: 0, right, bottom },
            work_area: Rect { left: 0, top: 0, right, bottom: bottom - 40 },
        }
    }

    fn ms(millis: u64) -> Duration {
        Duration::from_millis(millis)
    }

    fn enabled_machine(zones: u8, activation_ms: u32) -> DragSwitcher {
        let mut s = DragSwitcher::new();
        s.configure(zones, activation_ms, DEFAULT_HOVER_DWELL_MS as u32, DEFAULT_CORNER_SIZE as u32, (4, 4));
        s.set_enabled(true);
        s
    }

    fn drag_start(s: &mut DragSwitcher) {
        s.handle_left_down(100, 100, 0x1234, "C:\\explorer.exe".to_string(), false, ms(0));
    }

    fn drag_past_threshold(s: &mut DragSwitcher) {
        s.handle_mouse_move(120, 100, Some(mon(1, 1920, 1080)), ms(10));
    }

    fn enter_zone(s: &mut DragSwitcher, x: i32, y: i32, at: u64) {
        s.handle_mouse_move(x, y, Some(mon(1, 1920, 1080)), ms(at));
    }

    // ── Zone geometry ────────────────────────────────────────────────────────

    #[test]
    fn top_right_corner_detected() {
        let work = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
        assert_eq!(zone_at(work, 1915, 5, 16, PRESET_TOP_RIGHT), Some(ZONE_TR));
        assert_eq!(zone_at(work, 1900, 500, 16, PRESET_TOP_RIGHT), None, "right edge, not corner");
        assert_eq!(zone_at(work, 100, 5, 16, PRESET_TOP_RIGHT), None);
    }

    #[test]
    fn all_corners_detected() {
        let work = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
        assert_eq!(zone_at(work, 5, 5, 16, PRESET_ALL_CORNERS), Some(ZONE_TL));
        assert_eq!(zone_at(work, 1915, 5, 16, PRESET_ALL_CORNERS), Some(ZONE_TR));
        assert_eq!(zone_at(work, 5, 1035, 16, PRESET_ALL_CORNERS), Some(ZONE_BL));
        assert_eq!(zone_at(work, 1915, 1035, 16, PRESET_ALL_CORNERS), Some(ZONE_BR));
        assert_eq!(zone_at(work, 1000, 500, 16, PRESET_ALL_CORNERS), None);
    }

    #[test]
    fn edges_exclude_corner_overlap() {
        let work = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
        // Top edge mid → Top; near the TR corner → TR wins (corner priority).
        assert_eq!(zone_at(work, 1000, 5, 16, PRESET_ALL_EDGES), Some(ZONE_TOP));
        assert_eq!(zone_at(work, 1905, 5, 16, PRESET_ALL_EDGES), None, "inside corner size is not an edge");
        assert_eq!(zone_at(work, 1900, 500, 16, PRESET_ALL_EDGES), None, "right edge outside size band");
        assert_eq!(zone_at(work, 1905, 500, 16, PRESET_ALL_EDGES), Some(ZONE_RIGHT));
        assert_eq!(zone_at(work, 100, 1035, 16, PRESET_ALL_EDGES), Some(ZONE_BOTTOM));
        assert_eq!(zone_at(work, 100, 100, 16, PRESET_ALL_EDGES), None, "left edge outside size band");
    }

    #[test]
    fn zone_size_clamped_to_12_20() {
        let mut s = DragSwitcher::new();
        s.configure(PRESET_TOP_RIGHT, 250, 400, 5, (4, 4));
        assert_eq!(s.corner_size, DEFAULT_CORNER_SIZE, "below 12 keeps default");
        s.configure(PRESET_TOP_RIGHT, 250, 400, 30, (4, 4));
        assert_eq!(s.corner_size, DEFAULT_CORNER_SIZE, "above 20 keeps default");
        s.configure(PRESET_TOP_RIGHT, 250, 400, 18, (4, 4));
        assert_eq!(s.corner_size, 18);
    }

    #[test]
    fn zone_bitmask_defaults_to_top_right_when_zero() {
        let mut s = DragSwitcher::new();
        s.configure(0, 250, 400, 16, (4, 4));
        assert_eq!(s.zones, PRESET_TOP_RIGHT);
    }

    // ── Machine behavior ─────────────────────────────────────────────────────

    #[test]
    fn disabled_never_tracks() {
        let mut s = DragSwitcher::new();
        assert_eq!(s.handle_left_down(100, 100, 0x1234, "x".into(), false, ms(0)), SwitcherEvent::None);
        s.handle_mouse_move(120, 100, Some(mon(1, 1920, 1080)), ms(10));
        enter_zone(&mut s, 1915, 5, 20);
        assert_eq!(s.on_timer(ms(1000)), SwitcherEvent::None);
        assert!(!s.is_emitting());
    }

    #[test]
    fn injected_mouse_ignored() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        assert_eq!(s.handle_left_down(100, 100, 0x1234, "x".into(), true, ms(0)), SwitcherEvent::None);
    }

    #[test]
    fn small_movement_below_threshold_never_drags() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        // 3px on each axis stays below SM_CXDRAG/SM_CYDRAG (default 4px):
        // never qualified as a drag, so the zone dwell can never arm.
        s.handle_mouse_move(103, 100, Some(mon(1, 1920, 1080)), ms(10));
        s.handle_mouse_move(100, 103, Some(mon(1, 1920, 1080)), ms(20));
        assert_eq!(s.on_timer(ms(1000)), SwitcherEvent::None);
        assert!(!s.is_emitting());
    }

    #[test]
    fn threshold_movement_qualifies_drag() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        s.handle_mouse_move(104, 100, Some(mon(1, 1920, 1080)), ms(10));
        enter_zone(&mut s, 1915, 5, 20);
        assert_eq!(s.on_timer(ms(1000)), SwitcherEvent::Show);
    }

    #[test]
    fn non_drag_hover_does_nothing() {
        // No left button down: even parked in a hot area, nothing happens.
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        enter_zone(&mut s, 1915, 5, 20);
        assert_eq!(s.on_timer(ms(1000)), SwitcherEvent::None);
        assert!(!s.is_emitting());
    }

    #[test]
    fn activation_dwell_fires_show() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(100)), SwitcherEvent::None, "before dwell elapses");
        assert_eq!(s.on_timer(ms(349)), SwitcherEvent::None, "before 100+250=350");
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show, "past dwell");
        assert!(s.is_emitting());
    }

    #[test]
    fn instant_activation_fires_on_entry() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 0);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::None, "already emitting");
        assert!(s.is_emitting(), "instant activation shows immediately");
    }

    #[test]
    fn leaving_zone_resets_dwell() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        // Leave the zone before the dwell elapses -> no show.
        s.handle_mouse_move(500, 500, Some(mon(1, 1920, 1080)), ms(300));
        assert_eq!(s.on_timer(ms(1000)), SwitcherEvent::None);
        // Re-enter -> dwell restarts.
        enter_zone(&mut s, 1915, 5, 1100);
        assert_eq!(s.on_timer(ms(1400)), SwitcherEvent::Show);
    }

    #[test]
    fn show_once_then_mouse_up_hides() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        assert_eq!(s.on_timer(ms(800)), SwitcherEvent::None, "no re-fire");
        assert_eq!(s.handle_mouse_up(ms(900)), SwitcherEvent::Hide(HideReason::MouseUp));
        assert!(!s.is_emitting());
    }

    #[test]
    fn mouse_up_without_show_quiet() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        s.handle_mouse_move(120, 100, Some(mon(1, 1920, 1080)), ms(10));
        assert_eq!(s.handle_mouse_up(ms(20)), SwitcherEvent::None);
    }

    #[test]
    fn escape_hides_when_shown() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        assert_eq!(s.handle_escape(), SwitcherEvent::Hide(HideReason::Escape));
        assert!(!s.is_emitting());
    }

    #[test]
    fn source_gone_hides_when_shown() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        assert_eq!(s.handle_source_gone(), SwitcherEvent::Hide(HideReason::SourceGone));
    }

    #[test]
    fn disable_hides_when_shown() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        assert_eq!(s.set_enabled(false), SwitcherEvent::Hide(HideReason::Disabled));
        assert!(!s.is_enabled());
    }

    #[test]
    fn monitor_change_resets_zone() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        // Enter the top-right zone on monitor 1.
        s.handle_mouse_move(1915, 5, Some(mon(1, 1920, 1080)), ms(100));
        // Drag onto a second monitor -> zone re-anchored.
        s.handle_mouse_move(1920 + 1915, 5, Some(mon(2, 3840, 1080)), ms(150));
        assert_eq!(s.on_timer(ms(399)), SwitcherEvent::None, "dwell restarted on new monitor");
        s.handle_mouse_move(1920 + 1915, 5, Some(mon(2, 3840, 1080)), ms(500));
        assert_eq!(s.on_timer(ms(800)), SwitcherEvent::Show);
    }

    #[test]
    fn cancel_show_allows_retry() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        s.cancel_show();
        assert!(!s.is_emitting());
        assert_eq!(s.on_timer(ms(800)), SwitcherEvent::None, "no enumerate loop while parked");
        s.handle_mouse_move(1915, 6, Some(mon(1, 1920, 1080)), ms(900));
        assert_eq!(s.on_timer(ms(1200)), SwitcherEvent::Show);
    }

    #[test]
    fn repeat_cycle_100() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        for cycle in 0..100 {
            drag_start(&mut s);
            drag_past_threshold(&mut s);
            enter_zone(&mut s, 1915, 5, cycle * 10 + 100);
            assert_eq!(s.on_timer(ms(cycle * 10 + 400)), SwitcherEvent::Show, "cycle {cycle}");
            assert_eq!(s.handle_mouse_up(ms(cycle * 10 + 500)), SwitcherEvent::Hide(HideReason::MouseUp));
            assert!(!s.is_emitting(), "cycle {cycle} stuck");
        }
    }

    #[test]
    fn next_deadline_tracks_dwell() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        assert_eq!(s.next_deadline(ms(0)), None);
        drag_start(&mut s);
        drag_past_threshold(&mut s);
        assert_eq!(s.next_deadline(ms(50)), None, "not in zone yet");
        enter_zone(&mut s, 1915, 5, 100);
        assert_eq!(s.next_deadline(ms(120)), Some(ms(350)), "enter 100 + dwell 250");
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        assert_eq!(s.next_deadline(ms(500)), None);
    }

    #[test]
    fn forensic_logs_on_transitions() {
        let mut s = enabled_machine(PRESET_TOP_RIGHT, 250);
        drag_start(&mut s);
        let logs = s.drain_logs();
        assert!(logs.iter().any(|l| l == "leftDown"));
        assert!(logs.iter().any(|l| l.starts_with("source=")));
        drag_past_threshold(&mut s);
        let logs = s.drain_logs();
        assert!(logs.iter().any(|l| l == "thresholdPassed"));
        enter_zone(&mut s, 1915, 5, 100);
        let logs = s.drain_logs();
        assert!(logs.iter().any(|l| l == "regionEnter=TR"));
        assert!(logs.iter().any(|l| l == "dwellStarted"));
        assert_eq!(s.on_timer(ms(400)), SwitcherEvent::Show);
        let logs = s.drain_logs();
        assert!(logs.iter().any(|l| l == "dwellComplete"));
        assert!(logs.iter().any(|l| l == "showRequested"));
        s.handle_mouse_up(ms(500));
        let logs = s.drain_logs();
        assert!(logs.iter().any(|l| l == "hide=mouseUp"));
    }

    #[test]
    fn base64_encoding_round_trip() {
        assert_eq!(base64_encode(b"hello"), "aGVsbG8=");
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
    }
}