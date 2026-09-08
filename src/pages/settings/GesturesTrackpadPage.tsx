import { type FC, useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../../store/useStore";
import { SettingsPageHeader } from "./SettingsPageHeader";
import { SettingsGroup, SettingsRow, Toggle, Slider } from "../../components/ui";
import { AppSelect, type AppSelectOption } from "../../components/ui/AppSelect";
import { Icon } from "../../components/Icon";
import type { HyperGestureMapping, TouchpadCapabilityStatus } from "../../types/index";

interface GesturesTrackpadPageProps {
  onBack?: () => void;
}

const PREDEFINED_ACTIONS: AppSelectOption[] = [
  { value: "act-maximize", label: "Maximize / Restore Window" },
  { value: "act-minimize", label: "Minimize Window" },
  { value: "act-close-window", label: "Close Active Window" },
  { value: "act-snap-left", label: "Snap Window Left" },
  { value: "act-snap-right", label: "Snap Window Right" },
  { value: "act-next-desktop", label: "Next Virtual Desktop" },
  { value: "act-prev-desktop", label: "Previous Virtual Desktop" },
  { value: "showPopup", label: "Show KeyFlow Popup" },
  { value: "commandPalette", label: "Open Command Palette" },
];

const STROKE_NAMES: Record<string, { label: string; arrow: string }> = {
  U: { label: "Up", arrow: "↑" },
  D: { label: "Down", arrow: "↓" },
  L: { label: "Left", arrow: "←" },
  R: { label: "Right", arrow: "→" },
  UR: { label: "Up-Right", arrow: "↗" },
  UL: { label: "Up-Left", arrow: "↖" },
  DR: { label: "Down-Right", arrow: "↘" },
  DL: { label: "Down-Left", arrow: "↙" },
};

export const GesturesTrackpadPage: FC<GesturesTrackpadPageProps> = ({ onBack }) => {
  const patch = useStore((s) => s.patchSettings);
  const library = useStore((s) => s.data.library);
  const hyperConfig = useStore((s) => s.data.settings.shortcuts.hyperKeyConfig);
  const legacyHyperKey = useStore((s) => s.data.settings.shortcuts.hyperKey);
  const rawGestures = useStore((s) => s.data.settings.hyperGestures);
  const rawTouchpad = useStore((s) => s.data.settings.touchpadDrag);

  // Dynamic Hyper key name from configuration
  const hyperKeyName = hyperConfig?.enabled && hyperConfig?.key ? hyperConfig.key : (legacyHyperKey || "AltRight");

  // Local state with sensible fallbacks
  const gestures = {
    enabled: false,
    activationThreshold: 24,
    tapToEnterMode: false,
    showTrail: true,
    gestures: [
      { id: "hg-up", name: "Maximize Window", stroke: "U", actionId: "act-maximize", enabled: true },
      { id: "hg-down", name: "Minimize Window", stroke: "D", actionId: "act-minimize", enabled: true },
      { id: "hg-left", name: "Snap Left", stroke: "L", actionId: "act-snap-left", enabled: true },
      { id: "hg-right", name: "Snap Right", stroke: "R", actionId: "act-snap-right", enabled: true },
      { id: "hg-close", name: "Close Window", stroke: "DR", actionId: "act-close-window", enabled: true },
    ],
    ...rawGestures,
  };

  const touchpad = {
    enabled: false,
    cursorMove: true,
    speed: 30,
    acceleration: 10,
    startThreshold: 100,
    stopThreshold: 10,
    releaseDelayMs: 500,
    allowReleaseAndRestart: true,
    maxFingerDistance: 150,
    cursorAveraging: 1,
    ...rawTouchpad,
  };

  // Normalized values for backward compatibility
  const currentSpeed = touchpad.speed <= 5 ? Math.round(touchpad.speed * 30) : touchpad.speed;
  const currentStartThreshold = touchpad.startThreshold ?? (touchpad.movementThreshold ? touchpad.movementThreshold * 6 : 100);
  const currentReleaseDelay = touchpad.releaseDelayMs ?? touchpad.gracePeriodMs ?? 500;
  const currentAcceleration = touchpad.acceleration ?? 10;
  const currentStopThreshold = touchpad.stopThreshold ?? 10;
  const currentMaxDistance = touchpad.maxFingerDistance ?? 150;
  const currentAveraging = touchpad.cursorAveraging ?? 1;

  const [touchpadStatus, setTouchpadStatus] = useState<TouchpadCapabilityStatus | null>(null);
  const [checkingTouchpad, setCheckingTouchpad] = useState(false);
  const [showAdvancedTouchpad, setShowAdvancedTouchpad] = useState(false);

  // Interactive sandbox state
  const [testActive, setTestActive] = useState(false);
  const [testPoints, setTestPoints] = useState<{ x: number; y: number }[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);
  const sandboxRef = useRef<HTMLDivElement>(null);

  // Combine predefined actions with user library
  const actionOptions: AppSelectOption[] = [
    ...PREDEFINED_ACTIONS,
    ...library
      .filter((a) => !PREDEFINED_ACTIONS.some((p) => p.value === a.id))
      .map((a) => ({ value: a.id, label: a.label || a.id })),
  ];

  // Refresh touchpad hardware capability
  const refreshTouchpadStatus = async () => {
    setCheckingTouchpad(true);
    try {
      const eapi = (window as any).electronAPI?.input;
      if (eapi?.getTouchpadStatus) {
        const res = await eapi.getTouchpadStatus();
        setTouchpadStatus(res);
      } else {
        setTouchpadStatus({ version: 1, supported: false, deviceCount: 0 });
      }
    } catch {
      setTouchpadStatus({ version: 1, supported: false, deviceCount: 0 });
    } finally {
      setCheckingTouchpad(false);
    }
  };

  const [winGesturesDisabled, setWinGesturesDisabled] = useState<boolean | null>(null);
  const [togglingWinGestures, setTogglingWinGestures] = useState(false);

  const checkWinConflicts = useCallback(async () => {
    try {
      const eapi = (window as any).electronAPI?.input;
      if (eapi?.getWindowsConflicts) {
        const res = await eapi.getWindowsConflicts();
        setWinGesturesDisabled(res.touchpadThreeFingerDisabled);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleWinGestures = async () => {
    setTogglingWinGestures(true);
    try {
      const eapi = (window as any).electronAPI?.input;
      const target = !winGesturesDisabled;
      await eapi?.setWindowsTouchpadGesturesDisabled?.(target);
      setWinGesturesDisabled(target);
    } finally {
      setTogglingWinGestures(false);
    }
  };

  useEffect(() => {
    void refreshTouchpadStatus();
    void checkWinConflicts();
  }, [checkWinConflicts]);

  const openWindowsSettings = () => {
    void (window as any).electronAPI?.input?.openWindowsTouchpadSettings?.();
  };

  const updateGestureAction = (gestureId: string, actionId: string) => {
    const updated = gestures.gestures.map((g) => (g.id === gestureId ? { ...g, actionId } : g));
    patch("hyperGestures", { gestures: updated });
  };

  const toggleGestureItem = (gestureId: string) => {
    const updated = gestures.gestures.map((g) => (g.id === gestureId ? { ...g, enabled: !g.enabled } : g));
    patch("hyperGestures", { gestures: updated });
  };

  // Live test sandbox handlers
  const handleSandboxMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sandboxRef.current) return;
    const rect = sandboxRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTestActive(true);
    setTestPoints([{ x, y }]);
    setTestResult(null);
  };

  const handleSandboxMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!testActive || !sandboxRef.current) return;
    const rect = sandboxRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTestPoints((pts) => [...pts, { x, y }]);
  };

  const handleSandboxMouseUp = () => {
    if (!testActive) return;
    setTestActive(false);
    if (testPoints.length < 3) {
      setTestResult("Too short — drag cursor across the pad to test stroke");
      return;
    }
    const start = testPoints[0];
    const end = testPoints[testPoints.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < gestures.activationThreshold) {
      setTestResult(`Within deadzone (${Math.round(dist)}px < ${gestures.activationThreshold}px) — tap preserved`);
      return;
    }

    // Direction quantization
    const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // degrees: 0=Right, 90=Up, 180/-180=Left, -90=Down
    let dir = "R";
    if (angle >= 67.5 && angle < 112.5) dir = "U";
    else if (angle >= 112.5 && angle < 157.5) dir = "UL";
    else if (angle >= 157.5 || angle < -157.5) dir = "L";
    else if (angle >= -157.5 && angle < -112.5) dir = "DL";
    else if (angle >= -112.5 && angle < -67.5) dir = "D";
    else if (angle >= -67.5 && angle < -22.5) dir = "DR";
    else if (angle >= -22.5 && angle < 22.5) dir = "R";
    else if (angle >= 22.5 && angle < 67.5) dir = "UR";

    const matched = gestures.gestures.find((g) => g.enabled && g.stroke.toUpperCase() === dir);
    const actionLabel = matched ? (actionOptions.find((a) => a.value === matched.actionId)?.label || matched.name) : "No mapping";

    setTestResult(`Recognized: ${STROKE_NAMES[dir]?.arrow || dir} (${dir}) ➔ ${actionLabel}`);
  };

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Gestures & Trackpad"
        description="Trigger instant directional actions with your Hyper key and perform fluid window dragging with three fingers on Precision Touchpads."
        onBack={onBack}
        badge={gestures.enabled || touchpad.enabled ? "Active" : "Standard"}
      />

      {/* ── Section 1: Hyper Pointer Gestures ────────────────────────── */}
      <SettingsGroup
        title="Hyper-Activated Pointer Gestures"
        desc={`Hold physical ${hyperKeyName}, draw a quick directional stroke with your pointer, and release ${hyperKeyName} to execute.`}
      >
        <SettingsRow
          title="Enable Hyper Pointer Gestures"
          desc={`Hold your physical ${hyperKeyName} key and move mouse or trackpad in any direction`}
        >
          <Toggle
            checked={gestures.enabled}
            onChange={(enabled) => patch("hyperGestures", { enabled })}
            aria-label="Toggle Hyper Pointer Gestures"
          />
        </SettingsRow>

        <SettingsRow
          title="Deadzone Threshold"
          desc="Distance (pixels) cursor must travel before deadzone breaks and gesture captures. Accidental micro-movements inside this threshold do not cancel Hyper tap actions."
        >
          <div className="gestures-slider-wrap">
            <Slider
              value={gestures.activationThreshold}
              min={12}
              max={60}
              step={2}
              onChange={(activationThreshold) => patch("hyperGestures", { activationThreshold })}
              formatValue={(v) => `${v}px`}
              aria-label="Deadzone threshold distance in pixels"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Visual Trail & Preview Overlay"
          desc="Draw a responsive glowing trail and floating action preview pill on screen while holding Hyper and gesturing"
        >
          <Toggle
            checked={gestures.showTrail}
            onChange={(showTrail) => patch("hyperGestures", { showTrail })}
            aria-label="Toggle Visual Trail Overlay"
          />
        </SettingsRow>

        <SettingsRow
          title="Tap-to-Enter Mode"
          desc="Alternative mode for laptop touchpads that suppress cursor movement while physical keyboard keys are held down (tap Hyper to arm, move pointer, then tap Hyper to execute)"
        >
          <Toggle
            checked={gestures.tapToEnterMode}
            onChange={(tapToEnterMode) => patch("hyperGestures", { tapToEnterMode })}
            aria-label="Toggle Tap-to-enter gesture mode"
          />
        </SettingsRow>

        {/* Gestures Mapping Table */}
        <div className="gestures-section-inner">
          <div className="gestures-mapping-header">
            <span className="gestures-header-title">
              Configured Gestures
            </span>
            <span className="gestures-header-count">
              {gestures.gestures.filter((g) => g.enabled).length} enabled
            </span>
          </div>

          <div className="gestures-list">
            {gestures.gestures.map((item: HyperGestureMapping) => {
              const meta = STROKE_NAMES[item.stroke.toUpperCase()] || { label: item.stroke, arrow: "•" };
              return (
                <div key={item.id} className="gestures-item-card">
                  <div className="gestures-item-lead">
                    <span className="gestures-arrow-badge">
                      {meta.arrow}
                    </span>
                    <div className="gestures-item-info">
                      <div className="gestures-item-name">
                        {item.name}
                      </div>
                      <div className="gestures-item-stroke">
                        Stroke: {item.stroke} ({meta.label})
                      </div>
                    </div>
                  </div>

                  <div className="gestures-item-controls">
                    <AppSelect
                      value={item.actionId}
                      options={actionOptions}
                      onChange={(val) => updateGestureAction(item.id, val)}
                      aria-label={`Action for ${item.name}`}
                    />
                    <Toggle
                      checked={item.enabled}
                      onChange={() => toggleGestureItem(item.id)}
                      aria-label={`Toggle ${item.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Interactive Sandbox / Test Pad */}
        <div className="gestures-section-inner">
          <div className="gesture-sandbox-header">
            <span className="gestures-header-title">
              Live Recognition Sandbox
            </span>
            <p className="gesture-sandbox-desc">
              Click and drag inside this box to test drawing gesture strokes and verify detection right in the UI.
            </p>
          </div>

          <div
            ref={sandboxRef}
            onMouseDown={handleSandboxMouseDown}
            onMouseMove={handleSandboxMouseMove}
            onMouseUp={handleSandboxMouseUp}
            onMouseLeave={handleSandboxMouseUp}
            className={`gesture-sandbox-pad${testActive ? " active" : ""}`}
          >
            {testPoints.length > 1 && (
              <svg className="gesture-sandbox-svg">
                <path
                  d={`M ${testPoints.map((p) => `${p.x} ${p.y}`).join(" L ")}`}
                  fill="none"
                  stroke="#4f7cff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <div className="gesture-sandbox-status">
              {testResult ? (
                <span className="gesture-sandbox-result">{testResult}</span>
              ) : testActive ? (
                <span className="gesture-sandbox-hint">Release mouse to recognize stroke...</span>
              ) : (
                <span className="gesture-sandbox-hint">Drag your cursor here to test gesture strokes</span>
              )}
            </div>
          </div>
        </div>
      </SettingsGroup>

      {/* ── Section 2: macOS Three-Finger Trackpad Dragging ──────────── */}
      <SettingsGroup
        title="macOS-Inspired Three-Finger Dragging"
        desc="Touch the trackpad with three fingers and move to drag windows, select text, or move files naturally without clicking down."
      >
        {/* Hardware Status Banner */}
        <div className={`touchpad-hardware-banner ${touchpadStatus?.supported ? "supported" : "unsupported"}`}>
          <div className="touchpad-hardware-lead">
            <div className={`touchpad-hardware-icon-box ${touchpadStatus?.supported ? "supported" : "unsupported"}`}>
              <Icon name={touchpadStatus?.supported ? "check" : "alertTriangle"} size={18} />
            </div>
            <div>
              <div className="touchpad-hardware-title-row">
                <span className="touchpad-hardware-title">
                  {touchpadStatus?.supported ? "Precision Touchpad Detected" : "Precision Touchpad Not Detected"}
                </span>
                <span className={`touchpad-hardware-badge ${touchpadStatus?.supported ? "supported" : "unsupported"}`}>
                  {touchpadStatus?.supported ? `${touchpadStatus.deviceCount} Device(s)` : "Standard Pointer"}
                </span>
              </div>
              <p className="touchpad-hardware-desc">
                {touchpadStatus?.supported
                  ? `Hardware digitizer reports (${touchpadStatus.deviceName || "Precision Touchpad"}) are active via Raw Input.`
                  : "Three-finger dragging requires a hardware Windows Precision Touchpad (UsagePage 0x0D, Usage 0x05) that reports individual finger contacts. Desktop mice or generic touchpad drivers do not expose multi-touch contact counts."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={refreshTouchpadStatus}
            disabled={checkingTouchpad}
            className="touchpad-refresh-button"
          >
            {checkingTouchpad ? "Checking..." : "Refresh Hardware"}
          </button>
        </div>

        <SettingsRow
          title="Enable Three-Finger Dragging"
          desc="Drag windows, select text, and move items across the desktop with three fingers on Precision Touchpads"
        >
          <Toggle
            checked={touchpad.enabled}
            onChange={(enabled) => patch("touchpadDrag", { enabled })}
            aria-label="Toggle Three-Finger Dragging"
          />
        </SettingsRow>

        <SettingsRow
          title="Cursor Speed"
          desc="Pointer speed while dragging windows with three fingers (default: 30)"
        >
          <div className="gestures-slider-wrap">
            <Slider
              value={currentSpeed}
              min={5}
              max={100}
              step={1}
              onChange={(speed) => patch("touchpadDrag", { speed })}
              formatValue={(v) => `${v}`}
              aria-label="Cursor speed"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Pointer Acceleration"
          desc="macOS sigmoid velocity model: subtle movements stay pixel-precise while quick swipes glide across the desktop (default: 10)"
        >
          <div className="gestures-slider-wrap">
            <Slider
              value={currentAcceleration}
              min={0}
              max={30}
              step={1}
              onChange={(acceleration) => patch("touchpadDrag", { acceleration })}
              formatValue={(v) => (v === 0 ? "Off (Linear)" : `${v}`)}
              aria-label="Pointer acceleration"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Start Drag Movement Threshold"
          desc="Intentional movement distance before left mouse down engages (eliminates clicks on resting fingers, default: 100)"
        >
          <div className="gestures-slider-wrap">
            <Slider
              value={currentStartThreshold}
              min={20}
              max={250}
              step={5}
              onChange={(startThreshold) =>
                patch("touchpadDrag", {
                  startThreshold,
                  movementThreshold: Math.round(startThreshold / 6),
                })
              }
              formatValue={(v) => `${v}`}
              aria-label="Start drag movement threshold"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Stop Drag Sensitivity"
          desc="Movement threshold to determine when fingers stop moving before releasing drag (default: 10)"
        >
          <div className="gestures-slider-wrap">
            <Slider
              value={currentStopThreshold}
              min={5}
              max={35}
              step={1}
              onChange={(stopThreshold) => patch("touchpadDrag", { stopThreshold })}
              formatValue={(v) => `${v}`}
              aria-label="Stop drag sensitivity"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Finger Repositioning Drop Delay"
          desc="macOS-parity drop delay: time window (milliseconds) after lifting fingers to reposition your hand across the trackpad without dropping the window (default: 500ms)"
        >
          <div className="gestures-slider-wrap">
            <Slider
              value={currentReleaseDelay}
              min={100}
              max={1000}
              step={25}
              onChange={(releaseDelayMs) =>
                patch("touchpadDrag", {
                  releaseDelayMs,
                  gracePeriodMs: releaseDelayMs,
                })
              }
              formatValue={(v) => `${v}ms`}
              aria-label="Finger repositioning drop delay in milliseconds"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Allow Release & Restart"
          desc="Permit tapping three fingers back down during the drop delay to immediately resume dragging without re-crossing the threshold"
        >
          <Toggle
            checked={touchpad.allowReleaseAndRestart}
            onChange={(allowReleaseAndRestart) => patch("touchpadDrag", { allowReleaseAndRestart })}
            aria-label="Toggle allow release and restart"
          />
        </SettingsRow>

        <SettingsRow
          title="Advanced Tuning & Troubleshooting"
          desc="Driver compatibility toggles, glitch rejection distance, and multi-frame smoothing"
        >
          <button
            type="button"
            className="touchpad-refresh-button"
            onClick={() => setShowAdvancedTouchpad(!showAdvancedTouchpad)}
          >
            {showAdvancedTouchpad ? "Hide Advanced" : "Show Advanced"}
          </button>
        </SettingsRow>

        {showAdvancedTouchpad && (
          <>
            <SettingsRow
              title="Move Cursor with Drag"
              desc="Synthetically shift cursor position while dragging (keep enabled on Windows Precision Touchpads)"
            >
              <Toggle
                checked={touchpad.cursorMove !== false}
                onChange={(cursorMove) => patch("touchpadDrag", { cursorMove })}
                aria-label="Toggle cursor move"
              />
            </SettingsRow>

            <SettingsRow
              title="Glitch Distance Limit"
              desc="Maximum allowable single-frame displacement before discarding anomalous sensor jumps (default: 150)"
            >
              <div className="gestures-slider-wrap">
                <Slider
                  value={currentMaxDistance}
                  min={50}
                  max={400}
                  step={10}
                  onChange={(maxFingerDistance) => patch("touchpadDrag", { maxFingerDistance })}
                  formatValue={(v) => (v === 0 ? "Disabled" : `${v}`)}
                  aria-label="Glitch distance limit"
                />
              </div>
            </SettingsRow>

            <SettingsRow
              title="Input Smoothing (Frame Averaging)"
              desc="Number of consecutive multi-touch frames to average before shifting the pointer (1 = lowest latency, 2–3 = extra smooth)"
            >
              <div className="gestures-slider-wrap">
                <Slider
                  value={currentAveraging}
                  min={1}
                  max={5}
                  step={1}
                  onChange={(cursorAveraging) => patch("touchpadDrag", { cursorAveraging })}
                  formatValue={(v) => `${v} ${v === 1 ? "frame (instant)" : "frames"}`}
                  aria-label="Input smoothing frame averaging"
                />
              </div>
            </SettingsRow>
          </>
        )}

        {/* Windows Touchpad Conflict Guidance Box */}
        <div className="touchpad-conflict-banner">
          <div className="touchpad-conflict-info">
            <div className="touchpad-conflict-title">
              Windows Native 3-Finger Gestures
              {winGesturesDisabled !== null && (
                <span
                  className={`touchpad-conflict-status-badge ${
                    winGesturesDisabled ? "is-disabled" : "is-active"
                  }`}
                >
                  <Icon name={winGesturesDisabled ? "check" : "alertTriangle"} size={12} />
                  <span>{winGesturesDisabled ? "Turned Off (Optimal)" : "Active in Windows (May Interfere)"}</span>
                </span>
              )}
            </div>
            <p className="touchpad-conflict-desc">
              {winGesturesDisabled
                ? "Windows 3-finger slide and tap gestures are turned off in the registry so Windows does not intercept trackpad contacts while KeyFlow dragging is active."
                : "Windows 3-finger gestures (Task View / App Switcher) are currently enabled in Windows, which may intercept swipes before KeyFlow. Turn them off for uninterrupted dragging."}
            </p>
          </div>

          <div className="touchpad-conflict-actions">
            <button
              type="button"
              onClick={handleToggleWinGestures}
              disabled={togglingWinGestures}
              className={winGesturesDisabled ? "touchpad-secondary-button" : "touchpad-settings-button"}
            >
              <Icon name={winGesturesDisabled ? "check" : "zap"} size={14} />
              <span>
                {togglingWinGestures
                  ? "Updating..."
                  : winGesturesDisabled
                  ? "Restore Windows Gestures"
                  : "Turn Off Windows Gestures"}
              </span>
            </button>
            <button
              type="button"
              onClick={openWindowsSettings}
              className="touchpad-secondary-button"
            >
              <Icon name="settings" size={14} />
              <span>Windows Settings</span>
            </button>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};
