<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Sixteen rubber pads on a dark panel with an LED under each, laid out like
  // the MPC: A01 bottom-left, rows ascending. Pads read canonical bank A notes.
  import { onMount } from "svelte";
  import { input, midi } from "../runtime";
  import { capturePointer } from "./feedback.svelte";
  import type { CellMarks, Flashes } from "./feedback.svelte";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import ChevronsLeft from "@lucide/svelte/icons/chevrons-left";
  import ChevronsRight from "@lucide/svelte/icons/chevrons-right";

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
    /** How each hit landed against the note it was for: early, late or on time. */
    timing?: Flashes<"early" | "late" | "perfect">;
    /** A live run whose stage gives the pads the free height (data-grow): the grid stays square, as big as the
     *  box's width and height allow. */
    fit?: boolean;
  }

  let { base = 36, marks = {}, flashes, names = {}, keyHints = true, colors = {}, interactive = true, label = m.music_shell_pads_bank_a(), timing, fit = false }: Props = $props();
  let boxW = $state(0);
  let boxH = $state(0);
  // Only once the box has been laid out, so a first frame never squeezes the pads.
  const side = $derived(fit && boxW > 0 && boxH > 0 ? Math.min(boxW, boxH) : null);
  // A glyph and a word per verdict, so colour is never the only cue. A pad under 89 px wide shows the
  // glyph alone (the word is its title and is said in the live region), so a word is never cut short.
  const VERDICT = {
    early: { word: m.music_shell_verdict_early(), said: m.music_shell_verdict_early(), icon: ChevronsLeft },
    late: { word: m.music_shell_verdict_late(), said: m.music_shell_verdict_late(), icon: ChevronsRight },
    perfect: { word: m.music_shell_verdict_ontime(), said: m.music_shell_verdict_ontime(), icon: Check },
    wrong: { word: m.music_shell_pads_wrong(), said: m.music_shell_pads_wrong_pad(), icon: X },
  } as const;
  /** The last verdict, for screen readers. */
  const said = $derived.by(() => {
    for (let i = 0; i < 16; i++) {
      const w = timing?.get(base + i) ?? (flashes?.get(base + i) === "wrong" ? "wrong" : undefined);
      if (w) return m.music_shell_pads_said({ pad: `A${String(i + 1).padStart(2, "0")}`, verdict: VERDICT[w].said });
    }
    return "";
  });

  // With a MIDI device in, the hands are on the pads: the computer-key letters would only crowd them.
  const letters = $derived(keyHints && !(midi.enabled && midi.inputs.length > 0));
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

<div class="box" class:fit data-grow={fit || undefined} bind:clientWidth={boxW} bind:clientHeight={boxH}>
<div class="panel" role="group" aria-label={label} style:width={side ? `${side}px` : undefined} style:max-width={side ? "none" : undefined}>
  {#each ROWS as row (row)}
    {#each [0, 1, 2, 3] as col (col)}
      {@const i = row + col}
      {@const midi = base + i}
      {@const mk = marks[midi] ?? {}}
      {@const flash = flashes?.get(midi)}
      {@const held = input.held.has(midi)}
      {@const when = timing?.get(midi)}
      <button
        type="button"
        class="pad"
        style:--pad={colors[midi]}
        data-held={held || undefined}
        data-target={mk.target || undefined}
        data-demo={mk.demo || undefined}
        data-flash={flash}
        data-verdict={flash}
        aria-pressed={held}
        aria-label={[m.music_shell_pads_pad({ pad: `A${String(i + 1).padStart(2, "0")}` }), ...(names[midi] ? [names[midi]] : []), ...(mk.target ? [m.music_shell_fret_target()] : [])].join(", ")}
        tabindex={interactive ? 0 : -1}
        onpointerdown={(e) => press(e, midi)}
        onpointerup={release}
        onpointercancel={release}
        onlostpointercapture={release}
        onkeydown={(e) => key(e, midi, true)}
        onkeyup={(e) => key(e, midi, false)}
      >
        <span class="led" aria-hidden="true"></span>
        <!-- The top row holds the pad's id, or, for a moment, how the hit landed: one slot, never stacked. -->
        <span class="top">
          {#if when || flash === "wrong"}
            {@const v = VERDICT[when ?? "wrong"]}
            <span class="when ws-pop" data-kind={when ?? "wrong"} title={v.said} aria-hidden="true"><v.icon class="size-3.5 shrink-0" strokeWidth={3} /><span class="word">{v.word}</span></span>
          {:else}
            <span class="num">A{String(i + 1).padStart(2, "0")}</span>
            {#if letters}<kbd>{KEYS[i].toUpperCase()}</kbd>{/if}
          {/if}
        </span>
        <span class="name">{names[midi] ?? ""}</span>
        {#if flash === "correct" && !when}
          <span class="glyph" data-kind={flash} aria-hidden="true">✓</span>
        {:else if mk.label}
          <span class="glyph" aria-hidden="true">{mk.label}</span>
        {/if}
      </button>
    {/each}
  {/each}
</div>
</div>
<p class="sr-only" aria-live="polite">{said}</p>

<style>
  /* Grown, the pads sit in the middle of the height they were given. */
  .box.fit {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
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
    container-type: inline-size;
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
    min-height: 1.15rem;
    font-size: 0.8125rem;
  }
  /* The pad's code is secondary: the voice or slice name below is the label. */
  .num,
  kbd {
    opacity: 0.8;
    font-size: 0.8125rem;
  }
  /* No keyboard on a touch screen: the key letters would only crowd the pad. */
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
  kbd {
    font-family: inherit;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 0 0.2rem;
    line-height: 1.1;
  }
  /* Up to two lines, so "Slice 10" or "Mid tom" is read whole on a small pad. */
  .name {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
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
    font-size: 0.8125rem;
    font-weight: 800;
    background: var(--instr);
    color: #140a10;
  }
  /* How the hit landed: a pill over the pad number at the top, clear of the name, gone in a moment. */
  .when {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.1rem 0.2rem;
    border-radius: 999px;
    white-space: nowrap;
    overflow: hidden;
    font-size: 0.8125rem;
    font-weight: 800;
    color: #140a10;
    background: var(--success);
  }
  /* "On time" beside its glyph needs 76 px of content (an 89 px pad less its padding): under that the glyph stands
     alone, so the word is never cut at the pad's edge. */
  @container (max-width: 76px) {
    .when .word {
      display: none;
    }
  }
  /* A small pad (under 76 px): the name a size down, so two lines ("Mid tom") fit above the pad's bottom edge. */
  @container (max-width: 63px) {
    .name {
      font-size: 0.8125rem;
      line-height: 1.05;
    }
  }
  /* --early and --late are dark in the light theme and light in the dark one, as --destructive is: its ink fits. */
  .when[data-kind="early"] {
    background: var(--early, var(--warn));
    color: var(--on-destructive, #140a10);
  }
  .when[data-kind="late"] {
    background: var(--late, var(--warn));
    color: var(--on-destructive, #140a10);
  }
  .when[data-kind="wrong"] {
    background: var(--destructive);
    color: white;
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
