import { describe, expect, it } from "vite-plus/test";
import type { Score } from "@repo/music-core";
import {
  READING_LEVELS,
  levelMeter,
  sightReadingScore,
  type Clef,
} from "@repo/music-core/content/reading";
import { rng } from "@repo/music-core/content/random";
import { REST_VALUES, readingLessons } from "@repo/music-core/lessons/reading";
import type { LessonFigure } from "@repo/music-core/lessons/types";
import { assignTab, bars, beatToMs, scoreGroups, whiteKeyLayout } from "./groups";
import { lineTicks, spell, staffRows } from "./engrave";
import { readout, type Target } from "./selection.svelte";

const score: Score = {
  id: "s",
  title: "S",
  bpm: 120,
  meter: { beats: 3, beatUnit: 4 },
  lengthBeats: 7,
  voices: [
    {
      id: "a",
      name: "A",
      hand: "right",
      notes: [
        { midi: 64, startBeat: 0, durationBeats: 2 },
        { midi: 64, startBeat: 2, durationBeats: 2, tieFrom: true },
        { midi: 67, startBeat: 4, durationBeats: 1 },
      ],
    },
    { id: "b", name: "B", hand: "left", notes: [{ midi: 48, startBeat: 0, durationBeats: 3 }] },
  ],
};

describe("groups", () => {
  it("groups by onset and folds ties into the attack", () => {
    const g = scoreGroups(score);
    expect(g.map((x) => x.startBeat)).toEqual([0, 4]);
    expect(g[0].notes.map((n) => [n.midi, n.voiceId, n.durationBeats])).toEqual([
      [48, "b", 3],
      [64, "a", 4],
    ]);
    expect(scoreGroups(score, ["b"]).length).toBe(1);
    expect(scoreGroups(score, null, { startBeat: 3, endBeat: 6 }).map((x) => x.startBeat)).toEqual([
      4,
    ]);
  });

  it("derives bars from meter and length, and beats to ms", () => {
    expect(bars(score)).toEqual([
      { number: 1, startBeat: 0, endBeat: 3 },
      { number: 2, startBeat: 3, endBeat: 6 },
      { number: 3, startBeat: 6, endBeat: 9 },
    ]);
    expect(bars({ meter: { beats: 6, beatUnit: 8 }, lengthBeats: 6 }).length).toBe(2);
    expect(beatToMs(2, 120)).toBe(1000);
  });

  it("assigns the lowest fret, keeps given positions, avoids string clashes, nulls the unplayable", () => {
    const guitar = { openStrings: [64, 59, 55, 50, 45, 40], fretCount: 22 };
    expect(
      assignTab(
        [
          { midi: 40, startBeat: 0 },
          { midi: 64, startBeat: 1, string: 2, fret: 5 },
          { midi: 30, startBeat: 2 },
          { midi: 64, startBeat: 3 },
          { midi: 64, startBeat: 3 },
        ],
        guitar,
      ),
    ).toEqual([
      { string: 6, fret: 0 },
      { string: 2, fret: 5 },
      null,
      { string: 1, fret: 0 },
      { string: 2, fret: 5 },
    ]);
  });

  it("lays keys out as fractions with black keys between whites", () => {
    const k = whiteKeyLayout(60, 71);
    expect(k[60]).toMatchObject({ x: 0, black: false });
    expect(k[71].x + k[71].width).toBeCloseTo(1);
    expect(k[61].black).toBe(true);
    expect(k[61].x + k[61].width / 2).toBeCloseTo(1 / 7);
    expect(Object.keys(whiteKeyLayout(61, 70)).map(Number)[0]).toBe(60);
  });
});

describe("engraving model", () => {
  it("fills every bar and ties notes across bar lines", () => {
    const [treble] = staffRows(score);
    const ticks = lineTicks(treble.notes, bars(score), scoreGroups(score));
    for (const bar of ticks) expect(bar.reduce((a, t) => a + t.dur, 0)).toBe(3);
    expect(ticks[0].map((t) => [t.vf, t.dots, t.tieNext])).toEqual([["h", 1, true]]);
    expect(ticks[1].map((t) => [t.vf, t.midis.length, t.attack])).toEqual([
      ["q", 1, false],
      ["q", 1, true],
      ["q", 0, false],
    ]);
    expect(ticks[2]).toEqual([expect.objectContaining({ vf: "h", dots: 1, midis: [] })]);
  });

  it("draws a forced grand staff split at middle C, with an empty staff when one side has no notes", () => {
    const one = (midis: number[]) => ({
      ...score,
      voices: [
        {
          id: "x",
          name: "X",
          notes: midis.map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
        },
      ],
    });
    expect(
      staffRows(one([64, 67]), null, true).map((r) => [r.clef, r.notes.map((n) => n.midi)]),
    ).toEqual([
      ["treble", [64, 67]],
      ["bass", []],
    ]);
    expect(staffRows(one([55, 64]), null, true).map((r) => r.notes.map((n) => n.midi))).toEqual([
      [64],
      [55],
    ]);
    expect(staffRows(one([64, 67])).map((r) => r.clef)).toEqual(["treble"]); // not forced: one staff
  });

  it("puts hands on their staves and spells for the key", () => {
    expect(staffRows(score).map((r) => r.clef)).toEqual(["treble", "bass"]);
    const loose = {
      ...score,
      voices: [
        {
          id: "x",
          name: "X",
          notes: [
            { midi: 40, startBeat: 0, durationBeats: 1 },
            { midi: 76, startBeat: 1, durationBeats: 1 },
          ],
        },
      ],
    };
    expect(staffRows(loose).map((r) => [r.clef, r.notes.length])).toEqual([
      ["treble", 1],
      ["bass", 1],
    ]);
    expect(spell(66, 1)).toBe("f#/4");
    expect(spell(70, -1)).toBe("bb/4");
    expect(spell(65, 6)).toBe("e#/4");
    expect(spell(65, 1)).toBe("f/4");
    expect(spell(61, -2)).toBe("db/4");
  });

  it("reads a range out in words", () => {
    const t = (bar: number): Target => ({
      bar,
      startBeat: (bar - 1) * 4,
      endBeat: bar * 4,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      label: "",
    });
    const list = [1, 2, 3, 4, 5, 6].map(t);
    expect(readout(list, { startBeat: 8, endBeat: 24 }, null, 96, "bar")).toBe(
      "Start, bar 3. End, bar 6. 4 bars, 10 s at 96 BPM",
    );
    expect(readout(list, null, list[2], 96, "bar")).toMatch(/^Start, bar 3\./);
  });
});

describe("bars with meter changes", () => {
  it("lays each bar out in its own meter", () => {
    const b = bars({
      meter: { beats: 4, beatUnit: 4 },
      lengthBeats: 11.5,
      meterChanges: [
        { startBeat: 0, beats: 4, beatUnit: 4 },
        { startBeat: 4, beats: 3, beatUnit: 4 },
        { startBeat: 7, beats: 5, beatUnit: 8 },
      ],
    });
    expect(
      b.map((x) => [x.number, x.startBeat, x.endBeat, `${x.meter?.beats}/${x.meter?.beatUnit}`]),
    ).toEqual([
      [1, 0, 4, "4/4"],
      [2, 4, 7, "3/4"],
      [3, 7, 9.5, "5/8"],
      [4, 9.5, 12, "5/8"],
    ]);
  });
});

describe("the rests card against the engraver", () => {
  /** The rest symbols the engraver draws for these staff rows, like "h." or "8". */
  const restsDrawn = (score: Score) => {
    const out = new Set<string>();
    for (const row of staffRows(score))
      for (const bar of lineTicks(row.notes, bars(score), scoreGroups(score)))
        for (const t of bar) if (!t.midis.length) out.add(t.vf + (t.dots ? "." : ""));
    return out;
  };
  /** A lesson staff figure as LessonView draws it: notes one after another, a bar as long as them. */
  const figureScore = (f: Extract<LessonFigure, { kind: "staff" }>): Score => {
    let at = 0;
    const notes = f.notes.flatMap((n) => {
      const out = n.midi === null ? [] : [{ midi: n.midi, startBeat: at, durationBeats: n.beats }];
      at += n.beats;
      return out;
    });
    return {
      id: "fig",
      title: "Fig",
      bpm: 60,
      meter: f.meter ?? { beats: at, beatUnit: 4 },
      voices: [{ id: "v", name: "Notes", clef: f.clef, notes }],
      lengthBeats: at,
    };
  };
  const card = readingLessons("sight-reading", "treble", { level: "piano-9", piano: true }).find(
    (l) => l.id === "reading.values.rests",
  )!;
  const shown = new Set<string>();
  const steps = card.screens.flatMap((s) => s.steps ?? []);
  steps.forEach((step, i) => {
    const drawn = restsDrawn(figureScore(step.figure as Extract<LessonFigure, { kind: "staff" }>));
    // Each step draws one rest, the one its text names.
    expect([...drawn], step.text).toHaveLength(1);
    expect(step.text).toContain(`${REST_VALUES.flat()[i].name} rest`);
    for (const r of drawn) shown.add(r);
  });

  it("shows every rest the engraver can draw", () => {
    expect([...shown].sort()).toEqual(["16", "16.", "32", "8", "8.", "h", "h.", "q", "q.", "w"]);
  });

  it("every rest drawn in a generated phrase is on the card, and the card shows whenever a phrase can rest", () => {
    const meters = [
      "simple",
      "3/4",
      "2/4",
      "compound",
      "3/8",
      "9/8",
      "2/2",
      "5/4",
      "7/8",
      "5/8",
      "changing",
    ];
    for (const level of READING_LEVELS)
      for (const meter of meters) {
        if (levelMeter(level.id, meter) !== meter) continue;
        const variants =
          level.reader === "piano" ? [["treble", "bass"], ["treble"], ["bass"]] : [["treble"]];
        for (const clefs of variants)
          for (const measures of [1, 4, 8]) {
            const piano = level.reader === "piano";
            const grand = clefs.length > 1;
            const listed = readingLessons("sight-reading", grand ? "both" : (clefs[0] as Clef), {
              level: level.id,
              meter,
              measures,
              piano,
              grand,
            }).some((l) => l.id === "reading.values.rests");
            let rested = false;
            for (let seed = 1; seed <= 60; seed++) {
              const score = sightReadingScore(rng(seed), {
                level: level.id,
                instrument: piano ? "piano" : "guitar",
                clefs: clefs as Clef[],
                measures,
                meter,
                bpm: 90,
              });
              const drawn = restsDrawn(score);
              const label = `${level.id} ${meter} ${clefs.join("+")} ${measures} bars`;
              for (const r of drawn) expect(shown.has(r), `${label} drew a ${r} rest`).toBe(true);
              if (drawn.size) expect(listed, `${label} drew a rest without the card`).toBe(true);
              rested ||= drawn.size > 0;
            }
            if (listed)
              expect(rested, `${level.id} ${meter} ${clefs} ${measures}: card, no rest`).toBe(true);
          }
      }
  });
});
