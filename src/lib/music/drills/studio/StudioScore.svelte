<script lang="ts" module>
  export type View = "staff" | "tab" | "fingering" | "waterfall";
</script>

<script lang="ts">
  // The score in its own scrolling viewport, in one of four views, with the
  // one keyboard under it. In Waterfall the keyboard is laid out from the same
  // white-key grid (whiteKeyLayout) so every falling note lands on its key.
  import type { Score } from "@repo/music-core";
  import Staff from "$lib/music/notation/Staff.svelte";
  import Tab from "$lib/music/notation/Tab.svelte";
  import Waterfall from "$lib/music/notation/Waterfall.svelte";
  import FingeringRow from "$lib/music/notation/FingeringRow.svelte";
  import { whiteKeyLayout, type BeatRange, type TabTuning } from "$lib/music/notation/groups";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import type { Snap } from "$lib/music/notation/selection.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import type { CellMarks, Flashes } from "$lib/music/components/feedback.svelte";

  let {
    score,
    voiceIds,
    view,
    tuning,
    cursorBeat = null,
    groupStates = {},
    marks = {},
    flashes,
    selection = $bindable(null),
    onselect,
    snap = "bar",
    bpm,
    onfallback,
    compact = false,
  }: {
    score: Score;
    voiceIds: string[];
    view: View;
    tuning: TabTuning & { name: string };
    cursorBeat?: number | null;
    groupStates?: Record<number, GroupState>;
    marks?: Record<number, CellMarks>;
    flashes?: Flashes;
    selection?: BeatRange | null;
    onselect?: (r: BeatRange) => void;
    snap?: Snap;
    bpm: number;
    onfallback?: (reason: string) => void;
    /** Running: a shorter viewport so the keyboard stays on screen. */
    compact?: boolean;
  } = $props();

  // Whole octaves from C, so both ends are white keys and the grids agree.
  const midis = $derived(score.voices.filter((v) => voiceIds.includes(v.id)).flatMap((v) => v.notes.map((n) => n.midi)));
  const low = $derived(Math.floor((Math.min(...midis, 60) - 0) / 12) * 12);
  const high = $derived(Math.max(low + 12, Math.ceil((Math.max(...midis, 60) + 1) / 12) * 12));
  const whites = $derived(Object.values(whiteKeyLayout(low, high)).filter((k) => !k.black).length);
  const MIN_KEY = 30;

  let host = $state<HTMLDivElement>();
  // Keep the cursor inside the score's own viewport (never scroll the page).
  $effect(() => {
    void cursorBeat;
    const el = host?.querySelector<HTMLElement>("[data-cursor]");
    const vp = el?.closest<HTMLElement>(".viewport");
    if (!el || !vp) return;
    const r = el.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    if (r.top < v.top || r.bottom > v.bottom) vp.scrollTop += r.top - v.top - 12;
    if (r.left < v.left || r.right > v.right) vp.scrollLeft += r.left - v.left - v.width / 3;
  });

  const maxHeight = $derived(compact ? "min(36dvh, 20rem)" : "min(52dvh, 30rem)");
</script>

<div bind:this={host} class="flex min-w-0 flex-col gap-3">
  {#if view === "waterfall"}
    <div class="overflow-x-auto overscroll-x-contain rounded-xl">
      <div class="lane-dark" style:min-width="{whites * MIN_KEY + 16}px">
        <div class="px-2">
          <Waterfall {score} {voiceIds} {low} {high} beat={cursorBeat ?? 0} {groupStates} height={compact ? "min(34dvh, 16rem)" : "min(44dvh, 22rem)"} />
        </div>
        <Piano {low} {high} {marks} {flashes} minKey={MIN_KEY} label="Piano keyboard under the waterfall" />
      </div>
    </div>
  {:else}
    <div class="rounded-xl bg-ws-surface p-2 text-ws-ink">
      {#if view === "tab"}
        <Tab {score} {voiceIds} {tuning} {cursorBeat} {groupStates} bind:selection {onselect} {snap} {bpm} {maxHeight} {onfallback} />
      {:else if view === "fingering"}
        <div class="overflow-auto" style:max-height={maxHeight}>
          <FingeringRow {score} {voiceIds} {groupStates} />
        </div>
      {:else}
        <Staff {score} {voiceIds} {cursorBeat} {groupStates} bind:selection {onselect} {snap} {bpm} {maxHeight} {onfallback} />
      {/if}
    </div>
    <Piano {low} {high} {marks} {flashes} label="Piano keyboard" />
  {/if}
</div>

<style>
  /* The waterfall lane sits on the stage, so it takes the stage's colours. */
  .lane-dark {
    --ws-surface: var(--ws-stage-2);
    --ws-line: oklch(1 0 0 / 0.12);
    --ws-ink: var(--ws-stage-ink);
  }
</style>
