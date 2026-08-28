import React, { useMemo, useState } from "react";
import { Action, ActionType } from "../types";
import { ACTION_META, HIGHLIGHT_PRESETS, REMAP_TARGETS } from "../lib/constants";
import { Field, Input, Select, Textarea } from "./ui";
import { Icon } from "./Icon";

export interface PrimaryActionDef {
  type: ActionType;
  label: string;
  desc: string;
  icon: string;
  category: string;
}

export const PRIMARY_ACTIONS: PrimaryActionDef[] = [
  { type: "screenshot", label: "Screenshot", desc: "Windows snipping tool or full capture", icon: "screenshot", category: "System" },
  { type: "notesPopup", label: "Notes Popup", desc: "Open floating rich-text desktop notepad", icon: "file", category: "Productivity" },
  { type: "alwaysOnTop", label: "Always on Top", desc: "Pin or toggle active window on top", icon: "pinTop", category: "Window" },
  { type: "toggleWasdNavigation", label: "WASD Navigation Mode", desc: "Use W, A, S and D as arrow keys", icon: "arrows", category: "Navigation" },
  { type: "openApp", label: "Open app", desc: "Launch an application by name or path", icon: "window", category: "Launch" },
  { type: "showPopup", label: "Popup menu", desc: "Show a quick action menu", icon: "popup", category: "Flow" },
  { type: "pasteText", label: "Paste text", desc: "Paste snippets or templates", icon: "clipboard", category: "Text" },
  { type: "mediaControl", label: "Media control", desc: "Play, pause, or skip tracks", icon: "play", category: "Media" },
  { type: "volumeControl", label: "Volume", desc: "Volume up, down, or mute", icon: "volume", category: "Media" },
  { type: "openFolder", label: "Open folder", desc: "Open Documents, Downloads, or custom folder", icon: "folder", category: "Launch" },
  { type: "brightnessControl", label: "Brightness", desc: "Screen brightness up or down", icon: "sun", category: "System" },
  { type: "openWebsite", label: "Open website", desc: "Open a URL in default browser", icon: "globe", category: "Launch" },
  { type: "pressShortcut", label: "Press shortcut", desc: "Send another key combo", icon: "command", category: "Input" },
  { type: "remapKey", label: "Remap key", desc: "Redirect this key to another key", icon: "swap", category: "Input" },
];

export function SimpleActionPicker({
  action,
  onChange,
}: {
  action: Action;
  onChange: (action: Action) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return PRIMARY_ACTIONS;
    const q = search.toLowerCase();
    return PRIMARY_ACTIONS.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [search]);

  const setType = (t: ActionType) => {
    // Preserve relevant payload or initialize sensible defaults
    let newPayload: Action["payload"] = {};
    if (t === "alwaysOnTop") {
      newPayload = { topmostMode: "toggle", highlight: true, highlightColor: "#4F7CFF" };
    } else if (t === "screenshot") {
      newPayload = { screenshotMode: "snipOverlay" };
    } else if (t === "volumeControl") {
      newPayload = { volume: "toggle" };
    } else if (t === "mediaControl") {
      newPayload = { media: "playpause" };
    } else if (t === "brightnessControl") {
      newPayload = { brightness: "up" };
    }
    onChange({ ...action, type: t, payload: newPayload });
  };

  const setPayload = (p: Partial<Action["payload"]>) => {
    onChange({ ...action, payload: { ...action.payload, ...p } });
  };

  const currentType = action.type;
  const isPrimary = PRIMARY_ACTIONS.some((p) => p.type === currentType);

  return (
    <div className="col gap-md">
      <div className="row">
        <Input
          placeholder="Search actions… (e.g. Screenshot, Always on Top, Notepad)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid cols-3 gap-sm" role="radiogroup" aria-label="Action choices">
        {filtered.map((item) => {
          const isSelected = currentType === item.type;
          return (
            <button
              type="button"
              key={item.type}
              role="radio"
              aria-checked={isSelected}
              className={"trigger-card" + (isSelected ? " active" : "")}
              onClick={() => setType(item.type)}
            >
              <Icon name={item.icon} size={20} />
              <b>{item.label}</b>
              <small>{item.desc}</small>
            </button>
          );
        })}
      </div>

      {!isPrimary && (
        <div className="notice info">
          Using custom/advanced action type: <b>{ACTION_META[currentType]?.label ?? currentType}</b>
        </div>
      )}

      {/* Action-specific simple configuration fields */}
      <div className="action-config-box">
        {currentType === "alwaysOnTop" && (
          <div className="col gap-sm">
            <div className="grid cols-2">
              <Field label="Action mode">
                <Select
                  value={action.payload.topmostMode ?? "toggle"}
                  onChange={(v) => setPayload({ topmostMode: v as any })}
                  options={[
                    { value: "toggle", label: "Toggle Always on Top (recommended)" },
                    { value: "pin", label: "Pin on top" },
                    { value: "unpin", label: "Remove Always on Top" },
                  ]}
                />
              </Field>
              <Field label="Highlight border">
                <Select
                  value={action.payload.highlight !== false ? "yes" : "no"}
                  onChange={(v) => setPayload({ highlight: v === "yes" })}
                  options={[
                    { value: "yes", label: "Yes (show colored border)" },
                    { value: "no", label: "No (keep natural window)" },
                  ]}
                />
              </Field>
            </div>
            {action.payload.highlight !== false && (
              <Field label="Highlight color" group>
                <div className="row wrap gap-sm">
                  {HIGHLIGHT_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={"chip clickable" + ((action.payload.highlightColor ?? "#4F7CFF") === p.value ? " active" : "")}
                      aria-pressed={(action.payload.highlightColor ?? "#4F7CFF") === p.value}
                      onClick={() => setPayload({ highlightColor: p.value })}
                    >
                      <span className="color-dot-sm" style={{ background: p.value }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
        )}

        {currentType === "screenshot" && (
          <Field label="Screenshot mode">
            <Select
              value={action.payload.screenshotMode ?? "snipOverlay"}
              onChange={(v) => setPayload({ screenshotMode: v as any })}
              options={[
                { value: "snipOverlay", label: "Windows Snipping Overlay (default)" },
                { value: "fullscreenClip", label: "Copy Full Screen to Clipboard" },
                { value: "fullscreenSave", label: "Save Full Screen to Pictures" },
              ]}
            />
          </Field>
        )}

        {currentType === "openApp" && (
          <Field label="Application name or path">
            <Input
              value={action.payload.path ?? ""}
              placeholder="e.g. notepad.exe, code, chrome.exe, C:\Program Files\App\app.exe"
              onChange={(e) => setPayload({ path: e.target.value })}
            />
          </Field>
        )}

        {(currentType === "openFile" || currentType === "openFolder") && (
          <Field label="Path">
            <Input
              value={action.payload.path ?? ""}
              placeholder="e.g. %USERPROFILE%\Documents or C:\Projects"
              onChange={(e) => setPayload({ path: e.target.value })}
            />
          </Field>
        )}

        {currentType === "openWebsite" && (
          <Field label="Website URL">
            <Input
              value={action.payload.url ?? ""}
              placeholder="https://google.com"
              onChange={(e) => setPayload({ url: e.target.value })}
            />
          </Field>
        )}

        {currentType === "pasteText" && (
          <Field label="Text snippet">
            <Textarea
              rows={3}
              value={action.payload.text ?? ""}
              placeholder="Enter text to paste when triggered…"
              onChange={(e) => setPayload({ text: e.target.value })}
            />
          </Field>
        )}

        {currentType === "mediaControl" && (
          <Field label="Media command">
            <Select
              value={action.payload.media ?? "playpause"}
              onChange={(v) => setPayload({ media: v as any })}
              options={[
                { value: "playpause", label: "Play / Pause" },
                { value: "next", label: "Next track" },
                { value: "prev", label: "Previous track" },
                { value: "stop", label: "Stop playback" },
              ]}
            />
          </Field>
        )}

        {currentType === "volumeControl" && (
          <Field label="Volume command">
            <Select
              value={String(action.payload.volume ?? "toggle")}
              onChange={(v) => setPayload({ volume: v as any })}
              options={[
                { value: "toggle", label: "Toggle mute" },
                { value: "up", label: "Volume up" },
                { value: "down", label: "Volume down" },
                { value: "mute", label: "Mute" },
                { value: "unmute", label: "Unmute" },
              ]}
            />
          </Field>
        )}

        {currentType === "brightnessControl" && (
          <Field label="Brightness adjustment">
            <Select
              value={action.payload.brightness === "down" ? "down" : "up"}
              onChange={(v) => setPayload({ brightness: v as any })}
              options={[
                { value: "up", label: "Increase brightness (+10%)" },
                { value: "down", label: "Decrease brightness (-10%)" },
              ]}
            />
          </Field>
        )}

        {currentType === "pressShortcut" && (
          <Field label="Key combination to send">
            <Input
              value={action.payload.shortcut ?? ""}
              placeholder="e.g. Ctrl+C, Win+V, Alt+Tab"
              onChange={(e) => setPayload({ shortcut: e.target.value })}
            />
          </Field>
        )}

        {currentType === "remapKey" && (
          <Field label="Replacement key" hint="Pressed whenever this shortcut key is used">
            <Select
              value={action.payload.remapTarget ?? ""}
              onChange={(v) => setPayload({ remapTarget: v })}
              options={REMAP_TARGETS}
            />
          </Field>
        )}
      </div>
    </div>
  );
}
