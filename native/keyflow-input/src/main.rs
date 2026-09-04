#![windows_subsystem = "windows"]
//! keyflow-input: KeyFlow's native Windows keyboard helper.
//!
//! Protocol: NDJSON over stdin/stdout. stderr carries diagnostics only.
//! Modes:
//!   keyflow-input --parent-pid <pid>    normal operation
//!   keyflow-input --self-test           protocol smoke test, NO hook

mod app_scope;
mod config;
mod drag_switcher;
mod hook;
mod inject;
mod keymap;
mod navigation_mode;
mod parent_watch;
mod protocol;
mod raw_mouse;
mod remap;
mod smooth_scroll;
mod system_cursor;
mod trigger;
mod window_control;

use std::io::{BufRead, BufReader, Write};
use std::process::ExitCode;
use std::sync::mpsc::sync_channel;
use std::thread;

use windows_sys::Win32::System::Threading::GetCurrentThreadId;

use protocol::{InMessage, OutMessage, PROTOCOL_VERSION};

pub const BUILD_ID: &str = "HYPER_FORENSIC_BUILD_2026_08_13_A";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--self-test") {
        return run_self_test();
    }
    if args.iter().any(|a| a == "--window-topmost") {
        return window_control::run_window_topmost_cli(&args);
    }
    let parent_pid = args
        .windows(2)
        .find(|w| w[0] == "--parent-pid")
        .and_then(|w| w[1].parse::<u32>().ok());

    let pipe_name = args
        .windows(2)
        .find(|w| w[0] == "--pipe")
        .map(|w| w[1].clone());

    let token = args
        .windows(2)
        .find(|w| w[0] == "--token")
        .map(|w| w[1].clone());

    // The helper must never offer KeyFlow's own windows as switch targets.
    drag_switcher::set_parent_pid(parent_pid.unwrap_or(0));

    let (reader, writer): (Box<dyn BufRead + Send>, Box<dyn Write + Send>) = if let Some(ref pipe) = pipe_name {
        let file = match std::fs::OpenOptions::new().read(true).write(true).open(pipe) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[keyflow-input] failed to open pipe {pipe}: {e}");
                return ExitCode::from(3);
            }
        };
        let write_file = match file.try_clone() {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[keyflow-input] failed to clone pipe: {e}");
                return ExitCode::from(3);
            }
        };
        (Box::new(BufReader::new(file)), Box::new(write_file))
    } else {
        (Box::new(BufReader::new(std::io::stdin())), Box::new(std::io::stdout()))
    };

    // Writer thread: hook/worker threads push lines, writer owns stdout or pipe.
    let (tx, rx) = sync_channel::<String>(1024);
    *hook::SENDER.lock().unwrap() = Some(tx);
    thread::spawn(move || {
        let mut out = writer;
        while let Ok(line) = rx.recv() {
            if writeln!(out, "{line}").is_err() || out.flush().is_err() {
                break; // Pipe closed
            }
        }
    });

    let hook_thread_id = unsafe { GetCurrentThreadId() };
    let quit = move || {
        unsafe {
            let _ = windows_sys::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                hook_thread_id,
                windows_sys::Win32::UI::WindowsAndMessaging::WM_QUIT,
                0,
                0,
            );
        }
    };

    // Reader thread: protocol commands + EOF -> quit (fail-open).
    thread::spawn(move || {
        let mut reader = reader;
        let mut line_buf = String::new();
        loop {
            line_buf.clear();
            match reader.read_line(&mut line_buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = line_buf.trim();
                    if line.is_empty() {
                        continue;
                    }
                    match protocol::parse_line(line) {
                        Some(InMessage::Configure { version: _, config_version, shortcuts, keys, typing_protection, typing_idle_ms, hyper_key }) => {
                            let mut rule_count = 0;
                            let mut active_rules = 0;

                            // Compute typing threshold outside the lock.
                            let idle_ms = if let Some(ms) = typing_idle_ms {
                                ms
                            } else {
                                match typing_protection.as_deref() {
                                    Some("off") => 0,
                                    Some("strict") => 650,
                                    _ => config::DEFAULT_TYPING_IDLE_MS,
                                }
                            };

                            // Snapshot BEFORE save (for diagnostics).
                            let before_rules = {
                                let cfg = config::CONFIG.lock().unwrap_or_else(|p| p.into_inner());
                                cfg.rules().len()
                            };
                            eprintln!(
                                "[config-snapshot] BEFORE_SAVE version={} activeRules={}",
                                config_version, before_rules
                            );

                            // Apply config with minimal lock hold time.
                            // apply_shortcuts is now atomic internally (builds
                            // temps then swaps), so the lock is held only for
                            // the duration of the swap, not the entire rebuild.
                            if let Ok(mut cfg) = config::CONFIG.lock() {
                                cfg.set_typing_idle_threshold(std::time::Duration::from_millis(idle_ms as u64));
                                if shortcuts.is_empty() {
                                    cfg.apply(&keys);
                                    rule_count = keys.len();
                                } else {
                                    cfg.apply_shortcuts(&shortcuts);
                                    rule_count = cfg.rules().len();
                                }
                                active_rules = cfg.rules().len();
                            }
                            // CONFIG lock is dropped here — hook thread is unblocked.

                            // Snapshot AFTER save.
                            eprintln!(
                                "[config-snapshot] AFTER_SAVE version={} activeRules={} specCount={}",
                                config_version, active_rules, if shortcuts.is_empty() { keys.len() } else { shortcuts.len() }
                            );

                            let (h_enabled, h_vk, h_shift, h_tap_id) = hyper_key.as_ref().map_or(
                                (false, None, false, None),
                                |h| (h.enabled, if h.enabled { Some(h.vk) } else { None }, h.include_shift, h.tap_action_id.clone()),
                            );
                            eprintln!(
                                "[hyper-forensic] RUST CONFIG version={} enabled={} physicalVk={} includeShift={} tapSyntheticId={} status={}",
                                config_version,
                                h_enabled,
                                h_vk.unwrap_or(0),
                                h_shift,
                                h_tap_id.as_deref().unwrap_or("none"),
                                "ok"
                            );

                            // Engine reload: acquires ENGINE lock briefly.
                            // This is on the reader thread, so the hook thread
                            // may briefly contend on ENGINE. Keep it fast.
                            hook::reload_engine_with_hyper(hyper_key);
                            // Reconfiguring invalidates gesture state: release any
                            // injected navigation arrows so none stay stuck.
                            hook::release_wasd_arrows();
                            hook::queue(
                                OutMessage::Ack {
                                    version: PROTOCOL_VERSION,
                                    r#for: "configure".to_string(),
                                    config_version,
                                    count: rule_count,
                                    hyper_enabled: Some(h_enabled),
                                    hyper_physical_vk: h_vk,
                                    include_shift: Some(h_shift),
                                    tap_synthetic_id: h_tap_id,
                                    status: "ok".to_string(),
                                    error: None,
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::Pause { .. }) => {
                            if let Ok(mut cfg) = config::CONFIG.lock() {
                                cfg.set_paused(true);
                            }
                            hook::set_engine_paused(true);
                            // Navigation must not keep arrows stuck while paused.
                            hook::set_wasd_paused(true);
                            // Remap targets and the drag switcher overlay must not
                            // survive a pause.
                            remap::set_paused(true);
                            smooth_scroll::set_paused(true);
                            drag_switcher::hide_all(crate::drag_switcher::HideReason::Paused);
                        }
                        Some(InMessage::Resume { .. }) => {
                            if let Ok(mut cfg) = config::CONFIG.lock() {
                                cfg.set_paused(false);
                            }
                            hook::set_engine_paused(false);
                            hook::set_wasd_paused(false);
                            remap::set_paused(false);
                            smooth_scroll::set_paused(false);
                        }
                        Some(InMessage::BeginCapture { .. }) => {
                            eprintln!("[key-capture-native] StartKeyCapture received");
                            hook::arm_capture();
                            eprintln!("[key-capture-native] armed");
                            hook::queue(
                                OutMessage::CaptureArmed {
                                    version: PROTOCOL_VERSION,
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::StopKeyCapture { .. }) => {
                            eprintln!("[key-capture] stop reason=cancel");
                            hook::disarm_capture();
                        }
                        Some(InMessage::SetKeyStream { enabled, .. }) => {
                            hook::set_key_stream(enabled);
                        }
                        Some(InMessage::SetWasdNavigation { enabled, cursor_size, cursor_path, .. }) => {
                            let sz = if cursor_size == 0 { 32 } else { cursor_size };
                            eprintln!("[keyflow-input] setWasdNavigation enabled={enabled} cursor_size={sz} cursor_path={cursor_path:?}");
                            hook::set_wasd_navigation(enabled);
                            system_cursor::set_system_cursor_blue(enabled, sz, cursor_path.as_deref());
                        }
                        Some(InMessage::SetSmoothScroll { enabled, preset, step_size, animation_time, acceleration_enabled, acceleration_delta, acceleration_max, trackpad_pass_through, horizontal_scrolling, .. }) => {
                            smooth_scroll::configure(smooth_scroll::SmoothScrollConfig {
                                enabled,
                                preset,
                                step_size,
                                animation_time_ms: animation_time,
                                acceleration_enabled,
                                acceleration_delta_ms: acceleration_delta,
                                acceleration_max,
                                trackpad_pass_through,
                                horizontal_scrolling,
                            });
                        }
                        Some(InMessage::SetDragSwitcher { enabled, zones, activation_ms, hover_ms, corner_size, .. }) => {
                            eprintln!(
                                "[drag-v2] setDragSwitcher enabled={enabled} zones=0x{zones:02x} activationMs={activation_ms} hoverMs={hover_ms} cornerSize={corner_size}"
                            );
                            drag_switcher::configure(enabled, zones, activation_ms, hover_ms, corner_size);
                        }
                        Some(InMessage::DragSwitcherActivate { hwnd, .. }) => {
                            let (success, reason) = drag_switcher::activate_window(&hwnd);
                            eprintln!(
                                "[drag-switcher] activate hwnd={} success={} reason={}",
                                hwnd, success, reason
                            );
                            hook::queue(
                                OutMessage::WindowActivationResult {
                                    version: PROTOCOL_VERSION,
                                    hwnd,
                                    success,
                                    reason: reason.to_string(),
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::InjectKey { vk, extended, down, seq, .. }) => {
                            let ok = inject::send_vk(vk, 0, extended, down);
                            let error = if ok {
                                None
                            } else {
                                Some(unsafe { windows_sys::Win32::Foundation::GetLastError() })
                            };
                            eprintln!(
                                "[keyflow-input] injectKey seq={seq} vk={vk:#04X} extended={extended} down={down} ok={ok} lastError={}",
                                error.unwrap_or(0)
                            );
                            hook::queue(
                                OutMessage::Injected {
                                    version: PROTOCOL_VERSION,
                                    sequence: seq,
                                    ok,
                                    error,
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::Ping { .. }) => {
                            hook::queue(OutMessage::Pong { version: PROTOCOL_VERSION }.to_json());
                        }
                        Some(InMessage::ListApps { .. }) => {
                            hook::queue(
                                OutMessage::AppList {
                                    version: PROTOCOL_VERSION,
                                    apps: drag_switcher::running_apps(),
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::GetActiveApp { .. }) => {
                            let active = crate::app_scope::current();
                            hook::queue(
                                OutMessage::ActiveApp {
                                    version: PROTOCOL_VERSION,
                                    executable_path: active.as_ref().map(|a| a.executable_path.clone()).unwrap_or_default(),
                                    process_name: active.as_ref().and_then(|a| a.process_name.clone()),
                                    display_name: active.as_ref().and_then(|a| a.display_name.clone()),
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::Shutdown { .. }) => {
                            hook::release_wasd_arrows();
                            hook::release_remaps();
                            smooth_scroll::uninstall_hook();
                            drag_switcher::hide_all(crate::drag_switcher::HideReason::Shutdown);
                            quit();
                            break;
                        }
                        None => eprintln!("[keyflow-input] ignored malformed line"),
                    }
                }
            }
        }
        quit(); // stream closed: exit, fail-open
    });

    if let Some(pid) = parent_pid {
        parent_watch::spawn_parent_watch(pid, hook_thread_id);
    }

    // App-specific shortcut support: event-driven foreground tracker on its own
    // thread. Fail-open — if it cannot resolve the foreground, scoped rules
    // stay inactive until a window switch is observed.
    app_scope::spawn_foreground_watcher();

    let handle = hook::install_hook();
    if handle.is_null() {
        eprintln!(
            "[keyflow-input] SetWindowsHookExW failed: {}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
        return ExitCode::from(2);
    }

    let hinstance = unsafe { windows_sys::Win32::System::LibraryLoader::GetModuleHandleW(std::ptr::null()) };
    smooth_scroll::init();
    smooth_scroll::install_hook(hinstance);

    // Drag Corner Switcher V2: mouse observation prefers Win32 Raw Input, and
    // falls back to a WH_MOUSE_LL observation hook if raw registration or
    // verification fails. Either way the mouse observer starts on this thread
    // and events are dispatched by the message loop below.
    let raw_mouse_hwnd = raw_mouse::init(unsafe { windows_sys::Win32::System::LibraryLoader::GetModuleHandleW(std::ptr::null()) });
    if raw_mouse_hwnd.is_null() && !raw_mouse::backend_is_hook() && !raw_mouse::backend_is_raw() {
        eprintln!(
            "[keyflow-input] mouse observation unavailable: {}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
        smooth_scroll::uninstall_hook();
        hook::uninstall_hook(handle);
        return ExitCode::from(2);
    }

    hook::reload_engine();

    if let Some(ref t) = token {
        hook::queue(
            OutMessage::Auth {
                version: PROTOCOL_VERSION,
                token: t.clone(),
            }
            .to_json(),
        );
    }

    hook::queue(
        OutMessage::Ready {
            version: PROTOCOL_VERSION,
            pid: std::process::id(),
            build: Some(BUILD_ID.to_string()),
        }
        .to_json(),
    );

    hook::message_loop();

    // Message loop exited: release held navigation arrows and remap targets
    // before unhooking so keys are never left stuck even if the parent process
    // died.
    hook::release_wasd_arrows();
    hook::release_remaps();
    system_cursor::restore_default_cursor();
    drag_switcher::hide_all(crate::drag_switcher::HideReason::Shutdown);
    smooth_scroll::uninstall_hook();
    hook::uninstall_hook(handle);
    // Let the writer thread flush anything still queued before we exit.
    thread::sleep(std::time::Duration::from_millis(50));
    ExitCode::SUCCESS
}

/// Protocol smoke test. No hook, no suppression, no SendInput — just the
/// handshake, a few round-trips, and a final self-test-done line. Exit 0.
fn run_self_test() -> ExitCode {
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let out_line = |out: &mut std::io::StdoutLock, json: String| {
        let _ = writeln!(out, "{json}");
        let _ = out.flush();
    };

    out_line(
        &mut out,
        OutMessage::Ready {
            version: PROTOCOL_VERSION,
            pid: std::process::id(),
            build: Some(BUILD_ID.to_string()),
        }
        .to_json(),
    );

    let reader = BufReader::new(std::io::stdin());
    let mut handled = 0u32;
    for line in reader.lines() {
        if handled >= 8 {
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        match protocol::parse_line(&line) {
            Some(InMessage::Ping { .. }) => {
                out_line(&mut out, OutMessage::Pong { version: PROTOCOL_VERSION }.to_json());
                handled += 1;
            }
            Some(InMessage::Configure { shortcuts, keys, .. }) => {
                let mut cfg = config::Config::new();
                if shortcuts.is_empty() {
                    cfg.apply(&keys);
                } else {
                    cfg.apply_shortcuts(&shortcuts);
                }
                out_line(
                    &mut out,
                    OutMessage::Ack {
                        version: PROTOCOL_VERSION,
                        r#for: "configure".to_string(),
                        config_version: 0,
                        count: 0,
                        hyper_enabled: None,
                        hyper_physical_vk: None,
                        include_shift: None,
                        tap_synthetic_id: None,
                        status: "ok".to_string(),
                        error: None,
                    }
                    .to_json(),
                );
                handled += 1;
            }
            Some(InMessage::Shutdown { .. }) | None => break,
            _ => {}
        }
    }

    out_line(&mut out, r#"{"type":"self-test-done","version":1}"#.to_string());
    ExitCode::SUCCESS
}