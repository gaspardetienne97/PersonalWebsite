// Shared state for the practice controls strip and focus mode. A drill run
// locks instrument, tempo and count-in; the metronome stays available.
import type { Instrument } from "@repo/music-core";

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  piano: "Piano",
  guitar: "Guitar",
  ukulele: "Ukulele",
  aerophone: "Aerophone",
  mpc: "MPC pads",
  voice: "Voice",
};

export type Hue = Instrument | "ear" | "reading" | "rhythm" | "create";

class Bench {
  running = $state(false);
  countingIn = $state(false);
  /** 1-based beat inside the bar while a click runs, 0 when silent. */
  beat = $state(0);
  beatsPerBar = $state(4);
  /** Keep the metronome clicking during a run (persisted by the strip). */
  clickDuringRun = $state(true);
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
