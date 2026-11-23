// Evaluation tools: the list of every tool, and one page per tool to read it or work on its draft.
// A tool in use is never edited directly: HR changes a draft, checks it, then uses it (server/actions.js).
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { TARGET_TYPES, CLASS_TYPES, deptName, groupName, effectiveWeights, sameTool, toolName, toolsOfPeriod, toolParts, toolProblems, toolStatus } from '../lib/logic';
import { Card, Select, Badge, SaveInput, Empty, newestFirst, usePages, useNavArgs, ask } from '../ui';
import { QuestionList } from './Tasks';

const STATUS = { 'in-use': ['completed', 'In use'], draft: ['pending', 'Draft'], scheduled: ['info', 'Starts next period'], old: ['muted', 'Old version'] };
const VARIANT_ORDER = ['', 'lab', 'skills', 'clin-mt', 'clin-pt', 'clin-dent']; // the everyday tool first
const STATUS_ORDER = ['draft', 'scheduled', 'in-use', 'old'];

const isUb = (i) => i.name.includes('(UB tool)');
const raters = (db, i) => (i.group === 'ST' ? 'Students' : groupName(db, i.group));
/** Which classes or people a tool is for, in plain words. */
function usedFor(db, i) {
  const kind = i.variant ? CLASS_TYPES[i.variant] : i.targetType === 'CI' ? 'Clinical area' : i.group === 'ST' && i.targetType === 'COLLEGE_FACULTY' && !i.dept ? 'Lecture classes' : '';
  return [kind, i.dept && `Only ${deptName(db, i.dept).replace(/\s*\([A-Z]+\)$/, '')}`].filter(Boolean).join(', ') || 'Everyone';
}
/** "60 / 35 / 5", or "Equal" when the tool has no part weights. */
export function weightsText(i) {
  const parts = toolParts(i);
  return parts.some((p) => Number(p.weight) > 0) ? parts.map((p) => p.weight ?? '?').join(' / ') : 'Equal';
}
const StatusOf = ({ i }) => <Badge kind={STATUS[toolStatus(i)][0]}>{STATUS[toolStatus(i)][1]}</Badge>;

export default function Tools() {
  const { db } = useApp();
  const args = useNavArgs();
  const [open, setOpen] = useState(args.toolId || null); // another page (Scoring & calculation) can ask for one tool
  const [filters, setFilters] = useState({ tt: '', grp: '', st: 'current', q: '', period: '' }); // kept while a tool is open
  const ins = db.instruments.find((i) => i.id === open);
  const go = (id) => { setOpen(id); window.scrollTo(0, 0); };
  return ins ? <ToolPage key={ins.id} ins={ins} onOpen={go} onBack={() => go(null)} /> : <ToolList onOpen={go} filters={filters} setFilters={setFilters} />;
}

/* ---------------- the list ---------------- */
function ToolList({ onOpen, filters, setFilters }) {
  const { db } = useApp();
  const { tt, grp, st, q } = filters;
  const period = db.periods.find((p) => p.id === filters.period);
  const set = (k) => (v) => setFilters({ ...filters, [k]: v });
  // a past period used versions that are old now, so choosing a period shows every version it used
  const setPeriod = (v) => setFilters({ ...filters, period: v, st: v ? '' : 'current' });
  const used = useMemo(() => (period ? toolsOfPeriod(db, period.id) : null), [db, period]);
  const s = q.trim().toLowerCase();
  const order = (db.evaluatorGroups || []).map((g) => g.id);
  const types = Object.keys(TARGET_TYPES);
  // an old form nobody can open (an empty custom form from an earlier version) still shows, so HR can finish it
  const list = db.instruments.filter((i) => (!used || used.has(i.id)) && (!tt || i.targetType === tt) && (!grp || i.group === grp)
    && (st === 'current' ? toolStatus(i) !== 'old' : !st || toolStatus(i) === st)
    && (!s || `${toolName(db, i)} ${raters(db, i)} ${usedFor(db, i)}`.toLowerCase().includes(s)))
    .sort((a, b) => types.indexOf(a.targetType) - types.indexOf(b.targetType) || order.indexOf(a.group) - order.indexOf(b.group)
      || (a.dept ? 1 : 0) - (b.dept ? 1 : 0) || VARIANT_ORDER.indexOf(a.variant || '') - VARIANT_ORDER.indexOf(b.variant || '') || usedFor(db, a).localeCompare(usedFor(db, b)) || STATUS_ORDER.indexOf(toolStatus(a)) - STATUS_ORDER.indexOf(toolStatus(b)) || (b.version || 1) - (a.version || 1));
  const { rows, bar } = usePages(list, `${tt}|${grp}|${st}|${s}|${filters.period}`, 10);
  const drafts = db.instruments.filter((i) => toolStatus(i) === 'draft').length;
  return (
    <>
      <div className="note"><b>These are the forms people answer.</b> Click a tool to read it. To change one, open it and click <b>Make changes</b>: you work on a draft, and people keep answering the current version until you use the new one.</div>
      <Card title={`Evaluation tools (${list.length})`}>
        <div className="row">
          <Select value={filters.period} onChange={setPeriod} aria-label="Period"><option value="">Any period</option>{newestFirst(db.periods).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}</Select>
          <Select value={tt} onChange={set('tt')} aria-label="Who is rated"><option value="">Everyone rated</option>{types.map((k) => <option key={k} value={k}>{TARGET_TYPES[k]}</option>)}</Select>
          <Select value={grp} onChange={set('grp')} aria-label="Rated by"><option value="">Rated by anyone</option>{(db.evaluatorGroups || []).filter((g) => db.instruments.some((i) => i.group === g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          <Select value={st} onChange={set('st')} aria-label="Status"><option value="current">Current tools and drafts</option><option value="in-use">In use</option><option value="draft">Drafts ({drafts})</option><option value="scheduled">Starts next period</option><option value="old">Old versions</option><option value="">All versions</option></Select>
          <input placeholder="Search a tool (optional)" value={q} onChange={(e) => set('q')(e.target.value)} />
          {(filters.period || tt || grp || q || st !== 'current') && <button className="ghost" onClick={() => setFilters({ tt: '', grp: '', st: 'current', q: '', period: '' })}>Clear filters</button>}
        </div>
        {period && <PeriodNote period={period} used={used} hasTasks={db.tasks.some((t) => t.periodId === period.id)} />}
        {list.length === 0 ? <Empty icon="form" title={period && !used.size ? 'No tool was used in this period' : 'No tools match'}>{period && !used.size ? 'Nobody answered an evaluation in it.' : 'Change the filters above.'}</Empty> : <>
          <table className="tool-list">
            <thead><tr><th>Tool</th><th>Who is rated</th><th>Rated by</th><th>Used for</th><th>Indicators</th><th>Part weights (%)</th>{period && <th>Evaluations in this period</th>}<th>{period ? 'Status now' : 'Status'}</th></tr></thead>
            <tbody>{rows.map((i) => {
              const bad = toolStatus(i) === 'in-use' && toolProblems(i).length > 0;
              return (
                <tr key={i.id}>
                  <td><button className="link tool-open" onClick={() => onOpen(i.id)}>{toolName(db, i)}</button> <span className="muted small">v{i.version || 1}</span></td>
                  <td>{TARGET_TYPES[i.targetType]}</td><td>{raters(db, i)}</td><td>{usedFor(db, i)}</td>
                  <td>{i.items.length}</td><td>{weightsText(i)}</td>
                  {period && <td>{periodCount(period, used.get(i.id))}</td>}
                  <td><StatusOf i={i} />{bad && <> <Badge kind="overdue">Needs fixing</Badge></>}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {bar}
        </>}
      </Card>
      <NewTool onOpen={onOpen} />
      <QuestionBank />
    </>
  );
}

/** "6 of 10 answered" while the period is open; "10 answered" after it is closed. */
const periodCount = (p, n) => (p.status === 'open' ? `${n.answered} of ${n.answered + n.waiting} answered` : `${n.answered} answered`);
/** What the list means for the chosen period. */
function PeriodNote({ period: p, used, hasTasks }) {
  const n = [...used.values()].reduce((a, x) => ({ answered: a.answered + x.answered, waiting: a.waiting + x.waiting }), { answered: 0, waiting: 0 });
  return (
    <div className="note">
      <b>{p.name}</b> ({p.status}): {used.size} tool{used.size === 1 ? '' : 's'}, {periodCount(p, n)}.{' '}
      {p.status !== 'open' ? 'These are the exact versions people answered, even if a newer version is in use now.'
        : hasTasks ? 'Evaluations not answered yet are counted on the version people would get now.'
          : 'Its evaluation tasks are not created yet; these are the tools they would use now.'}
    </div>
  );
}

/** A tool UB did not have before. It starts as an empty draft. */
function NewTool({ onOpen }) {
  const { db, act } = useApp();
  const groups = (db.evaluatorGroups || []).filter((g) => g.active !== false);
  const [f, setF] = useState({ name: '', targetType: 'COLLEGE_FACULTY', group: 'ST', dept: '', variant: '' });
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <details className="card advanced-panel">
      <summary><b>New tool</b> <span className="muted">· Only when UB adds a new evaluation tool. To change one that exists, open it above.</span></summary>
      <div className="advanced-content">
        <div className="row">
          <input className="wide" placeholder="Tool name, e.g. Faculty by their Peers" value={f.name} onChange={(e) => set('name')(e.target.value)} />
          <label className="inline">Who is rated <Select value={f.targetType} onChange={set('targetType')}>{Object.entries(TARGET_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          <label className="inline">Rated by <Select value={f.group} onChange={set('group')}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></label>
        </div>
        <div className="row">
          <label className="inline">For <Select value={f.dept} onChange={set('dept')}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>Only {d.name}</option>)}</Select></label>
          <label className="inline">Type of class <Select value={f.variant} onChange={set('variant')}>{Object.entries(CLASS_TYPES).map(([k, l]) => <option key={k} value={k}>{k ? l : 'Any / lecture'}</option>)}</Select></label>
          <button disabled={!f.name.trim()} onClick={async () => { const r = await act('createForm', f); if (r) onOpen(r.id); }}>Create draft</button>
        </div>
        <p className="muted small">A new rater (for example Peers) is easier to add under <b>Scoring &amp; calculation → Add evaluator group</b>: it makes the tool and the percentages together.</p>
      </div>
    </details>
  );
}

/** Every question ever used, for the rare case that one has to be corrected or removed. */
function QuestionBank() {
  const { db, act } = useApp();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const answered = new Set(db.tasks.filter((t) => t.response).flatMap((t) => Object.keys(t.response.answers)));
  const live = new Set(db.instruments.filter((i) => ['in-use', 'scheduled'].includes(toolStatus(i))).flatMap((i) => i.items.map((it) => it.criterionId)));
  const onAny = new Set(db.instruments.flatMap((i) => i.items.map((it) => it.criterionId)));
  const { rows, bar } = usePages(newestFirst(db.criteria).filter((c) => !s || c.text.toLowerCase().includes(s)), s);
  return (
    <details className="card advanced-panel">
      <summary><b>Question bank</b> <span className="muted">· Advanced. You don't need it to add an indicator: type it inside the tool.</span></summary>
      <div className="advanced-content">
        <div className="row"><input className="wide" placeholder="New question for the bank" value={text} onChange={(e) => setText(e.target.value)} />
          <button disabled={!text.trim()} onClick={async () => { if (await act('addCriterion', { text })) setText(''); }}>Add to the bank</button></div>
        <div className="row"><input className="wide" placeholder={`Search ${db.criteria.length} questions`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <table><tbody>{rows.map((c) => (
          <tr key={c.id}>
            <td>{answered.has(c.id) || live.has(c.id) ? <span>{c.text} <Badge kind="muted">{answered.has(c.id) ? 'answered' : 'on a tool in use'}</Badge></span> : <SaveInput className="wide" value={c.text} onSave={(t) => act('renameCriterion', { criterionId: c.id, text: t })} />}</td>
            <td><button className="ghost" disabled={answered.has(c.id) || onAny.has(c.id)} title={onAny.has(c.id) ? 'It is on a tool' : ''} onClick={async () => (await ask('Delete this question from the bank?', `"${c.text}"`, { ok: 'Delete question', danger: true })) && act('deleteCriterion', { criterionId: c.id })}>Delete</button></td>
          </tr>
        ))}</tbody></table>
        {bar}
      </div>
    </details>
  );
}

/* ---------------- one tool ---------------- */
function ToolPage({ ins, onOpen, onBack }) {
  const { db, act } = useApp();
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState('');
  const status = toolStatus(ins);
  const draft = status === 'draft';
  const parts = toolParts(ins);
  const problems = toolProblems(ins);
  const weighted = parts.some((p) => Number(p.weight) > 0);
  const total = parts.reduce((a, p) => a + (Number(p.weight) || 0), 0);
  const versions = db.instruments.filter((i) => i.id !== ins.id && sameTool(i, ins));
  const current = versions.find((i) => toolStatus(i) === 'in-use' && i.items.length);
  const working = versions.find((i) => i.status);
  const usedIn = useMemo(() => newestFirst(db.periods).map((p) => [p, toolsOfPeriod(db, p.id).get(ins.id)]).filter(([, n]) => n), [db, ins.id]);

  const change = async () => { const r = await act('reviseForm', { instrumentId: ins.id }); if (r) onOpen(r.id); };
  const discard = async () => {
    if (!(await ask(`Discard version ${ins.version}?`, current ? 'Your changes are deleted. People keep answering the version in use.' : 'This draft is deleted.', { ok: 'Discard', danger: true }))) return;
    if (await act('discardForm', { instrumentId: ins.id })) onOpen(current?.id || null);
  };
  const use = async () => {
    if (!(await ask(`Use version ${ins.version}?`, current ? 'It replaces the version in use. If people already answered that one in an open period, the new version waits for the next period, so nobody is rated on two different forms.' : 'People start answering this tool where it applies.', { ok: 'Use this version' }))) return;
    const r = await act('useForm', { instrumentId: ins.id });
    if (r) setMsg(r.scheduled ? 'Ready. People already answered the version before it, so this one starts when you create the next evaluation period.' : 'This version is now in use.');
  };
  const addPart = async () => {
    const name = await ask('Add a part', 'A part groups indicators and can have its own weight.', { ok: 'Add part', input: 'e.g. Assessment of learners', optional: true });
    if (name) act('addFormPart', { instrumentId: ins.id, name });
  };

  if (preview) return <ToolPreview ins={ins} onBack={() => setPreview(false)} />;
  return (
    <>
      <div className="row between no-print">
        <button className="ghost back" onClick={onBack}>‹ All evaluation tools</button>
        {versions.length > 0 && <label className="inline"><span className="muted">Version</span>
          <Select value={ins.id} onChange={onOpen}>{[ins, ...versions].sort((a, b) => (b.version || 1) - (a.version || 1)).map((i) => <option key={i.id} value={i.id}>v{i.version || 1} · {STATUS[toolStatus(i)][1]}</option>)}</Select></label>}
      </div>
      {msg && <div className="note ok">{msg}</div>}
      <Card title={toolName(db, ins)} actions={<StatusOf i={ins} />}>
        <div className="form-about">
          <span><b>{TARGET_TYPES[ins.targetType]}</b>, rated by <b>{raters(db, ins)}</b></span>
          <span>Used for: {usedFor(db, ins)}</span>
          <span>Version {ins.version || 1} · {ins.items.length} indicator{ins.items.length === 1 ? '' : 's'} · {isUb(ins) ? 'UB tool' : 'made in evalU'}</span>
        </div>
        {usedIn.length > 0 && <p className="muted small">Used in: {usedIn.map(([p, n]) => `${p.name} (${periodCount(p, n)})`).join(' · ')}</p>}
        {draft && !isUb(ins) && <label className="field-block"><span className="muted small">Tool name</span><SaveInput className="wide" value={ins.name === 'custom' ? '' : ins.name} placeholder={toolName(db, ins)} onSave={(name) => act('renameForm', { instrumentId: ins.id, name })} /></label>}
        {status === 'in-use' && <p className="muted">This is the version people answer. {working ? 'A new version is being prepared.' : 'To change it, click Make changes: you get a draft copy, and this one stays in use until you use the draft.'}</p>}
        {status === 'old' && <p className="muted">Kept with the results that used it. It can't be changed.</p>}
        {status === 'scheduled' && <div className="note">This version starts when you create the next evaluation period, because people already answered the version before it.</div>}
        {draft && (problems.length
          ? <div className="note warn"><b>Before you can use it:</b><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
          : <div className="note ok">This draft is complete. Preview it, then click <b>Use this version</b>.</div>)}
        {status === 'in-use' && problems.length > 0 && <div className="note warn"><b>Needs fixing:</b><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
        <div className="row">
          <button className="ghost" disabled={!ins.items.length} onClick={() => setPreview(true)}>Preview</button>
          {status === 'in-use' && (working ? <button onClick={() => onOpen(working.id)}>Open version {working.version} ({STATUS[working.status][1].toLowerCase()})</button> : <button onClick={change}>Make changes</button>)}
          {draft && <button disabled={problems.length > 0} onClick={use}>Use this version</button>}
          {status === 'scheduled' && <><button onClick={() => act('unscheduleForm', { instrumentId: ins.id })}>Back to draft</button><button className="ghost" onClick={use}>Try to start now</button></>}
          {(draft || status === 'scheduled') && <button className="ghost" onClick={discard}>Discard</button>}
        </div>
      </Card>

      {parts.map((p) => <PartCard key={p.name} ins={ins} part={p} parts={parts} editable={draft} weighted={weighted} />)}
      {!parts.length && <Card><Empty icon="form" title="No indicators yet">Add a part first, then type its indicators.</Empty></Card>}

      <Card>
        <div className="row between">
          <span><b>Total of the part weights:</b> {weighted ? <><b className={Math.abs(total - 100) > 0.05 ? 'warn-text' : ''}>{+total.toFixed(2)}%</b>{Math.abs(total - 100) > 0.05 && <> <Badge kind="overdue">must be 100%</Badge></>}</> : <span className="muted">no weights, every indicator counts the same</span>}</span>
          {draft && <button className="ghost" onClick={addPart}>+ Add a part</button>}
        </div>
        <p className="muted small">A part's weight is shared by its indicators, so a part counts the same however many indicators it has.</p>
      </Card>
    </>
  );
}

function PartCard({ ins, part, parts, editable, weighted }) {
  const { db, act } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const eff = effectiveWeights(ins);
  const sum = Object.values(eff).reduce((a, w) => a + w, 0);
  const run = (name, args) => act(name, { instrumentId: ins.id, ...args });
  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await run('addNewFormItem', { text, category: part.name })) setText('');
    setBusy(false);
  };
  const rename = async () => {
    const to = await ask(`Rename "${part.name}"`, '', { ok: 'Rename', input: part.name, optional: true });
    if (to) run('renameFormPart', { from: part.name, to });
  };
  const remove = async () => (await ask(`Remove "${part.name}"?`, part.items.length ? `Its ${part.items.length} indicator(s) are removed from this draft too.` : '', { ok: 'Remove part', danger: true })) && run('removeFormPart', { name: part.name });
  const onTool = new Set(ins.items.map((it) => it.criterionId));
  return (
    <Card title={part.name} actions={
      <span className="row tool-part-head">
        {editable
          ? <label className="inline">Weight <SaveInput type="number" min="0" max="100" step="1" className="tiny" aria-label={`Weight of ${part.name}`} value={part.weight ?? ''} onSave={(weight) => run('setFormCategoryWeight', { category: part.name, weight })} /> %</label>
          : <b>{part.weight != null ? `${part.weight}%` : weighted ? '—' : 'no weight'}</b>}
        {editable && <><button className="ghost" onClick={rename}>Rename</button><button className="ghost" onClick={remove}>Remove part</button></>}
      </span>}>
      {part.items.length === 0 && <p className="muted">No indicators in this part yet.</p>}
      <ol className="form-qs">
        {part.items.map((it, k) => (
          <Indicator key={it.criterionId} it={it} criterion={db.criteria.find((c) => c.id === it.criterionId)} share={sum ? eff[it.criterionId] / sum : 0}
            editable={editable} first={k === 0} last={k === part.items.length - 1} parts={parts} part={part} run={run} />
        ))}
      </ol>
      {editable && (
        <>
          <div className="row tool-add">
            <input className="wide" maxLength={300} placeholder={`Type a new indicator for "${part.name}"`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button disabled={!text.trim() || busy} onClick={add}>Add</button>
          </div>
          <BankPicker criteria={db.criteria.filter((c) => !onTool.has(c.id))} onPick={(criterionId) => run('addFormItem', { criterionId, category: part.name === 'General' ? '' : part.name })} />
        </>
      )}
    </Card>
  );
}

/** One indicator: read it, or (in a draft) reword, move, reorder or remove it. */
function Indicator({ it, criterion, share, editable, first, last, parts, part, run }) {
  const [edit, setEdit] = useState(null); // the text being typed
  const [to, setTo] = useState(part.name);
  const save = async () => {
    const r = await run('editFormItem', { criterionId: it.criterionId, text: edit });
    if (!r) return;
    setEdit(null);
    if (to !== part.name) await run('setFormItemCategory', { criterionId: r.criterionId, category: to === 'General' ? '' : to });
  };
  if (edit != null) {
    return (
      <li>
        <textarea className="wide" rows={2} maxLength={300} autoFocus value={edit} onChange={(e) => setEdit(e.target.value)} aria-label="Indicator" />
        <div className="row">
          {parts.length > 1 && <label className="inline small">Part <Select value={to} onChange={setTo}>{parts.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</Select></label>}
          {Number(it.weight) !== 1 && <label className="inline small">Item weight <SaveInput type="number" min="0" step="0.5" className="tiny" value={it.weight} onSave={(weight) => run('setFormItemWeight', { criterionId: it.criterionId, weight })} /></label>}
        </div>
        <div className="row"><button disabled={!edit.trim()} onClick={save}>Save</button><button className="ghost" onClick={() => setEdit(null)}>Cancel</button><span className="muted small">Only this tool changes. Results already collected keep the old wording.</span></div>
      </li>
    );
  }
  return (
    <li className={editable ? 'tool-item' : undefined}>
      <div className="form-q-text">{criterion?.text}
        {criterion?.levels && <div className="muted small">{criterion.levels.map((l, k) => `${k + 1} = ${l}`).join(' · ')}</div>}
        <span className="muted small"> · counts {(share * 100).toFixed(1)}% of this tool</span>
      </div>
      {editable && (
        <div className="form-q-tools">
          <button className="ghost" onClick={() => { setTo(part.name); setEdit(criterion?.text || ''); }}>Edit</button>
          <button className="ghost" disabled={first} onClick={() => run('moveFormItem', { criterionId: it.criterionId, dir: 'up' })} aria-label="Move up">↑</button>
          <button className="ghost" disabled={last} onClick={() => run('moveFormItem', { criterionId: it.criterionId, dir: 'down' })} aria-label="Move down">↓</button>
          <button className="ghost" onClick={async () => (await ask('Remove this indicator?', `"${criterion?.text || ''}"`, { ok: 'Remove', danger: true })) && run('removeFormItem', { criterionId: it.criterionId })}>Remove</button>
        </div>
      )}
    </li>
  );
}

/** Pick a question that already exists, by searching (not from a list of hundreds). */
function BankPicker({ criteria, onPick }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const found = s.length < 3 ? [] : criteria.filter((c) => c.text.toLowerCase().includes(s));
  return (
    <details className="source">
      <summary>Or choose one from the question bank</summary>
      <div className="row"><input className="wide" placeholder="Type at least 3 letters to search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {s.length >= 3 && (found.length === 0 ? <p>No question matches.</p> : (
        <ul className="plain-list">{found.slice(0, 8).map((c) => <li key={c.id} className="row between"><span>{c.text}</span><button className="ghost" onClick={() => onPick(c.id)}>Add</button></li>)}
          {found.length > 8 && <li className="muted">{found.length - 8} more; type more letters.</li>}</ul>
      ))}
    </details>
  );
}

/** The tool as its evaluators see it. Nothing is saved. */
function ToolPreview({ ins, onBack }) {
  const { db } = useApp();
  const [answers, setAnswers] = useState({});
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <>
      <button className="ghost back" onClick={onBack}>‹ Back to the tool</button>
      <div className="note"><b>Preview of version {ins.version || 1}.</b> This is what {raters(db, ins).toLowerCase()} will answer. Nothing you choose here is saved.</div>
      <QuestionList ins={ins} criteria={db.criteria} answers={answers} onAnswer={(id, v) => setAnswers({ ...answers, [id]: v })} />
    </>
  );
}
