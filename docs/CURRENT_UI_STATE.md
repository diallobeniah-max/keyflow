# KeyFlow Current UI State

**Last verified:**
* **Date:** 2026-09-08
* **Branch:** `feature/modern-desktop-ui`
* **Commit:** `8d9470b` (with active working tree)
* **Working tree status:** Verified against current renderer source files and Electron runtime integration.

## Purpose

This document summarizes the **CURRENT IMPLEMENTED** UI architecture and interaction behavior in the KeyFlow codebase as of today.

### Source-of-Truth Priority
1. **Current working tree code** (source files in `src/` and `electron/`)
2. **`docs/DESIGN_SYSTEM.md` / `docs/COMPONENT_RULES.md`** (permanent design rules and component contracts)
3. **`docs/CURRENT_UI_STATE.md`** (this document — current live reality)
4. **Newest relevant `docs/DESIGN_CHANGELOG.md` entry**
5. **Older changelog history**

> [!IMPORTANT]
> If existing code contradicts this document, inspect the code and update this document rather than blindly modifying working code to match stale prose.

### Documentation Ownership Contract
* **DESIGN_SYSTEM.md** = How KeyFlow **SHOULD** be designed (rules, tokens, scales, conventions).
* **CURRENT_UI_STATE.md** = How KeyFlow **IS** currently structured and implemented in the working tree.
* **DESIGN_CHANGELOG.md** = How KeyFlow **GOT HERE** (chronological evolution over time).

### Related Documentation
* [Design System](./DESIGN_SYSTEM.md) — permanent design rules, tokens, and layout principles
* [Design Changelog](./DESIGN_CHANGELOG.md) — historical design evolution over time
* [Component Rules](./COMPONENT_RULES.md) — shared component specifications and constraints

---

## 1. Application Shell

* **Electron Windows Shell (`electron/main.ts`)**:
  - Frameless window with native Windows caption controls (`titleBarStyle: "hidden"`, `titleBarOverlay`).
  - Baseline recommended dimensions: **1020 × 700 px**.
  - Minimum dimensions: **520 × 640 px**.
* **Integrated Title Bar (`src/components/TitleBar.tsx`)**:
  - Standard height: **44px** (`--layout-titlebar-height`).
  - Window caption control clearance on right: **138px** (`--layout-window-controls-width`).
  - Entire titlebar is `-webkit-app-region: drag` except interactive brand logo, title, and buttons.
  - **Brand Logo Context Menu**: Right-clicking the KeyFlow logo in the titlebar or TopBar opens a context menu with:
    1. *Restore default size (1020 × 700)*: Resizes and unmaximizes window to default baseline.
    2. *Lock window size* (toggle): Locks window dimensions permanently.
    3. *Appearance Settings*: Directly navigates to appearance configuration.
  - **Window Size Lock Enforcement**: When `appearance.lockWindowSize` is enabled, window maximize events and double-click maximizes are immediately reverted to 1020 × 700, popping an interactive toast notification with an inline **"Unlock Size"** action button.
* **Scroller Ownership**:
  - On standard pages (Overview, Shortcuts, Visual Map, etc.), the outer container (`.content`) owns vertical scrolling.
  - On the Settings page, the outer scroller is locked (`.content.is-settings-view` with `overflow: hidden; height: 100%`), delegating scrolling completely to independent inner panels (`.settings-nav` and `.settings-content`).
* **Root Runtime Attributes**:
  - `data-theme`: `"dark"` | `"light"` (resolved from `appearance.theme`).
  - `data-font-size`: `"default"` | `"small"` | `"large"` | `"xlarge"`.
  - `data-radius`: `"compact"` | `"relaxed"`.
  - `data-backdrop-material`: `"mica"` | `"acrylic"` | `"solid"`.
  - `data-layout-width`: `"standard"` | `"large"` | `"full"`.
  - `data-header-tint`: `"subtle"` | `"none"`.
  - `data-header-fit`: `"full"` | `"padded"`.
  - `--ui-scale`: `"0.9"` | `"1"` | `"1.1"` | `"1.25"`.

---

## 2. Navigation

KeyFlow supports two primary navigation architectures, configured in Settings under **Appearance → Navigation Layout** (`appearance.navigationLayout`):

### Vertical Navigation Mode (`navigationLayout === "vertical"`)
* **Left Sidebar (`src/components/Sidebar.tsx`)**:
  - Collapsible (`sidebarCollapsed`) and draggable/resizable (`sidebarWidth`, default 220px, persisted in `localStorage`).
  - Grouped items:
    - *Main*: Overview, Shortcuts (badge: active shortcuts count), Create, Keyboard Map.
    - *Manage*: Clipboard, Profiles (badge: profile count), Action Library, Notes, Settings.
  - Bottom controls: Engine Pause/Resume button (`sidebar-pause-btn`) with live indicator.

### Horizontal Navigation Mode (`navigationLayout === "horizontal"`)
* **Floating Bottom Dock (`src/components/FloatingBottomDock.tsx`)**:
  - Floating pill-shaped dock positioned near the bottom of the window.
  - Localized acrylic blur (`--dock-surface`) with underlying gradient scrim (`--dock-scrim-bg`) that blurs content scrolling underneath.
  - Centered circular **Create (+)** action button.
  - Far-right circular **Pause/Resume** engine button.
  - Interactive hover preview cards providing status details and tips.
  - Preference controls (`appearance`):
    - `dockTooltips` (boolean): Toggles hover preview cards on/off.
    - `dockLabelMode` (`"active"` | `"all"` | `"none"`): Controls whether tab labels show only on the active item, on all items, or only icons.
* **TopBar Pill Navigation (`src/components/TopBar.tsx`)**:
  - In horizontal mode, the old `KeyFlow Deck v0.3` header is replaced with clean pill clusters:
    - **Top-Left Cluster**:
      - Back (`←`) button (with shortcut `Alt+Left`).
      - Forward (`→`) button (with shortcut `Alt+Right`).
      - Interactive breadcrumb capsule (`keyflow / [Page] / [Section]`) with clickable segments.
    - **Top-Right Cluster**:
      - Quick Navigation hamburger menu pill (opens dropdown to jump to any page).
      - Command Palette search trigger pill (`Ctrl+K`).
      - Engine status indicator pill (`Live`, `Paused`, `Safe Mode`).
      - Logo pill with right-click size restoration and lock menu.
* **Windows History Trail (`src/components/WindowsHistoryBar.tsx`)**:
  - Windows Explorer-style navigation history bar at the bottom (`[ 🪟 ] > [ Overview ] > [ Shortcuts ] > [ Settings / Appearance ]`).
  - Positioned defensively above the floating dock (`bottom: 84px`) in horizontal mode or `bottom: var(--space-3)` in vertical mode.
  - Tapping any historical pill restores that previous view instantly via `jumpToHistory`.

---

## 3. Dashboard / Overview

* **Source file:** [`src/pages/Dashboard.tsx`](../src/pages/Dashboard.tsx)
* **Top Runtime Signal Strip**:
  - Real-time status indicator (`Live`, `Paused`, `Safe Mode`).
  - Shortcuts counter badge.
  - Zero CPU idle memory readout.
  - **Active Profile Switcher**: Implemented with `AppSelect` inside `.signal-cell-profile` directly under the `PROFILE` heading in the signal strip.
* **Responsive Modular Toolkit Grid (`.toolkits-grid`)**:
  - Automatically adapts column count across window sizes:
    - `<760px`: 1 column
    - `760px – 1299px`: 2 columns
    - `≥1300px`: 3 columns
  - Eliminates card compression below 300px.
* **Utility Control Cards**:
  - **Scratchpad (Notes)**: Displays live note title, word/char counts, `Open Notes →` button.
  - **Clipboard Shelf**: Displays clip count, format chips, `Open Clipboard →` button.
  - **Dim Screen**: Monitor brightness slider, quick presets.
  - **Screen Tint**: Temperature slider, active status.
  - **Media Player Pill**: Play/pause, track skip, volume slider.
  - **Gestures & Trackpad**: Gesture trail toggle, touchpad drag sensitivity.
* **Favorite & Recent Shortcuts**: Quick inline toggle switches for frequent automations.

---

## 4. Settings Architecture

* **Source files:**
  - Layout & routing: [`src/pages/Settings.tsx`](../src/pages/Settings.tsx)
  - Sidebar navigation: [`src/pages/settings/SettingsSidebar.tsx`](../src/pages/settings/SettingsSidebar.tsx)
  - Navigation categories & model: [`src/pages/settings/types.ts`](../src/pages/settings/types.ts)
* **Independent Dual-Panel Scrolling**:
  - Left navigation sidebar (`.settings-nav`) is **100% glued and static**: it owns its own scroller with sticky top search bar (`Ctrl+K`).
  - Right detail panel (`.settings-content`) is an independent scroller extending 100% to the bottom edge under the floating dock scrim.
  - Scrolling the right panel never scrolls or pushes the left sidebar off-screen.
* **Auto-Hiding Overlay Scrollbars**:
  - Subtle 5px overlay scrollbars that are **100% transparent and invisible** when idle.
  - Thumbs reveal only on the specific panel actively being scrolled (`.settings-nav.is-scrolling`, `.settings-content.is-scrolling`), fading away 900ms after scrolling stops.
  - Scrollbar gutters do not consume layout width (`scrollbar-gutter: stable`).
* **Section-Switch Scroll Reset**:
  - Switching sections resets `.settings-content.scrollTop = 0` automatically.
  - If navigating to a deep-linked anchor ID (`settingsFocusTarget`), the scroller smoothly targets that row with an active highlight pulse.
* **The 6 Navigation Groups & 20 Sections**:
  1. **App**: App Behavior (`appBehavior`), Notifications (`notifications`)
  2. **Input**: Keyboard & Gestures (`keyboard`), Gestures & Trackpad (`gesturesTrackpad`), Command Palette (`commandPalette`), Shortcut Bindings (`shortcutBinding`)
  3. **Navigation & Control**: WASD Navigation (`wasd`), Hot Corners (`hotCorners`), Always on Top (`alwaysOnTop`)
  4. **Interface**: Appearance (`appearance`), Smooth Scrolling (`smoothScroll`), Screen Tint (`screenTint`), Dim Screen (`dimScreen`), Media Player Pill (`mediaPlayer`), App Icon (`appIcon`), Popup Menu (`popup`)
  5. **System**: Privacy & Safety (`privacy`), Backup & Restore (`backup`), Advanced (`advanced`)
  6. **Information**: About KeyFlow (`about`)

---

## 5. Shared Settings Rows & Controls

* **`.settings-row`**:
  - Flex container with `flex-wrap: wrap;` and minimum height of 64px.
  - `.settings-row-info`: `flex: 1 1 240px; min-width: min(100%, 200px);` guarantees label and description text never get squeezed into narrow single-word columns.
  - `.settings-row-control`: Controls wrap naturally with `max-width: 100%` rather than being clamped to an artificial percentage.
* **`AppSelect` (`src/components/ui/AppSelect.tsx`)**:
  - Only approved shared select dropdown.
  - Viewport-safe portal positioning.
  - Dropdown menu width matches trigger button width automatically.
  - Text labels truncate with ellipsis (`...`) on long options, with hover `title` tooltips.
* **`Toggle` (`src/components/ui.tsx`)**:
  - Semantic switch button with `aria-pressed`, token-based track, and thumb translation.
* **`Slider` (`src/components/ui.tsx`)**:
  - Native range input with accent track fill and adjacent monospace value badge.
* **`.settings-notice-box` (`src/index.css`)**:
  - Full-width callout container for informative or safety messages with token borders and muted backgrounds.
* **Responsive Helper Classes**:
  - `.settings-slider-row`: Flex row for slider controls (`flex: 1 1 220px; max-width: 320px`).
  - `.settings-select-field`: Flex wrapper for select controls (`flex: 1 1 220px; max-width: 320px`).
  - `.excluded-app-input-row`: Responsive row for application exclusion inputs.

---

## 6. Command Palette

* **Source files:** [`src/components/CommandPalette.tsx`](../src/components/CommandPalette.tsx), [`src/pages/settings/CommandPalettePage.tsx`](../src/pages/settings/CommandPalettePage.tsx)
* **Shortcut**: `Ctrl+K` (customizable in settings).
* **Presentation Modes**:
  - *Compact Mode*: Streamlined single-column search view with keyboard hints.
  - *Expanded Mode*: Detailed view with live sideview inspector showing action parameters, description, and execution metadata.
* **Mode-Card Layout (`.window-mode-cards`)**:
  - Full-width 2-column grid (`grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; max-width: 100%;`).
  - Mode cards auto-adjust to 50%/50% width equally across available space with single-column mobile fallback.
* **Search Architecture**:
  - Fuzzy search querying actions, shortcuts, settings categories, and commands with typo tolerance.
  - Arrow key navigation with auto-scrolling into view.

---

## 7. Clipboard Architecture

* **Backend**: Single unified clipboard engine in Electron (`electron/clipboard-engine.ts`) with disk persistence and privacy filters.
* **Dual Interface Presentation**:
  - **Full Clipboard Hub (`src/pages/Clipboard.tsx`)**:
    - Main window view.
    - Timeline history with timestamp grouping.
    - Search, content-type filtering (Text, Images, Files, Links).
    - Custom pinboards and category folders.
    - Interception pause/resume control.
  - **Floating Clipboard Overlay (`src/pages/ClipboardOverlay.tsx`)**:
    - Opened via shortcut in a dedicated frameless popup window (`window=clipboard-popup`).
    - Presentation layouts: Horizontal shelf, vertical list, grid rows.
    - Density presets: Compact, Normal, Relaxed.
    - Lightbox preview modal for full text, code snippets, and high-resolution images.
* **Theme Synchronization**:
  - Synchronous initial state parsing ensures immediate correct theme on popup launch.
  - Real-time cross-window synchronization via `"storage"` event listeners.

---

## 8. Notes (Scratchpad)

* **Source files:**
  - Floating window: [`src/components/NotesPopupShell.tsx`](../src/components/NotesPopupShell.tsx), [`electron/notes-window.ts`](../electron/notes-window.ts)
  - Settings page: [`src/pages/NotesSettingsPage.tsx`](../src/pages/NotesSettingsPage.tsx)
* **Floating Window Behavior (`window=notes`)**:
  - Frameless, transparent background, always on top.
  - Sizing presets: Comfortable (700 × 640), Compact (560 × 520), and custom user presets.
  - Draggable sidebar resizer splitter.
* **Rich-Text Editor Features**:
  - Formatting toolbar: Headings (H1, H2, H3), bold, italic, underline, highlighter, bullet lists, interactive checklists, markdown tables, blockquotes.
  - Raycast slash commands (`/h1`, `/todo`, `/table`, `/callout`, etc.).
  - Drag-and-drop file insertion (images, PDFs, PSD).
  - Continuous debounced autosave to disk with status indicator dot.
  - Custom storage directory picker via File Explorer.
  - Multi-window theme synchronization with instant reaction to light/dark switches.

---

## 9. Smooth Scroll

* **Source files:** [`src/lib/smooth-scroll-engine.ts`](../src/lib/smooth-scroll-engine.ts), [`src/hooks/useSmoothScroll.ts`](../src/hooks/useSmoothScroll.ts), [`native/keyflow-input/src/smooth_scroll.rs`](../native/keyflow-input/src/smooth_scroll.rs)
* **Active Physics Model**:
  - **Target-Momentum Physics**: Accumulates mouse wheel delta into a dynamic target position and pulls the scroll offset toward it using exponential dampening.
  - *Note: This completely supersedes the older impulse-queue model.*
* **Presets**:
  - `native`: Standard unintercepted browser/OS scrolling.
  - `fast`: Snappy response with short duration.
  - `balanced`: Recommended everyday default.
  - `smooth`: Extended deceleration.
  - `cinematic`: Long, gliding momentum.
  - `custom`: Direct slider tuning for speed, smoothness, and acceleration.
* **Application**: Applied in-app via `useSmoothScroll` on `.content` and `.settings-content`, and optionally system-wide across Windows via the native input worker thread.

---

## 10. Shortcut / Native Input UI

* **KeyCapture (`src/components/KeyCapture.tsx`)**:
  - Records physical keystrokes with live modifier pill badges (Ctrl, Alt, Shift, Win).
  - Supports mouse button assignment and multi-tap triggers (double-tap, triple-tap).
* **Conflict Engine (`src/lib/conflict.ts`)**:
  - Detects overlapping key combinations across global and app-scoped shortcut profiles.
* **Windows Shortcuts Catalog (`src/lib/windows-shortcuts-catalog.ts`)**:
  - Comprehensive database of reserved Windows OS shortcuts.
  - Emits cautionary warnings when user binds keys that conflict with system shortcuts (e.g. `Win+L`, `Win+R`, `Alt+Tab`).
* **Typing Protection**:
  - Global shortcuts automatically suppress interception when focus is inside active input fields or contenteditable elements.

---

## 11. Motion System

* **Source files:** [`src/lib/motion.ts`](../src/lib/motion.ts), [`src/design/motion.css`](../src/design/motion.css)
* **Standard Presets**:
  - `anim-fade-in`: Opacity 0 to 1.
  - `anim-scale-in`: Scale 0.95 to 1.0 with subtle fade.
  - `anim-slide-up` / `anim-slide-down`: Translation with fade.
  - `anim-dropdown-enter`: Quick dropdown reveal.
  - `modalExit`: Graceful exit transition before unmounting.
* **Duration Tokens**:
  - `--motion-fast`: 100ms
  - `--motion-default`: 160ms
  - `--motion-normal`: 320ms
  - `--motion-slow`: 220ms
  - `--motion-layout`: 420ms
  - `--motion-spring`: 240ms
* **Reduced Motion**: When `appearance.reduceMotion` is enabled, `.reduce-motion` class sets transition durations to 0s, eliminating animations for accessibility.

---

## 12. Responsive Layout Rules

* **Breakpoints (`src/design/breakpoints.ts`)**:
  - `<640px`: Narrow / minimal window (single-column cards, stacked controls).
  - `640px – 759px`: Compact view.
  - `760px – 899px`: Compact desktop (2-column toolkit grid, wrapped overview banner).
  - `900px – 1299px`: Standard desktop (2-column layouts).
  - `≥1300px`: Wide desktop (3-column toolkit grid).
* **Principles**:
  - Never compress cards below readable widths.
  - Controls wrap rather than clip (`flex-wrap: wrap`).
  - Text areas use `min-width: 0` for ellipsis containment.
  - Badges, status chips, and action buttons keep `flex-shrink: 0`.
  - Floating dock remains centered with safe scroller padding at the bottom.

---

## 13. Shared Design Components

The following components are the approved implementation standard:

| Component | File Path | Usage |
|---|---|---|
| `AppSelect` | `src/components/ui/AppSelect.tsx` | All dropdown selections |
| `Button` / `IconButton` | `src/components/ui.tsx` | Actions and icon triggers |
| `Toggle` | `src/components/ui.tsx` | Boolean settings |
| `Slider` | `src/components/ui.tsx` | Numeric range adjustments |
| `Input` / `Textarea` | `src/components/ui.tsx` | Text entry |
| `SettingsGroup` | `src/components/ui.tsx` | Settings card grouping |
| `SettingsRow` | `src/components/ui.tsx` | Label/control settings row |
| `Modal` / `Dialog` | `src/components/ui.tsx` | Modal workflows |
| `ToastHost` | `src/components/ui.tsx` | System notifications with actions |
| `PageHeader` | `src/components/ui.tsx` | Page title & instruction header |
| `Icon` | `src/components/Icon.tsx` | Vector iconography |
| `KeyCapture` | `src/components/KeyCapture.tsx` | Shortcut key recording |
| `TitleBar` | `src/components/TitleBar.tsx` | Windows titlebar & caption overlay |
| `TopBar` | `src/components/TopBar.tsx` | Pill navigation & breadcrumbs |
| `FloatingBottomDock` | `src/components/FloatingBottomDock.tsx` | Bottom horizontal navigation |
| `WindowsHistoryBar` | `src/components/WindowsHistoryBar.tsx` | Bottom history trail |
| `Sidebar` | `src/components/Sidebar.tsx` | Left vertical navigation |

---

## 14. Things Future Agents Must Not Reintroduce

1. **Do not restore the old `KeyFlow Deck v0.3` TopBar in horizontal navigation mode**: TopBar now hosts streamlined pill navigation (`←`, `→`, breadcrumbs, quick navigation).
2. **Do not reintroduce outer Settings page scrolling**: Scrolling on the Settings page must remain isolated to `.settings-nav` and `.settings-content`.
3. **Do not create one-off select dropdowns**: Always use `AppSelect`.
4. **Do not hardcode raw colors or font sizes**: Always use approved tokens from `src/design/tokens.css`.
5. **Do not create one-off CSS animation systems**: Use `src/lib/motion.ts` and `src/design/motion.css`.
6. **Do not create separate duplicate Clipboard backends**: There is only one clipboard engine in `electron/clipboard-engine.ts`.
7. **Do not reintroduce persistent visible Settings scrollbar gutters**: Settings scrollbars are subtle 5px overlay bars that remain 100% invisible when idle.
8. **Do not copy older changelog behavior over newer current implementations**: When changelog and current code differ, the code in this document takes precedence.

---

## 15. Verification Before UI Changes

Before making any UI change, follow this checklist:

1. **Inspect Current Implementation**: Locate the active component in `src/` or `electron/`.
2. **Check DESIGN_SYSTEM.md**: Verify token names, color palettes, and component rules.
3. **Check CURRENT_UI_STATE.md**: Understand how the component fits into the active architecture.
4. **Make Smallest Safe Change**: Avoid touching protected files or introducing one-off styles.
5. **Verify Responsive Layouts**: Check narrow (640px), standard (1020px), and wide (1400px) widths.
6. **Run Validation Commands**:
   ```bash
   npm run typecheck
   npm run design:check
   ```
7. **Update Documentation**:
   - Update `CURRENT_UI_STATE.md` if the implemented architecture materially changed.
   - Add a dated entry to `DESIGN_CHANGELOG.md` for meaningful design changes.
