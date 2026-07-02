<script lang="ts">
  import type { InstrumentId, NoteEvent, Score } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import type { NotationView } from "@repo/music-core/engines/notation";
  import type { ExpectedNoteGroup } from "@repo/music-core/engines/score-follower";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import { Button } from "@repo/ui/button";
  import { cn } from "@repo/ui/utils";

  import FretboardInput from "../learn/reading/_components/FretboardInput.svelte";
  import PianoInput from "../learn/reading/_components/PianoInput.svelte";
  import StaffNotation from "./StaffNotation.svelte";
  import TabNotation from "./TabNotation.svelte";
  import type { NotationRangeHighlight } from "./notation-selection";
  import type { InstrumentProjection } from "@repo/music-core/engines/projection";

  let {
    score,
    view,
    groups,
    currentGroupIndex = 0,
    instrument,
    router,
    inputEnabled = true,
    activeMidiNotes = [],
    wrongMidiNotes = [],
    pianoNotes = [],
    pianoHandHint,
    suggestedFingerings,
    tuning,
    tabProjection,
    showTab = false,
    onShowTabChange,
    onExpectedNoteSelected,
    onAccepted,
  }: {
    score: Score;
    view: NotationView;
    groups: ExpectedNoteGroup[];
    currentGroupIndex?: number;
    instrument: Extract<InstrumentId, "piano" | "guitar" | "ukulele">;
    router: InputRouter;
    inputEnabled?: boolean;
    activeMidiNotes?: number[];
    wrongMidiNotes?: number[];
    pianoNotes?: number[];
    pianoHandHint?: string;
    suggestedFingerings?: Record<number, number>;
    tuning?: TuningProfile;
    tabProjection?: InstrumentProjection;
    showTab?: boolean;
    onShowTabChange?: (showTab: boolean) => void;
    onExpectedNoteSelected?: (midiNote: number) => void;
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const currentGroup = $derived(groups[currentGroupIndex]);
  const targetNotes = $derived(currentGroup?.midiNotes ?? []);
  const currentNotationEventIds = $derived.by(() => {
    if (!currentGroup) return [];
    const currentNotes = currentGroup.sourceNoteIndexes
      .map((index) => score.notes[index])
      .filter((note) => note !== undefined);

    return view.measures
      .flatMap(({ events }) => events)
      .filter(
        (event) =>
          event.kind === "note" &&
          currentNotes.some(
            (note) =>
              note.voiceId === event.voiceId &&
              note.startBeat === event.startBeat &&
              note.durationBeats === event.durationBeats,
          ),
      )
      .map(({ id }) => id);
  });
  const currentNotationHighlights = $derived.by<NotationRangeHighlight[]>(() => {
    if (!currentGroup) return [];
    return [
      {
        id: "current-group",
        startBeat: currentGroup.startBeat,
        endBeat: currentGroup.startBeat + currentGroup.durationBeats,
        active: true,
      },
    ];
  });
  const resolvedPianoNotes = $derived(
    pianoNotes.length > 0
      ? pianoNotes
      : Array.from(new Set(score.notes.map(({ midiNote }) => midiNote))).sort(
          (left, right) => left - right,
        ),
  );

  function toggleTab(): void {
    onShowTabChange?.(!showTab);
  }
</script>

<div class="grid min-w-0 gap-6">
  <StaffNotation
    {view}
    activeEventIds={currentNotationEventIds}
    highlightedRanges={currentNotationHighlights}
  />

  {#if tuning && tabProjection}
    <div class="grid gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        class="justify-self-start"
        aria-pressed={showTab}
        onclick={toggleTab}
      >
        {showTab ? "Hide tab" : "Show tab"}
      </Button>
      {#if showTab}
        <TabNotation {view} projection={tabProjection} {tuning} />
      {/if}
    </div>
  {/if}

  {#if inputEnabled}
    <div class="grid gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium">Expected notes</p>
          <p class="text-sm text-muted-foreground" data-testid="score-current-notes">
            {targetNotes.length === 0
              ? "Phrase complete"
              : targetNotes.map((midiNote) => midiToNote(midiNote)).join(", ")}
          </p>
          {#if pianoHandHint}
            <p
              class="mt-1 text-xs font-semibold text-muted-foreground"
              data-testid="score-hand-hint"
            >
              {pianoHandHint}
            </p>
          {/if}
        </div>
        <div class="flex flex-wrap gap-2">
          {#each targetNotes as midiNote (midiNote)}
            <Button
              type="button"
              variant="secondary"
              data-testid="score-expected-note"
              class={cn(activeMidiNotes.includes(midiNote) && "ring-2 ring-practice-accent/40")}
              onclick={() => onExpectedNoteSelected?.(midiNote)}
            >
              {midiToNote(midiNote)}
            </Button>
          {/each}
        </div>
      </div>

      {#if instrument === "piano"}
        <PianoInput
          midiNotes={resolvedPianoNotes}
          targetMidiNotes={targetNotes}
          {activeMidiNotes}
          {wrongMidiNotes}
          {suggestedFingerings}
          {router}
          {onAccepted}
        />
      {:else if tuning}
        <FretboardInput
          {tuning}
          targetMidiNotes={targetNotes}
          {wrongMidiNotes}
          {router}
          visibleFrets={Math.min(12, tuning.fretCount)}
          {onAccepted}
        />
      {/if}
    </div>
  {/if}
</div>
