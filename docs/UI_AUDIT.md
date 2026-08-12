# KeyFlow UI Audit

Audit date: 2026-08-03

## Scope

The Windows functional audit report in `docs/WINDOWS_FUNCTIONAL_AUDIT.md` is preserved; its manual window checks remain unresolved and were not repeated. This document covers renderer design-system state and dropdown migration only.

## Existing pages

| Page | File | Header state | Dropdown state |
|---|---|---|---|
| Dashboard | `src/pages/Dashboard.tsx` | Compatibility `PageIntro` | None |
| Shortcuts | `src/pages/Shortcuts.tsx` | Compatibility `PageIntro` | 4 compatibility `Select` instances |
| Create Shortcut | `src/pages/CreateShortcut.tsx` | Compatibility `PageIntro` | 3 compatibility `Select` instances |
| Visual Keyboard | `src/pages/VisualKeyboard.tsx` | Compatibility `PageIntro` | None |
| Action Library | `src/pages/ActionLibrary.tsx` | Compatibility `PageIntro` | None |
| Profiles | `src/pages/Profiles.tsx` | Compatibility `PageIntro` | 1 compatibility `Select` instance |
| Settings | `src/pages/Settings.tsx` | Compatibility `PageIntro` | 1 direct `AppSelect` proof + 6 compatibility `Select` instances |
| Onboarding | `src/pages/Onboarding.tsx` | Existing onboarding layout | None |

## Design files found and state

| File | State |
|---|---|
| `AGENTS.md` | Created with protected-file and validation rules |
| `docs/UI_AUDIT.md` | Existing audit completed with this inventory |
| `docs/WINDOWS_FUNCTIONAL_AUDIT.md` | Existing, preserved; not repeated |
| `docs/DESIGN_SYSTEM.md` | Replaced outdated purple/cyan definitions with approved token documentation |
| `docs/RESPONSIVE_RULES.md` | Created |
| `docs/COMPONENT_RULES.md` | Created |
| `docs/ACCESSIBILITY.md` | Created |
| `docs/DESIGN_CHANGELOG.md` | Created |
| `src/design/tokens.css` | Existing token source completed with approved aliases/layout tokens; self-referential aliases removed |
| `src/design/typography.ts` | Existing role references preserved |
| `src/design/componentSizes.ts` | Existing component references preserved |
| `src/design/breakpoints.ts` | Existing desktop ranges preserved |
| `src/design/index.ts` | Existing exports preserved |
| `scripts/check-design-system.mjs` | Created |
| `src/components/ui/AppSelect.tsx` | Created and used by compatibility wrapper and Sidebar |
| `src/components/ui/PageHeader.tsx` | Created; page-by-page migration remains future work |

## Dropdown inventory

The compatibility `Select` export in `src/components/ui.tsx` now delegates to `AppSelect`; this prevents competing select implementations while allowing incremental page migration. The instances below are the current call sites.

| Page | File / field | Current implementation | Raw/custom | Accessibility condition | Priority |
|---|---|---|---|---|---|
| Sidebar | `src/components/Sidebar.tsx` — Active profile | `AppSelect` directly | Custom shared | Label, combobox/listbox semantics, selected check, keyboard and portal behaviour | **Migrated proof** |
| Shortcuts | `src/pages/Shortcuts.tsx` — Profile | Compatibility `Select` → `AppSelect` | Shared custom | Uses shared semantics; visible `Field` label is not yet programmatically associated | High |
| Shortcuts | `src/pages/Shortcuts.tsx` — Trigger | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | High |
| Shortcuts | `src/pages/Shortcuts.tsx` — Action | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | High |
| Shortcuts | `src/pages/Shortcuts.tsx` — Sort | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | Medium |
| Create Shortcut | `src/pages/CreateShortcut.tsx` — Profile | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | High |
| Create Shortcut | `src/pages/CreateShortcut.tsx` — Input source | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | High |
| Create Shortcut | `src/pages/CreateShortcut.tsx` — Mouse button | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | High |
| Profiles | `src/pages/Profiles.tsx` — App rule mode | Compatibility `Select` → `AppSelect` | Shared custom | Same label-association follow-up | Medium |
| Settings | `src/pages/Settings.tsx` — Default profile | Compatibility `Select` → `AppSelect` | Shared custom | Visible label; requires association cleanup | High |
| Settings | `src/pages/Settings.tsx` — Theme | `AppSelect` directly | Shared custom | Label, combobox/listbox semantics, selected check, keyboard and portal behaviour | **Migrated proof** |
| Settings | `src/pages/Settings.tsx` — UI scale | Compatibility `Select` → `AppSelect` | Shared custom | Visible label; requires association cleanup | Medium |
| Settings | `src/pages/Settings.tsx` — Font size | Compatibility `Select` → `AppSelect` | Shared custom | Visible label; requires association cleanup | Medium |
| Settings | `src/pages/Settings.tsx` — Hyper key | Compatibility `Select` → `AppSelect` | Shared custom | Visible label; requires association cleanup | Medium |
| Settings | `src/pages/Settings.tsx` — Popup position | Compatibility `Select` → `AppSelect` | Shared custom | Visible label; requires association cleanup | Medium |
| Settings | `src/pages/Settings.tsx` — Popup size | Compatibility `Select` → `AppSelect` | Shared custom | Visible label; requires association cleanup | Medium |
| Action editor | `src/components/ActionEditor.tsx` — Action type and conditional fields | Compatibility `Select` → `AppSelect` | Shared custom | Conditional controls need labels reviewed during migration | High |

## Raw select and duplicate implementation audit

* Raw `<select>` was found in the Sidebar and has been replaced with `AppSelect`.
* No raw application-page `<select>` remains after the Sidebar migration.
* The old custom select implementation was removed from `src/components/ui.tsx`; its compatibility export delegates to `AppSelect`.
* Manual chevron styling is now isolated to `AppSelect`.
* No second select component was created.

## Remaining design-system work

* Migrate page headers from `PageIntro` to `PageHeader` incrementally.
* Pass visible field labels into `AppSelect` so every compatibility call site has a programmatic label.
* Replace remaining one-off inline visual styles in ordinary renderer components.
* Continue migrating the compatibility exports in `src/components/ui.tsx` to named `App*` components.
* Add focused automated/browser coverage for AppSelect interactions when a renderer test harness is introduced.
