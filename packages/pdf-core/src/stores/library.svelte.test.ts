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
});
