import { useState, useRef, type FC } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { Button, SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { CustomCursorItem } from "../../types";

interface WasdPageProps {
  onBack?: () => void;
}

export const WasdPage: FC<WasdPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);
  const wasdNavigationActive = useStore((s) => s.wasdNavigationActive);
  const setWasdNavigationActive = useStore((s) => s.setWasdNavigationActive);

  const [isDraggingCursor, setIsDraggingCursor] = useState(false);
  const cursorInputRef = useRef<HTMLInputElement>(null);

  const wasd = settings.wasdNavigation;
  const isEnabled = wasdNavigationActive;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="WASD Navigation"
        description="Control the Windows mouse pointer, acceleration curves, and mouse clicks directly using keyboard keys."
        onBack={onBack}
        badge={isEnabled ? "Active" : undefined}
      />

      <SettingsGroup
        title="Status & Activation"
        icon="keyboard"
        desc="Turn WASD mouse control on or off"
        accentColor="green"
      >
        <SettingsRow
          id="row-wasd-enable"
          title="Enable WASD Navigation"
          desc="Engage WASD cursor navigation mode across Windows"
        >
          <Toggle
            label="WASD Navigation"
            checked={isEnabled}
            onChange={(v) => setWasdNavigationActive(v)}
          />
        </SettingsRow>
      </SettingsGroup>

      <div className={isEnabled ? "" : "settings-progressive-disabled"}>
        <SettingsGroup
          title="HUD & State Feedback"
          icon="eye"
          desc="On-screen status card and active cursor pointer appearance"
          accentColor="cyan"
        >
          <SettingsRow
            id="row-wasd-state-card"
            title="Navigation status card"
            desc="Briefly show an on-screen confirmation when navigation mode changes"
          >
            <Toggle
              label="Show WASD navigation status card"
              checked={wasd?.showStateCard === true}
              onChange={(showStateCard) =>
                patch("wasdNavigation" as any, { ...wasd, showStateCard } as any)
              }
            />
          </SettingsRow>

          <SettingsRow
            id="row-wasd-size"
            title="Navigation cursor size"
            desc="Size of the active cursor indicator"
          >
            <div className="w-160">
              <AppSelect
                value={String(wasd?.cursorSize ?? 32)}
                onChange={(v) =>
                  patch("wasdNavigation" as any, { ...wasd, cursorSize: Number(v) } as any)
                }
                options={[
                  { value: "24", label: "Small (24px)" },
                  { value: "32", label: "Default (32px)" },
                  { value: "48", label: "Large (48px)" },
                  { value: "64", label: "Extra Large (64px)" },
                ]}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Cursor Style & Gallery"
          icon="mouse"
          desc="Pick default pointer or upload custom cursors (.cur, .ani, .png, .svg, .ico, .webp)"
          accentColor="blue"
        >
          <SettingsRow
            id="row-wasd-gallery"
            title="Cursor Indicator Style"
            desc="Select from default or custom uploaded pointers"
          >
            <div className="col gap-sm w-full">
              <div className="row gap-xs wrap items-center">
                <button
                  type="button"
                  className={
                    "chip clickable" +
                    ((wasd?.activeCursorId ?? "default") === "default" ? " chip-accent" : " chip-subtle")
                  }
                  onClick={() => {
                    patch("wasdNavigation" as any, { ...wasd, activeCursorId: "default" } as any);
                  }}
                >
                  <img src="/cursors/blue-cursor.png" alt="" width={14} height={14} className="wasd-cursor-img" />
                  <span>Default Blue Pointer</span>
                </button>

                {(wasd?.customCursors ?? []).map((c) => {
                  const isActive = wasd?.activeCursorId === c.id;
                  return (
                    <div key={c.id} className="wasd-custom-cursor-chip">
                      <button
                        type="button"
                        className={"chip clickable" + (isActive ? " chip-accent" : " chip-subtle")}
                        onClick={() => {
                          patch("wasdNavigation" as any, { ...wasd, activeCursorId: c.id } as any);
                        }}
                      >
                        <img src={c.dataUrl} alt="" width={14} height={14} className="wasd-cursor-img" />
                        <span>{c.name}</span>
                      </button>
                      <button
                        type="button"
                        className="wasd-cursor-chip-del"
                        title="Delete custom cursor"
                        onClick={(e) => {
                          e.stopPropagation();
                          const customCursors = (wasd?.customCursors ?? []).filter((item) => item.id !== c.id);
                          const activeCursorId = wasd?.activeCursorId === c.id ? "default" : wasd?.activeCursorId;
                          patch("wasdNavigation" as any, { ...wasd, customCursors, activeCursorId } as any);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="row gap-sm items-center mt-xs">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    patch("wasdNavigation" as any, { ...wasd, activeCursorId: "default" } as any);
                  }}
                >
                  Choose Default
                </Button>
                {(wasd?.customCursors ?? []).length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      patch("wasdNavigation" as any, { ...wasd, customCursors: [], activeCursorId: "default" } as any);
                    }}
                  >
                    Remove All Custom
                  </Button>
                )}
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-wasd-upload"
            layout="stack"
            title="Upload Custom Cursor"
            desc="Drag and drop any mouse format (.cur, .ani, .png, .svg, .ico, .webp, .jpg, .bmp)"
          >
            <div
              className={"wasd-cursor-dropzone" + (isDraggingCursor ? " is-dragging" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingCursor(true);
              }}
              onDragLeave={() => setIsDraggingCursor(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingCursor(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    if (!dataUrl) return;
                    const newCursor: CustomCursorItem = {
                      id: `cursor-${Date.now()}`,
                      name: file.name.replace(/\.[^/.]+$/, ""),
                      dataUrl,
                      format: file.name.split(".").pop()?.toLowerCase(),
                    };
                    const existing = wasd?.customCursors ?? [];
                    patch("wasdNavigation" as any, {
                      ...wasd,
                      customCursors: [...existing, newCursor],
                      activeCursorId: newCursor.id,
                    } as any);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              onClick={() => cursorInputRef.current?.click()}
            >
              <input
                ref={cursorInputRef}
                type="file"
                className="visually-hidden sr-only"
                accept=".cur,.ani,.png,.svg,.ico,.webp,.jpg,.jpeg,.bmp"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const dataUrl = event.target?.result as string;
                      if (!dataUrl) return;
                      const newCursor: CustomCursorItem = {
                        id: `cursor-${Date.now()}`,
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        dataUrl,
                        format: file.name.split(".").pop()?.toLowerCase(),
                      };
                      const existing = wasd?.customCursors ?? [];
                      patch("wasdNavigation" as any, {
                        ...wasd,
                        customCursors: [...existing, newCursor],
                        activeCursorId: newCursor.id,
                      } as any);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <Icon name="upload" size={22} />
              <div className="col gap-xs items-center text-center">
                <div className="small bold">Drag & Drop cursor file here or click to browse</div>
                <div className="tiny muted">Supports .cur, .ani, .png, .svg, .ico, .webp, .jpg, .bmp</div>
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-wasd-preview"
            title="Cursor indicator preview"
            desc="Visual indicator displayed while navigation mode is engaged"
          >
            <div className="row gap-sm items-center">
              <div
                className="wasd-cursor-preview-stage"
                data-cursor-size={wasd?.cursorSize ?? 32}
              >
                <img
                  src={
                    (wasd?.customCursors ?? []).find(
                      (c) => c.id === wasd?.activeCursorId
                    )?.dataUrl || "/cursors/blue-cursor.png"
                  }
                  alt="Active Cursor"
                  className="wasd-cursor-preview-img"
                />
              </div>
              <span className="chip chip-accent">
                {(wasd?.activeCursorId ?? "default") === "default"
                  ? "Default Blue Pointer"
                  : (wasd?.customCursors ?? []).find(
                      (c) => c.id === wasd?.activeCursorId
                    )?.name ?? "Active Custom Cursor"}
              </span>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};
