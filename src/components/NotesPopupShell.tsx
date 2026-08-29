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

export function NotesPopupShell() {
  const [notes, setNotes] = useState<Note[]>([DEFAULT_WELCOME_NOTE]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>("welcome-note");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [saveLocation, setSaveLocation] = useState<string>("");
  const [folderPopoverOpen, setFolderPopoverOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isLeavingFab, setIsLeavingFab] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("keyflow:notes-sidebar-w");
    return saved ? Math.min(420, Math.max(160, Number(saved))) : 220;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Slash commands state
  const [slashState, setSlashState] = useState<{
    query: string;
    position: { top: number; left: number };
    range: Range;
  } | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<any>(null);
  const fabLeaveTimeoutRef = useRef<any>(null);

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
    }
  }, [activeNote?.id]);

  // Global keyboard shortcuts (Ctrl+N for new note, Ctrl+F for search, Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateNote();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (searchQuery) {
          setSearchQuery("");
        } else {
          window.electronAPI?.notes?.close?.();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notes, searchQuery]);

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
      window.electronAPI.notes.save(newNote);
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
        });
      } else {
        setSaveStatus("saved");
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

  const insertImageTag = (src: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand("insertHTML", false, `<p><img src="${src}" alt="Note image" style="max-width:100%;border-radius:8px;margin:8px 0;" /></p><p><br></p>`);
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

  // Sorted notes: pinned first, then newest updated
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    });
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return sortedNotes;
    const q = searchQuery.toLowerCase();
    return sortedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
    );
  }, [sortedNotes, searchQuery]);

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
    <div className="notes-popup-root">
      {/* Window Header Strip */}
      <header className="notes-popup-header popup-drag-region">
        {/* Left: Hamburger menu toggle for All Notes & Folder Popover */}
        <div className="notes-header-left no-drag-region">
          <button
            type="button"
            className={"notes-header-icon-btn" + (sidebarOpen ? " is-active" : "")}
            title={sidebarOpen ? "Hide All Notes sidebar" : "Show All Notes"}
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

        {/* Center: Note Title and Save Status Dot Indicator */}
        <div className="notes-header-center">
          <span className="notes-center-title truncate">
            {activeNote?.title || "KeyFlow Notes"}
          </span>
          <span
            className={"notes-status-dot-indicator" + (saveStatus === "saving" ? " is-typing" : " is-saved")}
            title={saveStatus === "saving" ? "Typing & saving…" : "Saved"}
          />
        </div>

        {/* Right: Search Toggle Button and Close (X) */}
        <div className="notes-header-right no-drag-region">
          <button
            type="button"
            className={"notes-header-search-btn" + (searchBarOpen ? " is-active" : "")}
            title={searchBarOpen ? "Hide search" : "Search notes (Ctrl+F)"}
            onClick={() => {
              setSearchBarOpen((v) => !v);
              if (!searchBarOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }
            }}
          >
            <Icon name="search" size={13} />
            <span>Search</span>
          </button>

          <div className="notes-header-divider" />

          {/* Window Control Buttons on Top Right (Close only) */}
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
            <span className="notes-sidebar-label">ALL NOTES</span>
            <span className="notes-sidebar-total">{filteredNotes.length}</span>
          </div>

          <div className="notes-list-scroll">
            {filteredNotes.length > 0 ? (
              filteredNotes.map((n) => {
                const preview = stripHtml(n.content).slice(0, 80) || "No additional text";
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
                        {n.title || "Untitled Note"}
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
                            📌
                          </button>
                          <button
                            type="button"
                            className="notes-item-btn notes-delete-trigger"
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

                    <div className="notes-item-meta">
                      <span className="notes-item-date">{dateStr}</span>
                      <span className="notes-item-preview">{preview}</span>
                    </div>
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
            <button
              type="button"
              className="btn btn-primary btn-sm notes-sidebar-new-btn"
              title="New Note (Ctrl+N)"
              onClick={handleCreateNote}
            >
              <Icon name="create" size={14} />
              <span>New Note</span>
              <kbd className="notes-kbd-hint">Ctrl+N</kbd>
            </button>
            <div className="notes-sidebar-count-row">
              <span className="muted tiny">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
              <span className="muted tiny">Esc to close</span>
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

        {/* Right Editor Area */}
        <main className="notes-editor-pane">
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
                    title="Strikethrough"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("strikeThrough")}
                  >
                    <s>S</s>
                  </button>
                </div>

                <div className="notes-toolbar-divider" />

                {/* Headings */}
                <div className="notes-toolbar-group">
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Heading 1"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("formatBlock", "<h1>")}
                  >
                    H1
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Heading 2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("formatBlock", "<h2>")}
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Heading 3"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("formatBlock", "<h3>")}
                  >
                    H3
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Body Paragraph"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("formatBlock", "<p>")}
                  >
                    ¶
                  </button>
                </div>

                <div className="notes-toolbar-divider" />

                {/* Lists & Blocks */}
                <div className="notes-toolbar-group">
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
                    title="Numbered List"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("insertOrderedList")}
                  >
                    1. List
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
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Horizontal Line"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("insertHorizontalRule")}
                  >
                    —
                  </button>
                </div>

                <div className="notes-toolbar-divider" />

                {/* History */}
                <div className="notes-toolbar-group">
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Undo (Ctrl+Z)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("undo")}
                  >
                    ↩
                  </button>
                  <button
                    type="button"
                    className="notes-toolbar-btn"
                    title="Redo (Ctrl+Y)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execCommand("redo")}
                  >
                    ↪
                  </button>
                </div>

                <div className="notes-toolbar-spacer" />

                <button
                  type="button"
                  className="notes-pin-toggle-btn"
                  title={activeNote.pinned ? "Unpin note" : "Pin note to top"}
                  onClick={(e) => handleTogglePin(activeNote.id, e)}
                >
                  <span>{activeNote.pinned ? "📌 Pinned" : "📌 Pin"}</span>
                </button>
              </div>

              {/* Content Editable Note Canvas */}
              <div
                ref={editorRef}
                contentEditable
                className="notes-editor-content"
                data-placeholder="Start typing your note here… (Type / for commands)"
                onInput={() => {
                  if (editorRef.current) {
                    triggerAutosave(undefined, editorRef.current.innerHTML);
                  }
                  checkSlashCommand();
                }}
                onKeyUp={() => checkSlashCommand()}
                onClick={() => checkSlashCommand()}
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
    </div>
  );
}
