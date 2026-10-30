// One icon per hue: the instrument's own icon, and one each for the areas any instrument plays.
import Ear from "lucide-svelte/icons/ear";
import BookOpen from "lucide-svelte/icons/book-open";
import AudioWaveform from "lucide-svelte/icons/audio-waveform";
import Sparkles from "lucide-svelte/icons/sparkles";
import type { Hue } from "../bench.svelte";
import { INSTRUMENT_ICON } from "../components/instrument-icons";

export const HUE_ICON: Record<Hue, typeof Ear> = {
  ...INSTRUMENT_ICON,
  ear: Ear,
  reading: BookOpen,
  rhythm: AudioWaveform,
  create: Sparkles,
};
