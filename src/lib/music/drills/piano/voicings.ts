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
import { m } from "@repo/i18n/messages.js";

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
  return sc ? joinHints(m.music_strings_voicing_go_to_scale({ scale: sc.label }), strip(sc.hint)) : undefined;
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
    const inv = [m.music_strings_inv_root(), m.music_strings_inv_first(), m.music_strings_inv_second(), m.music_strings_inv_third()];
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
        name: i
          ? (b.symbol.includes("/") ? m.music_strings_voicing_gospel_slash_moving : m.music_strings_voicing_gospel_root_moving)({ symbol: b.symbol, inv: inv[b.inversion], n: b.movement })
          : (b.symbol.includes("/") ? m.music_strings_voicing_gospel_slash : m.music_strings_voicing_gospel_root)({ symbol: b.symbol, inv: inv[b.inversion] }),
        hint: i ? `${prog.about} ${m.music_strings_voicing_keep_common()}` : prog.about,
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
    const inv = [m.music_strings_inv_root(), m.music_strings_inv_first(), m.music_strings_inv_second(), m.music_strings_inv_third()];
    return keys.flatMap((key) => {
      const bars = cadenceChords(pcOf(key)!, minor, CLOSEST_REGISTER);
      const group = minor ? m.music_strings_voicing_key_minor({ key }) : key;
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
        name: i
          ? m.music_strings_voicing_cadence_moving({ symbol: b.symbol, roman: b.roman, inv: inv[b.inversion], n: b.movement })
          : m.music_strings_voicing_cadence({ symbol: b.symbol, roman: b.roman, inv: inv[b.inversion] }),
        hint:
          b.roman === "V7"
            ? m.music_strings_voicing_v7_hint()
            : i
              ? m.music_strings_voicing_keep_common()
              : m.music_strings_voicing_start_root(),
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
    const inv = [m.music_strings_inv_root(), m.music_strings_inv_first(), m.music_strings_inv_second()];
    return bars.map((b, i) => ({
      id: b.id,
      symbol: b.symbol,
      group: m.music_strings_voicing_inv_group({ symbol: bars[0].symbol }),
      keyPc: pc(opts.keyPc),
      minor: false,
      kind: "closest",
      show: [
        { midi: b.leftHand, hand: "left" },
        ...b.rightHand.map((midi) => ({ midi, hand: "right" as const })),
      ],
      name: i
        ? m.music_strings_voicing_inv_name_moving({ symbol: b.symbol, inv: inv[b.inversion], n: b.movement })
        : m.music_strings_voicing_inv_name({ symbol: b.symbol, inv: inv[b.inversion] }),
      hint: i ? m.music_strings_voicing_top_near_g() : m.music_strings_voicing_start_root(),
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
      name: m.music_strings_voicing_guide_name({ symbol: t.symbol, n: t.minimumSemitones }),
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
  const rootless = (p: string) => (p === "A" ? m.music_strings_voicing_rootless_a() : m.music_strings_voicing_rootless_b());
  const names: Record<VoicingVariant, string[]> = {
    major: [rootless(p1), rootless(p2), rootless(p1)],
    minor: [m.music_strings_voicing_rootless_half_dim(), DOM.altered.label, rootless("B")],
    altered: [
      DOM.rootlessB9.label,
      DOM.altered.label,
      m.music_strings_voicing_upper_structure({ triad: US_II.triad, adds: US_II.adds }),
    ],
  };
  const hints: Record<VoicingVariant, (string | undefined)[]> = {
    major: [undefined, undefined, undefined],
    minor: [undefined, strip(DOM.altered.hint), undefined],
    altered: [
      strip(DOM.rootlessB9.hint),
      strip(DOM.altered.hint),
      m.music_strings_voicing_us_hint(),
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
        name: m.music_strings_voicing_root_left({ name: names[variant][i] }),
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
          ? m.music_strings_grade_right()
          : r.missing.length
            ? m.music_strings_grade_missing()
            : r.extra.length && opts.strict
              ? m.music_strings_grade_extra()
              : r.bassOk === false
                ? m.music_strings_grade_wrong_bottom()
                : m.music_strings_grade_wrong_order(),
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
        ? m.music_strings_grade_right()
        : r.missing.length
          ? m.music_strings_grade_missing()
          : r.extra.length && opts.strict
            ? m.music_strings_grade_extra()
            : r.bassOk === false
              ? m.music_strings_grade_root_not_lowest()
              : m.music_strings_grade_not_quite(),
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
        ? m.music_strings_grade_right()
        : r.membership
          ? m.music_strings_grade_moved({ actual: r.actualSemitones, least: r.minimumSemitones })
          : m.music_strings_grade_not_guide(),
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
      ? m.music_strings_grade_right()
      : !chord.membership
        ? m.music_strings_grade_missing()
        : chord.bassOk === false
          ? m.music_strings_grade_wrong_inversion()
          : vl && !vl.correct
            ? m.music_strings_grade_not_closest()
            : !lhOk
              ? m.music_strings_grade_no_left_root()
              : m.music_strings_grade_not_quite(),
  };
}
