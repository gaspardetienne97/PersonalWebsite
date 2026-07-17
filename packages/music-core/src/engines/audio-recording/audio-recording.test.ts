import { describe, expect, test, vi } from "vitest";

import {
  AudioTakeRecorder,
  PREFERRED_AUDIO_MIME_TYPES,
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
