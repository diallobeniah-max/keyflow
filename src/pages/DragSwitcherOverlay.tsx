import { useEffect, useRef, useState } from "react";
import { HoverDwellDetector } from "../lib/drag-switcher";

interface Tile {
  hwnd: string;
  title: string;
  app: string;
  icon?: string;
}

function cursorFromEvent(e: React.MouseEvent): { x: number; y: number } {
  return { x: e.clientX, y: e.clientY };
}

/**
 * Drag Corner Switcher overlay. Full-screen transparent window (mouse-transparent
 * with forward:true) rendered while the user drags a file out of Explorer into
 * the top-right hot corner. Tiles are hit-tested with elementFromPoint and a
 * hover dwell (hoverDwellMs) activates the target window through the main
 * process → native helper. The native side never synthesizes a mouse event.
 */
export function DragSwitcherOverlay() {
  const [data, setData] = useState<DragSwitcherData | null>(null);
  const [hoverHwnd, setHoverHwnd] = useState<string | null>(null);
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dwellRef = useRef<HoverDwellDetector>(new HoverDwellDetector(400));

  useEffect(() => {
    document.documentElement.classList.add("drag-switcher-window");
    return () => {
      document.documentElement.classList.remove("drag-switcher-window");
    };
  }, []);

  useEffect(() => {
    const eapi = (window as any).electronAPI?.dragSwitcher;
    if (!eapi) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      eapi.onData((msg: DragSwitcherData) => {
        dwellRef.current.setDwellMs(msg.hoverDwellMs > 0 ? msg.hoverDwellMs : 400);
        dwellRef.current.reset();
        setHoverHwnd(null);
        setData(msg);
        console.log(`[drag-v2] electronShowReceived renderer windows=${msg.windows.length} hoverMs=${msg.hoverDwellMs}`);
      }),
    );
    unsubs.push(
      eapi.onMove((msg: { x: number; y: number }) => {
        // IPC cursor is in screen coordinates; convert to window-relative.
        cursorRef.current = { x: msg.x - (window.screenX || 0), y: msg.y - (window.screenY || 0) };
      }),
    );
    unsubs.push(
      eapi.onHide(() => {
        dwellRef.current.reset();
        setHoverHwnd(null);
      }),
    );

    return () => unsubs.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    if (!data) return;
    const tick = setInterval(() => {
      const c = cursorRef.current;
      // The page gets forwarded mousemove; prefer DOM positions (they are in
      // window-relative CSS pixels, exactly what elementFromPoint needs).
      const el = document.elementFromPoint(c.x, c.y) as HTMLElement | null;
      let hwnd: string | null = null;
      let node: HTMLElement | null = el;
      while (node) {
        const attr = node.getAttribute?.("data-hwnd");
        if (attr) {
          hwnd = attr;
          break;
        }
        node = node.parentElement;
      }
      const activate = dwellRef.current.update(hwnd, Date.now());
      setHoverHwnd(hwnd);
      if (activate) {
        setHoverHwnd(null);
        console.log(`[drag-v2] tileHover hwnd=${activate}`);
        void (window as any).electronAPI?.dragSwitcher?.activate(activate);
      }
    }, 40);
    return () => clearInterval(tick);
  }, [data]);

  const tiles: Tile[] = (data?.windows ?? []).map((w) => ({
    hwnd: w.hwnd,
    title: w.title,
    app: w.app,
    icon: w.icon,
  }));

  return (
    <div
      className="drag-switcher-overlay"
      onMouseMove={(e) => {
        const p = cursorFromEvent(e);
        cursorRef.current = { x: p.x, y: p.y };
      }}
    >
      <div className="drag-switcher-shelf anim-sheet-enter" role="region" aria-label="Quick Drop Shelf">
        <div className="drag-switcher-header">
          <div className="drag-switcher-header-left">
            <span className="drag-switcher-badge">DROP SHELF</span>
            <div className="drag-switcher-header-title">Hover over an app to activate</div>
          </div>
          <div className="drag-switcher-header-right">
            <span className="tiny muted">{tiles.length} active apps</span>
          </div>
        </div>

        <div className="drag-switcher-grid" role="list" aria-label="Open apps and windows">
          {tiles.map((t) => (
            <div
              key={t.hwnd}
              className={`drag-switcher-tile${hoverHwnd === t.hwnd ? " is-hover" : ""}`}
              data-hwnd={t.hwnd}
              role="listitem"
            >
              {hoverHwnd === t.hwnd && <div className="drag-dwell-progress-bar" />}
              {t.icon ? (
                <img className="drag-switcher-icon" src={`data:image/bmp;base64,${t.icon}`} alt="" draggable={false} />
              ) : (
                <div className="drag-switcher-monogram" aria-hidden="true">
                  {(t.app || t.title || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="drag-switcher-title" title={t.title}>
                {t.title || t.app}
              </span>
            </div>
          ))}
        </div>

        <div className="drag-switcher-holding-tray" data-role="holding-tray">
          <div className="drag-switcher-tray-inner">
            <span className="drag-switcher-tray-icon">📥</span>
            <div className="drag-switcher-tray-text">
              <span className="bold tiny">Temporary Holding Tray</span>
              <span className="muted tiny">Drop files here to hold or combine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}