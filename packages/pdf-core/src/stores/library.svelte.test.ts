import { beforeEach, describe, expect, it } from "vite-plus/test";

import { SAMPLE_DOCS } from "../domain/data";
import { NarratorLibrary } from "./library.svelte";

describe("NarratorLibrary", () => {
  beforeEach(() => localStorage.clear());

  it("offers nothing to continue on a first visit", () => {
    const library = new NarratorLibrary();

    expect(library.docs).toHaveLength(SAMPLE_DOCS.length);
    expect(library.docs.map((d) => library.progressOf(d))).toEqual(SAMPLE_DOCS.map(() => 0));
    expect(library.inProgress).toBeUndefined();
  });

  it("offers the document that was played furthest", () => {
    const library = new NarratorLibrary();
    const [first, second] = library.docs;
    localStorage.setItem("narrate.pos." + first.id, String(library.modelFor(first).total * 0.2));
    localStorage.setItem("narrate.pos." + second.id, String(library.modelFor(second).total * 0.6));

    expect(library.progressOf(second)).toBeCloseTo(0.6);
    expect(library.inProgress?.id).toBe(second.id);
  });

  it("says which sentence listening stopped in", () => {
    const library = new NarratorLibrary();
    const doc = library.docs[0];
    const second = library.modelFor(doc).sentences[1];

    expect(library.resumeLine(doc)).toBe("");
    localStorage.setItem("narrate.pos." + doc.id, String(second.start + 1));
    expect(library.resumeLine(doc)).toBe(
      "His pale grey eyes shone and twinkled, and his usually pale face was flushed and animated.",
    );
    // Past the end, the last sentence.
    localStorage.setItem("narrate.pos." + doc.id, String(library.modelFor(doc).total + 5000));
    expect(library.resumeLine(doc)).toMatch(/\.$/);
  });

  it("puts a removed document back in its place with its progress", () => {
    const library = new NarratorLibrary();
    const second = library.docs[1];
    const key = "narrate.pos." + second.id;
    localStorage.setItem(key, String(library.modelFor(second).total * 0.5));

    library.remove(second.id);
    expect(library.find(second.id)).toBeUndefined();
    expect(library.removed?.doc.id).toBe(second.id);

    library.undoRemove();
    expect(library.docs[1].id).toBe(second.id);
    expect(library.progressOf(second)).toBeCloseTo(0.5);
    expect(library.removed).toBeNull();
    expect(JSON.parse(localStorage.getItem("narrator.library.v1")!)[1].id).toBe(second.id);
  });

  it("drops a removed document's progress once the undo is given up", () => {
    const library = new NarratorLibrary();
    const [first, second] = library.docs;
    localStorage.setItem("narrate.pos." + first.id, "1200");
    localStorage.setItem("narrate.pos." + second.id, "1200");

    library.remove(first.id);
    // Removing another gives up the first undo.
    library.remove(second.id);
    expect(localStorage.getItem("narrate.pos." + first.id)).toBeNull();
    expect(library.removed?.doc.id).toBe(second.id);

    library.forgetRemoved();
    expect(localStorage.getItem("narrate.pos." + second.id)).toBeNull();
    library.undoRemove();
    expect(library.docs).toHaveLength(SAMPLE_DOCS.length - 2);
  });

  it("brings the removed samples back unplayed, after the listener's own documents", () => {
    const library = new NarratorLibrary();
    const own = { ...SAMPLE_DOCS[0], id: "txt-own", title: "Mine" };
    library.add(own);
    const sample = SAMPLE_DOCS[2];
    localStorage.setItem("narrate.pos." + sample.id, "1200");
    library.remove(sample.id);
    library.remove(SAMPLE_DOCS[0].id);
    expect(library.samplesMissing).toBe(true);

    library.restoreSamples();
    expect(library.samplesMissing).toBe(false);
    expect(library.docs).toHaveLength(SAMPLE_DOCS.length + 1);
    expect(library.docs[0].id).toBe("txt-own");
    expect(library.progressOf(sample)).toBe(0);
    expect(library.removed).toBeNull();
  });
});
