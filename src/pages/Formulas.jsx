// "How the final rating is computed": HR sets it in plain words, tries it, and sends it to a VP.
// After the VP approves, HR starts using it. Old periods keep the formula they were computed with.
// The engine behind it is src/lib/formula.js.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import {
  TARGET_TYPES, AGGREGATIONS, MISSING_RULES, ROUNDING_METHODS, formGroups, formulaKey, methodOf, asPercentages,
  defaultFormula, policyFor, periodById, validateFormula, computeFinal, formulaWords, deptName,
} from '../lib/logic';
import { Card, Select, Badge, ask, useNavArgs } from '../ui';
import { AddGroup, BothLevels, Overview, TryIt, formulaNow } from './FormulaParts';
import FormulaApprovals from './FormulaApprovals';
import EvaluatorGroups from './EvaluatorGroups';

const STATUS = { draft: ['pending', 'Not sent yet'], pending: ['info', 'Waiting for VP'], approved: ['completed', 'Approved, ready to use'], scheduled: ['info', 'Starts next period'], active: ['completed', 'In use'], archived: ['muted', 'Old version'], rejected: ['overdue', 'Returned by VP'] };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const short = (txt) => txt.split(':')[0];

/** The settings, in plain words. Technical settings are under "More options". */
function FormulaForm({ f, setF, groups, groupNames, readOnly, onEditGroup }) {
  const set = (k, v) => setF({ ...f, [k]: v });
  const setComp = (i, k, v) => set('components', f.components.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const unused = groups.filter((g) => !f.components.some((c) => c.group === g));
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
      {!readOnly && unused.length > 0 && (
        <Select value="" onChange={(g) => g && set('components', [...f.components, { group: g, weight: weighted ? 0 : null, aggregation: g === 'ST' ? 'SECTION_AVERAGE' : 'AVERAGE' }])}>
          <option value="">+ Add a group…</option>
          {unused.map((g) => <option key={g} value={g}>{groupNames[g] || g}</option>)}
        </Select>
      )}
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

export default function Formulas() {
  const { db, user, act } = useApp();
  const names = Object.fromEntries((db.evaluatorGroups || []).map((g) => [g.id, g.name]));
  const words = (formula) => formulaWords(formula, names);
  const isHR = user.role === 'HR';
  const pendingAll = (db.formulas || []).filter((f) => f.status === 'pending');
  const args = useNavArgs(); // a notification can open one category
  const [tt, setTt] = useState(() => args.tt || (!isHR && pendingAll[0]?.targetType) || Object.keys(TARGET_TYPES)[0]);
  const deptKeys = [...new Set((db.formulas || []).filter((f) => f.targetType === tt && f.dept).map((f) => f.dept))];
  const [dept, setDept] = useState(() => (args.tt ? args.dept : !isHR && pendingAll[0]?.dept) || '');
  const key = formulaKey(tt, dept || null);
  const versions = (db.formulas || []).filter((f) => f.key === key).sort((a, b) => b.version - a.version);
  const active = versions.find((f) => f.status === 'active');
  const working = versions.find((f) => ['draft', 'pending', 'approved', 'scheduled', 'rejected'].includes(f.status));
  const baseline = formulaNow(db, tt, dept || null); // a department without its own formula uses the one for all departments
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [editGroup, setEditGroup] = useState(null); // the evaluator group being edited
  const [adding, setAdding] = useState(false); // the "Add evaluator group" screen
  const editable = isHR && working && ['draft', 'rejected'].includes(working.status);
  const editor = useRef(null);
  const [rev, setRev] = useState(0); // a group was added to the draft on the server: read the draft again
  const [jump, setJump] = useState(false); // after "Change" in the table: bring the formula into view
  useEffect(() => { setF(working ? structuredClone(editable ? asPercentages(working.config) : working.config) : null); }, [working?.id, working?.status, rev]); // eslint-disable-line react-hooks/exhaustive-deps, react/set-state-in-effect
  const groups = formGroups(db, tt, { drafts: true }); // a group whose tool is still a draft can be put in a draft formula
  const errs = f ? validateFormula(f, { allowedGroups: formGroups(db, tt, { scheduled: true }), groupNames: names }) : [];
  const pick = (t, d, add = false) => { setTt(t); setDept(d); setMsg(''); setAdding(add); };
  const canAdd = isHR && (!working || ['draft', 'rejected'].includes(working.status));
  const added = (r) => {
    setAdding(false); setRev((n) => n + 1); setJump(true);
    setMsg(`${r.name} added to a draft formula.${r.toolReady ? '' : ' Next: finish its tool under Evaluation tools and click "Use this version". Then send the formula to the VP.'}`);
  };
  useEffect(() => { if (jump && f) { editor.current?.scrollIntoView({ block: 'start' }); setJump(false); } }, [jump, f]); // eslint-disable-line react/set-state-in-effect
  const dirty = working && f && JSON.stringify(f) !== JSON.stringify(working.config);
  const who = `${TARGET_TYPES[tt]}${dept ? ` (${deptName(db, dept)} only)` : ''}`;

  /** Change the formula of a category: continue the one in progress, or start a draft from the formula in use. */
  const change = async (t, d) => {
    if (t !== tt || d !== dept) pick(t, d);
    const k = formulaKey(t, d || null);
    if (!(db.formulas || []).some((x) => x.key === k && ['draft', 'pending', 'approved', 'scheduled', 'rejected'].includes(x.status))) {
      const config = structuredClone(asPercentages(formulaNow(db, t, d || null)));
      config.name = `${TARGET_TYPES[t]}${d ? ` – ${deptName(db, d)}` : ''}`;
      // a department's first formula has its own dates, not those of the formula it is copied from
      if (d && config.dept !== d) { config.effectiveFrom = ''; config.effectiveUntil = ''; }
      config.effectiveFrom ||= ''; config.effectiveUntil ||= '';
      delete config.id; delete config.version; delete config.key; delete config.dept;
      if (!(await act('saveFormulaDraft', { targetType: t, dept: d || null, config }))) return;
      setMsg('Make your changes below, try them, then send them to the VP.');
    }
    setJump(true);
  };
  const save = async () => { if (await act('saveFormulaDraft', { id: working.id, config: f })) setMsg('Saved.'); };
  const send = async () => {
    if (dirty && !(await act('saveFormulaDraft', { id: working.id, config: f }))) return;
    const basis = await ask('Send to the VP for approval?', 'Write where this rule comes from (the committee decision or memo).', { ok: 'Send to VP', input: 'e.g. Evaluation Tool Committee resolution no. 3, s. 2026' });
    if (basis && await act('submitFormula', { id: working.id, basis })) setMsg('Sent. The VPs were notified.');
  };
  const use = async () => {
    if (!(await ask('Start using this formula now?', 'Open periods with no answers yet for this group, and every new period, will use it. Periods that already have answers keep their old formula, so no result changes.', { ok: 'Start now' }))) return;
    const r = await act('activateFormula', { id: working.id, when: 'now' });
    if (r) setMsg(`Now in use.${r.kept ? ` ${r.kept} open period(s) already had answers and keep the old formula.` : ''}`);
  };
  const later = async () => {
    if (!(await ask('Start with the next evaluation period?', 'The formula in use stays until you create the next evaluation period under Dates & release. That new period will use this one.', { ok: 'Start next period' }))) return;
    if (await act('activateFormula', { id: working.id, when: 'next' })) setMsg('Set. It starts when you create the next evaluation period.');
  };

  return (
    <>
      {isHR && <div className="note"><b>One place for scoring percentages and calculation.</b> Every category has its own formula. Click <b>Change</b> beside a category, set its evaluator groups and percentages, then try it. Send HRMC-approved changes to a VP; past results keep the formula they used.</div>}
      {msg && <div className="note ok">{msg}</div>}
      {!isHR && <FormulaApprovals first={args.tt ? formulaKey(args.tt, args.dept || null) : null} />}
      <Overview tt={tt} dept={dept} onPick={pick} onChange={isHR ? change : null} />
      <Card title={`Rating formula: ${who}`} actions={<span className="row" style={{ margin: 0 }}>
        <Select value={dept} onChange={(v) => pick(tt, v)} aria-label="Department">
          <option value="">All departments</option>
          {db.departments.filter((d) => (isHR && d.active !== false) || deptKeys.includes(d.id)).map((d) => <option key={d.id} value={d.id}>Only {d.name}</option>)}
        </Select>
      </span>}>
        <p className="muted">{isHR ? 'To give one department its own formula, choose it at the top right, then click Change formula.' : 'This is what counts now. Old results never change.'}</p>
        <div className="fx-now">
          <span className="muted">{who} now:</span>
          <b className="fx-sentence">{words(baseline)}</b>
          <span className="muted small">If a group has no rating: {short(MISSING_RULES[baseline.missing]).toLowerCase()}. Rounded to {baseline.rounding.decimals} decimals.{active?.meta.basis ? ` Basis: ${active.meta.basis}.` : ''}</span>
          {!active && <span className="note warn small">This is the <b>starting formula</b> that came with evalU. If the school uses a different one, {isHR ? 'click Change formula' : 'HR can change it'}.</span>}
        </div>
        {isHR && !working && <div className="row"><button onClick={() => change(tt, dept)}>Change formula</button>{canAdd && <button className="ghost" onClick={() => setAdding(true)}>+ Add evaluator group</button>}</div>}
      </Card>

      {adding && isHR && <AddGroup tt={tt} dept={dept} working={working} base={asPercentages(working ? working.config : baseline)} onCategory={(t, d) => pick(t, d, true)} onDone={added} onCancel={() => setAdding(false)} />}
      <span ref={editor} />
      {isHR && working && f && (
        <Card title={`New formula for ${who}`} actions={<Badge kind={STATUS[working.status][0]}>{STATUS[working.status][1]}</Badge>}>
          {working.status === 'rejected' && <div className="note warn">The VP returned it: "{working.meta.rejectReason}". Fix it and send it again.</div>}
          {working.status === 'pending' && <div className="note">Basis: <b>{working.meta.basis}</b>. Waiting for the VP.</div>}
          {working.status === 'scheduled' && <div className="note">Approved by {working.meta.approvedBy}. It starts when HR creates the next evaluation period. Until then, {who} keep the formula in use now.</div>}
          {editable && working.config.method !== 'WEIGHTED_AVERAGE' && <div className="note">This draft used another way of combining scores. It now uses percentages: check them, then save.</div>}
          <div className="fx-now"><b className="fx-sentence">{words(f)}</b></div>
          <FormulaForm f={f} setF={setF} groups={groups} groupNames={names} readOnly={!editable} onEditGroup={setEditGroup} />
          {errs.length > 0 && editable && <div className="note warn"><b>Before sending, fix:</b><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          <TryIt key={working.id + f.method} db={db} tt={tt} dept={dept || null} draft={f} baseline={baseline} />
          <div className="row fx-actions">
            {editable && <><button disabled={errs.length > 0} onClick={send}>Send to VP for approval</button>
              <button className="ghost" disabled={!dirty} onClick={save}>Save</button>
              {canAdd && <button className="ghost" disabled={dirty} title={dirty ? 'Save your changes first' : ''} onClick={() => setAdding(true)}>+ Add evaluator group</button>}
              <button className="ghost" onClick={async () => { if (await ask('Discard this new formula?', 'The formula in use stays the same.', { ok: 'Discard', danger: true })) act('deleteFormulaDraft', { id: working.id }); }}>Discard</button></>}
            {isHR && working.status === 'approved' && <><button onClick={use}>Start using it now</button><button className="ghost" onClick={later}>Start with the next period</button><span className="muted small">Not sure? Choose "Start with the next period": the period going on now is not affected.</span></>}
            {isHR && working.status === 'scheduled' && <button className="ghost" onClick={use}>Start using it now instead</button>}
          </div>
        </Card>
      )}

      {isHR && <EvaluatorGroups editing={editGroup} setEditing={setEditGroup} onAdd={() => setAdding(true)} addBlocked={adding ? 'Opened above' : editable && dirty ? 'Save your changes to the formula first' : ''} />}
      <BothLevels formula={baseline} tt={tt} dept={dept || null} />
      <Card title="Past formulas">
        {versions.length === 0 ? <p className="muted">No saved formula yet. {who} uses the starting formula shown above.</p> : (
          <table>
            <thead><tr><th>Formula</th><th>Status</th><th>Approved</th><th>Used in</th></tr></thead>
            <tbody>{versions.map((v) => (
              <tr key={v.id}>
                <td>{words(v.config)}<div className="muted small">Formula v{v.version} · {methodOf(v.config.method, v.config.methodVersion ?? 1)?.label || v.config.method} algorithm v{v.config.methodVersion ?? 1}{v.meta.basis ? ` · ${v.meta.basis}` : ''}</div></td>
                <td><Badge kind={STATUS[v.status][0]}>{STATUS[v.status][1]}</Badge></td>
                <td className="small">{v.meta.approvedBy ? <>{v.meta.approvedBy}<div className="muted">{day(v.meta.approvedAt)}</div></> : '—'}</td>
                <td className="small">{db.periods.filter((p) => Object.values(p.formulas || {}).some((x) => x.id === v.id)).map((p) => p.name).join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {isHR && <OldResultsCheck db={db} />}
    </>
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
