import { describe, expect, it } from "vite-plus/test";
import guitar from "@repo/music-core/data/chord-positions-guitar-standard.json";
import ukulele from "@repo/music-core/data/chord-positions-ukulele-high-g.json";
import {
  CLIPS,
  GUITAR_SHAPES,
  OPEN_STRINGS,
  SECTIONS,
  UKULELE_SHAPES,
  clipFile,
  exampleSeconds,
  inputSlug,
  shapeMidis,
} from "./clips";
import { joinChunks, peakDbfs } from "./capture.svelte";
import { mergeManifest, type TakeEntry } from "./folder";

type Position = { frets: (number | null)[]; fingers: (number | null)[] };
const open = (book: unknown, id: string) => (book as Record<string, Position[]>)[id][0];

describe("the test clips", () => {
  it("lists 42 clips, numbered in order, in the README's sections", () => {
    expect(CLIPS.map((c) => c.n)).toEqual(Array.from({ length: 42 }, (_, i) => i + 1));
    const count = (s: string) => CLIPS.filter((c) => c.section === s).length;
    expect(SECTIONS.map(count)).toEqual([3, 18, 9, 6, 4, 2]);
    expect(CLIPS[4].title).toContain("320003");
    expect(CLIPS[41].slug).toBe("voice-hum");
  });

  it("gives every clip a target length, words, and a file name of its own", () => {
    for (const c of CLIPS) {
      expect(c.seconds, c.slug).toBeGreaterThan(0);
      expect(c.title.length, c.slug).toBeGreaterThan(0);
      expect(c.play.length, c.slug).toBeGreaterThan(10);
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      // No dash as punctuation in the words on screen.
      expect(c.title + c.play).not.toMatch(/[–—]| - /);
    }
    expect(new Set(CLIPS.map(clipFile)).size).toBe(42);
    expect(clipFile(CLIPS[4])).toBe("05-guitar-g.wav");
  });

  it("draws every shape on the right number of strings", () => {
    for (const c of CLIPS) {
      const strings = c.visual.instrument ? OPEN_STRINGS[c.visual.instrument].length : 0;
      for (const s of c.visual.shapes ?? []) {
        expect(s.frets, `${c.slug} ${s.name}`).toHaveLength(strings);
        expect(s.fingers, `${c.slug} ${s.name}`).toHaveLength(strings);
        s.frets.forEach((f, i) =>
          expect(!!s.fingers[i], `${c.slug} ${s.name} string ${i + 1}`).toBe(f !== null && f > 0),
        );
      }
      for (const n of c.visual.fret?.notes ?? []) {
        expect(n.string).toBeGreaterThanOrEqual(1);
        expect(n.string).toBeLessThanOrEqual(strings);
        expect(n.fret).toBeGreaterThanOrEqual(c.visual.fret!.from);
        expect(n.fret).toBeLessThanOrEqual(c.visual.fret!.to);
      }
    }
    // Every guitar and ukulele clip shows something to play from.
    for (const c of CLIPS.filter((c) => c.section === "Guitar" || c.section === "Ukulele"))
      expect(!!(c.visual.shapes || c.visual.fret || c.visual.strum), c.slug).toBe(true);
  });

  it("uses the app's own fingerings for the open chords", () => {
    const G = GUITAR_SHAPES;
    const pairs: [Position, Position][] = [
      [G.G, open(guitar, "guitar.g-major")],
      [G.C, open(guitar, "guitar.c-major")],
      [G.D, open(guitar, "guitar.d-major")],
      [G.Em, open(guitar, "guitar.e-minor")],
      [G.Am, open(guitar, "guitar.a-minor")],
      [G.E, open(guitar, "guitar.e-major")],
      [G.A, open(guitar, "guitar.a-major")],
      [G.Dm, open(guitar, "guitar.d-minor")],
      [UKULELE_SHAPES.C, open(ukulele, "ukulele.c-major")],
      [UKULELE_SHAPES.Am, open(ukulele, "ukulele.a-minor")],
      [UKULELE_SHAPES.F, open(ukulele, "ukulele.f-major")],
      [UKULELE_SHAPES.G, open(ukulele, "ukulele.g-major")],
      [UKULELE_SHAPES.G7, open(ukulele, "ukulele.g7")],
    ];
    for (const [mine, theirs] of pairs) {
      expect(mine.frets).toEqual(theirs.frets);
      expect(mine.fingers).toEqual(theirs.fingers);
    }
    // 320033: the same G with the B string on fret 3.
    expect(G.G33.frets).toEqual([3, 3, 0, 0, 2, 3]);
    expect(shapeMidis(G.G, "guitar")).toEqual([43, 47, 50, 55, 59, 67]);
    expect(shapeMidis(G.G33, "guitar")).toEqual([43, 47, 50, 55, 62, 67]);
  });

  it("has an example that fits inside the target length, with steps the page can light", () => {
    for (const c of CLIPS) {
      if (c.section !== "Room" || c.bpm) expect(c.example.length, c.slug).toBeGreaterThan(0);
      // A second of silence before, and the last note's tail inside the clip.
      expect(exampleSeconds(c), c.slug).toBeLessThanOrEqual(c.seconds - 1 + 0.25);
      const steps = Math.max(1, c.steps.length, c.visual.tab ? 8 : 0);
      for (const n of c.example) {
        expect(n.step, c.slug).toBeLessThan(steps);
        if (n.slot !== undefined) expect(n.slot, c.slug).toBeLessThan(c.visual.strum?.length ?? 0);
      }
      if (c.bpm) expect(c.click, c.slug).toBeDefined();
    }
    expect(CLIPS.filter((c) => c.click === "speakers").map((c) => c.n)).toEqual([2, 16]);
    // Down, down-up, up-down-up on "1 & 2 & 3 & 4 &".
    expect(CLIPS[14].visual.strum?.map((s) => s.stroke?.[0] ?? ".").join("")).toBe("d.du.udu");
    expect(CLIPS[14].visual.strum?.map((s) => s.count).join(" ")).toBe("1 & 2 & 3 & 4 &");
  });
});

describe("input folder names", () => {
  it("makes a short slug from a device label", () => {
    expect(inputSlug("Logitech BRIO (046d:085e)")).toBe("logitech-brio");
    expect(inputSlug("MacBook Pro Microphone (Built-in)")).toBe("macbook-pro-microphone");
    expect(inputSlug("Scarlett 2i2 USB (1235:8210)")).toBe("scarlett-2i2");
    expect(inputSlug("Default - MacBook Pro Microphone (Built-in)")).toBe("macbook-pro-microphone");
    expect(inputSlug("()")).toBe("input");
  });
});

describe("takes", () => {
  it("joins the worklet's chunks per channel and reads the peak", () => {
    const joined = joinChunks([
      [Float32Array.from([0.1, 0.2]), Float32Array.from([0, 0])],
      [Float32Array.from([-0.5]), Float32Array.from([0.25])],
    ]);
    expect(joined.map((c) => Array.from(c))).toEqual([
      [0.1, 0.2, -0.5].map(Math.fround),
      [0, 0, 0.25],
    ]);
    expect(peakDbfs(joined)).toBe(-6);
    expect(peakDbfs([new Float32Array(4)])).toBe(-60);
  });

  it("keeps one manifest entry per file, the newest take winning", () => {
    const entry = (file: string, clip: number, peakDbfs: number): TakeEntry => ({
      file,
      clip,
      title: "t",
      inputLabel: "Mic",
      inputSlug: file.split("/")[0],
      sampleRate: 48000,
      channels: 1,
      durationSec: 1,
      peakDbfs,
      recordedAt: "2026-11-15T10:00:00.000Z",
    });
    const first = mergeManifest(null, [
      entry("b/05-guitar-g.wav", 5, -12),
      entry("a/05-guitar-g.wav", 5, -9),
    ]);
    const next = mergeManifest(first, [
      entry("b/05-guitar-g.wav", 5, -3),
      entry("a/01-room-silence.wav", 1, -50),
    ]);
    expect(next.takes.map((t) => `${t.file} ${t.peakDbfs}`)).toEqual([
      "a/01-room-silence.wav -50",
      "a/05-guitar-g.wav -9",
      "b/05-guitar-g.wav -3",
    ]);
    expect(next.version).toBe(1);
  });
});
