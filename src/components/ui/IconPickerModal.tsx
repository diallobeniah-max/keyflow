import { useState, useMemo } from "react";
import { Icon, ICON_CATEGORIES, ICON_COLOR_PALETTE } from "../Icon";

export interface IconPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIcon?: string;
  selectedColor?: string;
  onSelect: (icon: string, color?: string) => void;
  title?: string;
}

export function IconPickerModal({
  isOpen,
  onClose,
  selectedIcon = "star",
  selectedColor = "#4f7cff",
  onSelect,
  title = "Choose Icon",
}: IconPickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeColor, setActiveColor] = useState(selectedColor);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ICON_CATEGORIES;

    return ICON_CATEGORIES.map((cat) => ({
      ...cat,
      icons: cat.icons.filter(
        (ic) => ic.name.toLowerCase().includes(q) || ic.label.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.icons.length > 0);
  }, [search]);

  if (!isOpen) return null;

  const handlePickIcon = (iconName: string) => {
    onSelect(iconName, activeColor);
    onClose();
  };

  return (
    <div className="modal-backdrop anim-fade-in" onClick={onClose}>
      <div
        className="icon-picker-modal anim-modal-enter"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ "--picker-accent": activeColor } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="icon-picker-header">
          <div className="icon-picker-title-row">
            <div className="icon-picker-title">
              <span className="icon-picker-title-dot" />
              <span>{title}</span>
            </div>
            <button type="button" className="icon-picker-close-btn" onClick={onClose} aria-label="Close icon picker">
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="icon-picker-palette">
            <span className="icon-picker-palette-label">Color:</span>
            <div className="icon-picker-colors">
              {ICON_COLOR_PALETTE.map((c) => {
                const isSelected = activeColor === c.value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`icon-color-swatch icon-color-swatch--${c.id}${isSelected ? " is-selected" : ""}`}
                    title={c.label}
                    onClick={() => setActiveColor(c.value)}
                  >
                    {isSelected && <Icon name="check" size={12} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="icon-picker-search-wrap">
            <Icon name="search" size={14} className="icon-picker-search-icon" />
            <input
              type="text"
              className="icon-picker-search-input"
              placeholder="Search icons (e.g. clock, code, music, tools)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button type="button" className="icon-picker-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="icon-picker-body">
          {filteredCategories.length === 0 ? (
            <div className="icon-picker-empty">
              <Icon name="search" size={24} />
              <p>No icons matching &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            filteredCategories.map((category) => (
              <div key={category.id} className="icon-picker-category">
                <div className="icon-picker-category-title">{category.name}</div>
                <div className="icon-picker-grid">
                  {category.icons.map((item) => {
                    const isSelected = selectedIcon === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        className={`icon-picker-item${isSelected ? " is-selected" : ""}`}
                        title={item.label}
                        onClick={() => handlePickIcon(item.name)}
                      >
                        <Icon name={item.name} size={20} />
                        <span className="icon-picker-item-label">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
