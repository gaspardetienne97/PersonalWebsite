// VexFlow engraving of the canonical score: staff and tab share the bar
// splitting, the system packing and the layout they hand to the overlay.
// Colour is never set here: the frame's CSS paints every glyph currentColor.

import { noteName, pc, type Score, type ScoreGroup, type ScoreNote } from "@repo/music-core";
import {
  assignTab,
  bars,
  barsIn,
  groupAt,
  mergeTies,
  scoreGroups,
  selectedVoices,
  type Bar,
  type BeatRange,
  type TabTuning,
} from "./groups";

type VF = typeof import("vexflow/bravura");
type Stave = InstanceType<VF["Stave"]>;
type Note =
  | InstanceType<VF["StaveNote"]>
  | InstanceType<VF["TabNote"]>
  | InstanceType<VF["GhostNote"]>;

/** A reason the view can show the player. */
export class NotationError extends Error {}

let vexflow: Promise<VF> | undefined;
/** Loads VexFlow with Bravura once, and waits for the fonts so glyph widths measure right. */
export function loadVexFlow(): Promise<VF> {
  vexflow ??= import("vexflow/bravura").then(async (m) => {
    await Promise.all([document.fonts.load("30px Bravura"), document.fonts.load("12px Academico")]);
    return m;
  });
  return vexflow;
}

// ---------------------------------------------------------------------------
// Layout handed to the overlay (all px, relative to the SVG's top left).

export interface Cell extends BeatRange {
  bar: number;
  system: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Top and bottom of the drawn staff lines, for the cursor. */
  top: number;
  bottom: number;
}

export interface Anchor {
  beat: number;
  x: number;
  system: number;
  group: number | null;
}

export interface Layout {
  width: number;
  height: number;
  bars: Cell[];
  anchors: Anchor[];
  groups: ScoreGroup[];
  groupEls: Map<number, Element[]>;
  /** Beams, ties and tuplet marks with the groups they join: hidden when any of them is (the look-ahead mask). */
  linked: { groups: number[]; el: Element }[];
  notice?: string;
}

// ---------------------------------------------------------------------------
// Bars into ticks: every bar filled exactly, notes split at bar lines and tied.

export interface Tick {
  start: number;
  dur: number;
  vf: string;
  dots: number;
  midis: number[];
  /** First piece of an attack (not a tie continuation). */
  attack: boolean;
  group: number | null;
  /** The pitches continue into this line's next tick. */
  tieNext: boolean;
  /** Fingering for an attack (a piano scale's finger numbers), printed by the note. */
  fingers?: (number | string)[];
  /** A chord symbol starting here (a lead sheet's), printed above the top staff. */
  symbol?: string;
  /** Dynamics and hairpin words starting here (p, cresc.), printed under the top staff. */
  dyn?: string;
  /** A breath mark after this tick, printed above it. */
  breath?: boolean;
  /** Part of a triplet: the beat it fills (three in the time of two). */
  tuplet?: number;
  /** This bar's clef when it differs from the row's (a clef change). */
  clef?: "treble" | "bass";
}

const EPS = 1e-6;
const VALUES: [number, string, number][] = [
  [4, "w", 0],
  [3, "h", 1],
  [2, "h", 0],
  [1.5, "q", 1],
  [1, "q", 0],
  [0.75, "8", 1],
  [0.5, "8", 0],
  [0.375, "16", 1],
  [0.25, "16", 0],
  [0.125, "32", 0],
];
/** Inside a triplet beat: a quarter or an eighth, three of them to the beat. */
const TRIPLET_VALUES: [number, string, number][] = [
  [2 / 3, "q", 0],
  [1 / 3, "8", 0],
];
const onGrid = (b: number) => Math.abs(b * 8 - Math.round(b * 8)) < 1e-3;
const onThird = (b: number) => Math.abs(b * 3 - Math.round(b * 3)) < 1e-3;
const r4 = (b: number) => Math.round(b * 1e4) / 1e4;

/**
 * One line (a staff row or the tab) as ticks per bar.
 * ponytail: polyphony on one row becomes chords; a note held past the next
 * onset on its row is cut there. Split into VexFlow voices if that reads badly.
 */
export function lineTicks(notes: ScoreNote[], barList: Bar[], groups: ScoreGroup[]): Tick[][] {
  const from = barList[0].startBeat;
  const to = barList[barList.length - 1].endBeat;
  const ns = notes.filter(
    (n) => n.startBeat < to - EPS && n.startBeat + n.durationBeats > from + EPS,
  );
  // Eighth triplets: a beat with an edge on a third of a beat is written as a triplet.
  const triplets = new Set<number>();
  for (const n of ns) {
    if (n.durationBeats <= 0) throw new NotationError("it has a note with no length");
    for (const x of [n.startBeat, n.startBeat + n.durationBeats]) {
      if (onGrid(x)) continue;
      if (!onThird(x))
        throw new NotationError(
          "it has tuplets other than triplets or notes shorter than a 32nd, which are not engraved yet",
        );
      triplets.add(Math.floor(x));
    }
  }
  for (const n of ns)
    for (const x of [n.startBeat, n.startBeat + n.durationBeats])
      if (triplets.has(Math.floor(x + 1e-3)) && !onThird(x))
        throw new NotationError("it mixes triplets and straight notes inside one beat");
  /** The next triplet beat's start at or after `b`. */
  const nextTriplet = (b: number) =>
    Math.min(...[...triplets].filter((t) => t > b - EPS), Infinity);

  // Onsets keep their exact value (a third of a beat is not a round number).
  const onsets = [...new Map(ns.map((n) => [r4(n.startBeat), n.startBeat])).values()].sort(
    (a, b) => a - b,
  );
  type Span = {
    start: number;
    end: number;
    midis: number[];
    attack: boolean;
    fingers?: (number | string)[];
  };
  const spans: Span[] = [];
  let t = from;
  onsets.forEach((at, i) => {
    const chord = ns.filter((n) => r4(n.startBeat) === r4(at));
    const end = Math.min(
      onsets[i + 1] ?? Infinity,
      to,
      Math.max(...chord.map((n) => n.startBeat + n.durationBeats)),
    );
    const start = Math.max(at, from);
    if (start > t + EPS) spans.push({ start: t, end: start, midis: [], attack: false });
    spans.push({
      start,
      end,
      midis: [...new Set(chord.map((n) => n.midi))].sort((a, b) => a - b),
      attack: at >= from - EPS,
      fingers: chord.some((n) => n.finger !== undefined)
        ? [...chord]
            .sort((a, b) => a.midi - b.midi)
            .flatMap((n) => (n.finger === undefined ? [] : [n.finger]))
        : undefined,
    });
    t = end;
  });
  if (t < to - EPS) spans.push({ start: t, end: to, midis: [], attack: false });

  return barList.map((bar) => {
    const ticks: Tick[] = [];
    for (const s of spans) {
      let pos = Math.max(s.start, bar.startBeat);
      const end = Math.min(s.end, bar.endBeat);
      while (end - pos > 1e-4) {
        const k = Math.floor(pos + 1e-4);
        const trip = triplets.has(k);
        const room = Math.min(end, trip ? k + 1 : nextTriplet(pos)) - pos;
        const [dur, vf, dots] =
          (trip ? TRIPLET_VALUES : VALUES).find(([v]) => v <= room + 1e-4) ??
          VALUES[VALUES.length - 1];
        const attack = s.attack && Math.abs(pos - s.start) < EPS;
        const g = attack ? groupAt(groups, s.start) : -1;
        ticks.push({
          start: pos,
          dur,
          vf,
          dots,
          midis: s.midis,
          attack,
          group: g < 0 ? null : g,
          tieNext: s.midis.length > 0 && pos + dur < s.end - 1e-4,
          ...(attack && s.fingers?.length ? { fingers: s.fingers } : {}),
          ...(trip ? { tuplet: k } : {}),
        });
        pos += dur;
      }
    }
    return ticks;
  });
}

// ---------------------------------------------------------------------------
// Pitch spelling and staff assignment.

const KEYS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
export const keySpec = (fifths = 0) => KEYS[Math.max(-7, Math.min(7, fifths)) + 7];

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** VexFlow key ("f#/4") spelled for the key signature: scale notes first, then naturals, then the key's side. */
export function spell(midi: number, fifths = 0): string {
  const keyAcc: Record<string, number> = {};
  for (let i = 0; i < fifths; i++) keyAcc["FCGDAEB"[i]] = 1;
  for (let i = 0; i < -fifths; i++) keyAcc["BEADGCF"[i]] = -1;
  const p = pc(midi);
  const fits = (l: string, a: number) => (LETTER_PC[l] + a + 12) % 12 === p;
  const letters = [..."CDEFGAB"];
  let letter = letters.find((l) => fits(l, keyAcc[l] ?? 0));
  let acc = letter ? (keyAcc[letter] ?? 0) : 0;
  if (!letter) {
    acc = letters.some((l) => fits(l, 0)) ? 0 : fifths < 0 ? -1 : 1;
    letter = letters.find((l) => fits(l, acc))!;
  }
  const octave = (midi - LETTER_PC[letter] - acc) / 12 - 1;
  return `${letter.toLowerCase()}${acc === 1 ? "#" : acc === -1 ? "b" : ""}/${octave}`;
}

export interface StaffRow {
  clef: "treble" | "bass";
  notes: ScoreNote[];
  /** Clef changes at bar lines (a left hand moving into the treble clef). */
  changes?: { startBeat: number; clef: "treble" | "bass" }[];
}

/**
 * Hands decide the staff; then an explicit clef; otherwise pitch (grand staff
 * split at middle C). With `grand`, both staves are always drawn and every
 * note without a hand or clef goes above or below middle C.
 */
export function staffRows(score: Score, voiceIds?: string[] | null, grand = false): StaffRow[] {
  const treble: ScoreNote[] = [];
  const bass: ScoreNote[] = [];
  const loose: ScoreNote[] = [];
  // A voice set to the bass clef keeps its staff even with no notes (a key signature on its own).
  let bassClef = false;
  const changes: Record<"treble" | "bass", NonNullable<StaffRow["changes"]>> = {
    treble: [],
    bass: [],
  };
  for (const v of selectedVoices(score, voiceIds)) {
    if (v.clef === "bass" || v.hand === "left") bassClef = true;
    if (v.clefChanges?.length)
      changes[v.hand === "left" || (!v.hand && v.clef === "bass") ? "bass" : "treble"].push(
        ...v.clefChanges,
      );
    const notes = mergeTies(v.notes);
    const to = v.hand
      ? v.hand === "left"
        ? bass
        : treble
      : v.clef
        ? v.clef === "bass"
          ? bass
          : treble
        : loose;
    to.push(...notes);
  }
  if (loose.length) {
    const midis = loose.map((n) => n.midi);
    if (!grand && Math.max(...midis) < 60) bass.push(...loose);
    else if (!grand && Math.min(...midis) >= 53) treble.push(...loose);
    else for (const n of loose) (n.midi >= 60 ? treble : bass).push(n);
  }
  const rows: StaffRow[] = [];
  const withChanges = (clef: "treble" | "bass") =>
    changes[clef].length
      ? { changes: [...changes[clef]].sort((a, b) => a.startBeat - b.startBeat) }
      : {};
  if (grand || treble.length || !(bass.length || bassClef))
    rows.push({ clef: "treble", notes: treble, ...withChanges("treble") });
  if (grand || bass.length || bassClef)
    rows.push({ clef: "bass", notes: bass, ...withChanges("bass") });
  return rows;
}

// ---------------------------------------------------------------------------
// Shared engraver.

interface RowSpec {
  height: number;
  /** `bar`: the bar's index in the bar list, when drawing it (not when measuring). */
  stave(
    VF: VF,
    x: number,
    y: number,
    w: number,
    first: boolean,
    time: boolean,
    bar?: number,
  ): Stave;
  ticks: Tick[][];
  note(VF: VF, t: Tick): Note;
  keySpec?: string;
  beams: boolean;
}

const MARGIN = 6;
/** Whether bar `b` starts a new meter (a time signature to draw). */
const meterChanged = (list: Bar[], b: number) => {
  const [m, p] = [list[b]?.meter, list[b - 1]?.meter];
  return b > 0 && !!m && !!p && (m.beats !== p.beats || m.beatUnit !== p.beatUnit);
};
/** Odd eighth meters beam in their groups (2+2+3, 2+3); VexFlow's default pairs them. */
const ODD_BEAMS: Record<string, string[]> = { "7/8": ["2/8", "2/8", "3/8"], "5/8": ["2/8", "3/8"] };

function engrave(
  VF: VF,
  host: HTMLElement,
  score: Score,
  barList: Bar[],
  groups: ScoreGroup[],
  rows: RowSpec[],
  width: number,
  /** Stretch a short last line to the width too (a one-line exercise reads better spread out), or centre a one-line staff. */
  fill: boolean | "center" = false,
): Layout {
  // Each bar's meter: the score's, or its own when the score changes meter.
  const meterOf = (b: number) => barList[b].meter ?? score.meter;
  const beamGroupsOf = (m: Score["meter"]) => {
    const time = `${m.beats}/${m.beatUnit}`;
    return ODD_BEAMS[time]
      ? ODD_BEAMS[time].map((g) => new VF.Fraction().parse(g))
      : VF.Beam.getDefaultBeamGroups(time);
  };
  const sysH = rows.reduce((h, r) => h + r.height, 0) + 12;

  const build = (b: number, staves: Stave[]) =>
    rows.map((row, r) => {
      const ticks = row.ticks[b];
      const notes = ticks.map((t) => row.note(VF, t));
      notes.forEach((n) => n.setStave(staves[r]));
      // Triplets before the voice counts the ticks: a "3" over staff notes, plain ticks on tab.
      const tuplets: { tuplet: InstanceType<VF["Tuplet"]> | null; idx: number[] }[] = [];
      ticks.forEach((t, i) => {
        if (t.tuplet === undefined) return;
        const last = tuplets.at(-1);
        if (last && ticks[last.idx[0]].tuplet === t.tuplet) last.idx.push(i);
        else tuplets.push({ tuplet: null, idx: [i] });
      });
      for (const tp of tuplets) {
        const ns = tp.idx.map((i) => notes[i]);
        if (row.beams)
          tp.tuplet = new VF.Tuplet(ns as InstanceType<VF["StaveNote"]>[], {
            numNotes: 3,
            notesOccupied: 2,
            bracketed: tp.idx.some((i) => ticks[i].vf !== "8" || !ticks[i].midis.length),
          });
        else for (const n of ns) n.applyTickMultiplier(2, 3);
      }
      const voice = new VF.Voice({ numBeats: meterOf(b).beats, beatValue: meterOf(b).beatUnit })
        .setMode(VF.Voice.Mode.SOFT)
        .addTickables(notes);
      if (row.keySpec) VF.Accidental.applyAccidentals([voice], row.keySpec);
      const beams = row.beams
        ? VF.Beam.generateBeams(
            notes.filter((n) => n instanceof VF.StaveNote),
            { groups: beamGroupsOf(meterOf(b)) },
          )
        : [];
      return { notes, voice, beams, tuplets };
    });

  // Measure: modifier widths and each bar's natural width.
  const modWidth = (first: boolean, t: boolean) =>
    Math.max(
      ...rows.map((row) => {
        const s = row.stave(VF, 0, 0, 400, first, t);
        return s.getNoteStartX() - s.getX();
      }),
    );
  const plain = modWidth(false, false);
  const modFirst = modWidth(true, true) - plain;
  const modNext = modWidth(true, false) - plain;
  const scratch = rows.map((row) => row.stave(VF, 0, 0, 400, false, false));
  const least: number[] = [];
  const natural = barList.map((_, b) => {
    const built = build(b, scratch);
    const f = new VF.Formatter();
    built.forEach((x) => f.joinVoices([x.voice]));
    const min = f.preCalculateMinTotalWidth(built.map((x) => x.voice));
    // A bar that changes meter carries its time signature: room for it.
    const sig = meterChanged(barList, b) ? 24 : 0;
    least[b] = min + plain + 20 + sig;
    return Math.max(64, min * 1.35 + plain + 24) + sig;
  });

  // Pack bars into systems.
  // A grand staff's brace sits left of the staves.
  const left = rows.length > 1 ? 22 : MARGIN;
  const avail = Math.max(120, width - left - MARGIN);
  const systems: number[][] = [];
  let used = Infinity;
  natural.forEach((w, b) => {
    const extra = systems.length === 0 ? modFirst : modNext;
    if (used + w > avail) {
      systems.push([b]);
      used = w + extra;
    } else {
      systems[systems.length - 1].push(b);
      used += w;
    }
  });

  // Justify each system to the width; a lone bar too wide for a phone squeezes to its minimum.
  const widths = systems.map((sys, si) => {
    const extra = si === 0 ? modFirst : modNext;
    let scale = (avail - extra) / sys.reduce((a, b) => a + natural[b], 0);
    if (fill !== true && si === systems.length - 1 && scale > 1.4) scale = 1;
    return sys.map((b, k) => Math.max(least[b], natural[b] * scale) + (k === 0 ? extra : 0));
  });
  host.replaceChildren();
  const svgWidth = Math.max(
    width,
    ...widths.map((w) => w.reduce((a, b) => a + b, 0) + left + MARGIN),
  );
  const indent =
    fill === "center" && systems.length === 1
      ? Math.max(0, (svgWidth - widths[0].reduce((a, b) => a + b, 0) - left - MARGIN) / 2)
      : 0;
  const renderer = new VF.Renderer(host as HTMLDivElement, VF.Renderer.Backends.SVG);
  renderer.resize(svgWidth, systems.length * sysH);
  const ctx = renderer.getContext();

  const layout: Layout = {
    width: svgWidth,
    height: systems.length * sysH,
    bars: [],
    anchors: [],
    groups,
    groupEls: new Map(),
    linked: [],
  };
  const ties: { a: Note; b: Note; ta: Tick; tb: Tick; same: boolean; owner: number | null }[] = [];
  const last: ({ note: Note; tick: Tick; system: number } | undefined)[] = rows.map(
    () => undefined,
  );
  // The group a drawn note belongs to: its attack's, for a tie continuation too.
  const owners = rows.map((): number | null => null);
  const ownerOf = new Map<Note, number>();
  const link = (el: Element | undefined, groups: (number | null | undefined)[]) => {
    const gs = [...new Set(groups.filter((g): g is number => g != null))];
    if (el && gs.length) layout.linked.push({ groups: gs, el });
  };

  systems.forEach((sys, si) => {
    const y0 = si * sysH;
    const lastSystem = si === systems.length - 1;
    let x = left + indent;
    sys.forEach((b, k) => {
      const w = widths[si][k];
      let y = y0;
      const staves = rows.map((row) => {
        const s = row.stave(VF, x, y, w, k === 0, si === 0 && k === 0, b);
        y += row.height;
        if (k > 0) s.setBegBarType(VF.BarlineType.NONE);
        if (lastSystem && k === sys.length - 1) s.setEndBarType(VF.BarlineType.END);
        return s.setContext(ctx);
      });
      // Tab frets are centred on their x, so they need room after the clef and time.
      const start = Math.max(...staves.map((s) => s.getNoteStartX())) + (rows[0].beams ? 0 : 8);
      staves.forEach((s) => s.setNoteStartX(start).draw());
      if (staves.length > 1) {
        if (k === 0) {
          new VF.StaveConnector(staves[0], staves[staves.length - 1])
            .setType("brace")
            .setContext(ctx)
            .draw();
          new VF.StaveConnector(staves[0], staves[staves.length - 1])
            .setType("singleLeft")
            .setContext(ctx)
            .draw();
        }
        new VF.StaveConnector(staves[0], staves[staves.length - 1])
          .setType("singleRight")
          .setContext(ctx)
          .draw();
      }

      const built = build(b, staves);
      const f = new VF.Formatter();
      built.forEach((x) => f.joinVoices([x.voice]));
      f.format(
        built.map((x) => x.voice),
        staves[0].getNoteEndX() - start - 12,
      );
      built.forEach(({ voice }, r) => voice.draw(ctx, staves[r]));

      const seen = new Set<number>();
      built.forEach(({ notes }, r) => {
        notes.forEach((note, i) => {
          const tick = rows[r].ticks[b][i];
          owners[r] = tick.group ?? (tick.midis.length ? owners[r] : null);
          if (owners[r] !== null) ownerOf.set(note, owners[r]!);
          if (tick.group === null && tick.midis.length && owners[r] !== null) {
            const el = note.getSVGElement();
            if (el)
              layout.groupEls.set(owners[r]!, [...(layout.groupEls.get(owners[r]!) ?? []), el]);
          }
          const nx =
            note instanceof VF.StaveNote
              ? (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2
              : note.getAbsoluteX();
          if (!seen.has(r4(tick.start)) || tick.group !== null) {
            seen.add(r4(tick.start));
            layout.anchors.push({ beat: tick.start, x: nx, system: si, group: tick.group });
          }
          if (tick.group !== null) {
            const el = note.getSVGElement();
            if (el)
              layout.groupEls.set(tick.group, [...(layout.groupEls.get(tick.group) ?? []), el]);
          }
          const prev = last[r];
          if (
            prev?.tick.tieNext &&
            note instanceof VF.StaveNote &&
            prev.note instanceof VF.StaveNote
          )
            ties.push({
              a: prev.note,
              b: note,
              ta: prev.tick,
              tb: tick,
              same: prev.system === si,
              owner: ownerOf.get(prev.note) ?? null,
            });
          last[r] = { note, tick, system: si };
        });
      });
      built.forEach(({ beams, tuplets, notes }) => {
        for (const bm of beams) {
          bm.setContext(ctx).draw();
          link(
            bm.getSVGElement(),
            bm.getNotes().map((n) => ownerOf.get(n as Note)),
          );
        }
        for (const { tuplet, idx } of tuplets) {
          if (!tuplet) continue;
          tuplet.setContext(ctx).draw();
          link(
            tuplet.getSVGElement(),
            idx.map((i) => ownerOf.get(notes[i]) ?? null),
          );
        }
      });

      const bar = barList[b];
      layout.bars.push({
        ...bar,
        bar: bar.number,
        system: si,
        x,
        y: y0,
        width: w,
        height: sysH,
        top: staves[0].getYForLine(0),
        bottom: staves[staves.length - 1].getYForLine(staves[staves.length - 1].getNumLines() - 1),
      });
      x += w;
    });
  });

  for (const { a, b, ta, tb, same, owner } of ties) {
    const common = ta.midis.filter((m) => tb.midis.includes(m));
    const firstIndexes = common.map((m) => ta.midis.indexOf(m));
    const lastIndexes = common.map((m) => tb.midis.indexOf(m));
    const parts = same
      ? [{ firstNote: a, lastNote: b, firstIndexes, lastIndexes }]
      : [
          { firstNote: a, firstIndexes, lastIndexes: firstIndexes },
          { lastNote: b, firstIndexes: lastIndexes, lastIndexes },
        ];
    for (const p of parts) {
      const tie = new VF.StaveTie(p);
      tie.setContext(ctx).draw();
      link(tie.getSVGElement(), [owner]);
    }
  }

  layout.anchors.sort((p, q) => p.beat - q.beat);
  return layout;
}

// ---------------------------------------------------------------------------
// Public drawers.

export interface DrawOptions {
  score: Score;
  voiceIds?: string[] | null;
  range?: BeatRange | null;
  width: number;
  /** Always a grand staff (treble and bass, split at middle C). */
  grand?: boolean;
  /** Stretch the last line to the width too, or centre a one-line staff. */
  fill?: boolean | "center";
}

export function drawStaff(
  VF: VF,
  host: HTMLElement,
  {
    score,
    voiceIds,
    range,
    width,
    revealLabels = false,
    grand = false,
    fill = false,
    time: withTime = true,
  }: DrawOptions & { revealLabels?: boolean; time?: boolean },
): Layout {
  const barList = barsIn(bars(score), range);
  const groups = scoreGroups(score, voiceIds, range);
  const fifths = score.keyFifths ?? 0;
  const key = keySpec(fifths);
  const rows: RowSpec[] = staffRows(score, voiceIds, grand).map((row, r) => {
    // Fingering needs room: above a treble staff (the staff moves down), below a bass staff.
    const fingered = row.notes.some((n) => n.finger !== undefined);
    const ticks = lineTicks(row.notes, barList, groups);
    // Each bar's clef: the row's, or the last change at or before the bar.
    const barClef = barList.map(
      (bar) => row.changes?.findLast((c) => c.startBeat <= bar.startBeat + EPS)?.clef ?? row.clef,
    );
    ticks.forEach((bar, b) => {
      if (barClef[b] !== row.clef) for (const t of bar) t.clef = barClef[b];
    });
    // Chord symbols sit above the top staff, on the note or rest sounding at their beat.
    const symbols = r === 0 && !!score.chords?.length;
    if (symbols)
      for (const c of score.chords!) {
        const t = ticks
          .flat()
          .find((x) => c.startBeat >= x.start - EPS && c.startBeat < x.start + x.dur - EPS);
        if (t) t.symbol = t.symbol ? `${t.symbol} ${c.symbol}` : c.symbol;
      }
    // Dynamics under the top staff (between the hands on a grand staff), breaths above it.
    let marked = false;
    if (r === 0) {
      const flat = ticks.flat();
      const at = (beat: number) =>
        flat.find((x) => beat >= x.start - EPS && beat < x.start + x.dur - EPS);
      const words = [
        ...(score.dynamics ?? []).map((d) => ({ beat: d.startBeat, text: d.mark })),
        ...(score.hairpins ?? []).map((h) => ({
          beat: h.startBeat,
          text: h.kind === "crescendo" ? "cresc." : "dim.",
        })),
      ];
      for (const w of words) {
        const t = at(w.beat);
        if (t) [t.dyn, marked] = [t.dyn ? `${t.dyn} ${w.text}` : w.text, true];
      }
      for (const b of score.breaths ?? []) {
        const t = flat.find((x) => Math.abs(x.start + x.dur - b) < 1e-3 && x.midis.length);
        if (t) t.breath = true;
      }
    }
    const above = (fingered && row.clef !== "bass") || symbols ? 22 : 0;
    return {
      height:
        (revealLabels ? 112 : 92) +
        (fingered || symbols ? 22 : 0) +
        (marked && !revealLabels ? 20 : 0),
      keySpec: key,
      beams: true,
      ticks,
      stave(VF, x, y, w, first, time, bar) {
        const s = new VF.Stave(x, y + above, w);
        const clef = bar === undefined ? row.clef : barClef[bar];
        if (first) s.addClef(clef).addKeySignature(key);
        else if (bar && clef !== barClef[bar - 1]) s.addClef(clef, "small");
        const m = bar === undefined ? score.meter : (barList[bar].meter ?? score.meter);
        if (withTime && (time || (bar && meterChanged(barList, bar))))
          s.addTimeSignature(`${m.beats}/${m.beatUnit}`);
        return s;
      },
      note(VF, t) {
        const rest = t.midis.length === 0;
        const clef = t.clef ?? row.clef;
        const n = new VF.StaveNote({
          keys: rest ? [clef === "bass" ? "d/3" : "b/4"] : t.midis.map((m) => spell(m, fifths)),
          duration: t.vf + (rest ? "r" : ""),
          dots: t.dots,
          clef,
          autoStem: true,
        });
        if (t.dots) VF.Dot.buildAndAttach([n], { all: true });
        if (t.symbol)
          n.addModifier(
            new VF.Annotation(t.symbol)
              .setFont("sans-serif", 13, "bold")
              .setVerticalJustification(VF.AnnotationVerticalJustify.TOP),
            0,
          );
        // Fingering as scale books print it: above the treble staff, below the bass.
        if (t.fingers?.length && !rest)
          n.addModifier(
            new VF.Annotation(t.fingers.join(" ")).setVerticalJustification(
              row.clef === "bass"
                ? VF.AnnotationVerticalJustify.BOTTOM
                : VF.AnnotationVerticalJustify.TOP,
            ),
            0,
          );
        if (t.dyn && !revealLabels)
          n.addModifier(
            new VF.Annotation(t.dyn)
              .setFont("serif", 14, "bold", "italic")
              .setVerticalJustification(VF.AnnotationVerticalJustify.BOTTOM),
            0,
          );
        if (t.breath && !rest)
          n.addModifier(
            new VF.Annotation(",")
              .setFont("serif", 22, "bold")
              .setJustification(VF.AnnotationHorizontalJustify.RIGHT)
              .setVerticalJustification(VF.AnnotationVerticalJustify.TOP),
            0,
          );
        if (revealLabels && t.attack && !rest)
          n.addModifier(
            new VF.Annotation(
              t.midis.map((m) => noteName(m, fifths < 0 ? "flat" : "sharp", false)).join(" "),
            ).setVerticalJustification(VF.AnnotationVerticalJustify.BOTTOM),
            0,
          );
        return n;
      },
    };
  });
  return engrave(VF, host, score, barList, groups, rows, width, fill);
}

export function tabFit(
  score: Score,
  voiceIds: string[] | null | undefined,
  range: BeatRange | null | undefined,
  tuning: TabTuning,
) {
  const barList = barsIn(bars(score), range);
  const from = barList[0].startBeat;
  const to = barList[barList.length - 1].endBeat;
  const notes = selectedVoices(score, voiceIds)
    .flatMap((v) => mergeTies(v.notes))
    .filter((n) => n.startBeat >= from - EPS && n.startBeat < to - EPS);
  const pos = assignTab(notes, tuning);
  const at = new Map(notes.map((n, i) => [`${r4(n.startBeat)}:${n.midi}`, pos[i]]));
  return { barList, notes, at, outOfRange: pos.filter((p) => !p).length };
}

export function drawTab(
  VF: VF,
  host: HTMLElement,
  { score, voiceIds, range, width, tuning, fill }: DrawOptions & { tuning: TabTuning },
): Layout {
  const { barList, notes, at, outOfRange } = tabFit(score, voiceIds, range, tuning);
  if (notes.length && outOfRange > notes.length / 3)
    throw new NotationError(
      `${outOfRange} of ${notes.length} notes are outside this tuning (frets 0 to ${tuning.fretCount})`,
    );
  const groups = scoreGroups(score, voiceIds, range);
  const lines = tuning.openStrings.length;
  const row: RowSpec = {
    height: lines * 13 + 44,
    beams: false,
    ticks: lineTicks(notes, barList, groups),
    stave(VF, x, y, w, first, time) {
      const s = new VF.TabStave(x, y, w, { numLines: lines });
      if (first) s.addTabGlyph();
      if (time) s.addTimeSignature(`${score.meter.beats}/${score.meter.beatUnit}`);
      return s;
    },
    note(VF, t) {
      const positions = t.attack
        ? t.midis.flatMap((m) => {
            const p = at.get(`${r4(t.start)}:${m}`);
            return p ? [{ str: p.string, fret: p.fret }] : [];
          })
        : [];
      return positions.length
        ? new VF.TabNote({ positions, duration: t.vf, dots: t.dots })
        : new VF.GhostNote({ duration: t.vf, dots: t.dots });
    },
  };
  const layout = engrave(VF, host, score, barList, groups, [row], width, fill);
  if (outOfRange)
    layout.notice = `${outOfRange} ${outOfRange === 1 ? "note is" : "notes are"} outside this tuning and ${outOfRange === 1 ? "shows" : "show"} as a gap.`;
  return layout;
}
