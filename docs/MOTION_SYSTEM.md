# KeyFlow Motion System

`src/lib/motion.ts` and `src/design/motion.css` are the shared animation system for all transient renderer UI.

## Use it for every transient surface

* Use `motionClassName(preset, state)` for a surface that only needs a consistent entrance.
* Use `useMotionPresence(isOpen, preset)` when a popover, dialog, sheet, toast, or tooltip must visibly close before unmounting.
* Use one of the approved presets: `page`, `popover`, `dialog`, `sheet`, `toast`, `tooltip`, or `clipboard`.
* Put `kf-motion__surface` on the panel inside a dialog or sheet so its backdrop and panel animate independently.

## Motion rules

* Use only `transform` and `opacity` for the motion itself. Do not use `transition: all`, layout-property animation, or one-off keyframes.
* Keep interaction feedback fast and transient surfaces short. The shared presets use the approved motion tokens from `src/design/tokens.css`.
* Never make keyboard commands, focus movement, safe actions, or information availability wait for animation.
* The `reduce-motion` setting and the system reduced-motion preference reduce every library transition to an effectively instant state change.
* Use the `clipboard` preset only for the Clipboard Shelf window. It gives bottom-, top-, centered-, and right-docked layouts a restrained entrance and an exact inverse exit path without delaying shortcut handling.
* Clipboard close uses the approved slow token so it settles visibly without feeling delayed. The copy-confirmation window uses the same easing with an edge-aware transform and no focus acquisition.

## Existing shared coverage

The system is applied to the app's shared modal, toast host, `AppSelect`, global tooltips, command palette, and both popup shells. New overlays must use this system rather than adding a component-local animation.
