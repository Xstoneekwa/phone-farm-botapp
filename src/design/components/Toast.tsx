export type ToastItem = { id: number; tone: "success" | "error" | "info"; message: string };
export function Toasts({ items }: { items: ToastItem[] }) {
  return <div className="toasts">{items.map((toast) => <div key={toast.id} className={`toast toast-${toast.tone}`}>{toast.message}</div>)}</div>;
}
