// Shared state for the practice controls strip and focus mode. A drill run
// locks instrument, tempo and count-in; the metronome stays available.
import type { Instrument } from "@repo/music-core";
import { m } from "@repo/i18n/messages.js";

// Getters, so each read is in the current language.
export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  get piano() {
    return m.music_shell_instrument_piano();
  },
  get guitar() {
    return m.music_shell_instrument_guitar();
  },
  get ukulele() {
    return m.music_shell_instrument_ukulele();
  },
  get aerophone() {
    return m.music_shell_instrument_aerophone();
  },
  get mpc() {
    return m.music_shell_instrument_mpc();
  },
  get voice() {
    return m.music_shell_instrument_voice();
  },
};

export type Hue = Instrument | "ear" | "reading" | "rhythm" | "create";

class Bench {
  running = $state(false);
  /** A drill session owns the screen (contract K1): true from the first lesson step or Start until the
   *  player leaves the results. The layout hides both navs and the strip while it is true. Set by DrillShell. */
  session = $state(false);
  countingIn = $state(false);
  /** 1-based beat inside the bar while a click runs, 0 when silent. */
  beat = $state(0);
  beatsPerBar = $state(4);
  /** Keep the metronome clicking during a run (persisted by the strip). */
  clickDuringRun = $state(true);
  /** False on pages that run no clock, so the strip leaves out Metronome, Tempo and Count-in (the layout's route rule). */
  timed = $state(true);
  /** Set by DrillShell from its `clock` prop: whether this drill's runs use the click. It overrides `timed`
   *  while a drill is open; null on other pages, where the route rule speaks. */
  clocked = $state<boolean | null>(null);
  /** Hubs and tools: the strip shows only the instrument, sound and input, and search. */
  compact = $state(false);
  /** The page draws no instrument (its catalogue entry lists none), so the strip
   * shows "Any instrument" instead of the picker. Set by DrillShell. */
  instrumentFree = $state(false);
  /** The strip's rendered height in px, written to --ws-strip-h on the app root. */
  stripH = $state(0);
  /** Page-level hue override (ear, reading…); null follows the instrument. */
  hue = $state<Hue | null>(null);
  get locked() {
    return this.running || this.countingIn;
  }
  setFocus(on: boolean) {
    if (typeof document === "undefined") return;
    if (on) document.documentElement.dataset.musicFocus = "";
    else delete document.documentElement.dataset.musicFocus;
  }
}

export const bench = new Bench();
