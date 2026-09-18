<script lang="ts">
  import type {
    EarTrainingAnswerMode,
    EarTrainingFeedbackMode,
  } from "@repo/music-core/exercises/ear-training";
  import {
    SCALE_DEGREE_SETS,
    type ScaleDegreeLabelMode,
    type ScaleDegreeSetId,
  } from "@repo/music-core/exercises/scale-degree-recognition";
  import { Button } from "@repo/ui/button";

  import SegmentedControl from "../../../_components/SegmentedControl.svelte";

  // The session controls only. The route collapses them behind the shell's
  // setup summary line; Start lives on the ready stage.
  let {
    answerModes = ["choice", "play-back", "listen", "listen-along", "voice"],
    showLevel = true,
    showLabels = true,
    answerMode,
    feedbackMode,
    scaleDegreeSet,
    scaleDegreeLabelMode,
    midiEnabled,
    midiStatus,
    audioSupported,
    voiceStatus,
    onAnswerMode,
    onFeedbackMode,
    onScaleDegreeSet,
    onScaleDegreeLabelMode,
    onEnableMidi,
  }: {
    /** Answer modes this drill supports; others are not offered. */
    answerModes?: EarTrainingAnswerMode[];
    showLevel?: boolean;
    showLabels?: boolean;
    answerMode: EarTrainingAnswerMode;
    feedbackMode: EarTrainingFeedbackMode;
    scaleDegreeSet: ScaleDegreeSetId;
    scaleDegreeLabelMode: ScaleDegreeLabelMode;
    midiEnabled: boolean;
    midiStatus: string;
    audioSupported: boolean;
    voiceStatus: string;
    onAnswerMode: (mode: EarTrainingAnswerMode) => void;
    onFeedbackMode: (mode: EarTrainingFeedbackMode) => void;
    onScaleDegreeSet: (set: ScaleDegreeSetId) => void;
    onScaleDegreeLabelMode: (mode: ScaleDegreeLabelMode) => void;
    onEnableMidi: () => void;
  } = $props();
</script>

<div class="grid gap-5 rounded-lg border bg-card p-4">
  <div class="grid gap-5 sm:grid-cols-2">
    <div class="space-y-2">
      <p class="text-sm font-medium">Feedback</p>
      <SegmentedControl
        size="sm"
        ariaLabel="Feedback mode"
        options={[
          { value: "practice", label: "Practice" },
          { value: "test", label: "Test" },
        ]}
        value={feedbackMode}
        onChange={(mode) => onFeedbackMode(mode as EarTrainingFeedbackMode)}
      />
    </div>
    <div class="space-y-2">
      <p class="text-sm font-medium">Answer</p>
      <div class="flex flex-wrap gap-1 rounded-lg border bg-muted/60 p-1" role="group" aria-label="Answer mode">
        {#each answerModes as mode (mode)}
          <button
            type="button"
            aria-pressed={answerMode === mode}
            disabled={mode === "voice" && !audioSupported}
            onclick={() => onAnswerMode(mode as EarTrainingAnswerMode)}
            class="rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 {answerMode === mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'}"
          >
            {mode === "choice"
              ? "Choice"
              : mode === "voice"
                ? "Voice"
                : mode === "listen"
                  ? "Pocket"
                  : mode === "listen-along"
                    ? "Listen along"
                  : "Play-back"}
          </button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">{voiceStatus}</p>
    </div>
    {#if showLabels}
    <div class="space-y-2">
      <p class="text-sm font-medium">Scale-degree answer labels</p>
      <SegmentedControl
        size="sm"
        ariaLabel="Scale-degree answer labels"
        options={[
          { value: "degree", label: "Degree" },
          { value: "solfege", label: "Solfege" },
        ]}
        value={scaleDegreeLabelMode}
        onChange={(mode) => onScaleDegreeLabelMode(mode as ScaleDegreeLabelMode)}
      />
    </div>
    {/if}
    <div class="flex flex-wrap items-center gap-3 self-end">
      <Button type="button" size="sm" variant="outline" disabled={midiEnabled} onclick={onEnableMidi}>
        {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
      </Button>
      <p class="text-xs text-muted-foreground">{midiStatus}</p>
    </div>
  </div>
  {#if showLevel}
  <div class="space-y-2">
    <p class="text-sm font-medium">Scale-degree level</p>
    <div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Scale-degree level">
      {#each SCALE_DEGREE_SETS as set (set.id)}
        <Button
          type="button"
          size="sm"
          variant={scaleDegreeSet === set.id ? "secondary" : "outline"}
          class="h-auto justify-start whitespace-normal px-3 py-2 text-left"
          aria-pressed={scaleDegreeSet === set.id}
          onclick={() => onScaleDegreeSet(set.id)}
        >
          <span class="grid gap-1">
            <span>{set.title}</span>
            <span class="text-xs font-normal text-muted-foreground">{set.degrees.join(" · ")}</span>
          </span>
        </Button>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">
      Scale-degree sessions and mixed review use the selected degree set.
    </p>
  </div>
  {/if}
</div>
