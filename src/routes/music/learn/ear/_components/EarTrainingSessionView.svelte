<script lang="ts">
  import AudioWaveform from "lucide-svelte/icons/audio-waveform";
  import Ear from "lucide-svelte/icons/ear";
  import { cn } from "@repo/ui/utils";

  import { DEGREE_CLASS } from "../../../_components/degree-classes";


  import type { InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import type { InputSurfaceId } from "@repo/music-core/engines/device-profiles";
  import type { EarTrainingSessionState } from "@repo/music-core/engines/ear-training";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type { ScaleDegreeRecognitionPrompt } from "@repo/music-core/exercises/scale-degree-recognition";

  import { Button } from "@repo/ui/button";

  import HudTile from "../../../_components/HudTile.svelte";
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
    state: sessionState,
    router,
    instrument = "piano",
    surface = "keyboard",
    voiceStatus,
    answerReady = true,
    onReplay,
    onPlayTonic,
    onAnswer,
    onContinue,
    onReveal,
    onAccepted,
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
    onContinue: () => void;
    onReveal: () => void;
    onAccepted: (event: NoteEvent) => void;
  } = $props();

  const prompt = $derived(sessionState.currentPrompt);
  const listeningAlong = $derived(sessionState.options.answerMode === "listen-along");
  const correction = $derived(sessionState.awaitingContinue ? sessionState.results.at(-1) : undefined);
  const selectedAnswer = $derived.by(() => {
    if (!correction) return "";
    const answer = correction.result.answer;
    if (typeof answer === "string") return prompt?.choices.find((choice) => choice.token === answer)?.label ?? answer;
    return correction.result.input.filter((event) => event.type === "noteOn" && event.source !== "click").map((event) => midiToNote(event.midiNote)).join(" · ") || "No answer";
  });
  let promptHeading = $state<HTMLHeadingElement | undefined>();
  let feedbackHeading = $state<HTMLHeadingElement | undefined>();
  let revealedAnswer = $state<HTMLParagraphElement | undefined>();
  $effect(() => {
    if (sessionState.awaitingContinue) feedbackHeading?.focus();
    else if (sessionState.answerRevealed && !listeningAlong) revealedAnswer?.focus();
    else if (sessionState.currentIndex > 0 && !listeningAlong) promptHeading?.focus();
  });
  const latestPhraseResult = $derived.by(() => {
    const result = sessionState.results.at(-1);
    if (
      !result ||
      (result.drill !== "melody-dictation" && result.drill !== "repertoire-transfer") ||
      sessionState.feedback.length === 0
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
  const total = $derived(sessionState.queue.length);
  const answered = $derived(sessionState.results.length);
  const correctCount = $derived(sessionState.results.filter((result) => result.event.correct).length);
  const accuracyPct = $derived(answered > 0 ? Math.round((correctCount / answered) * 100) : 0);
  const feedbackKind = $derived(sessionState.feedback[0]?.severity === "good" ? "correct" : "wrong");

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
    <SegmentProgress {total} current={listeningAlong ? sessionState.currentIndex : answered} label="Session" />
  {/if}

  <!-- replay, accuracy, prompt -->
  <div class="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
    <button
      type="button"
      onclick={onReplay}
      aria-label="Replay sound"
      class="grid size-24 place-items-center justify-self-center rounded-full border-2 border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span class="flex flex-col items-center gap-1">
        <AudioWaveform class="size-8" aria-hidden="true" />
        <span class="text-[10px] font-semibold uppercase tracking-wide">Replay sound</span>
      </span>
    </button>
    <div class="grid gap-3">
      <div class="flex items-start gap-3 rounded-lg border bg-card p-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Ear class="size-5" aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 bind:this={promptHeading} tabindex="-1" class="text-lg font-semibold tracking-tight">
            What {scaleDegreePrompt?.labelMode === "solfege"
              ? "solfege syllable"
              : drillLabel.toLowerCase()} did you hear?
          </h2>
          <p class="text-sm text-muted-foreground">
            {correction
              ? "Review your answer and replay the sound, then Continue."
              : prompt?.drill === "melody-dictation"
              ? "Play back the phrase on MIDI or the on-screen keyboard."
              : prompt?.drill === "repertoire-transfer"
                ? "Play back the saved-song phrase on MIDI or the on-screen keyboard."
                : sessionState.options.answerMode === "choice"
                  ? "Listen, then choose an answer below."
                  : sessionState.options.answerMode === "listen"
                    ? "Pocket recall: think or sing your answer, then reveal and self-rate."
                    : listeningAlong
                      ? "Listen along: answers are visible and prompts advance automatically. Unscored."
                    : sessionState.options.answerMode === "voice"
                      ? "Sing the answer into the microphone."
                      : "Play the answer on MIDI or the on-screen keyboard."}
          </p>
        </div>
      </div>
      {#if !listeningAlong && sessionState.options.feedbackMode !== "test"}
      <div class="grid grid-cols-2 gap-3">
        <HudTile size="sm" label={sessionState.options.answerMode === "listen" ? "Self-rated recall" : "Accuracy"} value={accuracyPct} unit="%" tone={answered > 0 && accuracyPct >= 90 ? "good" : "default"} />
        <HudTile size="sm" label={sessionState.options.answerMode === "listen" ? "Reported recalled" : "Correct"} value={`${correctCount} / ${answered}`} />
      </div>
      {/if}
    </div>
  </div>

  <!-- answers -->
  {#if correction}
    <section class="grid gap-3 rounded-lg border bg-card p-5" aria-label="Answer correction" data-testid="feedback">
      <h3 bind:this={feedbackHeading} tabindex="-1" class="text-lg font-semibold">{correction.event.correct ? "Correct" : "Review this answer"}</h3>
      <p>Your answer: <strong>{selectedAnswer}</strong></p>
      <p>Correct answer: <strong>{correction.prompt.answerLabel}</strong></p>
      {#if sessionState.feedback[0]}<SessionFeedback kind={feedbackKind} message={sessionState.feedback[0].message} />{/if}
      {#if latestPhraseResult}<PhraseResultFeedback result={latestPhraseResult} />{/if}
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" onclick={onReplay}>Replay answered sound</Button>
        <Button onclick={onContinue}>Continue</Button>
      </div>
    </section>
  {:else if prompt && sessionState.options.answerMode === "choice"}
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
              class={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border bg-card transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                DEGREE_CLASS[choice.token],
              )}
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
            class="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border bg-card text-lg font-bold transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {choice.label}
          </button>
        {/each}
      </div>
    {/if}
  {:else if
    prompt &&
    (sessionState.options.answerMode === "play-back" || sessionState.options.answerMode === "voice") &&
    !answerReady}
    <div class="rounded-lg border bg-card p-5 text-center">
      <p class="text-lg font-semibold">Get ready</p>
      <p class="text-sm text-muted-foreground">Listen to the count-in. Input opens on the downbeat.</p>
    </div>
  {:else if prompt && sessionState.options.answerMode === "voice"}
    <div class="rounded-lg border bg-card p-5">
      <div class="grid gap-2 text-center">
        <p class="text-lg font-semibold">Sing the answer</p>
        <p class="text-sm text-muted-foreground">
          Match the target scale degree with your voice. {voiceStatus ?? ""}
        </p>
      </div>
    </div>
  {:else if prompt && (sessionState.options.answerMode === "listen" || listeningAlong)}
    <div class="grid gap-4 rounded-lg border bg-card p-5">
      <div class="grid gap-1 text-center">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {listeningAlong ? "Listen along · Unscored" : "Pocket recall · Self-rated"}
        </p>
        {#if listeningAlong || sessionState.answerRevealed}<p bind:this={revealedAnswer} tabindex="-1" class="text-2xl font-bold" data-testid="revealed-answer">{prompt.answerLabel}</p>{/if}
        <p class="text-sm text-muted-foreground">
          {listeningAlong ? "Follow the sound and answer. The next prompt plays automatically." : sessionState.answerRevealed ? "Did you recall it before revealing? This is self-reported, not detected pitch." : "Think or sing your answer before revealing it."}
        </p>
      </div>
      {#if !listeningAlong}
      {#if sessionState.answerRevealed}
      <div class="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onclick={() => onAnswer("__listen_missed")}>
          Missed it
        </Button>
        <Button type="button" onclick={() => onAnswer("__listen_correct")}>I recalled it</Button>
      </div>
      {:else}
        <Button onclick={onReveal}>Reveal answer</Button>
      {/if}
      {/if}
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
    <div class="rounded-lg border bg-card p-5">
      <InputSurface {router} {surface} {instrument} notes={CHROMATIC_NOTES} {onAccepted} />
    </div>
  {/if}

</div>
