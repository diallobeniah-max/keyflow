import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "../Icon";

export interface AppSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  isHeader?: boolean;
}

export interface AppSelectProps {
  id?: string;
  ariaLabel?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  label?: string;
  describedBy?: string;
  "aria-describedby"?: string;
  placeholder?: string;
  size?: "default" | "large";
  disabled?: boolean;
  readOnly?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  error?: string;
  className?: string;
}

function getEnabledIndex(options: AppSelectOption[], start: number, direction: 1 | -1): number {
  let index = start;
  while (index >= 0 && index < options.length) {
    if (!options[index].disabled && !options[index].isHeader) return index;
    index += direction;
  }
  return start;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function matchesOptionValue(optionValue: string, targetValue: string): boolean {
  if (optionValue === targetValue) return true;
  if (!optionValue || !targetValue) return false;
  const o = optionValue.toLowerCase().replace(/[\s\-_]/g, "");
  const t = targetValue.toLowerCase().replace(/[\s\-_]/g, "");
  if (o === t) return true;
  const altGroup = ["altright", "rightalt", "ralt", "altgr"];
  if (altGroup.includes(o) && altGroup.includes(t)) return true;
  const ctrlGroup = ["controlright", "rightctrl", "rctrl"];
  if (ctrlGroup.includes(o) && ctrlGroup.includes(t)) return true;
  const appGroup = ["apps", "menu", "application"];
  if (appGroup.includes(o) && appGroup.includes(t)) return true;
  return false;
}

export function AppSelect({
  id,
  ariaLabel,
  "aria-label": ariaLabelProp,
  "aria-labelledby": ariaLabelledByProp,
  value,
  onChange,
  options,
  label,
  describedBy,
  "aria-describedby": ariaDescribedBy,
  placeholder = "Select",
  size = "default",
  disabled = false,
  readOnly = false,
  searchable,
  searchPlaceholder = "Search options…",
  error,
  className,
}: AppSelectProps) {
  const baseId = useId();
  const triggerId = id ?? `${baseId}-trigger`;
  const labelId = label ? `${baseId}-label` : undefined;
  const listboxId = `${baseId}-listbox`;
  const errorId = `${baseId}-error`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const [searchQuery, setSearchQuery] = useState("");

  const isSearchable = searchable ?? options.length >= 6;

  const filteredOptions = isSearchable && searchQuery.trim()
    ? options.filter((o) => o.isHeader || (o.label + " " + o.value).toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : options;

  const selectedIndex = filteredOptions.findIndex((option) => matchesOptionValue(option.value, value));
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, selectedIndex));
  const selected = options.find((option) => matchesOptionValue(option.value, value));
  const activeDescendant = open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  const describedByIds = [describedBy, ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  const labelledByIds = [ariaLabelledByProp, labelId].filter(Boolean).join(" ") || undefined;
  const accessibleLabel = ariaLabel ?? ariaLabelProp ?? (label ? undefined : "Select option");
  const stateClass = [
    "app-select",
    `app-select--${size}`,
    open ? "is-open" : "",
    disabled ? "is-disabled" : "",
    readOnly ? "is-read-only" : "",
    error ? "has-error" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const close = (restoreFocus = false) => {
    setOpen(false);
    setMenuStyle(undefined);
    setSearchQuery("");
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportInset = 8;
    const minMenuWidth = Math.max(rect.width, 240);
    const width = Math.min(minMenuWidth, Math.max(1, window.innerWidth - viewportInset * 2));
    const left = clamp(rect.left, viewportInset, Math.max(viewportInset, window.innerWidth - width - viewportInset));
    const below = Math.max(1, window.innerHeight - rect.bottom - viewportInset);
    const above = Math.max(1, rect.top - viewportInset);
    const opensAbove = below < 220 && above > below;
    const available = opensAbove ? above : below;
    const maxHeight = Math.min(360, available);

    if (opensAbove) {
      const bottom = Math.max(viewportInset, window.innerHeight - rect.top + 6);
      setMenuStyle({
        position: "fixed",
        bottom: `${bottom}px`,
        top: "auto",
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      });
    } else {
      const top = Math.min(window.innerHeight - viewportInset, rect.bottom + 6);
      setMenuStyle({
        position: "fixed",
        top: `${top}px`,
        bottom: "auto",
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      });
    }
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const nextIndex = selectedIndex >= 0 ? selectedIndex : getEnabledIndex(filteredOptions, 0, 1);
    setActiveIndex(nextIndex);

    if (isSearchable) {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    } else {
      const focusNextOption = () => {
        const option = optionRefs.current[nextIndex];
        option?.focus();
        option?.scrollIntoView({ block: "nearest" });
      };
      window.requestAnimationFrame(focusNextOption);
    }

    const handleViewportChange = () => updateMenuPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, isSearchable]);

  const choose = (option: AppSelectOption) => {
    if (option.disabled || option.isHeader || readOnly) return;
    onChange(option.value);
    close(true);
  };

  const move = (direction: 1 | -1) => {
    const current = activeIndex >= 0 ? activeIndex : selectedIndex;
    const next = getEnabledIndex(filteredOptions, current + direction, direction);
    if (next >= 0 && next < filteredOptions.length && !filteredOptions[next].disabled && !filteredOptions[next].isHeader) {
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
      optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
    }
  };

  const openMenu = () => {
    if (disabled || readOnly) return;
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close(true);
    }
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filteredOptions[activeIndex] || filteredOptions.find((o) => !o.isHeader && !o.disabled);
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = getEnabledIndex(filteredOptions, 0, 1);
      setActiveIndex(first);
      optionRefs.current[first]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      const last = getEnabledIndex(filteredOptions, filteredOptions.length - 1, -1);
      setActiveIndex(last);
      optionRefs.current[last]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const menu = open && menuStyle ? createPortal(
    <div
      ref={menuRef}
      className="app-select__menu"
      id={listboxId}
      role="listbox"
      aria-labelledby={labelledByIds}
      aria-label={labelledByIds ? undefined : accessibleLabel}
      style={menuStyle}
    >
      {isSearchable && (
        <div className="app-select__search-box" onClick={(e) => e.stopPropagation()}>
          <Icon name="search" size={13} />
          <input
            ref={searchInputRef}
            type="text"
            className="app-select__search-field"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          {searchQuery && (
            <button
              type="button"
              className="app-select__search-clear-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      )}
      <div className="app-select__options-scroll">
        {filteredOptions.length === 0 ? (
          <div className="app-select__empty-state">No matching options</div>
        ) : (
          filteredOptions.map((option, index) => {
            if (option.isHeader) {
              return (
                <div key={`header-${index}-${option.value}`} className="app-select__group-header" role="presentation">
                  {option.label}
                </div>
              );
            }
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                id={`${listboxId}-option-${index}`}
                type="button"
                className={["app-select__option", option.value === value ? "is-selected" : "", index === activeIndex ? "is-active" : ""].filter(Boolean).join(" ")}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onClick={() => choose(option)}
                onKeyDown={handleOptionKeyDown}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="app-select__option-label">{option.label}</span>
                {option.value === value && <Icon name="check" size={15} />}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className={stateClass} ref={rootRef}>
      {label && <label className="app-select__label" id={labelId} htmlFor={triggerId}>{label}</label>}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="app-select__trigger"
        role="combobox"
        aria-label={labelledByIds ? undefined : accessibleLabel}
        aria-labelledby={labelledByIds}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-describedby={describedByIds}
        aria-activedescendant={activeDescendant}
        aria-readonly={readOnly || undefined}
        disabled={disabled}
        onClick={() => (open ? close(true) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="app-select__value">{selected?.label ?? placeholder}</span>
        <span className="app-select__arrow" aria-hidden="true"><Icon name="chevronDown" size={16} /></span>
      </button>
      {error && <div className="app-select__error" id={errorId}>{error}</div>}
      {menu}
    </div>
  );
}
