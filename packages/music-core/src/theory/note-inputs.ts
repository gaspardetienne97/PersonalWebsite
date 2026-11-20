// Inputs for messages that name notes in their text. Such a message writes each
// note as a placeholder named after it, so translators see which note it is:
//
//   "Half-step-below approaches: {C_sharp} to {D} and {F_sharp} to {G}."
//   "Think of {key_Db} melodic minor."   (a key or scale name: absolute)
//   "Slash bass notes ({E_over_G_sharp}, {A_over_E})"
//
// `noteInputs()` fills every such placeholder with the note in the current
// naming (letters, fixed do or movable do), so English with letters reads the
// letters back exactly. `#` is spelled `_sharp`, `/` is `_over_`, and a `key_`
// prefix marks a key's name.

import { showChord, showKeyName, type NamingKey } from "./note-names";

const NOTE_INPUT = /^(key_)?([A-G].*)$/;

/** The note, chord or key a placeholder name stands for ("F_sharp" → "F#"), or undefined. */
export function noteOfInput(name: string): { text: string; key: boolean } | undefined {
  const m = NOTE_INPUT.exec(name);
  if (!m) return undefined;
  return { text: m[2].replaceAll("_over_", "/").replaceAll("_sharp", "#"), key: !!m[1] };
}

const made = new WeakSet<object>();

/**
 * A message's inputs: the given ones, plus every placeholder named after a note
 * ({C}, {F_sharp4}, {Dm7}, {key_Bb}), shown in the current naming. Movable do
 * counts from `key` (by default, the key on screen); key names are absolute.
 * `respell` changes each note (as letters) before it is named: a transposition.
 */
export function noteInputs(
  inputs: Record<string, unknown> = {},
  key?: NamingKey,
  respell?: (letters: string) => string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Paraglide types each message's inputs; this fills any of them.
): any {
  if (made.has(inputs)) return inputs;
  const proxy = new Proxy(inputs, {
    get(target, prop) {
      if (typeof prop !== "string" || prop in target) return Reflect.get(target, prop);
      const note = noteOfInput(prop);
      if (!note) return undefined;
      const text = respell ? respell(note.text) : note.text;
      return note.key ? showKeyName(text) : showChord(text, key);
    },
  });
  made.add(proxy);
  return proxy;
}

/** Notes or chords separated by spaces or dashes ("E A D G B E", "G-D-Em-C"), each in the current naming. */
export function showNoteList(text: string, key?: NamingKey): string {
  return text.replace(/[^\s-]+/g, (token) => showChord(token, key));
}
