export interface NativeKeyEvent {
  type: "keydown" | "keyup";
  keycode: number;
  rawcode: number;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  /** Present for native-helper events; disambiguates NumEnter from Enter. */
  extended?: boolean;
}

export interface NativeMouseEvent {
  type: "mousedown" | "mouseup";
  button: number;
  clicks: number;
  x: number;
  y: number;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface ShortcutMatch {
  shortcutId: string;
  profileId: string;
  actions: any[];
}

export interface TriggerState {
  key: string;
  mods: string[];
  pressTimes: number[];
  tapTimer: ReturnType<typeof setTimeout> | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  holdFired: boolean;
  tapThenArmed: boolean;
}
