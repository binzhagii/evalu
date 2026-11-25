import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './lib/store';
import { ROLES, POSITIONS, isTeacher } from './lib/logic';
import { Icon, Avatar, NavContext, NavArgsContext, AskHost } from './ui';
import { HROverview, VpOverview } from './pages/Overview';
import Tasks from './pages/Tasks';
import { Periods, Assignments, Monitor, Classes, AuditLog } from './pages/HR';
import Tools from './pages/Tools';
import Departments from './pages/Departments';
import Reports, { DeptResults } from './pages/Reports';
import Analytics from './pages/Analytics';
import Policy from './pages/Policy';
import Formulas from './pages/Formulas';
import { Notifications, MyResults } from './pages/Misc';
import { Accounts, MyAccount, ForcedPasswordChange } from './pages/Accounts';
import { QR_KEY } from './pages/ClassQr';
import './index.css';

const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Shown while evalU opens: the logo, the school, and a loading line. */
function Splash() {
  return (
    <div className="splash" role="status" aria-label="Opening evalU">
      <div className="splash-logo">eval<span>U</span></div>
      <div className="splash-sub">University of Baguio · Human Resource Management Center</div>
      <div className="splash-bar" aria-hidden="true"><span /></div>
    </div>
  );
}

/** The short "done" message after a change is saved: slides in at the bottom right and leaves by itself. */
function DoneToast({ text, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="done-toast" role="status">
      <span className="done-check"><Icon name="check" size={16} /></span>
      <span>{text}</span>
      <i className="done-time" aria-hidden="true" />
    </div>
  );
}

function Login() {
  const { login, error, notice, clearNotice } = useApp();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(error);
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [caps, setCaps] = useState(false);
  const [welcome, setWelcome] = useState(''); // signed in: "Welcome, <name>" shows for a moment, then evalU opens
  const go = async (e) => {
    e.preventDefault();
    if (busy || welcome) return;
    if (!u.trim() || !p) { setErr('Enter your UB email and password.'); return; }
    setBusy(true); setErr('');
    const r = await login(u.trim(), p);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setWelcome(r.user.name.replace(/ \(Sample\)/, ''));
    setTimeout(r.enter, reduceMotion() ? 0 : 900);
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
        <form className={'login-card' + (welcome ? ' ok' : '')} onSubmit={go} noValidate>
          <div className="lc-head" aria-live="polite">
            <div className="lc-badge"><Icon name={welcome ? 'check' : 'lock'} size={22} /></div>
            <div>
              <h1>{welcome ? `Welcome, ${welcome}!` : 'Welcome back'}</h1>
              <p className="muted">{welcome ? 'Opening evalU…' : 'Sign in to your evalU account'}</p>
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
          <button type="submit" className="login-submit" disabled={busy || !!welcome}>
            {welcome ? <><Icon name="check" size={18} /> Signed in</> : busy ? <><span className="btn-spin" aria-hidden="true" />Signing in…</> : <>Log in <Icon name="arrow" size={18} /></>}
          </button>
          <p className="lc-foot">Trouble signing in? Contact the HRMC office.</p>
        </form>
      </main>
    </div>
  );
}

// [key, label, icon, page, subtitle]
function navFor(user, db) {
  const n = [];
  if (user.role === 'HR') {
    n.push(
      ['home', 'Overview', 'home', <HROverview />, 'Your checklist for this term and a quick look at what needs attention'],
      ['classes', 'Class lists', 'list', <Classes />, 'They tell evalU which students evaluate which teacher'],
      ['periods', 'Dates & release', 'calendar', <Periods />, 'Set an evaluation deadline, then close the period and share results'],
      ['assign', 'Evaluation tasks', 'list', <Assignments />, 'Who evaluates whom, and what is already done'],
      ['monitor', 'Response progress', 'chart', <Monitor />, 'See which classes and departments have responded'],
      ['reports', 'View & print results', 'report', <Reports />, 'Read, print, or share results for a completed term'],
      ['analytics', 'Patterns in results', 'trend', <Analytics />, 'Compare scores and find areas that may need support'],
      ['departments', 'Departments & offices', 'list', <Departments />, 'Add, rename, deactivate or move departments and offices'],
      ['accounts', 'People & sign-in', 'users', <Accounts />, 'Manage accounts and passwords'],
      ['forms', 'Evaluation tools', 'form', <Tools />, 'See every evaluation tool, and prepare a new version when HRMC approves a change'],
      ['formulas', 'Scoring & calculation', 'scale', <Formulas />, 'Set evaluator percentages and the final-score method in one place'],
      ['policy', 'Evaluation rules', 'form', <Policy />, 'Change participation, rating, and release rules'],
      ['audit', 'Change history', 'lock', <AuditLog />, 'Review a record of important actions and changes'],
    );
  } else if (user.role === 'DIR') {
    n.push(
      ['home', 'Overview', 'home', <VpOverview />, 'A summary of the results released to you'],
      ['reports', 'Reports', 'report', <Reports />, 'Final scores and results by person, class and subject'],
      ['analytics', 'Analytics', 'trend', <Analytics />, 'Trends, department comparisons and low-rated items'],
      ['formulas', 'Formula approvals', 'scale', <Formulas />, 'Formulas HR sent you: what counts now, what would change, and why'],
    );
  } else {
    // Clinical Instructors are evaluated but don't evaluate anyone
    if (user.position !== 'ci') n.push(['tasks', 'My evaluations', 'check', <Tasks />, 'The people you are asked to evaluate']);
    if (['dean', 'chair', 'principal', 'aprincipal'].includes(user.position)) n.push(['monitor', 'Department progress', 'chart', <Monitor deptOnly />, 'How many evaluations are done in your department']);
    if (user.position === 'dean' || user.position === 'principal') n.push(['dept', 'Department results', 'report', <DeptResults />, 'Your department results, item by item']);
    if (isTeacher(user) || user.position === 'dean' || user.role === 'NTP' || db.periods.some((p) => p.people?.[user.id])) n.push(['results', 'My results', 'star', <MyResults />, 'Your evaluation results and your classes\' response progress']);
  }
  n.push(
    ['notifs', 'Notifications', 'bell', <Notifications pages={n.map((x) => x[0])} />, 'Reminders and updates sent to you. Click one to open it'],
    ['account', 'My account', 'user', <MyAccount />, 'Your details and password'],
  );
  return n;
}

// A short menu: only the group of the page you are on is open (click a group's name to open another).
// Notifications and My account stay at the bottom.
const HR_NAV_SECTIONS = [
  { label: '', keys: ['home'] },
  { label: 'Evaluation', keys: ['forms', 'periods', 'assign', 'monitor'] },
  { label: 'Results', keys: ['reports', 'analytics'] },
  { label: 'How people are rated', keys: ['formulas', 'policy'] },
  { label: 'School records', keys: ['departments', 'accounts', 'classes'] },
  { label: 'Records', keys: ['audit'] },
  { label: '', keys: ['notifs', 'account'], bottom: true },
];

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

// The opening screen shows for a moment the first time evalU is opened in a browser tab.
const INTRO_KEY = 'evalu-intro-seen';
const firstOpen = () => { try { return !sessionStorage.getItem(INTRO_KEY) && !reduceMotion(); } catch { return false; } };

function Shell() {
  const { db, user, checking, error, clearError, done, clearDone, logout } = useApp();
  const [tab, setTab] = useState(null);
  const [navArgs, setNavArgs] = useState({});
  const [menu, setMenu] = useState(false); // phone menu open?
  const [openGroup, setOpenGroup] = useState(null); // null: the group of the page you are on; '' none
  const [intro, setIntro] = useState(firstOpen);
  useEffect(() => {
    if (!intro) return undefined;
    // about 1.2 seconds from opening the page (a slow load doesn't add to it)
    const t = setTimeout(() => { setIntro(false); try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* shown again next time */ } }, Math.max(300, 1200 - performance.now()));
    return () => clearTimeout(t);
  }, [intro]);
  if (checking || intro) return <Splash />;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ForcedPasswordChange />;
  if (!db) return <div className="login-loading">{error || 'Loading…'}</div>;
  const nav = navFor(user, db);
  const navSections = user.role === 'HR'
    ? HR_NAV_SECTIONS.map((section) => ({ ...section, items: section.keys.map((k) => nav.find((x) => x[0] === k)).filter(Boolean) })).filter((section) => section.items.length)
    : [{ label: '', items: nav }];
  const cur = nav.find((n) => n[0] === tab) || nav[0];
  const [key, label, , page, subtitle] = cur;
  const isHome = key === nav[0][0];
  const unread = db.notifications.filter((n) => n.userId === user.id && !n.read).length;
  const position = POSITIONS[user.role]?.[user.position];
  const go = (k, args = {}) => { setTab(k); setNavArgs(args); setOpenGroup(null); window.scrollTo(0, 0); };
  // small numbers on the menu: unread notifications, and formulas waiting for this VP
  const counts = { notifs: unread, formulas: user.role === 'DIR' ? (db.formulas || []).filter((f) => f.status === 'pending').length : 0 };
  const shown = openGroup ?? navSections.find((s) => s.label && s.items.some(([k]) => k === key))?.label;
  return (
    <NavContext.Provider value={go}>
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
            {navSections.map((section, i) => {
              const open = !section.label || shown === section.label;
              const here = section.items.some(([k]) => k === key);
              return (
                <div key={section.label || i} className={'nav-section' + (section.bottom ? ' bottom' : '')}>
                  {section.label && (
                    <button className={'nav-label' + (here ? ' here' : '')} onClick={() => setOpenGroup(open ? '' : section.label)} aria-expanded={open}>
                      <span>{section.label}</span><Icon name="chev" size={15} />
                    </button>
                  )}
                  {open && section.items.map(([k, l, icon]) => (
                    <button key={k} className={key === k ? 'on' : ''} onClick={() => { go(k); setMenu(false); }} aria-current={key === k ? 'page' : undefined}>
                      <Icon name={icon} /><span>{l}</span>
                      {counts[k] > 0 && <span className="pill">{counts[k]}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
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
          <NavArgsContext.Provider value={navArgs}>{page}</NavArgsContext.Provider>
        </main>
        {done && <DoneToast key={done.id} text={done.text} onClose={clearDone} />}
      </div>
    </NavContext.Provider>
  );
}

// A class QR code opens evalU with ?evaluate=<class>. Remember it until the student has signed in.
try {
  const scanned = new URLSearchParams(window.location.search).get('evaluate');
  if (scanned) { sessionStorage.setItem(QR_KEY, scanned); window.history.replaceState(null, '', window.location.pathname); }
} catch { /* storage blocked: the student opens the evaluation from the list */ }

export default function App() {
  return <AppProvider><Shell /><AskHost /></AppProvider>;
}
