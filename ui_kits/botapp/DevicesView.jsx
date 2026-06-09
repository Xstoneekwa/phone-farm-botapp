// BotApp UI Kit — Devices View

const ALL_DEVICES = [
  { id: 'INACTIVE',  serial: 'tkduwoa6mnhakf9d', profiles: 0,  status: 'disconnected' },
  { id: 'MOVE',      serial: 'ukusjrpnhicawczl', profiles: 0,  status: 'disconnected' },
  { id: 'Phone 1',   serial: 'R39M10F3EHW',      profiles: 6,  status: 'connected' },
  { id: 'Phone 2',   serial: 'R39M207FC0E',       profiles: 5,  status: 'connected' },
  { id: 'Phone 3',   serial: 'R39M20CCJZF',       profiles: 5,  status: 'connected' },
  { id: 'Phone 4',   serial: 'R39M20DYZ2Y',       profiles: 0,  status: 'connected' },
  { id: 'Phone 5',   serial: 'R39M302X07V',       profiles: 6,  status: 'connected' },
  { id: 'Phone 6',   serial: 'R39M305GBBH',       profiles: 6,  status: 'connected' },
  { id: 'Phone 7',   serial: 'R39M3OE4KEP',       profiles: 6,  status: 'connected' },
  { id: 'Phone 8',   serial: 'R39M3OJVKZM',       profiles: 6,  status: 'connected' },
  { id: 'Phone 9',   serial: 'R39M30KTWVF',       profiles: 6,  status: 'connected' },
  { id: 'Phone 10',  serial: 'R39M30N5LPX',       profiles: 6,  status: 'connected' },
  { id: 'Phone 11',  serial: 'R39M30TF32Y',       profiles: 5,  status: 'connected' },
  { id: 'Phone 12',  serial: 'RF8M21NFS1F',       profiles: 5,  status: 'connected' },
  { id: 'Phone 13',  serial: 'RF8M3002WTL',       profiles: 6,  status: 'connected' },
  { id: 'Phone 14',  serial: 'RF8M30JR2YL',       profiles: 6,  status: 'connected' },
  { id: 'Phone 15',  serial: 'RF8M31Q7NPM',       profiles: 6,  status: 'connected' },
  { id: 'Phone 16',  serial: 'RF8M92AX8NN',       profiles: 6,  status: 'connected' },
  { id: 'Phone 17',  serial: 'RF8M92PHQNB',       profiles: 5,  status: 'connected' },
  { id: 'Phone 18',  serial: 'RF8N3197PPK',        profiles: 5,  status: 'connected' },
  { id: 'Phone 19',  serial: 'RF8N319KMDY',        profiles: 6,  status: 'connected' },
  { id: 'Phone 20',  serial: 'RF8N51E475F',        profiles: 0,  status: 'disconnected' },
  { id: 'No Device', serial: 'null',               profiles: 0,  status: 'disconnected' },
];

const DevicesView = () => {
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const total = ALL_DEVICES.length;
  const active = ALL_DEVICES.filter(d => d.status === 'connected').length;
  const offline = ALL_DEVICES.filter(d => d.status === 'disconnected').length;

  const devStyle = {
    flex: 1, overflow: 'auto', background: '#F7F6F2',
    fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
    padding: 0,
  };

  const DeviceCard = ({ device }) => {
    const connected = device.status === 'connected';
    const inactive = device.id === 'INACTIVE' || device.id === 'MOVE' || device.id === 'No Device';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px',
        background: 'white',
        border: '1px solid #ECECEC',
        borderRadius: 6,
        boxSizing: 'border-box',
      }}>
        {/* Device icon */}
        <div style={{ color: inactive ? '#D1D5DB' : '#9CA3AF', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={inactive ? 1.2 : 1.5} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={inactive ? '3 2' : undefined}>
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <circle cx="12" cy="17" r="1" fill="currentColor"/>
          </svg>
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: inactive ? '#9CA3AF' : '#1F2328', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{device.id}</div>
          <div style={{ fontSize: 10, fontFamily: '"DM Mono", monospace', color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{device.serial}</div>
        </div>
        {/* Profile count */}
        {device.profiles > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            {device.profiles}
          </div>
        )}
        {/* Status */}
        <StatusBadge type={connected ? 'connected' : 'disconnected'} label={connected ? 'Connected' : 'Disconnected'}/>
        {/* Refresh */}
        <button style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #E5E7EB', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9CA3AF', padding: 0, flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div style={devStyle}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #ECECEC', background: '#F7F6F2', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#1F2328', letterSpacing: '-0.02em' }}>Devices</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>{total} saved · {active} active · {offline} offline</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="primary" size="sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </Btn>
        </div>
      </div>

      {/* Grid + Action panel */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Device grid */}
        <div style={{ flex: 1, padding: '16px 16px 16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignContent: 'start' }}>
          {ALL_DEVICES.map(d => <DeviceCard key={d.id + d.serial} device={d}/>)}
        </div>

        {/* Action panel */}
        <div style={{ width: 180, padding: '16px 16px 16px 0', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
          {[
            { label: 'Open All',    icon: <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/> },
            { label: 'Close All',   icon: <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/> },
            { label: 'Restart All', icon: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></> },
            { label: 'History',     icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
            { label: 'Edit',        icon: <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/> },
          ].map(({ label, icon }) => (
            <button key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13, color: '#1F2328', fontFamily: 'inherit', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              {label}
            </button>
          ))}
          <div style={{ width: '100%', height: 1, background: '#ECECEC', margin: '4px 0' }}/>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13, color: '#EF4444', fontFamily: 'inherit', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
            Delete
          </button>
          <div style={{ marginTop: 8, fontSize: 11, color: '#9CA3AF', padding: '0 10px' }}>{total} devices saved</div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { DevicesView });
