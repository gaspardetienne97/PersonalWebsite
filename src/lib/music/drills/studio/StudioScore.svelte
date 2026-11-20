<script lang="ts" module>
  export type View = "staff" | "tab" | "fingering" | "waterfall" | "highway";
</script>

<script lang="ts">
  // The score in its own scrolling viewport, in one of four views, with the
  // one keyboard under it. In Falling notes the keyboard is laid out from the
  // same white-key grid (whiteKeyLayout) so every falling note lands on its key.
  import type { Score } from "@repo/music-core";
  import { transposeScore } from "@repo/music-core/theory/transposition";
  import Staff from "#lib/music/notation/Staff.svelte";
  import Tab from "#lib/music/notation/Tab.svelte";
  import FallingKeys from "#lib/music/notation/FallingKeys.svelte";
  import FingeringRow from "#lib/music/notation/FingeringRow.svelte";
  import StudioDrums from "./StudioDrums.svelte";
  import NoteHighway, { type HighwayNote } from "#lib/music/notation/NoteHighway.svelte";
  import type { Hit } from "#lib/music/notation/highway.ts";
  import { noteName } from "@repo/music-core";
  import { hideBefore } from "./studio";
  import { assignTab, barBeats, scoreGroups, type BeatRange, type TabTuning } from "#lib/music/notation/groups.ts";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import type { Snap } from "#lib/music/notation/selection.svelte.ts";
  import Piano from "#lib/music/components/Piano.svelte";
  import type { CellMarks, Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { MediaQuery } from "svelte/reactivity";
  import { m } from "@repo/i18n/messages.js";

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
    highlights = [],
    written = 0,
    drums = false,
    hide = 0,
    timed = false,
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
    /** Sections to tint on the staff and tab. */
    highlights?: (BeatRange & { label: string })[];
    /** Semitones from the concert score to what the player reads on the staff (guitar's octave, the Aerophone's key). */
    written?: number;
    /** A drum part: drawn as a drum grid in every view, with no keyboard. */
    drums?: boolean;
    /** Played from memory: notes before this score beat are not drawn (the keyboard keeps its range). */
    hide?: number;
    /** A run in time (not wait mode): the drum lanes mark each hit early, late or on time. */
    timed?: boolean;
  } = $props();
  const drawn = $derived(hideBefore(score, hide));
  const staffScore = $derived(transposeScore(drawn, written));

  // Whole octaves from C, so both ends are white keys and the grids agree.
  const midis = $derived(score.voices.filter((v) => voiceIds.includes(v.id)).flatMap((v) => v.notes.map((n) => n.midi)));
  const low = $derived(Math.floor((Math.min(...midis, 60) - 0) / 12) * 12);
  // A laptop shows at least two octaves, so a one-octave tune is not drawn on a toy keyboard.
  const wide = new MediaQuery("min-width: 1024px");
  const high = $derived(Math.max(low + (wide.current ? 24 : 12), Math.ceil((Math.max(...midis, 60) + 1) / 12) * 12));
  // Live on a laptop the staff is zoomed up to fill the stage (the frame draws to its zoomed width).
  const zoom = $derived(compact && wide.current ? 1.4 : 1);

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

  // The highway (guitar and ukulele): every note at its string and fret on the chosen tuning, judged by its group.
  const highway = $derived.by(() => {
    const notes: HighwayNote[] = [];
    const hits: Record<number, Hit> = {};
    if (view !== "highway") return { notes, hits };
    const flat = scoreGroups(drawn, voiceIds).flatMap((g) => g.notes.map((n) => ({ ...n, group: g.index })));
    const at = assignTab(flat, tuning);
    flat.forEach((n, i) => {
      if (!at[i]) return;
      const st = groupStates[n.group];
      if (st === "correct") hits[notes.length] = "hit";
      else if (st === "wrong" || st === "missed") hits[notes.length] = st;
      notes.push({ startBeat: n.startBeat, durationBeats: n.durationBeats, string: at[i]!.string, fret: at[i]!.fret });
    });
    return { notes, hits };
  });

  const maxHeight = $derived(compact ? (zoom > 1 ? `calc(min(40dvh, 22rem) / ${zoom})` : "min(36dvh, 20rem)") : "min(52dvh, 30rem)");
</script>

<div bind:this={host} class="flex min-w-0 flex-col gap-3 {compact ? 'lg:flex-1' : ''}" class:live-keys={compact}>
  {#if drums}
    <StudioDrums score={drawn} {voiceIds} {cursorBeat} {groupStates} {flashes} {maxHeight} {bpm} {timed} />
  {:else if view === "highway"}
    <NoteHighway notes={highway.notes} noteHits={highway.hits} strings={tuning.openStrings.map((m) => noteName(m, "flat", false))} beat={cursorBeat} barBeats={barBeats(score.meter)} />
  {:else if view === "waterfall"}
    <FallingKeys score={drawn} {voiceIds} {low} {high} beat={cursorBeat} {groupStates} {marks} {flashes} height={compact ? "min(34dvh, 16rem)" : "min(44dvh, 22rem)"} />
  {:else}
    <!-- The score card takes the stage's spare height on a laptop run; the notes sit in its middle. -->
    <div class="rounded-xl bg-ws-surface p-2 text-ws-ink {compact ? 'lg:flex lg:flex-1 lg:flex-col lg:justify-center' : ''}" data-grow={compact || undefined}>
      <div style:zoom={zoom > 1 ? zoom : undefined} style:--nt-zoom={zoom > 1 ? zoom : undefined}>
      {#if view === "tab"}
        <Tab score={drawn} {voiceIds} {tuning} {cursorBeat} {groupStates} bind:selection {onselect} {snap} {bpm} {maxHeight} {onfallback} {highlights} />
      {:else if view === "fingering"}
        <div class="overflow-auto" style:max-height={maxHeight}>
          <FingeringRow score={drawn} {voiceIds} {groupStates} />
        </div>
      {:else}
        <Staff score={staffScore} {voiceIds} {cursorBeat} {groupStates} bind:selection {onselect} {snap} {bpm} {maxHeight} {onfallback} {highlights} />
      {/if}
      </div>
    </div>
    <!-- The keys you play: at the bottom of a phone screen while live; short keys before Start on a phone, so the staff and keys fit above the tab bar. -->
    <div data-dock="answers"><Piano {low} {high} {marks} {flashes} label={m.music_drills_studio_piano_keyboard()} compact={!compact && !wide.current} /></div>
  {/if}
</div>

<style>
  /* A laptop run: taller keys, so the keyboard reads at a glance from the playing position. */
  @media (min-width: 1024px) {
    .live-keys :global(.piano .white) {
      height: 12rem;
    }
    .live-keys :global(.piano .black) {
      height: 7.5rem;
    }
  }
</style>
