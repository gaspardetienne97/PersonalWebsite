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
}

export interface AudioTakeRecorderOptions {
  mediaDevices?: Pick<MediaDevices, "enumerateDevices" | "getUserMedia"> | null;
  recorderFactory?: ((stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder) | null;
  isTypeSupported?: (mimeType: string) => boolean;
  mimeTypes?: readonly string[];
  maxDurationMs?: number;
}

type AudioTakeRecorderSubscriber = (state: AudioTakeRecorderState) => void;

interface ActiveTake {
  id: string;
  startedAtMonotonic: number;
  chunks: Blob[];
}

const DEFAULT_MAX_DURATION_MS = 3_600_000;
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
  readonly #subscribers = new Set<AudioTakeRecorderSubscriber>();
  #state: AudioTakeRecorderState = DEFAULT_STATE;
  #stream: MediaStream | undefined;
  #recorder: MediaRecorder | undefined;
  #activeTake: ActiveTake | undefined;
  #maxDurationTimer: ReturnType<typeof setTimeout> | undefined;
  #stopResolve: ((recording: AudioTakeRecording) => void) | undefined;
  #stopReject: ((error: unknown) => void) | undefined;
  #canceling = false;

  constructor(options: AudioTakeRecorderOptions = {}) {
    const recorderFactory =
      "recorderFactory" in options ? options.recorderFactory : defaultRecorderFactory();
    this.#mediaDevices =
      "mediaDevices" in options ? (options.mediaDevices ?? undefined) : navigatorMediaDevices();
    this.#recorderFactory = recorderFactory ?? undefined;
    this.#isTypeSupported = options.isTypeSupported ?? defaultIsTypeSupported();
    this.#mimeTypes = options.mimeTypes ?? PREFERRED_AUDIO_MIME_TYPES;
    this.#maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
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
    this.#assertSupported();
    await this.#stopStream();
    this.#setState({
      status: "requesting",
      deviceId,
      elapsedMs: 0,
      message: undefined,
      mimeType: undefined,
    });

    try {
      this.#stream = await this.#mediaDevices!.getUserMedia({
        audio: audioConstraints(deviceId),
      });
      this.#setState({
        status: "ready",
        deviceId,
        mimeType: this.#preferredMimeType(),
        elapsedMs: 0,
      });
    } catch (error) {
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
    await this.cancel();
    this.#subscribers.clear();
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
    if (!this.#stream) return;
    for (const track of this.#stream.getTracks()) track.stop();
    this.#stream = undefined;
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
