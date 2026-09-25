// Compare two note takes (Record > Compare takes).
import { claim } from "./timing";

/** Two notes of the same pitch this close (after tempo alignment) are the same note. */
export const COMPARE_WINDOW_MS = 100;

/**
 * Take `b` is stretched onto take `a`'s span (first to last onset, so a slower or
 * faster take still lines up), then every note of `a` claims the nearest same-pitch
 * note of `b`. accuracy = matched / the longer take's note count.
 */
export function compareTakes(
  a: readonly { midi: number; at: number }[],
  b: readonly { midi: number; at: number }[],
): { accuracy: number; matched: number; total: number } {
  const span = (xs: readonly { at: number }[]) => {
    const ats = xs.map((x) => x.at);
    return [Math.min(...ats), Math.max(...ats)] as const;
  };
  const total = Math.max(a.length, b.length);
  if (!a.length || !b.length) return { accuracy: 0, matched: 0, total };
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  const scale = b1 > b0 ? (a1 - a0) / (b1 - b0) : 1;
  const aligned = b.map((n) => ({ midi: n.midi, at: a0 + (n.at - b0) * scale }));
  const matched = claim(a, aligned, COMPARE_WINDOW_MS, (t, h) => t.midi === h.midi).claims.filter(
    Boolean,
  ).length;
  return { accuracy: matched / total, matched, total };
}
