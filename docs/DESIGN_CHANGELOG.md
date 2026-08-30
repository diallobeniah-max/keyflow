# Design Changelog

## 2026-08-30 — Selectable KeyFlow app icons

* Added an **App Icon** Settings category with monochrome, blue, green, and red KeyFlow artwork.
* Black & White is the persisted default. Changing the selection updates the running KeyFlow window and the Windows notification-area icon immediately.
* Added an optional accent-sync toggle for selected icon colors, plus an Appearance toggle for global contextual hover help.

## 2026-08-30 — System tray and editable Notes size previews

* **Windows tray integration (`main.ts`, `preload.ts`, `native-input.ts`)**:
  - The existing Minimize to system tray setting now immediately creates or removes the Windows notification-area icon.
  - Added a KeyFlow context menu with Open KeyFlow, Open Notes, Pause/Resume, Settings, and Quit. Its native theme follows the selected KeyFlow light, dark, or system theme.

* **Notes size controls (`NotesSettingsPage.tsx`, `NotesPopupShell.tsx`, `notes-window.ts`)**:
  - Added visual Comfortable and Compact previews, pen-icon dimension editing, and Save current after manually resizing the Notes window.
  - Corrected the All Notes sort menu stacking so it can extend over the editor without being clipped.

## 2026-08-30 — Notes window sizing and durable storage

* **Notes window controls (`NotesPopupShell.tsx`, `notes-window.ts`, `NotesSettingsPage.tsx`)**:
  - Added a default comfortable Notes window size (960 × 800) and a compact 700 × 640 alternative; both remain manually resizable and a reset action returns to the selected preset.
  - Added an accessible Follow mouse on open preference in both Notes settings and Quick Actions. When off, the window keeps its last position.
  - Added a hover-or-click sort menu to All Notes for Recent first and Oldest first ordering, while pinned notes stay above the selected order.

* **Durable local notes (`notes-window.ts`)**:
  - A new note is written to the configured location immediately, and the first welcome note is also persisted instead of living only in renderer state.
  - Changing a save folder now snapshots existing notes before updating the directory configuration, preventing an empty destination from replacing the user's existing notes.

## 2026-08-28 — Resizable Sidebar, Top Bar Accent Tint & Windows 11 Mica / Acrylic Effects

* **Resizable Sidebar Divider (`Sidebar.tsx`, `useStore.ts`, `index.css`)**:
  - Added interactive draggable splitter handle (`.sidebar-resizer`) on the right boundary of the main navigation sidebar.
  - Supports smooth cursor dragging (`col-resize`), hover/active accent glow line, minimum width of `160px`, maximum width of `380px`, and local storage persistence.
  - Seamlessly maintains the rounded top-left corner on the main workspace canvas without layout glitches.

* **Top Bar Header Accent Tint System (`TopBar.tsx`, `Settings.tsx`, `index.css`)**:
  - Implemented dynamic accent wash and glow overlay (`.topbar-accent-glow`) in the top horizontal bar box.
  - Added customizable **Header Accent Tint** intensity (`Subtle`, `Medium`, `Luminous Glow`, `None`) and **Tint Fit** mode (`Full box`, `Compact pod`, `Top banner strip`) in Appearance settings.

* **Windows 11 Mica & Acrylic Backdrop Material Effects (`tokens.css`, `index.css`, `Settings.tsx`)**:
  - Inspired by the Windows **Files** app (`files-community/files`), added **Backdrop Material** appearance controls:
    - **Mica**: Dynamic desktop wallpaper tint harmonizing with the Windows 11 environment.
    - **Acrylic**: Frosted glass translucent material with hardware-accelerated backdrop blur (`blur(24px) saturate(160%)`) and luminous surface depth.
    - **Solid**: Traditional opaque desktop surface.

## 2026-08-28 — Windows-Native Fluid Animation Suite

* **Windows 11 Fluent Motion & Keyframes (`tokens.css`, `index.css`, `App.tsx`, `Settings.tsx`, `CreateShortcut.tsx`, `ui.tsx`)**:
  - Implemented standard Windows-native motion curves (`cubic-bezier(0.16, 1, 0.3, 1)`) with dedicated utility classes: `.anim-page-enter`, `.anim-page-back`, `.anim-page-forward`, `.anim-tab-enter`, `.anim-modal-enter`, `.anim-modal-exit`, `.anim-dropdown-enter`, `.anim-accordion-enter`, `.anim-card-enter`, `.anim-badge-pop`, and `.anim-fade-in`.
  - Added smooth page transitions to `Router()` in `App.tsx` (`.page-transition-wrap`), giving every main navigation view (Dashboard, Shortcuts, Create, Visual Keyboard, Library, Profiles, Settings) a crisp slide-and-fade entrance.
  - Added tab transition animations (`.anim-tab-enter`) to `Settings.tsx` when switching between categories.
  - Added smooth modal pop-in and backdrop fade animations across `Modal`, `Dialog`, `IconPickerModal`, `KeyPicker`, `AppPicker`, and `CommandPalette`.
  - Added collapsible drawer animations (`.anim-accordion-enter`) in `CreateShortcut.tsx` when toggling Advanced Settings.
  - Added staggered entrance cascades (`.anim-stagger-1` through `.anim-stagger-6`) to list items and grid cards across Shortcuts, Action Library, and Profiles.
  - Added tactile `:active` micro-press feedback (`transform: scale(0.975)`) on buttons and interactive chips.
  - Full support for `@media (prefers-reduced-motion: reduce)` and `.reduce-motion` class to disable animations for accessibility.

## 2026-08-28 — Hot Corners Visualizer & Sound, Notes Popup Overhaul, and iOS-Style Icon Picker

* **Hot Corners Visualizer & Audio Control (`Settings.tsx`, `tokens.css`, `index.css`)**:
  - Added dedicated **Audio Feedback** toggle row to easily enable/disable the gesture chime.
  - Implemented real-time **Interactive Corner Zone Overlays** (`.hot-corners-active-zone-preview`) appearing dynamically on the display monitor canvas when the activation area slider is adjusted, displaying exact pixel hit boundaries and fading out upon release.
  - Added **Custom Layout Presets** with 1-click chip selectors and "+ Save Layout" dialog to save personalized corner configurations with custom names, icons, and color styles.

* **Keep Notes Popup Window Overhaul (`NotesPopupShell.tsx`, `notes-window.ts`, `index.css`)**:
  - Added interactive draggable splitter (`.notes-sidebar-resizer`) supporting smooth sidebar resizing with local storage persistence.
  - Relocated "+ New Note" button to the bottom-left of the sidebar foot, freeing up 100% of the editor workspace.
  - Upgraded formatting toolbar with responsive flex-wrapping and dynamic container width adaptation.
  - Fixed frameless window control buttons (Minimize, Maximize, Close) with `-webkit-app-region: no-drag` and IPC calls.

* **iOS-Style Categorized Icon Picker & Color Palette (`IconPickerModal.tsx`, `Icon.tsx`)**:
  - Created reusable `IconPickerModal` with open-source icon groups (Productivity, Coding, Media, System, Health).
  - Integrated 6-color token-backed accent swatches and real-time search filter across Hot Corner layouts and Action Editors.

## 2026-08-28 — Ctrl+K Command Center

* Added a renderer-local `Ctrl+K` command palette that searches navigation, quick actions, configured shortcuts, and the shared settings index.
* Added keyboard-first execution with arrow-key navigation, Enter to run, Escape/click-away dismissal, and a searchable command registry with typo-tolerant matching.
* Settings results now open their exact category, scroll to the matching row, focus its control, and briefly highlight the destination.
* Added the `Command Palette` preference under **Shortcuts & Gestures**, using the existing settings persistence and design tokens.

## 2026-08-26 — macOS & Raycast Inspired UI Modernization

* **App Shell & Navigation**:
  - `Sidebar.tsx`: Modern sectioned layout (**SHORTCUTS** and **WORKSPACE**), live shortcut count badges (`nav-item-badge`), active item highlight with inset glowing accent pill, brand version tag (`brand-version-tag`), and active profile selector in the sidebar footer.
  - `TopBar.tsx`: Clean macOS breadcrumbs (`topbar-breadcrumbs`, `topbar-section-crumb`), active application chip (`topbar-chip`, `topbar-chip-text`), status pills for Active / Paused / Safe Mode (`topbar-status-pill`), and quick "+ New Shortcut" action.
  - Standardized `PageHeader` across all main pages (Dashboard, Shortcuts, CreateShortcut, VisualKeyboard, ActionLibrary, Profiles, Settings) with documented purpose descriptions and usage instructions.

* **Raycast-Style Command Palette (`PopupShell.tsx` & `PopupMenu.tsx`)**:
  - Spotlight search bar with search icon, clear button, and return hint badge (`↵`).
  - Action items with category chips (`popup-item-category`), title, and numeric hint badge (`popup-num`).
  - Footer bar with action hints (`↵ Select`, `↑↓ Navigate`, `Esc Close`).

* **Apple Notes / Bear-Style Floating Notepad (`NotesPopupShell.tsx` & `index.css`)**:
  - macOS traffic-light window controls (`.mac-traffic-lights`) for smooth native feel.
  - Auto-seeded rich "Welcome to KeyFlow Notes 📝" document on first run or empty state, immediately presenting a clean, formatted note ready to edit.
  - Pinned notes feature (`📌 Pin`) keeping priority notes at the top of the sidebar.
  - 1-Click "Copy Note" button with instant visual copied feedback state.
  - Note metadata bar displaying formatted last modified date, word count, and character count.
  - Rich formatting toolbar: Bold, Italic, Underline, Strikethrough, Headings (H1, H2, H3, ¶), Bullet & Numbered Lists, Blockquotes (`”`), Horizontal Dividers (`—`), Undo, and Redo.
  - Keyboard shortcuts: `Ctrl+N` (New note with immediate title focus), `Ctrl+F` (Focus search input), `Esc` (Close window / clear search).
  - Enhanced typography: readable 1.7 line height, syntax-highlighted code blocks, and styled blockquotes with accent border.
  - Continuous debounced autosave with live status indicator pill.

* **Design Tokens & CSS Refinements (`index.css`)**:
  - Standardized hairline borders (`1px solid var(--color-border-subtle)`), soft elevated surfaces, and modern card elevation.

## 2026-08-17 — Cycle 5: Live App Context, Gesture Availability, Key Picker & Drag Corner V2

* **Live app context (Part A)**:
  - Native `GetActiveApp` IPC (`native/keyflow-input/src/protocol.rs` `ActiveApp`/`GetActiveApp`, `electron/main.ts` `native:get-active-app`, `preload.ts` `input.getActiveApp`) resolves the foreground executable to a `NativeAppInfo`.
  - New hook `src/lib/useActiveApp.ts` polls every 1500 ms + on window focus, feeding `focusedApp` into the app bar; `src/components/AppPicker.tsx` now shows a live "Running now" section (1 s refresh, diffed via `src/lib/app-scope.ts` `diffRunningApps`) above saved scopes, with a "Current" context chip for the focused app.
  - New CSS classes: `.app-picker-section`, `.app-picker-section-title`, `.app-picker-live`, `.app-picker-saved-hint`, `.app-picker-current`.

* **Scope-aware gesture availability (Part B)**:
  - `src/lib/conflict.ts` adds `getGestureAvailability` + `allTapGesturesTaken`: reports which single/double/triple-tap gestures are free for a candidate key in the current app scope.
  - `src/pages/CreateShortcut.tsx` shows gesture chips (free = selectable, taken = disabled) and a warning banner when all tap gestures are taken. New CSS classes: `.gesture-availability`, `.gesture-availability-head`, `.gesture-chip`, `.gesture-chip.is-current`, `.gesture-chip.is-taken`.

* **Searchable complete key picker (Part C)**:
  - New canonical renderer catalog `src/lib/keyCatalog.ts` (9 groups, alias search) + modal `src/components/KeyPicker.tsx` (search + grouped chips + arrow-key navigation), opened via "Browse…" in `KeyCapture`.
  - `src/lib/constants.ts` adds `FUNCTION_KEYS_EXTENDED` (F1–F24) used by REMAP_TARGETS. New CSS classes: `.key-picker-search`, `.key-picker-list`, `.key-picker-group`, `.key-picker-chips`, `.key-picker-chip` (+`.is-selected`), `.key-picker-item` (+`.is-focused`), `.key-picker-cap`, `.key-picker-name`.

* **Drag Corner Switcher V2 (Part D)**:
  - Native engine (`drag_switcher.rs` V2 + new `raw_mouse.rs`) now observes the mouse via Raw Input (hidden `KeyFlowRawMouse` window, RIDEV_INPUTSINK) instead of WH_MOUSE_LL — the sole mouse source; position always from GetCursorPos.
  - 8 hot zones (4 corners + 4 edges) as a bitmask with presets (Top Right / All Corners / All Edges / All), activation dwell (0 ms = Instant) and hover dwell; `[drag-v2]` forensic logs on transitions.
  - `protocol.rs` `SetDragSwitcher` now carries `zones`/`activationMs`; `src/lib/drag-zones.ts` holds the renderer-side preset masks + `maskToPreset`; `src/pages/Settings.tsx` gains a Trigger area preset dropdown, a visual 3×3 zone picker (`drag-zone-picker`) with accent-blue active states, Activation speed and Switch window speed presets, all mirrored through `electron/native-input-helper.ts` + `electron/main.ts`.
  - New CSS classes: `.drag-zone-picker`, `.drag-zone-monitor`, `.drag-zone` (+`.is-active`, `.dz-tl`…`.dz-br`).

## 2026-08-15 — App-Specific Shortcuts ("Works In")

* **App scope on shortcuts (`src/types/index.ts`, `src/lib/app-scope.ts`, `src/lib/conflict.ts`, `src/lib/native-input.ts`)**:
  - Every shortcut can now be scoped to one app via `Shortcut.appScope` (`{ scopeType: "executable", executablePath, processName?, displayName? }`); absent scope = Everywhere.
  - New pure-TS helper module `src/lib/app-scope.ts`: `normalizeExecutablePath` (lowercase, `/`→`\`, trim, strip NUL), `appScopeMatches`, `isScopeActive`, `appScopeKey`, `formatScopeLabel`, `filterRunningApps`, `scopeFromPickedApp`, `scopeFromBrowsePath`. Matching uses ONLY the normalized executable path — window titles never participate.
  - `src/lib/conflict.ts` is scope-aware: same trigger in different apps or a global+app-specific override coexist; same app + same trigger still conflicts. Scope label is included in Shortcuts search.
  - `native-input.ts` forwards `appScope` into the native engine sync.

* **Native engine app-scoping (`native/keyflow-input`)**:
  - Event-driven foreground tracking (`app_scope.rs`) via `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`; each key event reads the cached foreground app by normalized executable path, fail-open when unresolved.
  - Scoped behaviors routed to a `scoped` vector (`config.rs`); app-specific rule wins over the Everywhere rule for the same `(key, kind, mods)` with different-kind coexistence (`trigger.rs` shadowing).
  - On foreground change: `remap::on_scope_change` releases held remapped targets no longer matching and swallows the physical key-up; gestures are reset only for keys with scoped rules. Remaps stay correct across rapid app switches.
  - New `ListApps` IPC (`drag_switcher.rs`) exposes running windows' executable paths.

* **Works In selector UI (`src/components/AppPicker.tsx`, `src/pages/CreateShortcut.tsx`, `src/index.css`)**:
  - Segmented "Everywhere / Specific App" control under Step 1: Shortcut & Trigger. Choosing Specific App opens a modal listing running apps with icons + search, plus "Browse for application…" via a native file dialog (`native:browse-exe` IPC in `electron/main.ts`/`preload.ts`).
  - Selected scope renders as a chip with a "Change app" button; cancel leaves the value untouched.
  - Shortcuts list shows a `window`-icon chip with the app label for scoped shortcuts.

* **New CSS classes**: `.app-scope-chip`, `.app-picker-list`, `.app-picker-item`, `.app-picker-icon`, `.app-picker-copy` (all tokens/spacing from the design system).

## 2026-08-13 — Custom Sounds, Accent Color Swatches, Hyper-First Popup, Source Switcher & Settings Layout Fix

* **Custom KeyFlow Sound Assets (`public/sounds/`)**:
  - Added `topmost-on.wav` (260ms soft ascending chirp C5→E5, 38% amplitude) and `topmost-off.wav` (220ms descending settle E5→C5, 32% amplitude), generated via `scripts/gen-sounds.mjs` as 16-bit 44100 Hz PCM WAV with no external dependencies.
  - Created `electron/sound.ts`: resolves WAV asset path across dev (`public/sounds/`) and production (`resources/sounds/`), plays via PowerShell `System.Media.SoundPlayer.Play()` — async, non-blocking, no npm audio deps.
  - Removed `play_system_beep()` (Windows `MessageBeep`) from `native/keyflow-input/src/window_control.rs`. The Rust binary accepts `--sound`/`--no-sound` for compatibility but no longer calls any Windows audio API.
  - `electron/window-control.ts` calls `playKeyFlowSound("topmost-on" | "topmost-off")` on successful toggle, respecting the caller's `sound` flag.

* **Accent Color Swatches (`src/lib/constants.ts`, `src/pages/Settings.tsx`, `src/store/useStore.ts`, `src/index.css`)**:
  - Replaced `ACCENT_COLORS` (5 unlabeled blue hex strings) with `ACCENT_PRESETS`: 8 named color objects spanning distinct hues (KeyFlow Blue, Indigo, Violet, Emerald, Amber, Rose, Pink, Slate). `ACCENT_COLORS` kept as backward-compatible alias.
  - Fixed `applyAppearance()` in `useStore.ts`: now injects `--color-accent` and all four derived tokens (`--color-accent-hover`, `--color-accent-pressed`, `--color-accent-soft`, `--color-accent-border`) from the stored hex value on every settings change, so the whole UI recolors instantly.
  - Pure-TS color helpers (`hexToRgb`, `lightenHex`, `darkenHex`, `hexToRgba`) added inside `useStore.ts` — no npm color libraries.
  - Settings Appearance section renders visual 26px circle swatches (`accent-swatch`) using `--swatch-color` CSS custom property, with selected state border + inner white ring. Also adds a `<input type="color">` custom picker (`accent-swatch-custom`) for any hex color.
  - New CSS classes: `.accent-swatch-row`, `.accent-swatch`, `.accent-swatch.is-selected`, `.accent-swatch-custom`.

* **Hyper-First Popup Preset (`src/pages/CreateShortcut.tsx`, `src/lib/defaults.ts`)**:
  - Moved Popup Menu to first position in `RECOMMENDED_PRESETS`.
  - Popup preset card shows `chip-accent "Hyper Tap"` badge when `hyperKeyConfig.enabled === true`; falls back to `chip-subtle "F (Double tap)"` otherwise.
  - When Hyper is not configured, the card shows an inline nudge link: "Set up Hyper Key" → navigates to Settings page.
  - Cleared `hyperKeyConfig.tapActionId` default from `"sc-f-popup"` to `undefined` to avoid silent mismatches on fresh installs.

* **Keyboard/Mouse Source Switcher (`src/pages/CreateShortcut.tsx`, `src/index.css`)**:
  - Added explicit `[⌨ Keyboard] [🖱 Mouse]` segmented control (`segmented-control` / `seg-btn`) above the key capture field in Step 1: Shortcut & Trigger.
  - Keyboard→Mouse: sets `{ mouse: true, key: "MB1", modifiers: [] }`. Mouse→Keyboard: sets `{ mouse: false, key: "T", modifiers: ["Ctrl", "Shift"] }`.
  - New CSS classes: `.segmented-control`, `.seg-btn`, `.seg-btn.is-active`, `.seg-btn:hover`.

* **Settings Sticky Nav Layout Fix (`src/index.css`)**:
  - `.settings-layout` changed from `display: grid` to `display: flex` with `min-height: 0; flex: 1` to enable proper overflow containment.
  - `.settings-nav` now has `position: sticky; top: 0; max-height: calc(100vh - 160px); overflow-y: auto` — the category panel never scrolls off screen regardless of window height or content length.

* **Utility CSS additions**:
  - `.link-btn`: inline unstyled button styled as an accent-colored underline link (used for the Hyper Key setup nudge inside the preset tile).
  - `.preset-tile-hint`: muted caption-size text for supplemental preset tile notes.



* **Central Shortcut Conflict Engine (`src/lib/conflict.ts`)**:
  - Implemented unified conflict analysis checking for exact duplicates, gesture overlaps (`single` vs `double`/`triple`/`hold`, `double` vs `triple`), risky bare printable single keys, and Windows reserved combinations.
  - Added smart alternative shortcut recommendation generator proposing safe, non-conflicting modifier chords (e.g. `Ctrl+Shift+<Key>`, `Alt+Shift+<Key>`, `Ctrl+Alt+<Key>`).
  - Added live inline conflict warning and error banners in `CreateShortcut.tsx` with 1-click alternative selection.
  - Updated Recommended Presets so Always on Top and Open App default to safe modifier combinations (`Ctrl+Shift+T` and `Ctrl+Shift+O`).
* **Popup Window Dimensions & Measurement (`PopupShell.tsx`, `popup-position.ts`, `tokens.css`)**:
  - Increased popup width from 440px to 540px (min: 480px, max: 580px, max height: 600px).
  - Integrated `useLayoutEffect` DOM content measurement in `PopupShell.tsx` and dynamic bounds updates in `electron/popup-window.ts` to prevent vertical clipping of action lists.
* **Native Rust Modifier Mapping & Typing Burst Extension (`native/keyflow-input`)**:
  - Fixed modifier VK to bitmask folding in `config.rs` so chords like `Ctrl+Shift+C` (VKs 17 and 16) map correctly to `MOD_BIT_CTRL | MOD_BIT_SHIFT` (5) in the native trigger engine.
  - Extended typing protection to suppress standalone printable single-key shortcuts during active typing bursts, preventing accidental activations while typing words like `office` or `coffee`.
  - Modifier combinations (`Ctrl+Shift+C`) and non-printable keys (`CapsLock`, `Escape`, `F1-F24`) remain 100% immediate.
  - Added 46 unit tests in Rust and 173 automated tests in Node.js.

* **Popup Window Polish & Layout**:
  - Configured `transparent: true, backgroundColor: "#00000000"` and `hasShadow: false` on the popup BrowserWindow to eliminate blank background canvas around the palette.
  - Set `.popup-window-root` padding and margin to 0 for pixel-perfect content bounding.
  - Fixed search input placeholder character encoding from literal `\u2026` to real ellipsis `…`.
  - Scaled item height and padding for a compact command palette feel with responsive internal scroll.
* **Centralized Typography Scaling (`--font-scale`)**:
  - Added `--font-scale` token across `tokens.css`: `small` (92%), `default`/`normal` (100%), `large` (110%), `xlarge` (122%).
  - Derived all typography role sizes using `calc(N * var(--font-scale, 1))`.
  - Added user-facing `Text size` selector in Settings → Appearance with live synchronized preview in main window and popup.
* **Centralized Motion System**:
  - Defined standard motion tokens: `--motion-fast` (100ms), `--motion-default` (160ms), `--motion-slow` (220ms), and `--ease-desktop` (`cubic-bezier(0.16, 1, 0.3, 1)`).
  - Added page-enter subtle fade-in transition (`fadeIn`) to main content area.
  - Implemented strict `prefers-reduced-motion` and `.reduce-motion` instant transitions.
* **Native Rust Typing Protection**:
  - Implemented idle-gap burst detection in `native/keyflow-input` (`keymap.rs`, `config.rs`, `trigger.rs`, `protocol.rs`).
  - Distinguishes printable typing stream keys (`A-Z`, `0-9`, OEM symbols) from dedicated function keys (`CapsLock`, `Escape`, `F1-F24`, modifiers).
  - Rapid printable key entry suppresses multi-tap accumulation to prevent false triggers (e.g. typing words like `coffee` will never trigger `FF`).
  - Added user configurable `Typing protection` setting (`Balanced (400ms)`, `Strict (650ms)`, `Off (Raw gestures)`).
  - Dedicated non-printable keys (`CapsLock` screenshot) and modifier combos (`Ctrl+Shift+K`) remain completely immediate and unaffected.

## 2026-08-12 — Full Application UI Redesign (v2 Modern Native Desktop)

* **Design Tokens (`src/design/tokens.css`)**:
  - Completely modernized desktop palette with deep calm dark neutrals (`#0d1117`, `#131922`, `#18202c`, `#1e2736`, `#223249`) and crisp light neutrals (`#f8fafc`, `#ffffff`, `#f1f5f9`, `#eef2f6`).
  - KeyFlow signature calm blue accent (`#3b82f6` dark / `#2563eb` light).
  - Modern desktop typography tokens with `Segoe UI Variable`, `Segoe UI`, `Inter`, `system-ui`.
  - Restrained radii scale (`--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-pill: 999px`).
  - Natural desktop soft shadows without harsh dark boxes.
* **App Shell**:
  - Clean native-feeling integrated titlebar (`TitleBar.tsx`) with active profile indicator, window drag region, and Windows 11 style window controls.
  - Streamlined desktop sidebar (`Sidebar.tsx`) with clear navigation groupings (Shortcuts, Workspace), active profile switcher, and quiet pause/safe mode indicator.
  - Contextual status topbar (`TopBar.tsx`) with search, active foreground app pill, live engine status dot, and quick theme toggle.
* **Dashboard (`src/pages/Dashboard.tsx`)**:
  - Calm status overview banner answering system state and profile.
  - 3-card desktop metric summary.
  - Pinned/Favorite shortcuts list with keycaps and instant test/toggle controls.
  - Recent activity feed with human-readable action names and relative timestamps.
* **Shortcuts List (`src/pages/Shortcuts.tsx`)**:
  - Replaced giant nested cards with a clean native desktop table/list row view.
  - Compact shortcut rows: Keycap badge → Name & Action → Trigger type → Profile → Enable Toggle → Hover actions (Star, Edit, Duplicate, Delete).
* **Create Shortcut (`src/pages/CreateShortcut.tsx`)**:
  - 4 1-click Recommended Preset cards (Screenshot, Always on Top, Popup Menu, Open App).
  - Simplified 3-step creation flow with tactile key capture box.
  - Collapsed `Advanced ▾` drawer preserving 100% of expert options (timings, key behavior, sequence).
* **Settings (`src/pages/Settings.tsx`)**:
  - Transformed into a native desktop preferences layout (Apple System Settings / Windows Settings style).
  - Left-hand category navigation (General, Shortcuts, Always on Top, Popup Menu, Appearance, Privacy & Safety, Data & Backup, Advanced, About).
  - Clean preference rows with label & description on left, control on right.
* **Profiles, Keyboard Map, Library, Onboarding**:
  - Harmonized with the unified v2 desktop design system.
* **Popup Menu (`src/components/PopupMenu.tsx` & `src/components/PopupShell.tsx`)**:
  - Command-palette styling with Acrylic backdrop blur, subtle drag grip, search input, and keyboard navigation hints, while keeping 100% of the working lifecycle and reopen architecture intact.

## 2026-08-12 — Popup drag handle, reopen reliability, Escape fix

* Added `.popup-drag-region` class (`-webkit-app-region: drag`) applied to the popup header strip. Enables native Electron drag without a custom JS mouse engine.
* Added `.popup-drag-handle` pseudo-element grip indicator (two subtle horizontal bars using `--color-border-strong`, `--radius-pill`). Opacity 0.45, brightens on hover to 0.8.
* Applied `-webkit-app-region: no-drag` to `.popup-close`, `.popup-search`, `.popup-list`, and `.popup-item` so interactive controls remain clickable inside the drag region.
* Removed `blur` auto-close from `PopupWindowManager`. Popup now closes only via FF shortcut, X button, Escape (when phase is open/opening), or action execution.
* Added generation guard to the `closeFlow()` fallback timer: captures `closeGenId` at close start; the timer callback bails if the current generation has changed (popup was reopened before the timer fired).
* `popup-position.ts`: added `isPositionOnScreen(point, size, displays)` utility that checks whether the popup's drag bar is visible on at least one active display work area.
* `popup-window.ts`: listens to `win.on("moved")` to record `lastPosition` after user drag. On next open, `finalizeAndShow()` uses `lastPosition` if on-screen; otherwise clamps it to the nearest work area.
* `PopupShell.tsx`: Escape keydown listener now guards on `phaseRef.current` — only consumes Escape when phase is `"open"` or `"opening"`. When hidden/closing, Escape passes through to Windows (snipping overlay, etc.).

## 2026-08-05 — Global popup overlay polish and suppression ground-work

* Added approved popup tokens to `src/design/tokens.css`: `--popup-backdrop-blur` (28px), `--popup-backdrop-saturate` (1.25), `--popup-surface-opacity` (0.9), `--popup-surface`, `--popup-surface-border`, `--popup-item-height` (60px), and the sizing bounds `--popup-min-width` / `--popup-max-width` / `--popup-min-height` / `--popup-max-height`.
* The global popup now uses a strong blurred acrylic-style surface (CSS blur fallback), a header **X** close button, and content-driven dynamic sizing via the safe `popup.reportContentSize` bridge.
* Documented the popup overlay contract in `docs/DESIGN_SYSTEM.md` and `docs/COMPONENT_RULES.md`.

## 2026-08-03 — Permanent design foundation

* Replaced the conflicting purple/cyan and gradient-heavy renderer palette with the approved cloud-blue token hierarchy.
* Standardised typography roles, spacing scale, radii, control dimensions, layout widths, shadows, focus states, and motion tokens in `src/design/tokens.css`.
* Established the required token import order: `tokens.css` before `index.css`.
* Consolidated renderer CSS around design tokens and removed duplicate root/theme declarations and self-referential compatibility aliases.
* Added `AppSelect` as the shared dropdown implementation with keyboard navigation, selected indicators, focus restoration, viewport-aware placement, and portal rendering.
* Migrated the Sidebar active-profile selector and Settings Theme field to `AppSelect` as the representative dropdown proofs.
* Added responsive, component, and accessibility rules for future page migrations.
* Added the first shared `PageHeader` component; existing `PageIntro` remains a compatibility export until page-by-page migration.
* Added the non-rewriting `npm run design:check` validation command.
## 2026-08-28 — KeyFlow Control Deck visual rebuild

* Reframed the renderer around a graphite utility-control visual language inspired by the compact, modular information architecture of the Vorssaint project, while retaining KeyFlow's Windows-native shell, blue action signal, and existing product identity.
* Restyled the shared shell, navigation, top bar, cards, controls, settings groups, shortcut rows, keyboard map, popup surfaces, and responsive drawer through the existing token system.
* Added a dashboard runtime signal strip for engine, profile, active-rule, and foreground-app state so the primary screen leads with live operational context.
* Preserved Electron window controls, title-bar dragging, native input routing, profiles, shortcut data, popup behavior, pause, Safe Mode, and local storage.

## 2026-08-28 — Hot Corners and Screen Tint preferences

* Added a dedicated Hot Corners settings category with independent top-left, top-right, bottom-left, and bottom-right actions.
* Added Charmy-inspired built-in corner actions, configurable dwell/cooldown timing, corner target sizing, and bindings to enabled KeyFlow shortcuts.
* Added a dedicated Screen Tint category with all-display click-through overlay control, approved preset swatches, custom color input, and strength control.
* Kept the existing Drag Corner Switcher separate because it is a drag-and-switch-window workflow rather than an idle pointer hover action.
