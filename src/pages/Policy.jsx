// Policy & rules: the evaluation rules HR can change without a programmer.
// Every change is a new version with a reason; a closed period keeps the version it was evaluated under.
import { useState } from 'react';
import { useApp } from '../lib/store';
import { currentPolicy, fullPolicy, neededResponses, ruleWords, PARTICIPATION_RULES, bandTable, interpretation, DEFAULT_POLICY } from '../lib/logic';
import { Card, Select, Badge, ask } from '../ui';

const FIELD = {
  participationRule: 'Participation rule', participationPercent: 'Participation %', participationMin: 'Minimum answers (no rule)', bands: 'What each rating means', lowItem: 'Low question line',
  decimals: 'Decimal places', missingGroup: 'Missing evaluator group', minAnonymity: 'Minimum students for comments',
  approvalMode: 'VP approvals needed', approvalCount: 'Number of VPs',
};
const show = (k, v) => {
  if (k === 'participationRule') return PARTICIPATION_RULES[v]?.toLowerCase() || v;
  if (k === 'bands') return v.map((b) => Number(b).toFixed(2)).join(' / ');
  if (k === 'missingGroup') return v === 'reweight' ? 're-weight the others' : 'no final rating';
  if (k === 'approvalMode') return { all: 'every VP', any: 'any one VP', count: 'a set number' }[v] || v;
  if (k === 'participationPercent') return `${v}%`;
  return String(v);
};
const diff = (a, b) => Object.keys(FIELD).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

export default function Policy() {
  const { db, act } = useApp();
  const cur = currentPolicy(db);
  const [f, setF] = useState(() => structuredClone(cur));
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF({ ...f, [k]: v });
  const changed = diff(f, cur);
  const history = [...(db.policies || [])].reverse();
  const version = db.policies?.at(-1)?.version || 0;
  const examples = [10, 25, 40, 41];
  const bandOk = f.bands[0] > f.bands[1] && f.bands[1] > f.bands[2];
  const closedKeeping = db.periods.filter((p) => p.status !== 'open').length;
  // an open period somebody already answered in keeps its rules
  const open = db.periods.filter((p) => p.status === 'open');
  const keeping = open.filter((p) => db.tasks.some((t) => t.periodId === p.id && t.response)), following = open.filter((p) => !keeping.includes(p));
  const when = [following.length && `${following.map((p) => p.name).join(', ')} (nobody answered yet): the change applies at once.`, keeping.length && `${keeping.map((p) => p.name).join(', ')} (people already answered): keeps its rules. The change starts with the next period.`, !open.length && 'The change starts with the next period you create.'].filter(Boolean);

  const save = async () => {
    if (!(await ask('Save a new policy version?', `${changed.map((k) => `${FIELD[k]}: ${show(k, cur[k])} → ${show(k, f[k])}`).join('\n')}\n\n${when.join('\n')}\nClosed periods (${closedKeeping}) keep the rules they were evaluated under.`, { ok: 'Save new version' }))) return;
    const r = await act('setPolicy', { policy: f, reason });
    if (r) { setMsg(`Policy version ${r.version} saved. ${r.changed.length} rule(s) changed.${r.kept ? ' People already answered in the open period, so it keeps its rules; the change starts with the next period.' : ''}`); setReason(''); }
  };

  return (
    <>
      <div className="note"><b>These settings affect how every evaluation is counted.</b> Leave them unchanged unless HRMC has approved a policy change. Saving requires a reason; closed terms keep their original rules.</div>
      {msg && <div className="note ok">{msg}</div>}
      <Card title={`Evaluation rules · ${version ? `version ${version}` : "UB's starting rules"}`}>
        <p className="muted">These rules turn the answers into ratings. HR can change them when HRMC changes its policy. Each change is saved with a reason, and <b>closed periods keep the rules they used</b>, so past results never change.</p>

        <h4>1. When does a class count? (participation rule)</h4>
        <div className="fx-choices rule-choices">
          {['more', 'atleast'].map((k) => (
            <label key={k} className="inline fx-choice"><input type="radio" name="part-rule" checked={f.participationRule === k} onChange={() => set('participationRule', k)} /> <span>{PARTICIPATION_RULES[k]} <input type="number" className="tiny" aria-label={`${PARTICIPATION_RULES[k]} percent`} min="1" max={k === 'more' ? 99 : 100} disabled={f.participationRule !== k} value={f.participationPercent} onChange={(e) => set('participationPercent', Number(e.target.value))} /> % of the class must answer</span></label>
          ))}
          <label className="inline fx-choice"><input type="radio" name="part-rule" checked={f.participationRule === 'none'} onChange={() => set('participationRule', 'none')} /> <span>{PARTICIPATION_RULES.none}: a class counts with <input type="number" className="tiny" aria-label="Minimum answers" min="1" max="50" disabled={f.participationRule !== 'none'} value={f.participationMin} onChange={(e) => set('participationMin', Number(e.target.value))} /> answer(s) or more<span className="muted small"> · no class is left out for low participation, and there are no alerts or forecast</span></span></label>
        </div>
        {f.participationRule === 'none' && f.participationMin < 3 && <div className="note warn small">With very few answers, one student can be the whole score of a class, and a teacher may guess who answered. A minimum of 3 is safer.</div>}
        <table className="policy-ex"><thead><tr><th>Class size</th>{examples.map((n) => <th key={n}>{n}</th>)}</tr></thead>
          <tbody><tr><td>Answers needed</td>{examples.map((n) => <td key={n}><b>{neededResponses(n, f)}</b></td>)}</tr></tbody></table>
        <p className="muted small">A class counts when <b>{ruleWords(f)}</b> answered. The starting rule, more than 50%, is the same as HRMC's "half of the class plus one" for every class size (40 students → 21; 41 students → 21).</p>

        <h4>2. What each rating means</h4>
        <div className="row">
          {['Outstanding', 'Satisfactory', 'Fair'].map((w, i) => (
            <label key={w} className="inline">{w} from <input type="number" step="0.01" min="1" max="4" className="tiny" value={f.bands[i]} onChange={(e) => { const b = [...f.bands]; b[i] = Number(e.target.value); set('bands', b); }} /></label>
          ))}
          {!bandOk && <Badge kind="overdue">must go down: Outstanding &gt; Satisfactory &gt; Fair</Badge>}
        </div>
        {bandOk && <table className="policy-ex"><tbody>{bandTable(f).map(([range, i]) => <tr key={range}><td>{range}</td><td>{interpretation([...f.bands, 1][i], false, f)}</td></tr>)}</tbody></table>}

        <h4>3. Low questions</h4>
        <div className="row">
          <label className="inline">Flag questions averaging below <input type="number" step="0.01" min="1" max="4" className="tiny" value={f.lowItem} onChange={(e) => set('lowItem', Number(e.target.value))} /></label>
          <span className="muted small">Starting value 3.00 (where Satisfactory begins). Flagged questions show in Analytics.</span>
        </div>
        <p className="muted small">Evaluator percentages and how the final rating is computed are set together under <b>Scoring &amp; calculation</b>.</p>

        <h4>4. Confidentiality and release</h4>
        <div className="row">
          <label className="inline">Show students' comments about a teacher only when at least <input type="number" min="0" max="50" className="tiny" value={f.minAnonymity} onChange={(e) => set('minAnonymity', Number(e.target.value))} /> students answered</label>
        </div>
        <p className="muted small">With very few answers, a comment could be traced to one student, so it is hidden from the teacher, the dean and the VP. Students' submission times are never shown outside HR.</p>
        <div className="row">
          <label className="inline">VP approvals needed before release to faculty
            <Select value={f.approvalMode} onChange={(v) => set('approvalMode', v)}>
              <option value="all">every VP</option>
              <option value="any">any one VP</option>
              <option value="count">a set number of VPs</option>
            </Select></label>
          {f.approvalMode === 'count' && <label className="inline">how many <input type="number" min="1" max="20" className="tiny" value={f.approvalCount} onChange={(e) => set('approvalCount', Number(e.target.value))} /></label>}
        </div>
        <p className="muted small">"Any one VP" or a set number keeps one VP on leave from blocking every result. A VP can also return results to HR with a reason instead of approving.</p>

        <h4>Save as a new version</h4>
        {changed.length === 0 ? <p className="muted">No changes yet. Change a rule above to save a new version.</p> : (
          <>
            <div className="note small"><b>When it starts:</b> {when.join(' ')}</div>
            <ul className="policy-changes">{changed.map((k) => <li key={k}><b>{FIELD[k]}</b>: {show(k, cur[k])} → <b>{show(k, f[k])}</b></li>)}</ul>
            <div className="row">
              <input className="wide" placeholder="Reason for the change (required), e.g. HRMC memo no. 12, s. 2026" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button disabled={reason.trim().length < 5 || !bandOk} onClick={save}>Save new version</button>
              <button className="ghost" onClick={() => setF(structuredClone(cur))}>Undo changes</button>
            </div>
          </>
        )}
      </Card>

      <Card title="Version history">
        {history.length === 0 ? <p className="muted">No changes yet: every period uses UB's default rules.</p> : (
          <table>
            <thead><tr><th>Version</th><th>When</th><th>By</th><th>Reason</th><th>What changed</th></tr></thead>
            <tbody>{history.map((h, i) => {
              const prev = history[i + 1]?.policy || DEFAULT_POLICY;
              const now = fullPolicy(h.policy), was = fullPolicy(prev), ch = diff(now, was);
              return (
                <tr key={h.version}>
                  <td><b>v{h.version}</b>{i === 0 && <> <Badge kind="completed">in use</Badge></>}</td>
                  <td>{new Date(h.at).toLocaleString()}</td><td>{h.byName}</td><td>{h.reason}</td>
                  <td className="small">{ch.map((k) => `${FIELD[k]}: ${show(k, was[k])} → ${show(k, now[k])}`).join('; ') || '—'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        <p className="muted small">Which version each period uses is shown under Dates &amp; release. Every change is also in Change history.</p>
      </Card>
    </>
  );
}
