// Every playable voicing of any chord on any fretted tuning, generated rather
// than curated: walk the neck one hand position at a time, keep the fret
// combinations that sound the chord, finger each one, and say whether it needs a
// barre. Carried over from the previous app's chord-positions generator (its
// rules are in context/04-music-data.md) and widened from one curated shape to
// any root and quality. Strings are numbered from 1 = highest-pitched.
import { TUNINGS, type ChordPosition, type ChordShape, type Tuning } from "../data";
import { CHORD_TEMPLATES } from "./chords";
import { FLAT_NAMES, pc } from "./notes";
import { m } from "@repo/i18n/messages.js";
import { showChord, showNote } from "./note-names";

export type VoicingKind = "open" | "barre" | "closed";

export interface Barre {
  fret: number;
  /** Highest-pitched string under the barre (1 = highest). */
  fromString: number;
  /** Lowest-pitched string under it. */
  toString: number;
}

export interface Voicing {
  /** Per string, string 1 first; null = muted. */
  frets: (number | null)[];
  /** 1 index to 4 pinky; null for open or muted strings. */
  fingers: (number | null)[];
  kind: VoicingKind;
  /** "Open position", "Barre at fret 3", "Fret 8". */
  label: string;
  /** Lowest fretted fret (0 when the shape uses open strings). */
  baseFret: number;
  barre?: Barre;
  /** More fretted notes than four fingers can hold one each: only a barre makes it playable. */
  needsBarre: boolean;
  /** The 5th was left out (four- and five-note chords on few strings). */
  omitsFifth: boolean;
  score: number;
}

export interface VoicingOptions {
  /** Highest fretted fret minus the lowest. */
  maxStretch?: number;
  /** A barre counts as one finger. */
  maxFingers?: number;
  /** The last hand position to look at. */
  maxFret?: number;
  /** At most this many voicings, open position first, then up the neck. */
  limit?: number;
}

const DEFAULTS: Required<VoicingOptions> = { maxStretch: 3, maxFingers: 4, maxFret: 12, limit: 8 };

/** The qualities the chord finder offers, from the chord identifier's own templates. */
export const VOICING_QUALITIES = CHORD_TEMPLATES.map((t) => ({
  quality: t.quality as string,
  suffix: t.suffix as string,
  intervals: [...t.intervals] as number[],
}));

const cache = new Map<string, Voicing[]>();

/**
 * Voicings of the chord on `rootPc` with `intervals`. Rules (from the old
 * generator, kept): every chord tone sounds (the 5th may go when the chord has
 * four or more notes), no muted string between sounding ones, the lowest note is
 * the root (skipped on re-entrant tunings such as high-G ukulele, which have no
 * bass string), at least four strings on a six-string and all of them on a
 * four-string, open strings only in the open position.
 */
export function chordVoicings(
  tuning: Pick<Tuning, "id" | "openStrings" | "fretCount">,
  rootPc: number,
  intervals: readonly number[],
  options: VoicingOptions = {},
): Voicing[] {
  const opts = { ...DEFAULTS, ...options };
  const key = `${tuning.id}|${tuning.openStrings.join(",")}|${rootPc}|${intervals.join(",")}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const open = tuning.openStrings;
  const all = [...new Set(intervals.map((i) => pc(rootPc + i)))];
  const fifth = pc(rootPc + 7);
  const optional = all.length >= 4 && intervals.includes(7) ? fifth : null;
  const required = all.filter((p) => p !== optional);
  const reentrant = open.some((m, i) => i > 0 && m > open[i - 1]);
  // A two-note power chord needs fewer strings than a triad.
  const minSounding = Math.min(open.length >= 6 ? 4 : open.length, all.length + 1);
  const top = Math.min(opts.maxFret, tuning.fretCount - opts.maxStretch);

  const out: Voicing[] = [];
  const seen = new Set<string>();
  for (let base = 0; base <= top; base++) {
    // Base 0 is the open position (open strings with frets up to the stretch);
    // higher up, the hand sits at `base` and can't reach the nut.
    const window = base === 0 ? [0, opts.maxStretch + 1] : [base, base + opts.maxStretch];
    const choices = open.map((m) => {
      const c: (number | null)[] = [null];
      for (let f = window[0]; f <= window[1]; f++) if (all.includes(pc(m + f))) c.push(f);
      return c;
    });
    let best: Voicing | null = null;
    for (const frets of combos(choices)) {
      const v = judge(frets, open, {
        required,
        all,
        rootPc,
        base,
        minSounding,
        reentrant,
        omitsFifth: false,
        opts,
      });
      if (v && (!best || v.score > best.score)) best = v;
    }
    if (!best) continue;
    const k = best.frets.join(".");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(best);
  }
  const result = out.slice(0, opts.limit);
  cache.set(key, result);
  return result;
}

function* combos(choices: (number | null)[][]): Generator<(number | null)[]> {
  const cur: (number | null)[] = choices.map(() => null);
  function* walk(i: number): Generator<(number | null)[]> {
    if (i === choices.length) {
      yield [...cur];
      return;
    }
    for (const c of choices[i]) {
      cur[i] = c;
      yield* walk(i + 1);
    }
  }
  yield* walk(0);
}

function judge(
  frets: (number | null)[],
  open: readonly number[],
  ctx: {
    required: number[];
    all: number[];
    rootPc: number;
    base: number;
    minSounding: number;
    reentrant: boolean;
    omitsFifth: boolean;
    opts: Required<VoicingOptions>;
  },
): Voicing | null {
  const idx = frets.flatMap((f, i) => (f === null ? [] : [i]));
  if (idx.length < ctx.minSounding) return null;
  if (idx.at(-1)! - idx[0] + 1 !== idx.length) return null; // no inner mutes
  const midi = idx.map((i) => open[i] + frets[i]!);
  const heard = new Set(midi.map(pc));
  if (!ctx.required.every((p) => heard.has(p))) return null;
  if (!ctx.reentrant && pc(Math.min(...midi)) !== ctx.rootPc) return null;
  const fretted = idx.filter((i) => frets[i]! > 0);
  const hasOpen = idx.some((i) => frets[i] === 0);
  if (ctx.base === 0 ? !hasOpen : hasOpen || !fretted.length) return null;
  const fs = fretted.map((i) => frets[i]!);
  const low = fs.length ? Math.min(...fs) : 0;
  if (fs.length && Math.max(...fs) - low > ctx.opts.maxStretch) return null;
  if (ctx.base > 0 && low !== ctx.base) return null;

  // Fingering: a barre when the shape can't be held one finger a note; and, as
  // players do, when strings share the lowest fret and it would otherwise take
  // every finger (or three strings or more sit on that fret). Never over an open string.
  const atLow = fretted.filter((i) => frets[i] === low);
  const needsBarre = fretted.length > ctx.opts.maxFingers;
  const barreHere =
    !hasOpen &&
    atLow.length >= 2 &&
    (needsBarre || atLow.length >= 3 || fretted.length === ctx.opts.maxFingers);
  const fingers: (number | null)[] = frets.map(() => null);
  let barre: Barre | undefined;
  let next = 1;
  if (barreHere) {
    barre = { fret: low, fromString: atLow[0] + 1, toString: atLow.at(-1)! + 1 };
    for (const i of atLow) fingers[i] = 1;
    next = 2;
  }
  // Remaining notes: lower frets to lower fingers; on one fret, the lower-pitched string first.
  const rest = fretted
    .filter((i) => fingers[i] === null)
    .sort((a, b) => frets[a]! - frets[b]! || b - a);
  for (const i of rest) {
    if (next > ctx.opts.maxFingers) return null;
    fingers[i] = next++;
  }
  const kind: VoicingKind = barre ? "barre" : hasOpen ? "open" : "closed";
  const omitsFifth = ctx.all.some((p) => !heard.has(p));
  const score =
    idx.length * 10 -
    (frets.length - idx.length) * 4 -
    (next - 1) -
    (omitsFifth ? 3 : 0) +
    (hasOpen ? 1 : 0);
  return {
    frets: [...frets],
    fingers,
    kind,
    label:
      kind === "open"
        ? m.music_content_voicing_open_position()
        : kind === "barre"
          ? m.music_content_voicing_barre_at_fret({ fret: low })
          : m.music_content_voicing_fret({ fret: low }),
    baseFret: hasOpen ? 0 : low,
    ...(barre ? { barre } : {}),
    needsBarre,
    omitsFifth,
    score,
  };
}

/** A chord's name from its root and quality suffix ("Bb", "F#m7" spelled flat: "Gbm7"). */
export const chordName = (rootPc: number, suffix: string) => `${FLAT_NAMES[pc(rootPc)]}${suffix}`;

// ---------------------------------------------------------------------------
// Generated chords as drill shapes: "gen.<instrument>.<rootPc>.<quality>" on the
// instrument's standard tuning, its voicings as positions (0 = the first one,
// usually the open position), in the same form the curated positions use.

export const QUALITY_NAMES: Record<string, string> = {
  maj: m.music_content_voicing_quality_major(),
  m: m.music_content_voicing_quality_minor(),
  dim: m.music_content_voicing_quality_diminished(),
  aug: m.music_content_voicing_quality_augmented(),
  sus2: m.music_content_voicing_quality_suspended_2nd(),
  sus4: m.music_content_voicing_quality_suspended_4th(),
  add9: m.music_content_voicing_quality_added_9th(),
  "6": m.music_content_voicing_quality_6th(),
  m6: m.music_content_voicing_quality_minor_6th(),
  maj7: m.music_content_voicing_quality_major_7th(),
  m7: m.music_content_voicing_quality_minor_7th(),
  "7": m.music_content_voicing_quality_dominant_7th(),
  "7sus4": m.music_content_voicing_quality_7th_suspended_4th(),
  m7b5: m.music_content_voicing_quality_half_diminished(),
  dim7: m.music_content_voicing_quality_diminished_7th(),
  "9": m.music_content_voicing_quality_dominant_9th(),
  maj9: m.music_content_voicing_quality_major_9th(),
  m9: m.music_content_voicing_quality_minor_9th(),
  "5": m.music_content_voicing_quality_power_chord(),
};

export const generatedChordId = (
  instrument: "guitar" | "ukulele",
  rootPc: number,
  quality: string,
) => `gen.${instrument}.${pc(rootPc)}.${quality}`;

/** What a generated id names, or null when it isn't one. */
export function parseGeneratedId(id: string) {
  const m = /^gen\.(guitar|ukulele)\.(\d+)\.(.+)$/.exec(id);
  const q = m && VOICING_QUALITIES.find((x) => x.quality === m[3]);
  return m && q
    ? { instrument: m[1] as "guitar" | "ukulele", rootPc: Number(m[2]) % 12, quality: q }
    : null;
}

const posCache = new Map<string, ChordPosition[]>();

/**
 * A generated chord's voicings as positions; empty for an id that isn't generated.
 * On the instrument's standard tuning unless `tuning` (curated or the player's own) is given.
 */
export function generatedPositions(id: string, tuning?: Tuning): ChordPosition[] {
  const g = parseGeneratedId(id);
  if (!g) return [];
  tuning ??= TUNINGS[g.instrument][0];
  const cacheKey = `${id}|${tuning.id}|${tuning.openStrings.join(",")}|${tuning.fretCount}`;
  const hit = posCache.get(cacheKey);
  if (hit) return hit;
  const name = m.music_content_voicing_generated_name({
    symbol: showChord(chordName(g.rootPc, g.quality.suffix)),
    root: showNote(FLAT_NAMES[g.rootPc]),
    quality: QUALITY_NAMES[g.quality.quality] ?? g.quality.quality,
  });
  const out = chordVoicings(tuning, g.rootPc, g.quality.intervals).map((v, i): ChordPosition => {
    const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
    const start = v.baseFret > 0 ? v.baseFret - 1 : 0;
    return {
      id: i === 0 ? id : `${id}@${i}`,
      name,
      instrument: g.instrument,
      tuningId: tuning.id,
      difficulty: v.needsBarre ? 5 : v.kind === "barre" ? 4 : v.kind === "closed" ? 3 : 2,
      frets: v.frets,
      fingers: v.fingers,
      mutedStrings: v.frets.flatMap((f, k) => (f === null ? [k + 1] : [])),
      openStrings: v.frets.flatMap((f, k) => (f === 0 ? [k + 1] : [])),
      commonTransitions: [],
      shapeId: id,
      positionIndex: i,
      positionLabel: v.label,
      kind: v.kind,
      baseFret: v.baseFret,
      ...(v.barre ? { barre: v.barre } : {}),
      fretWindow: { start, end: Math.max(start + 4, ...fretted, 0) },
    };
  });
  posCache.set(cacheKey, out);
  return out;
}

/** A generated chord as a shape (its first voicing), or undefined. */
export function generatedChord(id: string): ChordShape | undefined {
  const p = generatedPositions(id)[0];
  if (!p) return undefined;
  const {
    shapeId: _s,
    positionIndex: _i,
    positionLabel: _l,
    kind: _k,
    baseFret: _b,
    barre: _r,
    fretWindow: _w,
    ...shape
  } = p;
  return shape;
}
