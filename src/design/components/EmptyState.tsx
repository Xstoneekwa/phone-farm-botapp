export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong><span>{message}</span>{action}</div>;
}
