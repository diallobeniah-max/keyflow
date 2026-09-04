# KeyFlow Responsive Rules

KeyFlow is a Windows desktop application, not a phone-first website. Responsive behaviour protects usability while preserving the desktop information architecture.

## Width ranges

| Range | Width | Intent |
|---|---:|---|
| Narrow window | 520px–759px | One-column desktop layout with drawer navigation and compact controls |
| Compact window | 760px–899px | Desktop layout with drawer sidebar and stacked forms |
| Standard desktop | 900px–1199px | Normal desktop layout; grids collapse selectively |
| Large desktop | 1200px–1439px | Two-column workspaces where content benefits from it |
| Wide desktop | 1440px and above | Full functional workspace with generous readable margins |

The canonical values are exposed in `src/design/breakpoints.ts` and `src/design/tokens.css`. Do not write device-specific rules.

## Window and shell

* Electron minimum window width is `--layout-min-window-width` (520px); minimum height is `--layout-min-window-height` (640px). Electron measures these values in device-independent pixels, so the physical width changes with Windows display scaling.
* The title bar remains full width at every range.
* Window controls stay in the no-drag region and never move beneath content.
* The app body owns the scroll area; the document itself remains fixed.

## Sidebar

* At 900px and above, the sidebar remains in the application flow at 248px or the documented 72px collapsed width.
* From 760px to 899px, the sidebar becomes a drawer opened by the hamburger control. A backdrop and Escape close it.
* From 520px to 759px, the same drawer behaviour remains in use; do not create a phone-specific navigation model.
* The drawer must trap focus only while open and return focus to the hamburger after closing.

## Content padding and widths

* Standard page padding is 24px horizontally and vertically.
* Narrow windows use 16px padding.
* Page headers preserve a 24px separation from the first section.
* Readable paragraphs use `--layout-readable-width`; functional grids may use the full available workspace.
* Do not create a separate max-width for every page.

## Grids and settings

* Large and wide desktop may use two-column dashboard, builder, visual-keyboard, and settings layouts.
* Standard desktop collapses layouts when a two-column arrangement would make controls too narrow.
* Compact and narrow ranges use one-column forms, filters, and cards.
* Settings rows retain label/description on the left and the control on the right when space permits; below 900px, controls may occupy the available row width.
* Form fields remain at least the shared 40px control height.
* At 760px and below, shared grids use one column even when the user has enabled compact mode. Page headers, cards, long descriptive text, and the optional floating dock must reflow within the shell rather than create a page-specific narrow layout.
* At 760px and below, Settings category navigation becomes a horizontally scrollable tab row and every setting row can place its control below its description. The physical keyboard board keeps recognisable key proportions inside its own horizontal scroll area; mouse controls stack beneath the diagram.

## Dropdowns and dialogs

* `AppSelect` measures the trigger against the Electron viewport and opens above when below-space is insufficient.
* Menus use internal scrolling rather than extending beyond the viewport.
* Dialogs are bounded by viewport width/height with 16px defensive inset.
* Dialog content scrolls inside the panel; actions remain reachable.

## Keyboard and mouse layouts

* Keyboard visualisation uses full-width proportional rows on standard and larger windows.
* At compact widths, keys keep their order and shrink to the approved defensive height; labels may truncate only where the key remains understandable.
* Mouse-button cards collapse below the keyboard when a side panel would be too narrow.
* Shortcut lists and action editors use full workspace width rather than forcing narrow readable columns.

## Text and actions

* Descriptions are bounded for scanning, but actions may wrap into multiple rows.
* Page header action buttons must never touch the first card or section.
* Long names truncate safely with an ellipsis in fixed controls and may wrap in cards.
* Do not hide essential status, profile, shortcut, or error information merely to preserve a single row.
