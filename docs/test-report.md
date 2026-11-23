# evalU validation test report

Run: 2026-11-23T19:51:40.250Z · Node v22.22.0 · code version a03e02b · fresh test database with the sample data

**Result: 86 of 86 test cases passed.**

Each case runs automatically (`npm run test:validation`). "Actual" is measured during this run, not written by hand.
Part A checks the computation rules on controlled data; Part B runs the real server, database and access control;
Part C checks the formula engine and its approval and versions; Part D the comment analysis; Part E the computation modules (plug-ins), the effective period and the reproducibility of stored results; Part F HR-configurable evaluator groups and access control; Part H evaluation tool drafts and checks, and adding an evaluator group; Part G the margin of error, form reliability, participation forecast, development follow-up and the fixes from the 20 Nov 2026 test.

| ID | Requirement | Scenario | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC-01 | FR11 participation | 40 students, 20 answered (exactly half) | class excluded | class excluded | PASS |
| TC-02 | FR11 participation | 40 students, 21 answered (half + 1) | class counted | class counted | PASS |
| TC-03 | FR11 participation | 41 students: answers needed | 21 | 21 | PASS |
| TC-04 | FR11 participation | 41 students, 20 answered | class excluded | class excluded | PASS |
| TC-05 | FR11 participation | Even and odd sizes 1-6: answers needed | [1,2,2,3,3,4] | [1,2,2,3,3,4] | PASS |
| TC-06 | Policy (FR11) | HR changes the rule to 60% + 1: 40 students need | 25 | 25 | PASS |
| TC-07 | FR13 weighted score | Students 3.50 (40%), Dean 3.60 (40%), Chair 3.40 (20%) | {"final":3.52,"status":"complete"} | {"final":3.52,"status":"complete"} | PASS |
| TC-08 | FR13 re-weighting | Dean did not evaluate: Students 3.50, Chair 3.40 over 60% | {"final":3.47,"status":"reweighted","basis":60} | {"final":3.47,"status":"reweighted","basis":60} | PASS |
| TC-09 | FR11+FR13 | Class below half + 1: students drop out, Dean + Chair over 60% | {"final":3.53,"status":"reweighted","basis":60} | {"final":3.53,"status":"reweighted","basis":60} | PASS |
| TC-10 | Policy (FR13) | HR policy "no final rating while a group is missing", Dean missing | {"final":null,"status":"incomplete"} | {"final":null,"status":"incomplete"} | PASS |
| TC-11 | FR13 rounding | Rounding to 2 decimals, then 3 decimals (policy) | [3.47,3.467] | [3.47,3.467] | PASS |
| TC-12 | Rating bands | Interpretation of 3.51 / 3.50 / 3.00 / 2.99 / 2.50 / 2.49 | ["Outstanding","Satisfactory","Satisfactory","Fair","Fair","Poor"] | ["Outstanding","Satisfactory","Satisfactory","Fair","Fair","Poor"] | PASS |
| TC-13 | Policy (bands) | HR raises Outstanding to 3.60: 3.55 becomes | Satisfactory | Satisfactory | PASS |
| TC-14 | FR19 low items | Item mean 2.90 with cutoff 3.00, item mean 3.00 | [true,false] | [true,false] | PASS |
| TC-15 | FR2 RBAC | A student tries an HR action (create an account) | HTTP 403 | HTTP 403 | PASS |
| TC-16 | FR2 RBAC | A teacher opens the data: other teachers' answers included? | none | none | PASS |
| TC-17 | NFR6 release | Teacher's own results for a period still with the VPs (not released) | not visible | not visible | PASS |
| TC-18 | NFR5 anonymity | A teacher's released results: evaluator names included? | no names | no names | PASS |
| TC-19 | FR17 release order | HR releases to faculty before the VP approved | HTTP 409 (blocked) | HTTP 409 (blocked) | PASS |
| TC-20 | FR17 governance | VP returns the results to HR with a reason | {"stage":"hr","approvals":0,"hrNotified":true} | {"stage":"hr","approvals":0,"hrNotified":true} | PASS |
| TC-21 | FR17 release order | HR sends again, VP approves, HR releases | HTTP 200 released | HTTP 200 released | PASS |
| TC-22 | Policy versioning | HR changes the bands; a closed period keeps its rules, an open one follows | {"closed":3.51,"open":3.6,"version":1} | {"closed":3.51,"open":3.6,"version":1} | PASS |
| TC-23 | Policy governance | A policy change without a reason | HTTP 400 | HTTP 400 | PASS |
| TC-24 | Confidentiality | Minimum students for comments set to 50: teacher sees student comments? | hidden | hidden | PASS |
| TC-25 | FR4 form versioning | A form already answered: revise it, old answers keep their version | {"newVersion":2,"oldAnswersUnchanged":true} | {"newVersion":3,"oldAnswersUnchanged":true} | PASS |
| TC-26 | Data validation | Check a file with 1 duplicate, 1 non-UB email and 1 missing subject | {"duplicates":1,"errors":2,"savedNothing":true} | {"duplicates":1,"errors":2,"savedNothing":true} | PASS |
| TC-27 | Data validation | Import the same file: good rows saved, bad rows skipped | {"classes":1,"students":1,"skipped":2} | {"classes":1,"students":1,"skipped":2} | PASS |
| TC-28 | Deadline | A student submits after the deadline has passed | HTTP 409 (rejected) | HTTP 409 (rejected) | PASS |
| TC-29 | Duplicate submission | A student submits the same evaluation twice | ["HTTP 200","HTTP 409"] | ["HTTP 200","HTTP 409"] | PASS |
| TC-30 | Encryption (NFR) | The comment as stored in the database file | encrypted (no readable text) | encrypted (no readable text) | PASS |
| TC-31 | FR20 audit trail | Policy change is logged with before -> after values and reason | logged | logged | PASS |
| TC-32 | FR20 audit integrity | Verify the audit log hash chain | intact | intact | PASS |
| TC-33 | FR20 audit integrity | Someone edits an audit entry directly in the database | tampering detected at that entry | tampering detected at that entry | PASS |
| TC-34 | Dynamic formula: weights | Same answers, 40/40/20 then 30/50/20 (configuration only) | [4.34,4.36] | [4.34,4.36] | PASS |
| TC-35 | Dynamic formula: method | Switch from weighted to simple average (S + D + P) / 3 | 4.3 | 4.3 | PASS |
| TC-36 | Dynamic formula: missing group | Dean missing: re-weight / invalidate / count as zero / use the others' average | [4.23,null,2.54,4.22] | [4.23,null,2.54,4.22] | PASS |
| TC-37 | Dynamic formula: custom expression | Expression 0.3*ST + 0.5*DEAN + 0.2*CHAIR | 4.36 | 4.36 | PASS |
| TC-38 | Security: no code execution | Expressions with code: process.exit(), constructor(1), ST.constructor, __proto__ | all rejected | all rejected | PASS |
| TC-39 | Dynamic formula: rounding | 3.465 half up / half even, 3.469 down, 3.461 up; 3.4567 to 3 decimals | [3.47,3.46,3.46,3.47,3.457] | [3.47,3.46,3.46,3.47,3.457] | PASS |
| TC-40 | Formula validation | Weights total 90%; a group with no form for this category | 2 | 2 | PASS |
| TC-56 | Formula conditions | Safe IF and comparison operators choose a result from configured score conditions | 4.3 | 4.3 | PASS |
| TC-57 | Score transformation | Transform a group score before weighted computation | 3.48 | 3.48 | PASS |
| TC-58 | Formula participation | A formula can count a class at 50% without the legacy plus-one policy | {"valid":true,"score":3.5} | {"valid":true,"score":3.5} | PASS |
| TC-41 | Formula approval workflow | Draft → activate without approval → submit without basis → HR approves own → VP approves → HR activates | ["409","400","403","200","200"] | ["409","400","403","200","200"] | PASS |
| TC-42 | Formula versioning | After activating the new formula: a closed period keeps its rating; the open period with answers keeps its formula | {"closedUnchanged":true,"openKept":true} | {"closedUnchanged":true,"openKept":true} | PASS |
| TC-43 | Formula versioning | A period created after activation uses the new version | new version | new version | PASS |
| TC-44 | Formula governance | Approved/active formula edited directly; weights page edit of a formula category | ["HTTP 409","HTTP 409"] | ["HTTP 409","HTTP 409"] | PASS |
| TC-45 | Stored results | Close the open period: every result stored with formula version; stored = recomputed | {"stored":true,"allMatch":true} | {"stored":true,"allMatch":true} | PASS |
| TC-46 | Formula condition | A department-only formula (Business, SBAA) applies to its teachers only | {"sbaa":"department formula","sit":"general formula"} | {"sbaa":"department formula","sit":"general formula"} | PASS |
| TC-47 | No built-in formula | HR makes College faculty 50% Students + 50% Dean (no Chair) and Basic Ed an equal average; the server restarts | {"college":{"ST":50,"DEAN":50},"basicEdUnchanged":true} | {"college":{"ST":50,"DEAN":50},"basicEdUnchanged":true} | PASS |
| TC-48 | Blank formula | HR starts a blank formula and tries to send it without choosing anything | HTTP 400 (must choose method, groups and missing-group rule) | HTTP 400 (must choose method, groups and missing-group rule) | PASS |
| TC-49 | Comment analysis (sentiment) | English, Filipino and Taglish comments, with "not/hindi" and "never late" | ["positive","negative","mixed","negative","positive","neutral"] | ["positive","negative","mixed","negative","positive","neutral"] | PASS |
| TC-50 | Comment analysis (topics, suggestions) | "Please give feedback on our work sooner." / "The lessons are clear and well prepared." | [{"suggestion":true,"topics":["feedback"]},{"suggestion":false,"topics":["clarity","preparation"]}] | [{"suggestion":true,"topics":["feedback"]},{"suggestion":false,"topics":["clarity","preparation"]}] | PASS |
| TC-51 | Computation modules | Same answers (Dean low), 40/40/20 with weighted average, geometric mean, harmonic mean | [3.04,2.91,2.77] | [3.04,2.91,2.77] | PASS |
| TC-52 | Computation modules | "Count it as 0" with a harmonic mean (would divide by zero); with a geometric mean (every rating would be 0) | 2 | 2 | PASS |
| TC-53 | Plug-in architecture | A new module ("lowest group rating") is registered without changing the engine; an incomplete module is refused | {"accepted":true,"final":2,"valid":true,"incompleteRefused":true} | {"accepted":true,"final":2,"valid":true,"incompleteRefused":true} | PASS |
| TC-54 | Effective period | An approved geometric-mean formula set to "start with the next period"; then HR creates the next period | {"whileScheduled":"old formula in use","newPeriod":"new formula","oldVersion":"archived"} | {"whileScheduled":"old formula in use","newPeriod":"new formula","oldVersion":"archived"} | PASS |
| TC-59 | Effective dates | An approved formula is only applied to periods starting inside its configured date window | {"before":false,"during":true} | {"before":false,"during":true} | PASS |
| TC-55 | Reproducible results | Close a period computed with an approved formula; recompute it with its formula and algorithm versions | {"keepsFormula":true,"keepsAlgorithmVersion":true,"keepsApproval":true,"allSame":true} | {"keepsFormula":true,"keepsAlgorithmVersion":true,"keepsApproval":true,"allSame":true} | PASS |
| TC-60 | HR-configurable evaluator groups | HR adds a Department Head group and assigns it to a staff account; the catalog and membership persist | {"group":true,"membership":true} | {"group":true,"membership":true} | PASS |
| TC-61 | Evaluator group access control | A student cannot add an evaluator group; HR cannot apply a group to an unknown category | {"student":403,"invalidCategory":400} | {"student":403,"invalidCategory":400} | PASS |
| TC-62 | Versioned computation modules | A new algorithm version can be registered without changing the prior version used by saved formulas | {"old":3.5,"new":4,"oldAgain":3.5,"duplicateRejected":true} | {"old":3.5,"new":4,"oldAgain":3.5,"duplicateRejected":true} | PASS |
| TC-63 | Margin of error (95%) | Class of 10, 6 answered (3.2, 3.4, 3.6, 3.0, 3.8, 3.6); then all 10 answered | [0.21,0] | [0.21,0] | PASS |
| TC-64 | Form reliability (Cronbach's alpha) | 4 evaluations x 3 questions: (2,3,3) (3,3,4) (4,4,4) (1,2,2) | ["0.95","Excellent"] | ["0.95","Excellent"] | PASS |
| TC-65 | Participation forecast | Opened 10 days ago, 5 days left, class of 10 (needs 6): 3 answered; 5 answered; then who is warned | {"three":"at-risk 4","five":"on-track 7","warned":["dean","hr","teacher"]} | {"three":"at-risk 4","five":"on-track 7","warned":["dean","hr","teacher"]} | PASS |
| TC-66 | Development follow-up | Dean A makes a plan for Secretary A (Fair in AY 2025-26 Term 1); another dean, a teacher and a student try; Secretary A reads it; HR closes it | ["dean of the department: 200","dean of another department: 403","teacher: 403","student: 403","secretary sees it: true","other teacher sees it: false","confirmed read: true","closed as improved: true"] | ["dean of the department: 200","dean of another department: 403","teacher: 403","student: 403","secretary sees it: true","other teacher sees it: false","confirmed read: true","closed as improved: true"] | PASS |
| TC-67 | Development follow-up | The plan's follow-up compares the next period with a rating (AY 2025-26 Term 2) with the plan's period | next period found, change = after - before | next period found, change = after - before | PASS |
| TC-68 | Fix DEF-01: comment limit | Submit with a 2,001-character comment, then 2,000 | ["HTTP 400 with the limit in the message","HTTP 200"] | ["HTTP 400 with the limit in the message","HTTP 200"] | PASS |
| TC-69 | Fix DEF-02: empty form | HR creates a Program-Chair form for Dentistry with no questions; which form do Dentistry teachers get? | UB's general form until the new form has a question | UB's general form until the new form has a question | PASS |
| TC-70 | Fix DEF-06: large class list | Check a 3,000-row class list (about 330 KB); then a 5 MB one | ["HTTP 200, 3000 rows read","HTTP 413 with a message"] | ["HTTP 200, 3000 rows read","HTTP 413 with a message"] | PASS |
| TC-71 | Fix DEF-03: Clinical Instructors | CI weights; the Program Chair has a form for CIs and is assigned to evaluate the Nursing CI | {"weights":{"ST":40,"DEAN":40,"CHAIR":20},"chairForm":true,"chairTask":true} | {"weights":{"ST":40,"DEAN":40,"CHAIR":20},"chairForm":true,"chairTask":true} | PASS |
| TC-72 | Tool drafts | HR changes the student tool while a period is open: which form do students get? Then HR discards the draft | {"during":"same form","after":"same form","drafts":0} | {"during":"same form","after":"same form","drafts":0} | PASS |
| TC-73 | Tool checks | 60/35/blank; 60/25/5; an empty part; no indicators; 60/35/5 | [false,false,false,false,true] | [false,false,false,false,true] | PASS |
| TC-74 | Weights inside a tool | 10, 5 and 8 indicators at 60/35/5, averages 4, 3 and 2 | 3.55 | 3.55 | PASS |
| TC-75 | Tool versions | A new version while the open period has answers; a second period is created; then the first is closed and another is created | ["scheduled","still waiting","in use","old answers unchanged"] | ["scheduled","still waiting","in use","old answers unchanged"] | PASS |
| TC-76 | Tool drafts | The server restarts while a brand-new tool is a draft | still a draft | still a draft | PASS |
| TC-77 | Tool wording | HR rewords an answered indicator in a draft; HR types the same indicator twice | {"oldKept":true,"newWording":true,"duplicate":"rejected"} | {"oldKept":true,"newWording":true,"duplicate":"rejected"} | PASS |
| TC-78 | Tool checks | A tool in use has a part with no weight: HR creates a period | refused, tool named | refused, tool named | PASS |
| TC-79 | Adding an evaluator group | Peers rate college faculty 30/10/40/20 (3.50, 3.00, 3.60, 3.40): ratings while setting up; final; peer evaluations for 5 SIT faculty; Basic Ed | {"whileSettingUp":"unchanged","blockedByDraft":true,"final":3.47,"sitPeerTasks":20,"basicEd":{"ST":10,"PRIN":1,"APRIN":1,"SHEAD":1}} | {"whileSettingUp":"unchanged","blockedByDraft":true,"final":3.47,"sitPeerTasks":20,"basicEd":{"ST":10,"PRIN":1,"APRIN":1,"SHEAD":1}} | PASS |
| TC-80 | Tasks follow the formula | SIT has its own formula (Students 50, Dean 50): evaluations for a SIT and an SBAA teacher | {"sit":{"ST":10,"DEAN":1},"sbaa":{"ST":10,"DEAN":1,"CHAIR":1}} | {"sit":{"ST":10,"DEAN":1},"sbaa":{"ST":10,"DEAN":1,"CHAIR":1}} | PASS |
| TC-81 | Adding an evaluator group | Faculty (a built-in group) rate college faculty; percentages of 90%; a group that already counts; nothing is kept when refused | {"builtIn":true,"ninety":false,"twice":false,"kept":0} | {"builtIn":true,"ninety":false,"twice":false,"kept":0} | PASS |
| TC-82 | Upgrade | A group an earlier version added with a blank percentage left College faculty without ratings | {"before":null,"after":true} | {"before":null,"after":true} | PASS |
| TC-83 | Tool drafts | A draft is saved in the database and sent to HR only; a teacher and a student try to use it | {"saved":"draft","hr":true,"teacher":false,"student":false,"status":[403,403]} | {"saved":"draft","hr":true,"teacher":false,"student":false,"status":[403,403]} | PASS |
| TC-84 | Every category can be changed | HR gives each of the six categories new percentages; a VP approves; a new period is created | {"COLLEGE_FACULTY":"ST 30, DEAN 50, CHAIR 20","BASICED_TEACHER":"ST 25, PRIN 25, APRIN 25, SHEAD 25","CI":"ST 60, DEAN 40","DEAN":"CHAIR 40, SEC 10, FAC 50","NTP_STAFF":"NTPHEAD 100","NTP_HEAD":"NTPSTAFF 100"} | {"COLLEGE_FACULTY":"ST 30, DEAN 50, CHAIR 20","BASICED_TEACHER":"ST 25, PRIN 25, APRIN 25, SHEAD 25","CI":"ST 60, DEAN 40","DEAN":"CHAIR 40, SEC 10, FAC 50","NTP_STAFF":"NTPHEAD 100","NTP_HEAD":"NTPSTAFF 100"} | PASS |
| TC-85 | Percentages only | A formula saved earlier as "every group the same", as "my own formula" and as percentages, when HR changes it | [[33.33,33.33,33.34],[null,null],[40,60]] | [[33.33,33.33,33.34],[null,null],[40,60]] | PASS |
| TC-86 | Tools by period | The student tool gets a new version between two periods: which version does each period show, and how many answered? A period before its tasks are created | {"first":"old version, 38 answered","beforeTasks":"new version, 0 of 60 answered","second":"new version, 0 of 60 answered","draftListed":false,"sameAsCountingTasks":true} | {"first":"old version, 38 answered","beforeTasks":"new version, 0 of 60 answered","second":"new version, 0 of 60 answered","draftListed":false,"sameAsCountingTasks":true} | PASS |

Limits of this report: these are developer-run functional, security and integration tests on simulated data. They do not replace the stakeholder evaluation (ISO/IEC 25010 questionnaire) or confirmation of the rules by HRMC.
