export type PopupPhase = "hidden" | "preparing" | "opening" | "open" | "closing";

export interface PopupGenerationKey {
  shortcutId: string;
  generationId: string;
}

/**
 * Authoritative popup toggle state machine.
 *
 * `phase` is the single source of truth for popup lifecycle. `gen` records the
 * last accepted completed activation so a duplicate callback from the same
 * input cycle (same shortcut id + same generation id) is ignored, while any new
 * completed activation (new generation id) is always accepted.
 */
export interface PopupToggleState {
  phase: PopupPhase;
  gen: PopupGenerationKey | null;
}

export type PopupToggleOutcome = "open" | "close" | "reopen" | "ignore";

export interface PopupActivation {
  shortcutId?: string;
  generationId?: string;
}

export function createPopupToggleState(): PopupToggleState {
  return { phase: "hidden", gen: null };
}

/** True when this activation is a duplicate of the one we already processed. */
export function isDuplicate(state: PopupToggleState, shortcutId?: string, generationId?: string): boolean {
  if (!state.gen || !shortcutId || !generationId) return false;
  return state.gen.shortcutId === shortcutId && state.gen.generationId === generationId;
}

/**
 * Decide what a new completed activation should do based on the current phase.
 * Never blocks a new generation id; only an identical (shortcutId, generationId)
 * duplicate is ignored.
 */
export function eachToggle(state: PopupToggleState, activation: PopupActivation): { state: PopupToggleState; outcome: PopupToggleOutcome } {
  if (isDuplicate(state, activation.shortcutId, activation.generationId)) {
    return { state, outcome: "ignore" };
  }
  const gen: PopupGenerationKey | null =
    activation.shortcutId && activation.generationId
      ? { shortcutId: activation.shortcutId, generationId: activation.generationId }
      : null;

  switch (state.phase) {
    case "hidden":
      return { state: { phase: "preparing", gen }, outcome: "open" };
    case "open":
    case "opening":
    case "preparing":
      return { state: { phase: "closing", gen }, outcome: "close" };
    case "closing":
      // Cancel the pending hide and reopen.
      return { state: { phase: "preparing", gen }, outcome: "reopen" };
  }
}

/** Content measured and window placed/shown; the visible surface is entering. */
export function completePrepare(state: PopupToggleState): PopupToggleState {
  return { ...state, phase: "opening" };
}

/** Activation finished (guard released / fail-safe elapsed); fully interactive. */
export function completeOpen(state: PopupToggleState): PopupToggleState {
  return { ...state, phase: "open" };
}

/** Close animation finished; hide the window and clear the dedupe lock. */
export function completeClose(state: PopupToggleState): PopupToggleState {
  return { phase: "hidden", gen: null };
}

/** Immediate hide (X, Escape, lost focus, action execution, force). */
export function forceHide(state: PopupToggleState): PopupToggleState {
  return { phase: "hidden", gen: null };
}
