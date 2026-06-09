// BotApp v2 — DM Templates

const TEMPLATES_DATA = [
  { id: 1, name: 'Intro — Restaurant',  platform: 'ig', lang: 'FR', msg: 'Bonjour {{username}} ! 👋 On adore votre contenu sur la restauration. Vous cherchez à booster votre visibilité Instagram ? On a aidé +120 restaurateurs à doubler leur engagement. Répondez-moi et je vous explique !', sent: 342, replied: 47, rate: 13.7, status: 'active'  },
  { id: 2, name: 'Intro — Brico/Déco',  platform: 'ig', lang: 'FR', msg: "Salut {{username}} ! On travaille avec des pros du bricolage et de la déco pour les aider à trouver de nouveaux clients via Instagram. Votre page a l'air top — on pourrait travailler ensemble ?", sent: 218, replied: 31, rate: 14.2, status: 'active'  },
  { id: 3, name: 'Follow-up #1',        platform: 'ig', lang: 'FR', msg: "Bonjour {{username}}, je me permets de relancer ! Avez-vous eu le temps de voir mon message ? Je serais ravi d'échanger 5 minutes avec vous.", sent: 89,  replied: 12, rate: 13.5, status: 'active'  },
  { id: 4, name: 'Intro EN — Pro',      platform: 'ig', lang: 'EN', msg: "Hey {{username}}! I noticed your page and love what you're doing. We help businesses grow their Instagram organically — would love to share how. Interested?", sent: 56,  replied: 9,  rate: 16.1, status: 'active'  },
  { id: 5, name: 'TikTok — Creator',    platform: 'tt', lang: 'FR', msg: "Salut {{username}} ! Votre contenu TikTok est vraiment sympa. On aide les créateurs à accélérer leur croissance. Vous êtes dispo pour en discuter ?", sent: 28,  replied: 4,  rate: 14.3, status: 'paused' },
  { id: 6, name: 'Cold — Malou plans',  platform: 'ig', lang: 'FR', msg: 'Bonjour, je gère la communication de plusieurs restaurants via Malou. Si vous cherchez à optimiser votre présence en ligne, je connais des solutions efficaces.', sent: 0,   replied: 0,  rate: 0,    status: 'paused' },
];

const DMTemplates = () => {
  const [selected, setSelected] = React.useState(TEMPLATES_DATA[0]);
  const [editMsg, setEditMsg] = React.useState(TEMPLATES_DATA[0].msg);
  const [editName, setEditName] = React.useState(TEMPLATES_DATA[0].name);

  const select = t => { setSelected(t); setEditMsg(t.msg); setEditName(t.name); };

  const rateColor = r => r >= 15 ? '#22C55E' : r >= 10 ? '#D97706' : '#DC2626';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="DM Templates"
        subtitle="Message templates used for automated direct messaging"
        actions={<Btn variant="primary" size="sm" icon="plus">New template</Btn>}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Template list */}
        <div style={{ width: 280, borderRight: '1px solid #E6E6E4', overflow: 'auto', background: '#fff', flexShrink: 0 }}>
          {TEMPLATES_DATA.map(t => (
            <div
              key={t.id}
              onClick={() => select(t)}
              style={{
                padding: '12px 14px', borderBottom: '1px solid #F0F0EE', cursor: 'pointer',
                background: selected?.id === t.id ? '#F5F3FF' : 'transparent',
                borderLeft: selected?.id === t.id ? '3px solid #6558F5' : '3px solid transparent',
                transition: 'background 80ms',
              }}
              onMouseEnter={e => { if (selected?.id !== t.id) e.currentTarget.style.background = '#FAFAF8'; }}
              onMouseLeave={e => { if (selected?.id !== t.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0F1117', lineHeight: 1.2 }}>{t.name}</span>
                <Badge type={t.status} size="xs"/>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: DS.r.full, background: t.platform === 'ig' ? '#FDF2FF' : '#F0F9FF', color: t.platform === 'ig' ? '#9333EA' : '#0369A1', fontWeight: 500 }}>
                  {t.platform === 'ig' ? 'IG' : 'TT'}
                </span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: DS.r.full, background: '#F3F4F6', color: '#6B7280', fontWeight: 500 }}>{t.lang}</span>
                {t.sent > 0 && <span style={{ fontSize: 11, color: rateColor(t.rate), fontWeight: 500, marginLeft: 'auto' }}>{t.rate}% reply</span>}
              </div>
              <div style={{ fontSize: 12, color: '#9EA3B0', marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                {t.msg}
              </div>
            </div>
          ))}
        </div>

        {/* Editor */}
        {selected && (
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            <div style={{ maxWidth: 640 }}>
              {/* Meta */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <SLabel style={{ marginBottom: 6 }}>Template name</SLabel>
                  <Input value={editName} onChange={setEditName} placeholder="Template name"/>
                </div>
                <div>
                  <SLabel style={{ marginBottom: 6 }}>Platform</SLabel>
                  <div style={{ display: 'flex', gap: 4, height: 34, alignItems: 'center' }}>
                    {['ig','tt'].map(p => (
                      <button key={p} style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 500,
                        background: selected.platform === p ? '#EDE9FE' : '#fff',
                        color: selected.platform === p ? '#4338CA' : '#5C6070',
                        border: '1px solid ' + (selected.platform === p ? '#C4B5FD' : '#E6E6E4'),
                        borderRadius: DS.r.md, cursor: 'pointer', fontFamily: DS.font.sans,
                      }}>{p === 'ig' ? 'Instagram' : 'TikTok'}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <SLabel style={{ marginBottom: 6 }}>Language</SLabel>
                  <div style={{ display: 'flex', gap: 4, height: 34, alignItems: 'center' }}>
                    {['FR','EN'].map(l => (
                      <button key={l} style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 500,
                        background: selected.lang === l ? '#EDE9FE' : '#fff',
                        color: selected.lang === l ? '#4338CA' : '#5C6070',
                        border: '1px solid ' + (selected.lang === l ? '#C4B5FD' : '#E6E6E4'),
                        borderRadius: DS.r.md, cursor: 'pointer', fontFamily: DS.font.sans,
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Message editor */}
              <SLabel style={{ marginBottom: 6 }}>Message body</SLabel>
              <div style={{ background: '#fff', border: '1px solid #E6E6E4', borderRadius: DS.r.lg, overflow: 'hidden', marginBottom: 10 }}>
                <textarea
                  value={editMsg} onChange={e => setEditMsg(e.target.value)}
                  style={{
                    width: '100%', minHeight: 140, border: 'none', background: 'transparent',
                    padding: '12px 14px', fontSize: 13, fontFamily: DS.font.sans,
                    color: '#0F1117', resize: 'vertical', outline: 'none', lineHeight: 1.6,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ padding: '8px 14px', borderTop: '1px solid #F0F0EE', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#9EA3B0' }}>{editMsg.length} chars</span>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    {['{{username}}','{{first_name}}','{{business_name}}'].map(v => (
                      <button key={v} onClick={() => setEditMsg(m => m + v)} style={{
                        fontSize: 11, fontFamily: DS.font.mono, background: '#F0F0EE',
                        border: '1px solid #E6E6E4', borderRadius: 4, padding: '2px 6px',
                        cursor: 'pointer', color: '#6558F5',
                      }}>{v}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats + actions */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Sent',          val: selected.sent.toLocaleString() },
                  { label: 'Replied',       val: selected.replied },
                  { label: 'Reply rate',    val: selected.sent > 0 ? selected.rate + '%' : '—', color: selected.sent > 0 ? rateColor(selected.rate) : undefined },
                ].map(({ label, val, color }) => (
                  <Card key={label} pad="10px 14px" style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: color || '#0F1117', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                    <div style={{ fontSize: 11, color: '#9EA3B0', marginTop: 4 }}>{label}</div>
                  </Card>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="primary" size="md" onClick={() => toast.success('Template saved.')}>Save changes</Btn>
                <Btn variant="secondary" size="md" onClick={() => toast.info('Preview sent to your test account.')}>Send preview</Btn>
                <Btn variant="danger" size="md" onClick={() => toast.error('Template deleted.')} style={{ marginLeft: 'auto' }}>Delete</Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { DMTemplates });
