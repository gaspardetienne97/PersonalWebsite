import { describe, expect, it } from "vite-plus/test";

import {
  languageInSentence,
  languageName,
  sampleFor,
  sampleWords,
  wordAtChar,
  wordAtFraction,
} from "./languages";

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

  it("has a shorter name for a row's one line, where the language has one", () => {
    expect(languageName("en-US", "en", true)).toBe("US English");
    expect(languageName("en-GB", "en", true)).toBe("UK English");
    expect(languageName("en-US", "ht", true)).toBe("Anglè ameriken");
  });

  it("shows the tag itself when it cannot be named", () => {
    expect(languageName("not a tag", "en")).toBe("not a tag");
  });
});

describe("languageInSentence", () => {
  it("keeps English's capital and lowers the first letter in the other interface languages", () => {
    expect(languageInSentence("en", "en")).toBe("English");
    expect(languageInSentence("en", "fr")).toBe("anglais");
    expect(languageInSentence("en", "es")).toBe("inglés");
    expect(languageInSentence("en", "ht")).toBe("anglè");
  });

  it("leaves a tag it cannot name as it is", () => {
    expect(languageInSentence("not a tag", "fr")).toBe("not a tag");
  });
});

describe("sampleFor", () => {
  it("reads a sample in the voice's own language, English when it has none", () => {
    expect(sampleFor("fr-CA")).toMatch(/^Bonjour/);
    expect(sampleFor("es_MX")).toMatch(/^Hola/);
    expect(sampleFor("de-DE")).toMatch(/^Hello/);
  });
});

describe("the word a preview is on", () => {
  const text = "Hello. This is how I sound.";

  it("splits a sample into the words it draws", () => {
    expect(sampleWords(text)).toEqual(["Hello.", "This", "is", "how", "I", "sound."]);
  });

  it("follows a system voice's boundary events by character offset", () => {
    expect(wordAtChar(text, 0)).toBe(0);
    expect(wordAtChar(text, 7)).toBe(1);
    // An offset inside a word still belongs to that word.
    expect(wordAtChar(text, 9)).toBe(1);
    expect(wordAtChar(text, text.indexOf("sound"))).toBe(5);
    expect(wordAtChar("  Hello", 0)).toBe(-1);
  });

  it("follows a natural voice by how far its audio has played, on the reader's timeline", () => {
    expect(wordAtFraction(text, 0)).toBe(0);
    expect(wordAtFraction(text, 1)).toBe(5);
    expect(wordAtFraction(text, 2)).toBe(5);
    // Words come in order and none is skipped backwards.
    const seen = Array.from({ length: 21 }, (_, i) => wordAtFraction(text, i / 20));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(6);
    expect(wordAtFraction("", 0.5)).toBe(-1);
  });
});
