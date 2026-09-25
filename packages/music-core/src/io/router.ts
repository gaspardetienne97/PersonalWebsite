// One router arbitrates every input source (catalog 5.1, scoring rules 15).
// Device profiles are applied before events get here; the router applies
// latency offsets once, arbitrates the active source, tracks held notes per
// source, and fans events out to subscribers.
import type {
  ControlEvent,
  InputEvent,
  InputSource,
  Instrument,
  NoteEvent,
  OnsetEvent,
} from "../types";
import { clamp } from "../theory/notes";

export const MIDI_SUPPRESS_MS = 1500;

export interface RouterOffsets {
  audioMs: number;
  midiMs: number;
  /** Per-device MIDI offsets; override the global MIDI offset. */
  deviceMs: Record<string, number>;
}

export interface RouterOptions {
  now?: () => number;
  offsets?: Partial<RouterOffsets>;
}

export type RouterListener = (event: InputEvent) => void;

export interface InputRouter {
  push(event: InputEvent): InputEvent | null;
  subscribe(listener: RouterListener): () => void;
  setOffsets(offsets: Partial<RouterOffsets>): void;
  /** Only deliver MIDI on this channel (1..16), or all when undefined. */
  setChannel(channel: number | undefined): void;
  /** Drop MIDI events whose profile names a different instrument. */
  setInstrumentFilter(instrument: Instrument | undefined): void;
  /** Release everything a source holds (window blur, route exit). */
  releaseAll(source?: InputSource): void;
  readonly activeSource: InputSource | undefined;
  /** MIDI notes currently held, across sources. */
  readonly held: ReadonlySet<number>;
  /** Held notes keyed per source, for surfaces that show who holds what. */
  heldBy(source: InputSource): ReadonlySet<number>;
  readonly lastMidiAt: number | undefined;
}

const LIMIT = 500;
const bound = (ms: number | undefined) =>
  Number.isFinite(ms) ? clamp(ms as number, -LIMIT, LIMIT) : 0;

export function createInputRouter(options: RouterOptions = {}): InputRouter {
  const now = options.now ?? (() => performance.now());
  const listeners = new Set<RouterListener>();
  const holders = new Map<InputSource, Set<number>>();
  const offsets: RouterOffsets = { audioMs: 0, midiMs: 0, deviceMs: {}, ...options.offsets };
  let channel: number | undefined;
  let instrumentFilter: Instrument | undefined;
  let activeSource: InputSource | undefined;
  let lastMidiAt: number | undefined;
  let heldCache: Set<number> | null = null;

  const holderSet = (s: InputSource) => {
    let set = holders.get(s);
    if (!set) holders.set(s, (set = new Set()));
    return set;
  };

  function offsetFor(event: InputEvent): number {
    const source = "source" in event ? event.source : "midi";
    if (source === "audio") return bound(offsets.audioMs);
    if (source !== "midi") return 0;
    const deviceId = "deviceId" in event ? event.deviceId : undefined;
    const dev = deviceId ? offsets.deviceMs[deviceId] : undefined;
    return bound(dev ?? offsets.midiMs);
  }

  function emit(e: InputEvent) {
    for (const l of listeners) l(e);
  }

  function push(raw: InputEvent): InputEvent | null {
    const event = { ...raw, at: raw.at - offsetFor(raw) } as InputEvent;

    if (event.kind === "cc" || event.kind === "pitchbend" || event.kind === "pressure") {
      const c = event as ControlEvent;
      if (channel && c.channel && c.channel !== channel) return null;
      emit(c);
      return c;
    }

    if (event.kind === "onset") {
      const o = event as OnsetEvent;
      if (o.source !== "click") activeSource = o.source;
      emit(o);
      return o;
    }

    const n = event as NoteEvent;
    if (n.source === "midi") {
      if (channel && n.channel && n.channel !== channel) return null;
      if (
        instrumentFilter &&
        n.instrument &&
        n.instrument !== instrumentFilter &&
        n.kind === "noteon"
      )
        return null;
    }

    const set = holderSet(n.source);
    if (n.kind === "noteon") {
      // A stray tap cannot steal the source mid-run while MIDI is live.
      if (
        n.source === "onscreen" &&
        lastMidiAt !== undefined &&
        now() - lastMidiAt < MIDI_SUPPRESS_MS
      )
        return null;
      if (n.source === "midi") lastMidiAt = now();
      if (n.source !== "click") activeSource = n.source;
      set.add(n.midi);
    } else {
      // Always deliver a paired note-off so the owner can let go; a note-off
      // never becomes the active source. Unpaired offs are dropped.
      if (!set.has(n.midi)) return null;
      set.delete(n.midi);
    }
    heldCache = null;
    emit(n);
    return n;
  }

  return {
    push,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOffsets(next) {
      Object.assign(offsets, next);
    },
    setChannel(c) {
      channel = c;
    },
    setInstrumentFilter(i) {
      instrumentFilter = i;
    },
    releaseAll(source) {
      const sources = source ? [source] : [...holders.keys()];
      for (const s of sources) {
        for (const midi of [...(holders.get(s) ?? [])]) {
          push({ kind: "noteoff", midi, velocity: 0, at: now(), source: s, confidence: 1 });
        }
      }
    },
    get activeSource() {
      return activeSource;
    },
    get held() {
      if (!heldCache) {
        heldCache = new Set();
        for (const set of holders.values()) for (const m of set) heldCache.add(m);
      }
      return heldCache;
    },
    heldBy(source) {
      return holderSet(source);
    },
    get lastMidiAt() {
      return lastMidiAt;
    },
  };
}
