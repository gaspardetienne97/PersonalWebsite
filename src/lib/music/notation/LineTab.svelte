<script lang="ts">
  // A fretted line as tab, its notes at their own strings and frets, with a
  // cursor that runs with the click or the demo, so the next notes can be read
  // ahead. A short line engraves small, so it is zoomed to fill the stage (as
  // sight-reading does).
  import type { Score } from "@repo/music-core";
  import Tab from "./Tab.svelte";
  import type { GroupState } from "./NotationFrame.svelte";

  interface Props {
    notes: { midi: number; startBeat: number; durationBeats: number; string?: number; fret?: number }[];
    tuning: { openStrings: number[]; fretCount: number; name?: string };
    title: string;
    cursorBeat?: number | null;
    /** By note index (each note is its own group). */
    groupStates?: Record<number, GroupState>;
    beatsPerBar?: number;
  }
  let { notes, tuning, title, cursorBeat = null, groupStates = {}, beatsPerBar = 4 }: Props = $props();

  const end = $derived(notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0));
  const score = $derived<Score>({
    id: `tab-${title}-${notes.map((n) => `${n.string}.${n.fret}@${n.startBeat}`).join(",")}`,
    title,
    bpm: 90,
    meter: { beats: beatsPerBar, beatUnit: 4 },
    voices: [{ id: "line", name: "Line", notes: notes.map((n) => ({ ...n })) }],
    lengthBeats: Math.max(beatsPerBar, Math.ceil(end / beatsPerBar) * beatsPerBar),
    source: { kind: "generated" },
  });
  let width = $state(0);
  // Measured: a line engraves at about 90 px plus 25 a note (Spider's 16 notes 521 px,
  // Fingerpicking's 32 notes 896 px). The engraver doesn't stretch a short last line,
  // so the line is drawn to fill; the zoom only sizes the glyphs, never below a note's natural room.
  const attacks = $derived(new Set(notes.map((n) => n.startBeat)).size);
  const zoom = $derived(width ? Math.min(1.6, Math.max(1, width / (90 + 25 * attacks))) : 1);
</script>

<div class="line-tab" data-testid="line-tab" bind:clientWidth={width}>
  <div style:zoom={zoom}>
    <Tab {score} {tuning} {cursorBeat} {groupStates} fill maxHeight="13rem" />
  </div>
</div>
