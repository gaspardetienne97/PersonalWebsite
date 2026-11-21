import { describe, expect, it } from "vite-plus/test";

import { languageName, sampleFor } from "./languages";

describe("languageName", () => {
  it("names a voice's language in words, in the interface language", () => {
    expect(languageName("en-US", "en")).toBe("American English");
    expect(languageName("en-GB", "fr")).toBe("Anglais britannique");
    expect(languageName("fr-FR", "es")).toMatch(/^Francés/);
  });

  it("accepts Android's underscore tags", () => {
    expect(languageName("en_US", "en")).toBe("American English");
  });

  it("has Haitian Creole names, and French for the languages it does not list", () => {
    expect(languageName("en-US", "ht")).toBe("Anglè ameriken");
    expect(languageName("de-DE", "ht")).toMatch(/^Allemand/);
  });

  it("shows the tag itself when it cannot be named", () => {
    expect(languageName("not a tag", "en")).toBe("not a tag");
  });
});

describe("sampleFor", () => {
  it("reads a sample in the voice's own language, English when it has none", () => {
    expect(sampleFor("fr-CA")).toMatch(/^Bonjour/);
    expect(sampleFor("es_MX")).toMatch(/^Hola/);
    expect(sampleFor("de-DE")).toMatch(/^Hello/);
  });
});
