// BotApp UI Kit — Sidebar Nav Rail

const Sidebar = ({ active, onNav }) => {
  const sidebarStyle = {
    width: 36, minWidth: 36,
    background: '#16181B',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 0',
    gap: 2,
    height: '100vh',
    boxSizing: 'border-box',
    userSelect: 'none',
  };

  const navItems = [
    { id: 'profiles', icon: 'users',      title: 'Profiles' },
    { id: 'devices',  icon: 'smartphone', title: 'Devices' },
    { id: 'bin',      icon: 'trash',      title: 'Bin' },
  ];

  const bottomItems = [
    { id: 'settings', icon: 'settings', title: 'Settings' },
    { id: 'account',  icon: 'user',     title: 'Account' },
  ];

  const iconPaths = {
    users:      [['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'],['M23 21v-2a4 4 0 0 0-3-3.87'],['M16 3.13a4 4 0 0 1 0 7.75'],['M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z']],
    smartphone: [['M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z'],['M12 18h.01']],
    trash:      [['M3 6h18'],['M19 6l-1 14H6L5 6'],['M10 11v6M14 11v6'],['M9 6V4h6v2']],
    settings:   [['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']],
    user:       [['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'],['M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z']],
  };

  const NavIcon = ({ id, paths }) => {
    const isActive = active === id;
    return (
      <div
        onClick={() => onNav(id)}
        title={id}
        style={{
          width: 28, height: 28, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
          color: isActive ? '#FFFFFF' : '#6B7280',
          transition: 'background 100ms, color 100ms',
        }}
        onMouseEnter={e => {
          if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#A0A8B8'; }
        }}
        onMouseLeave={e => {
          if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280'; }
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          {paths.map((d, i) => <path key={i} d={d[0]}/>)}
        </svg>
      </div>
    );
  };

  return (
    <div style={sidebarStyle}>
      {/* App Icon */}
      <div style={{
        width: 22, height: 22, borderRadius: 6, marginBottom: 6,
        background: 'linear-gradient(135deg,#FF6B35,#E8445A,#6558F5)',
        flexShrink: 0,
      }}/>

      {/* Nav items */}
      {navItems.map(item => (
        <NavIcon key={item.id} id={item.id} paths={iconPaths[item.icon]}/>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }}/>

      {/* Bottom items */}
      {bottomItems.map(item => (
        <NavIcon key={item.id} id={item.id} paths={iconPaths[item.icon]}/>
      ))}
    </div>
  );
};

Object.assign(window, { Sidebar });
