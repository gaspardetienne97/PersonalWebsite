/**
 * Audio export — render scheduled audio events to a 16-bit PCM WAV. The audio
 * counterpart to `midi-export`: the Studio turns its sequencer grid into drum
 * sample hits (decoded `AudioBuffer`s) and synth-fallback beeps, this engine
 * renders them offline and encodes a `.wav` Blob.
 *
 * Native `OfflineAudioContext` does the mixing; no Tone, no new dependency. The
 * context constructor is injectable so the scheduling logic stays unit-testable
 * outside a browser.
 */

export interface AudioRenderEvent {
  /** When the event fires, in seconds from the start of the render. */
  startSec: number;
  /** 0..1; clamped. Defaults to 1. */
  velocity?: number;
  /** Drum sample hit. Played one-shot from `startSec`. */
  buffer?: AudioBuffer;
  /** Synth fallback frequency in Hz (used when no `buffer` is given). */
  frequency?: number;
  /** Synth note length in seconds. Defaults to 0.16. Ignored for buffers. */
  durationSec?: number;
}

export interface AudioRenderOptions {
  /** Musical length of the render (e.g. one bar of the pattern). */
  durationSec: number;
  sampleRate?: number;
  channels?: number;
  /** Extra time so the last samples ring out past the loop end. Default 0.5. */
  tailSec?: number;
  /** Injectable for tests; defaults to the platform `OfflineAudioContext`. */
  OfflineAudioContext?: OfflineAudioContextCtor;
}

type OfflineAudioContextCtor = new (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

export async function renderEventsToWav(
  events: AudioRenderEvent[],
  options: AudioRenderOptions,
): Promise<Blob> {
  const sampleRate = options.sampleRate ?? 44100;
  const channelCount = Math.max(1, options.channels ?? 2);
  const tailSec = options.tailSec ?? 0.5;
  const Ctor = options.OfflineAudioContext ?? resolveOfflineCtor();
  if (!Ctor) throw new Error("Offline audio rendering is not supported in this browser.");

  const totalSec = Math.max(options.durationSec + tailSec, tailSec);
  const ctx = new Ctor(channelCount, Math.max(1, Math.ceil(totalSec * sampleRate)), sampleRate);

  for (const event of events) scheduleEvent(ctx, event);

  const rendered = await ctx.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c += 1) channels.push(rendered.getChannelData(c));
  return new Blob([encodeWav(channels, rendered.sampleRate)], { type: "audio/wav" });
}

function scheduleEvent(ctx: BaseAudioContext, event: AudioRenderEvent): void {
  const velocity = clamp01(event.velocity ?? 1);
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  if (event.buffer) {
    gain.gain.value = velocity;
    const source = ctx.createBufferSource();
    source.buffer = event.buffer;
    source.connect(gain);
    source.start(event.startSec);
    return;
  }

  if (event.frequency && event.frequency > 0) {
    // Short attack/decay envelope so the oscillator beep doesn't click.
    const duration = event.durationSec ?? 0.16;
    const start = event.startSec;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(velocity, start + 0.005);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = event.frequency;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

/** Interleaved little-endian 16-bit PCM WAV (RIFF). */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}

/** MIDI note number → frequency in Hz (A4 = 69 = 440 Hz). */
export function midiToFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function resolveOfflineCtor(): OfflineAudioContextCtor | undefined {
  const scope = globalThis as {
    OfflineAudioContext?: OfflineAudioContextCtor;
    webkitOfflineAudioContext?: OfflineAudioContextCtor;
  };
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext;
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
