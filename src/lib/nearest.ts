/** Edit distance between two strings: the fewest single-character inserts, deletes or swaps of one for another. */
export function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

const tidy = (path: string) => path.toLowerCase().replace(/\/+$/, "") || "/";

/**
 * The address a mistyped one most likely meant, for "Did you mean /studio?" on
 * the not-found page. A hit is at most two edits away, and fewer than half the
 * candidate's length, so "/x" never becomes "/pdf". Case and a trailing slash
 * don't count. Among equals the first candidate wins.
 * ponytail: plain edit distance over a short list. If the site grows to hundreds
 * of addresses, or needs to match on words in a title, use a search index.
 */
export function nearest(path: string, candidates: readonly string[]): string | null {
  const asked = tidy(path);
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(asked, tidy(candidate));
    if (d < bestDistance && d * 2 < candidate.length) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}
