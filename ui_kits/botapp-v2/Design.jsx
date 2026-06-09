// BotApp v2 — Design System Tokens + Base Components
// Inter (UI) + JetBrains Mono (code/IDs/logs)

const DS = {
  c: {
    canvas:   '#F7F7F6', surface:  '#FFFFFF', surface2: '#F3F3F1',
    sidebar:  '#111213', sidebarHover: 'rgba(255,255,255,0.07)', sidebarActive: 'rgba(255,255,255,0.11)',
    accent:   '#6558F5', accentHover: '#5448E8', accentLight: '#EDE9FE', accentMuted: '#A89FF8',
    fg1: '#0F1117', fg2: '#5C6070', fg3: '#9EA3B0',
    border: '#E6E6E4', border2: '#D4D4D1', input: '#F2F2F0',
    // status
    green: '#16A34A', greenBg: '#DCFCE7', greenText: '#166534', greenDot: '#22C55E',
    red:   '#DC2626', redBg:   '#FEE2E2', redText:   '#991B1B', redDot:   '#F87171',
    amber: '#D97706', amberBg: '#FEF3C7', amberText: '#92400E', amberDot: '#FBBF24',
    blue:  '#2563EB', blueBg:  '#DBEAFE', blueText:  '#1E40AF',
    teal:  '#0D9488', tealBg:  '#CCFBF1', tealText:  '#134E4A',
    orange:'#EA580C', orangeBg:'#FFEDD5', orangeText:'#9A3412',
    neutral:'#F3F4F6', neutralText:'#6B7280',
    code: '#1A1A2C', codeText: '#CBD5E1',
  },
  font: {
    sans: '"Inter", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
  },
  r: { sm: 4, md: 6, lg: 8, xl: 10, xl2: 12, full: 9999 },
  shadow: {
    xs: '0 1px 2px rgba(0,0,0,0.05)',
    sm: '0 1px 3px rgba(0,0,0,0.07)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 8px 24px rgba(0,0,0,0.10)',
    modal: '0 16px 48px rgba(0,0,0,0.14)',
  },
};

// ── SVG Icon paths (Lucide-compatible) ────────────────────
const IP = {
  home:         'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  home2:        'M9 22V12h6v10',
  users:        ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75','M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  smartphone:   ['M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z','M12 18h.01'],
  target:       ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z','M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  message:      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  list:         ['M8 6h13','M8 12h13','M8 18h13','M3 6h.01','M3 12h.01','M3 18h.01'],
  bell:         ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9','M13.73 21a2 2 0 0 1-3.46 0'],
  key:          ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
  settings:     ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  alertCircle:  ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 8v4','M12 16h.01'],
  alertTriangle:['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z','M12 9v4','M12 17h.01'],
  shield:       'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  shieldOff:    ['M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18','M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38','M1 1l22 22'],
  flag:         ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z','M4 22v-7'],
  wifiOff:      ['M1 1l22 22','M16.72 11.06A10.94 10.94 0 0 1 19 12.55','M5 12.55a10.94 10.94 0 0 1 5.17-2.39','M10.71 5.05A16 16 0 0 1 22.56 9','M1.42 9a15.91 15.91 0 0 1 4.7-2.88','M8.53 16.11a6 6 0 0 1 6.95 0','M12 20h.01'],
  timerOff:     ['M0 0L24 24','M10.96 10.96A4 4 0 0 0 12 16a4 4 0 0 0 4-4 4 4 0 0 0-1.04-2.68M12 4V2','M6.12 6.12a10 10 0 0 0 14.14 14.14','M14 2h-4','M22 13a10 10 0 0 1-16.54 7.58'],
  gauge:        ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 7v5l4 2'],
  eye:          ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  eyeOff:       ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94','M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19','M1 1l22 22'],
  copy:         ['M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866','M18 8h-8c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z'],
  edit:         ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7','M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  trash:        ['M3 6h18','M19 6l-1 14H6L5 6','M10 11v6M14 11v6','M9 6V4h6v2'],
  search:       ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z','M21 21l-4.35-4.35'],
  filter:       'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  plus:         ['M12 5v14','M5 12h14'],
  refresh:      ['M23 4v6h-6','M20.49 15a9 9 0 1 1-2.12-9.36L23 10'],
  play:         'M5 3l14 9-14 9V3z',
  pause:        ['M6 4h4v16H6z','M14 4h4v16h-4z'],
  stop:         'M6 6h12v12H6z',
  check:        'M20 6L9 17l-5-5',
  x:            ['M18 6L6 18','M6 6l12 12'],
  xCircle:      ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M15 9l-6 6','M9 9l6 6'],
  chevR:        'M9 18l6-6-6-6',
  chevD:        'M6 9l6 6 6-6',
  chevU:        'M18 15l-6-6-6 6',
  arrowUR:      ['M7 17L17 7','M7 7h10v10'],
  link:         ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71','M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  globe:        ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M2 12h20','M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  zap:          'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  clock:        ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 6v6l4 2'],
  userX:        ['M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z','M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 7l-4 4m0-4l4 4'],
  send:         'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  sliders:      ['M4 21v-7','M4 10V3','M12 21v-9','M12 8V3','M20 21v-5','M20 12V3','M1 14h6','M9 8h6','M17 16h6'],
  package:      ['M16.5 9.4l-9-5.19','M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z','M3.27 6.96L12 12.01l8.73-5.05','M12 22.08V12'],
  checkCircle:  ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M9 12l2 2 4-4'],
  logOut:       ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4','M16 17l5-5-5-5','M21 12H9'],
};

// ── Icon renderer ─────────────────────────────────────────
const Ico = ({ n, size = 14, sw = 1.75, color = 'currentColor', fill = 'none', style }) => {
  const paths = IP[n];
  if (!paths) return null;
  const arr = Array.isArray(paths) ? paths : [paths];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {arr.map((d, i) => <path key={i} d={d}/>)}
    </svg>
  );
};

// ── Badge ──────────────────────────────────────────────────
const BADGE_CONFIGS = {
  running:      { bg: '#DCFCE7', text: '#166534', dot: '#22C55E', label: 'Running' },
  idle:         { bg: '#F3F4F6', text: '#6B7280', dot: null,      label: 'Idle' },
  offline:      { bg: '#FEE2E2', text: '#991B1B', dot: '#F87171', label: 'Offline' },
  error:        { bg: '#FEE2E2', text: '#991B1B', dot: '#F87171', label: 'Error' },
  ok:           { bg: '#DCFCE7', text: '#166534', dot: null,      label: 'OK' },
  failed:       { bg: '#FEE2E2', text: '#991B1B', dot: null,      label: 'Failed' },
  twofa:        { bg: '#FEF3C7', text: '#92400E', dot: null,      label: '2FA' },
  checkpoint:   { bg: '#FFEDD5', text: '#9A3412', dot: null,      label: 'CP' },
  connected:    { bg: '#DCFCE7', text: '#166534', dot: '#22C55E', label: 'Connected' },
  disconnected: { bg: '#FEE2E2', text: '#991B1B', dot: '#F87171', label: 'Disconnected' },
  active:       { bg: '#DCFCE7', text: '#166534', dot: null,      label: 'Active' },
  paused:       { bg: '#FEF3C7', text: '#92400E', dot: null,      label: 'Paused' },
  valid:        { bg: '#DCFCE7', text: '#166534', dot: null,      label: 'Valid' },
  invalid:      { bg: '#FEE2E2', text: '#991B1B', dot: null,      label: 'Invalid' },
  review:       { bg: '#FEF3C7', text: '#92400E', dot: null,      label: 'Review' },
  archived:     { bg: '#F3F4F6', text: '#6B7280', dot: null,      label: 'Archived' },
  pro:          { bg: '#EDE9FE', text: '#4338CA', dot: null,      label: 'PRO' },
  starter:      { bg: '#F3F4F6', text: '#6B7280', dot: null,      label: 'Starter' },
  enabled:      { bg: '#DCFCE7', text: '#166534', dot: null,      label: 'Enabled' },
  disabled:     { bg: '#F3F4F6', text: '#6B7280', dot: null,      label: 'Disabled' },
};

const Badge = ({ type, label, dot = true, size = 'sm' }) => {
  const cfg = BADGE_CONFIGS[type] || { bg: '#F3F4F6', text: '#6B7280', dot: null, label: type };
  const lbl = label !== undefined ? label : cfg.label;
  const fs = size === 'xs' ? 10 : 11;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'xs' ? '1px 6px' : '2px 8px',
      borderRadius: DS.r.full,
      background: cfg.bg, color: cfg.text,
      fontSize: fs, fontWeight: 500, lineHeight: 1,
      whiteSpace: 'nowrap', fontFamily: DS.font.sans,
    }}>
      {dot && cfg.dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }}/>}
      {lbl}
    </span>
  );
};

// ── Avatar ─────────────────────────────────────────────────
const avatarColors = ['#6558F5','#0D9488','#D97706','#DC2626','#2563EB','#EA580C','#059669'];
const Avatar = ({ name = '?', size = 24 }) => {
  const initials = name.split(/[\s_-]/)[0][0].toUpperCase();
  const ci = name.charCodeAt(0) % avatarColors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColors[ci],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: Math.round(size * 0.42), fontWeight: 600,
      flexShrink: 0, fontFamily: DS.font.sans, letterSpacing: '-0.01em',
    }}>{initials}</div>
  );
};

// ── Btn ────────────────────────────────────────────────────
const Btn = ({ children, variant = 'primary', size = 'md', onClick, style, disabled, icon }) => {
  const vs = {
    primary:   { bg: '#6558F5', color: '#fff',      border: 'none' },
    secondary: { bg: '#fff',    color: '#0F1117',   border: '1px solid #E6E6E4' },
    ghost:     { bg: 'transparent', color: '#5C6070', border: '1px solid #E6E6E4' },
    danger:    { bg: '#fff',    color: '#DC2626',   border: '1px solid #FECACA' },
    dangerFill:{ bg: '#DC2626', color: '#fff',      border: 'none' },
  };
  const ss = {
    xs: { padding: '3px 8px',  fontSize: 11, borderRadius: 4, gap: 4  },
    sm: { padding: '5px 10px', fontSize: 12, borderRadius: 5, gap: 5  },
    md: { padding: '6px 14px', fontSize: 13, borderRadius: 6, gap: 6  },
    lg: { padding: '8px 18px', fontSize: 14, borderRadius: 7, gap: 7  },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: DS.font.sans, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
      lineHeight: 1, whiteSpace: 'nowrap', transition: 'opacity 100ms',
      opacity: disabled ? 0.5 : 1,
      ...vs[variant], ...ss[size], ...style,
    }}>
      {icon && <Ico n={icon} size={size === 'xs' || size === 'sm' ? 12 : 13}/>}
      {children}
    </button>
  );
};

// ── Card ───────────────────────────────────────────────────
const Card = ({ children, style, pad = '14px 16px', noBorder }) => (
  <div style={{
    background: '#fff',
    border: noBorder ? 'none' : '1px solid #E6E6E4',
    borderRadius: DS.r.lg,
    padding: pad,
    ...style,
  }}>{children}</div>
);

// ── Section label ──────────────────────────────────────────
const SLabel = ({ children, style }) => (
  <div style={{
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: '#9EA3B0',
    fontFamily: DS.font.sans, ...style,
  }}>{children}</div>
);

// ── Input ──────────────────────────────────────────────────
const Input = ({ value, onChange, placeholder, mono, icon, style }) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
    {icon && <span style={{ position: 'absolute', left: 8, color: '#9EA3B0', display: 'flex' }}><Ico n={icon} size={13}/></span>}
    <input
      value={value} onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', border: '1px solid #E6E6E4', background: '#F2F2F0',
        borderRadius: DS.r.md, padding: icon ? '6px 10px 6px 28px' : '6px 10px',
        fontSize: 13, fontFamily: mono ? DS.font.mono : DS.font.sans,
        color: '#0F1117', outline: 'none', boxSizing: 'border-box',
      }}
    />
  </div>
);

// ── Toggle ─────────────────────────────────────────────────
const Toggle = ({ on, onChange, size = 'md' }) => {
  const w = size === 'sm' ? 28 : 34;
  const h = size === 'sm' ? 16 : 20;
  const thumb = size === 'sm' ? 12 : 16;
  return (
    <div onClick={() => onChange && onChange(!on)} style={{
      width: w, height: h, borderRadius: h, position: 'relative',
      background: on ? '#6558F5' : '#D1D5DB',
      cursor: 'pointer', transition: 'background 150ms', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: (h - thumb) / 2,
        left: on ? w - thumb - (h - thumb) / 2 : (h - thumb) / 2,
        width: thumb, height: thumb, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 150ms',
      }}/>
    </div>
  );
};

// ── Skeleton ───────────────────────────────────────────────
const Skel = ({ w = '100%', h = 14, r = 4, style }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: 'linear-gradient(90deg, #F0F0EE 25%, #E8E8E6 50%, #F0F0EE 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeletonPulse 1.5s ease-in-out infinite',
    ...style,
  }}/>
);

// ── Mono text (IDs, serials, logs) ─────────────────────────
const Mono = ({ children, color, size = 11 }) => (
  <span style={{ fontFamily: DS.font.mono, fontSize: size, color: color || '#9EA3B0' }}>{children}</span>
);

// ── Toast container (minimal state) ───────────────────────
let _toastSetFn = null;
const toast = {
  success: (msg) => _toastSetFn && _toastSetFn(t => [...t, { id: Date.now(), type: 'success', msg }]),
  error:   (msg) => _toastSetFn && _toastSetFn(t => [...t, { id: Date.now(), type: 'error', msg }]),
  info:    (msg) => _toastSetFn && _toastSetFn(t => [...t, { id: Date.now(), type: 'info', msg }]),
};

const Toasts = () => {
  const [toasts, setToasts] = React.useState([]);
  _toastSetFn = setToasts;
  const remove = id => setToasts(t => t.filter(x => x.id !== id));
  React.useEffect(() => {
    if (toasts.length === 0) return;
    const latest = toasts[toasts.length - 1];
    const t = setTimeout(() => remove(latest.id), 3500);
    return () => clearTimeout(t);
  }, [toasts]);
  const colors = { success: '#166534', error: '#991B1B', info: '#1E40AF' };
  const bgs    = { success: '#F0FDF4', error: '#FEF2F2', info: '#EFF6FF' };
  const borders= { success: '#BBF7D0', error: '#FECACA', info: '#BFDBFE' };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: DS.r.lg,
          background: bgs[t.type], border: `1px solid ${borders[t.type]}`,
          boxShadow: DS.shadow.md, color: colors[t.type],
          fontSize: 13, fontFamily: DS.font.sans, maxWidth: 360,
          animation: 'fadeIn 200ms ease',
        }}>
          <Ico n={t.type === 'success' ? 'checkCircle' : t.type === 'error' ? 'xCircle' : 'alertCircle'} size={15}/>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <div onClick={() => remove(t.id)} style={{ cursor: 'pointer', opacity: 0.6 }}><Ico n="x" size={13}/></div>
        </div>
      ))}
    </div>
  );
};

// ── Confirm Modal ─────────────────────────────────────────
const ConfirmModal = ({ title, message, danger, onConfirm, onCancel }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ background: '#fff', borderRadius: DS.r.xl2, padding: '24px', width: 400, boxShadow: DS.shadow.modal }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0F1117', marginBottom: 8, fontFamily: DS.font.sans }}>{title}</div>
      <div style={{ fontSize: 13, color: '#5C6070', fontFamily: DS.font.sans, marginBottom: 20, lineHeight: 1.5 }}>{message}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="secondary" size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn variant={danger ? 'dangerFill' : 'primary'} size="sm" onClick={onConfirm}>Confirm</Btn>
      </div>
    </div>
  </div>
);

// ── Empty State ───────────────────────────────────────────
const EmptyState = ({ icon, title, message, action }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 12, fontFamily: DS.font.sans }}>
    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9EA3B0' }}>
      <Ico n={icon || 'search'} size={18}/>
    </div>
    <div style={{ fontSize: 14, fontWeight: 500, color: '#0F1117' }}>{title}</div>
    {message && <div style={{ fontSize: 13, color: '#9EA3B0', textAlign: 'center', maxWidth: 280 }}>{message}</div>}
    {action}
  </div>
);

// ── Page Header ───────────────────────────────────────────
const PageHdr = ({ title, subtitle, actions, badge }) => (
  <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E6E6E4', background: '#F7F7F6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 19, fontWeight: 600, color: '#0F1117', letterSpacing: '-0.025em', fontFamily: DS.font.sans }}>{title}</div>
        {badge}
      </div>
      {subtitle && <div style={{ fontSize: 13, color: '#5C6070', marginTop: 3, fontFamily: DS.font.sans }}>{subtitle}</div>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{actions}</div>}
  </div>
);

// ── Table base styles ─────────────────────────────────────
const Th = ({ children, style, align = 'left' }) => (
  <th style={{
    padding: '0 12px', height: 34,
    fontSize: 11, fontWeight: 500, color: '#9EA3B0',
    textAlign: align, textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid #E6E6E4', background: '#FAFAF9',
    fontFamily: DS.font.sans, userSelect: 'none', whiteSpace: 'nowrap',
    ...style,
  }}>{children}</th>
);

const Td = ({ children, style, align = 'left', mono }) => (
  <td style={{
    padding: '0 12px', height: 40,
    fontSize: 13, color: '#0F1117',
    textAlign: align, borderBottom: '1px solid #F0F0EE',
    fontFamily: mono ? DS.font.mono : DS.font.sans,
    verticalAlign: 'middle',
    ...style,
  }}>{children}</td>
);

const TRow = ({ children, onClick, style }) => (
  <tr onClick={onClick} style={{
    cursor: onClick ? 'pointer' : 'default',
    transition: 'background 80ms',
    ...style,
  }}
    onMouseEnter={e => { if (onClick || true) e.currentTarget.style.background = '#FAFAF8'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >{children}</tr>
);

// ── Global styles (injected once) ─────────────────────────
const injectGlobalStyles = () => {
  if (document.getElementById('ds-global')) return;
  const s = document.createElement('style');
  s.id = 'ds-global';
  s.textContent = `
    @keyframes skeletonPulse { 0%,100%{background-position:200% 0} 50%{background-position:-200% 0} }
    @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    * { box-sizing: border-box; }
    body { font-family: "Inter", system-ui, sans-serif; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
    input:focus { border-color: #6558F5 !important; box-shadow: 0 0 0 2px #EDE9FE !important; outline: none !important; }
    button:focus-visible { outline: 2px solid #6558F5; outline-offset: 2px; }
    table { border-collapse: collapse; width: 100%; }
  `;
  document.head.appendChild(s);
};
injectGlobalStyles();

Object.assign(window, {
  DS, IP, Ico, Badge, BADGE_CONFIGS, Avatar, Btn, Card, SLabel,
  Input, Toggle, Skel, Mono, toast, Toasts, ConfirmModal,
  EmptyState, PageHdr, Th, Td, TRow,
});
