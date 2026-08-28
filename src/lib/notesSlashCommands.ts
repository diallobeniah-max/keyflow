import { IconName } from "../components/Icon";

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  category: "Basic" | "Headings" | "Lists" | "Media" | "Advanced";
  keywords: string[];
  execute: (editor: HTMLElement, range?: Range) => void | Promise<void>;
}

/**
 * Helper to delete the typed slash query from the current selection range
 */
export function removeSlashQuery(range?: Range) {
  if (!range) return;
  try {
    range.deleteContents();
  } catch (e) {
    console.error("[SlashCommands] Failed to delete slash query range:", e);
  }
}

/**
 * Helper to insert an HTML fragment at the current selection and position caret
 */
export function insertHtmlAtSelection(html: string, range?: Range) {
  const sel = window.getSelection();
  if (!sel) return;

  if (range) {
    sel.removeAllRanges();
    sel.addRange(range);
    range.deleteContents();
  }

  const el = document.createElement("div");
  el.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node: ChildNode | null;
  let lastNode: ChildNode | null = null;
  while ((node = el.firstChild)) {
    lastNode = frag.appendChild(node);
  }

  if (sel.rangeCount > 0) {
    const currentRange = sel.getRangeAt(0);
    currentRange.insertNode(frag);
    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }
}

/**
 * Reusable Registry of all Slash Commands
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  // Basic
  {
    id: "text",
    label: "Text",
    hint: "Normal body paragraph",
    icon: "text",
    category: "Basic",
    keywords: ["text", "paragraph", "p", "normal", "body"],
    execute: (editor, range) => {
      removeSlashQuery(range);
      document.execCommand("formatBlock", false, "<p>");
    },
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Horizontal rule",
    icon: "swap",
    category: "Basic",
    keywords: ["divider", "horizontal", "rule", "line", "separator", "hr", "---"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      insertHtmlAtSelection("<hr /><p><br></p>", range);
    },
  },
  {
    id: "emoji",
    label: "Emoji",
    hint: "Quick star emoji",
    icon: "star",
    category: "Basic",
    keywords: ["emoji", "star", "smile", "icon", "symbol"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      insertHtmlAtSelection("✨ ", range);
    },
  },

  // Headings
  {
    id: "h1",
    label: "Heading 1",
    hint: "# Large title",
    icon: "text",
    category: "Headings",
    keywords: ["h1", "heading1", "title", "large", "header1"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("formatBlock", false, "<h1>");
    },
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "## Medium section",
    icon: "text",
    category: "Headings",
    keywords: ["h2", "heading2", "subtitle", "medium", "header2"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("formatBlock", false, "<h2>");
    },
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "### Small subsection",
    icon: "text",
    category: "Headings",
    keywords: ["h3", "heading3", "small", "header3"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("formatBlock", false, "<h3>");
    },
  },
  {
    id: "h4",
    label: "Heading 4",
    hint: "#### Subsection heading",
    icon: "text",
    category: "Headings",
    keywords: ["h4", "heading4", "sub", "header4"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("formatBlock", false, "<h4>");
    },
  },
  {
    id: "h5",
    label: "Heading 5",
    hint: "##### Minor heading",
    icon: "text",
    category: "Headings",
    keywords: ["h5", "heading5", "micro", "header5"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("formatBlock", false, "<h5>");
    },
  },

  // Lists
  {
    id: "bulletList",
    label: "Bulleted list",
    hint: "• Unordered list",
    icon: "list",
    category: "Lists",
    keywords: ["bullet", "list", "ul", "unordered", "points"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("insertUnorderedList");
    },
  },
  {
    id: "numberedList",
    label: "Numbered list",
    hint: "1. Ordered list",
    icon: "list",
    category: "Lists",
    keywords: ["numbered", "ordered", "ol", "numbers", "sequence"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      document.execCommand("insertOrderedList");
    },
  },
  {
    id: "todoList",
    label: "To-do list",
    hint: "☐ Interactive task item",
    icon: "check",
    category: "Lists",
    keywords: ["todo", "task", "checklist", "check", "box", "done"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      insertHtmlAtSelection(
        '<div class="note-todo-item"><input type="checkbox" /> <span>Task item</span></div><p><br></p>',
        range
      );
    },
  },

  // Advanced
  {
    id: "callout",
    label: "Callout",
    hint: "💡 Highlighted callout box",
    icon: "notify",
    category: "Advanced",
    keywords: ["callout", "note", "alert", "box", "tip", "info", "quote"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      insertHtmlAtSelection(
        '<blockquote class="note-callout"><strong>Note:</strong> Enter important details here…</blockquote><p><br></p>',
        range
      );
    },
  },
  {
    id: "table",
    label: "Table",
    hint: "2×2 Markdown table grid",
    icon: "grid",
    category: "Advanced",
    keywords: ["table", "grid", "data", "rows", "columns"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      insertHtmlAtSelection(
        '<table class="note-table"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></tbody></table><p><br></p>',
        range
      );
    },
  },
  {
    id: "dropdown",
    label: "Dropdown",
    hint: "Collapsible details block",
    icon: "arrowRight",
    category: "Advanced",
    keywords: ["dropdown", "details", "summary", "collapse", "accordion", "toggle"],
    execute: (_editor, range) => {
      removeSlashQuery(range);
      insertHtmlAtSelection(
        '<details class="note-dropdown"><summary>Toggle Details</summary><p>Hidden content goes here…</p></details><p><br></p>',
        range
      );
    },
  },

  // Media
  {
    id: "image",
    label: "Image",
    hint: "Insert or browse image file",
    icon: "image",
    category: "Media",
    keywords: ["image", "picture", "photo", "img", "media", "upload"],
    execute: async (_editor, range) => {
      removeSlashQuery(range);
      if (window.electronAPI?.notes?.pickFile) {
        const filePath = await window.electronAPI.notes.pickFile({ type: "image" });
        if (filePath) {
          const fileUrl = `file:///${filePath.replace(/\\/g, "/")}`;
          insertHtmlAtSelection(`<p><img src="${fileUrl}" alt="Inserted Image" class="note-embedded-image" /></p><p><br></p>`, range);
          return;
        }
      }
      const url = prompt("Enter image URL or path:");
      if (url && url.trim()) {
        insertHtmlAtSelection(`<p><img src="${url.trim()}" alt="Image" class="note-embedded-image" /></p><p><br></p>`, range);
      }
    },
  },
  {
    id: "video",
    label: "Video",
    hint: "Insert video file or link",
    icon: "play",
    category: "Media",
    keywords: ["video", "clip", "movie", "mp4", "webm"],
    execute: async (_editor, range) => {
      removeSlashQuery(range);
      if (window.electronAPI?.notes?.pickFile) {
        const filePath = await window.electronAPI.notes.pickFile({ type: "video" });
        if (filePath) {
          const fileUrl = `file:///${filePath.replace(/\\/g, "/")}`;
          insertHtmlAtSelection(`<p><video src="${fileUrl}" controls class="note-embedded-video"></video></p><p><br></p>`, range);
          return;
        }
      }
      const url = prompt("Enter video URL or link:");
      if (url && url.trim()) {
        insertHtmlAtSelection(`<p><a href="${url.trim()}" target="_blank" class="note-link">🎬 Video Link: ${url.trim()}</a></p><p><br></p>`, range);
      }
    },
  },
  {
    id: "file",
    label: "File",
    hint: "Attach file link",
    icon: "folder",
    category: "Media",
    keywords: ["file", "attachment", "document", "pdf", "attach"],
    execute: async (_editor, range) => {
      removeSlashQuery(range);
      if (window.electronAPI?.notes?.pickFile) {
        const filePath = await window.electronAPI.notes.pickFile({ type: "file" });
        if (filePath) {
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const fileUrl = `file:///${filePath.replace(/\\/g, "/")}`;
          insertHtmlAtSelection(`<p><a href="${fileUrl}" target="_blank" class="note-file-attachment">📁 ${fileName}</a></p><p><br></p>`, range);
          return;
        }
      }
      const url = prompt("Enter file path or URL:");
      if (url && url.trim()) {
        insertHtmlAtSelection(`<p><a href="${url.trim()}" target="_blank" class="note-file-attachment">📁 ${url.trim()}</a></p><p><br></p>`, range);
      }
    },
  },
];
