// Play over changes: one trainer, seven modes, one pathname each (/music/changes/<mode>), so each
// keeps its own catalog entry, setup and history. The title is a picker over them.
import { catalogEntry } from "@repo/music-core/content/catalog";
import { MediaQuery } from "svelte/reactivity";
import { trainerModes } from "#lib/music/components/TrainerSwitch.svelte";

export const CHANGES_TITLE = "Play over changes";

/** The modes in the picker's order; each is a catalog entry id and the last segment of its route. */
export const CHANGES_MODES = [
  "voicings",
  "comping",
  "accompany",
  "licks",
  "chord-scales",
  "jam",
  "call-response",
] as const;
export type ChangesMode = (typeof CHANGES_MODES)[number];

const OPTIONS = trainerModes(CHANGES_MODES.map((id) => catalogEntry(id)!));

/** DrillShell's `trainer` for a mode: picking another goes to its page. */
export const changesTrainer = (mode: ChangesMode) => ({
  options: OPTIONS,
  value: mode,
  fold: true,
});

/** A wide window that is short (tablet landscape, 1180 x 820; a 1280 x 800 laptop): DrillShell's one-row rule. A mode's stage tightens with it so the music, the instrument and Start share one view. */
export const shortStage = new MediaQuery("(min-width: 64rem) and (max-height: 56rem)");
