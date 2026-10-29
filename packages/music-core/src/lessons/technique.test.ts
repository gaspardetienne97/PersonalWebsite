import { describe, expect, it } from "vitest";
import { BREATH_LEVELS, REGISTER_PAIRS } from "../content/aero-skills";
import {
  ARTICULATION_TARGET,
  LANDING_HOLD_MS,
  LANDING_INTERVALS,
  fingeringFor,
} from "../content/winds-pads";
import { TUNINGS } from "../data";
import { BEND } from "../scoring/bends";
import { ATTACK } from "../scoring/aerophone";
import { PEDAL, gradePedal } from "../scoring/piano";
import { lessonProblems } from "./check";
import {
  PEDAL_EXAMPLE,
  aeroLessons,
  bendLesson,
  firstOctaveNote,
  firstPalmNote,
  pedalLesson,
} from "./technique";
import type { Lesson, LessonFigure } from "./types";

const all = (l: Lesson) => JSON.stringify(l);
const marks = (f: LessonFigure | undefined) => (f?.kind === "fretboard" ? f.marks : []);

describe("aerophone lessons", () => {
  it("ids follow the drill's mode, and the long tone adds a levels lesson only for a level", () => {
    expect(aeroLessons("long-tone").map((l) => l.id)).toEqual(["aerophone.long-tone"]);
    expect(aeroLessons("long-tone", "any").map((l) => l.id)).toEqual(["aerophone.long-tone"]);
    for (const l of BREATH_LEVELS)
      expect(aeroLessons("long-tone", l.id).map((x) => x.id)).toEqual([
        "aerophone.long-tone",
        "aerophone.long-tone.levels",
      ]);
    expect(aeroLessons("articulation").map((l) => l.id)).toEqual(["aerophone.articulation"]);
    expect(aeroLessons("interval-landing").map((l) => l.id)).toEqual([
      "aerophone.interval-landing",
    ]);
  });

  it("every crossing gets the intro, and the pinky and palm ones their own", () => {
    const ids = (id: string) => aeroLessons("register", id).map((l) => l.id);
    const extra: Record<string, string> = {};
    for (const p of REGISTER_PAIRS) {
      const got = ids(p.id);
      expect(got[0]).toBe("aerophone.register");
      if (got[1]) extra[p.id] = got[1];
    }
    expect(extra).toEqual({
      "cs4-b3": "aerophone.register.pinky",
      "b3-bb3": "aerophone.register.pinky",
      "eb4-c4": "aerophone.register.pinky",
      "cs6-d6": "aerophone.register.palm",
      "b5-d6": "aerophone.register.palm",
      "d6-f6": "aerophone.register.palm",
    });
  });

  it("every lesson passes the copy check", () => {
    const every = [
      ...aeroLessons("long-tone", "pp"),
      ...aeroLessons("articulation"),
      ...aeroLessons("interval-landing"),
      ...aeroLessons("register"),
      ...aeroLessons("register", "cs4-b3"),
      ...aeroLessons("register", "cs6-d6"),
    ];
    for (const l of every) expect(lessonProblems(l), l.id).toEqual([]);
  });

  it("the levels lesson states the drill's bands and plays one note a level, louder going up", () => {
    const l = aeroLessons("long-tone", "mf")[1];
    expect(l.screens[0].text).toContain(
      "pp 0.1 to 0.28, p 0.25 to 0.42, mf 0.45 to 0.65, f 0.65 to 0.85",
    );
    for (const lv of BREATH_LEVELS)
      expect(l.screens[0].text).toContain(`${lv.id} ${lv.band[0]} to ${lv.band[1]}`);
    const opts = l.screens[1].options!;
    expect(opts.map((o) => o.label)).toEqual(BREATH_LEVELS.map((x) => x.id));
    const v = opts.map((o) => o.sound.notes[0].velocity!);
    BREATH_LEVELS.forEach((lv, i) => expect(v[i]).toBeCloseTo((lv.band[0] + lv.band[1]) / 2, 6));
    expect(v).toEqual([...v].sort((a, b) => a - b));
  });

  it("the articulation lesson uses the drill's note lengths and attack rules", () => {
    const l = aeroLessons("articulation")[0];
    const [stac, leg] = l.screens[1].options!.map((o) => o.sound.notes);
    expect(stac[0].dur / 0.6).toBeCloseTo(ARTICULATION_TARGET.staccato, 6);
    expect(leg[0].dur / 0.6).toBeCloseTo(ARTICULATION_TARGET.legato, 6);
    expect(l.screens[1].text).toContain("about 35 percent");
    expect(l.screens[1].text).toContain("about 95 percent");
    expect(l.screens[2].text).toContain(`${Math.round(ATTACK.dip * 100)} percent`);
    expect(l.screens[3].text).toContain(`${ATTACK.windowMs} ms`);
  });

  it("the landing lesson plays each interval the drill offers, above a C drone, and says the hold", () => {
    const l = aeroLessons("interval-landing")[0];
    const opts = l.screens[1].options!;
    expect(opts.map((o) => o.label)).toEqual(LANDING_INTERVALS.map((i) => i.label));
    LANDING_INTERVALS.forEach((i, k) => {
      const [drone, target] = opts[k].sound.notes;
      expect(target.midi[0] - drone.midi[0]).toBe(i.semitones);
      expect(opts[k].figure).toMatchObject({ kind: "keys" });
      // the landing note is on the chart, so the drill could ask for it
      expect(fingeringFor(target.midi[0])).toBeDefined();
    });
    expect(l.screens[3].text).toContain(`${LANDING_HOLD_MS / 1000} seconds`);
  });

  it("the register lesson's octave and palm claims match the chart", () => {
    expect(firstOctaveNote().midi).toBe(74);
    expect(firstPalmNote().midi).toBe(86);
    // from the first octave note, each note is the one an octave below plus the +1 key
    for (let m = firstOctaveNote().midi; m <= 85; m++) {
      const hi = fingeringFor(m)!;
      const lo = fingeringFor(m - 12)!;
      expect(hi.octave, String(m)).toBe(true);
      expect(hi.keys, String(m)).toEqual(lo.keys);
      expect(lo.octave).toBe(false);
    }
    expect(all(aeroLessons("register")[0])).toContain("D5");
    expect(all(aeroLessons("register", "d6-f6")[1])).toContain("D6");
  });
});

describe("bend lesson", () => {
  const l = bendLesson();
  it("is guitar.bends and passes the copy check, on a guitar and a ukulele", () => {
    expect(l.id).toBe("guitar.bends");
    expect(lessonProblems(l)).toEqual([]);
    expect(lessonProblems(bendLesson("ukulele", TUNINGS.ukulele[0].openStrings))).toEqual([]);
  });

  it("the whole step example marks the target two frets up on the same string, the half step one fret", () => {
    const steps = l.screens[0].steps!;
    const [from] = marks(steps[0].figure);
    const half = marks(steps[1].figure);
    const whole = marks(steps[2].figure);
    expect(half.map((m) => m.string)).toEqual([from.string, from.string]);
    expect(half[1].fret - from.fret).toBe(1);
    expect(whole.map((m) => m.string)).toEqual([from.string, from.string]);
    expect(whole[1].fret - from.fret).toBe(2);
    expect(steps[2].text).toContain("2 frets up");
  });

  it("the figures stay inside the window, with names that follow the tuning", () => {
    for (const [inst, open] of [
      ["guitar", TUNINGS.guitar[0].openStrings],
      ["ukulele", TUNINGS.ukulele[0].openStrings],
      ["guitar", [62, 57, 53, 48, 43, 36]], // an odd tuning
    ] as const) {
      const lesson = bendLesson(inst, open);
      for (const s of lesson.screens) {
        const figs = [
          s.figure,
          ...(s.steps ?? []).map((x) => x.figure),
          ...(s.options ?? []).map((o) => o.figure),
        ];
        for (const f of figs)
          for (const m of marks(f)) {
            expect(m.fret).toBeGreaterThanOrEqual(0);
            expect(m.fret).toBeLessThanOrEqual(5);
            expect(m.string).toBeLessThanOrEqual(open.length);
          }
      }
      // the heard pair is the figure's two frets on that string
      const opt = lesson.screens[1].options!;
      for (const [k, steps] of [
        [0, 1],
        [1, 2],
      ] as const) {
        const [a, b] = opt[k].sound.notes;
        expect(b.midi[0] - a.midi[0]).toBe(steps);
        expect(a.midi[0]).toBe(open[1] + 2);
      }
    }
  });

  it("states the drill's cent bands", () => {
    const t = l.screens[3].text;
    expect(t).toContain(`${BEND.inTune} cents`);
    expect(t).toContain(`${BEND.close}`);
    expect(t).toContain(`${BEND.holdMs} ms`);
    expect(t).toContain("200 cents");
  });
});

describe("pedal lesson", () => {
  const l = pedalLesson();
  it("is piano.pedal and passes the copy check", () => {
    expect(l.id).toBe("piano.pedal");
    expect(lessonProblems(l)).toEqual([]);
  });

  it("states the drill's windows", () => {
    const t = l.screens[3].text;
    expect(t).toContain(`within ${PEDAL.liftWithinMs} ms`);
    expect(t).toContain(`within ${PEDAL.repressWithinMs} ms`);
    expect(t).toContain(`${PEDAL.earlyToleranceMs} ms before`);
  });

  it("the worked change passes the drill's own grader as clean", () => {
    const { liftMs, downMs, barMs } = PEDAL_EXAMPLE;
    expect(liftMs).toBeLessThanOrEqual(PEDAL.liftWithinMs);
    expect(downMs).toBeLessThanOrEqual(PEDAL.repressWithinMs);
    const r = gradePedal({
      chordOnsets: [0, barMs],
      pedal: [
        { at: 100, value: 1 },
        { at: barMs + liftMs, value: 0 },
        { at: barMs + downMs, value: 1 },
      ],
    });
    expect(r.verdicts).toEqual(["clean", "clean"]);
    expect(l.screens[4].text).toContain(`${liftMs} ms after the chord`);
    expect(l.screens[4].text).toContain(`${downMs} ms after it`);
  });

  it("the other two sounds the lesson describes are what the drill calls a gap and a blur", () => {
    const { barMs } = PEDAL_EXAMPLE;
    const early = gradePedal({
      chordOnsets: [0, barMs],
      pedal: [
        { at: 100, value: 1 },
        { at: barMs - 300, value: 0 },
        { at: barMs - 100, value: 1 },
      ],
    });
    expect(early.verdicts[1]).toBe("early");
    const held = gradePedal({ chordOnsets: [0, barMs], pedal: [{ at: 100, value: 1 }] });
    expect(held.verdicts[1]).toBe("blurred");
    // the sounds: first chord ends before the second, just after it begins, long after
    const [gap, clean, blur] = l.screens[2].options!.map((o) => o.sound.notes);
    const second = gap.find((n) => n.at > 0)!.at;
    expect(gap[0].dur).toBeLessThan(second);
    expect(clean[0].dur - second).toBeCloseTo(PEDAL_EXAMPLE.liftMs / 1000, 6);
    expect(blur[0].dur).toBeGreaterThanOrEqual(2 * second);
  });
});
