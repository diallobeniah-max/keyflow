# KeyFlow Accessibility

KeyFlow must remain usable with keyboard navigation, Windows accessibility tools, zoom/scaling, reduced motion, and high-contrast user settings where the platform permits.

## Keyboard navigation

* Every interactive control is reachable in a logical DOM order.
* Use native buttons, inputs, links, and range controls where their semantics fit.
* Do not create a keyboard trap outside an intentionally modal dialog.
* Tab moves between controls; Shift+Tab moves backward.
* Escape closes dialogs, drawers, popups, and dropdowns according to their documented ownership.
* Arrow-key patterns are documented for tabs, menus, and `AppSelect`.
* Editable controls stop propagation of key events so global shortcuts do not activate while typing.
* Password fields require special protection: do not inspect, persist, or forward their contents through shortcut handling.

## Focus-visible behaviour

* All keyboard-focused controls have a visible accent outline/ring without layout shift.
* Focus rings use the accent border and 3px accent-soft ring tokens.
* Never remove focus outlines without providing an equivalent visible state.
* After closing a dropdown or dialog, focus returns to the invoking trigger where appropriate.

## Names and descriptions

* Every icon-only button has a meaningful `aria-label` and, where useful, a title.
* Every input, select, slider, and toggle has a visible label or an explicit accessible name.
* Descriptions and hints are associated with their controls through `aria-describedby` where the shared component supports it.
* Validation errors are exposed as text near the relevant control and are not communicated through colour alone.
* Status badges include text, icons, or structural state in addition to colour.

## Screen readers and semantics

* `AppSelect` uses combobox/listbox/option semantics, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and `aria-selected`.
* Toggles expose button semantics and `aria-pressed`.
* Dialogs expose a heading and modal semantics, and the focus trap is active only while open.
* Navigation identifies its region and the current page through existing visual and structural state.
* Decorative SVG icons use `aria-hidden="true"`; meaningful icon content has an adjacent text label.

## Contrast and disabled states

Text, borders, focus indicators, and controls must remain distinguishable in both approved themes. Disabled controls use disabled text/opacity and a disabled semantic state; do not rely on a barely visible colour change. Disabled options cannot be selected with mouse or keyboard.

## Forms and errors

* Keep labels stable when values change.
* Keep error placement stable so controls do not jump unexpectedly.
* Explain how to correct an error in text.
* Preserve user-entered values when reporting validation errors.
* Do not trigger global shortcuts from editable fields, including search, textareas, number inputs, and password controls.

## Dialogs, drawers, and Escape

* Dialogs trap focus while open, close on Escape when the action is safe, and return focus to the opener.
* Clicking the backdrop closes only dialogs whose documented behaviour allows it.
* Drawer navigation traps focus while open, closes on Escape, and returns focus to the hamburger.
* Dropdown Escape closes the menu and returns focus to the trigger; Tab leaves normally.

## Reduced Motion

The `reduce-motion` class disables meaningful animations and smooth scrolling while preserving state changes, focus movement, and usable transitions. Never hide information or make an interaction dependent on animation.

## Electron-specific safety

* `-webkit-app-region: drag` is limited to non-interactive title-bar space.
* Window controls, buttons, profile selectors, and other interactive title-bar content are explicitly no-drag.
* Renderer design work must not weaken preload security, IPC boundaries, native input protection, or password-field handling.
