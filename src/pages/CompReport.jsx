// HRMC "Faculty Evaluation Comprehensive Report": one sheet per person, laid out like UB's printed form
// (see "templates and for printing pdf/SAMPLE/COMPREHENSIVE REPORT.pdf").
import { useState } from 'react';
import { useApp } from '../lib/store';
import { GROUPS, computeTarget, deptName, interpretation, INTERPRETATION_TABLE, round2, targetsOf, targetType } from '../lib/logic';
import { Select, PrintButton, Empty } from '../ui';

/** "AY 2025-26 Term 1" -> "First Semester SY 2025-2026" (the wording on UB's forms). */
export function semesterLabel(name = '') {
  const y = name.match(/(\d{4})\s*-\s*(\d{2,4})/);
  const sy = y ? `SY ${y[1]}-${y[2].length === 2 ? y[1].slice(0, 2) + y[2] : y[2]}` : '';
  const term = /summer/i.test(name) ? 'Summer' : /term\s*2|2nd|second/i.test(name) ? 'Second Semester' : /term\s*1|1st|first/i.test(name) ? 'First Semester' : '';
  return term && sy ? `${term} ${sy}` : name.replace(/\s*\((current, )?sample\)/i, '');
}

const COLUMN = {
  ST: "STUDENTS' EVALUATION", DEAN: "DEAN'S EVALUATION", CHAIR: "SH'S/PC'S/CH'S EVALUATION",
  PRIN: "PRINCIPAL'S EVALUATION", APRIN: "ASST. PRINCIPAL'S EVALUATION", SHEAD: "SUBJECT HEAD'S EVALUATION",
  FAC: "FACULTY'S EVALUATION", SEC: "SECRETARY'S EVALUATION", NTPHEAD: "HEAD'S EVALUATION", NTPSTAFF: "STAFF'S EVALUATION",
};
const columnFor = (type, g) => (type === 'DEAN' && g === 'CHAIR' ? "PROGRAM CHAIRS' EVALUATION" : type === 'CI' && g === 'DEAN' ? "DEAN'S/PC'S EVALUATION" : COLUMN[g] || `${GROUPS[g]?.toUpperCase()}'S EVALUATION`);
const isNtp = (type) => String(type).startsWith('NTP');
const TITLE = { COLLEGE_FACULTY: 'Faculty', BASICED_TEACHER: 'Faculty', CI: 'Faculty', DEAN: 'Dean / Principal', NTP_STAFF: 'Personnel', NTP_HEAD: 'Personnel' };
const PERSON = { COLLEGE_FACULTY: 'Instructor', BASICED_TEACHER: 'Teacher', CI: 'Clinical Instructor', DEAN: 'Dean', NTP_STAFF: 'Employee', NTP_HEAD: 'Head of Office' };
const two = (x) => (x == null ? '—' : round2(x).toFixed(2));

/** One printed sheet. */
export function CompSheet({ res, period, ctrl, db }) {
  const groups = Object.entries(res.groups);
  const ntp = isNtp(res.type);
  const words = INTERPRETATION_TABLE.map(([range, i]) => [range, interpretation([4, 3.2, 2.7, 1][i], ntp).toUpperCase()]);
  const dept = res.target.dept ? deptName(db, res.target.dept) : 'Non-teaching';
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
        <span><b>School:</b> <u className="comp-school">{dept.replace(/\s*\([A-Z]+\)$/, '').toUpperCase()}</u></span>
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

const KINDS = { teach: 'Faculty and Clinical Instructors', dean: 'Deans and Principals', ntp: 'Non-teaching personnel' };
const kindOf = (type) => (type === 'DEAN' ? 'dean' : isNtp(type) ? 'ntp' : 'teach');

/** HR: the comprehensive report for everyone in a department (or one person), ready to print. */
export function ComprehensiveReports({ periodId }) {
  const { db } = useApp();
  const period = db.periods.find((p) => p.id === periodId);
  const [dept, setDept] = useState('');
  const [kind, setKind] = useState('teach');
  const [who, setWho] = useState('');
  const [perPage, setPerPage] = useState('1');
  const people = targetsOf(db)
    .filter((u) => kindOf(targetType(db, u)) === kind && (!dept || u.dept === dept))
    .sort((a, b) => a.name.localeCompare(b.name));
  const results = people.filter((u) => !who || u.id === who).map((u) => computeTarget(db, periodId, u.id))
    .filter((r) => Object.values(r.groups).some((g) => g.required));
  return (
    <>
      <div className="row no-print">
        <label className="inline"><span className="muted">Who</span> <Select value={kind} onChange={(v) => { setKind(v); setWho(''); }}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label className="inline"><span className="muted">Department</span> <Select value={dept} onChange={(v) => { setDept(v); setWho(''); }}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
        <label className="inline"><span className="muted">Person</span> <Select value={who} onChange={setWho}><option value="">Everyone listed ({people.length})</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></label>
        <label className="inline"><span className="muted">On paper</span> <Select value={perPage} onChange={setPerPage}><option value="1">One report per page</option><option value="3">Three per page (saves paper)</option></Select></label>
        <PrintButton label={`Print / save as PDF (${results.length})`} />
      </div>
      <p className="muted no-print">Each person's report shows the average from each evaluator group, the final rating and UB's rating interpretation. CTRL# numbers follow the order below (A to Z).</p>
      {!results.length
        ? <Empty icon="list" title="Nobody to show">No one here had evaluations in this period. Change the filters above.</Empty>
        : <div className={`comp-list per-${perPage}`}>{results.map((r) => <CompSheet key={r.targetId} res={r} period={period} ctrl={people.findIndex((u) => u.id === r.targetId) + 1} db={db} />)}</div>}
    </>
  );
}
