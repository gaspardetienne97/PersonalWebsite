<script module lang="ts">
  export interface FrettedSequenceStep {
    id: string;
    label: string;
    midiNote: number;
  }
</script>

<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import type { FretWindow } from "@repo/music-core/engines/projection";
  import type {
    StringInstrumentId,
    TuningProfile,
  } from "@repo/music-core/engines/tunings";

  import FretboardInput from "../learn/reading/_components/FretboardInput.svelte";
  import PracticeStage from "./PracticeStage.svelte";

  let {
    instrument,
    label,
    tuning,
    router,
    steps,
    completedCount = 0,
    currentIndex = 0,
    visibleFrets = 12,
    visibleStrings,
    fretWindow,
    dotLabels,
    showTargetNotes = true,
    showActiveTarget = true,
    wrongMidiNotes = [],
    onAccepted,
  }: {
    instrument: StringInstrumentId;
    label: string;
    tuning: TuningProfile;
    router: InputRouter;
    steps: FrettedSequenceStep[];
    completedCount?: number;
    currentIndex?: number;
    visibleFrets?: number;
    visibleStrings?: number[];
    /** Show only this stretch of the neck; see FretboardInput. */
    fretWindow?: FretWindow;
    /** Text on each target dot per MIDI note (finger numbers); defaults to note names. */
    dotLabels?: Record<number, string>;
    showTargetNotes?: boolean;
    showActiveTarget?: boolean;
    wrongMidiNotes?: number[];
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const targetMidiNotes = $derived(showTargetNotes ? steps.map(({ midiNote }) => midiNote) : []);
  const activeMidiNotes = $derived(
    !showActiveTarget || steps[currentIndex]?.midiNote === undefined
      ? []
      : [steps[currentIndex]!.midiNote],
  );
  const correctMidiNotes = $derived(
    steps.slice(0, completedCount).map(({ midiNote }) => midiNote),
  );
</script>

<!-- The instrument is the stage: only the fretboard, with targets, the next note and completed notes lit. -->
<PracticeStage {instrument} class="min-w-0 overflow-x-auto p-4" aria-label={label}>
  <FretboardInput
    {tuning}
    {router}
    {targetMidiNotes}
    {activeMidiNotes}
    {correctMidiNotes}
    {wrongMidiNotes}
    {visibleFrets}
    {visibleStrings}
    {fretWindow}
    {dotLabels}
    {onAccepted}
  />
</PracticeStage>
