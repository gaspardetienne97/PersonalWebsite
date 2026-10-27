<script lang="ts">
  // A drum part as a grid, one row per drum the way the pads grooves draw it:
  // sixteenth columns, beat and bar lines, each hit a dot in its drum's colour.
  // Rows name the drum and its pad on the app's kit. Hits off the sixteenth
  // grid (triplet fills) sit on the nearest sixteenth.
  import type { Score } from "@repo/music-core";
  import { GROOVE_VOICES, drumKey, scoreDrumPad, scoreDrumVoice } from "@repo/music-core/content/winds-pads";
  import { barBeats, scoreGroups } from "$lib/music/notation/groups";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import type { Flashes } from "$lib/music/components/feedback.svelte";
  import { laneColor } from "$lib/music/drills/pads/lanes";
  import { padLabel } from "$lib/music/drills/pads/midi-status";

  let {
    score,
    voiceIds,
    cursorBeat = null,
    groupStates = {},
    flashes,
    maxHeight,
  }: {
    score: Score;
    voiceIds: string[];
    cursorBeat?: number | null;
    groupStates?: Record<number, GroupState>;
    flashes?: Flashes;
    maxHeight: string;
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
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be reachable by keyboard -->
<div class="viewport overflow-auto" style:max-height={maxHeight} role="region" aria-label="Drum part: {rows.map((r) => r.name).join(', ')}. {notes.length} hits over {barCount} bar{barCount === 1 ? '' : 's'}" tabindex="0" data-drum-grid>
  <div class="flex w-max">
    <!-- The drum names stay put while the bars scroll under them. -->
    <div class="names sticky left-0 z-10 shrink-0 bg-ws-surface" style:width="{NAME}px" style:padding-top="{HEAD}px">
      {#each rows as r (r.id)}
        <div class="name flex items-center gap-1.5 pr-1.5 text-xs" style:height="{ROW}px" data-flash={flashes?.get(r.key)} title="{r.name}, pad {r.pad}">
          <span class="size-2 shrink-0 rounded-full" style:background={laneColor(r.id)} aria-hidden="true"></span>
          <span class="truncate font-medium">{r.name}</span>
          <span class="ml-auto text-ws-soft">{r.pad}</span>
        </div>
      {/each}
    </div>
    <div class="relative" style:width="{steps * CELL + 8}px" style:height="{HEAD + rows.length * ROW}px" style:--cell="{CELL}px" style:--bar="{barSteps * CELL}px">
      {#each Array.from({ length: barCount }, (_, b) => b) as b (b)}
        <span class="absolute top-0.5 text-xs text-ws-soft" style:left="{b * barSteps * CELL + 3}px">{b + 1}</span>
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

<style>
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
