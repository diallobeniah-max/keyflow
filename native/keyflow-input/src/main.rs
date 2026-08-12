#![windows_subsystem = "windows"]
//! keyflow-input: KeyFlow's native Windows keyboard helper.
//!
//! Protocol: NDJSON over stdin/stdout. stderr carries diagnostics only.
//! Modes:
//!   keyflow-input --parent-pid <pid>    normal operation
//!   keyflow-input --self-test           protocol smoke test, NO hook

mod config;
mod hook;
mod inject;
mod keymap;
mod parent_watch;
mod protocol;
mod trigger;
mod window_control;

use std::io::{BufRead, BufReader, Write};
use std::process::ExitCode;
use std::sync::mpsc::sync_channel;
use std::thread;

use windows_sys::Win32::System::Threading::GetCurrentThreadId;

use protocol::{InMessage, OutMessage, PROTOCOL_VERSION};

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
                        Some(InMessage::Configure { shortcuts, keys, .. }) => {
                            if let Ok(mut cfg) = config::CONFIG.lock() {
                                if shortcuts.is_empty() {
                                    cfg.apply(&keys);
                                } else {
                                    cfg.apply_shortcuts(&shortcuts);
                                }
                            }
                            hook::reload_engine();
                            hook::queue(
                                OutMessage::Ack {
                                    version: PROTOCOL_VERSION,
                                    r#for: "configure".to_string(),
                                }
                                .to_json(),
                            );
                        }
                        Some(InMessage::Pause { .. }) => {
                            if let Ok(mut cfg) = config::CONFIG.lock() {
                                cfg.set_paused(true);
                            }
                            hook::set_engine_paused(true);
                        }
                        Some(InMessage::Resume { .. }) => {
                            if let Ok(mut cfg) = config::CONFIG.lock() {
                                cfg.set_paused(false);
                            }
                            hook::set_engine_paused(false);
                        }
                        Some(InMessage::BeginCapture { .. }) => {
                            hook::arm_capture();
                        }
                        Some(InMessage::SetKeyStream { enabled, .. }) => {
                            hook::set_key_stream(enabled);
                        }
                        Some(InMessage::Ping { .. }) => {
                            hook::queue(OutMessage::Pong { version: PROTOCOL_VERSION }.to_json());
                        }
                        Some(InMessage::Shutdown { .. }) => {
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

    let handle = hook::install_hook();
    if handle.is_null() {
        eprintln!(
            "[keyflow-input] SetWindowsHookExW failed: {}",
            unsafe { windows_sys::Win32::Foundation::GetLastError() }
        );
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
        }
        .to_json(),
    );

    hook::message_loop();

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