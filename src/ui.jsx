import { createContext, useContext, useEffect, useState } from 'react';
import { LOW_ITEM } from './lib/logic';

/** go('reports') switches the page (provided by the app shell). */
export const NavContext = createContext(() => {});
export const useNav = () => useContext(NavContext);

export const fmt = (n) => (n == null ? '—' : Number(n).toFixed(2));
export const pct = (n) => `${Math.round(n * 100)}%`;

/* ---------- icons (simple line icons, 24x24) ---------- */
const PATHS = {
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  form: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  scale: <><path d="M12 3v18M5 21h14M6 7h12" /><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.5 2.6 3.5 6" /></>,
  report: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 17v-3M12 17v-6M16 17v-2" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></>,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H3" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
};
export const Icon = ({ name, size = 18 }) => (
  <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
);

/* ---------- small building blocks ---------- */
export function Badge({ kind, children }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}
export const StatusBadge = ({ s }) => <Badge kind={s}>{s}</Badge>;

export function Card({ title, children, actions, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-h">
          <h3>{title}</h3>
          <div className="card-actions">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

/** Initials in a coloured circle. */
export function Avatar({ name, size = 36 }) {
  const initials = name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>;
}

/** A number tile. tone: '' | 'good' | 'warn' | 'bad' */
export function Stat({ label, value, sub, icon, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      {icon && <span className="stat-icon"><Icon name={icon} size={20} /></span>}
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}
export const Stats = ({ children }) => <div className="stats">{children}</div>;

/** A horizontal bar. value 0..1. mark: optional line (e.g. the 50% rule). */
export function Meter({ value, mark, tone }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const t = tone || (mark != null ? (v >= mark ? 'good' : 'bad') : '');
  return (
    <span className={`meter ${t}`} role="img" aria-label={pct(v)}>
      <span className="meter-fill" style={{ width: `${v * 100}%` }} />
      {mark != null && <span className="meter-mark" style={{ left: `${mark * 100}%` }} />}
    </span>
  );
}

export function Empty({ icon = 'check', title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function RuleNote() {
  return (
    <div className="note">
      <b>How the 50%-plus-one rule works.</b> A class's student evaluation counts only if at least <b>half of the
      class plus one</b> student answer it (for example, 26 of 50, or 6 of 10). If fewer answer, that class is left
      out of the teacher's result, and the teacher, the department heads and HR are notified. Internship, practicum
      and field trip subjects are not evaluated.
    </div>
  );
}

/** FR15/FR19: per-item results: mean, number of answers and how many gave each rating 1–4. */
export function ItemTable({ rows, criteria, categoryOf }) {
  if (!rows.length) return <p className="muted">No answers to show.</p>;
  const text = (id) => criteria.find((c) => c.id === id)?.text || id;
  const order = categoryOf?.order;
  const sorted = order ? [...rows].sort((a, b) => (order[a.criterionId] ?? 999) - (order[b.criterionId] ?? 999))
    : categoryOf ? [...rows].sort((a, b) => (categoryOf(a.criterionId) || '').localeCompare(categoryOf(b.criterionId) || '')) : rows;
  // numbered like UB's printed sheet: I. category, then 1. 2. 3. inside it, with the category's average
  const cats = [];
  for (const r of sorted) {
    const name = categoryOf?.(r.criterionId);
    let x = cats.find((y) => y.name === name);
    if (!x) cats.push(x = { name, rows: [] });
    x.rows.push(r);
  }
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const avg = (rs) => rs.reduce((t, r) => t + r.mean, 0) / rs.length;
  return (
    <table className="items">
      <thead><tr><th>Item</th><th>Mean</th><th>Answers</th><th className="dist-h">Ratings 1 · 2 · 3 · 4</th></tr></thead>
      <tbody>
        {cats.flatMap((c, ci) => [
          ...(categoryOf ? [<tr key={'c' + ci} className="cat-row"><td>{roman[ci] || ci + 1}. {c.name}</td><td><b>{fmt(avg(c.rows))}</b></td><td colSpan={2} className="muted">category average</td></tr>] : []),
          ...c.rows.map((r, n) => (
            <tr key={r.criterionId} className={r.low ? 'low' : ''}>
              <td>{categoryOf ? `${n + 1}. ` : ''}{text(r.criterionId)} {r.low && <Badge kind="overdue">below {LOW_ITEM.toFixed(2)}</Badge>}</td>
              <td><b>{fmt(r.mean)}</b></td>
              <td>{r.n}</td>
              <td><span className="dist">{r.dist.map((x, i) => <span key={i} title={`${x} rated ${i + 1}`} style={{ flexGrow: x || 0.0001 }} className={`d${i + 1}`}>{x || ''}</span>)}</span></td>
            </tr>
          )),
        ])}
      </tbody>
    </table>
  );
}

/** FR15: print the page or save it as a PDF (the browser's print dialog). */
export const PrintButton = ({ label = 'Print / save as PDF' }) => <button className="ghost no-print" onClick={() => window.print()}>{label}</button>;

export function Select({ value, onChange, children, ...p }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p}>
      {children}
    </select>
  );
}

/** Newest first: new records are added at the end, so show the list backwards. */
export const newestFirst = (list) => [...list].reverse();

/** Page bar: "Showing 11–20 of 440", First / Previous / page dropdown / Next / Last. */
export function Pager({ page, pages, total, size, onPage, onSize }) {
  const from = page * size + 1, to = Math.min(total, from + size - 1);
  return (
    <div className="pager no-print">
      <span className="muted">Showing <b>{from}–{to}</b> of <b>{total}</b></span>
      <span className="pager-btns">
        <button className="ghost" disabled={page === 0} onClick={() => onPage(0)} title="First page">« First</button>
        <button className="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>‹ Previous</button>
        <label className="inline">Page
          <Select value={page} onChange={(v) => onPage(Number(v))}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</Select>
          of {pages}</label>
        <button className="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next ›</button>
        <button className="ghost" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)} title="Last page">Last »</button>
      </span>
      <label className="inline muted">Rows per page
        <Select value={size} onChange={(v) => onSize(Number(v))}>{[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
      </label>
    </div>
  );
}

/**
 * Split a long list into pages. Returns { rows, bar }: the rows for this page and the page bar.
 * The page goes back to 1 whenever `resetKey` changes (e.g. a new search or filter).
 */
export function usePages(list, resetKey = '', start = 5) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(start);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) { setKey(resetKey); setPage(0); }
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(page, pages - 1);
  const rows = list.slice(p * size, p * size + size);
  const bar = list.length > 5 ? <Pager page={p} pages={pages} total={list.length} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} /> : null;
  return { rows, bar };
}

export function PeriodPicker({ periods, value, onChange }) {
  return (
    <label className="inline">
      <span className="muted">Period</span>
      <Select value={value} onChange={onChange}>
        {newestFirst(periods).map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
    </label>
  );
}

/** Days from today until a YYYY-MM-DD date (negative = past). */
export function daysUntil(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + 'T00:00:00') - today) / 86400000);
}
export function dueText(date) {
  const d = daysUntil(date);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${d} days`;
}

/**
 * An input that saves to the server when you leave the field or press Enter
 * (not on every keystroke). onSave(value) is called only if the value changed.
 */
export function SaveInput({ value, onSave, ...p }) {
  const [v, setV] = useState(value ?? '');
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setV(value ?? ''); } // server value changed
  const commit = () => { if (String(v) !== String(value ?? '')) onSave(v); };
  return (
    <input {...p} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setV(value ?? ''); }} />
  );
}

/* ---------- confirmation dialog (instead of the browser's plain confirm box) ---------- */
let openAsk = null;
/**
 * Ask before something important happens:  if (await ask('Delete section?', 'SEC-A1 will be removed.', { ok: 'Delete', danger: true })) …
 * Resolves true only when the person clicks the action button (Cancel, Esc or clicking outside = false).
 */
export function ask(title, text = '', { ok = 'Yes, continue', danger = false } = {}) {
  return new Promise((resolve) => {
    if (openAsk) openAsk({ title, text, ok, danger, resolve });
    else resolve(window.confirm(text ? `${title}\n\n${text}` : title)); // fallback if the dialog is not on the page
  });
}
/** Put once in the app; shows the dialog that ask() opens. */
export function AskHost() {
  const [d, setD] = useState(null);
  useEffect(() => { openAsk = setD; return () => { openAsk = null; }; }, []);
  useEffect(() => {
    if (!d) return undefined;
    const key = (e) => { if (e.key === 'Escape') { d.resolve(false); setD(null); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [d]);
  if (!d) return null;
  const done = (v) => { d.resolve(v); setD(null); };
  return (
    <div className="ask-backdrop" onClick={() => done(false)}>
      <div className={`ask-box ${d.danger ? 'is-danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="ask-title" onClick={(e) => e.stopPropagation()}>
        <div className="ask-icon"><Icon name="alert" size={26} /></div>
        <h2 id="ask-title">{d.title}</h2>
        {d.text && <p>{d.text}</p>}
        <div className="ask-actions">
          <button className="ghost" autoFocus onClick={() => done(false)}>Cancel</button>
          <button className={d.danger ? 'ask-danger' : ''} onClick={() => done(true)}>{d.ok}</button>
        </div>
      </div>
    </div>
  );
}
