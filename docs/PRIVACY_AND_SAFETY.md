# Privacy and Safety

KeyFlow is built for local use only.

## What KeyFlow should do

- Only inspect keys that are configured as shortcuts.
- Avoid storing raw key history.
- Avoid saving typed words.
- Store data locally as JSON.
- Allow pause, safe mode, and blacklisted apps.
- Warn users about risky system keys.

## What KeyFlow should not do

- It should not upload data.
- It should not send data to external APIs.
- It should not record full typing history.
- It should not bypass passwords or security tools.

## Desktop implementation note

Real Windows hook logic belongs in `src-tauri/src/hooks.rs`. The browser simulator is only for testing the UI and timing engine.
