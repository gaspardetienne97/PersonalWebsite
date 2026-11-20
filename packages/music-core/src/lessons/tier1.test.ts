import { describe, expect, it } from "vite-plus/test";
import {
  JAZZ_VOICING_TYPES,
  jazzVoicingChords,
  type JazzVoicingId,
} from "../content/jazz-voicings";
import { CALL_GROOVES, grooveOf } from "../content/call-response";
import { GROOVE_LANES, GROOVE_LEVELS, earGroove } from "../content/rhythm";
import { functionChord, keyCadence } from "../content/ear";
import { rng } from "../content/random";
import { TUNES } from "../content/tunes";
import { isBlackKey } from "../theory/notes";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import { lessonProblems } from "./check";
import { gradeImprovise } from "../content/pad-skills";
import { VIBRATO_SETS } from "../content/aero-skills";
import {
  biteVibratoLesson,
  padImproviseLesson,
  variedBar,
  vibratoRate,
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

describe("fix round 1", () => {
  const sub = (symbol: string) => parseChordSymbol(symbol)!;
  const rel = (m: number, root: number) => pc(m - root);
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

  it("the groove lesson shows the drill's grid with the example's own onsets", () => {
    const l = grooveDictationLesson();
    const g = earGroove(() => 0, "rock");
    const fig = (f: LessonFigure | undefined) => {
      if (f?.kind !== "groove") throw new Error("expected a groove figure");
      return f;
    };
    expect(fig(l.screens[0].figure).lanes).toEqual({ kick: g.lanes.kick });
    expect(fig(l.screens[1].figure).lanes).toEqual({ snare: g.lanes.snare });
    expect(fig(l.screens[2].figure).lanes).toEqual({ hat: g.lanes.hat });
    expect(fig(l.screens[3].figure).lanes).toEqual({});
    const steps = l.screens[3].steps!.map((s) => fig(s.figure).lanes);
    expect(steps.map((x) => Object.keys(x))).toEqual([
      ["hat"],
      ["hat", "snare"],
      ["hat", "snare", "kick"],
    ]);
    expect(fig(l.screens[4].figure).lanes).toEqual(g.lanes);
    for (const s of [0, 1, 2, 3, 4]) {
      expect(fig(l.screens[s].figure).bars).toBe(g.bars);
      expect(fig(l.screens[s].figure).perBeat).toBe(g.perBeat);
    }
  });

  it("keys figures start and end on a white key", () => {
    const figs: LessonFigure[] = [];
    for (const id of JAZZ_VOICING_TYPES.map((t) => t.id))
      for (const lesson of jazzVoicingLesson(id))
        for (const sc of lesson.screens) {
          if (sc.figure) figs.push(sc.figure);
          for (const st of sc.steps ?? []) if (st.figure) figs.push(st.figure);
        }
    for (const l of [findHomeLesson(), chordTonesLesson("C7"), chordTonesLesson("G7alt")])
      for (const sc of l.screens) {
        if (sc.figure) figs.push(sc.figure);
        for (const st of sc.steps ?? []) if (st.figure) figs.push(st.figure);
      }
    const keysFigs = figs.filter((f) => f.kind === "keys");
    expect(keysFigs.length).toBeGreaterThan(50);
    for (const f of keysFigs) {
      expect(isBlackKey(f.low)).toBe(false);
      expect(isBlackKey(f.high)).toBe(false);
      for (const m of Object.keys(f.marks).map(Number)) {
        expect(m).toBeGreaterThanOrEqual(f.low);
        expect(m).toBeLessThanOrEqual(f.high);
      }
    }
  });

  it("the sus example and its sentence name the pictured chord", () => {
    const [l] = jazzVoicingLesson("sus");
    const c = exampleVoicing("sus");
    expect(c.symbol).toBe("C7sus");
    expect(l.screens[0].text).toContain("For C7sus that triad is Bb major, written Bb/C.");
    expect(c.right.map(pc).sort((a, b) => a - b)).toEqual([2, 5, 10]); // D F Bb
    expect(sorted(c.left.map(pc))).toEqual([0, 7]);
  });

  it("the Monk picture is a chord with the cluster on top", () => {
    const c = exampleVoicing("monk");
    const [l] = jazzVoicingLesson("monk");
    expect(c.right.length).toBe(4);
    const top = c.right.slice(-2);
    expect(top[1] - top[0]).toBe(1); // the root and b9 a half step apart
    expect(l.screens[1].text).toContain(c.symbol);
    expect(l.screens[1].steps!.length).toBe(c.left.length + c.right.length);
  });

  it("So What names the real exceptions", () => {
    expect(jazzVoicingLesson("so-what")[0].screens[0].text).toContain(
      "a 4th can grow to an augmented 4th and the top 3rd can shrink to a minor 3rd",
    );
  });

  it("the sus about text matches the Maiden Voyage roots", () => {
    const roots = jazzVoicingChords("sus", 2).map((c) => pc(c.left[0]));
    expect(roots).toEqual([2, 5, 3, 1]);
    const sus = JAZZ_VOICING_TYPES.find((t) => t.id === "sus")!;
    expect(sus.about).toContain("up a minor 3rd, then down a whole step twice");
  });

  it("every chord in every tune keeps the tune-type sentences", () => {
    for (const tune of TUNES) {
      for (const c of jazzVoicingChords("quartal-tune", 0, { tune: tune.id })) {
        const p = sub(c.symbol);
        const root = p.rootPc;
        expect(c.right, c.symbol).toEqual([]);
        expect(c.left.length, c.symbol).toBe(3);
        // two 4ths, except the diminished-scale chords (b9 dominants, diminished 7ths): a tritone under a 4th
        const gaps = [c.left[1] - c.left[0], c.left[2] - c.left[1]];
        expect(gaps, c.symbol).toEqual(/b9|dim7/.test(c.symbol) ? [6, 5] : [5, 5]);
        const iv = p.intervals.map((i) => i % 12);
        const has = (i: number) => iv.includes(i);
        // the guide tones the sentence names
        const guides = [
          ...[3, 4].filter(has),
          ...[10, 11].filter(has),
          ...(has(5) && !has(3) && !has(4) ? [5] : []),
          ...(has(9) ? [9] : []),
        ];
        expect(
          c.left.some((m) => guides.includes(rel(m, root))),
          `${tune.id} ${c.symbol} has no guide tone in ${c.left.map((m) => rel(m, root))}`,
        ).toBe(true);
      }
      for (const c of jazzVoicingChords("slash-tune", 0, { tune: tune.id })) {
        const p = sub(c.symbol);
        const root = p.rootPc;
        const has = (i: number) => p.intervals.map((x) => x % 12).includes(i);
        const triad = sorted(c.right.map(pc));
        const major = (r: number) => sorted([r, r + 4, r + 7].map(pc));
        if (has(3) && has(6) && !has(4) && !has(9))
          expect(triad, c.symbol).toEqual(sorted([3, 6, 10].map((i) => pc(root + i))));
        else if (has(10)) expect(triad, c.symbol).toEqual(major(root + 10));
        else if (!has(3)) expect(triad, c.symbol).toEqual(major(root + 7));
      }
      for (const c of jazzVoicingChords("upper", 0, { tune: tune.id })) {
        const p = sub(c.symbol);
        const root = p.rootPc;
        expect(sorted(c.left.map(pc)), c.symbol).toEqual(
          sorted([0, 4, 10].map((i) => pc(root + i))),
        );
        const tri = sorted(c.right.map(pc));
        const kinds = [2, 8, 9].map((o) => sorted([o, o + 4, o + 7].map((i) => pc(root + i))));
        expect(
          kinds.some((k) => k.join() === tri.join()),
          c.symbol,
        ).toBe(true);
      }
    }
  });
});

describe("bite vibrato lesson", () => {
  const l = biteVibratoLesson();
  it("is valid", () => {
    expect(l.id).toBe("aerophone.vibrato");
    expect(lessonProblems(l)).toEqual([]);
  });
  it("plays each of the drill's rates, as cycles a second", () => {
    const opts = l.screens[1].options!;
    expect(opts).toHaveLength(VIBRATO_SETS.length);
    VIBRATO_SETS.forEach((v, i) => {
      const n = opts[i].sound.notes;
      // two notes a cycle over two seconds
      expect(n.length).toBe(Math.round(2 * vibratoRate(v) * 2));
      expect(n[2].at - n[0].at).toBeCloseTo(1 / vibratoRate(v), 6);
    });
    expect(vibratoRate(VIBRATO_SETS[3])).toBeCloseTo(16 / 3, 6);
    expect(l.screens[1].text).toContain("is 5.3 a second");
  });
});

describe("pads improvise lesson", () => {
  const l = padImproviseLesson();
  it("is valid", () => {
    expect(l.id).toBe("pads.improvise");
    expect(lessonProblems(l)).toEqual([]);
  });
  it("the example fill bar passes the drill's fill rule", () => {
    const fig = l.screens[2].figure;
    if (fig?.kind !== "groove") throw new Error("groove figure");
    const beatMs = 600;
    const hits = (bar: number, midi = 38) =>
      Object.values(fig.lanes)
        .flat()
        .filter((b) => Math.floor(b! / 4) === bar)
        .map((b) => ({ at: (bar * 4 + (b % 4)) * beatMs, midi }));
    // three groove bars, the example fill bar, then a hit on the next one
    const take = [
      ...hits(0),
      ...hits(0).map((h) => ({ ...h, at: h.at + 4 * beatMs })),
      ...hits(0).map((h) => ({ ...h, at: h.at + 8 * beatMs })),
      ...hits(1).map((h) => ({ ...h, at: h.at + 8 * beatMs })),
      { at: 16 * beatMs, midi: 49 },
    ];
    const g = gradeImprovise(take, 0, beatMs, 4, { fillEvery: 4 });
    expect(g.fills).toEqual({ expected: 1, landed: 1 });
  });
  it("the varied bar is the groove bar plus one kick", () => {
    const [plain, varied] = l.screens[1].options!.map((o) => o.figure);
    if (plain?.kind !== "groove" || varied?.kind !== "groove") throw new Error("groove figures");
    expect(varied.lanes.kick).toEqual([...plain.lanes.kick!, 3.5]);
    expect(varied.lanes.snare).toEqual(plain.lanes.snare);
    expect(variedBar().kick).toEqual(varied.lanes.kick);
  });
  it("the fill bar's snare and hat match the text, and the leave-space bar has no hat", () => {
    const count = (f: LessonFigure | undefined, bar: number, lane?: "snare" | "hat") => {
      if (f?.kind !== "groove") throw new Error("groove figure");
      return Object.entries(f.lanes)
        .filter(([k]) => !lane || k === lane)
        .flatMap(([, v]) => v!)
        .filter((b) => Math.floor(b / 4) === bar).length;
    };
    const fig = l.screens[2].figure;
    // the text: the same hi-hat in the fill bar, snare eighths on 3 and 4
    expect(count(fig, 1, "snare")).toBeGreaterThan(count(fig, 0, "snare"));
    const hats = (bar: number) =>
      (fig as { lanes: { hat: number[] } }).lanes.hat
        .filter((b) => Math.floor(b / 4) === bar)
        .map((b) => b % 4);
    expect(hats(1)).toEqual(hats(0));
    expect(count(fig, 1)).toBe(14);
    const space = l.screens[3].figure;
    if (space?.kind !== "groove") throw new Error("groove figure");
    expect(space.lanes.hat).toEqual([]);
    expect(count(space, 0)).toBeGreaterThanOrEqual(2);
  });
});
