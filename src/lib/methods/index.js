// The computation modules (plug-ins) the engine can run. Strategy pattern: the engine (../formula.js)
// does the shared work (missing groups, minimum groups, rounding, steps) and hands every module the
// same input; each module only does its own math. The rest of evalU never knows which module ran.
//
// To add a new computation method, a developer:
//   1. copies one of these files (e.g. geometric-mean.js) and changes the math,
//   2. gives it a new method id, or increments its version and keeps the old implementation,
//   3. adds it to the list below.
// Nothing else changes: the Rating formula page, the approval, the versions, the reports and the
// stored results all work with it. HR then picks it, the VP approves it, and HR starts using it.
// Never replace the implementation registered for an existing id/version: historical formulas
// refer to that exact pair so their results remain reproducible.
//
// A module is an object with:
//   id            stable method name stored in every formula that uses it
//   version       immutable algorithm version stored with every formula (defaults to 1)
//   label, help   what HR sees on the Rating formula page (plain words)
//   usesWeights   true: HR types a percentage per group (they must add up to 100%)
//   equalShares   true: every group counts the same (shown as equal percentages)
//   usesExpression true: HR writes the formula (shows the formula box)
//   advanced      true: a special-case method (the Scoring page itself only uses percentages, WEIGHTED_AVERAGE)
//   missingRules  the "if a group has no rating" rules that make sense for this method
//   compute(items, formula) → { raw, parts?, how, error? }
//       items  [{ group, value, weight }]: the groups that take part, each with a rating
//       raw    the result before rounding (null when it cannot be computed; error says why)
//       parts  optional [{ group, share, contribution }] for the breakdown table
//       how    the computation in plain numbers, e.g. "40% × 3.50 + 60% × 3.40"
//   words(components, name, formula)   the formula as a sentence
//   symbols(components, formula)       the formula in symbols
//   validate(formula, { groupNames })  optional extra checks → list of problems
import weightedAverage from './weighted-average.js';
import simpleAverage from './simple-average.js';
import geometricMean from './geometric-mean.js';
import harmonicMean from './harmonic-mean.js';
import custom from './custom.js';

const REGISTRY = new Map();
const methodKey = (id, version) => `${id}@${version}`;
/** { id: label } of every module (what the server accepts as a formula's method). */
export const METHODS = {};

/** Add a computation module (checks that it has everything the engine needs). */
export function registerMethod(m) {
  for (const k of ['id', 'label', 'missingRules', 'compute', 'words', 'symbols']) if (!m?.[k]) throw new Error(`Computation module is missing "${k}".`);
  if (!/^[A-Z][A-Z0-9_]*$/.test(m.id)) throw new Error(`Module id "${m.id}" must be CAPITAL_LETTERS.`);
  if (!Array.isArray(m.missingRules) || typeof m.compute !== 'function' || typeof m.words !== 'function' || typeof m.symbols !== 'function') {
    throw new Error(`Computation module "${m.id}" has an invalid interface.`);
  }
  const version = m.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error(`Module "${m.id}" needs a positive integer version.`);
  const key = methodKey(m.id, version);
  if (REGISTRY.has(key)) throw new Error(`Computation module "${key}" is already registered; use a new version instead.`);
  const method = Object.freeze({ usesWeights: false, equalShares: false, help: '', ...m, version, missingRules: Object.freeze([...m.missingRules]) });
  REGISTRY.set(key, method);
  const latest = [...REGISTRY.values()].filter((x) => x.id === m.id).sort((a, b) => b.version - a.version)[0];
  METHODS[m.id] = latest.label;
  return method;
}

[weightedAverage, simpleAverage, geometricMean, harmonicMean, custom].forEach(registerMethod);

/** The module for a method id, or null. */
export const methodOf = (id, version = 1) => (typeof id === 'string' && REGISTRY.get(methodKey(id, version))) || null;
/** Every registered module, in the order HR sees them. */
export const methodList = () => [...REGISTRY.values()];
