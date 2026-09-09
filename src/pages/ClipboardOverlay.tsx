import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsHorizontal,
  ArrowsOutSimple,
  ArrowSquareOut,
  BookmarkSimple,
  Briefcase,
  Check,
  ClipboardText,
  Code,
  Copy,
  DotsThree,
  Eye,
  File,
  FileText,
  Folder,
  Globe,
  Heart,
  Image,
  Lightning,
  Link,
  MagnifyingGlass,
  Palette,
  PencilSimple,
  Play,
  Plus,
  PushPin,
  Rows,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  Star,
  Terminal,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useStore } from "../store/useStore";
import { Button, Modal } from "../components/ui";
import { MOTION_DURATION, motionClassName } from "../lib/motion";

const FOLDER_ICONS: Record<string, React.ComponentType<any>> = {
  Folder,
  Star,
  BookmarkSimple,
  Briefcase,
  Code,
  Palette,
  Heart,
  Lightning,
  Sparkle,
  Link,
  FileText,
  Image,
};

const FOLDER_COLORS = [
  { label: "Accent", value: "var(--color-accent)" },
  { label: "Cyan", value: "var(--cat-color-cyan)" },
  { label: "Green", value: "var(--cat-color-green)" },
  { label: "Amber", value: "var(--cat-color-amber)" },
  { label: "Rose", value: "var(--cat-color-rose)" },
  { label: "Purple", value: "var(--cat-color-purple)" },
  { label: "Blue", value: "var(--cat-color-blue)" },
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
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCardHeaderTheme(item: ClipboardItemSummary): {
  themeClass: string;
  badgeLabel?: string;
  badgeType?: "ps" | "pr" | "chrome" | "code" | "terminal" | "generic";
} {
  const source = (item.sourceApp ?? "").toLowerCase();
  const kind = item.kind;

  if (source.includes("photoshop") || source.includes("ps")) {
    return { themeClass: "theme-ps", badgeLabel: "Ps", badgeType: "ps" };
  }
  if (source.includes("premiere") || source.includes("pr")) {
    return { themeClass: "theme-pr", badgeLabel: "Pr", badgeType: "pr" };
  }
  if (source.includes("chrome") || source.includes("browser") || source.includes("edge")) {
    return { themeClass: "theme-chrome", badgeType: "chrome" };
  }
  if (source.includes("code") || source.includes("cursor") || source.includes("devenv")) {
    return { themeClass: "theme-code", badgeType: "code" };
  }
  if (source.includes("term") || source.includes("bash") || source.includes("powershell") || source.includes("cmd")) {
    return { themeClass: "theme-terminal", badgeType: "terminal" };
  }

  // Fallbacks by Kind
  if (kind === "color") {
    return { themeClass: "theme-color", badgeType: "generic" };
  }
  if (kind === "code" || kind === "json" || kind === "xml") {
    return { themeClass: "theme-code", badgeType: "code" };
  }
  if (kind === "url" || kind === "email") {
    return { themeClass: "theme-url", badgeType: "chrome" };
  }
  if (kind === "files") {
    return { themeClass: "theme-files", badgeType: "generic" };
  }
  if (kind === "image" || kind === "screenshot") {
    return { themeClass: "theme-image", badgeType: "generic" };
  }

  // Default text header
  return { themeClass: "theme-text", badgeType: "generic" };
}

const FILTER_TYPES = [
  { id: "all", label: "All Clips", icon: ClipboardText },
  { id: "youtube", label: "YouTube Videos", icon: Play },
  { id: "image", label: "Pictures & Snips", icon: Image },
  { id: "url", label: "Web Links", icon: Link },
  { id: "text", label: "Text Clips", icon: FileText },
  { id: "code", label: "Code & JSON", icon: Code },
  { id: "files", label: "Files & Folders", icon: Folder },
  { id: "color", label: "Colors", icon: Palette },
] as const;

export function ClipboardOverlay() {
  const appearance = useStore((s) => s.data.settings.appearance);
  const [snapshot, setSnapshot] = useState<ClipboardSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [activePinboard, setActivePinboard] = useState<string>("all");
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [actionSearch, setActionSearch] = useState("");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [layout, setLayout] = useState<ClipboardOverlayLayout>("horizontal");
  const [position, setPosition] = useState<ClipboardHorizontalPosition>("bottom");
  const [scrollDirection, setScrollDirection] = useState<ClipboardScrollDirection>("horizontal");
  const [keepOpen, setKeepOpen] = useState(false);
  const [phase, setPhase] = useState<"entering" | "idle" | "closing">("entering");
  const [feedback, setFeedback] = useState("");
  const [lightboxItem, setLightboxItem] = useState<ClipboardItemSummary | null>(null);

  const [gridRows, setGridRows] = useState<ClipboardGridRows>(1);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dropTargetBoardId, setDropTargetBoardId] = useState<string | null>(null);
  const [folderModalState, setFolderModalState] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    id?: string;
    name: string;
    icon: string;
    color: string;
  } | null>(null);

  const bottomSearchInputRef = useRef<HTMLInputElement>(null);
  const actionSearchInputRef = useRef<HTMLInputElement>(null);
  const shelfScrollRef = useRef<HTMLDivElement>(null);
  const edgeScrollFrameRef = useRef<number | null>(null);
  const edgeScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const edgeScrollLastTimeRef = useRef(0);
  const skipNextSelectionScrollRef = useRef(false);

  // Each Electron window has its own React store; localStorage is shared.
  useEffect(() => {
    const load = () => { void useStore.getState().load().catch(() => setFeedback("Could not load appearance settings.")); };
    const onStorage = (event: StorageEvent) => { if (event.key === "keyflow:state") load(); };
    load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Smooth popup show & request-close IPC listeners
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onShow = () => {
      clearTimeout(timer);
      setPhase("entering");
      setFeedback("");
      timer = setTimeout(() => setPhase("idle"), MOTION_DURATION.clipboard);
    };
    const onRequestClose = () => {
      clearTimeout(timer);
      setPhase("closing");
    };
    onShow();
    const offShow = window.electronAPI?.clipboard?.onPopupShow?.(onShow);
    const offClose = window.electronAPI?.clipboard?.onPopupRequestClose?.(onRequestClose);
    return () => {
      clearTimeout(timer);
      offShow?.();
      offClose?.();
    };
  }, []);

  // Sync dark/light theme and accent color based on KeyFlow app settings
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => useStore.getState().applyAppearance();
    apply();
    media.addEventListener("change", apply);
    const useAppAccent = snapshot?.settings.useAppAccentColor !== false;
    if (useAppAccent && appearance?.accent) {
      root.style.setProperty("--color-accent", appearance.accent);
      root.setAttribute("data-clipboard-accent", "app");
    } else {
      root.removeAttribute("data-clipboard-accent");
    }
    return () => media.removeEventListener("change", apply);
  }, [appearance, snapshot?.settings.useAppAccentColor]);

  // Synchronize snapshot settings to state
  useEffect(() => {
    if (snapshot?.settings.layout) {
      setLayout(snapshot.settings.layout);
    }
    if (snapshot?.settings.horizontalPosition) {
      setPosition(snapshot.settings.horizontalPosition);
    }
    if (snapshot?.settings.scrollDirection) {
      setScrollDirection(snapshot.settings.scrollDirection);
    }
    if (snapshot?.settings.gridRows) {
      setGridRows(snapshot.settings.gridRows);
    }
  }, [snapshot?.settings.layout, snapshot?.settings.horizontalPosition, snapshot?.settings.scrollDirection, snapshot?.settings.gridRows]);

  useEffect(() => {
    const onLayoutChanged = (data: any) => {
      if (data?.layout) setLayout(data.layout);
      if (data?.position) setPosition(data.position);
      if (data?.scrollDirection) setScrollDirection(data.scrollDirection);
      if (data?.gridRows) setGridRows(data.gridRows);
    };
    const offLayout = window.electronAPI?.clipboard?.onPopupLayoutChanged?.(onLayoutChanged);
    return () => {
      offLayout?.();
    };
  }, []);

  // Load snapshot and subscribe
  useEffect(() => {
    const api = window.electronAPI?.clipboard;
    if (!api) return;
    let cancelled = false;
    void api.getSnapshot().then((next) => {
      if (!cancelled) {
        setSnapshot(next);
        setSelectedId((curr) => curr ?? next.items[0]?.id ?? null);
      }
    }).catch(() => setFeedback("Could not load clipboard history. Reopen the popup to try again."));
    const unsubscribe = api.onChanged((next) => {
      setSnapshot(next);
      setSelectedId((curr) => curr ?? next.items[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Listen for focus-search IPC event
  useEffect(() => {
    const onFocusSearch = () => {
      setQuery("");
      setIsActionMenuOpen(false);
      setIsFilterMenuOpen(false);
      setTimeout(() => {
        bottomSearchInputRef.current?.focus();
        bottomSearchInputRef.current?.select();
      }, 50);
    };
    const offFocus = window.electronAPI?.clipboard?.onPopupFocusSearch?.(onFocusSearch);
    setTimeout(() => {
      shelfScrollRef.current?.focus();
    }, 50);
    return () => {
      offFocus?.();
    };
  }, []);

  // Filtered items
  const filtered = useMemo(() => {
    return (snapshot?.items ?? []).filter((item) => {
      const matchPinboard =
        activePinboard === "all" || item.pinboardIds.includes(activePinboard);
      if (!matchPinboard) return false;

      if (filterKind !== "all") {
        if (filterKind === "youtube" && !item.urlMeta?.isYouTube) return false;
        if (filterKind === "image" && item.kind !== "image" && item.kind !== "screenshot") return false;
        if (filterKind === "url" && item.kind !== "url") return false;
        if (filterKind === "text" && item.kind !== "text") return false;
        if (filterKind === "code" && item.kind !== "code" && item.kind !== "json" && item.kind !== "xml") return false;
        if (filterKind === "files" && item.kind !== "files") return false;
        if (filterKind === "color" && item.kind !== "color") return false;
      }

      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const haystack = `${item.title} ${item.preview} ${item.kind} ${item.sourceApp ?? ""} ${item.color ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [snapshot?.items, query, activePinboard, filterKind]);

  const selectedIndex = useMemo(() => {
    const idx = filtered.findIndex((item) => item.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [filtered, selectedId]);

  const selectedItem = filtered[selectedIndex] ?? filtered[0] ?? null;
  useEffect(() => { setSelectedId(selectedItem?.id ?? null); }, [selectedItem?.id]);
  useEffect(() => {
    if (activePinboard !== "all" && snapshot && !snapshot.pinboards.some((board) => board.id === activePinboard)) setActivePinboard("all");
  }, [snapshot?.pinboards, activePinboard]);

  // Track scroll progress for bottom progress bar
  const handleShelfScroll = () => {
    if (!shelfScrollRef.current) return;
    const el = shelfScrollRef.current;
    if (scrollDirection === "vertical") {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) {
        setScrollProgress(0);
        return;
      }
      const percent = Math.min(100, Math.max(0, (el.scrollTop / maxScroll) * 100));
      setScrollProgress(percent);
    } else {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) {
        setScrollProgress(0);
        return;
      }
      const percent = Math.min(100, Math.max(0, (el.scrollLeft / maxScroll) * 100));
      setScrollProgress(percent);
    }
  };

  // Convert vertical mouse wheel into horizontal scroll when in horizontal mode
  const handleShelfWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (layout === "horizontal" && scrollDirection === "horizontal" && shelfScrollRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        shelfScrollRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const stopEdgeHoverScroll = () => {
    edgeScrollDirectionRef.current = 0;
    edgeScrollLastTimeRef.current = 0;
    if (edgeScrollFrameRef.current !== null) {
      cancelAnimationFrame(edgeScrollFrameRef.current);
      edgeScrollFrameRef.current = null;
    }
  };

  const handleShelfPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const enabled = snapshot?.settings.edgeHoverScrollEnabled !== false;
    if (!enabled || layout !== "horizontal" || scrollDirection !== "horizontal" || !shelfScrollRef.current) {
      stopEdgeHoverScroll();
      return;
    }
    const rect = shelfScrollRef.current.getBoundingClientRect();
    const edgeSize = Math.min(72, rect.width * 0.12);
    const direction: -1 | 0 | 1 = event.clientX <= rect.left + edgeSize ? -1 : event.clientX >= rect.right - edgeSize ? 1 : 0;
    edgeScrollDirectionRef.current = direction;
    if (direction === 0 || edgeScrollFrameRef.current !== null) return;

    const speed = snapshot?.settings.edgeHoverScrollSpeed ?? "normal";
    const pixelsPerSecond = speed === "slow" ? 220 : speed === "fast" ? 720 : 420;
    const tick = (now: number) => {
      const el = shelfScrollRef.current;
      if (!el || edgeScrollDirectionRef.current === 0) {
        stopEdgeHoverScroll();
        return;
      }
      const elapsed = edgeScrollLastTimeRef.current === 0 ? 0 : Math.min(32, now - edgeScrollLastTimeRef.current);
      edgeScrollLastTimeRef.current = now;
      el.scrollLeft += edgeScrollDirectionRef.current * pixelsPerSecond * (elapsed / 1000);
      edgeScrollFrameRef.current = requestAnimationFrame(tick);
    };
    edgeScrollFrameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => stopEdgeHoverScroll, []);

  const dismiss = () => {
    void window.electronAPI?.clipboard?.hidePopup?.();
  };

  const handleDismiss = () => {
    // Main process owns the close timer and cancels it on a rapid reopen.
    dismiss();
  };

  const pasteItem = (id: string, plainText = false, forceKeepOpen = false) => {
    void window.electronAPI?.clipboard?.paste(id, plainText, keepOpen || forceKeepOpen).then((result) => {
      if (!result.ok) setFeedback("The clip was copied, but Windows could not paste it. Press Ctrl+V in the target app.");
    }).catch(() => setFeedback("Could not paste this clip. It may no longer be available."));
  };

  const copyItem = (id: string, plainText = false) => {
    void window.electronAPI?.clipboard?.copy(id, plainText)
      .then(() => setFeedback("Copied to clipboard"))
      .catch(() => setFeedback("Could not copy this clip. It may no longer be available."));
  };

  const activateItem = (id: string, plainText = false) => {
    if ((snapshot?.settings.activationMode ?? "paste") === "copy") copyItem(id, plainText);
    else pasteItem(id, plainText);
  };

  // Folder (Pinboard) modal handlers
  const openCreateFolder = () => {
    setFolderModalState({
      isOpen: true,
      mode: "create",
      name: "",
      icon: "Folder",
      color: "var(--color-accent)",
    });
  };

  const openEditFolder = (board: ClipboardPinboard) => {
    setFolderModalState({
      isOpen: true,
      mode: "edit",
      id: board.id,
      name: board.name,
      icon: board.icon || "Folder",
      color: board.color || "var(--color-accent)",
    });
  };

  const handleSaveFolder = async () => {
    if (!folderModalState || !folderModalState.name.trim()) return;
    const api = window.electronAPI?.clipboard;
    if (!api) return;
    try {
    if (folderModalState.mode === "create") {
      await api.createPinboard({
        name: folderModalState.name.trim(),
        color: folderModalState.color,
        icon: folderModalState.icon,
      });
    } else if (folderModalState.id) {
      await api.updatePinboard(folderModalState.id, {
        name: folderModalState.name.trim(),
        color: folderModalState.color,
        icon: folderModalState.icon,
      });
    }
    setFolderModalState(null);
    } catch { setFeedback("Could not save the folder. Please try again."); }
  };

  const handleDeleteFolder = async () => {
    if (!folderModalState || !folderModalState.id) return;
    const api = window.electronAPI?.clipboard;
    try {
    if (api) {
      await api.deletePinboard(folderModalState.id);
      if (activePinboard === folderModalState.id) {
        setActivePinboard("all");
      }
    }
    setFolderModalState(null);
    } catch { setFeedback("Could not delete the folder. Please try again."); }
  };

  // Drag-and-drop for reorganizing cards and placing into folders
  const handleCardDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedItemId(id);
  };

  const handleCardDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedItemId && draggedItemId !== id) {
      setDragOverItemId(id);
    }
  };

  const handleCardDragLeave = (id: string) => {
    if (dragOverItemId === id) {
      setDragOverItemId(null);
    }
  };

  const handleCardDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggedItemId;
    if (sourceId && sourceId !== targetId) {
      await window.electronAPI?.clipboard?.reorderItems?.(sourceId, targetId);
    }
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleCardDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleFolderTabDragOver = (e: React.DragEvent, boardId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTargetBoardId(boardId);
  };

  const handleFolderTabDragLeave = (boardId: string) => {
    if (dropTargetBoardId === boardId) {
      setDropTargetBoardId(null);
    }
  };

  const handleFolderTabDrop = async (e: React.DragEvent, boardId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggedItemId;
    if (sourceId) {
      await window.electronAPI?.clipboard?.assignPinboard?.(sourceId, boardId);
    }
    setDropTargetBoardId(null);
    setDraggedItemId(null);
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (folderModalState) {
        if (e.key === "Escape") { e.preventDefault(); setFolderModalState(null); }
        return;
      }
      const target = e.target as HTMLElement;
      const inEditor = target.matches("input, textarea, [contenteditable=true]");
      if (inEditor && target !== bottomSearchInputRef.current && target !== actionSearchInputRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (lightboxItem) {
          setLightboxItem(null);
          shelfScrollRef.current?.focus();
        } else if (isActionMenuOpen) {
          setIsActionMenuOpen(false);
          shelfScrollRef.current?.focus();
        } else if (isFilterMenuOpen) {
          setIsFilterMenuOpen(false);
          shelfScrollRef.current?.focus();
        } else if (query) {
          setQuery("");
          shelfScrollRef.current?.focus();
        } else {
          handleDismiss();
        }
        return;
      }

      // Ctrl+F / Cmd+F focuses the bottom search bar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        bottomSearchInputRef.current?.focus();
        bottomSearchInputRef.current?.select();
        return;
      }

      // If Lightbox is open, Enter pastes the image
      if (lightboxItem) {
        if (e.key === "Enter") {
          e.preventDefault();
          activateItem(lightboxItem.id, e.shiftKey);
          setLightboxItem(null);
        }
        return;
      }

      // Ctrl+K opens/closes Action Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsActionMenuOpen((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => actionSearchInputRef.current?.focus(), 50);
          } else {
            shelfScrollRef.current?.focus();
          }
          return next;
        });
        return;
      }

      // If Action Menu is open, allow Enter to trigger primary action
      if (isActionMenuOpen) {
        return;
      }
      if (isFilterMenuOpen) return;
      // Native buttons own Enter/Space. Do not paste while operating a toolbar.
      if (target.closest("button") && (e.key === "Enter" || e.key === " ")) return;

      // Quick-paste digits 1-9
      const isDigit = /^[1-9]$/.test(e.key);
      const isSearchActive =
        document.activeElement === bottomSearchInputRef.current ||
        document.activeElement === actionSearchInputRef.current;
      if (isDigit && (!isSearchActive || e.altKey)) {
        const slot = parseInt(e.key, 10) - 1;
        if (slot < filtered.length && filtered[slot]) {
          e.preventDefault();
          activateItem(filtered[slot].id, e.shiftKey);
          return;
        }
      }

      // Arrow navigation
      if (inEditor && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      if (scrollDirection === "vertical" || layout !== "horizontal") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (filtered.length > 0) {
            const next = Math.min(filtered.length - 1, selectedIndex + 1);
            setSelectedId(filtered[next]?.id ?? null);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (filtered.length > 0) {
            const prev = Math.max(0, selectedIndex - 1);
            setSelectedId(filtered[prev]?.id ?? null);
          }
        }
      } else {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          if (filtered.length > 0) {
            const next = Math.min(filtered.length - 1, selectedIndex + 1);
            setSelectedId(filtered[next]?.id ?? null);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (filtered.length > 0) {
            const prev = Math.max(0, selectedIndex - 1);
            setSelectedId(filtered[prev]?.id ?? null);
          }
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (selectedItem) {
          if (e.ctrlKey || e.metaKey) copyItem(selectedItem.id, e.shiftKey);
          else activateItem(selectedItem.id, e.shiftKey);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectedIndex, selectedItem, isActionMenuOpen, isFilterMenuOpen, lightboxItem, layout, scrollDirection, keepOpen, query, folderModalState]);

  // Scroll selected card into view
  useEffect(() => {
    if (!selectedId || !shelfScrollRef.current) return;
    if (skipNextSelectionScrollRef.current) {
      skipNextSelectionScrollRef.current = false;
      return;
    }
    const cardEl = shelfScrollRef.current.querySelector(`[data-id="${selectedId}"]`) as HTMLElement | null;
    if (cardEl) {
      if (scrollDirection === "vertical") {
        cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        cardEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [selectedId, scrollDirection]);

  // Actions for the Action Palette
  const allActions = useMemo(() => {
    if (!selectedItem) return [];
    return [
      { id: "paste", label: "Paste", shortcut: "↵", category: "primary", action: () => pasteItem(selectedItem.id, false, false) },
      { id: "copy", label: "Copy to Clipboard", shortcut: "Ctrl+↵", category: "primary", action: () => copyItem(selectedItem.id, false) },
      {
        id: "paste-keep",
        label: keepOpen ? "Disable Keep Open" : "Paste and Keep Window Open",
        shortcut: "Ctrl+Shift+↵",
        category: "primary",
        action: () => {
          const next = !keepOpen;
          setKeepOpen(next);
          void window.electronAPI?.clipboard?.setKeepOpen?.(next);
          pasteItem(selectedItem.id, false, true);
        },
      },
      ...(selectedItem.kind === "image" || selectedItem.kind === "screenshot"
        ? [
            {
              id: "expand-image",
              label: "Expand Image Lightbox",
              shortcut: "Space",
              category: "item",
              action: () => setLightboxItem(selectedItem),
            },
          ]
        : []),
      ...(selectedItem.kind === "url"
        ? [
            {
              id: "open-url",
              label: selectedItem.urlMeta?.isYouTube ? "Play on YouTube" : "Open in Browser",
              shortcut: "Ctrl+O",
              category: "item",
              action: () => {
                const target = selectedItem.preview || selectedItem.title;
                void window.electronAPI?.executeAction?.({
                  type: "openWebsite",
                  payload: { url: target },
                });
                if (!keepOpen) handleDismiss();
              },
            },
          ]
        : []),
      { id: "rename", label: "Rename Entry...", shortcut: "Ctrl+Shift+E", category: "item", action: () => {} },
      { id: "quick-look", label: "Quick Look", shortcut: "Ctrl+Y", category: "item", action: () => {} },
      { id: "pin", label: selectedItem.pinned ? "Unpin Entry" : "Pin Entry", shortcut: "Ctrl+.", category: "item", action: () => window.electronAPI?.clipboard?.setPinned(selectedItem.id, !selectedItem.pinned) },
      ...(snapshot?.pinboards && snapshot.pinboards.length > 0
        ? snapshot.pinboards.map((b) => ({
            id: `folder-${b.id}`,
            label: selectedItem.pinboardIds.includes(b.id) ? `Remove from "${b.name}"` : `Move to "${b.name}"`,
            shortcut: "Folder",
            category: "folder",
            action: () => {
              if (selectedItem.pinboardIds.includes(b.id)) {
                void window.electronAPI?.clipboard?.unassignPinboard?.(selectedItem.id, b.id);
              } else {
                void window.electronAPI?.clipboard?.assignPinboard?.(selectedItem.id, b.id);
              }
            },
          }))
        : []),
      { id: "delete-entry", label: "Delete Entry", shortcut: "Ctrl+D", category: "danger", action: () => window.electronAPI?.clipboard?.delete(selectedItem.id) },
      { id: "delete-all", label: "Delete All Entries", shortcut: "Ctrl+Alt+D", category: "danger", action: () => window.electronAPI?.clipboard?.clearUnpinned() },
    ];
  }, [selectedItem, keepOpen, snapshot?.pinboards]);

  const filteredActions = useMemo(() => {
    if (!actionSearch.trim()) return allActions;
    const q = actionSearch.toLowerCase();
    return allActions.filter((a) => a.label.toLowerCase().includes(q) || a.shortcut.toLowerCase().includes(q));
  }, [allActions, actionSearch]);

  const popupMotionClass = phase === "idle"
    ? ""
    : motionClassName("clipboard", phase === "closing" ? "exit" : "enter");

  return (
    <div
      className={`clip-paste-shell layout-${layout} pos-${position} scroll-${scrollDirection} phase-${phase} ${popupMotionClass}`}
      role="dialog"
      aria-label="KeyFlow Clipboard Shelf"
    >
      {feedback && <div className="clipboard-popup-feedback" role="status">{feedback}</div>}
      {/* Top Bar */}
      <header className="clip-paste-topbar">
        {/* Brand Title */}
        <div className="clip-paste-brand-title">
          <ClipboardText size={16} weight="bold" />
          <span>Clipboard</span>
        </div>

        {/* Pinboard Category Tabs */}
        <nav className="clip-paste-pinboards" role="tablist">
          <button
            type="button"
            className={`clip-paste-pin-tab ${activePinboard === "all" ? "is-active" : ""}`}
            onClick={() => setActivePinboard("all")}
            role="tab"
            aria-selected={activePinboard === "all"}
          >
            <ClipboardText size={14} weight="bold" />
            <span>All</span>
          </button>

          {(snapshot?.pinboards ?? []).map((board) => {
            const BoardIcon = FOLDER_ICONS[board.icon || "Folder"] || Folder;
            const isTarget = dropTargetBoardId === board.id;
            const isActive = activePinboard === board.id;
            return (
              <div
                key={board.id}
                className={`clip-paste-pin-tab-wrap ${isActive ? "is-active" : ""} ${isTarget ? "is-drop-target" : ""}`}
                onDragOver={(e) => handleFolderTabDragOver(e, board.id)}
                onDragLeave={() => handleFolderTabDragLeave(board.id)}
                onDrop={(e) => handleFolderTabDrop(e, board.id)}
              >
                <button
                  type="button"
                  className={`clip-paste-pin-tab ${isActive ? "is-active" : ""}`}
                  onClick={() => setActivePinboard(board.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openEditFolder(board);
                  }}
                  role="tab"
                  aria-selected={isActive}
                >
                  <span className="clip-paste-dot" style={{ backgroundColor: board.color || "var(--color-accent)" }} />
                  <BoardIcon size={13} weight="bold" />
                  <span>{board.name}</span>
                </button>

                {isActive && (
                  <button
                    type="button"
                    className="clip-paste-pin-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditFolder(board);
                    }}
                    title="Edit Folder (Rename, Icon, Color)"
                    aria-label="Edit folder"
                  >
                    <PencilSimple size={12} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className="clip-paste-pin-add"
            title="Create New Folder"
            onClick={openCreateFolder}
          >
            <Plus size={14} weight="bold" />
          </button>
        </nav>

        {/* Right Action Icons */}
        <div className="clip-paste-top-actions">
          <button
            type="button"
            className={`clip-paste-icon-btn ${isActionMenuOpen ? "is-active" : ""}`}
            onClick={() => setIsActionMenuOpen((prev) => !prev)}
            title="Actions Menu (Ctrl+K)"
            aria-label="Actions Menu"
          >
            <DotsThree size={20} weight="bold" />
          </button>
          <button
            type="button"
            className="clip-paste-icon-btn is-close"
            onClick={handleDismiss}
            title="Close (Esc)"
            aria-label="Close clipboard popup"
          >
            <X size={15} weight="bold" />
          </button>
        </div>
      </header>

      {/* Card Shelf (Horizontal or Vertical with 1, 2, or 3 rows/columns) */}
      <main
        className={`clip-paste-shelf layout-${layout} scroll-${scrollDirection} rows-${gridRows}`}
        ref={shelfScrollRef}
        onScroll={handleShelfScroll}
        onWheel={handleShelfWheel}
        onPointerMove={handleShelfPointerMove}
        onPointerLeave={stopEdgeHoverScroll}
        tabIndex={-1}
      >
        {filtered.length === 0 ? (
          <div className="clip-paste-empty">
            <ClipboardText size={36} />
            <p>No clips found</p>
            <small>Copy any text, image, file, or color to start populating your shelf.</small>
          </div>
        ) : (
          filtered.map((item, index) => {
            const ItemIcon = itemIcon(item.kind);
            const isSelected = item.id === selectedItem?.id;
            const theme = getCardHeaderTheme(item);
            const charCount = item.preview?.length ?? 0;
            const slotNumber = index < 9 ? index + 1 : null;

            return (
              <article
                key={item.id}
                data-id={item.id}
                className={`clip-shelf-card ${isSelected ? "is-selected" : ""} ${draggedItemId === item.id ? "is-dragging" : ""} ${dragOverItemId === item.id ? "is-drag-over" : ""} kind-${item.kind}`}
                draggable={true}
                onDragStart={(e) => handleCardDragStart(e, item.id)}
                onDragOver={(e) => handleCardDragOver(e, item.id)}
                onDragLeave={() => handleCardDragLeave(item.id)}
                onDrop={(e) => handleCardDrop(e, item.id)}
                onDragEnd={handleCardDragEnd}
                onClick={() => {
                  setSelectedId(item.id);
                  activateItem(item.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedId(item.id);
                  setIsActionMenuOpen(true);
                }}
                onMouseEnter={() => {
                  skipNextSelectionScrollRef.current = true;
                  setSelectedId(item.id);
                }}
                onFocus={() => setSelectedId(item.id)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && event.key === " ") { event.preventDefault(); activateItem(item.id); }
                }}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
              >
                {/* Header Banner with Category Color & App Badge */}
                <header className={`clip-shelf-card-header ${theme.themeClass}`}>
                  <div className="clip-shelf-card-header-left">
                    <strong className="clip-shelf-card-title">{item.title || item.kind}</strong>
                    <time className="clip-shelf-card-time">{relativeTime(item.capturedAt)}</time>
                  </div>

                  <div className="clip-shelf-card-header-right">
                    {theme.badgeType === "ps" && (
                      <span className="clip-brand-badge is-ps">Ps</span>
                    )}
                    {theme.badgeType === "pr" && (
                      <span className="clip-brand-badge is-pr">Pr</span>
                    )}
                    {theme.badgeType === "chrome" && (
                      <span className="clip-brand-badge is-chrome">
                        <Globe size={14} weight="bold" />
                      </span>
                    )}
                    {theme.badgeType === "code" && (
                      <span className="clip-brand-badge is-code">
                        <Code size={14} weight="bold" />
                      </span>
                    )}
                    {theme.badgeType === "terminal" && (
                      <span className="clip-brand-badge is-terminal">
                        <Terminal size={14} weight="bold" />
                      </span>
                    )}
                    {item.pinned && (
                      <PushPin size={13} weight="fill" className="clip-shelf-pin-indicator" />
                    )}
                  </div>
                </header>

                {/* Card Body */}
                <div
                  className={`clip-shelf-card-body ${item.kind === "color" && item.color ? "is-color-swatch" : ""}`}
                  style={
                    item.kind === "color" && item.color
                      ? { backgroundColor: item.color }
                      : undefined
                  }
                >
                  {item.kind === "color" && item.color ? (
                    <div className="clip-shelf-color-value">
                      <code>{item.color}</code>
                    </div>
                  ) : item.kind === "image" || item.kind === "screenshot" ? (
                    <div className={`clip-shelf-image-canvas ${item.thumbnailDataUrl ? "has-thumb" : ""}`}>
                      {item.thumbnailDataUrl ? (
                        <div className="clip-shelf-image-thumb-wrap">
                          <img
                            src={item.thumbnailDataUrl}
                            alt={item.title || "Copied image"}
                            className="clip-shelf-image-thumb"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            className="clip-image-expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxItem(item);
                            }}
                            title="Expand image preview"
                            aria-label="Expand image preview"
                          >
                            <ArrowsOutSimple size={14} weight="bold" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <ItemIcon size={32} />
                          <span>{item.dimensions ? `${item.dimensions.width}×${item.dimensions.height}` : "Image"}</span>
                        </>
                      )}
                    </div>
                  ) : item.kind === "code" || item.kind === "json" ? (
                    <pre className="clip-shelf-code-snippet">
                      <code>{item.preview || "// code"}</code>
                    </pre>
                  ) : item.kind === "files" ? (
                    <div className="clip-shelf-files-view">
                      <Folder size={28} />
                      <span>{item.title}</span>
                      {item.fileCount && item.fileCount > 1 && (
                        <small>+{item.fileCount - 1} more</small>
                      )}
                    </div>
                  ) : item.kind === "url" ? (
                    <div className="clip-shelf-link-body">
                      {item.urlMeta?.thumbnailUrl && (
                        <div className="clip-link-thumbnail-banner">
                          <img
                            src={item.urlMeta.thumbnailUrl}
                            alt=""
                            className="clip-link-thumbnail-img"
                            loading="lazy"
                          />
                          {item.urlMeta.isYouTube && (
                            <span className="clip-link-yt-badge">
                              <Play size={12} weight="fill" />
                              <span>YouTube</span>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="clip-link-top-row">
                        <span className="clip-link-domain-badge">
                          <Globe size={13} weight="bold" />
                          <span>{item.urlMeta?.domain || item.title}</span>
                        </span>
                        {item.urlMeta?.siteName && (
                          <span className="clip-link-site-name">{item.urlMeta.siteName}</span>
                        )}
                      </div>
                      <h4 className="clip-link-headline">{item.urlMeta?.title || item.title}</h4>
                      <p className="clip-link-snippet">{item.urlMeta?.description || item.preview || item.title}</p>
                      <div className="clip-link-actions-row">
                        <button
                          type="button"
                          className="clip-link-action-pill"
                          onClick={(e) => {
                            e.stopPropagation();
                            const target = item.preview || item.title;
                            void window.electronAPI?.executeAction?.({
                              type: "openWebsite",
                              payload: { url: target },
                            });
                            if (!keepOpen) handleDismiss();
                          }}
                        >
                          <ArrowSquareOut size={12} weight="bold" />
                          <span>{item.urlMeta?.isYouTube ? "Play on YouTube" : "Open Link"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="clip-shelf-text-snippet">{item.preview || item.title}</p>
                  )}
                </div>

                {/* Card Footer */}
                <footer className="clip-shelf-card-footer">
                  <span className="clip-shelf-footer-count">
                    {item.kind === "color"
                      ? "HEX"
                      : item.kind === "url"
                      ? "LINK"
                      : item.kind === "image" && item.dimensions
                      ? `${item.dimensions.width}×${item.dimensions.height}`
                      : `${charCount} characters`}
                  </span>

                  {slotNumber && (
                    <span className="clip-shelf-slot-chip" title={`Press ${slotNumber} to paste`}>
                      {slotNumber}
                    </span>
                  )}
                </footer>
              </article>
            );
          })
        )}
      </main>

      {/* Lightbox Modal for Expanded Image Previews */}
      {lightboxItem && (
        <div
          className="clip-lightbox-backdrop"
          onClick={() => setLightboxItem(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image Preview Lightbox"
        >
          <div className="clip-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <header className="clip-lightbox-header">
              <div className="clip-lightbox-info">
                <Image size={18} weight="bold" />
                <span className="clip-lightbox-title">{lightboxItem.title || "Image Preview"}</span>
                {lightboxItem.dimensions && (
                  <span className="clip-lightbox-meta-tag">
                    {lightboxItem.dimensions.width} × {lightboxItem.dimensions.height}
                  </span>
                )}
                {lightboxItem.bytes && (
                  <span className="clip-lightbox-meta-tag">
                    {formatBytes(lightboxItem.bytes)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="clip-lightbox-close-btn"
                onClick={() => setLightboxItem(null)}
                title="Close (Esc)"
                aria-label="Close image preview"
              >
                <X size={16} weight="bold" />
              </button>
            </header>

            <div className="clip-lightbox-body">
              {lightboxItem.thumbnailDataUrl ? (
                <img
                  src={lightboxItem.thumbnailDataUrl}
                  alt={lightboxItem.title || "Expanded image preview"}
                  className="clip-lightbox-img"
                />
              ) : (
                <div className="clip-lightbox-placeholder">
                  <Image size={64} />
                  <span>No preview available</span>
                </div>
              )}
            </div>

            <footer className="clip-lightbox-footer">
              <div className="clip-lightbox-footer-left">
                <span className="clip-paste-hint-pill">
                  Press <kbd className="clip-kbd">↵</kbd> to Paste
                </span>
                <span className="clip-paste-hint-pill">
                  Press <kbd className="clip-kbd">Esc</kbd> to Close
                </span>
              </div>
              <div className="clip-lightbox-footer-right">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyItem(lightboxItem.id)}
                >
                  <Copy size={14} weight="bold" />
                  <span>Copy</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    pasteItem(lightboxItem.id);
                    setLightboxItem(null);
                  }}
                >
                  <ClipboardText size={14} weight="bold" />
                  <span>Paste Image</span>
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Action Palette Popover */}
      {isActionMenuOpen && selectedItem && (
        <aside className="clip-action-popover" role="menu" aria-label="Clipboard Actions">
          <div className="clip-action-popover-list">
            {filteredActions.map((act) => (
              <button
                key={act.id}
                type="button"
                className={`clip-action-row ${act.category === "danger" ? "is-danger" : ""}`}
                onClick={() => {
                  act.action();
                  setIsActionMenuOpen(false);
                }}
              >
                <div className="clip-action-row-left">
                  {act.id === "paste" && <Copy size={16} />}
                  {act.id === "copy" && <ClipboardText size={16} />}
                  {act.id === "paste-keep" && <Play size={16} />}
                  {act.id === "expand-image" && <ArrowsOutSimple size={16} />}
                  {act.id === "pin" && <PushPin size={16} />}
                  {act.id === "quick-look" && <Eye size={16} />}
                  {act.id.startsWith("delete") && <Trash size={16} />}
                  <span>{act.label}</span>
                </div>
                <kbd className="clip-action-shortcut">{act.shortcut}</kbd>
              </button>
            ))}
          </div>

          <div className="clip-action-search-bar">
            <input
              ref={actionSearchInputRef}
              type="text"
              className="clip-action-search-input"
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              placeholder="Search for actions..."
              aria-label="Filter actions"
            />
          </div>
        </aside>
      )}

      {/* Bottom Footer Toolbar */}
      <footer className="clip-paste-bottom-strip">
        <div className="clip-paste-status-left">
          <span className="clip-paste-hint-pill">
            Paste <kbd className="clip-kbd">↵</kbd>
          </span>
          <button
            type="button"
            className={`clip-paste-actions-trigger ${isActionMenuOpen ? "is-active" : ""}`}
            onClick={() => setIsActionMenuOpen((prev) => !prev)}
          >
            Actions <kbd className="clip-kbd">Ctrl K</kbd>
          </button>
          <button
            type="button"
            className="clip-scroll-dir-btn"
            onClick={() => {
              const next = scrollDirection === "horizontal" ? "vertical" : "horizontal";
              setScrollDirection(next);
              void window.electronAPI?.clipboard?.setSettings?.({ scrollDirection: next });
            }}
            title={`Switch to ${scrollDirection === "horizontal" ? "Vertical" : "Horizontal"} Scrolling`}
          >
            {scrollDirection === "horizontal" ? (
              <ArrowsHorizontal size={14} weight="bold" />
            ) : (
              <Rows size={14} weight="bold" />
            )}
            <span>{scrollDirection === "horizontal" ? "Horizontal" : "Vertical"}</span>
          </button>

          {/* Grid Rows / Density Selector (1, 2, 3 options) */}
          <div className="clip-grid-rows-selector" role="group" aria-label="Grid Rows Density">
            <button
              type="button"
              className={`clip-grid-row-btn ${gridRows === 1 ? "is-active" : ""}`}
              onClick={() => {
                setGridRows(1);
                void window.electronAPI?.clipboard?.setSettings?.({ gridRows: 1 });
              }}
              title="1 Row (Standard Shelf)"
            >
              1
            </button>
            <button
              type="button"
              className={`clip-grid-row-btn ${gridRows === 2 ? "is-active" : ""}`}
              onClick={() => {
                setGridRows(2);
                void window.electronAPI?.clipboard?.setSettings?.({ gridRows: 2 });
              }}
              title="2 Rows Grid"
            >
              2
            </button>
            <button
              type="button"
              className={`clip-grid-row-btn ${gridRows === 3 ? "is-active" : ""}`}
              onClick={() => {
                setGridRows(3);
                void window.electronAPI?.clipboard?.setSettings?.({ gridRows: 3 });
              }}
              title="3 Rows Grid"
            >
              3
            </button>
          </div>

          {filterKind !== "all" && (
            <button
              type="button"
              className="clip-active-filter-pill"
              onClick={() => setFilterKind("all")}
              title="Clear active filter"
            >
              <span>{FILTER_TYPES.find((f) => f.id === filterKind)?.label}</span>
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        {/* Permanent Bottom Search Bar and Action icons */}
        <div className="clip-paste-status-right">
          {/* Permanent Bottom Search Bar */}
          <div className="clip-bottom-search-bar">
            <MagnifyingGlass size={14} weight="bold" className="clip-bottom-search-icon" />
            <input
              ref={bottomSearchInputRef}
              type="text"
              className="clip-bottom-search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
              }}
              placeholder="Search clips... (Ctrl+F)"
              aria-label="Search clipboard clips"
            />
            {query && (
              <button
                type="button"
                className="clip-bottom-search-clear"
                onClick={() => {
                  setQuery("");
                  bottomSearchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
            <button
              type="button"
              className={`clip-bottom-filter-trigger ${filterKind !== "all" || isFilterMenuOpen ? "is-active" : ""}`}
              onClick={() => setIsFilterMenuOpen((prev) => !prev)}
              title="Filter by category"
              aria-label="Filter by category"
            >
              <SlidersHorizontal size={13} weight={filterKind !== "all" ? "bold" : "regular"} />
              <span>{filterKind === "all" ? "Filter" : FILTER_TYPES.find((f) => f.id === filterKind)?.label}</span>
            </button>

            {/* Floating Filter Popover Menu */}
            {isFilterMenuOpen && (
              <div className="clip-filter-popover-menu" role="menu" aria-label="Quick filter by type">
                <div className="clip-filter-popover-header">Filter by Type</div>
                {FILTER_TYPES.map((ft) => {
                  const FIcon = ft.icon;
                  const isSelected = filterKind === ft.id;
                  return (
                    <button
                      key={ft.id}
                      type="button"
                      className={`clip-filter-popover-item ${isSelected ? "is-active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilterKind(ft.id);
                        setIsFilterMenuOpen(false);
                      }}
                      role="menuitem"
                    >
                      <FIcon size={14} weight={isSelected ? "bold" : "regular"} />
                      <span>{ft.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="clip-footer-icon-btn"
            title="More Options"
            onClick={() => setIsActionMenuOpen((prev) => !prev)}
            aria-label="More Options"
          >
            <DotsThree size={18} weight="bold" />
          </button>
        </div>

        {/* Scroll Progress Accent Indicator */}
        <div
          className="clip-paste-scroll-indicator"
          style={{ width: `${Math.max(6, scrollProgress)}%` }}
          aria-hidden="true"
        />
      </footer>

      {/* Folder (Pinboard) Modal: Create / Edit / Rename / Icon / Color */}
      <Modal
        open={!!folderModalState?.isOpen}
        onClose={() => setFolderModalState(null)}
        title={folderModalState?.mode === "create" ? "New Folder Collection" : "Edit Folder"}
      >
        {folderModalState && <>
            <div className="clip-folder-modal-body">
              <div className="clip-folder-form-group">
                <label htmlFor="folder-name-input">Folder Name</label>
                <input
                  id="folder-name-input"
                  type="text"
                  className="clip-folder-input"
                  value={folderModalState.name}
                  onChange={(e) =>
                    setFolderModalState((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  placeholder="e.g. Work, Code, Assets, Links"
                  autoFocus
                />
              </div>

              <div className="clip-folder-form-group">
                <label>Folder Icon</label>
                <div className="clip-folder-icon-grid">
                  {Object.keys(FOLDER_ICONS).map((iconKey) => {
                    const IconComp = FOLDER_ICONS[iconKey];
                    const isSelected = folderModalState.icon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        className={`clip-folder-icon-option ${isSelected ? "is-selected" : ""}`}
                        onClick={() =>
                          setFolderModalState((prev) => (prev ? { ...prev, icon: iconKey } : null))
                        }
                        title={iconKey}
                      >
                        <IconComp size={18} weight={isSelected ? "fill" : "bold"} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="clip-folder-form-group">
                <label>Folder Color</label>
                <div className="clip-folder-color-row">
                  {FOLDER_COLORS.map((c) => {
                    const isSelected = folderModalState.color === c.value;
                    return (
                      <button
                        key={c.label}
                        type="button"
                        className={`clip-folder-color-chip ${isSelected ? "is-selected" : ""}`}
                        style={{ backgroundColor: c.value }}
                        onClick={() =>
                          setFolderModalState((prev) => (prev ? { ...prev, color: c.value } : null))
                        }
                        title={c.label}
                      >
                        {isSelected && <Check size={12} weight="bold" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <footer className="clip-folder-modal-footer">
              {folderModalState.mode === "edit" ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteFolder}
                >
                  Delete Folder
                </Button>
              ) : (
                <div />
              )}

              <div className="clip-folder-modal-footer-right">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFolderModalState(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!folderModalState.name.trim()}
                  onClick={handleSaveFolder}
                >
                  {folderModalState.mode === "create" ? "Create Folder" : "Save Changes"}
                </Button>
              </div>
            </footer>
        </>}
      </Modal>
    </div>
  );
}
