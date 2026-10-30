<script lang="ts" module>
  /** Drills whose answer is a few notes at once: shown on the strip's instrument once answered. */
  export const ON_INSTRUMENT = ["interval", "chord-quality", "inversion"];
</script>

<script lang="ts">
  // After an answer: the prompt's notes on the strip's instrument (keys, frets or
  // the Aerophone's fingering). An interval counts its half steps out from the
  // first note, one key or fret at a time; a wrong choice shows, dashed, where
  // that answer would have landed. Notes light as they sound.
  import { noteName } from "@repo/music-core";
  import type { EarPrompt } from "@repo/music-core/content/ear";
  import InstrumentStage, { fretTuning } from "$lib/music/components/InstrumentStage.svelte";
  import type { CellMarks } from "$lib/music/components/feedback.svelte";
  import { settings } from "$lib/music/runtime";
  import EarVisual from "./EarVisual.svelte";
  import { tokenLabel } from "./session";

  let {
    prompt,
    chosen = null,
    lit = [],
  }: {
    prompt: EarPrompt & { direction?: string };
    /** The wrong answer, built from the same first note or root. */
    chosen?: { answer: string; playback: EarPrompt["playback"] } | null;
    /** Notes sounding now. */
    lit?: number[];
  } = $props();

  const interval = $derived(prompt.drill === "interval");
  // An interval counts from its first note (the lower one when played together).
  const ends = $derived.by(() => {
    if (!interval || !prompt.expectedMidi) return null;
    const [a, b] = prompt.expectedMidi;
    return prompt.direction === "harmonic" ? [Math.min(a, b), Math.max(a, b)] : [a, b];
  });
  const from = $derived(ends?.[0] ?? 0);
  const steps = $derived(ends ? Math.abs(ends[1] - ends[0]) : 0);
  const way = $derived(ends && ends[1] < ends[0] ? -1 : 1);
  // A chord is its last event (an inversion spells its notes out first).
  const played = $derived(ends ?? [...(prompt.playback.at(-1)?.midi ?? [])].sort((a, b) => a - b));
  const chosenNotes = $derived(!chosen ? [] : interval ? chosen.playback.flatMap((e) => e.midi) : chosen.playback.at(-1)!.midi);
  /** Where the wrong answer differs from what was played. */
  const other = $derived([...new Set(chosenNotes)].filter((m) => !played.includes(m)));

  // The climb: one half step every 110 ms up to the second note (all at once with reduced motion).
  let climb = $state(0);
  $effect(() => {
    const total = steps;
    void prompt.id;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    climb = still ? total : 0;
    if (still || !total) return;
    const t = setInterval(() => {
      if (++climb >= total) clearInterval(t);
    }, 110);
    return () => clearInterval(t);
  });

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (ends) {
      for (let k = 1; k < Math.min(climb + 1, steps); k++) out[from + way * k] = { label: String(k), role: "scale" };
      out[from] = { target: true };
      out[ends[1]] = { target: true, label: climb >= steps && steps ? String(steps) : undefined };
      if (climb < steps) out[from + way * climb] = { ...out[from + way * climb], demo: true };
      for (const m of other) out[m] = { label: String(Math.abs(m - from)), role: "avoid" };
    } else {
      for (const m of played) out[m] = { target: true };
      for (const m of other) out[m] = { role: "avoid", label: "×" };
    }
    for (const m of lit) out[m] = { ...out[m], demo: true };
    return out;
  });
  const line = $derived([...played, ...other]);
  const inst = $derived(settings.value.activeInstrument);
  const onKeys = $derived(!fretTuning(inst) && inst !== "aerophone");

  const names = (ms: number[]) => ms.map((m) => noteName(m, "flat", false)).join(" ");
  const bass = (ms: number[]) => noteName(Math.min(...ms), "flat", false);
  const playedText = $derived(
    ends
      ? `${tokenLabel("interval", prompt.answer)}, ${noteName(from, "flat", false)} ${prompt.direction === "harmonic" ? "and" : way > 0 ? "up to" : "down to"} ${noteName(ends[1], "flat", false)}, ${steps} half step${steps === 1 ? "" : "s"}`
      : prompt.drill === "inversion"
        ? `${tokenLabel("inversion", prompt.answer)}: ${names(played)}, ${bass(played)} in the bass`
        : `${tokenLabel(prompt.drill, prompt.answer)}: ${names(played)}`,
  );
  const chosenText = $derived.by(() => {
    if (!chosen) return "";
    const ms = [...chosenNotes].sort((a, b) => a - b);
    if (ends) {
      const n = Math.abs(chosenNotes.at(-1)! - chosenNotes[0]);
      return `${tokenLabel("interval", chosen.answer)}, ${n} half step${n === 1 ? "" : "s"}`;
    }
    return prompt.drill === "inversion" ? `${tokenLabel("inversion", chosen.answer)}: ${names(ms)}, ${bass(ms)} in the bass` : `${tokenLabel(prompt.drill, chosen.answer)}: ${names(ms)}`;
  });
</script>

<div class="reveal">
  <figure data-testid="ear-reveal">
    <InstrumentStage {line} {marks} current={lit.at(-1) ?? played.at(-1) ?? null} interactive={false} />
    <figcaption class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      {#if ends}
        <!-- The distance, counted as it climbs: one pip per half step. -->
        <span class="flex items-center gap-2" aria-hidden="true">
          <span class="count tnum font-display text-3xl font-bold">{Math.min(climb, steps)}</span>
          <span class="flex flex-col gap-1">
            <span class="text-xs text-ws-stage-soft">half steps</span>
            <span class="flex gap-0.5">
              {#each { length: steps } as _, k (k)}<span class="pip" class:on={k < climb}></span>{/each}
            </span>
          </span>
        </span>
      {/if}
      <span class="flex min-w-0 flex-col text-sm">
        <span class="font-semibold">Played: {playedText}</span>
        {#if chosen}<span class="text-ws-stage-soft"><span class="chosen-key" aria-hidden="true"></span>You chose: {chosenText}</span>{/if}
      </span>
    </figcaption>
  </figure>
  {#if onKeys}
    <details class="mt-2">
      <summary class="flex min-h-11 w-fit cursor-pointer items-center text-sm text-ws-stage-soft">On the staff</summary>
      <EarVisual {prompt} revealed />
    </details>
  {/if}
</div>

<style>
  .reveal {
    animation: fade 300ms both;
  }
  .count {
    min-width: 2ch;
    text-align: right;
    color: var(--instr);
  }
  .pip {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: color-mix(in oklch, var(--ws-stage-ink) 16%, transparent);
    transition: background 120ms;
  }
  .pip.on {
    background: var(--tone-scale);
  }
  .chosen-key {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    margin-right: 0.35rem;
    vertical-align: -0.1rem;
    border-radius: 999px;
    border: 2px dashed var(--tone-avoid);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal {
      animation: none;
    }
    .pip {
      transition: none;
    }
  }
  :global(html[data-reduce-motion]) .reveal {
    animation: none;
  }
</style>
