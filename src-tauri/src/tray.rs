use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder, AppHandle, Manager};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open KeyFlow", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &resume, &exit])?;

    TrayIconBuilder::new()
        .tooltip("KeyFlow")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
            "exit" => app.exit(0),
            "pause" | "resume" => { /* TODO: update AppState pause flag and emit event */ }
            _ => {}
        })
        .build(app)?;
    Ok(())
}
