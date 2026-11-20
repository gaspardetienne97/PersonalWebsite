// Latency offsets per input and output pair (io/calibration). The tap-along measures
// input and output together, so an offset saved on the laptop speakers says nothing
// about a Bluetooth speaker: each pair keeps its own, and this is the one place that
// tells the router what to subtract.
import { browser } from "$app/env";
import { untrack } from "svelte";
import {
  AUDIO_INPUT,
  MIDI_INPUT,
  deviceInput,
  isCalibrated,
  lookupOffset,
  migrateOffsets,
  pairKey,
  routerOffsets,
  type LegacyOffsets,
} from "@repo/music-core/io/calibration";
import type { Instrument } from "@repo/music-core";
import { audio } from "./audio.svelte";
import { input } from "./input.svelte";
import { mic } from "./mic.svelte";
import { midi } from "./midi.svelte";
import { settings } from "./settings.svelte";

const map = () => settings.value.calibration ?? {};
/** Offsets saved before pairs existed; moved to the current output once it is known. */
function legacy(): LegacyOffsets {
  if (settings.value.calibrationMigrated) return { audioMs: 0, midiMs: 0, deviceMs: {} };
  const deviceMs: Record<string, number> = {};
  for (const p of midi.profiles)
    if (p.inputOffsetMs !== undefined) deviceMs[p.id] = p.inputOffsetMs;
  return { audioMs: settings.value.audioOffsetMs, midiMs: settings.value.midiOffsetMs, deviceMs };
}

async function migrate() {
  const outputs = audio.outputs;
  const old = legacy();
  if (
    !audio.outputMeasured ||
    !outputs.length ||
    !(old.audioMs || old.midiMs || Object.keys(old.deviceMs).length)
  )
    return;
  // One write carries the pairs and the flag, so an offset is never applied twice. The old
  // fields stay saved (not cleared) so a build from before pairs still finds its calibration.
  await settings.update({
    calibration: migrateOffsets(map(), old, outputs),
    calibrationMigrated: true,
  });
}

if (browser) {
  $effect.root(() => {
    $effect(() => {
      input.router.setOffsets(routerOffsets(map(), legacy(), audio.outputs));
    });
    $effect(() => {
      void audio.outputs;
      void audio.outputMeasured;
      void legacy();
      // Only after the stored row is read: a patch made earlier would win over it.
      void settings.ready.then(() => untrack(migrate));
    });
  });
}

const micInstrument = (i: Instrument) => i === "guitar" || i === "ukulele" || i === "voice";

export const calibration = {
  /**
   * The input the active instrument is heard through, as a calibration key; null when that
   * input is off (on-screen play needs no offset).
   */
  get input(): string | null {
    if (micInstrument(settings.value.activeInstrument))
      return mic.state === "on" ? AUDIO_INPUT : null;
    if (!midi.enabled) return null;
    const ports = midi.inputs.filter(
      (p) => p.state === "connected" && !midi.profile(p.id)?.ignored,
    );
    if (!ports.length) return null;
    const last = input.lastEvent;
    const id =
      last && "deviceId" in last && last.deviceId && ports.some((p) => p.id === last.deviceId)
        ? last.deviceId
        : undefined;
    return id ? deviceInput(id) : ports.length === 1 ? deviceInput(ports[0].id) : MIDI_INPUT;
  },
  /** What the router subtracts right now. */
  get applied(): LegacyOffsets {
    return routerOffsets(map(), legacy(), audio.outputs);
  },
  /** The offset saved for this input on the current output (or one not yet moved to a pair). */
  offset(key: string): number | undefined {
    const old = legacy();
    const kept =
      key === AUDIO_INPUT
        ? old.audioMs || undefined
        : key === MIDI_INPUT
          ? old.midiMs || undefined
          : old.deviceMs[key.slice(5)];
    return lookupOffset(map(), key, audio.outputs) ?? kept;
  },
  /** False only when the output is known and this pair has no offset. */
  calibrated(key: string): boolean {
    if (!audio.outputs.length || isCalibrated(map(), key, audio.outputs)) return true;
    return calibration.offset(key) !== undefined || (key.startsWith("midi:") && !!legacy().midiMs);
  },
  /** Offer the tap-along: an uncalibrated pair whose offer was not skipped. */
  offer(key: string | null): boolean {
    if (!key || calibration.calibrated(key)) return false;
    const skipped = settings.value.calibrationSkipped ?? [];
    return !audio.outputs.some((out) => skipped.includes(pairKey(key, out)));
  },
  save(key: string, ms: number) {
    if (!audio.outputs.length) return Promise.resolve();
    return settings.update({
      calibration: { ...map(), [pairKey(key, audio.outputs[0])]: Math.round(ms) },
    });
  },
  /** Forget this input's offset on the current output. */
  reset(key: string) {
    const next = { ...map() };
    for (const out of audio.outputs) delete next[pairKey(key, out)];
    return settings.update({ calibration: next });
  },
  skip(key: string) {
    if (!audio.outputs.length) return Promise.resolve();
    const pair = pairKey(key, audio.outputs[0]);
    return settings.update({
      calibrationSkipped: [...new Set([...(settings.value.calibrationSkipped ?? []), pair])],
    });
  },
};
