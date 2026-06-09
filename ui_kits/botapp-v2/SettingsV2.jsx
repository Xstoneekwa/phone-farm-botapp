// BotApp v2 — Settings View

const SettingsV2 = () => {
  const [section, setSection] = React.useState('general');
  const [igKey, setIgKey] = React.useState('');
  const [ttKey, setTtKey] = React.useState('');
  const [warmupIG, setWarmupIG] = React.useState(false);
  const [warmupTT, setWarmupTT] = React.useState(false);
  const [injectIG, setInjectIG] = React.useState(false);
  const [autoTunnel, setAutoTunnel] = React.useState(true);
  const [restartProfile, setRestartProfile] = React.useState(true);
  const [darkMode, setDarkMode] = React.useState(false);
  const [accent, setAccent] = React.useState('#6558F5');
  const [timeslotCount] = React.useState(15);

  const sections = [
    { id: 'general',   label: 'General',         icon: 'settings'   },
    { id: 'instagram', label: 'Instagram',        icon: 'eye'        },
    { id: 'tiktok',    label: 'TikTok',           icon: 'play'       },
    { id: 'appearance',label: 'Appearance',       icon: 'sliders'    },
    { id: 'operators', label: 'Operators',        icon: 'users'      },
    { id: 'advanced',  label: 'Advanced',         icon: 'alertCircle'},
  ];

  const Row = ({ label, desc, right }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F0EE' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0F1117' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: '#9EA3B0', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 24 }}>{right}</div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9EA3B0', marginBottom: 12 }}>{title}</div>
      <div style={{ background: '#fff', border: '1px solid #E6E6E4', borderRadius: DS.r.lg, padding: '0 16px' }}>
        {children}
      </div>
    </div>
  );

  const renderGeneral = () => (
    <>
      <Section title="Bot Automation">
        <Row label="Auto-start tunnel" desc="Restart Cloudflare tunnel automatically when bot launches" right={<Toggle on={autoTunnel} onChange={setAutoTunnel}/>}/>
        <Row label="Restart Profile" desc="Auto-restart accounts with session issues" right={<Toggle on={restartProfile} onChange={setRestartProfile}/>}/>
        <Row label="Time slots" desc="Daily run windows configured" right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge type="active" label={`${timeslotCount} slots`} size="xs"/>
            <Btn variant="secondary" size="xs">Edit</Btn>
          </div>
        }/>
      </Section>
      <Section title="Data">
        <Row label="Supabase Setup (Legacy)" desc="FetchTodo and Fetch endpoints" right={<Badge type="enabled" size="xs"/>}/>
        <Row label="Supabase Pull (Legacy)" desc="Pull pending todo accounts" right={<Badge type="idle" size="xs"/>}/>
        <Row label="Last Day Follows threshold" desc="Red/green threshold for daily follows" right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mono size={12}>0 follows</Mono>
            <Btn variant="secondary" size="xs">Edit</Btn>
          </div>
        }/>
        <Row label="Source Setting" desc="Rules for removing bad follow targets" right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge type="active" label="1 rule" size="xs"/>
            <Btn variant="secondary" size="xs">Edit</Btn>
          </div>
        }/>
      </Section>
    </>
  );

  const renderPlatform = (platform, key, setKey, warmup, setWarmup, inject, setInject) => (
    <>
      <Section title="API credentials">
        <Row label="RapidAPI Key" desc={`${platform} scraping & data key from RapidAPI`} right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input value={key} onChange={setKey} placeholder="Paste key…" style={{ width: 220 }}/>
            {key ? <Badge type="valid" size="xs"/> : <Badge type="idle" label="Empty" size="xs"/>}
          </div>
        }/>
      </Section>
      <Section title="Modules">
        <Row label="Config YAML" desc="Add, edit, or delete arguments from config.yml"
          right={<div style={{ display: 'flex', gap: 5 }}><Btn variant="secondary" size="xs" icon="plus">Add</Btn><Btn variant="secondary" size="xs" icon="edit">Edit</Btn></div>}
        />
        <Row label="WarmUp" desc="Set and adjust account warmup sequences"
          right={<Toggle on={warmup} onChange={setWarmup}/>}
        />
        <Row label="Inject &amp; Ignore" desc="Override config.yml arguments per account"
          right={<Toggle on={inject} onChange={setInject}/>}
        />
        <Row label="Filter Rules" desc="Add, edit, or delete entries in filters.yml"
          right={<div style={{ display: 'flex', gap: 5 }}><Btn variant="secondary" size="xs" icon="plus">Add</Btn><Btn variant="secondary" size="xs" icon="edit">Edit</Btn></div>}
        />
      </Section>
    </>
  );

  const renderAppearance = () => (
    <>
      <Section title="Theme">
        <Row label="Color scheme" desc="Light or dark application theme"
          right={<Toggle on={darkMode} onChange={setDarkMode}/>}
        />
        <Row label="Accent color" desc="Primary action color used throughout the interface"
          right={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['#6558F5','#0D9488','#EA580C','#DC2626','#2563EB'].map(c => (
                <button key={c} onClick={() => setAccent(c)} style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, border: `2px solid ${accent === c ? '#0F1117' : 'transparent'}`,
                  cursor: 'pointer', padding: 0,
                }}/>
              ))}
              <Mono size={12}>{accent}</Mono>
            </div>
          }
        />
        <Row label="Typography" desc="Interface font family"
          right={<div style={{ fontSize: 13, color: '#5C6070' }}>Inter (System UI)</div>}
        />
      </Section>
      <Section title="Layout">
        <Row label="Compact mode" desc="Reduce row heights and padding for dense information" right={<Toggle on={false} onChange={() => toast.info('Compact mode toggled.')}/>}/>
        <Row label="Show profile avatars" desc="Color dot per profile in the table" right={<Toggle on={true} onChange={() => {}}/>}/>
      </Section>
    </>
  );

  const renderOperators = () => (
    <Section title="Operator profiles">
      {[{ name: 'Default', created: '2026-05-13', online: '19h ago', active: true }].map(op => (
        <Row key={op.name}
          label={op.name}
          desc={`Created ${op.created} · Last online ${op.online}`}
          right={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {op.active && <Badge type="active" size="xs"/>}
              <Btn variant="secondary" size="xs" icon="edit">Edit</Btn>
            </div>
          }
        />
      ))}
      <div style={{ padding: '10px 0' }}>
        <Btn variant="primary" size="sm" icon="plus" onClick={() => toast.info('Add operator form…')}>Add operator</Btn>
      </div>
    </Section>
  );

  const renderAdvanced = () => (
    <>
      <Section title="API Server">
        <Row label="Port" desc="Local port the API server listens on" right={<Mono size={13} color="#0F1117">8765</Mono>}/>
        <Row label="Bind address" right={<Mono size={13} color="#0F1117">127.0.0.1</Mono>}/>
        <Row label="Rate limit" desc="Max requests per second per agent" right={<Mono size={13} color="#0F1117">5 req/s</Mono>}/>
        <Row label="Audit log retention" right={<Mono size={13} color="#0F1117">90 days</Mono>}/>
      </Section>
      <Section title="Danger Zone">
        <Row label="Reset all settings" desc="Restore factory defaults — cannot be undone"
          right={<Btn variant="danger" size="sm" onClick={() => toast.error('Settings reset.')}>Reset</Btn>}
        />
        <Row label="Clear activity log" desc="Delete all log entries permanently"
          right={<Btn variant="danger" size="sm" onClick={() => toast.error('Log cleared.')}>Clear log</Btn>}
        />
      </Section>
    </>
  );

  const renderContent = () => {
    switch (section) {
      case 'general':    return renderGeneral();
      case 'instagram':  return renderPlatform('Instagram', igKey, setIgKey, warmupIG, setWarmupIG, injectIG, setInjectIG);
      case 'tiktok':     return renderPlatform('TikTok',    ttKey, setTtKey, warmupTT, setWarmupTT, false, () => {});
      case 'appearance': return renderAppearance();
      case 'operators':  return renderOperators();
      case 'advanced':   return renderAdvanced();
      default:           return null;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      {/* Section nav */}
      <div style={{ width: 180, borderRight: '1px solid #E6E6E4', background: '#fff', padding: '12px 8px', flexShrink: 0, overflow: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9EA3B0', padding: '4px 8px', marginBottom: 4 }}>Settings</div>
        {sections.map(s => (
          <div key={s.id} onClick={() => setSection(s.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 8px', borderRadius: DS.r.md, cursor: 'pointer',
            background: section === s.id ? '#EDE9FE' : 'transparent',
            color: section === s.id ? '#4338CA' : '#5C6070',
            transition: 'background 80ms',
          }}
            onMouseEnter={e => { if (section !== s.id) e.currentTarget.style.background = '#F7F7F5'; }}
            onMouseLeave={e => { if (section !== s.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <Ico n={s.icon} size={13}/>
            <span style={{ fontSize: 13, fontWeight: section === s.id ? 500 : 400 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0F1117', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {sections.find(s => s.id === section)?.label}
          </div>
          <div style={{ fontSize: 13, color: '#9EA3B0', marginBottom: 20 }}>
            {section === 'general'    && 'System behaviour, automation rules, and data integrations.'}
            {section === 'instagram'  && 'Instagram bot configuration, API credentials, and warmup settings.'}
            {section === 'tiktok'     && 'TikTok bot configuration, API credentials, and warmup settings.'}
            {section === 'appearance' && 'Theme, colors, typography, and layout preferences.'}
            {section === 'operators'  && 'Manage operators and their saved preferences.'}
            {section === 'advanced'   && 'API server settings and maintenance actions.'}
          </div>
          {renderContent()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Btn variant="secondary" size="md">Cancel</Btn>
            <Btn variant="primary" size="md" onClick={() => toast.success('Settings saved.')}>Save changes</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SettingsV2 });
