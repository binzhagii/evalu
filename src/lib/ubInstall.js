// Puts UB's evaluation tools (ubForms.js) into a database as active forms.
// Used for new databases (seed.js) and once for existing ones (server/upgrade.js).
import { UB_FORMS } from './ubForms.js';

export const UB_FORM_MARK = '(UB tool)';

/** Adds every UB form that isn't there yet. Returns how many forms were added. */
export function installUbForms(db) {
  const key = (text, levels) => `${text.toLowerCase()}|${(levels || []).join('|').toLowerCase()}`;
  const byKey = new Map(db.criteria.map((c) => [key(c.text, c.levels), c.id]));
  const ids = new Set([...db.criteria.map((c) => c.id), ...db.instruments.map((i) => i.id)]);
  const fresh = (p) => { let n = ids.size + 1; while (ids.has(`${p}${n}`)) n++; ids.add(`${p}${n}`); return `${p}${n}`; };
  let added = 0;
  for (const f of UB_FORMS) {
    const name = `${f.name} ${UB_FORM_MARK}`;
    const same = (i) => i.targetType === f.targetType && i.group === f.group && (i.dept || null) === f.dept && (i.variant || null) === f.variant;
    if (db.instruments.some((i) => same(i) && i.name === name)) continue;
    const items = [];
    for (const c of f.categories)
      for (const it of c.items) {
        const k = key(it.text, it.levels);
        let cid = byKey.get(k);
        if (!cid) { cid = fresh('ubc'); byKey.set(k, cid); db.criteria.push({ id: cid, text: it.text, ...(it.levels && { levels: it.levels }) }); }
        if (!items.some((x) => x.criterionId === cid)) items.push({ criterionId: cid, weight: 1, category: c.name });
      }
    const older = db.instruments.filter(same);
    db.instruments.push({
      id: fresh('ub_form'), name, targetType: f.targetType, group: f.group, dept: f.dept, ...(f.variant && { variant: f.variant }),
      version: Math.max(0, ...older.map((i) => i.version || 1)) + 1, active: true,
      categories: Object.fromEntries(f.categories.map((c) => [c.name, c.weight])), items,
    });
    // the UB tool replaces the sample form for the same pairing (forms HR made stay as they are)
    for (const o of older) if (/\(sample\)/i.test(o.name)) o.active = false;
    added++;
  }
  return added;
}
