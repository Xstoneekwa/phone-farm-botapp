export function Input({ value, onChange, placeholder, mono = false, readOnly = false, type = "text" }: { value: string; onChange?: (value: string) => void; placeholder?: string; mono?: boolean; readOnly?: boolean; type?: "text" | "password" | "url" }) {
  return <input className={`input ${mono ? "mono" : ""}`} type={type} value={value} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />;
}
