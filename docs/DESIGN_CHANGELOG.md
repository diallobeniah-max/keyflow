# Design Changelog

## 2026-08-12 — Popup drag handle, reopen reliability, Escape fix

* Added `.popup-drag-region` class (`-webkit-app-region: drag`) applied to the popup header strip. Enables native Electron drag without a custom JS mouse engine.
* Added `.popup-drag-handle` pseudo-element grip indicator (two subtle horizontal bars using `--color-border-strong`, `--radius-pill`). Opacity 0.45, brightens on hover to 0.8.
* Applied `-webkit-app-region: no-drag` to `.popup-close`, `.popup-search`, `.popup-list`, and `.popup-item` so interactive controls remain clickable inside the drag region.
* Removed `blur` auto-close from `PopupWindowManager`. Popup now closes only via FF shortcut, X button, Escape (when phase is open/opening), or action execution.
* Added generation guard to the `closeFlow()` fallback timer: captures `closeGenId` at close start; the timer callback bails if the current generation has changed (popup was reopened before the timer fired).
* `popup-position.ts`: added `isPositionOnScreen(point, size, displays)` utility that checks whether the popup's drag bar is visible on at least one active display work area.
* `popup-window.ts`: listens to `win.on("moved")` to record `lastPosition` after user drag. On next open, `finalizeAndShow()` uses `lastPosition` if on-screen; otherwise clamps it to the nearest work area.
* `PopupShell.tsx`: Escape keydown listener now guards on `phaseRef.current` — only consumes Escape when phase is `"open"` or `"opening"`. When hidden/closing, Escape passes through to Windows (snipping overlay, etc.).



* Narrowed the global popup to `--popup-width` 460px (min 420px / max 500px) and added open/close animation tokens (`--popup-open-duration`, `--popup-close-duration`, `--popup-motion-open`, `--popup-motion-close`) plus `--popup-inset-safety` and `--popup-shadow-fallback`.
* Popup now uses Windows native acrylic (`backgroundMaterial`) with a readable tinted fallback; the window is sized to content, only the inner panel animates, and the close lifecycle freezes the BrowserWindow dimensions.
* Added automatic shortcut timing (fast defaults) with a Custom/Advanced option; letter-key fast-typing warning added to conflict detection.

New typography, colour, spacing, radius, or component variants must add an entry here before use.

## 2026-08-05 — Global popup overlay polish and suppression ground-work

* Added approved popup tokens to `src/design/tokens.css`: `--popup-backdrop-blur` (28px), `--popup-backdrop-saturate` (1.25), `--popup-surface-opacity` (0.9), `--popup-surface`, `--popup-surface-border`, `--popup-item-height` (60px), and the sizing bounds `--popup-min-width` / `--popup-max-width` / `--popup-min-height` / `--popup-max-height`.
* The global popup now uses a strong blurred acrylic-style surface (CSS blur fallback), a header **X** close button, and content-driven dynamic sizing via the safe `popup.reportContentSize` bridge.
* Documented the popup overlay contract in `docs/DESIGN_SYSTEM.md` and `docs/COMPONENT_RULES.md`.

New typography, colour, spacing, radius, or component variants must add an entry here before use.

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

New typography, colour, spacing, radius, or component variants must add an entry here before use.
