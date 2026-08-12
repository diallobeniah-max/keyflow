# KeyFlow

KeyFlow is a local-only Windows shortcut automation app. It lets you assign Tap Actions to keyboard keys and mouse buttons: single tap, double tap, triple tap, long press, combos, popup menus, app-specific profiles, and multi-action sequences.

This repository is a **hybrid MVP**:

- React + TypeScript UI runs immediately in the browser through Vite.
- Browser mode uses localStorage and a simulated shortcut engine.
- `src-tauri` contains the Windows/Tauri Rust backend skeleton for the real desktop app.
- No external APIs or cloud services are required.

## Run browser mode

```powershell
cd keyflow
npm install
npm run dev
```

Open the local URL Vite prints. KeyFlow's configured browser-mode URL is:

```text
http://127.0.0.1:1420
```

Use **Test shortcuts** on the dashboard to simulate tap, double-tap, triple-tap, and hold triggers.

## Run real desktop mode later

Install these first:

1. Node.js LTS
2. Rust
3. Microsoft Visual Studio Build Tools with Desktop development with C++
4. Microsoft Edge WebView2 Runtime

Then run:

```powershell
npm install
npm run tauri:dev
```

Build installer:

```powershell
npm run tauri:build
```

The Windows installer will be created inside `src-tauri/target/release/bundle/`.

## Privacy

KeyFlow is designed to be local-only. The shortcut engine only evaluates configured keys and does not save typed words. Browser mode cannot do true global hooks. The real Windows hook code is isolated in `src-tauri/src/hooks.rs` and should only forward configured key events into the engine.

## Storage

Browser mode stores data in:

```text
localStorage key: keyflow:state
```

Desktop mode is designed to store JSON in:

```text
%APPDATA%/keyflow/keyflow-state.json
```

## Current MVP features

- Premium modern dashboard
- Shortcut list, search, filters, favorites, conflict warnings
- Create/Edit shortcut builder
- Visual keyboard page
- Action library
- Profiles page
- Full settings page
- Floating popup menu
- Local JSON/localStorage persistence
- Simulated shortcut engine
- Sample demo shortcuts
- Dark/light/system theme
- Import/export-ready data model
- Tauri/Rust backend skeleton

## Known limitations

- Browser mode cannot listen globally outside the app window.
- Browser mode cannot control real Windows apps, media keys, windows, or mouse button 4/5 globally.
- The Rust backend is scaffolded and documented for Windows implementation, but must be compiled and tested on a Windows machine.

## Roadmap

- Complete Windows `WH_KEYBOARD_LL` and `WH_MOUSE_LL` hook implementation.
- Add a real floating Tauri popup window.
- Add real tray controls and startup registration.
- Add password-field pause detection using Windows UI Automation.
- Add sequence editor with drag-and-drop.
- Add import/export files from the UI.


## v0.3 refresh

This build includes the premium cloud-blue redesign, custom dropdowns, full-width visual keyboard, mouse-button shortcut creation, Hyper Key settings/examples, media playback actions, and brightness shortcut actions.
