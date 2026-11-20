import { describe, expect, it } from "vite-plus/test";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import ht from "../../messages/ht.json";
import { formatDate, intlLocale } from "./utils.ts";

const MESSAGES: Record<string, Record<string, string>> = { en, es, fr, ht };
const LOCALES = Object.keys(MESSAGES);
const load = (locale: string) => MESSAGES[locale];

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    it(`${locale} has every English message, with the same placeholders`, () => {
      const other = load(locale);
      expect(Object.keys(other).sort()).toEqual(Object.keys(load("en")).sort());
      for (const key of Object.keys(load("en"))) {
        if (key === "$schema") continue;
        expect(placeholders(other[key]), `${locale}.${key}`).toEqual(placeholders(load("en")[key]));
        expect(other[key].trim(), `${locale}.${key} is empty`).not.toBe("");
      }
    });
  }
});

describe("formatDate", () => {
  it("spells Haitian Creole months itself", () => {
    expect(formatDate("2024-9-16", "long", "ht")).toBe("16 septanm 2024");
  });

  it("uses Intl for the other languages", () => {
    expect(formatDate("2024-9-16", "long", "es")).toBe("16 de septiembre de 2024");
    expect(formatDate("2024-9-16", "long", "fr")).toBe("16 septembre 2024");
  });

  it("formats Spanish the Latin American way", () => {
    expect(intlLocale("es")).toBe("es-419");
    expect(new Intl.NumberFormat(intlLocale("es")).format(12345.6)).toBe("12,345.6");
  });
});
