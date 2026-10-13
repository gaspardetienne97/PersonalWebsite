<script lang="ts">
  // Sixteen rubber pads on a dark panel with an LED under each, laid out like
  // the MPC: A01 bottom-left, rows ascending. Pads read canonical bank A notes.
  import { onMount } from "svelte";
  import { input } from "../runtime";
  import { capturePointer } from "./feedback.svelte";
  import type { CellMarks, Flashes } from "./feedback.svelte";

  interface Props {
    base?: number;
    marks?: Record<number, CellMarks>;
    flashes?: Flashes;
    /** Name per pad note (kit voice or sample). */
    names?: Record<number, string>;
    /** Show the QWERTY key for each pad. */
    keyHints?: boolean;
    /** A colour per pad note (a lane's colour on a note highway): its glow and LED. */
    colors?: Record<number, string>;
    interactive?: boolean;
    label?: string;
  }

  let { base = 36, marks = {}, flashes, names = {}, keyHints = true, colors = {}, interactive = true, label = "Pads, bank A" }: Props = $props();

  // Rows top to bottom: pads 13-16, 9-12, 5-8, 1-4.
  const ROWS = [12, 8, 4, 0];
  // Matches the runtime's QWERTY pad map (bottom row is ZXCV).
  const KEYS = ["z", "x", "c", "v", "a", "s", "d", "f", "q", "w", "e", "r", "1", "2", "3", "4"];
  // The computer keyboard plays this surface while it is on screen.
  onMount(() => {
    if (!interactive) return;
    input.setKeyboardMode("pads");
    return () => input.setKeyboardMode("off");
  });

  const pointer = new Map<number, number>();

  function press(e: PointerEvent, midi: number) {
    if (!interactive || e.button > 0) return;
    capturePointer(e);
    pointer.set(e.pointerId, midi);
    input.tap(midi, true);
  }
  function release(e: PointerEvent) {
    const midi = pointer.get(e.pointerId);
    if (midi === undefined) return;
    pointer.delete(e.pointerId);
    input.tap(midi, false);
  }
  function key(e: KeyboardEvent, midi: number, isDown: boolean) {
    if (!interactive || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    if (isDown && e.repeat) return;
    input.tap(midi, isDown);
  }
</script>

<div class="panel" role="group" aria-label={label}>
  {#each ROWS as row (row)}
    {#each [0, 1, 2, 3] as col (col)}
      {@const i = row + col}
      {@const midi = base + i}
      {@const mk = marks[midi] ?? {}}
      {@const flash = flashes?.get(midi)}
      {@const held = input.held.has(midi)}
      <button
        type="button"
        class="pad"
        style:--pad={colors[midi]}
        data-held={held || undefined}
        data-target={mk.target || undefined}
        data-demo={mk.demo || undefined}
        data-flash={flash}
        aria-pressed={held}
        aria-label="Pad A{String(i + 1).padStart(2, '0')}{names[midi] ? `, ${names[midi]}` : ''}{mk.target ? ', target' : ''}"
        tabindex={interactive ? 0 : -1}
        onpointerdown={(e) => press(e, midi)}
        onpointerup={release}
        onpointercancel={release}
        onlostpointercapture={release}
        onkeydown={(e) => key(e, midi, true)}
        onkeyup={(e) => key(e, midi, false)}
      >
        <span class="led" aria-hidden="true"></span>
        <span class="top">
          <span class="num">A{String(i + 1).padStart(2, "0")}</span>
          {#if keyHints}<kbd>{KEYS[i].toUpperCase()}</kbd>{/if}
        </span>
        <span class="name">{names[midi] ?? ""}</span>
        {#if flash}
          <span class="glyph" data-kind={flash} aria-hidden="true">{flash === "correct" ? "✓" : "✕"}</span>
        {:else if mk.label}
          <span class="glyph" aria-hidden="true">{mk.label}</span>
        {/if}
      </button>
    {/each}
  {/each}
</div>

<style>
  .panel {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.6rem;
    padding: 0.8rem;
    border-radius: 1rem;
    background: linear-gradient(#26232b, #17151a);
    box-shadow:
      inset 0 1px 0 #ffffff14,
      0 6px 18px #0007;
    max-width: 30rem;
    margin-inline: auto;
  }
  .pad {
    position: relative;
    aspect-ratio: 1;
    min-height: 3.5rem;
    border-radius: 0.6rem;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-align: left;
    color: #d9d4df;
    background: radial-gradient(120% 120% at 30% 20%, #4a4652, #2c2a31 60%, #232128);
    box-shadow:
      inset 0 -3px 0 #0006,
      inset 0 1px 0 #ffffff1a,
      0 2px 0 #000;
    transition:
      transform 50ms,
      box-shadow 80ms;
    -webkit-tap-highlight-color: transparent;
    overflow: hidden;
  }
  .pad:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 2px;
  }
  .led {
    position: absolute;
    inset: auto 12% 6% 12%;
    height: 3px;
    border-radius: 3px;
    background: #ffffff10;
  }
  /* A pad's own colour (from a lane) when it has one, else the instrument's. */
  .pad {
    --glow: var(--pad, var(--instr));
  }
  .pad[style*="--pad"] .led {
    background: color-mix(in oklch, var(--pad) 35%, transparent);
  }
  [data-target] .led {
    background: color-mix(in oklch, var(--glow) 80%, transparent);
  }
  [data-target] {
    box-shadow:
      inset 0 0 0 2px var(--glow),
      0 0 16px color-mix(in oklch, var(--glow) 55%, transparent),
      inset 0 -3px 0 #0006,
      0 2px 0 #000;
  }
  [data-held] {
    transform: translateY(2px) scale(0.98);
    background: radial-gradient(120% 120% at 50% 40%, color-mix(in oklch, var(--glow) 75%, white), var(--glow) 55%, color-mix(in oklch, var(--glow) 60%, black));
    color: #140a10;
    box-shadow:
      0 0 18px color-mix(in oklch, var(--glow) 70%, transparent),
      inset 0 2px 6px #0004;
  }
  [data-held] .led {
    background: white;
  }
  [data-demo] {
    background: color-mix(in oklch, var(--glow) 65%, #2c2a31);
    color: #140a10;
  }
  .top {
    display: flex;
    justify-content: space-between;
    font-size: 0.68rem;
    opacity: 0.8;
  }
  kbd {
    font-family: inherit;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 0 0.2rem;
    opacity: 0.7;
  }
  .name {
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .glyph {
    position: absolute;
    right: 0.4rem;
    bottom: 0.9rem;
    min-width: 1.4rem;
    height: 1.4rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: 800;
    background: var(--instr);
    color: #140a10;
  }
  .glyph[data-kind="correct"] {
    background: var(--success);
    color: white;
  }
  .glyph[data-kind="wrong"] {
    background: var(--destructive);
    color: white;
  }
</style>
