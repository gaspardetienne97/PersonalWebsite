<script lang="ts">
  import { browser } from "$app/environment";
  import Circle from "lucide-svelte/icons/circle";
  import Pause from "lucide-svelte/icons/pause";
  import Play from "lucide-svelte/icons/play";
  import SkipForward from "lucide-svelte/icons/skip-forward";

  import type { NoteEvent } from "@repo/music-core/domain";
  import {
    BackingTrackEngine,
    type BackingTrackPlaybackAdapter,
    type BackingTrackState,
  } from "@repo/music-core/engines/backing-track";
  import { BrowserBackingPlayer } from "@repo/music-core/engines/backing-track/browser-player";
  import {
    JAM_PROGRESSIONS,
    JAM_PROGRESSION_GROUPS,
    JamSession,
    normalizeJamPracticeConfig,
    transposeProgression,
    type JamBackingMode,
    type JamProgression,
    type JamProgressionGroup,
    type TargetTone,
  } from "@repo/music-core/engines/jam";
  import { JAZZ_BACKING_TRACKS } from "@repo/music-core/engines/jazz";
  import { RecordingSession, takeToScore, type Take } from "@repo/music-core/engines/recording";
  import { scoreToPattern } from "@repo/music-core/engines/sound";
  import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { onDestroy, tick } from "svelte";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import MidiTakeReviewPanel from "../_components/MidiTakeReviewPanel.svelte";
  import ProgressionChartStage from "../_components/ProgressionChartStage.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import PianoSurface from "../_components/piano/PianoSurface.svelte";
  import { initialDrillSearch, syncRouteQuery } from "../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";
  import { PIANO_ROLL_PENDING_TAKE_IMPORT_ID } from "../create/_components/piano-roll-storage";

  const drumTracks = JAZZ_BACKING_TRACKS;
  const jamConfigOptions = {
    drumTrackIds: drumTracks.map((track) => track.id),
    defaultDrumTrackId: drumTracks[0]?.id,
  };
  const initialSearchParams = browser ? initialDrillSearch() : new URLSearchParams();
  const initialQueryHasTempo = initialSearchParams.has("bpm") || initialSearchParams.has("tempo");
  const initialConfig = normalizeJamPracticeConfig(initialSearchParams, jamConfigOptions);
  const initialProgression =
    JAM_PROGRESSIONS.find((entry) => entry.id === initialConfig.progressionId) ?? JAM_PROGRESSIONS[0]!;
  const initialDisplayedProgression = transposeProgression(initialProgression, initialConfig.transpose);
  const initialSession = new JamSession(initialDisplayedProgression);
  const groupOptions = JAM_PROGRESSION_GROUPS.map((group) => ({
    value: group.id,
    label: group.label,
  }));
  const transposeOptions = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((value) => ({
    value: String(value),
    label: value === 0 ? "0" : value > 0 ? `+${value}` : String(value),
  }));

  const {
    runtime = useMusicRuntime(),
    navigateToCreate = defaultNavigateToCreate,
    now = () => performance.now(),
  }: {
    runtime?: MusicRuntime;
    navigateToCreate?: (href: string) => void | Promise<void>;
    /** Wall clock for the transport-driven chart. Injectable for tests. */
    now?: () => number;
  } = $props();

  /** One chorus of solo notes, classified against the chord that was current when each landed. */
  interface ChorusReport {
    chorus: number;
    notes: number;
    chordPct: number;
    scalePct: number;
    outsidePct: number;
  }

  let baseProgression = $state<JamProgression>(initialProgression);
  let progressionGroup = $state<JamProgressionGroup>(initialConfig.group);
  let progressionId = $state(initialConfig.progressionId);
  let transposeSemitones = $state(String(initialConfig.transpose));
  let session = $state(initialSession);
  let tones = $state<TargetTone[]>(initialSession.targetTones());
  let currentIndex = $state(0);
  let recording = $state(false);
  let recordedCount = $state(0);
  let midiTakes = $state<Take[]>([]);
  let selectedMidiTake = $state<Take | undefined>();
  let playbackError = $state("");
  let playbackGeneration = 0;
  let playingMidiTakeId = $state<string | undefined>();
  let midiPlaybackGeneration = 0;
  let midiPlaybackTimer: ReturnType<typeof setTimeout> | undefined;
  let backingPending = false;
  const midiRecorder = new RecordingSession();
  let backingPlayer: BrowserBackingPlayer | undefined;
  const backingEngine = new BackingTrackEngine(createBackingAdapter());
  let backingState = $state<BackingTrackState>(backingEngine.state);
  // Default backing is the bundled drum track that matches the progression feel.
  let backingMode = $state<JamBackingMode>(initialConfig.backingMode);
  let drumTrackId = $state(initialConfig.drumTrackId);
  let backingBpm = $state(initialConfig.bpm);
  let transportInitialized = false;
  // Transport-driven chart: while the backing plays, the current chord follows the
  // elapsed beats (paused time excluded) instead of the Next chord button.
  let playStartedAt: number | undefined;
  let pausedOffsetMs = 0;
  let transportTimer: ReturnType<typeof setInterval> | undefined;
  let chorusCount = 0;
  let chorusTally = { chord: 0, scale: 0, outside: 0 };
  let chorusReports = $state<ChorusReport[]>([]);
  const drumTrack = $derived(drumTracks.find((t) => t.id === drumTrackId) ?? drumTracks[0]!);
  const progression = $derived(transposeProgression(baseProgression, Number(transposeSemitones)));
  const progressionOptions = $derived(
    JAM_PROGRESSIONS.filter((entry) => entry.group === progressionGroup).map((entry) => ({
      value: entry.id,
      label: entry.name,
    })),
  );
  const normalizedConfig = $derived(
    normalizeJamPracticeConfig(
      {
        group: progressionGroup,
        progression: progressionId,
        backing: backingMode,
        drums: drumTrackId,
        bpm: backingBpm,
        transpose: transposeSemitones,
      },
      jamConfigOptions,
    ),
  );

  const current = $derived(progression.chords[currentIndex] ?? progression.chords[0]!);
  const next = $derived(
    progression.chords[(currentIndex + 1) % progression.chords.length] ?? progression.chords[0]!,
  );
  const chordBeats = $derived(progression.chords.map((chord) => (chord.bars ?? 1) * 4));
  const progressionBeats = $derived(chordBeats.reduce((sum, beats) => sum + beats, 0));
  // Bundled drum tracks run at their own tempo; generated chords follow the transport.
  const effectiveBpm = $derived(
    backingState.selection.kind === "builtin" ? backingState.selection.track.bpm || backingBpm : backingBpm,
  );
  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );

  const unsubscribeBacking = backingEngine.subscribe((state) => {
    backingState = state;
  });

  $effect(() => {
    const unsubscribe = runtime.router.subscribe((event) => {
      if (event.type !== "noteOn") return;
      if (backingState.status === "playing") tallySoloNote(event.midiNote);
      if (!recording) return;
      session.record(event);
      midiRecorder.capture(event);
      recordedCount = session.recorded().length;
    });
    return () => unsubscribe();
  });

  $effect(() => {
    const status = backingState.status;
    if (status === "playing") {
      if (playStartedAt === undefined) playStartedAt = now() - pausedOffsetMs;
      if (transportTimer === undefined) transportTimer = setInterval(followTransport, 100);
      followTransport();
      return;
    }
    if (transportTimer !== undefined) clearInterval(transportTimer);
    transportTimer = undefined;
    if (status === "paused") {
      if (playStartedAt !== undefined) pausedOffsetMs = now() - playStartedAt;
      playStartedAt = undefined;
      return;
    }
    // stopped / idle / error / loading: back to the top of the form.
    playStartedAt = undefined;
    pausedOffsetMs = 0;
    chorusCount = 0;
    chorusTally = { chord: 0, scale: 0, outside: 0 };
    if (session.index !== 0) {
      session.reset();
      refresh();
    }
  });

  function followTransport(): void {
    if (playStartedAt === undefined || progressionBeats === 0) return;
    const beats = ((now() - playStartedAt) / (60_000 / effectiveBpm));
    const chorus = Math.floor(beats / progressionBeats);
    while (chorusCount < chorus) {
      chorusCount += 1;
      finishChorus(chorusCount);
    }
    let within = beats - chorus * progressionBeats;
    let index = 0;
    while (index < chordBeats.length - 1 && within >= chordBeats[index]!) {
      within -= chordBeats[index]!;
      index += 1;
    }
    if (session.index === index) return;
    while (session.index !== index) session.advance();
    refresh();
  }

  function tallySoloNote(midiNote: number): void {
    const role = tones.find((tone) => tone.pitchClass === midiNote % 12)?.role;
    if (role === "chord") chorusTally.chord += 1;
    else if (role === "scale") chorusTally.scale += 1;
    else chorusTally.outside += 1;
  }

  function finishChorus(chorus: number): void {
    const notes = chorusTally.chord + chorusTally.scale + chorusTally.outside;
    const pct = (count: number) => (notes === 0 ? 0 : Math.round((count / notes) * 100));
    chorusReports = [
      {
        chorus,
        notes,
        chordPct: pct(chorusTally.chord),
        scalePct: pct(chorusTally.scale),
        outsidePct: pct(chorusTally.outside),
      },
      ...chorusReports,
    ].slice(0, 8);
    chorusTally = { chord: 0, scale: 0, outside: 0 };
  }

  $effect(() => {
    if (transportInitialized) return;
    if (initialQueryHasTempo) runtime.setTransportBpm(initialConfig.bpm);
    transportInitialized = true;
  });

  $effect(() => {
    backingBpm = runtime.transportBpm;
  });

  $effect(() => {
    syncConfigUrl();
  });

  $effect(() => {
    const config = normalizedConfig;
    playbackGeneration += 1;
    if (backingMode === "drums") {
      backingEngine.selectBuiltin(
        { id: drumTrack.id, label: drumTrack.label, url: drumTrack.url, bpm: drumTrack.bpm },
        { loop: true },
      );
      return;
    }
    backingEngine.selectGenerated({
      kind: "generated",
      progressionId: config.progressionId,
      bpm: config.bpm,
      loop: true,
      transpose: config.transpose,
    });
  });

  $effect(() => {
    void runtime.mediaVolume;
    backingPlayer?.syncMediaVolume();
  });

  function selectStyle(id: string): void {
    const config = normalizeJamPracticeConfig(
      { progression: id, backing: backingMode, drums: drumTrackId },
      jamConfigOptions,
    );
    applyProgressionConfig(config, { updateTempo: true });
  }

  function selectGroup(value: string): void {
    const config = normalizeJamPracticeConfig(
      { group: value, backing: backingMode, drums: drumTrackId },
      jamConfigOptions,
    );
    applyProgressionConfig(config, { updateTempo: true });
  }

  function selectTranspose(value: string): void {
    const config = normalizeJamPracticeConfig(
      {
        group: progressionGroup,
        progression: progressionId,
        backing: backingMode,
        drums: drumTrackId,
        bpm: backingBpm,
        transpose: value,
      },
      jamConfigOptions,
    );
    applyProgressionConfig(config, { updateTempo: false });
  }

  function applyProgressionConfig(
    config: ReturnType<typeof normalizeJamPracticeConfig>,
    options: { updateTempo: boolean },
  ): void {
    stopMidiTake();
    progressionGroup = config.group;
    progressionId = config.progressionId;
    transposeSemitones = String(config.transpose);
    baseProgression =
      JAM_PROGRESSIONS.find((entry) => entry.id === config.progressionId) ?? JAM_PROGRESSIONS[0]!;
    const displayedProgression = transposeProgression(baseProgression, config.transpose);
    session = new JamSession(displayedProgression);
    currentIndex = 0;
    tones = session.targetTones();
    recordedCount = 0;
    if (options.updateTempo) {
      backingBpm = config.bpm;
      runtime.setTransportBpm(config.bpm);
    }
  }

  function selectBackingMode(value: string): void {
    backingMode = normalizeJamPracticeConfig(
      { progression: progression.id, backing: value, drums: drumTrackId, bpm: backingBpm },
      jamConfigOptions,
    ).backingMode;
  }

  function refresh(): void {
    currentIndex = session.index;
    tones = session.targetTones();
  }

  function advance(): void {
    session.advance();
    refresh();
  }

  async function playChord(): Promise<void> {
    stopMidiTake();
    await tick();
    const generation = playbackGeneration;
    playbackError = "";
    if (!(await runtime.ensurePlaybackVoice())) {
      if (generation === playbackGeneration) {
        playbackError = runtime.audioMessage || "Chord preview could not be enabled.";
      }
      return;
    }
    if (generation !== playbackGeneration) return;
    const midi = chordNotes(current.symbol).map((name) => 48 + pitchClass(name));
    runtime.sound.playChord(midi, 1.2);
  }

  async function playBacking(): Promise<void> {
    if (backingState.status === "playing") {
      backingEngine.pause();
      return;
    }
    if (backingPending) return;
    stopMidiTake();
    backingPending = true;
    await tick();
    const generation = playbackGeneration;
    playbackError = "";
    try {
      const enabled =
        backingState.selection.kind === "generated"
          ? await runtime.ensurePlaybackVoice()
          : await runtime.enableAudio();
      if (!enabled) {
        if (generation === playbackGeneration) {
          playbackError = runtime.audioMessage || "Audio could not be enabled.";
        }
        return;
      }
      if (generation !== playbackGeneration) return;
      await backingEngine.play();
      if (generation !== playbackGeneration) backingEngine.stop();
    } catch (error) {
      if (generation === playbackGeneration) {
        playbackError = error instanceof Error ? error.message : "Backing playback failed.";
      }
    } finally {
      if (generation === playbackGeneration) backingPending = false;
    }
  }

  function stopBacking(): void {
    playbackGeneration += 1;
    backingPending = false;
    backingEngine.stop();
  }

  function playSolo(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  function toggleRecording(): void {
    if (recording) {
      const take = midiRecorder.stop(performance.now(), `${progression.name} chorus ${midiTakes.length + 1}`);
      if (take.notes.length > 0) {
        midiTakes = [take, ...midiTakes];
        selectedMidiTake = take;
      }
      recording = false;
      return;
    }
    recording = true;
    if (recording) {
      session.clearRecording();
      midiRecorder.start(performance.now());
      recordedCount = 0;
    }
  }

  async function toggleMidiTake(take: Take): Promise<void> {
    if (playingMidiTakeId === take.id) {
      stopMidiTake();
      return;
    }

    playbackGeneration += 1;
    backingEngine.pause();
    stopMidiTake();
    await tick();
    const generation = midiPlaybackGeneration;
    playbackError = "";
    if (!(await runtime.ensurePlaybackVoice())) {
      if (generation === midiPlaybackGeneration) {
        playbackError = runtime.audioMessage || "MIDI take playback could not be enabled.";
      }
      return;
    }
    if (generation !== midiPlaybackGeneration) return;
    const pattern = scoreToPattern(takeToScore(take, backingBpm), { bpm: backingBpm });
    runtime.sound.playPattern(pattern.steps);
    playingMidiTakeId = take.id;
    midiPlaybackTimer = setTimeout(
      () => finishMidiTake(generation),
      Math.max(0, pattern.durationSec * 1_000),
    );
  }

  function stopMidiTake(): void {
    midiPlaybackGeneration += 1;
    if (midiPlaybackTimer) clearTimeout(midiPlaybackTimer);
    midiPlaybackTimer = undefined;
    runtime.sound.stopPattern?.();
    playingMidiTakeId = undefined;
  }

  function finishMidiTake(generation: number): void {
    if (generation !== midiPlaybackGeneration) return;
    midiPlaybackTimer = undefined;
    playingMidiTakeId = undefined;
  }

  function selectMidiTake(take: Take): void {
    if (playingMidiTakeId !== take.id) stopMidiTake();
    selectedMidiTake = take;
  }

  function deleteMidiTake(take: Take): void {
    if (playingMidiTakeId === take.id) stopMidiTake();
    midiTakes = midiTakes.filter((candidate) => candidate.id !== take.id);
    selectedMidiTake = midiTakes[0];
  }

  function practiceMidiTake(take: Take): void {
    stopMidiTake();
    selectedMidiTake = take;
    recording = false;
    recordedCount = take.notes.length;
  }

  async function openMidiTakeInPianoRoll(take: Take): Promise<void> {
    stopMidiTake();
    await runtime.writeLocalState(PIANO_ROLL_PENDING_TAKE_IMPORT_ID, { take, bpm: backingBpm });
    await navigateToCreate("/music/create?mode=piano-roll&source=jam-chorus-take");
  }

  function syncConfigUrl(): void {
    if (!browser) return;
    const config = normalizedConfig;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("group", config.group);
    params.set("progression", config.progressionId);
    params.set("backing", config.backingMode);
    params.set("drums", config.drumTrackId);
    params.set("bpm", String(config.bpm));
    params.set("transpose", String(config.transpose));
    syncRouteQuery(`${url.pathname}?${params.toString()}${url.hash}`);
  }

  function defaultNavigateToCreate(href: string): void {
    if (browser) window.location.assign(href);
  }

  onDestroy(() => {
    playbackGeneration += 1;
    if (transportTimer !== undefined) clearInterval(transportTimer);
    stopMidiTake();
    unsubscribeBacking();
    backingEngine.dispose();
  });

  function createBackingAdapter(): BackingTrackPlaybackAdapter {
    if (browser) {
      backingPlayer = new BrowserBackingPlayer({
        sound: runtime.sound,
        loadBlob: () => Promise.resolve(undefined),
        mediaVolume: () => runtime.mediaVolume,
        onImportedPositionChange: (positionMs) => backingEngine.updateImportedPosition(positionMs),
        onImportedEnded: () => backingEngine.markEnded(),
        onImportedError: (message) => {
          playbackError = message;
          backingEngine.stop();
        },
      });
      return backingPlayer;
    }
    return {
      playGenerated: async () => {},
      stopGenerated: () => {},
      loadImported: async (track) => track.durationMs,
      loadBuiltin: async () => 0,
      playImported: async () => {},
      pauseImported: () => {},
      stopImported: () => {},
      seekImported: () => {},
      setImportedLoop: () => {},
      setImportedVolume: () => {},
      dispose: () => {},
    };
  }
</script>

<svelte:head>
  <title>Jam / Improv | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Jam / Improv"
    subtitle="Backing changes play the progression — target tones light up on your instrument."
  >
    {#snippet controls()}
      <SourceReadout label="Soloing on" device={sourceLabel} live={runtime.activeSource === "midi"} />
      <Button type="button" variant={recording ? "default" : "outline"} onclick={toggleRecording}>
        <Circle class="size-4 {recording ? 'fill-current text-destructive' : ''}" aria-hidden="true" />
        {recording ? `Stop chorus · Recording · ${recordedCount}` : "Record chorus"}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="grid gap-6">
      <ProgressionChartStage {progression} {currentIndex} {tones} />
      <MidiTakeReviewPanel
        title="Review chorus takes"
        description="Compare recorded chorus ideas against the current progression."
        emptyLabel="Recorded chorus takes will appear here."
        takes={midiTakes}
        selectedTake={selectedMidiTake}
        playingTakeId={playingMidiTakeId}
        onSelectTake={selectMidiTake}
        onPlayTake={toggleMidiTake}
        onPauseTake={() => stopMidiTake()}
        onDeleteTake={deleteMidiTake}
        onPracticeTake={practiceMidiTake}
        onOpenInPianoRoll={openMidiTakeInPianoRoll}
      />

      {#if chorusReports.length > 0}
        <Card.Root>
          <Card.Header>
            <Card.Description>Chorus tone report</Card.Description>
            <Card.Title class="text-base">How your solo sat on the changes</Card.Title>
          </Card.Header>
          <Card.Content>
            <ol class="grid gap-2 text-sm" aria-label="Chorus tone report">
              {#each chorusReports as report (report.chorus)}
                <li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <span class="font-medium">Chorus {report.chorus} · {report.notes} notes</span>
                  <span class="tabular-nums text-muted-foreground">
                    {report.chordPct}% chord tones · {report.scalePct}% scale · {report.outsidePct}% outside
                  </span>
                </li>
              {/each}
            </ol>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Solo input -->
      <Card.Root>
        <Card.Header class="flex-row items-center justify-between gap-2">
          <Card.Description>Play your solo</Card.Description>
          <div class="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onclick={playChord}>
              <Play class="size-4" aria-hidden="true" />Play chord
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={backingState.status === "playing"}
              onclick={advance}
            >
              <SkipForward class="size-4" aria-hidden="true" />Next chord
            </Button>
          </div>
        </Card.Header>
        <Card.Content>
          <PianoSurface router={runtime.router} onAccepted={playSolo} />
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Backing controls -->
    <aside class="grid min-w-0 content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Backing track</Card.Description>
          <Card.Title>Style</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3">
          <SegmentedControl
            class="w-full"
            ariaLabel="Group"
            options={groupOptions}
            value={progressionGroup}
            onChange={selectGroup}
          />
          <SegmentedControl
            class="w-full"
            ariaLabel="Progression"
            options={progressionOptions}
            value={progressionId}
            onChange={selectStyle}
          />
          <SegmentedControl
            class="w-full"
            ariaLabel="Transpose"
            options={transposeOptions}
            value={transposeSemitones}
            onChange={selectTranspose}
          />

          <div class="grid gap-2">
            <span
              class="eyebrow"
            >Backing source</span>
            <SegmentedControl
              class="w-full"
              size="sm"
              options={[
                { value: "drums", label: "Drum track" },
                { value: "chords", label: "Synth chords" },
              ]}
              value={backingMode}
              onChange={selectBackingMode}
            />
            {#if backingMode === "drums"}
              <select
                bind:value={drumTrackId}
                aria-label="Drum backing track"
                class="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {#each drumTracks as track (track.id)}
                  <option value={track.id}>{track.label}</option>
                {/each}
              </select>
              {#if drumTrack.songs.length}
                <p class="text-xs text-muted-foreground">For: {drumTrack.songs.join(", ")}</p>
              {/if}
            {/if}
          </div>

          <div class="grid gap-1 text-sm">
            <div class="flex justify-between"><span class="text-muted-foreground">Key</span><span class="font-medium">{progression.key}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">Next</span><span class="font-medium">{next.symbol}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">Backing</span><span class="font-medium capitalize">{backingState.status}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">Recorded</span><span class="font-medium tabular-nums">{recordedCount} notes</span></div>
          </div>
          <div class="flex gap-2">
            <Button type="button" class="flex-1" onclick={() => void playBacking()}>
              {#if backingState.status === "playing"}
                <Pause class="size-4" aria-hidden="true" />Pause backing
              {:else}
                <Play class="size-4" aria-hidden="true" />Play backing
              {/if}
            </Button>
            <Button type="button" variant="outline" class="flex-1" onclick={stopBacking}>
              Stop
            </Button>
          </div>
          {#if playbackError || backingState.message}
            <p class="text-sm text-destructive" role="alert">
              {playbackError || backingState.message}
            </p>
          {/if}
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
