// Translated text for data whose English lives in this folder's JSON (and for
// tables keyed by id). The JSON stays as it is; a message named from the item's
// id supplies the text in the current locale, falling back to the JSON's English.

import { m } from "@repo/i18n/messages.js";
import { noteInputs } from "../theory/note-inputs";

type MessageFn = (inputs?: Record<string, unknown>) => string;
const messages = m as unknown as Record<string, MessageFn | undefined>;

/** An id as a message-key segment: "ear.chord-function.I" -> "ear_chord_function_i". */
export const keyPart = (id: string | number) =>
  String(id)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

/** Whether a message named `key` exists. */
export const hasMsg = (key: string) => !!messages[key];

/**
 * The message named `key`, or `fallback` when there is none. Notes written as
 * placeholders in it ({C}, {key_Bb}) are filled in the current note naming,
 * unless `inputs` already fills them (as `noteInputs` does, for a given key).
 */
export function msg(key: string, fallback: string, inputs?: Record<string, unknown>): string {
  const fn = messages[key];
  return fn ? fn(noteInputs(inputs)) : fallback;
}

/**
 * Turns `fields` of each item into getters that read the message
 * `${prefix}_${keyPart(id)}_${field}`, falling back to the item's English.
 * The items keep their shape, so code that reads them needs no change.
 * `inputs` fills a message's placeholders other than notes.
 */
export function localizeFields<T extends object>(
  items: readonly T[],
  prefix: string,
  idOf: (item: T) => string | number,
  fields: readonly (keyof T & string)[],
  inputs?: (item: T) => Record<string, unknown>,
): void {
  for (const item of items) {
    const id = keyPart(idOf(item));
    for (const field of fields) {
      const english = (item as Record<string, unknown>)[field];
      if (typeof english !== "string") continue;
      const key = `${prefix}_${id}_${keyPart(field)}`;
      if (!messages[key]) continue;
      Object.defineProperty(item, field, {
        get: () => msg(key, english, inputs?.(item)),
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/** Turns `field` of each item into a getter that passes the item's English through `translate`. */
export function localizeWith<T extends object>(
  items: readonly T[],
  field: keyof T & string,
  translate: (english: string) => string,
): void {
  for (const item of items) {
    const english = (item as Record<string, unknown>)[field];
    if (typeof english !== "string") continue;
    Object.defineProperty(item, field, {
      get: () => translate(english),
      enumerable: true,
      configurable: true,
    });
  }
}
