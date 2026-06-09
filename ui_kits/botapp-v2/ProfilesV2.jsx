// BotApp v2 — Profiles View

const PROFILES_DATA = [
  { id: 1, name: 'com_uniti20',               platform: 'ig', device: 'Phone 1', slot: 3,  plan: "Com'Uniti",      status: 'running',  F: 55,  UF: 7,  L: 130, DM: 0,  S: 4,  chg: 54,  timeSlot: '00:00–04:00', color: '#F97316', fa2: false },
  { id: 2, name: 'mr_bricolage_bastia',        platform: 'ig', device: 'Phone 1', slot: 7,  plan: "Com'Uniti",      status: 'running',  F: 12,  UF: 39, L: 31,  DM: 0,  S: 0,  chg: 0,   timeSlot: '17:00–20:00', color: '#F97316', fa2: false },
  { id: 3, name: 'piece_unique_interiors',     platform: 'ig', device: 'Phone 1', slot: 2,  plan: 'PRO / Propulse', status: 'error',    F: 4,   UF: 0,  L: 8,   DM: 8,  S: 0,  chg: 93,  timeSlot: '08:00–11:00', color: '#EF4444', fa2: true  },
  { id: 4, name: 'braekechristophe',           platform: 'ig', device: 'Phone 1', slot: 6,  plan: 'PRO / Propulse', status: 'running',  F: 87,  UF: 35, L: 150, DM: 6,  S: 0,  chg: 88,  timeSlot: '11:00–14:00', color: '#F97316', fa2: true  },
  { id: 5, name: 'budgetravaux',               platform: 'ig', device: 'Phone 1', slot: 5,  plan: 'PRO / Propulse', status: 'error',    F: 36,  UF: 0,  L: 81,  DM: 0,  S: 4,  chg: 117, timeSlot: '20:00–00:00', color: '#22C55E', fa2: true  },
  { id: 6, name: 'kosanola',                   platform: 'ig', device: 'Phone 1', slot: 4,  plan: 'PRO / Propulse', status: 'running',  F: 72,  UF: 17, L: 150, DM: 7,  S: 0,  chg: 62,  timeSlot: '14:00–17:00', color: '#F97316', fa2: false },
  { id: 7, name: 'espacehommeceremonie',       platform: 'ig', device: 'Phone 2', slot: 0,  plan: 'Prati PRO',      status: 'running',  F: 59,  UF: 27, L: 134, DM: 2,  S: 0,  chg: 0,   timeSlot: '17:00–20:00', color: '#F97316', fa2: false },
  { id: 8, name: 'tryba_porto_vecchio',        platform: 'ig', device: 'Phone 2', slot: 5,  plan: "Com'Uniti",      status: 'running',  F: 14,  UF: 0,  L: 35,  DM: 4,  S: 0,  chg: 44,  timeSlot: '11:00–14:00', color: '#FDA4AF', fa2: true  },
  { id: 9, name: 'ruesalazarmusic',            platform: 'ig', device: 'Phone 2', slot: 7,  plan: '? / Propulse',   status: 'error',    F: 0,   UF: 0,  L: 0,   DM: 0,  S: 0,  chg: 0,   timeSlot: '00:00–04:00', color: '#EF4444', fa2: false },
  { id:10, name: 'demdyno',                    platform: 'ig', device: 'Phone 2', slot: 1,  plan: 'PRO / Propulse', status: 'idle',     F: 21,  UF: 0,  L: 50,  DM: 1,  S: 0,  chg: 71,  timeSlot: '20:00–00:00', color: '#22C55E', fa2: false },
  { id:11, name: 'gipacor',                    platform: 'ig', device: 'Phone 2', slot: 2,  plan: "Com'Uniti",      status: 'running',  F: 69,  UF: 45, L: 150, DM: 7,  S: 0,  chg: 61,  timeSlot: '14:00–17:00', color: '#22C55E', fa2: false },
  { id:12, name: 'andiamo_osteria_valthoiry',  platform: 'ig', device: 'Phone 3', slot: 0,  plan: 'Malou',          status: 'running',  F: 1,   UF: 0,  L: 2,   DM: 0,  S: 0,  chg: 1,   timeSlot: '17:00–20:00', color: '#F97316', fa2: false },
];

const IGIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ background: 'linear-gradient(135deg,#f58529,#dd2a7b,#8134af)', borderRadius: 4, padding: 2, flexShrink: 0 }}>
    <rect x="2" y="2" width="20" height="20" rx="5"/>
    <circle cx="12" cy="12" r="5"/>
    <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/>
  </svg>
);

const TTIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    style={{ background: '#010101', borderRadius: 4, padding: 3, flexShrink: 0 }}>
    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">♪</text>
  </svg>
);

const ProfilesV2 = () => {
  const [q, setQ] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selected, setSelected] = React.useState([]);
  const [confirm, setConfirm] = React.useState(null);

  const filtered = PROFILES_DATA.filter(p => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.device.toLowerCase().includes(q.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  // Group by device
  const byDevice = filtered.reduce((acc, p) => {
    if (!acc[p.device]) acc[p.device] = [];
    acc[p.device].push(p);
    return acc;
  }, {});

  const toggleSelect = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const allSelected = filtered.length > 0 && filtered.every(p => selected.includes(p.id));
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map(p => p.id));

  const statusColors = { running: '#22C55E', idle: '#9EA3B0', error: '#DC2626', paused: '#D97706' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="Profiles"
        subtitle={`${PROFILES_DATA.length} accounts · ${PROFILES_DATA.filter(p => p.status === 'running').length} running · ${PROFILES_DATA.filter(p => p.status === 'error').length} errors`}
        actions={<>
          <Btn variant="secondary" size="sm" icon="filter">Filter</Btn>
          <Btn variant="primary" size="sm" icon="plus">Add profile</Btn>
        </>}
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid #E6E6E4', background: '#fff', flexShrink: 0 }}>
        <Input value={q} onChange={setQ} placeholder="Search profiles, devices…" icon="search" style={{ width: 240 }}/>
        <div style={{ display: 'flex', gap: 2 }}>
          {['all','running','idle','error'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '4px 10px', fontSize: 12, fontWeight: statusFilter === s ? 500 : 400,
              background: statusFilter === s ? '#EDE9FE' : 'transparent',
              color: statusFilter === s ? '#4338CA' : '#5C6070',
              border: '1px solid ' + (statusFilter === s ? '#C4B5FD' : '#E6E6E4'),
              borderRadius: DS.r.md, cursor: 'pointer', fontFamily: DS.font.sans,
            }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        {selected.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#5C6070' }}>{selected.length} selected</span>
            <Btn variant="secondary" size="sm" onClick={() => { toast.success(`Started ${selected.length} profiles`); setSelected([]); }}>Start</Btn>
            <Btn variant="secondary" size="sm" onClick={() => { toast.info(`Stopped ${selected.length} profiles`); setSelected([]); }}>Stop</Btn>
            <Btn variant="danger" size="sm" onClick={() => setConfirm({ count: selected.length })}>Delete</Btn>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <Th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: '#6558F5' }}/>
              </Th>
              <Th style={{ width: 14 }}></Th>
              <Th>Account</Th>
              <Th>Device</Th>
              <Th>Plan</Th>
              <Th>Time slot</Th>
              <Th align="center">Status</Th>
              <Th align="right">Follows</Th>
              <Th align="right">Likes</Th>
              <Th align="right">DMs</Th>
              <Th align="right" style={{ paddingRight: 16 }}>Δ Today</Th>
              <Th style={{ width: 100 }}>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byDevice).map(([device, profiles]) => (
              <React.Fragment key={device}>
                {/* Group header */}
                <tr style={{ background: '#F7F7F6' }}>
                  <td colSpan={12} style={{ padding: '5px 12px 5px 36px', borderBottom: '1px solid #E6E6E4', borderTop: '1px solid #E6E6E4' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }}/>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0F1117' }}>{device}</span>
                      <Mono size={10}>{profiles[0]?.device}</Mono>
                      <span style={{ fontSize: 11, color: '#9EA3B0' }}>{profiles.length} profiles</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6558F5', fontWeight: 500 }}>
                        {profiles.filter(p => p.status === 'running').length} running
                        {profiles.filter(p => p.status === 'error').length > 0 && <span style={{ color: '#DC2626', marginLeft: 8 }}>{profiles.filter(p => p.status === 'error').length} errors</span>}
                      </span>
                    </div>
                  </td>
                </tr>
                {profiles.map(p => (
                  <TRow key={p.id}>
                    <Td>
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} style={{ accentColor: '#6558F5' }}/>
                    </Td>
                    <Td>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }}/>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {p.platform === 'ig' ? <IGIcon size={14}/> : <TTIcon size={14}/>}
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        {p.fa2 && <Badge type="twofa" size="xs"/>}
                      </div>
                    </Td>
                    <Td><Mono>{p.device}</Mono></Td>
                    <Td style={{ color: '#5C6070' }}>{p.plan}</Td>
                    <Td>
                      <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: DS.r.full, background: '#111213', color: '#fff', fontSize: 11, fontWeight: 500, fontFamily: DS.font.mono, whiteSpace: 'nowrap' }}>
                        {p.timeSlot}
                      </span>
                    </Td>
                    <Td align="center">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[p.status] || '#9EA3B0' }}/>
                        <span style={{ fontSize: 12, color: statusColors[p.status] || '#9EA3B0', fontWeight: 500 }}>{p.status}</span>
                      </div>
                    </Td>
                    <Td align="right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{p.F}</Td>
                    <Td align="right" style={{ fontVariantNumeric: 'tabular-nums', color: '#5C6070' }}>{p.L}</Td>
                    <Td align="right" style={{ fontVariantNumeric: 'tabular-nums', color: '#5C6070' }}>{p.DM}</Td>
                    <Td align="right" style={{ paddingRight: 16 }}>
                      {p.chg > 0
                        ? <span style={{ background: '#CCFBF1', color: '#134E4A', fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: DS.r.full, fontVariantNumeric: 'tabular-nums' }}>+{p.chg}</span>
                        : <span style={{ color: '#9EA3B0', fontSize: 12 }}>0</span>
                      }
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[
                          { icon: p.status === 'running' ? 'pause' : 'play', action: () => toast.info(`${p.status === 'running' ? 'Paused' : 'Started'} ${p.name}`) },
                          { icon: 'edit', action: () => toast.info(`Editing ${p.name}`) },
                          { icon: 'trash', danger: true, action: () => setConfirm({ single: p.name }) },
                        ].map(({ icon, danger, action }, i) => (
                          <button key={i} onClick={action} style={{
                            width: 24, height: 24, borderRadius: DS.r.sm, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid ' + (danger ? '#FECACA' : '#E6E6E4'),
                            background: '#fff', cursor: 'pointer', padding: 0,
                            color: danger ? '#DC2626' : '#5C6070',
                          }}>
                            <Ico n={icon} size={11}/>
                          </button>
                        ))}
                      </div>
                    </Td>
                  </TRow>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon="users" title="No profiles found" message="Try adjusting your search or filter."/>}
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.single ? `Delete ${confirm.single}?` : `Delete ${confirm.count} profiles?`}
          message="This action cannot be undone. All associated data will be permanently removed."
          danger
          onConfirm={() => { toast.success('Deleted.'); setConfirm(null); setSelected([]); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

Object.assign(window, { ProfilesV2 });
