<script lang="ts">
  // One lesson screen at a time, in place of the drill's stage. Sounds play on tap only.
  import { onDestroy, tick } from "svelte";
  import type { Score } from "@repo/music-core";
  import type { Lesson, LessonFigure, LessonSound } from "@repo/music-core/lessons/types";
  import { audio } from "../runtime";
  import CircleOfFifths from "./CircleOfFifths.svelte";
  import Piano from "./Piano.svelte";
  import Fretboard, { type FretMark } from "./Fretboard.svelte";
  import Staff from "../notation/Staff.svelte";
  import { tuningFor } from "../drills/guitar/instrument.svelte";
  import { btn, btnPrimary } from "./ui";
  import Volume2 from "lucide-svelte/icons/volume-2";

  let { lessons, onfinish, onskip }: { lessons: Lesson[]; onfinish: () => void; onskip: () => void } = $props();

  let li = $state(0);
  let si = $state(0);
  /** Steps revealed on this screen. */
  let shown = $state(0);
  /** The figure an option button chose. */
  let picked = $state<LessonFigure | null>(null);
  let heading: HTMLElement | undefined = $state();

  const lesson = $derived(lessons[li]);
  const screen = $derived(lesson.screens[si]);
  const steps = $derived(screen.steps ?? []);
  const figure = $derived(picked ?? (shown > 0 ? (steps[shown - 1].figure ?? screen.figure) : screen.figure));
  const isFirst = $derived(li === 0 && si === 0 && shown === 0);
  const isLast = $derived(li === lessons.length - 1 && si === lesson.screens.length - 1 && shown >= steps.length);
  const total = $derived(lesson.screens.length);

  function play(s: LessonSound) {
    audio.stopSequence();
    void audio.unlock().then(() =>
      audio.playSequence(s.notes.flatMap((n) => n.midi.map((midi) => ({ midi, time: n.at, duration: n.dur })))),
    );
  }

  async function moved() {
    audio.stopSequence();
    picked = null;
    await tick();
    heading?.focus();
  }

  function next() {
    if (shown < steps.length) shown++;
    else if (si < lesson.screens.length - 1) {
      si++;
      shown = 0;
      void moved();
    } else if (li < lessons.length - 1) {
      li++;
      si = 0;
      shown = 0;
      void moved();
    } else return onfinish();
    audio.stopSequence();
    picked = null;
  }

  function back() {
    if (shown > 0) shown--;
    else if (si > 0) {
      si--;
      shown = 0;
      void moved();
    } else if (li > 0) {
      li--;
      si = lessons[li].screens.length - 1;
      shown = 0;
      void moved();
    }
    audio.stopSequence();
    picked = null;
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  }

  onDestroy(() => audio.stopSequence());

  /** A key signature of N accidentals on an empty staff; `reveal` is how many show. */
  function sigScore(f: Extract<LessonFigure, { kind: "signature" }>): Score {
    const n = f.reveal ?? Math.abs(f.fifths);
    return {
      id: `lesson-sig-${f.fifths}-${n}`,
      title: "Key signature",
      bpm: 60,
      keyFifths: Math.sign(f.fifths) * n,
      meter: { beats: 4, beatUnit: 4 },
      voices: [{ id: "v", name: "Signature", clef: f.clef, notes: [] }],
      lengthBeats: 4,
    };
  }
  const sigLabel = (f: Extract<LessonFigure, { kind: "signature" }>) => {
    const n = f.reveal ?? Math.abs(f.fifths);
    return `${f.clef} clef key signature with ${n} ${f.fifths < 0 ? "flat" : "sharp"}${n === 1 ? "" : "s"}`;
  };
  const pianoMarks = (m: Record<number, string>) => Object.fromEntries(Object.entries(m).map(([k, label]) => [k, { target: true, label }]));
  const fretMarks = (m: { string: number; fret: number; label: string }[]): FretMark[] => m.map((x) => ({ ...x, role: "scale" }));
</script>

<svelte:window onkeydown={onKey} />

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2 text-ws-stage-ink" data-testid="lesson">
  <div class="flex items-center justify-between gap-3 text-sm text-ws-stage-ink/80">
    <p>{lesson.title}</p>
    <p aria-label="Screen {si + 1} of {total}">{si + 1} / {total}</p>
  </div>
  <div class="flex gap-1.5" aria-hidden="true">
    {#each lesson.screens as _, i (i)}<span class="h-1.5 flex-1 rounded-full {i <= si ? 'bg-instr' : 'bg-ws-stage-ink/20'}"></span>{/each}
  </div>

  <h2 bind:this={heading} tabindex="-1" class="font-display text-2xl font-semibold outline-none sm:text-3xl">{screen.title}</h2>
  <p class="max-w-prose text-base">{screen.text}</p>

  {#if figure}
    <div class="mx-auto w-full max-w-sm rounded-xl bg-ws-surface px-3 pb-1 text-ws-ink">
      {#if figure.kind === "signature"}
        <Staff score={sigScore(figure)} maxHeight="9rem" time={false} />
        <p class="sr-only">{sigLabel(figure)}</p>
      {:else if figure.kind === "wheel"}
        <CircleOfFifths selected={figure.selected ?? null} marks={Object.fromEntries(Object.entries(figure.marks ?? {}).map(([k, v]) => [k, v as "lit"]))} numerals={false} label="The circle of fifths" />
      {:else if figure.kind === "keys"}
        <Piano low={figure.low} high={figure.high} marks={pianoMarks(figure.marks)} interactive={false} names="none" label="Piano keys" />
      {:else}
        {@const t = tuningFor(figure.instrument)}
        <Fretboard openStrings={t.openStrings} from={0} to={5} marks={fretMarks(figure.marks)} interactive={false} label="{figure.instrument} fretboard" />
      {/if}
    </div>
  {/if}

  {#if steps.length}
    <ol class="flex flex-col gap-1 text-base" aria-live="polite">
      {#each steps.slice(0, shown) as st, i (i)}<li class={i === shown - 1 ? "font-semibold" : "text-ws-stage-ink/80"}>{st.text}</li>{/each}
    </ol>
  {/if}

  <div class="flex flex-wrap gap-2">
    {#if screen.sound}<button type="button" class={btn} onclick={() => play(screen.sound!)}><Volume2 class="size-4" aria-hidden="true" />Hear it</button>{/if}
    {#if shown > 0 && steps[shown - 1].sound}<button type="button" class={btn} onclick={() => play(steps[shown - 1].sound!)}><Volume2 class="size-4" aria-hidden="true" />Hear this step</button>{/if}
    {#each screen.options ?? [] as o (o.label)}
      <button type="button" class={btn} onclick={() => { play(o.sound); picked = o.figure ?? null; }}><Volume2 class="size-4" aria-hidden="true" />{o.label}</button>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2 pt-2">
    {#if !isFirst}<button type="button" class={btn} onclick={back}>Back</button>{/if}
    <button type="button" class={btnPrimary} onclick={next}>{isLast ? "Start the quiz" : "Next"}</button>
    {#if li === 0 && si === 0}<button type="button" class="min-h-11 rounded-full px-4 text-sm font-medium text-ws-stage-ink/80 underline underline-offset-4 hover:text-ws-stage-ink" onclick={onskip}>Skip, I know this</button>{/if}
    <span class="ml-auto hidden text-xs text-ws-stage-ink/70 sm:inline">Arrow keys move.</span>
  </div>
</div>
