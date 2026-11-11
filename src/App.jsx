import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './lib/store';
import { ROLES, POSITIONS, isTeacher } from './lib/logic';
import { Icon, Avatar, NavContext, AskHost } from './ui';
import { HROverview, VpOverview } from './pages/Overview';
import Tasks from './pages/Tasks';
import { Periods, Assignments, Forms, Weights, Monitor, Classes, AuditLog } from './pages/HR';
import Reports, { DeptResults } from './pages/Reports';
import Analytics from './pages/Analytics';
import { Notifications, MyResults } from './pages/Misc';
import { Accounts, MyAccount, ForcedPasswordChange } from './pages/Accounts';
import './index.css';

function Login() {
  const { login, error, notice, clearNotice } = useApp();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(error);
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [caps, setCaps] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    if (!u.trim() || !p) { setErr('Enter your UB email and password.'); return; }
    setBusy(true); setErr('');
    const r = await login(u.trim(), p);
    setBusy(false);
    if (!r.ok) setErr(r.error);
  };
  // the "logged out" banner closes by itself after a few seconds
  useEffect(() => { if (!notice) return; const t = setTimeout(clearNotice, 4000); return () => clearTimeout(t); }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="login-wrap">
      <div className="login-bg" aria-hidden="true" />
      {notice && <div className="login-toast" role="status"><Icon name="check" size={18} />{notice}</div>}
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
            <span>UB email</span>
            <div className={'input-icon' + (err ? ' bad' : '')}>
              <Icon name="user" />
              <input value={u} onChange={(e) => { setU(e.target.value); setErr(''); clearNotice(); }} autoFocus autoComplete="username" placeholder="name@ubaguio.edu" />
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
      </main>
    </div>
  );
}

// [key, label, icon, page, subtitle]
function navFor(user) {
  const n = [];
  if (user.role === 'HR') {
    n.push(
      ['home', 'Overview', 'home', <HROverview />, 'Everything happening in evaluations right now'],
      ['periods', 'Periods & release', 'calendar', <Periods />, 'Open and close evaluation periods, and release results step by step'],
      ['assign', 'Assignments', 'list', <Assignments />, 'Who evaluates whom in each period'],
      ['monitor', 'Progress', 'chart', <Monitor />, 'How many evaluations are done, by department and class'],
      ['classes', 'Class lists', 'list', <Classes />, 'Class sections and enrolment from the Registrar / ARC'],
      ['forms', 'Forms', 'form', <Forms />, 'The criteria and questions on each evaluation form'],
      ['weights', 'Weights', 'scale', <Weights />, 'How much each evaluator group counts toward the final score'],
      ['accounts', 'Accounts', 'users', <Accounts />, 'Create and manage the people who can sign in'],
      ['reports', 'Reports', 'report', <Reports />, 'Final scores and results by person, class and subject'],
      ['analytics', 'Analytics', 'trend', <Analytics />, 'Trends, department comparisons and low-rated items'],
      ['audit', 'Audit log', 'lock', <AuditLog />, 'Who viewed, changed or released results'],
    );
  } else if (user.role === 'DIR') {
    n.push(
      ['home', 'Overview', 'home', <VpOverview />, 'A summary of the results released to you'],
      ['reports', 'Reports', 'report', <Reports />, 'Final scores and results by person, class and subject'],
      ['analytics', 'Analytics', 'trend', <Analytics />, 'Trends, department comparisons and low-rated items'],
    );
  } else {
    // Clinical Instructors are evaluated but don't evaluate anyone
    if (user.position !== 'ci') n.push(['tasks', 'My evaluations', 'check', <Tasks />, 'The people you are asked to evaluate']);
    if (['dean', 'chair', 'principal', 'aprincipal'].includes(user.position)) n.push(['monitor', 'Department progress', 'chart', <Monitor deptOnly />, 'How many evaluations are done in your department']);
    if (user.position === 'dean' || user.position === 'principal') n.push(['dept', 'Department results', 'report', <DeptResults />, 'Your department results, item by item']);
    if (isTeacher(user) || user.position === 'dean' || user.role === 'NTP') n.push(['results', 'My results', 'star', <MyResults />, 'Your evaluation results and your classes\' response progress']);
  }
  n.push(
    ['notifs', 'Notifications', 'bell', <Notifications />, 'Reminders and updates sent to you'],
    ['account', 'My account', 'user', <MyAccount />, 'Your details and password'],
  );
  return n;
}

/** An error pinned to the top of the screen, so it is seen without scrolling. Closes by itself after 10 seconds. */
function ErrorAlert({ text, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 10000); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="alert-toast" role="alert">
      <Icon name="alert" size={20} />
      <span>{text}</span>
      <button className="alert-x" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Shell() {
  const { db, user, checking, error, clearError, logout } = useApp();
  const [tab, setTab] = useState(null);
  const [menu, setMenu] = useState(false); // phone menu open?
  if (checking) return <div className="login-loading">Loading…</div>;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ForcedPasswordChange />;
  if (!db) return <div className="login-loading">{error || 'Loading…'}</div>;
  const nav = navFor(user);
  const cur = nav.find((n) => n[0] === tab) || nav[0];
  const [key, label, , page, subtitle] = cur;
  const isHome = key === nav[0][0];
  const unread = db.notifications.filter((n) => n.userId === user.id && !n.read).length;
  const position = POSITIONS[user.role]?.[user.position];
  return (
    <NavContext.Provider value={setTab}>
      <div className="app">
        {/* phones and small tablets: a top bar with a menu button instead of the sidebar */}
        <header className="mobile-bar">
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}><Icon name="menu" size={22} />{unread > 0 && <span className="dot" />}</button>
          <div className="brand">eval<span>U</span></div>
          <span className="mb-title">{label}</span>
        </header>
        {menu && <div className="backdrop" onClick={() => setMenu(false)} aria-hidden="true" />}
        <aside className={menu ? 'open' : ''}>
          <div className="aside-top">
            <div className="brand">eval<span>U</span></div>
            <button className="icon-btn aside-close" onClick={() => setMenu(false)} aria-label="Close menu"><Icon name="close" size={22} /></button>
          </div>
          <nav>
            {nav.map(([k, l, icon]) => (
              <button key={k} className={key === k ? 'on' : ''} onClick={() => { setTab(k); setMenu(false); window.scrollTo(0, 0); }} aria-current={key === k ? 'page' : undefined}>
                <Icon name={icon} /><span>{l}</span>
                {k === 'notifs' && unread > 0 && <span className="pill">{unread}</span>}
              </button>
            ))}
          </nav>
          <div className="who">
            <Avatar name={user.name} />
            <div className="who-text"><b>{user.name}</b><span>{position && position !== ROLES[user.role] ? position : ROLES[user.role]}</span></div>
            <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out"><Icon name="logout" /></button>
          </div>
        </aside>
        <main key={key}>
          <header className="page-h">
            <h1>{isHome ? `${greeting()}, ${user.name.replace(/ \(Sample\)/, '')}` : label}</h1>
            <p>{isHome ? `${ROLES[user.role]} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` : subtitle}</p>
          </header>
          {error && <ErrorAlert text={error} onClose={clearError} />}
          {page}
        </main>
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  return <AppProvider><Shell /><AskHost /></AppProvider>;
}
