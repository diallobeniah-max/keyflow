import React from "react";
import { Icon } from "./Icon";
import { useStore } from "../store/useStore";
import { AppSelect, AppSelectOption } from "./ui/AppSelect";

export function Button({ variant = "secondary", size, icon, children, onClick, disabled, title, style, type = "button" }: { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm"; icon?: string; children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; style?: React.CSSProperties; type?: "button" | "submit" | "reset" }) {
  return <button type={type} className={["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : ""].join(" ").trim()} onClick={onClick} disabled={disabled} title={title} style={style}>{icon && <Icon name={icon} size={18}/>} {children}</button>;
}

const ICON_LABELS: Record<string, string> = {
  chevronDown: "Open menu",
  chevronLeft: "Collapse sidebar",
  chevronRight: "Expand sidebar",
  chevronUp: "Move action up",
  close: "Close",
  copy: "Duplicate",
  edit: "Edit",
  play: "Test shortcut",
  profiles: "Open profiles",
  star: "Toggle favorite",
  trash: "Delete",
};

export function IconButton({ name, onClick, active, title, size = 20, style, disabled, describedBy, id, ariaLabel, "aria-label": ariaLabelProp, "aria-describedby": ariaDescribedBy, "aria-labelledby": ariaLabelledBy }: { name: string; onClick?: () => void; active?: boolean; title?: string; size?: number; style?: React.CSSProperties; disabled?: boolean; describedBy?: string; id?: string; ariaLabel?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-labelledby"?: string }) {
  return <button id={id} type="button" className={"icon-btn" + (active ? " active" : "")} onClick={onClick} title={title} aria-label={ariaLabel ?? ariaLabelProp ?? title ?? ICON_LABELS[name] ?? name} aria-labelledby={ariaLabelledBy} aria-describedby={[describedBy, ariaDescribedBy].filter(Boolean).join(" ") || undefined} style={style} disabled={disabled}><Icon name={name} size={size}/></button>;
}

export function Card({ children, hover, onClick, style, className }: { children: React.ReactNode; hover?: boolean; onClick?: () => void; style?: React.CSSProperties; className?: string }) {
  return <div className={"card" + (hover ? " hover" : "") + (className ? " " + className : "")} onClick={onClick} style={style}>{children}</div>;
}

export function Toggle({ checked, onChange, disabled, label = "Toggle", describedBy, id, ariaLabel, "aria-label": ariaLabelProp, "aria-describedby": ariaDescribedBy, "aria-labelledby": ariaLabelledBy }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; describedBy?: string; id?: string; ariaLabel?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-labelledby"?: string }) {
  return <button id={id} type="button" className={"toggle" + (checked ? " on" : "")} onClick={() => !disabled && onChange(!checked)} disabled={disabled} aria-pressed={checked} aria-label={ariaLabel ?? ariaLabelProp ?? label} aria-labelledby={ariaLabelledBy} aria-describedby={[describedBy, ariaDescribedBy].filter(Boolean).join(" ") || undefined}><span className="knob"/></button>;
}

type FieldControlProps = {
  id?: string;
  role?: React.AriaRole;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
  "aria-valuenow"?: number;
  "aria-checked"?: boolean;
};

export function Field({ label, hint, group = false, children }: { label?: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const fieldId = React.useId();
  const labelId = label ? `${fieldId}-label` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const child = React.isValidElement(children) ? children as React.ReactElement<FieldControlProps> : undefined;
  const childProps = child?.props ?? {};
  const controlId = childProps.id ?? fieldId;
  const hasIntrinsicName = Boolean(childProps["aria-label"] || childProps["aria-labelledby"]);
  const describedBy = [childProps["aria-describedby"], hintId].filter(Boolean).join(" ") || undefined;
  const labelledBy = childProps["aria-labelledby"] || (!hasIntrinsicName ? labelId : undefined);
  const controlProps: FieldControlProps = { id: controlId };
  if (describedBy) controlProps["aria-describedby"] = describedBy;
  if (labelledBy) controlProps["aria-labelledby"] = labelledBy;
  if (group) controlProps.role = childProps.role ?? "group";
  const control = child ? React.cloneElement(child, controlProps) : children;
  const labelTarget = group ? undefined : controlId;

  return <div className="field">{label && (group ? <div className="field-label" id={labelId}>{label}</div> : <label className="field-label" id={labelId} htmlFor={labelTarget}>{label}</label>)}{control}{hint && <div className="hint" id={hintId}>{hint}</div>}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { onKeyDown, onMouseDown, className, ...rest } = props;
  return <input className={["input", className ?? ""].join(" ").trim()} {...rest} onKeyDown={(e)=>{ onKeyDown?.(e); e.stopPropagation(); }} onMouseDown={(e)=>{ onMouseDown?.(e); e.stopPropagation(); }}/>;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { onKeyDown, onMouseDown, className, ...rest } = props;
  return <textarea className={["input", className ?? ""].join(" ").trim()} {...rest} onKeyDown={(e)=>{ onKeyDown?.(e); e.stopPropagation(); }} onMouseDown={(e)=>{ onMouseDown?.(e); e.stopPropagation(); }}/>;
}

export function Select({ value, onChange, options, placeholder = "Select", id, describedBy, ariaLabel, "aria-label": ariaLabelProp, "aria-describedby": ariaDescribedBy, "aria-labelledby": ariaLabelledBy, disabled }: { value: string; onChange: (v: string) => void; options: AppSelectOption[]; placeholder?: string; id?: string; describedBy?: string; ariaLabel?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-labelledby"?: string; disabled?: boolean }) {
  return <AppSelect id={id} describedBy={[describedBy, ariaDescribedBy].filter(Boolean).join(" ") || undefined} ariaLabel={ariaLabel ?? ariaLabelProp} aria-labelledby={ariaLabelledBy} disabled={disabled} value={value} onChange={onChange} options={options} placeholder={placeholder} />;
}

export function Slider({ value, min, max, step = 1, onChange, id, describedBy, ariaLabel, "aria-describedby": ariaDescribedBy, "aria-label": ariaLabelProp, "aria-labelledby": ariaLabelledBy, disabled }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; id?: string; describedBy?: string; ariaLabel?: string; "aria-describedby"?: string; "aria-label"?: string; "aria-labelledby"?: string; disabled?: boolean }) {
  const progress = ((value - min) / (max - min)) * 100;
  return <input id={id} aria-describedby={[describedBy, ariaDescribedBy].filter(Boolean).join(" ") || undefined} aria-label={ariaLabel ?? ariaLabelProp} aria-labelledby={ariaLabelledBy} disabled={disabled} className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--range-progress" as string]: `${progress}%` } as React.CSSProperties}/>;
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
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" style={width ? { width } : undefined} onMouseDown={(e) => e.stopPropagation()}>{title && <div className="modal-header spread"><h3 className="section-title">{title}</h3><IconButton name="close" onClick={onClose}/></div>}{children}{footer && <div className="modal-footer row">{footer}</div>}</div></div>;
}

export function StatCard({ title, value, icon, accent, subtitle }: { title: string; value: React.ReactNode; icon: string; accent?: string; subtitle?: string }) {
  return <Card hover><div className="spread"><div><div className="muted small">{title}</div><div className="stat-value">{value}</div>{subtitle && <div className="muted tiny">{subtitle}</div>}</div><div className="stat-icon" style={{ background: colorWithAlpha(accent ?? "var(--accent)"), color: accent ?? "var(--accent)" }}><Icon name={icon} size={22}/></div></div></Card>;
}
export function colorWithAlpha(color: string): string { if (color.startsWith("#") && color.length === 7) { const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16); return `rgba(${r},${g},${b},0.15)`; } return "color-mix(in srgb, " + color + " 15%, transparent)"; }
export function ToastHost() { const toasts=useStore((s)=>s.toasts); const remove=useStore((s)=>s.removeToast); return <div className="toast-wrap">{toasts.map((t)=><div key={t.id} className={"toast " + t.kind} onClick={()=>remove(t.id)}>{t.message}</div>)}</div>; }
