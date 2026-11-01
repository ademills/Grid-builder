// Fuzzy match: every query character in order. Higher scores for matches
// at word starts and runs of consecutive characters; null when no match.
export function fuzzyScore(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let score = 0, ti = 0, run = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    const wordStart = at === 0 || /[\s›:(/-]/.test(t[at - 1]);
    run = at === ti ? run + 1 : 0;
    score += 1 + (wordStart ? 6 : 0) + run * 3 - Math.min(at - ti, 10) * 0.2;
    ti = at + 1;
  }
  return score - t.length * 0.01;
}
