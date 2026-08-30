import { useEffect, useRef, useState, useMemo } from "react";
import { Icon } from "./Icon";
import { SlashCommandPalette } from "./notes/SlashCommandPalette";
import { SLASH_COMMANDS, SlashCommand } from "../lib/notesSlashCommands";
import { runAction } from "../lib/actions";

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

type NotesSortOrder = "recent" | "oldest";

type NotesWindowPreferences = {
  windowSizePreset: "comfortable" | "compact" | string;
  followMouseOnOpen: boolean;
  windowPresetSizes: Record<"comfortable" | "compact", { width: number; height: number }>;
  customPresets?: Array<{ id: string; name: string; width: number; height: number }>;
};

const DEFAULT_WELCOME_NOTE: Note = {
  id: "welcome-note",
  title: "Welcome to KeyFlow Notes 📝",
  pinned: true,
  content: `<h2>KeyFlow Floating Notepad</h2>
<p>A fast, distraction-free markdown notepad that floats seamlessly above your desktop and apps.</p>

<h3>⚡ Key Features</h3>
<ul>
  <li><b>Raycast Slash Commands:</b> Type <code>/</code> at the start of a line or after a space to insert headings, lists, tables, callouts, and more.</li>
  <li><b>Custom Save Location:</b> Click the folder pill in the top header to set your custom notes folder on disk.</li>
  <li><b>Instant Autosave:</b> Never lose your thoughts with continuous debounced saving.</li>
  <li><b>Quick Access:</b> Trigger instantly with your configured shortcut or Hyper Key.</li>
  <li><b>1-Click Copy:</b> Quickly export or copy notes directly to your clipboard.</li>
</ul>

<h3>🎯 Try Slash Commands</h3>
<p>Type <code>/h1</code> for a heading, <code>/todo</code> for interactive checklists, <code>/callout</code> for highlighted boxes, or <code>/table</code> for data grids!</p>`,
  createdAt: Date.now() - 3600000,
  updatedAt: Date.now(),
};

function formatNoteDate(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

const EDITOR_SHORTCUTS = [
  { id: "undo", label: "Undo change", keys: ["Ctrl", "Z"] },
  { id: "redo", label: "Redo change", keys: ["Ctrl", "Y"] },
  { id: "slash", label: "Slash commands palette", keys: ["/"] },
  { id: "find", label: "Find in current note", keys: ["Ctrl", "F"] },
  { id: "pin", label: "Toggle pin note", keys: ["Ctrl", "P"] },
  { id: "export", label: "Export formats", keys: ["Ctrl", "E"] },
];

const APP_SHORTCUTS = [
  { id: "spotlight", label: "Search all notes & files", keys: ["Ctrl", "K"] },
  { id: "sidebar", label: "Toggle All Notes sidebar", keys: ["Ctrl", "B"] },
  { id: "newNote", label: "Create new note", keys: ["Ctrl", "N"] },
  { id: "help", label: "Show keyboard shortcuts", keys: ["Ctrl", "/"] },
  { id: "close", label: "Close Notes window", keys: ["Esc"] },
];

export function NotesPopupShell() {
  const [notes, setNotes] = useState<Note[]>([DEFAULT_WELCOME_NOTE]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>("welcome-note");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightQuery, setSpotlightQuery] = useState("");
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [shortcutEnabledState, setShortcutEnabledState] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("keyflow:notes-shortcuts-disabled");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [historyRevisions, setHistoryRevisions] = useState<
    { id: string; noteId: string; timestamp: number; title: string; content: string }[]
  >([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [saveLocation, setSaveLocation] = useState<string>("");
  const [folderPopoverOpen, setFolderPopoverOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isLeavingFab, setIsLeavingFab] = useState(false);
  const [sortOrder, setSortOrder] = useState<NotesSortOrder>(() => {
    return localStorage.getItem("keyflow:notes-sort-order") === "oldest" ? "oldest" : "recent";
  });
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuPinnedOpen, setSortMenuPinnedOpen] = useState(false);
  const [notesPreferences, setNotesPreferences] = useState<NotesWindowPreferences>({
    windowSizePreset: "comfortable",
    followMouseOnOpen: true,
    windowPresetSizes: {
      comfortable: { width: 960, height: 800 },
      compact: { width: 700, height: 640 },
    },
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("keyflow:notes-sidebar-w");
    return saved ? Math.min(420, Math.max(160, Number(saved))) : 220;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [formatSheetOpen, setFormatSheetOpen] = useState(false);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [selectedImg, setSelectedImg] = useState<{
    target: HTMLImageElement;
    widthPercent: number;
    align: "left" | "center" | "right";
    rect: DOMRect;
  } | null>(null);

  // Slash commands state
  const [slashState, setSlashState] = useState<{
    query: string;
    position: { top: number; left: number };
    range: Range;
  } | null>(null);

  // Test Mode State & Live Window Dimensions (Only active when opened via Test Mode button)
  const [testModeInfo, setTestModeInfo] = useState<{ active: boolean; presetId: string; presetName: string } | null>(null);
  const [liveWindowSize, setLiveWindowSize] = useState<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [hudToast, setHudToast] = useState<string | null>(null);
  const [showSaveNewPopover, setShowSaveNewPopover] = useState(false);

  useEffect(() => {
    // Query initial test mode state from Electron
    window.electronAPI?.notes?.getTestMode?.().then((res: any) => {
      if (res?.active) {
        setTestModeInfo({
          active: true,
          presetId: res.presetId || "large",
          presetName: res.presetName || (res.presetId === "compact" ? "Compact" : "Large"),
        });
      }
    });

    // Listen for live test mode IPC events from Electron
    const unsub = window.electronAPI?.notes?.onTestModeState?.((state: any) => {
      if (state?.active) {
        setTestModeInfo({
          active: true,
          presetId: state.presetId || "large",
          presetName: state.presetName || (state.presetId === "compact" ? "Compact" : "Large"),
        });
      } else {
        setTestModeInfo(null);
      }
    });

    const handleResize = () => {
      setLiveWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      unsub?.();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<any>(null);
  const fabLeaveTimeoutRef = useRef<any>(null);
  const suppressStrayKeyUntilRef = useRef<number>(Date.now() + 350);
  const sortMenuPinnedOpenRef = useRef(false);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = Math.min(420, Math.max(160, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handlePointerUp = () => {
      setIsResizingSidebar(false);
      localStorage.setItem("keyflow:notes-sidebar-w", String(sidebarWidth));
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidebar, sidebarWidth]);

  // Active note lookup
  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) || notes[0] || null;
  }, [notes, activeNoteId]);

  // Load storage location and notes on mount
  useEffect(() => {
    if (window.electronAPI?.notes?.getSaveLocation) {
      window.electronAPI.notes.getSaveLocation().then((loc: string) => {
        if (loc) setSaveLocation(loc);
      });
    }

    if (window.electronAPI?.notes?.getPreferences) {
      window.electronAPI.notes.getPreferences().then((preferences) => {
        if (preferences) setNotesPreferences(preferences);
      });
    }

    if (window.electronAPI?.notes?.getAll) {
      window.electronAPI.notes.getAll().then((loaded: Note[]) => {
        if (loaded && loaded.length > 0) {
          setNotes(loaded);
          setActiveNoteId(loaded[0].id);
        } else {
          // Seed initial welcome note
          const initial = [DEFAULT_WELCOME_NOTE];
          setNotes(initial);
          setActiveNoteId(DEFAULT_WELCOME_NOTE.id);
          window.electronAPI?.notes?.save?.(DEFAULT_WELCOME_NOTE);
        }
      });
    }
  }, []);

  // Update editor content when activeNote changes
  useEffect(() => {
    if (editorRef.current && activeNote) {
      if (editorRef.current.innerHTML !== activeNote.content) {
        editorRef.current.innerHTML = activeNote.content || "";
      }
      // Record baseline revision snapshot
      setHistoryRevisions((prev) => {
        if (!prev.some((r) => r.noteId === activeNote.id)) {
          return [
            {
              id: "rev-" + Date.now(),
              noteId: activeNote.id,
              timestamp: activeNote.updatedAt || activeNote.createdAt || Date.now(),
              title: activeNote.title,
              content: activeNote.content,
            },
            ...prev,
          ];
        }
        return prev;
      });
    }
  }, [activeNote?.id]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleFocus = () => {
      suppressStrayKeyUntilRef.current = Date.now() + 350;
    };
    window.addEventListener("focus", handleFocus);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Spotlight search: Ctrl+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
        setSpotlightQuery("");
        setSpotlightIndex(0);
        return;
      }
      // Shortcuts modal: Ctrl+/
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsModalOpen((v) => !v);
        return;
      }
      // New note: Ctrl+N
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        handleCreateNote();
        return;
      }
      // Toggle sidebar: Ctrl+B or Ctrl+Shift+S
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "b" || (e.shiftKey && e.key.toLowerCase() === "s"))
      ) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      // Toggle pin: Ctrl+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p" && activeNote) {
        e.preventDefault();
        handleTogglePin(activeNote.id, e as any);
        return;
      }
      // Toggle export menu: Ctrl+E
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setFabMenuOpen(true);
        setExportMenuOpen(true);
        return;
      }
      // Find in current note: Ctrl+F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindBarOpen(true);
        setReplaceOpen(false);
        setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 50);
        return;
      }
      // Replace in current note: Ctrl+H
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setFindBarOpen(true);
        setReplaceOpen(true);
        setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 50);
        return;
      }
      // Escape
      if (e.key === "Escape") {
        if (findBarOpen) {
          setFindBarOpen(false);
          clearHighlights();
        } else if (spotlightOpen) {
          setSpotlightOpen(false);
        } else if (shortcutsModalOpen) {
          setShortcutsModalOpen(false);
        } else if (historyMenuOpen) {
          setHistoryMenuOpen(false);
        } else if (folderPopoverOpen) {
          setFolderPopoverOpen(false);
        } else if (formatSheetOpen) {
          setFormatSheetOpen(false);
        } else if (selectedImg) {
          setSelectedImg(null);
        } else {
          window.electronAPI?.notes?.close?.();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [notes, activeNote, spotlightOpen, shortcutsModalOpen, historyMenuOpen, folderPopoverOpen, findBarOpen, formatSheetOpen, selectedImg, matchCase]);

  const handleCreateNote = () => {
    const newNote: Note = {
      id: "note-" + Date.now(),
      title: "Untitled Note",
      content: "<p></p>",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    setActiveNoteId(newNote.id);
    if (window.electronAPI?.notes?.save) {
      // Save before the first keystroke, so a refresh or update cannot lose this note.
      window.electronAPI.notes.save(newNote).then((savedNotes) => {
        if (savedNotes?.length) setNotes(savedNotes);
      });
    }
    // Auto-focus title input on next tick
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 50);
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    const updatedNote: Note = {
      ...target,
      pinned: !target.pinned,
      updatedAt: Date.now(),
    };
    const updated = notes.map((n) => (n.id === id ? updatedNote : n));
    setNotes(updated);
    if (window.electronAPI?.notes?.save) {
      window.electronAPI.notes.save(updatedNote);
    }
  };

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.notes?.delete) {
      window.electronAPI.notes.delete(id).then((updated: Note[]) => {
        if (updated.length === 0) {
          const fresh = [DEFAULT_WELCOME_NOTE];
          setNotes(fresh);
          setActiveNoteId(DEFAULT_WELCOME_NOTE.id);
          window.electronAPI?.notes?.save?.(DEFAULT_WELCOME_NOTE);
        } else {
          setNotes(updated);
          setConfirmDeleteId(null);
          if (activeNoteId === id) {
            setActiveNoteId(updated[0]?.id || null);
          }
        }
      });
    } else {
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      setConfirmDeleteId(null);
      if (activeNoteId === id) {
        setActiveNoteId(remaining[0]?.id || null);
      }
    }
  };
  const handleSelectSaveLocation = async () => {
    if (window.electronAPI?.notes?.selectSaveLocation) {
      const res = await window.electronAPI.notes.selectSaveLocation();
      if (res && res.path) {
        setSaveLocation(res.path);
        if (res.notes && res.notes.length > 0) {
          setNotes(res.notes);
          setActiveNoteId(res.notes[0].id);
        }
        setSaveStatus("saved");
      }
    }
  };

  const handleSetSortOrder = (nextSortOrder: NotesSortOrder) => {
    setSortOrder(nextSortOrder);
    localStorage.setItem("keyflow:notes-sort-order", nextSortOrder);
    setSortMenuOpen(false);
    sortMenuPinnedOpenRef.current = false;
    setSortMenuPinnedOpen(false);
  };

  const toggleSortMenu = () => {
    const nextPinnedOpen = !sortMenuPinnedOpenRef.current;
    sortMenuPinnedOpenRef.current = nextPinnedOpen;
    setSortMenuPinnedOpen(nextPinnedOpen);
    setSortMenuOpen(nextPinnedOpen);
  };

  const updateNotesPreferences = async (patch: Partial<NotesWindowPreferences>) => {
    const update = window.electronAPI?.notes?.updatePreferences;
    if (!update) return;
    const preferences = await update(patch as any);
    setNotesPreferences(preferences as any);
  };

  const handleResetWindowSize = async () => {
    const reset = window.electronAPI?.notes?.resetWindowSize;
    if (!reset) return;
    const preferences = await reset();
    setNotesPreferences(preferences);
    setFabMenuOpen(false);
  };

  const handleTestModeUpdatePreset = async () => {
    if (!testModeInfo) return;
    const { width, height } = liveWindowSize;
    const targetPresetId = testModeInfo.presetId === "comfortable" ? "large" : testModeInfo.presetId;
    const targetName = testModeInfo.presetName || (targetPresetId === "compact" ? "Compact" : "Large");

    if (targetPresetId === "large" || targetPresetId === "compact") {
      await updateNotesPreferences({
        windowPresetSizes: {
          ...notesPreferences.windowPresetSizes,
          [targetPresetId]: { width, height },
        } as any,
      });
    } else {
      const customs = (notesPreferences as any).customPresets || [];
      const updated = customs.map((cp: any) =>
        cp.id === targetPresetId ? { ...cp, width, height } : cp
      );
      await updateNotesPreferences({
        customPresets: updated,
      });
    }

    if (window.electronAPI?.notes?.saveCurrentWindowSize) {
      await window.electronAPI.notes.saveCurrentWindowSize(targetPresetId);
    }

    setHudToast(`✓ Updated ${targetName} to ${width} × ${height} px`);
    setTimeout(() => setHudToast(null), 2500);

    localStorage.setItem(
      "keyflow:notes-preset-updated",
      JSON.stringify({ presetId: targetPresetId, width, height, ts: Date.now() })
    );
  };

  const handleTestModeSaveAsNew = async () => {
    const { width, height } = liveWindowSize;
    const name = `Custom (${width} × ${height})`;
    const id = "note-size-" + Date.now().toString(36);
    const newPreset = { id, name, width, height };
    const customs = [...((notesPreferences as any).customPresets || []), newPreset];

    await updateNotesPreferences({
      windowSizePreset: id,
      customPresets: customs,
    });

    if (window.electronAPI?.notes?.saveCurrentWindowSize) {
      await window.electronAPI.notes.saveCurrentWindowSize(id);
    }

    const nextInfo = { active: true, presetId: id, presetName: name };
    setTestModeInfo(nextInfo);

    setHudToast(`✓ Saved new preset "${name}"`);
    setTimeout(() => setHudToast(null), 2500);

    localStorage.setItem(
      "keyflow:notes-preset-updated",
      JSON.stringify({ presetId: id, width, height, ts: Date.now() })
    );
  };

  const handleTestModeDeletePreset = async () => {
    if (!testModeInfo || testModeInfo.presetId === "large" || testModeInfo.presetId === "comfortable" || testModeInfo.presetId === "compact") return;
    const customs = ((notesPreferences as any).customPresets || []).filter((cp: any) => cp.id !== testModeInfo.presetId);
    await updateNotesPreferences({
      windowSizePreset: "large",
      customPresets: customs,
    });
    const nextInfo = { active: true, presetId: "large", presetName: "Large" };
    setTestModeInfo(nextInfo);
    setHudToast("✓ Custom preset deleted");
    setTimeout(() => setHudToast(null), 2500);

    localStorage.setItem(
      "keyflow:notes-preset-updated",
      JSON.stringify({ presetId: "large", ts: Date.now() })
    );
  };

  const handleTestModeExit = () => {
    setTestModeInfo(null);
  };

  const checkSlashCommand = () => {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !editorRef.current) {
      setSlashState(null);
      return;
    }

    const anchorNode = sel.anchorNode;
    const anchorOffset = sel.anchorOffset;
    if (!anchorNode || !editorRef.current.contains(anchorNode)) {
      setSlashState(null);
      return;
    }

    if (anchorNode.nodeType !== Node.TEXT_NODE) {
      setSlashState(null);
      return;
    }

    const text = anchorNode.textContent || "";
    const beforeCaret = text.slice(0, anchorOffset);

    // Match slash command pattern
    const slashMatch = /(?:^|\s)\/([a-zA-Z0-9_-]*)$/.exec(beforeCaret);
    if (!slashMatch) {
      setSlashState(null);
      return;
    }

    // Reject URLs / disk paths / word boundaries
    if (/(?:https?:\/\/|file:\/\/|[A-Za-z]:\/)/.test(beforeCaret)) {
      setSlashState(null);
      return;
    }

    const query = slashMatch[1];
    const slashIndex = beforeCaret.lastIndexOf("/" + query);
    if (slashIndex === -1) {
      setSlashState(null);
      return;
    }

    try {
      const range = document.createRange();
      range.setStart(anchorNode, slashIndex);
      range.setEnd(anchorNode, anchorOffset);

      const rect = range.getBoundingClientRect();
      const paletteWidth = 240;
      const paletteHeight = 220;
      let top = rect.bottom + 4;
      let left = rect.left;

      if (top + paletteHeight > window.innerHeight - 20) {
        top = Math.max(10, rect.top - paletteHeight - 4);
      }
      if (left + paletteWidth > window.innerWidth - 20) {
        left = Math.max(10, window.innerWidth - paletteWidth - 20);
      }

      setSlashState({
        query,
        position: { top, left },
        range,
      });
    } catch {
      setSlashState(null);
    }
  };

  const handleSelectSlashCommand = async (cmd: SlashCommand) => {
    if (!slashState || !editorRef.current) return;
    const currentRange = slashState.range;
    setSlashState(null);
    await cmd.execute(editorRef.current, currentRange);
    if (editorRef.current) {
      triggerAutosave(undefined, editorRef.current.innerHTML);
      editorRef.current.focus();
    }
  };

  const recordRevision = (note: Note) => {
    setHistoryRevisions((prev) => {
      if (prev.length > 0 && prev[0].noteId === note.id && prev[0].content === note.content) {
        return prev;
      }
      const newRev = {
        id: "rev-" + Date.now(),
        noteId: note.id,
        timestamp: Date.now(),
        title: note.title,
        content: note.content,
      };
      return [newRev, ...prev].slice(0, 20);
    });
  };

  const handleRestoreRevision = (rev: { id: string; noteId: string; timestamp: number; title: string; content: string }) => {
    if (!activeNote || activeNote.id !== rev.noteId) return;
    setHistoryMenuOpen(false);
    if (editorRef.current) {
      editorRef.current.innerHTML = rev.content;
    }
    triggerAutosave(rev.title, rev.content);
  };

  const triggerAutosave = (newTitle?: string, newContent?: string) => {
    if (!activeNote) return;
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const updatedNote: Note = {
      ...activeNote,
      title: newTitle !== undefined ? newTitle : activeNote.title,
      content: newContent !== undefined ? newContent : activeNote.content,
      updatedAt: Date.now(),
    };

    // Optimistic state update
    setNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)));

    saveTimerRef.current = setTimeout(() => {
      if (window.electronAPI?.notes?.save) {
        window.electronAPI.notes.save(updatedNote).then(() => {
          setSaveStatus("saved");
          recordRevision(updatedNote);
        });
      } else {
        setSaveStatus("saved");
        recordRevision(updatedNote);
      }
    }, 300);
  };

  const execCommand = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (editorRef.current) {
      triggerAutosave(undefined, editorRef.current.innerHTML);
    }
  };

  const handleCopyNote = () => {
    if (!activeNote) return;
    const text = `${activeNote.title}\n\n${stripHtml(activeNote.content)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const handleFabMouseEnter = () => {
    if (fabLeaveTimeoutRef.current) {
      clearTimeout(fabLeaveTimeoutRef.current);
      fabLeaveTimeoutRef.current = null;
    }
    setIsLeavingFab(false);
    setFabMenuOpen(true);
  };

  const handleFabMouseLeave = () => {
    setIsLeavingFab(true);
    fabLeaveTimeoutRef.current = setTimeout(() => {
      setFabMenuOpen(false);
      setIsLeavingFab(false);
    }, 140);
  };

  // Clear any existing find highlight marks from editor DOM
  const clearHighlights = () => {
    if (!editorRef.current) return;
    const marks = editorRef.current.querySelectorAll("mark.notes-find-match");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) {
        parent?.insertBefore(mark.firstChild, mark);
      }
      parent?.removeChild(mark);
    });
    editorRef.current.normalize();
  };

  // Apply Apple Notes-style live highlight marks on matching words
  const applyHighlights = (query: string, targetIdx = 0, isCaseSensitive = matchCase) => {
    if (!editorRef.current || !activeNote) return;

    clearHighlights();

    if (!query || query.trim() === "") {
      setTotalMatches(0);
      setCurrentMatchIndex(0);
      return;
    }

    const editor = editorRef.current;
    const textNodes: Text[] = [];
    const walk = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walk.nextNode())) {
      if (node.parentElement?.closest(".no-find, script, style")) continue;
      textNodes.push(node as Text);
    }

    const regexFlags = isCaseSensitive ? "g" : "gi";
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let regex: RegExp;
    try {
      regex = new RegExp(escapedQuery, regexFlags);
    } catch {
      return;
    }

    let matchCount = 0;
    const createdMarks: HTMLElement[] = [];

    textNodes.forEach((textNode) => {
      const text = textNode.nodeValue || "";
      let match: RegExpExecArray | null;
      let lastIdx = 0;
      const frag = document.createDocumentFragment();
      let hasMatches = false;

      while ((match = regex.exec(text)) !== null) {
        hasMatches = true;
        const matchedText = match[0];
        const matchStart = match.index;

        if (matchStart > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, matchStart)));
        }

        const mark = document.createElement("mark");
        mark.className = "notes-find-match" + (matchCount === targetIdx ? " is-active" : "");
        mark.dataset.matchIndex = String(matchCount);
        mark.textContent = matchedText;
        frag.appendChild(mark);
        createdMarks.push(mark);

        matchCount++;
        lastIdx = matchStart + matchedText.length;
      }

      if (hasMatches) {
        if (lastIdx < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
        textNode.parentNode?.replaceChild(frag, textNode);
      }
    });

    setTotalMatches(matchCount);
    if (matchCount > 0) {
      const boundedIndex = Math.min(targetIdx, matchCount - 1);
      setCurrentMatchIndex(boundedIndex);
      if (createdMarks[boundedIndex]) {
        createdMarks[boundedIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      setCurrentMatchIndex(0);
    }
  };

  const updateActiveMark = (activeIdx: number) => {
    if (!editorRef.current) return;
    const marks = editorRef.current.querySelectorAll("mark.notes-find-match");
    marks.forEach((mark, i) => {
      if (i === activeIdx) {
        mark.classList.add("is-active");
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        mark.classList.remove("is-active");
      }
    });
  };

  const handleFindNext = () => {
    if (totalMatches === 0) return;
    const nextIdx = (currentMatchIndex + 1) % totalMatches;
    setCurrentMatchIndex(nextIdx);
    updateActiveMark(nextIdx);
  };

  const handleFindPrev = () => {
    if (totalMatches === 0) return;
    const prevIdx = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    setCurrentMatchIndex(prevIdx);
    updateActiveMark(prevIdx);
  };

  const handleReplaceCurrent = () => {
    if (!editorRef.current || totalMatches === 0 || !findQuery) return;
    const activeMark = editorRef.current.querySelector("mark.notes-find-match.is-active");
    if (activeMark) {
      const textNode = document.createTextNode(replaceQuery);
      activeMark.parentNode?.replaceChild(textNode, activeMark);
      clearHighlights();
      triggerAutosave(undefined, editorRef.current.innerHTML);
      setTimeout(() => applyHighlights(findQuery, currentMatchIndex), 50);
    }
  };

  const handleReplaceAll = () => {
    if (!editorRef.current || !findQuery || !activeNote) return;
    clearHighlights();
    const rawHtml = editorRef.current.innerHTML;
    const flags = matchCase ? "g" : "gi";
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, flags);
    const newHtml = rawHtml.replace(regex, replaceQuery);
    editorRef.current.innerHTML = newHtml;
    triggerAutosave(undefined, newHtml);
    setFindQuery("");
    setTotalMatches(0);
  };

  // Clean, structured pasting handler for code and rich content
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboardData = e.clipboardData;
    const text = clipboardData.getData("text/plain");
    const html = clipboardData.getData("text/html");

    // Check if pasted content is code or structured syntax
    const isCode =
      text.includes("\n") &&
      (text.startsWith("function ") ||
        text.startsWith("import ") ||
        text.startsWith("export ") ||
        text.startsWith("const ") ||
        text.startsWith("let ") ||
        text.startsWith("class ") ||
        text.startsWith("def ") ||
        text.startsWith("public ") ||
        text.startsWith("package ") ||
        text.includes(" => ") ||
        text.includes("{\n") ||
        text.includes(";\n") ||
        /^\s{2,4}\w+/m.test(text));

    if (isCode) {
      const escapedCode = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const codeHtml = `<pre class="notes-code-block"><code>${escapedCode}</code></pre><p><br></p>`;
      document.execCommand("insertHTML", false, codeHtml);
    } else if (html && !html.includes("<script")) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      doc.querySelectorAll("script, style, iframe, meta, link").forEach((el) => el.remove());
      doc.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
      const cleanHtml = doc.body.innerHTML || text;
      document.execCommand("insertHTML", false, cleanHtml);
    } else {
      document.execCommand("insertText", false, text);
    }

    if (editorRef.current) {
      triggerAutosave(undefined, editorRef.current.innerHTML);
    }
  };

  function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  const insertImageTag = (src: string, alt = "Image") => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const imgHtml = `<p><img src="${src}" alt="${alt}" class="notes-embedded-img" style="width: 100%; max-width: 100%; border-radius: var(--radius-md); display: block; margin: var(--space-2) auto;" /></p><p><br></p>`;
    document.execCommand("insertHTML", false, imgHtml);
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isImg =
        file.type.startsWith("image/") ||
        ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext);

      if (isImg) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (evt.target?.result) {
            insertImageTag(String(evt.target.result), file.name);
          }
        };
        reader.readAsDataURL(file);
      } else {
        let badgeType = "doc";
        if (["psd", "psb"].includes(ext)) badgeType = "psd";
        else if (["afdesign", "afphoto", "afpub", "affinity"].includes(ext)) badgeType = "affinity";
        else if (["pdf"].includes(ext)) badgeType = "pdf";
        else if (["ai", "eps", "fig", "sketch"].includes(ext)) badgeType = "vector";
        else if (["zip", "rar", "7z", "tar"].includes(ext)) badgeType = "archive";

        const sizeStr = formatFileSize(file.size);
        const cardHtml = `
          <div class="notes-attachment-card" contenteditable="false" data-file-name="${file.name}">
            <div class="notes-attachment-badge ${badgeType}">
              <span>${ext.toUpperCase() || "FILE"}</span>
            </div>
            <div class="notes-attachment-info">
              <span class="notes-attachment-name">${file.name}</span>
              <span class="notes-attachment-size">${sizeStr}</span>
            </div>
          </div>
          <p><br></p>
        `;
        if (editorRef.current) {
          editorRef.current.focus();
          document.execCommand("insertHTML", false, cardHtml);
          triggerAutosave(undefined, editorRef.current.innerHTML);
        }
      }
    }
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    checkSlashCommand();
    const target = e.target as HTMLElement;
    if (target && target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      const currentWidth = img.style.width || "100%";
      const numPercent = parseInt(currentWidth, 10) || 100;
      let currentAlign: "left" | "center" | "right" = "center";
      if (img.style.marginLeft === "0px" && img.style.marginRight === "auto") currentAlign = "left";
      if (img.style.marginLeft === "auto" && img.style.marginRight === "0px") currentAlign = "right";

      setSelectedImg({
        target: img,
        widthPercent: numPercent,
        align: currentAlign,
        rect,
      });
    } else {
      setSelectedImg(null);
    }
  };

  const handleSetImageWidth = (pct: number) => {
    if (!selectedImg || !editorRef.current) return;
    const img = selectedImg.target;
    img.style.width = `${pct}%`;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "var(--radius-md)";
    img.style.display = "block";
    setSelectedImg({
      ...selectedImg,
      widthPercent: pct,
      rect: img.getBoundingClientRect(),
    });
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handleSetImageAlign = (align: "left" | "center" | "right") => {
    if (!selectedImg || !editorRef.current) return;
    const img = selectedImg.target;
    img.style.display = "block";
    if (align === "left") {
      img.style.marginLeft = "0";
      img.style.marginRight = "auto";
    } else if (align === "right") {
      img.style.marginLeft = "auto";
      img.style.marginRight = "0";
    } else {
      img.style.marginLeft = "auto";
      img.style.marginRight = "auto";
    }
    setSelectedImg({
      ...selectedImg,
      align,
      rect: img.getBoundingClientRect(),
    });
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handleDeleteImage = () => {
    if (!selectedImg || !editorRef.current) return;
    selectedImg.target.remove();
    setSelectedImg(null);
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handleInsertTable = (rows = 3, cols = 2) => {
    if (!editorRef.current) return;
    let tableHtml = `<table class="notes-table"><tbody>`;
    for (let r = 0; r < rows; r++) {
      tableHtml += `<tr>`;
      for (let c = 0; c < cols; c++) {
        tableHtml += `<td>${r === 0 && c === 0 ? "Header 1" : r === 0 && c === 1 ? "Header 2" : "Cell"}</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br></p>`;
    editorRef.current.focus();
    document.execCommand("insertHTML", false, tableHtml);
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handleInsertChecklist = () => {
    if (!editorRef.current) return;
    const checkHtml = `<div class="notes-task-row"><input type="checkbox" class="notes-checkbox" /><span>&nbsp;To-do item</span></div><p><br></p>`;
    editorRef.current.focus();
    document.execCommand("insertHTML", false, checkHtml);
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handleHighlight = () => {
    if (!editorRef.current) return;
    document.execCommand("hiliteColor", false, "yellow");
    triggerAutosave(undefined, editorRef.current.innerHTML);
  };

  const handlePickImage = async () => {
    setFabMenuOpen(false);
    try {
      if (window.electronAPI?.notes?.pickFile) {
        const filePath = await window.electronAPI.notes.pickFile({ type: "image" });
        if (filePath) {
          insertImageTag(`file://${filePath.replace(/\\/g, "/")}`);
          return;
        }
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (evt.target?.result) {
              insertImageTag(String(evt.target.result));
            }
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } catch (err) {
      console.error("[Notes] Failed to pick image:", err);
    }
  };

  const handleTriggerSlashCommands = () => {
    setFabMenuOpen(false);
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand("insertText", false, "/");
    checkSlashCommand();
  };

  const handleExportAs = (format: "md" | "txt" | "html" | "json") => {
    if (!activeNote) return;
    setFabMenuOpen(false);
    setExportMenuOpen(false);

    let content = "";
    let mimeType = "text/plain;charset=utf-8";
    let ext = "txt";
    const baseName = (activeNote.title || "note").replace(/[^a-zA-Z0-9_-]/g, "_");

    if (format === "md") {
      content = activeNote.content;
      mimeType = "text/markdown;charset=utf-8";
      ext = "md";
    } else if (format === "txt") {
      content = `${activeNote.title}\n\n${stripHtml(activeNote.content)}`;
      mimeType = "text/plain;charset=utf-8";
      ext = "txt";
    } else if (format === "html") {
      content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeNote.title || "KeyFlow Note"}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 720px; margin: 40px auto; padding: 0 20px; }
    h1, h2, h3 { font-weight: 700; }
    code { font-family: monospace; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${activeNote.title}</h1>
  ${activeNote.content}
</body>
</html>`;
      mimeType = "text/html;charset=utf-8";
      ext = "html";
    } else if (format === "json") {
      content = JSON.stringify(activeNote, null, 2);
      mimeType = "application/json;charset=utf-8";
      ext = "json";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pinned notes remain at the top; the chosen order applies within each group.
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const difference = (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt);
      return sortOrder === "recent" ? -difference : difference;
    });
  }, [notes, sortOrder]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return sortedNotes;
    const q = searchQuery.toLowerCase();
    return sortedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
    );
  }, [sortedNotes, searchQuery]);

  const activeRevisions = useMemo(() => {
    if (!activeNote) return [];
    return historyRevisions.filter((r) => r.noteId === activeNote.id);
  }, [historyRevisions, activeNote?.id]);

  const spotlightFilteredNotes = useMemo(() => {
    if (!spotlightQuery.trim()) {
      return notes;
    }
    const q = spotlightQuery.toLowerCase().trim();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, spotlightQuery]);

  const plainText = useMemo(() => {
    return activeNote ? stripHtml(activeNote.content) : "";
  }, [activeNote?.content]);

  const wordCount = useMemo(() => {
    const words = plainText.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }, [plainText]);

  const charCount = useMemo(() => {
    return plainText.length;
  }, [plainText]);

  return (
    <div className={"notes-popup-root" + (testModeInfo?.active ? " is-test-mode" : "")}>
      {/* Test Mode Floating HUD Pill */}
      {testModeInfo?.active && (
        <div className="notes-test-mode-hud no-drag-region anim-slide-up">
          {hudToast && (
            <div className="notes-test-hud-toast">
              <Icon name="check" size={13} />
              <span>{hudToast}</span>
            </div>
          )}

          <div className="notes-test-mode-hud-pill">
            <div className="notes-test-mode-hud-indicator">
              <span className="notes-test-mode-pulse" />
              <span className="notes-test-mode-hud-title">{testModeInfo.presetName || "Test Size"}</span>
              <span className="notes-test-mode-hud-dim">{liveWindowSize.width} × {liveWindowSize.height} px</span>
            </div>

            <div className="notes-test-mode-hud-sep" />

            <div className="notes-test-mode-hud-actions">
              <button
                type="button"
                className="btn btn-primary btn-xs notes-test-hud-btn"
                title="Update this preset to current window size"
                onClick={handleTestModeUpdatePreset}
              >
                <Icon name="check" size={11} />
                <span>Update</span>
              </button>

              <div
                className="relative inline-flex items-center"
                onMouseEnter={() => setShowSaveNewPopover(true)}
                onMouseLeave={() => setShowSaveNewPopover(false)}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-xs notes-test-hud-btn"
                  title="Save current dimensions as a new custom preset"
                  onClick={handleTestModeSaveAsNew}
                >
                  <Icon name="plus" size={11} />
                  <span>Save as New</span>
                </button>

                {showSaveNewPopover && (
                  <div className="notes-test-sizes-popover anim-slide-up">
                    <div className="notes-test-popover-header">Standard & Recent Sizes</div>
                    <div className="notes-test-popover-item is-current">
                      <span>Live Window</span>
                      <span className="font-mono">{liveWindowSize.width} × {liveWindowSize.height}</span>
                    </div>
                    <div className="notes-test-popover-item">
                      <span>Compact</span>
                      <span className="font-mono">700 × 640</span>
                    </div>
                    <div className="notes-test-popover-item">
                      <span>Large</span>
                      <span className="font-mono">960 × 800</span>
                    </div>
                  </div>
                )}
              </div>

              {testModeInfo.presetId !== "large" && testModeInfo.presetId !== "comfortable" && testModeInfo.presetId !== "compact" && (
                <button
                  type="button"
                  className="btn btn-danger btn-xs notes-test-hud-btn"
                  title="Delete this custom preset"
                  onClick={handleTestModeDeletePreset}
                >
                  <Icon name="trash" size={11} />
                </button>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-xs notes-test-hud-btn notes-test-close-btn"
                title="Exit test mode"
                onClick={handleTestModeExit}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Window Header Strip */}
      <header className="notes-popup-header popup-drag-region">
        {/* Left: Hamburger menu toggle for All Notes & Folder Popover */}
        <div className="notes-header-left no-drag-region">
          <button
            type="button"
            className={"notes-header-icon-btn" + (sidebarOpen ? " is-active" : "")}
            title={sidebarOpen ? "Hide All Notes sidebar (Ctrl+B)" : "Show All Notes (Ctrl+B)"}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <Icon name="shortcuts" size={15} />
          </button>

          <div className="notes-folder-popover-anchor">
            <button
              type="button"
              className={"notes-header-icon-btn" + (folderPopoverOpen ? " is-active" : "")}
              title="Storage Directory & Placement"
              onClick={() => setFolderPopoverOpen((v) => !v)}
            >
              <Icon name="folder" size={14} />
            </button>

            {/* iOS-Style Folder Placement Popover */}
            {folderPopoverOpen && (
              <div className="notes-folder-popover anim-scale-in">
                <div className="notes-folder-popover-head">
                  <span className="notes-folder-popover-title">Storage Location</span>
                  <button
                    type="button"
                    className="notes-popover-close-btn"
                    onClick={() => setFolderPopoverOpen(false)}
                    title="Close"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
                <div className="notes-folder-popover-path" title={saveLocation || "Default KeyFlow AppData Storage"}>
                  <Icon name="folder" size={13} />
                  <span className="truncate">{saveLocation || "Default KeyFlow AppData Storage"}</span>
                </div>
                <div className="notes-folder-popover-actions">
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    title="Open folder in File Explorer"
                    onClick={() => {
                      if (saveLocation) {
                        void runAction({ id: "open-folder", type: "openFolder", payload: { path: saveLocation } });
                      }
                    }}
                  >
                    <Icon name="folder" size={13} />
                    <span>Open Location</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    title="Change storage folder"
                    onClick={() => {
                      handleSelectSaveLocation();
                      setFolderPopoverOpen(false);
                    }}
                  >
                    <Icon name="edit" size={13} />
                    <span>Change</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Note Title, Save Status Dot Indicator, and + New Note Button */}
        <div className="notes-header-center">
          <span className="notes-center-title truncate">
            {activeNote?.title || "KeyFlow Notes"}
          </span>
          <span
            className={"notes-status-dot-indicator" + (saveStatus === "saving" ? " is-typing" : " is-saved")}
            title={saveStatus === "saving" ? "Typing & saving…" : "Saved"}
          />
          <button
            type="button"
            className="notes-header-add-btn no-drag-region"
            title="Create New Note (Ctrl+N)"
            onClick={handleCreateNote}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        {/* Right: Window Close Button (Close only) */}
        <div className="notes-header-right no-drag-region">
          <div className="notes-window-controls no-drag-region">
            <button
              type="button"
              className="notes-win-ctrl-btn notes-win-close no-drag-region"
              title="Close (Esc)"
              onClick={() => {
                if (window.electronAPI?.notes?.close) {
                  window.electronAPI.notes.close();
                } else {
                  window.close();
                }
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Slide-Down Inline Search Strip */}
      {searchBarOpen && (
        <div className="notes-search-strip anim-dropdown-enter no-drag-region">
          <Icon name="search" size={13} />
          <input
            ref={searchInputRef}
            type="text"
            className="notes-search-field"
            placeholder="Search notes (Ctrl+F)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="notes-search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      )}

      {/* Main Body Grid */}
      <div className="notes-popup-body">
        {/* Left Notes List Sidebar */}
        <aside
          className={"notes-sidebar" + (sidebarOpen ? " is-open" : " is-collapsed")}
          style={sidebarOpen ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : {}}
        >
          <div className="notes-sidebar-head">
            <div className="row gap-xs items-center">
              <span className="notes-sidebar-label">ALL NOTES</span>
              <span className="notes-sidebar-total">{filteredNotes.length}</span>
            </div>
            <div className="row gap-xxs items-center no-drag-region">
              <div
                className="notes-sort-menu-anchor"
                onMouseEnter={() => setSortMenuOpen(true)}
                onMouseLeave={() => {
                  if (!sortMenuPinnedOpenRef.current) setSortMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  className={"notes-sidebar-action-btn" + (sortMenuOpen || sortMenuPinnedOpen ? " is-active" : "")}
                  title={`Sort notes: ${sortOrder === "recent" ? "recent first" : "oldest first"}`}
                  aria-label="Choose note sort order"
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen || sortMenuPinnedOpen}
                  onMouseDown={toggleSortMenu}
                  onClick={(event) => {
                    // Keyboard activation does not fire mouse events.
                    if (event.detail === 0) toggleSortMenu();
                  }}
                >
                  <Icon name="arrows" size={13} />
                </button>
                {(sortMenuOpen || sortMenuPinnedOpen) && (
                  <div className="notes-sort-menu" role="menu" aria-label="Note sort order">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortOrder === "recent"}
                      className={"notes-sort-menu-item" + (sortOrder === "recent" ? " is-selected" : "")}
                      onClick={() => handleSetSortOrder("recent")}
                    >
                      <Icon name="chevronDown" size={12} />
                      <span>Recent first</span>
                      {sortOrder === "recent" && <Icon name="check" size={12} />}
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortOrder === "oldest"}
                      className={"notes-sort-menu-item" + (sortOrder === "oldest" ? " is-selected" : "")}
                      onClick={() => handleSetSortOrder("oldest")}
                    >
                      <Icon name="chevronUp" size={12} />
                      <span>Oldest first</span>
                      {sortOrder === "oldest" && <Icon name="check" size={12} />}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="notes-sidebar-action-btn"
                title="Create New Note (Ctrl+N)"
                onClick={handleCreateNote}
              >
                <Icon name="plus" size={13} />
              </button>
              <button
                type="button"
                className="notes-sidebar-action-btn"
                title="Search Notes & Files (Ctrl+K)"
                onClick={() => {
                  setSpotlightOpen(true);
                  setSpotlightQuery("");
                  setSpotlightIndex(0);
                }}
              >
                <Icon name="search" size={13} />
              </button>
              <button
                type="button"
                className="notes-sidebar-action-btn"
                title="Keyboard Shortcuts (Ctrl+/)"
                onClick={() => setShortcutsModalOpen(true)}
              >
                <Icon name="keyboard" size={13} />
              </button>
            </div>
          </div>

          <div className="notes-list-scroll">
            {filteredNotes.length > 0 ? (
              filteredNotes.map((n) => {
                const preview = stripHtml(n.content).replace(/\s+/g, " ").trim() || "No additional text";
                const dateStr = formatNoteDate(n.updatedAt || n.createdAt);
                const isActive = n.id === activeNoteId;

                return (
                  <div
                    key={n.id}
                    className={"notes-sidebar-item" + (isActive ? " is-active" : "") + (n.pinned ? " is-pinned" : "")}
                    onClick={() => setActiveNoteId(n.id)}
                  >
                    <div className="notes-sidebar-item-header">
                      <span className="notes-item-title">
                        {n.pinned && <span className="notes-pin-icon" title="Pinned Note">📌</span>}
                        <span className="notes-item-title-text">{n.title || "Untitled Note"}</span>
                      </span>

                      {confirmDeleteId === n.id ? (
                        <div className="row gap-xxs notes-delete-confirm" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-danger btn-xs py-0 px-xs"
                            onClick={(e) => handleDeleteNote(n.id, e)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs py-0 px-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="notes-item-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={"notes-item-btn" + (n.pinned ? " is-pinned" : "")}
                            title={n.pinned ? "Unpin note" : "Pin note"}
                            onClick={(e) => handleTogglePin(n.id, e)}
                          >
                            <Icon name="pin" size={12} />
                          </button>
                          <button
                            type="button"
                            className="notes-item-btn notes-item-del-btn"
                            title="Delete note"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(n.id);
                            }}
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="notes-sidebar-item-snippet">{preview}</div>
                    <div className="notes-sidebar-item-meta">{dateStr}</div>
                  </div>
                );
              })
            ) : (
              <div className="notes-empty-sidebar">
                <Icon name="file" size={24} className="muted mb-xs" />
                <div className="muted tiny">No notes found</div>
              </div>
            )}
          </div>

          <div className="notes-sidebar-foot">
            <div className="notes-sidebar-count-row">
              <span className="muted tiny">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
              <span className="muted tiny"><kbd className="notes-kbd-hint">Esc</kbd> close</span>
            </div>
          </div>
        </aside>

        {/* Draggable Resizer Splitter (only active when sidebar is open) */}
        {sidebarOpen && (
          <div
            className={`notes-sidebar-resizer${isResizingSidebar ? " is-active" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setIsResizingSidebar(true);
            }}
            title="Drag to resize sidebar"
          />
        )}

        {/* Right Editor Area with Drag & Drop */}
        <main
          className={"notes-editor-pane" + (isDraggingOver ? " is-dragging" : "")}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop Overlay */}
          {isDraggingOver && (
            <div className="notes-drop-overlay anim-fade-in">
              <div className="notes-drop-content anim-scale-in">
                <Icon name="plus" size={32} className="text-accent mb-xs" />
                <div className="bold small">Drop to Insert</div>
                <div className="tiny muted">Images, PSD, Affinity (.afdesign, .afphoto), PDF & Files</div>
              </div>
            </div>
          )}

          {activeNote ? (
            <>
              {/* Note Header Info & Title */}
              <div className="notes-title-wrap">
                <div className="notes-meta-bar">
                  <span className="notes-date-meta">
                    {new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleDateString([], {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="notes-meta-stats">
                    <span>{wordCount} words</span>
                    <span>·</span>
                    <span>{charCount} chars</span>
                  </div>
                </div>

                <input
                  ref={titleInputRef}
                  type="text"
                  className="notes-title-input"
                  placeholder="Note Title"
                  value={activeNote.title}
                  onChange={(e) => triggerAutosave(e.target.value, undefined)}
                />
              </div>

              {/* Rich Text Toolbar */}
              <div className="notes-toolbar">
                {/* iOS Format Sheet Popover Anchor */}
                <div className="notes-format-sheet-anchor">
                  <button
                    type="button"
                    className={"notes-toolbar-btn notes-format-toggle-btn" + (formatSheetOpen ? " is-active" : "")}
                    title="iOS Format Sheet (Aa)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setFormatSheetOpen((v) => !v)}
                  >
                    <span className="bold">Aa</span>
                  </button>

                  {/* iOS Style Format Sheet Popover */}
                  {formatSheetOpen && (
                    <div className="notes-format-sheet anim-scale-in" onMouseDown={(e) => e.stopPropagation()}>
                      <div className="notes-format-sheet-head">
                        <span className="notes-format-sheet-title">Format</span>
                        <button
                          type="button"
                          className="notes-popover-close-btn"
                          onClick={() => setFormatSheetOpen(false)}
                          title="Close"
                        >
                          <Icon name="close" size={11} />
                        </button>
                      </div>

                      {/* Hierarchy Styles (Title, Heading, Subheading, Body, Monostyled) */}
                      <div className="notes-format-hierarchy-row">
                        <button
                          type="button"
                          className="notes-format-pill"
                          onClick={() => {
                            execCommand("formatBlock", "<h1>");
                            setFormatSheetOpen(false);
                          }}
                        >
                          Title
                        </button>
                        <button
                          type="button"
                          className="notes-format-pill"
                          onClick={() => {
                            execCommand("formatBlock", "<h2>");
                            setFormatSheetOpen(false);
                          }}
                        >
                          Heading
                        </button>
                        <button
                          type="button"
                          className="notes-format-pill"
                          onClick={() => {
                            execCommand("formatBlock", "<h3>");
                            setFormatSheetOpen(false);
                          }}
                        >
                          Subheading
                        </button>
                        <button
                          type="button"
                          className="notes-format-pill"
                          onClick={() => {
                            execCommand("formatBlock", "<p>");
                            setFormatSheetOpen(false);
                          }}
                        >
                          Body
                        </button>
                        <button
                          type="button"
                          className="notes-format-pill"
                          onClick={() => {
                            execCommand("formatBlock", "<pre>");
                            setFormatSheetOpen(false);
                          }}
                        >
                          Monostyled
                        </button>
                      </div>

                      {/* Inline Formats (B, I, U, S, Highlighter) */}
                      <div className="notes-format-inline-row">
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("bold")}
                          title="Bold"
                        >
                          <strong>B</strong>
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("italic")}
                          title="Italic"
                        >
                          <em>I</em>
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("underline")}
                          title="Underline"
                        >
                          <u>U</u>
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("strikeThrough")}
                          title="Strikethrough"
                        >
                          <s>S</s>
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={handleHighlight}
                          title="Highlighter"
                        >
                          <Icon name="highlighter" size={13} />
                        </button>
                      </div>

                      {/* Block & Table Controls */}
                      <div className="notes-format-block-row">
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("insertUnorderedList")}
                          title="Bullet List"
                        >
                          •
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("insertOrderedList")}
                          title="Numbered List"
                        >
                          1.
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={handleInsertChecklist}
                          title="Checklist"
                        >
                          <Icon name="checkCircle" size={13} />
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("outdent")}
                          title="Decrease Indent"
                        >
                          ⇥
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => execCommand("indent")}
                          title="Increase Indent"
                        >
                          ⇤
                        </button>
                        <button
                          type="button"
                          className="notes-format-inline-btn"
                          onClick={() => {
                            handleInsertTable(3, 2);
                            setFormatSheetOpen(false);
                          }}
                          title="Insert Table"
                        >
                          <Icon name="table" size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="notes-toolbar-divider" />

                {/* Character Formats */}
                <div className="notes-toolbar-group">
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Bold (Ctrl+B)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("bold")}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Italic (Ctrl+I)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("italic")}
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Underline (Ctrl+U)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("underline")}
                  >
                    <u>U</u>
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Highlighter"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleHighlight}
                  >
                    <Icon name="highlighter" size={13} />
                  </button>
                </div>

                <div className="notes-toolbar-divider" />

                {/* Lists & Table Insertion */}
                <div className="notes-toolbar-group">
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Checklist"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleInsertChecklist}
                  >
                    <Icon name="checkCircle" size={13} />
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Bullet List"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("insertUnorderedList")}
                  >
                    • List
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Insert Table"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInsertTable(3, 2)}
                  >
                    <Icon name="table" size={13} />
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Blockquote"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("formatBlock", "<blockquote>")}
                  >
                    ”
                  </button>
                </div>

                <div className="notes-toolbar-divider" />

                {/* History & Undo/Redo */}
                <div className="notes-toolbar-group notes-history-group-anchor">
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Undo (Ctrl+Z) · Right-click for revision history"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("undo")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setHistoryMenuOpen((v) => !v);
                    }}
                  >
                    <Icon name="undo" size={13} />
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Redo (Ctrl+Y) · Right-click for revision history"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("redo")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setHistoryMenuOpen((v) => !v);
                    }}
                  >
                    <Icon name="redo" size={13} />
                  </button>
                  <button
                    type="button"
                    className={"notes-toolbar-btn" + (historyMenuOpen ? " is-active" : "")}
                    title="Recent Revisions & History"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setHistoryMenuOpen((v) => !v)}
                  >
                    <Icon name="history" size={13} />
                  </button>

                  {/* History Revisions Popover */}
                  {historyMenuOpen && (
                    <div className="notes-history-popover anim-scale-in" onMouseDown={(e) => e.stopPropagation()}>
                      <div className="notes-history-popover-head">
                        <span className="notes-history-popover-title">Recent Revisions</span>
                        <button
                          type="button"
                          className="notes-popover-close-btn"
                          onClick={() => setHistoryMenuOpen(false)}
                          title="Close"
                        >
                          <Icon name="close" size={11} />
                        </button>
                      </div>
                      <div className="notes-history-list">
                        {activeRevisions.length > 0 ? (
                          activeRevisions.map((rev, idx) => {
                            const rawText = stripHtml(rev.content).trim() || "(empty note)";
                            const snippet = rawText.length > 90 ? rawText.slice(0, 90) + "…" : rawText;
                            return (
                              <button
                                key={rev.id}
                                type="button"
                                className="notes-history-item"
                                onClick={() => handleRestoreRevision(rev)}
                              >
                                <div className="notes-history-item-top">
                                  <span className="notes-history-item-time">{formatNoteDate(rev.timestamp)}</span>
                                  {idx === 0 && <span className="notes-history-item-current">Current</span>}
                                </div>
                                <span className="notes-history-item-preview">{snippet}</span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="notes-history-empty">
                            <span>No previous revisions yet. Edits will appear here automatically.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="notes-toolbar-divider" />

                {/* Find in Note Button */}
                <button
                  type="button"
                  className={"notes-toolbar-btn" + (findBarOpen ? " is-active" : "")}
                  title="Find & Replace in Note (Ctrl+F / Ctrl+H)"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setFindBarOpen((v) => !v);
                    if (!findBarOpen) {
                      setTimeout(() => {
                        findInputRef.current?.focus();
                        findInputRef.current?.select();
                      }, 50);
                    } else {
                      clearHighlights();
                    }
                  }}
                >
                  <Icon name="search" size={13} />
                </button>

                <div className="notes-toolbar-spacer" />

                {/* Professional Pin Button */}
                <button
                  type="button"
                  className={"notes-pin-toggle-btn" + (activeNote.pinned ? " is-pinned" : "")}
                  title={activeNote.pinned ? "Unpin note" : "Pin note to top"}
                  onClick={(e) => handleTogglePin(activeNote.id, e)}
                >
                  <Icon name="pin" size={13} />
                  <span>{activeNote.pinned ? "Pinned" : "Pin"}</span>
                </button>
              </div>

              {/* Apple Notes Style Floating Find & Replace Bar */}
              {findBarOpen && (
                <div className="notes-find-replace-bar anim-scale-in no-drag-region">
                  <div className="notes-find-row">
                    <div className="notes-find-input-wrap">
                      <Icon name="search" size={12} className="muted mr-xs" />
                      <input
                        ref={findInputRef}
                        type="text"
                        className="notes-find-input"
                        placeholder="Find in note…"
                        value={findQuery}
                        onChange={(e) => {
                          setFindQuery(e.target.value);
                          applyHighlights(e.target.value, 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (e.shiftKey) handleFindPrev();
                            else handleFindNext();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setFindBarOpen(false);
                            clearHighlights();
                          }
                        }}
                      />
                      <span className="notes-find-count">
                        {totalMatches > 0 ? `${currentMatchIndex + 1} of ${totalMatches}` : findQuery ? "0 matches" : ""}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="notes-find-btn"
                      title="Previous match (Shift+Enter)"
                      onClick={handleFindPrev}
                      disabled={totalMatches === 0}
                    >
                      <Icon name="chevronUp" size={12} />
                    </button>
                    <button
                      type="button"
                      className="notes-find-btn"
                      title="Next match (Enter)"
                      onClick={handleFindNext}
                      disabled={totalMatches === 0}
                    >
                      <Icon name="chevronDown" size={12} />
                    </button>
                    <button
                      type="button"
                      className={"notes-find-btn" + (matchCase ? " is-active" : "")}
                      title="Match Case"
                      onClick={() => {
                        const next = !matchCase;
                        setMatchCase(next);
                        applyHighlights(findQuery, currentMatchIndex, next);
                      }}
                    >
                      <span className="bold tiny">Aa</span>
                    </button>
                    <button
                      type="button"
                      className={"notes-find-btn" + (replaceOpen ? " is-active" : "")}
                      title="Toggle Replace (Ctrl+H)"
                      onClick={() => setReplaceOpen((v) => !v)}
                    >
                      <Icon name="edit" size={12} />
                    </button>
                    <button
                      type="button"
                      className="notes-find-btn"
                      title="Close (Escape)"
                      onClick={() => {
                        setFindBarOpen(false);
                        clearHighlights();
                      }}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </div>

                  {/* Expandable Replace Row */}
                  {replaceOpen && (
                    <div className="notes-find-row anim-scale-in">
                      <div className="notes-find-input-wrap">
                        <input
                          ref={replaceInputRef}
                          type="text"
                          className="notes-find-input"
                          placeholder="Replace with…"
                          value={replaceQuery}
                          onChange={(e) => setReplaceQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleReplaceCurrent();
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="notes-find-action-btn"
                        onClick={handleReplaceCurrent}
                        disabled={totalMatches === 0}
                        title="Replace current match"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="notes-find-action-btn"
                        onClick={handleReplaceAll}
                        disabled={totalMatches === 0}
                        title="Replace all matches"
                      >
                        Replace All
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Floating Image Resizing & Adjustment Toolbar */}
              {selectedImg && (
                <div
                  className="notes-img-adjust-bar anim-scale-in no-drag-region"
                  style={{
                    top: Math.max(10, selectedImg.rect.top - 46),
                    left: Math.max(10, Math.min(window.innerWidth - 320, selectedImg.rect.left)),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="notes-img-adjust-group">
                    <span className="notes-img-adjust-label">Size</span>
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.widthPercent <= 25 ? " is-active" : "")}
                      onClick={() => handleSetImageWidth(25)}
                      title="Small (25%)"
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.widthPercent > 25 && selectedImg.widthPercent <= 50 ? " is-active" : "")}
                      onClick={() => handleSetImageWidth(50)}
                      title="Medium (50%)"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.widthPercent > 50 && selectedImg.widthPercent <= 75 ? " is-active" : "")}
                      onClick={() => handleSetImageWidth(75)}
                      title="Large (75%)"
                    >
                      75%
                    </button>
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.widthPercent > 75 ? " is-active" : "")}
                      onClick={() => handleSetImageWidth(100)}
                      title="Full Width (100%)"
                    >
                      100%
                    </button>
                  </div>

                  <div className="notes-toolbar-divider" />

                  <div className="notes-img-adjust-group">
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.align === "left" ? " is-active" : "")}
                      onClick={() => handleSetImageAlign("left")}
                      title="Align Left"
                    >
                      <Icon name="alignLeft" size={12} />
                    </button>
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.align === "center" ? " is-active" : "")}
                      onClick={() => handleSetImageAlign("center")}
                      title="Align Center"
                    >
                      <Icon name="alignCenter" size={12} />
                    </button>
                    <button
                      type="button"
                      className={"notes-img-adjust-btn" + (selectedImg.align === "right" ? " is-active" : "")}
                      onClick={() => handleSetImageAlign("right")}
                      title="Align Right"
                    >
                      <Icon name="alignRight" size={12} />
                    </button>
                  </div>

                  <div className="notes-toolbar-divider" />

                  <button
                    type="button"
                    className="notes-img-adjust-btn notes-img-del-btn"
                    onClick={handleDeleteImage}
                    title="Delete Image"
                  >
                    <Icon name="trash" size={12} />
                  </button>

                  <button
                    type="button"
                    className="notes-img-adjust-btn"
                    onClick={() => setSelectedImg(null)}
                    title="Done"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              )}

              {/* Content Editable Note Canvas */}
              <div
                ref={editorRef}
                contentEditable
                className="notes-editor-content"
                data-placeholder="Start typing your note here… (Drag & drop images/files or type / for commands)"
                onKeyDown={(e) => {
                  if (
                    Date.now() < suppressStrayKeyUntilRef.current &&
                    e.key.length === 1 &&
                    !e.ctrlKey &&
                    !e.altKey &&
                    !e.metaKey
                  ) {
                    e.preventDefault();
                    return;
                  }
                }}
                onInput={() => {
                  if (editorRef.current) {
                    triggerAutosave(undefined, editorRef.current.innerHTML);
                  }
                  checkSlashCommand();
                }}
                onKeyUp={() => checkSlashCommand()}
                onClick={handleEditorClick}
                onPaste={handlePaste}
              />

              {/* Floating Action Menu & Copy Button at Bottom-Right */}
              <div
                className="notes-fab-wrap no-drag-region"
                onMouseEnter={handleFabMouseEnter}
                onMouseLeave={handleFabMouseLeave}
              >
                {fabMenuOpen && (
                  <div className={"notes-fab-popover" + (isLeavingFab ? " is-leaving" : " anim-scale-in")}>
                    {exportMenuOpen ? (
                      <>
                        <div className="notes-fab-popover-head-row">
                          <button
                            type="button"
                            className="notes-fab-back-btn"
                            onClick={() => setExportMenuOpen(false)}
                            title="Back to actions"
                          >
                            <Icon name="chevronLeft" size={12} />
                            <span>Export Formats</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => handleExportAs("md")}
                        >
                          <span className="notes-fab-item-icon"><Icon name="file" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Markdown (.md)</span>
                            <span className="notes-fab-item-desc">Headers, lists, tables</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => handleExportAs("txt")}
                        >
                          <span className="notes-fab-item-icon"><Icon name="edit" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Plain Text (.txt)</span>
                            <span className="notes-fab-item-desc">Clean unformatted text</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => handleExportAs("html")}
                        >
                          <span className="notes-fab-item-icon"><Icon name="globe" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">HTML (.html)</span>
                            <span className="notes-fab-item-desc">Formatted web document</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => handleExportAs("json")}
                        >
                          <span className="notes-fab-item-icon"><Icon name="database" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">JSON (.json)</span>
                            <span className="notes-fab-item-desc">Full metadata backup</span>
                          </div>
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="notes-fab-popover-header">Quick Actions</div>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={handleTriggerSlashCommands}
                        >
                          <span className="notes-fab-item-icon"><Icon name="command" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Slash Commands</span>
                            <span className="notes-fab-item-desc">Insert blocks & formatting</span>
                          </div>
                          <kbd className="notes-fab-kbd">/</kbd>
                        </button>

                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={handlePickImage}
                        >
                          <span className="notes-fab-item-icon"><Icon name="file" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Insert Picture</span>
                            <span className="notes-fab-item-desc">Add image from device</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={(e) => {
                            handleTogglePin(activeNote.id, e);
                            setFabMenuOpen(false);
                          }}
                        >
                          <span className="notes-fab-item-icon"><Icon name="pin" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">{activeNote.pinned ? "Unpin Note" : "Pin Note"}</span>
                            <span className="notes-fab-item-desc">{activeNote.pinned ? "Keep in list" : "Pin to top of list"}</span>
                          </div>
                        </button>

                        <div className="notes-fab-menu-divider" role="separator" />
                        <div className="notes-fab-menu-label">Window</div>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => void updateNotesPreferences({
                            windowSizePreset: notesPreferences.windowSizePreset === "comfortable" ? "compact" : "comfortable",
                          })}
                        >
                          <span className="notes-fab-item-icon"><Icon name="window" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">{notesPreferences.windowSizePreset === "comfortable" ? "Use compact size" : "Use comfortable size"}</span>
                            <span className="notes-fab-item-desc">
                              {notesPreferences.windowSizePreset === "comfortable"
                                ? `${notesPreferences.windowPresetSizes.compact.width} × ${notesPreferences.windowPresetSizes.compact.height}`
                                : `${notesPreferences.windowPresetSizes.comfortable.width} × ${notesPreferences.windowPresetSizes.comfortable.height}`}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => void updateNotesPreferences({ followMouseOnOpen: !notesPreferences.followMouseOnOpen })}
                        >
                          <span className="notes-fab-item-icon"><Icon name="mouse" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Follow mouse on open</span>
                            <span className="notes-fab-item-desc">{notesPreferences.followMouseOnOpen ? "On — opens near your pointer" : "Off — keeps its last position"}</span>
                          </div>
                          {notesPreferences.followMouseOnOpen && <Icon name="check" size={14} className="text-accent" />}
                        </button>
                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => void handleResetWindowSize()}
                        >
                          <span className="notes-fab-item-icon"><Icon name="arrows" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Reset window size</span>
                            <span className="notes-fab-item-desc">Return to the selected preset</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          className="notes-fab-item"
                          onClick={() => setExportMenuOpen(true)}
                        >
                          <span className="notes-fab-item-icon"><Icon name="export" size={14} /></span>
                          <div className="notes-fab-item-copy">
                            <span className="notes-fab-item-title">Export As…</span>
                            <span className="notes-fab-item-desc">.md, .txt, .html, .json</span>
                          </div>
                          <Icon name="chevronRight" size={12} className="muted" />
                        </button>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className={"notes-floating-copy-btn" + (copied ? " is-copied" : "")}
                  title={copied ? "Copied to clipboard!" : "Click to copy · Hover for actions"}
                  onClick={handleCopyNote}
                  aria-label="Copy note"
                >
                  <Icon name={copied ? "check" : "copy"} size={15} />
                  {copied && <span className="notes-copy-label">Copied!</span>}
                </button>
              </div>

              {slashState && (
                <SlashCommandPalette
                  commands={SLASH_COMMANDS}
                  query={slashState.query}
                  position={slashState.position}
                  onSelect={handleSelectSlashCommand}
                  onClose={() => setSlashState(null)}
                />
              )}
            </>
          ) : (
            <div className="notes-empty-state">
              <Icon name="file" size={44} className="muted mb-sm text-accent" />
              <h3>No note selected</h3>
              <p className="muted tiny mb-md">Choose a note from the left sidebar or create a new one.</p>
            </div>
          )}
        </main>
      </div>

      {/* Spotlight Command / Note Search Modal (Ctrl+K) */}
      {spotlightOpen && (
        <div className="notes-spotlight-backdrop anim-fade-in no-drag-region" onClick={() => setSpotlightOpen(false)}>
          <div className="notes-spotlight-modal anim-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="notes-spotlight-search-row">
              <Icon name="search" size={15} className="text-accent" />
              <input
                autoFocus
                type="text"
                className="notes-spotlight-input"
                placeholder="Search notes and files…"
                value={spotlightQuery}
                onChange={(e) => {
                  setSpotlightQuery(e.target.value);
                  setSpotlightIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSpotlightOpen(false);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSpotlightIndex((prev) => (spotlightFilteredNotes.length ? (prev + 1) % spotlightFilteredNotes.length : 0));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSpotlightIndex((prev) => (spotlightFilteredNotes.length ? (prev - 1 + spotlightFilteredNotes.length) % spotlightFilteredNotes.length : 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (spotlightFilteredNotes[spotlightIndex]) {
                      setActiveNoteId(spotlightFilteredNotes[spotlightIndex].id);
                      setSpotlightOpen(false);
                    }
                  }
                }}
              />
              <button
                type="button"
                className="notes-spotlight-close-btn"
                onClick={() => setSpotlightOpen(false)}
                title="Close (Esc)"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            <div className="notes-spotlight-results">
              {!spotlightQuery.trim() && activeNote && (
                <div className="notes-spotlight-section">
                  <div className="notes-spotlight-section-title">Last opened</div>
                  <button
                    type="button"
                    className={"notes-spotlight-item" + (spotlightIndex === 0 ? " is-selected" : "")}
                    onClick={() => {
                      setActiveNoteId(activeNote.id);
                      setSpotlightOpen(false);
                    }}
                  >
                    <span className="notes-spotlight-item-icon">
                      <Icon name="file" size={15} />
                    </span>
                    <div className="notes-spotlight-item-text">
                      <span className="notes-spotlight-item-title">{activeNote.title}</span>
                      <span className="notes-spotlight-item-date">{formatNoteDate(activeNote.updatedAt || activeNote.createdAt)}</span>
                    </div>
                  </button>
                </div>
              )}

              <div className="notes-spotlight-section">
                <div className="notes-spotlight-section-title">
                  {spotlightQuery.trim() ? "Search Results" : "Recent notes"}
                </div>
                {spotlightFilteredNotes.length > 0 ? (
                  spotlightFilteredNotes.map((n, idx) => {
                    const isSelected = (!spotlightQuery.trim() && activeNote) ? idx === spotlightIndex - 1 : idx === spotlightIndex;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={"notes-spotlight-item" + (isSelected ? " is-selected" : "")}
                        onClick={() => {
                          setActiveNoteId(n.id);
                          setSpotlightOpen(false);
                        }}
                      >
                        <span className="notes-spotlight-item-icon">
                          <Icon name={n.pinned ? "pin" : "file"} size={15} />
                        </span>
                        <div className="notes-spotlight-item-text">
                          <span className="notes-spotlight-item-title">{n.title}</span>
                          <span className="notes-spotlight-item-snippet">{stripHtml(n.content).slice(0, 70)}</span>
                        </div>
                        <span className="notes-spotlight-item-date">{formatNoteDate(n.updatedAt || n.createdAt)}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="notes-spotlight-empty">
                    <Icon name="search" size={22} className="muted mb-xs" />
                    <span>No notes found matching &ldquo;{spotlightQuery}&rdquo;</span>
                  </div>
                )}
              </div>
            </div>

            <div className="notes-spotlight-footer">
              <div className="row gap-xs items-center tiny muted">
                <span><kbd className="notes-kbd-hint">↑</kbd><kbd className="notes-kbd-hint">↓</kbd> navigate</span>
                <span>·</span>
                <span><kbd className="notes-kbd-hint">↵</kbd> open</span>
                <span>·</span>
                <span><kbd className="notes-kbd-hint">esc</kbd> close</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal (Ctrl+/) */}
      {shortcutsModalOpen && (
        <div className="notes-spotlight-backdrop anim-fade-in no-drag-region" onClick={() => setShortcutsModalOpen(false)}>
          <div className="notes-shortcuts-modal anim-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="notes-shortcuts-modal-head">
              <div>
                <h3 className="notes-shortcuts-modal-title">Keyboard shortcuts</h3>
                <p className="notes-shortcuts-modal-subtitle">To change a shortcut, select the key combination, and then type the new keys.</p>
              </div>
              <button
                type="button"
                className="notes-popover-close-btn"
                onClick={() => setShortcutsModalOpen(false)}
                title="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="notes-shortcuts-modal-body">
              <div className="notes-shortcuts-section">
                <div className="notes-shortcuts-section-heading">Composer & Editor</div>
                {EDITOR_SHORTCUTS.map((item) => (
                  <div key={item.id} className="notes-shortcut-row">
                    <label className="notes-shortcut-toggle-wrap">
                      <input
                        type="checkbox"
                        checked={shortcutEnabledState[item.id] ?? true}
                        onChange={(e) => {
                          const updated = { ...shortcutEnabledState, [item.id]: e.target.checked };
                          setShortcutEnabledState(updated);
                          localStorage.setItem("keyflow:notes-shortcuts-disabled", JSON.stringify(updated));
                        }}
                        className="notes-shortcut-checkbox"
                      />
                      <span className="notes-shortcut-label">{item.label}</span>
                    </label>
                    <div className="notes-shortcut-keys">
                      {item.keys.map((k) => (
                        <kbd key={k} className="notes-kbd-hint">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="notes-shortcuts-section">
                <div className="notes-shortcuts-section-heading">App & Navigation</div>
                {APP_SHORTCUTS.map((item) => (
                  <div key={item.id} className="notes-shortcut-row">
                    <label className="notes-shortcut-toggle-wrap">
                      <input
                        type="checkbox"
                        checked={shortcutEnabledState[item.id] ?? true}
                        onChange={(e) => {
                          const updated = { ...shortcutEnabledState, [item.id]: e.target.checked };
                          setShortcutEnabledState(updated);
                          localStorage.setItem("keyflow:notes-shortcuts-disabled", JSON.stringify(updated));
                        }}
                        className="notes-shortcut-checkbox"
                      />
                      <span className="notes-shortcut-label">{item.label}</span>
                    </label>
                    <div className="notes-shortcut-keys">
                      {item.keys.map((k) => (
                        <kbd key={k} className="notes-kbd-hint">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="notes-shortcuts-modal-footer">
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={() => {
                  setShortcutEnabledState({});
                  localStorage.removeItem("keyflow:notes-shortcuts-disabled");
                }}
              >
                Restore defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
