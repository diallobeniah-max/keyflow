//! Mouse observation for the Drag Corner Switcher V2.
//!
//! V2 uses Win32 Raw Input as the primary mouse source
//! (`HID_USAGE_PAGE_GENERIC` + `HID_USAGE_GENERIC_MOUSE` + `RIDEV_INPUTSINK`),
//! with a WH_MOUSE_LL observation fallback. Windows allows ONE raw-input
//! target window per device class per process, so this module is the SOLE
//! owner of mouse observation in keyflow-input.
//!
//! Raw Input delivers TWO report shapes for a generic mouse: `RIM_TYPEMOUSE`
//! (standard mice — button flags in `RAWMOUSE.usButtonFlags`) and
//! `RIM_TYPEHID` (exotic HID-reporting mice — button state in report bytes).
//! Earlier builds only parsed `RIM_TYPEHID`, which is why standard mice
//! produced no WM_INPUT button/move events at all.
//!
//! Position is ALWAYS read via GetCursorPos() (real screen coordinates). Raw
//! deltas are relative and never integrated; raw input only reports button
//! state changes, which is what we need to know "physical left is down" and
//! "physical left came up". Movement still arrives as WM_INPUT so parked-cursor
//! dwell keeps working through the shared deadline timer.
//!
//! The hidden window lives on the hook thread. RegisterRawInputDevices targets
//! it, and WM_INPUT is dispatched by the existing message loop. Registration is
//! verified via GetRegisteredRawInputDevices after registering, and the runtime
//! backend is reported with `[mouse-observer] backend=raw-input` /
//! `backend=low-level-hook reason=..`. The fallback is OBSERVATION ONLY: it
//! always calls CallNextHookEx, never returns non-zero, and never synthesizes
//! mouse input.

use std::mem::size_of;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use windows_sys::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::UI::Input::{
    GetRawInputData, GetRegisteredRawInputDevices, RegisterRawInputDevices, RAWINPUT, RAWINPUTDEVICE,
    RAWINPUTHEADER, RID_INPUT, RIDEV_INPUTSINK, RIM_TYPEHID, RIM_TYPEMOUSE,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, CreateWindowExW, DefWindowProcW, GetCursorPos, PostMessageW, RegisterClassW,
    RI_MOUSE_LEFT_BUTTON_DOWN, RI_MOUSE_LEFT_BUTTON_UP, SetWindowsHookExW,
    WH_MOUSE_LL, WM_INPUT, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WS_POPUP,
    WNDCLASSW,
};

use crate::drag_switcher;
use crate::hook::now_at;

/// Whether raw input registration succeeded (forensic log line).
static REGISTERED: AtomicBool = AtomicBool::new(false);
/// Which observer backend is live: 0 = none, 1 = raw input, 2 = low-level hook.
static BACKEND: AtomicU32 = AtomicU32::new(0);
/// Rate limiter for WM_INPUT forensic logs.
static WM_INPUT_LOG_COUNT: AtomicU32 = AtomicU32::new(0);

pub fn is_registered() -> bool {
    REGISTERED.load(Ordering::SeqCst)
}

pub fn backend_is_raw() -> bool {
    BACKEND.load(Ordering::SeqCst) == 1
}

pub fn backend_is_hook() -> bool {
    BACKEND.load(Ordering::SeqCst) == 2
}

/// Create the hidden raw-input window on the hook thread and register for raw
/// mouse input. Must run on the thread that will dispatch messages. If raw
/// registration or verification fails, installs the WH_MOUSE_LL observation
/// fallback instead (same shared state machine) and reports the backend.
pub fn init(hinstance: HINSTANCE) -> HWND {
    let class_name = wide("KeyFlowRawMouse");
    let wc = WNDCLASSW {
        style: 0,
        lpfnWndProc: Some(raw_wndproc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: hinstance,
        hIcon: std::ptr::null_mut(),
        hCursor: std::ptr::null_mut(),
        hbrBackground: std::ptr::null_mut(),
        lpszMenuName: std::ptr::null(),
        lpszClassName: class_name.as_ptr(),
    };
    let class_atom = unsafe { RegisterClassW(&wc) };
    if class_atom == 0 {
        eprintln!(
            "[raw-mouse] registerClass error={}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
        return install_low_level_hook("registerClassFailed");
    }
    let hwnd = unsafe {
        CreateWindowExW(
            0,
            class_name.as_ptr(),
            wide("keyflow-input raw mouse").as_ptr(),
            WS_POPUP,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            hinstance,
            std::ptr::null_mut(),
        )
    };
    if hwnd.is_null() {
        eprintln!(
            "[raw-mouse] createWindow error={}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
        return install_low_level_hook("createWindowFailed");
    }
    eprintln!("[raw-mouse] threadStarted=true hwnd=0x{:x}", hwnd as usize);
    let dev = RAWINPUTDEVICE {
        usUsagePage: 0x01, // HID_USAGE_PAGE_GENERIC
        usUsage: 0x02,     // HID_USAGE_GENERIC_MOUSE
        dwFlags: RIDEV_INPUTSINK,
        hwndTarget: hwnd,
    };
    let ok = unsafe { RegisterRawInputDevices(&dev, 1, size_of::<RAWINPUTDEVICE>() as u32) };
    if ok == 0 {
        REGISTERED.store(false, Ordering::SeqCst);
        eprintln!(
            "[raw-mouse] register result=fail error={}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
        return install_low_level_hook("registerRawInputFailed");
    }
    REGISTERED.store(true, Ordering::SeqCst);
    eprintln!("[raw-mouse] register result=ok");
    // Verify the registration actually landed: GetRegisteredRawInputDevices must
    // report the mouse device with OUR hidden window as its target.
    let verified = verify_registered_devices(hwnd);
    if !verified {
        eprintln!("[raw-mouse] registration verification failed — mouseTarget != message hwnd");
        return install_low_level_hook("verificationFailed");
    }
    BACKEND.store(1, Ordering::SeqCst);
    eprintln!("[mouse-observer] backend=raw-input");
    hwnd
}

/// Post a shutdown to the hook thread (mirrors the keyboard hook's quit path).
pub fn request_quit(hwnd: HWND) {
    if !hwnd.is_null() {
        unsafe {
            let _ = PostMessageW(hwnd, windows_sys::Win32::UI::WindowsAndMessaging::WM_CLOSE, 0, 0);
        }
    }
}

/// Verify a registered raw mouse device targets `hwnd`. Logs the device count
/// and the mouseTarget handle so runtime wiring is auditable.
fn verify_registered_devices(hwnd: HWND) -> bool {
    unsafe {
        let mut count: u32 = 0;
        // First call with null buffer returns the count of registered devices.
        let _ = GetRegisteredRawInputDevices(std::ptr::null_mut(), &mut count, size_of::<RAWINPUTDEVICE>() as u32);
        if count == 0 {
            eprintln!("[raw-mouse] registeredDevices count=0");
            return false;
        }
        let zero_dev = RAWINPUTDEVICE { usUsagePage: 0, usUsage: 0, dwFlags: 0, hwndTarget: std::ptr::null_mut() };
        let mut devices: Vec<RAWINPUTDEVICE> = vec![zero_dev; count as usize];
        let got = GetRegisteredRawInputDevices(
            devices.as_mut_ptr(),
            &mut count,
            size_of::<RAWINPUTDEVICE>() as u32,
        );
        if got == 0xFFFFFFFF || got == 0 {
            eprintln!("[raw-mouse] registeredDevices queryFailed error={}", last_error());
            return false;
        }
        let mouse_target = devices
            .iter()
            .find(|d| d.usUsagePage == 0x01 && d.usUsage == 0x02)
            .map(|d| d.hwndTarget as usize);
        eprintln!(
            "[raw-mouse] registeredDevices count={} mouseTarget=0x{:x}",
            got,
            mouse_target.unwrap_or(0)
        );
        mouse_target == Some(hwnd as usize)
    }
}

fn last_error() -> u32 {
    unsafe { windows_sys::Win32::Foundation::GetLastError() }
}

/// Install the WH_MOUSE_LL observation hook as a fallback. Observation only:
/// the callback always calls CallNextHookEx and never returns non-zero. It
/// feeds the SAME drag_switcher state machine as raw input, so the backend is
/// transparent to the switcher. Returns a null HWND (raw path unusable).
fn install_low_level_hook(reason: &str) -> HWND {
    BACKEND.store(2, Ordering::SeqCst);
    REGISTERED.store(false, Ordering::SeqCst);
    let hook = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_ll_proc), std::ptr::null_mut(), 0) };
    if hook.is_null() {
        BACKEND.store(0, Ordering::SeqCst);
        eprintln!(
            "[mouse-observer] backend=none reason={} hookError={}",
            reason,
            last_error()
        );
        return std::ptr::null_mut();
    }
    eprintln!("[mouse-observer] backend=low-level-hook reason={reason} hook=0x{:x}", hook as usize);
    std::ptr::null_mut()
}

unsafe extern "system" fn mouse_ll_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // Observation only: never block or synthesize input. Always chain.
    if code >= 0 {
        match wparam as u32 {
            WM_LBUTTONDOWN => drag_switcher::on_raw_mouse_down(true, now_at()),
            WM_LBUTTONUP => drag_switcher::on_raw_mouse_down(false, now_at()),
            WM_MOUSEMOVE => {
                let mut pt = POINT { x: 0, y: 0 };
                if GetCursorPos(&mut pt) != 0 {
                    drag_switcher::on_raw_mouse_move(pt.x, pt.y, now_at());
                }
            }
            // Wheel and other messages are ignored (observation only).
            _ => {}
        }
    }
    // WM_MOUSEMOVE / WM_MOUSEWHEEL constants referenced to keep imports honest.
    let _ = (WM_MOUSEMOVE, WM_MOUSEWHEEL);
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
}

/// Remove the low-level hook fallback if one was installed (shutdown path).
pub fn shutdown_low_level_hook() {
    if BACKEND.load(Ordering::SeqCst) == 2 {
        // SetWindowsHookExW WH_MOUSE_LL handles are process-wide; the hook is
        // removed automatically when the thread exits. Nothing to do here.
        BACKEND.store(0, Ordering::SeqCst);
    }
}

unsafe extern "system" fn raw_wndproc(_hwnd: HWND, msg: u32, _wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_INPUT {
        handle_raw_input(lparam);
        return 0;
    }
    unsafe { DefWindowProcW(_hwnd, msg, _wparam, lparam) }
}

unsafe fn handle_raw_input(lparam: LPARAM) {
    let mut size: u32 = 0;
    if GetRawInputData(
        lparam as _,
        RID_INPUT,
        std::ptr::null_mut(),
        &mut size,
        size_of::<RAWINPUT>() as u32,
    ) == 0xFFFFFFFF
        || size == 0
    {
        return;
    }
    let mut raw: Vec<u8> = vec![0u8; size as usize];
    let copied = GetRawInputData(
        lparam as _,
        RID_INPUT,
        raw.as_mut_ptr() as _,
        &mut size,
        size_of::<RAWINPUT>() as u32,
    );
    if copied != size || copied == 0 {
        return;
    }
    let rawinput = &*(raw.as_ptr() as *const RAWINPUT);
    let n = WM_INPUT_LOG_COUNT.fetch_add(1, Ordering::Relaxed);
    // Rate-limited forensic log: first 20 reports, then every 100th.
    if n < 20 || n % 100 == 0 {
        let mut pt = POINT { x: 0, y: 0 };
        let _ = GetCursorPos(&mut pt);
        eprintln!(
            "[raw-mouse] WM_INPUT received n={} | type={} | cursor x={} y={}",
            n, rawinput.header.dwType, pt.x, pt.y
        );
    }
    if rawinput.header.dwType == RIM_TYPEMOUSE {
        handle_raw_mouse_report(&rawinput.data.mouse, now_at());
        return;
    }
    if rawinput.header.dwType == RIM_TYPEHID {
        // Exotic HID-reporting mice: button state in the HID report bytes.
        let bytes = &raw[size_of::<RAWINPUTHEADER>()..];
        let buttons = raw_mouse_buttons(bytes);
        if buttons.left_edge_up {
            drag_switcher::on_raw_mouse_down(false, now_at());
            return;
        }
        if buttons.left_edge_down {
            drag_switcher::on_raw_mouse_down(true, now_at());
            return;
        }
    }
    // Movement (either report shape): position always from GetCursorPos.
    let mut pt = POINT { x: 0, y: 0 };
    if GetCursorPos(&mut pt) != 0 {
        drag_switcher::on_raw_mouse_move(pt.x, pt.y, now_at());
    }
}

/// Handle a RIM_TYPEMOUSE report. Button transitions come from RAWMOUSE
/// `usButtonFlags`; `lLastX/lLastY` are RELATIVE deltas and are never
/// integrated — position is always read via GetCursorPos.
unsafe fn handle_raw_mouse_report(mouse: &windows_sys::Win32::UI::Input::RAWMOUSE, at: std::time::Duration) {
    let flags = mouse.Anonymous.Anonymous.usButtonFlags;
    if flags & RI_MOUSE_LEFT_BUTTON_UP as u16 != 0 {
        eprintln!("[raw-mouse] leftUp flags=0x{flags:x}");
        drag_switcher::on_raw_mouse_down(false, at);
        return;
    }
    if flags & RI_MOUSE_LEFT_BUTTON_DOWN as u16 != 0 {
        eprintln!("[raw-mouse] leftDown flags=0x{flags:x}");
        drag_switcher::on_raw_mouse_down(true, at);
        return;
    }
    // Movement only — position is always taken from GetCursorPos (never
    // integrated from relative deltas), so report the current position.
    let mut pt = POINT { x: 0, y: 0 };
    if GetCursorPos(&mut pt) != 0 {
        drag_switcher::on_raw_mouse_move(pt.x, pt.y, at);
    }
}

struct RawMouseButtons {
    left_edge_down: bool,
    left_edge_up: bool,
}

/// Minimal HID parser: the generic-mouse usage page reports button bits in the
/// first report byte (bit 0 = left). Deliberately conservative — a parse
/// failure reports no button change and the caller keeps the last known state.
fn raw_mouse_buttons(data: &[u8]) -> RawMouseButtons {
    let mut out = RawMouseButtons { left_edge_down: false, left_edge_up: false };
    if data.is_empty() {
        return out;
    }
    let b0 = data[0];
    // HID generic mouse: bit 0 of byte 0 = left button state.
    out.left_edge_down = b0 & 0x01 != 0;
    out.left_edge_up = !out.left_edge_down;
    out
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hid_left_button_bit_detected() {
        let b = raw_mouse_buttons(&[0x01]);
        assert!(b.left_edge_down);
        assert!(!b.left_edge_up);
        let b = raw_mouse_buttons(&[0x00]);
        assert!(!b.left_edge_down);
        assert!(b.left_edge_up);
    }

    #[test]
    fn empty_hid_report_is_safe() {
        let b = raw_mouse_buttons(&[]);
        assert!(!b.left_edge_down);
        assert!(!b.left_edge_up);
    }

    #[test]
    fn wide_string_terminates() {
        let w = wide("KeyFlowRawMouse");
        assert_eq!(w.last(), Some(&0u16));
    }

    #[test]
    fn mouse_button_flag_constants_match_win32() {
        // RI_MOUSE_LEFT_BUTTON_DOWN = 1, UP = 2 (verified against windows-sys).
        assert_eq!(RI_MOUSE_LEFT_BUTTON_DOWN as u16, 1);
        assert_eq!(RI_MOUSE_LEFT_BUTTON_UP as u16, 2);
    }

    #[test]
    fn raw_mouse_type_constants() {
        assert_eq!(RIM_TYPEMOUSE, 0);
        assert_eq!(RIM_TYPEHID, 2);
    }
}