import { useState } from 'react';
import { useApp } from '../lib/store';
import { GROUPS, taskStatus, userById, instrumentFor, targetType, periodById } from '../lib/logic';
import { encryptText } from '../lib/crypto';
import { Card, StatusBadge } from '../ui';

export default function Tasks() {
  const { db, user } = useApp();
  const [openId, setOpenId] = useState(null);
  const [done, setDone] = useState(null);
  const mine = db.tasks.filter((t) => t.evaluatorId === user.id && periodById(db, t.periodId).status === 'open');
  const counts = { pending: 0, completed: 0, overdue: 0 };
  mine.forEach((t) => counts[taskStatus(db, t)]++);

  if (openId) return <EvalForm taskId={openId} onClose={() => setOpenId(null)} onDone={(m) => { setDone(m); setOpenId(null); }} />;
  return (
    <>
      {done && <div className="note ok">{done}</div>}
      <Card title="My evaluation tasks">
        <p className="muted">
          Pending: {counts.pending} · Completed: {counts.completed} · Overdue: {counts.overdue}
        </p>
        {mine.length === 0 ? <p>No evaluation tasks are assigned to you in an open period.</p> : (
          <table>
            <thead><tr><th>Evaluating</th><th>Role evaluated as</th><th>Class</th><th>Period</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {mine.map((t) => {
                const tg = userById(db, t.targetId), p = periodById(db, t.periodId), s = taskStatus(db, t);
                const sec = db.sections.find((x) => x.id === t.sectionId);
                return (
                  <tr key={t.id}>
                    <td>{tg.name}</td><td>{GROUPS[t.group]}</td><td>{sec ? `${sec.code} – ${sec.subject}` : '—'}</td>
                    <td>{p.name}</td><td>{p.deadline}</td><td><StatusBadge s={s} /></td>
                    <td>{s !== 'completed' ? <button onClick={() => { setDone(null); setOpenId(t.id); }}>{t.draft ? 'Continue' : 'Open form'}</button> : <span className="muted">Submitted</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function EvalForm({ taskId, onClose, onDone }) {
  const { db, update } = useApp();
  const task = db.tasks.find((t) => t.id === taskId);
  const target = userById(db, task.targetId);
  const ins = instrumentFor(db, targetType(db, target), task.group);
  const [answers, setAnswers] = useState(task.draft?.answers || {});
  const [comment, setComment] = useState(task.draft?.comment || '');
  const [errors, setErrors] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const hasComment = task.group === 'DEAN' || task.group === 'CHAIR';
  const crit = (id) => db.criteria.find((c) => c.id === id)?.text || id;

  const saveDraft = (msg) => {
    update((d) => { d.tasks.find((t) => t.id === taskId).draft = { answers, comment }; });
    if (msg) onClose();
  };
  const tryConfirm = () => {
    const missing = ins.items.filter((it) => answers[it.criterionId] == null).map((it) => it.criterionId);
    setErrors(missing);
    if (!missing.length) setConfirm(true);
  };
  const submit = async () => {
    const enc = comment.trim() ? await encryptText(comment.trim()) : null;
    update((d) => {
      const t = d.tasks.find((x) => x.id === taskId);
      t.response = {
        answers, weights: Object.fromEntries(ins.items.map((it) => [it.criterionId, it.weight])),
        comment: enc, submittedAt: new Date().toISOString(),
      };
      t.draft = null;
    });
    onDone(`Your evaluation of ${target.name} was submitted. Thank you.`);
  };

  return (
    <Card title={`Evaluation form – ${target.name}`} actions={<button className="ghost" onClick={onClose}>Back</button>}>
      <p className="muted">Evaluating as: {GROUPS[task.group]}. Rate each item from 1 (lowest) to 5 (highest). Your answers are saved if you leave and come back.</p>
      {errors.length > 0 && <div className="note warn">{errors.length} item(s) are not answered yet. They are highlighted below – answer them, then submit again. Your other answers are kept.</div>}
      {ins.items.map((it, i) => (
        <div key={it.criterionId} className={`q ${errors.includes(it.criterionId) ? 'err' : ''}`}>
          <div>{i + 1}. {crit(it.criterionId)}</div>
          <div className="scale">
            {[1, 2, 3, 4, 5].map((v) => (
              <label key={v}><input type="radio" name={it.criterionId} checked={answers[it.criterionId] === v}
                onChange={() => { setAnswers({ ...answers, [it.criterionId]: v }); setErrors(errors.filter((x) => x !== it.criterionId)); }} /> {v}</label>
            ))}
          </div>
        </div>
      ))}
      {hasComment && (
        <label className="block">Comments (optional; restricted and stored encrypted)
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
      )}
      {!confirm ? (
        <div className="row">
          <button onClick={tryConfirm}>Submit</button>
          <button className="ghost" onClick={() => saveDraft(true)}>Save and finish later</button>
        </div>
      ) : (
        <div className="note">
          Submit this evaluation of <b>{target.name}</b>? You cannot change it afterwards.
          <div className="row">
            <button onClick={submit}>Yes, submit</button>
            <button className="ghost" onClick={() => setConfirm(false)}>Go back</button>
          </div>
        </div>
      )}
    </Card>
  );
}
