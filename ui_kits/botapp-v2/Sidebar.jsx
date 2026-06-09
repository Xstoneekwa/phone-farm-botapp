// BotApp v2 — Sidebar Navigation

const SidebarV2 = ({ active, onNav, counts = {} }) => {
  const sStyle = {
    width: 220, minWidth: 220,
    background: DS.c.sidebar,
    display: 'flex', flexDirection: 'column',
    height: '100vh', overflow: 'hidden',
    fontFamily: DS.font.sans, userSelect: 'none',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  };

  const groups = [
    {
      items: [
        { id: 'overview',    label: 'Overview',      icon: 'home' },
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'profiles',    label: 'Profiles',      icon: 'users',      badge: counts.profiles },
        { id: 'devices',     label: 'Devices',       icon: 'smartphone', badge: counts.devices },
        { id: 'targets',     label: 'Targets',       icon: 'target' },
        { id: 'dms',         label: 'DM Templates',  icon: 'message' },
      ]
    },
    {
      label: 'Monitoring',
      items: [
        { id: 'activity',    label: 'Activity Log',  icon: 'list' },
        { id: 'notifs',      label: 'Notifications', icon: 'bell',       badge: counts.notifs },
      ]
    },
    {
      label: 'Admin',
      items: [
        { id: 'api',         label: 'API / Webhooks', icon: 'key' },
        { id: 'settings',    label: 'Settings',       icon: 'settings' },
      ]
    },
  ];

  const NavItem = ({ item }) => {
    const isActive = active === item.id;
    return (
      <div
        onClick={() => onNav(item.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '6px 10px', borderRadius: DS.r.md, margin: '1px 6px',
          cursor: 'pointer', transition: 'background 80ms',
          background: isActive ? 'rgba(255,255,255,0.11)' : 'transparent',
          color: isActive ? '#FFFFFF' : '#7A8090',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = DS.c.sidebarHover; e.currentTarget.style.color = '#B0B8C8'; }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7A8090'; } }}
      >
        <Ico n={item.icon} size={14} color="currentColor" sw={isActive ? 2 : 1.75}/>
        <span style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, flex: 1, lineHeight: 1 }}>
          {item.label}
        </span>
        {item.badge > 0 && (
          <span style={{
            minWidth: 18, height: 18, borderRadius: 9,
            background: isActive ? '#6558F5' : 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 10, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px',
          }}>
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={sStyle}>
      {/* Brand */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 9, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: 'linear-gradient(135deg,#FF6B35,#E8445A,#6558F5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1" fill="white" stroke="none"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>BotApp</div>
          <div style={{ fontSize: 10, color: '#5A6070', marginTop: 2 }}>Phone Farm OS</div>
        </div>
        {/* live dot */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }}/>
          <span style={{ fontSize: 10, color: '#4A5060' }}>Live</span>
        </div>
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            {group.label && (
              <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#3A4050' }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => <NavItem key={item.id} item={item}/>)}
          </div>
        ))}
      </div>

      {/* Bottom: stats strip */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 12px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          {[
            { label: 'Profiles', val: '187', color: '#22C55E' },
            { label: 'Devices',  val: '41',  color: '#6558F5' },
            { label: 'Incidents',val: '3',   color: '#F87171' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
              <div style={{ fontSize: 9, color: '#3A4050', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            </div>
          ))}
        </div>
        {/* Operator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderRadius: DS.r.md, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = DS.c.sidebarHover}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <Avatar name="Default" size={24}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#C8CDD8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Default</div>
            <div style={{ fontSize: 10, color: '#3A4050' }}>Operator</div>
          </div>
          <Ico n="settings" size={12} color="#3A4050" sw={1.5}/>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SidebarV2 });
