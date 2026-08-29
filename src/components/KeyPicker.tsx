import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KEY_GROUPS, keyLabel, searchKeys } from "../lib/keyCatalog";
import { Modal } from "./ui";
import { Icon } from "./Icon";

/**
 * Searchable, grouped key picker. One canonical source of truth for key names
 * shared with physical capture (KeyCapture) — picking here writes the exact
 * same token the native engine understands.
 *
 * Keyboard: type to search, Up/Down to move, Enter to choose, Escape to close.
 */
export function KeyPicker({
  open,
  onClose,
  onPick,
  value,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (key: string) => void;
  value: string;
}) {
  const [q, setQ] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const query = q.trim();
    if (!query) return null;
    return searchKeys(query);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setFocusIdx(0);
      // Focus search when the modal opens (after a frame so the modal mounts).
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const count = results?.length ?? 0;
  useEffect(() => {
    setFocusIdx((i) => Math.min(Math.max(i, 0), Math.max(count - 1, 0)));
  }, [count]);

  const choose = useCallback(
    (key: string) => {
      onPick(key);
      onClose();
    },
    [onPick, onClose]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (results && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => (i + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(results[focusIdx]);
      }
    }
  };

  const renderGroups = () => {
    if (results) {
      if (results.length === 0) {
        return <div className="muted tiny">No keys match “{q}”.</div>;
      }
      return results.map((key, i) => (
        <button
          key={key}
          type="button"
          className={"key-picker-item" + (i === focusIdx ? " is-focused" : "")}
          onMouseEnter={() => setFocusIdx(i)}
          onFocus={() => setFocusIdx(i)}
          onClick={() => choose(key)}
          tabIndex={-1}
        >
          <span className="key-picker-cap">{keyLabel(key)}</span>
          <span className="key-picker-name">{key}</span>
        </button>
      ));
    }

    return KEY_GROUPS.map((group) => (
      <section key={group.id} className="key-picker-group">
        <span className="app-picker-section-title">{group.label}</span>
        <div className="key-picker-chips">
          {group.keys.map((key) => {
            const isSelected = key === value;
            return (
              <button
                key={key}
                type="button"
                className={"key-picker-chip" + (isSelected ? " is-selected" : "")}
                title={isSelected ? `Deselect ${keyLabel(key)}` : `Select ${keyLabel(key)}`}
                onClick={() => choose(isSelected ? "" : key)}
              >
                <span>{keyLabel(key)}</span>
                {isSelected && <span className="key-picker-chip-check">✓</span>}
              </button>
            );
          })}
        </div>
      </section>
    ));
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose a key" width={560} footer={null}>
      <div className="col gap-sm" onKeyDown={onKeyDown}>
        <div className="key-picker-search">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search keys — try caps, tab, right alt, volume, arrow…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFocusIdx(0);
            }}
            aria-label="Search keys"
          />
          {q && (
            <span className="muted tiny">{results?.length ?? 0} {results?.length === 1 ? "match" : "matches"}</span>
          )}
        </div>

        {value && (
          <div className="row gap-sm items-center justify-between py-xs px-sm card border-accent-soft">
            <div className="row gap-xs items-center">
              <span className="tiny muted">Selected Key:</span>
              <span className="chip chip-accent">{keyLabel(value)}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => choose("")}
              title="Deselect key"
            >
              <Icon name="close" size={12} />
              <span>Deselect Key</span>
            </button>
          </div>
        )}

        <div className="key-picker-list" ref={listRef} role="listbox" aria-label="Available keys">
          {renderGroups()}
        </div>
        <div className="muted tiny">
          Tip: you can also press a key physically to capture it, or click a selected key to deselect.
        </div>
      </div>
    </Modal>
  );
}