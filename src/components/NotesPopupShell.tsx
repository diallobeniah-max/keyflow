import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export function NotesPopupShell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId) || notes[0] || null;
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<any>(null);

  // Load notes on mount
  useEffect(() => {
    if (window.electronAPI?.notes?.getAll) {
      window.electronAPI.notes.getAll().then((loaded) => {
        setNotes(loaded);
        if (loaded.length > 0) {
          setActiveNoteId(loaded[0].id);
        }
      });
    }
  }, []);

  // Update editor innerHTML when activeNote changes
  useEffect(() => {
    if (editorRef.current && activeNote) {
      if (editorRef.current.innerHTML !== activeNote.content) {
        editorRef.current.innerHTML = activeNote.content || "";
      }
    }
  }, [activeNoteId]);

  const handleCreateNote = () => {
    const newNote: Note = {
      id: "note-" + Date.now(),
      title: "Untitled Note",
      content: "<p>Start typing here...</p>",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    setActiveNoteId(newNote.id);
    if (window.electronAPI?.notes?.save) {
      window.electronAPI.notes.save(newNote);
    }
  };

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.notes?.delete) {
      window.electronAPI.notes.delete(id).then((updated) => {
        setNotes(updated);
        setConfirmDeleteId(null);
        if (activeNoteId === id) {
          setActiveNoteId(updated[0]?.id || null);
        }
      });
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
    }, 400);
  };

  const execCommand = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (editorRef.current) {
      triggerAutosave(undefined, editorRef.current.innerHTML);
    }
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="notes-popup-root">
      {/* Window Header Strip */}
      <header className="notes-popup-header" style={{ WebkitAppRegion: "drag" } as any}>
        <div className="notes-header-left">
          <Icon name="file" size={16} className="text-accent" />
          <span className="notes-header-title">KeyFlow Notes</span>
        </div>

        <div className="notes-header-center row align-center gap-xs" style={{ WebkitAppRegion: "no-drag" } as any}>
          <button type="button" className="btn btn-primary btn-xs" onClick={handleCreateNote}>
            <Icon name="create" size={13} />
            <span>New Note</span>
          </button>

          <div className="notes-search-input-wrap">
            <Icon name="search" size={13} />
            <input
              type="text"
              className="notes-search-field"
              placeholder="Filter notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="notes-header-right row align-center gap-xs" style={{ WebkitAppRegion: "no-drag" } as any}>
          <span className="tiny muted">{saveStatus === "saving" ? "Saving…" : "Saved"}</span>
          <button
            type="button"
            className="notes-close-btn"
            title="Close Notes (Esc)"
            onClick={() => window.electronAPI?.notes?.close()}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      {/* Main Body Grid */}
      <div className="notes-popup-body">
        {/* Left Notes List Sidebar */}
        <aside className="notes-sidebar">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((n) => (
              <div
                key={n.id}
                className={"notes-sidebar-item" + (n.id === activeNoteId ? " is-active" : "")}
                onClick={() => setActiveNoteId(n.id)}
              >
                <div className="notes-sidebar-item-header">
                  <span className="notes-item-title">{n.title || "Untitled"}</span>
                  {confirmDeleteId === n.id ? (
                    <div className="row gap-xxs" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-danger btn-xs py-0 px-xs"
                        onClick={(e) => handleDeleteNote(n.id, e)}
                      >
                        Confirm
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
                    <button
                      type="button"
                      className="notes-item-delete-btn"
                      title="Delete note"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(n.id);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
                <div className="notes-item-preview">
                  {n.content.replace(/<[^>]*>/g, "").slice(0, 60) || "Empty note"}
                </div>
              </div>
            ))
          ) : (
            <div className="p-md text-center muted tiny">No notes found</div>
          )}
        </aside>

        {/* Right Editor Area */}
        <main className="notes-editor-pane">
          {activeNote ? (
            <>
              {/* Note Title Input */}
              <input
                type="text"
                className="notes-title-input"
                placeholder="Note Title"
                value={activeNote.title}
                onChange={(e) => triggerAutosave(e.target.value, undefined)}
              />

              {/* Rich Text Toolbar */}
              <div className="notes-toolbar">
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Bold (Ctrl+B)"
                  onClick={() => execCommand("bold")}
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Italic (Ctrl+I)"
                  onClick={() => execCommand("italic")}
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Underline (Ctrl+U)"
                  onClick={() => execCommand("underline")}
                >
                  <u>U</u>
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Strikethrough"
                  onClick={() => execCommand("strikeThrough")}
                >
                  <s>S</s>
                </button>

                <div className="notes-toolbar-divider" />

                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Heading 1"
                  onClick={() => execCommand("formatBlock", "<h1>")}
                >
                  H1
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Heading 2"
                  onClick={() => execCommand("formatBlock", "<h2>")}
                >
                  H2
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Normal Paragraph"
                  onClick={() => execCommand("formatBlock", "<p>")}
                >
                  P
                </button>

                <div className="notes-toolbar-divider" />

                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Bullet List"
                  onClick={() => execCommand("insertUnorderedList")}
                >
                  • List
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Numbered List"
                  onClick={() => execCommand("insertOrderedList")}
                >
                  1. List
                </button>

                <div className="notes-toolbar-divider" />

                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Undo (Ctrl+Z)"
                  onClick={() => execCommand("undo")}
                >
                  ↩
                </button>
                <button
                  type="button"
                  className="notes-toolbar-btn"
                  title="Redo (Ctrl+Y)"
                  onClick={() => execCommand("redo")}
                >
                  ↪
                </button>
              </div>

              {/* Content Editable Body */}
              <div
                ref={editorRef}
                contentEditable
                className="notes-editor-content"
                onInput={() => {
                  if (editorRef.current) {
                    triggerAutosave(undefined, editorRef.current.innerHTML);
                  }
                }}
              />
            </>
          ) : (
            <div className="notes-empty-state">
              <Icon name="file" size={32} className="muted mb-sm" />
              <h3>No notes yet</h3>
              <p className="muted tiny mb-md">Create your first note to capture ideas and snippets.</p>
              <button type="button" className="btn btn-primary" onClick={handleCreateNote}>
                Create New Note
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
