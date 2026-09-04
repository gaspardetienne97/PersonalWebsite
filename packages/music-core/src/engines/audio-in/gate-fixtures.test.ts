import { describe, expect, test } from "vitest";

import triadUrl from "./__fixtures__/c-major-triad.pcm?url";
import lowerOctaveUrl from "./__fixtures__/c3-lower-octave.pcm?url";
import singleUrl from "./__fixtures__/c4-single.pcm?url";
import { decodePcm16, frames } from "./__fixtures__/synthetic-frames";
import { computeNoteEnergies } from "./chroma";
import { NoteGate, type NoteGateResult } from "./note-gate";
import { frameRms } from "./onset-detect";

const SAMPLE_RATE = 44_100;

async function load(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  return decodePcm16(await response.arrayBuffer());
}

/** Runs a rendered fixture through the shared bank scan and the gate. */
async function run(url: string, target: number[]): Promise<NoteGateResult[]> {
  const samples = await load(url);
  const gate = new NoteGate();
  gate.setTarget(target);
  const results: NoteGateResult[] = [];
  for (const frame of frames(samples)) {
    const noteEnergies = computeNoteEnergies(frame, { sampleRate: SAMPLE_RATE });
    results.push(gate.process({ noteEnergies, rms: frameRms(frame), onset: false }));
  }
  return results;
}

describe("PCM fixtures through the gate", () => {
  test("a rendered C4 with piano-like partials matches target C4 and nothing else", async () => {
    const results = await run(singleUrl, [60]);
    expect(results[0]!.reason).toBe("low-signal");
    expect(results.filter(({ matched }) => matched)).toHaveLength(1);
    expect(
      results.slice(1).every(({ observed }) => observed.length === 1 && observed[0] === 60),
    ).toBe(true);
  });

  test("a rendered C-major triad matches its exact target", async () => {
    const results = await run(triadUrl, [60, 64, 67]);
    expect(results.filter(({ matched }) => matched)).toHaveLength(1);
    expect(results.at(-1)!.observed).toEqual([60, 64, 67]);
  });

  test("the triad never matches a partial or wrong-octave target", async () => {
    expect((await run(triadUrl, [60, 64])).some(({ matched }) => matched)).toBe(false);
    expect((await run(triadUrl, [72, 76, 79])).some(({ matched }) => matched)).toBe(false);
  });

  test("a rendered C3 does not pass as C4 through its second partial", async () => {
    const results = await run(lowerOctaveUrl, [60]);
    expect(results.some(({ matched }) => matched)).toBe(false);
    expect(results.slice(1).every(({ observed }) => !observed.includes(60))).toBe(true);
  });
});
