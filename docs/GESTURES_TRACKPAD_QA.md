# Hyper Gestures and Three-Finger Trackpad Dragging QA — 2026-09-07

## Implemented Architecture

### 1. Feature A: Hyper-Activated Pointer Gestures
* **Dynamic Hyper Key**: Uses the user's configured physical Hyper key (`shortcuts.hyperKeyConfig` or legacy `shortcuts.hyperKey`); never hardcoded.
* **Deadzone Thresholding**: Configurable deadzone (default 24px, range 12–60px). Small cursor movements below the threshold do not cancel Hyper tap actions.
* **Stroke Recognition**: 8-sector quantization (`U`, `D`, `L`, `R`, `UR`, `UL`, `DR`, `DL`) with minimum vector threshold.
* **Instant Cancellation**: Any keyboard chord, additional keydown, or Escape immediately cancels gesture tracking without firing either the tap or the gesture action.
* **Visual Trail Window**: Transparent, click-through (`WS_EX_TRANSPARENT | WS_EX_LAYERED`, `setIgnoreMouseEvents(true, { forward: true })`, `screen-saver` level) overlay displaying a glowing trail and a floating action preview pill with the quantized directional arrow and action name.
* **Tap-to-Enter Mode**: Toggleable support for laptop touchpads that suppress cursor motion while physical keys are held down.

### 2. Feature B: macOS-Parity Three-Finger Trackpad Dragging & Fine-Tuning
Ported and adapted from macOS Accessibility Pointer Control and Clément Grennerat's `ThreeFingerDragOnWindows`:
* **Precision Touchpad Detection**: Queries Windows Raw Input for HID multi-touch digitizer devices (`UsagePage 0x0D`, `Usage 0x05`). Honest capability detection reports device count, vendor ID, product ID, and name.
* **ContactsManager (Burst Frame Reassembly)**: Retains `target_contact_count` across sequential partial-burst packets (`count == 0`), accurately assembling multi-touch frames without dropping contacts.
* **DistanceManager with 40ms Touch-Down Quarantine**:
  - Eliminates the capacitive touchdown settling roll that causes bottom-right cursor drift when fingers land.
  - New contacts are quarantined for 40ms before their displacement can affect cursor motion.
  - Computes delta from the single cleanest, longest-moving trusted contact (`GetLongestDist2D`) rather than naive centroid averaging.
  - Sigmoid velocity acceleration curve ($0.7 + 0.8 \cdot \text{sigmoid}(2.6a(v - 1) - \log_2(5/3))$): subtle finger movements stay pixel-precise while quick swipes glide across the display.
  - Subpixel decimal accumulation (`decimal_x`, `decimal_y`) prevents rounding artifacts.
* **FingerCounter (Intentional Drag Thresholds)**:
  - `start_threshold` (default 100 raw units, ~2.5mm): requires deliberate movement before engaging virtual left click, preventing accidental drags on finger rest or tap.
  - `stop_threshold` (default 10 raw units): sensitive release detection when fingers halt.
* **Drop Delay (Grace Period)**:
  - Configurable release delay (default 500ms, range 100–1000ms). When fingers lift to reposition across the pad, virtual click remains held. Landing anywhere on the pad produces zero displacement jump, resuming drag seamlessly.
* **Full Fine-Tuning Settings Panel (`GesturesTrackpadPage.tsx`)**:
  - Cursor Speed slider (5–100, default 30)
  - Pointer Acceleration slider (0–30, default 10; 0 = linear/off)
  - Start Drag Movement Threshold slider (20–250, default 100)
  - Stop Drag Sensitivity slider (5–35, default 10)
  - Finger Repositioning Drop Delay slider (100–1000ms, default 500ms)
  - Allow Release & Restart toggle
  - Advanced expandable panel: Cursor Move toggle, Glitch Distance Limit (50–400, default 150), Input Smoothing Frame Averaging (1–5 frames, default 1).
* **Synthetic Injection & Safety**: Injected mouse events carry `OWN_MARKER = 0x4B46_574B`. `release_owned_mouse_buttons()` safely releases virtual clicks on Pause, Safe Mode, or shutdown.
* **Windows Conflict Guidance**: One-click button directly opening `ms-settings:devices-touchpad` to configure Windows 3-finger gestures to "Nothing" for conflict-free operation.

---

## Verification Completed

* **Native Rust Unit & Integration Tests**:
  - `native/keyflow-input`: **221 passed, 0 failed**.
  - `test_contacts_manager_partial_burst_reassembly`: PASSED.
  - `test_distance_manager_quarantine_rejects_bottom_right_landing_spike`: PASSED.
  - `test_finger_counter_start_threshold`: PASSED.
  - `test_sigmoid_acceleration`: PASSED.
  - `test_release_delay_and_reposition`: PASSED.
  - `test_three_fingers_arm_and_move_to_drag`: PASSED.
  - `test_momentary_touch_does_not_click`: PASSED.
  - `test_cancel_releases_synthetic_button`: PASSED.
  - `test_glitch_rejection_discards_large_jump`: PASSED.
  - `test_detect_precision_touchpad_live`: PASSED.
* **Optimized Binary Release**:
  - `cargo build --release` succeeded: `keyflow-input.exe` updated.
* **TypeScript & Full Build Checks**:
  - `npm run typecheck`: **PASS (0 errors)**.
  - `npm run electron:compile`: **PASS (0 errors)**.
  - `npm run build`: **PASS (0 errors)**.
  - `npm test`: **PASS (402 passed, 0 failed)**.
  - `npm run design:check`: **PASS (0 violations)**.
