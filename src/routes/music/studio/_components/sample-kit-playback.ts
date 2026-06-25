/**
 * Browser-only playback lifecycle for a sample kit. It probes each assigned
 * sample for browser decodability, creates object URLs only for playable pads,
 * loads them into the shared SoundEngine, and revokes URLs when a kit is
 * replaced or disposed. Decode-failing files stay "export-only" (usable for MPC
 * export); missing blobs are "missing". Tone ownership stays in SoundEngine.
 */

import { type MpcPadMidi, type ResolvedSampleKit } from "@repo/music-core/engines/sample-kit";
import type { DrumPadSample, SoundEngine } from "@repo/music-core/engines/sound";

export interface ActiveSamplePad {
  midiNote: MpcPadMidi;
  padId: string;
  sampleId: string;
  label: string;
  status: "playable" | "export-only" | "missing";
}

export interface ActiveSampleKit {
  kitId: string;
  name: string;
  pads: ActiveSamplePad[];
}

export interface SampleKitPlaybackOptions {
  sound: Pick<SoundEngine, "loadDrumKit" | "playDrum">;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  canDecode?: (blob: Blob) => Promise<boolean>;
}

export class SampleKitPlaybackController {
  readonly #sound: Pick<SoundEngine, "loadDrumKit" | "playDrum">;
  readonly #createObjectURL: (blob: Blob) => string;
  readonly #revokeObjectURL: (url: string) => void;
  readonly #canDecode: (blob: Blob) => Promise<boolean>;

  #urls: string[] = [];
  #padByMidi = new Map<number, string>();

  constructor(options: SampleKitPlaybackOptions) {
    this.#sound = options.sound;
    this.#createObjectURL = options.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
    this.#revokeObjectURL = options.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
    this.#canDecode = options.canDecode ?? defaultCanDecode;
  }

  async activate(resolved: ResolvedSampleKit): Promise<ActiveSampleKit> {
    const samplesById = new Map(resolved.samples.map((sample) => [sample.asset.id, sample]));
    const newUrls: string[] = [];
    const drumKit: DrumPadSample[] = [];
    const padByMidi = new Map<number, string>();
    const pads: ActiveSamplePad[] = [];

    const assignments = [...resolved.kit.assignments].sort(
      (left, right) => left.midiNote - right.midiNote,
    );
    for (const assignment of assignments) {
      const padId = `pad-${assignment.midiNote}`;
      const resolvedSample = samplesById.get(assignment.sampleId);
      let status: ActiveSamplePad["status"];

      if (!resolvedSample || resolvedSample.status === "missing" || !resolvedSample.blob) {
        status = "missing";
      } else if (await this.#canDecode(resolvedSample.blob)) {
        const url = this.#createObjectURL(resolvedSample.blob);
        newUrls.push(url);
        drumKit.push({ padId, midiNote: assignment.midiNote, url });
        padByMidi.set(assignment.midiNote, padId);
        status = "playable";
      } else {
        status = "export-only";
      }

      pads.push({
        midiNote: assignment.midiNote,
        padId,
        sampleId: assignment.sampleId,
        label: assignment.label,
        status,
      });
    }

    try {
      await this.#sound.loadDrumKit(drumKit);
    } catch (error) {
      for (const url of newUrls) this.#revokeObjectURL(url);
      throw error;
    }

    for (const url of this.#urls) this.#revokeObjectURL(url);
    this.#urls = newUrls;
    this.#padByMidi = padByMidi;
    return { kitId: resolved.kit.id, name: resolved.kit.name, pads };
  }

  playMidi(midiNote: number, velocity = 0.8): boolean {
    const padId = this.#padByMidi.get(midiNote);
    if (!padId) return false;
    this.#sound.playDrum(padId, undefined, velocity);
    return true;
  }

  padIdForMidi(midiNote: number): string | undefined {
    return this.#padByMidi.get(midiNote);
  }

  dispose(): void {
    for (const url of this.#urls) this.#revokeObjectURL(url);
    this.#urls = [];
    this.#padByMidi.clear();
  }
}

async function defaultCanDecode(blob: Blob): Promise<boolean> {
  const AudioContextCtor =
    (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return false;
  const context = new AudioContextCtor();
  try {
    await context.decodeAudioData(await blob.arrayBuffer());
    return true;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}
