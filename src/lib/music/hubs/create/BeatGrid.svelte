<script lang="ts">
  // The beat's editor: a step sequencer of one to eight bars, rows are drum
  // voices keyed by MIDI note (a row with a kit sample plays the sample). The
  // song bar plays it; the tracks list mutes it and picks its kit.
  import Play from "lucide-svelte/icons/play";
  import Sliders from "lucide-svelte/icons/sliders-horizontal";
  import * as Popover from "@repo/ui/popover";
  import Square from "lucide-svelte/icons/square";
  import Volume from "lucide-svelte/icons/volume-2";
  import Drum from "lucide-svelte/icons/drum";
  import type { Snippet } from "svelte";
  import { audio } from "$lib/music/runtime";
  import { btnStage } from "$lib/music/components/ui";
  import { barCells } from "./pattern";
  import { padLabel, sampleName } from "./kits";
  import { kits } from "./kitStore.svelte";
  import { session } from "./session.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import {
    addBar,
    barsOf,
    DEFAULT_ROWS,
    fromPreset,
    hitCount,
    isOn,
    PRESETS,
    STEPS,
    stepsOf,
    toggleStep,
    type BeatRow,
  } from "./pattern";

  let { announce, extra }: { announce: (msg: string) => void; extra?: Snippet } = $props();

  const pattern = $derived(session.pattern);
  const playhead = $derived(session.beatStep);
  const total = $derived(stepsOf(pattern));
  let box: HTMLDivElement | undefined = $state();

  // Turn the page when the playhead reaches the edge of the view (the row
  // names stay pinned on the left, so they are left out of it).
  $effect(() => {
    const s = playhead;
    const b = box;
    if (!b || s < 0 || b.scrollWidth <= b.clientWidth) return;
    const cell = b.querySelector<HTMLElement>(`thead th[data-step="${s}"]`);
    const head = b.querySelector<HTMLElement>("thead th.rowhead");
    if (!cell || !head) return;
    const left = cell.getBoundingClientRect().left - b.getBoundingClientRect().left;
    const pinned = head.offsetWidth;
    if (left < pinned || left + cell.offsetWidth > b.clientWidth)
      b.scrollLeft += left - pinned - 4; // one jump, as in the roll
  });

  const soloing = $derived(session.playing && session.only === "beat");
  async function playGroove() {
    const ok = await session.play("beat");
    if (!ok) return announce("Sound is blocked. Tap for sound in the strip above, then play again.");
    announce(session.playing ? `Playing the beat on its own at ${session.bpm} BPM.` : "Stopped.");
  }

  const kit = $derived(kits.kit);
  const kitNotes = $derived(kits.notes);
  const rows = $derived.by((): (BeatRow & { sample?: string })[] => {
    const base = DEFAULT_ROWS.map((r) => r.midi);
    const used = [...Object.keys(pattern.steps).map(Number), ...(pattern.live ?? []).map((h) => h.midi)];
    const extra = [...new Set([...kitNotes, ...used])].filter((n) => !base.includes(n)).sort((a, b) => a - b);
    return [...DEFAULT_ROWS, ...extra.map((midi) => ({ midi, name: padLabel(midi) }))].map((r) => {
      const p = kit?.pads.find((x) => x.note === r.midi);
      return { ...r, sample: kit && p ? sampleName(kit, p.soft ?? p.hard) : undefined };
    });
  });

  /** Hits recorded live and kept as played, shown on the step they fall nearest. */
  const liveAt = $derived(new Set((pattern.live ?? []).map((h) => `${h.midi}:${Math.round(h.beat * 4) % total}`)));
  function toggle(row: BeatRow, step: number) {
    const was = isOn(pattern, row.midi, step);
    session.setPattern(toggleStep(pattern, row.midi, step));
    if (!session.playing && !was) void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  function audition(row: BeatRow) {
    void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  const bars = (n: number) => `${n} ${n === 1 ? "bar" : "bars"}`;
  /** The row sounding on the playhead's step: its name lights with the hit. */
  const rowHit = (midi: number) => playhead >= 0 && isOn(pattern, midi, playhead);

  // The bar overview: every bar of the song, the beat's own bars and the
  // repeats that fill the rest, the one playing filled. A tap shows that bar.
  const overview = $derived(barCells(barsOf(pattern), session.loopBars, session.only === null || session.only === "beat" ? session.beat : -1));
  const showBar = (beatBar: number) => showStep(beatBar * STEPS);
  function showStep(step: number) {
    const b = box;
    const cell = b?.querySelector<HTMLElement>(`thead th[data-step="${step}"]`);
    const head = b?.querySelector<HTMLElement>("thead th.rowhead");
    if (!b || !cell || !head) return;
    b.scrollTo({ left: b.scrollLeft + cell.getBoundingClientRect().left - b.getBoundingClientRect().left - head.offsetWidth - 4 });
  }
  // More steps to the right than fit: the edge fades so the cut reads as "scroll".
  let more = $state(false);
  // On a phone the grid shows eight steps (half a bar) a page; dots under it name the page.
  const PAGE = 8;
  let page = $state(0);
  function measure() {
    more = !!box && box.scrollLeft + box.clientWidth < box.scrollWidth - 2;
    const head = box?.querySelector<HTMLElement>("thead th.rowhead");
    const w = box && head ? box.clientWidth - head.offsetWidth : 0;
    page = w > 0 ? Math.round(box!.scrollLeft / w) : 0;
  }
  const pages = $derived(Math.ceil(total / PAGE));
  /** Bar 2 repeating bar 1 gets its own copy, to change on its own. */
  function makeUnique() {
    session.setPattern(addBar(pattern));
    announce(`Bar ${barsOf(session.pattern)} is its own now, a copy to change.`);
  }
  const firstRepeat = $derived(overview.find((c) => c.repeat));
  /** A phone's row name: the pad for a sample, else the voice's full name (it wraps to two short lines). */
  const tag = (row: BeatRow & { sample?: string }) => (row.sample ? padLabel(row.midi) : row.name);
  $effect(() => {
    void total;
    measure();
  });

  function usePreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    session.setPattern({ ...fromPreset(p, session.bpm), id: pattern.id });
    announce(`${p.name}: ${hitCount(session.pattern)} hits over ${bars(p.bars)}. Change anything you like.`);
  }

  // Arrow keys walk the grid.
  function gridKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    const r = Number(el.dataset.row);
    const st = Number(el.dataset.step);
    if (!Number.isFinite(r) || !Number.isFinite(st)) return;
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!move) return;
    e.preventDefault();
    const nr = (r + move[0] + rows.length) % rows.length;
    const ns = (st + move[1] + total) % total;
    (el.closest("[data-grid]")?.querySelector(`[data-row="${nr}"][data-step="${ns}"]`) as HTMLElement | null)?.focus();
  }

  const field = "min-h-11 rounded-lg border border-ws-stage-ink/15 bg-ws-stage-ink/8 px-3 text-sm text-ws-stage-ink";
</script>

<svelte:window onresize={measure} />

<section class="stage relative overflow-hidden rounded-3xl p-3 sm:p-5" aria-label="Beat editor">
    <div class="mb-3 flex items-center gap-2 sm:gap-3">
      <!-- The song bar's Play is the main transport; this plays the beat alone. -->
      <button type="button" class="{btnStage} shrink-0" aria-pressed={soloing} onclick={playGroove}>
        {#if soloing}<Square class="size-4 fill-current" aria-hidden="true" />Stop{:else}<Play class="size-4 fill-current" aria-hidden="true" />Play beat{/if}
      </button>
      <h2 class="min-w-0 flex-1 truncate font-display text-xl font-semibold">{pattern.name}</h2>
      <!-- One menu for what the beat sounds like: presets, sample kits, the live pads. -->
      <Popover.Root>
        <Popover.Trigger class="{btnStage} shrink-0"><Sliders class="size-4" aria-hidden="true" />Sounds</Popover.Trigger>
        <Popover.Content align="end" class="flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border-ws-line bg-ws-surface p-3 text-ws-ink shadow-lg">
          <div class="flex flex-col gap-1 text-sm">
            <span class="font-semibold">Start from a preset</span>
            <Picker class="w-full" action label="Start from a preset" placeholder="Pick a groove" options={PRESETS.map((p) => ({ value: p.id, label: p.name, group: p.group }))} onchange={usePreset} />
            <span class="text-[13px] text-ws-soft">Replaces this beat's hits.</span>
          </div>
          <div class="flex flex-wrap gap-2 border-t border-ws-line pt-3">
            {@render extra?.()}
            <a class="inline-flex min-h-11 items-center gap-2 rounded-full border border-ws-line px-4 text-sm font-semibold hover:bg-ws-raised" href="/music/create/kits"><Drum class="size-4" aria-hidden="true" />Sample kits</a>
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>

    <!-- Bar overview: the song's bars, the one playing filled, repeats dashed. -->
    <div class="mb-2 flex gap-1" role="group" aria-label="Bars of the song">
      {#each overview as c (c.bar)}
        <button
          type="button"
          class="bar-cell"
          data-repeat={c.repeat || undefined}
          data-now={c.now || undefined}
          aria-current={c.now ? "step" : undefined}
          aria-label="Bar {c.bar + 1}{c.repeat ? `, repeats beat bar ${c.beatBar + 1}` : ''}{c.now ? ', playing' : ''}"
          onclick={() => showBar(c.beatBar)}
        ><span>{c.bar + 1}{#if c.repeat && overview.length <= 2}<span class="font-normal sm:hidden" aria-hidden="true">, repeats {c.beatBar + 1}</span>{/if}</span></button>
      {/each}
      <!-- On a phone the repeat is named in its cell and Make unique sits on this row, so the whole grid fits above the tab bar. -->
      {#if firstRepeat}<button type="button" class="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-ws-stage-ink underline underline-offset-4 sm:hidden" onclick={makeUnique}>Make unique</button>{/if}
    </div>
    {#if firstRepeat}
      <p class="mb-2 flex flex-wrap items-center gap-x-3 text-sm text-ws-stage-soft max-sm:hidden">
        <span>Bar {firstRepeat.bar + 1} copies bar {firstRepeat.beatBar + 1}.</span>
        <button type="button" class="inline-flex min-h-11 items-center font-semibold text-ws-stage-ink underline underline-offset-4" onclick={makeUnique} aria-label="Make unique">Edit bar {firstRepeat.bar + 1} on its own</button>
      </p>
    {/if}

    <div bind:this={box} class="relative overflow-x-auto scroll-pl-28 pb-1" class:more data-grid aria-describedby="beat-keys" onscroll={measure}>
      <table class="grid-table">
        <thead>
          <tr>
            <th scope="col" class="rowhead"><span class="sr-only">Voice</span></th>
            {#each Array.from({ length: total }, (_, i) => i) as s (s)}
              <th scope="col" class="stephead" class:beat={s % 4 === 0} class:bar={s % STEPS === 0} data-step={s} data-now={playhead === s || undefined}>
                <span aria-hidden="true">{s % 4 === 0 ? (s % STEPS) / 4 + 1 : ""}{#if s % STEPS === 0 && total > STEPS}<span class="barnum">bar {s / STEPS + 1}</span>{/if}</span>
                <span class="sr-only">Bar {Math.floor(s / STEPS) + 1}, step {(s % STEPS) + 1}</span>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, r (row.midi)}
            <tr>
              <th scope="row" class="rowhead" class:playing={rowHit(row.midi)}>
                <button type="button" class="rowlabel" onclick={() => audition(row)} aria-label="Hear {row.sample ?? row.name}">
                  <span class="flex max-w-full items-center gap-1"><span class="font-semibold break-words sm:hidden" aria-hidden="true">{tag(row)}</span><span class="truncate font-semibold max-sm:hidden">{row.sample ?? row.name}</span><Volume class="size-3 shrink-0 opacity-60 max-sm:hidden" aria-hidden="true" /></span>
                  {#if row.sample}<span class="text-[0.8125rem] text-ws-stage-soft max-sm:hidden">Sample on {padLabel(row.midi)}</span>{/if}
                </button>
              </th>
              {#each Array.from({ length: total }, (_, i) => i) as s (s)}
                {@const on = isOn(pattern, row.midi, s)}
                <td class:gap={s % 4 === 3 && s < total - 1} class:bargap={s % STEPS === STEPS - 1 && s < total - 1}>
                  <button
                    type="button"
                    class="step"
                    class:alt={Math.floor(s / 4) % 2 === 1}
                    class:accent={s % 4 === 0}
                    data-on={on || undefined}
                    data-live={liveAt.has(`${row.midi}:${s}`) || undefined}
                    data-now={playhead === s || undefined}
                    data-row={r}
                    data-step={s}
                    aria-pressed={on}
                    aria-label="{row.sample ? `${row.sample} on ${padLabel(row.midi)}` : row.name}, bar {Math.floor(s / STEPS) + 1} step {(s % STEPS) + 1}"
                    onclick={() => toggle(row, s)}
                    onkeydown={gridKey}
                  ></button>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if pages > 1}
      <div class="flex justify-center sm:hidden" role="group" aria-label="Grid pages">
        {#each Array.from({ length: pages }, (_, i) => i) as p (p)}
          <button type="button" class="grid size-11 place-items-center" aria-label="Bar {Math.floor((p * PAGE) / STEPS) + 1}, steps {((p * PAGE) % STEPS) + 1} to {((p * PAGE) % STEPS) + PAGE}" aria-current={p === page ? "true" : undefined} onclick={() => showStep(p * PAGE)}>
            <span class="block h-2 rounded-full {p === page ? 'w-5 bg-instr' : 'w-2 bg-ws-stage-ink/35'}"></span>
          </button>
        {/each}
      </div>
    {/if}
    <!-- A phone leaves the summary out so the grid ends above the tab bar; the steps say the same. -->
    <p class="mt-3 text-sm text-ws-stage-ink/85 max-sm:hidden" data-playhead={playhead}>
      {hitCount(pattern)} hits over {bars(barsOf(pattern))}{barsOf(pattern) < session.bars ? `, repeating to fill the song's ${session.bars} bars` : ""}. Rows play {kit && kitNotes.size ? `the samples in ${kit.name}, built-in drums elsewhere` : "the built-in drums"}. Tap a step to add or remove a hit.
    </p>
    <p id="beat-keys" class="sr-only">Arrow keys move around the grid, Enter or Space toggles a step.</p>
  </section>

<style>
  .grid-table {
    border-collapse: separate;
    border-spacing: 0.25rem;
    margin-inline: -0.25rem;
  }
  .rowhead {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--ws-stage);
    min-width: 6.5rem;
    max-width: 9rem;
    padding: 0;
    text-align: left;
  }
  .rowlabel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.2rem 0.5rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    line-height: 1.15;
    color: var(--ws-stage-ink);
    text-align: left;
  }
  .rowlabel:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
  }
  .rowhead.playing .rowlabel {
    color: var(--instr);
  }
  .stephead {
    height: 1.4rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ws-stage-soft);
    text-align: left;
    padding-left: 0.2rem;
    border-radius: 0.375rem 0.375rem 0 0;
  }
  /* The playhead: a bright column, its head filled. */
  .stephead[data-now] {
    background: var(--instr);
    color: var(--ws-stage);
  }
  td {
    padding: 0;
  }
  td.gap {
    padding-right: 0.35rem;
  }
  td.bargap {
    padding-right: 0.9rem;
  }
  .stephead.bar {
    color: var(--ws-stage-ink);
  }
  .barnum {
    margin-left: 0.3rem;
    font-weight: 500;
    color: var(--ws-stage-soft);
  }
  .stephead[data-now] .barnum {
    color: inherit;
  }
  /* Beat groups alternate in shade; the first step of each beat is a touch brighter. */
  .step {
    display: block;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.5rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 17%, transparent);
    box-shadow: inset 0 -2px 0 #0005;
    transition:
      background 60ms,
      transform 60ms;
  }
  .step.alt {
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
  }
  .step.accent {
    background: color-mix(in oklch, var(--ws-stage-ink) 24%, transparent);
  }
  .step.alt.accent {
    background: color-mix(in oklch, var(--ws-stage-ink) 15%, transparent);
  }
  /* A beat divider: a thin rule in the gap after every fourth step. */
  td.gap,
  td.bargap {
    background: linear-gradient(var(--ws-stage-soft), var(--ws-stage-soft)) right 0.1rem center / 1px 70% no-repeat;
  }
  .step:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 22%, transparent);
  }
  .step[data-on] {
    background: linear-gradient(color-mix(in oklch, var(--instr) 70%, white), var(--instr));
    box-shadow:
      inset 0 -3px 0 color-mix(in oklch, var(--instr) 60%, black),
      0 0 10px color-mix(in oklch, var(--instr) 35%, transparent);
  }
  .step[data-on].accent {
    background: linear-gradient(color-mix(in oklch, var(--instr) 45%, white), var(--instr));
  }
  .step[data-live]:not([data-on]) {
    background: radial-gradient(circle, var(--instr) 0 28%, color-mix(in oklch, var(--ws-stage-ink) 9%, transparent) 30%);
  }
  .step[data-now] {
    outline: 2px solid var(--instr);
    outline-offset: -2px;
  }
  .step[data-now]:not([data-on]) {
    background: color-mix(in oklch, var(--instr) 30%, transparent);
  }
  /* A hit under the playhead stays a hit (same fill) and glows; the column itself is the playhead. */
  .step[data-on][data-now] {
    transform: scale(1.08);
    filter: brightness(1.25);
    box-shadow: 0 0 16px var(--instr);
  }
  /* More steps off to the right: fade the edge. */
  [data-grid].more {
    mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent);
  }
  .bar-cell {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    border-radius: 0.5rem;
    border: 2px solid color-mix(in oklch, var(--ws-stage-ink) 25%, transparent);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ws-stage-ink);
  }
  .bar-cell[data-repeat] {
    border-style: dashed;
    color: var(--ws-stage-soft);
  }
  .bar-cell[data-now] {
    background: var(--instr);
    border-color: var(--instr);
    color: var(--ws-stage);
  }
  .bar-cell:hover:not([data-now]) {
    background: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
  }
  /* A phone fits eight steps, half a bar, beside short row tags; the dots page through the rest. */
  @media (max-width: 639px) {
    [data-grid] {
      container-type: inline-size;
    }
    /* The dots say there is more; a light fade keeps the eighth step whole. */
    [data-grid].more {
      mask-image: linear-gradient(to right, black calc(100% - 0.5rem), transparent);
    }
    .grid-table {
      border-spacing: 2px;
      margin-inline: -2px;
    }
    .rowhead {
      min-width: 3.25rem;
      max-width: 3.25rem;
    }
    .rowlabel {
      font-size: 0.8125rem;
      line-height: 1.1;
      padding-inline: 0.2rem;
    }
    .step {
      width: max(1.75rem, calc((100cqi - 3.25rem - 9 * 2px - 0.7rem) / 8));
    }
  }
  @media (min-width: 1280px) {
    .step {
      width: 2.9rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .step {
      transition: none;
    }
    .step[data-on][data-now] {
      transform: none;
    }
  }
</style>
