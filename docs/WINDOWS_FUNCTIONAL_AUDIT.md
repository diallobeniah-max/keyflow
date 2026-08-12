# KeyFlow Windows Functional Audit

**Project:** `E:\New folder\Coding\New folder (3)\keyflow`  
**Audit date:** 2026-08-02  
**Branch:** `master`  
**Scope:** Verification and documentation of the existing Electron/native-input work only. No feature or design changes were intentionally made during this audit.

## Executive summary

The repository is on branch `master` with one tracked commit and a mixture of tracked modifications and untracked Electron/native-input files. The existing Electron bridge, preload surface, TypeScript declarations, native input service, trigger matcher, pause/Safe Mode synchronization, custom title bar, and renderer startup path are present in the source tree.

The requested compiler/build checks passed. The previously claimed focused trigger-test file did **not** exist, so this audit created `scripts/trigger-matcher.test.mjs`. It runs against the compiled matcher and currently reports **12 passed, 0 failed** tests.

`npm run electron:dev` was first blocked by an already-running KeyFlow dev process holding port 1420. That stale process was stopped, then the command was launched again successfully. The successful logs show the Vite renderer connection, preload path/existence, Electron load success, and native input service startup. The current logs do not print an explicit `electronAPI exists` or `shortcut data synchronized` message; those two points are verified from the source path and successful IPC-capable startup, but are not directly logged.

No physical keyboard or mouse input is claimed as tested by this audit.

## Manual KeyFlow window verification results

**Project:** `E:\New folder\Coding\New folder (3)\keyflow`  
**Reported:** 2026-08-03  
**Source:** Manual results supplied in the verification handoff.

The handoff supplied the literal placeholder `[PASS/FAIL]` for each item rather than selecting `PASS` or `FAIL`. The values are recorded exactly below; no outcome has been inferred.

| Manual check | Supplied result | Recorded status |
|---|---|---|
| Title-bar dragging | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Double-click maximize/restore | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Minimize | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Maximize | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Restore | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Close | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Theme dropdown mouse interaction | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Theme dropdown keyboard interaction | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Dark mode | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Light mode | `[PASS/FAIL]` | Unresolved — outcome not selected |
| Settings fields remain open while typing | `[PASS/FAIL]` | Unresolved — outcome not selected |

## Repository state

### Commands and actual output

#### `git branch --show-current`

```text
master
```

Exit status: `0`

#### `git status --short --untracked-files=all`

The final status after this audit is recorded again below after the audit test and report were created. Before those two files were added, Git reported these tracked changes and untracked files:

```text
 M .gitignore
 M package-lock.json
 M package.json
 M src/App.tsx
 M src/index.css
 M src/lib/actions.ts
 M src/main.tsx
 M vite.config.ts
?? docs/UI_AUDIT.md
?? electron-builder.yml
?? electron/actions.ts
?? electron/input/native-input-service.ts
?? electron/input/trigger-matcher.ts
?? electron/input/types.ts
?? electron/main.ts
?? electron/preload.ts
?? electron/tsconfig.json
?? electron/tsconfig.preload.json
?? electron/window-state.ts
?? scripts/electron-dev.mjs
?? scripts/generate-icon.mjs
?? scripts/spike-uiohook.mjs
?? src/components/TitleBar.tsx
?? src/design/breakpoints.ts
?? src/design/componentSizes.ts
?? src/design/tokens.css
?? src/design/typography.ts
?? src/lib/native-input.ts
?? src/types/electron.d.ts
?? tsconfig.node.tsbuildinfo
?? tsconfig.tsbuildinfo
?? vite.config.d.ts
?? vite.config.js
```

Exit status: `0`

#### `git diff --stat`

```text
.gitignore         |    4 +
 package-lock.json  | 6820 +++++++++++++++++++++++++++++++++++++++++++++-------
 package.json       |   20 +-
 src/App.tsx        |   16 +-
 src/index.css      |   23 +-
 src/lib/actions.ts |   21 +-
 src/main.tsx       |    4 +-
 vite.config.ts     |   23 +-
 8 files changed, 6112 insertions(+), 819 deletions(-)
```

Exit status: `0`. This statistic covers tracked-file diffs only; untracked files are not included by `git diff --stat`.

#### `git log --oneline -5`

```text
45f85c9 Fix responsive navigation and paused demo feedback
```

Exit status: `0`. Only one commit was present in the displayed history.

## Complete working-tree file list

### Tracked modified

* `.gitignore`
* `package-lock.json`
* `package.json`
* `src/App.tsx`
* `src/index.css`
* `src/lib/actions.ts`
* `src/main.tsx`
* `vite.config.ts`

### Added/untracked source and configuration

* `electron-builder.yml`
* `electron/actions.ts`
* `electron/input/native-input-service.ts`
* `electron/input/trigger-matcher.ts`
* `electron/input/types.ts`
* `electron/main.ts`
* `electron/preload.ts`
* `electron/tsconfig.json`
* `electron/tsconfig.preload.json`
* `electron/window-state.ts`
* `scripts/electron-dev.mjs`
* `scripts/generate-icon.mjs`
* `scripts/spike-uiohook.mjs`
* `scripts/trigger-matcher.test.mjs` — created during this audit because no focused trigger test existed
* `src/components/TitleBar.tsx`
* `src/design/breakpoints.ts`
* `src/design/componentSizes.ts`
* `src/design/tokens.css`
* `src/design/typography.ts`
* `src/lib/native-input.ts`
* `src/types/electron.d.ts`

### Generated/untracked build artifacts

* `tsconfig.node.tsbuildinfo`
* `tsconfig.tsbuildinfo`
* `vite.config.d.ts`
* `vite.config.js`

### Deleted files

* None shown by Git.

## Diff review and implementation verification

The tracked diff confirms the Electron migration wiring in the existing tracked files:

* `package.json` adds the Electron entry point, Electron compile/dev/build scripts, `electron`, `electron-builder`, `uiohook-napi`, and related development dependencies.
* `src/lib/actions.ts` adds the `ELECTRON_ACTION_TYPES` dispatch set and routes supported desktop actions through `window.electronAPI.actions.run(...)` before the Tauri/browser fallback.
* `src/main.tsx` imports `initNativeInput`, renders the application after `useStore.load()`, and initializes the native bridge when `window.electronAPI.input` exists.
* `src/App.tsx` places `<TitleBar />` above `.app-body`.
* `src/index.css` adds the Electron title-bar/control styling and app-shell/body layout rules.
* `vite.config.ts` sets the local Vite server to `127.0.0.1:1420`, uses relative production assets, and adds a CSP transform.
* `.gitignore` excludes Electron output and generated icon files.

The new Electron files are untracked, so their contents are not represented in `git diff` until staged. They were inspected directly as the source of truth.

## Feature-by-feature source verification

| Feature | Exact implementation | Verification result |
|---|---|---|
| Electron action bridge | `src/lib/actions.ts` — `runAction`; `ELECTRON_ACTION_TYPES` | Present. Supported action types call `window.electronAPI.actions.run` and await it. Errors are caught and surfaced as a danger toast. |
| Main action IPC | `electron/main.ts` — `registerIPC`, `ipcMain.handle("action:run", ...)` | Present. Delegates to `runDesktopAction(action, mainWindow)`. |
| Desktop action implementation | `electron/actions.ts` — `runDesktopAction` | Present for open, shell, keyboard, media, display, window, notification, and clipboard-related actions. |
| Preload API | `electron/preload.ts` — `contextBridge.exposeInMainWorld("electronAPI", ...)` | Present. Exposes `windowControls`, `appInfo`, `actions`, and `input`. |
| TypeScript declarations | `src/types/electron.d.ts` — `ElectronAPI`, `WindowControls`, `ActionAPI`, `InputAPI` | Present. Renderer-facing `Window.electronAPI` declaration exists. Some implementation sites still use `any` casts instead of the declaration. |
| Native keyboard mapping | `electron/input/trigger-matcher.ts` — `KEY_MAP`, `nativeKeyName` | Present. Maps standard keys, function keys, navigation, media keys, numpad keys, and extended codes. |
| Mouse button mapping | `electron/input/trigger-matcher.ts` — `MOUSE_MAP`, `matchMouseCandidates`, `onMouseEvent` | Present for MB1–MB5. `electron/input/native-input-service.ts` forwards mouse down/up events. |
| Modifier mapping | `electron/input/trigger-matcher.ts` — `modsFromState`, `modsMatch` | Present for Ctrl, Alt, Shift, Win, including Control/Command normalization. |
| Repeat-key protection | `electron/input/trigger-matcher.ts` — `downKeys`, early return in `onKeyEvent`/`onMouseEvent` | Present for native events: repeated keydown/button-down for the same physical code is ignored until release. Browser engine also checks `!e.repeat` in `src/lib/engine.ts`. |
| Single tap | `TriggerMatcher.evaluate` — `case "single"` | Present; fires immediately on key/button down. |
| Double tap | `TriggerMatcher.evaluate` — `case "double"` | Present; uses `pressTimes` and `tapTimer`. |
| Triple tap | `TriggerMatcher.evaluate` — `case "triple"` | Present; target is three presses within `tapInterval`. |
| Long press | `TriggerMatcher.evaluate` — `case "longPress"` and `holdTimer`; `clearHold` | Present; fires after `holdDuration`, cancelled on release. |
| Hold | `TriggerMatcher.evaluate` — `case "hold"` and `holdTimer`; `clearHold` | Present; same timer state machine as long press. |
| Combo | `TriggerMatcher.evaluate` — `case "combo"`; modifier matching | Present as a configured key plus exact modifier set. It is not a multi-independent-key chord engine. |
| Sequence | `TriggerMatcher.evaluate` — `case "sequence"` | Present, but actual implementation treats sequence as two presses of the same configured key, like a double tap. It does not represent a configurable sequence of different keys. |
| Tap-then-hold | `TriggerMatcher.evaluate` — `case "tapThenHold"`; `tapThenArmed`, `tapTimer`, `holdTimer` | Present and covered by the new test. |
| Pause synchronization | `src/lib/native-input.ts` — Zustand subscription and initial `eapi.input.setPaused(...)`; `electron/main.ts` — `input:set-paused`; `NativeInputService.pause/resume` | Present. Pause resets matcher state and prevents trigger callbacks while paused. |
| Safe Mode synchronization | `src/store/useStore.ts` — `setSafeMode`; `src/lib/native-input.ts` — `state.safeMode` subscription; `electron/main.ts` — `input:set-paused` | Present. Safe Mode is sent to native service as the same paused state and is persisted in settings. |
| Title-bar positioning | `src/App.tsx` — `<TitleBar />` before `.app-body`; `src/index.css` — `.app-shell`, `.app-body`, `.electron-titlebar` | Present. Title bar is a full-width row above sidebar/main content. |
| Title-bar drag regions | `src/components/TitleBar.tsx` — `dragRegion.WebkitAppRegion = "drag"`, `titlebar-drag-space`; `noDrag.WebkitAppRegion = "no-drag"`; CSS `.titlebar-drag-space` | Present. Controls are placed in a no-drag region. |
| Minimize | `TitleBar` button → `windowControls.minimize` → preload IPC → `window:minimize` | Present. |
| Maximize/restore | `TitleBar.toggleMaximize`, `maximized` state, `onMaximizedChange`; `electron/main.ts` — `window:toggle-maximize` and maximize/unmaximize listeners | Present. |
| Close | `TitleBar` button → `windowControls.close` → `window:close` → `mainWindow.close()` | Present. |
| Renderer startup | `src/main.tsx` — `useStore.load().then(...)`, render, then `initNativeInput`; `scripts/electron-dev.mjs` — Vite readiness and Electron spawn; `electron/main.ts` — `loadURL`/`loadFile` | Present. Successful dev logs show Vite and Electron load. |

## Audit checks and findings

### TypeScript errors

No errors in the requested typecheck or Electron compilation commands. All three validation commands passed as recorded below.

### Duplicate or conflicting key mappings

* The native `KEY_MAP` intentionally has equivalent extended mappings such as left/right Ctrl both normalizing to `Ctrl`, left/right Win to `Win`, and left/right Alt to `Alt`. This is expected normalization, not an accidental duplicate output mapping.
* `src/lib/conflict.ts` detects same-key/same-modifier conflicts within profiles and reports errors or warnings depending on trigger type. It also reports cross-profile informational conflicts.
* The native matcher receives all enabled shortcuts for the active profile from `src/lib/native-input.ts`; it does not independently reject duplicate native entries. Multiple matching entries can therefore invoke multiple callbacks if the UI allows them to be saved. The UI conflict checker is the current guard.
* Important implementation inconsistency: `src/lib/engine.ts` has `mouseToken(button)` mapping `["MB1", "MB3", "MB2", "MB4", "MB5"]`, which maps browser button `1` to MB3 and button `2` to MB2. Native mapping in `electron/input/trigger-matcher.ts` maps button `2` to MB2 and button `3` to MB3. This is a pre-existing browser/native mapping mismatch. It was not changed during the audit.

### Timers that are not cleared

* Native matcher timers are cleared by `TriggerMatcher.reset()` and by the relevant tap/hold transitions. Native service `stop()` and `pause()` call `matcher.reset()`.
* The native matcher does not delete expired state-map entries; expired timers clear their contents but leave state objects in the map until reset. This is a bounded-by-shortcut/use-pattern state-retention concern rather than an active timer leak.
* Browser `src/lib/engine.ts` has no general cleanup method for its listeners or all timer maps. It is initialized once by `src/main.tsx`, so it does not currently get repeatedly mounted, but there is no explicit teardown API.
* `useStore.toast` schedules a 3.2-second removal timeout; this is expected UI behavior and has no cancellation on unmount.
* `src/lib/engine.ts` simulation methods use `setTimeout` for release and do not retain handles for cancellation.

### Event listeners and stale IPC listeners

* `electron/input/native-input-service.ts` removes all four uiohook listeners in `stop()` using the same bound arrow-function references used by `start()`. This is correct.
* `electron/preload.ts` returns cleanup functions for both `window:maximized-change` and `shortcut:triggered`, using the exact handler reference. This is correct.
* `src/lib/native-input.ts` calls existing cleanup functions before initializing and stores the Zustand and IPC cleanup functions. This protects against duplicate renderer subscriptions if initialization is called again.
* `TitleBar` calls the returned maximize-listener cleanup in its effect cleanup.
* `electron/main.ts` registers IPC handlers once from `app.whenReady()`. There is no `ipcMain.removeHandler` on quit, but the process exits and handlers are not accumulated across renderer remounts.
* `src/lib/engine.ts` adds global window listeners once through the module singleton and has no removal method. This is not currently duplicated because `initEngine()` is singleton-guarded, but it is a cleanup limitation.

### Repeated shortcut execution

* Native repeated keydown/button-down is guarded by `downKeys`.
* Trigger callbacks can still be repeated by separate physical presses after the configured cooldown expires, as intended.
* Multiple matching shortcuts can all fire for the same input if duplicate configurations are present; conflict detection is UI-side rather than native-side.
* The native `fire()` cooldown is keyed by input signature (`sKey`), not shortcut ID. Two shortcuts sharing the same input signature also share cooldown state. This can suppress or group executions across conflicting entries.
* The native service sends the triggered shortcut to the renderer, where `src/lib/native-input.ts` calls `runActions(sc.actions)`. This is the intended single bridge path for native triggers.

### Shortcuts firing while typing

* Browser simulation/engine checks `isEditableTarget` in `src/lib/engine.ts` before normal captured key processing.
* The native `uiohook-napi` path is global and does not inspect the focused application/control or password fields. `pauseInPassword` exists in settings but is not wired into `electron/input/native-input-service.ts` or `electron/input/trigger-matcher.ts`.
* Therefore, native shortcuts can fire while typing in another application or an editable field unless the user pauses/Safe Modes or configures a non-conflicting trigger. This is a confirmed limitation/security concern, not a claimed pass.

### Unsafe shell-command construction / unrestricted execution

Confirmed concerns in `electron/actions.ts`:

* `runPowershell` forwards `payload.script` directly to `powershell.exe` with `-ExecutionPolicy Bypass`.
* `runBatch` runs `cmd.exe /C` with `payload.path`.
* `runCommand` passes an arbitrary executable/path and parsed arguments to `spawn`.
* The renderer action editor exposes fields for command, PowerShell, and batch content in `src/components/ActionEditor.tsx`.
* `ELECTRON_DESKTOP_ACTIONS` includes these unrestricted action types, and the IPC handler accepts an arbitrary action object from the renderer. Context isolation prevents direct Node access in the renderer, but it does not make configured shell execution safe.
* `detached()` resolves on child `spawn`, not on process exit. Consequently, `runCommand`, `runPowershell`, and `runBatch` report success once the child process starts, not once the requested operation completes successfully. `openApp` and similar detached actions have the same semantic limitation.

Safe automatic tests in this audit did **not** invoke shell, PowerShell, batch, lock, shutdown, restart, delete, clipboard overwrite, or arbitrary user scripts.

### Browser simulation accidentally used inside Electron

* `src/main.tsx` always calls `initEngine()`, before the Electron native-input initialization check. This means the browser engine’s window listeners exist inside Electron too.
* `src/lib/native-input.ts` additionally initializes the native service bridge when `window.electronAPI.input` exists.
* The UI simulator deliberately uses `getEngine().simulateTap`/`simulateHold`, but the browser engine also has active listeners in Electron. This creates two input paths in the Electron renderer: browser-window events and native global events.
* `src/lib/actions.ts` routes supported desktop action types to Electron first, so an action from the renderer normally uses the Electron bridge. However, the browser engine is still present and can trigger renderer-side actions when its capture mode is enabled.
* This is a confirmed architectural overlap to review before considering the Electron path isolated. It was not changed during this audit.

### Old Tauri code interfering with Electron

* Tauri fallback remains in `src/lib/actions.ts` and `src/lib/tauri.ts`, and Tauri scripts/dependencies remain in `package.json`.
* `tauriLoad`/`tauriSave` use localStorage when Tauri is not present, which is the expected browser/Electron fallback for state persistence in the current code.
* `src/lib/actions.ts` checks Electron first for the supported desktop-action set; if Electron is absent, it checks Tauri, then browser simulation.
* No evidence was found that Tauri IPC is active in the Electron dev logs. Tauri code remains in the project but did not interfere with the successful Electron startup observed here.

## Automated trigger tests

### Previously claimed test location

No prior `keyflow-trigger-test.mjs` file, focused trigger test suite, or equivalent KeyFlow trigger test was found in the project. The existing `scripts/spike-uiohook.mjs` is a native-hook compatibility spike, not a trigger-matcher unit test.

### Test created during this audit

* **Path:** `scripts/trigger-matcher.test.mjs`
* **Implementation under test:** compiled `dist-electron/input/trigger-matcher.js`
* **Exact command:** `node --test .\scripts\trigger-matcher.test.mjs`
* **Result:** `12` passed, `0` failed; exit status `0`.

The test covers:

* Native keyboard mapping
* Modifier mapping
* Mouse MB1–MB5 mapping
* Single tap
* Double tap
* Triple tap
* Long press
* Hold
* Combo
* Sequence as currently implemented
* Tap-then-hold
* Repeat-key protection
* Timer cleanup through `reset()`

Trigger behavior not fully covered by this focused suite:

* Different-key configurable sequences — not implemented by the current matcher, so there is no positive test for that behavior.
* Shortcut action execution from a triggered native shortcut — intentionally not tested automatically because safe-only action scope was requested.
* Physical keyboard or mouse input through an actual device — not tested.
* Focused-app/password-field behavior in the native hook — not implemented/verified.

Actual test output:

```text
✔ native keyboard and modifier mapping (1.6414ms)
✔ mouse button mapping covers MB1 through MB5 (0.2707ms)
✔ single tap fires once (0.1146ms)
✔ double tap fires after two distinct presses (0.192ms)
✔ triple tap fires after three distinct presses (0.155ms)
✔ long press fires only after the hold duration (56.216ms)
✔ hold fires only after the hold duration (47.3021ms)
✔ combo fires with the configured modifier set (0.3945ms)
✔ sequence currently fires on two presses of the same configured key (0.2567ms)
✔ tap-then-hold fires on a tap followed by a held press (45.7272ms)
✔ repeat-key protection ignores repeated keydown events while held (0.1667ms)
✔ reset clears pending tap and hold timers (169.2311ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 397.9742
```

## Compiler and build validation

### `npm run typecheck`

```text
> keyflow@0.3.0 typecheck
> tsc --noEmit
```

Exit status: `0`.

### `npm run electron:compile`

```text
> keyflow@0.3.0 electron:compile
> tsc -p electron/tsconfig.json && tsc -p electron/tsconfig.preload.json
```

Exit status: `0`.

### `npm run build`

```text
> keyflow@0.3.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
transforming...
✓ 70 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                 0.66 kB │ gzip: 0.38 kB
dist/assets/index-CV1r1KSF.css 25.10 kB │ gzip: 5.68 kB
dist/assets/index-BDF99p7s.js 235.05 kB │ gzip: 71.87 kB
✓ built in 533ms
```

Exit status: `0`.

## Electron development launch

### First launch attempt

An existing KeyFlow process was already holding port `1420` (`node scripts/electron-dev.mjs`, PID `3388`). The first requested launch therefore produced:

```text
[electron:dev] Compiling Electron TypeScript...
[electron:dev] Starting Vite dev server...
[electron:dev] Failed: Error: Port 1420 is already in use
```

The stale KeyFlow process tree was stopped without changing project files.

### Successful launch after clearing the stale process

The command was launched as requested through `npm run electron:dev`. Captured log file: `electron-dev-audit-2.log`.

```text
> keyflow@0.3.0 electron:dev
> node scripts/electron-dev.mjs

[electron:dev] Compiling Electron TypeScript...
[electron:dev] Starting Vite dev server...
[electron:dev] Waiting for Vite at http://127.0.0.1:1420...
[electron:dev] Vite is ready.
[electron:dev] Starting Electron...
[keyflow] preload path: E:\New folder\Coding\New folder (3)\keyflow\dist-electron\preload.js
[keyflow] preload exists: true
[keyflow] __dirname: E:\New folder\Coding\New folder (3)\keyflow\dist-electron
[keyflow] DEV_URL: http://127.0.0.1:1420
[input] Native input service started
[renderer] [vite] connecting...
[renderer] [vite] connected.
[keyflow] Loaded http://127.0.0.1:1420 successfully
```

Captured stderr: empty (`0` lines, `0` words, `0` characters).

Log-based conclusions:

* Renderer/Vite loaded: **confirmed** by `[renderer] [vite] connected.` and `[keyflow] Loaded ... successfully`.
* Preload path and compiled preload existence: **confirmed** by the logged path and `preload exists: true`.
* Electron bridge exists: **not directly logged**. The preload implementation is present and compiled; the renderer startup did not emit a preload error. Treat bridge existence as source/compile verified, not an explicit runtime probe.
* Native input service started: **confirmed** by `[input] Native input service started`.
* Shortcut data synchronized: **not directly logged**. Source path is `src/main.tsx` → `initNativeInput()` → `src/lib/native-input.ts:syncShortcuts()` → preload `input.updateShortcuts()` → main IPC `input:update-shortcuts`. Additive logging was not introduced during this audit.
* Renderer crashes: **none observed in the captured logs**. `electron/main.ts` has a `render-process-gone` handler, and no such message appeared.
* Native physical input: **not tested or claimed**.

## Confirmed working

* Repository is on `master`.
* Requested TypeScript typecheck passed.
* Electron main/preload compilation passed.
* Vite production build passed.
* Electron dev server successfully started after the stale port-holder was cleared.
* Renderer connected to Vite and Electron loaded the dev URL.
* Compiled preload file exists at the expected path.
* Native input service started without a logged startup error.
* Electron action bridge, preload API, TypeScript declarations, native mappings, matcher trigger cases, pause/Safe Mode bridge, and title-bar IPC paths are present and compile.
* Focused trigger matcher tests: 12 passed, 0 failed.

## Confirmed broken or incomplete

* No pre-existing focused trigger test file existed despite the earlier claim; the audit created one.
* Native `sequence` is not a general different-key sequence; it is currently equivalent to two presses of the same key.
* Native global input does not implement the configured `pauseInPassword` behavior or focused editable-field protection.
* Browser mouse mapping does not match native mouse mapping for button 1/button 2/button 3.
* Browser simulation engine is initialized inside Electron alongside the native input path.
* `runPowershell`, `runBatch`, and `runCommand` are unrestricted by policy/allowlist and can execute user-provided commands/scripts.
* Detached action promises resolve on child spawn, not operation completion; success does not mean the command completed successfully.
* Runtime logs do not explicitly prove `electronAPI` presence or shortcut synchronization.
* Physical hardware behavior remains unverified.

## Corrected during this audit

* Created `scripts/trigger-matcher.test.mjs` because no focused trigger test file existed.
* Stopped the stale KeyFlow process tree that was occupying port 1420 so the requested dev launch could be performed cleanly.
* No product feature, UI, design, or unrelated source behavior was changed.
* No Git commit was created.

## Automatically tested

* TypeScript renderer typecheck.
* Electron main/preload compilation.
* Vite production build.
* Pure trigger-matcher keyboard, modifier, mouse, timing, repeat-protection, and reset behavior.
* Electron dev startup and log inspection.
* Safe source-level review of IPC/listener/timer paths.

## Still requiring manual testing

* Physical keyboard keydown/keyup for ordinary keys, modifiers, function keys, navigation keys, and media keys.
* Physical mouse MB1, MB2, MB3, MB4, and MB5.
* Single, double, triple, long-press, hold, combo, sequence, and tap-then-hold using real hardware.
* Pause and Safe Mode while a real shortcut is being pressed.
* Title-bar drag, double-click maximize/restore, minimize, maximize/restore, and close buttons.
* Window state persistence after move, resize, maximize, restart, and monitor changes.
* Real safe desktop actions such as opening a known harmless application or URL, showing a notification, and opening Windows Settings. Dangerous actions were intentionally not run.
* Behavior while typing in Notepad, a browser field, a password field, and other applications.
* Behavior with duplicate/conflicting shortcuts and multiple profiles.
* Renderer behavior after repeated route changes and repeated title-bar mount/unmount cycles.
* Clipboard behavior; no clipboard overwrite test was performed.

## Hardware-dependent limitations

* `uiohook-napi` requires a functioning Windows native hook and physical event delivery.
* Keyboard layouts, OEM keys, extended scan codes, media keys, and left/right modifier behavior may vary.
* Mouse button numbering must be confirmed against the installed `uiohook-napi` event values.
* Global hooks and foreground-app/password-field detection are separate concerns; successful service startup does not prove safe behavior in every application.
* No physical keyboard or mouse event was used as evidence in this report.

## Security concerns

* PowerShell is launched with `-ExecutionPolicy Bypass` and receives renderer-configured script text.
* Batch execution invokes `cmd.exe /C` using renderer-configured data.
* Generic command execution allows arbitrary executable paths and arguments.
* The action editor exposes these fields, and the IPC handler does not enforce an allowlist or confirmation policy.
* Native global shortcuts can execute while typing because the native path has no editable/password-field detection.
* `pasteText` writes to the system clipboard and sends Ctrl+V; it was not automatically invoked in this audit to avoid overwriting clipboard content.
* Lock-screen and other disruptive actions exist but were not automatically invoked.
* CSP and Electron `contextIsolation`/`sandbox` reduce renderer exposure but do not constrain intentionally configured shell commands.

## Manual test checklist

Perform these checks manually and record Pass/Fail beside each item.

### Startup and bridge

* [ ] Run `npm run electron:dev` with port 1420 free.
* [ ] Confirm the KeyFlow window opens and the renderer is visible.
* [ ] Confirm the app does not show a load-error page.
* [ ] Confirm the dev terminal shows renderer connection, preload path/existence, Electron load success, and native input service startup.
* [ ] Verify the app remains responsive while switching Dashboard, Shortcuts, Create, Profiles, and Settings.

### Title bar and window behavior

* [ ] Drag the window using the empty title-bar area.
* [ ] Confirm clicking title-bar buttons does not drag the window.
* [ ] Double-click empty title-bar space to maximize.
* [ ] Click the maximize button to restore.
* [ ] Click minimize and restore the window from the taskbar.
* [ ] Close the window and confirm the process exits cleanly.
* [ ] Reopen after moving/resizing and verify the window state is restored.

### Keyboard triggers

For each saved shortcut, test with a harmless action such as a notification or opening a known safe URL/application.

* [ ] Single tap.
* [ ] Double tap within the configured interval.
* [ ] Triple tap within the configured interval.
* [ ] Long press until the configured duration.
* [ ] Hold behavior and release before/after the threshold.
* [ ] Combo with the exact configured modifiers.
* [ ] Sequence behavior as currently implemented; note that the current native implementation uses repeated presses of one key.
* [ ] Tap once, release, then press and hold for tap-then-hold.
* [ ] Hold a key down and verify OS key-repeat does not execute the shortcut repeatedly.
* [ ] Verify a second execution occurs only after the configured cooldown.

### Mouse triggers

* [ ] MB1.
* [ ] MB2.
* [ ] MB3.
* [ ] MB4.
* [ ] MB5.
* [ ] Mouse triggers with configured modifiers, if applicable.

### Pause and Safe Mode

* [ ] Enable Pause from the UI; verify a configured shortcut does not fire.
* [ ] Resume; verify the shortcut fires again.
* [ ] Enable Safe Mode; verify all native shortcuts stop immediately.
* [ ] Disable Safe Mode; verify native shortcuts resume.
* [ ] Pause/Safe Mode during a pending double/triple/hold sequence and verify no stale callback fires afterward.

### Typing safety

* [ ] Type normally in a text editor with KeyFlow active.
* [ ] Type in a browser search field.
* [ ] Type in a password field.
* [ ] Confirm ordinary typing does not fire unsafe single-key shortcuts.
* [ ] Confirm blacklisted-app behavior where configured.
* [ ] Confirm `pauseInPassword` behavior; if it does not work, record it as a defect because the native path currently has no implementation for it.

### Safe action checks

* [ ] Show a KeyFlow notification.
* [ ] Open a harmless known application such as Notepad, if desired.
* [ ] Open a harmless local folder or URL.
* [ ] Test a window action only on the KeyFlow window.
* [ ] Do **not** test lock, shutdown, restart, deletion, arbitrary scripts, or clipboard-writing actions as part of the normal checklist.

### Cleanup and repeatability

* [ ] Stop the dev process with Ctrl+C.
* [ ] Confirm port 1420 is released.
* [ ] Start the app a second time and verify no duplicate native callbacks occur.
* [ ] Change active profiles and verify only the active profile’s shortcuts fire.
* [ ] Edit or disable a shortcut and verify native shortcut data updates without restarting the app.

## Exact commands and results summary

| Command | Result | Exit status |
|---|---|---:|
| `git branch --show-current` | `master` | `0` |
| `git status --short --untracked-files=all` | Tracked modifications plus untracked Electron, script, docs, generated, and audit-test files; no deleted files | `0` |
| `git diff --stat` | 8 tracked files; 6112 insertions, 819 deletions | `0` |
| `git log --oneline -5` | `45f85c9 Fix responsive navigation and paused demo feedback` | `0` |
| `npm run typecheck` | Passed | `0` |
| `npm run electron:compile` | Passed | `0` |
| `npm run build` | Vite built 70 modules successfully | `0` |
| `node --test .\scripts\trigger-matcher.test.mjs` | 12 passed, 0 failed | `0` |
| `npm run electron:dev` | First attempt blocked by stale port holder; second attempt started successfully | First blocked; successful process remained active |

## Audit boundary

This report documents the current implementation and validation evidence. It does not certify physical hardware behavior, security of unrestricted command actions, password-field protection, general multi-key sequences, or production readiness. No commit was made.

## Final Git status after this audit

The final `git status --short --untracked-files=all` was:

```text
 M .gitignore
 M package-lock.json
 M package.json
 M src/App.tsx
 M src/index.css
 M src/lib/actions.ts
 M src/main.tsx
 M vite.config.ts
?? docs/UI_AUDIT.md
?? docs/WINDOWS_FUNCTIONAL_AUDIT.md
?? electron-builder.yml
?? electron/actions.ts
?? electron/input/native-input-service.ts
?? electron/input/trigger-matcher.ts
?? electron/input/types.ts
?? electron/main.ts
?? electron/preload.ts
?? electron/tsconfig.json
?? electron/tsconfig.preload.json
?? electron/window-state.ts
?? scripts/electron-dev.mjs
?? scripts/generate-icon.mjs
?? scripts/spike-uiohook.mjs
?? scripts/trigger-matcher.test.mjs
?? src/components/TitleBar.tsx
?? src/design/breakpoints.ts
?? src/design/componentSizes.ts
?? src/design/tokens.css
?? src/design/typography.ts
?? src/lib/native-input.ts
?? src/types/electron.d.ts
?? tsconfig.node.tsbuildinfo
?? tsconfig.tsbuildinfo
?? vite.config.d.ts
?? vite.config.js
```

No deleted files were reported. The audit log captures are ignored by the existing `*.log` rule and therefore do not appear in Git status: `electron-dev-audit.log`, `electron-dev-audit.err.log`, `electron-dev-audit-2.log`, and `electron-dev-audit-2.err.log`.

## Safe native action smoke test

A single safe native action was tested automatically without locking Windows, changing the clipboard, running a shell script, deleting files, or changing system settings.

* Action: `showNotification`
* Harness: temporary Electron script importing `dist-electron/actions.js` and calling `runDesktopAction(...)` with `mainWindow = null`
* Result: `[safe-action] PASS: showNotification resolved`
* Exit status: `0`
* The temporary harness was removed after the run.
