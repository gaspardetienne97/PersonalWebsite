import { afterEach, expect, test, vi } from "vitest";

import { ChordAudioSource, type ChordAnalysis } from "./chord-source";
import { chromaFromNoteEnergies, computeChroma } from "./chroma";
import { frameRms } from "./onset-detect";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("stops a stream that arrives after a pending start is cancelled", async () => {
  let resolveStream!: (stream: MediaStream) => void;
  const stopTrack = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  const context = vi.fn();

  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(
        () =>
          new Promise<MediaStream>((resolve) => {
            resolveStream = resolve;
          }),
      ),
    },
  });
  vi.stubGlobal("AudioContext", context);

  const source = new ChordAudioSource();
  const start = source.start();
  expect(source.state.status).toBe("requesting");

  await source.stop();
  resolveStream(stream);
  await start;

  expect(stopTrack).toHaveBeenCalledOnce();
  expect(context).not.toHaveBeenCalled();
  expect(source.state.status).toBe("idle");
});

test("closes a late context and stream when stop wins worklet loading", async () => {
  let resolveWorklet!: () => void;
  const stopTrack = vi.fn();
  const closeContext = vi.fn(async () => {});
  const createMediaStreamSource = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;

  class FakeAudioContext {
    audioWorklet = {
      addModule: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveWorklet = resolve;
          }),
      ),
    };
    sampleRate = 44_100;
    state = "running";
    createMediaStreamSource = createMediaStreamSource;
    close = closeContext;
  }

  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);

  const source = new ChordAudioSource();
  const start = source.start();
  await vi.waitFor(() => expect(resolveWorklet).toBeTypeOf("function"));

  await source.stop();
  resolveWorklet();
  await start;

  expect(stopTrack).toHaveBeenCalledOnce();
  expect(closeContext).toHaveBeenCalledOnce();
  expect(createMediaStreamSource).not.toHaveBeenCalled();
  expect(source.state.status).toBe("idle");
});

test("publishes the one note-energy scan beside byte-identical chroma, RMS, and sample rate", async () => {
  const nodes: FakeAudioWorkletNode[] = [];
  class FakeAudioWorkletNode {
    port = { onmessage: null as ((event: { data: Float32Array }) => void) | null, close: vi.fn() };
    disconnect = vi.fn();
    constructor() {
      nodes.push(this);
    }
  }
  class FakeAudioContext {
    audioWorklet = { addModule: vi.fn(async () => {}) };
    sampleRate = 44_100;
    state = "running";
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
    close = vi.fn(async () => {});
  }
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);

  const source = new ChordAudioSource();
  const analyses: ChordAnalysis[] = [];
  source.subscribeAnalysis((analysis) => analyses.push(analysis));
  await source.start();
  expect(source.state.status).toBe("running");

  const frame = new Float32Array(2048);
  for (let n = 0; n < frame.length; n++)
    frame[n] = 0.5 * Math.sin((2 * Math.PI * 440 * n) / 44_100);
  nodes[0]!.port.onmessage!({ data: frame });

  expect(analyses).toHaveLength(1);
  const [analysis] = analyses;
  expect(analysis!.sampleRate).toBe(44_100);
  expect(analysis!.rms).toBe(frameRms(frame));
  expect(analysis!.noteEnergies).toMatchObject({ minMidi: 40, maxMidi: 88 });
  // Chord Progression's chroma is exactly what it was: a fold of the same bank.
  expect([...analysis!.chroma]).toEqual([...computeChroma(frame, { sampleRate: 44_100 })]);
  expect([...analysis!.chroma]).toEqual([...chromaFromNoteEnergies(analysis!.noteEnergies)]);
  expect(analysis!.onset).toBeTypeOf("boolean");
  await source.stop();
});
