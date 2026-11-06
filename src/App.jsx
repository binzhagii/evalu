import { useState } from 'react';
import { AppProvider, useApp } from './lib/store';
import { ROLES } from './lib/logic';
import { DEMO_PASSWORD } from './lib/seed';
import Tasks from './pages/Tasks';
import { Periods, Assignments, Forms, Weights, Monitor } from './pages/HR';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import { Notifications, MyResults } from './pages/Misc';
import './index.css';

const DEMO = [
  ['hr', 'HR Specialist'], ['director', 'Director/VP'], ['dean_a', 'Dean'], ['chair_a', 'Program Chair'],
  ['fac_a1', 'Faculty'], ['sec_a', 'Secretary (NTP)'], ['principal', 'Principal'], ['st_a01', 'Student'],
];

const ICONS = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};
const Icon = ({ name, size = 18 }) => (
  <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

function Login() {
  const { login } = useApp();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [caps, setCaps] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    if (!u.trim() || !p) { setErr('Enter your username and password.'); return; }
    setBusy(true); setErr('');
    const r = await login(u.trim(), p);
    setBusy(false);
    if (!r.ok) setErr(r.error);
  };
  const pick = (id) => { setU(id); setP(DEMO_PASSWORD); setErr(''); };
  return (
    <div className="login-wrap">
      <div className="login-bg" aria-hidden="true" />
      <main className="login-center">
        <header className="login-head">
          <div className="login-logo">eval<span>U</span></div>
          <p>Role-Based Performance Evaluation and Analytics System</p>
          <small>UB Human Resource Management Center</small>
        </header>
        <form className="login-card" onSubmit={go} noValidate>
          <div className="lc-head">
            <div className="lc-badge"><Icon name="lock" size={22} /></div>
            <div>
              <h1>Welcome back</h1>
              <p className="muted">Sign in to your evalU account</p>
            </div>
          </div>
          <label className="field">
            <span>Username</span>
            <div className={'input-icon' + (err ? ' bad' : '')}>
              <Icon name="user" />
              <input value={u} onChange={(e) => { setU(e.target.value); setErr(''); }} autoFocus autoComplete="username" placeholder="Enter your username" />
            </div>
          </label>
          <label className="field">
            <span>Password</span>
            <div className={'input-icon' + (err ? ' bad' : '')}>
              <Icon name="lock" />
              <input type={show ? 'text' : 'password'} value={p} onChange={(e) => { setP(e.target.value); setErr(''); }} onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))} onBlur={() => setCaps(false)} autoComplete="current-password" placeholder="Enter your password" />
              <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}><Icon name={show ? 'eyeOff' : 'eye'} /></button>
            </div>
            {caps && <small className="caps">Caps Lock is on</small>}
          </label>
          {err && <div className="login-err" role="alert"><Icon name="alert" size={16} />{err}</div>}
          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? 'Signing in…' : <>Log in <Icon name="arrow" size={18} /></>}
          </button>
          <p className="lc-foot">Trouble signing in? Contact the HRMC office.</p>
        </form>
        <div className="login-demo">
          <div className="login-demo-h">
            <b>Test accounts</b>
            <span>Password: <code>{DEMO_PASSWORD}</code></span>
          </div>
          <div className="chips">
            {DEMO.map(([id, l]) => (
              <button key={id} type="button" className={'chip' + (u === id ? ' on' : '')} onClick={() => pick(id)}>
                <b>{l}</b><small>{id}</small>
              </button>
            ))}
          </div>
          <p>More: dean_b, dean_c, chair_b, fac_b1, fac_be1, shead, aprincipal, st_b01 … All data is sample data.</p>
        </div>
      </main>
    </div>
  );
}

function navFor(user) {
  const n = [];
  if (user.role === 'HR') {
    n.push(['periods', 'Periods & release', <Periods />], ['assign', 'Assignments', <Assignments />], ['monitor', 'Class progress', <Monitor />],
      ['forms', 'Forms', <Forms />], ['weights', 'Weights', <Weights />], ['reports', 'Reports', <Reports />], ['analytics', 'Analytics', <Analytics />]);
  } else if (user.role === 'DIR') {
    n.push(['reports', 'Reports', <Reports />], ['analytics', 'Analytics', <Analytics />]);
  } else {
    n.push(['tasks', 'My evaluations', <Tasks />]);
    if (user.position === 'dean' || user.position === 'chair') n.push(['monitor', 'Department progress', <Monitor deptOnly />]);
    if (user.position === 'faculty' || user.position === 'dean') n.push(['results', 'My results', <MyResults />]);
  }
  n.push(['notifs', 'Notifications', <Notifications />]);
  return n;
}

function Shell() {
  const { db, user, checking, logout } = useApp();
  const [tab, setTab] = useState(null);
  if (!db || checking) return <div className="login-loading">Loading…</div>;
  if (!user) return <Login />;
  const nav = navFor(user);
  const cur = nav.find((n) => n[0] === tab) || nav[0];
  const unread = db.notifications.filter((n) => n.userId === user.id && !n.read).length;
  return (
    <div className="app">
      <aside>
        <h2>evalU</h2>
        <nav>{nav.map(([k, l]) => <button key={k} className={cur[0] === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'notifs' && unread > 0 ? ` (${unread})` : ''}</button>)}</nav>
        <div className="who">{user.name}<br /><span className="muted">{ROLES[user.role]}</span><br /><button className="ghost" onClick={logout}>Log out</button></div>
      </aside>
      <main key={cur[0]}>{cur[2]}</main>
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
