import { describe, expect, test, vi } from "vitest";

import {
  amplitudeToDb,
  applyPlaybackGain,
  AudioTakeRecorder,
  closePlaybackContext,
  createTakeEnvelopeCache,
  releasePlaybackGain,
  dbToAmplitude,
  formatDb,
  levelAdvice,
  PREFERRED_AUDIO_MIME_TYPES,
  SILENCE_DB,
  takePeaks,
  type AudioTakeRecorderOptions,
} from "./index";

class FakeTrack {
  readonly stop = vi.fn();
}

class FakeStream {
  readonly tracks = [new FakeTrack(), new FakeTrack()];

  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeRecorder {
  state: RecordingState = "inactive";
  mimeType: string;
  readonly start = vi.fn(() => {
    this.state = "recording";
  });
  readonly stop = vi.fn(() => {
    this.state = "inactive";
    this.emit("stop", {});
  });
  readonly #listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(
    readonly stream: MediaStream,
    options: MediaRecorderOptions = {},
  ) {
    this.mimeType = options.mimeType ?? "audio/webm";
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emitData(blob: Blob): void {
    this.emit("dataavailable", { data: blob });
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event as Event);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createHarness(
  overrides: Partial<AudioTakeRecorderOptions> & {
    getUserMedia?: ReturnType<typeof vi.fn>;
    isTypeSupported?: (mimeType: string) => boolean;
  } = {},
) {
  const stream = new FakeStream();
  const recorders: FakeRecorder[] = [];
  const devices = [
    { deviceId: "usb-mic", kind: "audioinput", label: "USB mic" },
    { deviceId: "camera", kind: "videoinput", label: "Camera" },
  ] as MediaDeviceInfo[];
  const getUserMedia =
    overrides.getUserMedia ?? vi.fn(async () => stream as unknown as MediaStream);
  const mediaDevices = {
    getUserMedia,
    enumerateDevices: vi.fn(async () => devices),
  };
  const recorder = new AudioTakeRecorder({
    mediaDevices: mediaDevices as unknown as AudioTakeRecorderOptions["mediaDevices"],
    recorderFactory: (inputStream, options) => {
      const fake = new FakeRecorder(inputStream, options);
      recorders.push(fake);
      return fake as unknown as MediaRecorder;
    },
    isTypeSupported:
      overrides.isTypeSupported ??
      ((mimeType) => mimeType === "audio/webm;codecs=opus" || mimeType === "audio/webm"),
    ...overrides,
  });

  return { recorder, stream, recorders, mediaDevices, devices };
}

describe("AudioTakeRecorder", () => {
  test("prepares a selected device and records a dry audio take", async () => {
    const { recorder, recorders, mediaDevices } = createHarness();

    await recorder.prepare("usb-mic");
    recorder.start({ id: "take-1", startedAtMonotonic: 100 });
    recorders[0]!.emitData(new Blob(["audio"], { type: "audio/webm" }));
    const result = await recorder.stop(1_600);

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        deviceId: { exact: "usb-mic" },
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    expect(result).toMatchObject({
      id: "take-1",
      mimeType: "audio/webm;codecs=opus",
      size: 5,
      durationMs: 1_500,
    });
    await expect(result.blob.text()).resolves.toBe("audio");
    expect(recorder.state.status).toBe("ready");
  });

  test("lists only audio input devices", async () => {
    const { recorder } = createHarness();

    await expect(recorder.devices()).resolves.toEqual([
      { deviceId: "usb-mic", kind: "audioinput", label: "USB mic" },
    ]);
  });

  test("reports denied microphone permission", async () => {
    const error = new DOMException("Denied", "NotAllowedError");
    const { recorder } = createHarness({
      getUserMedia: vi.fn(async () => {
        throw error;
      }),
    });

    await expect(recorder.prepare()).rejects.toBe(error);
    expect(recorder.state).toMatchObject({
      status: "denied",
      message: "Microphone access denied.",
    });
  });

  test("rejects unsupported browsers", async () => {
    const recorder = new AudioTakeRecorder({
      mediaDevices: undefined,
      recorderFactory: undefined,
    });

    await expect(recorder.prepare()).rejects.toThrow(/not supported/i);
    expect(recorder.state.status).toBe("error");
  });

  test("uses the first supported preferred MIME type but preserves recorder MIME", async () => {
    const { recorder, recorders } = createHarness({
      isTypeSupported: (mimeType) => mimeType === "audio/mp4",
    });

    await recorder.prepare();
    recorder.start({ id: "take-mp4", startedAtMonotonic: 0 });
    recorders[0]!.mimeType = "audio/mp4;codecs=mp4a.40.2";
    recorders[0]!.emitData(new Blob(["mp4"], { type: "audio/mp4" }));
    const result = await recorder.stop(500);

    expect(recorder.state.mimeType).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(result.mimeType).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(PREFERRED_AUDIO_MIME_TYPES).toContain("audio/mp4");
  });

  test("rejects duplicate starts and invalid stop timing", async () => {
    const { recorder } = createHarness();
    await recorder.prepare();

    recorder.start({ id: "take-1", startedAtMonotonic: 100 });

    expect(() => recorder.start({ id: "take-2", startedAtMonotonic: 200 })).toThrow(/recording/i);
    await expect(recorder.stop(50)).rejects.toThrow(/duration/i);
  });

  test("cancels active recording and stops stream tracks", async () => {
    const { recorder, recorders, stream } = createHarness();
    await recorder.prepare();
    recorder.start({ id: "take-1", startedAtMonotonic: 100 });

    await recorder.cancel();

    expect(recorders[0]!.stop).toHaveBeenCalled();
    expect(stream.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
    expect(recorder.state.status).toBe("idle");
  });

  test("stops every late permission track and stays idle after cancellation", async () => {
    const permission = deferred<MediaStream>();
    const { recorder, stream } = createHarness({
      getUserMedia: vi.fn(() => permission.promise),
    });

    const prepare = recorder.prepare();
    await vi.waitFor(() => expect(recorder.state.status).toBe("requesting"));
    await recorder.cancel();
    permission.resolve(stream as unknown as MediaStream);
    await prepare;

    expect(stream.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
    expect(recorder.state.status).toBe("idle");
  });

  test("stops every late permission track and publishes no ready state after disposal", async () => {
    const permission = deferred<MediaStream>();
    const { recorder, stream } = createHarness({
      getUserMedia: vi.fn(() => permission.promise),
    });
    const states: string[] = [];
    recorder.subscribe((state) => states.push(state.status));

    const prepare = recorder.prepare();
    await vi.waitFor(() => expect(recorder.state.status).toBe("requesting"));
    await recorder.dispose();
    permission.resolve(stream as unknown as MediaStream);
    await prepare;

    expect(stream.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
    expect(recorder.state.status).toBe("idle");
    expect(states.at(-1)).toBe("idle");
    expect(states).not.toContain("ready");
  });

  test("stops automatically at max duration", async () => {
    vi.useFakeTimers();
    try {
      const { recorder, recorders } = createHarness({ maxDurationMs: 1_000 });
      await recorder.prepare();
      recorder.start({ id: "take-1", startedAtMonotonic: 0 });

      vi.advanceTimersByTime(1_000);

      expect(recorders[0]!.stop).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("disposes streams and subscribers", async () => {
    const { recorder, stream } = createHarness();
    const listener = vi.fn();
    const unsubscribe = recorder.subscribe(listener);
    await recorder.prepare();

    unsubscribe();
    await recorder.dispose();

    expect(stream.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(recorder.state.status).toBe("idle");
  });
});

class FakeAnalyser {
  fftSize = 1024;
  readonly disconnect = vi.fn();
  amplitude = 0;

  getFloatTimeDomainData(target: Float32Array): void {
    target.fill(0);
    target[0] = this.amplitude;
  }
}

function fakeAudioContext() {
  const analyser = new FakeAnalyser();
  const context = {
    analyser,
    close: vi.fn(async () => {}),
    createAnalyser: () => analyser as unknown as AnalyserNode,
    createMediaStreamSource: () =>
      ({ connect: vi.fn(), disconnect: vi.fn() }) as unknown as MediaStreamAudioSourceNode,
  };
  return context;
}

function audioBuffer(samples: number[], channels = 1): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    length: data.length,
    numberOfChannels: channels,
    sampleRate: 48_000,
    duration: data.length / 48_000,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("level helpers", () => {
  test("converts between amplitude and dB and floors silence", () => {
    expect(amplitudeToDb(1)).toBeCloseTo(0, 5);
    expect(amplitudeToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(amplitudeToDb(0)).toBe(SILENCE_DB);
    expect(formatDb(-6.2)).toBe("−6 dB");
    expect(formatDb(6.2)).toBe("+6 dB");
    expect(formatDb(0)).toBe("0 dB");
    expect(dbToAmplitude(0)).toBe(1);
    expect(dbToAmplitude(-6.02)).toBeCloseTo(0.5, 3);
  });

  test("a 12 dB boost raises the measured peak by about 12 dB", () => {
    const peak = 0.2;
    expect(amplitudeToDb(peak * dbToAmplitude(12)) - amplitudeToDb(peak)).toBeCloseTo(12, 5);
  });

  test("names the band and says what to do about it", () => {
    expect(levelAdvice(-9)).toEqual({ tone: "good", sentence: "peak −9 dB, good level" });
    expect(levelAdvice(-40)).toEqual({
      tone: "quiet",
      sentence: "quiet, move closer or raise the interface gain",
    });
    expect(levelAdvice(-3).tone).toBe("hot");
    expect(levelAdvice(-0.5).tone).toBe("clipping");
    expect(levelAdvice(-0.5).sentence).toContain("lower the interface gain");
  });
});

describe("takePeaks", () => {
  test("returns exactly the requested bins and the peak in dB", async () => {
    const samples = Array.from({ length: 64 }, (_, index) => (index === 40 ? -0.5 : 0.1));
    const envelope = await takePeaks(new Blob(["x"]), 8, {
      decode: async () => audioBuffer(samples),
    });

    expect(envelope.peaks).toHaveLength(8);
    expect(envelope.peaks[5]).toBeCloseTo(0.5, 5); // bin 5 holds frame 40 of 64
    expect(envelope.peaks[0]).toBeCloseTo(0.1, 5);
    expect(envelope.peakDb).toBeCloseTo(-6.02, 2);
  });

  test("reports a silent take at the silence floor", async () => {
    const envelope = await takePeaks(new Blob(["x"]), 4, {
      decode: async () => audioBuffer([0, 0, 0, 0]),
    });

    expect(envelope.peaks).toEqual([0, 0, 0, 0]);
    expect(envelope.peakDb).toBe(SILENCE_DB);
  });
});

describe("createTakeEnvelopeCache", () => {
  test("decodes a take once and reuses the cached envelope", async () => {
    const decode = vi.fn(async () => audioBuffer([0.25, 0.25]));
    const loadBlob = vi.fn(async (id: string) => (id === "take-1" ? new Blob(["x"]) : undefined));
    const envelopeFor = createTakeEnvelopeCache(loadBlob, 4, { decode });

    const [first, second] = await Promise.all([envelopeFor("take-1"), envelopeFor("take-1")]);
    const third = await envelopeFor("take-1");

    expect(first?.peaks).toHaveLength(4);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(decode).toHaveBeenCalledOnce();
    expect(loadBlob).toHaveBeenCalledOnce();
    await expect(envelopeFor("missing")).resolves.toBeUndefined();
  });

  test("retries a take whose blob was not there yet", async () => {
    const decode = vi.fn(async () => audioBuffer([0.5]));
    const loadBlob = vi
      .fn<(id: string) => Promise<Blob | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(new Blob(["x"]));
    const envelopeFor = createTakeEnvelopeCache(loadBlob, 2, { decode });

    await expect(envelopeFor("take-1")).resolves.toBeUndefined();
    await expect(envelopeFor("take-1")).resolves.toMatchObject({ peaks: expect.any(Array) });
    expect(loadBlob).toHaveBeenCalledTimes(2);
  });
});

describe("playback gain", () => {
  test("routes an element, releases it, and closes the shared context", async () => {
    const quiet = new Audio();
    expect(applyPlaybackGain(quiet, 0)).toBe(false); // nothing to route at unity

    const first = new Audio();
    expect(applyPlaybackGain(first, 6)).toBe(true);
    expect(applyPlaybackGain(first, -6)).toBe(true); // re-gaining reuses the one source node
    releasePlaybackGain(first);
    releasePlaybackGain(first); // idempotent
    releasePlaybackGain(undefined);

    const second = new Audio();
    expect(applyPlaybackGain(second, 12)).toBe(true);
    await closePlaybackContext();

    // A closed context is replaced rather than reused, so later playback still gains.
    const third = new Audio();
    expect(applyPlaybackGain(third, 12)).toBe(true);
    await closePlaybackContext();
  });
});

describe("input level meter", () => {
  test("publishes a live level and a decaying peak hold while armed", async () => {
    vi.useFakeTimers();
    try {
      const context = fakeAudioContext();
      const { recorder } = createHarness({
        audioContextFactory: () => context as unknown as AudioContext,
        meterIntervalMs: 50,
      });

      await recorder.prepare();
      context.analyser.amplitude = 0.5;
      vi.advanceTimersByTime(50);
      expect(recorder.state.levelDb).toBeCloseTo(-6.02, 2);
      expect(recorder.state.peakDb).toBeCloseTo(-6.02, 2);

      context.analyser.amplitude = 0.05;
      vi.advanceTimersByTime(50);
      expect(recorder.state.levelDb).toBeCloseTo(-26.02, 2);
      expect(recorder.state.peakDb).toBeGreaterThan(recorder.state.levelDb!);

      await recorder.cancel();
      expect(recorder.state.levelDb).toBeUndefined();
      expect(recorder.state.peakDb).toBeUndefined();
      expect(context.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
