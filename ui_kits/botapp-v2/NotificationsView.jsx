// BotApp v2 — Notifications / Incidents View

const NOTIFS_DATA = [
  { id: 1,  type: 'login_failed',    account: 'budgetravaux',           device: 'Phone 1', time: '2m ago',   severity: 'high',   read: false, msg: 'Login failed — reauth required. The session was rejected by Instagram.' },
  { id: 2,  type: 'needs_2fa',       account: 'piece_unique_interiors', device: 'Phone 1', time: '8m ago',   severity: 'high',   read: false, msg: '2FA code required. The account needs a verification code to continue.' },
  { id: 3,  type: 'checkpoint',      account: 'ruesalazarmusic',        device: 'Phone 2', time: '14m ago',  severity: 'medium', read: false, msg: 'Instagram checkpoint triggered. Manual action required to unlock.' },
  { id: 4,  type: 'device_offline',  account: null,                     device: 'Phone 20',time: '1h ago',   severity: 'medium', read: false, msg: 'Device Phone 20 went offline. Last heartbeat received 1 hour ago.' },
  { id: 5,  type: 'rate_limit',      account: 'gipacor',                device: 'Phone 2', time: '2h ago',   severity: 'low',    read: true,  msg: 'Follow rate limit hit — session paused for 4 hours automatically.' },
  { id: 6,  type: 'job_completed',   account: 'braekechristophe',       device: 'Phone 1', time: '3h ago',   severity: 'info',   read: true,  msg: 'Slot 11:00–14:00 completed: 87 follows, 150 likes, 6 DMs.' },
  { id: 7,  type: 'tunnel_down',     account: null,                     device: null,      time: '4h ago',   severity: 'high',   read: true,  msg: 'Cloudflare tunnel disconnected. API was unreachable for 2 minutes.' },
  { id: 8,  type: 'job_completed',   account: 'kosanola',               device: 'Phone 1', time: '5h ago',   severity: 'info',   read: true,  msg: 'Slot 14:00–17:00 completed: 72 follows, 150 likes, 7 DMs.' },
  { id: 9,  type: 'target_invalid',  account: 'com_uniti20',            device: 'Phone 1', time: '6h ago',   severity: 'low',    read: true,  msg: '12 targets removed automatically — quality score below threshold.' },
  { id: 10, type: 'api_key_expiring',account: null,                     device: null,      time: '1d ago',   severity: 'medium', read: true,  msg: 'API key "Web App" expires in 7 days. Rotate before expiry.' },
];

const typeIcons = {
  login_failed:   'shieldOff',
  needs_2fa:      'shield',
  checkpoint:     'flag',
  device_offline: 'wifiOff',
  rate_limit:     'gauge',
  job_completed:  'checkCircle',
  tunnel_down:    'globe',
  target_invalid: 'xCircle',
  api_key_expiring:'key',
};

const sevCfg = {
  high:   { icon: '#DC2626', bg: '#FEF2F2', border: '#FECACA', badge: 'error'   },
  medium: { icon: '#D97706', bg: '#FFFBEB', border: '#FDE68A', badge: 'paused'  },
  low:    { icon: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', badge: 'idle'    },
  info:   { icon: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', badge: 'active'  },
};

const NotificationsView = () => {
  const [notifs, setNotifs] = React.useState(NOTIFS_DATA);
  const [filter, setFilter] = React.useState('all');

  const unread = notifs.filter(n => !n.read).length;
  const markRead = id => setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllRead = () => setNotifs(ns => ns.map(n => ({ ...n, read: true })));
  const dismiss = id => setNotifs(ns => ns.filter(n => n.id !== id));

  const filtered = notifs.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'high')   return n.severity === 'high';
    if (filter === 'info')   return n.severity === 'info';
    return true;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="Notifications"
        subtitle="Incidents, alerts, and system events requiring your attention"
        badge={unread > 0 ? <span style={{ background: '#FEE2E2', color: '#991B1B', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: DS.r.full }}>{unread} unread</span> : null}
        actions={
          unread > 0
            ? <Btn variant="secondary" size="sm" onClick={markAllRead}>Mark all read</Btn>
            : null
        }
      />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '10px 24px', borderBottom: '1px solid #E6E6E4', background: '#fff', flexShrink: 0 }}>
        {[
          { id: 'all',    label: 'All',    count: notifs.length },
          { id: 'unread', label: 'Unread', count: unread },
          { id: 'high',   label: 'High priority', count: notifs.filter(n => n.severity === 'high').length },
          { id: 'info',   label: 'Info',   count: notifs.filter(n => n.severity === 'info').length },
        ].map(({ id, label, count }) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', fontSize: 13, fontWeight: filter === id ? 500 : 400,
            background: filter === id ? '#EDE9FE' : 'transparent',
            color: filter === id ? '#4338CA' : '#5C6070',
            border: '1px solid ' + (filter === id ? '#C4B5FD' : '#E6E6E4'),
            borderRadius: DS.r.md, cursor: 'pointer', fontFamily: DS.font.sans,
          }}>
            {label}
            {count > 0 && <span style={{ fontSize: 10, fontWeight: 600, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: filter === id ? '#C4B5FD' : '#F0F0EE', color: filter === id ? '#4338CA' : '#9EA3B0', padding: '0 4px' }}>{count}</span>}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 && <EmptyState icon="bell" title="All clear" message="No notifications in this category."/>}
        {filtered.map(n => {
          const cfg = sevCfg[n.severity];
          return (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              style={{
                display: 'flex', gap: 14, padding: '14px 24px',
                borderBottom: '1px solid #F0F0EE',
                background: n.read ? '#fff' : '#FAFAF8',
                cursor: 'pointer', transition: 'background 80ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F7F7F5'}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? '#fff' : '#FAFAF8'}
            >
              {/* Unread dot */}
              <div style={{ width: 8, display: 'flex', alignItems: 'flex-start', paddingTop: 6, flexShrink: 0 }}>
                {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6558F5' }}/>}
              </div>

              {/* Icon */}
              <div style={{
                width: 34, height: 34, borderRadius: DS.r.lg, flexShrink: 0, marginTop: 1,
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Ico n={typeIcons[n.type] || 'alertCircle'} size={15} color={cfg.icon}/>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: '#0F1117' }}>
                    {n.account || n.device || 'System'}
                  </span>
                  {n.device && n.account && <Mono size={10}>{n.device}</Mono>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9EA3B0', flexShrink: 0 }}>{n.time}</span>
                </div>
                <div style={{ fontSize: 13, color: '#5C6070', lineHeight: 1.5 }}>{n.msg}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {n.severity === 'high' && n.type === 'needs_2fa' && (
                    <Btn variant="primary" size="xs" onClick={e => { e.stopPropagation(); toast.success('2FA prompt sent to your phone'); }}>Enter 2FA code</Btn>
                  )}
                  {n.severity === 'high' && n.type === 'login_failed' && (
                    <Btn variant="primary" size="xs" onClick={e => { e.stopPropagation(); toast.success('Opening reauth for ' + n.account); }}>Reauth account</Btn>
                  )}
                  {n.type === 'checkpoint' && (
                    <Btn variant="secondary" size="xs" onClick={e => { e.stopPropagation(); toast.info('Opening device view…'); }}>Open device</Btn>
                  )}
                  {n.type === 'api_key_expiring' && (
                    <Btn variant="secondary" size="xs" onClick={e => { e.stopPropagation(); toast.info('Opening API keys…'); }}>Rotate key</Btn>
                  )}
                  <Btn variant="ghost" size="xs" onClick={e => { e.stopPropagation(); dismiss(n.id); }}>Dismiss</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { NotificationsView });
