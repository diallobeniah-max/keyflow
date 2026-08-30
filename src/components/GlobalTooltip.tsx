import { useEffect, useState, useRef } from "react";
import { useStore } from "../store/useStore";

interface TooltipState {
  visible: boolean;
  text: string;
  targetRect: DOMRect | null;
  position: "top" | "bottom";
}

/**
 * GlobalTooltip: Automatically intercepts all elements with `title` or `data-tooltip`
 * across the entire application and renders a sleek, elevated KeyFlow design system tooltip
 * with keyboard shortcut badges (<kbd>) and smooth animations, replacing the browser's default OS tooltip.
 */
export function GlobalTooltip() {
  const enabled = useStore((state) => state.data.settings.appearance.showHoverHelp !== false);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: "",
    targetRect: null,
    position: "top",
  });

  const timerRef = useRef<any>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const lastActiveTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("[title], [data-tooltip]") as HTMLElement | null;
      if (!target) return;

      const text = target.getAttribute("data-tooltip") || target.getAttribute("title");
      if (!text || !text.trim()) return;

      // Swap out the native `title` to prevent the ugly browser OS box
      if (target.hasAttribute("title")) {
        target.dataset.kfOriginalTitle = text;
        target.removeAttribute("title");
      }

      currentTargetRef.current = target;
      if (timerRef.current) clearTimeout(timerRef.current);

      if (!enabled) return;

      const now = Date.now();
      const isWarm = now - lastActiveTimeRef.current < 250;
      const delay = isWarm ? 20 : 180;

      timerRef.current = setTimeout(() => {
        if (currentTargetRef.current !== target) return;
        const rect = target.getBoundingClientRect();
        // If element is close to top of viewport, flip to bottom
        const position = rect.top < 38 ? "bottom" : "top";

        setTooltip({
          visible: true,
          text,
          targetRect: rect,
          position,
        });
        lastActiveTimeRef.current = Date.now();
      }, delay);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("[data-kf-original-title], [data-tooltip]") as HTMLElement | null;
      if (target && target.dataset.kfOriginalTitle) {
        target.setAttribute("title", target.dataset.kfOriginalTitle);
        delete target.dataset.kfOriginalTitle;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      if (currentTargetRef.current) {
        currentTargetRef.current = null;
        setTooltip((prev) => ({ ...prev, visible: false }));
        lastActiveTimeRef.current = Date.now();
      }
    };

    const handleDismiss = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (currentTargetRef.current && currentTargetRef.current.dataset.kfOriginalTitle) {
        currentTargetRef.current.setAttribute("title", currentTargetRef.current.dataset.kfOriginalTitle);
        delete currentTargetRef.current.dataset.kfOriginalTitle;
      }
      currentTargetRef.current = null;
      setTooltip((prev) => ({ ...prev, visible: false }));
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("pointerdown", handleDismiss, true);
    document.addEventListener("scroll", handleDismiss, true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("pointerdown", handleDismiss, true);
      document.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled]);

  if (!tooltip.visible || !tooltip.targetRect || !tooltip.text) {
    return null;
  }

  const { targetRect, position, text } = tooltip;
  const centerX = Math.max(60, Math.min(window.innerWidth - 60, targetRect.left + targetRect.width / 2));
  const topY = position === "top" ? targetRect.top - 6 : targetRect.bottom + 6;

  return (
    <div
      className={`kf-global-tooltip is-${position} anim-fade-in no-drag-region`}
      style={{
        top: `${topY}px`,
        left: `${centerX}px`,
      }}
    >
      <TooltipContent text={text} />
    </div>
  );
}

/**
 * TooltipContent: Parses shortcuts like `(Ctrl+H)` or `· Hint` into clean styled badges.
 */
function TooltipContent({ text }: { text: string }) {
  // Check for parenthesis shortcut pattern e.g. "Toggle Replace (Ctrl+H)" or "Undo (Ctrl+Z) · Revision history"
  const match = text.match(/^(.*?)(?:\s*\(([^)]+)\))(.*)$/);
  if (match) {
    const [, prefix, shortcut, suffix] = match;
    return (
      <span className="kf-tooltip-inner">
        {prefix && <span>{prefix.trim()}</span>}
        <kbd className="kf-tooltip-kbd">{shortcut}</kbd>
        {suffix && <span className="kf-tooltip-sub">{suffix.trim()}</span>}
      </span>
    );
  }

  // Check for dot-separated descriptions e.g. "Undo · Right-click for history"
  if (text.includes(" · ")) {
    const [main, ...rest] = text.split(" · ");
    return (
      <span className="kf-tooltip-inner">
        <span>{main}</span>
        <span className="kf-tooltip-sub">· {rest.join(" · ")}</span>
      </span>
    );
  }

  return <span className="kf-tooltip-inner">{text}</span>;
}
