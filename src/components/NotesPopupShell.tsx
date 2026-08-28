import { useEffect, useRef, useState, useMemo } from "react";
import { Icon } from "./Icon";

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
  <li><b>Rich Formatting:</b> Bold, italic, underline, strikethrough, headings, lists, quotes, and code blocks.</li>
  <li><b>Instant Autosave:</b> Never lose your thoughts with continuous debounced saving.</li>
  <li><b>Quick Access:</b> Trigger instantly with your configured shortcut or Hyper Key.</li>
  <li><b>1-Click Copy:</b> Quickly export or copy notes directly to your clipboard.</li>
</ul>

<h3>🎯 Quick Checklist</h3>
<ul>
  <li>Review active keyboard &amp; mouse shortcut triggers</li>
  <li>Pin important notes to keep them at the top</li>
  <li>Try the new Raycast-style command palette (<code>Hyper + Space</code>)</li>
</ul>

<p><i>Press <b>Ctrl+N</b> or click <b>+ New Note</b> in the toolbar above to start typing your own note!</i></p>`,
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
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("keyflow:notes-sidebar-w");
    return saved ? Math.min(420, Math.max(160, Number(saved))) : 220;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<any>(null);

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

  // Load notes on mount; if empty, seed welcome note
  useEffect(() => {
    if (window.electronAPI?.notes?.getAll) {
      window.electronAPI.notes.getAll().then((loaded: Note[]) => {
        if (loaded && loaded.length > 0) {
          setNotes(loaded);
          setActiveNoteId(loaded[0].id);
        } else {
          // Seed the initial welcome note
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
      setTimeout(() => setCopied(false), 2000);
    });
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
        <div className="notes-header-left">
          <div className="notes-brand-title">
            <span className="notes-header-badge">
              <Icon name="file" size={14} />
            </span>
            <span className="notes-header-title">KeyFlow Notes</span>
            <span className="notes-header-count">{notes.length}</span>
          </div>
        </div>

        {/* Center Search Bar */}
        <div className="notes-header-center no-drag-region">
          <div className="notes-search-input-wrap">
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
        </div>

        {/* Right Header Actions & Window Controls */}
        <div className="notes-header-right no-drag-region">
          <button
            type="button"
            className={"btn btn-subtle btn-sm notes-copy-btn" + (copied ? " is-copied" : "")}
            title="Copy Note Text"
            onClick={handleCopyNote}
          >
            <Icon name={copied ? "check" : "copy"} size={13} />
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>

          <span className={"notes-save-pill" + (saveStatus === "saving" ? " is-saving" : " is-saved")}>
            <span className="status-dot" />
            <span>{saveStatus === "saving" ? "Saving…" : "Saved"}</span>
          </span>

          <div className="notes-header-divider" />

          {/* Window Control Buttons on Top Right */}
          <div className="notes-window-controls no-drag-region">
            <button
              type="button"
              className="notes-win-ctrl-btn no-drag-region"
              title="Minimize"
              onClick={() => {
                if (window.electronAPI?.notes?.minimize) {
                  window.electronAPI.notes.minimize();
                } else if (window.electronAPI?.notes?.close) {
                  window.electronAPI.notes.close();
                }
              }}
            >
              <span className="notes-win-icon-min">─</span>
            </button>
            <button
              type="button"
              className="notes-win-ctrl-btn no-drag-region"
              title="Maximize / Restore"
              onClick={() => {
                if (window.electronAPI?.notes?.maximize) {
                  window.electronAPI.notes.maximize();
                }
              }}
            >
              <span className="notes-win-icon-max">□</span>
            </button>
            <button
              type="button"
              className="notes-win-ctrl-btn notes-win-close no-drag-region"
              title="Close (Esc)"
              onClick={() => {
                if (window.electronAPI?.notes?.close) {
                  window.electronAPI.notes.close();
                }
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Grid */}
      <div className="notes-popup-body">
        {/* Left Notes List Sidebar */}
        <aside className="notes-sidebar" style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}>
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

        {/* Draggable Resizer Splitter */}
        <div
          className={`notes-sidebar-resizer${isResizingSidebar ? " is-active" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
          title="Drag to resize sidebar"
        />

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
                data-placeholder="Start typing your note here…"
                onInput={() => {
                  if (editorRef.current) {
                    triggerAutosave(undefined, editorRef.current.innerHTML);
                  }
                }}
              />
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
