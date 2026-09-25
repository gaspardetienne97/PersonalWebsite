<script lang="ts">
  // The beat: a step sequencer of one to eight bars, rows are drum voices keyed
  // by MIDI note (a row with a kit sample plays the sample). It plays on the
  // shared Create transport, together with the piano roll.
  import Save from "lucide-svelte/icons/save";
  import Eraser from "lucide-svelte/icons/eraser";
  import Plus from "lucide-svelte/icons/plus";
  import Minus from "lucide-svelte/icons/minus";
  import Volume from "lucide-svelte/icons/volume-2";
  import VolumeOff from "lucide-svelte/icons/volume-off";
  import { onMount } from "svelte";
  import { audio, getSetting, putSetting } from "$lib/music/runtime";
  import { btnStage } from "$lib/music/components/ui";
  import { padLabel, sampleName } from "./kits";
  import { kits } from "./kitStore.svelte";
  import { session } from "./session.svelte";
  import {
    addBar,
    barsOf,
    DEFAULT_ROWS,
    fromPreset,
    hitCount,
    isOn,
    MAX_BARS,
    PATTERNS_KEY,
    PRESETS,
    removeBar,
    STEPS,
    stepsOf,
    toggleStep,
    type BeatPattern,
    type BeatRow,
  } from "./pattern";

  let { announce }: { announce: (msg: string) => void } = $props();

  let saved = $state<BeatPattern[]>([]);
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

  onMount(async () => {
    const list = await getSetting<BeatPattern[]>(PATTERNS_KEY, []);
    saved = Array.isArray(list) ? list : [];
    await kits.ready;
  });

  async function play() {
    const was = session.playing;
    const ok = await session.toggle();
    if (!ok) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    announce(was ? "Stopped." : `Playing the beat and the piano roll together at ${session.bpm} BPM.`);
  }

  // Edits are heard on the next pass of the loop.
  function edit(next: BeatPattern) {
    session.pattern = { ...next, updatedAt: Date.now() };
  }

  function toggle(row: BeatRow, step: number) {
    const was = isOn(pattern, row.midi, step);
    edit(toggleStep(pattern, row.midi, step));
    if (!session.playing && !was) void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  function audition(row: BeatRow) {
    void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  function grow() {
    edit(addBar(pattern));
    announce(`${barsOf(session.pattern)} bars. The new bar starts as a copy of the last one.`);
  }
  function shrink() {
    edit(removeBar(pattern));
    announce(`${barsOf(session.pattern)} ${barsOf(session.pattern) === 1 ? "bar" : "bars"}.`);
  }

  function usePreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    edit(fromPreset(p, session.bpm));
    announce(`${p.name}: ${hitCount(session.pattern)} hits over ${p.bars} ${p.bars === 1 ? "bar" : "bars"}. Change anything you like.`);
  }

  async function savePattern() {
    const name = pattern.name.trim() || "Pattern";
    const snap = { ...$state.snapshot(pattern), name, updatedAt: Date.now() };
    saved = [...saved.filter((p) => p.id !== snap.id), snap].sort((a, b) => a.name.localeCompare(b.name));
    await putSetting(PATTERNS_KEY, saved);
    announce(`Saved the beat ${name}.`);
  }

  function loadPattern(id: string) {
    const p = saved.find((x) => x.id === id);
    if (!p) return;
    edit({ ...structuredClone($state.snapshot(p)), bpm: session.bpm });
    announce(`Loaded ${p.name}, ${hitCount(p)} hits.`);
  }

  function newPattern() {
    edit({ id: crypto.randomUUID(), name: `Pattern ${saved.length + 1}`, bpm: session.bpm, bars: barsOf(pattern), steps: {}, updatedAt: Date.now() });
    announce("Empty beat. Click the steps to build one, or start from a preset.");
  }

  // Arrow keys walk the grid; Space plays when focus is not on a control.
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

  function windowKey(e: KeyboardEvent) {
    if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey) return;
    const t = e.target as HTMLElement;
    if (t !== document.body && t.closest("button, input, select, textarea, a, [contenteditable]")) return;
    e.preventDefault();
    void play();
  }

  const field = "min-h-11 rounded-lg border border-ws-stage-ink/15 bg-ws-stage-ink/8 px-3 text-sm text-ws-stage-ink";
</script>

<svelte:window onkeydown={windowKey} />

<div class="flex flex-col gap-8">
  <section class="stage relative overflow-hidden rounded-3xl p-3 sm:p-5" aria-label="Beat grid">
    <div class="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
      <h2 class="font-display text-xl font-semibold">Beat</h2>
      <button
        type="button"
        class={btnStage}
        aria-pressed={session.beatMuted}
        onclick={() => {
          session.beatMuted = !session.beatMuted;
          announce(session.beatMuted ? "Beat muted; the melodies keep playing." : "Beat on.");
        }}
      >
        {#if session.beatMuted}<VolumeOff class="size-4" aria-hidden="true" />Muted{:else}<Volume class="size-4" aria-hidden="true" />Beat on{/if}
      </button>
      <select class={field} aria-label="Start from a preset" value="" onchange={(e) => usePreset(e.currentTarget.value)}>
        <option value="" disabled>Presets</option>
        {#each PRESETS as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <label class="flex min-w-0 flex-1 basis-36 items-center gap-2 text-sm">
        <span class="sr-only">Pattern name</span>
        <input class="{field} w-full min-w-0 font-medium" value={pattern.name} aria-label="Pattern name" onchange={(e) => edit({ ...pattern, name: e.currentTarget.value })} />
      </label>
      <button type="button" class={btnStage} onclick={savePattern}><Save class="size-4" aria-hidden="true" />Save</button>
      {#if saved.length}
        <select class={field} aria-label="Load a saved pattern" value="" onchange={(e) => loadPattern(e.currentTarget.value)}>
          <option value="" disabled>Load</option>
          {#each saved as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      {/if}
      <button type="button" class={btnStage} onclick={newPattern}><Eraser class="size-4" aria-hidden="true" />New</button>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-ws-stage-soft">Length</span>
      <button type="button" class="{btnStage} w-11 px-0" aria-label="Remove the last bar" disabled={barsOf(pattern) <= 1} onclick={shrink}><Minus class="size-4" aria-hidden="true" /></button>
      <span class="tnum w-16 text-center font-semibold">{barsOf(pattern)} {barsOf(pattern) === 1 ? "bar" : "bars"}</span>
      <button type="button" class={btnStage} disabled={barsOf(pattern) >= MAX_BARS} onclick={grow}><Plus class="size-4" aria-hidden="true" />Add bar</button>
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
      {hitCount(pattern)} hits over {barsOf(pattern)} {barsOf(pattern) === 1 ? "bar" : "bars"}. The beat repeats to fill the song's loop. Arrow keys move around the grid, Enter or Space toggles a step, Space elsewhere plays.
    </p>
  </section>

</div>

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
