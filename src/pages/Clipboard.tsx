import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Check,
  ClipboardText,
  Code,
  Copy,
  DotsThree,
  DownloadSimple,
  Eye,
  File,
  FileText,
  Folder,
  Funnel,
  Globe,
  HardDrives,
  Image,
  Lightning,
  Link,
  MagnifyingGlass,
  Palette,
  Pause,
  Play,
  Plus,
  PushPin,
  ShieldCheck,
  SquaresFour,
  Trash,
  X,
} from "@phosphor-icons/react";
import { AppSelect } from "../components/ui/AppSelect";
import { Button } from "../components/ui";
import { PageHeader } from "../components/ui/PageHeader";
import { useStore } from "../store/useStore";

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "text", label: "Plain Text" },
  { value: "image", label: "Images & Snips" },
  { value: "files", label: "Files & Folders" },
  { value: "url", label: "Web Links" },
  { value: "color", label: "Colors" },
  { value: "code", label: "Code & JSON" },
];

const MAX_ITEMS_OPTIONS = [
  { value: "50", label: "50 clips" },
  { value: "100", label: "100 clips" },
  { value: "250", label: "250 clips" },
  { value: "500", label: "500 clips" },
];

const RETENTION_OPTIONS = [
  { value: "indefinite", label: "Keep indefinitely" },
  { value: "7", label: "Auto-clear after 7 days" },
  { value: "30", label: "Auto-clear after 30 days" },
];

function itemIcon(kind: ClipboardKind) {
  if (kind === "image" || kind === "screenshot") return Image;
  if (kind === "files") return File;
  if (kind === "url" || kind === "email") return Link;
  if (kind === "color") return Palette;
  if (kind === "code" || kind === "json" || kind === "xml") return Code;
  return FileText;
}

function relativeTime(value: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "yesterday";
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Clipboard() {
  const [snapshot, setSnapshot] = useState<ClipboardSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipboardItemDetail | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [pinboardId, setPinboardId] = useState<string>("all");
  const [inspectorTab, setInspectorTab] = useState<"preview" | "meta" | "probe">("preview");
  const [formatsProbe, setFormatsProbe] = useState<Array<{ format: string; size?: number }>>([]);
  const [probeLoading, setProbeLoading] = useState(false);
  const [copiedItemFeedback, setCopiedItemFeedback] = useState<string | null>(null);

  const [previewAreaTab, setPreviewAreaTab] = useState<"layout" | "clips">("clips");
  const clipboardShortcut = useStore((s) => s.data.settings.shortcuts?.clipboardShortcut);
  const toast = useStore((state) => state.toast);

  useEffect(() => {
    const api = window.electronAPI?.clipboard;
    if (!api) return;
    let cancelled = false;
    void api.getSnapshot().then((next) => {
      if (!cancelled) {
        setSnapshot(next);
        setSelectedId((curr) => curr ?? next.items[0]?.id ?? null);
      }
    }).catch(() => toast("Could not load clipboard history", "danger"));
    const unsubscribe = api.onChanged((next) => {
      setSnapshot(next);
      setSelectedId((curr) => curr ?? next.items[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    void window.electronAPI?.clipboard.getItem(selectedId).then((next) => {
      if (!cancelled) setDetail(next);
    }).catch(() => { if (!cancelled) setDetail(null); });
    return () => {
      cancelled = true;
    };
  }, [selectedId, snapshot?.items]);

  const filtered = useMemo(() => {
    return (snapshot?.items ?? []).filter((item) => {
      const matchKind =
        kindFilter === "all" ||
        item.kind === kindFilter ||
        (kindFilter === "image" && item.kind === "screenshot") ||
        (kindFilter === "code" && (item.kind === "json" || item.kind === "xml"));

      const matchPinboard =
        pinboardId === "all" || item.pinboardIds.includes(pinboardId);

      if (!matchKind || !matchPinboard) return false;
      if (!query.trim()) return true;

      const q = query.trim().toLowerCase();
      const searchable = `${item.title} ${item.preview} ${item.kind} ${item.sourceApp ?? ""} ${item.color ?? ""}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [snapshot?.items, kindFilter, pinboardId, query]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  useEffect(() => { setSelectedId(selected?.id ?? null); }, [selected?.id]);

  const apply = (operation: Promise<ClipboardSnapshot>) => {
    void operation
      .then(setSnapshot)
      .catch((error) =>
        toast(error instanceof Error ? error.message : "Clipboard action failed", "danger")
      );
  };

  const handleCopy = (id: string, plainText = false) => {
    void window.electronAPI?.clipboard?.copy(id, plainText).then(() => {
      setCopiedItemFeedback(id);
      setTimeout(() => setCopiedItemFeedback(null), 1400);
      toast("Copied to clipboard", "success");
    }).catch(() => toast("Could not copy this clip. It may no longer be available.", "danger"));
  };

  const handlePaste = (id: string, plainText = false) => {
    void window.electronAPI?.clipboard?.paste(id, plainText).catch(() => {
      toast("Could not paste clipboard item", "danger");
    });
  };

  const handleProbeFormats = async () => {
    setProbeLoading(true);
    try {
      const results = await window.electronAPI?.clipboard?.probeFormats?.();
      setFormatsProbe(results ?? []);
    } catch {
      toast("Could not probe clipboard formats", "warning");
    } finally {
      setProbeLoading(false);
    }
  };

  const isPaused = snapshot?.settings.paused ?? false;

  const toggleEnginePaused = () => {
    if (!snapshot) return;
    apply(window.electronAPI!.clipboard.setSettings({ paused: !isPaused }));
    toast(isPaused ? "Clipboard capture resumed" : "Clipboard capture paused", "info");
  };

  const openFloatingShelf = async () => {
    const api = window.electronAPI?.clipboard;
    if (api?.toggle) {
      await api.toggle();
    } else if (api?.openSurface) {
      await api.openSurface("bottom");
    } else {
      await window.electronAPI?.actions?.run?.({ type: "clipboardHistory" });
    }
  };

  return (
    <div className="page-shell clipboard-page">
      <PageHeader
        title="Clipboard Hub"
        description="Find, preview and reuse the things you copy."
        usage="Select a clip to inspect it, or open the overlay to paste into another app."
      >
        <div className="clipboard-header-actions">
          <Button
            variant="primary"
            icon="arrow-square-out"
            onClick={openFloatingShelf}
            title="Open floating clipboard overlay"
          >
            Open Clipboard Overlay
          </Button>
        </div>
      </PageHeader>

      {/* Top Banner: Engine Status & Quick Launch */}
      <section className="clipboard-hub-banner">
        <div className="clipboard-banner-left">
          <div className="clipboard-banner-icon-box">
            <ClipboardText size={24} weight="bold" />
          </div>
          <div className="clipboard-banner-info">
            <div className="clipboard-banner-title-row">
              <h3>KeyFlow Clipboard Engine</h3>
              <span className={`clipboard-status-pill ${isPaused ? "is-paused" : "is-active"}`}>
                <span className="clipboard-status-dot" />
                {isPaused ? "Capture Paused" : "Engine Active"}
              </span>
              <span className="clipboard-shortcut-pill">
                {clipboardShortcut ? (
                  <>Shortcut: <kbd>{clipboardShortcut}</kbd></>
                ) : (
                  <>Suggested: <kbd>Win</kbd>+<kbd>V</kbd></>
                )}
              </span>
            </div>
            <p>
              Your clipboard history stays on this device. Open the overlay to quickly reuse a clip in another app.
            </p>
          </div>
        </div>

        <div className="clipboard-banner-actions">
          <Button
            variant={isPaused ? "primary" : "secondary"}
            icon={isPaused ? "play" : "pause"}
            onClick={toggleEnginePaused}
          >
            {isPaused ? "Resume Capture" : "Pause Capture"}
          </Button>
          <Button
            variant="secondary"
            icon="arrow-square-out"
            onClick={openFloatingShelf}
          >
            Launch Overlay →
          </Button>
        </div>
      </section>

      <details className="clipboard-preferences">
        <summary>Capture & popup settings</summary>
      {/* Visual Layout Picker Section (Matching Settings Architecture) */}
      <section className="clipboard-settings-section mb-lg">
        <div className="nav-layout-section-header mb-sm">
          <div className="settings-row-title">Clipboard overlay layout</div>
          <div className="settings-row-desc">
            Choose your preferred floating clipboard architecture. Live visual previews show how cards and search controls are arranged.
          </div>
        </div>

        <div className="nav-layout-grid clipboard-layout-3col" role="radiogroup" aria-label="Clipboard overlay layout">
          {/* Layout 1: Horizontal Shelf (Paste-style) */}
          <div className="clipboard-layout-option">
          <button
            type="button"
            className={`nav-layout-card${(snapshot?.settings.layout ?? "horizontal") === "horizontal" ? " is-selected" : ""}`}
            role="radio"
            aria-checked={(snapshot?.settings.layout ?? "horizontal") === "horizontal"}
            aria-label="Horizontal Shelf layout"
            onClick={() => {
              apply(window.electronAPI!.clipboard.setSettings({ layout: "horizontal" }));
            }}
          >
            {(snapshot?.settings.layout ?? "horizontal") === "horizontal" && (
              <div className="nav-layout-badge">
                <Check size={12} weight="bold" />
              </div>
            )}

            <div className="nav-wireframe-stage">
              <div className="nav-wireframe-window">
                <div className="nav-wireframe-header">
                  <div className="nav-wireframe-dot" />
                  <div className="nav-wireframe-line w-60" />
                </div>
                <div className="nav-wireframe-body">
                  <div className="nav-wireframe-main">
                    <div className="nav-wireframe-card" />
                    <div className="nav-wireframe-card" />
                  </div>
                </div>
                {/* Horizontal Shelf ribbon at bottom or top */}
                <div className={`nav-wireframe-shelf-ribbon ${snapshot?.settings.horizontalPosition === "top" ? "is-top" : "is-bottom"}`}>
                  <div className="nav-wireframe-shelf-search" />
                  <div className="nav-wireframe-shelf-cards">
                    <div className="nav-wireframe-shelf-item is-active" />
                    <div className="nav-wireframe-shelf-item" />
                    <div className="nav-wireframe-shelf-item" />
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-layout-info">
              <div className="nav-layout-title">Horizontal Shelf</div>
              <div className="nav-layout-desc">
                Bottom or top docked card ribbon with fluid horizontal scrolling, category banners, and quick numeric shortcuts.
              </div>
            </div>
          </button>
              <div className="clipboard-shelf-config-row mt-xs" onClick={(e) => e.stopPropagation()}>
                <div className="clipboard-segmented-group">
                  <span className="clipboard-segmented-label">Dock</span>
                  <div className="clipboard-sub-segment">
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${(snapshot?.settings.horizontalPosition ?? "bottom") === "bottom" ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ layout: "horizontal", horizontalPosition: "bottom" }))}
                    >
                      Bottom
                    </button>
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${snapshot?.settings.horizontalPosition === "top" ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ layout: "horizontal", horizontalPosition: "top" }))}
                    >
                      Top
                    </button>
                  </div>
                </div>

                <div className="clipboard-segmented-group">
                  <span className="clipboard-segmented-label">Scroll</span>
                  <div className="clipboard-sub-segment">
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${(snapshot?.settings.scrollDirection ?? "horizontal") === "horizontal" ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ scrollDirection: "horizontal" }))}
                      title="Horizontal scroll orientation"
                    >
                      Horizontal
                    </button>
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${snapshot?.settings.scrollDirection === "vertical" ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ scrollDirection: "vertical" }))}
                      title="Vertical scroll orientation"
                    >
                      Vertical
                    </button>
                  </div>
                </div>

                <div className="clipboard-segmented-group">
                  <span className="clipboard-segmented-label">Rows</span>
                  <div className="clipboard-sub-segment">
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${(snapshot?.settings.gridRows ?? 1) === 1 ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ gridRows: 1 }))}
                      title="1 Row"
                    >
                      1
                    </button>
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${(snapshot?.settings.gridRows ?? 1) === 2 ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ gridRows: 2 }))}
                      title="2 Rows"
                    >
                      2
                    </button>
                    <button
                      type="button"
                      className={`clipboard-pos-pill-btn ${(snapshot?.settings.gridRows ?? 1) === 3 ? "is-active" : ""}`}
                      onClick={() => apply(window.electronAPI!.clipboard.setSettings({ gridRows: 3 }))}
                      title="3 Rows"
                    >
                      3
                    </button>
                  </div>
                </div>
              </div>
          </div>

          {/* Layout 2: Centered Spotlight */}
          <button
            type="button"
            className={`nav-layout-card${snapshot?.settings.layout === "center" ? " is-selected" : ""}`}
            role="radio"
            aria-checked={snapshot?.settings.layout === "center"}
            aria-label="Centered Spotlight layout"
            onClick={() => {
              apply(window.electronAPI!.clipboard.setSettings({ layout: "center" }));
            }}
          >
            {snapshot?.settings.layout === "center" && (
              <div className="nav-layout-badge">
                <Check size={12} weight="bold" />
              </div>
            )}

            <div className="nav-wireframe-stage">
              <div className="nav-wireframe-window">
                <div className="nav-wireframe-header">
                  <div className="nav-wireframe-dot" />
                  <div className="nav-wireframe-line w-40" />
                </div>
                <div className="nav-wireframe-body center-modal-body">
                  <div className="nav-wireframe-spotlight-box">
                    <div className="nav-wireframe-spotlight-search" />
                    <div className="nav-wireframe-spotlight-grid">
                      <div className="nav-wireframe-spotlight-tile is-active" />
                      <div className="nav-wireframe-spotlight-tile" />
                      <div className="nav-wireframe-spotlight-tile" />
                      <div className="nav-wireframe-spotlight-tile" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-layout-info">
              <div className="nav-layout-title">Centered Spotlight</div>
              <div className="nav-layout-desc">
                Center-screen focused palette with instant search, structured multi-column card grid, and quick actions.
              </div>
            </div>
          </button>

          {/* Layout 3: Right-Side Flyout */}
          <button
            type="button"
            className={`nav-layout-card${snapshot?.settings.layout === "right" ? " is-selected" : ""}`}
            role="radio"
            aria-checked={snapshot?.settings.layout === "right"}
            aria-label="Right-Side Flyout layout"
            onClick={() => {
              apply(window.electronAPI!.clipboard.setSettings({ layout: "right" }));
            }}
          >
            {snapshot?.settings.layout === "right" && (
              <div className="nav-layout-badge">
                <Check size={12} weight="bold" />
              </div>
            )}

            <div className="nav-wireframe-stage">
              <div className="nav-wireframe-window">
                <div className="nav-wireframe-header">
                  <div className="nav-wireframe-dot" />
                  <div className="nav-wireframe-line w-40" />
                </div>
                <div className="nav-wireframe-body right-flyout-body">
                  <div className="nav-wireframe-main-empty" />
                  <div className="nav-wireframe-right-drawer">
                    <div className="nav-wireframe-drawer-search" />
                    <div className="nav-wireframe-drawer-item is-active" />
                    <div className="nav-wireframe-drawer-item" />
                    <div className="nav-wireframe-drawer-item" />
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-layout-info">
              <div className="nav-layout-title">Right-Side Flyout</div>
              <div className="nav-layout-desc">
                Vertical slide-over drawer anchored to the right display margin, matching Windows Clipboard and sidebar workflows.
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Settings Grid Section */}
      <section className="clipboard-settings-section">
        <h3 className="clipboard-section-heading">Clipboard Rules & Storage</h3>

        <div className="clipboard-settings-grid">
          {/* Card 1: Capture Rules */}
          <div className="clipboard-settings-card">
            <div className="clipboard-card-head">
              <div className="clipboard-card-icon">
                <FileText size={18} weight="bold" />
              </div>
              <div>
                <h4>Capture Types</h4>
                <p>Select which clipboard formats to track automatically.</p>
              </div>
            </div>

            <div className="clipboard-toggle-list">
              <label className="clipboard-toggle-row">
                <span>Plain Text & Formatted Copy</span>
                <input
                  type="checkbox"
                  checked={snapshot?.settings.captureText !== false}
                  onChange={(e) => apply(window.electronAPI!.clipboard.setSettings({ captureText: e.target.checked }))}
                />
              </label>
              <label className="clipboard-toggle-row">
                <span>Images & Screenshots</span>
                <input
                  type="checkbox"
                  checked={snapshot?.settings.captureImages !== false}
                  onChange={(e) => apply(window.electronAPI!.clipboard.setSettings({ captureImages: e.target.checked }))}
                />
              </label>
              <label className="clipboard-toggle-row">
                <span>File Paths & Folder Selections</span>
                <input
                  type="checkbox"
                  checked={snapshot?.settings.captureFiles !== false}
                  onChange={(e) => apply(window.electronAPI!.clipboard.setSettings({ captureFiles: e.target.checked }))}
                />
              </label>
              <label className="clipboard-toggle-row">
                <span>URLs & Web Links</span>
                <input
                  type="checkbox"
                  checked={snapshot?.settings.captureLinks !== false}
                  onChange={(e) => apply(window.electronAPI!.clipboard.setSettings({ captureLinks: e.target.checked }))}
                />
              </label>
            </div>
          </div>

          {/* Card 2: History Limits & Storage */}
          <div className="clipboard-settings-card">
            <div className="clipboard-card-head">
              <div className="clipboard-card-icon">
                <HardDrives size={18} weight="bold" />
              </div>
              <div>
                <h4>History Capacity</h4>
                <p>Control maximum history size and auto-pruning rules.</p>
              </div>
            </div>

            <div className="clipboard-form-group">
              <label>Maximum Items in History</label>
              <AppSelect
                value={String(snapshot?.settings.maxItems ?? 100)}
                options={MAX_ITEMS_OPTIONS}
                onChange={(val) => {
                  apply(window.electronAPI!.clipboard.setSettings({ maxItems: parseInt(val, 10) }));
                  toast(`Max history set to ${val} items`, "info");
                }}
              />
            </div>

            <div className="clipboard-form-group">
              <label>Automatic Retention</label>
              <AppSelect
                value={snapshot?.settings.retentionDays ? String(snapshot.settings.retentionDays) : "indefinite"}
                options={RETENTION_OPTIONS}
                onChange={(val) => {
                  if (val !== "indefinite" && !confirm("Apply automatic retention? Older unpinned clips will be removed. Pinned clips are kept.")) return;
                  apply(window.electronAPI!.clipboard.setSettings({ retentionDays: val === "indefinite" ? 0 : Number(val) as 7 | 30 }));
                }}
              />
            </div>

            <div className="clipboard-card-footer-action">
              <Button
                variant="secondary"
                icon="trash"
                onClick={() => {
                  if (confirm("Clear all unpinned clipboard items? Pinned items will be preserved.")) {
                    apply(window.electronAPI!.clipboard.clearUnpinned());
                    toast("Unpinned clips cleared", "info");
                  }
                }}
              >
                Clear Unpinned History
              </Button>
            </div>
          </div>

          {/* Card 3: Security & Privacy */}
          <div className="clipboard-settings-card">
            <div className="clipboard-card-head">
              <div className="clipboard-card-icon">
                <ShieldCheck size={18} weight="bold" />
              </div>
              <div>
                <h4>Security & Privacy</h4>
                <p>Skip protected formats and known password-manager applications. Not all sensitive copies can be detected.</p>
              </div>
            </div>

            <div className="clipboard-toggle-list">
              <label className="clipboard-toggle-row">
                <div>
                  <strong>Ignore Password Managers</strong>
                  <small>1Password, Bitwarden, KeePass, Dashlane</small>
                </div>
                <input
                  type="checkbox"
                  checked={snapshot?.settings.ignorePasswordManagers !== false}
                  onChange={(e) => apply(window.electronAPI!.clipboard.setSettings({ ignorePasswordManagers: e.target.checked }))}
                />
              </label>
              <div className="clipboard-toggle-row">
                <div>
                  <strong>Private browsing</strong>
                  <small>Windows does not reliably identify incognito copies. Pause capture before copying sensitive content.</small>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Theme & Accent Synchronization */}
          <div className="clipboard-settings-card">
            <div className="clipboard-card-head">
              <div className="clipboard-card-icon">
                <Palette size={18} weight="bold" />
              </div>
              <div>
                <h4>Theme & Appearance</h4>
                <p>Synchronize colors and dark/light modes with KeyFlow.</p>
              </div>
            </div>

            <div className="clipboard-toggle-list">
              <label className="clipboard-toggle-row">
                <div>
                  <strong>Reflect KeyFlow Accent Color</strong>
                  <small>When off, the clipboard overlay uses neutral theme styling</small>
                </div>
                <input
                  type="checkbox"
                  checked={snapshot?.settings.useAppAccentColor !== false}
                  onChange={(e) => {
                    apply(window.electronAPI!.clipboard.setSettings({ useAppAccentColor: e.target.checked }));
                    toast(e.target.checked ? "Accent color sync enabled" : "Accent color sync disabled", "info");
                  }}
                />
              </label>
              <div className="clipboard-form-group">
                <label>Default Shelf Scroll Orientation</label>
                <AppSelect
                  value={snapshot?.settings.scrollDirection ?? "horizontal"}
                  options={[
                    { value: "horizontal", label: "Horizontal Scroll" },
                    { value: "vertical", label: "Vertical Scroll" },
                  ]}
                  onChange={(val) => {
                    apply(window.electronAPI!.clipboard.setSettings({ scrollDirection: val as ClipboardScrollDirection }));
                    toast(`Scroll orientation set to ${val}`, "info");
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      </details>
      {/* Preview Area (replaces Recent Clips & Format Inspector) */}
      <section className="clipboard-inspector-section">
        <div className="clipboard-inspector-section-head">
          <div>
            <h3 className="clipboard-section-heading">Your clipboard</h3>
            <p className="clipboard-section-desc">
              Search your history, inspect a clip, or preview the popup layout.
            </p>
          </div>

          <div className="clipboard-preview-area-toggle-row" role="tablist">
            <button
              type="button"
              className={`clipboard-preview-mode-btn ${previewAreaTab === "layout" ? "is-active" : ""}`}
              onClick={() => setPreviewAreaTab("layout")}
              role="tab"
              aria-selected={previewAreaTab === "layout"}
            >
              <Eye size={15} weight="bold" />
              <span>Layout Live Preview</span>
              <span className="clipboard-preview-badge">
                {(snapshot?.settings.layout ?? "horizontal") === "horizontal"
                  ? `Horizontal (${snapshot?.settings.horizontalPosition ?? "bottom"})`
                  : snapshot?.settings.layout === "center"
                  ? "Centered Spotlight"
                  : "Right-Side Flyout"}
              </span>
            </button>
            <button
              type="button"
              className={`clipboard-preview-mode-btn ${previewAreaTab === "clips" ? "is-active" : ""}`}
              onClick={() => setPreviewAreaTab("clips")}
              role="tab"
              aria-selected={previewAreaTab === "clips"}
            >
              <ClipboardText size={15} weight="bold" />
              <span>Clips & Formats ({filtered.length})</span>
            </button>
          </div>
        </div>

        {previewAreaTab === "layout" ? (
          <div className="clipboard-preview-box">
            <div className="clipboard-live-stage-header">
              <div className="clipboard-live-stage-dots">
                <span className="stage-dot" />
                <span className="stage-dot" />
                <span className="stage-dot" />
              </div>
              <span className="clipboard-live-stage-title">
                Active Architecture: <strong>{(snapshot?.settings.layout ?? "horizontal") === "horizontal" ? "Horizontal Shelf" : snapshot?.settings.layout === "center" ? "Centered Spotlight" : "Right-Side Flyout"}</strong>
              </span>
              <Button
                variant="primary"
                size="sm"
                icon="arrow-square-out"
                onClick={openFloatingShelf}
              >
                Launch Overlay (Test)
              </Button>
            </div>

            <div className="clipboard-live-screen-mockup">
              {(snapshot?.settings.layout ?? "horizontal") === "horizontal" && (
                <div className={`clipboard-mockup-horizontal ${(snapshot?.settings.horizontalPosition ?? "bottom") === "top" ? "is-top" : "is-bottom"}`}>
                  <div className="clipboard-mockup-screen-content">
                    <div className="clipboard-mockup-app-window">
                      <div className="mockup-window-titlebar">
                        <div className="mockup-window-controls">
                          <span className="ctrl-dot red" />
                          <span className="ctrl-dot yellow" />
                          <span className="ctrl-dot green" />
                        </div>
                        <span className="mockup-window-title">Workspace — Editor</span>
                      </div>
                      <div className="mockup-window-body">
                        <div className="mockup-line w-40" />
                        <div className="mockup-line w-75" />
                        <div className="mockup-line w-60" />
                        <div className="mockup-line w-50" />
                      </div>
                    </div>
                  </div>

                  {/* The Shelf Overlay Mockup */}
                  <div className="clipboard-mockup-shelf">
                    <div className="clipboard-mockup-shelf-top">
                      <span className="clipboard-mockup-shelf-brand">Clipboard</span>
                      <div className="clipboard-mockup-pin-tab is-active">All</div>
                      {(snapshot?.pinboards ?? []).slice(0, 3).map((b) => (
                        <div key={b.id} className="clipboard-mockup-pin-tab">
                          <span className="mockup-pin-dot" style={{ backgroundColor: b.color || "var(--color-accent)" }} />
                          <span>{b.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className={`clipboard-mockup-shelf-cards rows-${snapshot?.settings.gridRows ?? 1}`}>
                      {((snapshot?.items && snapshot.items.length > 0)
                        ? snapshot.items.slice(0, 8)
                        : [
                            { id: "mock-1", kind: "text" as const, title: "Text Clip", preview: "git checkout -b feature/clipboard", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-2", kind: "url" as const, title: "YouTube Video", preview: "▶ KeyFlow Features", urlMeta: { isYouTube: true }, capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-3", kind: "color" as const, title: "Accent Color", preview: "#4F7CFF", color: "#4F7CFF", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-4", kind: "code" as const, title: "Snippet", preview: "const port = 3000;", capturedAt: Date.now(), pinboardIds: [] },
                          ]
                      ).map((item, idx) => {
                        const isFirst = idx === 0;
                        const isYt = item.kind === "url" && (item as any).urlMeta?.isYouTube;
                        const hasThumb = Boolean((item as any).thumbnailDataUrl || (item as any).urlMeta?.thumbnailUrl);
                        const thumbSrc = (item as any).thumbnailDataUrl || (item as any).urlMeta?.thumbnailUrl;
                        return (
                          <div key={item.id} className={`clipboard-mockup-card ${isFirst ? "is-active" : ""}`}>
                            {item.kind === "color" && item.color ? (
                              <div className="mockup-card-swatch" style={{ backgroundColor: item.color }} />
                            ) : hasThumb ? (
                              <div className="mockup-card-thumb has-img">
                                <img src={thumbSrc} alt="" className="mockup-card-thumb-img" />
                                {isYt && (
                                  <span className="mockup-yt-tag"><Play size={10} weight="fill" /> YT</span>
                                )}
                              </div>
                            ) : isYt ? (
                              <div className="mockup-card-thumb is-youtube">
                                <Play size={14} weight="fill" />
                                <span className="thumb-label">YouTube</span>
                              </div>
                            ) : null}
                            <div className="mockup-card-header">{item.title || item.kind}</div>
                            <div className="mockup-card-body">{item.preview || item.title}</div>
                            <div className="mockup-card-footer">
                              <span>{item.kind === "color" ? "HEX" : item.kind === "image" ? "Image" : item.kind}</span>
                              <span className="mockup-slot">{idx + 1}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="clipboard-mockup-shelf-footer">
                      <span className="mockup-status-hint">Paste <kbd>↵</kbd> • Actions <kbd>Ctrl K</kbd></span>
                      <div className="mockup-bottom-search-bar" title="Search Clips">
                        <MagnifyingGlass size={12} weight="bold" />
                        <span>Search clips...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {snapshot?.settings.layout === "center" && (
                <div className="clipboard-mockup-center">
                  <div className="clipboard-mockup-center-modal">
                    <div className="clipboard-mockup-center-search">
                      <MagnifyingGlass size={14} weight="bold" />
                      <span>Search clips or press Ctrl+K...</span>
                    </div>
                    <div className="clipboard-mockup-center-grid">
                      {((snapshot?.items && snapshot.items.length > 0)
                        ? snapshot.items.slice(0, 6)
                        : [
                            { id: "mock-1", kind: "code" as const, title: "Recent Snippet", preview: "npm run build", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-2", kind: "url" as const, title: "YouTube Video", preview: "youtube.com/watch...", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-3", kind: "color" as const, title: "Color Hex", preview: "#4F7CFF", color: "#4F7CFF", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-4", kind: "image" as const, title: "Screenshot", preview: "1920×1080 PNG", capturedAt: Date.now(), pinboardIds: [] },
                          ]
                      ).map((item, idx) => (
                        <div key={item.id} className={`clipboard-mockup-center-tile ${idx === 0 ? "is-active" : ""}`}>
                          <span className="tile-badge">{idx + 1}</span>
                          <div className="tile-title">{item.title || item.kind}</div>
                          <div className="tile-sub">{item.color || item.preview || item.title}</div>
                        </div>
                      ))}
                    </div>
                    <div className="clipboard-mockup-center-footer">
                      <span>↵ Paste • Esc Dismiss</span>
                      <span className="tile-count">{(snapshot?.items?.length ?? 4)} clips available</span>
                    </div>
                  </div>
                </div>
              )}

              {snapshot?.settings.layout === "right" && (
                <div className="clipboard-mockup-right">
                  <div className="clipboard-mockup-screen-left">
                    <div className="mockup-left-workarea">
                      <div className="mockup-window-titlebar">
                        <div className="mockup-window-controls">
                          <span className="ctrl-dot red" />
                          <span className="ctrl-dot yellow" />
                          <span className="ctrl-dot green" />
                        </div>
                        <span className="mockup-window-title">Active Application</span>
                      </div>
                      <div className="mockup-window-body">
                        <div className="mockup-line w-40" />
                        <div className="mockup-line w-80" />
                        <div className="mockup-line w-60" />
                      </div>
                    </div>
                  </div>
                  <div className="clipboard-mockup-right-drawer">
                    <div className="clipboard-mockup-drawer-head">
                      <MagnifyingGlass size={13} />
                      <span>Filter clips...</span>
                    </div>
                    <div className="clipboard-mockup-drawer-list">
                      {((snapshot?.items && snapshot.items.length > 0)
                        ? snapshot.items.slice(0, 6)
                        : [
                            { id: "mock-1", kind: "text" as const, title: "git status", preview: "git status", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-2", kind: "url" as const, title: "YouTube", preview: "youtube.com/watch...", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-3", kind: "image" as const, title: "UI Diagram 1920x1080", preview: "UI Diagram", capturedAt: Date.now(), pinboardIds: [] },
                            { id: "mock-4", kind: "color" as const, title: "#34C78A", preview: "#34C78A", color: "#34C78A", capturedAt: Date.now(), pinboardIds: [] },
                          ]
                      ).map((item, idx) => {
                        const ItemIco = itemIcon(item.kind as ClipboardKind);
                        return (
                          <div key={item.id} className={`drawer-item ${idx === 0 ? "is-active" : ""}`}>
                            <ItemIco size={14} />
                            <span>{item.title || item.preview}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="clipboard-mockup-drawer-foot">
                      <span>Paste: Double-click or ↵</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="clipboard-live-stage-controls">
              <div className="clipboard-stage-note">
                {(snapshot?.settings.layout ?? "horizontal") === "horizontal" && (
                  <span>Horizontal shelf ribbon docked at <strong>{(snapshot?.settings.horizontalPosition ?? "bottom") === "top" ? "top of display" : "bottom of display"}</strong> with fluid card sliding and collapsible search pill on the bottom right.</span>
                )}
                {snapshot?.settings.layout === "center" && (
                  <span>Centered Spotlight modal floating in the screen center with search palette and multi-card grid.</span>
                )}
                {snapshot?.settings.layout === "right" && (
                  <span>Vertical slide-over drawer anchored to the right display edge matching Windows sidebar workflows.</span>
                )}
              </div>
              {(snapshot?.settings.layout ?? "horizontal") === "horizontal" && (
                <div className="clipboard-pos-toggle-wrap">
                  <button
                    type="button"
                    className={`clipboard-pos-pill-btn ${(snapshot?.settings.horizontalPosition ?? "bottom") === "bottom" ? "is-active" : ""}`}
                    onClick={() => apply(window.electronAPI!.clipboard.setSettings({ layout: "horizontal", horizontalPosition: "bottom" }))}
                  >
                    Dock Bottom
                  </button>
                  <button
                    type="button"
                    className={`clipboard-pos-pill-btn ${snapshot?.settings.horizontalPosition === "top" ? "is-active" : ""}`}
                    onClick={() => apply(window.electronAPI!.clipboard.setSettings({ layout: "horizontal", horizontalPosition: "top" }))}
                  >
                    Dock Top
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Self-Contained Master-Detail Inspector with Fixed Default Width */
          <div className="clipboard-contained-inspector">
            {/* Left Column: Fixed Default Width Box (340px) */}
            <aside className="clipboard-contained-master-box" aria-label="Clipboard clips list">
              <div className="clipboard-contained-master-head">
                <span>Clips ({filtered.length})</span>
                <span className="clipboard-contained-hint">Click to inspect</span>
              </div>

              {/* Dedicated Filter Sub-Bar: Full breathing room */}
              <div className="clipboard-master-filter-row">
                <div className="clipboard-search-pill-sm">
                  <MagnifyingGlass size={13} />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter clips..."
                    aria-label="Filter clips"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} aria-label="Clear filter">
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="clipboard-kind-select-wrapper">
                  <AppSelect
                    value={kindFilter}
                    options={KIND_OPTIONS}
                    onChange={setKindFilter}
                  />
                </div>
              </div>

              <div className="clipboard-contained-master-scroll">
                {filtered.length === 0 ? (
                  <div className="clipboard-contained-empty">
                    <ClipboardText size={28} />
                    <span>No matching items</span>
                  </div>
                ) : (
                  filtered.map((item) => {
                    const ItemIcon = itemIcon(item.kind);
                    const active = item.id === (selected?.id ?? filtered[0]?.id);

                    // Helpful subtitle without sentence duplication
                    const subtitle = item.kind === "color" && item.color
                      ? item.color
                      : item.kind === "url"
                      ? (item.urlMeta?.domain || "Web Link")
                      : item.kind === "files"
                      ? `${item.fileCount || 1} file${(item.fileCount || 1) > 1 ? "s" : ""}`
                      : item.kind === "image" && item.dimensions
                      ? `${item.dimensions.width}×${item.dimensions.height}`
                      : item.preview
                      ? `${item.preview.length} chars`
                      : item.kind;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`clipboard-contained-item ${active ? "is-active" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                        draggable
                        onDragStart={() => window.electronAPI?.clipboard.startDrag(item.id)}
                      >
                        <div
                          className="clipboard-contained-item-icon"
                          style={item.color ? { backgroundColor: item.color } : undefined}
                        >
                          {item.kind === "color" ? null : item.thumbnailDataUrl ? (
                            <img
                              src={item.thumbnailDataUrl}
                              alt=""
                              className="clipboard-contained-item-thumb"
                            />
                          ) : (
                            <ItemIcon size={16} />
                          )}
                        </div>
                        <div className="clipboard-contained-item-info">
                          <strong>{item.title || item.preview || item.kind}</strong>
                          <small>
                            {item.sourceApp ? `${item.sourceApp} • ` : ""}
                            {subtitle}
                          </small>
                        </div>
                        <div className="clipboard-contained-item-meta">
                          <time>{relativeTime(item.capturedAt)}</time>
                          {item.pinned && (
                            <PushPin size={12} weight="fill" className="clipboard-pinned-star" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Right Column: Detail Inspector */}
            <main className="clipboard-contained-detail-box" aria-label="Clip details inspector">
              {detail ? (
                <div className="clipboard-detail-content">
                  {/* Header Row */}
                  <header className="clipboard-detail-header-row">
                    <div className="clipboard-detail-titles">
                      <div className="clipboard-detail-kind-pill">
                        <span>{detail.kind}</span>
                        {detail.sourceApp && (
                          <span className="clipboard-detail-app-pill">{detail.sourceApp}</span>
                        )}
                        {detail.pinned && (
                          <span className="clipboard-detail-app-pill">Pinned</span>
                        )}
                      </div>
                      <h4>{detail.title}</h4>
                      <span className="clipboard-detail-sub">
                        {relativeTime(detail.capturedAt)}
                        {detail.copyCount > 1 && ` • copied ${detail.copyCount}×`}
                        {detail.bytes ? ` • ${formatBytes(detail.bytes)}` : ""}
                      </span>
                    </div>

                    <div className="clipboard-detail-actions-deck">
                      <Button
                        variant="primary"
                        icon="arrow-square-out"
                        onClick={() => handlePaste(detail.id)}
                      >
                        Paste
                      </Button>
                      <Button
                        variant="secondary"
                        icon="copy"
                        onClick={() => handleCopy(detail.id)}
                      >
                        Copy
                      </Button>
                      <button
                        type="button"
                        className={`clipboard-icon-btn ${detail.pinned ? "is-pinned" : ""}`}
                        onClick={() => apply(window.electronAPI!.clipboard.setPinned(detail.id, !detail.pinned))}
                        title={detail.pinned ? "Unpin" : "Pin"}
                        aria-label="Toggle pin"
                      >
                        <PushPin size={16} weight={detail.pinned ? "fill" : "regular"} />
                      </button>
                      <button
                        type="button"
                        className="clipboard-icon-btn is-danger"
                        onClick={() => apply(window.electronAPI!.clipboard.delete(detail.id))}
                        title="Delete"
                        aria-label="Delete clip"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </header>

                  {/* Inspector Tabs */}
                  <div className="clipboard-contained-tabs" role="tablist">
                    <button
                      type="button"
                      className={`clipboard-contained-tab ${inspectorTab === "preview" ? "is-active" : ""}`}
                      onClick={() => setInspectorTab("preview")}
                      role="tab"
                      aria-selected={inspectorTab === "preview"}
                    >
                      <Eye size={14} />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      className={`clipboard-contained-tab ${inspectorTab === "meta" ? "is-active" : ""}`}
                      onClick={() => setInspectorTab("meta")}
                      role="tab"
                      aria-selected={inspectorTab === "meta"}
                    >
                      <ClipboardText size={14} />
                      <span>Metadata</span>
                    </button>
                    <button
                      type="button"
                      className={`clipboard-contained-tab ${inspectorTab === "probe" ? "is-active" : ""}`}
                      onClick={() => {
                        setInspectorTab("probe");
                        void handleProbeFormats();
                      }}
                      role="tab"
                      aria-selected={inspectorTab === "probe"}
                    >
                      <Lightning size={14} />
                      <span>Formats Probe</span>
                    </button>
                  </div>

                  {/* Tab Body */}
                  <div className="clipboard-contained-tab-body">
                    {inspectorTab === "preview" && (
                      <div className="clipboard-preview-pane">
                        {detail.imageDataUrl ? (
                          <div className="clipboard-image-preview-frame">
                            <img src={detail.imageDataUrl} alt={detail.title} />
                          </div>
                        ) : detail.kind === "color" && detail.color ? (
                          <div className="clipboard-color-preview-frame">
                            <div
                              className="clipboard-swatch-large"
                              style={{ backgroundColor: detail.color }}
                            />
                            <div className="clipboard-color-meta-row">
                              <code>HEX: {detail.color}</code>
                              <Button
                                variant="secondary"
                                icon="copy"
                                onClick={() => {
                                  navigator.clipboard.writeText(detail.color!);
                                  toast("HEX code copied", "success");
                                }}
                              >
                                Copy HEX
                              </Button>
                            </div>
                          </div>
                        ) : detail.paths && detail.paths.length > 0 ? (
                          <div className="clipboard-files-list">
                            <span className="clipboard-files-heading">
                              Files in transfer ({detail.paths.length}):
                            </span>
                            <ul>
                              {detail.paths.map((p) => (
                                <li key={p}>
                                  <File size={15} />
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : detail.kind === "url" ? (
                          <div className="clipboard-url-preview-card">
                            {detail.urlMeta?.thumbnailUrl && (
                              <div className="clipboard-url-thumb-banner">
                                <img
                                  src={detail.urlMeta.thumbnailUrl}
                                  alt=""
                                  className="clipboard-url-thumb-img"
                                  loading="lazy"
                                />
                                {detail.urlMeta.isYouTube && (
                                  <span className="clipboard-url-yt-badge">
                                    <Play size={12} weight="fill" />
                                    <span>YouTube</span>
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="clipboard-url-top-row">
                              <span className="clip-link-domain-badge">
                                <Globe size={14} weight="bold" />
                                <span>{detail.urlMeta?.domain || detail.title}</span>
                              </span>
                              {detail.urlMeta?.siteName && (
                                <span className="clipboard-url-sitename">{detail.urlMeta.siteName}</span>
                              )}
                            </div>
                            <h4 className="clipboard-url-headline">{detail.urlMeta?.title || detail.title}</h4>
                            <p className="clipboard-url-desc">
                              {detail.urlMeta?.description || detail.preview || detail.url || detail.text}
                            </p>
                            <div className="clipboard-url-link-bar">
                              <code className="clipboard-url-raw">{detail.url || detail.text}</code>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon="arrow-square-out"
                                onClick={() => {
                                  const target = detail.url || detail.text || detail.title;
                                  void window.electronAPI?.executeAction?.({
                                    type: "openWebsite",
                                    payload: { url: target },
                                  });
                                }}
                              >
                                {detail.urlMeta?.isYouTube ? "Play on YouTube" : "Open in Browser ↗"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <pre className="clipboard-text-pre">
                            <code>{detail.text || detail.preview || "No preview available"}</code>
                          </pre>
                        )}
                      </div>
                    )}

                    {inspectorTab === "meta" && (
                      <div className="clipboard-meta-pane">
                        <dl className="clipboard-meta-grid">
                          <div>
                            <dt>Captured</dt>
                            <dd>{new Date(detail.capturedAt).toLocaleString()}</dd>
                          </div>
                          <div>
                            <dt>Source App</dt>
                            <dd>{detail.sourceApp || "Unknown"}</dd>
                          </div>
                          <div>
                            <dt>Kind</dt>
                            <dd>{detail.kind}</dd>
                          </div>
                          <div>
                            <dt>Pinned Status</dt>
                            <dd>{detail.pinned ? "Pinned" : "Unpinned"}</dd>
                          </div>
                          <div>
                            <dt>Copy Count</dt>
                            <dd>{detail.copyCount} times</dd>
                          </div>
                          <div>
                            <dt>Size</dt>
                            <dd>{formatBytes(detail.bytes) || "—"}</dd>
                          </div>
                        </dl>
                      </div>
                    )}

                    {inspectorTab === "probe" && (
                      <div className="clipboard-probe-pane">
                        <div className="clipboard-probe-header">
                          <div>
                            <strong>Live Win32 Formats</strong>
                            <p>Native formats currently held in the Windows Clipboard.</p>
                          </div>
                          <Button
                            variant="secondary"
                            icon="arrows-clockwise"
                            onClick={handleProbeFormats}
                            disabled={probeLoading}
                          >
                            Refresh
                          </Button>
                        </div>

                        {probeLoading ? (
                          <div className="clipboard-probe-loading">Probing formats...</div>
                        ) : formatsProbe.length === 0 ? (
                          <div className="clipboard-probe-empty">
                            No probe data available. Copy content to inspect.
                          </div>
                        ) : (
                          <table className="clipboard-probe-table">
                            <thead>
                              <tr>
                                <th>Format ID / Name</th>
                                <th>Buffer Size</th>
                              </tr>
                            </thead>
                            <tbody>
                              {formatsProbe.map((f, i) => (
                                <tr key={i}>
                                  <td><code>{f.format}</code></td>
                                  <td>{f.size !== undefined ? `${f.size} bytes` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="clipboard-contained-empty-detail">
                  <Eye size={36} />
                  <p>Select a clip from the list on the left to inspect its preview and metadata.</p>
                </div>
              )}
            </main>
          </div>
        )}
      </section>
    </div>
  );
}
