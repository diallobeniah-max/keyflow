import { create } from "zustand";
import { Action, AppPage, AppRule, PersistedState, PopupRequest, Profile, RecentAction, Settings, Shortcut } from "../types";
import { createSampleState, uid } from "./sampleData";
import { createDefaultSettings, migrateHyperShortcuts, migrateHyperConfig, migratePopupMenuItems } from "../lib/defaults";
import { tauriLoad, tauriSave } from "../lib/tauri";

export interface Toast {
  id: string;
  message: string;
  kind: "info" | "success" | "warning" | "danger";
}

export interface SettingsFocusTarget {
  category: string;
  anchorId: string;
}

interface StoreState {
  data: PersistedState;
  loaded: boolean;
  currentPage: AppPage;
  editingId: string | null;
  pendingKey: { key: string; mouse?: boolean } | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  drawerOpen: boolean;
  paused: boolean;
  safeMode: boolean;
  activeProfileId: string;
  focusedApp: string;
  popup: PopupRequest | null;
  toasts: Toast[];
  globalSearch: string;
  settingsFocusTarget: SettingsFocusTarget | null;
  suppression: { available: boolean; status: string; backend: string } | null;
  wasdNavigationActive: boolean;

  load: () => Promise<void>;
  persist: () => void;
  applyAppearance: () => void;
  resetAll: () => void;
  importState: (state: PersistedState) => void;

  setPage: (p: AppPage) => void;
  setGlobalSearch: (q: string) => void;
  setSettingsFocusTarget: (target: SettingsFocusTarget | null) => void;
  setEditing: (id: string | null) => void;
  setDrawerOpen: (b: boolean) => void;
  setPendingKey: (key: string, mouse?: boolean) => void;
  clearPendingKey: () => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setPaused: (b: boolean) => void;
  togglePaused: () => void;
  setSafeMode: (b: boolean) => void;
  setActiveProfile: (id: string) => void;
  setFocusedApp: (app: string) => void;

  addShortcut: (s: Shortcut) => void;
  updateShortcut: (s: Shortcut) => void;
  deleteShortcut: (id: string) => void;
  duplicateShortcut: (id: string) => void;
  toggleShortcut: (id: string) => void;
  toggleFavoriteShortcut: (id: string) => void;

  addProfile: (p: Profile) => void;
  updateProfile: (p: Profile) => void;
  deleteProfile: (id: string) => void;
  duplicateProfile: (id: string) => void;
  setDefaultProfile: (id: string) => void;
  addAppRule: (profileId: string, rule: AppRule) => void;
  removeAppRule: (profileId: string, ruleId: string) => void;

  addLibraryAction: (a: Action) => void;
  removeLibraryAction: (id: string) => void;
  patchSettings: <K extends keyof Settings>(section: K, partial: Partial<Settings[K]>) => void;

  addRecent: (r: Omit<RecentAction, "id" | "at">) => void;
  clearRecent: () => void;
  requestPopup: (req: PopupRequest) => void;
  closePopup: () => void;
  setSuppression: (s: { available: boolean; status: string; backend: string } | null) => void;
  setWasdNavigationActive: (b: boolean) => void;
  toast: (message: string, kind?: Toast["kind"]) => void;
  removeToast: (id: string) => void;
  finishOnboarding: () => void;
}

// ---------------------------------------------------------------------------
// Accent color helpers (pure TS, no npm deps)
// ---------------------------------------------------------------------------

/** Convert a 6-char hex string to { r, g, b } integers */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6 && clean.length !== 3) return null;
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

// Construct an rgb-with-alpha color string for CSS custom property injection
function buildRgbaColor(r: number, g: number, b: number, a: number): string {
  const fn = ["r", "g", "b"].join("");
  return `${fn}(${r} ${g} ${b} / ${a})`;
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  // Fallback: use a CSS expression that resolves at runtime via the token
  if (!rgb) return `color-mix(in srgb, var(--color-accent) ${Math.round(alpha * 100)}%, transparent)`;
  return buildRgbaColor(rgb.r, rgb.g, rgb.b, alpha);
}

function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount);
}

function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r - amount, rgb.g - amount, rgb.b - amount);
}

/** Write accent color and all derived tokens to the CSS root */
function applyAccentColor(root: HTMLElement, accent: string): void {
  root.style.setProperty("--color-accent", accent);
  root.style.setProperty("--color-accent-hover", lightenHex(accent, 22));
  root.style.setProperty("--color-accent-pressed", darkenHex(accent, 18));
  root.style.setProperty("--color-accent-soft", hexToRgba(accent, 0.12));
  root.style.setProperty("--color-accent-border", hexToRgba(accent, 0.35));
}

// ---------------------------------------------------------------------------

function mergeSettings(s: Partial<Settings> | undefined): Settings {
  const defaults = createDefaultSettings();
  if (!s) return defaults;
  const mergedShortcuts = { ...defaults.shortcuts, ...s.shortcuts };
  const defaultHotCorners = defaults.hotCorners!;
  const defaultScreenTint = defaults.screenTint!;
  mergedShortcuts.hyperKeyConfig = migrateHyperConfig(s.shortcuts?.hyperKeyConfig);
  mergedShortcuts.hyperKey = mergedShortcuts.hyperKeyConfig.key;
  mergedShortcuts.hyperKeyEnabled = mergedShortcuts.hyperKeyConfig.enabled;
  mergedShortcuts.hyperKeyOutput = "Hyper";
  return {
    ...defaults,
    ...s,
    general: { ...defaults.general, ...s.general },
    appearance: { ...defaults.appearance, ...s.appearance },
    shortcuts: mergedShortcuts,
    popup: { ...defaults.popup, ...s.popup },
    profiles: { ...defaults.profiles, ...s.profiles },
    privacy: { ...defaults.privacy, ...s.privacy },
    data: { ...defaults.data, ...s.data },
    advanced: { ...defaults.advanced, ...s.advanced },
    hotCorners: {
      ...defaultHotCorners,
      ...s.hotCorners,
      corners: { ...defaultHotCorners.corners, ...s.hotCorners?.corners },
    },
    screenTint: { ...defaultScreenTint, ...s.screenTint },
  };
}

export const useStore = create<StoreState>((set, get) => ({
  data: createSampleState(),
  loaded: false,
  currentPage: "dashboard",
  editingId: null,
  pendingKey: null,
  sidebarCollapsed: false,
  sidebarWidth: typeof localStorage !== "undefined" && localStorage.getItem("keyflow:sidebar-width")
    ? Math.max(160, Math.min(380, Number(localStorage.getItem("keyflow:sidebar-width")))) || 220
    : 220,
  drawerOpen: false,
  paused: false,
  safeMode: false,
  activeProfileId: "prof-default",
  focusedApp: "explorer.exe",
  popup: null,
  toasts: [],
  globalSearch: "",
  settingsFocusTarget: null,
  suppression: null,
  wasdNavigationActive: false,

  load: async () => {
    const raw = await tauriLoad();
    const state = raw ? (raw as PersistedState) : createSampleState();
    state.settings = mergeSettings(state.settings);
    state.shortcuts = migrateHyperShortcuts(state.shortcuts);
    if (raw && !(raw as any)?.settings?.popup?.items) {
      state.settings = migratePopupMenuItems(state.settings, state.shortcuts);
    }
    set({
      data: state,
      loaded: true,
      activeProfileId: state.settings.general.defaultProfileId || "prof-default",
      safeMode: state.settings.privacy.safeMode,
    });
    get().applyAppearance();
  },
  persist: () => void tauriSave(get().data),
  applyAppearance: () => {
    const a = get().data.settings.appearance;
    const root = document.documentElement;
    const theme = a.theme === "system" ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark") : a.theme;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-font-size", a.fontSize);
    root.setAttribute("data-radius", a.radiusIntensity < 0.85 ? "compact" : "relaxed");
    root.setAttribute("data-backdrop-material", a.backdropMaterial ?? "mica");
    root.setAttribute("data-header-tint", a.headerAccentTint ?? "subtle");
    root.setAttribute("data-header-fit", a.headerAccentFit ?? "full");
    root.classList.toggle("reduce-motion", a.reduceMotion);
    root.classList.toggle("compact", a.compactMode);
    root.style.setProperty("--ui-scale", ({ "90": "0.9", "100": "1", "110": "1.1", "125": "1.25" } as Record<string, string>)[a.uiScale] ?? "1");
    // Apply accent color and all derived tokens so the whole UI recolors live
    if (a.accent) {
      applyAccentColor(root, a.accent);
    }
  },
  resetAll: () => {
    const state = createSampleState();
    set({ data: state, activeProfileId: state.settings.general.defaultProfileId, safeMode: false, paused: false });
    get().applyAppearance();
    get().persist();
  },
  importState: (state) => {
    state.settings = mergeSettings(state.settings);
    set({ data: state, activeProfileId: state.settings.general.defaultProfileId });
    get().applyAppearance();
    get().persist();
  },

  setPage: (p) => set({ currentPage: p }),
  setGlobalSearch: (q) => set({ globalSearch: q }),
  setSettingsFocusTarget: (target) => set({ settingsFocusTarget: target }),
  setEditing: (id) => set({ editingId: id }),
  setDrawerOpen: (b) => set({ drawerOpen: b }),
  setPendingKey: (key, mouse) => set({ pendingKey: { key, mouse } }),
  clearPendingKey: () => set({ pendingKey: null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (w) => {
    const clamped = Math.max(160, Math.min(380, Math.round(w)));
    try { localStorage.setItem("keyflow:sidebar-width", String(clamped)); } catch (_) {}
    set({ sidebarWidth: clamped });
  },
  setPaused: (b) => set({ paused: b }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setSafeMode: (b) => {
    set((s) => ({ safeMode: b, data: { ...s.data, settings: { ...s.data.settings, privacy: { ...s.data.settings.privacy, safeMode: b } } } }));
    get().persist();
  },
  setActiveProfile: (id) => { set({ activeProfileId: id }); get().persist(); },
  setFocusedApp: (app) => set({ focusedApp: app }),

  addShortcut: (sc) => { set((s) => ({ data: { ...s.data, shortcuts: [sc, ...s.data.shortcuts] } })); get().persist(); },
  updateShortcut: (sc) => { set((s) => ({ data: { ...s.data, shortcuts: s.data.shortcuts.map((x) => (x.id === sc.id ? sc : x)) } })); get().persist(); },
  deleteShortcut: (id) => { set((s) => ({ data: { ...s.data, shortcuts: s.data.shortcuts.filter((x) => x.id !== id) } })); get().persist(); },
  duplicateShortcut: (id) => {
    const src = get().data.shortcuts.find((x) => x.id === id);
    if (!src) return;
    const copy: Shortcut = { ...src, id: uid("sc"), name: src.name + " copy", createdAt: Date.now(), favorite: false };
    set((s) => ({ data: { ...s.data, shortcuts: [copy, ...s.data.shortcuts] } }));
    get().persist();
  },
  toggleShortcut: (id) => { set((s) => ({ data: { ...s.data, shortcuts: s.data.shortcuts.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x) } })); get().persist(); },
  toggleFavoriteShortcut: (id) => { set((s) => ({ data: { ...s.data, shortcuts: s.data.shortcuts.map((x) => x.id === id ? { ...x, favorite: !x.favorite } : x) } })); get().persist(); },

  addProfile: (p) => { set((s) => ({ data: { ...s.data, profiles: [...s.data.profiles, p] } })); get().persist(); },
  updateProfile: (p) => { set((s) => ({ data: { ...s.data, profiles: s.data.profiles.map((x) => x.id === p.id ? p : x) } })); get().persist(); },
  deleteProfile: (id) => {
    if (id === "prof-default") return get().toast("Default profile cannot be deleted", "warning");
    set((s) => ({ data: { ...s.data, profiles: s.data.profiles.filter((x) => x.id !== id), shortcuts: s.data.shortcuts.filter((x) => x.profileId !== id) } }));
    get().persist();
  },
  duplicateProfile: (id) => {
    const src = get().data.profiles.find((x) => x.id === id);
    if (!src) return;
    const copy: Profile = { ...src, id: uid("prof"), name: src.name + " copy", isDefault: false, appRules: [] };
    const shortcutCopies = get().data.shortcuts.filter((x) => x.profileId === id).map((x) => ({ ...x, id: uid("sc"), profileId: copy.id }));
    set((s) => ({ data: { ...s.data, profiles: [...s.data.profiles, copy], shortcuts: [...shortcutCopies, ...s.data.shortcuts] } }));
    get().persist();
  },
  setDefaultProfile: (id) => {
    set((s) => ({ data: { ...s.data, profiles: s.data.profiles.map((p) => ({ ...p, isDefault: p.id === id })), settings: { ...s.data.settings, general: { ...s.data.settings.general, defaultProfileId: id }, profiles: { ...s.data.settings.profiles, defaultProfileId: id } } } }));
    get().setActiveProfile(id);
    get().persist();
  },
  addAppRule: (profileId, rule) => { set((s) => ({ data: { ...s.data, profiles: s.data.profiles.map((p) => p.id === profileId ? { ...p, appRules: [...p.appRules, rule] } : p) } })); get().persist(); },
  removeAppRule: (profileId, ruleId) => { set((s) => ({ data: { ...s.data, profiles: s.data.profiles.map((p) => p.id === profileId ? { ...p, appRules: p.appRules.filter((r) => r.id !== ruleId) } : p) } })); get().persist(); },

  addLibraryAction: (a) => { set((s) => ({ data: { ...s.data, library: [a, ...s.data.library] } })); get().persist(); },
  removeLibraryAction: (id) => { set((s) => ({ data: { ...s.data, library: s.data.library.filter((x) => x.id !== id) } })); get().persist(); },
  patchSettings: (section, partial) => {
    set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, [section]: { ...s.data.settings[section], ...partial } } } }));
    get().applyAppearance();
    get().persist();
  },
  addRecent: (r) => { set((s) => ({ data: { ...s.data, recent: [{ ...r, id: uid("recent"), at: Date.now() }, ...s.data.recent].slice(0, 40) } })); get().persist(); },
  clearRecent: () => { set((s) => ({ data: { ...s.data, recent: [] } })); get().persist(); },
  requestPopup: (req) => set({ popup: req }),
  closePopup: () => set({ popup: null }),
  setSuppression: (s) => set({ suppression: s }),
  setWasdNavigationActive: (b) => set({ wasdNavigationActive: b }),
  toast: (message, kind = "info") => {
    const id = uid("toast");
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    window.setTimeout(() => get().removeToast(id), 3200);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  finishOnboarding: () => { set((s) => ({ data: { ...s.data, onboardingDone: true } })); get().persist(); },
}));
