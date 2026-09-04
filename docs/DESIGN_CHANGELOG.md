# Design Changelog

## 2026-09-04 — Navigation Transitions, Layout Width Fluid Morphs, and Scroll-Only Auto-Hiding Scrollbar

* **Fluid Vertical Sidebar ↔ Floating Dock Transitions**:
  - Maintained [FloatingBottomDock.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/FloatingBottomDock.tsx) continuously mounted in DOM, applying `.is-layout-hidden` and `aria-hidden` when inactive instead of abrupt unmounting.
  - Sidebar smoothly collapses its width, flexBasis, padding, opacity, and slides to the left (`translateX(-32px)`) over `380ms cubic-bezier(0.16, 1, 0.3, 1)`.
  - Floating bottom dock and blur scrim simultaneously float upwards from `translate(-50%, 36px) scale(0.95)` to `translate(-50%, 0) scale(1)` with synchronized opacity transitions.
* **Calm & Tactile Settings Layout Width Transitions (Small vs. Large)**:
  - Added approved design system tokens `--motion-normal: 320ms cubic-bezier(0.16, 1, 0.3, 1)` and `--motion-layout: 420ms cubic-bezier(0.16, 1, 0.3, 1)`.
  - When switching between "Small (Focused)" and "Large (Spacious)", `.settings-view-container`, `.settings-search-wrapper`, `.settings-layout`, `.settings-nav`, `.settings-content`, and `.settings-nav-summary` fluidly morph over `420ms cubic-bezier(0.16, 1, 0.3, 1)` instead of snapping instantly.
  - Option cards feature tactile tap press response (`scale(0.975)`), checkmark badge pop keyframe, and preview wireframe window hover elevation (`scale(1.025)`).
* **Auto-Hiding Scrollbar Revealed Exclusively During Active Scrolling**:
  - Implemented a passive capturing global scroll activity listener in [App.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/App.tsx) that applies `.is-scrolling` to document root while physical scrolling is occurring.
  - Removed all `*:hover` scrollbar triggers; scrollbars remain 100% transparent and invisible when hovering over app panels, search dropdowns, or content areas.
  - 4px capsule thumb smoothly fades in (`400ms cubic-bezier(0.16, 1, 0.3, 1)`) only during scroll events and smoothly fades away 900ms after scrolling stops.

## 2026-09-04 — Collapsible Navigation Rail, Presentation Mode Card Fix, and Compact Ctrl+K Polish

* **Collapsible Navigation Rail (Windows Settings ≡ Pattern)**:
  - Added a hamburger menu toggle button (`≡`) at the top of [SettingsSidebar.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/pages/settings/SettingsSidebar.tsx) with accessible state and tooltip ("Close Navigation" / "Open Navigation").
  - Clicking minimizes the navigation panel into a sleek 58px icon rail showing only the centered, colorful squircle category pods with hover tooltips (`title`).
  - Persisted in user settings via `appearance.sidebarCollapsed`.
  - Content panel automatically expands to use the freed width (`max-width: 1180px`), completely eliminating crowded layouts.
* **Fixed Command Palette Presentation Mode Card Cutoff**:
  - In [CommandPalettePage.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/pages/settings/CommandPalettePage.tsx), configured `row-cp-window-mode` to use `layout="stack"` so the cards sit cleanly beneath the title and description.
  - Updated `.window-mode-cards` and `.window-mode-card` in [src/index.css](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/index.css) to support flexible wrapping (`flex: 1 1 140px; max-width: 220px;`) so both Compact and Expanded cards fit side by side with zero clipping.
* **Command Palette (Ctrl+K) Compact Mode Polish**:
  - Re-proportioned `.command-palette.is-compact` from an oversized 720px box down to a sleek, focused launcher (`width: min(580px, calc(100vw - var(--space-6)))`).
  - Refined header padding and search input height (`42px`).
  - Smoothly expands downwards with full search results and keycaps when query is entered (`.has-query`), with max-height adapting dynamically to screen height.
  - Added `@media (max-width: 640px)` responsive scaling so it never overflows narrow viewports.

* **Auto-Hiding Sleek 4px Scrollbars**:
  - Replaced the thick 10px persistent scrollbars with ultra-thin (4px) auto-hiding scrollbars.
  - Transparent thumb and track by default; smoothly transitions to `--color-border-strong` capsule on container hover or focus-within.
* **Settings Sidebar Vertical Divider Line**:
  - Added a clean 1px vertical hairline divider (`border-right: 1px solid var(--color-border-subtle)`) and padding to `.settings-nav`, visually separating the category list from the detail content panel.
* **Settings Search Bar Width Auto-Adjustment & Animation**:
  - Linked `.settings-search-wrapper` to the active `settingsWidth` mode (`1040px` in Small vs. `1280px` in Large).
  - Added smooth bezier transition animations (`cubic-bezier(0.16, 1, 0.3, 1)`) so the search bar fluidly resizes alongside the settings rail and detail cards.
* **Layout Width Wireframe Visual Contrast**:
  - Tuned the wireframe preview window inside the Small (Focused) card in [AppearancePage.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/pages/settings/AppearancePage.tsx) to `width: 66%; height: 54px;` vs. `width: 96%; height: 68px;` for Large (Spacious), making the size difference immediately obvious at a glance.
* **Default Application Window Size (1020 × 700)**:
  - Updated default Electron launch window dimensions in [electron/main.ts](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/electron/main.ts) to `1020 × 700` while preserving user resizing, bounds persistence, and minimum dimensions.
* **TopBar De-duplication**:
  - Removed duplicate `/<PageTitle>` breadcrumb text from [TopBar.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/TopBar.tsx), keeping the top chrome minimal and focused.
* **Inline Compact Page Headers**:
  - Updated [PageHeader.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/ui/PageHeader.tsx) and [ui.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/ui.tsx) (`PageIntro`) to render title and descriptions inline inside a sleek capsule pill (`.page-header__description-box`), reducing header vertical footprint from ~160px down to ~40px.

## 2026-09-04 — TitleBar, TopBar, Dock Play/Pause, and Centered Layout Polish

* **TitleBar Branding & Truncation Cleanup**:
  - Removed the truncated `D...` profile badge from [TitleBar.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/TitleBar.tsx); the active profile is already prominently switchable in the toolbar.
  - Sized the KeyFlow titlebar logo proportionally to `20px × 20px`, removed the solid background box, and applied `object-fit: contain`.
* **TopBar De-cluttering**:
  - Removed the `"Run Electron Application"` / `"KeyFlow"` foreground process chip from [TopBar.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/TopBar.tsx).
  - Removed the persistent green `● Active` status badge from normal operation; the status pill only renders when emergency pause or Safe Mode is engaged.
* **Floating Dock Play/Pause Contrast & Dark Mode Colors**:
  - Upgraded the left circular dock button in [FloatingBottomDock.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/components/FloatingBottomDock.tsx) with explicit Phosphor `<Pause />` and `<Play />` vector icons.
  - Styled with proper contrast for both dark and light modes:
    - Running: Translucent acrylic surface (`--dock-surface`) with muted secondary icon and accent hover.
    - Paused: Ambient glowing amber tint (`--color-warning-soft`), vibrant amber play icon (`--color-warning`), and golden border highlight.
* **Centered Settings Width Layout**:
  - Wrapped Settings in `.settings-view-container` with automatic centering (`margin: 0 auto;`).
  - Added `justify-content: center;` to `.settings-layout`, ensuring the navigation rail and settings detail cards are centered symmetrically on widescreen displays rather than hugging the left edge.

* **Settings Layout Width Control (`settingsWidth`)**:
  - Added a dedicated preference in [AppearancePage.tsx](file:///e:/New%20folder/Coding/New%20folder%20(3)/keyflow/src/pages/settings/AppearancePage.tsx) (`row-app-settings-width`) allowing users to choose between two distinct Settings widths:
    1. **Small (Focused)**: Compact 220px navigation rail with a focused 780px content column, matching classic desktop preferences.
    2. **Large (Spacious)**: Spacious 284px navigation rail with live category status badges and expanded 1000px content view.
  - Interactive selection cards with animated wireframe illustrations, checkmark badges, and full keyboard/screen-reader accessibility (`role="radiogroup"`).
* **Eliminated Label Truncations in Navigation Sidebar**:
  - In Small mode, `.settings-nav-summary` smoothly collapses (`opacity: 0; max-width: 0; transform: translateX(8px);`), granting 100% of horizontal row width to category labels.
  - In Large mode, `.settings-nav-summary` smoothly expands (`max-width: 130px; opacity: 0.85; transform: translateX(0);`) alongside the category chevron.
  - Removed legacy CSS overrides that were hardcoding the sidebar width to 200px and clobbering text into ellipses.
  - Added native hover `title` tooltips on all category navigation items.
* **Fluid Real-Time CSS Animations**:
  - Animated transitions on `.settings-layout`, `.settings-nav`, `.settings-content`, and `.settings-nav-summary` using `cubic-bezier(0.16, 1, 0.3, 1)` easing.
  - Toggling between Small and Large instantly morphs the sidebar and content boundaries without layout reflow glitches.

## 2026-09-03 — Complete Apple-Style Settings Architecture & Modular Detail Views

* **Apple-Style Information Architecture (6 Clear Groups, 15 Single-Responsibility Detail Pages)**:
  - Completely decomposed the monolithic `Settings.tsx` into 15 modular, dedicated detail pages under `src/pages/settings/`:
    1. **APP**:
       - *App Behavior* (`appBehavior`, alias: `general`): Windows startup, start minimized, minimize to tray, close to tray, show tray icon, default profile.
       - *Notifications* (`notifications`): Desktop notifications, Notification sounds.
    2. **INPUT**:
       - *Keyboard & Gestures* (`keyboard`, alias: `shortcuts`): Alt+CapsLock native bypass, double-tap threshold, hold threshold, key repeat protection, Hyper Key modifier, typing burst protection.
       - *Command Palette* (`commandPalette`): General activation, presentation window mode, search results count, details panel depth (Ctrl+Enter), test button.
    3. **NAVIGATION & CONTROL**:
       - *WASD Navigation* (`wasd`): Status & activation, movement speed & acceleration, pointer actions, HUD feedback, and custom cursor upload gallery.
       - *Hot Corners* (`hotCorners`): Master toggle, trigger chime, activation area slider, trigger cooldown, corner action matrix, multi-monitor support, and interactive layout presets.
       - *Always on Top* (`alwaysOnTop`): Default pin mode, DWM border highlight, color presets, border width, and audio feedback.
    4. **INTERFACE**:
       - *Appearance* (`appearance`): Theme mode, accent swatch picker, header tint & fit, layout architecture (Vertical Sidebar vs Floating Dock), UI scale, font scale, compact mode, backdrop material, and accessibility.
       - *Screen Tint* (`screenTint`): Fullscreen blue-light filter status, warmth presets, custom color picker, strength slider, schedule mode, and transition timing.
       - *App Icon* (`appIcon`): 3D visual icon showcase (Obsidian Noir, Cobalt Surge, Emerald Matrix, Crimson Velocity), and accent color synchronization.
       - *Popup Menu* (`popup`): Spawn position, search toggle, action icons, numeric badges, close after action, and close on blur.
    5. **SYSTEM**:
       - *Privacy & Safety* (`privacy`): Credential input privacy, global pause shortcut (`row-sc-pause`), emergency safe mode shortcut (`row-sc-emergency`), manual safe mode toggle, and application exclusions blacklist.
       - *Backup & Restore* (`backup`, alias: `data`): JSON configuration export/import, automated backup frequency and directory, manual backup trigger, and visually isolated Danger Zone with factory reset confirmation modal.
       - *Advanced* (`advanced`): Rust Native Helper vs Legacy hook mode, extended administrator access (High integrity), performance mode, and diagnostic logs.
    6. **INFORMATION**:
       - *About KeyFlow* (`about`): Polished software specifications, runtime versions (Electron, Chromium, Node, V8), and documentation/release links.
* **Apple-Style Navigation Sidebar**:
  - Grouped categories with uppercase headings, squircle icon pods with vibrant category tinting, row titles, trailing summary readouts (e.g. "Startup on", "Caps bypass on", "4 corners", "Dark"), and disclosure chevrons.
  - Fully responsive: 2-column sidebar layout on desktop (>760px); mobile/compact drill-down navigation with `< Settings` Back button on narrow screens.
  - Smooth deep-linking and highlight animation from Command Palette (`Ctrl+K`) and settings search across all 15 pages.
* **Zero Persistence Breaking Changes**:
  - Maintained all existing store keys in `useStore.ts` and electron IPC handlers.
  - Added backward-compatible route resolver (`resolveSettingsSectionId`) for legacy routes (`"general"` -> `"appBehavior"`, `"shortcuts"` -> `"keyboard"`, `"data"` -> `"backup"`).

* **Prominent Alt+CapsLock Bypass Placement**:
  - Placed a dedicated **Special Keys & CapsLock Behavior** card right at the very top of **Shortcuts & Gestures**, with a prominent iOS-style toggle for **Alt + CapsLock native bypass**.
  - Indexed in `SETTINGS_INDEX` with comprehensive keywords (`caps`, `capslock`, `alt`, `bypass`, `native`, `screenshot`, `uppercase`) so searching `caps` in `Ctrl+K` immediately displays the toggle.
* **Simplified Settings Architecture (4 Clear Groups)**:
  - Reorganized the 14 scattered settings tabs into 4 distinct, organized navigation groups with clean category headers:
    1. **Core & Input**: General, Shortcuts & Gestures, Command Palette.
    2. **Navigation & Tools**: WASD Navigation, Hot Corners, Always on Top, Screen Tint.
    3. **Appearance & Interface**: Appearance & Themes, App Icon, Popup Menu.
    4. **System & Safety**: Privacy & Safety, Data & Backup, Advanced, About.
* **iOS-Style Color-Coded Cards & Categories Toggle**:
  - Added an ON/OFF preference: **"Color-coded settings cards"** (`colorCodedSettings`) under Appearance & Themes and searchable settings index.
  - When enabled, every settings category and card features vibrant iOS-style rounded icon squircles (Blue, Cyan, Green, Amber, Purple, Yellow, Rose, Indigo, Pink, Slate) for instant visual recognition.
  - When disabled, reverts to a calm minimalist monochrome theme.

## 2026-09-03 — Redesigned Bottom Dock Previews, Typo-Tolerant Search & Details Depth Settings

* **Redesigned Bottom Dock Hover Previews**:
  - Replaced clumsy raw text and wrapping pills with modern, polished acrylic preview HUD cards.
  - Added dedicated icon pods (`.dock-preview-icon-box`), clean category subtitle pills, 2-stage visual pipeline cards for Shortcut Creation, structured 2-column stat grids for Overview, and crisp keycap previews for Shortcuts.
  - Redesigned preview footers into structured action strips with navigation cues and keyboard shortcut badges (`↵` / `Ctrl+K`).
* **Typo-Tolerant & Prefix-Predictive Command Palette Search**:
  - Upgraded `searchCommands` in `src/lib/command-registry.ts` with prefix prediction, acronym matching (`cp` for Command Palette, `km` for Keyboard Map), and multi-word fuzzy distance so spelling mistakes and partial inputs immediately resolve to the intended action.
* **Command Palette Details Panel Depth & Toggle Options**:
  - Added `commandPaletteSideViewEnabled` to optionally toggle Ctrl+Enter side view on or off.
  - Added `commandPaletteDetailLevel` ("Detailed" for interactive switches, theme toggles, and direct setting controls vs. "Compact" for lightweight summaries).

## 2026-09-03 — Alt+CapsLock Native Bypass & Centered Dock Create Button

* **Alt + CapsLock Native Bypass**:
  - Added a dedicated setting (`altCapsLockBypass`, enabled by default) in Settings under *Shortcuts & Gestures* and the searchable settings index.
  - When enabled, holding Left or Right Alt (including when Right Alt is bound to Hyper Key) and tapping CapsLock bypasses shortcut interception and natively toggles Windows CapsLock on/off directly.
  - Normal CapsLock presses without Alt continue to trigger user shortcuts (e.g. Screenshot) without interference.
* **Floating Bottom Dock & Popups Cleanup**:
  - Centered the **Create (+)** button in the middle of the dock bar with prominent accent styling (`.floating-dock-tab.is-create`).
  - Removed all blue count pills/badges (`dock-preview-badge`, such as `5 PROFILES`, `3 Active`, etc.) from the hover popups for a clean, distraction-free appearance.
  - Removed all blue circular number badges from the dock tabs.

## 2026-09-03 — Polished WASD HUD & Command Palette "Show More" Settings Controls

* **WASD Status HUD**: Redesigned the transient WASD feedback popup into a modern floating HUD badge with vector directional/keyboard iconography, active/normal status pill, smooth pop animation, and unclipped ambient glow/shadows with proper transparent window margins.
* **Command Palette "Show More" (Ctrl+Enter)**:
  - Updated the hint bar action from "side view" to "show more" / "hide details" with tooltip instructions.
  - Added interactive setting controls directly within the side view inspector so users can flip toggles and adjust preferences immediately from search without navigating away.
  - Added an "Always show details panel" preference (`commandPaletteDefaultShowMore`) in Command Palette settings and the searchable settings index.

## 2026-09-03 — Bottom dock blur backdrop scrim

* Added a frosted backdrop blur scrim (`.floating-bottom-dock-scrim`) behind the persistent floating bottom navigation dock.
* Introduced `--dock-scrim-bg` and `--dock-scrim-blur` tokens for dark mode, light mode, and Windows 11 backdrop materials (Mica and Acrylic).
* Uses gradient-masked acrylic backdrop-filter so content scrolling into the bottom bar area softly blurs out without obstructing click-through interaction.

## 2026-09-02 — Optional WASD status card

* Added a WASD Navigation preference for the transient status card; it is off by default and does not affect cursor routing or keyboard mapping.
* Restyled the optional card to derive its accent from the user's chosen appearance color and its surface/text contrast from the Windows color mode.

## 2026-09-01 — Localized bottom-dock acrylic

* Added documented dock acrylic tokens for a restrained, premium blur treatment behind the persistent bottom navigation only.
* Updated the dock pill and its circular actions to use the shared translucent surface with a solid-surface fallback where backdrop filtering is unavailable.

## 2026-08-31 — Integrated native Windows caption controls

* Restored KeyFlow's own title bar, including its profile/status text and drag region.
* Moved minimize, maximize, and close to Electron's native Windows control overlay, preserving the Windows 11 Snap Layout hover menu on the real maximize button.
* Added `--layout-window-controls-width` so title-bar text always leaves room for the native controls, including compact windows.
* Reduced the native minimum width from 760px to 520 device-independent pixels. This avoids a 760px limit becoming approximately 1140 physical pixels on a 150% Windows display, while retaining the documented narrow one-column layout.
* Added shared narrow-window shell rules so compact preferences cannot force multi-column cards at 760px and below. Headers, utility cards, long descriptions, and the optional floating dock now reflow at the minimum window width without page-specific alternatives.
* Made the Visual Keyboard and Settings pages compact-safe: the physical board scrolls within its card, mouse targets stack with a readable list, and Settings categories collapse into a horizontal tab row with wrapping control rows.
* The renderer now follows Windows system theme changes live, keeps the native caption overlay in the same resolved theme, and uses the selected app-icon artwork in its own title bar. Theme selection is available only in Appearance settings.

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
