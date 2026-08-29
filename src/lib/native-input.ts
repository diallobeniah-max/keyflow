import { useStore } from "../store/useStore";
import { resolveTiming } from "./timing";
import { createDefaultPopupItems } from "./defaults";
import { playFeedbackSound } from "./sound";
import { SCREEN_TINT_DEFAULT_COLOR } from "./constants.ts";

let cleanupFns: (() => void)[] = [];

function pushPopupSnapshot(): void {
  const eapi = (window as any).electronAPI;
  if (!eapi?.popup?.updateData) return;
  const state = useStore.getState();
  const s = state.data.settings;
  const theme = s.appearance.theme === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : s.appearance.theme;
  const popupItems = s.popup.items && s.popup.items.length > 0 ? s.popup.items : createDefaultPopupItems();
  eapi.popup.updateData({
    items: popupItems,
    settings: { ...s.popup, items: popupItems },
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
        appScope: s.appScope,
      }));
    const settings = state.data.settings.shortcuts;
    const advanced = state.data.settings.advanced;
    const hkCfg = settings.hyperKeyConfig;
    const ds = state.data.settings.dragSwitcher;
    const hc = state.data.settings.hotCorners;
    const tint = state.data.settings.screenTint;
    console.log(`[hyper-config] enabled=${!!hkCfg?.enabled} physical=${hkCfg?.key || "AltRight"} tapAction=${hkCfg?.tapActionId || "showPopup"}`);
    void eapi.input.updateShortcuts(list, {
      emergencySafe: settings.emergencySafe,
      hyperKey: settings.hyperKey,
      hyperKeyConfig: settings.hyperKeyConfig,
      typingProtection: settings.typingProtection,
      paused: state.paused,
      safeMode: state.safeMode,
      extendedAccess: !!advanced.extendedAccess,
    });
    void eapi.input.setDragSwitcher?.({
      enabled: !!ds?.enabled,
      zones: ds?.zones ?? 0x02,
      activationMs: ds?.activationMs ?? 0,
      hoverMs: ds?.hoverMs ?? 400,
      cornerSize: ds?.cornerSize ?? 16,
    });
    void eapi.hotCorners?.configure({
      enabled: !!hc?.enabled && !state.paused && !state.safeMode,
      activationMs: hc?.activationMs ?? 400,
      cooldownMs: hc?.cooldownMs ?? 800,
      cornerSize: hc?.cornerSize ?? 24,
      corners: hc?.corners ?? {},
    }, list).catch((error: unknown) => console.warn("[hot-corners] configure failed", error));
    void eapi.screenTint?.update({
      enabled: !!tint?.enabled,
      color: tint?.color ?? SCREEN_TINT_DEFAULT_COLOR,
      strength: tint?.strength ?? 18,
    }).catch((error: unknown) => console.warn("[screen-tint] update failed", error));
  };

  const syncStartup = () => {
    const general = useStore.getState().data.settings.general;
    void eapi.appInfo?.setLoginItemSettings?.({
      openAtLogin: !!general.launchOnStartup,
      openAsHidden: !!general.startMinimized,
    }).catch((error: unknown) => console.warn("[startup] configure failed", error));
  };

  const unsub1 = eapi.input.onTriggered((sc: any, results?: any[]) => {
    // Desktop actions are executed in the main process (ActionRouter); this
    // event is informational only (recent list, debug toast, user feedback).
    const state = useStore.getState();
    const firstAction = sc?.actions?.[0];
    const actionLabel = firstAction?.type === "alwaysOnTop" ? "Always on Top" : (firstAction?.type ?? "trigger");

    state.addRecent({
      shortcutId: sc?.id,
      shortcutName: sc?.name ?? sc?.id ?? "native trigger",
      actionLabel,
      profileId: state.activeProfileId,
    });

    const topResult = Array.isArray(results) ? results.find((r) => r?.action === "alwaysOnTop") : undefined;
    if (topResult) {
      if (topResult.ok) {
        // Play instant audio chime for Always on Top
        const audioCfg = state.data.settings.audio;
        if (audioCfg?.enabled !== false && audioCfg?.playOnTopmost !== false) {
          playFeedbackSound(topResult.isTopmost ? "on" : "off", {
            pack: audioCfg?.soundPack ?? "crystal",
            volume: audioCfg?.volume ?? 80,
          });
        }

        const msg = topResult.isTopmost
          ? (topResult.title ? `Pinned on top: ${topResult.title}` : "Pinned on top")
          : (topResult.title ? `Always on Top removed: ${topResult.title}` : "Always on Top removed");
        state.toast(msg, "success");
      } else {
        state.toast(topResult.error ?? "Could not change Always on Top", "warning");
      }
    } else if (state.data.settings.advanced.debugLogs) {
      state.toast(`Triggered: ${sc?.name ?? sc?.id ?? "shortcut"}`, "success");
    }
  });

  const unsubNav = eapi.input.onWasdNavigationState?.((active: boolean) => {
    useStore.getState().setWasdNavigationActive(active);
    const audioCfg = useStore.getState().data.settings.audio;
    if (audioCfg?.enabled !== false && audioCfg?.playOnNavigation !== false) {
      playFeedbackSound(active ? "on" : "off", {
        pack: audioCfg?.soundPack ?? "crystal",
        volume: audioCfg?.volume ?? 80,
      });
    }
  });

  const unsubHc = eapi.hotCorners?.onTriggered?.((data: any) => {
    const state = useStore.getState();
    const audioCfg = state.data.settings.audio;
    const hcCfg = state.data.settings.hotCorners;
    if (audioCfg?.enabled !== false && hcCfg?.soundEnabled !== false) {
      playFeedbackSound("on", {
        pack: audioCfg?.soundPack ?? "crystal",
        volume: audioCfg?.volume ?? 80,
      });
    }
    if (state.data.settings.advanced.debugLogs) {
      state.toast(`Hot Corner triggered: ${data.corner}`, "success");
    }
  });

  const unsub2 = useStore.subscribe((state, previous) => {
    if (
      state.data.shortcuts !== previous.data.shortcuts ||
      state.activeProfileId !== previous.activeProfileId ||
      state.data.settings.shortcuts !== previous.data.settings.shortcuts ||
      state.data.settings.advanced.extendedAccess !== previous.data.settings.advanced.extendedAccess ||
      state.data.settings.dragSwitcher !== previous.data.settings.dragSwitcher ||
      state.data.settings.hotCorners !== previous.data.settings.hotCorners ||
      state.data.settings.screenTint !== previous.data.settings.screenTint ||
      state.data.settings.general !== previous.data.settings.general ||
      state.paused !== previous.paused ||
      state.safeMode !== previous.safeMode
    ) {
      syncShortcuts();
      if (state.paused !== previous.paused || state.safeMode !== previous.safeMode) void eapi.input.setPaused(state.paused || state.safeMode);
    }
    if (
      state.data.settings.popup !== previous.data.settings.popup ||
      state.data.settings.appearance !== previous.data.settings.appearance ||
      state.data.settings.screenTint !== previous.data.settings.screenTint ||
      state.activeProfileId !== previous.activeProfileId
    ) pushPopupSnapshot();
  });

  syncShortcuts();
  syncStartup();
  pushPopupSnapshot();
  const initialState = useStore.getState();
  void eapi.input.setPaused(initialState.paused || initialState.safeMode);
  eapi.input.getSuppression?.().then((s: any) => useStore.getState().setSuppression(s)).catch(() => {});

  eapi.input.getWasdNavigationState?.().then((active: boolean) => useStore.getState().setWasdNavigationActive(active)).catch(() => {});

  cleanupFns = [unsub1, unsub2, ...(unsubNav ? [unsubNav] : []), ...(unsubHc ? [unsubHc] : [])];
}
