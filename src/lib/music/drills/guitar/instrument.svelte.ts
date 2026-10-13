// Which fretted instrument the drill is for (the practice strip's picker),
// the tunings on offer (curated plus the player's custom ones), and path links
// that land on a given instrument and tempo.
import { page } from "$app/state";
import type { Settings } from "@repo/music-core";
import { TUNINGS, type Tuning } from "@repo/music-core/data/index";
import { validateCustomTuning } from "@repo/music-core/theory/fretboard";
import { getSetting, putSetting, settings } from "$lib/music/runtime";
import type { Fretted } from "./fretted";

export type { Fretted } from "./fretted";

/** Guitar unless the strip says ukulele. */
export const fretted = (): Fretted =>
  settings.value.activeInstrument === "ukulele" ? "ukulele" : "guitar";

const tuningKey = (instrument: Fretted) =>
  instrument === "ukulele" ? "ukuleleTuningId" : "guitarTuningId";

/** The tuning the practice strip holds for the instrument (the player's own tunings included). */
export const tuningFor = (instrument: Fretted): Tuning =>
  tunings.pick(settings.value[tuningKey(instrument)], instrument);

/**
 * Once, on arrival: `?instrument=`, `?tuning=` and `?bpm=` from a path or routine link set the
 * strip; with neither and a non-fretted instrument picked, the strip moves to guitar
 * so the strip, the stage and the recorded run agree.
 */
export async function applyBenchParams() {
  await settings.ready;
  const q = page.url.searchParams;
  const want = q.get("instrument");
  const bpm = Number(q.get("bpm"));
  const patch: Partial<Settings> = {};
  if (want === "guitar" || want === "ukulele") patch.activeInstrument = want;
  else if (!["guitar", "ukulele"].includes(settings.value.activeInstrument))
    patch.activeInstrument = "guitar";
  if (Number.isFinite(bpm) && bpm >= 30 && bpm <= 240) patch.bpm = Math.round(bpm);
  const tuning = q.get("tuning");
  const instrument =
    (patch.activeInstrument ?? settings.value.activeInstrument) === "ukulele"
      ? "ukulele"
      : "guitar";
  if (tuning && tunings.for(instrument).some((t) => t.id === tuning))
    patch[tuningKey(instrument)] = tuning;
  if (Object.keys(patch).length) await settings.update(patch);
}

const CUSTOM_KEY = "fretboard.custom-tunings.v1";

class Tunings {
  custom = $state<Tuning[]>([]);

  constructor() {
    if (typeof window !== "undefined")
      void getSetting<Tuning[]>(CUSTOM_KEY, []).then(
        (t) => (this.custom = Array.isArray(t) ? t : []),
      );
  }

  for(instrument: Fretted): Tuning[] {
    return [...TUNINGS[instrument], ...this.custom.filter((t) => t.instrument === instrument)];
  }

  /** The tuning with this id for the instrument, else the instrument's standard. */
  pick(id: string, instrument: Fretted): Tuning {
    return this.for(instrument).find((t) => t.id === id) ?? TUNINGS[instrument][0];
  }

  /** Returns the problem, or null once saved. */
  async add(t: Tuning): Promise<string | null> {
    const problem = validateCustomTuning(t);
    if (problem) return problem;
    this.custom = [...this.custom.filter((x) => x.id !== t.id), t];
    await putSetting(CUSTOM_KEY, $state.snapshot(this.custom));
    return null;
  }

  async remove(id: string) {
    this.custom = this.custom.filter((t) => t.id !== id);
    await putSetting(CUSTOM_KEY, $state.snapshot(this.custom));
  }
}

export const tunings = new Tunings();
