<script lang="ts" module>
  /** Drills whose answer is a few notes at once: shown on the strip's instrument once answered. */
  export const ON_INSTRUMENT = ["interval", "chord-quality", "inversion"];
</script>

<script lang="ts">
  // After an answer: the prompt's notes on the strip's instrument (keys, frets or
  // the Aerophone's fingering). An interval counts its half steps out from the
  // first note, one key or fret at a time (on a phone only the two ends carry a
  // number); a wrong choice shows as a red key with a cross and its name, where
  // that answer would have landed. Notes light as they sound.
  import { m } from "@repo/i18n/messages.js";
  import { noteName } from "@repo/music-core";
  import type { EarPrompt } from "@repo/music-core/content/ear";
  import InstrumentStage, { fretTuning } from "#lib/music/components/InstrumentStage.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";
  import { settings } from "#lib/music/runtime/index.ts";
  import EarVisual from "./EarVisual.svelte";
  import { tokenLabel } from "./session";
  import { namingKeyOf, spellChord, spellDegree, spellInterval } from "./degrees";
  import { keyName } from "#lib/music/names.svelte.ts";
  import { showNote } from "@repo/music-core";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

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
  /** A scale degree is heard against its tonic: both are drawn, the tonic marked 1. */
  const degree = $derived(prompt.drill === "scale-degree");
  const tonic = $derived(prompt.playback[0]?.midi[0] ?? 60);
  // A chord is its last event (an inversion spells its notes out first).
  const played = $derived(ends ?? [...(prompt.playback.at(-1)?.midi ?? [])].sort((a, b) => a - b));
  const chosenNotes = $derived(!chosen ? [] : interval ? chosen.playback.flatMap((e) => e.midi) : chosen.playback.at(-1)!.midi);
  /** Where the wrong answer differs from what was played. */
  const other = $derived([...new Set(chosenNotes)].filter((m) => !played.includes(m)));

  // The climb: every half step up to the second note inside half a second, whatever the
  // distance (an octave's 12 used to stop at 7 in a still), all at once with reduced motion.
  const CLIMB_MS = 480;
  let climb = $state(0);
  $effect(() => {
    const total = steps;
    void prompt.id;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    climb = still ? total : 0;
    if (still || !total) return;
    const t = setInterval(() => {
      if (++climb >= total) clearInterval(t);
    }, Math.min(110, CLIMB_MS / total));
    return () => clearInterval(t);
  });

  /** A phone keeps the keys readable: numbers only on the two played keys. */
  const phone = new MediaQuery("max-width: 639px");
  // The chosen answer's own notes: a red key with a cross and its name (held for the whole feedback).
  const chosenMarks = new Flashes();
  $effect(() => {
    const ms = other;
    untrack(() => {
      chosenMarks.clear();
      for (const m of ms) chosenMarks.add(m, "wrong", 600_000);
    });
    return () => untrack(() => chosenMarks.clear());
  });
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (ends) {
      if (!phone.current) for (let k = 1; k < Math.min(climb + 1, steps); k++) out[from + way * k] = { label: String(k), role: "scale" };
      out[from] = { target: true, label: "0" };
      out[ends[1]] = { target: true, label: climb >= steps && steps ? String(steps) : undefined };
      if (climb < steps) out[from + way * climb] = { ...out[from + way * climb], demo: true };
    } else {
      if (degree) out[tonic] = { label: "1", role: "scale" };
      // The played notes: an outlined key with a dot (a degree also names itself), the same at every width.
      for (const m of played) out[m] = { target: true, ...(degree ? { label: prompt.answer } : {}) };
    }
    for (const m of lit) out[m] = { ...out[m], demo: true };
    return out;
  });
  const line = $derived([...(degree ? [tonic] : []), ...played, ...other]);
  const inst = $derived(settings.value.activeInstrument);
  const onKeys = $derived(!fretTuning(inst) && inst !== "aerophone");

  /** A note by name, counted from the prompt's key in movable do (a degree's tonic). */
  const key = $derived(namingKeyOf(prompt));
  const say = (name: string) => showNote(name, key);
  /** Bass to top, each spelled by its place in the chord (E G# B#, not E Ab C), each name once. */
  const names = (ms: number[]) => [...new Set(spellChord(ms))].map(say).join(" ");
  const bass = (ms: number[]) => say(spellChord(ms)[0]);
  const playedText = $derived.by(() => {
    if (ends) {
      const [a, b] = spellInterval(from, ends[1]);
      const msg = prompt.direction === "harmonic" ? m.music_drills_ear_reveal_interval_harmonic : way > 0 ? m.music_drills_ear_reveal_interval_up : m.music_drills_ear_reveal_interval_down;
      return msg({ name: tokenLabel("interval", prompt.answer), a: say(a), b: say(b), count: steps });
    }
    if (prompt.drill === "inversion") return m.music_drills_ear_reveal_inversion({ name: tokenLabel("inversion", prompt.answer), notes: names(played), bass: bass(played) });
    if (degree)
      return m.music_drills_ear_reveal_degree({
        name: tokenLabel("scale-degree", prompt.answer),
        notes: played.map((n) => say(spellDegree(n, tonic, prompt.answer).replace(/-?\d+$/, ""))).join(" "),
        tonic: keyName(noteName(tonic, "flat", false)),
      });
    return m.music_drills_ear_reveal_notes({ name: tokenLabel(prompt.drill, prompt.answer), notes: names(played) });
  });
  const chosenText = $derived.by(() => {
    if (!chosen) return "";
    const ms = [...chosenNotes].sort((a, b) => a - b);
    if (ends) {
      const n = Math.abs(chosenNotes.at(-1)! - chosenNotes[0]);
      return m.music_drills_ear_reveal_chosen_interval({ name: tokenLabel("interval", chosen.answer), count: n });
    }
    return prompt.drill === "inversion"
      ? m.music_drills_ear_reveal_inversion({ name: tokenLabel("inversion", chosen.answer), notes: names(ms), bass: bass(ms) })
      : m.music_drills_ear_reveal_notes({ name: tokenLabel(prompt.drill, chosen.answer), notes: names(ms) });
  });
</script>

<div class="reveal">
  <figure data-testid="ear-reveal">
    <InstrumentStage {line} {marks} flashes={chosenMarks} current={lit.at(-1) ?? played.at(-1) ?? null} interactive={false} />
    <figcaption class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      {#if ends}
        <!-- The distance, counted as it climbs: one pip per half step. -->
        <span class="flex items-center gap-2" aria-hidden="true">
          <span class="count tnum font-display text-3xl font-bold">{steps}</span>
          <span class="flex flex-col gap-1">
            <span class="text-sm text-ws-stage-soft">{m.music_drills_ear_reveal_half_steps()}</span>
            <span class="flex gap-0.5">
              {#each { length: steps } as _, k (k)}<span class="pip" class:on={k < climb}></span>{/each}
            </span>
          </span>
        </span>
      {/if}
      <span class="flex min-w-0 flex-col text-sm">
        <!-- The legend: the swatch beside each line is the mark on the instrument. -->
        <span class="font-semibold"><span class="played-key" aria-hidden="true"></span>{m.music_drills_ear_reveal_played({ text: playedText })}</span>
        {#if chosen}<span class="font-medium"><span class="chosen-key" aria-hidden="true">✕</span>{m.music_drills_ear_reveal_you_chose({ text: chosenText })}</span>{/if}
      </span>
    </figcaption>
  </figure>
  {#if onKeys}
    <!-- Closed by default to keep the answers in view; a button with a chevron, so it never reads as an empty heading. -->
    <details class="staff mt-2">
      <summary class="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-ws-stage-ink/8">
        <ChevronDown class="chev size-4" aria-hidden="true" />
        <span class="closed-label">{m.music_drills_ear_reveal_show_staff()}</span><span class="open-label">{m.music_drills_ear_reveal_hide_staff()}</span>
      </summary>
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
  .played-key {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    margin-right: 0.35rem;
    vertical-align: -0.1rem;
    border-radius: 0.2rem;
    border: 3px solid var(--instr);
  }
  .chosen-key {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    margin-right: 0.35rem;
    vertical-align: -0.1rem;
    border-radius: 999px;
    /* Filled with a cross, the way the key is marked: never a faint dashed ring. */
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    font-size: 0.8125rem;
    font-weight: 800;
    color: white;
    background: var(--destructive);
  }
  .staff summary::-webkit-details-marker {
    display: none;
  }
  .staff :global(.chev) {
    transition: rotate 150ms;
  }
  .staff[open] :global(.chev) {
    rotate: 180deg;
  }
  .staff .open-label,
  .staff[open] .closed-label {
    display: none;
  }
  .staff[open] .open-label {
    display: inline;
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
