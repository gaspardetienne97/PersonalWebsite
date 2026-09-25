// One icon per instrument, used wherever an instrument is named with a hue.
import type { Instrument } from "@repo/music-core";
import PianoIcon from "lucide-svelte/icons/piano";
import GuitarIcon from "lucide-svelte/icons/guitar";
import DrumIcon from "lucide-svelte/icons/drum";
import WindIcon from "lucide-svelte/icons/wind";
import MicIcon from "lucide-svelte/icons/mic";

export const INSTRUMENT_ICON = {
  piano: PianoIcon,
  guitar: GuitarIcon,
  ukulele: GuitarIcon,
  aerophone: WindIcon,
  mpc: DrumIcon,
  voice: MicIcon,
} satisfies Record<Instrument, typeof PianoIcon>;
