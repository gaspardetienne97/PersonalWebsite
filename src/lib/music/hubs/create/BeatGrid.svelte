<script lang="ts">
  // The hero of Create: a 16-step sequencer. Rows are drum voices keyed by MIDI
  // note; a row whose note has a kit sample plays the sample.
  import { onDestroy, onMount } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Save from "lucide-svelte/icons/save";
  import Eraser from "lucide-svelte/icons/eraser";
  import { audio, getSetting, putSetting, settings, type SequenceHandle } from "$lib/music/runtime";
  import { btnStage } from "$lib/music/components/ui";
  import { padLabel, sampleName } from "./kits";
  import { kits } from "./kitStore.svelte";
  import KitPanel from "./KitPanel.svelte";
  import {
    DEFAULT_ROWS,
    DRAFT_KEY,
    hitCount,
    isOn,
    PATTERNS_KEY,
    patternToSequence,
    STEPS,
    stepSeconds,
    toggleStep,
    type BeatPattern,
    type BeatRow,
  } from "./pattern";

  let { announce }: { announce: (msg: string) => void } = $props();

  const LOOPS = 8;
  const starter = (): BeatPattern => ({
    id: crypto.randomUUID(),
    name: "Pattern 1",
    bpm: Math.min(160, Math.max(60, settings.value.bpm)),
    steps: { 36: [0, 7, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
    updatedAt: Date.now(),
  });

  let pattern = $state<BeatPattern>(starter());
  let saved = $state<BeatPattern[]>([]);
  let loaded = false;
  let handle: SequenceHandle | null = null;
  let playing = $state(false);
  let fromStep = 0;
  let playhead = $state(-1);
  let raf = 0;

  const kit = $derived(kits.kit);
  const kitNotes = $derived(kits.notes);
  const rows = $derived.by((): (BeatRow & { sample?: string })[] => {
    const base = DEFAULT_ROWS.map((r) => r.midi);
    const extra = [...kitNotes].filter((n) => !base.includes(n)).sort((a, b) => a - b);
    return [...DEFAULT_ROWS, ...extra.map((midi) => ({ midi, name: padLabel(midi) }))].map((r) => {
      const p = kit?.pads.find((x) => x.note === r.midi);
      return { ...r, sample: kit && p ? sampleName(kit, p.soft ?? p.hard) : undefined };
    });
  });

  onMount(async () => {
    const [draft, list] = await Promise.all([getSetting<BeatPattern | null>(DRAFT_KEY, null), getSetting<BeatPattern[]>(PATTERNS_KEY, [])]);
    if (draft?.steps) pattern = draft;
    saved = Array.isArray(list) ? list : [];
    loaded = true;
    await kits.ready;
  });

  // Autosave the draft (debounced) so a reload lands on the same pattern.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snap = $state.snapshot(pattern);
    if (!loaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void putSetting(DRAFT_KEY, snap), 300);
  });

  function tick() {
    if (!handle) return;
    const ms = stepSeconds(pattern.bpm) * 1000;
    const t = performance.now() - handle.startPerf;
    playhead = t < 0 ? -1 : (fromStep + Math.floor(t / ms)) % STEPS;
    raf = requestAnimationFrame(tick);
  }

  function schedule(start: number) {
    // Rotate so the sequence begins at `start`.
    const rotated: BeatPattern = {
      ...pattern,
      steps: Object.fromEntries(Object.entries(pattern.steps).map(([k, s]) => [k, s.map((x) => (x - start + STEPS) % STEPS)])),
    };
    const notes = patternToSequence(rotated, LOOPS);
    fromStep = start;
    const h = audio.playSequence(notes);
    handle = h;
    void h.done.then(() => {
      if (handle === h && playing) schedule(0);
    });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  async function play() {
    if (playing) return stop();
    await audio.unlock();
    if (!audio.unlocked) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    playing = true;
    schedule(0);
    announce(`Playing ${pattern.name} at ${pattern.bpm} BPM.`);
  }

  function stop(say = true) {
    playing = false;
    handle?.stop();
    handle = null;
    cancelAnimationFrame(raf);
    playhead = -1;
    if (say) announce("Stopped.");
  }

  // An edit while playing takes effect from the next step.
  function edit(next: BeatPattern) {
    pattern = { ...next, updatedAt: Date.now() };
    if (playing) schedule((Math.max(0, playhead) + 1) % STEPS);
  }

  function toggle(row: BeatRow, step: number) {
    const was = isOn(pattern, row.midi, step);
    edit(toggleStep(pattern, row.midi, step));
    if (!playing && !was) {
      void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
    }
  }

  function audition(row: BeatRow) {
    void audio.unlock().then(() => audio.playKitPad(row.midi, 0.8));
  }

  function setBpm(v: number) {
    if (!Number.isFinite(v)) return;
    edit({ ...pattern, bpm: Math.round(Math.min(200, Math.max(40, v))) });
  }

  async function savePattern() {
    const name = pattern.name.trim() || "Pattern";
    const snap = { ...$state.snapshot(pattern), name, updatedAt: Date.now() };
    saved = [...saved.filter((p) => p.id !== snap.id), snap].sort((a, b) => a.name.localeCompare(b.name));
    await putSetting(PATTERNS_KEY, saved);
    announce(`Saved ${name}.`);
  }

  function loadPattern(id: string) {
    const p = saved.find((x) => x.id === id);
    if (!p) return;
    edit(structuredClone($state.snapshot(p)));
    announce(`Loaded ${p.name}, ${hitCount(p)} hits at ${p.bpm} BPM.`);
  }

  function newPattern() {
    edit({ id: crypto.randomUUID(), name: `Pattern ${saved.length + 1}`, bpm: pattern.bpm, steps: {}, updatedAt: Date.now() });
    announce("New empty pattern. Click the steps to build a beat.");
  }

  // Arrow keys walk the grid; Space plays when focus is not on a control.
  function gridKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    const r = Number(el.dataset.row);
    const s = Number(el.dataset.step);
    if (!Number.isFinite(r) || !Number.isFinite(s)) return;
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!move) return;
    e.preventDefault();
    const nr = (r + move[0] + rows.length) % rows.length;
    const ns = (s + move[1] + STEPS) % STEPS;
    (el.closest("[data-grid]")?.querySelector(`[data-row="${nr}"][data-step="${ns}"]`) as HTMLElement | null)?.focus();
  }

  function windowKey(e: KeyboardEvent) {
    if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey) return;
    const t = e.target as HTMLElement;
    if (t !== document.body && t.closest("button, input, select, textarea, a, [contenteditable]")) return;
    e.preventDefault();
    void play();
  }

  onDestroy(() => {
    stop(false);
    clearTimeout(saveTimer);
    if (loaded) void putSetting(DRAFT_KEY, $state.snapshot(pattern));
  });

  const field = "min-h-11 rounded-lg border border-ws-stage-ink/15 bg-ws-stage-ink/8 px-3 text-sm text-ws-stage-ink";
</script>

<svelte:window onkeydown={windowKey} />

<div class="flex flex-col gap-8">
  <section class="stage relative overflow-hidden rounded-3xl p-3 sm:p-5" aria-label="Beat grid">
    <div class="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
      <button
        type="button"
        class="flex min-h-12 items-center gap-2 rounded-full bg-instr px-5 font-display text-base font-semibold text-ws-stage hover:brightness-105"
        aria-pressed={playing}
        onclick={play}
      >
        {#if playing}<Square class="size-5" aria-hidden="true" />Stop{:else}<Play class="size-5" aria-hidden="true" />Play{/if}
      </button>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-ws-stage-soft">Tempo</span>
        <input
          type="number"
          min="40"
          max="200"
          class="{field} tnum w-20"
          value={pattern.bpm}
          onchange={(e) => setBpm(e.currentTarget.valueAsNumber)}
        />
        <span class="text-ws-stage-soft">BPM</span>
      </label>
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

    <div class="relative overflow-x-auto pb-1" data-grid>
      <table class="grid-table">
        <thead>
          <tr>
            <th scope="col" class="rowhead"><span class="sr-only">Voice</span></th>
            {#each Array.from({ length: STEPS }, (_, i) => i) as s (s)}
              <th scope="col" class="stephead" class:beat={s % 4 === 0} data-now={playhead === s || undefined}>
                <span aria-hidden="true">{s % 4 === 0 ? s / 4 + 1 : ""}</span>
                <span class="sr-only">Step {s + 1}</span>
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
              {#each Array.from({ length: STEPS }, (_, i) => i) as s (s)}
                {@const on = isOn(pattern, row.midi, s)}
                <td class:gap={s % 4 === 3 && s < STEPS - 1}>
                  <button
                    type="button"
                    class="step"
                    class:alt={Math.floor(s / 4) % 2 === 1}
                    data-on={on || undefined}
                    data-now={playhead === s || undefined}
                    data-row={r}
                    data-step={s}
                    aria-pressed={on}
                    aria-label="{row.sample ? `${row.sample} on ${padLabel(row.midi)}` : row.name}, step {s + 1}"
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
      {hitCount(pattern)} hits. Arrow keys move around the grid, Enter or Space toggles a step, Space elsewhere plays.
    </p>
  </section>

  <KitPanel {announce} />
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
