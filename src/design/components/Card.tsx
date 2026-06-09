export function Card({ children, title, subtitle, actions }: { children: React.ReactNode; title?: string; subtitle?: string; actions?: React.ReactNode }) {
  return <section className="card">
    {(title || actions) ? <div className="card-header"><div>{title ? <h3>{title}</h3> : null}{subtitle ? <p>{subtitle}</p> : null}</div>{actions}</div> : null}
    {children}
  </section>;
}
