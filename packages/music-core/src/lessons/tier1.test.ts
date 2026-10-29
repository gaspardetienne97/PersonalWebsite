import { describe, expect, it } from "vitest";
import {
  JAZZ_VOICING_TYPES,
  jazzVoicingChords,
  type JazzVoicingId,
} from "../content/jazz-voicings";
import { CALL_GROOVES, grooveOf } from "../content/call-response";
import { GROOVE_LANES, GROOVE_LEVELS, earGroove } from "../content/rhythm";
import { functionChord, keyCadence } from "../content/ear";
import { rng } from "../content/random";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import { lessonProblems } from "./check";
import {
  chordTones,
  chordTonesLesson,
  exampleVoicing,
  findHomeLesson,
  grooveDictationLesson,
  jazzVoicingLesson,
} from "./tier1";
import type { LessonFigure } from "./types";

const marksOf = (f: LessonFigure | undefined) => {
  if (f?.kind !== "keys") throw new Error("expected a keys figure");
  return f.marks;
};

describe("jazz voicing lessons", () => {
  const ids = JAZZ_VOICING_TYPES.map((t) => t.id);
  it("every type has a short lesson that passes the copy check", () => {
    for (const id of ids) {
      const ls = jazzVoicingLesson(id);
      expect(ls.length, id).toBeGreaterThan(0);
      for (const l of ls) expect(lessonProblems(l, "card"), l.id).toEqual([]);
    }
    expect(jazzVoicingLesson("nope")).toEqual([]);
  });
  it("ids: drop-2 comes after 4-way close", () => {
    expect(jazzVoicingLesson("drop2").map((l) => l.id)).toEqual([
      "voicing.four-way-close",
      "voicing.drop-2",
    ]);
    expect(jazzVoicingLesson("close").map((l) => l.id)).toEqual(["voicing.four-way-close"]);
    expect(jazzVoicingLesson("so-what").map((l) => l.id)).toEqual(["voicing.so-what"]);
    expect(new Set(ids.flatMap((id) => jazzVoicingLesson(id).map((l) => l.id))).size).toBe(
      ids.length,
    );
  });
  it("the picture is the drill's first chord, and each step adds one note from the bottom", () => {
    for (const id of ids) {
      const first = jazzVoicingLesson(id).at(-1)!;
      const [idea, stack] = first.screens;
      const c = exampleVoicing(id as JazzVoicingId);
      const shown = Object.keys(marksOf(idea.figure)).map(Number);
      expect(shown, id).toEqual([...c.left, ...c.right].sort((a, b) => a - b));
      expect(stack.steps!.length, id).toBe(shown.length);
      stack.steps!.forEach((st, i) => {
        expect(Object.keys(marksOf(st.figure)).map(Number), id).toEqual(shown.slice(0, i + 1));
      });
      // the sound plays the same notes as the picture
      expect(
        [...idea.sound!.notes[0].midi].sort((a, b) => a - b),
        id,
      ).toEqual(shown);
    }
  });
  it("drop-2 is the 4-way close chord with its second voice from the top dropped into the left hand", () => {
    const [closeL, dropL] = jazzVoicingLesson("drop2");
    const close = jazzVoicingChords("close", 0)[0];
    const drop = jazzVoicingChords("drop2", 0)[0];
    expect(Object.keys(marksOf(closeL.screens[0].figure)).map(Number)).toEqual(close.right);
    const dropped = close.right[2] - 12;
    expect(drop.left).toEqual([dropped]);
    expect(Object.keys(marksOf(dropL.screens[0].figure)).map(Number)).toEqual([
      dropped,
      ...close.right.filter((_, i) => i !== 2),
    ]);
    expect(dropL.screens[1].steps![0].text).toBe("Start on C, the lowest note, in the left hand.");
    expect(dropL.screens[1].steps![1].text).toBe(
      "Add F, a perfect 4th above C, in the right hand.",
    );
  });
  it("names the notes from the chord's own spelling", () => {
    const j = (id: string) => JSON.stringify(jazzVoicingLesson(id));
    expect(j("garland")).toContain("Bb");
    expect(j("garland")).not.toContain("A#");
    expect(j("upper")).toContain("Eb");
    expect(j("so-what")).toContain("Eb");
  });
  it("the sentences hold for every chord the drill gives", () => {
    const all = (id: JazzVoicingId, key = 0) => jazzVoicingChords(id, key);
    const gaps = (xs: number[]) => xs.slice(1).map((m, i) => m - xs[i]);
    for (const key of [0, 2, 5, 7, 10]) {
      for (const c of all("so-what", key)) {
        const n = [...c.left, ...c.right];
        expect(c.left, c.id).toEqual(n.slice(0, 2));
        // 4ths, perfect or augmented, with a major or minor 3rd on top
        expect(
          gaps(n)
            .slice(0, 3)
            .every((g) => g === 5 || g === 6),
          c.id,
        ).toBe(true);
        expect([3, 4], c.id).toContain(gaps(n)[3]);
      }
      for (const c of all("quartal", key)) {
        expect(c.right, c.id).toEqual([]);
        expect(
          gaps(c.left).every((g) => g === 5 || g === 6),
          c.id,
        ).toBe(true);
        expect(c.left.length).toBe(3);
      }
      for (const c of all("sus", key)) {
        const r = pc(c.left[0]);
        expect(pc(c.left[1])).toBe(pc(r + 7));
        expect(c.right.map(pc).sort((a, b) => a - b)).toEqual(
          [pc(r - 2), pc(r + 2), pc(r + 5)].sort((a, b) => a - b),
        );
      }
      for (const c of all("close", key)) {
        expect(c.right.length).toBe(4);
        expect(c.right[3] - c.right[0]).toBeLessThanOrEqual(11);
      }
      for (const c of all("drop2", key)) {
        expect(c.left.length).toBe(1);
        expect(c.right.length).toBe(3);
        expect(c.left[0]).toBeLessThan(c.right[0]);
      }
      for (const c of all("locked", key)) {
        expect(c.left).toEqual([c.right[3] - 12]);
        expect(c.right[3] - c.right[0]).toBeLessThanOrEqual(11);
      }
      for (const c of all("garland", key)) {
        expect(c.right.map((m) => m - c.right[0])).toEqual([0, 7, 12]);
        expect(c.left.length).toBe(3);
      }
      for (const c of all("evans", key)) {
        expect(c.left.length).toBe(3);
        expect(c.right.length).toBe(2);
      }
      for (const c of all("two-hand", key)) {
        expect(c.left.length).toBe(2);
        expect(c.right.length).toBe(3);
      }
      for (const c of all("monk", key)) expect(c.left.length).toBe(1);
      for (const c of all("sevenths", key)) expect(c.right.length).toBe(4);
    }
    // sevenths take their quality from the key
    expect(
      all("sevenths")
        .slice(0, 7)
        .map((c) => c.symbol.replace(/^[A-G][b#]?/, "")),
    ).toEqual(["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"]);
  });
});

describe("groove dictation lesson", () => {
  const l = grooveDictationLesson();
  it("id and copy check", () => {
    expect(l.id).toBe("rhythm.groove-parts");
    expect(lessonProblems(l)).toEqual([]);
  });
  it("the example sounds are drum hits on the drill's own lanes", () => {
    const midis = Object.fromEntries(GROOVE_LANES.map((x) => [x.id, x.midi]));
    const [kick, snare, hat] = l.screens;
    for (const [s, lane] of [
      [kick, "kick"],
      [snare, "snare"],
      [hat, "hat"],
    ] as const) {
      expect(s.sound!.notes.length).toBeGreaterThan(0);
      for (const n of s.sound!.notes) {
        expect(n.drum).toBe(true);
        expect(n.midi).toEqual([midis[lane]]);
      }
    }
    // kick on 1 and 3, as the text says; snare on 2 and 4 (beats 1 and 3 counting from 0)
    const beats = (s: typeof kick) => s.sound!.notes.map((n) => (n.at * 100) / 60);
    expect(beats(kick)).toEqual([0, 2]);
    expect(beats(snare)).toEqual([1, 3]);
  });
  it("the counts in the steps are the example's lanes", () => {
    const steps = l.screens[3].steps!;
    expect(steps[0].text).toBe("The hi-hat plays on 1, 1&, 2, 2&, 3, 3&, 4 and 4&.");
    expect(steps[1].text).toBe("The snare joins on 2 and 4.");
    expect(steps[2].text).toBe("The kick lands on 1 and 3.");
    expect(steps[2].sound!.notes.length).toBe(steps[0].sound!.notes.length + 2 + 2);
  });
  it("the claims hold for every groove the levels can make", () => {
    const sixteenthsAdded = { snare: false, hats: false };
    for (let seed = 1; seed <= 200; seed++) {
      for (const level of GROOVE_LEVELS) {
        const g = earGroove(rng(seed), level.id);
        for (let bar = 0; bar < g.bars; bar++) {
          const inBar = (b: number) => b >= bar * 4 && b < bar * 4 + 4;
          // the kick is on beat 1 of every bar
          expect(g.lanes.kick.includes(bar * 4), `${level.id} ${seed}`).toBe(true);
          const snare = g.lanes.snare.filter(inBar).map((b) => b - bar * 4);
          if (level.id === "trap") expect(snare).toContain(2);
          else expect(snare).toEqual(expect.arrayContaining([1, 3]));
          if (level.id === "rock" || level.id === "offbeats") expect(snare).toEqual([1, 3]);
          if (level.id === "sixteenths" && snare.length > 2) sixteenthsAdded.snare = true;
        }
        const hatGap = g.lanes.hat[1] - g.lanes.hat[0];
        if (level.perBeat === 2) expect(hatGap).toBe(0.5);
        else expect([0.25, 0.5]).toContain(hatGap);
        if (hatGap === 0.25) sixteenthsAdded.hats = true;
      }
    }
    expect(sixteenthsAdded).toEqual({ snare: true, hats: true });
    expect(l.screens[4].text).toContain(
      "rock beats, then kicks off the beat, then sixteenth kicks and ghost snares, then trap",
    );
  });
});

describe("find home lesson", () => {
  const l = findHomeLesson();
  it("id and copy check", () => {
    expect(l.id).toBe("by-ear.home");
    expect(lessonProblems(l)).toEqual([]);
  });
  it("the cadence steps play the drill's I IV V I and light each chord's own notes", () => {
    const steps = l.screens[1].steps!;
    const cad = keyCadence(0);
    expect(steps.map((s) => s.sound!.notes[0].midi)).toEqual(cad.map((e) => e.midi));
    expect(steps.map((s) => Object.keys(marksOf(s.figure)).map(Number))).toEqual(
      ["I", "IV", "V", "I"].map((t) => functionChord(0, t).slice(1)),
    );
    expect(steps[0].text).toMatch(/^C, the I chord/);
    expect(steps[1].text).toMatch(/^F, the IV chord/);
    expect(steps[2].text).toMatch(/^G, the V chord/);
  });
  it("the scale climbs 1 to 7 and back to 1 on the tonic", () => {
    const marks = marksOf(l.screens[2].figure);
    expect(Object.values(marks)).toEqual(
      ["1", "2", "3", "4", "5", "6", "7"].concat(["1"]).slice(0, Object.keys(marks).length),
    );
    const ms = Object.keys(marks).map(Number);
    expect(pc(ms[0])).toBe(pc(ms[ms.length - 1]));
  });
});

describe("chord tones lesson", () => {
  it("lights the chord's R 3 5 7, named from its own spelling", () => {
    const l = chordTonesLesson("C7");
    expect(lessonProblems(l)).toEqual([]);
    expect(l.id).toBe("call-response.chord-tones");
    expect(Object.values(marksOf(l.screens[0].figure))).toEqual(["R", "3", "5", "b7"]);
    expect(l.screens[0].text).toContain("C7 is made of C, E, G and Bb");
    expect(Object.values(marksOf(chordTonesLesson("Cmaj7").screens[0].figure))).toEqual([
      "R",
      "3",
      "5",
      "7",
    ]);
    expect(Object.values(marksOf(chordTonesLesson("Am").screens[0].figure))).toEqual([
      "R",
      "b3",
      "5",
    ]);
  });
  it("every chord of every call groove lights exactly the notes the drill counts", () => {
    for (const g of CALL_GROOVES) {
      for (const ch of grooveOf(g.id).chords) {
        const l = chordTonesLesson(ch.symbol);
        expect(lessonProblems(l), ch.symbol).toEqual([]);
        const tones = chordTones(ch.symbol);
        const parsed = parseChordSymbol(ch.symbol)!;
        expect(
          tones.map((t) => pc(t.midi)).sort((a, b) => a - b),
          ch.symbol,
        ).toEqual(parsed.pcs);
        expect(Object.keys(marksOf(l.screens[0].figure)).map(Number)).toEqual(
          tones.map((t) => t.midi),
        );
        // each step lights one more tone
        expect(l.screens[1].steps!.length).toBe(tones.length);
      }
    }
    expect(chordTones("Dm7b5").map((t) => t.name)).toEqual(["D", "F", "Ab", "C"]);
    expect(chordTones("G7alt").map((t) => t.name)).toEqual(["G", "B", "F", "Ab", "A#", "C#", "Eb"]);
    expect(chordTones("G7alt").map((t) => t.label)).toEqual([
      "R",
      "3",
      "b7",
      "b9",
      "#9",
      "#11",
      "b13",
    ]);
  });
});
