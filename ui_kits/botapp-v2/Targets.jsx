// BotApp v2 — Targets View

const TARGETS_DATA = [
  { id: 1, handle: '@restaurant_paris',     source: 'Hashtag: #restaurant',     quality: 92, followers: 4820,  status: 'valid',   platform: 'ig', used: 14 },
  { id: 2, handle: '@bricolage_france',     source: 'Hashtag: #bricolage',      quality: 88, followers: 12300, status: 'valid',   platform: 'ig', used: 8  },
  { id: 3, handle: '@deco_interieur_paris', source: 'User list: interior_fr',    quality: 76, followers: 3400,  status: 'valid',   platform: 'ig', used: 22 },
  { id: 4, handle: '@fitness_coach_lyon',   source: 'Hashtag: #coach',          quality: 45, followers: 890,   status: 'review',  platform: 'ig', used: 0  },
  { id: 5, handle: '@mode_streetwear_fr',   source: 'Competitor: @h_et_m',      quality: 81, followers: 7200,  status: 'valid',   platform: 'ig', used: 5  },
  { id: 6, handle: '@spam_bot_12345',       source: 'Hashtag: #follow4follow',  quality: 12, followers: 101,   status: 'invalid', platform: 'ig', used: 0  },
  { id: 7, handle: '@chef_cuisine_sud',     source: 'Location: Marseille',      quality: 71, followers: 2100,  status: 'valid',   platform: 'ig', used: 3  },
  { id: 8, handle: '@tiktok_chef_videos',   source: 'Hashtag: #foodtiktok',     quality: 84, followers: 89400, status: 'valid',   platform: 'tt', used: 1  },
  { id: 9, handle: '@renouveau_deco',       source: 'User list: deco_fr',       quality: 68, followers: 1560,  status: 'valid',   platform: 'ig', used: 9  },
  { id: 10, handle: '@business_growth_fr', source: 'Hashtag: #croissance',     quality: 55, followers: 4100,  status: 'review',  platform: 'ig', used: 0  },
];

const QualityBar = ({ score }) => {
  const color = score >= 70 ? '#22C55E' : score >= 40 ? '#D97706' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 6, background: '#F0F0EE', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }}/>
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
    </div>
  );
};

const Targets = () => {
  const [q, setQ] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newTarget, setNewTarget] = React.useState('');

  const filtered = TARGETS_DATA.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (q && !t.handle.toLowerCase().includes(q.toLowerCase()) && !t.source.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DS.c.canvas, fontFamily: DS.font.sans }}>
      <PageHdr
        title="Targets"
        subtitle={`${TARGETS_DATA.length} targets · ${TARGETS_DATA.filter(t => t.status === 'valid').length} valid · ${TARGETS_DATA.filter(t => t.status === 'review').length} pending review`}
        actions={<>
          <Btn variant="secondary" size="sm" icon="arrowUR">Export</Btn>
          <Btn variant="primary" size="sm" icon="plus" onClick={() => setShowAddForm(true)}>Add targets</Btn>
        </>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid #E6E6E4', background: '#fff', flexShrink: 0 }}>
        <Input value={q} onChange={setQ} placeholder="Search by handle or source…" icon="search" style={{ width: 260 }}/>
        <div style={{ display: 'flex', gap: 2 }}>
          {['all','valid','review','invalid'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '4px 10px', fontSize: 12, fontWeight: statusFilter === s ? 500 : 400,
              background: statusFilter === s ? '#EDE9FE' : 'transparent',
              color: statusFilter === s ? '#4338CA' : '#5C6070',
              border: '1px solid ' + (statusFilter === s ? '#C4B5FD' : '#E6E6E4'),
              borderRadius: DS.r.md, cursor: 'pointer', fontFamily: DS.font.sans,
            }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Add targets form */}
      {showAddForm && (
        <div style={{ margin: '16px 24px 0', background: '#fff', border: '1px solid #E6E6E4', borderRadius: DS.r.lg, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1117', marginBottom: 10 }}>Add targets</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <SLabel style={{ marginBottom: 6 }}>Handles or hashtags (comma-separated)</SLabel>
              <Input value={newTarget} onChange={setNewTarget} placeholder="@restaurant_paris, #cuisine, location:Lyon" style={{ width: '100%' }}/>
            </div>
            <Btn variant="primary" size="md" onClick={() => { toast.success('Targets added for validation.'); setShowAddForm(false); setNewTarget(''); }}>Validate & add</Btn>
            <Btn variant="ghost" size="md" onClick={() => setShowAddForm(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <Th>Handle</Th>
              <Th>Source</Th>
              <Th>Platform</Th>
              <Th align="right">Followers</Th>
              <Th>Quality</Th>
              <Th align="center">Status</Th>
              <Th align="right">Times used</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <TRow key={t.id}>
                <Td><span style={{ fontWeight: 500, color: '#0F1117' }}>{t.handle}</span></Td>
                <Td style={{ color: '#5C6070', fontSize: 12 }}>{t.source}</Td>
                <Td>
                  {t.platform === 'ig'
                    ? <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: DS.r.full, background: 'linear-gradient(135deg,#f58529,#dd2a7b)', color: '#fff' }}>Instagram</span>
                    : <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: DS.r.full, background: '#010101', color: '#fff' }}>TikTok</span>
                  }
                </Td>
                <Td align="right" style={{ fontVariantNumeric: 'tabular-nums', color: '#5C6070' }}>
                  {t.followers.toLocaleString()}
                </Td>
                <Td><QualityBar score={t.quality}/></Td>
                <Td align="center"><Badge type={t.status} size="xs"/></Td>
                <Td align="right" style={{ fontVariantNumeric: 'tabular-nums', color: t.used > 0 ? '#0F1117' : '#9EA3B0', fontWeight: t.used > 0 ? 500 : 400 }}>{t.used}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {t.status === 'review' && <Btn variant="secondary" size="xs" onClick={() => toast.success(`Approved ${t.handle}`)}>Approve</Btn>}
                    <Btn variant="danger" size="xs" icon="trash" onClick={() => toast.error(`Removed ${t.handle}`)}></Btn>
                  </div>
                </Td>
              </TRow>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon="target" title="No targets found" message="Add targets using hashtags, handles, or locations."/>}
      </div>
    </div>
  );
};

Object.assign(window, { Targets });
