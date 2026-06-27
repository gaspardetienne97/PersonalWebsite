import type { ExtractedTranscriptionNote } from "@repo/music-core/engines/transcription";

import modelShardUrl from "@spotify/basic-pitch/model/group1-shard1of1.bin?url";

const BASIC_PITCH_SAMPLE_RATE = 22_050;
const BASIC_PITCH_MODEL_ENDPOINT = "/music/transcribe/basic-pitch-model.json";

export interface BasicPitchNoteTime {
  pitchMidi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  amplitude: number;
}

interface BasicPitchModelDefinition {
  weightsManifest?: Array<{ paths?: string[]; weights?: unknown[] }>;
  [key: string]: unknown;
}

export type BasicPitchProgressCallback = (progress: number) => void;

export function basicPitchNotesToExtracted(
  notes: BasicPitchNoteTime[],
): ExtractedTranscriptionNote[] {
  return notes.map((note) => ({
    midiNote: Math.round(note.pitchMidi),
    startSec: round(note.startTimeSeconds),
    durationSec: round(note.durationSeconds),
    confidence: clamp01(note.amplitude),
  }));
}

export function withPatchedWeightManifestPaths(
  model: BasicPitchModelDefinition,
  shardUrl: string,
): BasicPitchModelDefinition {
  return {
    ...model,
    weightsManifest: model.weightsManifest?.map((manifest) => ({
      ...manifest,
      paths: manifest.paths?.map(() => shardUrl),
    })),
  };
}

export function createBasicPitchExtractor(
  onProgress?: BasicPitchProgressCallback,
): (file: File) => Promise<ExtractedTranscriptionNote[]> {
  return async (file) => extractBasicPitchNotes(file, onProgress);
}

export async function extractBasicPitchNotes(
  file: File,
  onProgress: BasicPitchProgressCallback = () => undefined,
): Promise<ExtractedTranscriptionNote[]> {
  if (typeof AudioContext === "undefined" || typeof OfflineAudioContext === "undefined") {
    throw new Error("Basic Pitch extraction requires browser audio APIs.");
  }

  const { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } =
    await import("@spotify/basic-pitch");
  const audio = await decodeToBasicPitchAudio(file);

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  const model = new BasicPitch(createBasicPitchModelUrl(modelShardUrl));
  try {
    try {
      await model.evaluateModel(
        audio,
        (nextFrames, nextOnsets, nextContours) => {
          frames.push(...nextFrames);
          onsets.push(...nextOnsets);
          contours.push(...nextContours);
        },
        onProgress,
      );
    } catch (error) {
      throw new Error(
        `Could not run Basic Pitch locally. ${error instanceof Error ? error.message : "Model evaluation failed."}`,
      );
    }
    const notes = noteFramesToTime(
      addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)),
    );
    return basicPitchNotesToExtracted(notes);
  } finally {
    void model.model.then((graphModel) => graphModel.dispose()).catch(() => undefined);
  }
}

async function decodeToBasicPitchAudio(file: File): Promise<Float32Array> {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    const targetLength = Math.max(1, Math.ceil(decoded.duration * BASIC_PITCH_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, targetLength, BASIC_PITCH_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Float32Array(rendered.getChannelData(0));
  } finally {
    await audioContext.close();
  }
}

export function createBasicPitchModelUrl(shardUrl: string): string {
  const weightPath = tensorFlowWeightPathForModelEndpoint(shardUrl);
  return `${BASIC_PITCH_MODEL_ENDPOINT}?weightPath=${encodeURIComponent(weightPath)}`;
}

export function tensorFlowWeightPathForModelEndpoint(
  assetUrl: string,
  modelEndpoint = BASIC_PITCH_MODEL_ENDPOINT,
  baseUrl = globalThis.location?.href,
): string {
  if (!baseUrl) return assetUrl;
  const modelUrl = new URL(modelEndpoint, baseUrl);
  const resolvedAssetUrl = new URL(assetUrl, baseUrl);
  if (resolvedAssetUrl.origin !== modelUrl.origin) return resolvedAssetUrl.href;
  const modelDirectoryDepth = modelUrl.pathname.split("/").filter(Boolean).slice(0, -1).length;
  const relativeRoot = "../".repeat(modelDirectoryDepth);
  return `${relativeRoot}${resolvedAssetUrl.pathname.slice(1)}${resolvedAssetUrl.search}${resolvedAssetUrl.hash}`;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
