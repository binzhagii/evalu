import { useEffect } from 'react';
import { useApp } from '../lib/store';
import { computeTarget, canSeeOwn, sectionStats, STAGE_LABEL, THRESHOLD, isExemptSection } from '../lib/logic';
import { Card, Badge, Meter, Empty, Icon, RuleNote, PrintButton } from '../ui';
import { ResultCard, PastRecords } from './Reports';

const KIND = {
  invalidated: { icon: 'alert', tone: 'bad', title: 'Class excluded (below half + 1)' },
  participation: { icon: 'chart', tone: 'warn', title: 'Low participation' },
  release: { icon: 'report', tone: '', title: 'Results' },
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
  const { db, user, act } = useApp();
  const myClasses = db.sections.filter((s) => s.facultyId === user.id && !isExemptSection(s));
  const open = db.periods.filter((p) => p.status === 'open');
  const released = db.periods.filter((p) => canSeeOwn(user, p));
  const hidden = db.periods.filter((p) => !canSeeOwn(user, p) && p.status === 'closed');
  const mine = db.pastResults.filter((r) => r.userId === user.id);
  // FR20: viewing your own results is recorded
  useEffect(() => { for (const p of released) act('logView', { periodId: p.id, targetId: user.id, what: 'own' }); }, [released.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {myClasses.length > 0 && open.length > 0 && (
        <Card title="Student response progress for my classes">
          <p className="muted">At least half of the class plus one must answer, or that class is left out of your result. Reminding your students helps.</p>
          {open.flatMap((p) => myClasses.map((s) => {
            const st = sectionStats(db, p.id, s.id);
            return (
              <div key={p.id + s.id} className="meter-row big">
                <span><b>{s.code}</b> <span className="muted">{s.subject}{open.length > 1 ? ` · ${p.name}` : ''}</span></span>
                <Meter value={st.rate} mark={THRESHOLD} />
                <b>{st.responded}/{st.required}</b>
                {!st.required ? <span className="muted">no tasks yet</span> : st.belowHalf ? <Badge kind="overdue">needs {st.needed - st.responded} more</Badge> : <Badge kind="completed">enough responses</Badge>}
              </div>
            );
          }))}
        </Card>
      )}
      {released.length === 0 && (
        <Card><Empty icon="clock" title="Your results have not been released yet">HR releases results to you after the Vice Presidents have reviewed and approved them.</Empty></Card>
      )}
      {[...released].reverse().map((p) => (
        <Card key={p.id} title={p.name} actions={<PrintButton />}>
          <ResultCard res={computeTarget(db, p.id, user.id)} db={db} periodId={p.id} own />
        </Card>
      ))}
      {hidden.length > 0 && <p className="muted">Not yet released to you: {hidden.map((p) => `${p.name} (${STAGE_LABEL[p.releaseStage]})`).join('; ')}.</p>}
      {mine.length > 0 && <Card title="Earlier records (before evalU)"><PastRecords userId={user.id} /></Card>}
      <details className="note"><summary>How scores are calculated</summary><RuleNote /><p>Your final score combines each evaluator group's average using the weights set by HR. If a group has no valid result (for example, the dean did not evaluate), its weight is removed and the score is computed over the remaining groups. The final score is rounded to two decimal places.</p></details>
    </>
  );
}
