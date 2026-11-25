// "How the final rating is computed": HR sets it in plain words, tries it, and sends it to a VP.
// After the VP approves, HR starts using it. Old periods keep the formula they were computed with.
// The engine behind it is src/lib/formula.js.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import {
  TARGET_TYPES, AGGREGATIONS, MISSING_RULES, ROUNDING_METHODS, formGroups, formulaKey, methodOf, asPercentages,
  defaultFormula, policyFor, periodById, validateFormula, computeFinal, formulaWords, deptName,
} from '../lib/logic';
import { Card, Select, Badge, Tabs, ask, useNav, useNavArgs, usePages } from '../ui';
import { AddGroup, BothLevels, Overview, OwnFormulas, Shares, TryIt, formulaNow } from './FormulaParts';
import FormulaApprovals from './FormulaApprovals';
import EvaluatorGroups, { GroupForm } from './EvaluatorGroups';

const STATUS = { draft: ['pending', 'Not sent yet'], pending: ['info', 'Waiting for VP'], approved: ['completed', 'Approved, ready to use'], scheduled: ['info', 'Starts next period'], active: ['completed', 'In use'], archived: ['muted', 'Old version'], rejected: ['overdue', 'Returned by VP'] };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const short = (txt) => txt.split(':')[0];

/** The settings, in plain words. Technical settings are under "More options". */
function FormulaForm({ f, setF, groupNames, readOnly, onEditGroup, onAddGroup }) {
  const set = (k, v) => setF({ ...f, [k]: v });
  const setComp = (i, k, v) => set('components', f.components.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const total = f.components.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const m = methodOf(f.method, f.methodVersion ?? 1);
  const weighted = !!m?.usesWeights; // false only for a formula sent earlier with another method (read only)
  return (
    <div className="fx-form">
      <h4>1. Evaluator groups{weighted ? ' and their percentages' : ''}</h4>
      <table className="fx-comps">
        <tbody>
          {f.components.map((c, i) => (
            <tr key={c.group}>
              <td><b>{groupNames[c.group] || c.group}</b></td>
              {weighted && <td><input type="number" min="0" max="100" step="5" className="tiny" aria-label={`${groupNames[c.group] || c.group} percentage`} disabled={readOnly} value={c.weight ?? ''} onChange={(e) => setComp(i, 'weight', e.target.value === '' ? null : Number(e.target.value))} /> %</td>}
              {!readOnly && <td><span className="row" style={{ margin: 0 }}><button className="ghost" onClick={() => onEditGroup(c.group)}>Edit group</button><button className="ghost" onClick={() => set('components', f.components.filter((_, j) => j !== i))}>Remove</button></span></td>}
            </tr>
          ))}
          {weighted && <tr className="cat-total"><td>Total</td><td><b>{+total.toFixed(2)}%</b> {Math.abs(total - 100) > 1e-9 && <Badge kind="overdue">must be 100%</Badge>}</td>{!readOnly && <td />}</tr>}
        </tbody>
      </table>
      {!readOnly && <div className="row"><button className="ghost" onClick={onAddGroup}>+ Add a group to this formula</button></div>}
      <h4>2. If a group has no rating (for example, the Dean did not evaluate)</h4>
      <Select disabled={readOnly} value={f.missing} onChange={(v) => set('missing', v)}>{!f.missing && <option value="">Choose…</option>}{Object.entries(MISSING_RULES).filter(([k]) => !m || m.missingRules.includes(k)).map(([k, l]) => <option key={k} value={k}>{short(l)}</option>)}</Select>

      <details className="source">
        <summary>More options</summary>
        <div className="row">
          <label className="inline">Round to <Select disabled={readOnly} value={f.rounding.decimals} onChange={(v) => set('rounding', { ...f.rounding, decimals: Number(v) })}>{[0, 1, 2, 3, 4].map((d) => <option key={d} value={d}>{d} decimal{d === 1 ? '' : 's'}</option>)}</Select></label>
          <label className="inline">Rounding <Select disabled={readOnly} value={f.rounding.method} onChange={(v) => set('rounding', { ...f.rounding, method: v })}>{Object.entries(ROUNDING_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        </div>
        <div className="row">
          <label className="inline">Effective from <input type="date" disabled={readOnly} value={f.effectiveFrom || ''} onChange={(e) => set('effectiveFrom', e.target.value)} /></label>
          <label className="inline">Effective until <input type="date" disabled={readOnly} value={f.effectiveUntil || ''} onChange={(e) => set('effectiveUntil', e.target.value)} /></label>
          <span className="muted small">Dates are matched against the period's start date. Leave blank for no date limit.</span>
        </div>
        <div className="row">
          <label className="inline">Give a final rating only when at least <input type="number" min="1" max={Math.max(1, f.components.length)} className="tiny" disabled={readOnly} value={f.minGroups} onChange={(e) => set('minGroups', Number(e.target.value))} /> group(s) have a rating</label>
        </div>
        <p>How many students of a class must answer is set once for everyone, under <b>Evaluation rules</b>.</p>
        {f.components.map((c, i) => (
          <div key={c.group} className="row">
            <label className="inline">{groupNames[c.group] || c.group}: combine their evaluations by <Select disabled={readOnly} value={c.aggregation} onChange={(v) => setComp(i, 'aggregation', v)}>
              {Object.entries(AGGREGATIONS).filter(([k]) => c.group === 'ST' || !['SECTION_AVERAGE', 'POOLED'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select></label>
            <label className="inline">{groupNames[c.group] || c.group}: transform each group's score <input className="wide mono" disabled={readOnly} value={c.transform || ''} placeholder="x (unchanged)" onChange={(e) => setComp(i, 'transform', e.target.value)} /></label>
          </div>
        ))}
      </details>
    </div>
  );
}

/** Scoring & calculation (HR) and Formula approvals (VPs): one part at a time, chosen in the bar above. */
export default function Formulas() {
  const { db, user } = useApp();
  const isHR = user.role === 'HR';
  const args = useNavArgs(); // a notification can open one category
  const waiting = (db.formulas || []).filter((f) => f.status === 'pending').length;
  const [tab, setTab] = useState(isHR ? 'formulas' : 'waiting');
  const [at, setAt] = useState(() => (isHR && args.tt ? { tt: args.tt, dept: args.dept || '' } : null)); // the category that is open
  const unsaved = useRef(false);
  const onUnsaved = useCallback((v) => { unsaved.current = v; }, []);
  const leave = async () => {
    if (unsaved.current && !(await ask('Leave without saving?', 'The changes you made to this formula are not saved.', { ok: 'Leave', danger: true }))) return false;
    unsaved.current = false;
    return true;
  };
  const open = async (next) => { if (await leave()) { setAt(next); window.scrollTo(0, 0); } };
  const show = async (k) => { if (await leave()) { setTab(k); setAt(null); window.scrollTo(0, 0); } };
  const tabs = [...(isHR ? [] : [['waiting', `Waiting for your approval (${waiting})`]]), ['formulas', isHR ? 'Formulas' : 'Formulas in use'], ...(isHR ? [['groups', 'Evaluator groups']] : []), ['history', 'History']];
  const bar = <Tabs tabs={tabs} value={tab} onChange={show} label="Parts of this page" />;

  if (tab === 'formulas' && at) return <Category key={at.tt + '|' + at.dept} tt={at.tt} dept={at.dept} bar={bar} onOpen={open} onUnsaved={onUnsaved} />;
  if (tab === 'groups') return <EvaluatorGroups bar={bar} />;
  return (
    <>
      {bar}
      {tab === 'waiting' && <FormulaApprovals first={args.tt ? formulaKey(args.tt, args.dept || null) : null} />}
      {tab === 'formulas' && <Overview onOpen={(tt, dept) => open({ tt, dept })} />}
      {tab === 'history' && <><PastFormulas />{isHR && <OldResultsCheck db={db} />}</>}
    </>
  );
}

/** One category (or one department's own formula of it) on its own page. */
function Category({ tt, dept, bar, onOpen, onUnsaved }) {
  const { db, user, act } = useApp();
  const go = useNav();
  const names = Object.fromEntries((db.evaluatorGroups || []).map((g) => [g.id, g.name]));
  const words = (formula) => formulaWords(formula, names);
  const isHR = user.role === 'HR';
  const versions = (db.formulas || []).filter((f) => f.key === formulaKey(tt, dept || null));
  const active = versions.find((f) => f.status === 'active');
  const working = versions.find((f) => ['draft', 'pending', 'approved', 'scheduled', 'rejected'].includes(f.status));
  const follow = !!working?.meta.follow; // it would give up its own formula
  const baseline = formulaNow(db, tt, dept || null); // a department without its own formula uses the one for all departments
  const editable = isHR && working && !follow && ['draft', 'rejected'].includes(working.status);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [part, setPart] = useState('formula');
  const [screen, setScreen] = useState(null); // 'add' (a group to this formula), 'group' (edit one), 'new' (create one)
  const [groupId, setGroupId] = useState(null);
  const [rev, setRev] = useState(0); // a group was added to the draft on the server: read the draft again
  useEffect(() => { setF(working ? structuredClone(editable ? asPercentages(working.config) : working.config) : null); }, [working?.id, working?.status, rev]); // eslint-disable-line react-hooks/exhaustive-deps, react/set-state-in-effect
  const errs = f && editable ? validateFormula(f, { allowedGroups: formGroups(db, tt, { scheduled: true }), groupNames: names }) : [];
  const dirty = !!(editable && f && JSON.stringify(f) !== JSON.stringify(asPercentages(working.config)));
  useEffect(() => { onUnsaved(dirty); }, [dirty, onUnsaved]);
  const name = TARGET_TYPES[tt], only = dept ? deptName(db, dept) : '';
  const who = `${name}${dept ? ` (${only} only)` : ''}`;

  /** Start a draft from the formula in use. */
  const change = async () => {
    const config = structuredClone(asPercentages(baseline));
    config.name = `${name}${dept ? ` – ${only}` : ''}`;
    // a department's first formula has its own dates, not those of the formula it is copied from
    if (dept && config.dept !== dept) { config.effectiveFrom = ''; config.effectiveUntil = ''; }
    config.effectiveFrom ||= ''; config.effectiveUntil ||= '';
    delete config.id; delete config.version; delete config.key; delete config.dept;
    if (await act('saveFormulaDraft', { targetType: tt, dept: dept || null, config })) { setPart('formula'); setMsg('Make your changes below, try them, then send them to the VP.'); }
  };
  const save = async () => { const r = await act('saveFormulaDraft', { id: working.id, config: f }); if (r) { setRev((n) => n + 1); setMsg('Saved.'); } return !!r; };
  const send = async () => {
    if (dirty && !(await save())) return;
    const basis = await ask('Send to the VP for approval?', 'Write where this rule comes from (the committee decision or memo).', { ok: 'Send to VP', input: 'e.g. Evaluation Tool Committee resolution no. 3, s. 2026' });
    if (basis && await act('submitFormula', { id: working.id, basis })) setMsg('Sent. The VPs were notified.');
  };
  const use = async () => {
    if (!(await ask(follow ? `${only} follows all departments again now?` : 'Start using this formula now?', 'Open periods with no answers yet for this group, and every new period, will use it. Periods that already have answers keep their old formula, so no result changes.', { ok: 'Start now' }))) return;
    const r = await act('activateFormula', { id: working.id, when: 'now' });
    if (r) setMsg(`Now in use.${r.kept ? ` ${r.kept} open period(s) already had answers and keep the old formula.` : ''}`);
  };
  const later = async () => {
    if (!(await ask('Start with the next evaluation period?', 'The formula in use stays until you create the next evaluation period under Dates & release. That new period will use this one.', { ok: 'Start next period' }))) return;
    if (await act('activateFormula', { id: working.id, when: 'next' })) setMsg('Set. It starts when you create the next evaluation period.');
  };
  const followAll = async () => {
    const basis = await ask(`${only} follows all departments again?`, `It gives up its own formula for ${name} and uses the one of all departments, now and when that changes. A VP approves it first. Write where this comes from (the committee decision or memo).`, { ok: 'Send to VP', input: 'e.g. Evaluation Tool Committee resolution no. 3, s. 2026' });
    if (basis && await act('followAllDepartments', { targetType: tt, dept, basis })) setMsg('Sent. The VPs were notified.');
  };
  const discard = async () => { if (await ask('Discard this new formula?', 'The formula in use stays the same.', { ok: 'Discard', danger: true })) { if (await act('deleteFormulaDraft', { id: working.id })) setMsg(null); } };
  // the screens work on the saved draft, so the changes made here are saved first
  const toAdd = async () => { if (dirty && !(await save())) return; setGroupId(null); setMsg(null); setScreen('add'); window.scrollTo(0, 0); };
  const toEdit = (id) => { setGroupId(id); setScreen('group'); window.scrollTo(0, 0); };
  const back = (then = null) => { setScreen(then); window.scrollTo(0, 0); };
  const added = (r) => {
    back(); setRev((n) => n + 1); setPart('formula');
    setMsg(r.toolReady ? `${r.name} is in the new formula.` : <>{r.name} is in the new formula. Next: finish its tool and click "Use this version", then send the formula to the VP. <button className="link" onClick={() => go('forms', { toolId: r.toolId })}>Open its tool</button></>);
  };
  if (screen === 'add') return <AddGroup who={who} tt={tt} dept={dept} base={asPercentages(working ? working.config : baseline)} first={groupId} onDone={added} onCancel={() => back()} onNewGroup={() => back('new')} />;
  if (screen === 'group' || screen === 'new') return <GroupForm g={screen === 'group' ? db.evaluatorGroups.find((x) => x.id === groupId) : null} backTo={screen === 'new' ? 'Back to adding a group' : `Back to ${name}`} onCancel={() => back(screen === 'new' ? 'add' : null)} onDone={(r) => { if (screen === 'new') { setGroupId(r.id); back('add'); } else back(); }} />;

  const parts = [['formula', 'Formula'], ['from', 'Where it comes from'], ...(dept || !isHR ? [] : [['depts', 'Departments']])];
  return (
    <>
      {bar}
      <button className="ghost back" onClick={() => onOpen(dept ? { tt, dept: '' } : null)}>‹ {dept ? `${name} (all departments)` : 'All formulas'}</button>
      {msg && <div className="note ok">{msg}</div>}
      <Card className="fx-head">
        <h2>{name}{dept && <span className="muted"> · only {only}</span>}</h2>
        <div className="fx-now">
          <span className="muted">Counts now{dept && !active ? ' (same as all departments)' : ''}:</span>
          <b className="fx-sentence">{words(baseline)}</b>
          <span className="muted small">If a group has no rating: {short(MISSING_RULES[baseline.missing]).toLowerCase()}. Rounded to {baseline.rounding.decimals} decimals.{active?.meta.basis ? ` Basis: ${active.meta.basis}.` : ''}</span>
        </div>
        {!dept && !active && !working && <div className="note warn small">This is the <b>starting formula</b> that came with evalU. If the school uses a different one, {isHR ? 'click Change formula' : 'HR can change it'}.</div>}
        {dept && active && <p className="muted small">{only} has its own formula, so it does not change when the formula of all departments changes.</p>}
        {isHR && !working && <div className="row"><button onClick={change}>{dept && !active ? 'Make its own formula' : 'Change formula'}</button><button className="ghost" onClick={toAdd}>+ Add a group to this formula</button>{dept && active && <button className="ghost" onClick={followAll}>Follow all departments again</button>}</div>}
        {working && part !== 'formula' && <p className="muted small">There is a new formula: <Badge kind={STATUS[working.status][0]}>{STATUS[working.status][1]}</Badge></p>}
      </Card>
      <Tabs tabs={parts} value={part} onChange={setPart} label={`Parts of ${name}`} />

      {part === 'formula' && isHR && working && f && (
        <Card title={follow ? 'Follow all departments again' : 'New formula'} actions={<Badge kind={STATUS[working.status][0]}>{STATUS[working.status][1]}</Badge>}>
          {working.status === 'rejected' && <div className="note warn">The VP returned it: "{working.meta.rejectReason}". {follow ? 'Discard it, or send a new one.' : 'Fix it and send it again.'}</div>}
          {working.status === 'pending' && <div className="note">Basis: <b>{working.meta.basis}</b>. Waiting for the VP.</div>}
          {working.status === 'scheduled' && <div className="note">Approved by {working.meta.approvedBy}. It starts when HR creates the next evaluation period. Until then, {who} keep the formula in use now.</div>}
          {editable && working.config.method !== 'WEIGHTED_AVERAGE' && <div className="note">This draft used another way of combining scores. It now uses percentages: check them, then save.</div>}
          {follow ? <p>{only} gives up its own formula and uses the one of all departments, now and when that changes: <b>{words(f)}</b></p> : <>
            <div className="fx-now"><b className="fx-sentence">{words(f)}</b></div>
            <FormulaForm f={f} setF={setF} groupNames={names} readOnly={!editable} onEditGroup={toEdit} onAddGroup={toAdd} />
            {errs.length > 0 && <div className="note warn"><b>Before sending, fix:</b><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          </>}
          <TryIt key={working.id + f.method} db={db} tt={tt} dept={dept || null} draft={f} baseline={baseline} />
          <div className="row fx-actions">
            {editable && <><button disabled={errs.length > 0} onClick={send}>Send to VP for approval</button><button className="ghost" disabled={!dirty} onClick={save}>Save</button></>}
            {isHR && ['draft', 'rejected'].includes(working.status) && <button className="ghost" onClick={discard}>Discard</button>}
            {isHR && working.status === 'approved' && <><button onClick={use}>Start using it now</button><button className="ghost" onClick={later}>Start with the next period</button><span className="muted small">Not sure? Choose "Start with the next period": the period going on now is not affected.</span></>}
            {isHR && working.status === 'scheduled' && <button className="ghost" onClick={use}>Start using it now instead</button>}
          </div>
        </Card>
      )}
      {part === 'formula' && (!isHR || !working) && <Card title="Who rates, and how much it counts"><Shares f={baseline} tt={tt} /></Card>}
      {part === 'from' && <BothLevels formula={baseline} tt={tt} dept={dept || null} />}
      {part === 'depts' && <OwnFormulas tt={tt} onOpen={(d) => onOpen({ tt, dept: d })} />}
    </>
  );
}

/** Past formulas of every category. */
function PastFormulas() {
  const { db } = useApp();
  const names = Object.fromEntries((db.evaluatorGroups || []).map((g) => [g.id, g.name]));
  const [tt, setTt] = useState('');
  const list = (db.formulas || []).filter((v) => !tt || v.targetType === tt).sort((a, b) => Object.keys(TARGET_TYPES).indexOf(a.targetType) - Object.keys(TARGET_TYPES).indexOf(b.targetType) || (a.dept || '').localeCompare(b.dept || '') || b.version - a.version);
  const { rows, bar } = usePages(list, tt, 10);
  return (
    <Card title="Past formulas" actions={<Select value={tt} onChange={setTt} aria-label="Who is rated"><option value="">Everyone rated</option>{Object.entries(TARGET_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}>
      {list.length === 0 ? <p className="muted">No saved formula yet: the starting formula is used.</p> : <>
        <table>
          <thead><tr><th>Who is rated</th><th>Formula</th><th>Status</th><th>Approved</th><th>Used in</th></tr></thead>
          <tbody>{rows.map((v) => (
            <tr key={v.id}>
              <td>{TARGET_TYPES[v.targetType]}{v.dept && <div className="muted small">only {deptName(db, v.dept)}</div>}</td>
              <td>{v.meta.follow ? 'Follow all departments again' : formulaWords(v.config, names)}<div className="muted small">Formula v{v.version} · {methodOf(v.config.method, v.config.methodVersion ?? 1)?.label || v.config.method} algorithm v{v.config.methodVersion ?? 1}{v.meta.basis ? ` · ${v.meta.basis}` : ''}</div></td>
              <td><Badge kind={STATUS[v.status][0]}>{v.meta.follow && v.status === 'archived' ? 'Done' : STATUS[v.status][1]}</Badge></td>
              <td className="small">{v.meta.approvedBy ? <>{v.meta.approvedBy}<div className="muted">{day(v.meta.approvedAt)}</div></> : '—'}</td>
              <td className="small">{db.periods.filter((p) => Object.values(p.formulas || {}).some((x) => x.id === v.id)).map((p) => p.name).join(', ') || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {bar}
      </>}
    </Card>
  );
}

/**
 * Old results stay the same: every result stored when a period was closed is computed again from its
 * stored ratings with the formula version it was stored with, and compared with the stored rating.
 */
function OldResultsCheck({ db }) {
  const [rows, setRows] = useState(null);
  const check = () => setRows((db.results || []).map((r) => {
    const d = r.data || {}, p = periodById(db, r.periodId);
    const key = d.formula?.key || '';
    // results stored before the whole formula was kept with them: the version fixed in the period
    const f = d.formula?.components ? d.formula : (p?.formulas || {})[key] || defaultFormula((p?.rules || db.rules)[key.split('|')[0]] || {}, policyFor(db, r.periodId));
    const again = computeFinal(f, Object.fromEntries(Object.entries(d.groups || {}).map(([g, x]) => [g, x.score ?? null]))).final;
    return { r, p, f, same: again === d.final, again };
  }));
  const periods = rows ? [...new Set(rows.map((x) => x.r.periodId))] : [];
  const bad = rows ? rows.filter((x) => !x.same) : [];
  const label = (x) => `${x.f.name || 'Starting formula'}${x.f.version ? ` v${x.f.version}` : ''} (${(methodOf(x.f.method, x.f.methodVersion ?? 1)?.label || x.f.method || '').toLowerCase()} algorithm v${x.f.methodVersion ?? 1})`;
  return (
    <Card title="Check old ratings" actions={<button className="ghost" onClick={check}>{rows ? 'Check again' : 'Check now'}</button>}>
      <p className="muted">Click "Check now" to make sure that changing the formula did not change any old rating.</p>
      {rows && (rows.length === 0 ? <p className="muted">No period has been closed yet, so there is nothing to check.</p> : <>
        <div className={`note ${bad.length ? 'warn' : 'ok'}`}>{bad.length ? `${bad.length} of ${rows.length} old ratings changed. See the list below.` : `All ${rows.length} old ratings are unchanged.`}</div>
        <table>
          <thead><tr><th>Period</th><th>Formula used</th><th>Ratings</th><th>Unchanged</th></tr></thead>
          <tbody>{periods.map((pid) => {
            const xs = rows.filter((x) => x.r.periodId === pid);
            const ok = xs.filter((x) => x.same).length;
            const used = [...new Set(xs.filter((x) => x.r.data.final != null).map(label))];
            return <tr key={pid}><td>{xs[0].p?.name || pid}</td><td className="small">{used.join('; ') || '—'}</td><td>{xs.length}</td><td>{ok === xs.length ? <Badge kind="completed">all {xs.length}</Badge> : <Badge kind="overdue">{ok} of {xs.length}</Badge>}</td></tr>;
          })}</tbody>
        </table>
        {bad.length > 0 && <ul>{bad.slice(0, 20).map((x) => <li key={x.r.periodId + x.r.targetId}>{db.users.find((u) => u.id === x.r.targetId)?.name}: saved {String(x.r.data.final)}, computed again {String(x.again)}</li>)}</ul>}
      </>)}
    </Card>
  );
}
