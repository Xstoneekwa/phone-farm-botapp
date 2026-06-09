import { Button } from "./Button";

export function Modal({ title, children, confirmLabel = "Confirm", danger = false, onConfirm, onClose }: { title: string; children: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm?: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="modal-card">
      <div className="card-header"><h3>{title}</h3><Button variant="ghost" onClick={onClose}>Close</Button></div>
      <div className="modal-body">{children}</div>
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm?.(); onClose(); }}>{confirmLabel}</Button></div>
    </div>
  </div>;
}
