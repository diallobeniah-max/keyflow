import { Action, PersistedState, PopupItem, Profile, Shortcut } from "../types";
import { createDefaultSettings } from "../lib/defaults";

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const now = Date.now();

const profiles: Profile[] = [
  { id: "prof-default", name: "Default", icon: "logo", isDefault: true, appRules: [], createdAt: now },
  { id: "prof-coding", name: "Coding", icon: "terminal", appRules: [{ id: "rule-vscode", exe: "Code.exe", profileId: "prof-coding", mode: "assign" }], createdAt: now },
  { id: "prof-design", name: "Design", icon: "screenshot", appRules: [{ id: "rule-photoshop", exe: "Photoshop.exe", profileId: "prof-design", mode: "assign" }], createdAt: now },
  { id: "prof-gaming", name: "Gaming", icon: "shield", appRules: [{ id: "rule-games", exe: "game", profileId: "prof-gaming", mode: "blacklist" }], createdAt: now },
  { id: "prof-school", name: "School", icon: "library", appRules: [], createdAt: now },
  { id: "prof-browser", name: "Browser", icon: "globe", appRules: [{ id: "rule-chrome", exe: "chrome.exe", profileId: "prof-browser", mode: "assign" }], createdAt: now },
  { id: "prof-editing", name: "Editing", icon: "edit", appRules: [], createdAt: now },
];

function action(type: Action["type"], payload: Action["payload"] = {}, label?: string): Action {
  return { id: uid("act"), type, payload, label };
}

const fPopupItems: PopupItem[] = [
  { id: "pop-code", label: "Open VS Code", icon: "terminal", category: "Launch", hint: "1", actions: [action("openApp", { path: "code" })], pinned: true },
  { id: "pop-docs", label: "Open Docs Folder", icon: "folder", category: "Folders", hint: "2", actions: [action("openFolder", { path: "%USERPROFILE%\\Documents" })] },
  { id: "pop-note", label: "Paste email sign-off", icon: "clipboard", category: "Text", hint: "3", actions: [action("pasteText", { text: "Best regards,\nBeniah" })] },
  { id: "pop-search", label: "Open Google", icon: "globe", category: "Web", hint: "4", actions: [action("openWebsite", { url: "https://google.com" })] },
];


const hyperPopupItems: PopupItem[] = [
  { id: "hyper-search", label: "Search the web", icon: "globe", category: "Hyper", hint: "1", actions: [action("openWebsite", { url: "https://google.com" })], pinned: true },
  { id: "hyper-music", label: "Play / pause music", icon: "play", category: "Media", hint: "2", actions: [action("mediaControl", { media: "playpause" })] },
  { id: "hyper-bright-up", label: "Brightness up", icon: "sun", category: "Display", hint: "3", actions: [action("brightnessControl", { brightness: "up" })] },
  { id: "hyper-bright-down", label: "Brightness down", icon: "sun", category: "Display", hint: "4", actions: [action("brightnessControl", { brightness: "down" })] },
];

const shortcuts: Shortcut[] = [
  {
    id: "sc-hyper-caps",
    name: "Hyper Key command center",
    profileId: "prof-default",
    key: "CapsLock",
    modifiers: [],
    trigger: "longPress",
    timing: { tapInterval: 300, holdDuration: 420, delay: 0, cooldown: 500 },
    actions: [action("showPopup", { popupItems: hyperPopupItems })],
    enabled: true,
    createdAt: now,
    favorite: true,
  },
  {
    id: "sc-hyper-play",
    name: "Hyper + P play/pause",
    profileId: "prof-default",
    key: "P",
    modifiers: ["Ctrl", "Alt", "Shift", "Win"],
    trigger: "combo",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [action("mediaControl", { media: "playpause" })],
    enabled: true,
    createdAt: now,
  },
  {
    id: "sc-hyper-bright-up",
    name: "Hyper + Up brightness up",
    profileId: "prof-default",
    key: "Up",
    modifiers: ["Ctrl", "Alt", "Shift", "Win"],
    trigger: "combo",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [action("brightnessControl", { brightness: "up" })],
    enabled: true,
    createdAt: now,
  },
  {
    id: "sc-hyper-bright-down",
    name: "Hyper + Down brightness down",
    profileId: "prof-default",
    key: "Down",
    modifiers: ["Ctrl", "Alt", "Shift", "Win"],
    trigger: "combo",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [action("brightnessControl", { brightness: "down" })],
    enabled: true,
    createdAt: now,
  },
  {
    id: "sc-f-popup",
    name: "Double tap F popup",
    profileId: "prof-default",
    key: "F",
    modifiers: [],
    trigger: "double",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [action("showPopup", { popupItems: fPopupItems })],
    enabled: true,
    createdAt: now,
    favorite: true,
  },
  {
    id: "sc-c-code",
    name: "Double tap C opens VS Code",
    profileId: "prof-default",
    key: "C",
    modifiers: [],
    trigger: "double",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 400 },
    actions: [action("openApp", { path: "code" })],
    enabled: true,
    createdAt: now,
    favorite: true,
  },
  {
    id: "sc-n-notepad",
    name: "Triple tap N opens Notepad",
    profileId: "prof-default",
    key: "N",
    modifiers: [],
    trigger: "triple",
    timing: { tapInterval: 420, holdDuration: 600, delay: 0, cooldown: 500 },
    actions: [action("openApp", { path: "notepad.exe" })],
    enabled: true,
    createdAt: now,
  },
  {
    id: "sc-m-mute",
    name: "Long press M toggles mute",
    profileId: "prof-default",
    key: "M",
    modifiers: [],
    trigger: "longPress",
    timing: { tapInterval: 300, holdDuration: 650, delay: 0, cooldown: 700 },
    actions: [action("toggleMute")],
    enabled: true,
    createdAt: now,
  },
  {
    id: "sc-mb4-back",
    name: "Mouse Button 4 browser back",
    profileId: "prof-browser",
    key: "MB4",
    mouse: true,
    modifiers: [],
    trigger: "single",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 250 },
    actions: [action("pressShortcut", { shortcut: "Alt+Left" })],
    enabled: true,
    createdAt: now,
  },
  {
    id: "sc-ctrl-shift-k",
    name: "Ctrl Shift K school note",
    profileId: "prof-school",
    key: "K",
    modifiers: ["Ctrl", "Shift"],
    trigger: "combo",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 500 },
    actions: [action("pasteText", { text: "Class note: " })],
    enabled: true,
    createdAt: now,
  },
];

const library: Action[] = [
  action("openWebsite", { url: "https://github.com" }, "Open GitHub"),
  action("pasteText", { text: "Thank you — I will check and get back to you." }, "Quick reply"),
  action("toggleMute", {}, "Toggle mute"),
  action("mediaControl", { media: "playpause" }, "Play / pause music"),
  action("brightnessControl", { brightness: "up" }, "Brightness up"),
  action("openSettings", { settingsPage: "ms-settings:bluetooth" }, "Bluetooth settings"),
];

export function createSampleState(): PersistedState {
  return {
    version: 1,
    profiles,
    shortcuts,
    library,
    settings: createDefaultSettings(),
    recent: [],
    blacklist: [],
    onboardingDone: false,
  };
}
