export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "secondary",
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ""}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
