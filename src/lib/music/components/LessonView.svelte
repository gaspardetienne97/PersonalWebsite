<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // One lesson screen at a time, in place of the drill's stage, inside the drill session (the session's HUD
  // carries Close and "Skip, I know this"). The figure leads, then the words; Back and Next dock at the
  // bottom of the screen, outside the text, so nothing reads under a bar. Sounds play on tap only.
  import { onDestroy, tick, type Snippet } from "svelte";
  import type { Score } from "@repo/music-core";
  import type { Lesson, LessonFigure, LessonSound } from "@repo/music-core/lessons/types";
  import { audio } from "../runtime";
  import CircleOfFifths from "./CircleOfFifths.svelte";
  import Piano from "./Piano.svelte";
  import Fretboard, { type FretMark } from "./Fretboard.svelte";
  import Pads from "./Pads.svelte";
  import AerophoneKeys from "./AerophoneKeys.svelte";
  import { GROOVE_LANES } from "@repo/music-core/content/rhythm";
  import { countName } from "@repo/music-core/lessons/count";
  import Staff from "../notation/Staff.svelte";
  import { noteName } from "@repo/music-core";
  import { chord, note } from "#lib/music/names.svelte.ts";
  import { tuningFor } from "../drills/guitar/instrument.svelte";
  import { btn, btnPrimary } from "./ui";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import { formatNumber } from "@repo/i18n/format";
  import { INSTRUMENT_LABEL } from "../bench.svelte";

  const clefName = (clef: "treble" | "bass") => (clef === "bass" ? m.music_shell_lesson_clef_bass() : m.music_shell_lesson_clef_treble());

  /** `beforeNext`: drawn in the dock just before Next (the session's "More below", while there is more). */
  let { lessons, onfinish, onskip, beforeNext }: { lessons: Lesson[]; onfinish: () => void; onskip?: () => void; beforeNext?: Snippet } = $props();

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
    stopSweep();
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

  /** While a sound plays over a rhythm or groove grid: how far through the grid it is (0 to 1), else null. */
  let sweep = $state<number | null>(null);
  let sweepFrame = 0;
  function stopSweep() {
    cancelAnimationFrame(sweepFrame);
    sweep = null;
  }
  /** Sweep a playhead across the grid figure in time with the sound. The figure counts in beats and the sound in
   *  seconds, both from the grid's start, so the last note against the last onset gives the tempo. */
  function startSweep(f: LessonFigure | null | undefined, s: LessonSound) {
    if (!s.notes.length || (f?.kind !== "rhythm" && f?.kind !== "groove")) return;
    const onsets = f.kind === "rhythm" ? f.onsets : Object.values(f.lanes).flat();
    const lastOnset = Math.max(0, ...onsets);
    const lastAt = Math.max(...s.notes.map((n) => n.at));
    const secPerBeat = lastOnset > 0 && lastAt > 0 ? lastAt / lastOnset : 0.5;
    const ms = f.bars * (f.kind === "rhythm" ? f.beatsPerBar : 4) * secPerBeat * 1000;
    const t0 = performance.now();
    const frame = () => {
      const x = (performance.now() - t0) / ms;
      if (x >= 1) return void (sweep = null);
      sweep = x;
      sweepFrame = requestAnimationFrame(frame);
    };
    frame();
  }

  function play(s: LessonSound, shows: LessonFigure | null | undefined = figure) {
    halt();
    if (s.effect) return void playEffect(s.effect);
    const mine = generation;
    void audio
      .unlock()
      .then(() => {
        // A move, another tap or the unmount before the audio was ready drops this tap.
        if (destroyed || mine !== generation) return;
        startSweep(shows, s);
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
      title: m.music_shell_lesson_key_signature(),
      bpm: 60,
      keyFifths: Math.sign(f.fifths) * n,
      meter: { beats: 4, beatUnit: 4 },
      voices: [{ id: "v", name: "Signature", clef: f.clef, notes: [] }],
      lengthBeats: 4,
    };
  }
  const sigLabel = (f: Extract<LessonFigure, { kind: "signature" }>) => {
    const n = f.reveal ?? Math.abs(f.fifths);
    return (f.fifths < 0 ? m.music_shell_lesson_sig_flat : m.music_shell_lesson_sig_sharp)({ clef: clefName(f.clef), count: n });
  };
  /** The staff figure as a one-bar score: its notes one after another, a rest where `midi` is null. */
  function staffScore(f: Extract<LessonFigure, { kind: "staff" }>): Score {
    let at = 0;
    const notes = f.notes.flatMap((n) => {
      const out = n.midi === null ? [] : [{ midi: n.midi, startBeat: at, durationBeats: n.beats }];
      at += n.beats;
      return out;
    });
    const chords = f.chords?.map((c, i, all) => ({ symbol: c.symbol, startBeat: c.beat, durationBeats: (all[i + 1]?.beat ?? at) - c.beat }));
    return {
      id: `lesson-staff-${f.clef}-${f.fifths ?? 0}-${f.notes.map((n) => `${n.midi}x${n.beats}`).join("_")}${f.chords?.map((c) => `-${c.symbol}@${c.beat}`).join("") ?? ""}`,
      ...(chords ? { chords } : {}),
      title: m.music_shell_shell_lesson(),
      bpm: 60,
      keyFifths: f.fifths ?? 0,
      meter: f.meter ?? { beats: at, beatUnit: 4 },
      voices: [{ id: "v", name: "Notes", clef: f.clef, notes }],
      lengthBeats: at,
    };
  }
  const staffLabel = (f: Extract<LessonFigure, { kind: "staff" }>) => {
    const words = {
      clef: clefName(f.clef),
      count: Math.abs(f.fifths ?? 0),
      notes: f.notes.map((n) => (n.midi === null ? m.music_shell_lesson_rest() : note(noteName(n.midi, (f.fifths ?? 0) < 0 ? "flat" : "sharp")))).join(", "),
    };
    const staff = !f.fifths ? m.music_shell_lesson_staff(words) : (f.fifths < 0 ? m.music_shell_lesson_staff_flat : m.music_shell_lesson_staff_sharp)(words);
    return f.chords?.length ? m.music_shell_lesson_staff_over({ chords: [...new Set(f.chords.map((c) => chord(c.symbol)))].join(", "), staff }) : staff;
  };
  const pianoMarks = (marks: Record<number, string>) => Object.fromEntries(Object.entries(marks).map(([k, label]) => [k, { target: true, label }]));
  const padMarks = (marks: Record<number, string>) => Object.fromEntries(Object.entries(marks).map(([k, label]) => [k, { target: true, label }]));
  const padLabel = (f: Extract<LessonFigure, { kind: "pads" }>) =>
    m.music_shell_lesson_pads({ pads: Object.entries(f.marks).map(([k, label]) => `A${String(+k - 35).padStart(2, "0")}${f.names?.[+k] ? ` ${f.names[+k]}` : ""}${label ? `, ${label}` : ""}`).join("; ") });
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
  const hzText = (hz: number) => (hz >= 1000 ? `${formatNumber(+(hz / 1000).toFixed(1))} kHz` : `${formatNumber(hz)} Hz`);
  const eqLabel = (f: Extract<LessonFigure, { kind: "eq" }>) =>
    (f.gainDb >= 0 ? m.music_shell_lesson_eq_boost : m.music_shell_lesson_eq_cut)({ freq: hzText(f.band), db: formatNumber(Math.abs(f.gainDb)) });
  const fretMarks = (m: { string: number; fret: number; label: string }[]): FretMark[] => m.map((x) => ({ ...x, role: "scale" }));

  /** The counts of one beat, as a player says them; the beat's own number goes in the first. */
  const COUNTS = { 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] } as const;
  const hitAt = (beats: number[] | undefined, i: number, perBeat: number) => (beats ?? []).some((b) => Math.abs(b * perBeat - i) < 1e-6);

  /** Letter names under a staff sit on one line per system (VexFlow hangs each below its own note). */
  function baseline(node: HTMLElement) {
    const align = () => {
      const texts = [...node.querySelectorAll<SVGTextElement>(".vf-annotation text")];
      const ys = texts.map((t) => Number(t.getAttribute("y") ?? 0));
      texts.forEach((t, i) => {
        // The lowest label within reach (the same system), never one from the system below.
        const y = Math.max(...ys.filter((v) => Math.abs(v - ys[i]) < 40));
        if (ys[i] !== y) t.setAttribute("y", String(y));
      });
    };
    const watch = new MutationObserver(align);
    watch.observe(node, { childList: true, subtree: true });
    align();
    return { destroy: () => watch.disconnect() };
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 pt-2 text-ws-ink" data-testid="lesson">
  <div class="flex items-center justify-between gap-3 text-sm text-ws-soft">
    <p>{lessons[0].title}</p>
    <p><span aria-hidden="true">{at} / {total}</span><span class="sr-only">{m.music_shell_lesson_screen({ at, total })}</span></p>
  </div>
  <!-- One bar for the whole sequence: chained item cards can run to dozens of screens. -->
  <div class="h-1.5 overflow-hidden rounded-full bg-ws-raised" aria-hidden="true">
    <div class="h-full rounded-full bg-instr" style:width="{(at / total) * 100}%"></div>
  </div>

  <h2 bind:this={heading} tabindex="-1" class="font-display text-2xl font-semibold outline-none sm:text-3xl">{screen.title}</h2>

  {#if figure?.kind === "groove"}
    {@const g = figure}
    <!-- One row per drum across the whole bar, one bar a block, on the dark stage panel. -->
    <div class="stage mx-auto w-full rounded-2xl p-3 sm:p-4" role="img" aria-label={m.music_shell_lesson_groove_grid({ bars: g.bars, lanes: GROOVE_LANES.filter((l) => g.lanes[l.id]?.length).map((l) => m.music_shell_lesson_groove_lane({ drum: l.label, counts: g.lanes[l.id]!.map((b) => countName(b, g.perBeat, 4)).join(", ") })).join("; ") })}>
      {@render beatGrid(g.bars, g.perBeat, 4, GROOVE_LANES.map((l) => ({ label: l.label, beats: g.lanes[l.id] })), g.barNumbers)}
    </div>
  {:else if figure?.kind === "rhythm"}
    {@const r = figure}
    <div class="stage mx-auto w-full rounded-2xl p-3 sm:p-4" role="img" aria-label={m.music_shell_lesson_rhythm_grid({ bars: r.bars, counts: r.onsets.length ? r.onsets.map((b) => countName(b, r.perBeat, r.beatsPerBar)).join(", ") : m.music_shell_lesson_no_counts() })}>
      {@render beatGrid(r.bars, r.perBeat, r.beatsPerBar, [{ label: "", beats: r.onsets }])}
    </div>
  {:else if figure}
    <!-- A long line (two bars of eighths) gets the column's full width at its own size, and room for a second system on a phone. -->
    {@const wide = figure.kind === "staff" && figure.notes.length > 8}
    {@const paper = figure.kind === "staff" || figure.kind === "signature"}
    <!-- Notation on its own paper card; every other figure is drawn on the dark stage panel. -->
    <div class="mx-auto w-full {wide ? '' : 'max-w-md'} {paper ? 'rounded-xl border border-ws-line bg-ws-surface px-3 pb-1 text-ws-ink' : 'stage rounded-2xl p-4'}">
      {#if figure.kind === "signature"}
        <!-- Key signature only: the empty bar's rest is hidden, the staff enlarged and centred. -->
        <div class="sig">
          <Staff score={sigScore(figure)} maxHeight="14rem" time={false} fill="center" />
        </div>
        <p class="sr-only">{sigLabel(figure)}</p>
      {:else if figure.kind === "staff"}
        <div class="notes" class:wide use:baseline>
          <Staff score={staffScore(figure)} maxHeight={wide ? "20rem" : "14rem"} time={!!figure.meter} fill={wide ? true : "center"} revealLabels />
        </div>
        <p class="sr-only">{staffLabel(figure)}</p>
      {:else if figure.kind === "wheel"}
        <CircleOfFifths selected={figure.selected ?? null} marks={Object.fromEntries(Object.entries(figure.marks ?? {}).map(([k, v]) => [k, v as "lit"]))} numerals={false} label={m.music_shell_lesson_circle()} />
      {:else if figure.kind === "keys"}
        <Piano low={figure.low} high={figure.high} marks={pianoMarks(figure.marks)} interactive={false} names="none" minKey={22} label={m.music_shell_lesson_piano_keys()} />
      {:else if figure.kind === "pads"}
        <Pads marks={padMarks(figure.marks)} names={figure.names ?? {}} keyHints={false} interactive={false} label={padLabel(figure)} />
      {:else if figure.kind === "eq"}
        {@const f = figure}
        <svg viewBox="-4 -20 {EQ.w + 8} {EQ.h + 42}" class="w-full py-2" role="img" aria-label={eqLabel(f)}>
          <!-- Flat line, frequency ticks, then the curve and its band. -->
          <line x1="0" x2={EQ.w} y1={eqY(0)} y2={eqY(0)} class="stroke-ws-stage-ink/30" stroke-width="1.5" stroke-dasharray="4 4" />
          {#each [100, 1000, 10000] as hz (hz)}
            <line x1={eqX(hz)} x2={eqX(hz)} y1="0" y2={EQ.h} class="stroke-ws-stage-ink/15" stroke-width="1" />
            <text x={eqX(hz)} y={EQ.h + 16} text-anchor="middle" class="fill-ws-stage-soft text-[13px]">{hzText(hz)}</text>
          {/each}
          <path d="{eqPath(f)} L{EQ.w},{eqY(0)} L0,{eqY(0)} Z" class="fill-instr/20" />
          <path d={eqPath(f)} fill="none" class="stroke-instr" stroke-width="2.5" stroke-linejoin="round" />
          <circle cx={eqX(f.band)} cy={eqY(f.gainDb)} r="5" class="fill-instr" />
          <text x={eqX(f.band)} y={f.gainDb >= 0 ? eqY(f.gainDb) - 10 : eqY(f.gainDb) + 18} text-anchor={eqX(f.band) > EQ.w * 0.8 ? "end" : eqX(f.band) < EQ.w * 0.2 ? "start" : "middle"} class="fill-ws-stage-ink text-[13px] font-semibold">{hzText(f.band)}, {f.gainDb > 0 ? "+" : ""}{f.gainDb} dB</text>
        </svg>
      {:else if figure.kind === "aerophone"}
        <AerophoneKeys midi={figure.midi} compact />
      {:else}
        {@const t = tuningFor(figure.instrument)}
        <Fretboard openStrings={figure.openStrings ?? t.openStrings} from={figure.from ?? 0} to={figure.to ?? 5} marks={fretMarks(figure.marks)} interactive={false} label={m.music_shell_lesson_fretboard({ instrument: INSTRUMENT_LABEL[figure.instrument].toLowerCase() })} />
      {/if}
    </div>
  {/if}

  <!-- The words after the figure, as a player reads a diagram and then its caption. -->
  <p class="max-w-prose text-base leading-relaxed">{screen.text}</p>

  {#if steps.length}
    <ol class="flex flex-col gap-1 text-base" aria-live="polite">
      {#each steps.slice(0, shown) as st, i (i)}<li class={i === shown - 1 ? "font-semibold" : "text-ws-soft"}>{st.text}</li>{/each}
    </ol>
  {/if}

  <div class="flex flex-wrap gap-2">
    {#if screen.sound}<button type="button" class={btn} onclick={() => play(screen.sound!)}><Volume2 class="size-4" aria-hidden="true" />{m.music_shell_shell_hear_it()}</button>{/if}
    {#if shown > 0 && steps[shown - 1].sound}<button type="button" class={btn} onclick={() => play(steps[shown - 1].sound!)}><Volume2 class="size-4" aria-hidden="true" />{m.music_shell_lesson_hear_step()}</button>{/if}
    {#each screen.options ?? [] as o (o.label)}
      <!-- An option relights the figure with its own (the keys of that voicing) while it plays. -->
      <button type="button" class="{btn} aria-pressed:border-instr aria-pressed:bg-instr-wash" aria-pressed={!!o.figure && picked === o.figure} onclick={() => { picked = o.figure ?? null; play(o.sound, o.figure ?? figure); }}><Volume2 class="size-4" aria-hidden="true" />{o.label}</button>
    {/each}
  </div>

  <!-- The moves dock at the bottom of the screen (the session's dock), so Next sits in the thumb zone and
       the text scrolls clear of it. -->
  <div data-lesson-dock class="lesson-dock sticky bottom-0 z-20 -mx-4 mt-auto flex items-center gap-2 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:mx-0 sm:px-0">
    {#if !isFirst}<button type="button" class="{btn} min-h-12 px-4 text-base sm:px-5" onclick={back}>{m.music_shell_lesson_back()}</button>{/if}
    {#if onskip && !isLast}<button type="button" class="{btn} min-h-12 px-4 text-base max-sm:text-sm" onclick={onskip}>{m.music_shell_lesson_skip()}</button>{/if}
    <span class="ml-auto hidden text-sm text-ws-soft lg:inline">{m.music_shell_lesson_arrows()}</span>
    {@render beforeNext?.()}
    <button type="button" class="{btnPrimary} min-h-12 flex-1 text-base sm:flex-none sm:px-8" onclick={next} aria-keyshortcuts="ArrowRight">{isLast ? m.music_shell_lesson_start_quiz() : m.music_shell_lesson_next()}</button>
  </div>
</div>

<!-- A read-only count grid: the counts on top (the beat numbers bold, the counts between them lighter), then one
     row per drum (or one for a rhythm) across each bar. Every cell is the same size; a hit is a filled dot, an empty
     slot a ring. While Hear it plays a playhead crosses the grid. -->
{#snippet beatGrid(bars: number, perBeat: 2 | 3 | 4, beatsPerBar: number, rows: { label: string; beats?: number[] }[], barNumbers?: number[])}
  {@const cells = beatsPerBar * perBeat}
  {@const labelled = rows.some((x) => x.label)}
  <div class="flex flex-col gap-3" aria-hidden="true">
    {#each Array.from({ length: bars }, (_, b) => b) as bar (bar)}
      <div>
        {#if bars > 1}<p class="mb-1 text-[13px] font-semibold text-ws-stage-soft">{m.music_shell_lesson_bar({ bar: barNumbers?.[bar] ?? bar + 1 })}</p>{/if}
        <div class="relative grid items-center gap-y-1" style:grid-template-columns="{labelled ? '3.25rem ' : ''}repeat({cells}, minmax(0, 1fr))">
          {#if labelled}<span></span>{/if}
          {#each Array.from({ length: cells }, (_, i) => i) as i (i)}
            <span class="text-center text-[13px] leading-5 tnum {i % perBeat ? 'text-ws-stage-soft' : 'font-bold text-ws-stage-ink'}">{i % perBeat ? COUNTS[perBeat][i % perBeat] : Math.floor(i / perBeat) + 1}</span>
          {/each}
          {#each rows as row (row.label)}
            {#if labelled}<span class="truncate pr-1 text-[13px] font-semibold text-ws-stage-soft">{row.label}</span>{/if}
            {#each Array.from({ length: cells }, (_, i) => i) as i (i)}
              {@const on = hitAt(row.beats, bar * cells + i, perBeat)}
              <span class="cell grid h-8 place-items-center">
                {#if on}<span class="size-4 rounded-full bg-instr"></span>{:else}<span class="size-2.5 rounded-full border-[1.5px] border-ws-stage-soft"></span>{/if}
              </span>
            {/each}
          {/each}
          {#if sweep !== null && Math.floor(sweep * bars) === bar}
            {@const f = sweep * bars - bar}
            <span class="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-ws-stage-ink" style:left={labelled ? `calc(3.25rem + (100% - 3.25rem) * ${f})` : `${f * 100}%`}></span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/snippet}

<style>
  /* The moves: a bar in the page theme on a phone (contract S1, as ws-bar ws-bar-bottom); from sm up, where
     the lesson is a column in the middle of the screen, the page itself. */
  .lesson-dock {
    background: var(--ws-bar);
    border-top: 1px solid var(--ws-line);
    box-shadow: var(--ws-bar-shadow);
  }
  @media (min-width: 40rem) {
    .lesson-dock {
      background: var(--ws-bg);
      border-top-color: transparent;
      box-shadow: none;
    }
  }
  /* Every cell the same tile, on the beat or between: the dot inside says hit or not. */
  .cell {
    border-radius: 0.375rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 7%, transparent);
  }
  .sig :global(.vf-stavenote) {
    display: none;
  }
  .sig {
    zoom: 1.5;
  }
  .notes {
    zoom: 1.5;
  }
  .notes.wide {
    zoom: 1;
  }
</style>
