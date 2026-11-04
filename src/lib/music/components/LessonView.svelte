<script lang="ts">
  // One lesson screen at a time, in place of the drill's stage. Sounds play on tap only.
  import { onDestroy, tick } from "svelte";
  import type { Score } from "@repo/music-core";
  import type { Lesson, LessonFigure, LessonSound } from "@repo/music-core/lessons/types";
  import { audio } from "../runtime";
  import CircleOfFifths from "./CircleOfFifths.svelte";
  import Piano from "./Piano.svelte";
  import Fretboard, { type FretMark } from "./Fretboard.svelte";
  import Pads from "./Pads.svelte";
  import AerophoneKeys from "./AerophoneKeys.svelte";
  import DictationGrid from "../drills/rhythm/DictationGrid.svelte";
  import { GROOVE_LANES } from "@repo/music-core/content/rhythm";
  import { countName } from "@repo/music-core/lessons/count";
  import Staff from "../notation/Staff.svelte";
  import { noteName } from "@repo/music-core";
  import { tuningFor } from "../drills/guitar/instrument.svelte";
  import { btnStage as btn, btnPrimary } from "./ui";
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
  /** The screens of every lesson in the sequence, and this one's place among them (from 1). */
  const total = $derived(lessons.reduce((n, l) => n + l.screens.length, 0));
  const at = $derived(lessons.slice(0, li).reduce((n, l) => n + l.screens.length, 0) + si + 1);

  /** The studio loop an effect sound plays through, the quiz's own audio graph. */
  let studioLoop: ReturnType<typeof audio.studio.loop> | null = null;
  let studioTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every halt: a tap whose renders finish after a later tap, a move or the unmount is dropped. */
  let generation = 0;
  let destroyed = false;
  function halt() {
    generation++;
    audio.stopSequence();
    clearTimeout(studioTimer);
    studioLoop?.stop();
    studioLoop = null;
  }

  async function playEffect(e: NonNullable<LessonSound["effect"]>) {
    const mine = generation;
    try {
      await audio.unlock();
      const buffer = await audio.studio.material(e.material);
      // Matched, as in the quiz: Changed is trimmed back to Flat's loudness.
      const trim = e.matched ? (await audio.studio.loudness(buffer, {})) - (await audio.studio.loudness(buffer, e.change)) : 0;
      if (destroyed || mine !== generation) return;
      studioLoop = audio.studio.loop(buffer);
      studioLoop.set(e.change, trim);
      studioLoop.show(true);
      studioTimer = setTimeout(halt, 4000);
    } catch {
      // Audio that cannot start leaves the lesson silent, as a sequence would.
    }
  }

  function play(s: LessonSound) {
    halt();
    if (s.effect) return void playEffect(s.effect);
    const mine = generation;
    void audio
      .unlock()
      .then(() => {
        // A move, another tap or the unmount before the audio was ready drops this tap.
        if (destroyed || mine !== generation) return;
        audio.playSequence(s.notes.flatMap((n) => n.midi.map((midi) => ({ midi, time: n.at, duration: n.dur, ...(n.drum ? { voice: "drum" as const } : {}), ...(n.velocity ? { velocity: n.velocity } : {}) }))));
      })
      .catch(() => {});
  }

  async function moved() {
    halt();
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
    halt();
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
    halt();
    picked = null;
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea, [role=slider], [role=listbox], [role=option], [role=combobox]")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  }

  onDestroy(() => {
    destroyed = true;
    halt();
  });

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
  /** The staff figure as a one-bar score: its notes one after another, a rest where `midi` is null. */
  function staffScore(f: Extract<LessonFigure, { kind: "staff" }>): Score {
    let at = 0;
    const notes = f.notes.flatMap((n) => {
      const out = n.midi === null ? [] : [{ midi: n.midi, startBeat: at, durationBeats: n.beats }];
      at += n.beats;
      return out;
    });
    return {
      id: `lesson-staff-${f.clef}-${f.fifths ?? 0}-${f.notes.map((n) => `${n.midi}x${n.beats}`).join("_")}`,
      title: "Lesson",
      bpm: 60,
      keyFifths: f.fifths ?? 0,
      meter: f.meter ?? { beats: at, beatUnit: 4 },
      voices: [{ id: "v", name: "Notes", clef: f.clef, notes }],
      lengthBeats: at,
    };
  }
  const staffLabel = (f: Extract<LessonFigure, { kind: "staff" }>) =>
    `${f.clef} clef${f.fifths ? ` with ${Math.abs(f.fifths)} ${f.fifths < 0 ? "flat" : "sharp"}${Math.abs(f.fifths) === 1 ? "" : "s"}` : ""}: ${f.notes.map((n) => (n.midi === null ? "rest" : noteName(n.midi, (f.fifths ?? 0) < 0 ? "flat" : "sharp"))).join(", ")}`;
  const pianoMarks = (m: Record<number, string>) => Object.fromEntries(Object.entries(m).map(([k, label]) => [k, { target: true, label }]));
  const padMarks = (m: Record<number, string>) => Object.fromEntries(Object.entries(m).map(([k, label]) => [k, { target: true, label }]));
  const padLabel = (f: Extract<LessonFigure, { kind: "pads" }>) =>
    `MPC pads: ${Object.entries(f.marks).map(([k, label]) => `A${String(+k - 35).padStart(2, "0")}${f.names?.[+k] ? ` ${f.names[+k]}` : ""}${label ? `, ${label}` : ""}`).join("; ")}`;
  /** The EQ figure's curve: 20 Hz to 20 kHz on a log axis, ±12 dB, one bell about an octave wide. */
  const EQ = { w: 320, h: 120, db: 12 };
  const eqX = (hz: number) => ((Math.log10(hz) - Math.log10(20)) / 3) * EQ.w;
  const eqY = (db: number) => EQ.h / 2 - (db / EQ.db) * (EQ.h / 2 - 8);
  function eqPath(f: Extract<LessonFigure, { kind: "eq" }>) {
    const c = Math.log10(f.band);
    return Array.from({ length: 97 }, (_, i) => {
      const lx = Math.log10(20) + (i / 96) * 3;
      const db = f.gainDb * Math.exp(-((lx - c) ** 2) / (2 * 0.15 ** 2));
      return `${i ? "L" : "M"}${(((lx - Math.log10(20)) / 3) * EQ.w).toFixed(1)},${eqY(db).toFixed(1)}`;
    }).join(" ");
  }
  const hzText = (hz: number) => (hz >= 1000 ? `${+(hz / 1000).toFixed(1)} kHz` : `${hz} Hz`);
  const eqLabel = (f: Extract<LessonFigure, { kind: "eq" }>) =>
    `EQ curve: ${hzText(f.band)} ${f.gainDb >= 0 ? "boosted" : "cut"} by ${Math.abs(f.gainDb)} dB, everything else flat`;
  const fretMarks = (m: { string: number; fret: number; label: string }[]): FretMark[] => m.map((x) => ({ ...x, role: "scale" }));
</script>

<svelte:window onkeydown={onKey} />

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2 text-ws-stage-ink" data-testid="lesson">
  <div class="flex items-center justify-between gap-3 text-sm text-ws-stage-ink/80">
    <p>{lessons[0].title}</p>
    <p><span aria-hidden="true">{at} / {total}</span><span class="sr-only">Screen {at} of {total}</span></p>
  </div>
  <!-- One bar for the whole sequence: chained item cards can run to dozens of screens. -->
  <div class="h-1.5 overflow-hidden rounded-full bg-ws-stage-ink/20" aria-hidden="true">
    <div class="h-full rounded-full bg-instr" style:width="{(at / total) * 100}%"></div>
  </div>

  <h2 bind:this={heading} tabindex="-1" class="font-display text-2xl font-semibold outline-none sm:text-3xl">{screen.title}</h2>
  <!-- On a phone the figure comes before the words (everything after it is order 1). -->
  <p class="max-w-prose text-base max-sm:order-1">{screen.text}</p>

  {#if figure?.kind === "groove"}
    {@const g = figure}
    <div class="mx-auto w-full max-w-md space-y-2" role="group" aria-label="Groove grid, {g.bars} {g.bars === 1 ? 'bar' : 'bars'}, {GROOVE_LANES.filter((l) => g.lanes[l.id]).map((l) => l.label).join(', ')}">
      <DictationGrid
        bars={g.bars}
        rows={GROOVE_LANES.map((l) => ({ id: l.id as string, label: l.label }))}
        perBeat={g.perBeat}
        beatsPerBar={4}
        barNumbers={g.barNumbers}
        marks={Object.fromEntries(GROOVE_LANES.map((l) => [l.id, Array.from({ length: g.bars * 4 * g.perBeat }, (_, i) => (g.lanes[l.id] ?? []).some((b) => Math.abs(b * g.perBeat - i) < 1e-6))]))}
      />
    </div>
  {:else if figure?.kind === "rhythm"}
    {@const r = figure}
    <div class="mx-auto w-full max-w-md space-y-2" role="group" aria-label="Rhythm grid, {r.bars} {r.bars === 1 ? 'bar' : 'bars'}, notes on {r.onsets.length ? r.onsets.map((b) => countName(b, r.perBeat, r.beatsPerBar)).join(', ') : 'no counts yet'}">
      <DictationGrid
        bars={r.bars}
        rows={[{ id: "hit", label: "" }]}
        perBeat={r.perBeat}
        beatsPerBar={r.beatsPerBar}
        marks={{ hit: Array.from({ length: r.bars * r.beatsPerBar * r.perBeat }, (_, i) => r.onsets.some((b) => Math.abs(b * r.perBeat - i) < 1e-6)) }}
      />
    </div>
  {:else if figure}
    <div class="mx-auto w-full max-w-md rounded-xl bg-ws-surface px-3 pb-1 text-ws-ink">
      {#if figure.kind === "signature"}
        <!-- Key signature only: the empty bar's rest is hidden, the staff enlarged and centred. -->
        <div class="sig">
          <Staff score={sigScore(figure)} maxHeight="14rem" time={false} fill="center" />
        </div>
        <p class="sr-only">{sigLabel(figure)}</p>
      {:else if figure.kind === "staff"}
        <div class="notes">
          <Staff score={staffScore(figure)} maxHeight="14rem" time={!!figure.meter} fill="center" revealLabels />
        </div>
        <p class="sr-only">{staffLabel(figure)}</p>
      {:else if figure.kind === "wheel"}
        <CircleOfFifths selected={figure.selected ?? null} marks={Object.fromEntries(Object.entries(figure.marks ?? {}).map(([k, v]) => [k, v as "lit"]))} numerals={false} label="The circle of fifths" />
      {:else if figure.kind === "keys"}
        <Piano low={figure.low} high={figure.high} marks={pianoMarks(figure.marks)} interactive={false} names="none" minKey={22} label="Piano keys" />
      {:else if figure.kind === "pads"}
        <Pads marks={padMarks(figure.marks)} names={figure.names ?? {}} keyHints={false} interactive={false} label={padLabel(figure)} />
      {:else if figure.kind === "eq"}
        {@const f = figure}
        <svg viewBox="-4 -20 {EQ.w + 8} {EQ.h + 42}" class="w-full py-2" role="img" aria-label={eqLabel(f)}>
          <!-- Flat line, frequency ticks, then the curve and its band. -->
          <line x1="0" x2={EQ.w} y1={eqY(0)} y2={eqY(0)} class="stroke-ws-line" stroke-width="1.5" stroke-dasharray="4 4" />
          {#each [100, 1000, 10000] as hz (hz)}
            <line x1={eqX(hz)} x2={eqX(hz)} y1="0" y2={EQ.h} class="stroke-ws-line" stroke-width="1" />
            <text x={eqX(hz)} y={EQ.h + 16} text-anchor="middle" class="fill-ws-soft text-[11px]">{hzText(hz)}</text>
          {/each}
          <path d="{eqPath(f)} L{EQ.w},{eqY(0)} L0,{eqY(0)} Z" class="fill-instr/20" />
          <path d={eqPath(f)} fill="none" class="stroke-instr-ink" stroke-width="2.5" stroke-linejoin="round" />
          <circle cx={eqX(f.band)} cy={eqY(f.gainDb)} r="5" class="fill-instr-ink" />
          <text x={eqX(f.band)} y={f.gainDb >= 0 ? eqY(f.gainDb) - 10 : eqY(f.gainDb) + 18} text-anchor={eqX(f.band) > EQ.w * 0.8 ? "end" : eqX(f.band) < EQ.w * 0.2 ? "start" : "middle"} class="fill-ws-ink text-[12px] font-semibold">{hzText(f.band)}, {f.gainDb > 0 ? "+" : ""}{f.gainDb} dB</text>
        </svg>
      {:else if figure.kind === "aerophone"}
        <AerophoneKeys midi={figure.midi} compact />
      {:else}
        {@const t = tuningFor(figure.instrument)}
        <Fretboard openStrings={figure.openStrings ?? t.openStrings} from={figure.from ?? 0} to={figure.to ?? 5} marks={fretMarks(figure.marks)} interactive={false} label="{figure.instrument} fretboard" />
      {/if}
    </div>
  {/if}

  {#if steps.length}
    <ol class="flex flex-col gap-1 text-base max-sm:order-1" aria-live="polite">
      {#each steps.slice(0, shown) as st, i (i)}<li class={i === shown - 1 ? "font-semibold" : "text-ws-stage-ink/80"}>{st.text}</li>{/each}
    </ol>
  {/if}

  <div class="flex flex-wrap gap-2 max-sm:order-1">
    {#if screen.sound}<button type="button" class={btn} onclick={() => play(screen.sound!)}><Volume2 class="size-4" aria-hidden="true" />Hear it</button>{/if}
    {#if shown > 0 && steps[shown - 1].sound}<button type="button" class={btn} onclick={() => play(steps[shown - 1].sound!)}><Volume2 class="size-4" aria-hidden="true" />Hear this step</button>{/if}
    {#each screen.options ?? [] as o (o.label)}
      <button type="button" class={btn} onclick={() => { play(o.sound); picked = o.figure ?? null; }}><Volume2 class="size-4" aria-hidden="true" />{o.label}</button>
    {/each}
  </div>

  <!-- Below lg the lesson's moves dock above the tab bar, where Start sits, so Next never hides under it. -->
  <div
    class="flex flex-wrap items-center gap-2 pt-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[var(--ws-dock-h,3.5rem)] max-lg:z-30 max-lg:flex-nowrap max-lg:border-t max-lg:border-ws-line max-lg:bg-ws-surface max-lg:px-4 max-lg:py-2 max-lg:text-ws-ink"
  >
    {#if !isFirst}<button type="button" class="{btn} max-lg:border max-lg:border-ws-line max-lg:bg-ws-surface max-lg:text-ws-ink" onclick={back}>Back</button>{/if}
    <button type="button" class="{btnPrimary} max-lg:min-h-12 max-lg:flex-1 max-lg:text-base" onclick={next}>{isLast ? "Start the quiz" : "Next"}</button>
    {#if li === 0 && si === 0}<button type="button" class="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-ws-soft underline underline-offset-4 hover:text-ws-ink lg:px-4 lg:text-ws-stage-ink/80 lg:hover:text-ws-stage-ink" onclick={onskip}>Skip, I know this</button>{/if}
    <span class="ml-auto hidden text-xs text-ws-stage-ink/70 lg:inline">Arrow keys move.</span>
  </div>
</div>

<style>
  .sig :global(.vf-stavenote) {
    display: none;
  }
  .sig {
    zoom: 1.5;
  }
  .notes {
    zoom: 1.5;
  }
</style>
