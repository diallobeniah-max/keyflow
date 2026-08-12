import { useState } from "react";
import { useStore } from "../store/useStore";
import { Button, Card } from "../components/ui";
import { Icon } from "../components/Icon";

const SLIDES = [
  {
    title: "Welcome to KeyFlow",
    icon: "logo",
    text: "Turn ordinary physical keys into smart automation triggers for screenshots, apps, windows, and popup menus.",
  },
  {
    title: "Multi-Gesture Triggers",
    icon: "key",
    text: "Assign single taps, rapid double-taps (like double-tap F for menu), and holds with microsecond precision.",
  },
  {
    title: "Private & Local Engine",
    icon: "shield",
    text: "KeyFlow runs 100% locally with a dedicated native Rust input hook. KeyFlow never logs words or uploads data.",
  },
  {
    title: "Contextual Profiles",
    icon: "profiles",
    text: "Configure dedicated shortcut environments that automatically activate based on your active foreground app.",
  },
];

export function Onboarding() {
  const done = useStore((s) => s.finishOnboarding);
  const [i, setI] = useState(0);
  const s = SLIDES[i];

  return (
    <div className="modal-backdrop">
      <Card className="onboarding-card">
        <div className="onboarding-icon-wrap">
          <Icon name={s.icon} size={28} />
        </div>
        <h2 className="onboarding-title">{s.title}</h2>
        <p className="onboarding-text">{s.text}</p>

        <div className="onboarding-dots">
          {SLIDES.map((_, idx) => (
            <span key={idx} className={"onboarding-dot" + (idx === i ? " active" : "")} />
          ))}
        </div>

        <div className="spread" style={{ width: "100%", marginTop: "var(--space-4)" }}>
          <Button variant="ghost" onClick={done}>
            Skip intro
          </Button>
          {i < SLIDES.length - 1 ? (
            <Button variant="primary" icon="chevronRight" onClick={() => setI(i + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="primary" icon="check" onClick={done}>
              Get Started
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
