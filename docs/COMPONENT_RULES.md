# KeyFlow Component Rules

Shared renderer components are the implementation boundary for the design system. Pages should compose these components rather than create one-off visual variants. Runtime values come from `src/design/tokens.css`.

## Rules for all components

* Use approved tokens for colour, typography, spacing, radius, shadows, motion, and dimensions.
* Expose semantic HTML and accessible names.
* Keep normal component styling in CSS classes; do not use permanent inline style objects for ordinary visual treatment.
* A new variant must be documented here and in `docs/DESIGN_CHANGELOG.md` before use.
* Preserve editable-field event isolation so global keyboard shortcuts do not fire while typing.
* Preserve Electron title-bar and native-window behaviour.

## Component inventory

| Component | Responsibility | Required behaviour |
|---|---|---|
| `AppButton` | Primary, secondary, ghost, and danger actions | 40px/44px control geometry, clear disabled/focus states, meaningful label |
| `AppIconButton` | Compact icon-only action | Accessible `aria-label`/title, 32px/40px/44px token size, focus-visible state |
| `AppSelect` | Shared application dropdown | Combobox/listbox semantics, inset arrow, keyboard controls, viewport-safe portal, selected indicator |
| `AppInput` | Single-line input and search input | Label/description association, 40px/44px height, focus ring, shortcut isolation |
| `AppTextarea` | Multi-line text entry | Label/description association, resize policy, shortcut isolation |
| `AppSlider` | Numeric range control | Native range keyboard semantics, visible progress and thumb, labelled value |
| `AppToggle` | Boolean setting | Button semantics, `aria-pressed`, meaningful accessible label, disabled state |
| `AppCard` | Surface grouping related content | 16px radius, token padding, border, optional documented hover treatment |
| `AppDialog` | Modal workflow | Scrim, bounded panel, focus trap, Escape close, return focus |
| `AppTooltip` | Supplemental short help | Not the only source of meaning; keyboard/focus accessible where interactive |
| `AppTabs` | Switching among related views | Selected state is structural and announced, arrow-key pattern where appropriate |
| `AppBadge` | Compact status/category label | Short text, token colours, never communicates status through colour alone |
| `AppSearchField` | Search/filter entry | Search label, clear affordance where needed, shortcut isolation |
| `AppSettingRow` | Settings label/description/control row | Consistent 64px minimum row, 16px/12px token padding, control alignment |
| `PageHeader` | Main page introduction | Title, purpose description, usage instruction, optional primary/secondary actions |
| `SectionHeader` | Card or section heading | Section title and optional icon/action with consistent 24px rhythm |
| `FormField` | Label, control, hint, and error grouping | Explicit associations and stable error placement |
| `KeyboardKey` | Keyboard visualisation keycap | Approved key dimensions/radius, selected/assigned indicator and text label |
| `MouseButtonCard` | Mouse shortcut target | Full-card interaction, clear name/status, keyboard-accessible button semantics |

The current codebase still has compatibility exports in `src/components/ui.tsx` (`Button`, `IconButton`, `Select`, `Input`, `Textarea`, `Slider`, `Toggle`, `Card`, `PageIntro`, and `Modal`). These exports may be migrated incrementally to the named `App*` components, but they must not grow competing styling rules.

## AppSelect standard

`src/components/ui/AppSelect.tsx` is the only shared custom select implementation.

### Trigger

* Default height: 40px; large height: 44px
* 12px radius, 12px horizontal inset, 14px body text
* 1px default border and elevated surface background
* Full trigger is clickable
* 16px arrow, inset 12px from the right, vertically centred
* Text reserves arrow space and truncates with an ellipsis
* Hover uses hover surface; open/focus-visible uses accent border and a 3px accent-soft ring
* Disabled, read-only, and error states are explicit

### Menu and options

* Menu is portalled to `document.body` to avoid clipping by cards/containers.
* Width is at least the trigger width and normally equals it.
* Placement is calculated against the Electron viewport; it can open above when below space is insufficient.
* Maximum height is tokenised and internally scrollable.
* Menu uses 8px padding, 12px radius, default border, and popup shadow.
* Options are at least 36px high with 12px horizontal padding and 8px radius.
* Hover/active/selected states have both surface and structural feedback.
* Selected options show a check indicator; disabled options are disabled in semantics and appearance.

### Keyboard and focus

* Arrow Down/Arrow Up opens the menu and moves through enabled options.
* Enter or Space opens/selects; Escape closes and restores trigger focus.
* Home and End move to the first/last enabled option.
* Tab closes without trapping focus.
* Clicking outside closes.
* The trigger exposes `role="combobox"`, `aria-expanded`, `aria-controls`, and `aria-activedescendant`; the popup exposes `role="listbox"` and options expose `role="option"` with `aria-selected`.

Searchable dropdowns must keep their search input mounted while typing, prevent global shortcut activation, and document whether Escape clears the query first or closes the menu.

## PageHeader standard

Every main page will eventually use a shared `PageHeader` with:

* Page title
* Short purpose description
* Short usage instruction
* Optional primary action
* Optional secondary action

Approved purpose descriptions:

* Dashboard — “See your active profile, recent triggers, system status, and shortcuts that need attention.”
* Shortcuts — “Create, search, test, enable, disable, and manage all keyboard and mouse shortcuts.”
* Create Shortcut — “Choose a key or mouse button, select a trigger pattern, add actions, test it, and save.”
* Visual Keyboard — “Select a keyboard key or mouse button to see its assignments or create a new shortcut.”
* Action Library — “Save reusable actions, text snippets, websites, scripts, and automation steps.”
* Profiles — “Create shortcut collections for different activities and switch them manually or by active application.”
* Settings — “Control KeyFlow’s behaviour, appearance, safety, profiles, popup menus, local data, and diagnostics.”

## Global popup overlay

The global popup is a single reusable always-on-top window rendered above the active application, not an in-page panel.

* It toggles: the first activation shows it and the next deliberate activation of the same shortcut hides it.
* It closes via Escape and via the header **X** button (accessible name `Close popup`, tooltip `Close`, min hit area 32×32px, hover and focus-visible states). X and Escape must update the same visibility state.
* The window resizes to its actual content through the safe `popup.reportContentSize(width, height)` bridge; the main process validates and clamps the numbers before resizing and repositioning.
* Width uses the `--popup-width` token (~460px, clamped between `--popup-min-width` 420px and `--popup-max-width` 500px); height is clamped between `--popup-min-height` (180px) and `--popup-max-height` (560px), never exceeding the current display work area.
* The surface uses the approved blur tokens (`--popup-backdrop-blur`, `--popup-backdrop-saturate`, `--popup-surface`, `--popup-surface-border`) and `--shadow-popup`.
* Items are `--popup-item-height` (60px) tall with an icon, title, category, and right-aligned shortcut hint. The action list scrolls internally after `--popup-list-max-height`.
* The header keeps the KeyFlow logo and label with the X button aligned right; the header and search field stay visible while only the list scrolls.

## Layout rhythm

* PageHeader to first section: 24px
* Major section gap: 24px
* Card gap: 16px
* Form-field gap: 16px
* Closely related controls: 8px

Section cards must not touch page header action buttons. Functional workspaces may use the full available width; readable descriptions should remain bounded.
