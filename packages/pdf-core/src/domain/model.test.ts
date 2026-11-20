import { describe, expect, it } from "vite-plus/test";

import { BASE_WPM, buildModel, fmt, MS_PER_WORD, wordIndexAt } from "./model";
import type { NarratorDoc } from "./types";

function doc(paragraphsByChapter: string[][]): NarratorDoc {
  return {
    id: "t",
    title: "T",
    author: "A",
    kind: "txt",
    accent: "#1291FA",
    meta: "test",
    voice: "Aria — calm British",
    progress: 0,
    chapters: paragraphsByChapter.map((paragraphs, i) => ({
      id: "c" + i,
      title: "Chapter " + (i + 1),
      paragraphs,
    })),
  };
}

describe("buildModel", () => {
  it("tokenizes every word and assigns chapter/paragraph indices", () => {
    const model = buildModel(doc([["One two three.", "Four five."]]));
    expect(model.tokens.map((t) => t.word)).toEqual(["One", "two", "three.", "Four", "five."]);
    expect(model.tokens.map((t) => t.pi)).toEqual([0, 0, 0, 1, 1]);
    expect(model.tokens.every((t) => t.ci === 0)).toBe(true);
  });

  it("splits sentences on terminal punctuation, including closing quotes", () => {
    const model = buildModel(doc([['He said "stop." Then he left. And waited']]));
    // "stop." ends a sentence even with the closing quote; trailing text without
    // terminal punctuation still closes its sentence at paragraph end.
    expect(model.sentences).toHaveLength(3);
    expect(model.sentences[0].wordEnd).toBe(2); // He said "stop."
    expect(model.sentences[2].wordEnd).toBe(model.tokens.length - 1);
  });

  it("produces a monotonically increasing timeline that sums to total", () => {
    const model = buildModel(doc([["Alpha beta gamma. Delta epsilon."], ["Zeta eta."]]));
    for (let i = 1; i < model.tokens.length; i++) {
      expect(model.tokens[i].start).toBeGreaterThan(model.tokens[i - 1].start);
    }
    const last = model.tokens[model.tokens.length - 1];
    expect(model.total).toBeGreaterThanOrEqual(last.start + last.dur);
    expect(model.chapters).toHaveLength(2);
    expect(model.chapters[1].start).toBeGreaterThan(model.chapters[0].start);
    expect(model.chapters[1].end).toBe(model.total);
  });

  it("scales word duration with letter count within clamps", () => {
    const model = buildModel(doc([["a extraordinarily"]]));
    const [short, long] = model.tokens;
    expect(short.dur).toBeCloseTo(MS_PER_WORD * 0.7, 5);
    expect(long.dur).toBeCloseTo(MS_PER_WORD * 1.9, 5);
  });

  it("uses the documented words-per-minute baseline", () => {
    expect(MS_PER_WORD).toBeCloseTo(60_000 / BASE_WPM, 5);
  });
});

describe("wordIndexAt", () => {
  it("finds the active token for a playhead position", () => {
    const model = buildModel(doc([["One two three. Four five."]]));
    expect(wordIndexAt(model, 0)).toBe(0);
    expect(wordIndexAt(model, model.tokens[2].start + 1)).toBe(2);
    expect(wordIndexAt(model, model.total)).toBe(model.tokens.length - 1);
  });

  it("returns -1 for an empty model", () => {
    const model = buildModel(doc([[]]));
    expect(wordIndexAt(model, 0)).toBe(-1);
  });
});

describe("fmt", () => {
  it("formats minutes and seconds", () => {
    expect(fmt(0)).toBe("0:00");
    expect(fmt(65_000)).toBe("1:05");
    expect(fmt(600_000)).toBe("10:00");
  });

  it("formats hours with two-digit minutes", () => {
    expect(fmt(3_600_000)).toBe("1:00:00");
    expect(fmt(3_660_000)).toBe("1:01:00");
  });

  it("clamps negative and non-finite input to zero", () => {
    expect(fmt(-5)).toBe("0:00");
    expect(fmt(Number.NaN)).toBe("0:00");
  });
});
