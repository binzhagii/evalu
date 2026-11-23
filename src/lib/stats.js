// How much a rating can be trusted: margin of error, confidence and form reliability.
//
// A teacher's student rating comes from the students who answered, not from the whole class. If other
// students had answered, the average would be a little different. The 95% margin of error says how much:
// "3.52 ± 0.08" means the rating of the whole class would very likely be between 3.44 and 3.60.
// Because a class is small and a large part of it answers, the finite population correction is applied
// (when every student answers there is no sampling error at all).
// Cronbach's alpha tells whether the questions of a form measure the same thing consistently.
// Used by the result cards, the stored results and Analytics; the same code runs in the browser and the server.

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Sample standard deviation (n - 1); null with fewer than 2 values. */
export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

// two-sided 95% critical values of Student's t for 1-30 degrees of freedom
const T95 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
/** Two-sided 95% t value for `df` degrees of freedom (1.96 for very large samples). */
export const t95 = (df) => (!(df >= 1) ? null : df <= 30 ? T95[Math.floor(df)] : df <= 40 ? 2.021 : df <= 60 ? 2.0 : df <= 120 ? 1.98 : 1.96);

/**
 * Mean and 95% margin of error of a sample of ratings.
 *   xs: the ratings received; N: how many could have answered (class size, or evaluators assigned).
 * Returns { n, mean, sd, se, df, moe }; moe is null with one rating (no spread to measure) and 0 when
 * everyone who could answer did (the whole group, not a sample).
 */
export function sampleStats(xs, N = null) {
  const n = xs.length;
  const out = { n, mean: mean(xs), sd: sd(xs), se: null, df: n - 1, moe: null };
  if (n >= 1 && N && n >= N) return { ...out, se: 0, moe: 0 }; // everyone answered: nothing was left out
  if (n < 2) return out;
  const fpc = N && N > 1 ? Math.sqrt(Math.max(0, (N - n) / (N - 1))) : 1;
  out.se = (out.sd / Math.sqrt(n)) * fpc;
  out.moe = t95(n - 1) * out.se;
  return out;
}

/**
 * Margin of error of an average of several class averages (UB: average per class, then of the classes).
 * parts: [{ xs, N }] one per counted class.
 */
export function averageOfAverages(parts) {
  const st = parts.map((p) => sampleStats(p.xs, p.N));
  const k = st.length;
  if (!k) return { n: 0, mean: null, se: null, df: 0, moe: null };
  const n = st.reduce((a, s) => a + s.n, 0);
  if (st.some((s) => s.se == null && s.n < 2)) return { n, mean: mean(st.map((s) => s.mean)), se: null, df: 0, moe: null };
  const se = Math.sqrt(st.reduce((a, s) => a + s.se ** 2, 0)) / k;
  const df = st.reduce((a, s) => a + s.n - 1, 0);
  return { n, mean: mean(st.map((s) => s.mean)), se, df, moe: se === 0 ? 0 : t95(df) * se };
}

/** Margin of error of a weighted sum of independent group ratings: sqrt(sum (share x moe)^2). */
export function combinedMargin(parts) {
  const used = parts.filter((p) => p.share > 0);
  if (!used.length || used.some((p) => p.moe == null)) return null;
  return Math.sqrt(used.reduce((a, p) => a + (p.share * p.moe) ** 2, 0));
}

/** How sure a rating is, in words, from its margin of error. */
export function confidenceLabel(moe) {
  if (moe == null) return null;
  if (moe <= 0.1) return 'High';
  if (moe <= 0.25) return 'Moderate';
  return 'Low';
}

/**
 * Cronbach's alpha of a form: rows = responses, columns = questions (all answered).
 * alpha = k / (k - 1) x (1 - sum of question variances / variance of the totals). Null when it can't be computed.
 */
export function cronbachAlpha(rows) {
  const n = rows.length, k = rows[0]?.length || 0;
  if (n < 3 || k < 2) return null;
  const v = (xs) => { const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1); };
  const itemVar = Array.from({ length: k }, (_, j) => v(rows.map((r) => r[j]))).reduce((a, b) => a + b, 0);
  const totalVar = v(rows.map((r) => r.reduce((a, b) => a + b, 0)));
  if (!(totalVar > 0)) return null;
  return (k / (k - 1)) * (1 - itemVar / totalVar);
}
/** George & Mallery (2003) rule of thumb. */
export function alphaLabel(a) {
  if (a == null) return null;
  return a >= 0.9 ? 'Excellent' : a >= 0.8 ? 'Good' : a >= 0.7 ? 'Acceptable' : a >= 0.6 ? 'Questionable' : 'Poor';
}
