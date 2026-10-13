<script lang="ts">
  // A fret window, not the whole neck: rosewood, nickel fret wire, position
  // dots, strings that thicken toward the bass. String 1 (highest) on top, as
  // in tab. Every cell is a real, visibly focusable button "String n fret f, note".
  import { noteName } from "@repo/music-core";
  import { input } from "../runtime";
  import { capturePointer } from "./feedback.svelte";
  import type { FlashKind, Flashes } from "./feedback.svelte";

  export interface FretMark {
    string: number;
    fret: number;
    label?: string;
    role?: "chord" | "scale" | "avoid" | "root";
    demo?: boolean;
  }

  interface Props {
    openStrings: number[];
    from?: number;
    to?: number;
    marks?: FretMark[];
    /** Keyed by `string * 100 + fret`. */
    flashes?: Flashes;
    /** Strings drawn muted (x at the nut). */
    muted?: number[];
    interactive?: boolean;
    /** Light up every position of held pitches (MIDI or microphone input). */
    showHeldPitches?: boolean;
    label?: string;
    /** Flashes keyed by pitch (a drill written for the keyboard) instead of string and fret. */
    flashByPitch?: boolean;
  }

  let {
    openStrings,
    from = 0,
    to = 5,
    marks = [],
    flashes,
    muted = [],
    interactive = true,
    showHeldPitches = true,
    label = "Fretboard",
    flashByPitch = false,
  }: Props = $props();

  const strings = $derived(openStrings.map((_, i) => i + 1));
  const frets = $derived(Array.from({ length: to - from + 1 }, (_, i) => from + i));
  // With the nut in view, open strings sit on it: a narrow bone column, not a fret's width.
  const cols = $derived(from === 0 ? `var(--nut) repeat(${frets.length - 1}, minmax(0, 1fr))` : `repeat(${frets.length}, minmax(0, 1fr))`);
  const DOTS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
  const midiAt = (s: number, f: number) => openStrings[s - 1] + f;
  const markAt = (s: number, f: number) => marks.find((m) => m.string === s && m.fret === f);

  // On-screen taps know their string; other sources only know pitch.
  let tapped = $state<Record<number, boolean>>({});
  const pointer = new Map<number, [number, number]>();

  function down(s: number, f: number) {
    tapped[s * 100 + f] = true;
    input.tap(midiAt(s, f), true, { string: s, fret: f });
  }
  function up(s: number, f: number) {
    delete tapped[s * 100 + f];
    input.tap(midiAt(s, f), false, { string: s, fret: f });
  }
  function press(e: PointerEvent, s: number, f: number) {
    if (!interactive || e.button > 0) return;
    capturePointer(e);
    pointer.set(e.pointerId, [s, f]);
    down(s, f);
  }
  function release(e: PointerEvent) {
    const sf = pointer.get(e.pointerId);
    if (!sf) return;
    pointer.delete(e.pointerId);
    up(sf[0], sf[1]);
  }
  function key(e: KeyboardEvent, s: number, f: number, isDown: boolean) {
    if (!interactive || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    if (isDown && e.repeat) return;
    if (isDown) down(s, f);
    else up(s, f);
  }

  const heldHere = (s: number, f: number) =>
    tapped[s * 100 + f] || (showHeldPitches && input.activeSource !== "onscreen" && input.held.has(midiAt(s, f)));
  const flashAt = (s: number, f: number): FlashKind | undefined => flashes?.get(flashByPitch ? midiAt(s, f) : s * 100 + f);
  /** A string is ringing while a note on it is held, tapped, or lit by the demo. */
  const ringing = (s: number) => frets.some((f) => heldHere(s, f) || markAt(s, f)?.demo);
  const gauge = (s: number) => 1 + (s - 1) * (openStrings.length === 6 ? 0.55 : 0.7);
</script>

<div class="neck-wrap" role="group" aria-label="{label}, frets {from} to {to}">
  <div class="fret-numbers" aria-hidden="true" style:grid-template-columns={cols}>
    {#each frets as f (f)}<span>{f === 0 ? "open" : f}</span>{/each}
  </div>
  <div class="neck">
    {#if from === 0}<span class="nut" aria-hidden="true"></span>{/if}
    {#each strings as s (s)}
      <div class="string-row" class:ringing={ringing(s)} style:--gauge="{gauge(s)}px" style:grid-template-columns={cols}>
        <span class="string-line" aria-hidden="true"></span>
        {#if muted.includes(s)}<span class="muted-x" aria-hidden="true">✕</span>{/if}
        {#each frets as f (f)}
          {@const mk = markAt(s, f)}
          {@const flash = flashAt(s, f)}
          {@const held = heldHere(s, f)}
          <button
            type="button"
            class="cell"
            class:open-cell={f === 0}
            data-held={held || undefined}
            data-role={mk?.role}
            data-demo={mk?.demo || undefined}
            data-target={mk ? "" : undefined}
            data-flash={flash}
            tabindex={interactive ? 0 : -1}
            aria-pressed={held}
            aria-label="String {s} fret {f}, {noteName(midiAt(s, f), 'flat')}{mk ? ', target' : ''}"
            onpointerdown={(e) => press(e, s, f)}
            onpointerup={release}
            onpointercancel={release}
            onlostpointercapture={release}
            onkeydown={(e) => key(e, s, f, true)}
            onkeyup={(e) => key(e, s, f, false)}
          >
            {#if flash}
              <span class="dot flash" data-kind={flash} aria-hidden="true">{flash === "correct" ? "✓" : "✕"}</span>
            {:else if mk || held}
              <span class="dot" aria-hidden="true">{mk?.label ?? ""}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
    <div class="inlays" aria-hidden="true" style:grid-template-columns={cols}>
      {#each frets as f (f)}
        <span>
          {#if f === 12 || f === 24}<i></i><i></i>{:else if DOTS.has(f)}<i></i>{/if}
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .neck-wrap {
    --nut: 1.9rem;
    width: 100%;
    min-width: 0;
    padding-left: 1.5rem;
  }
  .fret-numbers {
    display: grid;
    font-size: 0.72rem;
    color: var(--ws-stage-soft);
    text-align: center;
    margin-bottom: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .neck {
    position: relative;
    border-radius: 0.6rem;
    padding: 0.35rem 0;
    background:
      repeating-linear-gradient(90deg, #ffffff05 0 2px, transparent 2px 7px),
      linear-gradient(180deg, #4a2a1c, #3a2016 50%, #2d1811);
    box-shadow:
      inset 0 2px 0 #ffffff12,
      inset 0 -3px 6px #0007,
      0 4px 14px #0006;
  }
  /* The nut: a wide bone bar the open strings sit on, its fret-side edge a hard line. */
  .nut {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--nut);
    border-radius: 0.6rem 0 0 0.6rem;
    background: linear-gradient(90deg, #f6f0e2, #e4dac4 60%, #c8bba0);
    box-shadow:
      inset -4px 0 0 #9b8f76,
      3px 0 6px #0007;
  }
  .string-row {
    position: relative;
    display: grid;
    z-index: 1;
  }
  .string-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: var(--gauge);
    transform: translateY(-50%);
    background: linear-gradient(#f4efe6, #a9a198);
    box-shadow: 0 1px 1px #0008;
    pointer-events: none;
  }
  /* The string that is sounding glows yellow along its length. */
  .ringing .string-line {
    height: calc(var(--gauge) + 1.5px);
    background: linear-gradient(#fff6c2, #f2c94c);
    box-shadow:
      0 0 6px #f2c94ccc,
      0 0 14px #f2c94c88;
  }
  .muted-x {
    position: absolute;
    left: -1.4rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ws-stage-soft);
    font-size: 0.8rem;
  }
  .cell {
    position: relative;
    min-height: 2.75rem;
    display: grid;
    place-items: center;
    border-right: 3px solid #c9c6c0;
    box-shadow: 1px 0 0 #6d6a66;
    -webkit-tap-highlight-color: transparent;
  }
  .cell.open-cell {
    border-right: none;
    box-shadow: none;
  }
  /* An open string's dot is a ring on the nut, so it never reads as a fretted note. */
  .open-cell .dot {
    width: 1.4rem;
    height: 1.4rem;
  }
  .open-cell[data-target]:not([data-held]) .dot {
    background: #f6f0e2;
    color: #1b120b;
  }
  .cell:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: -3px;
    border-radius: 6px;
  }
  .dot {
    position: relative;
    z-index: 2;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: 800;
    color: #1b120b;
    background: var(--instr);
    box-shadow: 0 2px 4px #0008;
  }
  [data-target]:not([data-held]) .dot {
    background: #1b120bcc;
    color: var(--ws-stage-ink);
    box-shadow:
      inset 0 0 0 2.5px var(--instr),
      0 2px 4px #0008;
  }
  [data-role="root"] .dot {
    border-radius: 0.35rem;
  }
  [data-role="chord"]:not([data-held]) .dot {
    box-shadow: inset 0 0 0 2.5px var(--tone-chord);
  }
  [data-role="scale"]:not([data-held]) .dot {
    box-shadow: inset 0 0 0 2.5px var(--tone-scale);
  }
  [data-role="avoid"]:not([data-held]) .dot {
    box-shadow: none;
    border: 2px dashed var(--tone-avoid);
    background: transparent;
  }
  [data-demo] .dot {
    background: var(--instr);
    color: #1b120b;
  }
  [data-held] .dot {
    background: var(--instr);
    color: #1b120b;
    transform: scale(1.08);
  }
  .flash[data-kind="correct"] {
    background: var(--success);
    color: white;
  }
  .flash[data-kind="wrong"] {
    background: var(--destructive);
    color: white;
  }
  .inlays {
    position: absolute;
    inset: 0;
    display: grid;
    pointer-events: none;
  }
  .inlays span {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 30%;
  }
  .inlays i {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
    background: radial-gradient(circle at 35% 35%, #fbf7ee, #cfc5b1);
    opacity: 0.8;
  }
</style>
