// The one input router every drill listens to (catalog 5.1). MIDI and the
// microphone push into `input.router`; on-screen surfaces and QWERTY use `tap`.
//
// QWERTY maps (physical key positions, `KeyboardEvent.code`, so AZERTY works too):
//   piano: A S D F G H J K L = C D E F G A B C D (white keys from C4)
//          W E   T Y U   O P = C# D#  F# G# A#  C# D#
//          Z / X = octave down / up (±3 octaves)
//   pads:  laid out like the pad grid, bottom-left first (pad 1 = A01 = MIDI 36)
//          1 2 3 4  -> pads 13-16
//          Q W E R  -> pads  9-12
//          A S D F  -> pads  5-8
//          Z X C V  -> pads  1-4
import { browser } from "$app/environment";
import { createInputRouter } from "@repo/music-core/io/router";
import type { InputEvent, InputSource } from "@repo/music-core";
import { settings } from "./settings.svelte";
import { audio } from "./audio.svelte";

export type KeyboardMode = "piano" | "pads" | "off";

const router = createInputRouter();

let held = $state.raw<ReadonlySet<number>>(new Set());
let activeSource = $state<InputSource | undefined>();
let lastEvent = $state.raw<InputEvent | undefined>();
let keyboardMode = $state<KeyboardMode>("off");
let octave = $state(0);

// On-screen surfaces make sound, like a real instrument would. Driven by what
// the router delivers, so suppressed taps stay silent and release-all (blur,
// route exit) stops every held note. Pads play the kit, or synth drums.
router.subscribe((e) => {
  if ((e.kind !== "noteon" && e.kind !== "noteoff") || e.source !== "onscreen") return;
  // The switch gates new notes only, so a note held when it flips still stops.
  if (e.kind === "noteon" && !settings.value.onscreenSound) return;
  if (keyboardMode === "pads") {
    if (e.kind === "noteon") audio.playKitPad(e.midi, e.velocity);
  } else if (e.kind === "noteon") audio.noteOn(e.midi, e.velocity);
  else audio.noteOff(e.midi);
});

router.subscribe((e) => {
  lastEvent = e;
  activeSource = router.activeSource;
  if (e.kind === "noteon" || e.kind === "noteoff") held = new Set(router.held);
});

function tap(
  midi: number,
  down: boolean,
  extra: { string?: number; fret?: number; velocity?: number } = {},
) {
  return router.push({
    kind: down ? "noteon" : "noteoff",
    midi,
    velocity: down ? (extra.velocity ?? 0.8) : 0,
    at: performance.now(),
    source: "onscreen",
    confidence: 0.8,
    velocityMeasured: false,
    string: extra.string,
    fret: extra.fret,
  });
}

const PIANO: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
};
const PAD_ROWS = [
  ["KeyZ", "KeyX", "KeyC", "KeyV"],
  ["KeyA", "KeyS", "KeyD", "KeyF"],
  ["KeyQ", "KeyW", "KeyE", "KeyR"],
  ["Digit1", "Digit2", "Digit3", "Digit4"],
];
const PADS: Record<string, number> = Object.fromEntries(
  PAD_ROWS.flatMap((row, r) => row.map((code, c) => [code, 36 + r * 4 + c])),
);

/** Key code -> the note it started, so key-up releases that note even after an octave shift. */
const down = new Map<string, number>();

function typingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onKeyDown(e: KeyboardEvent) {
  if (keyboardMode === "off" || e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target))
    return;
  if (e.repeat || down.has(e.code)) {
    if (PIANO[e.code] !== undefined || PADS[e.code] !== undefined) e.preventDefault();
    return;
  }
  if (keyboardMode === "piano" && (e.code === "KeyZ" || e.code === "KeyX")) {
    octave = Math.max(-3, Math.min(3, octave + (e.code === "KeyX" ? 1 : -1)));
    e.preventDefault();
    return;
  }
  const midi =
    keyboardMode === "piano"
      ? PIANO[e.code] !== undefined
        ? 60 + octave * 12 + PIANO[e.code]
        : undefined
      : PADS[e.code];
  if (midi === undefined) return;
  e.preventDefault();
  down.set(e.code, midi);
  tap(midi, true);
}

function onKeyUp(e: KeyboardEvent) {
  const midi = down.get(e.code);
  if (midi === undefined) return;
  down.delete(e.code);
  tap(midi, false);
}

function releaseAll() {
  down.clear();
  router.releaseAll("onscreen");
}

if (browser) {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  window.addEventListener("pointercancel", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });
  // Global offsets from settings; per-device offsets are pushed by midi.svelte.ts.
  $effect.root(() => {
    $effect(() => {
      router.setOffsets({
        audioMs: settings.value.audioOffsetMs,
        midiMs: settings.value.midiOffsetMs,
      });
    });
  });
}

export const input = {
  router,
  get held() {
    return held;
  },
  get activeSource() {
    return activeSource;
  },
  get lastEvent() {
    return lastEvent;
  },
  get keyboardMode() {
    return keyboardMode;
  },
  /** Current QWERTY piano octave shift (Z / X). */
  get octave() {
    return octave;
  },
  subscribe: router.subscribe,
  tap,
  releaseAll,
  setKeyboardMode(mode: KeyboardMode) {
    if (mode !== keyboardMode) releaseAll();
    keyboardMode = mode;
  },
};
