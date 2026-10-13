<script lang="ts">
  // A drill's line written out above its instrument, with a cursor that runs
  // with the click or the demo so the next notes can be read ahead: tab on a
  // fretted instrument (each note at its string and fret), a staff otherwise
  // (both hands on a grand staff when the notes carry hands). A short line
  // engraves small, so it is zoomed to fill the stage (as sight-reading does).
  import type { Score, ScoreVoice } from "@repo/music-core";
  import Tab from "./Tab.svelte";
  import Staff from "./Staff.svelte";
  import type { GroupState } from "./NotationFrame.svelte";

  interface Props {
    notes: { midi: number; startBeat: number; durationBeats: number; string?: number; fret?: number; hand?: "left" | "right" }[];
    /** Tab for this tuning; a staff without one. */
    tuning?: { openStrings: number[]; fretCount: number; name?: string } | null;
    title: string;
    cursorBeat?: number | null;
    /** By group index (each attack is a group). */
    groupStates?: Record<number, GroupState>;
    beatsPerBar?: number;
    /** The staff's key signature, in fifths (flats negative). */
    keyFifths?: number;
    /** The written time signature when it isn't beatsPerBar/4 (6/8, 3/8). */
    meter?: [number, number];
  }
  let { notes, tuning = null, title, cursorBeat = null, groupStates = {}, beatsPerBar = 4, keyFifths = 0, meter }: Props = $props();
  const barBeats = $derived(meter ? (meter[0] * 4) / meter[1] : beatsPerBar);

  const end = $derived(notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0));
  const voices = $derived.by((): ScoreVoice[] => {
    const strip = ({ hand: _h, ...n }: Props["notes"][number]) => n;
    if (tuning || !notes.some((n) => n.hand)) return [{ id: "line", name: "Line", notes: notes.map(strip) }];
    return (["right", "left"] as const).flatMap((hand) => {
      const own = notes.filter((n) => (n.hand ?? "right") === hand).map(strip);
      return own.length ? [{ id: hand === "right" ? "rh" : "lh", name: hand === "right" ? "Right hand" : "Left hand", hand, notes: own }] : [];
    });
  });
  const score = $derived<Score>({
    id: `line-${title}-${notes.map((n) => `${n.midi}.${n.string}.${n.fret}@${n.startBeat}`).join(",")}`,
    title,
    bpm: 90,
    meter: meter ? { beats: meter[0], beatUnit: meter[1] } : { beats: beatsPerBar, beatUnit: 4 },
    keyFifths,
    voices,
    lengthBeats: Math.max(barBeats, Math.ceil(end / barBeats - 1e-9) * barBeats),
    source: { kind: "generated" },
  });
  let width = $state(0);
  // Measured: a line engraves at about 90 px plus 25 a note (Spider's 16 notes 521 px,
  // Fingerpicking's 32 notes 896 px). A short line is zoomed up to fill the stage; a
  // long one down (to 0.7) so it fits on fewer systems instead of spilling a near-empty one.
  const attacks = $derived(new Set(notes.map((n) => n.startBeat)).size);
  const zoom = $derived(width ? Math.min(1.6, Math.max(0.7, width / (90 + 25 * attacks))) : 1);
  // The visible height is capped whatever the zoom (a grand staff at 20rem); taller scrolls.
  const maxHeight = $derived(`${((voices.length > 1 ? 20 : 16) / zoom).toFixed(2)}rem`);
</script>

<div class="line-notation" data-testid={tuning ? "line-tab" : "line-staff"} bind:clientWidth={width}>
  <div style:zoom={zoom}>
    {#if tuning}
      <Tab {score} {tuning} {cursorBeat} {groupStates} fill {maxHeight} />
    {:else}
      <Staff {score} {cursorBeat} {groupStates} fill {maxHeight} />
    {/if}
  </div>
</div>
