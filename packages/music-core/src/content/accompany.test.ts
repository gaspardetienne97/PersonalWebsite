import { describe, expect, it } from "vitest";
import type { NoteEvent } from "../types";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import { PROGRESSIONS } from "./jam";
import { gradeAccompaniment } from "../scoring/piano";
import {
  ACCOMP_PATTERNS,
  ACCOMP_PROGRESSIONS,
  CHART_LEVELS,
  chartProgression,
  jazzLeadSheet,
  COMP_RHYTHMS,
  COMP_VOICINGS,
  LEAD_LEFT,
  LEAD_SHEETS,
  chartOf,
  compingRendering,
  generatedLeadSheet,
  leadSheetFromScore,
  leadSheetRendering,
  patternRendering,
  wholeBars,
  type Rendering,
} from "./accompany";

const PLAIN = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 3.5, 4];
const prog = (id: string) => ACCOMP_PROGRESSIONS.find((p) => p.id === id)!;

/** Hands sit either side of the split, inside the keyboard, on plain values. */
function sane(r: Rendering, label: string) {
  expect(r.slots.length, label).toBeGreaterThan(0);
  for (const s of r.slots) {
    for (const m of s.midi) {
      expect(m, label).toBeGreaterThanOrEqual(24);
      expect(m, label).toBeLessThanOrEqual(96);
      expect(m < r.splitMidi, `${label} ${s.hand} ${m} split ${r.splitMidi}`).toBe(
        s.hand === "left",
      );
    }
    expect(PLAIN, `${label} dur ${s.dur}`).toContain(s.dur);
    expect((s.beat * 2) % 1, label).toBe(0);
    expect(s.beat + s.dur, label).toBeLessThanOrEqual(r.beats);
  }
}

/** Pitch classes of the chord sounding at a beat. */
const chordAt = (r: Rendering, beat: number) => {
  const c = r.chart.find((x) => beat >= x.startBeat && beat < x.startBeat + x.durationBeats)!;
  return parseChordSymbol(c.symbol)!;
};

describe("accompaniment patterns", () => {
  it("render every pattern over every progression in every key, hands apart", () => {
    for (const p of ACCOMP_PROGRESSIONS.filter(wholeBars))
      for (const t of [0, 5, -6])
        for (const pattern of ACCOMP_PATTERNS)
          sane(patternRendering(chartOf(p, t), pattern.id), `${pattern.id} ${p.id} ${t}`);
  });

  it("plays at least eight bars, looping a four-bar progression", () => {
    expect(patternRendering(chartOf(prog("pop-axis")), "block-1").beats).toBe(32);
    expect(patternRendering(chartOf(prog("blues")), "block-1").beats).toBe(48);
  });

  it("keeps every block chord inside its chord, any inversion", () => {
    for (const p of ACCOMP_PROGRESSIONS.filter(wholeBars)) {
      const r = patternRendering(chartOf(p, 3), "block-1-3");
      for (const s of r.slots) {
        const c = chordAt(r, s.beat);
        expect(
          s.midi.every((m) => c.pcs.includes(pc(m))),
          `${p.id} ${s.beat}`,
        ).toBe(true);
      }
    }
  });

  it("walks root, fifth, octave in C", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "root-fifth-octave");
    expect(r.slots.filter((s) => s.hand === "left" && s.beat < 4).map((s) => s.midi[0])).toEqual([
      36, 43, 48, 43,
    ]);
  });

  it("walks the boogie line up the chord and back, swung, chords on 2 and 4", () => {
    const r = patternRendering(chartOf(prog("blues")), "boogie");
    expect(r.swing).toBe(true);
    const bar = r.slots.filter((s) => s.beat < 4);
    expect(bar.filter((s) => s.hand === "left").map((s) => s.midi[0])).toEqual([
      36, 40, 43, 45, 46, 45, 43, 40,
    ]);
    expect(bar.filter((s) => s.hand === "right").map((s) => s.beat)).toEqual([1, 3]);
  });

  it("pushes the next chord on the and of 4", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "half-time-push");
    const push = r.slots.find((s) => s.hand === "right" && s.beat === 3.5)!;
    expect(push.midi.map(pc).sort((a, b) => a - b)).toEqual(parseChordSymbol("G")!.pcs);
  });

  it("plays stride-lite in the left hand only, the chord on 2 and 4", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "stride-lite");
    expect(r.slots.every((s) => s.hand === "left")).toBe(true);
    expect(r.slots.filter((s) => s.beat < 4).map((s) => s.midi.length)).toEqual([1, 3, 1, 3]);
  });

  it("keeps one hand when asked", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "pop-syncopation", "left");
    expect(r.slots.every((s) => s.hand === "left")).toBe(true);
  });
});

describe("comping over a progression", () => {
  it("renders every voicing on every rhythm over every progression", () => {
    for (const p of ACCOMP_PROGRESSIONS)
      for (const v of COMP_VOICINGS)
        for (const rh of COMP_RHYTHMS)
          sane(compingRendering(chartOf(p, 2), v.id, rh.id), `${v.id} ${rh.id} ${p.id}`);
  });

  it("plays 1-3-7 and 1-7-3 shells on the blues", () => {
    const a = compingRendering(chartOf(prog("blues")), "shell-137", "whole");
    expect(a.slots[0].midi).toEqual([48, 52, 58]);
    const b = compingRendering(chartOf(prog("blues")), "shell-173", "whole");
    expect(b.slots[0].midi).toEqual([48, 58, 64]);
  });

  it("alternates shells so the upper notes move least through ii-V-I", () => {
    const r = compingRendering(chartOf(prog("ii-v-i")), "shells", "whole");
    const firsts = [0, 8, 16].map((b) => r.slots.find((s) => s.beat === b)!.midi);
    // Dm7 1-3-7, G7 1-7-3 (B over F stays close), Cmaj7 1-3-7.
    expect(firsts.map((m) => m[1] - m[0] < 5)).toEqual([true, false, true]);
  });

  it("leaves the root out of rootless voicings and keeps it in the left hand for two hands", () => {
    const r = compingRendering(chartOf(prog("ii-v-i")), "rootless", "charleston");
    for (const s of r.slots) expect(s.midi.map(pc)).not.toContain(chordAt(r, s.beat).rootPc);
    const two = compingRendering(chartOf(prog("ii-v-i")), "root-rootless", "halves");
    const bar = two.slots.filter((s) => s.beat === 0);
    expect(bar.map((s) => s.hand)).toEqual(["left", "right"]);
    expect(bar[0].midi.map(pc)).toEqual([2]);
  });

  it("voices a plain dominant 3-13-7-9 or 7-9-3-13", () => {
    const r = compingRendering(chartOf(prog("blues")), "rootless", "whole");
    const shape = r.slots[0].midi.map(pc);
    expect(
      [
        [4, 9, 10, 2],
        [10, 2, 4, 9],
      ].map((x) => x.join()),
    ).toContain(shape.join());
  });

  it("comps each chord of a half-bar progression on the hit that lands in it", () => {
    const r = compingRendering(chartOf(prog("bird-blues")), "shells", "halves");
    // Bar 2: Em7b5 on 1, A7 on 3.
    const bar2 = r.slots.filter((s) => s.beat >= 4 && s.beat < 8).map((s) => s.midi[0] % 12);
    expect(bar2).toEqual([4, 9]);
    const push = compingRendering(chartOf(prog("rhythm-changes")), "shells", "garland");
    // The and-of-4 push in bar 1 sounds bar 2's Cm7.
    expect(push.slots.find((s) => s.beat === 3.5)!.midi[0] % 12).toBe(0);
  });

  it("keeps the line hand free under rootless stabs (everything is the left hand's)", () => {
    const r = compingRendering(chartOf(prog("blues")), "rootless", "stabs");
    expect(r.splitMidi).toBe(128);
    expect(r.slots.filter((s) => s.beat < 4).map((s) => s.beat)).toEqual([1.5, 3]);
  });

  it("swings unless the rhythm is a bossa", () => {
    expect(compingRendering(chartOf(prog("blues")), "shells", "charleston").swing).toBe(true);
    expect(compingRendering(chartOf(prog("blues")), "shells", "bossa").swing).toBe(false);
    expect(compingRendering(chartOf(prog("blues")), "shells", "charleston", false).swing).toBe(
      false,
    );
  });
});

describe("lead sheets", () => {
  it("authored sheets: the melody fills the chart, every chord reads", () => {
    for (const s of LEAD_SHEETS) {
      const end = s.melody.at(-1)!.startBeat + s.melody.at(-1)!.durationBeats;
      const chartEnd = s.chart.at(-1)!.startBeat + s.chart.at(-1)!.durationBeats;
      expect(end, s.id).toBe(chartEnd);
      expect(end % 4, s.id).toBe(0);
      for (const c of s.chart) expect(parseChordSymbol(c.symbol), c.symbol).not.toBeNull();
      // Strong beats land on a chord tone (Ode's bar 4 E over G is the one appoggiatura).
      const off = s.melody.filter(
        (n) =>
          n.startBeat % 4 === 0 && !chordAtSheet(s.chart, n.startBeat).pcs.includes(pc(n.midi)),
      );
      expect(off.length, s.id).toBeLessThanOrEqual(1);
    }
  });

  it("renders each left hand in every key with the melody above it", () => {
    for (const s of LEAD_SHEETS)
      for (const l of LEAD_LEFT)
        for (const t of [0, 7, -5]) {
          const r = leadSheetRendering(s, l.id, t);
          sane(r, `${s.id} ${l.id} ${t}`);
          expect(
            Math.min(...r.slots.filter((x) => x.hand === "right").flatMap((x) => x.midi)),
          ).toBeGreaterThanOrEqual(48);
        }
  });

  it("puts the chord under the melody note on each change", () => {
    const r = leadSheetRendering(LEAD_SHEETS[0], "chords");
    const first = r.slots.find((s) => s.hand === "right" && s.beat === 0)!;
    expect(first.midi.at(-1)).toBe(60);
    expect(new Set(first.midi.map(pc))).toEqual(new Set([0, 4, 7]));
    expect(first.midi.every((m) => m <= 60 && m > 48)).toBe(true);
  });

  it("generates the same melody from the same seed, chord tones on 1 and 3", () => {
    const p = prog("pop-axis");
    const a = generatedLeadSheet(p, 0, 7);
    expect(generatedLeadSheet(p, 0, 7).melody).toEqual(a.melody);
    expect(generatedLeadSheet(p, 0, 8).melody).not.toEqual(a.melody);
    for (const n of a.melody) {
      expect(n.midi).toBeGreaterThanOrEqual(60);
      expect(n.midi).toBeLessThanOrEqual(79);
      if (n.startBeat % 2 === 0)
        expect(chordAtSheet(a.chart, n.startBeat).pcs).toContain(pc(n.midi));
    }
    const leaps = a.melody.slice(1).map((n, i) => Math.abs(n.midi - a.melody[i].midi));
    expect(Math.max(...leaps)).toBeLessThanOrEqual(5);
    const last = a.melody.at(-1)!;
    expect(pc(last.midi)).toBe(chordAtSheet(a.chart, last.startBeat).rootPc);
  });

  it("reads a library score's top line and chords, or nothing without chords", () => {
    const score = {
      id: "s",
      title: "S",
      bpm: 90,
      meter: { beats: 4, beatUnit: 4 },
      lengthBeats: 4,
      voices: [
        {
          id: "1",
          name: "RH",
          hand: "right" as const,
          notes: [
            { midi: 64, startBeat: 0, durationBeats: 2 },
            { midi: 60, startBeat: 0, durationBeats: 2 },
            { midi: 67, startBeat: 2, durationBeats: 2 },
          ],
        },
        {
          id: "2",
          name: "LH",
          hand: "left" as const,
          notes: [{ midi: 48, startBeat: 0, durationBeats: 4 }],
        },
      ],
    };
    expect(leadSheetFromScore(score)).toBeNull();
    const s = leadSheetFromScore({
      ...score,
      chords: [{ symbol: "C", startBeat: 0, durationBeats: 4 }],
    })!;
    expect(s.melody.map((n) => n.midi)).toEqual([64, 67]);
    expect(s.chart).toHaveLength(1);
  });
});

const chordAtSheet = (
  chart: { symbol: string; startBeat: number; durationBeats: number }[],
  beat: number,
) =>
  parseChordSymbol(
    chart.find((c) => beat >= c.startBeat && beat < c.startBeat + c.durationBeats)!.symbol,
  )!;

describe("gradeAccompaniment", () => {
  const beatMs = 500;
  const startAt = 1000;
  /** Play a rendering's slots: each slot's notes 5 ms apart, at `shift` ms off the beat. */
  const play = (
    r: Rendering,
    opts: {
      shift?: number;
      skip?: (i: number) => boolean;
      map?: (m: number) => number;
      source?: NoteEvent["source"];
    } = {},
  ): NoteEvent[] =>
    r.slots.flatMap((s, i) =>
      opts.skip?.(i)
        ? []
        : s.midi.map((m, k) => ({
            kind: "noteon" as const,
            midi: opts.map ? opts.map(m) : m,
            velocity: 0.7,
            confidence: 1,
            at: startAt + s.beat * beatMs + (opts.shift ?? 0) + k * 5,
            source: opts.source ?? ("midi" as const),
          })),
    );
  const grade = (r: Rendering, notes: NoteEvent[]) =>
    gradeAccompaniment({
      slots: r.slots,
      splitMidi: r.splitMidi,
      swing: r.swing,
      beatMs,
      startAt,
      notes,
    });

  it("passes a clean run and fails silence", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "root-fifth-octave");
    const g = grade(r, play(r));
    expect(g.correct).toBe(true);
    expect(g.score).toBeCloseTo(1, 2);
    expect(g.hands.map((h) => h.matched === h.total)).toEqual([true, true]);
    expect(g.weakBar).toBeNull();
    expect(grade(r, []).score).toBe(0);
  });

  it("takes any inversion or octave of a chord, refuses the wrong chord", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "block-1");
    expect(grade(r, play(r, { map: (m) => (m >= r.splitMidi ? m + 12 : m) })).correct).toBe(true);
    const wrong = grade(r, play(r, { map: (m) => (m >= r.splitMidi ? m + 1 : m) }));
    expect(wrong.hands.find((h) => h.hand === "right")!.matched).toBe(0);
    expect(wrong.correct).toBe(false);
  });

  it("names the bar with the most misses", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "root-fifth-octave");
    const g = grade(r, play(r, { skip: (i) => r.slots[i].beat >= 8 && r.slots[i].beat < 12 }));
    expect(g.weakBar).toBe(2);
    expect(g.correct).toBe(false);
  });

  it("scores timing: a late run loses credit but still lands", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "block-1-3");
    const late = grade(r, play(r, { shift: 40 }));
    expect(late.completion).toBe(1);
    expect(late.score).toBeLessThan(1);
    expect(late.meanAbsErrorMs).toBeGreaterThan(35);
  });

  it("lets a swung off-beat land late with no error", () => {
    const r = patternRendering(chartOf(prog("blues")), "boogie");
    const swung = play(r).map((n) => {
      const beat = (n.at - startAt) / beatMs;
      return Math.abs((beat % 1) - 0.5) < 0.02 ? { ...n, at: n.at + beatMs / 6 } : n;
    });
    const g = grade(r, swung);
    expect(g.correct).toBe(true);
    expect(g.meanAbsErrorMs).toBeLessThan(10);
  });

  it("does not measure chords from on-screen keys", () => {
    const r = patternRendering(chartOf(prog("pop-axis")), "root-fifth-octave");
    const g = grade(
      r,
      play(r, { source: "onscreen" }).filter((n) => n.midi < r.splitMidi),
    );
    expect(g.notMeasured).toEqual(["chords"]);
    expect(g.correct).toBe(true);
  });
});

describe("generated charts and jazz lead sheets", () => {
  it("writes eight-bar charts at each level, the same from the same seed, every symbol readable", () => {
    let halves = 0;
    let colours = 0;
    for (const level of CHART_LEVELS)
      for (let seed = 1; seed <= 12; seed++) {
        const p = chartProgression(level.id, seed);
        expect(p.id).toBe(level.id);
        expect(chartProgression(level.id, seed)).toEqual(p);
        expect(p.chords.reduce((a, c) => a + c.bars, 0)).toBe(8);
        expect(p.chords[0].symbol).toMatch(/^C/);
        expect(p.chords.at(-1)!.symbol).toBe("C");
        for (const c of p.chords) expect(parseChordSymbol(c.symbol), c.symbol).toBeTruthy();
        if (level.id === "chart-1") expect(wholeBars(p)).toBe(true);
        halves += p.chords.filter((c) => c.bars === 0.5).length;
        if (level.id === "chart-3")
          colours += p.chords.filter((c) => /sus|add9|\//.test(c.symbol)).length;
        for (const pattern of ACCOMP_PATTERNS)
          sane(
            patternRendering(chartOf(p, seed % 12), pattern.id),
            `${level.id} ${seed} ${pattern.id}`,
          );
      }
    expect(halves).toBeGreaterThan(10);
    expect(colours).toBeGreaterThan(20);
  });

  it("plays both chords of a split bar: block chords re-strike on beat 3 with the second", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = patternRendering(chartOf(chartProgression("chart-2", seed)), "block-1");
      for (const c of r.chart.filter((x) => x.durationBeats === 2)) {
        const struck = r.slots.filter((s) => s.beat === c.startBeat);
        expect(struck.map((s) => s.hand).sort(), `${seed} ${c.symbol}`).toEqual(["left", "right"]);
        const chord = parseChordSymbol(c.symbol)!;
        const pcs = [...chord.pcs, ...(chord.bassPc === undefined ? [] : [chord.bassPc])];
        for (const s of struck) expect(s.midi.every((m) => pcs.includes(pc(m)))).toBe(true);
      }
    }
  });

  it("writes jazz heads swung over a ii-V-I: lead-2 anticipates the next chord over the bar line", () => {
    const p = prog("ii-v-i");
    let anticipations = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const one = jazzLeadSheet("lead-1", p, 0, seed);
      const two = jazzLeadSheet("lead-2", p, 0, seed);
      expect(jazzLeadSheet("lead-2", p, 0, seed)).toEqual(two);
      for (const sheet of [one, two]) {
        let t = 0;
        for (const n of sheet.melody) {
          expect(n.startBeat).toBeCloseTo(t);
          t = n.startBeat + n.durationBeats;
        }
      }
      for (const n of two.melody) {
        if (n.startBeat % 4 !== 3.5 || n.durationBeats <= 0.5) continue;
        anticipations++;
        expect(chordAtSheet(two.chart, n.startBeat + 0.5).pcs).toContain(pc(n.midi));
      }
      for (const left of ["roots", "shells", "rootless"] as const)
        sane(leadSheetRendering(two, left, 0), `lead-2 ${seed} ${left}`);
    }
    expect(anticipations).toBeGreaterThan(5);
  });

  it("voices a rootless left hand below the melody, without the root", () => {
    const sheet = jazzLeadSheet("lead-1", prog("ii-v-i"), 5, 3);
    const r = leadSheetRendering(sheet, "rootless", 0);
    const left = r.slots.filter((s) => s.hand === "left");
    const melodyLow = Math.min(...r.slots.filter((s) => s.hand === "right").flatMap((s) => s.midi));
    expect(left.every((s) => s.midi.length === 4 && Math.min(...s.midi) >= 47)).toBe(true);
    expect(left.every((s) => Math.max(...s.midi) < melodyLow)).toBe(true);
    for (const s of left) {
      const chord = chordAt(r, s.beat);
      expect(s.midi.map(pc)).not.toContain(chord.rootPc);
    }
  });
});

describe("comping the tune player's standards", () => {
  it("voices every tune with every voicing", async () => {
    const { TUNES } = await import("./tunes");
    const { barBeats } = await import("./jam");
    for (const t of TUNES)
      for (const v of COMP_VOICINGS) {
        const r = compingRendering(chartOf(t), v.id, "whole", true, barBeats(t));
        expect(r.slots.length, `${t.id} ${v.id}`).toBeGreaterThan(0);
        expect(
          r.slots.every((s) => s.midi.every(Number.isFinite)),
          `${t.id} ${v.id}`,
        ).toBe(true);
      }
  });

  it("comps a waltz on 1 and the and of 2, three beats a bar", () => {
    const waltz = { ...PROGRESSIONS.find((p) => p.id === "ii-v-i")!, beatsPerBar: 3 };
    const chart = chartOf(waltz, 0, 2);
    expect(chart[1].startBeat).toBe(6); // Dm7 for two 3/4 bars
    const r = compingRendering(chart, "rootless", "waltz", true, 3);
    expect([...new Set(r.slots.map((s) => s.beat))].slice(0, 4)).toEqual([0, 1.5, 3, 4.5]);
    // A 4/4 rhythm asked for in 3/4 falls back to a waltz rhythm.
    expect(compingRendering(chart, "rootless", "charleston", true, 3).slots[1].beat).toBe(1.5);
    expect(r.beats).toBe(48); // twice through 8 bars of 3
  });

  it("plays hard-bop hits with left-hand octave stabs", () => {
    const blues = PROGRESSIONS.find((p) => p.id === "blues")!;
    const r = compingRendering(chartOf(blues), "octave-stabs", "hard-bop");
    const left = r.slots.filter((s) => s.hand === "left");
    expect(left[0].midi[1] - left[0].midi[0]).toBe(12);
    expect(left.every((s) => s.dur <= 0.5)).toBe(true);
    // The and of 4 in bar 4 pushes bar 5's F7: F in the left hand.
    const push = left.find((s) => s.beat === 15.5)!;
    expect(push.midi[0] % 12).toBe(5);
  });
});
