// "How the final rating is computed": HR sets it in plain words, tries it, and sends it to a VP.
// After the VP approves, HR starts using it. Old periods keep the formula they were computed with.
// The engine behind it is src/lib/formula.js.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import {
  TARGET_TYPES, GROUPS, AGGREGATIONS, MISSING_RULES, ROUNDING_METHODS, formGroups, formulaKey, formulaSnapshot, methodOf, methodList,
  defaultFormula, currentPolicy, policyFor, periodById, validateFormula, computeFinal, formulaWords, howInWords, computeTarget, targetsOf, targetType, deptName,
} from '../lib/logic';
import { Card, Select, Badge, ask, fmt } from '../ui';

const STATUS = { draft: ['pending', 'Not sent yet'], pending: ['info', 'Waiting for VP'], approved: ['completed', 'Approved, ready to use'], scheduled: ['info', 'Starts next period'], active: ['completed', 'In use'], archived: ['muted', 'Old version'], rejected: ['overdue', 'Returned by VP'] };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const SAMPLE = { ST: 3.5, DEAN: 3.6, CHAIR: 3.4 };
const short = (txt) => txt.split(':')[0];
const words = (f) => formulaWords(f, GROUPS);
/** The computation in numbers, only when it is a simple sum (percentages or the same for all); otherwise nothing. */
const plainHow = (r) => (r.final != null && r.breakdown?.some((b) => b.share && b.contribution != null) ? howInWords(r) : '');

/** The settings, in plain words. Technical settings are under "More options". */
function FormulaForm({ f, setF, groups, readOnly }) {
  const set = (k, v) => setF({ ...f, [k]: v });
  const setComp = (i, k, v) => set('components', f.components.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const unused = groups.filter((g) => !f.components.some((c) => c.group === g));
  const total = f.components.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const m = methodOf(f.method);
  const weighted = !!m?.usesWeights;
  // a missing-group rule that does not work with the new method has to be chosen again
  const setMethod = (k) => setF({ ...f, method: k, missing: methodOf(k).missingRules.includes(f.missing) ? f.missing : '' });
  const choice = (x) => (
    <label key={x.id} className="inline fx-choice"><input type="radio" name="fx-method" disabled={readOnly} checked={f.method === x.id} onChange={() => setMethod(x.id)} /> <span>{x.label}{x.help && <span className="muted small"> · {x.help}</span>}</span></label>
  );
  return (
    <div className="fx-form">
      <h4>1. How are the groups combined?</h4>
      <div className="fx-choices">
        {methodList().filter((x) => !x.advanced).map(choice)}
      </div>
      <details className="fx-more" open={m?.advanced || undefined}>
        <summary>Other ways (special cases)</summary>
        <p className="muted small">Most schools use one of the two choices above. Example with Students 3.80, Dean 2.00 and Program Chair 3.60 (40/40/20): percentages give 3.04, "a low rating counts more" gives 2.91, "counts the most" gives 2.77.</p>
        <div className="fx-choices">{methodList().filter((x) => x.advanced).map(choice)}</div>
      </details>

      <h4>2. Which groups count{weighted ? ', and how much?' : '?'}</h4>
      <table className="fx-comps">
        <tbody>
          {f.components.map((c, i) => (
            <tr key={c.group}>
              <td><b>{GROUPS[c.group]}</b></td>
              {weighted && <td><input type="number" min="0" max="100" step="5" className="tiny" disabled={readOnly} value={c.weight ?? ''} onChange={(e) => setComp(i, 'weight', e.target.value === '' ? null : Number(e.target.value))} /> %</td>}
              {!readOnly && <td><button className="ghost" onClick={() => set('components', f.components.filter((_, j) => j !== i))}>Remove</button></td>}
            </tr>
          ))}
          {weighted && <tr className="cat-total"><td>Total</td><td><b>{+total.toFixed(2)}%</b> {Math.abs(total - 100) > 1e-9 && <Badge kind="overdue">must be 100%</Badge>}</td>{!readOnly && <td />}</tr>}
        </tbody>
      </table>
      {!readOnly && unused.length > 0 && (
        <Select value="" onChange={(g) => g && set('components', [...f.components, { group: g, weight: weighted ? 0 : null, aggregation: g === 'ST' ? 'SECTION_AVERAGE' : 'AVERAGE' }])}>
          <option value="">+ Add a group…</option>
          {unused.map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}
        </Select>
      )}
      {m?.usesExpression && (
        <label className="field">Your formula <span className="muted small">use these names: {f.components.map((c) => c.group).join(', ')} · e.g. 0.3*ST + 0.5*DEAN + 0.2*CHAIR</span>
          <input className="wide mono" disabled={readOnly} value={f.expression} placeholder="0.3*ST + 0.5*DEAN + 0.2*CHAIR" onChange={(e) => set('expression', e.target.value)} /></label>
      )}

      <h4>3. If a group has no rating (for example, the Dean did not evaluate)</h4>
      <Select disabled={readOnly} value={f.missing} onChange={(v) => set('missing', v)}>{!f.missing && <option value="">Choose…</option>}{Object.entries(MISSING_RULES).filter(([k]) => !m || m.missingRules.includes(k)).map(([k, l]) => <option key={k} value={k}>{short(l)}</option>)}</Select>

      <details className="source">
        <summary>More options</summary>
        <div className="row">
          <label className="inline">Round to <Select disabled={readOnly} value={f.rounding.decimals} onChange={(v) => set('rounding', { ...f.rounding, decimals: Number(v) })}>{[0, 1, 2, 3, 4].map((d) => <option key={d} value={d}>{d} decimal{d === 1 ? '' : 's'}</option>)}</Select></label>
          <label className="inline">Rounding <Select disabled={readOnly} value={f.rounding.method} onChange={(v) => set('rounding', { ...f.rounding, method: v })}>{Object.entries(ROUNDING_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        </div>
        <div className="row">
          <label className="inline">Give a final rating only when at least <input type="number" min="1" max={Math.max(1, f.components.length)} className="tiny" disabled={readOnly} value={f.minGroups} onChange={(e) => set('minGroups', Number(e.target.value))} /> group(s) have a rating</label>
        </div>
        {f.components.map((c, i) => (
          <div key={c.group} className="row">
            <label className="inline">{GROUPS[c.group]}: combine their evaluations by <Select disabled={readOnly} value={c.aggregation} onChange={(v) => setComp(i, 'aggregation', v)}>
              {Object.entries(AGGREGATIONS).filter(([k]) => c.group === 'ST' || !['SECTION_AVERAGE', 'POOLED'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select></label>
          </div>
        ))}
      </details>
    </div>
  );
}

/** "Try it": the current formula and the new one side by side, on one example and on a past period. */
function TryIt({ db, tt, dept, draft, baseline }) {
  if (!draft.method || !draft.components.length || !draft.missing) return <div className="fx-try"><h4>Try it</h4><p className="muted">Answer questions 1 to 3 above, then you can try the formula here.</p></div>;
  return <TryItReady db={db} tt={tt} dept={dept} draft={draft} baseline={baseline} />;
}
function TryItReady({ db, tt, dept, draft, baseline }) {
  const groups = [...new Set([...baseline.components, ...draft.components].map((c) => c.group))];
  const [scores, setScores] = useState(() => Object.fromEntries(groups.map((g) => [g, SAMPLE[g] ?? 3.5])));
  const sc = Object.fromEntries(groups.map((g) => [g, scores[g] === '' || scores[g] == null ? null : Number(scores[g])]));
  const now = computeFinal(baseline, sc), next = computeFinal(draft, sc);
  const closed = db.periods.filter((p) => p.status === 'closed');
  const [pid, setPid] = useState(closed.at(-1)?.id || '');
  const [showList, setShowList] = useState(false);
  const people = targetsOf(db).filter((u) => targetType(db, u) === tt && (!dept || u.dept === dept));
  const real = useMemo(() => (pid ? people.map((u) => ({ u, now: computeTarget(db, pid, u.id).final, next: computeTarget(db, pid, u.id, { formula: draft }).final }))
    .filter((r) => r.now != null || r.next != null) : []), [db, pid, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = real.filter((r) => r.now !== r.next);
  const tag = (r) => (r.final == null ? <Badge kind="overdue">no rating</Badge> : null);
  return (
    <div className="fx-try">
      <h4>Try it</h4>
      <p className="muted small">Type example ratings. Leave a box empty to see what happens when a group has no rating.</p>
      <div className="row">{groups.map((g) => (
        <label key={g} className="inline">{GROUPS[g]} <input type="number" step="0.01" min="1" max="4" className="tiny" value={scores[g] ?? ''} placeholder="none" onChange={(e) => setScores({ ...scores, [g]: e.target.value })} /></label>
      ))}</div>
      <div className="fx-compare">
        <div><span className="muted">Now</span><b>{fmt(now.final)}</b>{tag(now)}<span className="muted small">{plainHow(now)}</span></div>
        <div className="fx-arrow">→</div>
        <div><span className="muted">With this formula</span><b>{fmt(next.final)}</b>{tag(next)}<span className="muted small">{plainHow(next)}</span></div>
      </div>
      {closed.length > 0 && (
        <p>
          On <Select value={pid} onChange={setPid}>{closed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>:{' '}
          <b>{changed.length} of {real.length}</b> {TARGET_TYPES[tt].toLowerCase()} would get a different rating.{' '}
          {changed.length > 0 && <button className="link" onClick={() => setShowList(!showList)}>{showList ? 'Hide' : 'See who'}</button>}
          <span className="muted small"> (Nothing is changed: this is only a test.)</span>
        </p>
      )}
      {showList && changed.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Now</th><th>With this formula</th></tr></thead>
          <tbody>{changed.map((r) => <tr key={r.u.id}><td>{r.u.name}</td><td>{fmt(r.now)}</td><td><b>{fmt(r.next)}</b></td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

export default function Formulas() {
  const { db, user, act } = useApp();
  const isHR = user.role === 'HR';
  const types = Object.keys(TARGET_TYPES).filter((x) => formGroups(db, x).length);
  const pendingAll = (db.formulas || []).filter((f) => f.status === 'pending');
  const [tt, setTt] = useState(() => (!isHR && pendingAll[0]?.targetType) || types[0]);
  const deptKeys = [...new Set((db.formulas || []).filter((f) => f.targetType === tt && f.dept).map((f) => f.dept))];
  const [dept, setDept] = useState(() => (!isHR && pendingAll[0]?.dept) || '');
  const key = formulaKey(tt, dept || null);
  const versions = (db.formulas || []).filter((f) => f.key === key).sort((a, b) => b.version - a.version);
  const active = versions.find((f) => f.status === 'active');
  const working = versions.find((f) => ['draft', 'pending', 'approved', 'scheduled', 'rejected'].includes(f.status));
  const baseline = active ? formulaSnapshot(active) : defaultFormula(db.rules[tt] || {}, currentPolicy(db));
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setF(working ? structuredClone(working.config) : null); }, [working?.id, working?.status]); // eslint-disable-line react-hooks/exhaustive-deps, react/set-state-in-effect
  const groups = formGroups(db, tt);
  const errs = f ? validateFormula(f, { allowedGroups: groups, groupNames: GROUPS }) : [];
  const editable = isHR && working && ['draft', 'rejected'].includes(working.status);
  const dirty = working && f && JSON.stringify(f) !== JSON.stringify(working.config);
  const who = `${TARGET_TYPES[tt]}${dept ? ` (${deptName(db, dept)} only)` : ''}`;

  // start from the formula in use (a copy), or from nothing (HR decides every part)
  const start = async (from, blank = false) => {
    const config = blank
      ? { method: '', components: [], expression: '', missing: '', minGroups: 1, rounding: { decimals: 2, method: 'HALF_UP' } }
      : structuredClone(from?.config ?? baseline);
    config.name = `${TARGET_TYPES[tt]}${dept ? ` – ${deptName(db, dept)}` : ''}`;
    delete config.id; delete config.version; delete config.key; delete config.dept;
    if (await act('saveFormulaDraft', { targetType: tt, dept: dept || null, config })) setMsg('Make your changes below, try them, then send them to the VP.');
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
    if (!(await ask('Start with the next evaluation period?', 'The formula in use stays until you create the next evaluation period under Periods & release. That new period will use this one.', { ok: 'Start next period' }))) return;
    if (await act('activateFormula', { id: working.id, when: 'next' })) setMsg('Set. It starts when you create the next evaluation period.');
  };

  return (
    <>
      {isHR && <div className="note"><b>Most HR users do not need to change this.</b> This changes how group ratings are combined. Only make a change approved by HRMC; a VP must approve it before it can be used.</div>}
      {msg && <div className="note ok">{msg}</div>}
      {!isHR && pendingAll.length > 0 && (
        <Card title={`Waiting for your approval (${pendingAll.length})`}>
          <ul>{pendingAll.map((p) => <li key={p.id}><button className="link" onClick={() => { setTt(p.targetType); setDept(p.dept || ''); }}>{p.config.name}</button> <span className="muted">· sent by {p.meta.submittedBy}</span></li>)}</ul>
        </Card>
      )}
      <Card title="How the final rating is computed" actions={<span className="row" style={{ margin: 0 }}>
        <Select value={tt} onChange={(v) => { setTt(v); setDept(''); setMsg(''); }} aria-label="Who is evaluated">{types.map((x) => <option key={x} value={x}>{TARGET_TYPES[x]}</option>)}</Select>
        <Select value={dept} onChange={(v) => { setDept(v); setMsg(''); }} aria-label="Department">
          <option value="">All departments</option>
          {db.departments.filter((d) => isHR || deptKeys.includes(d.id)).map((d) => <option key={d.id} value={d.id}>Only {d.name}</option>)}
        </Select>
      </span>}>
        <p className="muted">{isHR ? 'Steps: change it here → try it → send it to the VP → after approval, start using it. Old results never change.' : 'HR changes the formula and sends it to you. Check it with "Try it", then approve it or return it to HR. Old results never change.'}</p>
        <div className="fx-now">
          <span className="muted">{who} now:</span>
          <b className="fx-sentence">{words(baseline)}</b>
          <span className="muted small">If a group has no rating: {short(MISSING_RULES[baseline.missing]).toLowerCase()}. Rounded to {baseline.rounding.decimals} decimals.{active?.meta.basis ? ` Basis: ${active.meta.basis}.` : ''}</span>
          {!active && <span className="note warn small">This is the <b>starting formula</b> that came with evalU. If the school uses a different one, {isHR ? 'click "Change this formula"' : 'HR can change it'}.</span>}
        </div>
        {isHR && !working && <div className="row"><button onClick={() => start(active)}>Change this formula</button><button className="ghost" onClick={() => start(null, true)}>Start a blank formula</button><span className="muted small">Blank: you choose every part yourself.</span></div>}
      </Card>

      {working && f && (
        <Card title={`New formula for ${who}`} actions={<Badge kind={STATUS[working.status][0]}>{STATUS[working.status][1]}</Badge>}>
          {working.status === 'rejected' && <div className="note warn">The VP returned it: "{working.meta.rejectReason}". Fix it and send it again.</div>}
          {working.status === 'pending' && <div className="note">Basis: <b>{working.meta.basis}</b>. {isHR ? 'Waiting for the VP.' : 'Check it with "Try it", then approve or return it.'}</div>}
          {working.status === 'scheduled' && <div className="note">Approved by {working.meta.approvedBy}. It starts when HR creates the next evaluation period. Until then, {who} keep the formula in use now.</div>}
          <div className="fx-now"><b className="fx-sentence">{words(f)}</b></div>
          <FormulaForm f={f} setF={setF} groups={groups} readOnly={!editable} />
          {errs.length > 0 && editable && <div className="note warn"><b>Before sending, fix:</b><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          <TryIt key={working.id + f.method} db={db} tt={tt} dept={dept || null} draft={f} baseline={baseline} />
          <div className="row fx-actions">
            {editable && <><button disabled={errs.length > 0} onClick={send}>Send to VP for approval</button>
              <button className="ghost" disabled={!dirty} onClick={save}>Save</button>
              <button className="ghost" onClick={async () => { if (await ask('Discard this new formula?', 'The formula in use stays the same.', { ok: 'Discard', danger: true })) act('deleteFormulaDraft', { id: working.id }); }}>Discard</button></>}
            {isHR && working.status === 'approved' && <><button onClick={use}>Start using it now</button><button className="ghost" onClick={later}>Start with the next period</button><span className="muted small">Not sure? Choose "Start with the next period": the period going on now is not affected.</span></>}
            {isHR && working.status === 'scheduled' && <button className="ghost" onClick={use}>Start using it now instead</button>}
            {user.role === 'DIR' && working.status === 'pending' && <>
              <button onClick={async () => { if (await ask('Approve this formula?', 'HR can then start using it. Old results do not change.', { ok: 'Approve' })) act('approveFormula', { id: working.id }); }}>Approve</button>
              <button className="ghost" onClick={async () => { const why = await ask('Return this formula to HR?', 'Write what needs to change.', { ok: 'Return to HR', danger: true, input: 'e.g. The percentages do not match the committee decision' }); if (why) act('rejectFormula', { id: working.id, reason: why }); }}>Return to HR</button>
            </>}
          </div>
        </Card>
      )}
      {!working && !isHR && <Card><p className="muted">Nothing is waiting for your approval for {who}.</p></Card>}

      <Card title="Past formulas">
        {versions.length === 0 ? <p className="muted">No saved formula yet. {who} uses the starting formula shown above.</p> : (
          <table>
            <thead><tr><th>Formula</th><th>Status</th><th>Approved</th><th>Used in</th></tr></thead>
            <tbody>{versions.map((v) => (
              <tr key={v.id}>
                <td>{words(v.config)}<div className="muted small">Version {v.version} · {methodOf(v.config.method)?.label || v.config.method}{v.meta.basis ? ` · ${v.meta.basis}` : ''}</div></td>
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
  const label = (x) => `${x.f.name || 'Starting formula'}${x.f.version ? ` v${x.f.version}` : ''} (${(methodOf(x.f.method)?.label || x.f.method || '').toLowerCase()})`;
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
