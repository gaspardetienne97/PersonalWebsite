import { describe, expect, it } from "vitest";
import { fallingSentence, type SkillRow } from "./model";

const row = (id: string, name: string) => ({ skill: { id, name } }) as unknown as SkillRow;

describe("What next: the falling sentence", () => {
  it("names the skill, or 'It' when the focus skill was just named, and counts the rest", () => {
    expect(fallingSentence([row("a", "Sight-reading")])).toMatch(
      /^Sight-reading dropped ten points/,
    );
    expect(fallingSentence([row("a", "Sight-reading")], "a")).toMatch(/^It dropped ten points/);
    expect(fallingSentence([row("a", "Sight-reading"), row("b", "B")], "a")).toMatch(
      /^It and 1 other skill dropped/,
    );
    expect(fallingSentence([row("a", "Sight-reading"), row("b", "B"), row("c", "C")])).toMatch(
      /^Sight-reading and 2 other skills dropped/,
    );
  });
});
