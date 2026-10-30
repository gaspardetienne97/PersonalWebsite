// Read and tap's pattern as rhythm notation on a one-line percussion staff.
// Note values, rests, ties and triplets come from the staff's own bar
// splitting (lineTicks); this adds what the shared engraver has no row for:
// the one-line staff, accents, strum arrows and muted (x) strokes.

import type { ScoreGroup, ScoreNote } from "@repo/music-core";
import type { RhythmPatternDef } from "@repo/music-core/data/index";
import { lineTicks, type Layout, type Tick } from "$lib/music/notation/engrave";
import { bars, type Bar } from "$lib/music/notation/groups";

type VF = typeof import("vexflow/bravura");
type StaveNote = InstanceType<VF["StaveNote"]>;

const EPS = 1e-6;
const frac = (b: number) => b - Math.floor(b + EPS);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

export interface RhythmLine {
  /** The written time signature. */
  meter: { beats: number; beatUnit: number };
  /** Written length in quarter-note beats. */
  length: number;
  bars: Bar[];
  /** One per pattern event, in its order, at its written place. */
  notes: ScoreNote[];
  groups: ScoreGroup[];
  ticks: Tick[][];
  /** Swung eighths, written straight. */
  swing: boolean;
  /** The count under the staff, in written beats. */
  counts: { beat: number; text: string }[];
  /** A sounding beat (the click's) at its written place. */
  written(beat: number): number;
}

/**
 * How a pattern is written. Two beats a bar, three to a beat, is 6/8 (a beat
 * is a dotted quarter). Swing, notes sounding on the last third of a beat and
 * never on the first, is written as straight eighths. Everything else is as
 * it sounds. A note lasts its own length, or until the next note, rest or end.
 */
export function rhythmLine(p: RhythmPatternDef): RhythmLine {
  const edges = [
    ...p.events.flatMap((e) => [e.beat, e.beat + (e.durationBeats ?? 0)]),
    ...p.rests.flatMap((r) => [r.startBeat, r.endBeat]),
  ].map(frac);
  const onThird = edges.every((f) => near(f * 3, Math.round(f * 3)));
  const compound = p.meter.beats === 2 && onThird && edges.some((f) => !near(f, 0));
  const swing =
    !compound &&
    edges.some((f) => near(f, 2 / 3)) &&
    edges.every((f) => near(f, 0) || near(f, 2 / 3));
  const written = (b: number) => {
    if (compound) return b * 1.5;
    if (!swing) return b;
    const f = frac(b);
    return b - f + (f <= 2 / 3 ? f * 0.75 : 0.5 + (f - 2 / 3) * 1.5);
  };
  const meter = compound ? { beats: 6, beatUnit: 8 } : p.meter;
  const length = written(p.defaultBars * p.meter.beats);
  const starts = p.events.map((e) => written(e.beat));
  const stops = [...starts, ...p.rests.map((r) => written(r.startBeat)), length];
  const notes: ScoreNote[] = p.events.map((e, i) => {
    const own = e.durationBeats ? written(e.beat + e.durationBeats) : Infinity;
    const next = Math.min(own, ...stops.filter((s) => s > starts[i] + EPS));
    return { midi: 71, startBeat: starts[i], durationBeats: next - starts[i] };
  });
  const groups: ScoreGroup[] = notes.map((n, i) => ({
    index: i,
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    notes: [{ ...n, voiceId: "rhythm" }],
  }));
  const barList = bars({ meter, lengthBeats: length });
  // Count the beat; the "and"s too where a note falls on one (and every eighth in 6/8).
  const pulse = compound ? 1.5 : 1;
  const halves = [...starts, ...p.rests.map((r) => written(r.startBeat))].some((s) =>
    near(frac(s), 0.5),
  );
  const sub = compound || halves ? 0.5 : pulse;
  const perBar = compound ? 2 : meter.beats;
  const counts = Array.from({ length: Math.round(length / sub) }, (_, k) => {
    const beat = k * sub;
    const inBeat = Math.round((beat % pulse) / sub);
    const text =
      inBeat === 0 ? String((Math.round(beat / pulse) % perBar) + 1) : inBeat === 1 ? "&" : "a";
    return { beat, text };
  });
  return {
    meter,
    length,
    bars: barList,
    notes,
    groups,
    ticks: lineTicks(notes, barList, groups),
    swing,
    counts,
    written,
  };
}

const MARGIN = 6;

/** The line engraved to `width`: equal bars, as many to a row as read comfortably, rows balanced. */
export function drawRhythm(
  VF: VF,
  host: HTMLElement,
  p: RhythmPatternDef,
  line: RhythmLine,
  width: number,
): Layout {
  const n = line.bars.length;
  const busiest = Math.max(...line.ticks.map((t) => t.length));
  const lead = 78;
  const fit = Math.max(
    1,
    Math.min(4, Math.floor((width - lead - 2 * MARGIN) / (60 + 30 * busiest))),
  );
  const rows = Math.ceil(n / fit);
  const per = Math.ceil(n / rows);

  // Room above the line for accents, then a row each for strum arrows, triplet
  // marks and chord symbols; below it for the count and the taps (drawn by the view).
  const strokes = p.events.some((e) => e.stroke === "down" || e.stroke === "up");
  const triplets = line.ticks.flat().some((t) => t.tuplet !== undefined);
  const lineY = 70 + (strokes ? 18 : 0) + (triplets ? 16 : 0) + (p.chords?.length ? 18 : 0);
  const systemH = lineY + 80;

  host.replaceChildren();
  const renderer = new VF.Renderer(host as HTMLDivElement, VF.Renderer.Backends.SVG);
  renderer.resize(width, rows * systemH);
  const ctx = renderer.getContext();
  const layout: Layout = {
    width,
    height: rows * systemH,
    bars: [],
    anchors: [],
    groups: line.groups,
    groupEls: new Map(),
    linked: [],
  };
  const time = `${line.meter.beats}/${line.meter.beatUnit}`;
  const chordAt = (t: Tick) =>
    (p.chords ?? []).find((c) => {
      const b = line.written(c.startBeat);
      return b >= t.start - EPS && b < t.start + t.dur - EPS;
    })?.symbol;
  const arrow = (text: string) =>
    new VF.Annotation(text)
      .setFont("sans-serif", 15, "bold")
      .setVerticalJustification(VF.AnnotationVerticalJustify.TOP);

  let owner: number | null = null;
  let prev: { note: StaveNote; tick: Tick; row: number } | undefined;
  for (let b = 0; b < n; b++) {
    const row = Math.floor(b / per);
    const col = b % per;
    const y0 = row * systemH;
    // Every row starts with the percussion clef; the first carries the time signature.
    const extra = row === 0 ? lead : lead - 30;
    const barW = (width - 2 * MARGIN - extra) / per;
    const x = MARGIN + (col === 0 ? 0 : extra + col * barW);
    const w = barW + (col === 0 ? extra : 0);
    const stave = new VF.Stave(x, y0 + lineY - 60, w);
    stave.setConfigForLines([0, 1, 2, 3, 4].map((l) => ({ visible: l === 2 })));
    if (col === 0) stave.addClef("percussion");
    if (b === 0) stave.addTimeSignature(time);
    if (b === n - 1) stave.setEndBarType(VF.BarlineType.END);
    stave.setContext(ctx).draw();

    const ticks = line.ticks[b];
    // The event each drawn note belongs to: its attack's, for a tied piece too.
    const owners: (number | null)[] = [];
    const notes = ticks.map((t) => {
      owner = t.group ?? (t.midis.length ? owner : null);
      owners.push(owner);
      const e = owner === null ? undefined : p.events[owner];
      const rest = !t.midis.length;
      const note = new VF.StaveNote({
        keys: [!rest && e?.stroke === "mute" ? "b/4/x" : "b/4"],
        duration: t.vf + (rest ? "r" : ""),
        dots: t.dots,
        clef: "percussion",
        stemDirection: VF.Stem.UP,
      });
      if (t.dots) VF.Dot.buildAndAttach([note], { all: true });
      if (t.attack && e?.accent === "accent")
        note.addModifier(new VF.Articulation("a>").setPosition(VF.Modifier.Position.ABOVE), 0);
      if (t.attack && (e?.stroke === "down" || e?.stroke === "up"))
        note.addModifier(arrow(e.stroke === "down" ? "↓" : "↑"), 0);
      const symbol = chordAt(t);
      if (symbol)
        note.addModifier(
          new VF.Annotation(symbol)
            .setFont("sans-serif", 14, "bold")
            .setVerticalJustification(VF.AnnotationVerticalJustify.TOP),
          0,
        );
      return note;
    });
    // Triplets before the voice counts the ticks.
    const tuplets: number[][] = [];
    ticks.forEach((t, i) => {
      if (t.tuplet === undefined) return;
      const last = tuplets.at(-1);
      if (last && ticks[last[0]].tuplet === t.tuplet) last.push(i);
      else tuplets.push([i]);
    });
    const drawnTuplets = tuplets.map(
      (idx) =>
        new VF.Tuplet(
          idx.map((i) => notes[i]),
          {
            numNotes: 3,
            notesOccupied: 2,
            bracketed: idx.some((i) => ticks[i].vf !== "8" || !ticks[i].midis.length),
            location: VF.Tuplet.LOCATION_TOP,
          },
        ),
    );
    const voice = new VF.Voice({ numBeats: line.meter.beats, beatValue: line.meter.beatUnit })
      .setMode(VF.Voice.Mode.SOFT)
      .addTickables(notes);
    const beams = VF.Beam.generateBeams(notes, {
      groups: VF.Beam.getDefaultBeamGroups(time),
      stemDirection: VF.Stem.UP,
    });
    new VF.Formatter()
      .joinVoices([voice])
      .format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 12);
    voice.draw(ctx, stave);
    for (const bm of beams) bm.setContext(ctx).draw();
    for (const tp of drawnTuplets) tp.setContext(ctx).draw();

    const seen = new Set<number>();
    notes.forEach((note, i) => {
      const t = ticks[i];
      const el = note.getSVGElement();
      const own = owners[i];
      if (t.group !== null) el?.setAttribute("data-event", String(t.group));
      if (el && own !== null) layout.groupEls.set(own, [...(layout.groupEls.get(own) ?? []), el]);
      const key = Math.round(t.start * 1e4);
      if (!seen.has(key)) {
        seen.add(key);
        layout.anchors.push({
          beat: t.start,
          x: (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2,
          system: row,
          group: t.group,
        });
      }
      // A note held over a beat or bar line: tie its pieces, split where the row breaks.
      if (prev?.tick.tieNext) {
        if (prev.row === row)
          new VF.StaveTie({
            firstNote: prev.note,
            lastNote: note,
            firstIndexes: [0],
            lastIndexes: [0],
          })
            .setContext(ctx)
            .draw();
        else {
          new VF.StaveTie({ firstNote: prev.note, firstIndexes: [0], lastIndexes: [0] })
            .setContext(ctx)
            .draw();
          new VF.StaveTie({ lastNote: note, firstIndexes: [0], lastIndexes: [0] })
            .setContext(ctx)
            .draw();
        }
      }
      prev = { note, tick: t, row };
    });

    const bar = line.bars[b];
    layout.bars.push({
      ...bar,
      bar: bar.number,
      system: row,
      x,
      y: y0,
      width: w,
      height: systemH,
      top: y0 + lineY - 30,
      bottom: y0 + lineY + 20,
    });
  }
  layout.anchors.sort((a, b) => a.beat - b.beat);
  return layout;
}
