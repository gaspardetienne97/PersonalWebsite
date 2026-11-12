// Play over changes: one trainer, seven modes, one pathname each (/music/changes/<mode>), so each
// keeps its own catalog entry, setup and history. The title is a picker over them.
import { catalogEntry } from "@repo/music-core/content/catalog";
import { trainerModes } from "$lib/music/components/TrainerSwitch.svelte";

export const CHANGES_TITLE = "Play over changes";

/** The modes in the picker's order; each is a catalog entry id and the last segment of its route. */
export const CHANGES_MODES = ["voicings", "comping", "accompany", "licks", "chord-scales", "jam", "call-response"] as const;
export type ChangesMode = (typeof CHANGES_MODES)[number];

const OPTIONS = trainerModes(CHANGES_MODES.map((id) => catalogEntry(id)!));

/** DrillShell's `trainer` for a mode: picking another goes to its page. */
export const changesTrainer = (mode: ChangesMode) => ({ options: OPTIONS, value: mode, fold: true });
