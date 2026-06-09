// BotApp v2 — Devices View

const DEVICES_DATA = [
  { id: 'R39M10F3EHW', name: 'Phone 1',  profiles: 6, status: 'connected',    battery: 87, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'R39M207FC0E', name: 'Phone 2',  profiles: 5, status: 'connected',    battery: 72, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'R39M20CCJZF', name: 'Phone 3',  profiles: 5, status: 'connected',    battery: 64, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'R39M20DYZ2Y', name: 'Phone 4',  profiles: 0, status: 'connected',    battery: 91, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'R39M302X07V', name: 'Phone 5',  profiles: 6, status: 'connected',    battery: 55, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'R39M305GBBH', name: 'Phone 6',  profiles: 6, status: 'connected',    battery: 43, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'R39M3OE4KEP', name: 'Phone 7',  profiles: 6, status: 'connected',    battery: 78, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'R39M3OJVKZM', name: 'Phone 8',  profiles: 6, status: 'connected',    battery: 62, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'R39M30KTWVF', name: 'Phone 9',  profiles: 6, status: 'connected',    battery: 33, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'R39M30N5LPX', name: 'Phone 10', profiles: 6, status: 'connected',    battery: 89, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'R39M30TF32Y', name: 'Phone 11', profiles: 5, status: 'connected',    battery: 70, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'RF8M21NFS1F', name: 'Phone 12', profiles: 5, status: 'connected',    battery: 48, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'RF8M3002WTL', name: 'Phone 13', profiles: 6, status: 'connected',    battery: 95, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'RF8M30JR2YL', name: 'Phone 14', profiles: 6, status: 'connected',    battery: 82, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'RF8M31Q7NPM', name: 'Phone 15', profiles: 6, status: 'connected',    battery: 67, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'RF8M92AX8NN', name: 'Phone 16', profiles: 6, status: 'connected',    battery: 59, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'RF8M92PHQNB', name: 'Phone 17', profiles: 5, status: 'connected',    battery: 76, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'RF8N3197PPK', name: 'Phone 18', profiles: 5, status: 'connected',    battery: 41, android: '11', model: 'Samsung Galaxy A32' },
  { id: 'RF8N319KMDY', name: 'Phone 19', profiles: 6, status: 'connected',    battery: 85, android: '12', model: 'Samsung Galaxy A52' },
  { id: 'RF8N51E475F', name: 'Phone 20', profiles: 0, status: 'disconnected', battery: 0,  android: '11', model: 'Samsung Galaxy A32' },
  { id: 'tkduwoa6mnhakf9d', name: 'INACTIVE', profiles: 0, status: 'disconnected', battery: 0, android: '?', model: 'Unknown' },
  { id: 'ukusjrpnhicawczl', name: 'MOVE',     profiles: 0, status: 'disconnected', battery: 0, android: '?', model: 'Unknown' },
];

const BatteryBar = ({ level }) => {
  const color = level > 50 ? '#22C55E' : level > 20 ? '#D97706' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 28, height: 12, borderRadius: 3, border: '1.5px solid #D1D5DB', position: 'relative', display: 'flex', alignItems: 'center', padding: '2px' }}>
        <div style={{ width: `${Math.max(0, level)}%`, height: '100%', borderRadius: 1, background: color, transition: 'width 300ms' }}/>
        <div style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 3, height: 6, background: '#D1D5DB', borderRadius: '0 1px 1px 0' }}/>
      </div>
      <span style={{ fontSize: 11, color: color, fontVariantNumeric: 'tabular-nums', fontFamily: DS.font.mono }}>{level}%</span>
    </div>
  );
};

const DevicesV2 = () => {
  const [view, setView] = React.useState('grid');
  const [q, setQ] = React.useState('');

  const connected    = DEVICES_DATA.filter(d => d.status === 'connected');
  const disconnected = DEVICES_DATA.filter(d => d.status === 'disconnected');

  const filtered = DEVICES_DATA.filter(d => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.id.toLowerCase().includes(q.toLowerCase()));

  const DeviceCard = ({ d }) => {
    const ok = d.status === 'connected';
    return (
      <div style={{
        background: '#fff', border: '1px solid #E6E6E4', borderRadius: DS.r.lg,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        opacity: ok ? 1 : 0.65,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: ok ? '#5C6070' : '#D1D5DB' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2"/>
                <circle cx="12" cy="17" r="1" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: ok ? '#0F1117' : '#9EA3B0' }}>{d.name}</div>
              <Mono size={10}>{d.id}</Mono>
            </div>
          </div>
          <Badge type={ok ? 'connected' : 'disconnected'} size="xs"/>
        </div>

        {ok && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9EA3B0' }}>{d.profiles} profiles</span>
              <BatteryBar level={d.battery}/>
            </div>
            <div style={{ fontSize: 11, color: '#9EA3B0' }}>{d.model} · Android {d.android}</div>
          </>
        )}

        <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
          <Btn variant="secondary" size="xs" icon="refresh" onClick={() => toast.info(`Refreshing ${d.name}…`)}>Refresh</Btn>
          {ok && <Btn variant="secondary" size="xs" icon="eye" onClick={() => toast.info(`Opening ${d.name}…`)}>View</Btn>}
          {!ok && <Btn variant="ghost" size="xs" onClick={() => toast.info(`Reconnecting ${d.name}…`)}>Reconnect</Btn>}
        </div>
      </div>
    );
  };

  const DeviceRow = ({ d }) => {
    const ok = d.status === 'connected';
    return (
      <TRow>
        <Td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ok ? '#5C6070' : '#D1D5DB'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"/>
              <circle cx="12" cy="17" r="1" fill="currentColor"/>
            </svg>
            <span style={{ fontWeight: 500, color: ok ? '#0F1117' : '#9EA3B0' }}>{d.name}</span>
          </div>
        </Td>
        <Td mono><Mono>{d.id}</Mono></Td>
        <Td><Badge type={ok ? 'connected' : 'disconnected'} size="xs"/></Td>
        <Td align="center" style={{ fontVariantNumeric: 'tabular-nums' }}>{d.profiles > 0 ? d.profiles : '—'}</Td>
        <Td>{ok ? <BatteryBar level={d.battery}/> : '—'}</Td>
        <Td style={{ color: '#5C6070', fontSize: 12 }}>{d.model}</Td>
        <Td style={{ color: '#9EA3B0', fontSize: 12 }}>Android {d.android}</Td>
        <Td>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" size="xs" icon="refresh" onClick={() => toast.info(`Refreshing ${d.name}…`)}></Btn>
            {ok && <Btn variant="secondary" size="xs" icon="eye" onClick={() => toast.info(`Viewing ${d.name}…`)}></Btn>}
            <Btn variant="danger" size="xs" icon="trash" onClick={() => toast.error(`Removed ${d.name}`)}></Btn>
          </div>
        </Td>
      </TRow>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="Devices"
        subtitle={`${DEVICES_DATA.length} total · ${connected.length} online · ${disconnected.length} offline`}
        actions={<>
          <div style={{ display: 'flex', gap: 2, border: '1px solid #E6E6E4', borderRadius: DS.r.md, overflow: 'hidden', background: '#fff' }}>
            {[['grid','package'],['list','list']].map(([v, icon]) => (
              <button key={v} onClick={() => setView(v)} style={{
                width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: view === v ? '#EDE9FE' : 'transparent', border: 'none',
                color: view === v ? '#6558F5' : '#9EA3B0', cursor: 'pointer',
              }}>
                <Ico n={icon} size={13}/>
              </button>
            ))}
          </div>
          <Btn variant="primary" size="sm" icon="plus">Add device</Btn>
        </>}
      />

      <div style={{ padding: '10px 24px', borderBottom: '1px solid #E6E6E4', background: '#fff', flexShrink: 0 }}>
        <Input value={q} onChange={setQ} placeholder="Search by name or serial…" icon="search" style={{ width: 260 }}/>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: view === 'grid' ? '16px 24px' : 0 }}>
        {view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {filtered.map(d => <DeviceCard key={d.id} d={d}/>)}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>Serial</Th>
                <Th>Status</Th>
                <Th align="center">Profiles</Th>
                <Th>Battery</Th>
                <Th>Model</Th>
                <Th>OS</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>{filtered.map(d => <DeviceRow key={d.id} d={d}/>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { DevicesV2 });
