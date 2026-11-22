# evalU: response to the panel's feedback (system changes)

This lists what was changed **in the system** after the manuscript defense, and where the evidence is.
Items that need research work (interviews, RIECO, stakeholder validation, Chapter 4) are listed at the end:
they cannot be solved by code and are not claimed here.

## How evalU differs from the current HRMC Excel process

| HRMC today (Excel since 2022, per the interview) | evalU |
|---|---|
| Forms answered on separate channels; answers copied and cleaned by hand | Every evaluator answers in one system; answers are validated when submitted (1–4 only, every item, deadline, no double submission) |
| Who evaluates whom is prepared by hand | Tasks are generated from accounts and class lists by rule, with UB's form picked automatically per class type |
| Half + 1 rule checked by hand | Enforced automatically per class, with alerts before the deadline |
| Weights and formulas live inside spreadsheet cells | Policy & rules page: threshold, bands, rounding, missing-group rule, approvals; **every change is a version with a reason**, and each period keeps the version it was computed with |
| Result release by hand; no record of who saw what | HR → VP approval (or return with reason) → faculty, enforced by the server; every view and change logged in a **tamper-evident** audit log |
| Comments typed and distributed manually | Comments encrypted in the database, released without names, hidden when too few students answered |
| No comparison between periods | Period-to-period comparison that warns when rules or forms differ |

## The five priorities and what was done

### 1. Dynamic formula and policy management
- New **Policy & rules** page (HR). Configurable without code: participation % and "plus one", rating bands,
  low-item cutoff, decimal places, what happens when an evaluator group is missing (re-weight or no final rating),
  minimum students before comments are shown, and how many VPs must approve.
- Every change needs a **reason** and becomes a **new version** (who, when, why, before → after).
- **Open periods follow** the change; **closed periods keep** the version they were evaluated under, so past results
  never change. The version used is shown on each period.
- Forms keep their existing versioning (a used form is locked; changes go into a new version).
- Evidence: TC-06, TC-10, TC-11, TC-13, TC-22, TC-23, TC-25 in `docs/test-report.md`.

### 2. Secure governance and approval management
- The approval rule is configurable: every VP, any one VP, or a set number (so one VP on leave cannot block all results).
- A VP can **return results to HR with a reason**; HR is notified, approvals are reset, and the return is shown on the period.
- Release to faculty is refused by the server until the approval rule is met.
- Anonymity: students' comments about a teacher are hidden from the teacher, dean and VP when fewer than the minimum
  number of students answered; students' submission times are never sent outside HR (prevents timestamp matching).
- Evidence: TC-15–TC-21, TC-24, TC-30.

### 3. Audit trail and accountability
- Every audit entry is sealed with a **SHA-256 hash chain** (each entry's hash includes the previous one).
  **Check for tampering** recomputes the chain and shows the first entry that was changed, inserted or deleted.
- Rule changes are logged with **before → after values** and the reason (policy, weights).
- **Download for Excel** (CSV) of the audit log, including each entry's hash.
- Evidence: TC-31, TC-32, TC-33 (an entry edited directly in the database is detected).

### 4. Advanced data processing and analytics
- Class-list import is now two steps: **Check file** (nothing saved) shows new classes, new and existing students,
  **duplicate rows** and invalid rows with row numbers; then **Import**.
- **Compare two periods**: per-person change, improved/declined counts, and a warning when the periods used
  different rules, weights or form versions ("compare with care").
- Low-item flags use the period's policy cutoff.
- Analytics now has **Key findings** (plain-language findings, each with a possible action), **Rating distribution**,
  **Participation** by department, **Strengths and weaknesses by form category**, **Do the evaluator groups agree?** (gaps between
  students and supervisors), plus the trend, department comparison, period comparison and item-level results.
- Every analytics card has a **"Where this comes from"** note: which evaluations are counted, the formula, and what the
  card cannot tell (descriptive, not predictive or causal). This answers the panel's "analytical validity" concern.
- Evidence: TC-26, TC-27, TC-14.

### 5. System validation and quality assurance
- `npm run test:validation` runs **33 test cases** (the panel's demonstration scenarios) and writes
  `docs/test-report.md` with expected vs actual results. Current result: **33 / 33 pass**.
- `npm run test:load` simulates **35 users at the same time** and writes `docs/load-test-report.md`
  (response times and errors measured on the run).
- `npm test` runs the logic, API and validation suites together.

## Answers to specific panel questions (from the system side)

| Panel question | Answer with evidence |
|---|---|
| 40 students: is 20 enough? 21? 41 students: is 21 enough? | 20 → excluded, 21 → counted, 41 needs 21 (TC-01–TC-05) |
| Dean does not submit: how is it re-weighted? Is it approved? | Students + Chair over 60% (TC-08); HR can switch the policy to "no final rating" if HRMC decides so (TC-10) |
| One VP on leave blocks all results? | Not if HR sets "any one VP" or a set number (Policy & rules) |
| Can an admin match timestamps to a student? | Submission times are only kept for HR; teachers, deans and VPs never receive them |
| Why 3.50 for low items? | It is now 3.00 by default (UB's "Satisfactory"), shown as a policy setting HR controls, not a hidden constant |
| Modify a form without changing history? | Used forms are locked; revising makes a new version; old answers keep theirs (TC-25) |
| Attempt faculty access before approval | Blocked (TC-17, TC-19) |
| Import duplicate, missing and invalid records | Detected and reported before saving (TC-26, TC-27) |
| Modify a record and inspect the audit history | Before → after values logged; hand edits detected (TC-31–TC-33) |
| Simulate 35 users | `docs/load-test-report.md` |

## Still to be done by the researchers (not solvable in code)
- HRMC's written confirmation of the rules now shown on the Policy & rules page (threshold, bands, missing-group rule,
  approval chain). The page makes each rule visible and changeable, but its *values* still need HRMC approval.
- Validation of requirements with students, faculty, deans, program chairs and VPs.
- Instrument validation records, RIECO clearances, transcripts and the coding matrix.
- The stakeholder evaluation (ISO/IEC 25010 questionnaire) and its statistics.
- Measured time savings against the current Excel process (baseline vs evalU).
- Chapter 4 conclusions and recommendations, and fixing Chapter 2's future-tense description of the interview.

## Algorithm-Independent Performance Evaluation Computation (configurable computation engine)

**Design principle.** evalU does not depend on one institutional formula. If HRMC replaces the 40-40-20 weighted
formula next year with a simple average, other percentages or a different method, HR changes it on the
**Rating formula** page, a VP approves it, and evalU keeps working. No source code changes, and old results do not change.

**No formula is built into the program.** The percentages shown at first (e.g. 40% Students + 40% Dean + 20% Program Chair)
are only the *starting formula* saved in the database from the manuscript (Table 6), marked on screen as not yet confirmed
by HRMC. HR replaces it on the **Rating formula** page (or starts a blank formula); the Weights page stays for quick weight changes. Start-up repairs never override a category HR has set (TC-47); a blank formula cannot be
sent until HR chooses the method, the groups and the missing-group rule (TC-48).

### How it is built (hybrid: formula configuration + plug-in modules)

```
User interface        HR (Rating formula page) · VP (Formula approvals) · Reports ("How this rating was computed")
Workflow              draft → sent to VP with its basis → approved / returned → start now or with the next period → archived
Formula versioning    formulas table (one row per version) · each period keeps the versions it uses · stored results
Computation engine    src/lib/formula.js: missing groups, minimum groups, rounding, steps (the same for every method)
Algorithm modules     src/lib/methods/: weighted average · simple average · geometric mean · harmonic mean · HR's own formula
Data and reporting    evaluation records · stored results · audit log · analytics
```

**A. Formula configuration (HR, no code change)**

| What can be configured | Options |
|---|---|
| Computation method | Weighted average · simple average · geometric mean · harmonic mean · HR's own formula (custom expression) |
| Evaluator groups to include | Add or remove groups (any group that has a UB form for that category) |
| Weights | Per group (must total 100% for the methods that use percentages) |
| Averaging inside a group | Average or median of the evaluators; for students, average of class averages or all students together |
| Missing evaluator scores | Re-weight · no final rating · count as zero · use the other groups' average (only the rules that make sense for the method are offered) |
| Minimum groups | A final rating only when at least N groups have a result |
| Rounding precision | 0–4 decimals; half up, half to even, down, up |
| Conditions | A formula for a whole category, or only for one department (the department formula wins) |
| Effective period | Start now (open periods with no answers yet, and new periods), or start with the next evaluation period (scheduled) |

**B. Plug-in computation modules (Strategy pattern).** Each method is a separate module in `src/lib/methods/`
(one file each). The engine gives every module the same input (the groups that take part, each with a rating and a
weight) and expects the same output (the result, and how it was computed). The engine, the Rating formula page, the
approval, the versions, the reports and the stored results do not know the math inside a module.

To support a method evalU does not have yet, a developer:
1. copies one module file (e.g. `geometric-mean.js`) and writes the new math,
2. adds it to the list in `src/lib/methods/index.js`.

Nothing else changes. HR then picks it, a VP approves it, and HR starts using it. TC-53 proves this: a new module
("lowest group rating") is added while the system runs, and it is computed and validated without any change to the
engine; a module that is missing a part is refused.

**Custom expressions are safe.** They are read by a small built-in calculator (`src/lib/expression.js`) that
understands only numbers, group codes, `+ - * /`, brackets and `avg()`, `min()`, `max()`. Nothing is run with `eval`;
code such as `process.exit()` or `constructor(1)` is rejected (TC-38).

### Versioning, effective period and reproducibility

- **Approval.** HR cannot approve its own submission; only a VP approves. Approved versions cannot be edited; a change
  is a new version (TC-41, TC-44).
- **Effective period.** HR starts an approved version **now**, or sets it to **start with the next evaluation period**
  (status "Starts next period"). The version in use stays until HR creates that period; the new period then takes the
  new version and the old one is archived (TC-54). Starting now never touches an open period that already has answers
  in that category (TC-42).
- **Stored results.** Closing a period stores every result (`results` table) with the formula identifier and version,
  its parameters and weights, who approved it and when, its basis, the evaluation period, the ratings used, the final
  rating, the steps and the date computed (TC-45, TC-55).
- **Old results stay the same.** On the Rating formula page (card *Check old ratings*), HR clicks **Check now**: every stored rating is computed
  again with the formula version it was stored with and compared. In the sample data: "All 63 old ratings are
  unchanged", including after the formula was changed (TC-55).

| Version | Formula | Effective | Status |
|---|---|---|---|
| v1 | Weighted 40-40-20 | 2026 periods | Old version (archived) |
| v2 | Simple average | 2027 periods | In use |
| v3 | Geometric mean 40-40-20 | next period HR creates | Starts next period |

*(Example of how the Past formulas table reads; the table on screen is built from the database.)*

**Simulation before activation.** "Try it" on the formula page compares the formula in use with the new one on sample
ratings (now → with this formula, with the computation in numbers) and on a real closed period (how many people would
get a different rating, and who). Nothing is saved by a simulation.

**Transparency.** Every result shows "How this rating was computed": the formula in words, each group's rating and
share, and the computation in numbers (for example `40% × 3.50 + 40% × 3.60 + 20% × 3.40 = 3.52`, or
`3.50^0.40 × 3.60^0.40 × 3.40^0.20 = 3.52` for a geometric mean).

Evidence: TC-34 to TC-48 and TC-51 to TC-55 in `docs/test-report.md`.

Example of why the method matters (TC-51): Students 3.80, Dean 2.00, Program Chair 3.60 with 40/40/20 gives
**3.04** (weighted average), **2.91** (geometric mean) and **2.77** (harmonic mean). The low Dean rating counts more
in the stricter methods.

Note on the reviewer's example: with scores 4.30 / 4.50 / 4.10 and weights 30/50/20 the result is
1.29 + 2.25 + 0.82 = **4.36** (the example in the recommendation says 4.38). The engine gives 4.36 (TC-34).

### Defense demonstration (about 5 minutes, signed in as HR, then VP)

1. **Current formula.** Rating formula → College faculty: "Final rating = 40% Students + 40% Dean + 20% Program Chair".
2. **Change the method.** Change this formula → choose *Count every group the same* (simple average).
3. **Recompute a test evaluation.** In *Try it*, type Students 3.80, Dean 2.00, Program Chair 3.60: now 3.04 → 3.13.
   Below it, a real closed period shows how many teachers would get a different rating ("See who").
4. **A different formula module.** Open *Other ways (special cases)* and choose *Percentages, but a low rating counts more* (the geometric mean, a separate module file), show 2.91; open
   `src/lib/methods/` to show that each method is its own file. Send to VP with the basis; sign in as the VP and approve;
   sign in as HR and click *Start with the next period*.
5. **The rest of evalU keeps working.** Periods & release → create the next period: "The new rating formula starts with
   this period". Generate tasks, reports and printouts work as before.
6. **History is kept.** Rating formula → *Past formulas* (versions, approved by and date, periods that used each) →
   *Check old ratings* → **Check now**: "All … old ratings are unchanged."

### Proposed manuscript changes

**New functional requirement – Configurable Computation Engine.** The system shall allow authorized HR administrators
to select, configure and activate approved performance evaluation computation methods independently of the
application's core source code. The system shall support configurable computation parameters and preserve versioned
computation rules to ensure the reproducibility and integrity of historical evaluation results.

| Capability | Where it is in evalU |
|---|---|
| 1. Support multiple computation algorithms | Five modules: weighted average, simple average, geometric mean, harmonic mean, custom expression |
| 2. Configure weights, parameters and aggregation rules | Rating formula page (groups, percentages, averaging, missing groups, minimum groups, rounding, department) |
| 3. Integrate new computation modules without restructuring the core | `src/lib/methods/`: one file per module plus one line in the list (TC-53) |
| 4. Maintain computation version history | `formulas` table; *Past formulas* on the page; audit log entries |
| 5. Associate each finalized result with the computation version used | `results` table: formula, parameters, approval, ratings used, final, steps, date (TC-55) |
| 6. Validate and simulate proposed changes before activation | Validation before sending; *Try it* on sample ratings and on a real closed period |

FR5 (configurable evaluator weights) and FR13 (weighted score computation) stay; FR13 can say "computed with the
formula version in force for the period (see the Configurable Computation Engine)".

**Revised objective.** "To design and develop a configurable and extensible performance evaluation computation
mechanism that accommodates changes in institutional evaluation methodologies without requiring modifications to the
core system architecture."

**Architecture.** Add the computation management layer (formula versioning, computation engine, algorithm modules)
between the application/workflow layer and the data and reporting layer, as in the diagram above.

### Limit (state it honestly)
Any new combination of the supported methods, groups, weights and rules needs no programming. A **completely new kind
of computation** (for example, a statistical normalisation) needs a developer to add **one module file**; the rest of
the system is not restructured. A **new type of evaluator** that does not exist yet (a new position) also needs a
developer. No configuration screen can promise every formula the school might invent; the plug-in modules are the
extension point for those cases.

## Advanced features added on 21 November 2026

These answer "it is easy to make": each is something a form and a spreadsheet cannot do, taken from established evaluation systems.

| Feature | Taken from | What evalU does | Evidence |
|---|---|---|---|
| **Margin of error and form reliability** | IDEA, Explorance Blue | Each final rating shows a 95% margin of error (Student's t, finite population correction; 0 when everyone answered) and whether its range crosses a band limit. Analytics shows Cronbach's alpha for every form used. | TC-56, TC-57 |
| **Participation forecast** | Early-warning analytics | Pace since the period opened predicts, per class, whether half + 1 will be reached by the deadline; at-risk classes are shown on Progress and warned to the teacher, department heads and HR once a day. | TC-58 |
| **Development follow-up** | Watermark Faculty Success, Interfolio | A plan for each Fair/Poor rating (areas, actions, review date), confirmed by the person and compared with the next term's rating, area by area. | TC-59, TC-60 |

The developer test of 20 November 2026 found six defects; they are fixed and re-tested: the 2,000-character comment limit (TC-61), an empty form going live (TC-62), class lists over 64 KB (TC-63), Clinical Instructor weights 40/40/20 with the Program Chair (TC-64), and the VP approval box printing on the UB printouts. The missing HRMC tools for FR24 (PC/AP and SH by faculty, AP/PC/SH by Dean/Principal) are still to be encoded.

## Ideas taken from similar systems

| Idea | Taken from | What evalU does | Which UB problem it targets |
|---|---|---|---|
| **QR code per class** | Explorance Blue, Watermark (easy access raises response rates) | HR prints a QR card per class (Class lists), or the teacher shows it in class (My results). Scanning opens evalU; after signing in, that class's evaluation opens directly. The QR holds only a link: students still sign in, and only students on the class list have an evaluation. | Low participation (classes excluded below half + 1) |
| **Comment analysis** | Explorance MLY; Central Philippine University (sentiment analysis) | Each comment is tagged positive / negative / mixed / neutral, marked if it is a suggestion, and sorted into topics (clarity, feedback and grading, punctuality, preparation, approachability, pace, activities, language, professional growth). Summaries appear in Reports and in Analytics ("What the comments are about"), with a Key finding for the most negative topic. Built-in English and Filipino/Taglish word lists; nothing is sent to an outside AI service. | Manual comment handling; limited analytics |

Evidence: TC-49 and TC-50 (comment analysis); the QR flow was checked in the browser (scan link → sign in → the class's evaluation opens).
Limit: the comment tags are a reading aid based on word lists; they can miss sarcasm, so the comments stay visible next to their tags.
