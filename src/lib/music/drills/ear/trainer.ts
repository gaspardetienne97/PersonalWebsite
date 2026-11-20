// The Ear trainer's modes: every catalog entry under /music/ear/ (the ear.ts drills, Studio ears
// and Feel), one pathname each, so picking one in the title goes to its page.
import { CATALOG } from "@repo/music-core/content/catalog";
import { trainerModes } from "#lib/music/components/TrainerSwitch.svelte";

export const EAR_MODES = trainerModes(CATALOG.filter((e) => e.route.startsWith("/music/ear/")));
export const earTrainer = (id: string) => ({ options: EAR_MODES, value: id });
