export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type PopupPreference = "cursor" | "center" | "last";

export const POPUP_SIZE = {
  minWidth: 420,
  maxWidth: 500,
  minHeight: 180,
  maxHeight: 560,
};

/**
 * Minimum visible drag-bar height that must remain on screen to guarantee
 * the user can still grab and reposition the popup.
 */
export const POPUP_DRAG_BAR_HEIGHT = 52;

function clampNum(value: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.max(lo, Math.min(value, hi));
}

/**
 * Clamp a popup window size to safe bounds and the target monitor work area.
 * Width is bounded by POPUP_SIZE width range; height by POPUP_SIZE height and
 * the work area height (never taller than the monitor).
 */
export function clampPopupSize(size: Size, workArea: Rect): Size {
  const maxWidth = Math.min(POPUP_SIZE.maxWidth, Math.max(POPUP_SIZE.minWidth, workArea.width));
  const maxHeight = Math.min(POPUP_SIZE.maxHeight, Math.max(POPUP_SIZE.minHeight, workArea.height));
  return {
    width: clampNum(size.width, POPUP_SIZE.minWidth, maxWidth),
    height: clampNum(size.height, POPUP_SIZE.minHeight, maxHeight),
  };
}

/**
 * Clamp a desired top-left anchor so a window of `size` stays fully inside
 * `bounds`, pushing inward only when it would overflow. Handles negative
 * bounds coordinates (monitors left/above the primary).
 */
export function clampRectWithin(topLeft: Point, size: Size, bounds: Rect): Point {
  const width = Math.min(size.width, bounds.width);
  const height = Math.min(size.height, bounds.height);
  const left = bounds.x;
  const right = bounds.x + bounds.width - width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height - height;
  const x = Math.max(left, Math.min(topLeft.x, right));
  const y = Math.max(top, Math.min(topLeft.y, bottom));
  return { x, y };
}

/**
 * Returns true if the draggable header bar of the popup (top POPUP_DRAG_BAR_HEIGHT px)
 * is at least partially visible on one of the supplied display work areas.
 * This guarantees the user can always grab and reposition the popup.
 *
 * `displays` is an array of work-area Rects (from Electron screen.getAllDisplays()).
 */
export function isPositionOnScreen(topLeft: Point, size: Size, displays: Rect[]): boolean {
  if (displays.length === 0) return false;
  // The "grab bar" is the top strip of the popup.
  const barLeft   = topLeft.x;
  const barRight  = topLeft.x + size.width;
  const barTop    = topLeft.y;
  const barBottom = topLeft.y + POPUP_DRAG_BAR_HEIGHT;
  for (const d of displays) {
    const overlapX = barLeft < d.x + d.width && barRight > d.x;
    const overlapY = barTop  < d.y + d.height && barBottom > d.y;
    if (overlapX && overlapY) return true;
  }
  return false;
}

/**
 * Compute the popup top-left position inside a display work area.
 * - savedPosition: use this exact position if supplied (user dragged it here);
 *   caller must already have verified it is on-screen or clamped it.
 * - center: near the center-upper region of the work area.
 * - cursor/last (fallback): anchored near the cursor, clamped fully inside.
 */
export function computePopupPlacement(
  cursor: Point,
  workArea: Rect,
  size: Size,
  preference: PopupPreference = "cursor",
  savedPosition?: Point | null,
): Point {
  if (savedPosition != null) {
    // The saved position is already validated/clamped by the caller.
    return savedPosition;
  }
  if (preference === "center") {
    const cx = workArea.x + (workArea.width - size.width) / 2;
    const cy = workArea.y + (workArea.height - size.height) / 3;
    return clampRectWithin({ x: Math.round(cx), y: Math.round(cy) }, size, workArea);
  }
  return clampRectWithin({ x: cursor.x, y: cursor.y }, size, workArea);
}