// BotApp UI Kit — API Gateway View

const APIView = () => {
  const sf = { fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif' };
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const InfoRow = ({ label, value, badge, mono }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {badge && <StatusBadge type={badge} label={badge.charAt(0).toUpperCase() + badge.slice(1)}/>}
        {value && <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2328', fontFamily: mono ? '"DM Mono", monospace' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{value}</span>}
      </div>
    </div>
  );

  const CheckRow = ({ label, done }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: done ? '#F0FDF4' : '#F9FAFB', borderRadius: 5, marginBottom: 4 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={done ? '#22C55E' : '#9CA3AF'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {done ? <polyline points="20 6 9 17 4 12"/> : <circle cx="12" cy="12" r="8"/>}
      </svg>
      <span style={{ fontSize: 13, color: done ? '#166534' : '#6B7280' }}>{label}</span>
    </div>
  );

  const ScopedKey = ({ name, env, scopes, lastSeen, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ width: 3, height: 36, borderRadius: 2, background: color, flexShrink: 0 }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2328' }}>{name}</div>
        <div style={{ fontSize: 11, fontFamily: '"DM Mono", monospace', color: '#9CA3AF', marginTop: 1 }}>ak_live_****</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: '#6B7280' }}>0 calls today</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{env} · {scopes} scopes</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>Last seen {lastSeen}</div>
      </div>
      <button style={{ fontSize: 12, fontWeight: 500, background: 'white', border: '1px solid #FECACA', color: '#EF4444', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>Revoke</button>
    </div>
  );

  const ApiCallRow = ({ time, source, method, path, status }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13 }}>
      <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#6B7280', width: 60, flexShrink: 0 }}>{time}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, width: 80, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: source === 'Web App' ? '#6558F5' : '#F97316', flexShrink: 0 }}/>
        <span style={{ fontSize: 12, color: '#1F2328', fontWeight: 500 }}>{source}</span>
      </span>
      <span style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{method}</span>
      <span style={{ flex: 1, fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#6B7280' }}>{path}</span>
      <span style={{ background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>{status}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#F7F6F2', ...sf }}>
      <div style={{ padding: '20px 24px 0' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1F2328', letterSpacing: '-0.02em' }}>API Gateway</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>Public access, scoped keys, webhooks, and audit for the stable external API.</div>
          </div>
          <StatusBadge type="tunnelActive" label="Tunnel active"/>
        </div>

        {/* Row 1: Status + Today + Endpoint */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
          {/* API Connection */}
          <Card>
            <SectionLabel style={{ marginBottom: 10 }}>API CONNECTION</SectionLabel>
            <InfoRow label="Status"        badge="active"/>
            <InfoRow label="Version"       value="1.4.0.0"/>
            <InfoRow label="Profiles"      value="202"/>
            <InfoRow label="Devices"       value="43"/>
            <InfoRow label="Port"          value="8765" mono/>
            <InfoRow label="Last call"     value="3h ago"/>
            <InfoRow label="Public tunnel" badge="running"/>
            <div style={{ marginTop: 10 }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6558F5', fontSize: 12, fontFamily: 'inherit', padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                API Docs
              </button>
            </div>
          </Card>

          {/* Today */}
          <Card>
            <SectionLabel style={{ marginBottom: 10 }}>TODAY</SectionLabel>
            {[['Calls','1'],['Errors','0'],['Active keys','2'],['Avg latency','—']].map(([l,v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{l}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2328', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </Card>

          {/* Endpoint */}
          <Card>
            <SectionLabel style={{ marginBottom: 10 }}>ENDPOINT</SectionLabel>
            <div style={{ background: '#F7F6F2', border: '1px solid #E5E7EB', borderRadius: 5, padding: '8px 12px', fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#1F2328', marginBottom: 8 }}>
              https://mac2.bots.propulseachieve.com/v1
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Public via Cloudflare Tunnel. The web app backend calls this /v1 base URL with a scoped bearer key.</div>
            <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', color: '#1F2328', fontSize: 12, fontFamily: 'inherit' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
          </Card>
        </div>

        {/* Row 2: Checklist + Integration Helper */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2328', marginBottom: 4 }}>Connection checklist</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>What needs to be true before the web app backend calls this Mac.</div>
            <CheckRow label="Cloudflare tunnel configured" done/>
            <CheckRow label="Tunnel process running" done/>
            <CheckRow label="/v1 ready" done/>
            <CheckRow label="2 active scoped keys" done/>
            <CheckRow label="Latest external request: none yet" done={false}/>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6558F5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1F2328' }}>Integration helper</span>
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Use server-to-server calls from the web app backend, never browser JavaScript.</div>
            <SectionLabel style={{ marginBottom: 4 }}>PUBLIC API BASE</SectionLabel>
            <div style={{ background: '#F7F6F2', border: '1px solid #E5E7EB', borderRadius: 4, padding: '5px 10px', fontFamily: '"DM Mono", monospace', fontSize: 12, marginBottom: 8 }}>https://mac2.bots.propulseachieve.com/v1</div>
            <SectionLabel style={{ marginBottom: 4 }}>OPENAPI</SectionLabel>
            <div style={{ background: '#F7F6F2', border: '1px solid #E5E7EB', borderRadius: 4, padding: '5px 10px', fontFamily: '"DM Mono", monospace', fontSize: 12, marginBottom: 8 }}>https://mac2.bots.propulseachieve.com/openapi.json</div>
            <div style={{ background: '#1A1A2E', borderRadius: 6, padding: '10px 12px', fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#E2E8F0', lineHeight: 1.6 }}>
              <div>curl -H "Authorization: Bearer &lt;api-key&gt;" \</div>
              <div>  -H "X-External-User-Id: client_123" \</div>
              <div>  https://mac2.bots.propulseachieve.com/v1/profiles</div>
            </div>
          </Card>
        </div>

        {/* Recent API Calls */}
        <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #ECECEC' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2328' }}>Recent API calls</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Showing 1–2 of 2 from the last 24h</div>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #E5E7EB', background: 'white', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: '#1F2328' }}>
              Filter: All
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          <ApiCallRow time="17:02:45" source="Web App" method="POST" path="/api/keys/generate" status="201"/>
          <ApiCallRow time="21:27:46" source="Admin"   method="POST" path="/api/keys/generate" status="201"/>
        </div>

        {/* Scoped API Keys */}
        <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #ECECEC' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2328' }}>Scoped API keys</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>2 active · 2 total</div>
            </div>
            <Btn variant="primary" size="sm">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              API key
            </Btn>
          </div>
          <ScopedKey name="Admin"   env="development" scopes={9}  lastSeen="23h ago" color="#F97316"/>
          <ScopedKey name="Web App" env="production"  scopes={9}  lastSeen="3h ago"  color="#6558F5"/>
        </div>

        {/* Server Settings (Advanced) */}
        <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)', transition: '150ms' }}><path d="M6 9l6 6 6-6"/></svg>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2328' }}>Server settings (advanced)</span>
          </button>
          {showAdvanced && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid #F3F4F6', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12 }}>
              {[['Port','8765'],['Bind address','127.0.0.1'],['Rate limit (req/s per agent)','5'],['Audit retention (days)','90']].map(([l,v]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#6B7280', width: 160 }}>{l}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2328', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              ))}
              <div style={{ gridColumn: '1/-1', fontSize: 12, color: '#EF4444', marginTop: 4 }}>Changing the port restarts the API server. In-flight requests will be cancelled.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { APIView });
