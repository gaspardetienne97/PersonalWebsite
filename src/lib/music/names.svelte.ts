// Note names on screen: letters, fixed do or movable do (the setting, applied
// by the music layout). Use these for every note, chord or key name the app
// shows; keep letters for ids, params, parsing and anything saved.
//
//   note("F#4")      "F#4", "Fa#4", or in G major with movable do "Si4"
//   chord("Dm7/G")   "Dm7/G", "Rem7/Sol"
//   keyName("Bb")    "Bb", "Sib" (keys are absolute, even in movable do)
//
// Movable do counts from the key on screen. A drill that has a key calls
// `useNamingKey(() => ({ tonic: "G", minor: false }))` in its script; names
// shown after that, in it and its children, count from that key, and update
// when it changes. Without a key, movable do reads as fixed do.

import { onDestroy } from "svelte";
import {
  getNoteNaming,
  setNamingKey,
  showChord,
  showKeyName,
  showNote,
  type NamingKey,
} from "@repo/music-core";

let key = $state<NamingKey | undefined>();

const setKey = (next: NamingKey | undefined) => {
  key = next;
  // Core content that builds text (lessons, prompts) reads the same key.
  setNamingKey(next);
};

/** A note name ("C", "F#4", "Bb3") as the user reads note names. */
export const note = (name: string) => showNote(name, key);
/** A chord symbol ("Dm7/G") with its root and bass named as the user reads them. */
export const chord = (symbol: string) => showChord(symbol, key);
/** A key's tonic ("Bb") as the user reads note names; never relative. */
export const keyName = (tonic: string) => showKeyName(tonic);
/** Whether names are letters, fixed do or movable do. */
export const naming = getNoteNaming;

/**
 * Tells movable do which key this component shows, for as long as it's
 * mounted. Call it in a component's script, with a function that returns the
 * current key (or undefined when there's none).
 */
export function useNamingKey(get: () => NamingKey | undefined) {
  let mine = get();
  setKey(mine);
  $effect.pre(() => {
    mine = get();
    setKey(mine);
  });
  onDestroy(() => {
    // The next screen may already have set its own key.
    if (key === mine) setKey(undefined);
  });
}
