import { describe, expect, it } from "vite-plus/test";

import {
  authorName,
  byline,
  formatLabel,
  isSample,
  lengthLine,
  markMatches,
  matchesQuery,
  SAMPLE_DOCS,
} from "./data";
import type { NarratorDoc } from "./types";

const own = (over: Partial<NarratorDoc>): NarratorDoc => ({
  id: "pdf-own",
  title: "Walden",
  author: "Henry David Thoreau",
  kind: "pdf",
  accent: "#1291FA",
  meta: "PDF · 12 pages",
  voice: "",
  chapters: [],
  ...over,
});

describe("what a library card says about a document", () => {
  it("tells the samples from the listener's own documents", () => {
    expect(SAMPLE_DOCS.every(isSample)).toBe(true);
    expect(isSample(own({}))).toBe(false);
  });

  it("names the format by the kind of file, samples included", () => {
    expect(SAMPLE_DOCS.map(formatLabel)).toEqual(["EPUB", "Pasted", "Text", "PDF"]);
    expect(formatLabel(own({}))).toBe("PDF");
  });

  it("puts a sample's genre beside its author", () => {
    expect(byline(SAMPLE_DOCS[0])).toBe("H. G. Wells · Novel");
  });

  it("shows the author a PDF or EPUB names", () => {
    expect(byline(own({}))).toBe("Henry David Thoreau");
  });

  it("leaves the line empty where there is no author, never the format a second time", () => {
    const noAuthor = own({ author: "PDF" });
    const text = own({ kind: "txt", author: "Text file", meta: "Plain text · 282 words" });
    const pasted = own({ kind: "paste", author: "Pasted text", meta: "Pasted · 40 words" });

    expect([noAuthor, text, pasted].map(authorName)).toEqual(["", "", ""]);
    expect([noAuthor, text, pasted].map(byline)).toEqual(["", "", ""]);
  });
});

describe("searching the library", () => {
  it("finds a document by its title or the line under it, whatever the case", () => {
    const found = (query: string) =>
      SAMPLE_DOCS.filter((d) => matchesQuery(d, query)).map((d) => d.id);

    expect(found("  MEDITATIONS ")).toEqual(["meditations"]);
    expect(found("wells")).toEqual(["time-machine"]);
    expect(found("novel")).toEqual(["time-machine"]);
    expect(found("")).toHaveLength(SAMPLE_DOCS.length);
    expect(found("zebra")).toEqual([]);
  });

  it("does not match on what a card never shows", () => {
    // The extractor's stand-in author for a text file.
    expect(matchesQuery(own({ kind: "txt", author: "Text file" }), "text file")).toBe(false);
  });

  it("cuts a title around every match so the letters can be marked", () => {
    expect(markMatches("The Tell-Tale Heart", "AL")).toEqual([
      { text: "The Tell-T", hit: false },
      { text: "al", hit: true },
      { text: "e Heart", hit: false },
    ]);
    expect(markMatches("banana", "an").filter((p) => p.hit)).toHaveLength(2);
    expect(markMatches("Walden", "")).toEqual([{ text: "Walden", hit: false }]);
    expect(markMatches("Walden", "zebra")).toEqual([{ text: "Walden", hit: false }]);
  });
});

describe("how long a card says a document is", () => {
  const MIN = 60_000;

  it("gives the whole length before it is started", () => {
    expect(lengthLine(4 * MIN, 0)).toBe("4 min");
  });

  it("gives what is left of the whole once it was started", () => {
    expect(lengthLine(4 * MIN, 0.71)).toBe("1 min left of 4 min");
  });

  it("never says the same length twice", () => {
    expect(lengthLine(3 * MIN, 0.05)).toBe("3 min");
  });
});
