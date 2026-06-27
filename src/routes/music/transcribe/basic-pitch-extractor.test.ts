import { describe, expect, test } from "vite-plus/test";

import {
  basicPitchNotesToExtracted,
  createBasicPitchModelUrl,
  tensorFlowWeightPathForModelEndpoint,
  withPatchedWeightManifestPaths,
  type BasicPitchNoteTime,
} from "./basic-pitch-extractor";

describe("basic-pitch-extractor", () => {
  test("converts Basic Pitch note timings to the transcription extractor seam", () => {
    const notes: BasicPitchNoteTime[] = [
      {
        pitchMidi: 60.2,
        startTimeSeconds: 0.125,
        durationSeconds: 0.5,
        amplitude: 0.7,
      },
      {
        pitchMidi: 63.6,
        startTimeSeconds: 0.75,
        durationSeconds: 0.25,
        amplitude: 1.3,
      },
    ];

    expect(basicPitchNotesToExtracted(notes)).toEqual([
      { midiNote: 60, startSec: 0.125, durationSec: 0.5, confidence: 0.7 },
      { midiNote: 64, startSec: 0.75, durationSec: 0.25, confidence: 1 },
    ]);
  });

  test("patches model shard paths to bundled asset URLs", () => {
    const model = {
      weightsManifest: [
        {
          paths: ["group1-shard1of1.bin"],
          weights: [{ name: "kernel", shape: [1], dtype: "float32" }],
        },
      ],
    };

    expect(withPatchedWeightManifestPaths(model, "https://assets.example/basic-pitch.bin")).toEqual(
      {
        weightsManifest: [
          {
            paths: ["https://assets.example/basic-pitch.bin"],
            weights: [{ name: "kernel", shape: [1], dtype: "float32" }],
          },
        ],
      },
    );
    expect(model.weightsManifest[0]?.paths).toEqual(["group1-shard1of1.bin"]);
  });

  test("builds TensorFlow-compatible weight paths relative to the model endpoint", () => {
    expect(
      tensorFlowWeightPathForModelEndpoint(
        "/_app/immutable/assets/group1-shard1of1.hash.bin",
        "/music/transcribe/basic-pitch-model.json",
        "http://localhost:5173/music/transcribe",
      ),
    ).toBe("../../_app/immutable/assets/group1-shard1of1.hash.bin");
    expect(
      tensorFlowWeightPathForModelEndpoint(
        "http://localhost:5173/_app/immutable/assets/group1-shard1of1.hash.bin",
        "/music/transcribe/basic-pitch-model.json",
        "http://localhost:5173/music/transcribe",
      ),
    ).toBe("../../_app/immutable/assets/group1-shard1of1.hash.bin");
  });

  test("points Basic Pitch at the same-origin model manifest endpoint", () => {
    expect(createBasicPitchModelUrl("/_app/immutable/assets/group1-shard1of1.hash.bin")).toBe(
      "/music/transcribe/basic-pitch-model.json?weightPath=..%2F..%2F_app%2Fimmutable%2Fassets%2Fgroup1-shard1of1.hash.bin",
    );
  });
});
