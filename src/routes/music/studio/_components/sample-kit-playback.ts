/**
 * Browser-only playback lifecycle for a sample kit. It probes each assigned
 * sample for browser decodability, creates object URLs only for playable pads,
 * loads them into the shared SoundEngine, and revokes URLs when a kit is
 * replaced or disposed. Decode-failing files stay "export-only" (usable for MPC
 * export); missing blobs are "missing". Tone ownership stays in SoundEngine.
 */

import {
  sampleForPadVelocity,
  velocityLayersForAssignment,
  type MpcPadMidi,
  type ResolvedSampleKit,
  type SampleVelocityLayer,
} from "@repo/music-core/engines/sample-kit";
import type { DrumPadSample, SoundEngine } from "@repo/music-core/engines/sound";

export interface ActiveSampleLayer extends SampleVelocityLayer {
  padId: string;
  status: "playable" | "export-only" | "missing";
}

export interface ActiveSamplePad {
  midiNote: MpcPadMidi;
  padId: string;
  sampleId: string;
  label: string;
  status: "playable" | "export-only" | "missing";
  layers?: ActiveSampleLayer[];
  chokeGroup?: number;
}

export interface ActiveSampleKit {
  kitId: string;
  name: string;
  pads: ActiveSamplePad[];
}

export interface SampleKitPlaybackOptions {
  sound: Pick<SoundEngine, "loadDrumKit" | "playDrum" | "stopDrum">;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  canDecode?: (blob: Blob) => Promise<boolean>;
}

export class SampleKitPlaybackController {
  readonly #sound: Pick<SoundEngine, "loadDrumKit" | "playDrum" | "stopDrum">;
  readonly #createObjectURL: (blob: Blob) => string;
  readonly #revokeObjectURL: (url: string) => void;
  readonly #canDecode: (blob: Blob) => Promise<boolean>;

  #urls: string[] = [];
  #padByMidi = new Map<number, string>();
  #layersByMidi = new Map<number, ActiveSampleLayer[]>();
  #chokeGroupByMidi = new Map<number, number>();
  #padIdsByChokeGroup = new Map<number, string[]>();

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
    const layersByMidi = new Map<number, ActiveSampleLayer[]>();
    const chokeGroupByMidi = new Map<number, number>();
    const padIdsByChokeGroup = new Map<number, string[]>();
    const pads: ActiveSamplePad[] = [];

    const assignments = [...resolved.kit.assignments].sort(
      (left, right) => left.midiNote - right.midiNote,
    );
    for (const assignment of assignments) {
      const layers = await Promise.all(
        velocityLayersForAssignment(assignment).map(async (layer, index) => {
          const padId =
            assignment.velocityLayers === undefined
              ? `pad-${assignment.midiNote}`
              : `pad-${assignment.midiNote}-layer-${index + 1}`;
          const resolvedSample = samplesById.get(layer.sampleId);
          let status: ActiveSampleLayer["status"];

          if (!resolvedSample || resolvedSample.status === "missing" || !resolvedSample.blob) {
            status = "missing";
          } else if (await this.#canDecode(resolvedSample.blob)) {
            const url = this.#createObjectURL(resolvedSample.blob);
            newUrls.push(url);
            drumKit.push({ padId, midiNote: assignment.midiNote, url });
            status = "playable";
          } else {
            status = "export-only";
          }

          return { ...layer, padId, status };
        }),
      );
      const playable = layers.find((layer) => layer.status === "playable");
      const padId = playable?.padId ?? `pad-${assignment.midiNote}`;
      const status: ActiveSamplePad["status"] = layers.some((layer) => layer.status === "playable")
        ? "playable"
        : layers.some((layer) => layer.status === "export-only")
          ? "export-only"
          : "missing";
      if (playable) padByMidi.set(assignment.midiNote, playable.padId);
      layersByMidi.set(assignment.midiNote, layers);
      if (assignment.chokeGroup !== undefined) {
        chokeGroupByMidi.set(assignment.midiNote, assignment.chokeGroup);
        const grouped = padIdsByChokeGroup.get(assignment.chokeGroup) ?? [];
        grouped.push(
          ...layers.filter((layer) => layer.status === "playable").map((layer) => layer.padId),
        );
        padIdsByChokeGroup.set(assignment.chokeGroup, grouped);
      }

      pads.push({
        midiNote: assignment.midiNote,
        padId,
        sampleId: assignment.sampleId,
        label: assignment.label,
        status,
        layers,
        ...(assignment.chokeGroup === undefined ? {} : { chokeGroup: assignment.chokeGroup }),
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
    this.#layersByMidi = layersByMidi;
    this.#chokeGroupByMidi = chokeGroupByMidi;
    this.#padIdsByChokeGroup = padIdsByChokeGroup;
    return { kitId: resolved.kit.id, name: resolved.kit.name, pads };
  }

  playMidi(midiNote: number, velocity = 0.8): boolean {
    const layers = this.#layersByMidi.get(midiNote);
    const playableLayers = layers?.filter((layer) => layer.status === "playable") ?? [];
    const selectedLayer =
      playableLayers.length > 0
        ? sampleForPadVelocity(
            {
              midiNote: midiNote as MpcPadMidi,
              sampleId: playableLayers[0]!.sampleId,
              label: playableLayers[0]!.label,
              velocityLayers: playableLayers,
            },
            velocity,
          )
        : undefined;
    const selected = playableLayers.find((layer) => layer.sampleId === selectedLayer?.sampleId);
    const padId = selected?.padId ?? this.#padByMidi.get(midiNote);
    if (!padId) return false;
    const chokeGroup = this.#chokeGroupByMidi.get(midiNote);
    if (chokeGroup !== undefined) {
      for (const groupedPadId of this.#padIdsByChokeGroup.get(chokeGroup) ?? []) {
        if (groupedPadId !== padId) this.#sound.stopDrum(groupedPadId, undefined);
      }
    }
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
    this.#layersByMidi.clear();
    this.#chokeGroupByMidi.clear();
    this.#padIdsByChokeGroup.clear();
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
