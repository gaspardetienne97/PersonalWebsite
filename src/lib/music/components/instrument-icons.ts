// One icon per instrument, used wherever an instrument is named with a hue.
import { INSTRUMENTS, type Instrument } from "@repo/music-core";
import type { PickOption } from "./Picker.svelte";
import PianoIcon from "@lucide/svelte/icons/piano";
import GuitarIcon from "@lucide/svelte/icons/guitar";
import DrumIcon from "@lucide/svelte/icons/drum";
import WindIcon from "@lucide/svelte/icons/wind";
import MicIcon from "@lucide/svelte/icons/mic";

export const INSTRUMENT_ICON = {
  piano: PianoIcon,
  guitar: GuitarIcon,
  ukulele: GuitarIcon,
  aerophone: WindIcon,
  mpc: DrumIcon,
  voice: MicIcon,
} satisfies Record<Instrument, typeof PianoIcon>;

/** Every instrument as a Picker option, with its icon and hue. */
export const instrumentOptions = (label: (i: Instrument) => string): PickOption[] =>
  INSTRUMENTS.map((i) => ({
    value: i,
    label: label(i),
    icon: INSTRUMENT_ICON[i],
    hue: `var(--hue-${i})`,
  }));
