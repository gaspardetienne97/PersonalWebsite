<script lang="ts">
  // A drum part as a grid, one row per drum the way the pads grooves draw it:
  // sixteenth columns, beat and bar lines, each hit a dot in its drum's colour.
  // Rows name the drum and its pad on the app's kit. Hits off the sixteenth
  // grid (triplet fills) sit on the nearest sixteenth. Or as lanes, the
  // notes sliding onto a hit line with the pads beside (the pads drills' view).
  import type { Score } from "@repo/music-core";
  import { GROOVE_VOICES, drumKey, hitDrumKey, scoreDrumPad, scoreDrumVoice } from "@repo/music-core/content/winds-pads";
  import { barBeats, scoreGroups } from "#lib/music/notation/groups.ts";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import Pads from "#lib/music/components/Pads.svelte";
  import { input } from "#lib/music/runtime/index.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import PadHighway, { type HighwayLane, type HighwayNote } from "#lib/music/drills/pads/PadHighway.svelte";
  import { laneColor, orderLanes, padsDue, stepsPerBeatFor, type Judgement } from "#lib/music/drills/pads/lanes.ts";
  import { padLabel } from "#lib/music/drills/pads/midi-status.ts";
  import { m } from "@repo/i18n/messages.js";

  let {
    score,
    voiceIds,
    cursorBeat = null,
    groupStates = {},
    flashes,
    maxHeight,
    bpm,
    timed = false,
  }: {
    score: Score;
    voiceIds: string[];
    cursorBeat?: number | null;
    groupStates?: Record<number, GroupState>;
    flashes?: Flashes;
    maxHeight: string;
    bpm: number;
    /** A run in time: each hit gets early, late or on time on its pad. */
    timed?: boolean;
  } = $props();

  const CELL = 16;
  const NAME = 108;
  const ROW = 30;
  const HEAD = 22;

  const notes = $derived(score.voices.filter((v) => voiceIds.includes(v.id) && v.drums).flatMap((v) => v.notes.filter((n) => !n.tieFrom)));
  const rows = $derived(
    GROOVE_VOICES.filter((v) => notes.some((n) => scoreDrumVoice(n.midi) === v.id)).map((v) => {
      const gm = notes.find((n) => scoreDrumVoice(n.midi) === v.id)!.midi;
      return { id: v.id, name: v.name, pad: padLabel(scoreDrumPad(gm)), key: drumKey(gm) };
    }),
  );
  const rowOf = $derived(new Map(rows.map((r, i) => [r.id, i])));
  const stateAt = $derived.by(() => {
    const m = new Map<number, GroupState>();
    for (const g of scoreGroups(score, voiceIds)) if (groupStates[g.index]) m.set(Math.round(g.startBeat * 4), groupStates[g.index]);
    return m;
  });
  const barSteps = $derived(Math.round(barBeats(score.meter) * 4));
  const steps = $derived(Math.max(barSteps, Math.ceil(score.lengthBeats * 4)));
  const barCount = $derived(Math.ceil(steps / barSteps));

  // The lanes: one per drum, its kit pad named and lit on the pads beside.
  const view = new DrillSetup("studio-drums", { drums: "grid" as string, ahead: 1 });
  const lanesOn = $derived(view.value.drums === "lanes");
  const aheadBars = $derived([1, 2, 4].includes(view.value.ahead) ? view.value.ahead : 1);
  const beatMs = $derived(60000 / bpm);
  const lanes = $derived<HighwayLane[]>(orderLanes(rows.map((r) => r.id)).map((id) => ({ id, label: rows.find((r) => r.id === id)!.name, color: laneColor(id), pad: GROOVE_VOICES.find((v) => v.id === id)!.midi })));
  const live = $derived<(HighwayNote & { pad: number; key: number })[]>(
    notes.map((n) => {
      const id = scoreDrumVoice(n.midi);
      const v = n.velocity ?? 0.7;
      return { atMs: n.startBeat * beatMs, lane: lanes.findIndex((l) => l.id === id), pad: scoreDrumPad(n.midi), key: drumKey(n.midi), kind: v >= 0.85 ? "accent" : v < 0.45 ? "ghost" : "normal" };
    }),
  );
  const judged = $derived.by(() => {
    const out: Record<number, Judgement> = {};
    const byBeat = new Map<number, GroupState>();
    for (const g of scoreGroups(score, voiceIds)) if (groupStates[g.index]) byBeat.set(Math.round(g.startBeat * 48), groupStates[g.index]);
    notes.forEach((n, i) => {
      const st = byBeat.get(Math.round(n.startBeat * 48));
      if (st === "correct") out[i] = "perfect";
      else if (st === "missed" || st === "wrong") out[i] = "miss";
    });
    return out;
  });
  const nowMs = $derived((cursorBeat ?? (notes[0]?.startBeat ?? 0) - 1) * beatMs);
  const marks = $derived(Object.fromEntries([...padsDue(live, nowMs, Math.min(beatMs / 2, 260))].map((p) => [p, { target: true }])));
  const names = $derived(Object.fromEntries(lanes.map((l) => [l.pad, l.label])));
  const colors = $derived(Object.fromEntries(lanes.map((l) => [l.pad, l.color])));

  // Early, late or on time per hit: the hit's beat read from the cursor's clock.
  const timing = new Flashes<"early" | "late" | "perfect">();
  let cursorAt = 0;
  $effect(() => {
    void cursorBeat;
    cursorAt = performance.now();
  });
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind !== "noteon" || !timed || !lanesOn || cursorBeat === null) return;
      const at = (cursorBeat + (e.at - cursorAt) / beatMs) * beatMs;
      const key = hitDrumKey(e.midi);
      let err = Infinity;
      for (const t of live) if (t.key === key && Math.abs(at - t.atMs) < Math.abs(err)) err = at - t.atMs;
      if (Math.abs(err) > Math.min(150, beatMs / 4)) return;
      timing.add(e.midi, Math.abs(err) <= 35 ? "perfect" : err < 0 ? "early" : "late", 450);
    }),
  );
</script>

<div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <div class="flex items-center gap-1" role="group" aria-label={m.music_drills_studio_drum_view()}>
    {#each [["grid", m.music_drills_studio_drum_grid()], ["lanes", m.music_drills_studio_drum_lanes()]] as [id, text] (id)}
      <button type="button" class="chip" aria-pressed={view.value.drums === id} onclick={() => view.set({ drums: id })}>{text}</button>
    {/each}
  </div>
  {#if lanesOn}
    <div class="flex items-center gap-1" role="group" aria-label={m.music_drills_studio_look_ahead()}>
      <span class="mr-1 text-ws-stage-soft">{m.music_drills_studio_look_ahead()}</span>
      {#each [1, 2, 4] as n (n)}
        <button type="button" class="chip" aria-pressed={aheadBars === n} onclick={() => view.set({ ahead: n })}>{m.music_drills_studio_bars_count({ count: n })}</button>
      {/each}
    </div>
  {/if}
</div>

{#if lanesOn}
  <PadHighway
    {lanes}
    notes={live}
    now={nowMs}
    {beatMs}
    beatsPerBar={barBeats(score.meter)}
    stepsPerBeat={stepsPerBeatFor(notes.map((n) => n.startBeat))}
    {aheadBars}
    lengthMs={score.lengthBeats * beatMs}
    {judged}
    label={m.music_drills_studio_lanes_label({ drums: lanes.map((l) => l.label).join(", ") })}
  >
    {#snippet pads()}
      <Pads {marks} {flashes} {timing} {names} {colors} label={m.music_drills_studio_pads_label()} />
    {/snippet}
  </PadHighway>
{:else}
<div class="rounded-xl bg-ws-surface p-2 text-ws-ink">

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be reachable by keyboard -->
<div class="viewport overflow-auto" style:max-height={maxHeight} role="region" aria-label={m.music_drills_studio_drum_part_label({ drums: rows.map((r) => r.name).join(", "), hits: notes.length, bars: barCount })} tabindex="0" data-drum-grid>
  <div class="flex w-max">
    <!-- The drum names stay put while the bars scroll under them. -->
    <div class="names sticky left-0 z-10 shrink-0 bg-ws-surface" style:width="{NAME}px" style:padding-top="{HEAD}px">
      {#each rows as r (r.id)}
        <div class="name flex items-center gap-1.5 pr-1.5 text-[13px]" style:height="{ROW}px" data-flash={flashes?.get(r.key)} title="{r.name}, pad {r.pad}">
          <span class="size-2 shrink-0 rounded-full" style:background={laneColor(r.id)} aria-hidden="true"></span>
          <span class="truncate font-medium">{r.name}</span>
          <span class="ml-auto text-ws-soft">{r.pad}</span>
        </div>
      {/each}
    </div>
    <div class="relative" style:width="{steps * CELL + 8}px" style:height="{HEAD + rows.length * ROW}px" style:--cell="{CELL}px" style:--bar="{barSteps * CELL}px">
      {#each Array.from({ length: barCount }, (_, b) => b) as b (b)}
        <span class="absolute top-0.5 text-[13px] text-ws-soft" style:left="{b * barSteps * CELL + 3}px">{b + 1}</span>
      {/each}
      {#each rows as r, i (r.id)}
        <div class="lane absolute left-0" style:top="{HEAD + i * ROW + 1}px" style:width="{steps * CELL}px" style:height="{ROW - 2}px"></div>
      {/each}
      {#each notes as n, k (k)}
        {@const row = rowOf.get(scoreDrumVoice(n.midi))}
        {@const col = Math.round(n.startBeat * 4)}
        {#if row !== undefined}
          <span class="hit absolute" style:left="{col * CELL + 2}px" style:top="{HEAD + row * ROW + (ROW - CELL + 4) / 2}px" style:background={laneColor(scoreDrumVoice(n.midi))} data-state={stateAt.get(col)} data-open={n.midi === 46 || undefined} aria-hidden="true"></span>
        {/if}
      {/each}
      {#if cursorBeat !== null}
        <span class="cursor absolute top-0 bottom-0" style:left="{cursorBeat * 4 * CELL}px" data-cursor aria-hidden="true"></span>
      {/if}
    </div>
  </div>
</div>
</div>
{/if}

<style>
  .chip {
    min-height: 2.25rem;
    padding-inline: 0.85rem;
    border-radius: 999px;
    font-weight: 600;
    color: var(--ws-stage-ink);
    background: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
  }
  .chip:hover {
    background: color-mix(in oklch, var(--ws-stage-ink) 18%, transparent);
  }
  .chip[aria-pressed="true"] {
    background: var(--ws-stage-ink);
    color: var(--ws-stage);
  }
  .lane {
    border-radius: 4px;
    background-color: color-mix(in oklch, var(--ws-ink) 4%, transparent);
    background-image:
      linear-gradient(to right, color-mix(in oklch, var(--ws-ink) 35%, transparent) 1.5px, transparent 1.5px),
      linear-gradient(to right, color-mix(in oklch, var(--ws-ink) 12%, transparent) 1px, transparent 1px);
    background-size:
      var(--bar) 100%,
      calc(var(--cell) * 4) 100%;
  }
  .name {
    border-radius: 4px;
  }
  .name[data-flash="correct"] {
    background: color-mix(in oklch, var(--success) 30%, var(--ws-surface));
  }
  .name[data-flash="wrong"] {
    background: color-mix(in oklch, var(--destructive) 30%, var(--ws-surface));
  }
  .hit {
    width: calc(var(--cell) - 4px);
    height: calc(var(--cell) - 4px);
    border-radius: 999px;
    z-index: 1;
  }
  /* An open hat: a hollow dot, as drum notation circles it. */
  .hit[data-open] {
    background: transparent !important;
    box-shadow: inset 0 0 0 2px var(--ws-ink);
  }
  .hit[data-state="active"] {
    box-shadow: 0 0 0 2px var(--ws-ink);
  }
  .hit[data-state="correct"] {
    background: var(--success) !important;
  }
  .hit[data-state="missed"] {
    background: transparent !important;
    box-shadow: inset 0 0 0 2px var(--destructive);
  }
  .hit[data-state="wrong"] {
    background: var(--destructive) !important;
  }
  .cursor {
    width: 2px;
    background: var(--instr);
    z-index: 3;
  }
</style>
