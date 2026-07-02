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
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type {
    StringInstrumentId,
    TuningProfile,
  } from "@repo/music-core/engines/tunings";
  import { cn } from "@repo/ui/utils";

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
    wrongMidiNotes?: number[];
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const targetMidiNotes = $derived(steps.map(({ midiNote }) => midiNote));
  const activeMidiNotes = $derived(
    steps[currentIndex]?.midiNote === undefined ? [] : [steps[currentIndex]!.midiNote],
  );
  const correctMidiNotes = $derived(
    steps.slice(0, completedCount).map(({ midiNote }) => midiNote),
  );

  function stateFor(index: number): "complete" | "current" | "upcoming" {
    if (index < completedCount) return "complete";
    if (index === currentIndex) return "current";
    return "upcoming";
  }
</script>

<PracticeStage {instrument} class="min-w-0 space-y-4 overflow-x-auto p-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="eyebrow" data-testid="fretted-sequence-label">{label}</p>
    <p class="text-xs text-muted-foreground tabular-nums">{completedCount}/{steps.length}</p>
  </div>

  <ol class="grid min-w-[18rem] gap-2 sm:grid-cols-4" aria-label="Fretted target sequence">
    {#each steps as step, index (step.id)}
      {@const state = stateFor(index)}
      <li
        data-testid={`fretted-sequence-step-${step.id}`}
        data-state={state}
        aria-current={state === "current" ? "step" : undefined}
        class={cn(
          "rounded-md border px-3 py-2 text-sm",
          state === "complete" && "border-success/60 bg-success/15 text-foreground",
          state === "current" &&
            "border-practice-accent/70 bg-practice-accent/15 text-foreground ring-1 ring-practice-accent/30",
          state === "upcoming" && "border-stage-line bg-stage-2 text-muted-foreground",
        )}
      >
        <span class="block font-medium">{step.label}</span>
        <span class="text-xs">{midiToNote(step.midiNote)}</span>
      </li>
    {/each}
  </ol>

  <FretboardInput
    {tuning}
    {router}
    {targetMidiNotes}
    {activeMidiNotes}
    {correctMidiNotes}
    {wrongMidiNotes}
    {visibleFrets}
    {visibleStrings}
    {onAccepted}
  />
</PracticeStage>
