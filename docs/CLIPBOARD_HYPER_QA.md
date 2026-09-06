# Clipboard and Hyper key checkpoint — 2026-09-06

## Implemented

* Clipboard capture controls now persist and affect the engine. Retention preserves pinned
  clips; invalid settings are rejected; pausing cancels pending capture.
* Popup receives live history/settings, retains chosen layout across startup, clamps to
  monitor work areas, and cancels stale close timers on reopen.
* File replay uses Windows file-drop lists, including multiple Unicode paths. Copying from
  history does not recapture itself. Paste restores focus before sending Ctrl+V.
* Folder assignment/reordering handlers are connected; folder icon and approved token
  colors persist. Folder editor uses the shared modal. Search clears stale inspector details.
* History is the default clipboard view. Preferences are collapsible; compact controls wrap,
  scrolling stays within the relevant region, and popup motion uses shared presets.
* Popup appearance follows main-window and OS theme changes. Privacy text no longer
  promises automatic incognito detection. Protected Windows clipboard formats are excluded.
* Hyper None no longer falls back to Right Alt. Chord-only tap choices and includeShift
  survive edits/reload. Non-modifier Hyper chords activate even without a tap action.
  Pause releases Hyper suppression; native initialization no longer overwrites early config.

## Verification completed

* Final typecheck, Electron compilation, production build and design checks passed,
  including the protected-format addition. Build reports the existing large-bundle warning.
* Node test suite: 396 passed. Rust native tests: 200 passed.
* `scripts/clipboard-electron-qa.mjs`: isolated real Electron profile; OS text/JSON/image
  capture, live updates, capture toggles, search, copy/no duplicate, close/reopen race,
  two-file Unicode capture/replay, folder icon/color/assignment, native paste into a separate
  target window, all three layouts, compact page, light/system themes, pending capture pause,
  retention/pinned preservation and persistence passed with no renderer exceptions.
* Latest screenshots: `C:/Users/wonde/AppData/Local/Temp/keyflow-clipboard-qa-0POzNn`.
* Real user profile read-only check: Hyper enabled, ScrollLock (VK 145), tap showPopup,
  active default profile, not paused/safe; native engine ready with configuration acknowledged.

## Limits and resume instructions

Physical keyboard taps/chords have **not** been personally tested. Native tests cover
ScrollLock+O with/without tap action, repeats and pause/resume. User should test their
physical Scroll Lock key (possibly Fn+Scroll Lock on a laptop) and ScrollLock+O.
The paste fixture is a separate Electron window, not every third-party/elevated application.

The worktree was already extensively modified; preserve all existing changes. No commit,
push, reset, or real-history deletion was performed. QA uses temporary profiles and restores
the original text/HTML/image or file-list clipboard payload; proprietary clipboard formats
are not exhaustively covered. Do not run multiple clipboard QA processes concurrently.

Run with Vite on port 1420: `node scripts/clipboard-electron-qa.mjs`. The script accepts
`KEYFLOW_PLAYWRIGHT_MODULE` for an installed Playwright package. Native checks use
`C:/Users/wonde/.cargo/bin/cargo.exe test --manifest-path native/keyflow-input/Cargo.toml`.
Final gates: `npm run typecheck`, `npm run electron:compile`, `npm run build`,
`npm run design:check`, `npm test`; rebuild/start using `npm run electron:dev`.

Usage checkpoint: five-hour allowance 13% remaining, weekly 29% remaining. Stop before
exhaustion; no usage-reset credits consumed and no auto-resume automation created.

## Final startup

`npm run electron:dev` rebuilt the release native helper and started Vite/Electron.
Electron process 18808 reports `Responding: True`; native helper 41312 reports ready.
The rebuilt helper acknowledged configuration version 1 with 10 rules, Hyper enabled,
physical VK 145 (ScrollLock), and the synthetic popup tap action. Vite loaded successfully.
Startup also logged unrelated existing `media-player:update` missing-handler and hardware
brightness WMI errors. These are outside this clipboard/Hyper pass and remain unresolved.
The app remains open. `git diff --check` reports a pre-existing trailing blank line
in `docs/WINDOWS_FUNCTIONAL_AUDIT.md`; that unrelated document was left untouched.
