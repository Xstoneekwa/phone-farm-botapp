// BotApp UI Kit — Shared Components
// Export all to window so other script tags can use them.

const IC = ({ d, d2, d3, size = 15, sw = 1.75, color = 'currentColor', fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p,i) => <path key={i} d={p}/>) : <path d={d}/>}
    {d2 && <path d={d2}/>}
    {d3 && <path d={d3}/>}
  </svg>
);

const IconCircle = ({ d, size = 15, sw = 1.75, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d={d}/>
  </svg>
);

// ── Icon paths ──────────────────────────────────────────
const ICONS = {
  message:   ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  users:     ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75'],
  usersCirc: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z','M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'],
  phone:     ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'],
  smartphone:['M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z','M12 18h.01'],
  trash:     ['M3 6h18','M19 6l-1 14H6L5 6','M10 11v6M14 11v6','M9 6V4h6v2'],
  settings:  ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  user:      ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2','M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  edit:      ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7','M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  copy:      ['M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z'],
  play:      ['M5 3l14 9-14 9V3z'],
  skip:      ['M5 4l10 8-10 8V4z','M19 4v16'],
  gear:      ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  filter:    ['M22 3H2l8 9.46V19l4 2v-8.54L22 3z'],
  archive:   ['M21 8v13H3V8','M1 3h22v5H1z','M10 12h4'],
  refresh:   ['M23 4v6h-6','M20.49 15a9 9 0 1 1-2.12-9.36L23 10'],
  globe:     ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20','M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  link:      ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71','M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  key:       ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
  zap:       ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  eye:       ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  eyeOff:    ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24','M1 1l22 22'],
  plus:      ['M12 5v14M5 12h14'],
  chevronR:  ['M9 18l6-6-6-6'],
  chevronD:  ['M6 9l6 6 6-6'],
  check:     ['M20 6L9 17l-5-5'],
  x:         ['M18 6L6 18M6 6l12 12'],
  search:    ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z','M21 21l-4.35-4.35'],
  stop:      [],
};

// ── Status Badge ──────────────────────────────────────────
const StatusBadge = ({ type, label, dot = true }) => {
  const configs = {
    connected:    { bg: '#DCFCE7', text: '#166534', dotColor: '#22C55E' },
    disconnected: { bg: '#FEE2E2', text: '#991B1B', dotColor: '#F87171' },
    active:       { bg: '#DCFCE7', text: '#166534', dotColor: '#22C55E' },
    running:      { bg: '#DCFCE7', text: '#166534', dotColor: '#22C55E' },
    empty:        { bg: '#FEF3C7', text: '#92400E', dotColor: null },
    idle:         { bg: '#F3F4F6', text: '#6B7280', dotColor: null },
    enabled:      { bg: '#DCFCE7', text: '#166534', dotColor: null },
    tunnelActive: { bg: '#DCFCE7', text: '#166534', dotColor: '#22C55E' },
  };
  const cfg = configs[type] || configs.idle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 9999,
      background: cfg.bg, color: cfg.text,
      fontSize: 11, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap',
    }}>
      {dot && cfg.dotColor && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dotColor, flexShrink: 0 }}/>
      )}
      {label}
    </span>
  );
};

// ── Time Pill ──────────────────────────────────────────
const TimePill = ({ slot }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 10px', borderRadius: 9999,
    background: '#1F2328', color: '#FFFFFF',
    fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.01em', whiteSpace: 'nowrap',
  }}>
    {slot}
  </span>
);

// ── Change Badge ──────────────────────────────────────────
const ChangeBadge = ({ value }) => {
  const isZero = value === 0 || value === '0';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 9999,
      background: isZero ? '#F3F4F6' : '#CCFBF1',
      color: isZero ? '#6B7280' : '#134E4A',
      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {isZero ? '0' : `+${value} ↑`}
    </span>
  );
};

// ── Instagram Icon ─────────────────────────────────────────
const IGIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ background: 'linear-gradient(135deg,#f58529,#dd2a7b,#8134af)', borderRadius: 4, padding: 2, flexShrink: 0 }}>
    <rect x="2" y="2" width="20" height="20" rx="5"/>
    <circle cx="12" cy="12" r="5"/>
    <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/>
  </svg>
);

// ── TikTok Icon ─────────────────────────────────────────
const TTIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    style={{ background: '#010101', borderRadius: 4, padding: 3, flexShrink: 0 }}>
    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">♪</text>
  </svg>
);

// ── Section Label ──────────────────────────────────────────
const SectionLabel = ({ children, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#6B7280',
    ...style,
  }}>
    {children}
  </div>
);

// ── Card ──────────────────────────────────────────
const Card = ({ children, style, noPad }) => (
  <div style={{
    background: 'white',
    border: '1px solid #ECECEC',
    borderRadius: 8,
    padding: noPad ? 0 : '14px 16px',
    overflow: 'hidden',
    ...style,
  }}>
    {children}
  </div>
);

// ── Toggle ──────────────────────────────────────────
const Toggle = ({ on, onChange }) => (
  <div onClick={() => onChange && onChange(!on)} style={{
    width: 34, height: 20, borderRadius: 10, position: 'relative',
    background: on ? '#6558F5' : '#D1D5DB', cursor: 'pointer',
    transition: 'background 150ms ease', flexShrink: 0,
  }}>
    <div style={{
      position: 'absolute', top: 2,
      left: on ? 16 : 2,
      width: 16, height: 16, borderRadius: '50%',
      background: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'left 150ms ease',
    }}/>
  </div>
);

// ── Action Button (icon-only) ──────────────────────────────
const ActionBtn = ({ icon, danger, onClick }) => (
  <button onClick={onClick} style={{
    width: 24, height: 24, borderRadius: 4,
    border: '1px solid #E5E7EB',
    background: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: danger ? '#EF4444' : '#6B7280',
    flexShrink: 0, padding: 0,
    transition: 'background 100ms',
  }}>
    {icon}
  </button>
);

// ── Profile color dot ──────────────────────────────────────
const ProfileDot = ({ color = '#F97316' }) => (
  <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }}/>
);

// ── Btn ───────────────────────────────────────────────────
const Btn = ({ children, variant = 'primary', size = 'md', onClick, style }) => {
  const variantStyles = {
    primary:   { background: '#6558F5', color: 'white', border: 'none' },
    secondary: { background: 'white', color: '#1F2328', border: '1px solid #E5E7EB' },
    ghost:     { background: 'transparent', color: '#1F2328', border: '1px solid #E5E7EB' },
    danger:    { background: 'white', color: '#EF4444', border: '1px solid #FECACA' },
  };
  const sizeStyles = {
    sm: { padding: '4px 10px', fontSize: 12, borderRadius: 5 },
    md: { padding: '6px 14px', fontSize: 13, borderRadius: 6 },
    lg: { padding: '8px 20px', fontSize: 14, borderRadius: 7 },
  };
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'inherit', fontWeight: 500, cursor: 'pointer',
      lineHeight: 1, whiteSpace: 'nowrap',
      ...variantStyles[variant], ...sizeStyles[size], ...style,
    }}>
      {children}
    </button>
  );
};

// Export everything to window
Object.assign(window, {
  IC, ICONS, StatusBadge, TimePill, ChangeBadge,
  IGIcon, TTIcon, SectionLabel, Card, Toggle,
  ActionBtn, ProfileDot, Btn,
});
