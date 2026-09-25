import type { Instrument } from "@repo/music-core";
import type { Hue } from "./bench.svelte";

/** Colour identity for a routine step or drill route. */
export function hueForRoute(route: string, instrument?: Instrument): Hue {
  if (route.startsWith("/music/ear")) return "ear";
  if (route.startsWith("/music/reading")) return "reading";
  if (route.startsWith("/music/rhythm")) return "rhythm";
  if (/\/music\/(fretboard|chords|strum)/.test(route))
    return instrument === "ukulele" ? "ukulele" : "guitar";
  if (/\/music\/(two-hand|comping|voicings)/.test(route)) return "piano";
  if (route.startsWith("/music/pads")) return "mpc";
  if (route.startsWith("/music/aerophone")) return "aerophone";
  if (/\/music\/(create|record)/.test(route)) return "create";
  return instrument ?? "piano";
}

export const hueVar = (h: Hue) => `var(--hue-${h})`;
