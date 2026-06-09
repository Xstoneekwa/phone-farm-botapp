// BotApp v2 — API Keys & Webhooks

const API_KEYS = [
  { id: 1, name: 'Admin',   env: 'development', scopes: ['profiles:read','profiles:write','devices:read','devices:write','settings:read','settings:write','jobs:read','jobs:write','webhooks:manage'], calls: 1, lastSeen: '23h ago', created: '2026-05-13', color: '#F97316', active: true },
  { id: 2, name: 'Web App', env: 'production',  scopes: ['profiles:read','devices:read','jobs:read','jobs:write','webhooks:read'], calls: 0, lastSeen: '3h ago',  created: '2026-05-14', color: '#6558F5', active: true },
];

const WEBHOOKS = [
  { id: 1, url: 'https://webapp.propulseachieve.com/hooks/botapp', events: ['job.completed','incident.created','device.offline'], status: 'active', lastDelivery: '3h ago', success: true },
  { id: 2, url: 'https://n8n.internal/botapp-trigger',             events: ['incident.created'],                                  status: 'active', lastDelivery: '1h ago', success: true },
];

const RECENT_CALLS = [
  { ts: '17:02:45', source: 'Web App', method: 'POST', path: '/v1/jobs/claim',    status: 200, ms: 142 },
  { ts: '21:27:46', source: 'Admin',   method: 'GET',  path: '/v1/profiles',      status: 200, ms: 88  },
  { ts: '21:27:40', source: 'Admin',   method: 'GET',  path: '/v1/devices',       status: 200, ms: 63  },
  { ts: '18:55:02', source: 'Web App', method: 'POST', path: '/v1/keys/generate', status: 201, ms: 201 },
  { ts: '14:03:11', source: 'Web App', method: 'POST', path: '/v1/profiles/187/stop', status: 200, ms: 95 },
];

const methodColors = { GET: { bg: '#DBEAFE', text: '#1E40AF' }, POST: { bg: '#DCFCE7', text: '#166534' }, DELETE: { bg: '#FEE2E2', text: '#991B1B' }, PATCH: { bg: '#FEF3C7', text: '#92400E' } };

const APIKeysView = () => {
  const [expandedKey, setExpandedKey] = React.useState(null);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [showNewKey, setShowNewKey] = React.useState(false);
  const [visibleKey, setVisibleKey] = React.useState(null);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="API / Webhooks"
        subtitle="Scoped access keys, webhook endpoints, and API audit log"
        badge={<Badge type="enabled" label="Tunnel active" size="xs"/>}
        actions={<>
          <Btn variant="secondary" size="sm" icon="arrowUR" onClick={() => toast.info('Opening API docs…')}>API Docs</Btn>
        </>}
      />

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Endpoint card */}
        <Card pad="14px 16px">
          <SLabel style={{ marginBottom: 10 }}>PUBLIC ENDPOINT</SLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, background: DS.c.input, border: '1px solid #E6E6E4', borderRadius: DS.r.md, padding: '8px 12px', fontFamily: DS.font.mono, fontSize: 13, color: '#0F1117' }}>
              https://mac2.bots.propulseachieve.com/v1
            </div>
            <Btn variant="secondary" size="sm" icon="copy" onClick={() => toast.success('URL copied!')}>Copy</Btn>
            <Btn variant="secondary" size="sm" icon="link" onClick={() => toast.info('Opening API docs…')}>Docs</Btn>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[['Status','Active','#22C55E'],['Version','1.4.0.0',null],['Total keys','2',null],['Port','8765',null]].map(([l,v,c]) => (
              <div key={l}>
                <div style={{ fontSize: 11, color: '#9EA3B0', marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: c || '#0F1117', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Scoped Keys */}
        <Card pad="0" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E6E6E4' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F1117' }}>Scoped API keys</div>
              <div style={{ fontSize: 12, color: '#9EA3B0', marginTop: 2 }}>{API_KEYS.filter(k => k.active).length} active · {API_KEYS.length} total</div>
            </div>
            <Btn variant="primary" size="sm" icon="plus" onClick={() => setShowNewKey(v => !v)}>New key</Btn>
          </div>

          {/* New key form */}
          {showNewKey && (
            <div style={{ padding: '12px 16px', background: '#FAFAF8', borderBottom: '1px solid #E6E6E4', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <SLabel style={{ marginBottom: 6 }}>Key name</SLabel>
                <Input value={newKeyName} onChange={setNewKeyName} placeholder="e.g. Mobile App"/>
              </div>
              <Btn variant="primary" size="md" onClick={() => { toast.success(`Key "${newKeyName || 'New Key'}" created.`); setShowNewKey(false); setNewKeyName(''); }}>Generate</Btn>
              <Btn variant="ghost" size="md" onClick={() => setShowNewKey(false)}>Cancel</Btn>
            </div>
          )}

          {API_KEYS.map(k => (
            <div key={k.id}>
              <div
                onClick={() => setExpandedKey(expandedKey === k.id ? null : k.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #F0F0EE', cursor: 'pointer', transition: 'background 80ms' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 3, height: 38, borderRadius: 2, background: k.color, flexShrink: 0 }}/>
                <Avatar name={k.name} size={28}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1117' }}>{k.name}</span>
                    <Badge type={k.env === 'production' ? 'active' : 'idle'} label={k.env} size="xs"/>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Mono size={12}>ak_live_••••••••••••</Mono>
                    <button onClick={e => { e.stopPropagation(); setVisibleKey(visibleKey === k.id ? null : k.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9EA3B0', padding: 0, display: 'flex' }}>
                      <Ico n={visibleKey === k.id ? 'eyeOff' : 'eye'} size={12}/>
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: '#9EA3B0' }}>
                  <div>{k.calls} calls today</div>
                  <div>Last: {k.lastSeen}</div>
                  <div>{k.scopes.length} scopes</div>
                </div>
                <Ico n={expandedKey === k.id ? 'chevU' : 'chevD'} size={13} color="#9EA3B0"/>
              </div>

              {expandedKey === k.id && (
                <div style={{ padding: '12px 16px 14px', background: '#FAFAF8', borderBottom: '1px solid #F0F0EE' }}>
                  <SLabel style={{ marginBottom: 8 }}>SCOPES</SLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                    {k.scopes.map(s => (
                      <span key={s} style={{ fontSize: 11, fontFamily: DS.font.mono, background: '#fff', border: '1px solid #E6E6E4', borderRadius: DS.r.sm, padding: '2px 7px', color: '#5C6070' }}>{s}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="secondary" size="sm" icon="refresh" onClick={() => toast.success(`Key "${k.name}" rotated.`)}>Rotate</Btn>
                    <Btn variant="secondary" size="sm" icon="copy" onClick={() => toast.success('Key copied to clipboard.')}>Copy key</Btn>
                    <Btn variant="danger" size="sm" onClick={() => toast.error(`Key "${k.name}" revoked.`)} style={{ marginLeft: 'auto' }}>Revoke</Btn>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* Webhooks */}
        <Card pad="0" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E6E6E4' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F1117' }}>Webhooks</div>
              <div style={{ fontSize: 12, color: '#9EA3B0', marginTop: 2 }}>{WEBHOOKS.length} endpoints</div>
            </div>
            <Btn variant="primary" size="sm" icon="plus" onClick={() => toast.info('Add webhook form coming soon.')}>Add webhook</Btn>
          </div>
          {WEBHOOKS.map(w => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #F0F0EE' }}>
              <div style={{ width: 28, height: 28, borderRadius: DS.r.md, background: w.status === 'active' ? '#F0FDF4' : '#F9FAFB', border: '1px solid ' + (w.status === 'active' ? '#BBF7D0' : '#E5E7EB'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ico n="link" size={13} color={w.status === 'active' ? '#16A34A' : '#9EA3B0'}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Mono size={13} color="#0F1117">{w.url}</Mono>
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                  {w.events.map(e => (
                    <span key={e} style={{ fontSize: 10, fontFamily: DS.font.mono, background: '#EDE9FE', color: '#4338CA', padding: '1px 6px', borderRadius: DS.r.sm }}>{e}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#9EA3B0', flexShrink: 0 }}>
                <div>Last: {w.lastDelivery}</div>
                <div style={{ color: w.success ? '#22C55E' : '#DC2626' }}>{w.success ? '✓ 200 OK' : '✕ Failed'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Btn variant="secondary" size="xs" icon="zap" onClick={() => toast.info('Test delivery sent.')}>Test</Btn>
                <Btn variant="danger" size="xs" icon="trash" onClick={() => toast.error('Webhook removed.')}></Btn>
              </div>
            </div>
          ))}
        </Card>

        {/* Recent API calls */}
        <Card pad="0" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #E6E6E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F1117' }}>Recent API calls</div>
              <div style={{ fontSize: 12, color: '#9EA3B0', marginTop: 2 }}>Last 24 hours</div>
            </div>
            <Btn variant="secondary" size="sm" icon="filter">Filter</Btn>
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <Th style={{ width: 90 }}>Time</Th>
                <Th style={{ width: 90 }}>Source</Th>
                <Th style={{ width: 70 }}>Method</Th>
                <Th>Path</Th>
                <Th align="center" style={{ width: 80 }}>Status</Th>
                <Th align="right" style={{ width: 80 }}>Latency</Th>
              </tr>
            </thead>
            <tbody>
              {RECENT_CALLS.map((c, i) => {
                const mc = methodColors[c.method] || methodColors.GET;
                return (
                  <TRow key={i}>
                    <Td><Mono size={12}>{c.ts}</Mono></Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.source === 'Web App' ? '#6558F5' : '#F97316', flexShrink: 0 }}/>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#0F1117' }}>{c.source}</span>
                      </div>
                    </Td>
                    <Td>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: DS.r.sm, fontFamily: DS.font.mono, background: mc.bg, color: mc.text }}>{c.method}</span>
                    </Td>
                    <Td><Mono size={12} color="#5C6070">{c.path}</Mono></Td>
                    <Td align="center">
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: DS.r.sm, background: '#DCFCE7', color: '#166534', fontFamily: DS.font.mono }}>{c.status}</span>
                    </Td>
                    <Td align="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Mono size={12} color={c.ms > 150 ? '#D97706' : '#22C55E'}>{c.ms}ms</Mono>
                    </Td>
                  </TRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};

Object.assign(window, { APIKeysView });
