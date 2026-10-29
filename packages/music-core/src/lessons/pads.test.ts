import { describe, expect, it } from "vitest";
import type { NoteEvent } from "../types";
import {
  DEFAULT_RANGE,
  ECHO_LEVELS,
  ECHO_PASS,
  FILL,
  INTERPRETATIONS,
  ORCHESTRATIONS,
  PAD_FILLS,
  PARADIDDLE,
  READING_LINES,
  echoGroove,
  fillGroove,
  fillReport,
  inRange,
  orchestrationGroove,
  ostinatoGroove,
  ostinatoReport,
} from "../content/pad-skills";
import { PAD_REPERTOIRE } from "../content/pads-repertoire";
import {
  BUILD,
  CHOP_EDITS,
  CHOP_EXERCISES,
  CHOP_SOURCES,
  DYN_BANDS,
  NOTE_REPEAT_EXERCISES,
  REPEAT_RATES,
  SONG_FORMS,
} from "../content/pads-studio";
import { GROOVE_VOICES, RUDIMENTS } from "../content/winds-pads";
import { RUDIMENT_BANDS, gradeGroove, inAccentBand } from "../scoring/pads";
import { lessonProblems } from "./check";
import {
  BPM,
  CARD_TOPICS,
  FILL_DEMO_MS,
  GROOVE_VEL,
  RUDIMENT_ITEMS,
  RUDIMENT_VEL,
  bandEdges,
  dynamicsSound,
  echoRound,
  echoVoices,
  grooveLessonItems,
  hasRolls,
  lineBar,
  mirror,
  padLessons,
  repeatRates,
  rudimentItem,
  sliceWord,
} from "./pads";
import { pendingLessons, type Lesson, type LessonSound } from "./types";

const beatMs = 60000 / BPM;
const padOf = (voice: string) => GROOVE_VOICES.find((v) => v.id === voice)!.midi;
const voicePads = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));
const text = (l: Lesson) =>
  l.screens.flatMap((s) => [s.title, s.text, ...(s.steps ?? []).map((x) => x.text)]).join(" ");
const soundsOf = (l: Lesson): LessonSound[] =>
  l.screens.flatMap((s) => [
    ...(s.sound ? [s.sound] : []),
    ...(s.options ?? []).map((o) => o.sound),
    ...(s.steps ?? []).flatMap((x) => (x.sound ? [x.sound] : [])),
  ]);
/** A sound's drum hits as the pad events a player would make, `offsetBeats` into the run. */
const played = (s: LessonSound, offsetBeats = 0): NoteEvent[] =>
  s.notes.map((n) => ({
    kind: "noteon",
    midi: n.midi[0],
    velocity: n.velocity ?? 0.8,
    at: n.at * 1000 + offsetBeats * beatMs,
    source: "midi",
    confidence: 1,
    velocityMeasured: true,
  }));
const exact = (targets: readonly { voice: string; beat: number }[]): NoteEvent[] =>
  targets.map((t) => ({
    kind: "noteon",
    midi: padOf(t.voice),
    velocity: 0.8,
    at: t.beat * beatMs,
    source: "midi",
    confidence: 1,
    velocityMeasured: true,
  }));

const ALL_ITEMS: Record<string, string[]> = {
  rudiments: RUDIMENT_ITEMS,
  fills: PAD_FILLS.map((f) => f.id),
  echo: ECHO_LEVELS.map((l) => l.id),
  ostinato: READING_LINES.map((l) => l.id),
  orchestrate: ORCHESTRATIONS.map((o) => o.id),
  repeat: REPEAT_RATES.map((r) => r.id),
  song: SONG_FORMS.map((f) => f.id),
  chop: [...CHOP_EXERCISES.map((x) => x.id), ...CHOP_EDITS.map((e) => `edit:${e.id}`)],
  grooves: [...CARD_TOPICS, "linear", "rolls"],
};

describe("pads lessons: copy and shape", () => {
  for (const [mode, items] of Object.entries(ALL_ITEMS)) {
    it(`${mode}: the intro is a lesson, every item a card, ids are unique`, () => {
      const ls = padLessons(mode, 8, items);
      expect(ls.length).toBe(1 + items.length);
      expect(lessonProblems(ls[0], "lesson")).toEqual([]);
      for (const l of ls.slice(1)) expect(lessonProblems(l, "card")).toEqual([]);
      expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
      for (const l of ls) expect(l.id).toMatch(/^pads\./);
    });
  }

  it("a sound's hits are real drum notes with sensible velocities", () => {
    for (const [mode, items] of Object.entries(ALL_ITEMS))
      for (const l of padLessons(mode, 8, items))
        for (const s of soundsOf(l))
          for (const n of s.notes) {
            expect(n.drum).toBe(true);
            expect(n.at).toBeGreaterThanOrEqual(0);
            expect(n.velocity!).toBeGreaterThan(0);
            expect(n.velocity!).toBeLessThanOrEqual(1);
          }
  });

  it("pads figures stay on bank A", () => {
    for (const [mode, items] of Object.entries(ALL_ITEMS))
      for (const l of padLessons(mode, 8, items))
        for (const sc of l.screens)
          for (const f of [sc.figure, ...(sc.steps ?? []).map((x) => x.figure)])
            if (f?.kind === "pads")
              for (const k of Object.keys(f.marks)) expect(+k >= 36 && +k <= 51).toBe(true);
  });

  it("an unseen item shows alone once the intro is seen", () => {
    const ls = padLessons("fills", undefined, ["snare-eighths", "whole-bar"]);
    const seen = [ls[0].id, ls[1].id];
    expect(pendingLessons({ lessons: ls }, seen).map((l) => l.id)).toEqual([
      "pads.fills:whole-bar",
    ]);
  });

  it("an unknown mode or item gives nothing extra", () => {
    expect(padLessons("nope")).toEqual([]);
    expect(padLessons("fills", undefined, ["nope"]).length).toBe(1);
  });
});

describe("rudiments", () => {
  const intro = () => padLessons("rudiments")[0];

  it("the paradiddle screen has the content's sticking, and the drill's mirror of it", () => {
    expect(PARADIDDLE.join(" ")).toBe("R L R R L R L L");
    const screen = intro().screens[1];
    const step = screen.steps!.find((s) => s.text.includes("paradiddle"))!;
    expect(step.text).toContain("R L R R L R L L");
    const drill = RUDIMENTS.find((r) => r.id === "paradiddle")!.unit.map((h) => h[0].toUpperCase());
    expect(drill.join(" ")).toBe(mirror("R L R R L R L L"));
    expect(step.text).toContain(drill.join(" "));
  });

  it("singles and doubles come from the content", () => {
    const t = text(intro());
    for (const id of ["single-strokes", "double-strokes"]) {
      const unit = RUDIMENTS.find((r) => r.id === id)!.unit.map((h) => h[0].toUpperCase());
      expect(t).toContain(unit.join(" "));
    }
  });

  it("the accent and tap A/B uses the drill's velocity bands", () => {
    const screen = intro().screens[2];
    const [even, accent] = screen.options!;
    const vs = (o: typeof even) => o.sound.notes.map((n) => n.velocity!);
    expect(new Set(vs(even)).size).toBe(1);
    const taps = vs(accent).filter((v) => v < 0.7);
    const accents = vs(accent).filter((v) => v >= 0.7);
    expect(accents.length).toBe(1);
    expect(taps.length).toBe(3);
    for (const v of accents)
      expect(v >= RUDIMENT_BANDS.accent[0] && v <= RUDIMENT_BANDS.accent[1]).toBe(true);
    for (const v of taps)
      expect(v >= RUDIMENT_BANDS.tap[0] && v <= RUDIMENT_BANDS.tap[1]).toBe(true);
    expect(RUDIMENT_VEL.accent).toBeGreaterThan(RUDIMENT_VEL.tap);
    expect(screen.text).toContain("75 to 100 percent");
    expect(screen.text).toContain("25 to 70 percent");
  });

  it("the grid screen has one option per subdivision, with that many strokes a beat", () => {
    const screen = intro().screens[3];
    expect(screen.options!.map((o) => o.sound.notes.length)).toEqual([8, 12, 16]);
  });

  it("every rudiment has a card; Stick Control's sixteen share one", () => {
    expect(RUDIMENT_ITEMS.filter((i) => i === "stick-control").length).toBe(1);
    for (const r of RUDIMENTS) {
      const l = padLessons("rudiments", undefined, [rudimentItem(r.id)]);
      expect(l.length).toBe(2);
      expect(l[1].id).toBe(`pads.rudiments:${rudimentItem(r.id)}`);
    }
    expect(RUDIMENT_ITEMS.length).toBe(new Set(RUDIMENTS.map((r) => rudimentItem(r.id))).size);
  });

  it("a rudiment card states its own sticking, grid and accents", () => {
    const card = (id: string) => text(padLessons("rudiments", undefined, [id])[1]);
    expect(card("six-stroke")).toContain("R L L R R L");
    expect(card("six-stroke")).toContain("strokes 1 and 6 of each 6");
    expect(card("flam")).toContain("30 ms");
    expect(card("single-16ths")).toContain("sixteenths");
    expect(card("pyramid")).toContain("1, 2, 3, 4, 3, 2");
    expect(card("moving-accent")).toContain("one note later");
    expect(card("single-strokes")).toContain("subdivision you pick");
    expect(card("stick-control")).toContain("20 times");
  });

  it("a rudiment's sound has only its first four beats", () => {
    for (const r of RUDIMENTS) {
      const [, c] = padLessons("rudiments", undefined, [rudimentItem(r.id)]);
      const s = c.screens[0].sound!;
      expect(s.notes.length).toBeGreaterThan(0);
      expect(Math.max(...s.notes.map((n) => n.at))).toBeLessThan(0.05 + (4 * 60) / 80 + 0.001);
    }
  });
});

describe("grooves from level 3", () => {
  it("below level 3 there is no lesson", () => {
    for (const level of [undefined, 0, 1, 2]) expect(padLessons("grooves", level)).toEqual([]);
    expect(padLessons("grooves", 2, ["independence"])).toEqual([]);
  });

  it("level 3 and up has the sixteenths lesson", () => {
    for (const level of [3, 4, 5, 6, 7, 8]) {
      const ls = padLessons("grooves", level);
      expect(ls.map((l) => l.id)).toEqual(["pads.grooves.sixteenths"]);
      expect(lessonProblems(ls[0])).toEqual([]);
    }
  });

  it("the ghost screen's numbers are the grader's bands and its A/B plays inside them", () => {
    const [, , ghost] = padLessons("grooves", 3)[0].screens;
    const [lo, hi] = bandEdges("ghost");
    expect([lo, hi]).toEqual([1, 49]);
    expect(bandEdges("normal")).toEqual([50, 89]);
    expect(bandEdges("accent")[0]).toBe(90);
    expect(ghost.text).toContain("1 to 49 for a ghost");
    expect(ghost.text).toContain("50 to 89 for a normal hit");
    expect(ghost.text).toContain("90 and up for an accent");
    const [ghosts, loud] = ghost.options!;
    const v = (o: typeof ghosts) => o.sound.notes.map((n) => Math.round(n.velocity! * 127));
    const soft = v(ghosts).filter((x) => inAccentBand("ghost", x / 127));
    expect(soft.length).toBeGreaterThan(0);
    expect(v(loud).some((x) => inAccentBand("ghost", x / 127))).toBe(false);
    expect(v(loud).length).toBe(v(ghosts).length);
    expect(inAccentBand("accent", GROOVE_VEL.accent)).toBe(true);
    expect(inAccentBand("normal", GROOVE_VEL.normal)).toBe(true);
    expect(inAccentBand("ghost", GROOVE_VEL.ghost)).toBe(true);
  });

  it("the counting steps are the groove's own counts", () => {
    const g = PAD_REPERTOIRE.find((r) => r.groove.value === "funk-sixteenths")!.groove;
    const bar = g.targets.filter((t) => t.beat < 4);
    expect(bar.filter((t) => t.voice === "hats").length).toBe(16);
    const steps = padLessons("grooves", 3)[0].screens[1].steps!.map((s) => s.text);
    expect(steps[0]).toBe("The hi-hat plays every sixteenth.");
    expect(steps[1]).toBe("The kick lands on 1, 1 a and 3 &.");
    expect(steps[2]).toBe("The snare backbeat lands on 2 and 4.");
    expect(steps[3]).toBe("The soft ghost snares sit on 2 a and 4 a.");
    expect(bar.filter((t) => t.voice === "snare" && t.accent === "ghost").length).toBe(2);
  });

  it("the swing screen's numbers are the drill's: a swung groove it can play, 50 to 75, 66 the triplet", () => {
    const swing = padLessons("grooves", 4)[0].screens[3];
    const swung = PAD_REPERTOIRE.find((r) => r.groove.value === "swing-62")!.swing!;
    expect(swing.text).toContain(`at ${swung}.`);
    const [straight, swungOpt] = swing.options!;
    const off = (o: typeof straight) => o.sound.notes[1].at / (60 / BPM);
    expect(off(straight)).toBeCloseTo(0.25, 5);
    expect(off(swungOpt)).toBeCloseTo((swung / 100) * 0.5, 5);
    expect(swung).toBeGreaterThan(50);
    expect(swung).toBeLessThanOrEqual(75);
  });

  const level3Up = PAD_REPERTOIRE.filter((r) => r.level >= 3 && r.topic !== "phrases");
  const byTopic = (t: string) => level3Up.filter((r) => r.topic === t);
  const barsOf = (r: (typeof PAD_REPERTOIRE)[number], v: string) =>
    Array.from({ length: r.groove.bars }, (_, b) =>
      r.groove.targets
        .filter((t) => t.voice === v && Math.floor(t.beat / 4) === b)
        .map((t) => t.beat - b * 4)
        .join(),
    );

  it("every groove from level 3 gets only cards that exist", () => {
    for (const r of level3Up) {
      const items = grooveLessonItems(r);
      const ls = padLessons("grooves", r.level, items);
      expect(ls.length).toBe(1 + items.length);
      for (const l of ls.slice(1)) expect(lessonProblems(l, "card")).toEqual([]);
    }
    expect(grooveLessonItems(PAD_REPERTOIRE.find((r) => r.level < 3)!)).toEqual([]);
  });

  it("each card's claim holds for every groove that earns it, derived from the data", () => {
    const earns = (item: string) => level3Up.filter((r) => grooveLessonItems(r).includes(item));
    const onsets = (r: (typeof level3Up)[number]) =>
      r.groove.targets.map((t) => Math.round(t.beat * 1000));
    // independence: voices layer (two drums share an onset)
    expect(earns("independence").length).toBeGreaterThan(0);
    for (const r of earns("independence"))
      expect(new Set(onsets(r)).size).toBeLessThan(onsets(r).length);
    // linear: never two drums at once
    expect(
      earns("linear")
        .map((r) => r.groove.value)
        .sort(),
    ).toEqual(["linear-doubles", "linear-inverted", "linear-paradiddle", "linear-singles"]);
    for (const r of earns("linear")) expect(new Set(onsets(r)).size).toBe(onsets(r).length);
    const ind = text(padLessons("grooves", 4, ["independence"])[1]);
    const g = PAD_REPERTOIRE.find((r) => r.groove.value === "independence")!;
    expect(new Set(barsOf(g, "hats")).size).toBe(1);
    expect(new Set(barsOf(g, "kick")).size).toBeGreaterThan(1);
    expect(ind).toContain("takes a new pattern each bar");
    for (const r of earns("fills")) expect(r.groove.bars).toBe(4);
    // breaks: more than one bar, and the two bars shown (1 and 4) differ
    expect(earns("breaks").map((r) => r.groove.value)).toEqual(["amen"]);
    for (const r of earns("breaks")) {
      expect(r.groove.bars).toBe(4);
      expect(barsOf(r, "snare")[0]).not.toBe(barsOf(r, "snare")[3]);
      expect(text(padLessons("grooves", 6, ["breaks"])[1])).toContain(
        `runs for ${r.groove.bars} bars`,
      );
    }
    expect(grooveLessonItems(PAD_REPERTOIRE.find((r) => r.groove.value === "apache")!)).toEqual([]);
    for (const r of earns("shuffle")) expect([3, 6]).toContain(r.groove.stepsPerBeat);
    for (const r of earns("meter")) expect([5, 7]).toContain(r.groove.beatsPerBar);
    const seven8 = earns("meter").find((r) => r.groove.value === "seven-eight")!;
    expect(seven8.groove.stepsPerBeat).toBe(2);
  });

  it("rolls are the trap grooves, at the rates the card names", () => {
    const rolls = level3Up.filter(hasRolls).map((r) => r.groove.value);
    expect(rolls.sort()).toEqual(["trap-32", "trap-triplet"]);
    for (const r of level3Up.filter(hasRolls)) {
      const hats = r.groove.targets.filter((t) => t.voice === "hats").map((t) => t.beat);
      const gaps = hats
        .slice(1)
        .map((b, i) => b - hats[i])
        .filter((g) => g < 0.25 - 1e-6);
      const per = [...new Set(gaps.map((g) => Math.round(1 / g)))];
      for (const p of per) expect(REPEAT_RATES.some((x) => x.perBeat === p)).toBe(true);
    }
    const t = text(padLessons("grooves", 5, ["rolls"])[1]);
    expect(t).toContain("8 to a beat");
    expect(t).toContain("6 to a beat");
  });

  it("topics with a card are the ones the level list names", () => {
    for (const t of CARD_TOPICS) expect(byTopic(t).length).toBeGreaterThan(0);
  });
});

describe("fills", () => {
  const ls = padLessons(
    "fills",
    undefined,
    PAD_FILLS.map((f) => f.id),
  );
  const g = fillGroove("snare-eighths");
  /** A run of the example fill: every other note exact, the lesson's sound for bar 3 on. */
  const run = (s: LessonSound) => {
    return [...exact(g.targets.filter((t) => t.beat < 8)), ...played(s, 8)];
  };
  const grade = (s: LessonSound) => {
    const r = gradeGroove({
      targets: g.targets,
      voicePads,
      sectionLabels: g.sectionLabels,
      beatsPerBar: 4,
      beatMs,
      startAt: 0,
      hits: run(s),
    });
    if ("error" in r) throw new Error(r.error);
    return { r, f: fillReport(g, r.perTarget) };
  };

  it("the worked fill passes the drill's own grading, landed and on time", () => {
    const { r, f } = grade(ls[0].screens[0].sound!);
    expect(r.correct).toBe(true);
    expect(f.landed).toBe(true);
    expect(f.rushed).toBe(false);
  });

  it("Late misses the landing and Rushed rushes the fill, as the text says", () => {
    expect(FILL_DEMO_MS).toBeGreaterThan(FILL.landMs);
    expect(FILL_DEMO_MS).toBeGreaterThan(FILL.rushMs);
    const [, late] = ls[0].screens[1].options!;
    expect(grade(late.sound).f.landed).toBe(false);
    const [, rushed] = ls[0].screens[2].options!;
    expect(grade(rushed.sound).f.rushed).toBe(true);
    expect(ls[0].screens[1].text).toContain(`${FILL.landMs} ms`);
    expect(ls[0].screens[2].text).toContain(`${FILL.rushMs} ms`);
  });

  it("a run is four bars with the landing on the next one", () => {
    expect(g.bars).toBe(4);
    expect(g.targets.filter((t) => t.voice === "crash").map((t) => t.beat)).toEqual([16]);
    expect(g.landing.map((i) => g.targets[i].beat)).toEqual([16, 16]);
    expect(g.fill.every((i) => g.targets[i].beat >= 12 && g.targets[i].beat < 16)).toBe(true);
  });

  it("each fill card names its grooves, pads and note count", () => {
    for (const fill of PAD_FILLS) {
      const c = ls.find((l) => l.id === `pads.fills:${fill.id}`)!;
      const gg = fillGroove(fill.id);
      expect(c.screens[0].text).toContain(fill.groove ? "shuffle" : "rock");
      expect(c.screens[0].text).toContain(`the ${gg.fill.length} notes it adds`);
      const f = c.screens[0].figure!;
      expect(f.kind).toBe("pads");
      if (f.kind === "pads") {
        const voices = new Set(gg.targets.filter((t) => t.beat >= 12).map((t) => padOf(t.voice)));
        for (const m of voices) expect(f.marks[m]).toBeDefined();
      }
    }
  });
});

describe("play it back", () => {
  const ls = padLessons(
    "echo",
    undefined,
    ECHO_LEVELS.map((l) => l.id),
  );

  it("the worked answer passes the drill's own grading", () => {
    const g = echoGroove(ECHO_LEVELS[0].id);
    const answer = ls[0].screens[1].steps![1].sound!;
    const rest = g.targets.filter((t) => t.beat >= 8);
    const r = gradeGroove({
      targets: g.targets,
      voicePads,
      sectionLabels: g.sectionLabels,
      beatsPerBar: 4,
      beatMs,
      startAt: 0,
      hits: [...played(answer, 4), ...exact(rest)],
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.correct).toBe(true);
    const round = g.targets.flatMap((t, i) => (t.beat < 8 ? [i] : []));
    expect(
      round.filter((i) => r.perTarget[i] !== null).length / round.length,
    ).toBeGreaterThanOrEqual(ECHO_PASS);
  });

  it("every level has four rounds, as the intro says", () => {
    for (const l of ECHO_LEVELS) expect(l.calls.length).toBe(4);
    expect(ls[0].screens[0].text).toContain("four rounds");
  });

  it("the call and answer are the same bar, a bar apart", () => {
    for (const l of ECHO_LEVELS) {
      const { call, answer } = echoRound(l.id);
      expect(answer.map((a) => [a.voice, a.beat - 4])).toEqual(call.map((c) => [c.voice, c.beat]));
    }
    const t = ls[0].screens[1].steps![0].text;
    expect(t).toBe("The call is one bar: kick on 1 and 3, snare on 2 and 4.");
  });

  it("each level card names its voices and ghosts truthfully", () => {
    for (const l of ECHO_LEVELS) {
      const c = ls.find((x) => x.id === `pads.echo:${l.id}`)!;
      const { voices, ghosts } = echoVoices(l.id);
      expect(c.screens[0].text.includes("ghost")).toBe(ghosts);
      for (const v of voices)
        expect(c.screens[0].text.toLowerCase()).toContain(v === "hats" ? "hats" : v);
      const all = l.calls.flatMap((cl) => Object.keys(cl));
      expect(new Set(all).size).toBe(voices.length);
    }
    expect(text(ls[0])).toContain("90 percent");
  });
});

describe("ostinato", () => {
  const ls = padLessons(
    "ostinato",
    undefined,
    READING_LINES.map((l) => l.id),
  );

  it("the worked line passes the drill's own grading, ostinato held", () => {
    const g = ostinatoGroove("backbeat-push");
    const withLine = ls[0].screens[1].steps![1].sound!;
    const rest = g.targets.filter((t) => Math.floor(t.beat / 4) !== 2);
    const r = gradeGroove({
      targets: g.targets,
      voicePads,
      sectionLabels: g.sectionLabels,
      beatsPerBar: 4,
      beatMs,
      startAt: 0,
      hits: [...played(withLine, 8), ...exact(rest)],
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.correct).toBe(true);
    expect(ostinatoReport(g, r.perTarget, g.ostinato).held).toBe(true);
    expect(ls[0].screens[2].text).toContain("10 percentage points");
  });

  it("the ostinato voices the intro names are the groove's", () => {
    expect(ostinatoGroove("quarters").ostinato).toBe("hats");
    expect(ostinatoGroove("clave").ostinato).toBe("rim");
    const t = ls[0].screens[0].text;
    expect(t).toContain("The hats keep eighths");
    expect(t).toContain("the rim keeps the son clave");
    for (const l of READING_LINES.filter((x) => x.id !== "clave"))
      expect(ostinatoGroove(l.id).targets.filter((x) => x.voice === "hats").length).toBe(48);
  });

  it("each line card names the counts its line plays", () => {
    for (const l of READING_LINES.filter((x) => x.line)) {
      const c = ls.find((x) => x.id === `pads.ostinato:${l.id}`)!;
      const beats = [...l.line].flatMap((ch, i) => (ch === "x" ? [i / 4] : []));
      expect(
        lineBar(l.id)
          .filter((h) => h.voice === "snare")
          .map((h) => h.beat),
      ).toEqual(beats);
      expect(c.screens[0].text).toContain("snare plays on");
    }
    const clave = ls.find((x) => x.id === "pads.ostinato:clave")!;
    const rim = lineBar("clave").filter((h) => h.voice === "rim");
    expect(rim.length).toBe(5);
    const kicks = new Set(
      Array.from({ length: 4 }, (_, b) =>
        ostinatoGroove("clave")
          .targets.filter((t) => t.voice === "kick" && Math.floor(t.beat / 4) === b + 2)
          .map((t) => t.beat % 4)
          .join(),
      ),
    );
    expect(kicks.size).toBe(4);
    expect(clave.screens[0].text).toContain("different pattern in each of the four bars");
  });

  it("the read card names both readers", () => {
    const c = ls.find((x) => x.id === "pads.ostinato:read")!;
    for (const i of INTERPRETATIONS) expect(c.screens[0].text).toContain(`the ${i.id}`);
    expect(c.screens[0].figure?.kind).toBe("groove");
  });
});

describe("rudiments on the kit", () => {
  const ls = padLessons(
    "orchestrate",
    undefined,
    ORCHESTRATIONS.map((o) => o.id),
  );

  it("the paradiddle is the content's, and the worked bar passes the drill's grading", () => {
    expect(text(ls[0])).toContain(PARADIDDLE.join(" "));
    const g = orchestrationGroove(ORCHESTRATIONS[0].id);
    const bpm = 90;
    const ms = 60000 / bpm;
    const whole = ls[0].screens[2].steps![2].sound!;
    const hits = [
      ...whole.notes.map((n) => ({
        kind: "noteon" as const,
        midi: n.midi[0],
        velocity: 0.8,
        at: n.at * 1000,
        source: "midi" as const,
        confidence: 1,
        velocityMeasured: true,
      })),
      ...g.targets
        .filter((t) => t.beat >= 4)
        .map((t) => ({
          kind: "noteon" as const,
          midi: padOf(t.voice),
          velocity: 0.8,
          at: t.beat * ms,
          source: "midi" as const,
          confidence: 1,
          velocityMeasured: true,
        })),
    ];
    const r = gradeGroove({
      targets: g.targets,
      voicePads,
      sectionLabels: g.sectionLabels,
      beatsPerBar: 4,
      beatMs: ms,
      startAt: 0,
      hits,
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.correct).toBe(true);
  });

  it("each card's hands match the groove: the right hand is where the sticking says", () => {
    for (const o of ORCHESTRATIONS) {
      const c = ls.find((x) => x.id === `pads.orchestrate:${o.id}`)!;
      const f = c.screens[0].figure!;
      expect(f.kind).toBe("pads");
      if (f.kind !== "pads") continue;
      const g = orchestrationGroove(o.id);
      const hasKick = g.targets.some((t) => t.voice === "kick");
      expect(c.screens[0].text.includes("no kick")).toBe(!hasKick);
      expect(Object.values(f.marks).some((m) => m === "K")).toBe(hasKick);
      const strokes = g.targets.filter((t) => t.voice !== "kick");
      strokes.forEach((t, i) => expect(f.marks[padOf(t.voice)]).toContain(PARADIDDLE[i % 8]));
      expect(c.screens[0].text).toContain(o.detail);
    }
  });
});

describe("note repeat", () => {
  it("the rates a drill sets each have a card, and the card's sound repeats at that rate", () => {
    for (const x of NOTE_REPEAT_EXERCISES) {
      const rates = repeatRates(x.id);
      expect(rates.length).toBeGreaterThan(0);
      const ls = padLessons("repeat", undefined, rates);
      expect(ls.length).toBe(1 + rates.length);
      ls.slice(1).forEach((l, i) => {
        const per = REPEAT_RATES.find((r) => r.id === rates[i])!.perBeat;
        const notes = l.screens[0].sound!.notes;
        expect(notes.length).toBe(per * 2);
        expect(notes[1].at - notes[0].at).toBeCloseTo(60 / BPM / per, 6);
        expect(l.screens[0].text).toContain(`${per} times a beat`);
      });
    }
    expect(repeatRates("build")).toEqual(["1/8", "1/16"]);
    expect(repeatRates("rolls").sort()).toEqual(["1/16", "1/16T", "1/32", "1/8"]);
  });

  it("the build screen reports the piece's own bars and the build's span", () => {
    const t = padLessons("repeat")[0].screens[2].text;
    expect(t).toContain("two bars at 1/8 and two bars at 1/16");
    expect(t).toContain(`${Math.round(BUILD.span * 100)} percent`);
  });
});

describe("song form", () => {
  it("each level's sound sits in its band of the default range, and rising rises", () => {
    for (const id of ["soft", "medium", "loud"] as const)
      for (const n of dynamicsSound(id).notes) {
        const l = inRange(n.velocity!, DEFAULT_RANGE);
        expect(l).toBeGreaterThanOrEqual(DYN_BANDS[id][0]);
        expect(l).toBeLessThanOrEqual(DYN_BANDS[id][1]);
      }
    const rise = dynamicsSound("rising").notes.map((n) => inRange(n.velocity!, DEFAULT_RANGE));
    expect([...rise].sort((a, b) => a - b)).toEqual(rise);
    expect(rise[rise.length - 1] - rise[0]).toBeGreaterThanOrEqual(BUILD.span);
  });

  it("the levels screen states the bands, and each card lists the piece's sections", () => {
    const intro = padLessons("song")[0];
    expect(intro.screens[1].text).toContain("soft is 0 to 45 percent");
    expect(intro.screens[1].text).toContain("medium 30 to 75");
    expect(intro.screens[1].text).toContain("loud 60 to 100");
    expect(intro.screens[1].options!.map((o) => o.label)).toEqual([
      "Soft",
      "Medium",
      "Loud",
      "Rising",
    ]);
    for (const f of SONG_FORMS) {
      const c = padLessons("song", undefined, [f.id])[1];
      for (const s of f.sections)
        expect(c.screens[0].text).toContain(`${s.label} (${s.bars} bars, ${s.dyn})`);
      expect(c.screens[0].text).toContain(
        `starts at ${f.bpm.start} BPM and aims for ${f.bpm.target}`,
      );
    }
    expect(padLessons("song", undefined, ["own-abc"]).length).toBe(1);
  });
});

describe("chop", () => {
  it("slice lengths match what each source says of itself", () => {
    const word: Record<string, string> = {
      sixteenths: "sixteenth",
      eighths: "eighth",
      beats: "beat",
    };
    for (const s of CHOP_SOURCES) expect(s.detail).toContain(word[sliceWord(s.bars)]);
  });

  it("the pads figure puts slice 1 on A01 and slice 16 on A16", () => {
    const f = padLessons("chop")[0].screens[0].figure!;
    expect(f.kind === "pads" && f.marks[36]).toBe("1");
    expect(f.kind === "pads" && f.marks[51]).toBe("16");
    expect(padLessons("chop")[0].screens[0].text).toContain("A01");
    expect(padLessons("chop")[0].screens[0].text).toContain("A16");
  });

  it("the flip edit leaves out exactly the slices it never plays", () => {
    const t = padLessons("chop")[0].screens[2].text;
    expect(t).toContain("Slices 5, 6, 7 and 8 never play");
  });

  it("edit cards list their steps and the loop they are written for", () => {
    for (const e of CHOP_EDITS) {
      const c = padLessons("chop", undefined, [`edit:${e.id}`])[1];
      const desc = e.label.split(":").slice(1).join(":").trim();
      if (desc) expect(c.screens[0].text.toLowerCase()).toContain(desc.toLowerCase());
      expect(c.screens[0].text.includes("lets the slice before")).toBe(e.steps.includes(0));
      expect(c.screens[0].text.includes("written for")).toBe(!!e.source);
    }
  });
});

describe("review fixes", () => {
  it("repeat rate cards play every hit at one velocity", () => {
    for (const r of REPEAT_RATES) {
      const [, c] = padLessons("repeat", undefined, [r.id]);
      expect(new Set(c.screens[0].sound!.notes.map((n) => n.velocity)).size).toBe(1);
      expect(c.screens[0].text).not.toContain("louder");
    }
  });

  it("the paradiddle bar text matches the sound: 16 strokes, four groups", () => {
    const step = padLessons("orchestrate")[0].screens[2].steps![2];
    const kick = padOf("kick");
    expect(step.sound!.notes.filter((n) => n.midi[0] !== kick).length).toBe(16);
    expect(step.text).toContain("Four groups");
  });

  it("every rudiment clip ends on a main stroke, never a lone grace note", () => {
    const [, c] = padLessons("rudiments", undefined, ["flam"]);
    const n = c.screens[0].sound!.notes;
    const mains = n.filter((x) => x.velocity !== 0.4);
    const graces = n.filter((x) => x.velocity === 0.4);
    expect(graces.length).toBe(mains.length);
    expect(Math.max(...n.map((x) => x.at))).toBe(Math.max(...mains.map((x) => x.at)));
  });

  it("cards do not repeat their title, and sticking figures name pads by hand only", () => {
    for (const [mode, items] of Object.entries(ALL_ITEMS))
      for (const l of padLessons(mode, 8, items).slice(1))
        for (const sc of l.screens) {
          expect(sc.text.startsWith(`${sc.title}:`)).toBe(false);
          expect(sc.text.startsWith(`${sc.title}.`)).toBe(false);
        }
    for (const k of RUDIMENT_ITEMS) {
      const f = padLessons("rudiments", undefined, [k])[1].screens[0].figure!;
      expect(f.kind === "pads" && f.names).toBeFalsy();
    }
  });
});
