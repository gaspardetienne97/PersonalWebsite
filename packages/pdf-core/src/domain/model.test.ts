import { describe, expect, it } from "vite-plus/test";

import {
  BASE_WPM,
  buildModel,
  chapterHeading,
  fmt,
  fmtClock,
  fmtLong,
  MS_PER_WORD,
  sentenceAt,
  wordIndexAt,
} from "./model";
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

describe("fmtClock", () => {
  it("is the same clock time as fmt", () => {
    expect(fmtClock(58_000)).toBe("0:58");
    expect(fmtClock(3_660_000)).toBe("1:01:00");
  });
});

describe("sentenceAt", () => {
  it("gives the sentence a position falls in, and the first one before any start", () => {
    const model = buildModel(doc([["One two three. Four five."]]));
    const [first, second] = model.sentences;
    expect(sentenceAt(model, 0)).toBe(first);
    expect(sentenceAt(model, second.start - 1)).toBe(first);
    expect(sentenceAt(model, second.start + 50)).toBe(second);
    expect(sentenceAt(model, model.total)).toBe(second);
    expect(sentenceAt(buildModel(doc([[]])), 10)).toBeUndefined();
  });
});

describe("chapterHeading", () => {
  it("is the first paragraph when it says the chapter's name and text follows", () => {
    const model = buildModel(
      doc([
        ["Chapter 1", "It was a bright cold day. The clocks struck."],
        ["It began without a heading.", "Chapter 2"],
      ]),
    );
    // "Chapter" and "1": the first two words of the document.
    expect(chapterHeading(model, 0)).toEqual({ wordStart: 0, wordEnd: 1 });
    expect(chapterHeading(model, 1)).toBeNull();
  });

  it("ignores case and spacing, and takes a name of several sentences whole", () => {
    const model = buildModel({
      ...doc([["PART ONE.  The  Start", "Then the text."]]),
      chapters: [
        {
          id: "c",
          title: "Part One. The Start",
          paragraphs: ["PART ONE.  The  Start", "Then the text."],
        },
      ],
    });
    expect(chapterHeading(model, 0)).toEqual({ wordStart: 0, wordEnd: 3 });
  });

  it("is null for a chapter that is only its name, has no name, or does not exist", () => {
    expect(chapterHeading(buildModel(doc([["Chapter 1"]])), 0)).toBeNull();
    const unnamed = buildModel({
      ...doc([[]]),
      chapters: [{ id: "c", title: "", paragraphs: ["", "Text."] }],
    });
    expect(chapterHeading(unnamed, 0)).toBeNull();
    expect(chapterHeading(buildModel(doc([["Chapter 1", "Text."]])), 4)).toBeNull();
  });
});

describe("fmtLong", () => {
  it("gives minutes with a unit, and at least one for anything with a length", () => {
    expect(fmtLong(0)).toBe("0 min");
    expect(fmtLong(20_000)).toBe("1 min");
    expect(fmtLong(220_000)).toBe("4 min");
  });

  it("gives hours and minutes, and whole hours alone", () => {
    expect(fmtLong(3_840_000)).toBe("1 h 4 min");
    expect(fmtLong(7_200_000)).toBe("2 h");
  });

  it("reads negative and non-finite input as nothing", () => {
    expect(fmtLong(-5)).toBe("0 min");
    expect(fmtLong(Number.NaN)).toBe("0 min");
  });
});
