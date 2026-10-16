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

function Login() {
  const { login } = useApp();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); if (!(await login(u, p))) setErr('Incorrect username or password.'); };
  return (
    <div className="login">
      <h1>evalU</h1>
      <p className="muted">Role-Based Performance Evaluation and Analytics System · UB Human Resource Management Center</p>
      <form onSubmit={go}>
        <label className="block">Username<input value={u} onChange={(e) => setU(e.target.value)} autoFocus /></label>
        <label className="block">Password<input type="password" value={p} onChange={(e) => setP(e.target.value)} /></label>
        {err && <div className="note warn">{err}</div>}
        <button type="submit">Log in</button>
      </form>
      <div className="note">
        <b>Simulated test accounts</b> (password for all: <code>{DEMO_PASSWORD}</code>). Click to fill the username.
        <div className="row wrap">{DEMO.map(([id, l]) => <button key={id} type="button" className="ghost" onClick={() => { setU(id); setP(DEMO_PASSWORD); }}>{l}</button>)}</div>
        <span className="muted">More: dean_b, dean_c, chair_b, fac_b1, fac_be1, shead, aprincipal, st_b01 … All data here is sample data.</span>
      </div>
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
  const { db, user, logout } = useApp();
  const [tab, setTab] = useState(null);
  if (!db) return <div className="login">Loading…</div>;
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
