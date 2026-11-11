import { useState } from 'react';
import { useApp } from '../lib/store';
import { GROUPS, taskStatus, userById, formForTask, periodById, itemCategory, ratingWords, MAX_RATING, targetType, hasPlanBoxes, commentParts, packComment } from '../lib/logic';
import { Card, Badge, Avatar, Stat, Stats, Meter, Empty, Icon, dueText, pct } from '../ui';

export default function Tasks() {
  const { db, user } = useApp();
  const [openId, setOpenId] = useState(null);
  const [done, setDone] = useState(null);
  const mine = db.tasks.filter((t) => t.evaluatorId === user.id && periodById(db, t.periodId).status === 'open');
  const withStatus = mine.map((t) => ({ t, s: taskStatus(db, t) }));
  const todo = withStatus.filter((x) => x.s !== 'completed').sort((a, b) => (a.s === 'overdue' ? -1 : 0) - (b.s === 'overdue' ? -1 : 0));
  const finished = withStatus.filter((x) => x.s === 'completed');
  const overdue = todo.filter((x) => x.s === 'overdue').length;
  const nextDue = todo.map((x) => periodById(db, x.t.periodId).deadline).sort()[0];

  if (openId) return <EvalForm taskId={openId} onClose={() => setOpenId(null)} onDone={(m) => { setDone(m); setOpenId(null); }} />;
  if (!mine.length) return <Card><Empty icon="check" title="No evaluations assigned to you">When an evaluation period opens, the people you need to evaluate will appear here.</Empty></Card>;

  const open = (id) => { setDone(null); setOpenId(id); };
  return (
    <>
      {done && <div className="note ok"><Icon name="check" size={16} /> {done}</div>}
      {user.role === 'ST' && <StudentRuleNote />}
      <Stats>
        <Stat icon="list" label="To do" value={todo.length} sub={todo.length ? dueText(nextDue) : 'All done'} tone={todo.length ? '' : 'good'} />
        <Stat icon="check" label="Submitted" value={finished.length} sub={`${pct(finished.length / mine.length)} of your evaluations`} tone="good" />
        <Stat icon="clock" label="Overdue" value={overdue} sub={overdue ? 'Please finish these first' : 'Nothing overdue'} tone={overdue ? 'bad' : ''} />
      </Stats>
      <Card>
        <div className="meter-row big"><span><b>Your progress</b></span><Meter value={finished.length / mine.length} tone="brand" /><b>{finished.length} of {mine.length}</b></div>
      </Card>

      <h2 className="section-h">To do <span className="muted">({todo.length})</span></h2>
      {todo.length === 0
        ? <Card><Empty title="You're all done">Thank you! All your evaluations are submitted.</Empty></Card>
        : <div className="task-grid">{todo.map(({ t, s }) => <TaskCard key={t.id} t={t} s={s} onOpen={() => open(t.id)} />)}</div>}

      {finished.length > 0 && (
        <>
          <h2 className="section-h">Submitted <span className="muted">({finished.length})</span></h2>
          <div className="task-grid">{finished.map(({ t, s }) => <TaskCard key={t.id} t={t} s={s} />)}</div>
        </>
      )}
    </>
  );
}

/** IC6: students are told why every answer matters. */
function StudentRuleNote() {
  return (
    <div className="note"><Icon name="alert" size={16} /> <b>Your answer counts for your whole class.</b> A class's evaluation is used only if <b>more than half of the class (half plus one)</b> answers it. For example, in a class of 40, at least 21 students must answer. Your name is never shown to your teacher.</div>
  );
}

function TaskCard({ t, s, onOpen }) {
  const { db } = useApp();
  const tg = userById(db, t.targetId), p = periodById(db, t.periodId);
  const sec = db.sections.find((x) => x.id === t.sectionId);
  const ins = formForTask(db, t);
  const answered = t.draft ? Object.keys(t.draft.answers || {}).length : 0;
  return (
    <div className={`task-card ${s}`}>
      <div className="task-top">
        <Avatar name={tg.name} size={42} />
        <div>
          <b>{tg.name}</b>
          <div className="muted">{sec ? `${sec.code} · ${sec.subject}` : `as ${GROUPS[t.group]}`}</div>
        </div>
      </div>
      <div className="task-meta">
        {s === 'completed' ? <Badge kind="completed">submitted</Badge> : <Badge kind={s}>{s === 'overdue' ? 'overdue' : dueText(p.deadline)}</Badge>}
        {t.draft && s !== 'completed' && ins && <span className="muted">{answered} of {ins.items.length} answered</span>}
      </div>
      {onOpen && <button onClick={onOpen}>{t.draft ? 'Continue' : 'Start evaluation'} <Icon name="arrow" size={16} /></button>}
    </div>
  );
}

function EvalForm({ taskId, onClose, onDone }) {
  const { db, act } = useApp();
  const task = db.tasks.find((t) => t.id === taskId);
  const target = userById(db, task.targetId);
  const ins = formForTask(db, task);
  const sec = db.sections.find((x) => x.id === task.sectionId);
  const [answers, setAnswers] = useState(task.draft?.answers || {});
  const [comment, setComment] = useState(task.draft?.comment || '');
  // Dean/Principal and AP/PC/SH forms: two boxes, as on UB's paper form
  const twoBoxes = hasPlanBoxes(task.group, targetType(db, target));
  const saved = commentParts(task.draft?.comment);
  const [plan, setPlan] = useState(saved?.plan ?? '');
  const [improve, setImprove] = useState(saved?.improve ?? saved?.text ?? '');
  const finalComment = twoBoxes ? packComment(plan, improve) : comment;
  const [errors, setErrors] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const critOf = (id) => db.criteria.find((c) => c.id === id);
  const crit = (id) => critOf(id)?.text || id;
  // the form's categories in order, e.g. "Content knowledge and pedagogy (35%)"
  const parts = [];
  ins.items.forEach((it, i) => {
    const name = itemCategory(it);
    if (parts.at(-1)?.name !== name) parts.push({ name, weight: ins.categories?.[name], items: [] });
    parts.at(-1).items.push({ it, n: i + 1 });
  });
  const showHeads = parts.length > 1 || parts[0]?.name !== 'General';
  const answered = ins.items.filter((it) => answers[it.criterionId] != null).length;

  const saveDraft = async () => {
    setBusy(true);
    const ok = await act('saveDraft', { taskId, answers, comment: finalComment });
    setBusy(false);
    if (ok) onClose();
  };
  const tryConfirm = () => {
    const missing = ins.items.filter((it) => answers[it.criterionId] == null).map((it) => it.criterionId);
    setErrors(missing);
    if (!missing.length) setConfirm(true);
    else document.getElementById(`q-${missing[0]}`)?.scrollIntoView({ block: 'center' });
  };
  const submit = async () => {
    // The server checks every answer, fixes the weights and encrypts the comment.
    setBusy(true);
    const ok = await act('submitEvaluation', { taskId, answers, comment: finalComment });
    setBusy(false);
    if (ok) onDone(`Your evaluation of ${target.name} was submitted. Thank you.`);
    else setConfirm(false);
  };

  return (
    <>
      <button className="ghost back" onClick={onClose}><Icon name="back" size={16} /> Back to my evaluations</button>
      <Card className="eval-head">
        <div className="task-top">
          <Avatar name={target.name} size={52} />
          <div>
            <h2>{target.name}</h2>
            <div className="muted">{sec ? `${sec.code} · ${sec.subject} · ` : ''}You are evaluating as: {GROUPS[task.group]}</div>
          </div>
        </div>
        <div className="meter-row"><span>{answered} of {ins.items.length} answered</span><Meter value={answered / ins.items.length} tone="brand" /></div>
        <p className="muted">Rate each statement from <b>{MAX_RATING} (highest)</b> to <b>1 (lowest)</b>, like on the paper form. Your answers are private: the person you evaluate never sees your name.</p>
        <div className="scale-key">{ratingWords(ins).map((w, i) => <span key={w}><b>{i + 1}</b> {w}</span>).reverse()}</div>
        {task.group === 'ST' && <p className="muted">This class's evaluation counts only if more than half of the class (half plus one) answers.</p>}
      </Card>

      {errors.length > 0 && <div className="note warn"><Icon name="alert" size={16} /> {errors.length} item(s) are not answered yet. They are marked in red below. Your other answers are kept.</div>}

      {parts.map((p) => (
        <section key={p.name} className="q-part">
          {showHeads && <h3 className="q-head">{p.name}{p.weight != null && <span className="muted"> · {p.weight}%</span>}</h3>}
          {p.items.map(({ it, n: i }) => {
            const words = ratingWords(ins, critOf(it.criterionId));
            const own = words !== ratingWords(ins);
            return (
              <div key={it.criterionId} id={`q-${it.criterionId}`} className={`q ${errors.includes(it.criterionId) ? 'err' : ''} ${answers[it.criterionId] != null ? 'answered' : ''}`}>
                <div className="q-text"><span className="q-num">{i}</span>{crit(it.criterionId)}</div>
                <div className={`rating ${own ? 'rating-own' : ''}`} role="radiogroup" aria-label={`Rating for item ${i}`}>
                  {Array.from({ length: MAX_RATING }, (_, k) => MAX_RATING - k).map((v) => (
                    <label key={v} className={answers[it.criterionId] === v ? 'on' : ''} title={words[v - 1]}>
                      <input type="radio" name={it.criterionId} checked={answers[it.criterionId] === v}
                        onChange={() => { setAnswers({ ...answers, [it.criterionId]: v }); setErrors(errors.filter((x) => x !== it.criterionId)); }} />
                      <b>{v}</b><small>{words[v - 1]}</small>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <Card title={twoBoxes ? 'Development plan and areas to be improved (optional)' : 'Comments (optional)'}>
        <p className="muted">
          Your comment is stored encrypted and shown word for word in this person's results, grouped with other comments from {GROUPS[task.group]}, <b>without your name</b>.
          {task.group !== 'ST' && ' Because only one or two people evaluate in this group, the person may still guess who wrote it.'}
        </p>
        {twoBoxes ? <>
          <label className="field-block"><b>Employee's personal and professional development plan</b>
            <textarea rows={3} value={plan} maxLength={1500} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Will attend trainings and seminars in the discipline…" /></label>
          <label className="field-block"><b>Areas to be improved by the employee</b>
            <textarea rows={3} value={improve} maxLength={1500} onChange={(e) => setImprove(e.target.value)} placeholder="e.g. Submit requirements on time…" /></label>
        </> : <textarea rows={4} value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder="Write any comments about this person's performance…" />}
      </Card>

      <div className="action-bar">
        {!confirm ? (
          <>
            <span className="muted">{answered === ins.items.length ? 'All items answered. Ready to submit.' : `${ins.items.length - answered} item(s) left`}</span>
            <div className="row">
              <button className="ghost" onClick={saveDraft} disabled={busy}>{busy ? 'Saving…' : 'Save and finish later'}</button>
              <button onClick={tryConfirm} disabled={busy}>Submit evaluation</button>
            </div>
          </>
        ) : (
          <>
            <span>Submit your evaluation of <b>{target.name}</b>? You can't change it afterwards.</span>
            <div className="row">
              <button className="ghost" onClick={() => setConfirm(false)}>Go back</button>
              <button onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Yes, submit'}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
