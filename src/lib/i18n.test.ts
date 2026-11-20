import { describe, expect, it } from "vite-plus/test";
import { formatDate, formatList, intlLocale } from "./utils.ts";

// Every message file, by area: "messages/en.json" is the site, and
// "messages/<area>/en.json" holds an app's (see project.inlang/settings.json).
const files = import.meta.glob<Record<string, unknown>>("../../messages/**/*.json", {
  eager: true,
  import: "default",
});

const LOCALES = ["en", "es", "fr", "ht"];
type Messages = Record<string, unknown>;
type Variant = { declarations?: string[]; match?: Record<string, string> };

const areas = new Map<string, Record<string, Messages>>();
for (const [path, messages] of Object.entries(files)) {
  const match = path.match(/messages\/(?:(.+)\/)?(\w+)\.json$/)!;
  const area = match[1] ?? "site";
  if (!areas.has(area)) areas.set(area, {});
  areas.get(area)![match[2]] = messages;
}

/** A message's texts: one for a plain string, one per case for a plural variant. */
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return (value as Variant[]).flatMap((variant) => Object.values(variant.match ?? {}));
  return [];
}

/** What a caller passes: the placeholders in its texts plus declared inputs, not locals. */
function inputs(value: unknown) {
  const names = new Set(
    texts(value).flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])),
  );
  const declarations = Array.isArray(value)
    ? (value as Variant[]).flatMap((v) => v.declarations ?? [])
    : [];
  for (const d of declarations) {
    const input = d.match(/^input (\w+)/);
    if (input) names.add(input[1]);
  }
  for (const d of declarations) {
    const local = d.match(/^local (\w+)/);
    if (local) names.delete(local[1]);
  }
  return [...names].sort();
}

describe("translations", () => {
  it("finds the site's messages", () => {
    expect(areas.get("site")?.en).toBeDefined();
  });

  for (const [area, byLocale] of areas) {
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      it(`${area}: ${locale} has every English message, with the same inputs`, () => {
        const en = byLocale.en ?? {};
        const other = byLocale[locale];
        expect(other, `messages/${area}/${locale}.json is missing`).toBeDefined();
        expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
        for (const key of Object.keys(en)) {
          if (key === "$schema") continue;
          expect(inputs(other[key]), `${area} ${locale}.${key}`).toEqual(inputs(en[key]));
          for (const text of texts(other[key]))
            expect(text.trim(), `${area} ${locale}.${key} is empty`).not.toBe("");
        }
      });
    }
  }

  it("never uses one key in two areas", () => {
    const seen = new Map<string, string>();
    for (const [area, byLocale] of areas)
      for (const key of Object.keys(byLocale.en ?? {})) {
        if (key === "$schema") continue;
        expect(seen.get(key), `${key} is in both ${seen.get(key)} and ${area}`).toBeUndefined();
        seen.set(key, area);
      }
  });
});

describe("formatting", () => {
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

  it("formats French as it is used in Haiti", () => {
    expect(intlLocale("fr")).toBe("fr-HT");
  });

  it("joins lists in each language", () => {
    expect(formatList(["C", "E", "G"], "conjunction", "en")).toBe("C, E and G");
    expect(formatList(["C", "E", "G"], "conjunction", "es")).toBe("C, E y G");
    expect(formatList(["C", "E", "G"], "conjunction", "fr")).toBe("C, E et G");
    expect(formatList(["C", "E", "G"], "conjunction", "ht")).toBe("C, E ak G");
  });
});
