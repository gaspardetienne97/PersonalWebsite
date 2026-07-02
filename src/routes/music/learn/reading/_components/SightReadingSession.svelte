<script lang="ts">
  import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import {
    projectScoreToFretboard,
    projectScoreToPiano,
  } from "@repo/music-core/engines/projection";
  import type { ReadingSessionState } from "@repo/music-core/engines/reading-session";
  import { beatToMs, type ScoreFollowerLiveState } from "@repo/music-core/engines/score-follower";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import type { SightReadingPrompt } from "@repo/music-core/exercises/sight-reading";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import PracticeDrillShell from "../../../_components/PracticeDrillShell.svelte";
  import ScoreFollowerStage from "../../../_components/ScoreFollowerStage.svelte";
  import { suggestedFingerings } from "../../../_components/piano-visual";

  let {
    sessionState,
    router,
    tuning,
    sessionXp,
    onAccepted,
    onStart,
    onFinish,
    onAbandon,
  }: {
    sessionState: ReadingSessionState;
    router: InputRouter;
    tuning?: TuningProfile;
    sessionXp: number;
    onAccepted: (event: NoteEvent) => void;
    onStart: () => Promise<number>;
    onFinish: () => Promise<void>;
    onAbandon: () => void;
  } = $props();

  const prompt = $derived(sessionState.currentPrompt as SightReadingPrompt | undefined);
  const live = $derived(sessionState.live as ScoreFollowerLiveState | undefined);
  const currentGroup = $derived(prompt?.groups[live?.currentGroupIndex ?? 0]);
  const progress = $derived(live?.progress ?? 0);
  const started = $derived(sessionState.countIn === "playing");
  const complete = $derived(progress >= 1);
  const mode = $derived(prompt?.options.mode ?? "wait");
  const canFinish = $derived(complete || (started && mode === "performance"));
  const pianoProjection = $derived(
    prompt?.options.instrument === "piano" ? projectScoreToPiano(prompt.score) : undefined,
  );
  const pianoHandHint = $derived.by(() => {
    if (!currentGroup || !pianoProjection) return undefined;
    const hands = new Set(
      pianoProjection.notes
        .filter(({ sourceIndex }) => currentGroup.sourceNoteIndexes.includes(sourceIndex))
        .flatMap(({ hand }) => (hand === undefined ? [] : [hand])),
    );
    if (hands.size > 1) return "Both hands";
    if (hands.has("left")) return "Left hand";
    if (hands.has("right")) return "Right hand";
    return undefined;
  });
  const pianoFingerings = $derived.by(() => {
    if (!currentGroup || !pianoProjection) return {};
    const notes = pianoProjection.notes.filter(({ sourceIndex }) =>
      currentGroup.sourceNoteIndexes.includes(sourceIndex),
    );
    return {
      ...suggestedFingerings(
        notes.filter(({ hand }) => hand === "left").map(({ midiNote }) => midiNote),
        "left",
      ),
      ...suggestedFingerings(
        notes.filter(({ hand }) => hand !== "left").map(({ midiNote }) => midiNote),
        "right",
      ),
    };
  });
  const pianoNotes = $derived(
    prompt
      ? Array.from(
          {
            length:
              Math.min(96, Math.max(...prompt.score.notes.map(({ midiNote }) => midiNote)) + 12) -
              Math.max(24, Math.min(...prompt.score.notes.map(({ midiNote }) => midiNote)) - 12) +
              1,
          },
          (_, index) =>
            Math.max(24, Math.min(...prompt.score.notes.map(({ midiNote }) => midiNote)) - 12) +
            index,
        )
      : [],
  );
  let startTimestampMs = $state(0);

  // Opt-in fretboard reveal for guitar/ukulele — hidden by default so it
  // doesn't short-circuit reading the staff.
  let showTab = $state(false);
  const tabProjection = $derived(
    tuning && prompt ? projectScoreToFretboard(prompt.score, tuning) : undefined,
  );

  async function start(): Promise<void> {
    startTimestampMs = await onStart();
  }

  function playExpected(midiNote: number): void {
    if (!prompt || !currentGroup) return;
    const timestamp =
      mode === "performance"
        ? startTimestampMs + beatToMs(currentGroup.startBeat, prompt.options.bpm)
        : performance.now();
    const event: NoteEvent = {
      type: "noteOn",
      midiNote,
      velocity: 1,
      source: "onscreen",
      timestamp: monotonicMs(timestamp),
      clock: "performance",
      instrument: prompt.options.instrument,
      ...(prompt.options.tuning === undefined ? {} : { inputProfileId: prompt.options.tuning.id }),
    };
    router.push(event);
    onAccepted(event);
  }
</script>

{#if prompt}
  <PracticeDrillShell>
    {#snippet stage()}
    <Card.Root class="min-w-0">
      <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-1">
          <Card.Description>
            {prompt.options.instrument === "piano" ? "Piano" : (tuning?.name ?? prompt.options.instrument)}
            · {prompt.options.bpm} BPM · {prompt.options.keySignature}
          </Card.Description>
          <Card.Title>Sight-reading phrase</Card.Title>
        </div>
        <Button type="button" variant="ghost" onclick={onAbandon}>End session</Button>
      </Card.Header>
      <Card.Content class="grid min-w-0 gap-6">
        {#if !started}
          <ScoreFollowerStage
            score={prompt.score}
            view={prompt.notation}
            groups={prompt.groups}
            currentGroupIndex={live?.currentGroupIndex ?? 0}
            instrument={prompt.options.instrument}
            {tuning}
            {tabProjection}
            {showTab}
            onShowTabChange={(value) => (showTab = value)}
            router={router}
            inputEnabled={false}
          />
          <div class="flex flex-wrap items-center gap-3 rounded-md border bg-muted px-4 py-3">
            <span class="text-sm font-medium">Count-in ready</span>
            <Button type="button" onclick={start}>Start count-in</Button>
          </div>
        {:else}
          <ScoreFollowerStage
            score={prompt.score}
            view={prompt.notation}
            groups={prompt.groups}
            currentGroupIndex={live?.currentGroupIndex ?? 0}
            instrument={prompt.options.instrument}
            {tuning}
            {tabProjection}
            {showTab}
            onShowTabChange={(value) => (showTab = value)}
            router={router}
            activeMidiNotes={live?.heldMidiNotes ?? []}
            wrongMidiNotes={live?.wrongMidiNotes ?? []}
            {pianoNotes}
            {pianoHandHint}
            suggestedFingerings={pianoFingerings}
            onExpectedNoteSelected={playExpected}
            {onAccepted}
          />
        {/if}

        {#if sessionState.error}
          <p class="rounded-md border border-destructive px-4 py-3 text-sm text-destructive">
            {sessionState.error}
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
    {/snippet}

    {#snippet rail()}
      <Card.Root>
        <Card.Header>
          <Card.Description>{mode === "performance" ? "Assess mode" : "Learn mode"}</Card.Description>
          <Card.Title>{Math.round(progress * 100)}%</Card.Title>
        </Card.Header>
        <Card.Content>
          <Progress value={progress} max={1} />
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Timing feedback</Card.Description>
          <Card.Title>
            {mode === "performance"
              ? `${prompt.options.strictness[0]!.toUpperCase() + prompt.options.strictness.slice(1)} timing`
              : "No timing score"}
          </Card.Title>
          <Card.Description>
            {live?.timingErrorMs === undefined
              ? "Play the current group."
              : live.timingErrorMs < 0
                ? `${Math.abs(live.timingErrorMs)}ms early`
                : `${live.timingErrorMs}ms late`}
          </Card.Description>
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Session XP</Card.Description>
          <Card.Title>{sessionXp}</Card.Title>
        </Card.Header>
      </Card.Root>
      <Button type="button" disabled={!canFinish} onclick={onFinish}>Finish phrase</Button>
    {/snippet}
  </PracticeDrillShell>
{/if}
