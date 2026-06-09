// BotApp UI Kit — Settings View (platform config)

const SettingsView = () => {
  const [igKey, setIgKey] = React.useState('');
  const [ttKey, setTtKey] = React.useState('');
  const [warmupIG, setWarmupIG] = React.useState(false);
  const [warmupTT, setWarmupTT] = React.useState(false);
  const [injectIG, setInjectIG] = React.useState(false);
  const [restartProfile, setRestartProfile] = React.useState(true);
  const [activeSection, setActiveSection] = React.useState('config');

  const sf = { fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif' };

  const SectionCard = ({ title, icon, keyVal, setKeyVal, warmup, setWarmup, inject, setInject, configCount = 0, filterCount = 0 }) => (
    <div style={{ flex: 1, background: 'white', border: '1px solid #ECECEC', borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #ECECEC' }}>
        {icon}
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1F2328' }}>{title}</span>
      </div>
      {/* Body */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Rapid API Key */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 6 }}>RAPID API KEY</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={keyVal} onChange={e => setKeyVal(e.target.value)}
              placeholder={`Paste ${title} RapidAPI key`}
              style={{ flex: 1, border: '1px solid #E5E7EB', background: '#F7F6F2', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#1F2328' }}
            />
            <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 9999 }}>Empty</span>
          </div>
        </div>

        {/* Config row */}
        <ModuleRow
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
          name="Config" desc="Add, Edit or Delete arguments from config.yml"
          badge={configCount > 0 ? `${configCount} saved` : null} badgeStyle={{ background: '#EDE9FE', color: '#4338CA' }}
          actions={['+ Add', '✏ Edit', '🗑 Delete']}
        />

        {/* WarmUp row */}
        <ModuleRow
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
          name="WarmUp" desc="Set and adjust warmups for accounts"
          toggle={warmup} onToggle={setWarmup}
          actions={['👁 View']}
        />

        {/* Inject & Ignore row */}
        <ModuleRow
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
          name="Inject & Ignore" desc="Override config.yml arguments"
          toggle={inject} onToggle={setInject}
          actions={['⊙ Open']}
        />

        {/* Filter row */}
        <ModuleRow
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>}
          name="Filter" desc="Add, Edit or Delete arguments from filters.yml"
          badge={filterCount > 0 ? `${filterCount} saved` : null} badgeStyle={{ background: '#EDE9FE', color: '#4338CA' }}
          actions={['+ Add', '✏ Edit', '🗑 Delete']}
        />
      </div>
    </div>
  );

  const ModuleRow = ({ icon, name, desc, badge, badgeStyle, toggle, onToggle, actions }) => (
    <div style={{ border: '1px solid #ECECEC', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: actions ? 6 : 0 }}>
        <div style={{ color: '#6B7280', flexShrink: 0, marginTop: 1 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1F2328' }}>{name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{desc}</div>
        </div>
        {badge && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, flexShrink: 0, ...badgeStyle }}>{badge}</span>}
        {onToggle !== undefined && <Toggle on={toggle} onChange={onToggle}/>}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 6, paddingLeft: 21 }}>
          {actions.map(a => (
            <button key={a} style={{ fontSize: 11, fontWeight: 500, background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F7F6F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{a}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#F7F6F2', ...sf }}>
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#1F2328', letterSpacing: '-0.02em' }}>Settings</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3, marginBottom: 20 }}>Platform configuration and system settings.</div>

        {/* Platform cards side by side */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <SectionCard
            title="Instagram"
            icon={<IGIcon size={18}/>}
            keyVal={igKey} setKeyVal={setIgKey}
            warmup={warmupIG} setWarmup={setWarmupIG}
            inject={injectIG} setInject={setInjectIG}
            configCount={22} filterCount={3}
          />
          <SectionCard
            title="TikTok"
            icon={<TTIcon size={18}/>}
            keyVal={ttKey} setKeyVal={setTtKey}
            warmup={warmupTT} setWarmup={setWarmupTT}
            inject={false} setInject={() => {}}
            configCount={0} filterCount={0}
          />
        </div>

        {/* General section */}
        <div style={{ background: 'white', border: '1px solid #ECECEC', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #ECECEC', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1F2328' }}>General</span>
            </div>
            <span style={{ fontSize: 12, color: '#6B7280' }}>System and automation</span>
          </div>
          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { name: 'Timeslot', desc: 'Daily run windows', badge: '15 slots' },
              { name: 'Supabase Setup (Legacy)', desc: 'FetchTodo + Fetch endpoints', badge: 'Enabled', badgeColor: { bg: '#DCFCE7', text: '#166534' } },
              { name: 'Supabase Pull (Legacy)', desc: 'Pull pending todo accounts', badge: 'Idle' },
              { name: 'Restart Profile', desc: 'Auto restart accounts with issues', badge: 'On', badgeColor: { bg: '#DCFCE7', text: '#166534' } },
              { name: 'Last Day Follows', desc: 'Daily-follows red/green threshold', badge: '0 follows' },
              { name: 'Source Setting', desc: 'Set removal of bad targets', badge: '1 rule' },
            ].map(({ name, desc, badge, badgeColor }) => (
              <div key={name} style={{ border: '1px solid #ECECEC', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', transition: 'background 100ms' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F7F6F2'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1F2328' }}>{name}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{desc}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 9999, whiteSpace: 'nowrap', flexShrink: 0, background: badgeColor ? badgeColor.bg : '#F3F4F6', color: badgeColor ? badgeColor.text : '#6B7280' }}>{badge}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SettingsView });
