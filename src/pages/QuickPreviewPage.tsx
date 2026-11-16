import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "../components/Icon";
import { Button, Toggle, SettingsGroup, SettingsRow, PageHeader } from "../components/ui";
import { KeyCapture } from "../components/KeyCapture";
import type { ModifierKey } from "../types";
import { isOsSecuredShortcut } from "../lib/windows-shortcuts-catalog";
import { appliesToExplorer } from "../lib/quick-preview-conflicts";
import "../design/quick-preview.css";

const FORMAT_LIST = [
  {
    icon: "image" as const,
    label: "Images",
    desc: "JPG, PNG, GIF, WebP, BMP, TIFF, SVG, ICO, AVIF",
    verified: true,
  },
  {
    icon: "filePdf" as const,
    label: "PDF",
    desc: "Page-by-page PDF preview. Password-protected or damaged files may not render.",
    verified: true,
  },
  {
    icon: "fileText" as const,
    label: "Text & Code",
    desc: ".txt, .md, .js, .ts, .json, .py, .rs, .go, .css, .html, .log and 25+ more (capped at 512 KB)",
    verified: true,
  },
  {
    icon: "fileText" as const,
    label: "Word documents",
    desc: "DOCX text preview; document layout and images are not shown.",
    verified: true,
  },
  {
    icon: "folder" as const,
    label: "Archives",
    desc: "ZIP and CBZ contents, up to 1,000 entries; files are not extracted.",
    verified: true,
  },
  {
    icon: "speakerHigh" as const,
    label: "Audio",
    desc: "MP3, WAV, OGG, FLAC, AAC, M4A — codec support depends on Electron runtime",
    verified: false,
  },
  {
    icon: "filmSlate" as const,
    label: "Video",
    desc: "MP4, WebM — MP4/H.264 and WebM/VP8-VP9 are most reliable; MKV, AVI may not play",
    verified: false,
  },
];

const LIMITATION_LIST = [
  "The shortcut is active only for a single selected file in the focused File Explorer view. Text entry remains available.",
  "Only the focused File Explorer view is supported. The desktop and virtual shell items are not supported in this version.",
  "Only single-file selection is previewed. Multiple files, folders, and no-selection cases leave Space behavior untouched.",
  "PSD/PSB previews support common RGB, grayscale, CMYK, Lab, indexed-color and bitmap composites. Unprofiled CMYK colors are approximate; unsupported variants may show a thumbnail.",
  "Other Office documents, RAW images, and unsupported formats may show a Windows thumbnail when a compatible provider is installed; otherwise they show a fallback.",
  "Audio and video codec support depends on the bundled Electron runtime version. If a file does not play, use 'Open with default app'.",
  "Some file types have size limits. PSD/PSB composites have dimension and format limits even when the file itself is large.",
];

interface QuickPreviewPageProps {
  onBack?: () => void;
}

export function QuickPreviewPage({ onBack: _onBack }: QuickPreviewPageProps) {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState("Space");
  const [draftMods, setDraftMods] = useState<ModifierKey[]>([]);
  const [bindingError, setBindingError] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [engine, setEngine] = useState<"checking" | "ready" | "unavailable">("checking");
  const [savedBindingValid, setSavedBindingValid] = useState<boolean | null>(null);
  const activeBindings = useMemo(() => {
    const bindings = shortcuts.filter(s => s.enabled && s.profileId === activeProfileId && s.key && !s.mouse && appliesToExplorer(s.appScope))
      .map(s => [...(s.modifiers ?? []), s.key].join("+"));
    if (settings.shortcuts.globalPause) bindings.push(settings.shortcuts.globalPause);
    if (settings.shortcuts.clipboardShortcutEnabled && settings.shortcuts.clipboardShortcut) bindings.push(settings.shortcuts.clipboardShortcut);
    if (settings.shortcuts.altCapsLockBypass !== false) bindings.push("Alt+CapsLock");
    return bindings;
  }, [shortcuts, activeProfileId, settings.shortcuts.globalPause, settings.shortcuts.clipboardShortcutEnabled, settings.shortcuts.clipboardShortcut, settings.shortcuts.altCapsLockBypass]);

  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        const status = await window.electronAPI?.quickPreview?.getStatus();
        if (!active) return;
        setEngine(status === "ready" ? "ready" : status === "starting" ? "checking" : "unavailable");
      } catch { if (active) setEngine("unavailable"); }
    };
    void update();
    const timer = window.setInterval(() => void update(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const qp = settings.quickPreview ?? {
    enabled: false,
    shortcut: "Space",
    closeWithEscape: true,
    openWithDefaultApp: true,
    maxFileSizeMb: 50,
  };

  useEffect(() => {
    let active = true;
    setSavedBindingValid(null);
    void window.electronAPI?.quickPreview?.validateBinding(qp.shortcut, settings.shortcuts.emergencySafe, activeBindings)
      .then(valid => { if (active) setSavedBindingValid(valid); })
      .catch(() => { if (active) setSavedBindingValid(false); });
    return () => { active = false; };
  }, [qp.shortcut, settings.shortcuts.emergencySafe, activeBindings]);

  const isActive = qp.enabled && !paused && !safeMode && engine === "ready" && savedBindingValid === true;

  const handleEnableToggle = (enabled: boolean) => {
    patch("quickPreview", { enabled });
  };

  const handleEscapeToggle = (closeWithEscape: boolean) => {
    patch("quickPreview", { closeWithEscape });
  };
  const beginEditing = () => {
    const numPlus = /(?:^|\+)Num\+$/i.test(qp.shortcut);
    const parts = (numPlus ? qp.shortcut.slice(0, -4) : qp.shortcut).split("+").filter(Boolean);
    setDraftKey(numPlus ? "Num+" : parts.pop() || "Space");
    setDraftMods(parts.filter((part): part is ModifierKey => ["Ctrl", "Alt", "Shift", "Win", "Hyper"].includes(part)));
    setBindingError(false);
    setEditing(true);
  };
  const draftBinding = [...draftMods, draftKey].filter(Boolean).join("+");
  const conflicting = shortcuts.find(s => s.enabled && !s.mouse && appliesToExplorer(s.appScope) && s.profileId === activeProfileId && s.key.toLowerCase() === draftKey.toLowerCase() && [...(s.modifiers ?? [])].sort().join("+") === [...draftMods].sort().join("+"));
  const invalidBinding = !draftKey || draftMods.includes("Hyper") || isOsSecuredShortcut(draftKey, draftMods) || (draftKey === "F12" && ["Ctrl", "Alt", "Shift"].every(m => draftMods.includes(m as ModifierKey)));
  const saveBinding = async () => {
    setSavingBinding(true);
    try {
      if (!await window.electronAPI?.quickPreview?.validateBinding(draftBinding, settings.shortcuts.emergencySafe, activeBindings)) { setBindingError(true); return; }
      patch("quickPreview", { shortcut: draftBinding, shortcutVersion: 1 });
      setEditing(false);
    } catch { setBindingError(true); }
    finally { setSavingBinding(false); }
  };

  return (
    <div className="qp-page-root">
      <div className="qp-page-header">
        <PageHeader title="Quick Preview" description="Preview files instantly without opening an app." usage={`Select one file in File Explorer and press ${qp.shortcut}.`}>
          <div className="qp-page-header-badge-wrap" aria-live="polite" aria-atomic="true">
            {isActive && (
              <span className="qp-status-badge qp-status-badge--active">Active</span>
            )}
            {!qp.enabled && (
              <span className="qp-status-badge qp-status-badge--off">Off</span>
            )}
            {qp.enabled && (paused || safeMode) && (
              <span className="qp-status-badge qp-status-badge--paused">
                {safeMode ? "Safe Mode" : "Paused"}
              </span>
            )}
            {qp.enabled && !paused && !safeMode && !isActive && (
              <span className="qp-status-badge qp-status-badge--paused">{savedBindingValid === false ? "Shortcut unavailable" : engine === "checking" || savedBindingValid === null ? "Starting" : "Unavailable"}</span>
            )}
          </div>
        </PageHeader>

        <p className="qp-page-instruction">
          Select a single file in <strong>File Explorer</strong>, then press{" "}
          <kbd className="qp-kbd">{qp.shortcut}</kbd> to open a floating preview.{" "}
          {qp.closeWithEscape
            ? <>Press <kbd className="qp-kbd">Esc</kbd> or click <kbd className="qp-kbd">✕</kbd> to close.</>
            : <>Press <kbd className="qp-kbd">{qp.shortcut}</kbd> again or click <kbd className="qp-kbd">✕</kbd> to close.</>
          }
        </p>
      </div>

      {/* Two-column body */}
      <div className="qp-page-body">
        {/* Left column — settings */}
        <div className="qp-page-col-left">
          <SettingsGroup
            title="General"
            icon="eye"
            desc="Enable and configure Quick Preview"
            accentColor="cyan"
          >
            <SettingsRow
              id="qp-row-enable"
              title="Enable Quick Preview"
              desc="Activate file preview on shortcut press in File Explorer"
            >
              <Toggle
                checked={qp.enabled}
                onChange={handleEnableToggle}
                aria-label="Enable Quick Preview"
              />
            </SettingsRow>

            <SettingsRow
              id="qp-row-shortcut"
              title="Shortcut"
              desc="Change the Explorer preview shortcut. Space is the default."
            >
              <div className="col gap-sm">
                {!editing ? <div className="row gap-sm"><kbd className="qp-kbd-display">{qp.shortcut}</kbd><Button size="sm" onClick={beginEditing}>Change</Button></div> : <>
                  <KeyCapture value={draftKey} modifiers={draftMods} onChangeKey={key => { setDraftKey(key); setBindingError(false); }} onChangeMods={mods => { setDraftMods(mods); setBindingError(false); }} aria-labelledby="qp-row-shortcut" />
                  {invalidBinding && <span className="muted tiny" role="alert">Choose a supported key combination that Windows and emergency controls do not reserve.</span>}
                  {bindingError && <span className="muted tiny" role="alert">This shortcut is unavailable or conflicts with another shortcut. Choose another combination.</span>}
                  {conflicting && <span className="muted tiny" role="alert">This binding conflicts with {conflicting.name}. Choose another shortcut.</span>}
                  <div className="row gap-sm"><Button size="sm" disabled={invalidBinding || !!conflicting || savingBinding} onClick={() => void saveBinding()}>Save</Button><Button size="sm" variant="ghost" disabled={savingBinding} onClick={() => setEditing(false)}>Cancel</Button></div>
                </>}
              </div>
            </SettingsRow>

            <SettingsRow
              id="qp-row-escape"
              title="Close with Escape"
              desc="Press Escape to dismiss the preview window"
            >
              <Toggle
                checked={qp.closeWithEscape}
                onChange={handleEscapeToggle}
                aria-label="Close preview with Escape key"
              />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup
            title="Limitations"
            icon="warning"
            desc="Read before use to avoid unexpected behavior"
            accentColor="amber"
          >
            <div className="qp-limitations-list" role="list">
              {LIMITATION_LIST.map((item, i) => (
                <div key={i} className="qp-limitation-item" role="listitem">
                  <Icon name="warning" size={13} className="qp-limitation-icon" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </SettingsGroup>
        </div>

        {/* Right column — format info and how-to */}
        <div className="qp-page-col-right">
          <div className="qp-formats-card" role="region" aria-label="Supported formats">
            <div className="qp-formats-header">
              <Icon name="fileText" size={16} aria-hidden="true" />
              <span>Supported Formats</span>
            </div>
            <div className="qp-formats-list" role="list">
              {FORMAT_LIST.map((f) => (
                <div key={f.label} className="qp-format-item" role="listitem">
                  <div className="qp-format-icon" aria-hidden="true">
                    <Icon name={f.icon} size={17} />
                  </div>
                  <div className="qp-format-info">
                    <div className="qp-format-label-row">
                      <span className="qp-format-label">{f.label}</span>
                      {!f.verified && (
                        <span className="qp-format-badge qp-format-badge--unverified" title="Codec-dependent">
                          codec-dependent
                        </span>
                      )}
                    </div>
                    <span className="qp-format-desc">{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="qp-formats-footnote">
              Unsupported files show a fallback with the filename and "Open with default app."
            </p>
          </div>

          <div className="qp-howto-card" role="region" aria-label="How to use Quick Preview">
            <div className="qp-howto-header">
              <Icon name="info" size={15} aria-hidden="true" />
              <span>How to use</span>
            </div>
            <ol className="qp-howto-list">
              <li>Enable Quick Preview using the toggle above.</li>
              <li>Use <strong>Change</strong> above if you prefer another shortcut.</li>
              <li>Open File Explorer and click a single file to select it.</li>
              <li>
                Press <kbd className="qp-kbd">{qp.shortcut}</kbd> — a preview window opens immediately.
              </li>
              <li>
                Press <kbd className="qp-kbd">Esc</kbd> or click <strong>✕</strong> to close.
              </li>
              <li>
                Click <strong>↗</strong> (open with default app) to open the file normally.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
