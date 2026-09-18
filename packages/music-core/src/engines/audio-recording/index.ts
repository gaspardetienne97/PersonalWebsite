export const PREFERRED_AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/webm",
] as const;

export interface AudioTakeRecording {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  durationMs: number;
}

export interface AudioTakeRecorderState {
  status: "idle" | "requesting" | "ready" | "recording" | "stopping" | "denied" | "error";
  deviceId?: string;
  mimeType?: string;
  elapsedMs: number;
  message?: string;
  /** Live input peak in dB while a microphone is armed. */
  levelDb?: number;
  /** Peak hold in dB; decays back toward the live level. */
  peakDb?: number;
}

export interface AudioTakeRecorderOptions {
  mediaDevices?: Pick<MediaDevices, "enumerateDevices" | "getUserMedia"> | null;
  recorderFactory?: ((stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder) | null;
  isTypeSupported?: (mimeType: string) => boolean;
  mimeTypes?: readonly string[];
  maxDurationMs?: number;
  audioContextFactory?: (() => AudioContext | null) | null;
  meterIntervalMs?: number;
}

type AudioTakeRecorderSubscriber = (state: AudioTakeRecorderState) => void;

interface ActiveTake {
  id: string;
  startedAtMonotonic: number;
  chunks: Blob[];
}

const DEFAULT_MAX_DURATION_MS = 3_600_000;
const DEFAULT_METER_INTERVAL_MS = 50;
/** Peak-hold fall per meter tick: about 10 dB per second at the default interval. */
const PEAK_HOLD_DECAY_DB = 0.5;
const DEFAULT_STATE: AudioTakeRecorderState = {
  status: "idle",
  elapsedMs: 0,
};

export class AudioTakeRecorder {
  readonly #mediaDevices: AudioTakeRecorderOptions["mediaDevices"];
  readonly #recorderFactory: NonNullable<AudioTakeRecorderOptions["recorderFactory"]> | undefined;
  readonly #isTypeSupported: NonNullable<AudioTakeRecorderOptions["isTypeSupported"]>;
  readonly #mimeTypes: readonly string[];
  readonly #maxDurationMs: number;
  readonly #audioContextFactory:
    | NonNullable<AudioTakeRecorderOptions["audioContextFactory"]>
    | undefined;
  readonly #meterIntervalMs: number;
  #meter: { context: AudioContext; analyser: AnalyserNode; source: AudioNode } | undefined;
  #meterTimer: ReturnType<typeof setInterval> | undefined;
  readonly #subscribers = new Set<AudioTakeRecorderSubscriber>();
  #state: AudioTakeRecorderState = DEFAULT_STATE;
  #stream: MediaStream | undefined;
  #recorder: MediaRecorder | undefined;
  #activeTake: ActiveTake | undefined;
  #maxDurationTimer: ReturnType<typeof setTimeout> | undefined;
  #stopResolve: ((recording: AudioTakeRecording) => void) | undefined;
  #stopReject: ((error: unknown) => void) | undefined;
  #canceling = false;
  #prepareGeneration = 0;
  #disposed = false;

  constructor(options: AudioTakeRecorderOptions = {}) {
    const recorderFactory =
      "recorderFactory" in options ? options.recorderFactory : defaultRecorderFactory();
    this.#mediaDevices =
      "mediaDevices" in options ? (options.mediaDevices ?? undefined) : navigatorMediaDevices();
    this.#recorderFactory = recorderFactory ?? undefined;
    this.#isTypeSupported = options.isTypeSupported ?? defaultIsTypeSupported();
    this.#mimeTypes = options.mimeTypes ?? PREFERRED_AUDIO_MIME_TYPES;
    this.#maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    this.#audioContextFactory =
      ("audioContextFactory" in options
        ? options.audioContextFactory
        : defaultAudioContextFactory()) ?? undefined;
    this.#meterIntervalMs = options.meterIntervalMs ?? DEFAULT_METER_INTERVAL_MS;
  }

  static get supported(): boolean {
    return Boolean(navigatorMediaDevices() && defaultRecorderFactory());
  }

  get state(): AudioTakeRecorderState {
    return { ...this.#state };
  }

  async devices(): Promise<MediaDeviceInfo[]> {
    if (!this.#mediaDevices?.enumerateDevices) return [];
    const devices = await this.#mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  }

  async prepare(deviceId?: string): Promise<void> {
    if (this.#disposed) throw new Error("Audio recorder has been disposed.");
    this.#assertSupported();
    const generation = ++this.#prepareGeneration;
    await this.#stopStream();
    if (!this.#isCurrentPrepare(generation)) return;
    this.#setState({
      status: "requesting",
      deviceId,
      elapsedMs: 0,
      message: undefined,
      mimeType: undefined,
    });

    try {
      const stream = await this.#mediaDevices!.getUserMedia({
        audio: audioConstraints(deviceId),
      });
      if (!this.#isCurrentPrepare(generation)) {
        stopStreamTracks(stream);
        return;
      }
      this.#stream = stream;
      this.#setState({
        status: "ready",
        deviceId,
        mimeType: this.#preferredMimeType(),
        elapsedMs: 0,
      });
      this.#startMeter(stream);
    } catch (error) {
      if (!this.#isCurrentPrepare(generation)) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      this.#setState({
        status: denied ? "denied" : "error",
        message: denied ? "Microphone access denied." : errorMessage(error),
      });
      throw error;
    }
  }

  start(options: { id: string; startedAtMonotonic: number }): void {
    if (!options.id.trim()) throw new Error("Take id must be nonempty.");
    if (!Number.isFinite(options.startedAtMonotonic)) {
      throw new Error("Take start time must be finite.");
    }
    if (this.#state.status === "recording" || this.#state.status === "stopping") {
      throw new Error("Audio take recording is already recording.");
    }
    if (!this.#stream || !this.#recorderFactory) {
      throw new Error("Audio recorder must be prepared before starting.");
    }

    const mimeType = this.#preferredMimeType();
    const recorder = this.#recorderFactory(this.#stream, mimeType ? { mimeType } : undefined);
    this.#recorder = recorder;
    this.#activeTake = {
      id: options.id,
      startedAtMonotonic: options.startedAtMonotonic,
      chunks: [],
    };
    this.#canceling = false;
    recorder.addEventListener("dataavailable", this.#handleData);
    recorder.addEventListener("stop", this.#handleStop);
    recorder.addEventListener("error", this.#handleError);
    recorder.start();
    this.#setState({
      status: "recording",
      elapsedMs: 0,
      mimeType: recorder.mimeType || mimeType,
      message: undefined,
    });
    this.#maxDurationTimer = setTimeout(() => {
      if (this.#state.status === "recording" && this.#activeTake) {
        void this.stop(this.#activeTake.startedAtMonotonic + this.#maxDurationMs).catch(() => {
          // State is updated through the normal error path; nothing else owns this promise.
        });
      }
    }, this.#maxDurationMs);
  }

  stop(endedAtMonotonic: number): Promise<AudioTakeRecording> {
    if (!this.#activeTake || !this.#recorder) {
      return Promise.reject(new Error("Audio take recording is not active."));
    }
    if (
      !Number.isFinite(endedAtMonotonic) ||
      endedAtMonotonic < this.#activeTake.startedAtMonotonic
    ) {
      return Promise.reject(new Error("Audio take duration must be finite and nonnegative."));
    }
    if (this.#stopResolve || this.#stopReject) {
      return Promise.reject(new Error("Audio take recording is already stopping."));
    }

    this.#clearMaxDurationTimer();
    this.#setState({
      status: "stopping",
      elapsedMs: Math.round(endedAtMonotonic - this.#activeTake.startedAtMonotonic),
    });

    return new Promise<AudioTakeRecording>((resolve, reject) => {
      this.#stopResolve = resolve;
      this.#stopReject = reject;
      this.#recorder!.stop();
    });
  }

  async cancel(): Promise<void> {
    this.#prepareGeneration += 1;
    this.#canceling = true;
    this.#clearMaxDurationTimer();
    if (this.#recorder && this.#recorder.state !== "inactive") {
      this.#recorder.stop();
    }
    this.#teardownRecorder();
    this.#activeTake = undefined;
    await this.#stopStream();
    this.#setState({ status: "idle", elapsedMs: 0, message: undefined });
    this.#canceling = false;
  }

  subscribe(listener: AudioTakeRecorderSubscriber): () => void {
    this.#subscribers.add(listener);
    listener(this.state);
    return () => this.#subscribers.delete(listener);
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.cancel();
    this.#subscribers.clear();
  }

  #isCurrentPrepare(generation: number): boolean {
    return !this.#disposed && generation === this.#prepareGeneration;
  }

  #assertSupported(): void {
    if (!this.#mediaDevices?.getUserMedia || !this.#recorderFactory) {
      this.#setState({
        status: "error",
        message: "Audio recording is not supported in this browser.",
      });
      throw new Error("Audio recording is not supported in this browser.");
    }
  }

  #preferredMimeType(): string | undefined {
    return this.#mimeTypes.find((mimeType) => this.#isTypeSupported(mimeType));
  }

  readonly #handleData = (event: Event): void => {
    const data = (event as BlobEvent).data;
    if (data && data.size > 0) this.#activeTake?.chunks.push(data);
  };

  readonly #handleStop = (): void => {
    if (this.#canceling) return;
    const activeTake = this.#activeTake;
    const recorder = this.#recorder;
    const resolve = this.#stopResolve;
    if (!activeTake || !recorder || !resolve) return;

    const durationMs = this.#state.elapsedMs;
    const mimeType = recorder.mimeType || this.#state.mimeType || "audio/webm";
    const blob = new Blob(activeTake.chunks, { type: mimeType });
    const recording: AudioTakeRecording = {
      id: activeTake.id,
      blob,
      mimeType,
      size: blob.size,
      durationMs,
    };
    this.#teardownRecorder();
    this.#activeTake = undefined;
    this.#setState({ status: "ready", elapsedMs: 0, mimeType });
    resolve(recording);
  };

  readonly #handleError = (event: Event): void => {
    const error = (event as ErrorEvent).error ?? new Error("Audio recording failed.");
    this.#setState({ status: "error", message: errorMessage(error) });
    this.#stopReject?.(error);
    this.#teardownRecorder();
    this.#activeTake = undefined;
  };

  #teardownRecorder(): void {
    this.#clearMaxDurationTimer();
    this.#recorder?.removeEventListener("dataavailable", this.#handleData);
    this.#recorder?.removeEventListener("stop", this.#handleStop);
    this.#recorder?.removeEventListener("error", this.#handleError);
    this.#recorder = undefined;
    this.#stopResolve = undefined;
    this.#stopReject = undefined;
  }

  async #stopStream(): Promise<void> {
    this.#stopMeter();
    if (!this.#stream) return;
    stopStreamTracks(this.#stream);
    this.#stream = undefined;
  }

  /** Watch the armed input through an AnalyserNode so the panel can show a meter. */
  #startMeter(stream: MediaStream): void {
    let context: AudioContext | null | undefined;
    try {
      context = this.#audioContextFactory?.();
      if (!context) return;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      this.#meter = { context, analyser, source };
      this.#meterTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const levelDb = amplitudeToDb(peakAmplitude(samples));
        const held = this.#state.peakDb ?? SILENCE_DB;
        this.#setState({ levelDb, peakDb: Math.max(levelDb, held - PEAK_HOLD_DECAY_DB) });
      }, this.#meterIntervalMs);
    } catch {
      // The meter is a nicety: a microphone still arms without one.
      this.#meter = undefined;
      void context?.close().catch(() => {});
    }
  }

  #stopMeter(): void {
    if (this.#meterTimer !== undefined) clearInterval(this.#meterTimer);
    this.#meterTimer = undefined;
    if (!this.#meter) return;
    this.#meter.source.disconnect();
    this.#meter.analyser.disconnect();
    void this.#meter.context.close().catch(() => {
      // A context that refuses to close is already unusable; nothing to recover.
    });
    this.#meter = undefined;
    this.#setState({ levelDb: undefined, peakDb: undefined });
  }

  #clearMaxDurationTimer(): void {
    if (this.#maxDurationTimer !== undefined) {
      clearTimeout(this.#maxDurationTimer);
      this.#maxDurationTimer = undefined;
    }
  }

  #setState(patch: Partial<AudioTakeRecorderState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const subscriber of this.#subscribers) subscriber(this.state);
  }
}

function stopStreamTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function audioConstraints(deviceId: string | undefined): MediaTrackConstraints {
  return {
    autoGainControl: false,
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: false,
    noiseSuppression: false,
  };
}

function navigatorMediaDevices(): AudioTakeRecorderOptions["mediaDevices"] | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

function defaultRecorderFactory(): AudioTakeRecorderOptions["recorderFactory"] | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return (stream, options) => new MediaRecorder(stream, options);
}

function defaultIsTypeSupported(): NonNullable<AudioTakeRecorderOptions["isTypeSupported"]> {
  if (typeof MediaRecorder === "undefined") return () => false;
  return (mimeType) => MediaRecorder.isTypeSupported(mimeType);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Audio recording failed.";
}

/** Floor for the level readouts: quieter than this reads as silence. */
export const SILENCE_DB = -60;

export interface TakeEnvelope {
  /** One 0..1 peak per bin, oldest first. */
  peaks: number[];
  peakDb: number;
}

export interface TakePeaksOptions {
  decode?(bytes: ArrayBuffer): Promise<AudioBuffer>;
}

export interface LevelAdvice {
  tone: "quiet" | "good" | "hot" | "clipping";
  sentence: string;
}

export function amplitudeToDb(amplitude: number): number {
  const magnitude = Math.abs(amplitude);
  if (!(magnitude > 0)) return SILENCE_DB;
  return Math.max(SILENCE_DB, 20 * Math.log10(magnitude));
}

export function dbToAmplitude(db: number): number {
  return 10 ** (db / 20);
}

export function peakAmplitude(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(samples[index]!);
    if (value > peak) peak = value;
  }
  return peak;
}

/** Format a dB reading for a card or a sentence, with a real minus sign. */
export function formatDb(db: number): string {
  const rounded = Math.round(db);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} dB`;
}

/** Turn a peak reading into the band colour and the plain sentence beside the meter. */
export function levelAdvice(peakDb: number): LevelAdvice {
  if (peakDb >= -1) {
    return {
      tone: "clipping",
      sentence: `peak ${formatDb(peakDb)}, clipping, lower the interface gain`,
    };
  }
  if (peakDb >= -6) return { tone: "hot", sentence: `peak ${formatDb(peakDb)}, a little hot` };
  if (peakDb >= -30) return { tone: "good", sentence: `peak ${formatDb(peakDb)}, good level` };
  return { tone: "quiet", sentence: "quiet, move closer or raise the interface gain" };
}

/**
 * Decode a stored take and reduce it to `bins` peaks plus the overall peak in
 * dB, so a card can draw the envelope without holding the decoded audio.
 */
export async function takePeaks(
  blob: Blob,
  bins: number,
  options: TakePeaksOptions = {},
): Promise<TakeEnvelope> {
  const count = Math.max(1, Math.round(bins));
  const buffer = await (options.decode ?? decodeAudio)(await blob.arrayBuffer());
  const peaks = Array.from({ length: count }, () => 0);
  const frames = buffer.length;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let frame = 0; frame < frames; frame += 1) {
      const bin = Math.min(count - 1, Math.floor((frame / frames) * count));
      const value = Math.abs(samples[frame]!);
      if (value > peaks[bin]!) peaks[bin] = value;
    }
  }

  return { peaks, peakDb: amplitudeToDb(Math.max(0, ...peaks)) };
}

function disconnectPlayback(routed: { source: AudioNode; gain: GainNode }): void {
  routed.source.disconnect();
  routed.gain.disconnect();
}

function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === "undefined") {
    return Promise.reject(new Error("Audio decoding is not supported in this browser."));
  }
  // A 1-frame offline context decodes without needing a user gesture.
  return new OfflineAudioContext(1, 1, 44_100).decodeAudioData(bytes);
}

function defaultAudioContextFactory(): AudioTakeRecorderOptions["audioContextFactory"] | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  return () => new AudioContext();
}

/**
 * Peaks per take id so redrawing a card never decodes the same take twice, and
 * two cards asking at once share one decode.
 */
export function createTakeEnvelopeCache(
  loadBlob: (id: string) => Promise<Blob | undefined>,
  bins = 48,
  options: TakePeaksOptions = {},
): (id: string) => Promise<TakeEnvelope | undefined> {
  const cache = new Map<string, Promise<TakeEnvelope | undefined>>();
  return (id) => {
    const cached = cache.get(id);
    if (cached) return cached;
    const pending = (async () => {
      const blob = await loadBlob(id);
      return blob ? takePeaks(blob, bins, options) : undefined;
    })();
    cache.set(id, pending);
    // A blob that was missing or failed to decode must not poison the card forever.
    return pending.then(
      (envelope) => {
        if (!envelope) cache.delete(id);
        return envelope;
      },
      (error: unknown) => {
        cache.delete(id);
        throw error;
      },
    );
  };
}

// ponytail: one shared playback context for gained review playback; give each
// route its own if take playback ever has to outlive the page that started it.
let playbackContext: AudioContext | undefined;
/** A source node retains its element for as long as it stays connected. */
const playbackSources = new Map<HTMLMediaElement, { source: AudioNode; gain: GainNode }>();

/**
 * Route an element's playback through a GainNode so a take's stored gain applies
 * on the way out. The recorded blob is never rewritten. Returns false when the
 * browser has no WebAudio to route through. Pair every true with
 * {@link releasePlaybackGain} when that element stops playing.
 */
export function applyPlaybackGain(audio: HTMLMediaElement, gainDb: number): boolean {
  if (!gainDb || typeof AudioContext === "undefined") return false;
  const routed = playbackSources.get(audio);
  if (routed) {
    routed.gain.gain.value = dbToAmplitude(gainDb);
    return true;
  }
  try {
    playbackContext ??= new AudioContext();
    void playbackContext.resume().catch(() => {});
    const gain = playbackContext.createGain();
    gain.gain.value = dbToAmplitude(gainDb);
    const source = playbackContext.createMediaElementSource(audio);
    source.connect(gain).connect(playbackContext.destination);
    playbackSources.set(audio, { source, gain });
    return true;
  } catch {
    return false; // Ungained playback beats no playback.
  }
}

/** Drop the gain graph holding one element, so the element and its audio can go. */
export function releasePlaybackGain(audio: HTMLMediaElement | undefined): void {
  if (!audio) return;
  const routed = playbackSources.get(audio);
  if (!routed) return;
  disconnectPlayback(routed);
  playbackSources.delete(audio);
}

/** Release every gained element and close the shared context (call on unmount). */
export async function closePlaybackContext(): Promise<void> {
  for (const routed of playbackSources.values()) disconnectPlayback(routed);
  playbackSources.clear();
  const context = playbackContext;
  playbackContext = undefined;
  if (context) await context.close().catch(() => {});
}
