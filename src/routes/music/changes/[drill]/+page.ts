import { error } from "@sveltejs/kit";
import { m } from "@repo/i18n/messages.js";
import { catalogEntry } from "@repo/music-core/content/catalog";
import { CHANGES_MODES, type ChangesMode } from "#lib/music/drills/changes/modes.ts";

// One mode is loaded and mounted at a time, so each keeps its own chunk.
const MODES = {
  voicings: () => import("#lib/music/drills/changes/Voicings.svelte"),
  comping: () => import("#lib/music/drills/changes/Comping.svelte"),
  accompany: () => import("#lib/music/drills/changes/Accompany.svelte"),
  licks: () => import("#lib/music/drills/changes/Licks.svelte"),
  "chord-scales": () => import("#lib/music/drills/changes/ChordScales.svelte"),
  jam: () => import("#lib/music/drills/changes/Jam.svelte"),
  "call-response": () => import("#lib/music/drills/changes/CallResponse.svelte"),
} satisfies Record<ChangesMode, unknown>;

export async function load({ params }) {
  const mode = CHANGES_MODES.find((m) => m === params.drill);
  if (!mode) error(404, m.music_drills_changes_not_found());
  return { mode, title: catalogEntry(mode)!.title, Mode: (await MODES[mode]()).default };
}
