// UB's printed HRMC reports, laid out like the samples in "templates and for printing pdf/SAMPLE":
//   COMPREHENSIVE REPORT.pdf   one sheet per person: a column per evaluator group, final rating, interpretation
//   EVALUATION by the ....pdf  "Performance Evaluation": one sheet per evaluator group (per class for students)
//                              with a summary by category and the average of every question
//   VERBATIM.pdf               the written comments, by evaluator group
import { useState } from 'react';
import { useApp } from '../lib/store';
import {
  GROUPS, computeTarget, deptName, interpretation, INTERPRETATION_TABLE, round2, targetsOf, targetType,
  formOfTask, itemStats, itemCategory, responseScore, commentParts,
} from '../lib/logic';
import { Select, PrintButton, Empty } from '../ui';

/** "AY 2025-26 Term 1" -> { years: "2025-2026", term: "First Semester", short: "1st Semester" }. */
export function termParts(name = '') {
  const y = name.match(/(\d{4})\s*-\s*(\d{2,4})/);
  const years = y ? `${y[1]}-${y[2].length === 2 ? y[1].slice(0, 2) + y[2] : y[2]}` : '';
  const [term, short] = /summer/i.test(name) ? ['Summer', 'Summer']
    : /term\s*2|2nd|second/i.test(name) ? ['Second Semester', '2nd Semester']
      : /term\s*1|1st|first/i.test(name) ? ['First Semester', '1st Semester'] : ['', ''];
  return { years, term, short, plain: name.replace(/\s*\((current, )?sample\)/i, '') };
}
/** "AY 2025-26 Term 1" -> "First Semester SY 2025-2026" (the wording on UB's forms). */
export function semesterLabel(name = '') {
  const t = termParts(name);
  return t.term && t.years ? `${t.term} SY ${t.years}` : t.plain;
}

const COLUMN = {
  ST: "STUDENTS' EVALUATION", DEAN: "DEAN'S EVALUATION", CHAIR: "SH'S/PC'S/CH'S EVALUATION",
  PRIN: "PRINCIPAL'S EVALUATION", APRIN: "ASST. PRINCIPAL'S EVALUATION", SHEAD: "SUBJECT HEAD'S EVALUATION",
  FAC: "FACULTY'S EVALUATION", SEC: "SECRETARY'S EVALUATION", NTPHEAD: "HEAD'S EVALUATION", NTPSTAFF: "STAFF'S EVALUATION",
};
const columnFor = (type, g) => (type === 'DEAN' && g === 'CHAIR' ? "PROGRAM CHAIRS' EVALUATION" : type === 'CI' && g === 'DEAN' ? "DEAN'S/PC'S EVALUATION" : COLUMN[g] || `${GROUPS[g]?.toUpperCase()}'S EVALUATION`);
/** "BY THE DEAN AS A FACULTY", "BY THE AP/PC/SH AS A FACULTY" (VERBATIM.pdf) */
const BY = { ST: 'STUDENTS', DEAN: 'DEAN', CHAIR: 'AP/PC/SH', PRIN: 'PRINCIPAL', APRIN: 'AP/PC/SH', SHEAD: 'AP/PC/SH', FAC: 'FACULTY', SEC: 'SECRETARY', NTPHEAD: 'HEAD OF OFFICE', NTPSTAFF: 'OFFICE STAFF' };
const byFor = (type, g) => (type === 'DEAN' && g === 'CHAIR' ? 'PROGRAM CHAIRS' : type === 'CI' && g === 'DEAN' ? 'DEAN/PC' : BY[g] || GROUPS[g]?.toUpperCase());
const isNtp = (type) => String(type).startsWith('NTP');
const TITLE = { COLLEGE_FACULTY: 'Faculty', BASICED_TEACHER: 'Faculty', CI: 'Faculty', DEAN: 'Dean / Principal', NTP_STAFF: 'Personnel', NTP_HEAD: 'Personnel' };
const PERSON = { COLLEGE_FACULTY: 'Instructor', BASICED_TEACHER: 'Teacher', CI: 'Clinical Instructor', DEAN: 'Dean', NTP_STAFF: 'Employee', NTP_HEAD: 'Head of Office' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const two = (x) => (x == null ? '—' : round2(x).toFixed(2));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const schoolOf = (db, u) => (u.dept ? deptName(db, u.dept) : 'Non-teaching').replace(/\s*\([A-Z]+\)$/, '').toUpperCase();

/** A comment shown word for word; the two-box comments of supervisors are labelled. */
export function CommentText({ c }) {
  const p = commentParts(c);
  if (!p) return null;
  if (p.text != null) return <>{p.text}</>;
  return (
    <>
      {p.plan && <span className="c-part"><b>Development plan:</b> {p.plan}</span>}
      {p.improve && <span className="c-part"><b>Areas to be improved:</b> {p.improve}</span>}
    </>
  );
}

/** One Comprehensive Report sheet (COMPREHENSIVE REPORT.pdf). */
export function CompSheet({ res, period, ctrl, db }) {
  const groups = Object.entries(res.groups);
  const ntp = isNtp(res.type);
  const words = INTERPRETATION_TABLE.map(([range, i]) => [range, interpretation([4, 3.2, 2.7, 1][i], ntp).toUpperCase()]);
  return (
    <div className="comp-sheet">
      <div className="comp-head">
        <img src="/ub-logo.png" alt="University of Baguio" />
        <b>HUMAN RESOURCE MANAGEMENT CENTER</b>
        <span>{TITLE[res.type]} Evaluation Comprehensive Report</span>
        <span>{semesterLabel(period.name)}</span>
      </div>
      <div className="comp-ctrl">CTRL# <span>{ctrl}</span></div>
      <div className="comp-who">
        <span><b>{PERSON[res.type]}:</b> <u>{res.target.name}</u></span>
        <span><b>School:</b> <u className="comp-school">{schoolOf(db, res.target)}</u></span>
      </div>
      <table className="comp-table">
        <thead><tr>{groups.map(([g]) => <th key={g}>{columnFor(res.type, g)}</th>)}<th className="comp-final">FINAL RATING</th><th>RATING INTERPRETATION</th></tr></thead>
        <tbody><tr>{groups.map(([g, x]) => <td key={g}>{two(x.score)}</td>)}<td className="comp-final">{two(res.final)}</td><td>{res.final == null ? 'NO VALID RESULT' : interpretation(res.final, ntp).toUpperCase()}</td></tr></tbody>
      </table>
      <div className="comp-foot">
        <div>
          <p>This copy is computer generated form, if issued without alteration, this does not require signature.</p>
          {res.status === 'reweighted' && <p className="comp-note">Computed over {res.basis}%: no valid result from {res.missing.map((g) => GROUPS[g]).join(', ')}.</p>}
        </div>
        <table className="comp-key">
          <thead><tr><th colSpan={2}>RATING INTERPRETATION</th></tr></thead>
          <tbody>{words.map(([range, w]) => <tr key={range}><td>{range}</td><td>{w}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/** The answered evaluations of a person, one entry per printed "Performance Evaluation" sheet. */
export function evalSheetsOf(db, periodId, res) {
  const answered = db.tasks.filter((t) => t.periodId === periodId && t.targetId === res.targetId && t.response && !t.response.redacted);
  const out = [];
  for (const g of Object.keys(res.groups)) {
    if (g === 'ST') {
      // students: one sheet per class that counted (half of the class + 1 answered)
      for (const s of res.sections.filter((x) => x.valid)) out.push({ group: g, section: s.section, tasks: answered.filter((t) => t.group === g && t.sectionId === s.section.id) });
    } else out.push({ group: g, section: null, tasks: answered.filter((t) => t.group === g) });
  }
  return out.filter((x) => x.tasks.length);
}

/** One "Performance Evaluation" sheet (EVALUATION by the STUDENTS / PC / Principal.pdf). */
export function EvalSheet({ db, period, res, sheet }) {
  const { user } = useApp(); // other people's usernames are only sent to HR; your own you always know
  const ins = formOfTask(db, sheet.tasks[0]);
  const stats = new Map(itemStats(sheet.tasks).map((x) => [x.criterionId, x]));
  const text = (id) => db.criteria.find((c) => c.id === id)?.text || id;
  const cats = [];
  for (const it of ins?.items || []) {
    const name = itemCategory(it);
    let c = cats.find((x) => x.name === name);
    if (!c) { c = { name, weight: Number(ins.categories?.[name]) || 0, items: [] }; cats.push(c); }
    c.items.push({ id: it.criterionId, text: text(it.criterionId), mean: stats.get(it.criterionId)?.mean ?? null });
  }
  for (const c of cats) c.mean = mean(c.items.map((i) => i.mean).filter((x) => x != null));
  const weighted = cats.length > 0 && cats.every((c) => c.weight > 0);
  const overall = mean(sheet.tasks.map((t) => responseScore(t.response)).filter((x) => x != null));
  const named = !(cats.length === 1 && cats[0].name === 'General');
  const label = (c, i) => (named ? `${ROMAN[i] || i + 1}. ${c.name}` : 'Questions');
  const t = termParts(period.name);
  const rows = [
    ['Employee ID', res.target.username || (user?.id === res.targetId ? user.username : '')],
    ['Name', res.target.name.toUpperCase()],
    ...(sheet.section ? [['Subject', sheet.section.subject], ['Section', sheet.section.code]] : []),
    ['Department', schoolOf(db, res.target)],
    ['Respondents', sheet.tasks.length],
  ];
  return (
    <div className="ub-page eval-sheet">
      <div className="ub-mark" aria-hidden="true">HRMC</div>
      <div className="eval-head">
        <img src="/ub-logo.png" alt="University of Baguio" />
        <span>HUMAN RESOURCE MANAGEMENT CENTER</span>
        <span>Performance Evaluation</span>
        <span className="eval-term">{t.years ? `Academic Year ${t.years}` : t.plain}</span>
        {t.short && <span>{t.short}</span>}
      </div>
      <table className="eval-who"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}{k === 'Employee ID' ? '' : ':'}</th><td>{v}</td></tr>)}</tbody></table>
      <table className="eval-table">
        <thead><tr><th colSpan={2}>SUMMARY</th></tr></thead>
        <tbody>
          {named && cats.map((c, i) => <tr key={c.name}><td>{label(c, i)}</td><td>{two(weighted ? (c.mean ?? 0) * c.weight / 100 : c.mean)}</td></tr>)}
          <tr><td>OVER-ALL</td><td>{two(overall)}</td></tr>
          <tr><td>INTERPRETATION</td><td>{overall == null ? '—' : interpretation(overall, isNtp(res.type)).toUpperCase()}</td></tr>
        </tbody>
      </table>
      {cats.map((c, i) => (
        <table key={c.name} className="eval-table">
          <thead><tr><th colSpan={2}>{label(c, i)}</th></tr></thead>
          <tbody>{c.items.map((it, n) => <tr key={it.id}><td>{n + 1}. {it.text}</td><td>{two(it.mean)}</td></tr>)}</tbody>
        </table>
      ))}
    </div>
  );
}

/** The VERBATIM sheet: every written comment, by evaluator group (VERBATIM.pdf). */
export function VerbatimSheet({ db, period, res }) {
  const t = termParts(period.name);
  const what = { COLLEGE_FACULTY: 'Faculty', BASICED_TEACHER: 'Faculty', CI: 'Faculty', DEAN: 'Dean', NTP_STAFF: 'Personnel', NTP_HEAD: 'Personnel' }[res.type];
  // "... AS A FACULTY" / "AS A DEAN": the role the person was evaluated in
  const asA = { COLLEGE_FACULTY: 'FACULTY', BASICED_TEACHER: 'FACULTY', CI: 'CLINICAL INSTRUCTOR', DEAN: 'DEAN', NTP_STAFF: 'OFFICE STAFF', NTP_HEAD: 'HEAD OF OFFICE' }[res.type];
  const List = ({ items }) => <ul>{items.length ? items.map((x, i) => <li key={i}>{x}</li>) : <li />}</ul>;
  // like UB's VERBATIM: only the supervisors / co-workers (the student tool has no comment box)
  const groups = Object.keys(res.groups).filter((g) => g !== 'ST');
  return (
    <div className="ub-page verb-sheet">
      <div className="verb-head">
        <span className="verb-title">{t.years ? `AY ${t.years} ${t.term}` : t.plain} {what} Performance Evaluation</span>
        <span className="verb-name">{res.target.name.toUpperCase()}</span>
      </div>
      {groups.map((g) => {
        const tasks = db.tasks.filter((x) => x.periodId === period.id && x.targetId === res.targetId && x.group === g);
        const parts = tasks.map((x) => commentParts(x.response?.comment)).filter(Boolean);
        return (
          <section key={g}>
            <h4>BY THE {byFor(res.type, g)} AS A {asA}</h4>
            <h5>EMPLOYEE'S PERSONAL AND PROFESSIONAL DEVELOPMENT PLAN:</h5>
            <List items={parts.map((p) => p.plan).filter(Boolean)} />
            <h5>AREAS TO BE IMPROVED BY THE EMPLOYEE:</h5>
            <List items={parts.map((p) => p.improve ?? p.text).filter(Boolean)} />
          </section>
        );
      })}
      {!groups.length && <p>No evaluations by supervisors or co-workers in this period.</p>}
    </div>
  );
}

/** Everything UB prints for one person: the Comprehensive Report, then (if asked) the other sheets. */
export function UbPacket({ db, period, res, ctrl, what = 'all' }) {
  return (
    <>
      {(what === 'all' || what === 'comp') && <div className="ub-page"><CompSheet res={res} period={period} ctrl={ctrl} db={db} /></div>}
      {(what === 'all' || what === 'eval') && evalSheetsOf(db, period.id, res).map((sh) => <EvalSheet key={sh.group + (sh.section?.id || '')} db={db} period={period} res={res} sheet={sh} />)}
      {(what === 'all' || what === 'verb') && <VerbatimSheet db={db} period={period} res={res} />}
    </>
  );
}

const KINDS = { teach: 'Faculty and Clinical Instructors', dean: 'Deans and Principals', ntp: 'Non-teaching personnel' };
const kindOf = (type) => (type === 'DEAN' ? 'dean' : isNtp(type) ? 'ntp' : 'teach');
const WHAT = {
  comp: 'Comprehensive report (one sheet per person)',
  eval: 'Performance evaluation (per evaluator, every question)',
  verb: 'Verbatim (written comments)',
  all: 'All three, person by person',
};

/** HR: UB's printed reports for a department (or one person), ready to print or save as PDF. */
export function UbPrints({ periodId }) {
  const { db } = useApp();
  const period = db.periods.find((p) => p.id === periodId);
  const [what, setWhat] = useState('comp');
  const [dept, setDept] = useState('');
  const [kind, setKind] = useState('teach');
  const [who, setWho] = useState('');
  const [perPage, setPerPage] = useState('1');
  const people = targetsOf(db)
    .filter((u) => kindOf(targetType(db, u)) === kind && (!dept || u.dept === dept))
    .sort((a, b) => a.name.localeCompare(b.name));
  const results = people.filter((u) => !who || u.id === who).map((u) => computeTarget(db, periodId, u.id))
    .filter((r) => Object.values(r.groups).some((g) => (what === 'comp' ? g.required : g.responded > 0)));
  const ctrl = (r) => people.findIndex((u) => u.id === r.targetId) + 1;
  const pages = what === 'comp' ? results.length : results.reduce((a, r) => a + (what !== 'verb' ? evalSheetsOf(db, periodId, r).length : 0) + (what !== 'eval' ? 1 : 0) + (what === 'all' ? 1 : 0), 0);
  return (
    <>
      <div className="row no-print">
        <label className="inline"><span className="muted">Print</span> <Select value={what} onChange={setWhat}>{Object.entries(WHAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label className="inline"><span className="muted">Who</span> <Select value={kind} onChange={(v) => { setKind(v); setWho(''); }}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label className="inline"><span className="muted">Department</span> <Select value={dept} onChange={(v) => { setDept(v); setWho(''); }}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
        <label className="inline"><span className="muted">Person</span> <Select value={who} onChange={setWho}><option value="">Everyone listed ({people.length})</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></label>
        {what === 'comp' && <label className="inline"><span className="muted">On paper</span> <Select value={perPage} onChange={setPerPage}><option value="1">One report per page</option><option value="3">Three per page (saves paper)</option></Select></label>}
        <PrintButton label={`Print / save as PDF (${pages} ${pages === 1 ? 'sheet' : 'sheets'})`} />
      </div>
      <p className="muted no-print">
        These follow UB's printed HRMC forms. <b>Comprehensive report</b>: the average from each evaluator group, the final rating and the interpretation (CTRL# follows the A to Z order).
        {' '}<b>Performance evaluation</b>: one sheet per evaluator group, and per class for students, with the summary by category and the average of every question.
        {' '}<b>Verbatim</b>: the written comments. Only classes where at least half of the class + 1 answered are included.
      </p>
      {!results.length
        ? <Empty icon="list" title="Nobody to show">No one here has answered evaluations in this period. Change the filters above.</Empty>
        : what === 'comp'
          ? <div className={`comp-list per-${perPage}`}>{results.map((r) => <CompSheet key={r.targetId} res={r} period={period} ctrl={ctrl(r)} db={db} />)}</div>
          : <div className="comp-list ub-list">{results.map((r) => <UbPacket key={r.targetId} db={db} period={period} res={r} ctrl={ctrl(r)} what={what} />)}</div>}
    </>
  );
}

/**
 * evalU's own summary printouts (Overall, Per subject, Per section, Department summary, Comments).
 * UB has no template for these, so they follow the look of the Comprehensive Report: UB logo,
 * HRMC header, title and semester, a bordered table, the rating key and the "computer generated" line.
 * sections: [{ heading?, columns: [label...], rows: [[cell...] | { cat: 'I. ...' }], num?: true }]
 */
export function SummarySheet({ title, period, info = [], sections, showKey = true }) {
  const words = INTERPRETATION_TABLE.map(([range, i]) => [range, interpretation([4, 3.2, 2.7, 1][i], false).toUpperCase()]);
  return (
    <div className="sum-sheet">
      <div className="comp-head">
        <img src="/ub-logo.png" alt="University of Baguio" />
        <b>HUMAN RESOURCE MANAGEMENT CENTER</b>
        <span>{title}</span>
        <span>{semesterLabel(period.name)}</span>
      </div>
      {info.length > 0 && <div className="sum-info">{info.map(([k, v]) => <span key={k}><b>{k}:</b> {v}</span>)}</div>}
      {sections.map((s, si) => {
        let n = 0;
        return (
          <div key={si} className="sum-sec">
            {s.heading && <h4>{s.heading}</h4>}
            {s.rows.length === 0 ? <p className="sum-none">Nothing to show.</p> : (
              <table className="sum-table">
                <thead><tr>{s.num !== false && <th className="sum-no">NO.</th>}{s.columns.map((c) => <th key={c}>{c.toUpperCase()}</th>)}</tr></thead>
                <tbody>{s.rows.map((r, ri) => (r.cat != null
                  ? <tr key={ri} className="sum-cat"><td colSpan={s.columns.length + (s.num !== false ? 1 : 0)}>{r.cat}</td></tr>
                  : <tr key={ri}>{s.num !== false && <td className="sum-no">{++n}</td>}{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      <div className="comp-foot">
        <p>This copy is computer generated form, if issued without alteration, this does not require signature.</p>
        <p>Printed {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
        {showKey && (
          <table className="comp-key">
            <thead><tr><th colSpan={2}>RATING INTERPRETATION</th></tr></thead>
            <tbody>{words.map(([range, w]) => <tr key={range}><td>{range}</td><td>{w}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
/** "OUTSTANDING", "SATISFACTORY"… for a score, or "—". */
export const ratingWord = (x, ntp = false) => (x == null ? '—' : interpretation(x, ntp).toUpperCase());
export const twoDp = two;
