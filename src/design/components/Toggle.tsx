export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }) {
  return <button className={`toggle ${checked ? "toggle-on" : ""}`} disabled={disabled} onClick={() => onChange?.(!checked)} aria-pressed={checked}><span /></button>;
}
