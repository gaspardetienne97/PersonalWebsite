// The voicing drill's prompts as one list, whatever the variant: rootless
// ii-V-I voicings, "closest chords" I IV V I (piano path P2), or guide-tone voice
// leading through the 12-key cycle. Each item says what to show and how to grade it.
import { pc, pcOf, type Metric } from "@repo/music-core";
import {
  DOMINANT_VOICING as DOM,
  GOSPEL_PROGRESSIONS,
  UPPER_STRUCTURE_II as US_II,
  stripJt as strip,
  KEY_CYCLE,
  cadenceChords,
  gospelChords,
  closestChords,
  goToScale,
  voiceLeadingTargets,
  voicingTargets,
  type VoicingVariant,
} from "@repo/music-core/content/piano";
import type { VoicingTarget } from "@repo/music-core/data/index";
import { gradeVoiceLeading, gradeVoicing } from "@repo/music-core/scoring/piano";
import {
  JAZZ_VOICING_TYPES,
  jazzVoicingChords,
  type JazzVoicingId,
} from "@repo/music-core/content/jazz-voicings";
import { TUNES } from "@repo/music-core/content/tunes";

export type Variant =
  | VoicingVariant
  | "inversions"
  | "voice-leading"
  | "cadence"
  | "cadence-minor"
  | "gospel"
  | JazzVoicingId;

export const isJazzType = (v: string): v is JazzVoicingId =>
  JAZZ_VOICING_TYPES.some((t) => t.id === v);

export interface Shown {
  midi: number;
  hand: "left" | "right";
}

export interface VoicingItem {
  id: string;
  symbol: string;
  /** Key name the item belongs to (the chord chart groups by it). */
  group: string;
  /** That key's tonic and mode (the staff's key signature). */
  keyPc: number;
  minor: boolean;
  kind: "voicing" | "closest" | "guide" | "jazz";
  show: Shown[];
  /** How the voicing is built (hidden in Check). */
  name: string;
  /** Chord-scale or upper-structure hint (hidden in Check). */
  hint?: string;
  /** Pitch classes that must all be played. */
  pcs: number[];
  /** Notes to collect before an arpeggio (one note at a time) is graded. */
  count: number;
  skillIds: string[];
  voicing?: VoicingTarget;
  closest?: { rightHand: number[]; leftRootPc: number; bassPc: number; from?: number[] };
  guide?: { fromMidi: number[]; register: [number, number] };
  /** A jazz voicing type: graded on its notes, the lowest one, and (when `order`) their order from the bottom. */
  jazz?: { order: boolean; midi: number[] };
  /** What Check asks for, the voicing hidden. */
  ask?: string;
}

export const CLOSEST_REGISTER: [number, number] = [55, 76];
const CLOSEST_SPLIT = 55;
/** Hints as one text, each sentence ending in a single period. */
function joinHints(...hints: (string | undefined)[]) {
  const parts = hints.flatMap((h) => (h ? [h.trim().replace(/\.+$/, "")] : []));
  return parts.length ? `${parts.join(". ")}.` : undefined;
}

function scaleHint(symbol: string) {
  const sc = goToScale(symbol);
  return sc ? joinHints(`Go-to scale: ${sc.label}`, strip(sc.hint)) : undefined;
}

/** Keys of the cycle from `startPc`, `count` of them. */
export function cycleFrom(startPc: number, count: number): string[] {
  const i = Math.max(
    0,
    KEY_CYCLE.findIndex((k) => pcOf(k) === pc(startPc)),
  );
  return Array.from({ length: Math.min(12, count) }, (_, k) => KEY_CYCLE[(i + k) % 12]);
}

export function voicingItems(opts: {
  variant: Variant;
  keyPc: number;
  keys: number;
  startPosition?: "A" | "B";
  arpeggio?: boolean;
  /** Gospel: which progression (GOSPEL_PROGRESSIONS). */
  progression?: string;
  /** Upper structures: the tune whose dominants are voiced. */
  tune?: string;
}): VoicingItem[] {
  const keys = cycleFrom(opts.keyPc, opts.keys);
  if (isJazzType(opts.variant)) {
    const type = JAZZ_VOICING_TYPES.find((t) => t.id === opts.variant)!;
    const tune = TUNES.find((t) => t.id === opts.tune) ?? TUNES[0];
    const roots = type.key === "tune" ? [tune.keyPc] : keys.map((k) => pcOf(k)!);
    return roots.flatMap((root) =>
      jazzVoicingChords(type.id, root, { tune: tune.id }).map((c) => {
        const midi = [...c.left, ...c.right];
        return {
          id: c.id,
          symbol: c.symbol,
          group: c.group,
          // The staff's signature: a dorian set is written in its parent major.
          keyPc: type.key === "dorian" ? pc(root - 2) : root,
          minor: type.key === "tune" && tune.key.endsWith(" minor"),
          kind: "jazz" as const,
          show: [
            ...c.left.map((m) => ({ midi: m, hand: "left" as const })),
            ...c.right.map((m) => ({ midi: m, hand: "right" as const })),
          ],
          name: c.name,
          pcs: [...new Set(midi.map(pc))],
          count: new Set(midi).size,
          skillIds: c.skillIds,
          jazz: { order: c.order, midi },
          ask: c.ask,
        };
      }),
    );
  }
  if (opts.variant === "gospel") {
    const prog =
      GOSPEL_PROGRESSIONS.find((p) => p.id === opts.progression) ?? GOSPEL_PROGRESSIONS[0];
    const inv = ["root position", "first inversion", "second inversion", "third inversion"];
    return keys.flatMap((key) => {
      const bars = gospelChords(pcOf(key)!, prog.id, CLOSEST_REGISTER);
      return bars.map((b, i) => ({
        id: b.id,
        symbol: b.symbol,
        group: key,
        keyPc: pcOf(key)!,
        minor: false,
        kind: "closest" as const,
        show: [
          { midi: b.leftHand, hand: "left" as const },
          ...b.rightHand.map((midi) => ({ midi, hand: "right" as const })),
        ],
        name: `${b.symbol}: the right hand in ${inv[b.inversion]}${i ? `, moving ${b.movement} semitone${b.movement === 1 ? "" : "s"}` : ""}. ${b.symbol.includes("/") ? "The bass after the slash" : "The root"} in the left hand.`,
        hint: i
          ? `${prog.about} Keep the common tones. Move the others the shortest way.`
          : prog.about,
        pcs: [...new Set([...b.rightHand.map(pc), b.bassPc])],
        count: 4,
        skillIds: ["harmony.keyboard-cadences"],
        closest: {
          rightHand: b.rightHand,
          leftRootPc: b.bassPc,
          bassPc: b.expectedBassPc,
          from: i ? bars[i - 1].rightHand : undefined,
        },
      }));
    });
  }
  if (opts.variant === "cadence" || opts.variant === "cadence-minor") {
    const minor = opts.variant === "cadence-minor";
    const inv = ["root position", "first inversion", "second inversion", "third inversion"];
    return keys.flatMap((key) => {
      const bars = cadenceChords(pcOf(key)!, minor, CLOSEST_REGISTER);
      const group = `${key}${minor ? " minor" : ""}`;
      return bars.map((b, i) => ({
        id: b.id,
        symbol: b.symbol,
        group,
        keyPc: pcOf(key)!,
        minor,
        kind: "closest" as const,
        show: [
          { midi: b.leftHand, hand: "left" as const },
          ...b.rightHand.map((midi) => ({ midi, hand: "right" as const })),
        ],
        name: `${b.symbol} (${b.roman}) in ${inv[b.inversion]}${i ? `, moving ${b.movement} semitone${b.movement === 1 ? "" : "s"}` : ""}. Root in the left hand.`,
        hint:
          b.roman === "V7"
            ? "Three notes: root, 3rd and 7th, the 5th left out. The 7th falls to the tonic's 3rd next."
            : i
              ? "Keep the common tones. Move the others the shortest way."
              : "Start in root position.",
        pcs: [...new Set([...b.rightHand.map(pc), pc(b.leftHand)])],
        count: 4,
        skillIds: ["harmony.keyboard-cadences"],
        closest: {
          rightHand: b.rightHand,
          leftRootPc: pc(b.leftHand),
          bassPc: b.expectedBassPc,
          from: i ? bars[i - 1].rightHand : undefined,
        },
      }));
    });
  }
  if (opts.variant === "inversions") {
    const bars = closestChords(opts.keyPc, CLOSEST_REGISTER);
    const inv = ["root position", "first inversion", "second inversion"];
    return bars.map((b, i) => ({
      id: b.id,
      symbol: b.symbol,
      group: `I IV V I in ${bars[0].symbol}`,
      keyPc: pc(opts.keyPc),
      minor: false,
      kind: "closest",
      show: [
        { midi: b.leftHand, hand: "left" },
        ...b.rightHand.map((midi) => ({ midi, hand: "right" as const })),
      ],
      name: `${b.symbol} in ${inv[b.inversion]}${i ? `, moving ${b.movement} semitone${b.movement === 1 ? "" : "s"}` : ""}. Root in the left hand.`,
      hint: i
        ? "Keep the top note near G. Move each voice the shortest way."
        : "Start in root position.",
      pcs: [...new Set([...b.rightHand.map(pc), pc(b.leftHand)])],
      count: 4,
      skillIds: ["harmony.ii-v-i.voice-leading"],
      closest: {
        rightHand: b.rightHand,
        leftRootPc: pc(b.leftHand),
        bassPc: b.expectedBassPc,
        from: i ? bars[i - 1].rightHand : undefined,
      },
    }));
  }
  if (opts.variant === "voice-leading") {
    const all = voiceLeadingTargets();
    const k = Math.max(
      0,
      KEY_CYCLE.findIndex((x) => x === keys[0]),
    );
    // Target j is chord j + 1 of the chain (Dm7 is given), so it belongs to key floor((j + 1) / 3).
    const j0 = Math.max(0, 3 * k - 1);
    const slice = all.slice(j0, 3 * (k + keys.length) - 1);
    return slice.map((t, i) => ({
      id: t.id,
      symbol: t.symbol,
      group: KEY_CYCLE[Math.floor((j0 + i + 1) / 3) % 12],
      keyPc: pcOf(KEY_CYCLE[Math.floor((j0 + i + 1) / 3) % 12])!,
      minor: false,
      kind: "guide",
      show: t.targetMidi.map((midi) => ({ midi, hand: "right" as const })),
      name: `The 3rd and 7th of ${t.symbol}, moving ${t.minimumSemitones} semitone${t.minimumSemitones === 1 ? "" : "s"} at best.`,
      hint: scaleHint(t.symbol),
      pcs: t.pcs,
      count: 2,
      skillIds: t.skillIds,
      guide: { fromMidi: t.fromMidi, register: t.register },
    }));
  }
  const targets = voicingTargets({
    variant: opts.variant,
    startPosition: opts.startPosition,
    mode: opts.arpeggio ? "arpeggio" : "chord",
  });
  const [p1, p2] = opts.startPosition === "B" ? ["B", "A"] : ["A", "B"];
  const rootless = (p: string) => (p === "A" ? "Rootless A (3 5 7 9)" : "Rootless B (7 9 3 5)");
  const names: Record<VoicingVariant, string[]> = {
    major: [rootless(p1), rootless(p2), rootless(p1)],
    minor: ["Rootless A for the half-diminished ii (b3 b5 b7 1)", DOM.altered.label, rootless("B")],
    altered: [
      DOM.rootlessB9.label,
      DOM.altered.label,
      `Upper structure ${US_II.triad} over a 1 3 7 shell, adds ${US_II.adds}`,
    ],
  };
  const hints: Record<VoicingVariant, (string | undefined)[]> = {
    major: [undefined, undefined, undefined],
    minor: [undefined, strip(DOM.altered.hint), undefined],
    altered: [
      strip(DOM.rootlessB9.hint),
      strip(DOM.altered.hint),
      "The favourite upper structure: a major triad a whole step above the root.",
    ],
  };
  const variant = opts.variant;
  return keys.flatMap((key) =>
    targets
      .filter((t) => t.id.startsWith(`${key}-`))
      .map((t, i) => ({
        id: t.id,
        symbol: t.symbol,
        group: key,
        keyPc: pcOf(key)!,
        minor: variant === "minor",
        kind: "voicing" as const,
        show: t.displayMidi.map((midi, j) => ({
          midi,
          hand: j === 0 ? ("left" as const) : ("right" as const),
        })),
        name: `${names[variant][i]}. Root in the left hand.`,
        hint: joinHints(hints[variant][i], scaleHint(t.symbol)),
        pcs: t.expectedPitchClasses,
        count: t.displayMidi.length,
        skillIds: t.skillIds,
        voicing: t,
      })),
  );
}

export interface ItemGrade {
  score: number;
  correct: boolean;
  metrics: Metric[];
  /** Short plain reason, e.g. "missing Bb" or "wrong inversion". */
  note: string;
  missing: number[];
}

/**
 * Grade what was played for one item. `strict`: extras fail membership (a held
 * chord). Closest chords: the inversion (lowest right-hand note), the left-hand
 * root and the voice leading from the previous bar all have to be right; the
 * score is the mean of the chord and the movement, capped at half without the root.
 */
/**
 * Collected notes for a voice-leading check: the last one played of each target
 * pitch class, so a stray or repeated key doesn't spoil the move.
 */
export function lastOfEach(played: readonly number[], pcs: readonly number[]): number[] {
  return pcs.flatMap((p) => {
    const hit = [...played].reverse().find((m) => pc(m) === pc(p));
    return hit === undefined ? [] : [hit];
  });
}

export function gradeItem(
  item: VoicingItem,
  played: readonly number[],
  opts: { strict: boolean; arpeggio: boolean },
): ItemGrade {
  const missingOf = (pcs: number[]) => pcs.filter((p) => !played.some((m) => pc(m) === p));
  if (item.kind === "jazz") {
    const target = item.jazz!.midi;
    const r = gradeVoicing({
      expectedPcs: item.pcs,
      expectedBassPc: pc(Math.min(...target)),
      played,
      strict: opts.strict,
      arpeggio: opts.arpeggio,
    });
    // The order from the bottom: the voicing's notes as played, low to high, by pitch class.
    const order = (ms: readonly number[]) =>
      [...new Set(ms.filter((m) => item.pcs.includes(pc(m))))].sort((a, b) => a - b).map(pc);
    const orderOk =
      opts.arpeggio || !item.jazz!.order || order(played).join() === order(target).join();
    const score = r.membership && !orderOk ? Math.min(r.score, 0.5) : r.score;
    return {
      score,
      correct: score === 1,
      metrics: r.metrics,
      missing: r.missing,
      note:
        score === 1
          ? "right"
          : r.missing.length
            ? "missing notes"
            : r.extra.length && opts.strict
              ? "extra notes"
              : r.bassOk === false
                ? "wrong note at the bottom"
                : "notes in the wrong order",
    };
  }
  if (item.kind === "voicing") {
    const r = gradeVoicing({
      expectedPcs: item.pcs,
      expectedBassPc: item.voicing!.expectedBassPc,
      played,
      strict: opts.strict,
      arpeggio: opts.arpeggio,
    });
    return {
      ...r,
      missing: r.missing,
      note: r.correct
        ? "right"
        : r.missing.length
          ? "missing notes"
          : r.extra.length && opts.strict
            ? "extra notes"
            : r.bassOk === false
              ? "root not lowest"
              : "not quite",
    };
  }
  if (item.kind === "guide") {
    const notes = opts.strict ? [...new Set(played)] : lastOfEach(played, item.pcs);
    const r = gradeVoiceLeading({
      fromMidi: item.guide!.fromMidi,
      targetPcs: item.pcs,
      register: item.guide!.register,
      played: notes,
    });
    return {
      ...r,
      missing: missingOf(item.pcs),
      note: r.correct
        ? "right"
        : r.membership
          ? `moved ${r.actualSemitones} semitones, ${r.minimumSemitones} is the least`
          : "not the 3rd and 7th in range",
    };
  }
  const c = item.closest!;
  const rh = played.filter((m) => m >= CLOSEST_SPLIT);
  const lhOk = played.some((m) => m < CLOSEST_SPLIT && pc(m) === c.leftRootPc);
  const chord = gradeVoicing({
    expectedPcs: c.rightHand.map(pc),
    expectedBassPc: c.bassPc,
    played: rh,
    strict: opts.strict,
    arpeggio: false,
  });
  const vl =
    c.from && chord.membership
      ? gradeVoiceLeading({
          fromMidi: c.from,
          targetPcs: c.rightHand,
          register: CLOSEST_REGISTER,
          played: opts.strict ? rh : lastOfEach(rh, c.rightHand),
        })
      : null;
  let score = c.from ? (chord.score + (vl?.score ?? 0)) / 2 : chord.score;
  if (!lhOk) score = Math.min(score, 0.5);
  const correct = chord.correct && (!c.from || !!vl?.correct) && lhOk;
  return {
    score,
    correct,
    metrics: [...chord.metrics, ...(vl?.metrics ?? [])],
    missing: missingOf(item.pcs),
    note: correct
      ? "right"
      : !chord.membership
        ? "missing notes"
        : chord.bassOk === false
          ? "wrong inversion"
          : vl && !vl.correct
            ? "not the closest move"
            : !lhOk
              ? "no root in the left hand"
              : "not quite",
  };
}
