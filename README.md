# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Login backend

Sign-in is handled by a small Node server in `server/` (no extra packages).

- `npm run dev`: starts the app **and** the login API together (the API runs inside the Vite dev server).
- `npm run build` then `npm start`: production server on http://localhost:3000 (set `PORT` to change it).
- `npm test`: runs the logic and login tests.

How it works:

- Accounts live in `server/data/users.json`, created automatically on first run from the sample accounts (password `demo1234`). Passwords are stored only as salted **scrypt** hashes. This folder is git-ignored.
- `POST /api/auth/login` checks the password and sets an `HttpOnly`, `SameSite=Strict` session cookie (8 hours; `Secure` when `NODE_ENV=production`).
- `GET /api/auth/me` returns the signed-in user; `POST /api/auth/logout` ends the session.
- After 5 failed attempts for the same username from the same address, sign-in is blocked for 15 minutes.
- Sessions are kept in memory, so restarting the server signs everyone out.

Only sign-in uses the server. The rest of the app's data (tasks, evaluations, reports) is still stored in the browser's `localStorage`.
