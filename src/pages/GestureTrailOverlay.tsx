import { useEffect, useState, useMemo } from "react";

interface TrailData {
  status: "idle" | "capturing" | "cancelled" | "matched";
  points: [number, number][];
  stroke: string;
  preview?: string;
}

const STROKE_ICONS: Record<string, string> = {
  U: "↑",
  D: "↓",
  L: "←",
  R: "→",
  UR: "↗",
  UL: "↖",
  DR: "↘",
  DL: "↙",
};

export function GestureTrailOverlay() {
  const [trail, setTrail] = useState<TrailData | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("gesture-trail-window");
    return () => {
      document.documentElement.classList.remove("gesture-trail-window");
    };
  }, []);

  useEffect(() => {
    const eapi = (window as any).electronAPI?.input;
    if (!eapi?.onGestureTrail) return;

    const cleanup = eapi.onGestureTrail((data: TrailData) => {
      setTrail(data);
    });

    return () => {
      cleanup?.();
    };
  }, []);

  const relativePoints = useMemo(() => {
    if (!trail || !trail.points || trail.points.length === 0) return [];
    const winX = window.screenX || 0;
    const winY = window.screenY || 0;
    return trail.points.map(([x, y]) => ({
      x: x - winX,
      y: y - winY,
    }));
  }, [trail]);

  const svgPath = useMemo(() => {
    if (relativePoints.length < 2) return "";
    const first = relativePoints[0];
    let d = `M ${first.x} ${first.y}`;
    for (let i = 1; i < relativePoints.length; i++) {
      const pt = relativePoints[i];
      d += ` L ${pt.x} ${pt.y}`;
    }
    return d;
  }, [relativePoints]);

  const lastPoint = relativePoints.length > 0 ? relativePoints[relativePoints.length - 1] : null;

  if (!trail || trail.status === "idle" || relativePoints.length === 0) {
    return null;
  }

  const strokeDisplay = trail.stroke
    .split("")
    .map((c) => STROKE_ICONS[c] || c)
    .join(" ");

  return (
    <div className="gesture-trail-container">
      <svg className="gesture-trail-svg">
        <defs>
          <linearGradient id="gestureGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f7cff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#4f7cff" stopOpacity="0.95" />
          </linearGradient>
          <filter id="gestureGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {svgPath && (
          <path
            d={svgPath}
            fill="none"
            stroke="url(#gestureGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#gestureGlow)"
          />
        )}

        {/* Starting indicator */}
        {relativePoints.length > 0 && (
          <circle
            cx={relativePoints[0].x}
            cy={relativePoints[0].y}
            r="4"
            fill="#4f7cff"
            opacity="0.8"
          />
        )}
      </svg>

      {/* Floating Action / Stroke Preview Pill */}
      {lastPoint && (trail.stroke || trail.preview) && (
        <div
          className="gesture-preview-pill"
          style={{
            left: `${lastPoint.x + 18}px`,
            top: `${lastPoint.y + 18}px`,
          }}
        >
          {trail.stroke && (
            <span className="gesture-preview-badge">
              {strokeDisplay}
            </span>
          )}
          {trail.preview ? (
            <span className="gesture-preview-label">{trail.preview}</span>
          ) : (
            <span className="gesture-preview-hint">Drawing gesture...</span>
          )}
        </div>
      )}
    </div>
  );
}
