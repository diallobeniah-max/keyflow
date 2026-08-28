# KeyFlow Design System

**Status:** Permanent renderer foundation (v2 — Modern Native Desktop)<br>
**Runtime source of truth:** `src/design/tokens.css`<br>
**Scope:** KeyFlow's Windows desktop renderer and shared UI components

## Purpose and personality

KeyFlow is a local-first Windows productivity tool for precise keyboard and mouse automation. Its interface should feel:

* Premium with Apple-level visual restraint, calm, and polish
* Native to modern Windows desktop utility workflows
* Crisp, tactile, and content-first
* Precise, dependable, and high-signal
* Consistent across settings, builders, lists, and popup workflows
* Control-deck like: compact operational readouts, quiet graphite surfaces, and blue signal states that make the engine's status legible at a glance

The current visual direction is a KeyFlow-owned interpretation of modular utility control centers: dense enough for power users, calm enough for daily use, and grounded in Windows desktop conventions. It may borrow the reference's information density and restrained panel language, but it does not reuse external branding, logos, or artwork.

Use the KeyFlow Calm Blue accent family. Avoid generic AI SaaS styling, decorative loud gradients, excessive glass effects, and rounded card-in-card clutter. Surfaces should be solid, clean, and layered through restrained 1px hairline borders and natural soft elevation shadows.

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
-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", "Inter", system-ui, sans-serif
```

`Segoe UI Variable` and `Segoe UI` are the dependable Windows desktop typography standards.

| Role | Size | Line height | Weight | Token references |
|---|---:|---:|---:|---|
| Display | 28px | 36px | 650 | `--type-display-*` |
| Page title | 22px | 28px | 650 | `--type-page-*` |
| Section title | 16px | 22px | 600 | `--type-section-*` |
| Card title | 14px | 20px | 600 | `--type-card-*` |
| Body large | 15px | 22px | 400 | `--type-body-large-*` |
| Body | 13.5px | 19px | 400 | `--type-body-*` |
| Body strong | 13.5px | 19px | 600 | `--type-body-strong-*` |
| Small | 12.5px | 17px | 400 | `--type-small-*` |
| Caption | 11.5px | 15px | 500 | `--type-caption-*` |
| Button | 13px | 18px | 550 | `--type-button-*` |
| Keycap | 12px | 16px | 600 | `--type-keycap-*` |

## Colour system

### Dark theme (Default)

| Purpose | Value | Token |
|---|---|---|
| App background | `#0d1117` | `--color-bg-app` |
| Sidebar background | `#090d13` | `--color-bg-sidebar` |
| Surface | `#131922` | `--color-bg-surface` |
| Elevated surface | `#18202c` | `--color-bg-surface-elevated` |
| Hover surface | `#1e2736` | `--color-bg-hover` |
| Selected surface | `#223249` | `--color-bg-selected` |
| Input background | `#121822` | `--color-bg-input` |
| Subtle border | `#1c2533` | `--color-border-subtle` |
| Default border | `#263346` | `--color-border-default` |
| Strong border | `#37475e` | `--color-border-strong` |
| Primary text | `#f1f5f9` | `--color-text-primary` |
| Secondary text | `#94a3b8` | `--color-text-secondary` |
| Muted text | `#64748b` | `--color-text-muted` |
| Disabled text | `#475569` | `--color-text-disabled` |
| Accent | `#3b82f6` | `--color-accent` |
| Accent hover | `#60a5fa` | `--color-accent-hover` |
| Accent pressed | `#2563eb` | `--color-accent-pressed` |
| Accent soft | `rgba(59, 130, 246, 0.12)` | `--color-accent-soft` |
| Accent border | `rgba(59, 130, 246, 0.35)` | `--color-accent-border` |
| Success | `#10b981` | `--color-success` |
| Warning | `#f59e0b` | `--color-warning` |
| Danger | `#ef4444` | `--color-danger` |
| Info | `#3b82f6` | `--color-info` |

### Light theme

| Purpose | Value | Token |
|---|---|---|
| App background | `#f8fafc` | `--color-bg-app` |
| Sidebar background | `#f1f5f9` | `--color-bg-sidebar` |
| Surface | `#ffffff` | `--color-bg-surface` |
| Elevated surface | `#f8fafc` | `--color-bg-surface-elevated` |
| Hover surface | `#eef2f6` | `--color-bg-hover` |
| Selected surface | `#e0e7ff` | `--color-bg-selected` |
| Subtle border | `#e2e8f0` | `--color-border-subtle` |
| Default border | `#cbd5e1` | `--color-border-default` |
| Strong border | `#94a3b8` | `--color-border-strong` |
| Primary text | `#0f172a` | `--color-text-primary` |
| Secondary text | `#475569` | `--color-text-secondary` |
| Muted text | `#64748b` | `--color-text-muted` |
| Disabled text | `#94a3b8` | `--color-text-disabled` |
| Accent | `#2563eb` | `--color-accent` |

## Spacing scale

| Token | Pixels | Intent |
|---|---:|---|
| `--space-0` | 0px | Reset |
| `--space-1` | 4px | Micro-spacing, chip padding |
| `--space-2` | 8px | Tight gaps, row margins |
| `--space-3` | 12px | Form field gaps, control padding |
| `--space-4` | 16px | Card padding, standard layouts |
| `--space-5` | 20px | Section headers |
| `--space-6` | 24px | Page padding, grid gaps |
| `--space-8` | 32px | Section separators |
| `--space-10` | 40px | Large modal padding |
| `--space-12` | 48px | Empty states |
| `--space-16` | 64px | Maximum page offsets |

## Radii scale

| Token | Pixels | Usage |
|---|---:|---|
| `--radius-xs` | 4px | Badges, tiny indicators |
| `--radius-sm` | 6px | Keycaps, nav items, tags |
| `--radius-md` | 8px | Buttons, inputs, select triggers |
| `--radius-lg` | 12px | Cards, popup menus, panels |
| `--radius-xl` | 16px | Dialogs, modals |
| `--radius-pill` | 999px | Switches, status dots, pills |

## Elevation and shadows

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)` |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.10)` |
| `--shadow-popup` | `0 16px 36px rgba(0, 0, 0, 0.36), 0 0 0 1px var(--color-border-subtle)` |
| `--shadow-focus` | `0 0 0 3px var(--color-accent-soft)` |
