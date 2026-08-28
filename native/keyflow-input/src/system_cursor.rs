//! System Cursor Manager (Win32 native)
//! Replaces Windows OS system cursor with the custom KeyFlow blue cursor
//! when WASD Navigation Mode is active, and restores system cursors on deactivate.
//! Supports configurable cursor size (16px–128px) and user-supplied cursor files.

use std::env;
use std::fs;
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use windows_sys::Win32::Graphics::Gdi::{
    CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CopyIcon, CreateIconIndirect, LoadImageW, SetSystemCursor, SystemParametersInfoW,
    HCURSOR, ICONINFO, IMAGE_CURSOR, LR_DEFAULTSIZE, LR_LOADFROMFILE,
};

const OCR_NORMAL: u32 = 32512;
const OCR_IBEAM: u32 = 32513;
const OCR_HAND: u32 = 32649;
const SPI_SETCURSORS: u32 = 0x0057;

static IS_BLUE: AtomicBool = AtomicBool::new(false);
static CURRENT_SIZE: AtomicU32 = AtomicU32::new(32);
static CURRENT_CUSTOM: Mutex<Option<String>> = Mutex::new(None);

const SRC_W: usize = 24;
const SRC_H: usize = 24;

/// Exact ARGB pixels extracted from public/cursors/blue-cursor.png (24x24)
const BLUE_CURSOR_ARGB: [u32; 24 * 24] = [
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x73218ce7, 0x96228be6, 0x0e2492ed, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xfa218ae6, 0xff228be6, 0xcf228be6, 0x191f8feb, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xe4228ae6, 0x2e218be3, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xee228be6, 0x3e218ce6, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xf8218ae6, 0x57238ae5, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xfe228ae5, 0x74218ae7, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0x912189e6, 0x020080ff, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xab228be6, 0x082080df, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xbe228ce6, 0x0f2288ee, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xd3218ae4, 0x1d238de5, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xe5238be7, 0x2e218be3, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xee228be6, 0x3e218ce6, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xf7228be6, 0x4d218be5, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xce2189e6, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xf8218ae6, 0xd3218ae4, 0xab228be6, 0x44228be5, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xd2228ae5, 0x9c2289e6, 0x75238be7, 0x4c228ae8, 0x24238ee3, 0x0300aaff, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0x99218ae6, 0x044080ff, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xff228be6, 0xf9218be6, 0x62228ae5, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xff228be6, 0xff228be6, 0xff228be6, 0xeb218ae6, 0x3f208ae7, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0xf9218be6, 0xff228be6, 0xd0228be6, 0x1f218ce6, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x69228ae7, 0x88228be7, 0x0c2a95ea, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
];

/// Scale the exact blue cursor PNG to any requested dimension (16px–128px) using bilinear interpolation.
unsafe fn scale_blue_cursor(size: u32) -> HCURSOR {
    let sz = size.max(16).min(128) as i32;
    let mut bmi: BITMAPINFO = std::mem::zeroed();
    bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    bmi.bmiHeader.biWidth = sz;
    bmi.bmiHeader.biHeight = -sz; // top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    let mut bits: *mut std::ffi::c_void = null_mut();
    let hbm_color = CreateDIBSection(
        null_mut(),
        &bmi,
        DIB_RGB_COLORS,
        &mut bits,
        null_mut(),
        0,
    );

    if hbm_color.is_null() || bits.is_null() {
        return null_mut();
    }

    let pixels = std::slice::from_raw_parts_mut(bits as *mut u32, (sz * sz) as usize);

    let get_src_pixel = |x: i32, y: i32| -> (f32, f32, f32, f32) {
        let cx = x.clamp(0, (SRC_W - 1) as i32) as usize;
        let cy = y.clamp(0, (SRC_H - 1) as i32) as usize;
        let p = BLUE_CURSOR_ARGB[cy * SRC_W + cx];
        let a = ((p >> 24) & 0xFF) as f32 / 255.0;
        let r = ((p >> 16) & 0xFF) as f32 / 255.0;
        let g = ((p >> 8) & 0xFF) as f32 / 255.0;
        let b = (p & 0xFF) as f32 / 255.0;
        (r * a, g * a, b * a, a)
    };

    let scale_x = (SRC_W as f32) / (sz as f32);
    let scale_y = (SRC_H as f32) / (sz as f32);

    for dst_y in 0..sz {
        for dst_x in 0..sz {
            let src_x = (dst_x as f32 + 0.5) * scale_x - 0.5;
            let src_y = (dst_y as f32 + 0.5) * scale_y - 0.5;

            let x0 = src_x.floor() as i32;
            let y0 = src_y.floor() as i32;
            let x1 = x0 + 1;
            let y1 = y0 + 1;

            let fx = (src_x - x0 as f32).clamp(0.0, 1.0);
            let fy = (src_y - y0 as f32).clamp(0.0, 1.0);

            let (r00, g00, b00, a00) = get_src_pixel(x0, y0);
            let (r10, g10, b10, a10) = get_src_pixel(x1, y0);
            let (r01, g01, b01, a01) = get_src_pixel(x0, y1);
            let (r11, g11, b11, a11) = get_src_pixel(x1, y1);

            let top_r = r00 * (1.0 - fx) + r10 * fx;
            let top_g = g00 * (1.0 - fx) + g10 * fx;
            let top_b = b00 * (1.0 - fx) + b10 * fx;
            let top_a = a00 * (1.0 - fx) + a10 * fx;

            let bot_r = r01 * (1.0 - fx) + r11 * fx;
            let bot_g = g01 * (1.0 - fx) + g11 * fx;
            let bot_b = b01 * (1.0 - fx) + b11 * fx;
            let bot_a = a01 * (1.0 - fx) + a11 * fx;

            let r = top_r * (1.0 - fy) + bot_r * fy;
            let g = top_g * (1.0 - fy) + bot_g * fy;
            let b = top_b * (1.0 - fy) + bot_b * fy;
            let a = top_a * (1.0 - fy) + bot_a * fy;

            let idx = (dst_y * sz + dst_x) as usize;
            if a > 0.001 {
                let u_a = (a.min(1.0) * 255.0).round() as u32;
                let u_r = (r.min(1.0) * 255.0).round() as u32;
                let u_g = (g.min(1.0) * 255.0).round() as u32;
                let u_b = (b.min(1.0) * 255.0).round() as u32;
                pixels[idx] = (u_a << 24) | (u_r << 16) | (u_g << 8) | u_b;
            } else {
                pixels[idx] = 0;
            }
        }
    }

    let hbm_mask = CreateBitmap(sz, sz, 1, 1, null_mut());

    let mut ii: ICONINFO = std::mem::zeroed();
    ii.fIcon = 0; // Cursor
    // Hotspot scaled from (5, 2) in 24x24 source
    ii.xHotspot = ((5.0 * sz as f32 / 24.0).round() as u32).min(sz as u32 - 1);
    ii.yHotspot = ((2.0 * sz as f32 / 24.0).round() as u32).min(sz as u32 - 1);
    ii.hbmMask = hbm_mask;
    ii.hbmColor = hbm_color;

    let h_cursor = CreateIconIndirect(&ii);

    DeleteObject(hbm_mask);
    DeleteObject(hbm_color);

    h_cursor
}

#[repr(C)]
struct GdiplusStartupInput {
    gdiplus_version: u32,
    debug_event_callback: usize,
    suppress_background_thread: i32,
    suppress_external_codecs: i32,
}

/// Load and scale a custom cursor image (.png, .jpg, .ico, .bmp) using GDI+
unsafe fn load_custom_cursor_gdiplus(path: &PathBuf, sz: u32) -> HCURSOR {
    let gdiplus_dll: Vec<u16> = "gdiplus.dll\0".encode_utf16().collect();
    let h_mod = LoadLibraryW(gdiplus_dll.as_ptr());
    if h_mod.is_null() {
        return null_mut();
    }

    type GdiplusStartupFn = unsafe extern "system" fn(*mut usize, *const GdiplusStartupInput, *mut std::ffi::c_void) -> i32;
    type GdiplusShutdownFn = unsafe extern "system" fn(usize);
    type GdipCreateBitmapFromFileFn = unsafe extern "system" fn(*const u16, *mut *mut std::ffi::c_void) -> i32;
    type GdipCreateBitmapFromScan0Fn = unsafe extern "system" fn(i32, i32, i32, i32, *mut u8, *mut *mut std::ffi::c_void) -> i32;
    type GdipGetImageGraphicsContextFn = unsafe extern "system" fn(*mut std::ffi::c_void, *mut *mut std::ffi::c_void) -> i32;
    type GdipGetImageWidthFn = unsafe extern "system" fn(*mut std::ffi::c_void, *mut u32) -> i32;
    type GdipGetImageHeightFn = unsafe extern "system" fn(*mut std::ffi::c_void, *mut u32) -> i32;
    type GdipDrawImageRectRectIFn = unsafe extern "system" fn(
        *mut std::ffi::c_void,
        *mut std::ffi::c_void,
        i32, i32, i32, i32,
        i32, i32, i32, i32,
        i32,
        *const std::ffi::c_void,
        *mut std::ffi::c_void,
        *mut std::ffi::c_void,
    ) -> i32;
    type GdipCreateHICONFromBitmapFn = unsafe extern "system" fn(*mut std::ffi::c_void, *mut HCURSOR) -> i32;
    type GdipDisposeImageFn = unsafe extern "system" fn(*mut std::ffi::c_void) -> i32;
    type GdipDeleteGraphicsFn = unsafe extern "system" fn(*mut std::ffi::c_void) -> i32;

    let p_startup = GetProcAddress(h_mod, b"GdiplusStartup ".as_ptr());
    let p_shutdown = GetProcAddress(h_mod, b"GdiplusShutdown ".as_ptr());
    let p_create_file = GetProcAddress(h_mod, b"GdipCreateBitmapFromFile ".as_ptr());
    let p_create_scan0 = GetProcAddress(h_mod, b"GdipCreateBitmapFromScan0 ".as_ptr());
    let p_get_gfx = GetProcAddress(h_mod, b"GdipGetImageGraphicsContext ".as_ptr());
    let p_get_w = GetProcAddress(h_mod, b"GdipGetImageWidth ".as_ptr());
    let p_get_h = GetProcAddress(h_mod, b"GdipGetImageHeight ".as_ptr());
    let p_draw = GetProcAddress(h_mod, b"GdipDrawImageRectRectI ".as_ptr());
    let p_create_hicon = GetProcAddress(h_mod, b"GdipCreateHICONFromBitmap ".as_ptr());
    let p_dispose = GetProcAddress(h_mod, b"GdipDisposeImage ".as_ptr());
    let p_del_gfx = GetProcAddress(h_mod, b"GdipDeleteGraphics ".as_ptr());

    let (Some(p_startup), Some(p_shutdown), Some(p_create_file), Some(p_create_hicon), Some(p_dispose)) =
        (p_startup, p_shutdown, p_create_file, p_create_hicon, p_dispose) else {
        return null_mut();
    };

    let startup_fn: GdiplusStartupFn = std::mem::transmute(p_startup);
    let shutdown_fn: GdiplusShutdownFn = std::mem::transmute(p_shutdown);
    let create_file_fn: GdipCreateBitmapFromFileFn = std::mem::transmute(p_create_file);
    let create_hicon_fn: GdipCreateHICONFromBitmapFn = std::mem::transmute(p_create_hicon);
    let dispose_fn: GdipDisposeImageFn = std::mem::transmute(p_dispose);

    let create_scan0_fn: Option<GdipCreateBitmapFromScan0Fn> = p_create_scan0.map(|f| std::mem::transmute(f));
    let get_gfx_fn: Option<GdipGetImageGraphicsContextFn> = p_get_gfx.map(|f| std::mem::transmute(f));
    let get_w_fn: Option<GdipGetImageWidthFn> = p_get_w.map(|f| std::mem::transmute(f));
    let get_h_fn: Option<GdipGetImageHeightFn> = p_get_h.map(|f| std::mem::transmute(f));
    let draw_fn: Option<GdipDrawImageRectRectIFn> = p_draw.map(|f| std::mem::transmute(f));
    let del_gfx_fn: Option<GdipDeleteGraphicsFn> = p_del_gfx.map(|f| std::mem::transmute(f));

    let mut token: usize = 0;
    let input = GdiplusStartupInput {
        gdiplus_version: 1,
        debug_event_callback: 0,
        suppress_background_thread: 0,
        suppress_external_codecs: 0,
    };

    if startup_fn(&mut token, &input, null_mut()) != 0 {
        return null_mut();
    }

    let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut p_src_bitmap: *mut std::ffi::c_void = null_mut();
    let mut h_cursor: HCURSOR = null_mut();

    if create_file_fn(wide_path.as_ptr(), &mut p_src_bitmap) == 0 && !p_src_bitmap.is_null() {
        if let (Some(get_w), Some(get_h), Some(create_scan0), Some(get_gfx), Some(draw), Some(del_gfx)) =
            (get_w_fn, get_h_fn, create_scan0_fn, get_gfx_fn, draw_fn, del_gfx_fn) {
            let mut src_w = 0u32;
            let mut src_h = 0u32;
            let _ = get_w(p_src_bitmap, &mut src_w);
            let _ = get_h(p_src_bitmap, &mut src_h);

            let target_sz = sz.max(16).min(128) as i32;

            let mut p_dst_bitmap: *mut std::ffi::c_void = null_mut();
            if create_scan0(target_sz, target_sz, 0, 0x26200A, null_mut(), &mut p_dst_bitmap) == 0 && !p_dst_bitmap.is_null() {
                let mut p_gfx: *mut std::ffi::c_void = null_mut();
                if get_gfx(p_dst_bitmap, &mut p_gfx) == 0 && !p_gfx.is_null() {
                    draw(
                        p_gfx,
                        p_src_bitmap,
                        0, 0, target_sz, target_sz,
                        0, 0, src_w as i32, src_h as i32,
                        2, // UnitPixel
                        null_mut(),
                        null_mut(),
                        null_mut(),
                    );
                    del_gfx(p_gfx);
                }
                create_hicon_fn(p_dst_bitmap, &mut h_cursor);
                dispose_fn(p_dst_bitmap);
            } else {
                create_hicon_fn(p_src_bitmap, &mut h_cursor);
            }
        } else {
            create_hicon_fn(p_src_bitmap, &mut h_cursor);
        }
        dispose_fn(p_src_bitmap);
    }

    shutdown_fn(token);
    h_cursor
}

pub fn set_system_cursor_blue(enabled: bool, size: u32, custom_path: Option<&str>) {
    let sz = size.max(16).min(128);
    let prev_active = IS_BLUE.load(Ordering::SeqCst);
    let prev_size = CURRENT_SIZE.swap(sz, Ordering::SeqCst);
    let custom_str = custom_path.map(|s| s.to_string());
    let mut guard = CURRENT_CUSTOM.lock().unwrap_or_else(|p| p.into_inner());
    let path_changed = *guard != custom_str;
    *guard = custom_str.clone();

    if !enabled {
        if IS_BLUE.swap(false, Ordering::SeqCst) {
            unsafe {
                let ok = SystemParametersInfoW(SPI_SETCURSORS, 0, null_mut(), 0);
                eprintln!("[cursor] SystemParametersInfoW restore default ok={}", ok);
            }
        }
        return;
    }

    IS_BLUE.store(true, Ordering::SeqCst);

    if prev_active && prev_size == sz && !path_changed {
        return;
    }

    unsafe {
        let mut h1: HCURSOR = null_mut();

        if let Some(ref p) = custom_str {
            let path = PathBuf::from(p);
            if path.exists() {
                // 1. Try LoadImageW if .cur / .ico
                let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
                h1 = LoadImageW(
                    null_mut(),
                    wide.as_ptr(),
                    IMAGE_CURSOR,
                    sz as i32,
                    sz as i32,
                    LR_LOADFROMFILE,
                );
                if h1.is_null() {
                    h1 = LoadImageW(
                        null_mut(),
                        wide.as_ptr(),
                        IMAGE_CURSOR,
                        0,
                        0,
                        LR_LOADFROMFILE | LR_DEFAULTSIZE,
                    );
                }
                // 2. If LoadImageW failed (e.g. .png file), load via GDI+
                if h1.is_null() {
                    h1 = load_custom_cursor_gdiplus(&path, sz);
                }
            }
        }

        // 3. If no custom cursor or custom cursor failed, scale the exact blue cursor PNG
        if h1.is_null() {
            h1 = scale_blue_cursor(sz);
        }

        if !h1.is_null() {
            let h_hand = CopyIcon(h1);
            let h_ibeam = CopyIcon(h1);
            let ok1 = SetSystemCursor(h1, OCR_NORMAL);
            let ok2 = if !h_hand.is_null() { SetSystemCursor(h_hand, OCR_HAND) } else { 0 };
            let ok3 = if !h_ibeam.is_null() { SetSystemCursor(h_ibeam, OCR_IBEAM) } else { 0 };
            eprintln!("[cursor] SetSystemCursor blue normal={} hand={} ibeam={} size={}x{}", ok1, ok2, ok3, sz, sz);
        } else {
            eprintln!("[cursor] Failed to create system cursor for size={}x{}", sz, sz);
        }
    }
}

pub fn restore_default_cursor() {
    if IS_BLUE.swap(false, Ordering::SeqCst) {
        unsafe {
            let ok = SystemParametersInfoW(SPI_SETCURSORS, 0, null_mut(), 0);
            eprintln!("[cursor] restore_default_cursor ok={}", ok);
        }
    }
}
