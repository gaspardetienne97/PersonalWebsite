// The interface languages, each by its own name. This changes Narrator's menus
// and messages only: the voice that reads a document is a separate setting.
import { intlLocale } from "@repo/i18n/format";
import { getLocale, type Locale } from "@repo/i18n/runtime.js";
import { buildModel, wordIndexAt, type NarratorDoc } from "@repo/pdf-core/domain";

export const LANGUAGES: { locale: Locale; name: string }[] = [
  { locale: "en", name: "English" },
  { locale: "es", name: "Español" },
  { locale: "fr", name: "Français" },
  { locale: "ht", name: "Kreyòl ayisyen" },
];

// Intl has no Haitian Creole names, so the languages a device is likely to offer are written
// out here. Anything else shows in French, which a Creole reader is the most likely to know.
const CREOLE_NAMES: Record<string, string> = {
  en: "Anglè",
  "en-US": "Anglè ameriken",
  "en-GB": "Anglè britanik",
  "en-AU": "Anglè ostralyen",
  "en-CA": "Anglè kanadyen",
  fr: "Franse",
  "fr-FR": "Franse (Lafrans)",
  "fr-CA": "Franse kanadyen",
  es: "Panyòl",
  "es-ES": "Panyòl (Espay)",
  "es-MX": "Panyòl meksiken",
  "es-US": "Panyòl (Etazini)",
  ht: "Kreyòl ayisyen",
};

/**
 * A voice's language in words, in the interface language: "en-US" reads "American English".
 * `short` asks for the shorter name where the language has one ("US English"), for a voice
 * row's one line. Falls back to the tag itself when the browser cannot name it.
 */
export function languageName(tag: string, locale: string = getLocale(), short = false): string {
  // Android reports "en_US".
  const bcp = tag.replace(/_/g, "-");
  if (locale === "ht" && CREOLE_NAMES[bcp]) return CREOLE_NAMES[bcp];
  try {
    const shown = locale === "ht" ? "fr-HT" : intlLocale(locale);
    const name = new Intl.DisplayNames([shown], {
      type: "language",
      style: short ? "short" : "long",
    }).of(bcp);
    if (!name || name === bcp) return tag;
    // French and Spanish names are lower case ("anglais américain"); here one starts a line.
    return name.charAt(0).toLocaleUpperCase(shown) + name.slice(1);
  } catch {
    return tag;
  }
}

/**
 * A language's name for the middle of a sentence ("No English voices", "aucune voix en anglais").
 * English writes its language names with a capital; the other interface languages do not.
 */
export function languageInSentence(tag: string, locale: string = getLocale()): string {
  const name = languageName(tag, locale);
  if (locale === "en" || name === tag) return name;
  return (
    name.charAt(0).toLocaleLowerCase(locale === "ht" ? "fr-HT" : intlLocale(locale)) + name.slice(1)
  );
}

// What a voice reads as its sample, in the voice's own language. This is spoken content, not
// interface text, so it follows the voice and never the interface language.
const SAMPLES: Record<string, string> = {
  en: "Hello. This is how I sound when I read your documents to you.",
  es: "Hola. Así suena mi voz cuando te leo tus documentos.",
  fr: "Bonjour. Voici ma voix quand je vous lis vos documents.",
};

/** The sample sentence for a voice's language tag. Languages without one hear the English. */
export function sampleFor(tag: string): string {
  return SAMPLES[tag.slice(0, 2).toLowerCase()] ?? SAMPLES.en;
}

// ---- which word of a sample is being read ----

/** A sample's words, as the preview draws them. */
export const sampleWords = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/**
 * The word a system voice is on, from the character offset its boundary event reports.
 * -1 before the first word.
 */
export function wordAtChar(text: string, charIndex: number): number {
  let word = -1;
  for (const match of text.matchAll(/\S+/g)) {
    if (match.index > charIndex) break;
    word++;
  }
  return word;
}

/**
 * The word a natural voice is on, from how far its audio has played (0 to 1). The engine gives
 * no word events, so the reader lays the words on its own timeline and follows the audio along
 * it. This uses the same timeline, so a preview marks words the way the reader will.
 */
export function wordAtFraction(text: string, fraction: number): number {
  const model = buildModel({
    chapters: [{ id: "sample", title: "", paragraphs: [text] }],
  } as NarratorDoc);
  const end = model.sentences.at(-1)?.end ?? 0;
  if (!model.tokens.length || end <= 0) return -1;
  const at = Math.min(1, Math.max(0, fraction)) * end;
  return Math.min(model.tokens.length - 1, wordIndexAt(model, at));
}
