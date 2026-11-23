// Dynamic evaluation computation engine (algorithm-independent).
//
// The final rating of a person is computed from a FORMULA stored as data (not written in the code):
//   { method, components: [{ group, weight, aggregation }], expression, missing, minGroups, rounding }
// HR encodes the formula the evaluation committee approved. This engine does the shared work (missing
// groups, minimum groups, rounding, the steps) and hands the math to the computation module named by
// `method` (src/lib/methods/: weighted average, simple average, geometric mean, harmonic mean, HR's own
// formula). A new method is a new module there; this file and the rest of evalU do not change.
//
// Shared by the server and the browser (the simulator runs the same engine HR sees).
import { has, parseExpression, evaluate, expressionVars } from './expression.js';
import { METHODS, methodOf, methodList, registerMethod } from './methods/index.js';

export { METHODS, methodOf, methodList, registerMethod, parseExpression, evaluate, expressionVars };
export const AGGREGATIONS = {
  AVERAGE: 'Average of the evaluators',
  MEDIAN: 'Middle value (median)',
  SECTION_AVERAGE: 'Average per class, then average of the classes',
  POOLED: 'All students together',
};
// "Short words: explanation" (screens show the part before the colon)
export const MISSING_RULES = {
  REWEIGHT: 'Use only the groups that have a rating: their percentages are scaled up to 100%',
  INVALIDATE: 'No final rating yet: wait until every group has a rating',
  ZERO: 'Count it as 0: the final rating goes down',
  SUBSTITUTE_MEAN: 'Give it the average of the other groups: then compute as usual',
};
export const ROUNDING_METHODS = {
  HALF_UP: 'Normal rounding (3.465 → 3.47)',
  HALF_EVEN: "Banker's rounding (3.465 → 3.46)",
  DOWN: 'Always down (3.469 → 3.46)',
  UP: 'Always up (3.461 → 3.47)',
};
const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};


/** Round with the formula's rounding method; immune to binary float noise (3.465 stays 3.465). */
export function roundBy(x, decimals = 2, method = 'HALF_UP') {
  if (x == null || !Number.isFinite(x)) return null;
  const f = 10 ** decimals;
  const scaled = Math.round(x * f * 1e6) / 1e6; // remove float noise first
  const floor = Math.floor(scaled), frac = +(scaled - floor).toFixed(6);
  let r;
  if (method === 'DOWN') r = floor;
  else if (method === 'UP') r = frac > 0 ? floor + 1 : floor;
  else if (method === 'HALF_EVEN') r = frac > 0.5 ? floor + 1 : frac < 0.5 ? floor : (floor % 2 === 0 ? floor : floor + 1);
  else r = frac >= 0.5 ? floor + 1 : floor;
  return r / f;
}

/* ---------------- formulas ---------------- */
/**
 * The starting formula of a category before HR saves one: the starting percentages stored in the
 * database at setup (manuscript, Table 6). No formula is built into the program; HR replaces this one.
 */
export function defaultFormula(weights = {}, policy = {}) {
  return {
    name: 'Starting formula', version: 0, method: 'WEIGHTED_AVERAGE',
    methodVersion: methodOf('WEIGHTED_AVERAGE').version,
    components: Object.entries(weights).map(([group, weight]) => ({ group, weight: weight === '' ? null : weight, aggregation: group === 'ST' ? 'SECTION_AVERAGE' : 'AVERAGE' })),
    expression: '',
    missing: policy.missingGroup === 'incomplete' ? 'INVALIDATE' : 'REWEIGHT',
    minGroups: 1,
    rounding: { decimals: policy.decimals ?? 2, method: 'HALF_UP' },
  };
}


/**
 * A formula as percentages, the way HR changes every formula. A formula saved earlier with another method keeps its
 * groups; "every group the same" becomes equal percentages, and HR types the percentages of a written expression.
 */
export function asPercentages(f) {
  if (f.method === 'WEIGHTED_AVERAGE') return f;
  const m = methodOf(f.method, f.methodVersion ?? 1), comps = f.components || [], n = comps.length;
  const each = n ? Math.floor(10000 / n) / 100 : 0;
  const weight = (c, i) => (m?.usesWeights ? c.weight : m?.equalShares ? (i === n - 1 ? +(100 - each * (n - 1)).toFixed(2) : each) : null);
  return { ...f, method: 'WEIGHTED_AVERAGE', methodVersion: methodOf('WEIGHTED_AVERAGE').version, expression: '', components: comps.map((c, i) => ({ ...c, weight: weight(c, i) })) };
}

/** Problems that stop a formula from being submitted or used (empty list = valid). */
export function validateFormula(f, { allowedGroups = null, groupNames = {} } = {}) {
  const errs = [];
  const m = methodOf(f.method, f.methodVersion ?? 1);
  if (!m) errs.push(f.method ? `Computation method "${f.method}" version ${f.methodVersion ?? 1} is not available.` : 'Choose a computation method.');
  const comps = f.components || [];
  if (!comps.length) errs.push('Add at least one evaluator group.');
  const seen = new Set();
  for (const c of comps) {
    const label = groupNames[c.group] || c.group;
    if (seen.has(c.group)) errs.push(`${label} is listed twice.`);
    seen.add(c.group);
    if (allowedGroups && !allowedGroups.includes(c.group)) errs.push(`${label} has no evaluation tool in use for this category, so nobody could be assigned to evaluate. Finish it under Evaluation tools first.`);
    if (!has(AGGREGATIONS, c.aggregation)) errs.push(`Choose how ${label}'s evaluators are combined.`);
    if (c.group !== 'ST' && ['SECTION_AVERAGE', 'POOLED'].includes(c.aggregation)) errs.push(`"${AGGREGATIONS[c.aggregation]}" is only for students.`);
    if (m?.usesWeights && !(Number(c.weight) > 0)) errs.push(`${label} needs a weight above 0%.`);
    if (c.transform?.trim()) {
      try {
        const tree = parseExpression(c.transform, ['X']);
        if (!expressionVars(tree).has('X')) errs.push(`${label}'s score transformation must use x.`);
      } catch (e) { errs.push(`${label}'s score transformation: ${e.message}`); }
    }
  }
  if (m?.usesWeights) {
    const total = comps.reduce((a, c) => a + (Number(c.weight) || 0), 0);
    if (Math.abs(total - 100) > 1e-9) errs.push(`The weights add up to ${+total.toFixed(2)}%; they must add up to 100%.`);
  }
  if (m?.validate) errs.push(...m.validate(f, { groupNames }));
  if (!has(MISSING_RULES, f.missing)) errs.push('Choose what happens when a group is missing.');
  else if (m && !m.missingRules.includes(f.missing)) errs.push(`"${MISSING_RULES[f.missing].split(':')[0]}" does not work with "${m.label}"; choose another rule for a missing group.`);
  const d = Number(f.rounding?.decimals);
  if (!Number.isInteger(d) || d < 0 || d > 4) errs.push('Decimal places must be 0 to 4.');
  if (!has(ROUNDING_METHODS, f.rounding?.method)) errs.push('Choose a rounding method.');
  if (f.effectiveFrom && !validDate(f.effectiveFrom)) errs.push('Effective-from date must be a valid calendar date.');
  if (f.effectiveUntil && !validDate(f.effectiveUntil)) errs.push('Effective-until date must be a valid calendar date.');
  if (f.effectiveFrom && f.effectiveUntil && f.effectiveUntil < f.effectiveFrom) errs.push('Effective-until date must be on or after the effective-from date.');
  const mg = Number(f.minGroups ?? 1);
  if (!Number.isInteger(mg) || mg < 1 || mg > Math.max(1, comps.length)) errs.push('The minimum number of groups must be between 1 and the number of groups.');
  return errs;
}

/**
 * Run a formula on the groups' scores.
 *   scores: { ST: 3.5, DEAN: null, CHAIR: 3.4 }   (null = no valid result from that group)
 * Returns { final, status, basis, breakdown, missing, steps, how } where status is
 * complete | reweighted | incomplete | weights-missing, breakdown lists each group's score, applied
 * weight (share of the total) and contribution, and `how` is the computation in plain numbers.
 * The shared rules are applied here; the math itself is done by the method's module.
 */
export function computeFinal(f, scores) {
  const m = methodOf(f.method, f.methodVersion ?? 1);
  const comps = f.components || [];
  const groups = comps.map((c) => c.group);
  let missing = groups.filter((g) => scores[g] == null);
  const dec = Number(f.rounding?.decimals ?? 2), how = f.rounding?.method || 'HALF_UP';
  const out = (final, status, basis, breakdown, steps, text = '') => ({ final, status, basis, breakdown, missing, steps, how: text });

  if (!m) return out(null, 'incomplete', null, [], [`Computation method "${f.method || 'none'}" version ${f.methodVersion ?? 1} is not available.`]);
  if (m.usesWeights && comps.some((c) => c.weight == null || c.weight === '')) return out(null, 'weights-missing', null, [], ['Some weights are not set.']);
  const transformed = {};
  for (const c of comps) {
    const value = scores[c.group];
    if (value == null || !c.transform?.trim() || c.transform.trim().toLowerCase() === 'x') {
      transformed[c.group] = value ?? null;
      continue;
    }
    let result;
    try { result = evaluate(parseExpression(c.transform, ['X']), { X: value }); }
    catch (e) { return out(null, 'incomplete', null, [], [`${c.group} score transformation failed: ${e.message}`]); }
    if (result == null || !Number.isFinite(result)) return out(null, 'incomplete', null, [], [`${c.group} score transformation did not produce a number.`]);
    transformed[c.group] = result;
  }
  missing = groups.filter((g) => transformed[g] == null);
  const have = groups.filter((g) => transformed[g] != null);
  if (!have.length) return out(null, 'incomplete', null, [], ['No group has a valid result yet.']);
  if (have.length < Number(f.minGroups || 1)) return out(null, 'incomplete', null, [], [`Only ${have.length} group(s) have a result; the formula needs at least ${f.minGroups}.`]);
  if (missing.length && f.missing === 'INVALIDATE') return out(null, 'incomplete', null, [], [`Missing: ${missing.join(', ')}. The formula gives no final rating while a group is missing.`]);

  // a missing group: left out (re-weight), counted as 0, or given the others' average
  const meanHave = have.reduce((a, g) => a + transformed[g], 0) / have.length;
  const val = (g) => (transformed[g] != null ? transformed[g] : f.missing === 'ZERO' ? 0 : f.missing === 'SUBSTITUTE_MEAN' ? meanHave : null);
  const usedComps = comps.filter((c) => (f.missing === 'REWEIGHT' ? transformed[c.group] != null : true));
  const items = usedComps.map((c) => ({ group: c.group, value: val(c.group), weight: m.usesWeights ? Number(c.weight) : 1 }));
  if (!items.length || items.some((x) => x.value == null)) return out(null, 'incomplete', null, [], ['A group has no rating and the missing-group rule gives it none.']);
  if (m.usesWeights && !items.reduce((a, x) => a + x.weight, 0)) return out(null, 'incomplete', null, [], ['The groups with a result have no weight.']);

  let r;
  try { r = m.compute(items, f) || {}; } catch (e) { return out(null, 'incomplete', null, [], [`Computation error: ${e.message}`]); }
  if (r.raw == null || !Number.isFinite(r.raw)) return out(null, 'incomplete', null, [], [r.error || 'The formula could not be computed.']);

  const final = roundBy(r.raw, dec, how);
  const part = new Map((r.parts || []).map((p) => [p.group, p]));
  const breakdown = comps.map((c) => {
    const it = items.find((x) => x.group === c.group), p = part.get(c.group);
    return { group: c.group, score: scores[c.group], used: it ? it.value : null, weight: m.usesWeights ? Number(c.weight) : null, share: it ? p?.share ?? null : 0, contribution: it ? p?.contribution ?? null : 0 };
  });
  const basis = m.usesWeights ? usedComps.reduce((a, c) => a + Number(c.weight), 0) : null;
  const steps = [`${m.label} (algorithm version ${m.version}): ${r.how} = ${+r.raw.toFixed(6)}`];
  if (missing.length) steps.push(`Missing ${missing.join(', ')}: ${MISSING_RULES[f.missing].split(':')[0].toLowerCase()}.`);
  steps.push(`Rounded (${how.toLowerCase().replace('_', ' ')}, ${dec} decimals): ${final}`);
  return out(final, missing.length ? 'reweighted' : 'complete', basis, breakdown, steps, r.how);
}

/** The formula as a plain sentence: "Final rating = 40% Students + 40% Dean + 20% Program Chair". */
export function formulaWords(f, names = {}) {
  const m = methodOf(f.method, f.methodVersion ?? 1);
  return m ? m.words(f.components || [], (g) => names[g] || g, f) : 'Final rating = …';
}
/** How a result was reached, in plain numbers: "40% × 3.50 + 40% × 3.60 + 20% × 3.40 = 3.52". */
export function howInWords(r) {
  if (r.final == null) return r.status === 'weights-missing' ? 'Percentages are not set yet.' : 'No final rating yet.';
  if (r.how) return `${r.how} = ${r.final}`;
  // results stored before the modules existed (weighted or simple average)
  const parts = (r.breakdown || []).filter((b) => b.share);
  if (!parts.length) return `= ${r.final}`;
  return `${parts.map((b) => `${+(b.share * 100).toFixed(1)}% × ${b.used.toFixed(2)}`).join(' + ')} = ${r.final}`;
}
/** The formula in symbols, e.g. "F = 0.40·ST + 0.40·DEAN + 0.20·CHAIR". */
export function formulaText(f) {
  const m = methodOf(f.method, f.methodVersion ?? 1);
  return m ? m.symbols(f.components || [], f) : 'F = …';
}
