export function Input({ value, onChange, placeholder, mono = false }: { value: string; onChange?: (value: string) => void; placeholder?: string; mono?: boolean }) {
  return <input className={`input ${mono ? "mono" : ""}`} value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />;
}
