// BotApp v2 — Overview / Ops Dashboard

const INCIDENTS = [
  { id: 1, type: 'login_failed',       account: 'budgetravaux',           device: 'Phone 5', time: '2m ago',  severity: 'high',   msg: 'Login failed — reauth required' },
  { id: 2, type: 'needs_2fa',          account: 'piece_unique_interiors', device: 'Phone 1', time: '8m ago',  severity: 'high',   msg: '2FA code needed to continue session' },
  { id: 3, type: 'checkpoint',         account: 'ruesalazarmusic',        device: 'Phone 2', time: '14m ago', severity: 'medium', msg: 'Instagram checkpoint triggered' },
  { id: 4, type: 'device_offline',     account: null,                     device: 'Phone 20', time: '1h ago', severity: 'medium', msg: 'Device went offline — last heartbeat 1h ago' },
  { id: 5, type: 'rate_limit',         account: 'gipacor',                device: 'Phone 2', time: '2h ago',  severity: 'low',    msg: 'Follow rate limit hit — paused 4h' },
];

const LIVE_FEED = [
  { id: 1, event: 'profile.started',        subject: 'com_uniti20',            device: 'Phone 1', time: '0:12',  color: '#22C55E' },
  { id: 2, event: 'device.connected',       subject: 'Phone 3',                device: null,      time: '0:34',  color: '#6558F5' },
  { id: 3, event: 'job.completed',          subject: 'braekechristophe',       device: 'Phone 1', time: '1:02',  color: '#0D9488' },
  { id: 4, event: 'session.status_changed', subject: 'kosanola',               device: 'Phone 1', time: '1:45',  color: '#2563EB' },
  { id: 5, event: 'job.claimed',            subject: 'tryba_porto_vecchio',    device: 'Phone 2', time: '2:10',  color: '#0D9488' },
  { id: 6, event: 'profile.stopped',        subject: 'mr_bricolage_bastia',    device: 'Phone 1', time: '3:28',  color: '#D97706' },
  { id: 7, event: 'incident.created',       subject: 'ruesalazarmusic',        device: 'Phone 2', time: '4:14',  color: '#DC2626' },
  { id: 8, event: 'profile.started',        subject: 'demdyno',                device: 'Phone 2', time: '5:01',  color: '#22C55E' },
];

const incidentIcons = {
  login_failed:    'shieldOff',
  needs_2fa:       'shield',
  checkpoint:      'flag',
  device_offline:  'wifiOff',
  rate_limit:      'gauge',
  job_stuck:       'timerOff',
  target_invalid:  'xCircle',
  credentials_missing: 'key',
};

const incidentColors = {
  high:   { icon: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  medium: { icon: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  low:    { icon: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const METRICS = [
  { label: 'Active Profiles', value: '187', sub: 'of 202 total', color: '#6558F5', icon: 'users' },
  { label: 'Devices Online',  value: '41',  sub: '2 offline',    color: '#0D9488', icon: 'smartphone' },
  { label: 'Runs Today',      value: '1,247', sub: '+124 vs yesterday', color: '#2563EB', icon: 'zap' },
  { label: 'Action Required', value: '3',   sub: '2 high priority', color: '#DC2626', icon: 'alertCircle' },
  { label: 'Avg Latency',     value: '142ms', sub: 'API p50',     color: '#D97706', icon: 'gauge' },
];

const Overview = ({ onNav }) => {
  const [dismissed, setDismissed] = React.useState([]);
  const visible = INCIDENTS.filter(i => !dismissed.includes(i.id));

  return (
    <div style={{ flex: 1, overflow: 'auto', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="Overview"
        subtitle="Real-time ops status across all phones and profiles"
        badge={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9EA3B0' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }}/>
            Live
          </span>
        }
      />

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {METRICS.map(m => (
            <Card key={m.label} pad="14px 16px" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SLabel>{m.label}</SLabel>
                <Ico n={m.icon} size={13} color={m.color}/>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#0F1117', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
              <div style={{ fontSize: 11, color: '#9EA3B0' }}>{m.sub}</div>
            </Card>
          ))}
        </div>

        {/* Main 2-col */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Action Required */}
          <Card pad="0" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #E6E6E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F1117' }}>Action Required</div>
                {visible.length > 0 && (
                  <span style={{ background: '#FEE2E2', color: '#991B1B', fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: DS.r.full }}>{visible.length}</span>
                )}
              </div>
              <button onClick={() => onNav && onNav('notifs')} style={{ fontSize: 12, color: '#6558F5', background: 'none', border: 'none', cursor: 'pointer', fontFamily: DS.font.sans }}>
                View all
              </button>
            </div>
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {visible.length === 0 ? (
                <EmptyState icon="checkCircle" title="All clear" message="No actions required right now."/>
              ) : visible.map(inc => {
                const cfg = incidentColors[inc.severity];
                return (
                  <div key={inc.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F3F3F1', alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: DS.r.md, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Ico n={incidentIcons[inc.type] || 'alertCircle'} size={13} color={cfg.icon}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#0F1117' }}>{inc.account || inc.device}</span>
                        <Mono size={10}>{inc.device}</Mono>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9EA3B0' }}>{inc.time}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#5C6070' }}>{inc.msg}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <Btn variant="secondary" size="xs" onClick={() => { toast.success(`Handling ${inc.account || inc.device}...`); }}>
                          {inc.type === 'needs_2fa' ? 'Enter 2FA' : inc.type === 'login_failed' ? 'Reauth' : 'View'}
                        </Btn>
                        <Btn variant="ghost" size="xs" onClick={() => setDismissed(d => [...d, inc.id])}>Dismiss</Btn>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Live Feed */}
          <Card pad="0" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #E6E6E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F1117' }}>Live Feed</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9EA3B0' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'skeletonPulse 2s infinite' }}/>
                Real-time
              </div>
            </div>
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {LIVE_FEED.map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #F3F3F1' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: DS.font.mono, color: ev.color, flexShrink: 0 }}>{ev.event}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#5C6070', marginTop: 1 }}>
                      {ev.subject}{ev.device ? <Mono size={10} color="#9EA3B0"> · {ev.device}</Mono> : null}
                    </div>
                  </div>
                  <Mono size={10}>{ev.time}s ago</Mono>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Platform status */}
        <Card pad="14px 16px">
          <SLabel style={{ marginBottom: 12 }}>Platform status</SLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { platform: 'Instagram', running: 180, idle: 5, error: 2, icon: '🟠' },
              { platform: 'TikTok',    running: 7,   idle: 0, error: 1, icon: '⚫' },
            ].map(p => (
              <div key={p.platform} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid #E6E6E4', borderRadius: DS.r.lg }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1117', marginBottom: 4 }}>{p.platform}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#166534' }}>{p.running} running</span>
                    <span style={{ fontSize: 11, color: '#9EA3B0' }}>{p.idle} idle</span>
                    {p.error > 0 && <span style={{ fontSize: 11, color: '#DC2626' }}>{p.error} errors</span>}
                  </div>
                </div>
              </div>
            ))}
            {/* Quick stats */}
            {[
              { label: 'Total follows today',    val: '4,821' },
              { label: 'Total DMs sent today',   val: '312'   },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 14px', border: '1px solid #E6E6E4', borderRadius: DS.r.lg }}>
                <div style={{ fontSize: 13, color: '#9EA3B0', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0F1117', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

Object.assign(window, { Overview });
