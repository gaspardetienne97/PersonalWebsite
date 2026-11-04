<script lang="ts" module>
  import { isBlackKey } from "@repo/music-core";

  /** The whites from `fit` (widened to white keys), grown one white at a time, low side first, while `room` allows. */
  export function fitRange(f: { low: number; high: number }, outerLow: number, outerHigh: number, room: number) {
    const down = (m: number) => (isBlackKey(m) ? m - 1 : m);
    let lo = down(Math.max(21, Math.min(f.low, f.high)));
    let hi = Math.min(108, Math.max(f.low, f.high));
    if (isBlackKey(hi)) hi += 1;
    const floor = Math.max(21, Math.min(outerLow, lo));
    const ceil = Math.min(108, Math.max(outerHigh, hi));
    let n = 0;
    for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) n++;
    for (let below = true; n < room; below = !below) {
      const canLo = lo > floor;
      const canHi = hi < ceil;
      if (!canLo && !canHi) break;
      if ((below && canLo) || !canHi) lo = down(lo - 1);
      else hi = isBlackKey(hi + 1) ? hi + 2 : hi + 1;
      n++;
    }
    return { low: lo, high: Math.min(hi, 108) };
  }
</script>

<script lang="ts">
  // The one keyboard. Ivory and ebony drawn as material; every key is a real
  // button named by its note. States with distinct lifetimes: held (while down),
  // target (current group), demo (while the model sounds), correct/wrong
  // (a short flash with a glyph, never a growing set).
  import { noteName } from "@repo/music-core";
  import { onMount } from "svelte";
  import { input } from "../runtime";
  import { capturePointer } from "./feedback.svelte";
  import type { CellMarks, Flashes, FlashKind } from "./feedback.svelte";
  /** "order": a note of the pattern, played out of its turn (an amber ring with its degree), not a wrong note. */
  type KeyFlash = FlashKind | "order";

  interface Props {
    low?: number;
    high?: number;
    marks?: Record<number, CellMarks>;
    flashes?: Flashes<KeyFlash>;
    /** Override held notes (e.g. a replay); defaults to live input. */
    held?: ReadonlySet<number>;
    names?: "none" | "c" | "all";
    interactive?: boolean;
    label?: string;
    /** Minimum white-key width in px; the strip scrolls sideways below it (without `fit`). */
    minKey?: number;
    /**
     * The notes that must be on screen. The keys shrink to the container so this range always fits
     * (no sideways scroll, no clipped keys); spare room adds keys round it, up to `low` and `high`.
     */
    fit?: { low: number; high: number };
    /** Short keys, for a small picture of a chord (results rows, previews). */
    compact?: boolean;
    /** Keys a run left out: a solid red ring with the note's name on the key. */
    missing?: readonly number[];
    /** A live run on a phone: the keys grow taller into spare height (contract S4), so no gap opens above them. */
    fill?: boolean;
  }

  let {
    low = 48,
    high = 84,
    marks = {},
    flashes,
    held,
    names = "c",
    interactive = true,
    label = "Piano keyboard",
    minKey = 36,
    fit,
    compact = false,
    missing = [],
    fill = false,
  }: Props = $props();

  let width = $state(0);
  const range = $derived(fit ? fitRange(fit, low, high, Math.floor(width / minKey)) : { low, high });
  const keys = $derived(Array.from({ length: range.high - range.low + 1 }, (_, i) => range.low + i));
  const whites = $derived(keys.filter((k) => !isBlackKey(k)));
  const whiteIndex = (m: number) => whites.findIndex((w) => w === m - 1);
  const down = $derived(held ?? input.held);

  // The computer keyboard plays this surface while it is on screen.
  onMount(() => {
    if (!interactive) return;
    input.setKeyboardMode("piano");
    return () => input.setKeyboardMode("off");
  });

  let scroller: HTMLDivElement | undefined = $state();
  const pointerNotes = new Map<number, number>();

  // On narrow screens, centre the marked keys (both hands of a chord), not just the lowest one.
  $effect(() => {
    const lit = keys.filter((k) => marks[k]?.target || marks[k]?.demo);
    if (!lit.length || !scroller) return;
    const lo = scroller.querySelector<HTMLElement>(`[data-midi="${lit[0]}"]`);
    const hi = scroller.querySelector<HTMLElement>(`[data-midi="${lit[lit.length - 1]}"]`);
    if (!lo || !hi) return;
    const left = lo.getBoundingClientRect().left;
    const right = hi.getBoundingClientRect().right;
    const box = scroller.getBoundingClientRect();
    if (left < box.left || right > box.right) scroller.scrollLeft += (left + right) / 2 - (box.left + box.width / 2);
  });

  function press(e: PointerEvent, midi: number) {
    if (!interactive || e.button > 0) return;
    capturePointer(e);
    pointerNotes.set(e.pointerId, midi);
    input.tap(midi, true);
  }
  function release(e: PointerEvent) {
    const midi = pointerNotes.get(e.pointerId);
    if (midi === undefined) return;
    pointerNotes.delete(e.pointerId);
    input.tap(midi, false);
  }
  function key(e: KeyboardEvent, midi: number, isDown: boolean) {
    if (!interactive || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    if (isDown && e.repeat) return;
    input.tap(midi, isDown);
  }

  function nameFor(m: number) {
    if (names === "all" || (names === "c" && m % 12 === 0)) return noteName(m, "flat");
    return "";
  }
</script>

<div class="piano rounded-xl p-2 pt-0 shadow-inner" class:compact class:fill role="group" aria-label={label}>
  <div class="felt" aria-hidden="true"></div>
  <div bind:this={scroller} bind:clientWidth={width} class="overflow-x-auto overscroll-x-contain pb-1">
    <div class="relative flex select-none touch-none" style:min-width={fit ? undefined : `${whites.length * minKey}px`}>
      {#each whites as m (m)}
        {@const mk = marks[m] ?? {}}
        {@const flash = flashes?.get(m)}
        <button
          type="button"
          class="white"
          data-midi={m}
          data-held={down.has(m) || undefined}
          data-target={mk.target || undefined}
          data-demo={mk.demo || undefined}
          data-flash={flash}
          data-role={mk.role}
          aria-label={noteName(m, "flat") + (missing.includes(m) ? ", missed" : mk.target ? ", target" : "")}
          aria-pressed={down.has(m)}
          tabindex={interactive ? 0 : -1}
          onpointerdown={(e) => press(e, m)}
          onpointerup={release}
          onpointercancel={release}
          onlostpointercapture={release}
          onkeydown={(e) => key(e, m, true)}
          onkeyup={(e) => key(e, m, false)}
        >
          {@render glyphs(mk, flash, m)}
          <span class="name">{nameFor(m)}</span>
        </button>
      {/each}
      {#each keys.filter(isBlackKey) as m (m)}
        {@const mk = marks[m] ?? {}}
        {@const flash = flashes?.get(m)}
        <button
          type="button"
          class="black"
          style:left="calc({((whiteIndex(m) + 1) / whites.length) * 100}% - {(0.62 / whites.length) * 50}%)"
          style:width="{(0.62 / whites.length) * 100}%"
          data-midi={m}
          data-held={down.has(m) || undefined}
          data-target={mk.target || undefined}
          data-demo={mk.demo || undefined}
          data-flash={flash}
          data-role={mk.role}
          aria-label={noteName(m, "flat") + (missing.includes(m) ? ", missed" : mk.target ? ", target" : "")}
          aria-pressed={down.has(m)}
          tabindex={interactive ? 0 : -1}
          onpointerdown={(e) => press(e, m)}
          onpointerup={release}
          onpointercancel={release}
          onlostpointercapture={release}
          onkeydown={(e) => key(e, m, true)}
          onkeyup={(e) => key(e, m, false)}
        >
          {@render glyphs(mk, flash, m)}
        </button>
      {/each}
    </div>
  </div>
</div>

{#snippet glyphs(mk: CellMarks, flash: string | undefined, m: number)}
  {#if missing.includes(m)}
    <span class="missed" aria-hidden="true">{noteName(m, "flat", false)}</span>
  {:else if flash}
    <span class="flash" data-kind={flash} aria-hidden="true">{flash === "correct" ? "✓" : flash === "order" ? (mk.label ?? "!") : "✕"}</span>
    <!-- The struck wrong key names itself, so the X and the word above the keys say the same note. -->
    {#if flash === "wrong"}<span class="wrong-name" aria-hidden="true">{noteName(m, "flat", false)}</span>{/if}
  {:else if mk.label}
    <span class="mark-label" aria-hidden="true">{mk.label}</span>
  {:else if mk.target}
    <span class="dot" aria-hidden="true"></span>
  {/if}
{/snippet}

<style>
  .piano {
    background: linear-gradient(#2a1d17, #16100d);
  }
  .compact .white {
    height: 4.75rem;
  }
  .compact .black {
    height: 2.9rem;
  }
  /* Short keys: the marks shrink and the empty name row goes, so a mark on a white key clears the black keys. */
  .compact .name:empty {
    display: none;
  }
  .compact .missed {
    min-width: 1.25rem;
    height: 1.25rem;
    font-size: 0.68rem;
    box-shadow: inset 0 0 0 2.5px var(--destructive);
  }
  @media (max-width: 639px) {
    .fill .white {
      height: max(9.5rem, 24dvh);
    }
    .fill .black {
      height: calc(max(9.5rem, 24dvh) * 0.62);
    }
  }
  .felt {
    height: 6px;
    margin: 0 -0.5rem 0.4rem;
    border-radius: 0.75rem 0.75rem 0 0;
    background: linear-gradient(90deg, color-mix(in oklch, var(--instr) 70%, #300), var(--instr), color-mix(in oklch, var(--instr) 70%, #300));
  }
  button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
    padding-bottom: 0.45rem;
    transition:
      transform 60ms,
      background 60ms;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: -4px;
  }
  .white {
    flex: 1 1 0;
    height: 9.5rem;
    margin-right: 2px;
    border-radius: 0 0 6px 6px;
    background: linear-gradient(to bottom, #f6f3ec 0%, #fffdf8 70%, #e7e1d4 100%);
    box-shadow:
      inset 0 -6px 0 #d8d0c0,
      0 2px 0 #0006;
    color: #3b3430;
  }
  .black {
    position: absolute;
    top: 0;
    z-index: 2;
    height: 5.9rem;
    border-radius: 0 0 4px 4px;
    background: linear-gradient(to bottom, #18161c 0%, #34303a 85%, #0d0c10 100%);
    box-shadow:
      inset 0 -5px 0 #07070a,
      inset 1px 0 0 #ffffff14,
      0 3px 3px #0008;
    color: #f1ece2;
  }
  [data-held] {
    transform: translateY(2px);
  }
  .white[data-held] {
    background: linear-gradient(to bottom, color-mix(in oklch, var(--instr) 45%, #efe7d6), color-mix(in oklch, var(--instr) 30%, #f7f1e6));
    box-shadow:
      inset 0 -2px 0 #cfc5b0,
      inset 0 3px 6px #0003;
  }
  .black[data-held] {
    background: linear-gradient(to bottom, color-mix(in oklch, var(--instr) 55%, #111), color-mix(in oklch, var(--instr) 35%, #1a1a1a));
    box-shadow: inset 0 -2px 0 #000;
  }
  [data-target]:not([data-held]) {
    box-shadow:
      inset 0 0 0 3px var(--instr),
      inset 0 -6px 0 #d8d0c0;
  }
  .black[data-target]:not([data-held]) {
    box-shadow: inset 0 0 0 3px var(--instr);
  }
  [data-demo] {
    background: var(--instr) !important;
    color: #1a1208;
  }
  [data-role="chord"] .dot,
  [data-role="chord"] .mark-label {
    background: var(--tone-chord);
  }
  [data-role="scale"] .dot,
  [data-role="scale"] .mark-label {
    background: var(--tone-scale);
  }
  [data-role="avoid"] .dot,
  [data-role="avoid"] .mark-label {
    background: transparent;
    border: 2px dashed var(--tone-avoid);
    color: inherit;
  }
  /* Outside the scale: struck through as well as dashed, so it never reads as a scale tone at a glance. */
  [data-role="avoid"] .mark-label {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
    opacity: 0.85;
  }
  [data-role="left"] .mark-label {
    background: var(--hand-left);
  }
  [data-role="right"] .mark-label {
    background: var(--hand-right);
  }
  /* A hand on a sounding or target key paints it in that hand's colour. */
  [data-demo][data-role="left"] {
    background: var(--hand-left) !important;
  }
  [data-demo][data-role="right"] {
    background: var(--hand-right) !important;
  }
  /* A held key that is a hand's target takes that hand's colour, as its lane does. */
  .white[data-held][data-role="left"] {
    background: linear-gradient(to bottom, color-mix(in oklch, var(--hand-left) 55%, #efe7d6), color-mix(in oklch, var(--hand-left) 35%, #f7f1e6));
  }
  .white[data-held][data-role="right"] {
    background: linear-gradient(to bottom, color-mix(in oklch, var(--hand-right) 55%, #efe7d6), color-mix(in oklch, var(--hand-right) 35%, #f7f1e6));
  }
  .black[data-held][data-role="left"] {
    background: color-mix(in oklch, var(--hand-left) 60%, #111);
  }
  .black[data-held][data-role="right"] {
    background: color-mix(in oklch, var(--hand-right) 60%, #111);
  }
  [data-target][data-role="left"]:not([data-held]) {
    box-shadow: inset 0 0 0 3px var(--hand-left);
  }
  [data-target][data-role="right"]:not([data-held]) {
    box-shadow: inset 0 0 0 3px var(--hand-right);
  }
  /* A hand's target key also takes a wash of that hand's colour, so it reads at a glance, not only by its ring. */
  .white[data-target][data-role="left"]:not([data-held]) {
    background: linear-gradient(to bottom, color-mix(in oklch, var(--hand-left) 22%, #fffdf8), color-mix(in oklch, var(--hand-left) 34%, #f3eee4));
  }
  .white[data-target][data-role="right"]:not([data-held]) {
    background: linear-gradient(to bottom, color-mix(in oklch, var(--hand-right) 22%, #fffdf8), color-mix(in oklch, var(--hand-right) 34%, #f3eee4));
  }
  .black[data-target][data-role="left"]:not([data-held]) {
    background: color-mix(in oklch, var(--hand-left) 45%, #18161c);
  }
  .black[data-target][data-role="right"]:not([data-held]) {
    background: color-mix(in oklch, var(--hand-right) 45%, #18161c);
  }
  [data-role="left"] .dot {
    background: var(--hand-left);
  }
  [data-role="right"] .dot {
    background: var(--hand-right);
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 999px;
    background: var(--instr);
  }
  .mark-label {
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.78rem;
    font-weight: 700;
    color: #17120c;
    background: var(--instr);
  }
  /* A note the run left out: named, in a solid ring (not dashed, not colour alone). */
  .missed {
    min-width: 1.6rem;
    height: 1.6rem;
    padding: 0 0.2rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--destructive);
    background: #fffdf8;
    box-shadow: inset 0 0 0 3px var(--destructive);
  }
  .name {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    min-height: 0.8rem;
    opacity: 0.8;
  }
  .flash {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.85rem;
    font-weight: 800;
    color: white;
    animation: ws-rise 120ms ease-out;
  }
  .flash[data-kind="correct"] {
    background: var(--success);
    box-shadow: 0 0 0 6px color-mix(in oklch, var(--success) 35%, transparent);
  }
  .flash[data-kind="wrong"] {
    background: var(--destructive);
  }
  .flash[data-kind="order"] {
    color: #17120c;
    background: #fffdf8;
    box-shadow: inset 0 0 0 3px var(--warn);
  }
  .wrong-name {
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1;
    color: var(--destructive);
  }
  .black .wrong-name {
    color: #ffb4a8;
  }
</style>
