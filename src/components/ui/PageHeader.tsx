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
    <header className="page-header page-intro is-compact-header">
      <div className="page-header__left">
        <div className="page-header__title-cluster">
          {eyebrow && <span className="eyebrow page-header__eyebrow-chip">{eyebrow}</span>}
          <h1 className="page-title">{title}</h1>
        </div>
        {(description || usage) && (
          <div className="page-header__description-box" title={usage ? `${description} • ${usage}` : description}>
            <span className="page-header__desc-text">{description}</span>
            {usage && <span className="page-header__usage-text hide-mobile">{usage}</span>}
          </div>
        )}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
