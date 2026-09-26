<script lang="ts">
  // The beat's editor: a step sequencer of one to eight bars, rows are drum
  // voices keyed by MIDI note (a row with a kit sample plays the sample). The
  // song bar plays it; the tracks list mutes it and picks its kit.
  import Plus from "lucide-svelte/icons/plus";
  import Minus from "lucide-svelte/icons/minus";
  import { audio } from "$lib/music/runtime";
  import { btnStage } from "$lib/music/components/ui";
  import { padLabel, sampleName } from "./kits";
  import { kits } from "./kitStore.svelte";
  import { session } from "./session.svelte";
  import {
    barsOf,
    DEFAULT_ROWS,
    fromPreset,
    hitCount,
    isOn,
    MAX_BARS,
    PRESETS,
    removeBar,
    STEPS,
    stepsOf,
    toggleStep,
    type BeatRow,
  } from "./pattern";

  let { announce }: { announce: (msg: string) => void } = $props();

  const pattern = $derived(session.pattern);
  const playhead = $derived(session.beatStep);
  const total = $derived(stepsOf(pattern));

  const kit = $derived(kits.kit);
  const kitNotes = $derived(kits.notes);
  const rows = $derived.by((): (BeatRow & { sample?: string })[] => {
    const base = DEFAULT_ROWS.map((r) => r.midi);
    const used = Object.keys(pattern.steps).map(Number);
    const extra = [...new Set([...kitNotes, ...used])].filter((n) => !base.includes(n)).sort((a, b) => a - b);
    return [...DEFAULT_ROWS, ...extra.map((midi) => ({ midi, name: padLabel(midi) }))].map((r) => {
      const p = kit?.pads.find((x) => x.note === r.midi);
      return { ...r, sample: kit && p ? sampleName(kit, p.soft ?? p.hard) : undefined };
    });
  });

  function toggle(row: BeatRow, step: number) {
    const was = isOn(pattern, row.midi, step);
    session.setPattern(toggleStep(pattern, row.midi, step));
    if (!session.playing && !was) void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  function audition(row: BeatRow) {
    void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  const bars = (n: number) => `${n} ${n === 1 ? "bar" : "bars"}`;
  function grow() {
    const song = session.bars;
    session.growBeat();
    const n = barsOf(session.pattern);
    announce(`The beat is ${bars(n)}; the new bar starts as a copy of the last one.${session.bars > song ? ` The song grew to ${bars(session.bars)}.` : ""}`);
  }
  function shrink() {
    session.setPattern(removeBar(pattern));
    announce(`The beat is ${bars(barsOf(session.pattern))}. It repeats to fill the song.`);
  }

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

<section class="stage relative overflow-hidden rounded-3xl p-3 sm:p-5" aria-label="Beat editor">
    <div class="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
      <label class="flex min-w-0 flex-1 basis-40 items-center gap-2 text-sm">
        <span class="sr-only">Beat name</span>
        <input class="{field} w-full min-w-0 font-display text-base font-semibold" value={pattern.name} aria-label="Beat name" onchange={(e) => session.setPattern({ ...pattern, name: e.currentTarget.value || pattern.name })} />
      </label>
      <select class={field} aria-label="Start from a preset" value="" onchange={(e) => usePreset(e.currentTarget.value)}>
        <option value="" disabled>Presets</option>
        {#each PRESETS as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <div class="flex items-center gap-1 text-sm" role="group" aria-label="Beat length">
        <button type="button" class="{btnStage} w-11 px-0" aria-label="Remove the beat's last bar" disabled={barsOf(pattern) <= 1} onclick={shrink}><Minus class="size-4" aria-hidden="true" /></button>
        <span class="tnum w-14 text-center font-semibold">{bars(barsOf(pattern))}</span>
        <button type="button" class="{btnStage} w-11 px-0" aria-label="Add a bar to the beat" disabled={barsOf(pattern) >= MAX_BARS} onclick={grow}><Plus class="size-4" aria-hidden="true" /></button>
      </div>
    </div>

    <div class="relative overflow-x-auto pb-1" data-grid>
      <table class="grid-table">
        <thead>
          <tr>
            <th scope="col" class="rowhead"><span class="sr-only">Voice</span></th>
            {#each Array.from({ length: total }, (_, i) => i) as s (s)}
              <th scope="col" class="stephead" class:beat={s % 4 === 0} class:bar={s % STEPS === 0} data-now={playhead === s || undefined}>
                <span aria-hidden="true">{s % STEPS === 0 ? `${s / STEPS + 1}.1` : s % 4 === 0 ? (s % STEPS) / 4 + 1 : ""}</span>
                <span class="sr-only">Bar {Math.floor(s / STEPS) + 1}, step {(s % STEPS) + 1}</span>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, r (row.midi)}
            <tr>
              <th scope="row" class="rowhead">
                <button type="button" class="rowlabel" onclick={() => audition(row)} aria-label="Hear {row.sample ?? row.name}">
                  <span class="truncate font-semibold">{row.sample ?? row.name}</span>
                  <span class="text-[0.7rem] text-ws-stage-soft">{row.sample ? `Sample on ${padLabel(row.midi)}` : "Synth"}</span>
                </button>
              </th>
              {#each Array.from({ length: total }, (_, i) => i) as s (s)}
                {@const on = isOn(pattern, row.midi, s)}
                <td class:gap={s % 4 === 3 && s < total - 1} class:bargap={s % STEPS === STEPS - 1 && s < total - 1}>
                  <button
                    type="button"
                    class="step"
                    class:alt={Math.floor(s / 4) % 2 === 1}
                    data-on={on || undefined}
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
    <p class="mt-3 text-xs text-ws-stage-soft" data-playhead={playhead}>
      {hitCount(pattern)} hits over {bars(barsOf(pattern))}{barsOf(pattern) < session.bars ? `, repeating to fill the song's ${session.bars} bars` : ""}. Rows play {kit && kitNotes.size ? `the samples in ${kit.name}, built-in drums elsewhere` : "the built-in drums"}. <a class="font-semibold text-ws-stage-ink underline underline-offset-4" href="/music/create/kits">Edit sample kits</a>. Arrow keys move around the grid, Enter or Space toggles a step.
    </p>
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
  .stephead {
    height: 1.4rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ws-stage-soft);
    text-align: left;
    padding-left: 0.2rem;
    border-bottom: 2px solid transparent;
  }
  .stephead[data-now] {
    border-bottom-color: var(--instr);
    color: var(--ws-stage-ink);
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
  .step {
    display: block;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.5rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    box-shadow: inset 0 -2px 0 #0005;
    transition:
      background 60ms,
      transform 60ms;
  }
  .step.alt {
    background: color-mix(in oklch, var(--ws-stage-ink) 5%, transparent);
  }
  .step:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 16%, transparent);
  }
  .step[data-on] {
    background: linear-gradient(color-mix(in oklch, var(--instr) 85%, white), var(--instr));
    box-shadow:
      inset 0 -3px 0 color-mix(in oklch, var(--instr) 60%, black),
      0 0 10px color-mix(in oklch, var(--instr) 35%, transparent);
  }
  .step[data-now] {
    outline: 2px solid color-mix(in oklch, var(--ws-stage-ink) 55%, transparent);
    outline-offset: -2px;
  }
  .step[data-on][data-now] {
    transform: scale(1.06);
    background: white;
  }
  @media (min-width: 1280px) {
    .step {
      width: 2.9rem;
    }
  }
</style>
