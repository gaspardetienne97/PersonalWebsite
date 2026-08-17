import { afterEach, expect, test, vi } from "vitest";

import { ChordAudioSource } from "./chord-source";

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
