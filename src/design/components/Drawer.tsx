import { Button } from "./Button";

export function Drawer({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`drawer-panel${wide ? " drawer-panel-wide" : ""}`} onClick={(event) => event.stopPropagation()}>
        <header className="drawer-header">
          <div>
            <div className="drawer-kicker">{title}</div>
            {subtitle ? <h2 className="drawer-title">{subtitle}</h2> : null}
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
