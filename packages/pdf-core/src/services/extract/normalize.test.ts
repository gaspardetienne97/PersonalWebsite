import { describe, expect, it } from "vite-plus/test";

import {
  chaptersFromText,
  cleanText,
  paragraphsFromText,
  titleFromFilename,
  wordCount,
} from "./normalize";

describe("cleanText", () => {
  it("joins words hyphenated across line breaks", () => {
    expect(cleanText("under-\nstanding things")).toBe("understanding things");
  });

  it("normalizes CRLF and collapses runs of spaces", () => {
    expect(cleanText("a  b\r\nc\rd")).toBe("a b\nc\nd");
  });
});

describe("paragraphsFromText", () => {
  it("splits on blank lines and unwraps soft line breaks", () => {
    const paras = paragraphsFromText("First line\nstill first.\n\nSecond paragraph.");
    expect(paras).toEqual(["First line still first.", "Second paragraph."]);
  });

  it("drops empty paragraphs", () => {
    expect(paragraphsFromText("\n\n  \n\nOnly one.\n\n")).toEqual(["Only one."]);
  });
});

describe("chaptersFromText", () => {
  it("splits chapters on markdown headings", () => {
    const text = "# Book\n\nIntro para.\n\n## First\n\nAlpha.\n\n## Second\n\nBeta.";
    const chapters = chaptersFromText(text, "fallback");
    expect(chapters.map((c) => c.title)).toEqual(["Book", "First", "Second"]);
    expect(chapters[1].paragraphs).toEqual(["Alpha."]);
  });

  it("falls back to a single chapter without headings", () => {
    const chapters = chaptersFromText("Just some text.\n\nMore text.", "My Doc");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("My Doc");
    expect(chapters[0].paragraphs).toHaveLength(2);
  });

  it("skips heading-only sections with no body text", () => {
    const chapters = chaptersFromText("## Empty\n\n## Full\n\nContent here.", "fallback");
    expect(chapters.map((c) => c.title)).toEqual(["Full"]);
  });
});

describe("wordCount", () => {
  it("counts words across chapters", () => {
    const chapters = [
      { id: "1", title: "A", paragraphs: ["one two", "three"] },
      { id: "2", title: "B", paragraphs: ["four five six"] },
    ];
    expect(wordCount(chapters)).toBe(6);
  });
});

describe("titleFromFilename", () => {
  it("strips the extension and underscores", () => {
    expect(titleFromFilename("my_great-book.epub")).toBe("my great book");
  });
});
