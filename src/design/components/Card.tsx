export function Card({ children, title, subtitle, actions, id }: { children: React.ReactNode; title?: string; subtitle?: string; actions?: React.ReactNode; id?: string }) {
  return <section id={id} className="card">
    {(title || actions) ? <div className="card-header"><div>{title ? <h3>{title}</h3> : null}{subtitle ? <p>{subtitle}</p> : null}</div>{actions}</div> : null}
    {children}
  </section>;
}
