import { THRESHOLD } from './lib/logic';

export const fmt = (n) => (n == null ? '—' : Number(n).toFixed(2));
export const pct = (n) => `${Math.round(n * 100)}%`;

export function Badge({ kind, children }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}
export const StatusBadge = ({ s }) => <Badge kind={s}>{s}</Badge>;

export function Card({ title, children, actions }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-h">
          <h3>{title}</h3>
          <div>{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function RuleNote() {
  return (
    <div className="note">
      <b>How the 50% rule works.</b> A class section's student evaluation counts only if at least half of the
      enrolled students submit it (for example, 21 of 40 students). If fewer than {pct(THRESHOLD)} respond, that
      section's student evaluation is set aside (invalidated) and the faculty member is notified.
    </div>
  );
}

export function Select({ value, onChange, children, ...p }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p}>
      {children}
    </select>
  );
}

export function PeriodPicker({ periods, value, onChange }) {
  return (
    <label className="inline">
      Evaluation period{' '}
      <Select value={value} onChange={onChange}>
        {periods.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
    </label>
  );
}
