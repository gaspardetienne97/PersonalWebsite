import { monotonicMs, type InstrumentId, type NoteEvent } from "@repo/music-core/domain";
import type { InputRouter } from "@repo/music-core/engines/input-router";

/**
 * On-screen note input for the piano surface: the QWERTY map, the typing-target
 * guard, and the per-note holder registry that turns overlapping pointers, keys
 * and latches into exactly one `noteOn` / `noteOff` pair per MIDI note.
 *
 * Framework-agnostic on purpose (no Svelte imports) so the lifecycle is unit
 * testable. The component mirrors `heldNotes` through `onChange`.
 */

// --- QWERTY-as-piano: answer without reaching for the mouse or a cable. ---
// Classic DAW mapping: the home row walks the white keys from C, the row above
// it plays the sharps.
export const QWERTY_SEMITONES: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
};

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable)
  );
}

/** Anchor the QWERTY mapping's C at the octave of the lowest relevant note. */
export function qwertyBaseMidi(midiNotes: readonly number[]): number {
  const lowest = midiNotes.filter((midiNote) => Number.isFinite(midiNote)).sort((a, b) => a - b)[0];
  if (lowest === undefined) return 60;
  return Math.floor(lowest / 12) * 12;
}

/**
 * What is holding a key down. `pointer` ids come from pointer events, `qwerty`
 * ids from `KeyboardEvent.code`, `latch` from keyboard/assistive activation,
 * and `tap` is one synthetic-activation press that releases immediately.
 */
export type PianoHolderKind = "pointer" | "qwerty" | "latch" | "tap";

/**
 * What a pointer activation means. `hold` is press-and-hold (the default);
 * `latch` toggles the latch holder instead, so a one-button mouse can still
 * build a chord on a surface graded on held notes (strict Voicings).
 */
export type PianoPointerMode = "hold" | "latch";

export interface PianoInputOptions {
  /** Read live, so a surface can hand its router in later or not at all. */
  router: () => InputRouter | undefined;
  instrument?: () => InstrumentId | undefined;
  pointerMode?: () => PianoPointerMode | undefined;
  onAccepted?: (event: NoteEvent) => void;
  onChange?: (held: ReadonlySet<number>) => void;
  now?: () => number;
}

export class PianoInput {
  #options: PianoInputOptions;
  /** MIDI note -> holder keys currently holding it. */
  #holders = new Map<number, Set<string>>();
  /** Holder key -> the MIDI note it holds, so releases need no note argument. */
  #holderNotes = new Map<string, number>();
  #waitGroupKey: string | undefined;
  #waitEnabled = false;

  constructor(options: PianoInputOptions) {
    this.#options = options;
  }

  get heldNotes(): ReadonlySet<number> {
    return new Set(this.#holders.keys());
  }

  get latchedNotes(): ReadonlySet<number> {
    const latched = new Set<number>();
    for (const [holderKey, midiNote] of this.#holderNotes) {
      if (holderKey.startsWith("latch:")) latched.add(midiNote);
    }
    return latched;
  }

  isHeld(midiNote: number): boolean {
    return this.#holders.has(midiNote);
  }

  isLatched(midiNote: number): boolean {
    return this.#holderNotes.has(holderKeyFor("latch", midiNote));
  }

  /**
   * Add a holder. Emits `noteOn` only on the local 0 -> 1 transition; a rejected
   * first attack rolls the holder back so a later press can retry.
   */
  press(midiNote: number, kind: PianoHolderKind, id: string | number = midiNote): boolean {
    if (kind === "pointer" && this.#options.pointerMode?.() === "latch") {
      this.toggleLatch(midiNote);
      return true;
    }
    const holderKey = holderKeyFor(kind, id);
    if (this.#holderNotes.has(holderKey)) return true;

    // `#holders` never keeps an empty set, so "no entry" is the 0 -> 1 case.
    let holders = this.#holders.get(midiNote);
    if (holders === undefined) {
      if (!this.#emit("noteOn", midiNote)) return false;
      holders = new Set<string>();
      this.#holders.set(midiNote, holders);
    }

    holders.add(holderKey);
    this.#holderNotes.set(holderKey, midiNote);
    this.#notify();
    return true;
  }

  /** Remove a holder. Emits `noteOff` only on the local 1 -> 0 transition. */
  release(kind: PianoHolderKind, id: string | number): void {
    const holderKey = holderKeyFor(kind, id);
    const midiNote = this.#holderNotes.get(holderKey);
    if (midiNote === undefined) return;

    this.#holderNotes.delete(holderKey);
    const holders = this.#holders.get(midiNote);
    holders?.delete(holderKey);
    if (!holders || holders.size === 0) {
      this.#holders.delete(midiNote);
      this.#emit("noteOff", midiNote);
    }
    this.#notify();
  }

  /** Keyboard/assistive activation: hold the note until it is toggled or cleared. */
  toggleLatch(midiNote: number): void {
    if (this.isLatched(midiNote)) this.release("latch", midiNote);
    else this.press(midiNote, "latch", midiNote);
  }

  /** One momentary press+release, for activations with no key-up of their own. */
  tap(midiNote: number): void {
    // A latch surface has no momentary press: a bare click means the same as a
    // pointer one there, otherwise a synthesised click could not build a chord.
    if (this.#options.pointerMode?.() === "latch") {
      this.toggleLatch(midiNote);
      return;
    }
    if (this.press(midiNote, "tap", midiNote)) this.release("tap", midiNote);
  }

  /** The named "Clear held notes" action. */
  clearLatches(): void {
    // `latchedNotes` is already a fresh snapshot, so releasing while iterating
    // it cannot skip a holder.
    for (const midiNote of this.latchedNotes) this.release("latch", midiNote);
  }

  /**
   * Drop every local holder without routing anything. Used for takeover, group
   * change, and teardown: the follower has already cleared the prior logical
   * owner, and cleanup must never depend on an event the router may reject.
   */
  reset(): void {
    if (this.#holders.size === 0 && this.#holderNotes.size === 0) return;
    this.#holders.clear();
    this.#holderNotes.clear();
    this.#notify();
  }

  /**
   * Opt in to follower-backed wait behaviour. The key must embed the follower
   * generation so a repeated identical chord still resets. `undefined` keeps
   * ordinary holder lifetime (no takeover clearing at all).
   */
  setWaitGroupKey(waitGroupKey: string | undefined): void {
    if (waitGroupKey === undefined) {
      this.#waitEnabled = false;
      this.#waitGroupKey = undefined;
      return;
    }
    const changed = this.#waitEnabled && waitGroupKey !== this.#waitGroupKey;
    this.#waitEnabled = true;
    this.#waitGroupKey = waitGroupKey;
    if (changed) this.reset();
  }

  /** An accepted router event. A foreign attack takes over from local holders. */
  observe(event: NoteEvent): void {
    if (!this.#waitEnabled) return;
    if (event.type !== "noteOn" || event.source === "onscreen") return;
    this.reset();
  }

  #emit(type: "noteOn" | "noteOff", midiNote: number): boolean {
    const instrument = this.#options.instrument?.();
    const base = {
      midiNote,
      source: "onscreen" as const,
      timestamp: monotonicMs(this.#options.now?.() ?? performance.now()),
      clock: "performance" as const,
      ...(instrument !== undefined ? { instrument } : {}),
    };
    const event: NoteEvent = type === "noteOn" ? { type, velocity: 1, ...base } : { type, ...base };

    if (this.#options.router()?.push(event) !== true) return false;
    this.#options.onAccepted?.(event);
    return true;
  }

  #notify(): void {
    this.#options.onChange?.(this.heldNotes);
  }
}

function holderKeyFor(kind: PianoHolderKind, id: string | number): string {
  return `${kind}:${id}`;
}
