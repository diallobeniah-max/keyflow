import { useEffect, useMemo, useRef, useState, CSSProperties } from "react";
import { Icon } from "../Icon";
import { SlashCommand } from "../../lib/notesSlashCommands";

interface SlashCommandPaletteProps {
  commands: SlashCommand[];
  query: string;
  position: { top: number; left: number };
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandPalette({
  commands,
  query,
  position,
  onSelect,
  onClose,
}: SlashCommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter commands by query matching label, id, hint, or keywords
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter((cmd) => {
      return (
        cmd.label.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q) ||
        cmd.hint.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [commands, query]);

  // Keep selected index valid
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-scroll to selected command item
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (filteredCommands.length ? (prev + 1) % filteredCommands.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (filteredCommands.length ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (filteredCommands[selectedIndex]) {
          onSelect(filteredCommands[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  // Prevent closing when clicking inside
  const handleMouseDown = (e: React.MouseEvent) => {
    // Keep focus inside editor!
    e.preventDefault();
  };

  const style: CSSProperties = {
    top: `${Math.max(10, position.top)}px`,
    left: `${Math.max(10, Math.min(position.left, window.innerWidth - 300))}px`,
  };

  return (
    <div
      ref={containerRef}
      className="slash-command-palette"
      style={style}
      onMouseDown={handleMouseDown}
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="slash-palette-header">
        <div className="row gap-xs items-center">
          <span className="slash-prefix-badge">/</span>
          <span className="slash-query-display">{query || "filter commands…"}</span>
        </div>
        <span className="slash-count-pill">{filteredCommands.length}</span>
      </div>

      <div className="slash-palette-list">
        {filteredCommands.length > 0 ? (
          filteredCommands.map((cmd, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={cmd.id}
                ref={(el) => (itemRefs.current[idx] = el)}
                type="button"
                className={"slash-palette-item" + (isSelected ? " is-selected" : "")}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="slash-item-icon">
                  <Icon name={cmd.icon} size={15} />
                </span>
                <div className="slash-item-text">
                  <span className="slash-item-label">{cmd.label}</span>
                  <span className="slash-item-hint">{cmd.hint}</span>
                </div>
                <span className="slash-item-category">{cmd.category}</span>
              </button>
            );
          })
        ) : (
          <div className="slash-palette-empty">
            <Icon name="search" size={18} className="muted mb-xs" />
            <span>No matching commands</span>
            <span className="tiny muted mt-xs">Try &apos;/text&apos;, &apos;/h1&apos;, &apos;/list&apos;, &apos;/table&apos;</span>
          </div>
        )}
      </div>

      <div className="slash-palette-footer">
        <div className="row gap-xs items-center tiny muted">
          <span><kbd className="notes-kbd-hint">↑</kbd><kbd className="notes-kbd-hint">↓</kbd> navigate</span>
          <span>·</span>
          <span><kbd className="notes-kbd-hint">↵</kbd> insert</span>
          <span>·</span>
          <span><kbd className="notes-kbd-hint">esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  );
}
