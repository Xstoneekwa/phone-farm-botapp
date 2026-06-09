// BotApp UI Kit — Profiles View (main phone farm table)

const PROFILE_COLORS = {
  orange: '#F97316', green: '#22C55E', red: '#EF4444',
  amber: '#F59E0B', purple: '#A855F7', blue: '#3B82F6',
};

const FAKE_PHONES = [
  {
    id: 'Phone 1', serial: 'R39M10F3EHW', status: 'active', profileCount: 6,
    profiles: [
      { name: 'com_uniti20',            color: '#F97316', slot: 3,  fa2: false, plan: "Com'Uniti",     email: '',           lastRun: '04:00:00 2026-05-15', timeSlot: '00:00–04:00', F:55,  UF:7,  L:130, DM:0, S:4,  change:54,  session:0  },
      { name: 'mr_bricolage_bastia',    color: '#F97316', slot: 7,  fa2: false, plan: "Com'Uniti",     email: 'P26C4/P34C3…', lastRun: '23:59:59 2026-05-15', timeSlot: '17:00–20:00', F:12,  UF:39, L:31,  DM:0, S:0,  change:0,   session:8  },
      { name: 'piece_unique_interiors', color: '#F97316', slot: 2,  fa2: true,  plan: 'PRO / Propulse', email: '',           lastRun: '11:45:40 2026-05-15', timeSlot: '08:00–11:00', F:4,   UF:0,  L:8,   DM:8, S:0,  change:93,  session:61 },
      { name: 'braekechristophe',       color: '#F97316', slot: 6,  fa2: true,  plan: 'PRO / Propulse', email: '',           lastRun: '12:00:38 2026-05-15', timeSlot: '11:00–14:00', F:87,  UF:35, L:150, DM:6, S:0,  change:88,  session:0  },
      { name: 'budgetravaux',           color: '#22C55E', slot: 5,  fa2: true,  plan: 'PRO / Propulse', email: '',           lastRun: '00:00:09 2026-05-13', timeSlot: '20:00–00:00', F:36,  UF:0,  L:81,  DM:0, S:4,  change:117, session:15 },
      { name: 'kosanola',               color: '#F97316', slot: 4,  fa2: false, plan: 'PRO / Propulse', email: '',           lastRun: '23:59:59 2026-05-15', timeSlot: '14:00–17:00', F:72,  UF:17, L:150, DM:7, S:0,  change:62,  session:26 },
    ]
  },
  {
    id: 'Phone 2', serial: 'R39M207FC0E', status: 'active', profileCount: 5,
    profiles: [
      { name: 'espacehommeceremonie',   color: '#F97316', slot: 0,  fa2: false, plan: 'Prati PRO / Propulse', email: 'de 6/ besoin de ct /P3…', lastRun: '23:59:59 2026-05-15', timeSlot: '17:00–20:00', F:59,  UF:27, L:134, DM:2, S:0,  change:0,   session:7  },
      { name: 'tryba_porto_vecchio',    color: '#FDA4AF', slot: 5,  fa2: true,  plan: "Com'Uniti",     email: 'P31C3/',     lastRun: '14:00:20 2026-05-15', timeSlot: '11:00–14:00', F:14,  UF:0,  L:35,  DM:4, S:0,  change:44,  session:21 },
      { name: 'ruesalazarmusic',        color: '#EF4444', slot: 7,  fa2: false, plan: '? / Propulse',  email: 'MDP LANCEMENT : N…', lastRun: '03:51:15 2026-05-15', timeSlot: '00:00–04:00', F:0,   UF:0,  L:0,   DM:0, S:0,  change:0,   session:0  },
      { name: 'demdyno',                color: '#22C55E', slot: 1,  fa2: false, plan: 'PRO / Propulse', email: '',           lastRun: '22:52:50 2026-05-12', timeSlot: '20:00–00:00', F:21,  UF:0,  L:50,  DM:1, S:0,  change:71,  session:25 },
      { name: 'gipacor',                color: '#22C55E', slot: 2,  fa2: false, plan: "Com'Uniti",     email: '',           lastRun: '23:59:59 2026-05-15', timeSlot: '14:00–17:00', F:69,  UF:45, L:150, DM:7, S:0,  change:61,  session:86 },
    ]
  },
  {
    id: 'Phone 3', serial: 'R39M20CCJZF', status: 'active', profileCount: 5,
    profiles: [
      { name: 'andiamo_osteria_valthoiry', color: '#F97316', slot: 0, fa2: false, plan: 'Malou', email: 'de 2/ besoin de ct', lastRun: '23:59:59 2026-05-15', timeSlot: '17:00–20:00', F:1, UF:0, L:2, DM:0, S:0, change:1, session:0 },
    ]
  },
];

const ProfilesView = () => {
  const [phones] = React.useState(FAKE_PHONES);

  const containerStyle = {
    flex: 1, overflow: 'auto', background: '#F7F6F2',
    fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
  };

  const PhoneGroup = ({ phone }) => (
    <div style={{ marginBottom: 0 }}>
      {/* Phone header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 16px',
        background: '#F7F6F2',
        borderBottom: '1px solid #ECECEC',
        borderTop: '1px solid #ECECEC',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }}/>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1F2328' }}>{phone.id}</span>
        <span style={{ fontSize: 11, fontFamily: '"DM Mono", monospace', color: '#9CA3AF' }}>{phone.serial}</span>
        <StatusBadge type="active" label="active" dot={false}/>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: '#6558F5', fontWeight: 500 }}>{phone.profileCount} profiles</span>
        <span style={{ fontSize: 11, color: '#6B7280' }}>{phone.profileCount} normal · 0 dual · 0 other</span>
        <IC d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" size={14} color="#9CA3AF"/>
      </div>

      {/* Profile rows */}
      <div style={{ background: 'white' }}>
        {phone.profiles.map((p, i) => (
          <ProfileRow key={p.name} profile={p} isLast={i === phone.profiles.length - 1}/>
        ))}
      </div>
    </div>
  );

  const ProfileRow = ({ profile: p, isLast }) => {
    const [emailVal, setEmailVal] = React.useState(p.email);
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '0 12px 0 16px',
        height: 42,
        borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
        fontSize: 13,
        transition: 'background 100ms',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Color dot */}
        <div style={{ width: 16, flexShrink: 0 }}>
          <ProfileDot color={p.color}/>
        </div>

        {/* Username */}
        <div style={{ width: 170, fontWeight: 500, color: '#1F2328', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {p.name}
        </div>

        {/* Platform */}
        <div style={{ width: 22, flexShrink: 0 }}>
          <IGIcon size={16}/>
        </div>

        {/* Slot */}
        <div style={{ width: 28, fontSize: 11, color: '#9CA3AF', flexShrink: 0, textAlign: 'center' }}>
          {p.slot > 0 ? `#${p.slot}` : '–'}
        </div>

        {/* 2FA */}
        <div style={{ width: 28, flexShrink: 0 }}>
          {p.fa2 && <span style={{ fontSize: 9, fontWeight: 600, background: '#F0F0EB', color: '#6B7280', padding: '1px 4px', borderRadius: 3 }}>2FA</span>}
        </div>

        {/* Plan */}
        <div style={{ width: 130, fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {p.plan}
        </div>

        {/* Email */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={emailVal} onChange={e => setEmailVal(e.target.value)}
            placeholder="Email here"
            style={{
              width: '100%', border: '1px solid #ECECEC', background: '#F7F6F2',
              borderRadius: 4, padding: '3px 7px', fontSize: 12,
              fontFamily: 'inherit', color: '#6B7280', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Last run */}
        <div style={{ width: 90, fontSize: 11, fontFamily: '"DM Mono", monospace', color: '#9CA3AF', flexShrink: 0, marginLeft: 8, textAlign: 'right' }}>
          {p.lastRun.split(' ')[0]}
        </div>

        {/* Time slot pill */}
        <div style={{ width: 104, marginLeft: 8, flexShrink: 0 }}>
          <TimePill slot={p.timeSlot}/>
        </div>

        {/* Stats */}
        <div style={{ width: 200, fontSize: 11, color: '#6B7280', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8, whiteSpace: 'nowrap' }}>
          {p.F} F · {p.UF} UF · {p.L} L · {p.DM} DM{p.S > 0 ? ` · ${p.S} Stories` : ''}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 6, flexShrink: 0, width: 80 }}>
          <ChangeBadge value={p.change}/>
          <ChangeBadge value={p.session}/>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 6, flexShrink: 0 }}>
          {[
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>,
            <path d="M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z"/>,
            <path d="M5 3l14 9-14 9V3z"/>,
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>,
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>,
          ].map((icon, i) => (
            <button key={i} style={{ width: 23, height: 23, borderRadius: 4, border: '1px solid #E5E7EB', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', padding: 0 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
            </button>
          ))}
          <button style={{ width: 23, height: 23, borderRadius: 4, border: '1px solid #FECACA', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#EF4444', padding: 0 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={containerStyle}>
      {phones.map(phone => <PhoneGroup key={phone.id} phone={phone}/>)}
    </div>
  );
};

Object.assign(window, { ProfilesView });
