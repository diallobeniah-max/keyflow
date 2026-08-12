import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  usage?: string;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, usage, children }: PageHeaderProps) {
  return (
    <header className="page-header page-intro">
      <div className="page-header__copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        <p className="page-header__description">{description}</p>
        {usage && <p className="page-header__usage">{usage}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
