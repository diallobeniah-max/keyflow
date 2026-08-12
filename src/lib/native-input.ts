import { useStore } from "../store/useStore";
import { resolveTiming } from "./timing";

let cleanupFns: (() => void)[] = [];

function pushPopupSnapshot(): void {
  const eapi = (window as any).electronAPI;
  if (!eapi?.popup?.updateData) return;
  const state = useStore.getState();
  const s = state.data.settings;
  const theme = s.appearance.theme === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : s.appearance.theme;
  eapi.popup.updateData({
    settings: s.popup,
    theme,
    accent: s.appearance.accent,
    profileId: state.activeProfileId,
    title: "KeyFlow",
  });
}

export function initNativeInput(): void {
  const eapi = (window as any).electronAPI;
  if (!eapi?.input?.updateShortcuts) return;

  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];

  const syncShortcuts = () => {
    const state = useStore.getState();
    const activeId = state.activeProfileId;
    const list = state.data.shortcuts
      .filter((s) => s.enabled && s.profileId === activeId)
      .map((s) => ({
        id: s.id,
        profileId: s.profileId,
        key: s.key,
        mouse: s.mouse,
        modifiers: s.modifiers,
        trigger: s.trigger,
        timing: resolveTiming(s.timing, s.timing?.timingMode),
        actions: s.actions,
        enabled: s.enabled,
        suppressKey: s.suppressKey,
        keyBehavior: s.keyBehavior,
        remapTo: s.remapTo,
      }));
    const settings = state.data.settings.shortcuts;
    void eapi.input.updateShortcuts(list, {
      emergencySafe: settings.emergencySafe,
      hyperKey: settings.hyperKey,
      paused: state.paused,
      safeMode: state.safeMode,
    });
  };

  const unsub1 = eapi.input.onTriggered((sc: any) => {
    // Desktop actions are executed in the main process (ActionRouter); this
    // event is informational only (recent list, debug toast).
    const state = useStore.getState();
    const firstAction = sc?.actions?.[0];
    state.addRecent({
      shortcutId: sc?.id,
      shortcutName: sc?.name ?? sc?.id ?? "native trigger",
      actionLabel: firstAction?.type ?? "trigger",
      profileId: state.activeProfileId,
    });
    if (state.data.settings.advanced.debugLogs) {
      state.toast(`Triggered: ${sc?.name ?? sc?.id ?? "shortcut"}`, "success");
    }
  });

  const unsub2 = useStore.subscribe((state, previous) => {
    if (
      state.data.shortcuts !== previous.data.shortcuts ||
      state.activeProfileId !== previous.activeProfileId ||
      state.data.settings.shortcuts !== previous.data.settings.shortcuts ||
      state.paused !== previous.paused ||
      state.safeMode !== previous.safeMode
    ) {
      syncShortcuts();
      if (state.paused !== previous.paused || state.safeMode !== previous.safeMode) void eapi.input.setPaused(state.paused || state.safeMode);
    }
    if (
      state.data.settings.popup !== previous.data.settings.popup ||
      state.data.settings.appearance !== previous.data.settings.appearance ||
      state.activeProfileId !== previous.activeProfileId
    ) pushPopupSnapshot();
  });

  syncShortcuts();
  pushPopupSnapshot();
  const initialState = useStore.getState();
  void eapi.input.setPaused(initialState.paused || initialState.safeMode);
  eapi.input.getSuppression?.().then((s: any) => useStore.getState().setSuppression(s)).catch(() => {});

  cleanupFns = [unsub1, unsub2];
}
