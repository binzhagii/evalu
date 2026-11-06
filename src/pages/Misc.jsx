import { useApp } from '../lib/store';
import { computeTarget, canSeeOwn, sectionStats, STAGE_LABEL, THRESHOLD } from '../lib/logic';
import { Card, Badge, Meter, Empty, Icon, RuleNote, pct } from '../ui';
import { ResultCard } from './Reports';

const KIND = {
  invalidated: { icon: 'alert', tone: 'bad', title: 'Class evaluation invalidated' },
  overdue: { icon: 'clock', tone: 'bad', title: 'Overdue' },
  reminder: { icon: 'bell', tone: 'warn', title: 'Reminder' },
};
function ago(at) {
  const m = Math.round((Date.now() - new Date(at)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Notifications() {
  const { db, user, act } = useApp();
  const mine = db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = mine.filter((n) => !n.read).length;
  return (
    <Card title={unread ? `${unread} unread` : 'All caught up'} actions={unread > 0 && <button className="ghost" onClick={() => act('markNotificationsRead')}>Mark all as read</button>}>
      {mine.length === 0 ? <Empty icon="bell" title="No notifications yet">Reminders and updates about your evaluations will appear here.</Empty> : (
        <ul className="notifs">
          {mine.map((n) => {
            const k = KIND[n.kind] || { icon: 'bell', tone: '', title: n.kind };
            return (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <span className={`n-icon ${k.tone}`}><Icon name={k.icon} size={18} /></span>
                <div>
                  <div className="n-title"><b>{k.title}</b><span className="muted">{ago(n.at)}</span></div>
                  <div>{n.text}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function MyResults() {
  const { db, user } = useApp();
  const myClasses = db.sections.filter((s) => s.facultyId === user.id);
  const open = db.periods.filter((p) => p.status === 'open');
  const released = db.periods.filter((p) => canSeeOwn(user, p));
  const hidden = db.periods.filter((p) => !canSeeOwn(user, p) && p.status === 'closed');
  return (
    <>
      {myClasses.length > 0 && open.length > 0 && (
        <Card title="Student response progress for my classes">
          <p className="muted">At least {pct(THRESHOLD)} of students in a class must answer, or that class's student evaluation is set aside.</p>
          {open.flatMap((p) => myClasses.map((s) => {
            const st = sectionStats(db, p.id, s.id);
            return (
              <div key={p.id + s.id} className="meter-row big">
                <span><b>{s.code}</b> <span className="muted">{s.subject}{open.length > 1 ? ` · ${p.name}` : ''}</span></span>
                <Meter value={st.rate} mark={THRESHOLD} />
                <b>{st.responded}/{st.required}</b>
                {st.belowHalf ? <Badge kind="overdue">below 50%</Badge> : <Badge kind="completed">meets 50%</Badge>}
              </div>
            );
          }))}
        </Card>
      )}
      {released.length === 0 && (
        <Card><Empty icon="clock" title="Your results have not been released yet">HR releases results to faculty after Directors/VPs have reviewed them.</Empty></Card>
      )}
      {[...released].reverse().map((p) => (
        <Card key={p.id} title={p.name}>
          <ResultCard res={computeTarget(db, p.id, user.id)} db={db} own />
        </Card>
      ))}
      {hidden.length > 0 && <p className="muted">Not yet released to you: {hidden.map((p) => `${p.name} (${STAGE_LABEL[p.releaseStage]})`).join('; ')}.</p>}
      <details className="note"><summary>How scores are calculated</summary><RuleNote /></details>
    </>
  );
}
