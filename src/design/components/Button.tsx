export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ children, variant = "secondary", onClick, disabled, type = "button" }: { children: React.ReactNode; variant?: ButtonVariant; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
