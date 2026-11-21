import { describe, expect, it } from "vite-plus/test";

import { authorName, byline, formatLabel, isSample, SAMPLE_DOCS } from "./data";
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

  it("shows the size where there is no author, never the format a second time", () => {
    const noAuthor = own({ author: "PDF" });
    const text = own({ kind: "txt", author: "Text file", meta: "Plain text · 282 words" });
    const pasted = own({ kind: "paste", author: "Pasted text", meta: "Pasted · 40 words" });

    expect([noAuthor, text, pasted].map(authorName)).toEqual(["", "", ""]);
    expect([noAuthor, text, pasted].map(byline)).toEqual(["12 pages", "282 words", "40 words"]);
  });
});
