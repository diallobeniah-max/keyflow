# KeyFlow UI Engineering Rules

Every UI-focused coding agent must read these files before changing renderer code:

1. `docs/DESIGN_SYSTEM.md`
2. `docs/RESPONSIVE_RULES.md`
3. `docs/COMPONENT_RULES.md`
4. `docs/ACCESSIBILITY.md`
5. `docs/DESIGN_CHANGELOG.md`

## Non-negotiable rules

* Never invent colours; use the approved tokens.
* Never invent font sizes; use documented typography roles.
* Never invent spacing or radii; use the approved scales.
* Never add random gradients or unnecessary glassmorphism.
* Never use a raw `select` where `AppSelect` exists.
* Never create a duplicate version of an existing shared component.
* Never use permanent inline styles for normal component styling.
* Always use design tokens and shared KeyFlow components.
* Add a short purpose description and usage instruction through `PageHeader` for each main page as it is migrated.
* Preserve the Electron title bar, window controls, title-bar dragging, native keyboard and mouse shortcuts, pause, Safe Mode, profiles, shortcut data, and local storage.
* Never modify Electron security or native input handling during ordinary design work.
* Update documentation when adding a token or approved variant.
* Run the validation commands before claiming completion.
* Do not commit or push unless explicitly requested.

## Protected files

Do not modify these files during design work unless compilation absolutely requires it:

* `electron/main.ts`
* `electron/preload.ts`
* `electron/window-state.ts`
* `electron/actions.ts`
* `electron/input/*`
* `src/lib/native-input.ts`
* `src/types/electron.d.ts`
* `src/lib/actions.ts`

## Validation

At minimum run:

```text
npm run typecheck
npm run electron:compile
npm run build
npm run design:check
```

For desktop work, start `npm run electron:dev` and report actual Electron startup/log results. Do not claim physical keyboard or mouse shortcut testing unless it was personally performed.
