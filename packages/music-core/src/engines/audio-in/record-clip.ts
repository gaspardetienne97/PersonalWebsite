/**
 * recordMicClip — capture a short microphone clip as a Blob via MediaRecorder.
 *
 * This is the buffered counterpart to {@link ./capture}'s streaming pitch
 * source: instead of real-time frames, it records a fixed window the caller can
 * hand to an offline analyzer (e.g. Basic Pitch) for polyphonic chord
 * identification. Pure browser glue — the stream factory is injectable so the
 * route flow stays testable without a real microphone.
 */

export interface RecordMicClipOptions {
  durationMs?: number;
  /** Override the MediaRecorder mime type; otherwise the best supported is picked. */
  mimeType?: string;
  /** Injectable stream factory (tests pass a fake; production uses getUserMedia). */
  getStream?: () => Promise<MediaStream>;
}

export interface PreparedMicClip {
  record(options?: Pick<RecordMicClipOptions, "durationMs" | "mimeType">): Promise<Blob>;
  dispose(): void;
}

export function micClipSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function recordMicClip(options: RecordMicClipOptions = {}): Promise<Blob> {
  const prepared = await prepareMicClip(options);
  try {
    return await prepared.record(options);
  } finally {
    prepared.dispose();
  }
}

export async function prepareMicClip(
  options: Pick<RecordMicClipOptions, "getStream"> = {},
): Promise<PreparedMicClip> {
  if (!options.getStream && !micClipSupported()) {
    throw new Error("Microphone recording is not supported here.");
  }

  const stream = await (options.getStream
    ? options.getStream()
    : navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      }));

  let disposed = false;
  let activeRecorder: MediaRecorder | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    async record(recordOptions = {}) {
      if (disposed) throw new Error("Prepared microphone capture has been released.");
      const durationMs = Math.max(200, Math.floor(recordOptions.durationMs ?? 1200));
      const mimeType = recordOptions.mimeType ?? pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      activeRecorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Microphone recording failed."));
      });

      recorder.start();
      stopTimer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, durationMs);
      await stopped;
      if (stopTimer !== undefined) clearTimeout(stopTimer);
      stopTimer = undefined;
      activeRecorder = undefined;
      if (disposed) throw new Error("Prepared microphone capture was cancelled.");

      return new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (stopTimer !== undefined) clearTimeout(stopTimer);
      stopTimer = undefined;
      if (activeRecorder?.state !== "inactive") activeRecorder?.stop();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}
