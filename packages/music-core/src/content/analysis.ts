// Lead-sheet analysis: each chord of a tune's changes marked with its key
// centre and its function there, by a few rules a player can say out loud.
//
// 1. A major chord reached from its own V7, its tritone sub (bII7) or its
//    backdoor (bVII7) is the I of a new key. A minor chord is a new key's i only
//    when its whole minor ii-V (iiø7 V7) leads to it and it lasts two bars or
//    more. The home key's I is always I.
// 2. A dominant that resolves (down a fifth, down a half step, or up a step to
//    a major chord) belongs to the key of the chord it reaches: V, tritone sub
//    or backdoor when that chord is a key's I, a secondary dominant ("V of")
//    when it is not.
// 3. A minor or half-diminished chord a fourth below a dominant is that
//    dominant's ii: ii (iiø) before a V, a related ii before a V of or a
//    tritone sub, iv before a backdoor.
// 4. A dominant that goes nowhere it resolves to is the V of a key a fifth
//    below when its ii comes first (a ii-V left hanging); alone, it is a V of
//    in the key around it.
// 5. Every other chord is named in the key last arrived at (cyclically, since
//    the form repeats), or in the next one when it is none of the last key's
//    chords: IV, vi, iv, bVI...

import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import type { Progression } from "./jam";
import { m } from "@repo/i18n/messages.js";

type Kind = "maj" | "min" | "dom" | "half" | "dim";
export interface Key {
  pc: number;
  minor: boolean;
}
export interface AnalysedChord {
  symbol: string;
  /** Bar the chord starts on, from 0 at the top of the chorus. */
  bar: number;
  bars: number;
  section: string;
  /** "Ab" or "Fm": the key centre. */
  key: string;
  fn: string;
}

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
export const keyName = (k: Key) => (k.minor ? `${MINOR_KEYS[k.pc]}m` : MAJOR_KEYS[k.pc]);

/** Every function the rules name, in the order the answer buttons show them. */
export const FUNCTIONS = [
  "I",
  "ii",
  "iii",
  "IV",
  "V",
  "vi",
  "i",
  "iiø",
  "iv",
  "v",
  "bIII",
  "bVI",
  "bVII",
  "V of",
  "Related ii",
  "Tritone sub",
  "Backdoor",
  "Passing dim",
  "Other",
] as const;

function kindOf(symbol: string): Kind {
  const iv = parseChordSymbol(symbol)?.intervals ?? [0, 4, 7];
  const has = (n: number) => iv.includes(n);
  if (has(10) && (has(4) || has(5))) return "dom";
  if (has(4)) return "maj";
  if (has(3) && has(6)) return has(10) ? "half" : "dim";
  return "min";
}

const DIATONIC: Record<string, Partial<Record<Kind, Record<number, string>>>> = {
  major: {
    maj: { 0: "I", 5: "IV", 3: "bIII", 8: "bVI", 10: "bVII" },
    min: { 2: "ii", 4: "iii", 9: "vi", 5: "iv" },
  },
  minor: {
    min: { 0: "i", 5: "iv", 7: "v", 2: "ii" },
    maj: { 3: "bIII", 8: "bVI", 10: "bVII", 5: "IV" },
    half: { 2: "iiø" },
  },
};

/** The analysis of every chord in the chorus, in order. */
export function analyseTune(p: Progression): AnalysedChord[] {
  const home: Key = { pc: p.keyPc, minor: /minor/.test(p.key) };
  let bar = 0;
  const cs = p.chords.map((ch) => {
    const out = {
      symbol: ch.symbol,
      root: parseChordSymbol(ch.symbol)!.rootPc,
      kind: kindOf(ch.symbol),
      bar,
      bars: ch.bars,
    };
    bar += ch.bars;
    return out;
  });
  const n = cs.length;
  const at = (i: number) => cs[((i % n) + n) % n];

  /** How dominant `i` moves to the next chord, or null when it does not resolve. */
  const resolves = (i: number) => {
    const c = at(i);
    const t = at(i + 1);
    if (c.kind !== "dom") return null;
    if (pc(c.root - t.root) === 7) return "V";
    if (pc(c.root - t.root) === 1) return "sub";
    if (pc(t.root - c.root) === 2 && t.kind === "maj") return "backdoor";
    return null;
  };
  const isTonic = (i: number): boolean => {
    const c = at(i);
    if (c.root === home.pc && c.kind === (home.minor ? "min" : "maj")) return true;
    if (c.kind === "maj") return resolves(i - 1) !== null;
    if (c.kind === "min")
      return (
        c.bars >= 2 &&
        resolves(i - 1) === "V" &&
        at(i - 2).kind === "half" &&
        at(i - 2).root === pc(c.root + 2)
      );
    return false;
  };
  /** Chord `i` is a ii (or iv) a fourth below the dominant after it. */
  const iiOf = (i: number) =>
    (at(i).kind === "min" || at(i).kind === "half") &&
    at(i + 1).kind === "dom" &&
    at(i + 1).root === pc(at(i).root + 5);
  /** Dominant `i` hangs with its ii before it. */
  const hanging = (i: number) => at(i).kind === "dom" && resolves(i) === null && iiOf(i - 1);

  /** The nearest key arrival before (`dir` -1) or after (1) chord `j`; home when none. */
  const arrival = (j: number, dir: number): Key => {
    for (let b = 1; b <= n; b++)
      if (isTonic(j + dir * b))
        return { pc: at(j + dir * b).root, minor: at(j + dir * b).kind === "min" };
    return home;
  };
  const diatonic = (c: (typeof cs)[number], k: Key) =>
    DIATONIC[k.minor ? "minor" : "major"][c.kind]?.[pc(c.root - k.pc)];

  const memo = new Map<number, Key>();
  const keyOf = (i: number, depth = 0): Key => {
    const j = ((i % n) + n) % n;
    const hit = memo.get(j);
    if (hit) return hit;
    const c = cs[j];
    let k: Key;
    if (depth > n) k = home;
    else if (isTonic(j)) k = { pc: c.root, minor: c.kind === "min" };
    else if (resolves(j)) k = keyOf(j + 1, depth + 1);
    else if (hanging(j)) k = { pc: pc(c.root + 5), minor: at(j - 1).kind === "half" };
    else if (iiOf(j)) k = keyOf(j + 1, depth + 1);
    else {
      // The key last arrived at; when the chord is none of that key's, the next one.
      const back = arrival(j, -1);
      const ahead = arrival(j, 1);
      k = !diatonic(c, back) && diatonic(c, ahead) ? ahead : back;
    }
    memo.set(j, k);
    return k;
  };

  const domFn = (i: number): string => {
    const r = resolves(i);
    if (r === "sub") return "Tritone sub";
    if (r === "backdoor") return "Backdoor";
    if (r === "V") return isTonic(i + 1) ? "V" : "V of";
    if (hanging(i)) return "V";
    return at(i).root === pc(keyOf(i).pc + 7) ? "V" : "V of";
  };
  const fnOf = (i: number): string => {
    const c = at(i);
    const k = keyOf(i);
    if (isTonic(i)) return k.minor ? "i" : "I";
    if (c.kind === "dom") return domFn(i);
    if (c.kind === "dim") return "Passing dim";
    if (iiOf(i)) {
      const d = domFn(i + 1);
      if (d === "V") return c.kind === "half" ? "iiø" : "ii";
      return d === "Backdoor" ? "iv" : "Related ii";
    }
    return diatonic(c, k) ?? "Other";
  };

  // Each chord's section, from the form's bar counts.
  const starts: { label: string; bar: number }[] = [];
  let s = 0;
  for (const sec of p.sections ?? [{ label: "A", bars: bar }]) {
    starts.push({ label: sec.label, bar: s });
    s += sec.bars;
  }
  return cs.map((c, i) => ({
    symbol: c.symbol,
    bar: c.bar,
    bars: c.bars,
    section: starts.findLast((x) => x.bar <= c.bar + 1e-9)!.label,
    key: keyName(keyOf(i)),
    fn: fnOf(i),
  }));
}

/**
 * The chords to mark: every section once, in form order (A A B A asks A and B),
 * with each chord's bar in the chorus.
 */
export function analysisSheet(p: Progression): AnalysedChord[] {
  const all = analyseTune(p);
  const first = new Map<string, number>();
  for (const c of all) if (!first.has(c.section)) first.set(c.section, c.bar);
  return all.filter((c) => c.bar < first.get(c.section)! + sectionBars(p, c.section) - 1e-9);
}
const sectionBars = (p: Progression, label: string) =>
  p.sections?.find((s) => s.label === label)?.bars ?? Infinity;

/**
 * Tunes whose analysis by these rules was checked by hand against a published
 * analysis: the analysis mode offers only these.
 */
// ponytail: All of Me and Summertime are left out (the rules read All of Me's Am7 D7 as a ii-V in
// G and Summertime's F7 as a V of); a rule for II7 to ii and bVI7 would let them in.
export const ANALYSIS_TUNES = [
  "tune-autumn-leaves",
  "tune-fly-me-to-the-moon",
  "tune-blue-bossa",
  "tune-satin-doll",
  "tune-rhythm-changes",
  "tune-all-the-things-you-are",
  "tune-just-friends",
  "tune-stella-by-starlight",
  "tune-giant-steps",
];

/** The rule behind each function, said after a miss. */
export function functionRule(fn: string): string {
  switch (fn) {
    case "I":
    case "i":
      return m.music_content_analysis_rule_tonic();
    case "V":
      return m.music_content_analysis_rule_dominant();
    case "V of":
      return m.music_content_analysis_rule_secondary();
    case "ii":
    case "iiø":
      return m.music_content_analysis_rule_ii();
    case "Related ii":
      return m.music_content_analysis_rule_related_ii();
    case "Tritone sub":
      return m.music_content_analysis_rule_tritone_sub();
    case "Backdoor":
      return m.music_content_analysis_rule_backdoor();
    case "Passing dim":
      return m.music_content_analysis_rule_passing_dim();
    default:
      return m.music_content_analysis_rule_other();
  }
}

/** A function as shown on its button: the answer values above are kept as ids. */
export function functionLabel(fn: string): string {
  switch (fn) {
    case "V of":
      return m.music_content_analysis_fn_v_of();
    case "Related ii":
      return m.music_content_analysis_fn_related_ii();
    case "Tritone sub":
      return m.music_content_analysis_fn_tritone_sub();
    case "Backdoor":
      return m.music_content_analysis_fn_backdoor();
    case "Passing dim":
      return m.music_content_analysis_fn_passing_dim();
    case "Other":
      return m.music_content_analysis_fn_other();
    default:
      return fn;
  }
}
