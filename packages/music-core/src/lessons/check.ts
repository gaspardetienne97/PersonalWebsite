import type { Lesson } from "./types";

const BANNED = [
  "delve",
  "underscore",
  "tapestry",
  "crucial",
  "pivotal",
  "load bearing",
  "load-bearing",
];

const sentences = (t: string) => t.split(/[.?!]\s+/).filter((s) => s.trim()).length;

/** Copy rules for a lesson (3 to 6 screens) or tier 3 card (1 to 3). Empty means fine. */
export function lessonProblems(l: Lesson, kind: "lesson" | "card" = "lesson"): string[] {
  const out: string[] = [];
  const [min, max] = kind === "card" ? [1, 3] : [3, 6];
  if (l.screens.length < min || l.screens.length > max)
    out.push(`${l.id}: needs ${min} to ${max} screens, has ${l.screens.length}`);
  const copy = (where: string, t: string) => {
    if (/[–—]| - /.test(t)) out.push(`${where}: dash in "${t}"`);
    for (const w of BANNED) if (t.toLowerCase().includes(w)) out.push(`${where}: banned word ${w}`);
  };
  copy(`${l.id} title`, l.title);
  l.screens.forEach((s, i) => {
    const texts = [
      s.title,
      s.text,
      ...(s.steps ?? []).map((x) => x.text),
      ...(s.options ?? []).map((o) => o.label),
    ];
    const where = `${l.id} screen ${i + 1}`;
    for (const t of texts) copy(where, t);
    for (const t of [s.text, ...(s.steps ?? []).map((x) => x.text)])
      if (sentences(t) > 3) out.push(`${where}: more than 3 sentences in "${t}"`);
  });
  return out;
}
