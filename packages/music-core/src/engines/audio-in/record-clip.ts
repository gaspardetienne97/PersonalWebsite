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

export function micClipSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function recordMicClip(options: RecordMicClipOptions = {}): Promise<Blob> {
  const durationMs = Math.max(200, Math.floor(options.durationMs ?? 1200));
  if (!options.getStream && !micClipSupported()) {
    throw new Error("Microphone recording is not supported here.");
  }

  const stream = await (options.getStream
    ? options.getStream()
    : navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      }));

  try {
    const mimeType = options.mimeType ?? pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Microphone recording failed."));
    });

    recorder.start();
    await delay(durationMs);
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;

    return new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
