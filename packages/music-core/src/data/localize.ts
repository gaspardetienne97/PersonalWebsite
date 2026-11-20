// Translated text for data whose English lives in this folder's JSON (and for
// tables keyed by id). The JSON stays as it is; a message named from the item's
// id supplies the text in the current locale, falling back to the JSON's English.

import { m } from "@repo/i18n/messages.js";

type MessageFn = (inputs?: Record<string, unknown>) => string;
const messages = m as unknown as Record<string, MessageFn | undefined>;

/** An id as a message-key segment: "ear.chord-function.I" -> "ear_chord_function_i". */
export const keyPart = (id: string | number) =>
  String(id)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

/** The message named `key`, or `fallback` when there is none. */
export function msg(key: string, fallback: string, inputs?: Record<string, unknown>): string {
  const fn = messages[key];
  return fn ? fn(inputs ?? {}) : fallback;
}

/**
 * Turns `fields` of each item into getters that read the message
 * `${prefix}_${keyPart(id)}_${field}`, falling back to the item's English.
 * The items keep their shape, so code that reads them needs no change.
 */
export function localizeFields<T extends object>(
  items: readonly T[],
  prefix: string,
  idOf: (item: T) => string | number,
  fields: readonly (keyof T & string)[],
): void {
  for (const item of items) {
    const id = keyPart(idOf(item));
    for (const field of fields) {
      const english = (item as Record<string, unknown>)[field];
      if (typeof english !== "string") continue;
      const key = `${prefix}_${id}_${keyPart(field)}`;
      if (!messages[key]) continue;
      Object.defineProperty(item, field, {
        get: () => msg(key, english),
        enumerable: true,
        configurable: true,
      });
    }
  }
}
