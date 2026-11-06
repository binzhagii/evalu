# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Backend and database

All data lives on a small Node server in `server/` (no extra packages). The browser only shows it.

- `npm run dev`: starts the app **and** the backend together (the API runs inside the Vite dev server). Restart it after changing files in `server/`.
- `npm run build` then `npm start`: production server on http://localhost:3000 (set `PORT` to change it).
- `npm test`: runs the logic tests and the backend tests (`tests/api.test.mjs`, using a temporary database).

### Database

SQLite (built into Node), stored in `server/data/evalu.db`. It is created and filled with the sample data the first time the server starts (password for every sample account: `demo1234`). To start over, stop the server and delete `server/data/`, or use **Reset simulated data** as HR.

Tables: `departments`, `users`, `sections`, `section_students`, `criteria`, `instruments` (forms), `instrument_items`, `group_weights`, `periods`, `tasks`, `responses`, `answers`, `notifications`, `sessions`. The schema is at the top of `server/db.js`.

### Server files

| File | What it does |
| --- | --- |
| `server/api.js` | All `/api/*` routes |
| `server/auth.js` | Sign-in, session cookie, failed-attempt lockout |
| `server/actions.js` | Every change (submit evaluation, close period, edit forms...), with who may do it and input checks |
| `server/view.js` | What each role is allowed to see |
| `server/db.js` | SQLite tables, loading and saving |
| `server/secrets.js` | Password hashing (scrypt) and comment encryption (AES-256-GCM) |
| `server/seed.js` | Sample data for an empty database |
| `server/index.js` | Production server |

### API

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/data`: the data the signed-in user may see
- `POST /api/actions/<name>`: make a change, e.g. `submitEvaluation`, `closePeriod`, `setGroupWeight` (full list in `server/actions.js`)

### Accounts

There is no public sign-up: a person's role decides what they can see, so accounts are created by HR.

- **HR → Accounts**: add, edit, deactivate or reactivate accounts, enroll students in classes, and reset passwords.
- A new account, or one whose password was reset, gets a temporary password that HR hands over privately. At the first sign-in the person must choose their own password before they can do anything else.
- **My account** (everyone): change your own password. Your other devices are signed out.
- Passwords need at least 8 characters, with a letter and a number, and must not contain the username.
- Deactivated accounts can't sign in and get no new evaluation tasks; their past evaluations stay in the reports.

### Security

- Passwords are stored only as salted scrypt hashes. Sessions use an `HttpOnly`, `SameSite=Strict` cookie (8 hours; `Secure` when `NODE_ENV=production`), and only a hash of the session token is stored.
- After 5 failed sign-ins for the same username from the same address, sign-in is blocked for 15 minutes.
- Every action checks the user's role on the server. Students and staff can only answer their own tasks; only HR can manage periods, assignments, forms and weights.
- Each role receives only what it may see. Students see only their own tasks; faculty see their own results only after release, without evaluator names or comments; Directors/VPs see released periods only, without evaluator names.
- Dean/Chair comments are encrypted in the database with a key kept on the server (`server/data/secret.key`, or the `EVALU_SECRET` environment variable).
- `server/data/` is git-ignored.
