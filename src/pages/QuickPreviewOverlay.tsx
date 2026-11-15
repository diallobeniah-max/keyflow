import React, { useState, useEffect, useCallback } from "react";
import { X, ArrowSquareOut, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowCounterClockwise } from "@phosphor-icons/react";
import "../design/quick-preview-overlay.css";
import { useStore } from "../store/useStore";
import { QuickPreviewPdf } from "../components/QuickPreviewPdf";
import { matchesPreviewKey } from "../lib/quick-preview-key";

interface PreviewFileInfo {
  path: string;
  name: string;
  ext: string;
  sizeMb: number;
  kind: "image" | "pdf" | "text" | "document" | "audio" | "video" | "archive" | "unsupported";
  dataUrl?: string;
  streamUrl?: string;
  thumbnailSource?: "embedded" | "windows";
  archive?: { entries: Array<{name:string;size:number;directory:boolean}>; total:number; truncated:boolean };
  textContent?: string;
}

function KbdKey({ children }: { children: React.ReactNode }) {
  return <kbd className="qpo-kbd">{children}</kbd>;
}

export function QuickPreviewOverlay() {
  const [info, setInfo] = useState<PreviewFileInfo | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState(false);
  const previewSettings = useStore(s => s.data.settings.quickPreview);

  useEffect(() => {
    const unsubLoad = window.electronAPI?.quickPreview?.onPreviewLoad?.((fileInfo: PreviewFileInfo) => {
      setInfo(fileInfo);
      setLoading(false);
      setContentError(false);
      setImageZoom(1);
    });
    const unsubClose = window.electronAPI?.quickPreview?.onPreviewClose?.(() => {
      setInfo(null);
      setLoading(true);
    });
    // Signal only after the listeners are attached so the first file cannot be lost.
    window.electronAPI?.quickPreview?.notifyReady?.();
    return () => {
      unsubLoad?.();
      unsubClose?.();
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "AUDIO", "VIDEO"].includes(target?.tagName ?? "");
      if (e.key === "Escape" && previewSettings?.closeWithEscape !== false) {
        e.preventDefault();
        handleClose();
        return;
      }
      if (editing || e.repeat) return;
      if (matchesPreviewKey(previewSettings?.shortcut ?? "Space", e)) {
        e.preventDefault(); handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [previewSettings?.shortcut, previewSettings?.closeWithEscape]);

  const handleClose = useCallback(() => {
    void window.electronAPI?.quickPreview?.closePreview?.();
  }, []);

  const handleOpenDefault = useCallback(() => {
    if (info?.path) {
      void window.electronAPI?.quickPreview?.openWithDefaultApp?.(info.path);
    }
  }, [info]);

  const zoomIn = () => setImageZoom((z) => Math.min(z + 0.25, 5));
  const zoomOut = () => setImageZoom((z) => Math.max(z - 0.25, 0.1));
  const zoomReset = () => setImageZoom(1);

  const renderContent = () => {
    if (loading || !info) {
      return (
        <div className="qpo-loading" role="status" aria-label="Loading preview">
          <div className="qpo-spinner" />
          <span>Loading preview…</span>
        </div>
      );
    }

    switch (info.kind) {
      case "image":
        return (info.dataUrl || info.streamUrl) && !contentError ? (
          <div className="qpo-image-scroll-wrap">
            <div
              className="qpo-image-inner"
              style={{ transform: `scale(${imageZoom})`, transformOrigin: "center center" }}
            >
              <img
                src={info.dataUrl ?? info.streamUrl}
                alt={info.name}
                className="qpo-image"
                draggable={false}
                onError={() => setContentError(true)}
              />
              {info.thumbnailSource && <span className="qpo-thumbnail-notice">{info.thumbnailSource === "windows" ? "Windows thumbnail preview" : "Embedded thumbnail preview"}</span>}
            </div>
          </div>
        ) : (
          <div className="qpo-unsupported" role="status">
            <span className="qpo-unsupported-icon" aria-hidden="true">🖼️</span>
            <p className="qpo-unsupported-name">{info.name}</p>
            <p className="qpo-unsupported-hint">
              This image could not be displayed ({info.sizeMb.toFixed(1)} MB).
            </p>
            <p className="qpo-unsupported-hint">Use "Open with default app" to view.</p>
          </div>
        );

      case "pdf":
        return info.streamUrl ? <QuickPreviewPdf url={info.streamUrl} /> : <p role="alert">PDF preview is unavailable.</p>;

      case "text":
        return (
          <div className="qpo-text-wrap">
            <pre className="qpo-text-content">
              {info.textContent ?? "(No content — file may be empty or unreadable.)"}
            </pre>
          </div>
        );

      case "document":
        return info.textContent !== undefined ? (
          <div className="qpo-text-wrap">
            <p className="qpo-unsupported-hint">Text extracted from Word. Layout and images are not shown.</p>
            <pre className="qpo-text-content">{info.textContent || "(This document contains no readable text.)"}</pre>
          </div>
        ) : <div className="qpo-unsupported" role="status"><p className="qpo-unsupported-name">{info.name}</p><p className="qpo-unsupported-hint">This Word document could not be read. Use “Open with default app” to view it.</p></div>;

      case "archive":
        return info.archive ? (
          <div className="qpo-archive" aria-label="Archive contents">
            <p className="qpo-archive-summary">{info.archive.total} {info.archive.total === 1 ? "item" : "items"}{info.archive.truncated ? " · showing the first 1,000" : ""}</p>
            <ul className="qpo-archive-list">
              {info.archive.entries.map((entry, index) => <li key={`${index}:${entry.name}`}><span>{entry.name}</span><span>{entry.directory ? "Folder" : `${(entry.size / 1024).toFixed(1)} KB`}</span></li>)}
            </ul>
          </div>
        ) : <div className="qpo-unsupported" role="status"><p className="qpo-unsupported-name">{info.name}</p><p className="qpo-unsupported-hint">This archive could not be read. Use “Open with default app” to view it.</p></div>;

      case "audio":
        return (
          <div className="qpo-media-wrap">
            <div className="qpo-audio-icon" aria-hidden="true">🎵</div>
            <p className="qpo-audio-name">{info.name}</p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              controls
              className="qpo-audio-player"
              src={info.streamUrl}
              onError={() => setContentError(true)}
            >
              Codec not supported in this runtime — use "Open with default app".
            </audio>
            <p className="qpo-unsupported-hint">
              {contentError ? "This audio format could not be played. Use Open with default app." : "Codec support depends on the Electron runtime."}
            </p>
          </div>
        );

      case "video":
        return (
          <div className="qpo-media-wrap">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              className="qpo-video-player"
              src={info.streamUrl}
              onError={() => setContentError(true)}
            >
              Codec not supported in this runtime — use "Open with default app".
            </video>
            <p className="qpo-unsupported-hint">
              {contentError ? "This video format could not be played. Use Open with default app." : "Codec support depends on the Electron runtime. MKV and AVI may not play."}
            </p>
          </div>
        );

      default:
        return (
          <div className="qpo-unsupported" role="status">
            <span className="qpo-unsupported-icon" aria-hidden="true">📄</span>
            <p className="qpo-unsupported-name">{info.name}</p>
            <p className="qpo-unsupported-hint">
              <strong>{info.ext || "Unknown format"}</strong> is not supported for inline preview.
              {info.sizeMb > 0 ? ` File size: ${info.sizeMb.toFixed(1)} MB.` : ""}
            </p>
            <p className="qpo-unsupported-hint">
              Click "Open with default app" to open this file normally.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="qpo-root" data-theme="dark" role="dialog" aria-label="Quick Preview">
      {/* Title bar — draggable */}
      <div className="qpo-titlebar" aria-label="Preview title bar">
        <div className="qpo-titlebar-left" aria-live="polite" aria-atomic="true">
          {info ? (
            <>
              <span className="qpo-file-ext-badge" aria-label="File type">{info.ext || "FILE"}</span>
              <span className="qpo-file-name">{info.name}</span>
              {info.sizeMb > 0 && (
                <span className="qpo-file-size" aria-label={`${info.sizeMb.toFixed(1)} megabytes`}>
                  {info.sizeMb.toFixed(1)} MB
                </span>
              )}
            </>
          ) : (
            <span className="qpo-file-name">Loading…</span>
          )}
        </div>

        <div className="qpo-titlebar-actions" role="toolbar" aria-label="Preview actions">
          {info?.kind === "image" && (info.dataUrl || info.streamUrl) && (
            <>
              <button
                type="button"
                className="qpo-toolbar-btn"
                onClick={zoomOut}
                title="Zoom out"
                aria-label="Zoom out"
                disabled={imageZoom <= 0.1}
              >
                <MagnifyingGlassMinus size={16} aria-hidden="true" />
              </button>
              <span className="qpo-zoom-label" aria-live="polite" aria-atomic="true">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                className="qpo-toolbar-btn"
                onClick={zoomIn}
                title="Zoom in"
                aria-label="Zoom in"
                disabled={imageZoom >= 5}
              >
                <MagnifyingGlassPlus size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="qpo-toolbar-btn"
                onClick={zoomReset}
                title="Reset zoom"
                aria-label="Reset zoom to fit"
              >
                <ArrowCounterClockwise size={16} aria-hidden="true" />
              </button>
              <div className="qpo-toolbar-divider" aria-hidden="true" />
            </>
          )}

          <button
            type="button"
            className="qpo-toolbar-btn"
            onClick={handleOpenDefault}
            title="Open with default app"
            aria-label="Open with default app"
          >
            <ArrowSquareOut size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="qpo-toolbar-btn qpo-close-btn"
            onClick={handleClose}
            title="Close preview (Escape)"
            aria-label="Close preview"
            autoFocus
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="qpo-content">
        {renderContent()}
      </div>
    </div>
  );
}
