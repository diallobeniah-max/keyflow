# KeyFlow Design System

**Status:** Permanent renderer foundation<br>
**Runtime source of truth:** `src/design/tokens.css`<br>
**Scope:** KeyFlow's Windows desktop renderer and shared UI components

## Purpose and personality

KeyFlow is a local-first Windows productivity tool for precise keyboard and mouse automation. Its interface should feel:

* Premium without being ornamental
* Calm, focused, and easy to scan
* Precise and dependable
* Professional and modern
* Native to Windows rather than a generic AI dashboard
* Consistent across settings, builders, lists, and popup workflows

Use one cloud-blue accent family. Avoid purple/cyan AI styling, decorative gradients, excessive glass effects, and rounded corners on every element. Surfaces should be solid and layered through restrained borders and shadows.

## Source of truth

All approved runtime values live in `src/design/tokens.css`. Component CSS must consume tokens rather than repeat visual values. TypeScript files in `src/design/` expose names and breakpoint references; they do not replace the CSS tokens.

Import order is mandatory:

```tsx
import "./design/tokens.css";
import "./index.css";
```

`tokens.css` must load first. `index.css` contains structural and component rules only and must not define a competing `:root` palette or `[data-theme="light"]` palette.

## Typography

Font stack:

```text
"Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif
```

Inter is optional. `Segoe UI Variable` and `Segoe UI` are the dependable Windows fallbacks.

| Role | Size | Line height | Weight | Token references |
|---|---:|---:|---:|---|
| Display | 32px | 40px | 700 | `--type-display-*` |
| Page title | 26px | 34px | 700 | `--type-page-*` |
| Section title | 19px | 26px | 600 | `--type-section-*` |
| Card title | 16px | 22px | 600 | `--type-card-*` |
| Body large | 16px | 24px | 400 | `--type-body-large-*` |
| Body | 14px | 21px | 400 | `--type-body-*` |
| Body strong | 14px | 21px | 600 | `--type-body-strong-*` |
| Small | 13px | 18px | 400 | `--type-small-*` |
| Caption | 12px | 16px | 500 | `--type-caption-*` |
| Button | 14px | 20px | 600 | `--type-button-*` |

Do not add 15px, 17px, 18.5px, 23px, 29px, or another arbitrary typography value. A new type role requires a token update, documentation update, and an entry in `docs/DESIGN_CHANGELOG.md`.

## Colour system

### Dark theme

| Purpose | Value | Token |
|---|---|---|
| App background | `#0B0F17` | `--color-bg-app` |
| Sidebar background | `#0E131D` | `--color-bg-sidebar` |
| Surface | `#121925` | `--color-bg-surface` |
| Elevated surface | `#17202E` | `--color-bg-surface-elevated` |
| Hover surface | `#1B2636` | `--color-bg-hover` |
| Selected surface | `#1E2E48` | `--color-bg-selected` |
| Subtle border | `#202B3B` | `--color-border-subtle` |
| Default border | `#2B384B` | `--color-border-default` |
| Strong border | `#3A4A61` | `--color-border-strong` |
| Primary text | `#F5F7FA` | `--color-text-primary` |
| Secondary text | `#B2BDCC` | `--color-text-secondary` |
| Muted text | `#778397` | `--color-text-muted` |
| Disabled text | `#566174` | `--color-text-disabled` |
| Accent | `#4F7CFF` | `--color-accent` |
| Accent hover | `#6A91FF` | `--color-accent-hover` |
| Accent pressed | `#3F68DF` | `--color-accent-pressed` |
| Accent soft | `rgba(79, 124, 255, 0.14)` | `--color-accent-soft` |
| Accent border | `rgba(79, 124, 255, 0.45)` | `--color-accent-border` |
| Success | `#34C78A` | `--color-success` |
| Warning | `#E7A63A` | `--color-warning` |
| Danger | `#E65B65` | `--color-danger` |
| Info | `#4F7CFF` | `--color-info` |

### Light theme

| Purpose | Value | Token |
|---|---|---|
| App background | `#F4F7FB` | `--color-bg-app` |
| Sidebar background | `#FFFFFF` | `--color-bg-sidebar` |
| Surface | `#FFFFFF` | `--color-bg-surface` |
| Elevated surface | `#F8FAFD` | `--color-bg-surface-elevated` |
| Hover surface | `#EEF3F9` | `--color-bg-hover` |
| Selected surface | `#E7EEFF` | `--color-bg-selected` |
| Subtle border | `#E5EAF1` | `--color-border-subtle` |
| Default border | `#D7DEE8` | `--color-border-default` |
| Strong border | `#C2CBD8` | `--color-border-strong` |
| Primary text | `#18202C` | `--color-text-primary` |
| Secondary text | `#4F5C6D` | `--color-text-secondary` |
| Muted text | `#7B8797` | `--color-text-muted` |
| Disabled text | `#A0A8B3` | `--color-text-disabled` |
| Accent | `#416FE8` | `--color-accent` |
| Accent hover | `#315FD6` | `--color-accent-hover` |
| Accent pressed | `#294FB8` | `--color-accent-pressed` |
| Accent soft | `rgba(65, 111, 232, 0.12)` | `--color-accent-soft` |
| Accent border | `rgba(65, 111, 232, 0.38)` | `--color-accent-border` |

Success, warning, danger, and info are semantic colours only. Do not add another decorative accent or a random gradient. The `accent` setting remains a compatibility input, but normal UI uses the approved cloud-blue token family.

## Spacing and shape

Approved spacing is `0px`, `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `40px`, `48px`, and `64px`, exposed as `--space-*` tokens. Approved radii are `6px`, `8px`, `12px`, `16px`, `20px`, and `999px` for genuine pills only.

* Keycaps and compact tags: 6px or 8px
* Buttons, inputs, and dropdowns: 12px through the control radius token
* Cards: 16px
* Dialogs: 20px
* Pills: 999px only when the control is genuinely pill-shaped

## Surfaces, borders, and elevation

Use `--color-bg-surface` for cards and normal controls, `--color-bg-surface-elevated` for menus and fields, and `--color-bg-hover` for hover feedback. Use the default border for normal separation and the strong border only for emphasis. Shadows are `--shadow-sm`, `--shadow-md`, and `--shadow-popup`; avoid glow-heavy effects.

## Component contracts

### Buttons and icon buttons

Buttons use 40px or 44px approved control heights, 12px radius, 14px button typography, and visible disabled/focus states. Primary buttons use the cloud-blue accent. Icon-only buttons require an accessible label and use 32px, 40px, or 44px dimensions.

### Inputs and search fields

Inputs use 40px or 44px height, 12px horizontal padding, 12px radius, the elevated surface, and a 3px accent-soft focus ring. Search fields preserve an inset search icon while leaving text room.

### Dropdowns

Normal application dropdowns use `AppSelect`. The complete contract is in `docs/COMPONENT_RULES.md`; the approved proof migrations are the Sidebar active-profile selector and the Settings Theme field. Raw HTML `select` controls are not permitted on application pages unless a documented platform or accessibility reason exists.

### Sliders and toggles

Sliders use an accent progress track, a visible high-contrast thumb, and keyboard-operable native range semantics. Toggles are 44px by 26px, pill-shaped because the control is inherently a switch, and must expose `aria-pressed` plus a meaningful label.

### Cards, dialogs, tooltips, tabs, and badges

Cards use 16px radius, 16px or 20px padding, subtle borders, and restrained shadows. Dialogs use 20px radius, a scrim, a bounded viewport-sized panel, and focus management. Tooltips are short, non-essential labels and must not be the only source of meaning. Tabs use a clear selected indicator; badges are compact status labels, not decorative pills.

### Sidebar, top bar, and title bar

The sidebar is 248px wide or 72px collapsed. The top bar is 60px high. The Electron title bar is 52px high, preserves `-webkit-app-region: drag` only on non-interactive space, and keeps window buttons in a no-drag region. Never remove or obstruct title-bar controls.

### Page layout

Page padding is 24px on standard desktop. The PageHeader/PageIntro-to-first-section gap is 24px; major section gap is 24px; card gap is 16px; form-field gap is 16px; closely related controls use 8px. Content may use the full workspace width for functional grids, while readable paragraphs use `--layout-readable-width`.

### Keyboard keys, mouse cards, popups, and states

Keyboard keys use the key height/minimum width tokens and 6px or 8px radius. Mouse-button cards use the card surface and 12px radius. Popup menus are bounded by the viewport, use the popup shadow and 20px radius, and maintain clear active/selected states.

### Global popup overlay

The global overlay is a dedicated always-on-top window shown above the active application. It uses a strong blurred acrylic-style surface, not clear transparency:

* `--popup-backdrop-blur` (28px) and `--popup-backdrop-saturate` (1.25) drive the CSS blur fallback; on Windows 11 the window uses the native acrylic material.
* `--popup-surface-opacity` (0.9), `--popup-surface`, and `--popup-surface-border` keep the panel readable in dark and light themes.
* `--popup-item-height` is 60px per row; six rows (`--popup-list-max-height`) scroll before more appear.
* Popup width is `--popup-width` (460px) clamped between `--popup-min-width` (420px) and `--popup-max-width` (500px); height is clamped between `--popup-min-height` (180px) and `--popup-max-height` (560px).
* The fallback surface shadow is `--popup-shadow-fallback`; open/close use `--popup-open-duration`/`--popup-close-duration` and the approved motion curves.

No random colours: the surface is derived from the approved elevated-surface and accent tokens.

Empty, loading, error, success, warning, and disabled states must include text or structural cues in addition to colour. Loading states should be calm and avoid unnecessary movement. Errors appear close to the field or action that caused them.

## Motion and themes

Default motion is 120ms for small feedback, 160ms for normal transitions, and 240ms for larger transitions. Reduced Motion disables meaningful animation and smooth scrolling while retaining state changes and focus visibility.

Dark and light themes keep the same hierarchy and component geometry. Only token values change. Do not create separate component implementations for themes.

## Page descriptions

Every main page should use a shared PageHeader/PageIntro pattern with a title, short purpose description, usage instruction, and optional actions. Approved descriptions are maintained in `docs/COMPONENT_RULES.md` and `docs/DESIGN_CHANGELOG.md` as migration work proceeds.
