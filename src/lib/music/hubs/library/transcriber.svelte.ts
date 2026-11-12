// The page's side of transcription: decode the file, resample it for the
// engine (the browser does both natively, off the main thread), and hand it
// to the worker. Progress and Cancel live here; the page stays responsive.
import type { HeardNote } from "./transcription";
import type { WorkerIn, WorkerOut } from "./transcribe.worker";

export type Engine = "chords" | "melody";
/** Basic Pitch listens at 22.05 kHz, mono. */
const MODEL_RATE = 22050;

export class Transcriber {
  busy = $state(false);
  /** 0..1 while the model runs; null while decoding or for the melody engine. */
  progress = $state<number | null>(null);
  step = $state("");
  #worker: Worker | null = null;
  #pending: { resolve: (n: HeardNote[]) => void; reject: (e: Error) => void } | null = null;

  #ensure() {
    if (this.#worker) return this.#worker;
    const w = new Worker(new URL("./transcribe.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "progress") this.progress = m.value;
      else if (m.type === "notes") this.#settle(null, m.notes);
      else this.#settle(new Error(m.message));
    };
    w.onerror = (e) => this.#settle(new Error(e.message || "The transcriber stopped."));
    this.#worker = w;
    return w;
  }

  #settle(err: Error | null, notes: HeardNote[] = []) {
    const p = this.#pending;
    this.#pending = null;
    this.busy = false;
    this.progress = null;
    this.step = "";
    if (err) p?.reject(err);
    else p?.resolve(notes);
  }

  #ask(msg: WorkerIn, transfer: Transferable[] = []) {
    return new Promise<HeardNote[]>((resolve, reject) => {
      this.#pending = { resolve, reject };
      this.#ensure().postMessage(msg, transfer);
    });
  }

  /** Heard notes in seconds, and the audio's length. */
  async run(
    file: File,
    engine: Engine,
    sensitivity: number,
  ): Promise<{ notes: HeardNote[]; seconds: number }> {
    this.busy = true;
    this.progress = null;
    this.step = "Reading the audio";
    let buf: AudioBuffer;
    const ctx = new AudioContext();
    try {
      buf = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      this.#settle(null);
      throw new Error(`"${file.name}" isn't audio Woodshed can read. Try a WAV or MP3.`);
    } finally {
      void ctx.close();
    }
    const rate = engine === "chords" ? MODEL_RATE : buf.sampleRate;
    // Rendering into a one-channel context mixes down to mono and resamples in one go.
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const mono = (await off.startRendering()).getChannelData(0);
    if (!this.busy) throw new Error("cancelled"); // cancelled while decoding
    this.step = engine === "chords" ? "Listening for every note" : "Following the melody";
    this.progress = engine === "chords" ? 0 : null;
    const samples = mono.slice();
    const notes = await this.#ask({ type: "run", engine, samples, sampleRate: rate, sensitivity }, [
      samples.buffer,
    ]);
    return { notes, seconds: buf.duration };
  }

  /** New sensitivity on the last chords run: only the note picking is redone. */
  renote(sensitivity: number) {
    this.busy = true;
    this.step = "Picking the notes again";
    return this.#ask({ type: "renote", sensitivity });
  }

  cancel() {
    this.#worker?.terminate();
    this.#worker = null;
    this.#settle(new Error("cancelled"));
  }

  dispose() {
    this.#worker?.terminate();
    this.#worker = null;
  }
}
