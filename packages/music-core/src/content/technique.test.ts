import { describe, expect, it } from "vite-plus/test";
import { CHORD_SHAPES } from "../data";
import { tuningById } from "../theory/fretboard";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import { rng } from "./random";
import { scaleFingerMap } from "./piano-fingering";
import {
  baseOffset,
  chordChangePairs,
  chordPerfectTargets,
  HANDS_TOGETHER_PRESET,
  intervalRecallPrompt,
  noteFinderPrompt,
  POSITION_PATTERNS,
  positionRootFretMax,
  positionRootFretMin,
  positionTargets,
  RECALL_REGIONS,
  scaleDrillTargets,
  scaleSetupKey,
  gradeSpeed,
  LEGATO_PATTERNS,
  legatoTargets,
  legatoText,
  FINGERPICK_PATTERNS,
  FINGERPICK_SONGS,
  fingerpickable,
  fingerpickTargets,
  harmonicTargets,
  positionPatternsFor,
  GUITAR_GRADE_TEMPOS,
  ABRSM_SPEEDS,
  scaleSkills,
  shapePcs,
  SPIDER_PATTERNS,
  spiderMaxStartFret,
  spiderStrings,
  spiderTargets,
} from "./technique";

const std = tuningById("guitar.standard")!;
const uke = tuningById("ukulele.high-g")!;

describe("scale drill", () => {
  it("expects one step per note, both hands doubled an octave apart", () => {
    const steps = scaleDrillTargets({
      kind: "major",
      tonic: 60,
      span: "one-octave",
      motion: "up",
      hands: "both",
      bpm: 80,
    });
    expect(steps).toHaveLength(8);
    expect(steps[0].notes).toEqual([
      { midi: 48, hand: "left" },
      { midi: 60, hand: "right" },
    ]);
    expect(steps.map((s) => s.atBeat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const left = scaleDrillTargets({
      kind: "major",
      tonic: 60,
      span: "pentascale",
      motion: "up",
      hands: "left",
      bpm: 80,
    });
    expect(left.map((s) => s.notes[0])).toEqual(
      [48, 50, 52, 53, 55].map((midi) => ({ midi, hand: "left" })),
    );
    expect(HANDS_TOGETHER_PRESET).toMatchObject({
      span: "one-octave",
      hands: "both",
      bpm: 80,
      minEvenness: 0.85,
    });
    expect(scaleSkills("major")).toEqual(["technique.scales", "technique.scale.major"]);
    expect(scaleSkills("dorian")).toEqual(["technique.scales"]);
  });
});

describe("arpeggios and chords through their inversions", () => {
  const base = {
    kind: "major" as const,
    tonic: 60,
    motion: "up" as const,
    hands: "right" as const,
    bpm: 60,
  };
  it("arpeggiates, breaks and blocks the tonic chord", () => {
    const arp = scaleDrillTargets({ ...base, pattern: "arpeggio", span: "two-octave" });
    expect(arp.map((s) => s.notes[0].midi)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    // Broken: each inversion's notes in turn, ending on the root position an octave up.
    const broken = scaleDrillTargets({
      ...base,
      pattern: "broken",
      span: "one-octave",
      chord: "minor",
    });
    expect(broken.map((s) => s.notes[0].midi)).toEqual([
      60, 63, 67, 63, 67, 72, 67, 72, 75, 72, 75, 79,
    ]);
    const blocked = scaleDrillTargets({
      ...base,
      pattern: "blocked",
      span: "one-octave",
      motion: "up-down",
    });
    expect(blocked.map((s) => s.notes.map((n) => n.midi))).toEqual([
      [60, 64, 67],
      [64, 67, 72],
      [67, 72, 76],
      [72, 76, 79],
      [67, 72, 76],
      [64, 67, 72],
      [60, 64, 67],
    ]);
    // A seventh chord has four inversions; both hands double it an octave down.
    const dom = scaleDrillTargets({
      ...base,
      pattern: "blocked",
      span: "one-octave",
      chord: "dominant-7",
      hands: "both",
    });
    expect(dom).toHaveLength(5);
    expect(dom[0].notes.filter((n) => n.hand === "left").map((n) => n.midi)).toEqual([
      48, 52, 55, 58,
    ]);
  });

  it("puts two or four notes to a click at the ABRSM grade speeds", () => {
    const fast = scaleDrillTargets({ ...base, span: "one-octave", perBeat: 2 });
    expect(fast.map((s) => s.atBeat).slice(0, 4)).toEqual([0, 0.5, 1, 1.5]);
    expect(gradeSpeed("Grade 1", "scale")).toEqual([60, 2]);
    expect(gradeSpeed("Grade 5", "arpeggio")).toEqual([44, 4]);
    expect(gradeSpeed("Grade 5", "blocked")).toBeUndefined();
    expect(ABRSM_SPEEDS).toHaveLength(9);
    // Old scale ladders keep their keys; the new patterns get their own.
    expect(scaleSetupKey({ ...base, span: "one-octave" })).toBe("major|60|up|one-octave|right");
    expect(
      scaleSetupKey({ ...base, span: "one-octave", pattern: "arpeggio", chord: "minor" }),
    ).toBe("arpeggio|minor|60|up|one-octave|right|1");
    expect(scaleSkills("major", "arpeggio")).toEqual(["technique.arpeggios"]);
  });
});

describe("spider", () => {
  it("has the 4 classic patterns then all 24 finger orders", () => {
    expect(SPIDER_PATTERNS).toHaveLength(24);
    expect(SPIDER_PATTERNS.slice(0, 4).map((p) => p.fretOffsets.join(""))).toEqual([
      "0123",
      "3210",
      "0213",
      "0312",
    ]);
    expect(new Set(SPIDER_PATTERNS.map((p) => p.fretOffsets.join(""))).size).toBe(24);
    expect(spiderMaxStartFret(std)).toBe(9);
    expect(spiderMaxStartFret({ ...uke, fretCount: 10 })).toBe(7);
  });

  it("walks each string of the span in turn", () => {
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "single",
      startFret: 5,
      crossing: false,
    });
    expect(t).toEqual(
      [5, 6, 7, 8].map((fret, i) => ({ string: 6, fret, midi: 40 + fret, finger: i + 1 })),
    );
    const all = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "all",
      startFret: 5,
      crossing: false,
    });
    expect(all).toHaveLength(24);
    expect(all.at(-1)).toMatchObject({ string: 1, fret: 8 });
  });

  it("lands each step on the next string when crossing, one pass per string", () => {
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "adjacent-2",
      startFret: 5,
      crossing: true,
    });
    expect(t.map((n) => `${n.string}/${n.fret}`)).toEqual([
      "6/5",
      "5/6",
      "6/7",
      "5/8",
      "5/5",
      "6/6",
      "5/7",
      "6/8",
    ]);
  });

  it("clamps the start fret and marks open strings with finger 0", () => {
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 1,
      span: "single",
      startFret: 0,
      crossing: false,
    });
    expect(t[0]).toEqual({ string: 1, fret: 0, midi: 64, finger: 0 });
    // From the nut, frets 1 to 3 take fingers 1 to 3.
    expect(t.map((n) => n.finger)).toEqual([0, 1, 2, 3]);
    expect(
      spiderTargets({
        patternId: "ascending-1234",
        tuning: std,
        string: 1,
        span: "single",
        startFret: 15,
        crossing: false,
      })[0].fret,
    ).toBe(9);
  });
});

describe("spider spans", () => {
  it("keeps a span's size by moving it toward the bass, and 'all' is every string", () => {
    expect(spiderStrings(1, "adjacent-3", 6)).toEqual([3, 2, 1]);
    // Any strings, bass first: 1, 3 and 6 play as 6, 3, 1.
    const picked = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 1,
      span: "single",
      strings: [1, 6, 3],
      startFret: 5,
      crossing: false,
    });
    expect([...new Set(picked.map((t) => t.string))]).toEqual([6, 3, 1]);
    expect(picked).toHaveLength(12);
    expect(spiderStrings(5, "adjacent-2", 6)).toEqual([5, 4]);
    expect(spiderStrings(3, "all", 6)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(spiderStrings(4, "all", 4)).toEqual([4, 3, 2, 1]);
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 1,
      span: "adjacent-3",
      startFret: 5,
      crossing: false,
    });
    expect(new Set(t.map((n) => n.string))).toEqual(new Set([3, 2, 1]));
  });

  it("ignores crossing on a single string", () => {
    const opts = {
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "single" as const,
      startFret: 5,
    };
    expect(spiderTargets({ ...opts, crossing: true })).toEqual(
      spiderTargets({ ...opts, crossing: false }),
    );
  });
});

describe("positions", () => {
  it("has 5 boxes and 5 CAGED shapes with their base offsets", () => {
    expect(POSITION_PATTERNS.slice(0, 10).map((p) => `${p.id}:${baseOffset(p)}`)).toEqual([
      "minor-pentatonic-box-1:0",
      "minor-pentatonic-box-2:2",
      "minor-pentatonic-box-3:4",
      "minor-pentatonic-box-4:7",
      "minor-pentatonic-box-5:9",
      "caged-major-e-shape:0",
      "caged-major-d-shape:2",
      "caged-major-c-shape:4",
      "caged-major-a-shape:7",
      "caged-major-g-shape:9",
    ]);
  });

  it("arpeggiates low to high and stays in the scale or chord", () => {
    const box1 = positionTargets({ patternId: "minor-pentatonic-box-1", tuning: std, rootFret: 5 });
    expect(box1).toHaveLength(12);
    expect(box1[0]).toEqual({ string: 6, fret: 5, midi: 45, finger: 1 });
    expect(box1.map((n) => n.midi)).toEqual(box1.map((n) => n.midi).sort((a, b) => a - b));
    for (const p of POSITION_PATTERNS.filter(
      (x) => x.family === "minor-pentatonic" && !x.instrument,
    ))
      for (const n of positionTargets({ patternId: p.id, tuning: std, rootFret: 5 }))
        expect([9, 0, 2, 4, 7]).toContain(pc(n.midi));
    for (const p of POSITION_PATTERNS.filter((x) => x.family === "caged-major"))
      for (const n of positionTargets({ patternId: p.id, tuning: std, rootFret: 3 }))
        expect([7, 11, 2], p.id).toContain(pc(n.midi));
  });
});

describe("connected boxes and triads", () => {
  it("joins the five boxes up the neck in A, frets 5 to 17, in the pentatonic", () => {
    const run = positionTargets({
      patternId: "minor-pentatonic-connected",
      tuning: std,
      rootFret: 5,
    });
    expect(run).toHaveLength(60);
    expect(run[0]).toMatchObject({ string: 6, fret: 5, finger: 1 });
    // Box 1 ends high, box 2 starts high and walks down.
    expect(run.slice(11, 13).map((t) => `${t.string}:${t.fret}`)).toEqual(["1:8", "1:10"]);
    expect(Math.max(...run.map((t) => t.fret))).toBe(17);
    for (const t of run) {
      expect([9, 0, 2, 4, 7]).toContain(pc(t.midi));
      expect(t.finger).toBeGreaterThanOrEqual(1);
      expect(t.finger).toBeLessThanOrEqual(4);
    }
  });

  it("plays every inversion of each triad on its three strings, in order up the neck", () => {
    const tones = { major: [9, 1, 4], minor: [9, 0, 4] };
    for (const p of POSITION_PATTERNS.filter((x) => x.family === "triads")) {
      const line = positionTargets({ patternId: p.id, tuning: std, rootFret: 5 });
      expect(line, p.id).toHaveLength(9);
      const want = p.id.includes("major") ? tones.major : tones.minor;
      const strings = p.id.endsWith("1-3") ? [3, 2, 1] : [4, 3, 2];
      for (let k = 0; k < 3; k++) {
        const chord = line.slice(k * 3, k * 3 + 3);
        expect(
          chord.map((t) => t.string),
          p.id,
        ).toEqual(strings);
        expect(chord.map((t) => pc(t.midi)).sort(), `${p.id} inversion ${k}`).toEqual(
          [...want].sort(),
        );
      }
      // Three different lowest notes: root position and both inversions.
      expect(new Set([0, 3, 6].map((i) => pc(line[i].midi))).size, p.id).toBe(3);
      // Each inversion sits higher on the neck than the one before.
      const lows = [0, 3, 6].map((i) => Math.min(...line.slice(i, i + 3).map((t) => t.fret)));
      expect(lows, p.id).toEqual([...lows].sort((a, b) => a - b));
    }
  });
});

describe("note finder and interval recall", () => {
  it("names a note found somewhere in the region", () => {
    for (let s = 1; s < 50; s++) {
      const p = noteFinderPrompt(rng(s), {
        tuning: std,
        region: { start: 0, end: 5 },
        strings: [1, 2, 3],
      });
      expect(p.answers.length).toBeGreaterThan(0);
      for (const a of p.answers) {
        expect([1, 2, 3]).toContain(a.string);
        expect(a.fret).toBeLessThanOrEqual(5);
        expect(pc(std.openStrings[a.string - 1] + a.fret)).toBe(p.pc);
      }
    }
  });

  it("finds the ascending interval inside the 5-fret window", () => {
    expect(RECALL_REGIONS).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ]);
    for (const semitones of [3, 4, 7, 12])
      for (let region = 0; region < 3; region++) {
        const p = intervalRecallPrompt(rng(semitones * 10 + region), {
          tuning: std,
          region,
          semitones,
        });
        expect(p.targetMidi).toBe(p.anchor.midi + semitones);
        expect(p.answers.length).toBeGreaterThan(0);
        for (const a of p.answers) {
          expect(a.fret).toBeGreaterThanOrEqual(RECALL_REGIONS[region].start);
          expect(a.fret).toBeLessThanOrEqual(RECALL_REGIONS[region].end);
          expect(std.openStrings[a.string - 1] + a.fret).toBe(p.targetMidi);
        }
        expect(p.skillIds).toEqual([
          "technique.guitar.intervals",
          `technique.guitar.intervals.${semitones}`,
        ]);
      }
  });
});

describe("chord-perfect and changes", () => {
  it("targets each sounding string in ascending pitch order", () => {
    const c = CHORD_SHAPES.find((s) => s.id === "guitar.c-major")!;
    expect(chordPerfectTargets(c).map((n) => [n.string, n.fret, n.midi, n.finger])).toEqual([
      [5, 3, 48, 3],
      [4, 2, 52, 2],
      [3, 0, 55, undefined],
      [2, 1, 60, 1],
      [1, 0, 64, undefined],
    ]);
    // The curated shapes sound their named chord.
    expect(shapePcs(CHORD_SHAPES.find((s) => s.id === "guitar.g7")!).sort((a, b) => a - b)).toEqual(
      [2, 5, 7, 11],
    );
    expect(
      shapePcs(CHORD_SHAPES.find((s) => s.id === "ukulele.f-major")!).sort((a, b) => a - b),
    ).toEqual([0, 5, 9]);
  });

  it("orders ukulele targets by string, string 4 first, not by pitch", () => {
    const c = CHORD_SHAPES.find((s) => s.id === "ukulele.c-major")!;
    expect(chordPerfectTargets(c).map((n) => [n.string, n.midi])).toEqual([
      [4, 67],
      [3, 60],
      [2, 64],
      [1, 72],
    ]);
    // On another tuning the same frets sound that tuning's notes.
    const lowG = { ...uke, id: "ukulele.low-g", openStrings: [69, 64, 60, 55] };
    expect(chordPerfectTargets(c, lowG)[0].midi).toBe(55);
    expect(shapePcs(c, lowG).sort((a, b) => a - b)).toEqual([0, 4, 7]);
  });

  it("pairs shapes with their authored transitions", () => {
    const pairs = chordChangePairs("guitar");
    expect(pairs).toContainEqual({ from: "guitar.c-major", to: "guitar.g-major" });
    expect(pairs).toContainEqual({ from: "guitar.d-major", to: "guitar.a-major" });
    expect(chordChangePairs("ukulele").every((p) => p.from.startsWith("ukulele."))).toBe(true);
  });
});

describe("guitar grade tempos", () => {
  it("lists the Rockschool and Trinity exam clicks", () => {
    expect(GUITAR_GRADE_TEMPOS).toHaveLength(18);
    expect(GUITAR_GRADE_TEMPOS.find((g) => g.id === "rsl-grade-3")).toEqual({
      id: "rsl-grade-3",
      label: "Rockschool Grade 3",
      bpm: 90,
    });
    expect(GUITAR_GRADE_TEMPOS.find((g) => g.id === "trinity-grade-8")!.bpm).toBe(136);
  });
});

describe("fingerpicking", () => {
  const shape = (id: string) => CHORD_SHAPES.find((x) => x.id === id)!;
  it("every pattern is a bar of eighths (8 or 6), a finger to each string, playable on its open C chord", () => {
    for (const p of FINGERPICK_PATTERNS) {
      expect([6, 8], p.id).toContain(p.strings.length);
      expect(p.fingers, p.id).toHaveLength(p.strings.length);
      p.strings.forEach((st, k) => {
        expect(p.fingers[k].split("+").length, `${p.id} step ${k}`).toBe(st.split("+").length);
        expect(
          p.fingers[k].split("+").every((f) => ["p", "i", "m", "a", "-"].includes(f)),
          p.id,
        ).toBe(true);
      });
      expect(fingerpickable(p, shape(`${p.instrument}.c-major`)), p.id).toBe(true);
    }
  });

  it("every song preset uses its instrument's pattern, plain chord symbols and a playable tempo", () => {
    for (const x of FINGERPICK_SONGS) {
      const p = FINGERPICK_PATTERNS.find((q) => q.id === x.pattern);
      expect(p?.instrument, x.id).toBe(x.instrument);
      expect(x.chords.length, x.id).toBeGreaterThanOrEqual(2);
      expect(x.chords.length, x.id).toBeLessThanOrEqual(8);
      for (const c of x.chords) {
        expect(c.includes("/"), `${x.id} ${c}`).toBe(false);
        expect(parseChordSymbol(c), `${x.id} ${c}`).not.toBeNull();
      }
      expect(x.bpm, x.id).toBeGreaterThanOrEqual(40);
      expect(x.bpm, x.id).toBeLessThanOrEqual(200);
      expect(
        p!.strings.length === 6 || x.perBeat === 2,
        `${x.id}: three a click is for six-step patterns`,
      ).toBe(true);
    }
    expect(new Set(FINGERPICK_SONGS.map((x) => x.id)).size).toBe(FINGERPICK_SONGS.length);
  });

  it("a pinch shares its step, and a hold keeps the time", () => {
    const dust = FINGERPICK_PATTERNS.find((p) => p.id === "dust-pinch")!;
    const t = fingerpickTargets({
      pattern: dust,
      shapes: [shape("guitar.c-major")],
      tuning: std,
      rounds: 1,
    });
    // C: bass 5 and string 2 together on step 0, nothing on step 1, the alternate bass on step 2.
    expect(t.map((x) => `${x.slot}:${x.string}:${x.label}`)).toEqual([
      "0:5:p",
      "0:2:m",
      "2:4:p",
      "3:3:i",
      "4:5:p",
      "5:2:m",
      "6:4:p",
      "7:3:i",
    ]);
  });

  it("Travis on C alternates the bass (5 then 4) under strings 3 and 2", () => {
    const travis = FINGERPICK_PATTERNS.find((p) => p.id === "travis")!;
    const t = fingerpickTargets({
      pattern: travis,
      shapes: [shape("guitar.c-major")],
      tuning: std,
      rounds: 1,
    });
    expect(t.map((x) => `${x.string}:${x.fret}:${x.label}`)).toEqual([
      "5:3:p",
      "3:0:i",
      "4:2:p",
      "2:1:m",
      "5:3:p",
      "3:0:i",
      "4:2:p",
      "2:1:m",
    ]);
    // G: the root on 6, the alternate bass on 4.
    const g = fingerpickTargets({
      pattern: travis,
      shapes: [shape("guitar.g-major")],
      tuning: std,
      rounds: 1,
    });
    expect(g.filter((x) => x.label === "p").map((x) => x.string)).toEqual([6, 4, 6, 4]);
    // Power chords leave strings 1 to 3 silent, so they can't take the pattern.
    expect(fingerpickable(travis, shape("guitar.e5"))).toBe(false);
  });

  it("follows the ukulele's re-entrant strings, not pitch order", () => {
    const tima = FINGERPICK_PATTERNS.find((p) => p.id === "uke-tima")!;
    const t = fingerpickTargets({
      pattern: tima,
      shapes: [shape("ukulele.c-major")],
      tuning: uke,
      rounds: 1,
    });
    // High-G: string 4 (G4) is above string 3 (C4).
    expect(t.slice(0, 4).map((x) => x.midi)).toEqual([67, 60, 64, 72]);
  });
});

describe("legato patterns", () => {
  it("lays hammer-ons and pull-offs on one string from the start fret", () => {
    const t = legatoTargets({
      patternId: "three-note",
      tuning: std,
      string: 3,
      startFret: 5,
      repeats: 1,
    });
    // Tab's marks: the picked note never shares a letter with the pull-off.
    expect(t.map((x) => `${x.fret}${x.label}`)).toEqual(["5↓", "7h", "8h", "7p"]);
    expect(t.map((x) => x.midi)).toEqual([60, 62, 63, 62]);
    expect(LEGATO_PATTERNS).toHaveLength(5);
  });

  it("keeps one finger on a slide and shifts position with it", () => {
    const t = legatoTargets({
      patternId: "slide-shift",
      tuning: std,
      string: 3,
      startFret: 5,
      repeats: 1,
    });
    expect(t.map((x) => `${x.fret}${x.label}${x.finger}`)).toEqual([
      "5↓1",
      "7↓3",
      "9/3",
      "10h4",
      "9p3",
      "7\\3",
    ]);
    const slide = legatoTargets({
      patternId: "slide",
      tuning: std,
      string: 2,
      startFret: 7,
      repeats: 1,
    });
    expect(slide.map((x) => x.finger)).toEqual([3, 3, 3]);
  });

  it("writes each pattern as tab does, from the start fret", () => {
    const text = Object.fromEntries(LEGATO_PATTERNS.map((p) => [p.id, legatoText(p, 5)]));
    expect(text).toEqual({
      "hammer-pull": "5h7p5",
      trill: "5h7p5h7",
      "three-note": "5h7h8p7",
      slide: "5/7\\5",
      "slide-shift": "5 7/9h10p9\\7",
    });
    for (const p of LEGATO_PATTERNS) expect(p.label, p.id).not.toMatch(/\d/);
  });
});

describe("piano scale options: hands apart, contrary motion, thirds, octaves, chromatic", () => {
  const base = {
    kind: "major" as const,
    tonic: 60,
    span: "one-octave" as const,
    motion: "up" as const,
    bpm: 80,
  };
  const pairs = (steps: ReturnType<typeof scaleDrillTargets>) =>
    steps.map((st) => st.notes.map((n) => `${n.hand[0]}${n.midi}`).join(" "));

  it("keeps an octave apart exactly as before", () => {
    expect(scaleDrillTargets({ ...base, hands: "both", apart: "octave" })).toEqual(
      scaleDrillTargets({ ...base, hands: "both" }),
    );
  });

  it("starts contrary motion on the tonic in both hands and mirrors it", () => {
    const steps = scaleDrillTargets({ ...base, hands: "both", apart: "contrary" });
    // The unison start is one key under both thumbs.
    expect(pairs(steps).slice(0, 3)).toEqual(["r60", "l59 r62", "l57 r64"]);
    expect(pairs(steps).at(-1)).toBe("l48 r72");
  });

  it("puts the right hand a third above, or the left hand a sixth below, in the key", () => {
    const third = scaleDrillTargets({ ...base, hands: "both", apart: "third" });
    expect(pairs(third).slice(0, 2)).toEqual(["l48 r64", "l50 r65"]);
    const sixth = scaleDrillTargets({ ...base, hands: "both", apart: "sixth" });
    expect(pairs(sixth).slice(0, 2)).toEqual(["l52 r60", "l53 r62"]);
  });

  it("plays double thirds and octaves in a hand, and the chromatic scale with its fingering", () => {
    const thirds = scaleDrillTargets({ ...base, hands: "right", pattern: "thirds" });
    expect(thirds.map((st) => st.notes.map((n) => n.midi))[0]).toEqual([60, 64]);
    expect(thirds).toHaveLength(8);
    const octaves = scaleDrillTargets({ ...base, hands: "both", pattern: "octaves" });
    expect(octaves[0].notes.map((n) => n.midi)).toEqual([36, 48, 60, 72]);
    const chromatic = scaleDrillTargets({ ...base, kind: "chromatic", hands: "right" });
    expect(chromatic.map((st) => st.notes[0].midi)).toEqual(
      Array.from({ length: 13 }, (_, i) => 60 + i),
    );
    const f = scaleFingerMap("chromatic", 60, "rh", 1)!;
    expect([60, 61, 62, 63, 64, 65].map((m) => f.get(m))).toEqual([2, 3, 1, 3, 1, 2]);
  });

  it("starts an arpeggio from the 3rd or the 5th, and keys the ladder apart", () => {
    const first = scaleDrillTargets({ ...base, hands: "right", pattern: "arpeggio", inversion: 1 });
    expect(first.map((st) => st.notes[0].midi)).toEqual([64, 67, 72, 76]);
    const dim = scaleDrillTargets({
      ...base,
      hands: "right",
      pattern: "arpeggio",
      chord: "diminished-7",
      inversion: 3,
    });
    expect(dim.map((st) => st.notes[0].midi)).toEqual([69, 72, 75, 78, 81]);
    expect(scaleSetupKey({ ...base, hands: "both", apart: "third" })).not.toBe(
      scaleSetupKey({ ...base, hands: "both" }),
    );
    expect(scaleSetupKey({ ...base, hands: "both", apart: "octave" })).toBe(
      scaleSetupKey({ ...base, hands: "both" }),
    );
  });
});

describe("the B.B. box, ukulele positions and harmonics", () => {
  it("puts the B.B. box's root on string 2 under the index, five frets above the string-6 root", () => {
    const box = positionTargets({ patternId: "bb-box", tuning: std, rootFret: 5 });
    expect(box.map((t) => `${t.string}:${t.fret}`)).toEqual([
      "3:11",
      "2:10",
      "2:12",
      "2:13",
      "1:10",
      "1:12",
    ]);
    // A, B, C, D, E and the sixth, F#.
    expect([...new Set(box.map((t) => pc(t.midi)))].sort((a, b) => a - b)).toEqual([
      0, 2, 4, 6, 9, 11,
    ]);
    expect(positionPatternsFor("guitar").some((p) => p.id === "bb-box")).toBe(true);
    expect(positionPatternsFor("ukulele").some((p) => p.id === "bb-box")).toBe(false);
  });

  it("has five ukulele minor pentatonic positions, in the scale in A and C, reachable by four fingers", () => {
    const shapes = positionPatternsFor("ukulele");
    expect(shapes.map((p) => p.id)).toEqual(
      [1, 2, 3, 4, 5].map((k) => `ukulele-minor-pentatonic-${k}`),
    );
    for (const [rootFret, tones] of [
      [0, [9, 0, 2, 4, 7]],
      [3, [0, 3, 5, 7, 10]],
    ] as const)
      for (const p of shapes) {
        const line = positionTargets({ patternId: p.id, tuning: uke, rootFret });
        expect(line, p.id).toHaveLength(8);
        expect(
          line.map((t) => t.string),
          p.id,
        ).toEqual([4, 4, 3, 3, 2, 2, 1, 1]);
        for (const t of line) expect(tones, `${p.id} ${t.string}:${t.fret}`).toContain(pc(t.midi));
        const frets = line.map((t) => t.fret);
        expect(Math.max(...frets) - Math.min(...frets), p.id).toBeLessThanOrEqual(4);
      }
    // Each position starts where the last one's second notes were: they climb the neck.
    const lows = shapes.map((p) =>
      Math.min(
        ...positionTargets({ patternId: p.id, tuning: uke, rootFret: 0 }).map((t) => t.fret),
      ),
    );
    expect(lows).toEqual([0, 2, 4, 7, 9]);
  });

  it("asks for harmonics at frets 12, 7 and 5 on every string, an octave, an octave and a fifth, two octaves up", () => {
    const h = harmonicTargets(uke);
    expect(h).toHaveLength(12);
    expect(h.slice(0, 4).map((t) => t.string)).toEqual([4, 3, 2, 1]);
    expect(h.find((t) => t.string === 1 && t.fret === 12)!.midi).toBe(81);
    expect(h.find((t) => t.string === 1 && t.fret === 7)!.midi).toBe(88);
    expect(h.find((t) => t.string === 1 && t.fret === 5)!.midi).toBe(93);
    expect(harmonicTargets(std)).toHaveLength(18);
  });
});

describe("box fingerings and other tunings", () => {
  const at = (t: { string: number; fret: number; finger?: number; stretch?: string }) =>
    `${t.string}:${t.fret}:${t.finger}${t.stretch === "back" ? "<" : t.stretch === "up" ? ">" : ""}`;

  it("fingers each box one finger a fret from the index, with box 3's stretch back on string 3", () => {
    const box = (n: number) =>
      positionTargets({ patternId: `minor-pentatonic-box-${n}`, tuning: std, rootFret: 5 }).map(at);
    expect(box(1)).toEqual([
      "6:5:1",
      "6:8:4",
      "5:5:1",
      "5:7:3",
      "4:5:1",
      "4:7:3",
      "3:5:1",
      "3:7:3",
      "2:5:1",
      "2:8:4",
      "1:5:1",
      "1:8:4",
    ]);
    expect(box(2)).toEqual([
      "6:8:2",
      "6:10:4",
      "5:7:1",
      "5:10:4",
      "4:7:1",
      "4:10:4",
      "3:7:1",
      "3:9:3",
      "2:8:2",
      "2:10:4",
      "1:8:2",
      "1:10:4",
    ]);
    // The index sits at fret 10 and reaches back to 9 on string 3; the pinky takes 13.
    expect(box(3)).toEqual([
      "6:10:1",
      "6:12:3",
      "5:10:1",
      "5:12:3",
      "4:10:1",
      "4:12:3",
      "3:9:1<",
      "3:12:3",
      "2:10:1",
      "2:13:4",
      "1:10:1",
      "1:12:3",
    ]);
    expect(box(4)).toEqual([
      "6:12:1",
      "6:15:4",
      "5:12:1",
      "5:15:4",
      "4:12:1",
      "4:14:3",
      "3:12:1",
      "3:14:3",
      "2:13:2",
      "2:15:4",
      "1:12:1",
      "1:15:4",
    ]);
    expect(box(5)).toEqual([
      "6:15:2",
      "6:17:4",
      "5:15:2",
      "5:17:4",
      "4:14:1",
      "4:17:4",
      "3:14:1",
      "3:17:4",
      "2:15:2",
      "2:17:4",
      "1:15:2",
      "1:17:4",
    ]);
    // Open position (E minor): fingers from the nut, 2 and 3.
    expect(
      positionTargets({ patternId: "minor-pentatonic-box-1", tuning: std, rootFret: 0 })
        .slice(0, 2)
        .map(at),
    ).toEqual(["6:0:0", "6:3:3"]);
    // The connected run fingers box 3 the same way.
    const run = positionTargets({
      patternId: "minor-pentatonic-connected",
      tuning: std,
      rootFret: 5,
    });
    expect(
      run
        .slice(24, 36)
        .filter((t) => t.stretch)
        .map(at),
    ).toEqual(["3:9:1<"]);
    // Every pattern on standard tuning: a finger on each fretted note, at most one stretch a hand position for the boxes.
    for (const p of POSITION_PATTERNS.filter((x) => !x.instrument)) {
      const line = positionTargets({ patternId: p.id, tuning: std, rootFret: 5 });
      for (const t of line) expect(t.finger, p.id).toBeGreaterThanOrEqual(1);
      if (p.family === "minor-pentatonic")
        expect(line.filter((t) => t.stretch).length, p.id).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every note's pitch on its string in drop D, DADGAD and open G", () => {
    const written = positionTargets({
      patternId: "minor-pentatonic-box-1",
      tuning: std,
      rootFret: 5,
    });
    for (const id of ["guitar.drop-d", "guitar.dadgad", "guitar.open-g"]) {
      const t = tuningById(id)!;
      // A on string 6 is fret 7 in each of these tunings (string 6 is D).
      const line = positionTargets({ patternId: "minor-pentatonic-box-1", tuning: t, rootFret: 7 });
      expect(
        line.map((n) => [n.string, n.midi]),
        id,
      ).toEqual(written.map((n) => [n.string, n.midi]));
      for (const n of line) expect(n.midi, id).toBe(t.openStrings[n.string - 1] + n.fret);
    }
    // Drop D: string 6 two frets higher than the rest, the pinky reaching up for C.
    const dropD = positionTargets({
      patternId: "minor-pentatonic-box-1",
      tuning: tuningById("guitar.drop-d")!,
      rootFret: 7,
    });
    expect(dropD.slice(0, 4).map(at)).toEqual(["6:7:3", "6:10:4>", "5:5:1", "5:7:3"]);
    // A root at the nut in drop D would put the other strings below it: the lowest root fret is 2.
    const box1 = POSITION_PATTERNS.find((p) => p.id === "minor-pentatonic-box-1")!;
    expect(positionRootFretMin(box1, tuningById("guitar.drop-d")!)).toBe(2);
    expect(positionRootFretMin(box1, std)).toBe(0);
    expect(positionRootFretMax(box1, std)).toBe(19);
    // A chord shape keeps its authored fingers only on its own tuning.
    const triad = positionTargets({
      patternId: "triads-major-strings-1-3",
      tuning: tuningById("guitar.dadgad")!,
      rootFret: 7,
    });
    expect(
      triad
        .map((n) => pc(n.midi))
        .slice(0, 3)
        .sort(),
    ).toEqual([1, 4, 9]);
  });

  it("plays the ukulele positions on high G, low G and baritone from their pitches", () => {
    const high = positionTargets({
      patternId: "ukulele-minor-pentatonic-1",
      tuning: uke,
      rootFret: 3,
    });
    const low = positionTargets({
      patternId: "ukulele-minor-pentatonic-1",
      tuning: tuningById("ukulele.low-g")!,
      rootFret: 3,
    });
    // Same frets; string 4 an octave lower.
    expect(low.map(at)).toEqual(high.map(at));
    expect(low[0].midi).toBe(high[0].midi - 12);
    // Baritone (DGBE) is GCEA a fourth down on every string: the same shape at the same root fret.
    const bari = positionTargets({
      patternId: "ukulele-minor-pentatonic-1",
      tuning: tuningById("ukulele.baritone")!,
      rootFret: 3,
    });
    expect(bari.map(at)).toEqual(high.map(at));
    // Position 3 reaches back with the index on string 3.
    const p3 = positionTargets({
      patternId: "ukulele-minor-pentatonic-3",
      tuning: uke,
      rootFret: 0,
    });
    expect(p3.filter((t) => t.stretch).map(at)).toEqual(["3:4:1<"]);
  });
});
