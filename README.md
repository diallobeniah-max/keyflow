# KeyFlow

**High-Performance Windows Desktop Automation, Tap Patterns, Native Shortcuts & Modular Control Deck**

KeyFlow is a local-only, zero-telemetry Windows desktop productivity suite for advanced keyboard and mouse automation. It pairs a high-speed native Rust input engine with a modern, Apple and Windows 11 Fluent inspired control center.

---

## Highlights & Features

### 1. Native Gesture & Tap Engine (Rust `keyflow-input`)
- **Tap Patterns**: Single tap, double tap, triple tap, long press, hold, tap-then-hold, modifier combos, and sequence execution.
- **Dedicated Hyper Key**: Turn any physical key (e.g. `AltRight`, `CapsLock`, `F13`–`F24`) into a universal `Ctrl + Alt + Win + Shift` Hyper modifier with zero conflict.
- **Fail-Open AutoHotkey v2 Suppression**: High-precision key suppression preventing accidental key leakage during double-tap or hold actions without blocking ordinary typing.
- **Emergency Bypass**: Dedicated safety mechanism (`Esc` 3x or Safe Mode) ensuring your keyboard never gets locked.

### 2. Raycast-Style Spotlight Popup (`Ctrl+K` & Global Triggers)
- **Fast Floating Command Palette**: Launch apps, execute actions, search system tools, and run custom scripts with instant fuzzy search.
- **Customizable Action Menus**: Group and customize popup actions with an iOS-style categorized icon selector and 6-color accent palette.

### 3. Floating Keep Notes Window (Apple Notes / Bear-Inspired)
- **Frameless Window**: Custom macOS-style traffic light controls (Minimize, Maximize/Expand, Close).
- **Resizable Sidebar**: Draggable vertical splitter (`.notes-sidebar-resizer`) with local storage persistence.
- **Rich Formatting Toolbar**: Headings (H1/H2/H3/P), Bold, Italic, Underline, Strikethrough, Lists, Blockquotes, and Dividers with responsive flex-wrapping.
- **Automatic Autosave**: Live status pill indicator, instant search, and markdown export.

### 4. Hot Corners with Live Visualizer Pods
- **Interactive Display Canvas**: Real-time corner zone pods that dynamically expand and contract with the activation slider to visually display hit areas (`40px`, `60px`, `80px`).
- **Custom Quick Layout Presets**: Save, name, and 1-click toggle personalized corner configurations (Productivity, Multitasking, Clear, Custom).
- **Audio Feedback**: Built-in sound toggle (`Play sound on trigger`) for corner gesture activations.

### 5. WASD Keyboard Cursor Navigation & Screen Tint
- **WASD Navigation Mode**: Control the mouse cursor directly from your keyboard using `W`, `A`, `S`, `D` with acceleration and smooth damping.
- **Custom Blue Cursor**: Embedded native cursor indicator (`.cur` / `.png`) showing active navigation state.
- **Screen Tint Blue-Light Filter**: Hardware-accelerated fullscreen overlay for late-night eye comfort.

### 6. Windows-Native Fluid Animation Suite
- **Windows 11 Fluent Motion**: Standardized cubic-bezier transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) for page transitions, settings tabs, modals, accordions, and cascading card grids.
- **Accessible Motion**: Full support for `@media (prefers-reduced-motion)` and the user `.reduce-motion` toggle.

---

## Getting Started

### Prerequisites
- Node.js: v18 or higher (LTS recommended)
- Rust toolchain: cargo & rustc (for building native input helper)
- Microsoft Windows 10 or 11

### Installation

```powershell
# Clone the repository
git clone https://github.com/diallobeniah-max/keyflow.git
cd keyflow

# Install Node dependencies
npm install

# Build the native Rust input helper
npm run native:build
```

### Running in Development

```powershell
# Start Electron + Vite live development environment
npm run electron:dev
```

### Verification & Testing

```powershell
# Run TypeScript typechecks
npm run typecheck

# Run Electron TypeScript compilation
npm run electron:compile

# Run Vite production build
npm run build

# Run Design System token check
npm run design:check

# Run automated test suite (367 unit tests)
powershell -NoProfile -Command "node --test (Get-ChildItem scripts/*.test.mjs | Select-Object -ExpandProperty FullName)"
```

---

## Project Structure

```text
keyflow/
├── docs/                       # Design system and architecture guidelines
│   ├── DESIGN_SYSTEM.md        # Color tokens, typography, and spacing scales
│   ├── COMPONENT_RULES.md      # Shared UI component usage rules
│   ├── RESPONSIVE_RULES.md     # Breakpoints and window resizing guidelines
│   └── DESIGN_CHANGELOG.md     # Detailed release and migration history
├── electron/                   # Electron main process & IPC handlers
│   ├── main.ts                 # Application lifecycle, tray, and global shortcuts
│   ├── native-input-helper.ts  # Bi-directional stdio pipe to native Rust process
│   ├── notes-window.ts         # Floating Notes frameless window manager
│   ├── popup-window.ts         # Raycast-style spotlight popup window
│   ├── sound.ts                # Audio feedback engine
│   └── suppression-config.ts   # AutoHotkey v2 dynamic script generation
├── native/
│   └── keyflow-input/          # High-speed native Rust input engine
│       └── src/
│           ├── main.rs         # Stdio protocol entry point
│           ├── hook.rs         # Low-level Windows keyboard & mouse hooks
│           ├── trigger.rs      # Tap pattern & gesture state machine
│           ├── drag_switcher.rs# Multi-monitor drag corner switcher
│           ├── system_cursor.rs# Windows cursor swap manager
│           └── protocol.rs     # JSON-RPC protocol definition
├── scripts/                    # Test suites & asset generators
│   ├── check-design-system.mjs # Automated token and design rule validator
│   ├── gen-sounds.mjs          # Procedural feedback audio waveform generator
│   └── *.test.mjs              # 367 automated regression & unit tests
├── src/                        # React + TypeScript UI renderer
│   ├── components/             # Reusable UI components (AppSelect, Modals, Icon)
│   ├── design/                 # tokens.css design system foundation
│   ├── lib/                    # Actions, conflict detection, settings index
│   ├── pages/                  # Dashboard, Shortcuts, Settings, Profiles, Notes
│   ├── store/                  # Zustand state store with persistence
│   └── types/                  # TypeScript interface contracts
└── package.json
```

---

## Privacy & Local-First Philosophy

- **Zero Cloud / No Telemetry**: KeyFlow does not send data over the internet. No external telemetry, analytics, or remote logging.
- **Selective Hook Monitoring**: The native hook engine only evaluates configured keys and never captures or records typed text.
- **Local Persistence**: All settings, notes, and profiles are saved exclusively on your local disk (`%APPDATA%/keyflow/`).

---

## License

This project is licensed under the MIT License.