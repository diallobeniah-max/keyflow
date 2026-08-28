import type { AppPage, PersistedState, Shortcut } from "../types/index.ts";
import { ACTION_META } from "./constants.ts";
import { formatShortcutLabel, formatTriggerLabel } from "./conflict";
import { SETTINGS_INDEX, type SettingSearchItem } from "./settingsIndex";

export type CommandCategory = "Navigation" | "Quick actions" | "Shortcuts" | "Settings";

export interface CommandExecutionContext {
  navigate: (page: AppPage) => void;
  openSetting: (target: Pick<SettingSearchItem, "category" | "anchorId">) => void;
  setEditing: (id: string | null) => void;
  togglePaused: () => void;
  setSafeMode: (enabled: boolean) => void;
  toggleTheme: () => void;
  openLayoutPreview: () => void;
  openPopup: () => void;
  openNotes: () => void;
  runShortcut: (shortcut: Shortcut) => void;
  toast: (message: string, kind?: "info" | "success" | "warning" | "danger") => void;
}

export interface CommandDefinition {
  id: string;
  title: string;
  description: string;
  category: CommandCategory;
  icon: string;
  keywords: string[];
  shortcut?: string;
  disabled?: boolean;
  execute: (context: CommandExecutionContext) => void;
}

function command(
  definition: Omit<CommandDefinition, "execute">,
  execute: CommandDefinition["execute"]
): CommandDefinition {
  return { ...definition, execute };
}

export function createCommandRegistry(data: PersistedState): CommandDefinition[] {
  const navigation: CommandDefinition[] = [
    command(
      {
        id: "navigate.overview",
        title: "Open Overview",
        description: "See engine status, active profile, and recent activity.",
        category: "Navigation",
        icon: "dashboard",
        keywords: ["home", "dashboard", "control deck"],
      },
      ({ navigate }) => navigate("dashboard")
    ),
    command(
      {
        id: "navigate.shortcuts",
        title: "Open Shortcuts",
        description: "Search, test, enable, and manage keyboard and mouse shortcuts.",
        category: "Navigation",
        icon: "shortcuts",
        keywords: ["hotkeys", "bindings", "automations", "gestures"],
      },
      ({ navigate }) => navigate("shortcuts")
    ),
    command(
      {
        id: "navigate.create",
        title: "Create New Shortcut",
        description: "Record a key or mouse trigger and attach an action.",
        category: "Navigation",
        icon: "create",
        keywords: ["new", "add", "automation", "binding"],
        shortcut: "Ctrl+N",
      },
      ({ navigate, setEditing }) => {
        setEditing(null);
        navigate("create");
      }
    ),
    command(
      {
        id: "navigate.keyboard",
        title: "Open Keyboard Map",
        description: "Inspect assignments across the visual keyboard and mouse map.",
        category: "Navigation",
        icon: "visual",
        keywords: ["keyboard", "mouse", "map", "keys", "assignments"],
      },
      ({ navigate }) => navigate("visual")
    ),
    command(
      {
        id: "navigate.library",
        title: "Open Action Library",
        description: "Reuse saved snippets, websites, scripts, and automation actions.",
        category: "Navigation",
        icon: "library",
        keywords: ["actions", "snippets", "scripts", "reusable"],
      },
      ({ navigate }) => navigate("library")
    ),
    command(
      {
        id: "navigate.profiles",
        title: "Open Profiles",
        description: "Switch shortcut collections or manage app-based profile rules.",
        category: "Navigation",
        icon: "profiles",
        keywords: ["workspace", "collections", "app rules", "contexts"],
      },
      ({ navigate }) => navigate("profiles")
    ),
    command(
      {
        id: "navigate.settings",
        title: "Open Settings",
        description: "Configure KeyFlow behaviour, appearance, safety, and local data.",
        category: "Navigation",
        icon: "settings",
        keywords: ["preferences", "configuration", "options"],
        shortcut: "Ctrl+,",
      },
      ({ navigate }) => navigate("settings")
    ),
  ];

  const quickActions: CommandDefinition[] = [
    command(
      {
        id: "action.pause-engine",
        title: data.settings.shortcuts.globalPause ? "Toggle Engine Pause" : "Pause Engine",
        description: "Pause or resume KeyFlow’s system-wide shortcut matching.",
        category: "Quick actions",
        icon: "pause",
        keywords: ["pause", "resume", "stop", "engine", "hook"],
        shortcut: data.settings.shortcuts.globalPause,
      },
      ({ togglePaused }) => togglePaused()
    ),
    command(
      {
        id: "action.safe-mode",
        title: "Toggle Safe Mode",
        description: "Disconnect low-level hooks until you turn Safe Mode off.",
        category: "Quick actions",
        icon: "shield",
        keywords: ["safe", "emergency", "disable", "panic", "hooks"],
        shortcut: data.settings.shortcuts.emergencySafe,
      },
      ({ setSafeMode, toast }) => {
        const next = !data.settings.privacy.safeMode;
        setSafeMode(next);
        toast(next ? "Safe Mode enabled" : "Safe Mode disabled", next ? "warning" : "success");
      }
    ),
    command(
      {
        id: "action.open-popup",
        title: "Open Action Popup",
        description: "Open the configured floating action menu.",
        category: "Quick actions",
        icon: "popup",
        keywords: ["popup", "menu", "launcher", "actions"],
      },
      ({ openPopup }) => openPopup()
    ),
    command(
      {
        id: "action.open-notes",
        title: "Open Scratchpad Notes",
        description: "Open KeyFlow’s floating notes window for temporary work.",
        category: "Quick actions",
        icon: "file",
        keywords: ["notes", "scratchpad", "memo", "text"],
      },
      ({ openNotes }) => openNotes()
    ),
    command(
      {
        id: "action.toggle-theme",
        title: "Cycle Theme",
        description: "Switch between the dark, light, and system appearance modes.",
        category: "Quick actions",
        icon: "monitor",
        keywords: ["theme", "dark", "light", "appearance", "system"],
      },
      ({ toggleTheme }) => toggleTheme()
    ),
    command(
      {
        id: "action.layout-preview",
        title: "Preview Compact Layout",
        description: "Quickly tune density, scale, and text size for a narrow or snapped window.",
        category: "Quick actions",
        icon: "visual",
        keywords: ["preview", "layout", "compact", "responsive", "snap", "left", "right", "fit", "scale", "density"],
      },
      ({ openLayoutPreview }) => openLayoutPreview()
    ),
  ];

  const settings = SETTINGS_INDEX.map((item) =>
    command(
      {
        id: `setting.${item.id}`,
        title: item.title,
        description: item.description,
        category: "Settings",
        icon: "settings",
        keywords: [item.categoryLabel, ...item.keywords, ...(item.synonyms ?? [])],
      },
      ({ openSetting }) => openSetting(item)
    )
  );

  const shortcuts = data.shortcuts.map((shortcut) => {
    const meta = ACTION_META[shortcut.actions[0]?.type] ?? ACTION_META.openApp;
    const label = shortcut.name || meta.label;
    const enabled = shortcut.enabled;
    return command(
      {
        id: `shortcut.${shortcut.id}`,
        title: enabled ? `Run ${label}` : `Open ${label}`,
        description: `${meta.label} · ${formatTriggerLabel(shortcut)}${enabled ? "" : " · Disabled"}`,
        category: "Shortcuts",
        icon: meta.icon,
        keywords: [shortcut.key, meta.label, meta.category, formatTriggerLabel(shortcut)],
        shortcut: formatShortcutLabel(shortcut.modifiers, shortcut.key),
        disabled: !enabled,
      },
      ({ navigate, runShortcut, toast }) => {
        if (!enabled) {
          navigate("shortcuts");
          toast(`${label} is disabled`, "warning");
          return;
        }
        runShortcut(shortcut);
      }
    );
  });

  return [...quickActions, ...navigation, ...shortcuts, ...settings];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[b.length];
}

export function searchCommands(commands: CommandDefinition[], query: string, maxResults = 10): CommandDefinition[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return commands.filter((item) => item.category !== "Settings" && item.category !== "Shortcuts").slice(0, maxResults);
  }

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  return commands
    .map((item, index) => {
      const title = normalize(item.title);
      const searchText = normalize([
        item.title,
        item.description,
        item.category,
        item.shortcut ?? "",
        ...item.keywords,
      ].join(" "));
      const words = searchText.split(" ");
      let score = 0;

      for (const term of queryTerms) {
        if (searchText.includes(term)) {
          score += title.includes(term) ? 300 : 100;
          continue;
        }
        const nearest = words.reduce((best, word) => Math.min(best, editDistance(term, word)), Number.POSITIVE_INFINITY);
        const tolerance = term.length > 6 ? 2 : 1;
        if (nearest <= tolerance) score += 55;
        else return { item, score: 0, index };
      }

      if (title === normalizedQuery) score += 1000;
      else if (title.startsWith(normalizedQuery)) score += 500;
      if (item.category === "Settings") score += 10;
      return { item, score, index };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxResults)
    .map((result) => result.item);
}
