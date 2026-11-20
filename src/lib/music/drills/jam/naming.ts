// A progression's key ("C major", "Bb minor", "D dorian", "F" for a blues) as
// the screen names it, and as the key movable do counts from.
import { FLAT_NAMES, pcOf, type NamingKey } from "@repo/music-core";
import { keyText } from "@repo/music-core/content/jam";
import { keyName } from "#lib/music/names.svelte.ts";

/** "C major" as the user reads it: the tonic named (absolute, as keys are), the mode translated. */
export function keyLabel(key: string): string {
  const [tonic, ...mode] = key.split(" ");
  return keyText([keyName(tonic), ...mode].join(" "));
}

/**
 * The key movable do counts from: minor keys la-based, a mode from its parent
 * major (D dorian counts from C), anything else from its tonic.
 */
export function namingKey(key: string): NamingKey {
  const [tonic, ...rest] = key.split(" ");
  const mode = rest.join(" ");
  if (/minor|aeolian/.test(mode)) return { tonic, minor: true };
  const below = { dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, locrian: 11 }[mode];
  const pc = pcOf(tonic);
  if (below === undefined || pc === null) return { tonic };
  return { tonic: FLAT_NAMES[(pc - below + 12) % 12] };
}
