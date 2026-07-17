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
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type { ScaleDegreeRecognitionPrompt } from "@repo/music-core/exercises/scale-degree-recognition";

  import { toneTextClass } from "../../../_components/semantic-color";
  import { Button } from "@repo/ui/button";

  import InputSurface from "../../../_components/InputSurface.svelte";
  import SegmentProgress from "../../../_components/SegmentProgress.svelte";
  import SessionFeedback from "../../../_components/SessionFeedback.svelte";
  import MelodyDictationStage from "./MelodyDictationStage.svelte";
  import PhraseResultFeedback from "./PhraseResultFeedback.svelte";

  type MelodySlotPrompt = NonNullable<EarTrainingSessionState["currentPrompt"]> & {
    targetMidiNotes: number[];
    tonicMidi?: number;
    sourceTitle?: string;
  };

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
    voiceStatus,
    answerReady = true,
    onReplay,
    onPlayTonic,
    onAnswer,
    onAccepted,
    onAbandon,
  }: {
    state: EarTrainingSessionState;
    router: InputRouter;
    instrument?: InstrumentId;
    surface?: InputSurfaceId;
    voiceStatus?: string;
    answerReady?: boolean;
    onReplay: () => void;
    onPlayTonic?: (midiNote: number) => void;
    onAnswer: (token: string) => void;
    onAccepted: (event: NoteEvent) => void;
    onAbandon: () => void;
  } = $props();

  const prompt = $derived(state.currentPrompt);
  const latestPhraseResult = $derived.by(() => {
    const result = state.results.at(-1);
    if (
      !result ||
      (result.drill !== "melody-dictation" && result.drill !== "repertoire-transfer") ||
      state.feedback.length === 0
    ) {
      return undefined;
    }
    return result;
  });
  const melodySlotPrompt = $derived.by<MelodySlotPrompt | undefined>(() => {
    if (
      !prompt ||
      (prompt.drill !== "melody-dictation" && prompt.drill !== "repertoire-transfer")
    ) {
      return undefined;
    }
    if (!hasNumberArray((prompt as { targetMidiNotes?: unknown }).targetMidiNotes)) {
      return undefined;
    }
    return prompt as MelodySlotPrompt;
  });
  const scaleDegreePrompt = $derived.by<ScaleDegreeRecognitionPrompt | undefined>(() => {
    if (prompt?.drill !== "scale-degree" || !("tonicMidi" in prompt)) return undefined;
    return prompt as ScaleDegreeRecognitionPrompt;
  });
  const drillLabel = $derived(
    prompt?.drill === "chord-quality"
      ? "Chord Quality"
      : prompt?.drill === "cadence"
        ? "Cadence"
        : prompt?.drill === "scale-degree"
          ? "Scale Degree"
          : prompt?.drill === "melody-dictation"
            ? "Melody Dictation"
            : prompt?.drill === "repertoire-transfer"
              ? "Repertoire Transfer"
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

  function contextLabel(context: ScaleDegreeRecognitionPrompt["scaleContext"]): string {
    return {
      major: "Major",
      "natural-minor": "Natural minor",
      "harmonic-minor": "Harmonic minor",
      "melodic-minor": "Melodic minor",
      chromatic: "Chromatic",
    }[context];
  }

  function degreeParts(label: string): { degree: string; solfege: string } {
    const [degree = label, solfege = ""] = label.split("/").map((part) => part.trim());
    return { degree, solfege };
  }

  function hasNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((item) => typeof item === "number");
  }
</script>

<div class="flex min-w-0 flex-col gap-6">
  {#if total > 0}
    <SegmentProgress {total} current={answered} label="Session" />
  {/if}

  <!-- combo / replay orb / accuracy -->
  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
    <div class="flex flex-col items-center gap-1 rounded-2xl border bg-card p-4">
      <span class="flex items-center gap-1 eyebrow">
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
      <span class="flex items-center gap-1 eyebrow">
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
      <h2 class="text-lg font-bold tracking-tight">
        What {scaleDegreePrompt?.labelMode === "solfege"
          ? "solfege syllable"
          : drillLabel.toLowerCase()} did you hear?
      </h2>
      <p class="text-sm text-muted-foreground">
        {prompt?.drill === "melody-dictation"
          ? "Play back the phrase on MIDI or the on-screen keyboard."
          : prompt?.drill === "repertoire-transfer"
            ? "Play back the saved-song phrase on MIDI or the on-screen keyboard."
          : state.options.answerMode === "choice"
          ? "Listen, then choose — or play it on your instrument."
          : state.options.answerMode === "listen"
            ? "Pocket mode: listen, check the answer, then self-mark the rep."
          : state.options.answerMode === "voice"
            ? "Sing the answer into the microphone."
            : "Play the answer on MIDI or the on-screen keyboard."}
      </p>
    </div>
    <Button type="button" variant="ghost" onclick={onAbandon}>End session</Button>
  </div>

  <!-- answers -->
  {#if prompt && state.options.answerMode === "choice"}
    {#if scaleDegreePrompt}
      <div class="grid gap-4">
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4"
          data-testid="scale-degree-context"
        >
          <div>
            <p class="text-sm font-semibold">Tonic context</p>
            <p class="text-sm text-muted-foreground">
              Tonic · {midiToNote(scaleDegreePrompt.tonicMidi)} · {contextLabel(
                scaleDegreePrompt.scaleContext,
              )}
            </p>
          </div>
          <Button type="button" variant="outline" onclick={onReplay}>Hear tonic + target</Button>
        </div>
        <div
          class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          aria-label="Scale-degree answer choices"
        >
          {#each scaleDegreePrompt.choices as choice (choice.token)}
            {@const parts = degreeParts(choice.label)}
            <button
              type="button"
              data-degree-token={choice.token}
              onclick={() => onAnswer(choice.token)}
              class="flex min-h-20 flex-col items-center justify-center gap-1 rounded-md border bg-card transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span class="text-2xl font-bold tabular-nums">{parts.degree}</span>
              <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {parts.solfege}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-label="Answer choices"
      >
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
    {/if}
  {:else if
    prompt &&
    (state.options.answerMode === "play-back" || state.options.answerMode === "voice") &&
    !answerReady}
    <div class="rounded-2xl border bg-card p-5 text-center">
      <p class="text-lg font-semibold">Get ready</p>
      <p class="text-sm text-muted-foreground">Listen to the count-in. Input opens on the downbeat.</p>
    </div>
  {:else if prompt && state.options.answerMode === "voice"}
    <div class="rounded-2xl border bg-card p-5">
      <div class="grid gap-2 text-center">
        <p class="text-lg font-semibold">Sing the answer</p>
        <p class="text-sm text-muted-foreground">
          Match the target scale degree with your voice. {voiceStatus ?? ""}
        </p>
      </div>
    </div>
  {:else if prompt && state.options.answerMode === "listen"}
    <div class="grid gap-4 rounded-2xl border bg-card p-5">
      <div class="grid gap-1 text-center">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pocket mode
        </p>
        <p class="text-2xl font-bold">{prompt.answerLabel}</p>
        <p class="text-sm text-muted-foreground">
          Mark whether you identified it correctly after listening.
        </p>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onclick={() => onAnswer("__listen_missed")}>
          Missed it
        </Button>
        <Button type="button" onclick={() => onAnswer("__listen_correct")}>I heard it</Button>
      </div>
    </div>
  {:else if melodySlotPrompt}
    <MelodyDictationStage
      prompt={melodySlotPrompt}
      {router}
      {surface}
      {instrument}
      {onReplay}
      {onPlayTonic}
      {onAccepted}
    />
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

  {#if latestPhraseResult}
    <PhraseResultFeedback result={latestPhraseResult} />
  {/if}
</div>
