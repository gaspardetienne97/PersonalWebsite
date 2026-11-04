// A loop cut into 16 slices and loaded on A01 to A16 as the kit, for the chop
// drill and a written piece's chop section. Leaving puts Create's kit back.
import { encodeWav } from "@repo/music-core/io/wav";
import {
  CHOP_SLICES,
  chopSourceNotes,
  sliceSamples,
  slicePad,
} from "@repo/music-core/content/pads-studio";
import { audio } from "$lib/music/runtime";
import { peaks } from "./lanes";
import { kits } from "$lib/music/hubs/create/kitStore.svelte";

/**
 * While this says yes for a hit's time, MIDI hits on A01 to A16 play the
 * slices and the pads page leaves its drum sound out (a written piece's chop
 * bars). The chop drill plays slices throughout and needs no hook.
 */
export const padSound: { slicesAt: ((at: number) => boolean) | null } = { slicesAt: null };

/** An audio file as a buffer (an imported loop). */
export const decodeLoop = async (blob: Blob) =>
  new OfflineAudioContext(2, 1, 44100).decodeAudioData(await blob.arrayBuffer());

/**
 * Render one of the app's loops at the tempo (or take an imported one), cut it and load the slices.
 * Returns the loop's outline, `perSlice` bins a slice, for the slice picture.
 */
export async function loadSlices(
  source: { id: string; bars: number },
  bpm: number,
  file?: AudioBuffer,
  perSlice = 12,
): Promise<number[]> {
  let buffer: AudioBuffer;
  let length: number;
  if (file) {
    buffer = file;
    length = buffer.length;
  } else {
    const sec = 60 / bpm;
    const notes = chopSourceNotes(source.id).map((n) => ({
      midi: n.midi,
      time: n.beat * sec,
      duration: n.beats * sec,
      velocity: n.velocity,
      voice: n.voice,
    }));
    buffer = await decodeLoop(await audio.renderWav(notes, source.bars * 4 * sec));
    length = Math.round(source.bars * 4 * sec * buffer.sampleRate);
  }
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const ls = sliceSamples(left, CHOP_SLICES, length, buffer.sampleRate);
  const rs = sliceSamples(right, CHOP_SLICES, length, buffer.sampleRate);
  // Create's kit loads once per visit; wait for it so it cannot land over the slices.
  await kits.ready;
  const pads = ls.map((l, i) => ({
    midi: slicePad(i),
    soft: new Blob([encodeWav([l, rs[i]], buffer.sampleRate) as Uint8Array<ArrayBuffer>], {
      type: "audio/wav",
    }),
    chokeGroup: 1,
  }));
  const { failed } = await audio.loadKit({ id: "chop", name: "Chop", pads });
  if (failed.length) throw new Error(`${failed.length} slices could not be read`);
  return peaks(left, length, CHOP_SLICES * perSlice);
}

/** Put Create's kit back on the pads. */
export const restoreKit = () => void kits.ready.then(() => kits.sync());
