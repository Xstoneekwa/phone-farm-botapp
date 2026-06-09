export function Table({ children }: { children: React.ReactNode }) { return <div className="table-wrap"><table>{children}</table></div>; }
export function Th({ children }: { children: React.ReactNode }) { return <th>{children}</th>; }
export function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <td className={mono ? "mono" : undefined}>{children}</td>; }
export function TRow({ children }: { children: React.ReactNode }) { return <tr>{children}</tr>; }
