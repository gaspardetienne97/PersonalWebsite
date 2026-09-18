<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import {
    PLAYBACK_SOUND_IDS,
    PLAYBACK_SOUND_LABELS,
    type MusicSettings,
  } from "@repo/music-core/engines/settings";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { AudioPitchSource } from "@repo/music-core/engines/audio-in";
  import {
    DeviceProfileStore,
    type DeviceProfile,
  } from "@repo/music-core/engines/device-profiles";
  import { createToneTransportEngine } from "@repo/music-core/engines/transport";
  import {
    MUSIC_DATA_BACKUP_MAX_BYTES,
    parseMusicDataBackup,
    prepareMusicDataBackup,
    restoreMusicDataBackup,
    tableCounts,
    type MusicDataBackupV1,
    type PreparedMusicDataBackup,
  } from "@repo/music-core/engines/store/data-backup";
  import {
    MUSIC_FULL_BACKUP_MAX_BYTES,
    parseMusicFullBackup,
    prepareMusicFullBackup,
    restoreMusicFullBackup,
    type ParsedMusicFullBackup,
    type PreparedMusicFullBackup,
  } from "@repo/music-core/engines/store/full-backup";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SectionHeading from "../_components/SectionHeading.svelte";
  import SettingsRow from "../_components/SettingsRow.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";
  import CalibrationPanel, {
    type ClickRun,
    type ClickRunInput,
  } from "./_components/CalibrationPanel.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;

  let settings = $state(runtime.getMusicSettings());
  let ready = $state(runtime.settingsReady);
  let status = $state(runtime.settingsReady ? "Settings loaded." : "Loading settings.");
  let confirmReset = $state(false);
  let preparedBackup = $state<PreparedMusicDataBackup>();
  let selectedBackup = $state.raw<MusicDataBackupV1>();
  let selectedFileSize = $state(0);
  let currentCounts = $state<Record<string, number>>();
  let backupError = $state<string>();
  let restoring = $state(false);
  let preparingFull = $state(false);
  let preparedFull = $state.raw<PreparedMusicFullBackup>();
  let selectedFull = $state.raw<ParsedMusicFullBackup>();
  let fullBackupError = $state<string>();
  const backupBusy = $derived(restoring || preparingFull);
  let selectionGeneration = 0;
  let alive = true;

  onDestroy(() => {
    alive = false;
    selectionGeneration += 1;
    void microphone?.stop();
  });

  $effect(() => {
    if (runtime.settingsReady && !ready) {
      settings = runtime.getMusicSettings();
      ready = true;
      status = "Settings loaded.";
    }
  });

  async function patch(next: Partial<MusicSettings>): Promise<void> {
    if (!ready) return;
    try {
      await runtime.updateMusicSettings(next);
      settings = runtime.getMusicSettings();
      status = "Saved.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Settings could not be saved.";
    }
  }

  async function testAudio(): Promise<void> {
    status = "Testing audio…";
    status = (await runtime.testAudio()) ? "Audio is ready." : runtime.audioMessage;
  }

  async function exportJournal(): Promise<void> {
    if (!store) return;
    const sessions = new PracticeSessionStore(store);
    await sessions.load();
    const all = sessions.all();
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), sessions: all }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `practice-journal-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    status = `Exported ${all.length} ${all.length === 1 ? "session" : "sessions"}.`;
  }

  async function prepareDataBackup(): Promise<void> {
    if (!store) return;
    backupError = undefined;
    try {
      preparedBackup = await prepareMusicDataBackup(store);
      status = "Data backup is ready to download.";
    } catch (error) {
      preparedBackup = undefined;
      backupError = error instanceof Error ? error.message : "Data backup could not be prepared.";
    }
  }

  function downloadDataBackup(): void {
    if (!preparedBackup) return;
    const blob = new Blob([preparedBackup.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `practice-os-data-${preparedBackup.backup.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    status = "Data backup downloaded.";
  }

  async function selectDataBackup(event: Event): Promise<void> {
    if (backupBusy) return;
    const generation = ++selectionGeneration;
    selectedFull = undefined;
    fullBackupError = undefined;
    selectedBackup = undefined;
    currentCounts = undefined;
    selectedFileSize = 0;
    backupError = undefined;
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size === 0) {
      backupError = "The data backup file is empty.";
      return;
    }
    if (file.size > MUSIC_DATA_BACKUP_MAX_BYTES) {
      backupError = "The data backup file is larger than 50 MiB.";
      return;
    }
    try {
      const parsed = parseMusicDataBackup(await file.text());
      if (!alive || generation !== selectionGeneration || !store) return;
      const current = await prepareMusicDataBackup(store);
      if (!alive || generation !== selectionGeneration) return;
      selectedBackup = parsed;
      selectedFileSize = file.size;
      currentCounts = current.counts;
      status = "Data backup is ready to review.";
    } catch (error) {
      if (!alive || generation !== selectionGeneration) return;
      backupError = error instanceof Error ? error.message : "The data backup file is invalid.";
    }
  }

  async function restoreData(): Promise<void> {
    if (!store || !selectedBackup || backupBusy) return;
    restoring = true;
    backupError = undefined;
    status = "Restoring data…";
    try {
      await restoreMusicDataBackup(store, selectedBackup);
      // Committed replacement must also refresh engines if the user changed routes.
      window.location.reload();
    } catch (error) {
      if (!alive) return;
      restoring = false;
      backupError = error instanceof Error ? error.message : "Data could not be restored.";
      status = "Data restore failed.";
    }
  }

  async function prepareFullBackup(): Promise<void> {
    if (!store || backupBusy) return;
    preparingFull = true;
    preparedFull = undefined;
    fullBackupError = undefined;
    status = "Preparing full backup…";
    try {
      const prepared = await prepareMusicFullBackup(store);
      if (!alive) return;
      preparedFull = prepared;
      status = "Full backup is ready to download.";
    } catch (error) {
      if (alive) {
        fullBackupError = error instanceof Error ? error.message : "Full backup could not be prepared.";
        status = "Full backup preparation failed.";
      }
    } finally {
      if (alive) preparingFull = false;
    }
  }

  function downloadFullBackup(): void {
    if (!preparedFull || backupBusy) return;
    const url = URL.createObjectURL(preparedFull.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `practice-os-full-${preparedFull.manifest.data.exportedAt.slice(0, 10)}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    status = "Full backup downloaded.";
  }

  async function selectFullBackup(event: Event): Promise<void> {
    if (backupBusy) return;
    const generation = ++selectionGeneration;
    selectedFull = undefined;
    selectedBackup = undefined;
    currentCounts = undefined;
    fullBackupError = undefined;
    backupError = undefined;
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size === 0 || file.size > MUSIC_FULL_BACKUP_MAX_BYTES) {
      fullBackupError = file.size === 0 ? "The full backup file is empty." : "The full backup is larger than 250 MiB.";
      return;
    }
    try {
      const parsed = await parseMusicFullBackup(file);
      if (!alive || generation !== selectionGeneration || !store) return;
      const current = await prepareMusicDataBackup(store);
      if (!alive || generation !== selectionGeneration) return;
      selectedFull = parsed;
      selectedFileSize = file.size;
      currentCounts = current.counts;
      status = "Full backup is ready to review.";
    } catch (error) {
      if (alive && generation === selectionGeneration)
        fullBackupError = error instanceof Error ? error.message : "The full backup file is invalid.";
    }
  }

  async function restoreFullBackup(): Promise<void> {
    if (!store || !selectedFull || backupBusy) return;
    restoring = true;
    fullBackupError = undefined;
    status = "Restoring full backup…";
    try {
      await restoreMusicFullBackup(store, selectedFull);
      window.location.reload();
    } catch (error) {
      if (!alive) return;
      restoring = false;
      fullBackupError = error instanceof Error ? error.message : "Full backup could not be restored.";
      status = "Full backup restore failed.";
    }
  }

  function formatBytes(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  async function resetLocalData(): Promise<void> {
    if (!store || backupBusy) return;
    restoring = true;
    status = "Resetting local data…";
    try {
      await store.database.delete();
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("music")) window.localStorage.removeItem(key);
      }
      window.location.reload();
    } catch (error) {
      if (!alive) return;
      restoring = false;
      status = error instanceof Error ? error.message : "Local data could not be reset.";
      confirmReset = false;
    }
  }

  const deviceProfiles = browser ? new DeviceProfileStore(store?.settings) : undefined;
  let savedProfiles = $state<DeviceProfile[]>([]);
  // Built up front: the panel subscribes to taps *before* it asks for clicks,
  // so a source created inside the runner would miss the whole first run.
  const microphone = browser ? new AudioPitchSource() : undefined;

  if (deviceProfiles) {
    void deviceProfiles.load().then((state) => {
      if (alive) savedProfiles = state.profiles;
    });
  }

  /** Device ids that carry their own offset, which overrides the global one. */
  const deviceOffsets = $derived(
    new Map(
      savedProfiles
        .filter((profile) => profile.inputOffsetMs !== undefined)
        .map((profile) => [profile.id, profile.inputOffsetMs!]),
    ),
  );
  const reportedLatency = $derived(runtime.audioEnabled ? runtime.sound.reportedLatency : {});
  const outputLatencyLabel = $derived(
    [
      reportedLatency.outputMs === undefined ? "Not reported" : `${reportedLatency.outputMs} ms`,
      reportedLatency.baseMs === undefined ? undefined : `browser graph ${reportedLatency.baseMs} ms`,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  // Calibration drives the shared clock, so it must not fight a running one.
  const calibrationBlocked = $derived(
    runtime.metronomeRunning || runtime.practicePhase !== "idle"
      ? "Stop the metronome and any running drill before calibrating."
      : undefined,
  );
  /**
   * One row per connected MIDI input, plus any device that still holds a saved
   * offset while unplugged — otherwise its offset could never be reset.
   */
  const midiDevices = $derived.by(() => {
    const rows = runtime.midi.state.inputs.map((input) => ({
      id: input.id,
      label: savedProfiles.find((profile) => profile.id === input.id)?.alias || input.name,
      connected: true,
    }));
    for (const profile of savedProfiles) {
      if (profile.inputOffsetMs === undefined) continue;
      if (rows.some((row) => row.id === profile.id)) continue;
      rows.push({ id: profile.id, label: profile.alias || profile.id, connected: false });
    }
    return rows;
  });

  /**
   * Play `beats` clicks and report each one on the performance.now clock.
   *
   * This drives the *shared* Tone transport, which is why calibration is blocked
   * while the metronome or a drill runs. It is safe afterwards because
   * `MusicRuntime` re-applies bpm, time signature and grid before every start.
   */
  async function runClicks(input: ClickRunInput): Promise<ClickRun> {
    if (!(await runtime.enableAudio())) throw new Error(runtime.audioMessage);
    let heard = 0;
    let settle!: () => void;
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const engine = await createToneTransportEngine({
      bpm: input.bpm,
      numerator: 4,
      onMetronomeClick: (event) => {
        if (heard >= input.beats) return;
        heard += 1;
        runtime.sound.playMetronomeClick(event.atSeconds, event.accented);
        input.onClick(event.atMonotonicMs);
        if (heard >= input.beats) settle();
      },
    });
    engine.start();
    return {
      done,
      stop: () => {
        if (engine.state.running) engine.stop();
        settle();
      },
    };
  }

  async function runMicrophoneClicks(input: ClickRunInput): Promise<ClickRun> {
    if (!microphone) throw new Error("The microphone is not available here.");
    await microphone.start();
    if (microphone.state.status !== "running") {
      throw new Error(
        microphone.state.status === "error"
          ? microphone.state.message
          : "The microphone did not start.",
      );
    }
    return runClicks(input);
  }

  /** Taps as the router delivers them, i.e. with the saved offset applied. */
  function subscribeTaps(accept: (event: { source: string; deviceId?: string }) => boolean) {
    return (listener: (atMs: number) => void) =>
      runtime.router.subscribe((event) => {
        if (event.type === "noteOff" || !accept(event)) return;
        listener(event.timestamp);
      });
  }

  function subscribeMicrophoneTaps(listener: (atMs: number) => void): () => void {
    const stopForwarding = microphone?.subscribeOnsets((event) => {
      runtime.router.push(event);
    });
    const unsubscribe = subscribeTaps((event) => event.source === "audio")(listener);
    return () => {
      unsubscribe();
      stopForwarding?.();
      void microphone?.stop();
    };
  }

  async function saveDeviceOffset(id: string, offsetMs?: number): Promise<void> {
    if (!deviceProfiles) return;
    const { inputOffsetMs: _previous, ...rest } = deviceProfiles.profile(id) ?? { id };
    const next = await deviceProfiles.saveProfile(
      offsetMs === undefined ? rest : { ...rest, inputOffsetMs: offsetMs },
    );
    savedProfiles = next.profiles;
    await runtime.reloadMidiInstruments();
  }

  const sliderClass = "w-32 accent-primary sm:w-40";
  const selectClass =
    "flex h-9 rounded-lg border border-input bg-background pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

<svelte:head>
  <title>Settings | Practice OS</title>
  <meta name="description" content="Audio, input, latency, appearance and local data preferences for the Music app." />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Settings" subtitle="Audio, input, latency, appearance and your data." />

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
  {#if runtime.settingsError}
    <p class="text-sm text-destructive" role="alert">
      Changes are not saved: {runtime.settingsError}
    </p>
  {/if}

  <div class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <Card.Root class="min-w-0">
      <Card.Header>
        <SectionHeading title="Audio" eyebrow="Sound out" description="What you hear from prompts, drills and the metronome." />
      </Card.Header>
      <Card.Content class="divide-y divide-border">
        <SettingsRow label="Audio engine" help={runtime.audioMessage}>
          <Button type="button" disabled={runtime.audioPending || runtime.playbackVoicePending} onclick={testAudio}>
            {runtime.audioEnabled ? "Test audio" : "Enable/Test audio"}
          </Button>
        </SettingsRow>
        {#if runtime.playbackFallback}
          <p class="py-3 text-sm text-warn" role="status">{runtime.playbackFallback}</p>
        {/if}
        <SettingsRow
          label="Playback sound"
          for="playback-sound"
          help={`Used for prompts and generated notes. This session: ${PLAYBACK_SOUND_LABELS[runtime.effectivePlaybackSound]}.`}
        >
          <select
            id="playback-sound"
            class={selectClass}
            value={settings?.preferredPlaybackSound ?? "salamander-piano"}
            onchange={(event) =>
              patch({ preferredPlaybackSound: event.currentTarget.value as MusicSettings["preferredPlaybackSound"] })}
          >
            {#each PLAYBACK_SOUND_IDS as sound (sound)}
              <option value={sound}>{PLAYBACK_SOUND_LABELS[sound]}</option>
            {/each}
          </select>
        </SettingsRow>
        <SettingsRow label="Playback & drill sounds" for="playback-level">
          <span class="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">{Math.round((settings?.playbackLevel ?? 0.8) * 100)}%</span>
          <input
            id="playback-level"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class={sliderClass}
            value={settings?.playbackLevel ?? 0.8}
            oninput={(event) => patch({ playbackLevel: Number(event.currentTarget.value) })}
          />
        </SettingsRow>
        <SettingsRow label="Metronome" for="metronome-level">
          <span class="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">{Math.round((settings?.metronomeLevel ?? 0.7) * 100)}%</span>
          <input
            id="metronome-level"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class={sliderClass}
            value={settings?.metronomeLevel ?? 0.7}
            oninput={(event) => patch({ metronomeLevel: Number(event.currentTarget.value) })}
          />
        </SettingsRow>
        <SettingsRow label="Master volume" for="master-level">
          <span class="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">{Math.round((settings?.masterLevel ?? 1) * 100)}%</span>
          <input
            id="master-level"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class={sliderClass}
            value={settings?.masterLevel ?? 1}
            oninput={(event) => patch({ masterLevel: Number(event.currentTarget.value) })}
          />
        </SettingsRow>
        <SettingsRow label="Mute all audio" for="mute-all" help="Keeps the volume values unchanged.">
          <input
            id="mute-all"
            type="checkbox"
            class="size-5 accent-primary"
            checked={settings?.muted ?? false}
            onchange={(event) => patch({ muted: event.currentTarget.checked })}
          />
        </SettingsRow>
        <p class="pt-3 text-xs text-muted-foreground">
          Sampled Piano uses the
          <a class="underline" href="https://github.com/sfzinstruments/SalamanderGrandPiano" target="_blank" rel="noreferrer">Salamander Grand Piano</a>
          by Alexander Holm, licensed
          <a class="underline" href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>.
        </p>
      </Card.Content>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <SectionHeading title="Input" eyebrow="Sound in" description="Microphone and MIDI sources. Routing per instrument lives on Connect." />
      </Card.Header>
      <Card.Content class="divide-y divide-border">
        <SettingsRow label="Audio input label" for="audio-input-label" help="Display label for your chosen audio input.">
          <Input
            id="audio-input-label"
            class="w-48"
            value={settings?.audioInputLabel ?? ""}
            oninput={(event) => patch({ audioInputLabel: event.currentTarget.value })}
          />
        </SettingsRow>
        <SettingsRow label="Echo cancellation / AGC" for="echo-cancellation" help="Off is recommended for instruments.">
          <input
            id="echo-cancellation"
            type="checkbox"
            class="size-5 accent-primary"
            checked={settings?.echoCancellation ?? false}
            onchange={(event) => patch({ echoCancellation: event.currentTarget.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label="MIDI devices"
          help={runtime.midi.state.enabled ? `${runtime.midi.state.inputs.length} connected` : "Not requested"}
        >
          <Button type="button" variant="outline" onclick={() => runtime.midi.enable()}>
            {runtime.midi.state.enabled ? "Connected" : "Enable MIDI"}
          </Button>
          <Button href="/music/connect" variant="ghost" size="sm">Connect</Button>
        </SettingsRow>
      </Card.Content>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <SectionHeading
          title="Latency calibration"
          eyebrow="Timing"
          description="Offsets pull late input back to when you played it, so every drill scores the same. A positive offset means your hits arrive late and are pulled earlier."
        />
      </Card.Header>
      <Card.Content class="divide-y divide-border">
        <SettingsRow
          label="Output latency (reported by the browser)"
          help="Read-only. The click is already scheduled against the audio clock, so this is never applied to scoring."
        >
          <span class="font-mono text-sm tabular-nums">{outputLatencyLabel}</span>
        </SettingsRow>
        <CalibrationPanel
          label="Microphone"
          detail="Audio input"
          offsetMs={settings?.audioOffsetMs ?? 0}
          disabledReason={AudioPitchSource.supported
            ? calibrationBlocked
            : "This browser has no microphone input."}
          runClicks={runMicrophoneClicks}
          subscribeTaps={subscribeMicrophoneTaps}
          onSave={(offsetMs) => patch({ audioOffsetMs: offsetMs })}
          onReset={() => patch({ audioOffsetMs: 0 })}
          onStatus={(message) => (status = message)}
        />
        <CalibrationPanel
          label="MIDI"
          detail="Every device without its own offset"
          offsetMs={settings?.midiOffsetMs ?? 0}
          disabledReason={calibrationBlocked}
          {runClicks}
          subscribeTaps={subscribeTaps(
            (event) =>
              event.source === "midi" &&
              (event.deviceId === undefined || !deviceOffsets.has(event.deviceId)),
          )}
          onSave={(offsetMs) => patch({ midiOffsetMs: offsetMs })}
          onReset={() => patch({ midiOffsetMs: 0 })}
          onStatus={(message) => (status = message)}
        />
        {#each midiDevices as device (device.id)}
          <CalibrationPanel
            label={device.label}
            detail={deviceOffsets.has(device.id)
              ? "This MIDI device only"
              : `Using the MIDI offset (${settings?.midiOffsetMs ?? 0} ms)`}
            offsetMs={deviceOffsets.get(device.id) ?? 0}
            disabledReason={device.connected ? calibrationBlocked : "Not connected."}
            {runClicks}
            subscribeTaps={subscribeTaps(
              (event) => event.source === "midi" && event.deviceId === device.id,
            )}
            onSave={(offsetMs) => saveDeviceOffset(device.id, offsetMs)}
            onReset={() => saveDeviceOffset(device.id)}
            onStatus={(message) => (status = message)}
          />
        {/each}
      </Card.Content>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <SectionHeading title="Appearance" eyebrow="Look" description="Theme follows the site toggle. These tune the Music app." />
      </Card.Header>
      <Card.Content class="divide-y divide-border">
        <SettingsRow label="Reduce motion" for="reduce-motion" help="Minimise animations and glow pulses.">
          <input
            id="reduce-motion"
            type="checkbox"
            class="size-5 accent-primary"
            checked={settings?.reduceMotion ?? false}
            onchange={(event) => patch({ reduceMotion: event.currentTarget.checked })}
          />
        </SettingsRow>
        <SettingsRow label="Instrument color coding" for="instrument-color" help="Tint UI by the active instrument.">
          <input
            id="instrument-color"
            type="checkbox"
            class="size-5 accent-primary"
            checked={settings?.instrumentColorCoding ?? true}
            onchange={(event) => patch({ instrumentColorCoding: event.currentTarget.checked })}
          />
        </SettingsRow>
      </Card.Content>
    </Card.Root>

    <Card.Root class="min-w-0">
      <Card.Header>
        <SectionHeading title="Your data" eyebrow="Local" description="Everything stays in this browser. Nothing is sent anywhere." />
      </Card.Header>
      <Card.Content class="divide-y divide-border">
        <SettingsRow label="Export journal" help="Every practice session as JSON.">
          <Button type="button" variant="outline" disabled={!store} onclick={exportJournal}>Export journal</Button>
        </SettingsRow>
        <div class="space-y-3 py-4" data-settings-row>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm font-medium">Data backup</span>
            <span class="text-xs text-muted-foreground">All Music data tables as versioned JSON.</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!store || backupBusy} onclick={prepareDataBackup}>Prepare data backup</Button>
            <Button type="button" variant="outline" disabled={!preparedBackup || backupBusy} onclick={downloadDataBackup}>Download data backup</Button>
          </div>
          {#if preparedBackup}
            <ul class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
              {#each Object.entries(preparedBackup.counts) as [name, count] (name)}
                <li>{name}: {count}</li>
              {/each}
            </ul>
            <p class="text-xs text-muted-foreground">
              {Object.values(preparedBackup.counts).reduce((sum, count) => sum + count, 0)} rows · {formatBytes(preparedBackup.byteSize)}.
              Audio files and sample files are not included.
            </p>
            <p class="text-xs text-muted-foreground">Excluded media references: {preparedBackup.backup.media.backingTrackFiles} backing tracks, {preparedBackup.backup.media.audioTakeFiles} audio takes, {preparedBackup.backup.media.sampleFiles} sample files.</p>
          {/if}
          <label class="block space-y-1 text-sm">
            <span>Choose a data backup to restore</span>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Data backup file"
              class="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2"
              onchange={selectDataBackup}
              disabled={backupBusy}
            />
          </label>
          {#if backupError}
            <p class="text-sm text-destructive" role="alert">{backupError}</p>
          {/if}
          {#if selectedBackup && currentCounts}
            <section class="space-y-3 rounded-lg border border-border p-3" aria-label="Data backup review">
              <p class="text-sm font-medium">Review this replacement</p>
              <ul class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                {#each Object.entries(tableCounts(selectedBackup.tables)) as [name, count] (name)}
                  <li>{name}: {currentCounts[name] ?? 0} → {count}</li>
                {/each}
              </ul>
              <p class="text-xs text-muted-foreground">Selected file: {formatBytes(selectedFileSize)}.</p>
              <p class="text-sm">All ten Music data tables will be replaced.</p>
              <p class="text-sm">Audio files and sample files are not included.</p>
              <p class="text-xs text-muted-foreground">Excluded media references: {selectedBackup.media.backingTrackFiles} backing tracks, {selectedBackup.media.audioTakeFiles} audio takes, {selectedBackup.media.sampleFiles} sample files.</p>
              <p class="text-sm">Existing media records must be present and unchanged in this backup. Imported media cannot play unless its files already exist on this device.</p>
              <p class="text-sm">Close other Practice OS tabs before restoring.</p>
              <p class="text-xs text-muted-foreground">Site and PDF data, drill URL memory, and local media files are unchanged.</p>
              <Button type="button" variant="destructive" disabled={backupBusy} onclick={restoreData}>Restore data</Button>
            </section>
          {/if}
        </div>
        <div class="space-y-3 py-4" data-settings-row>
          <div class="space-y-1">
            <p class="text-sm font-medium">Full backup</p>
            <p class="text-xs text-muted-foreground">Saved history, scores, settings, and every referenced audio and sample file in one ZIP. Up to 250 MiB; close other Practice OS tabs first.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!store || backupBusy} onclick={prepareFullBackup}>Prepare full backup</Button>
            <Button type="button" variant="outline" disabled={!preparedFull || backupBusy} onclick={downloadFullBackup}>Download full backup</Button>
          </div>
          {#if preparedFull}
            <p class="text-sm">{formatBytes(preparedFull.byteSize)} · {preparedFull.manifest.assets.length} media files included.</p>
            <ul class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
              {#each Object.entries(tableCounts(preparedFull.manifest.data.tables)) as [name, count] (name)}
                <li>{name}: {count}</li>
              {/each}
            </ul>
          {/if}
          <label class="block space-y-1 text-sm">
            <span>Choose a full backup to restore</span>
            <input type="file" accept="application/zip,.zip" aria-label="Full backup file" disabled={backupBusy}
              class="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2"
              onchange={selectFullBackup} />
          </label>
          {#if fullBackupError}<p class="text-sm text-destructive" role="alert">{fullBackupError}</p>{/if}
          {#if selectedFull && currentCounts}
            <section class="space-y-3 rounded-lg border border-border p-3" aria-label="Full backup review">
              <p class="text-sm font-medium">Review this full replacement</p>
              <ul class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                {#each Object.entries(tableCounts(selectedFull.manifest.data.tables)) as [name, count] (name)}
                  <li>{name}: {currentCounts[name] ?? 0} → {count}</li>
                {/each}
              </ul>
              <p class="text-sm">{formatBytes(selectedFileSize)} · {selectedFull.manifest.assets.length} verified media files included.</p>
              <p class="text-sm">All ten Music data tables will be replaced. Missing audio and sample files will be added.</p>
              <p class="text-sm">Existing media records must be present and unchanged in this backup. Existing files must match exactly; different files are never overwritten.</p>
              <p class="text-sm">Close other Practice OS tabs. Keep this tab open until the restore finishes and reloads.</p>
              <p class="text-xs text-muted-foreground">Site and PDF data and remembered drill URLs are excluded. If a restore fails, its new files are removed; any cleanup failure is reported.</p>
              <Button type="button" variant="destructive" disabled={backupBusy} onclick={restoreFullBackup}>Restore full backup</Button>
            </section>
          {/if}
        </div>
        <SettingsRow label="Reset local data" help="Deletes sessions, mastery, songs, takes and settings on this device.">
          {#if confirmReset}
            <span class="text-sm">Delete everything?</span>
            <Button type="button" variant="destructive" disabled={backupBusy} onclick={resetLocalData}>Yes, reset</Button>
            <Button type="button" variant="ghost" onclick={() => (confirmReset = false)}>Keep</Button>
          {:else}
            <Button type="button" variant="outline" disabled={!store || backupBusy} onclick={() => (confirmReset = true)}>Reset local data</Button>
          {/if}
        </SettingsRow>
      </Card.Content>
    </Card.Root>
  </div>
</PracticeScreen>
