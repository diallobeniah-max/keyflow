# KeyFlow Design System

## Personality

KeyFlow should feel like a premium Windows productivity tool: calm, futuristic, fast, trustworthy, and simple enough for beginners.

## Colors

### Dark mode

- Background: `#080A12`
- Background elevated: `#0D111C`
- Card background: `#111827`
- Card hover: `#172033`
- Border: `#253047`
- Text primary: `#F8FAFC`
- Text secondary: `#AAB4C4`
- Text muted: `#6B7280`
- Accent primary: `#7C3AED`
- Accent secondary: `#06B6D4`
- Success: `#22C55E`
- Warning: `#F59E0B`
- Danger: `#EF4444`
- Glass background: `rgba(17, 24, 39, 0.72)`

### Light mode

- Background: `#F7F8FC`
- Background elevated: `#FFFFFF`
- Card background: `#FFFFFF`
- Card hover: `#F1F5F9`
- Border: `#E2E8F0`
- Text primary: `#0F172A`
- Text secondary: `#475569`
- Text muted: `#94A3B8`
- Accent primary: `#6D28D9`
- Accent secondary: `#0891B2`
- Success: `#16A34A`
- Warning: `#D97706`
- Danger: `#DC2626`
- Glass background: `rgba(255, 255, 255, 0.72)`

## Typography

- Font family: `Inter`, `Segoe UI`, `system-ui`, `sans-serif`
- Display title: 32px, 700 weight
- Page title: 24px, 700 weight
- Section title: 18px, 600 weight
- Body text: 14px to 16px, 400 weight
- Small text: 12px to 13px
- Button text: 14px, 600 weight

## Layout sizes

- App minimum width: 1100px
- App minimum height: 720px
- Sidebar width: 260px
- Collapsed sidebar width: 76px
- Top bar height: 64px
- Page padding: 24px
- Card padding: 20px
- Section gap: 24px
- Card gap: 16px
- Popup menu width: 420px
- Popup max height: 560px
- Settings content max width: 980px

## Border radius

- Small: 8px
- Medium: 12px
- Large: 18px
- Extra large: 24px
- Full pill: 999px

## Components

Buttons, inputs, cards, toggles, modals, chips, and popup menus must use CSS variables from `src/index.css`. Avoid custom one-off colors unless they come from the token system.

## Animation

- Default transition: 160ms ease-out
- Popup open: scale 0.96 to 1 and opacity 0 to 1
- Page transition: fade and slight upward motion
- Hover transition: 120ms
- Respect reduce motion setting

## Responsive behavior

At widths below 1000px, card grids collapse to one column. The sidebar may be collapsed manually. Content should scroll inside the main area, not the whole browser window.


## v0.3 Premium Cloud Refresh

The app now uses one premium cloud-blue accent family (`#4F7CFF`) instead of mixed AI-style colors. Dropdowns are custom components with centered chevrons, selected states, glass menus, and smooth open animations. Sliders use branded progress tracks and animated thumbs. Visual keyboard keys are full-width and color-coded by function, rule, navigation, and assigned states.
