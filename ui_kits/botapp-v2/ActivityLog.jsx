// BotApp v2 — Activity Log

const LOG_EVENTS = [
  { id: 1,  ts: '2026-05-15 23:59:59', level: 'info',    event: 'job.completed',          account: 'mr_bricolage_bastia',    device: 'Phone 1', detail: 'Completed 15F 31L 0DM for slot 17:00–20:00' },
  { id: 2,  ts: '2026-05-15 23:58:12', level: 'info',    event: 'profile.started',         account: 'gipacor',                device: 'Phone 2', detail: 'Session started for slot 14:00–17:00' },
  { id: 3,  ts: '2026-05-15 23:52:44', level: 'warn',    event: 'rate_limit.hit',          account: 'gipacor',                device: 'Phone 2', detail: 'Follow rate limit reached — pausing 4h' },
  { id: 4,  ts: '2026-05-15 22:30:05', level: 'error',   event: 'session.login_failed',    account: 'budgetravaux',           device: 'Phone 1', detail: 'Login rejected — reauth required' },
  { id: 5,  ts: '2026-05-15 21:45:20', level: 'error',   event: 'session.needs_2fa',       account: 'piece_unique_interiors', device: 'Phone 1', detail: '2FA code required to continue' },
  { id: 6,  ts: '2026-05-15 20:01:38', level: 'info',    event: 'job.completed',           account: 'braekechristophe',       device: 'Phone 1', detail: 'Completed 87F 150L 6DM for slot 11:00–14:00' },
  { id: 7,  ts: '2026-05-15 17:00:00', level: 'info',    event: 'profile.batch_started',   account: null,                     device: null,      detail: 'Slot 17:00–20:00 started — 14 profiles' },
  { id: 8,  ts: '2026-05-15 14:10:08', level: 'warn',    event: 'incident.checkpoint',     account: 'ruesalazarmusic',        device: 'Phone 2', detail: 'Instagram checkpoint — user action required' },
  { id: 9,  ts: '2026-05-15 14:00:00', level: 'info',    event: 'profile.batch_started',   account: null,                     device: null,      detail: 'Slot 14:00–17:00 started — 16 profiles' },
  { id: 10, ts: '2026-05-15 12:00:38', level: 'info',    event: 'job.completed',           account: 'kosanola',               device: 'Phone 1', detail: 'Completed 72F 150L 7DM for slot 11:00–14:00' },
  { id: 11, ts: '2026-05-15 11:45:40', level: 'info',    event: 'job.completed',           account: 'piece_unique_interiors', device: 'Phone 1', detail: 'Completed 4F 8L 8DM for slot 08:00–11:00' },
  { id: 12, ts: '2026-05-15 11:00:00', level: 'info',    event: 'profile.batch_started',   account: null,                     device: null,      detail: 'Slot 11:00–14:00 started — 18 profiles' },
  { id: 13, ts: '2026-05-15 08:00:00', level: 'info',    event: 'profile.batch_started',   account: null,                     device: null,      detail: 'Slot 08:00–11:00 started — 12 profiles' },
  { id: 14, ts: '2026-05-15 04:02:11', level: 'info',    event: 'tunnel.connected',        account: null,                     device: null,      detail: 'Cloudflare tunnel reconnected — mac2.bots.propulseachieve.com' },
  { id: 15, ts: '2026-05-15 04:00:00', level: 'info',    event: 'profile.batch_started',   account: null,                     device: null,      detail: 'Slot 04:00–08:00 started — 8 profiles' },
  { id: 16, ts: '2026-05-14 23:59:10', level: 'info',    event: 'job.completed',           account: 'budgetravaux',           device: 'Phone 1', detail: 'Completed 36F 81L 0DM for slot 20:00–00:00' },
  { id: 17, ts: '2026-05-14 22:52:50', level: 'info',    event: 'job.completed',           account: 'demdyno',                device: 'Phone 2', detail: 'Completed 21F 50L 1DM for slot 20:00–00:00' },
  { id: 18, ts: '2026-05-14 20:00:00', level: 'info',    event: 'profile.batch_started',   account: null,                     device: null,      detail: 'Slot 20:00–00:00 started — 22 profiles' },
  { id: 19, ts: '2026-05-14 01:33:44', level: 'debug',   event: 'device.heartbeat',        account: null,                     device: 'Phone 7', detail: 'ADB heartbeat OK — battery 78%' },
  { id: 20, ts: '2026-05-14 00:01:19', level: 'debug',   event: 'api.call',                account: null,                     device: null,      detail: 'POST /v1/profiles → 200 OK in 142ms' },
];

const levelConfig = {
  info:  { color: '#2563EB', bg: '#EFF6FF', label: 'INFO',  icon: 'alertCircle' },
  warn:  { color: '#D97706', bg: '#FFFBEB', label: 'WARN',  icon: 'alertTriangle' },
  error: { color: '#DC2626', bg: '#FEF2F2', label: 'ERROR', icon: 'xCircle' },
  debug: { color: '#9EA3B0', bg: '#F9FAFB', label: 'DEBUG', icon: 'list' },
};

const ActivityLog = () => {
  const [levelFilter, setLevelFilter] = React.useState('all');
  const [q, setQ] = React.useState('');

  const filtered = LOG_EVENTS.filter(ev => {
    if (levelFilter !== 'all' && ev.level !== levelFilter) return false;
    if (q && !ev.event.includes(q) && !(ev.account || '').includes(q) && !ev.detail.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="Activity Log"
        subtitle="Full audit trail of all bot operations, errors, and system events"
        actions={<Btn variant="secondary" size="sm" icon="arrowUR">Export CSV</Btn>}
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid #E6E6E4', background: '#fff', flexShrink: 0 }}>
        <Input value={q} onChange={setQ} placeholder="Search events, accounts…" icon="search" style={{ width: 260 }}/>
        <div style={{ display: 'flex', gap: 2 }}>
          {['all','info','warn','error','debug'].map(l => {
            const cfg = levelConfig[l];
            const active = levelFilter === l;
            return (
              <button key={l} onClick={() => setLevelFilter(l)} style={{
                padding: '4px 10px', fontSize: 12, fontWeight: active ? 500 : 400,
                background: active ? (cfg ? cfg.bg : '#EDE9FE') : 'transparent',
                color: active ? (cfg ? cfg.color : '#4338CA') : '#5C6070',
                border: '1px solid ' + (active ? (cfg ? cfg.color + '40' : '#C4B5FD') : '#E6E6E4'),
                borderRadius: DS.r.md, cursor: 'pointer', fontFamily: DS.font.sans,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{l}</button>
            );
          })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9EA3B0' }}>{filtered.length} events</span>
      </div>

      {/* Log table */}
      <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <Th style={{ width: 160 }}>Timestamp</Th>
              <Th style={{ width: 60 }}>Level</Th>
              <Th style={{ width: 200 }}>Event</Th>
              <Th>Account / Device</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ev => {
              const cfg = levelConfig[ev.level] || levelConfig.info;
              return (
                <TRow key={ev.id}>
                  <Td mono style={{ fontSize: 11 }}>
                    <Mono size={11}>{ev.ts}</Mono>
                  </Td>
                  <Td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 6px', borderRadius: DS.r.sm,
                      background: cfg.bg, color: cfg.color,
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                      fontFamily: DS.font.mono,
                    }}>
                      {cfg.label}
                    </span>
                  </Td>
                  <Td>
                    <Mono size={12} color={cfg.color}>{ev.event}</Mono>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {ev.account && <span style={{ fontSize: 13, fontWeight: 500, color: '#0F1117' }}>{ev.account}</span>}
                      {ev.device && <Mono size={10}>{ev.device}</Mono>}
                      {!ev.account && !ev.device && <span style={{ fontSize: 12, color: '#9EA3B0' }}>—</span>}
                    </div>
                  </Td>
                  <Td style={{ color: '#5C6070', fontSize: 12, maxWidth: 400 }}>{ev.detail}</Td>
                </TRow>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon="list" title="No matching events" message="Try changing the level filter or search term."/>}
      </div>
    </div>
  );
};

Object.assign(window, { ActivityLog });
