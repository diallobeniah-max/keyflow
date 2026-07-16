import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useStore } from "../store/useStore";

export function Button({ variant = "secondary", size, icon, children, onClick, disabled, title, style, type = "button" }: { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm"; icon?: string; children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; style?: React.CSSProperties; type?: "button" | "submit" | "reset" }) {
  return <button type={type} className={["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : ""].join(" ").trim()} onClick={onClick} disabled={disabled} title={title} style={style}>{icon && <Icon name={icon} size={18}/>} {children}</button>;
}

export function IconButton({ name, onClick, active, title, size = 20, style, disabled }: { name: string; onClick?: () => void; active?: boolean; title?: string; size?: number; style?: React.CSSProperties; disabled?: boolean }) {
  return <button type="button" className={"icon-btn" + (active ? " active" : "")} onClick={onClick} title={title} style={style} disabled={disabled}><Icon name={name} size={size}/></button>;
}

export function Card({ children, hover, onClick, style, className }: { children: React.ReactNode; hover?: boolean; onClick?: () => void; style?: React.CSSProperties; className?: string }) {
  return <div className={"card" + (hover ? " hover" : "") + (className ? " " + className : "")} onClick={onClick} style={style}>{children}</div>;
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" className={"toggle" + (checked ? " on" : "")} onClick={() => !disabled && onChange(!checked)} disabled={disabled} aria-pressed={checked} aria-label="toggle"><span className="knob"/></button>;
}

export function Field({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) {
  return <div className="field">{label && <label className="field-label">{label}</label>}{children}{hint && <div className="hint">{hint}</div>}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { onKeyDown, onMouseDown, className, ...rest } = props;
  return <input className={["input", className ?? ""].join(" ").trim()} {...rest} onKeyDown={(e)=>{ onKeyDown?.(e); e.stopPropagation(); }} onMouseDown={(e)=>{ onMouseDown?.(e); e.stopPropagation(); }}/>;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { onKeyDown, onMouseDown, className, ...rest } = props;
  return <textarea className={["input", className ?? ""].join(" ").trim()} {...rest} onKeyDown={(e)=>{ onKeyDown?.(e); e.stopPropagation(); }} onMouseDown={(e)=>{ onMouseDown?.(e); e.stopPropagation(); }}/>;
}

export function Select({ value, onChange, options, placeholder = "Select" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="select-wrap" ref={ref}>
      <button
        type="button"
        className={"select-trigger" + (open ? " open" : "")}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); }
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <span className="select-chevron"><Icon name="chevronDown" size={16}/></span>
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {options.map((o) => (
            <button key={o.value} type="button" className={"select-option" + (o.value === value ? " selected" : "")} onClick={() => choose(o.value)}>
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={15}/>} 
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Slider({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const progress = ((value - min) / (max - min)) * 100;
  return <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--range-progress" as string]: `${progress}%` } as React.CSSProperties}/>;
}

export function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <div className="seg">{options.map((o) => <button type="button" key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Chip({ children, color }: { children: React.ReactNode; color?: string }) { return <span className="chip" style={color ? { color, borderColor: color } : undefined}>{children}</span>; }

export function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

export function Modal({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" style={width ? { width } : undefined} onMouseDown={(e) => e.stopPropagation()}>{title && <div className="spread" style={{ marginBottom: 16 }}><h3 className="section-title">{title}</h3><IconButton name="close" onClick={onClose}/></div>}{children}{footer && <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>{footer}</div>}</div></div>;
}

export function StatCard({ title, value, icon, accent, subtitle }: { title: string; value: React.ReactNode; icon: string; accent?: string; subtitle?: string }) {
  return <Card hover><div className="spread"><div><div className="muted small">{title}</div><div className="stat-value">{value}</div>{subtitle && <div className="muted tiny">{subtitle}</div>}</div><div className="stat-icon" style={{ background: colorWithAlpha(accent ?? "var(--accent)"), color: accent ?? "var(--accent)" }}><Icon name={icon} size={22}/></div></div></Card>;
}
export function colorWithAlpha(color: string): string { if (color.startsWith("#") && color.length === 7) { const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16); return `rgba(${r},${g},${b},0.15)`; } return "color-mix(in srgb, " + color + " 15%, transparent)"; }
export function ToastHost() { const toasts=useStore((s)=>s.toasts); const remove=useStore((s)=>s.removeToast); return <div className="toast-wrap">{toasts.map((t)=><div key={t.id} className={"toast " + t.kind} onClick={()=>remove(t.id)}>{t.message}</div>)}</div>; }
