# Design Changelog

## 2026-08-12 — Shortcut Conflict Engine, Generic Typing Protection, Always on Top Modifier Fix & Popup Bounds

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
