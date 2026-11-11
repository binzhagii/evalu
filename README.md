# evalU

evalU is a web app for running a school's performance evaluations. Students, faculty, deans, program chairs and staff answer evaluation forms. HR runs each evaluation period, checks progress and releases the results step by step: first to VPs, then to each faculty member.

It works on computers, tablets and phones.

---

## Contents

1. [What you need](#what-you-need)
2. [Install and run](#install-and-run)
3. [Signing in](#signing-in)
4. [Walkthrough](#walkthrough)
   - [HR Specialist](#hr-specialist)
   - [Student](#student)
   - [Faculty](#faculty)
   - [Dean and Program Chair](#dean-and-program-chair)
   - [Secretary, staff and principals](#secretary-staff-and-principals)
   - [Vice President](#vice-president)
   - [Everyone](#everyone)
5. [A full evaluation cycle, step by step](#a-full-evaluation-cycle-step-by-step)
6. [How scores are calculated](#how-scores-are-calculated)
7. [Using it on your phone](#using-it-on-your-phone)
8. [Common problems](#common-problems)
9. [Manuscript requirements and where they are in the system](#manuscript-requirements-and-where-they-are-in-the-system)
10. [For developers](#for-developers)

---

## What you need

- **Node.js 24 or newer** (download it from https://nodejs.org). The database is built into Node, so nothing else has to be installed.
- **Git**, to download the project.
- A web browser (Chrome, Edge, Firefox or Safari).

To see which Node version you have, open a terminal and type:

```
node --version
```

It should print `v24` or higher.

## Install and run

1. **Download the project**
   ```
   git clone https://github.com/binzhagii/evalu.git
   cd evalu
   ```
2. **Install the packages** (needed only once, and again after pulling new changes):
   ```
   npm install
   ```
3. **Start the app**
   ```
   npm run dev
   ```
4. **Open it**: go to **http://localhost:5173** in your browser.

The first time the app starts, it creates the database (`server/data/evalu.db`) and fills it with sample data, so you can try it straight away.

To stop the app, press `Ctrl + C` in the terminal.

### Running it as the "real" server

```
npm run build
npm start
```

Then open **http://localhost:3000**. To use a different port, set `PORT`, for example `PORT=8080 npm start` (in PowerShell: `$env:PORT=8080; npm start`).

## Signing in

Sign in with your **official UB email** (`…@ubaguio.edu`; students `…@s.ubaguio.edu`). Other email addresses are refused. The username also works. **Every sample account has the password `demo1234`.** On the sign-in screen you can click a role under "Test accounts" to fill in the email.

| Email | Role |
| --- | --- |
| `hr@ubaguio.edu` | HR Specialist (runs everything) |
| `vp@ubaguio.edu` | Vice President |
| `dean_a@ubaguio.edu` | Dean |
| `chair_a@ubaguio.edu` | Program Chair |
| `fac_a1@ubaguio.edu` | Faculty |
| `ci_c1@ubaguio.edu` | Clinical Instructor (CI) |
| `hr_assistant@ubaguio.edu` | HRMC Assistant (same tools as HR) |
| `sec_a@ubaguio.edu` | Secretary (non-teaching staff) |
| `head_a@ubaguio.edu` | Office Head (non-teaching staff) |
| `principal@ubaguio.edu` | Principal |
| `st_a01@s.ubaguio.edu` | Student |

There is **no sign-up page**. What you can see depends on your role, so only HR can create accounts (see [Accounts](#accounts-1)).

If you type the wrong password 5 times, that username is blocked for 15 minutes.

---

## Walkthrough

The menu is on the left. On a phone, tap **☰** at the top left to open it.

### HR Specialist

Sign in as `hr`. HR has the most pages.

#### Overview
Your home page. It shows:
- **Responses received**: how many evaluations in open periods are done.
- **Overdue evaluations**: how many are past the deadline.
- **Classes below half + 1**: classes where fewer than half of the class plus one have answered. These classes would be excluded if the period closed now.
- **Active accounts**, and how many people haven't signed in yet.
- Each open period with progress bars for each evaluator group, the classes that need attention, and who can see the results of each period.

#### Periods & release
- **Create a period**: enter a name (for example "2nd Semester 2026–2027") and a deadline. Tick departments to open the evaluation for only those departments (none ticked = all). Then generate the tasks under Assignments.
- **Send participation alerts** while a period is open: the teacher, the department heads and HR are told which classes are at or below half.
- **Close a period** when the deadline has passed. Classes where fewer than half of the class plus one answered are excluded, and the teacher, department heads and HR are notified.
- **Release results** one step at a time: **HR only → VPs → Faculty**. After you send results to the VPs, **every VP must click "Approve"** before the *Release to faculty* button works.
- **Reset simulated data** puts all the sample data back. It erases every change, so use it only while testing.

#### Assignments
- **Generate tasks**: evaluators are assigned from the class lists and from each person's role and department. Internship, practicum and field trip subjects are skipped.
- See every task and whether it is pending, completed or overdue. Search for one evaluator.
- **Send reminders now**. Reminders are also sent **automatically** once a day in the last 7 days before the deadline (and after it, until you close the period). Department heads and HR are alerted too.
- **Add an evaluator assignment** by hand.

#### Progress
Completion by department (students and personnel), then every class: how many answered, how many are needed (half + 1), and whether it would count.

#### Class lists
- **Type of class** (in the list of sections): Lecture (standard), Laboratory, Clinical – Dentistry / Physical Therapy / Medical Technology, or for Nursing CIs Clinical area / Skills laboratory. It decides which UB tool the students (and the dean) answer.
The class sections from the Registrar / ARC. **Import a class list**: choose the **Department of this list**, then click **Choose CSV file…** (or paste), one student per line:

```
section code,subject,teacher name,teacher email,student ID,student name,student UB email
```

- Classes that don't exist yet are created.
- **Students without an account get one automatically.** Their first password is their **student ID**, and they must change it at the first sign-in. Students who already have an account are just added to the class, so the same student in two classes is created once.
- **Teachers without an account get one too**, as Faculty in the chosen department. Their first password is the part of their email before the @ (for example `jdelacruz`).
- Rows with a problem (for example a non-UB email, or a student from another department) are listed and skipped.
- An example file with 1 teacher and 6 students in 2 classes is in [samples/class-list-example.csv](samples/class-list-example.csv). Import it with **School of Information Technology (SIT)** chosen.

You can also add a section by hand. Practicum, internship and field trip subjects are listed but marked "not evaluated".

#### Forms
- **UB's own evaluation tools** are built in (from the Word, Excel and PDF files in `templates and for printing pdf/`), with the same categories, weights and questions. They use UB's **4-point scale**: 4 Extensively demonstrated, 3 Adequately demonstrated, 2 Fairly demonstrated, 1 Not demonstrated (non-teaching: 4 Excellent, 3 Good, 2 Fair, 1 Poor). "Points" items on the Dean's tools (outreach, linkages, seminars, research) show their own words for each rating.
  | Tool | Used for |
  | --- | --- |
  | Faculty by the Students (Lecture) / Grade 4-12 | students of college / Basic Ed classes |
  | Graduate School / Law Professors | students in the Graduate School and School of Law |
  | Laboratory, Dentistry CI, PT CI, MedTech CI (by students) | classes set to that **type of class** |
  | Faculty by the Dean / Principal; by the AP / PC / SH | deans, principals, program chairs, assistant principals, subject heads |
  | Non-science lab, Dental infirmary, PT, BMLS (by the Dean / PC) | follow the type of the teacher's classes |
  | Nursing CI: clinical area or skills lab (students and Dean / PC) | Clinical Instructors in the School of Nursing |
  | Dean / Principal by the Faculty | faculty and program chairs evaluating the dean |
  | Office Staff by the Director; Director / Head by the Office Staff | non-teaching personnel |
- **Evaluation forms**: the criteria on each form, grouped into **categories** with weights (for example 60% / 40%). A form can also be made for one department or one type of class only.
- **Versions**: once a form has submitted answers it is locked. Click **Create new version** to change it; past results keep the old version.
- **Criteria bank**: criteria already answered can't be reworded or deleted, so old reports stay the same.

#### Weights
How much each evaluator group counts: College faculty 40 / 40 / 20, Basic Education 40 / 20 / 20 / 20 (Table 6). Weights for evaluating Deans are not in the manuscript, so HR enters them. Changes apply to open and future periods; **closed periods keep their weights**.

#### Accounts
- **Add account**: enter a username, full name, role, position and department (students also choose their classes). The app shows a **temporary password once**, so write it down and give it to the person privately.
- **Edit**: change someone's name, role, department or classes.
- **Reset password**: gives the person a new temporary password and signs them out everywhere.
- **Deactivate**: the person can't sign in any more and gets no new tasks. Their past evaluations stay in the reports. **Reactivate** undoes this.
- Use the search box, the role filter and *Show deactivated* to find people.

#### Reports and Analytics
- **Reports**: overall, per subject, per section, **individual report** (final breakdown, each class, Dean and Program Chair, with **per-item results and the spread of ratings 1–4**, and comments grouped by source), **department summary**, **Print UB reports** (HR; the same layouts as the HRMC samples in `templates and for printing pdf/SAMPLE`): the **Comprehensive report** (one sheet per person with each evaluator group's average, the final rating and the interpretation 3.51–4.00 Outstanding, 3.00–3.50 Satisfactory, 2.50–2.99 Fair, 2.49 and below Poor; one or three per page), the **Performance evaluation** sheets (one per evaluator group, and per class for students: summary by category weighted by its percentage, over-all, interpretation, and the average of every question) and the **Verbatim** sheet (supervisors' comments only, like UB's sample: "BY THE DEAN AS A FACULTY", "BY THE AP/PC/SH AS A FACULTY", each with the employee's development plan and the areas to be improved; students' comments stay on screen in the individual report); faculty get the same sheets under **My results**, **requests from offices** (results are released only through the person's dean), and **earlier records** (import final scores kept before evalU). Use **Print / save as PDF** for a file. The other tabs (Overall, Per subject, Per section, Department summary, All comments) print as a formal HRMC sheet too: UB logo and header, the semester, a bordered table with the interpretation, the rating key and the "computer generated" line; the Individual report prints that person's UB sheets.
- **Analytics**: trends over time, department comparison, and **item-level results** that flag items below 3.50 and items that stay low across periods.

#### Audit log
Every view, change and release of results, with who did it and when. It can't be edited.

### Student

Sign in as `st_a01`.

1. Open **My evaluations**. Each card is one teacher to evaluate for one class.
2. Click **Start evaluation**.
3. For each statement, choose a number from **1 (lowest)** to **5 (highest)**.
4. Not finished? Click **Save and finish later**. The card then says **Continue**.
5. When you're done, click **Submit evaluation**, then **Yes, submit**. If you missed an item, it turns red and the page scrolls to it.

You can't change an evaluation after submitting it. Teachers **never see who evaluated them**.

### Faculty

Sign in as `fac_a1`.

- **My evaluations**: anyone you are asked to evaluate (if there is anyone).
- **My results**:
  - While a period is open: how many students in each class have answered and how many more are needed.
  - After the VPs approve and HR releases the results: your final score, each group's score, each class, per-item results and comments, **never with evaluator names**. Earlier imported records are shown too.

### Dean and Program Chair

Sign in as `dean_a` or `chair_a`.

- **My evaluations**: evaluate the faculty in your department, with an optional comment (shown to the person without your name).
- **Department progress**: completion in your department, so you can remind people. You also get alerts about low participation.
- **Department results** (deans and principals): after release, the department summary item by item, each faculty member's results, and any results another office requested through you.
- Deans also have **My results**.

### Secretary, staff and principals

Sign in as `sec_a`, `staff_a`, `head_a` or `principal`. Open **My evaluations** and answer your forms. Office heads and staff evaluate each other, and see their results under **My results**.

### Vice President

Sign in as `vp`. Only the Vice Presidents approve results (there is no Director step). VPs only see periods that HR has sent to them.

- **Overview**: results **waiting for your review**, with an **Approve for release to faculty** button. Faculty can't see their results until every VP approves. Also the average score and each department's average.
- **Reports**: every person's results, including comments, but without evaluator names.
- **Analytics**: trends and department comparisons.

### Clinical Instructor (CI)

Sign in as `ci_c1`. Clinical Instructors are **only in the School of Nursing** (for example Nursing duty in the hospital or skills lab), so only Nursing students evaluate them. The system refuses a CI account in any other department. The **students of their clinical class** and **their dean** evaluate them, **Students 50 / Dean 50** to start, because the official CI weights are not given yet (they are "??" in the follow-up diagram); HR can change them under **Weights**. CIs don't evaluate anyone. **My results** shows their class's response progress and, after release, their results.

### HRMC Assistant

Sign in as `hr_assistant`. The HRMC Assistant has the same screens and powers as the HR Specialist, so the two can split the evaluation work. Every action is recorded in the **Audit log** under the name of whoever did it.

### Everyone

- **Notifications**: reminders, overdue warnings and invalidated-class notices. A red dot on the menu means there is something new. Use **Mark all as read** to clear them.
- **My account**: your details, and **Change password**. Changing your password signs you out on your other devices.
- **Log out**: the button next to your name at the bottom of the menu.

#### Accounts

- New accounts, and accounts whose password HR reset, must **choose a new password at the first sign-in** before they can do anything else.
- A password needs **at least 8 characters**, with **a letter and a number**, and it must **not contain your username**.

---

## A full evaluation cycle, step by step

Try this with the sample accounts to see the whole flow:

1. **HR** (`hr`): under **Weights**, check the weights.
2. **HR**: under **Periods & release**, create a new period, then **Generate tasks** under Assignments.
3. **Student** (`st_a01@s.ubaguio.edu`): submit an evaluation with a comment.
4. **Dean** (`dean_a@ubaguio.edu`): evaluate a faculty member.
5. **HR**: check **Progress**, send participation alerts and reminders.
6. **HR**: **close** the period, then **send it to VPs**.
7. **VP** (`vp`): review **Reports**, then click **Approve**.
8. **HR**: **release to faculty**.
9. **Faculty** (`fac_a1`): open **My results**. **Dean**: open **Department results**.
10. **HR**: open **Audit log** to see every view and release.

To start over afterwards, sign in as HR and click **Reset simulated data** under Periods & release.

## How scores are calculated

1. Each evaluation gets a weighted average of its ratings (1–4), using the form's category and item weights.
2. **Students**: a class counts only if **at least half of the class plus one** answered (26 of 50). Qualifying classes are averaged. Several program chairs are averaged too.
3. The groups (Students, Dean, Program Chair…) are combined with the **weights** in force for that period.
4. If a group has **no valid result**, its weight is **removed from the denominator** (no dean → computed over 60%).
5. The final score is **rounded to two decimal places**.

The same explanation is in the app under **My results → How scores are calculated**.

## Using it on your phone

Your phone and computer must be on the **same Wi-Fi**.

1. Start the app with:
   ```
   npm run dev -- --host
   ```
2. The terminal prints a **Network** address, for example `http://192.168.100.14:5173`.
3. Open that address in your phone's browser.

If it doesn't load, Windows Firewall may be blocking it: allow Node.js on private networks when Windows asks.

## Common problems

| Problem | What to do |
| --- | --- |
| `npm` or `node` is not recognized | Install Node.js 24+ and open a new terminal. |
| Error about `node:sqlite` | Your Node is too old. Install Node 24 or newer. |
| "Port 5173 is in use" | The app is already running in another terminal. Close it, or use the address Vite prints. |
| "Too many failed attempts" when signing in | Wait 15 minutes, or restart the app (the lockout is kept in memory). |
| Forgot a password | Ask HR to use **Reset password**. With sample data you can also delete `server/data/` to start fresh. |
| Want brand-new sample data | Stop the app, delete the `server/data/` folder, and start it again. |
| Changes to `server/` files don't apply | Stop the app (`Ctrl + C`) and run `npm run dev` again. |

---

## Manuscript requirements and where they are in the system

Requirements from Chapter 3, Tables 8 and 9.

| No. | Requirement | Where in evalU |
| --- | --- | --- |
| FR1 | Sign in with official institutional email | Sign-in screen; HR must enter a `@ubaguio.edu` email for each account; other emails refused |
| FR2 | Each role sees and does only what it may | Menu per role; server checks every action (`server/actions.js`) and filters data (`server/view.js`) |
| FR3 | Forms with weighted categories and items, per role and department | HR → Forms (categories, item weights, department-specific forms) |
| FR4 | Revising a form makes a new version; past results unchanged | HR → Forms → Create new version; used forms and answered criteria are locked |
| FR5 | HR sets evaluator weights per group | HR → Weights (40/40/20, 40/20/20/20, CI 50/50) |
| FR6 | Assign from class lists, excluding internship/practicum/field trip | HR → Class lists (import) and Assignments → Generate tasks |
| FR7 | Answer inside the system; teacher/subject/section fixed | My evaluations (no links, nothing to type) |
| FR8 | Open and close per department and cycle | HR → Periods (choose departments) |
| FR9 | Monitor completion per evaluator, class, department | HR → Progress and Assignments (search by evaluator) |
| FR10 | Remind evaluators and alert their department before the deadline | Automatic daily reminders (last 7 days) + Send reminders now |
| FR11 | Class counts only with half of the class plus one | Rule used in every score and progress view |
| FR12 | Notify everyone concerned about each class's participation | Alerts to teacher, department heads and HR (open and on close) |
| FR13 | Average subjects and chairs, re-weight missing groups, 2 decimals | Score computation (`computeTarget` in `src/lib/logic.js`) |
| FR14 | Comments verbatim, grouped by source, no student identity | Comments in individual reports and My results |
| FR15 | Per-subject, dean, chair, final reports with per-item distributions | Reports → Individual report (print / save as PDF) |
| FR16 | Department-wide per-item summaries for deans | Reports → Department summary; Dean → Department results |
| FR17 | HR review → VP approval → faculty | Periods & release + VP Approve button |
| FR18 | Requests from other offices go only through the dean | Reports → Requests from offices |
| FR19 | Item-level results, flag consistently low items | Analytics → Item-level results; low items marked in reports |
| FR20 | Log who viewed, changed or released each result | HR → Audit log |
| FR21 | Keep history; hold results imported from 2022 | Reports → Earlier records (import); My results |
| NFR1 | Works directly on mobile phones | Phone layout, no redirects |
| NFR2 | Simple forms | One question per row, 4-point buttons (4 → 1, like the paper tools), save and continue later |
| NFR3 | Correct weighted ratings | Automated tests (`npm test`) check the rules |
| NFR4 | 20,000 students without lag | Not tested at that scale (outside the study's scope, Chapter 2) |
| NFR5 | Faculty never see which student rated them | Evaluator names removed by the server |
| NFR6 | Faculty can't see results before VP approval | Release requires every VP's approval |
| NFR7 | Every view, change and release attributable | Audit log |
| NFR8 | Revising a form or weights doesn't change past results | Form versions; each period keeps its weights |
| NFR9 | Change forms and weights without code | Forms and Weights pages |
| NFR10 | Keep records as long as storage permits | Nothing is deleted automatically |

## For developers

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | App and backend together, with live reload (the API runs inside the Vite dev server) |
| `npm run build` | Builds the app into `dist/` |
| `npm start` | Production server on port 3000 (serves `dist/` and the API) |
| `npm test` | Logic tests and backend tests (`tests/api.test.mjs` uses a temporary database) |
| `npm run lint` | Code checks with oxlint |

### Project structure

```
evalu/
├─ src/              The app in the browser (React)
│  ├─ App.jsx        Sign-in, menu and pages for each role
│  ├─ ui.jsx         Shared pieces (cards, badges, icons, progress bars)
│  ├─ index.css      All styles, including the phone and tablet layouts
│  ├─ lib/           Rules (logic.js), sample data (seed.js), data loading (store.jsx)
│  └─ pages/         One file for each group of screens
├─ server/           The backend (Node, no extra packages)
├─ tests/            Automated tests
└─ public/           Images, e.g. the campus photo on the sign-in screen
```

### Backend and database

All data lives on a small Node server in `server/`. The browser only shows it.

The database is SQLite (built into Node), stored in `server/data/evalu.db`. To look inside it, open the file with a tool like **DB Browser for SQLite**, preferably while the app is stopped.

Tables: `departments`, `users`, `sections`, `section_students`, `criteria`, `instruments` (forms), `instrument_items`, `group_weights`, `periods`, `tasks`, `responses`, `answers`, `notifications`, `result_requests`, `past_results`, `audit_log`, `sessions`. The schema is at the top of `server/db.js`.

| File | What it does |
| --- | --- |
| `server/api.js` | All `/api/*` routes |
| `server/auth.js` | Sign-in, session cookie, failed-attempt lockout |
| `server/actions.js` | Every change (submit evaluation, close period, edit forms, accounts...), with who may do it and input checks |
| `server/view.js` | What each role is allowed to see |
| `server/db.js` | SQLite tables, loading and saving |
| `server/secrets.js` | Password hashing (scrypt) and comment encryption (AES-256-GCM) |
| `server/seed.js` | Sample data for an empty database |
| `server/upgrade.js` | Brings a database from an earlier version up to date, keeping all data |
| `server/index.js` | Production server |

### API

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/data`: the data the signed-in user may see
- `POST /api/actions/<name>`: make a change, e.g. `submitEvaluation`, `closePeriod`, `approveRelease`, `importClassList`, `reviseForm` (full list in `server/actions.js`)
- `GET /api/audit`: the audit log (HR only)

### Security

- Passwords are stored only as salted scrypt hashes. Sessions use an `HttpOnly`, `SameSite=Strict` cookie (8 hours; `Secure` when `NODE_ENV=production`), and only a hash of the session token is stored.
- After 5 failed sign-ins for the same username from the same address, sign-in is blocked for 15 minutes.
- Every action checks the user's role on the server. Students and staff can only answer their own tasks; only HR can manage periods, assignments, forms, weights and accounts.
- Each role receives only what it may see. Students see only their own tasks; faculty see their own results only after release, without evaluator names or comments; VPs see released periods only, without evaluator names.
- Dean/Chair comments are encrypted in the database with a key kept on the server (`server/data/secret.key`, or the `EVALU_SECRET` environment variable).
- `server/data/` (the database and the key) is git-ignored. **Back it up.** Without `secret.key`, encrypted comments can't be read.
