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
const onGrid = (b: number) => Math.abs(b * 8 - Math.round(b * 8)) < 1e-3;
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
  for (const n of ns)
    if (!onGrid(n.startBeat) || !onGrid(n.startBeat + n.durationBeats) || n.durationBeats <= 0)
      throw new NotationError(
        "it has tuplets or notes shorter than a 32nd, which are not engraved yet",
      );

  const onsets = [...new Set(ns.map((n) => r4(n.startBeat)))].sort((a, b) => a - b);
  type Span = { start: number; end: number; midis: number[]; attack: boolean };
  const spans: Span[] = [];
  let t = from;
  onsets.forEach((at, i) => {
    const chord = ns.filter((n) => r4(n.startBeat) === at);
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
    });
    t = end;
  });
  if (t < to - EPS) spans.push({ start: t, end: to, midis: [], attack: false });

  return barList.map((bar) => {
    const ticks: Tick[] = [];
    for (const s of spans) {
      let pos = Math.max(s.start, bar.startBeat);
      const end = Math.min(s.end, bar.endBeat);
      while (end - pos > EPS) {
        const [dur, vf, dots] =
          VALUES.find(([v]) => v <= end - pos + EPS) ?? VALUES[VALUES.length - 1];
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
          tieNext: s.midis.length > 0 && pos + dur < s.end - EPS,
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
  for (const v of selectedVoices(score, voiceIds)) {
    if (v.clef === "bass" || v.hand === "left") bassClef = true;
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
  if (grand || treble.length || !(bass.length || bassClef))
    rows.push({ clef: "treble", notes: treble });
  if (grand || bass.length || bassClef) rows.push({ clef: "bass", notes: bass });
  return rows;
}

// ---------------------------------------------------------------------------
// Shared engraver.

interface RowSpec {
  height: number;
  stave(VF: VF, x: number, y: number, w: number, first: boolean, time: boolean): Stave;
  ticks: Tick[][];
  note(VF: VF, t: Tick): Note;
  keySpec?: string;
  beams: boolean;
}

const MARGIN = 6;

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
  const time = `${score.meter.beats}/${score.meter.beatUnit}`;
  const beamGroups = VF.Beam.getDefaultBeamGroups(time);
  const sysH = rows.reduce((h, r) => h + r.height, 0) + 12;

  const build = (b: number, staves: Stave[]) =>
    rows.map((row, r) => {
      const notes = row.ticks[b].map((t) => row.note(VF, t));
      notes.forEach((n) => n.setStave(staves[r]));
      const voice = new VF.Voice({ numBeats: score.meter.beats, beatValue: score.meter.beatUnit })
        .setMode(VF.Voice.Mode.SOFT)
        .addTickables(notes);
      if (row.keySpec) VF.Accidental.applyAccidentals([voice], row.keySpec);
      const beams = row.beams
        ? VF.Beam.generateBeams(
            notes.filter((n) => n instanceof VF.StaveNote),
            { groups: beamGroups },
          )
        : [];
      return { notes, voice, beams };
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
    least[b] = min + plain + 20;
    return Math.max(64, min * 1.35 + plain + 24);
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
  };
  const ties: { a: Note; b: Note; ta: Tick; tb: Tick; same: boolean }[] = [];
  const last: ({ note: Note; tick: Tick; system: number } | undefined)[] = rows.map(
    () => undefined,
  );

  systems.forEach((sys, si) => {
    const y0 = si * sysH;
    const lastSystem = si === systems.length - 1;
    let x = left + indent;
    sys.forEach((b, k) => {
      const w = widths[si][k];
      let y = y0;
      const staves = rows.map((row) => {
        const s = row.stave(VF, x, y, w, k === 0, si === 0 && k === 0);
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
      built.forEach(({ voice, beams }, r) => {
        voice.draw(ctx, staves[r]);
        beams.forEach((bm) => bm.setContext(ctx).draw());
      });

      const seen = new Set<number>();
      built.forEach(({ notes }, r) => {
        notes.forEach((note, i) => {
          const tick = rows[r].ticks[b][i];
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
            ties.push({ a: prev.note, b: note, ta: prev.tick, tb: tick, same: prev.system === si });
          last[r] = { note, tick, system: si };
        });
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

  for (const { a, b, ta, tb, same } of ties) {
    const common = ta.midis.filter((m) => tb.midis.includes(m));
    const firstIndexes = common.map((m) => ta.midis.indexOf(m));
    const lastIndexes = common.map((m) => tb.midis.indexOf(m));
    const parts = same
      ? [{ firstNote: a, lastNote: b, firstIndexes, lastIndexes }]
      : [
          { firstNote: a, firstIndexes, lastIndexes: firstIndexes },
          { lastNote: b, firstIndexes: lastIndexes, lastIndexes },
        ];
    for (const p of parts) new VF.StaveTie(p).setContext(ctx).draw();
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
  const rows: RowSpec[] = staffRows(score, voiceIds, grand).map((row) => ({
    height: revealLabels ? 112 : 92,
    keySpec: key,
    beams: true,
    ticks: lineTicks(row.notes, barList, groups),
    stave(VF, x, y, w, first, time) {
      const s = new VF.Stave(x, y, w);
      if (first) s.addClef(row.clef).addKeySignature(key);
      if (time && withTime) s.addTimeSignature(`${score.meter.beats}/${score.meter.beatUnit}`);
      return s;
    },
    note(VF, t) {
      const rest = t.midis.length === 0;
      const n = new VF.StaveNote({
        keys: rest ? [row.clef === "bass" ? "d/3" : "b/4"] : t.midis.map((m) => spell(m, fifths)),
        duration: t.vf + (rest ? "r" : ""),
        dots: t.dots,
        clef: row.clef,
        autoStem: true,
      });
      if (t.dots) VF.Dot.buildAndAttach([n], { all: true });
      if (revealLabels && t.attack && !rest)
        n.addModifier(
          new VF.Annotation(
            t.midis.map((m) => noteName(m, fifths < 0 ? "flat" : "sharp", false)).join(" "),
          ).setVerticalJustification(VF.AnnotationVerticalJustify.BOTTOM),
          0,
        );
      return n;
    },
  }));
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
