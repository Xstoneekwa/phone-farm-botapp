export function Input({ value, onChange, placeholder, mono = false, readOnly = false }: { value: string; onChange?: (value: string) => void; placeholder?: string; mono?: boolean; readOnly?: boolean }) {
  return <input className={`input ${mono ? "mono" : ""}`} value={value} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />;
}
