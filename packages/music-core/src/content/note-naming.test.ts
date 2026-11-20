// The display text content builds follows the note names: letters stay as
// they were, fixed do names every note, chord and key.
import { afterEach, describe, expect, it } from "vite-plus/test";
import { TUNINGS } from "../data";
import { setNamingKey, setNoteNaming } from "../theory/note-names";
import { rangeText, jamHint, gameOf } from "../scoring/improv";
import { REGISTER_PAIRS, TRILL_PAIRS } from "./aero-skills";
import { circlePrompt } from "./circle";
import { keyChangeCaption } from "./ear";
import { keyText, PROGRESSIONS } from "./jam";
import { jazzVoicingChords } from "./jazz-voicings";
import { CHORD_LOOPS, loopPrompt } from "./loops";
import { allPhrases } from "./phrases";
import { LICKS, lickTip, transposeText } from "./piano";
import { rng } from "./random";
import { STRUM_PATTERNS } from "./strums";
import { REHARM_DEVICES, TUNES } from "./tunes";
import { FINGERING_LESSONS } from "./winds-pads";

afterEach(() => {
  setNoteNaming("letters");
  setNamingKey(undefined);
});

const lick21 = LICKS.find((l) => l.number === 21)!;

describe("content text with letters", () => {
  it("reads as it always has", () => {
    expect(keyText("Bb dorian")).toBe("Bb dorian");
    expect(lickTip(lick21)).toBe("Half-step-below approaches: C# to D and F# to G.");
    expect(transposeText(lickTip(lick21), 2, true)).toBe(
      "Half-step-below approaches: D# to E and G# to A.",
    );
    expect(FINGERING_LESSONS[0].label).toBe("G A B");
    expect(TUNINGS.ukulele.map((t) => t.name)).toEqual(["High G", "Low G", "Baritone DGBE"]);
    expect(STRUM_PATTERNS[0].label).toBe("Ukulele: D DU D DU (C Am F G)");
    expect(TUNES[0].name).toBe("Jazz blues in F");
  });
});

describe("content text in fixed do", () => {
  it("names keys, tunes, tunings and lesson labels", () => {
    setNoteNaming("fixed");
    expect(keyText("Bb dorian")).toBe("Sib dorian");
    expect(keyText("C")).toBe("Do");
    expect(TUNES[0].name).toBe("Jazz blues in Fa");
    expect(PROGRESSIONS.find((p) => p.id === "guitar-g-d-em-c")!.name).toBe("Sol-Re-Mim-Do");
    expect(REHARM_DEVICES[0].about).toBe(
      "A dominant becomes the dominant a tritone away (Sol7 to Reb7).",
    );
    expect(TUNINGS.ukulele.map((t) => t.name)).toEqual([
      "High Sol",
      "Low Sol",
      "Baritone Re Sol Si Mi",
    ]);
    expect(TUNINGS.guitar.map((t) => t.name)).toEqual([
      "Standard",
      "Drop Re",
      "DADGAD",
      "Open Sol",
    ]);
    expect(FINGERING_LESSONS.slice(0, 6).map((l) => l.label)).toEqual([
      "Sol La Si",
      "Mi Fa Sol",
      "Do Re Mi",
      "Do to Sol",
      "Sol to Do",
      "Do major",
    ]);
    expect(REGISTER_PAIRS.find((p) => p.id === "cs4-b3")).toMatchObject({
      label: "Do#4 to Si3",
      detailText: "left pinky, Do# to Si",
      detail: "left pinky, C# to B",
    });
    expect(TRILL_PAIRS[0].label).toBe("Sol4 La4");
    expect(STRUM_PATTERNS[0].label).toBe("Ukulele: D DU D DU (Do Lam Fa Sol)");
  });

  it("names phrase titles and lick tips, and moves a tip into another key", () => {
    setNoteNaming("fixed");
    const titles = allPhrases().map((p) => p.title);
    expect(titles).toContain("Do, Lam, Fa, Sol");
    expect(titles).toContain("Blues turnaround in Fa");
    expect(lickTip(lick21)).toBe("Half-step-below approaches: Do# to Re and Fa# to Sol.");
    expect(transposeText(lickTip(lick21), 2, true)).toBe(
      "Half-step-below approaches: Re# to Mi and Sol# to La.",
    );
    expect(lickTip(lick21, -2)).toBe("Half-step-below approaches: Si to Do and Mi to Fa.");
  });

  it("names prompts, captions and hints", () => {
    setNoteNaming("fixed");
    expect(keyChangeCaption(0, "relative IV V")).toMatch(/^Do major to La minor, .*: /);
    const loop = loopPrompt(rng(1), {
      loop: CHORD_LOOPS.find((l) => l.id === "pop.pop-axis")!,
      difficulty: 0.5,
      keyPc: 7,
    });
    expect(loop.caption).toContain("In Sol major: Sol, Re, Mim, Do");
    const ask = circlePrompt(rng(3), { mode: "count", band: "near" }).ask;
    expect(ask).not.toMatch(/\b[A-G][#b]?\b/);
    const [seventh] = jazzVoicingChords("sevenths", 0);
    expect(seventh.symbol).toBe("Cmaj7");
    expect(seventh.ask).toBe("Play Domaj7 in root position.");
    expect(
      jamHint(gameOf("three-notes"), 5, { symbol: "F7", scale: { rootPc: 5, name: "mixolydian" } }),
    ).toBe("Only the Fa minor triad: Fa, Lab, Do.");
    expect(rangeText({ low: 58, high: 77 })).toMatch(/^Sib3 to Fa5/);
  });
});
