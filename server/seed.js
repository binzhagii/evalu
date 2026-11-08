// Fills the database with the simulated sample data (first run, or HR "Reset").
import { buildSeed, DEMO_PASSWORD } from '../src/lib/seed.js';
import { replaceAll, isEmpty, getDb, save } from './db.js';
import { upgradeData } from './upgrade.js';
import { hashPassword, encryptText } from './secrets.js';

export async function seedDatabase() {
  const db = buildSeed();
  for (const t of db.tasks) {
    if (typeof t.response?.comment === 'string') t.response.comment = encryptText(t.response.comment);
  }
  // sample accounts share the demo password and don't have to change it
  for (const u of db.users) Object.assign(u, { passwordHash: await hashPassword(DEMO_PASSWORD), active: true, mustChangePassword: false });
  replaceAll(db);
  return db;
}

let ready = null;
/** Seeds once if the database is empty. Safe to call many times. */
export function ensureSeeded() {
  ready ??= (async () => {
    if (isEmpty()) {
      await seedDatabase();
      console.log('[evalU] Database created with sample data (password for all accounts: demo1234).');
    } else {
      // a database from an earlier version: fill in the new fields (keeps all data)
      const draft = structuredClone(getDb());
      if (upgradeData(draft)) { save(draft); console.log('[evalU] Database upgraded to the current version.'); }
    }
  })();
  return ready;
}
