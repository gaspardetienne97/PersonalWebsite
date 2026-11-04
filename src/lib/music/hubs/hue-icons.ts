// One icon per hue: the instrument's own icon, and one each for the areas any instrument plays.
import Ear from "lucide-svelte/icons/ear";
import BookOpen from "lucide-svelte/icons/book-open";
import AudioWaveform from "lucide-svelte/icons/audio-waveform";
import Sparkles from "lucide-svelte/icons/sparkles";
import type { Hue } from "../bench.svelte";
import { INSTRUMENT_ICON } from "../components/instrument-icons";
import Ruler from "lucide-svelte/icons/ruler";
import Scale from "lucide-svelte/icons/scale";
import Smile from "lucide-svelte/icons/smile";
import FlagTriangleRight from "lucide-svelte/icons/flag-triangle-right";
import ListOrdered from "lucide-svelte/icons/list-ordered";
import Route from "lucide-svelte/icons/route";
import Repeat from "lucide-svelte/icons/repeat";
import Stairs from "lucide-svelte/icons/chart-no-axes-column-increasing";
import ArrowDownUp from "lucide-svelte/icons/arrow-down-up";
import TrendingDown from "lucide-svelte/icons/trending-down";
import Crosshair from "lucide-svelte/icons/crosshair";
import SearchX from "lucide-svelte/icons/search-x";
import House from "lucide-svelte/icons/house";
import PencilLine from "lucide-svelte/icons/pencil-line";
import Library from "lucide-svelte/icons/library";
import Shuffle from "lucide-svelte/icons/shuffle";
import HeartPulse from "lucide-svelte/icons/heart-pulse";

export const HUE_ICON: Record<Hue, typeof Ear> = {
  ...INSTRUMENT_ICON,
  ear: Ear,
  reading: BookOpen,
  rhythm: AudioWaveform,
  create: Sparkles,
};

// Ear drills share one hue, so each gets its own glyph for what it asks: a distance, a balance,
// a road for a progression, a house for the tonic. Drills not listed use their hue's icon.
export const DRILL_ICON: Record<string, typeof Ear> = {
  "ear-intervals": Ruler,
  "ear-interval-compare": Scale,
  "ear-chord-qualities": Smile,
  "ear-cadences": FlagTriangleRight,
  "ear-chord-functions": ListOrdered,
  "ear-progressions": Route,
  "ear-song-loops": Repeat,
  "ear-scales": Stairs,
  "ear-inversions": ArrowDownUp,
  "ear-bass-lines": TrendingDown,
  "ear-fine-pitch": Crosshair,
  "ear-wrong-note": SearchX,
  "ear-scale-degrees": House,
  "ear-melody-dictation": PencilLine,
  "ear-repertoire-transfer": Library,
  "ear-mixed": Shuffle,
  "ear-feel": HeartPulse,
};
