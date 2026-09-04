import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface PopupMenuPageProps {
  onBack?: () => void;
}

export const PopupMenuPage: FC<PopupMenuPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const p = settings.popup;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Popup Menu"
        description="Configure the floating quick-action launcher and menu layout."
        onBack={onBack}
      />

      <SettingsGroup
        title="Activation & Position"
        icon="popup"
        desc="Where the floating radial/palette menu appears on screen"
        accentColor="rose"
      >
        <SettingsRow
          id="row-pop-pos"
          title="Popup position"
          desc="Default spawn location for the floating action menu"
        >
          <div className="w-180">
            <AppSelect
              value={p.position}
              onChange={(v) => patch("popup", { position: v as any })}
              options={[
                { value: "cursor", label: "Near mouse cursor" },
                { value: "center", label: "Center of active screen" },
                { value: "last", label: "Remember last position" },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Content & Visuals"
        icon="eye"
        desc="Filter inputs, iconography, and numerical badges"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-pop-search"
          title="Enable search bar"
          desc="Include instant search filter in the popup header"
        >
          <Toggle
            label="Enable search"
            checked={p.search}
            onChange={(v) => patch("popup", { search: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-pop-icons"
          title="Show action icons"
          desc="Display category and type icons next to action titles"
        >
          <Toggle
            label="Show icons"
            checked={p.showIcons}
            onChange={(v) => patch("popup", { showIcons: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-pop-numbers"
          title="Show numeric badges"
          desc="Display quick number hotkeys (1–9) for instant keyboard activation"
        >
          <Toggle
            label="Show numeric badges"
            checked={(p as any).showNumbers ?? false}
            onChange={(v) => patch("popup", { showNumbers: v } as any)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Behavior"
        icon="zap"
        desc="Dismissal triggers and workflow continuation"
        accentColor="cyan"
      >
        <SettingsRow
          id="row-pop-close"
          title="Close after action"
          desc="Automatically dismiss the popup menu once an item is triggered"
        >
          <Toggle
            label="Close after action"
            checked={p.closeAfterAction}
            onChange={(v) => patch("popup", { closeAfterAction: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-pop-blur"
          title="Close on blur"
          desc="Dismiss popup immediately when clicking outside or switching apps"
        >
          <Toggle
            label="Close on blur"
            checked={(p as any).closeOnBlur !== false}
            onChange={(v) => patch("popup", { closeOnBlur: v } as any)}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
