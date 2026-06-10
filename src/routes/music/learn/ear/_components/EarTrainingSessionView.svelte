<script lang="ts">
  import AudioWaveform from "lucide-svelte/icons/audio-waveform";
  import Ear from "lucide-svelte/icons/ear";
  import Target from "lucide-svelte/icons/target";
  import Zap from "lucide-svelte/icons/zap";

  import type { InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import type { InputSurfaceId } from "@repo/music-core/engines/device-profiles";
  import type { EarTrainingSessionState } from "@repo/music-core/engines/ear-training";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { masteryTone } from "@repo/music-core/engines/semantic-color";

  import { toneTextClass } from "../../../_components/semantic-color";
  import { Button } from "@repo/ui/button";

  import InputSurface from "../../../_components/InputSurface.svelte";
  import SegmentProgress from "../../../_components/SegmentProgress.svelte";
  import SessionFeedback from "../../../_components/SessionFeedback.svelte";

  const CHROMATIC_NOTES = [
    "C4",
    "C#4",
    "D4",
    "D#4",
    "E4",
    "F4",
    "F#4",
    "G4",
    "G#4",
    "A4",
    "A#4",
    "B4",
    "C5",
  ];

  let {
    state,
    router,
    instrument = "piano",
    surface = "keyboard",
    onReplay,
    onAnswer,
    onAccepted,
    onAbandon,
  }: {
    state: EarTrainingSessionState;
    router: InputRouter;
    instrument?: InstrumentId;
    surface?: InputSurfaceId;
    onReplay: () => void;
    onAnswer: (token: string) => void;
    onAccepted: (event: NoteEvent) => void;
    onAbandon: () => void;
  } = $props();

  const prompt = $derived(state.currentPrompt);
  const drillLabel = $derived(
    prompt?.drill === "chord-quality"
      ? "Chord Quality"
      : prompt?.drill === "scale-degree"
        ? "Scale Degree"
        : "Interval",
  );
  const total = $derived(state.queue.length);
  const answered = $derived(state.results.length);
  const correctCount = $derived(state.results.filter((result) => result.event.correct).length);
  const accuracyPct = $derived(answered > 0 ? Math.round((correctCount / answered) * 100) : 0);
  const accuracyToneClass = $derived(
    answered === 0 ? "text-muted-foreground" : toneTextClass[masteryTone(accuracyPct)],
  );
  const combo = $derived.by(() => {
    let streak = 0;
    for (let index = state.results.length - 1; index >= 0; index -= 1) {
      if (state.results[index]!.event.correct) streak += 1;
      else break;
    }
    return streak;
  });
  const feedbackKind = $derived(state.feedback[0]?.severity === "good" ? "correct" : "wrong");
</script>

<div class="flex min-w-0 flex-col gap-6">
  {#if total > 0}
    <SegmentProgress {total} current={answered} label="Session" />
  {/if}

  <!-- combo / replay orb / accuracy -->
  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
    <div class="flex flex-col items-center gap-1 rounded-2xl border bg-card p-4">
      <span class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Zap class="size-3" aria-hidden="true" /> Combo
      </span>
      <span class="text-3xl font-bold tabular-nums text-primary">{combo}</span>
      <span class="text-[10px] text-muted-foreground">🔥 +1 each hit</span>
    </div>

    <button
      type="button"
      onclick={onReplay}
      aria-label="Replay sound"
      class="group relative grid size-40 place-items-center rounded-full border-2 border-primary/30 bg-primary/5 transition-colors hover:bg-primary/10"
    >
      <span class="absolute inset-0 animate-ping rounded-full border border-primary/20" aria-hidden="true"></span>
      <span class="flex flex-col items-center gap-2 text-primary">
        <AudioWaveform class="size-12" aria-hidden="true" />
        <span class="text-xs font-semibold uppercase tracking-wide">Replay sound</span>
      </span>
    </button>

    <div class="flex flex-col items-center gap-1 rounded-2xl border bg-card p-4">
      <span class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Target class="size-3" aria-hidden="true" /> Accuracy
      </span>
      <span class="text-3xl font-bold tabular-nums {accuracyToneClass}">{accuracyPct}%</span>
      <span class="text-[10px] text-muted-foreground">{correctCount}/{answered} correct</span>
    </div>
  </div>

  <!-- prompt -->
  <div class="flex items-center gap-4 rounded-2xl border bg-card p-5">
    <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <Ear class="size-5" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <h2 class="text-lg font-bold tracking-tight">What {drillLabel.toLowerCase()} did you hear?</h2>
      <p class="text-sm text-muted-foreground">
        {state.options.answerMode === "choice"
          ? "Listen, then choose — or play it on your instrument."
          : "Play the answer on MIDI or the on-screen keyboard."}
      </p>
    </div>
    <Button type="button" variant="ghost" onclick={onAbandon}>End session</Button>
  </div>

  <!-- answers -->
  {#if prompt && state.options.answerMode === "choice"}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Answer choices">
      {#each prompt.choices as choice (choice.token)}
        <button
          type="button"
          onclick={() => onAnswer(choice.token)}
          class="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border bg-card text-lg font-bold transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          {choice.label}
        </button>
      {/each}
    </div>
  {:else if prompt}
    <div class="rounded-2xl border bg-card p-5">
      <InputSurface {router} {surface} {instrument} notes={CHROMATIC_NOTES} {onAccepted} />
    </div>
  {/if}

  {#if state.options.feedbackMode === "practice" && state.feedback[0]}
    <div data-testid="feedback">
      <SessionFeedback kind={feedbackKind} message={state.feedback[0].message} />
    </div>
  {/if}
</div>
