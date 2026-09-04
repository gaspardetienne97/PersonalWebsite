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
    type ToneRole,
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
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import PianoSurface from "../_components/piano/PianoSurface.svelte";
  import HudTile from "../_components/HudTile.svelte";
  import PracticeStage from "../_components/PracticeStage.svelte";
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
  let chorusCount = $state(0);
  let setupOpen = $state(false);
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
  const transposeLabel = $derived(
    Number(transposeSemitones) > 0 ? `+${transposeSemitones}` : String(Number(transposeSemitones)),
  );
  // One keyboard carries the current chord's tone roles by pitch class over three octaves.
  const KEY_RANGE = Array.from({ length: 37 }, (_, i) => 48 + i);
  const keyToneRoles = $derived(
    Object.fromEntries(
      KEY_RANGE.map((midi) => [
        midi,
        tones.find((tone) => tone.pitchClass === midi % 12)?.role ?? ("avoid" as ToneRole),
      ]),
    ) as Record<number, ToneRole>,
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
  <PracticeScreenHeader title="Jam / Improv" compact>
    {#snippet controls()}
      <SourceReadout label="Input" device={sourceLabel} live={runtime.activeSource === "midi"} />
      <Button type="button" variant={recording ? "default" : "outline"} onclick={toggleRecording}>
        <Circle class="size-4 {recording ? 'fill-current text-destructive' : ''}" aria-hidden="true" />
        {recording ? `Stop chorus · Recording · ${recordedCount}` : "Record chorus"}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <!-- Setup summary + the pickers that are the jam itself (group, progression, backing source);
       transpose and the drum track sit behind Edit setup, like the drill shell. -->
  <section class="grid min-w-0 gap-3 rounded-lg border bg-card p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm">
        <span class="eyebrow mr-2">Setup</span>
        {progression.name} · {progression.key} · {backingMode === "drums" ? "Drum track" : "Synth chords"} ·
        Transpose {transposeLabel} · {backingBpm} BPM
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={setupOpen}
        aria-controls="jam-setup"
        onclick={() => (setupOpen = !setupOpen)}
      >
        {setupOpen ? "Hide setup" : "Edit setup"}
      </Button>
    </div>
    <div class="flex flex-wrap gap-3">
      <SegmentedControl ariaLabel="Group" options={groupOptions} value={progressionGroup} onChange={selectGroup} />
      <SegmentedControl
        size="sm"
        ariaLabel="Backing source"
        options={[
          { value: "drums", label: "Drum track" },
          { value: "chords", label: "Synth chords" },
        ]}
        value={backingMode}
        onChange={selectBackingMode}
      />
    </div>
    <SegmentedControl ariaLabel="Progression" options={progressionOptions} value={progressionId} onChange={selectStyle} />
    {#if setupOpen}
      <div id="jam-setup" class="grid gap-3 border-t pt-3">
        <div class="grid gap-2">
          <span class="text-sm font-medium">Transpose</span>
          <SegmentedControl size="sm" ariaLabel="Transpose" options={transposeOptions} value={transposeSemitones} onChange={selectTranspose} />
        </div>
        {#if backingMode === "drums"}
          <div class="grid gap-2">
            <label class="text-sm font-medium" for="jam-drum-track">Drum track</label>
            <select
              id="jam-drum-track"
              bind:value={drumTrackId}
              aria-label="Drum backing track"
              class="h-9 max-w-md rounded-md border border-input bg-background px-3 text-sm"
            >
              {#each drumTracks as track (track.id)}
                <option value={track.id}>{track.label}</option>
              {/each}
            </select>
            {#if drumTrack.songs.length}
              <p class="text-xs text-muted-foreground">For: {drumTrack.songs.join(", ")}</p>
            {/if}
          </div>
        {/if}
        <p class="text-xs text-muted-foreground">Tempo lives in the practice controls above: {backingBpm} BPM.</p>
      </div>
    {/if}
  </section>

  <PracticeStage class="grid min-w-0 gap-4 p-4 sm:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold tracking-wide text-stage-muted">
          Now playing · {current.roman} in {progression.key} ·
          <span data-testid="progression-current-symbol">{current.symbol}</span>
        </p>
        <h2 class="text-xl font-semibold tracking-tight">{progression.name}</h2>
        <p class="text-sm text-stage-muted">
          {current.scale} · next {next.symbol}
          {#if backingState.status === "playing"}· chorus {chorusCount + 1}{/if}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onclick={playChord}>
          <Play class="size-4" aria-hidden="true" />Play chord
        </Button>
        <Button type="button" variant="outline" disabled={backingState.status === "playing"} onclick={advance}>
          <SkipForward class="size-4" aria-hidden="true" />Next chord
        </Button>
        <Button type="button" onclick={() => void playBacking()}>
          {#if backingState.status === "playing"}
            <Pause class="size-4" aria-hidden="true" />Pause backing
          {:else}
            <Play class="size-4" aria-hidden="true" />Play backing
          {/if}
        </Button>
        <Button type="button" variant="outline" onclick={stopBacking}>Stop</Button>
      </div>
    </div>

    <ol class="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`${progression.name} chord chart`}>
      {#each progression.chords as chord, index (`${chord.symbol}-${index}`)}
        {@const state =
          index === currentIndex
            ? "current"
            : index === (currentIndex + 1) % progression.chords.length
              ? "next"
              : "upcoming"}
        <li
          data-testid={`progression-cell-${index}`}
          data-state={state}
          class={[
            "grid gap-0.5 rounded-lg border p-2.5 text-center text-sm sm:p-3",
            state === "current" && "border-practice-accent bg-practice-accent/15 ring-1 ring-practice-accent/30",
            state === "next" && "border-dashed border-stage-line bg-stage-2",
            state === "upcoming" && "border-stage-line bg-stage-2/60",
          ]}
        >
          <span class="text-base font-bold sm:text-lg">{chord.symbol}</span>
          <span class="text-xs text-stage-muted">
            {chord.roman}{state === "current" ? " · now" : state === "next" ? " · next" : ""}
          </span>
          <span class="text-[0.6875rem] font-medium text-stage-muted">{chord.scale} · {chord.bars} bars</span>
        </li>
      {/each}
    </ol>

    <div class="grid min-w-0 gap-2 rounded-xl border border-stage-line bg-stage-2/70 p-3 sm:p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-semibold tracking-wide text-stage-muted">Target tones · {current.symbol} / {current.scale}</p>
        <div class="flex flex-wrap items-center gap-3 text-xs text-stage-muted">
          <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-primary"></span>Chord tones</span>
          <span class="flex items-center gap-1.5">
            <span class="size-3 rounded-full bg-primary/25 ring-1 ring-inset ring-primary"></span>Scale tones
          </span>
          <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-muted"></span>Avoid</span>
        </div>
      </div>
      <PianoSurface
        router={runtime.router}
        lowMidi={48}
        highMidi={84}
        toneRoles={keyToneRoles}
        noteNames="c"
        onAccepted={playSolo}
      />
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <HudTile size="sm" label="Backing" value={backingState.status} />
      <HudTile size="sm" label="Tempo" value={effectiveBpm} unit="BPM" />
      <HudTile size="sm" label="Recorded" value={recordedCount} unit="notes" />
      <HudTile size="sm" label="Chorus" value={backingState.status === "playing" ? chorusCount + 1 : "idle"} />
    </div>

    {#if playbackError || backingState.message}
      <p class="text-sm text-destructive" role="alert">
        {playbackError || backingState.message}
      </p>
    {/if}
  </PracticeStage>

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
</PracticeScreen>
