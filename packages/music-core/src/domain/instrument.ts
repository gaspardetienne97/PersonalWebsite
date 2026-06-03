/**
 * The set of instruments the app supports as input/projection targets.
 * Kept as a string-literal union (not an enum) so it serializes cleanly to
 * JSON in IndexedDB and reads naturally in NoteEvents and projections.
 */
export type InstrumentId = "piano" | "guitar" | "ukulele" | "aerophone" | "mpc" | "voice";

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  piano: "Piano",
  guitar: "Guitar",
  ukulele: "Ukulele",
  aerophone: "Aerophone",
  mpc: "MPC / Pads",
  voice: "Voice",
};

/**
 * InstrumentProfile — a configured *instance* of an instrument, sitting beside
 * (not replacing) {@link InstrumentId}. Identity is not enough once practice
 * gets serious: guitar needs tuning/capo, ukulele needs reentrant vs low-G,
 * the Aerophone needs CC maps and bend range, the MPC needs a pad->note map.
 *
 * A user may own several profiles for one instrument (e.g. "Guitar - standard"
 * and "Guitar - drop D"). Projections and input handling read from the profile.
 */
export interface InstrumentProfile {
  id: string;
  instrument: InstrumentId;
  label: string;
  /** Open-string pitches, low->high, as MIDI numbers (strings/winds). */
  tuning?: number[];
  /** Playable range in MIDI note numbers. */
  range?: { lowestMidi: number; highestMidi: number };
  /** Concert-pitch offset in semitones (e.g. transposing wind setups). */
  transposition?: number;
  /** Default MIDI channel this device transmits on, when fixed. */
  midiChannel?: number;
  /**
   * Instrument-specific configuration, intentionally open:
   *  - guitar/uke: { capo, leftHanded, bodySize }
   *  - aerophone:  { breathCC, biteBendRange, fingeringMode }
   *  - mpc:        { bank, padNoteMap }
   * Typed per-instrument at the engine layer; kept loose in the core model.
   */
  config?: Record<string, unknown>;
}
