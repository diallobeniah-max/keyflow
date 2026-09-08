import type { FC } from "react";
import { Button, SettingsGroup, SettingsRow } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { SettingsPageHeader } from "./SettingsPageHeader";
import { useStore } from "../../store/useStore";
import { getAppIconAsset } from "../../lib/app-icon";
import { runAction } from "../../lib/actions";

interface AboutPageProps {
  onBack?: () => void;
}

export const AboutPage: FC<AboutPageProps> = ({ onBack }) => {
  const appearance = useStore((s) => s.data.settings.appearance);
  const navigate = useStore((s) => s.navigate);
  const appIconAsset = getAppIconAsset(appearance.appIcon);

  const openLink = (url: string, id: string) => {
    void runAction({
      id: `open-${id}`,
      type: "openWebsite",
      payload: { url },
    });
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="About KeyFlow"
        description="Local-only Windows keyboard automation, gesture engine, and runtime specifications."
        onBack={onBack}
      />

      {/* Hero Brand Showcase */}
      <div className="about-hero-card p-md col items-center text-center gap-xs">
        <div className={`about-hero-icon-pod theme-${appearance.appIcon ?? "monochrome"}`}>
          <img
            src={appIconAsset}
            alt="KeyFlow Icon"
            className="about-hero-icon-img"
            draggable={false}
          />
        </div>
        <h3 className="about-hero-title no-margin">KeyFlow</h3>
        <p className="tiny muted no-margin max-w-400">
          Ultra-responsive Windows shortcut engine with multi-tap gestures, Hyper chords, DWM window highlights, and local-first privacy.
        </p>
        <div className="row gap-xs mt-xs items-center flex-wrap justify-center">
          <span className="chip chip-accent">v0.3.0 Stable</span>
          <span className="chip chip-subtle">Build 2026.09</span>
          <span className="chip chip-subtle">Windows x64</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-xs"
            onClick={() => navigate("settings", "appIcon")}
            title="Customize KeyFlow App Icon"
          >
            <Icon name="sparkles" size={12} />
            <span>Change Icon</span>
          </button>
        </div>
      </div>

      <SettingsGroup
        title="Software Specifications"
        icon="monitor"
        desc="Build information and execution environment"
        accentColor="blue"
      >
        <SettingsRow id="row-about-version" title="Version" desc="Installed KeyFlow release version">
          <span className="chip chip-accent font-mono">0.3.0</span>
        </SettingsRow>

        <SettingsRow title="Release channel" desc="Automatic update deployment track">
          <span className="chip chip-subtle">Stable (Production)</span>
        </SettingsRow>

        <SettingsRow title="Input hook engine" desc="Low-level Windows keyboard and mouse interceptor">
          <span className="chip chip-accent">Rust WH_KEYBOARD_LL Native</span>
        </SettingsRow>

        <SettingsRow title="Platform & architecture" desc="Operating system runtime target">
          <span className="tiny font-mono muted">Windows 10 / 11 (win32-x64)</span>
        </SettingsRow>

        <SettingsRow title="Runtime stack" desc="Host framework and engine components">
          <span className="tiny font-mono muted">Electron 33 • Chromium 130 • Node 20 • React 18</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Resources & Links"
        icon="globe"
        desc="Documentation, release history, and source repository"
        accentColor="indigo"
      >
        <SettingsRow title="Documentation" desc="Read comprehensive design system and architecture guides">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openLink("https://github.com/diallobeniah-max/keyflow#readme", "docs")}
          >
            Documentation
          </Button>
        </SettingsRow>

        <SettingsRow title="Release notes" desc="What's new in recent KeyFlow builds">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openLink("https://github.com/diallobeniah-max/keyflow/releases", "releases")}
          >
            Release Notes
          </Button>
        </SettingsRow>

        <SettingsRow title="GitHub repository" desc="Source code, issues, and discussions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openLink("https://github.com/diallobeniah-max/keyflow", "github")}
          >
            GitHub
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
