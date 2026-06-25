<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";

  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Play from "lucide-svelte/icons/play";

  import {
    monotonicMs,
    unixMs,
    type ExerciseRunRecord,
    type UnixMs,
  } from "@repo/music-core/domain";
  import { notationView, type NotationView } from "@repo/music-core/engines/notation";
  import {
    filterScoreVoices,
    projectScoreToAerophone,
    projectScoreToFretboard,
  } from "@repo/music-core/engines/projection";
  import { curatedTunings } from "@repo/music-core/engines/tunings";
  import {
    buildScorePracticePlan,
    buildPracticeExecutions,
    buildScoreSelectionMap,
    ScorePracticeSession,
    type ScorePracticePlan,
    type ScorePracticeState,
  } from "@repo/music-core/engines/score-practice";
  import {
    beatToMs,
    expectedGroups,
    timingWindowMs,
  } from "@repo/music-core/engines/score-follower";
  import { scorePlaybackPattern, SongLibrary } from "@repo/music-core/engines/song-library";
  import { PracticeStore, type SongRow } from "@repo/music-core/engines/store";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import MusicXmlScore from "../../_components/MusicXmlScore.svelte";
  import TabNotation from "../../_components/TabNotation.svelte";
  import AerophoneFingering from "../../_components/AerophoneFingering.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentProgress from "../../_components/SegmentProgress.svelte";
  import StaffNotation from "../../_components/StaffNotation.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";
  import ScorePracticeSetup from "./_components/ScorePracticeSetup.svelte";
  import ScorePracticeSummary from "./_components/ScorePracticeSummary.svelte";
  import type { ScorePracticeSetupValue } from "./_components/score-practice-types";

  interface SongLibraryLike {
    get(id: string): Promise<SongRow | undefined>;
  }

  const {
    songId = page.params.id,
    runtime = useMusicRuntime(),
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
  }: {
    songId?: string;
    runtime?: MusicRuntime;
    library?: SongLibraryLike;
  } = $props();

  let song = $state.raw<SongRow>();
  let loading = $state(true);
  let status = $state("Loading score.");
  let selectedVoiceIds = $state<string[]>([]);
  let practicing = $state(false);
  let completed = $state(false);
  let finishing = false;
  let setup = $state<ScorePracticeSetupValue>({
    mode: "wait",
    selection: { kind: "full" },
    bpm: 120,
    strictness: "normal",
    countInBars: 1,
    totalTakes: 1,
  });
  let practiceSession: ScorePracticeSession | undefined;
  let practiceState = $state.raw<ScorePracticeState>();
  let practicePlan: ScorePracticePlan | undefined;
  let executionStartedAt: UnixMs | undefined;
  let executionTimes: Array<{ startedAt: UnixMs; endedAt: UnixMs }> = [];
  let practiceStartedAt: UnixMs | undefined;
  let captureId = "";
  let previousTransport: { bpm: number; countInBars: number } | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeInput = () => undefined;

  const sourceScore = $derived(song?.score);
  const voiceOptions = $derived.by(() => scoreVoiceOptions(sourceScore));
  const score = $derived.by(() => {
    if (!sourceScore) return undefined;
    const selected =
      selectedVoiceIds.length > 0
        ? selectedVoiceIds
        : sourceScore.voices.map(({ id }) => id);
    return filterScoreVoices(sourceScore, selected);
  });
  const selectedPartIds = $derived(
    sourceScore?.origin === "musicxml"
      ? [
          ...new Set(
            selectedVoiceIds.flatMap((id) => {
              const separator = id.indexOf(":voice:");
              return separator > 0 ? [id.slice(0, separator)] : [];
            }),
          ),
        ]
      : undefined,
  );
  const groups = $derived(score ? expectedGroups(score) : []);
  const selectionMap = $derived(score ? buildScoreSelectionMap(score) : undefined);
  const planProjection = $derived.by((): { plan?: ScorePracticePlan; error?: string } => {
    if (!score) return {};
    try {
      return { plan: buildScorePracticePlan(score, setup.selection) };
    } catch (error) {
      return { error: message(error, "Invalid practice range.") };
    }
  });
  const notation = $derived.by(() => notationProjection(score));

  // Tab view: guitar/ukulele projection of the (voice-filtered) canonical score.
  const TAB_TUNINGS = [...curatedTunings("guitar"), ...curatedTunings("ukulele")];
  let notationMode = $state<"staff" | "tab" | "fingering">("staff");
  let tabTuningId = $state(TAB_TUNINGS[0]!.id);
  const tabTuning = $derived(TAB_TUNINGS.find(({ id }) => id === tabTuningId) ?? TAB_TUNINGS[0]!);
  const tabProjection = $derived(score ? projectScoreToFretboard(score, tabTuning) : undefined);
  const aerophoneProjection = $derived(score ? projectScoreToAerophone(score) : undefined);
  // Staff and Tab both support range selection; Fingering can't, so it's hidden
  // while editing a custom range.
  const selectionEditing = $derived(setup.selection.kind === "custom" && !practicing);
  const showTab = $derived(notationMode === "tab");
  const showFingering = $derived(notationMode === "fingering" && !selectionEditing);

  const live = $derived(practiceState?.live);
  const progressPercent = $derived(Math.round((live?.progress ?? 0) * 100));
  const expectedNames = $derived((live?.expectedMidiNotes ?? []).map((note) => midiToNote(note)));
  const keyboardNotes = $derived(
    score
      ? [...new Set(score.notes.map(({ midiNote }) => midiToNote(midiNote)))].slice(0, 16)
      : [],
  );
  const highlightedRanges = $derived.by(() => {
    if (!score || setup.selection.kind !== "sections") return [];
    return setup.selection.sectionIds.flatMap((id) => {
      const section = score.sections.find((candidate) => candidate.id === id);
      return section
        ? [
            {
              id: section.id,
              startBeat: section.startBeat,
              endBeat: section.endBeat,
              active: practiceState?.currentSegmentId === section.id,
            },
          ]
        : [];
    });
  });
  const customSelection = $derived(
    setup.selection.kind === "custom"
      ? { startBeat: setup.selection.startBeat, endBeat: setup.selection.endBeat }
      : undefined,
  );

  onMount(() => {
    unsubscribeInput = runtime.router.subscribe((event) => {
      if (!practicing || !practiceSession) return;
      practiceState = practiceSession.accept(event);
      if (setup.mode === "wait" && (practiceState.live?.progress ?? 0) >= 1) {
        void finishCurrentExecution();
      }
    });
    void loadSong();
  });

  $effect(() => {
    if (!song || !score) {
      runtime.setPlaybackSource(undefined);
      return;
    }
    const pattern = scorePlaybackPattern(score);
    runtime.setPlaybackSource({
      label: song.title,
      durationSec: pattern.reduce(
        (end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds),
        0,
      ),
      play: () => runtime.sound.playPattern(pattern),
    });
  });

  onDestroy(() => {
    clearPracticeTimers();
    runtime.stopPracticeClock();
    restoreTransportPreferences();
    unsubscribeInput();
    runtime.setPlaybackSource(undefined);
  });

  async function loadSong(): Promise<void> {
    if (!library || !songId) {
      loading = false;
      status = "Song storage is unavailable.";
      return;
    }
    try {
      song = await library.get(songId);
      if (song?.score) {
        selectedVoiceIds = song.score.voices.map(({ id }) => id);
        setup = {
          ...setup,
          bpm: Math.round(song.score.tempoMap[0]?.bpm ?? 120),
        };
      }
      status = song?.score ? "Score ready." : "This saved song has no score data.";
    } catch (error) {
      status = message(error, "Could not load the score.");
    } finally {
      loading = false;
    }
  }

  async function playPreview(): Promise<void> {
    if (!score || !(await runtime.enableAudio())) return;
    runtime.sound.playPattern(scorePlaybackPattern(score));
  }

  function updateSetup(value: ScorePracticeSetupValue): void {
    setup = value;
    completed = false;
  }

  function toggleVoiceOption(voiceIds: string[]): void {
    if (practicing) return;
    const selected = voiceIds.every((id) => selectedVoiceIds.includes(id));
    const next = selected
      ? selectedVoiceIds.filter((id) => !voiceIds.includes(id))
      : [...new Set([...selectedVoiceIds, ...voiceIds])];
    if (next.length === 0) return;
    selectedVoiceIds = next;
    completed = false;
    practiceState = undefined;
    status = "Score parts updated.";
  }

  function updateCustomSelection(range: { startBeat: number; endBeat: number }): void {
    if (setup.selection.kind !== "custom") return;
    setup = {
      ...setup,
      selection: { ...setup.selection, ...range },
    };
  }

  async function startPractice(): Promise<void> {
    const plan = planProjection.plan;
    if (!plan || practicing) return;
    practicePlan = plan;
    executionTimes = [];
    practiceStartedAt = unixMs(Date.now());
    captureId = `song-practice-${song?.id ?? "unknown"}-${practiceStartedAt}`;
    previousTransport = {
      bpm: runtime.transportBpm,
      countInBars: runtime.countInBars,
    };
    practiceSession = new ScorePracticeSession(plan, {
      mode: setup.mode,
      bpm: setup.bpm,
      strictness: setup.strictness,
      totalTakes: setup.mode === "wait" ? 1 : setup.totalTakes,
    });
    completed = false;
    practicing = true;
    if (setup.mode === "wait") {
      executionStartedAt = unixMs(Date.now());
      practiceState = practiceSession.startExecution(monotonicMs(performance.now()));
      status = "Follow the selected score. Timing is paused until you play the right notes.";
      return;
    }
    await startCurrentPerformanceExecution();
  }

  async function startCurrentPerformanceExecution(): Promise<void> {
    if (!practiceSession || !practicing) return;
    clearPracticeTimers();
    practiceState = practiceSession.markCountingIn();
    runtime.setTransportBpm(setup.bpm);
    runtime.setCountIn(setup.countInBars);
    status = setup.countInBars === 0 ? "Performance starting." : "Count in.";
    try {
      const downbeat = await runtime.runCountIn();
      if (!practiceSession || !practicing) return;
      executionStartedAt = unixMs(Date.now());
      practiceState = practiceSession.startExecution(downbeat);
      status = `Take ${practiceState.take} · play with the metronome.`;
      schedulePerformanceExecution(downbeat);
    } catch (error) {
      practicing = false;
      runtime.stopPracticeClock();
      restoreTransportPreferences();
      status = message(error, "Performance practice could not start.");
    }
  }

  function schedulePerformanceExecution(downbeat: ReturnType<typeof monotonicMs>): void {
    const execution = practiceState?.execution;
    if (!execution) return;
    tickTimer = setInterval(() => {
      if (!practiceSession) return;
      practiceState = practiceSession.tick(monotonicMs(performance.now()));
    }, 50);
    const durationMs = beatToMs(execution.durationBeats, setup.bpm);
    const lastGroup = execution.groups.at(-1);
    const finalWindow = lastGroup
      ? timingWindowMs({
          bpm: setup.bpm,
          durationBeats: lastGroup.durationBeats,
          strictness: setup.strictness,
        })
      : 0;
    const elapsedBeforeScheduling = Math.max(0, performance.now() - downbeat);
    endTimer = setTimeout(
      () => void finishCurrentExecution(),
      Math.max(0, durationMs + finalWindow - elapsedBeforeScheduling),
    );
  }

  async function finishCurrentExecution(): Promise<void> {
    if (!song || !practiceSession || finishing) return;
    clearPracticeTimers();
    if (setup.mode === "performance") runtime.stopPracticeClock();
    if (executionStartedAt !== undefined) {
      executionTimes.push({ startedAt: executionStartedAt, endedAt: unixMs(Date.now()) });
      executionStartedAt = undefined;
    }
    practiceState = practiceSession.finishExecution();
    if (practiceState.status === "between") {
      if (setup.mode === "performance") {
        await startCurrentPerformanceExecution();
      } else {
        executionStartedAt = unixMs(Date.now());
        practiceState = practiceSession.startExecution(monotonicMs(performance.now()));
      }
      return;
    }
    if (practiceState.status !== "complete") return;

    finishing = true;
    practicing = false;
    completed = true;
    const scorePercent = Math.round((practiceState.summary?.aggregateScore ?? 0) * 100);
    status = `Practice complete · ${scorePercent}% score.`;
    restoreTransportPreferences();
    try {
      await runtime.recordPractice({
        id: captureId,
        source: "song",
        instrument: runtime.activeInstrument,
        startedAt: practiceStartedAt,
        endedAt: unixMs(Date.now()),
        tags: ["song", song.id, "score-following", setup.mode, setup.selection.kind],
        runs: practiceRuns(),
        xpEarned: 5 + Math.round((practiceState.summary?.aggregateScore ?? 0) * 15),
        note: `Score practice · ${song.title} · ${scorePercent}%`,
      });
    } catch (error) {
      status = message(error, "Score complete, but practice logging failed.");
    } finally {
      finishing = false;
    }
  }

  function cancelPractice(): void {
    clearPracticeTimers();
    runtime.stopPracticeClock();
    restoreTransportPreferences();
    practiceState = practiceSession?.cancel();
    practiceSession = undefined;
    practicing = false;
    completed = false;
    status = "Practice cancelled.";
  }

  function practiceRuns(): ExerciseRunRecord[] {
    if (!practicePlan) return [];
    const executions = buildPracticeExecutions(practicePlan, {
      totalTakes: setup.mode === "wait" ? 1 : setup.totalTakes,
    });
    return executions.map((execution, index) => {
      const times = executionTimes[index] ?? {
        startedAt: practiceStartedAt ?? unixMs(Date.now()),
        endedAt: unixMs(Date.now()),
      };
      return {
        id: `${captureId}-${execution.id}`,
        exerciseId: "song.score-practice",
        startedAt: times.startedAt,
        endedAt: times.endedAt,
        promptIds: execution.groups.map(({ id }) => id),
        targetSkillIds: [],
        instrument: runtime.activeInstrument,
        difficulty: strictnessDifficulty(setup.strictness),
        params: {
          bpm: setup.bpm,
          strictness: setup.strictness,
          selection: setup.selection.kind,
          segmentIds: execution.segmentIds,
          take: execution.take,
          totalTakes: setup.mode === "wait" ? 1 : setup.totalTakes,
        },
      };
    });
  }

  function strictnessDifficulty(strictness: ScorePracticeSetupValue["strictness"]): number {
    return { relaxed: 0.35, normal: 0.6, strict: 0.85 }[strictness];
  }

  function clearPracticeTimers(): void {
    if (tickTimer !== undefined) clearInterval(tickTimer);
    if (endTimer !== undefined) clearTimeout(endTimer);
    tickTimer = undefined;
    endTimer = undefined;
  }

  function restoreTransportPreferences(): void {
    if (!previousTransport) return;
    runtime.setTransportBpm(previousTransport.bpm);
    runtime.setCountIn(previousTransport.countInBars);
    previousTransport = undefined;
  }

  function notationProjection(
    value: SongRow["score"],
  ): { view?: NotationView; error?: string } {
    if (!value) return {};
    try {
      return { view: notationView(value) };
    } catch (error) {
      return {
        error: message(error, "This score cannot be rendered with the current notation engine."),
      };
    }
  }

  function scoreVoiceOptions(
    value: SongRow["score"],
  ): Array<{ id: string; label: string; voiceIds: string[] }> {
    if (!value) return [];
    if (value.origin !== "musicxml") {
      return value.voices.map((voice) => ({
        id: voice.id,
        label: voice.name,
        voiceIds: [voice.id],
      }));
    }

    const groups = new Map<string, { id: string; label: string; voiceIds: string[] }>();
    for (const voice of value.voices) {
      const id = voice.id.split(":voice:")[0] ?? voice.id;
      const group = groups.get(id) ?? {
        id,
        label: voice.name.replace(/\s*·\s*Voice\s+\d+$/i, ""),
        voiceIds: [],
      };
      group.voiceIds.push(voice.id);
      groups.set(id, group);
    }
    return [...groups.values()];
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
</script>

<svelte:head>
  <title>{song?.title ?? "Song Studio"} | Musicianship OS</title>
  <meta
    name="description"
    content="Preview a saved score and practice it with engine-backed follow-along."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title={song?.title ?? "Song Studio"}
    subtitle="Read, preview, and follow the canonical score with MIDI or on-screen input."
  >
    {#snippet controls()}
      <Button href="/music/songs" variant="outline" size="sm">
        <ArrowLeft class="size-4" aria-hidden="true" />
        Song Library
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  {#if loading}
    <Card.Root>
      <Card.Content class="py-10 text-center text-sm text-muted-foreground">
        Loading score.
      </Card.Content>
    </Card.Root>
  {:else if !song || !score}
    <Card.Root>
      <Card.Content class="grid justify-items-center gap-3 py-10 text-center">
        <ListMusic class="size-8 text-muted-foreground" aria-hidden="true" />
        <p class="font-semibold">Score unavailable</p>
        <p class="text-sm text-muted-foreground">{status}</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="min-w-0 space-y-4">
        <Card.Root>
          <Card.Header class="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Card.Description>Canonical score</Card.Description>
              <Card.Title>{song.title}</Card.Title>
            </div>
            <Badge variant="secondary">{score.origin.toUpperCase()}</Badge>
          </Card.Header>
          <Card.Content class="grid gap-4">
            {#if voiceOptions.length > 1}
              <div class="grid gap-2">
                <p class="text-sm font-medium">Score parts</p>
                <div class="flex flex-wrap gap-2" aria-label="Score parts">
                  {#each voiceOptions as option (option.id)}
                    <Button
                      type="button"
                      size="sm"
                      variant={option.voiceIds.every((id) => selectedVoiceIds.includes(id))
                        ? "secondary"
                        : "outline"}
                      aria-pressed={option.voiceIds.every((id) =>
                        selectedVoiceIds.includes(id),
                      )}
                      disabled={practicing}
                      onclick={() => toggleVoiceOption(option.voiceIds)}
                    >
                      {option.label}
                    </Button>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="flex flex-wrap items-center gap-2" aria-label="Notation view">
              <Button
                type="button"
                size="sm"
                variant={!showTab ? "secondary" : "outline"}
                aria-pressed={!showTab}
                onclick={() => (notationMode = "staff")}
              >
                Staff
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showTab ? "secondary" : "outline"}
                aria-pressed={showTab}
                onclick={() => (notationMode = "tab")}
              >
                Tab
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showFingering ? "secondary" : "outline"}
                aria-pressed={showFingering}
                disabled={selectionEditing}
                onclick={() => (notationMode = "fingering")}
              >
                Fingering
              </Button>
              {#if showTab}
                <select
                  class="h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="Tab tuning"
                  bind:value={tabTuningId}
                >
                  {#each TAB_TUNINGS as tuning (tuning.id)}
                    <option value={tuning.id}>{tuning.name}</option>
                  {/each}
                </select>
              {:else if selectionEditing}
                <span class="text-xs text-muted-foreground">
                  Fingering is unavailable while editing a custom range.
                </span>
              {/if}
            </div>
            {#if showTab && tabProjection && notation.view}
              <TabNotation
                view={notation.view}
                projection={tabProjection}
                tuning={tabTuning}
                {selectionMap}
                {highlightedRanges}
                {customSelection}
                snap={setup.selection.kind === "custom" ? setup.selection.snap : "note-group"}
                selectionEnabled={setup.selection.kind === "custom" && !practicing}
                onSelectionChange={updateCustomSelection}
                onError={(message) => (status = message)}
              />
            {:else if showFingering && aerophoneProjection}
              <div class="flex flex-wrap gap-3 overflow-x-auto" aria-label="Aerophone fingering">
                {#each aerophoneProjection.notes as note (note.sourceIndex)}
                  <AerophoneFingering midi={note.midiNote} size={88} />
                {/each}
              </div>
            {:else if song.source?.format === "musicxml"}
              <MusicXmlScore
                xml={song.source.content}
                partIds={selectedPartIds}
                {selectionMap}
                {highlightedRanges}
                {customSelection}
                snap={setup.selection.kind === "custom"
                  ? setup.selection.snap
                  : "note-group"}
                selectionEnabled={setup.selection.kind === "custom" && !practicing}
                onSelectionChange={updateCustomSelection}
                onError={(message) => (status = message)}
              />
            {:else if notation.view}
              <StaffNotation
                view={notation.view}
                {selectionMap}
                {highlightedRanges}
                {customSelection}
                snap={setup.selection.kind === "custom"
                  ? setup.selection.snap
                  : "note-group"}
                selectionEnabled={setup.selection.kind === "custom" && !practicing}
                onSelectionChange={updateCustomSelection}
              />
            {:else}
              <div class="rounded-md border p-4 text-sm text-muted-foreground">
                Staff preview unavailable: {notation.error}
              </div>
            {/if}
          </Card.Content>
          <Card.Footer class="flex-wrap gap-2">
            <Button type="button" onclick={playPreview}>
              <Play class="size-4" aria-hidden="true" />
              Play preview
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={practicing || !planProjection.plan}
              onclick={startPractice}
            >
              Start practice
            </Button>
            {#if practicing}
              <Button type="button" variant="outline" onclick={cancelPractice}>
                Cancel practice
              </Button>
            {/if}
          </Card.Footer>
        </Card.Root>

        {#if practicing}
          <Card.Root>
            <Card.Header>
              <Card.Description>
                {setup.mode === "wait" ? "Wait mode" : `Performance · take ${practiceState?.take ?? 1}`}
                · {practiceState?.currentSegmentId ?? "full"}
              </Card.Description>
              <Card.Title>
                {practiceState?.status === "count-in"
                  ? "Get ready"
                  : `Play ${expectedNames.join(" + ")}`}
              </Card.Title>
            </Card.Header>
            <Card.Content class="grid gap-5">
              <SegmentProgress
                total={practiceState?.execution?.groups.length ?? 0}
                current={live?.currentGroupIndex ?? 0}
                label="Score"
              />
              <Progress value={progressPercent} max={100} />
              {#if practicing}
                <OnScreenKeyboard router={runtime.router} notes={keyboardNotes} />
              {/if}
            </Card.Content>
          </Card.Root>
        {/if}

        {#if completed && practiceState?.summary}
          <ScorePracticeSummary summary={practiceState.summary} />
        {/if}
      </div>

      <aside class="grid content-start gap-4">
        <Card.Root>
          <Card.Header>
            <Card.Description>Practice setup</Card.Description>
            <Card.Title>Choose a range</Card.Title>
          </Card.Header>
          <Card.Content>
            <ScorePracticeSetup
              sections={score.sections}
              scoreEndBeat={Math.max(
                0,
                ...score.notes.map((note) => note.startBeat + note.durationBeats),
              )}
              value={setup}
              active={practicing}
              onChange={updateSetup}
            />
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Score details</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3 text-sm">
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Key</span>
              <strong>{score.keySignature ?? "Unknown"}</strong>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Tempo</span>
              <strong>{Math.round(score.tempoMap[0]?.bpm ?? 120)} bpm</strong>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Voices</span>
              <strong>{score.voices.length} / {sourceScore?.voices.length ?? 0}</strong>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Note groups</span>
              <strong>{groups.length}</strong>
            </div>
          </Card.Content>
        </Card.Root>
        {#if planProjection.error}
          <p class="text-sm text-destructive" role="alert">{planProjection.error}</p>
        {/if}
        <p class="text-sm text-muted-foreground" role="status">{status}</p>
      </aside>
    </section>
  {/if}
</PracticeScreen>
