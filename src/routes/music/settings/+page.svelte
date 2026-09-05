<script lang="ts">
  import { browser } from "$app/environment";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import {
    PLAYBACK_SOUND_IDS,
    PLAYBACK_SOUND_LABELS,
    type MusicSettings,
  } from "@repo/music-core/engines/settings";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SectionHeading from "../_components/SectionHeading.svelte";
  import SettingsRow from "../_components/SettingsRow.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;

  let settings = $state(runtime.getMusicSettings());
  let ready = $state(runtime.settingsReady);
  let status = $state(runtime.settingsReady ? "Settings loaded." : "Loading settings.");
  let confirmReset = $state(false);

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

  function step(key: "audioOffsetMs" | "midiOffsetMs", delta: number): void {
    void patch({ [key]: Math.round(((settings?.[key] ?? 0) + delta) * 10) / 10 });
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

  async function resetLocalData(): Promise<void> {
    if (!store) return;
    status = "Resetting local data…";
    try {
      await store.database.delete();
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("music")) window.localStorage.removeItem(key);
      }
      window.location.reload();
    } catch (error) {
      status = error instanceof Error ? error.message : "Local data could not be reset.";
      confirmReset = false;
    }
  }

  const OFFSET_ROWS = [
    { key: "audioOffsetMs", id: "audio-offset", label: "Audio offset", help: "Microphone and interface round trip." },
    { key: "midiOffsetMs", id: "midi-offset", label: "MIDI offset", help: "Controller and driver round trip." },
  ] as const;

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
          description="Round-trip offsets keep scoring fair across audio and MIDI. Positive values mean the input arrives late."
        />
      </Card.Header>
      <Card.Content class="divide-y divide-border">
        {#each OFFSET_ROWS as row (row.key)}
          <SettingsRow label={row.label} for={row.id} help={row.help}>
            <Button type="button" variant="outline" size="icon" aria-label={`${row.label} minus 5 ms`} onclick={() => step(row.key, -5)}>−</Button>
            <span class="flex items-baseline gap-1">
              <Input
                id={row.id}
                type="number"
                step="1"
                class="w-20 text-right font-mono tabular-nums"
                value={settings?.[row.key] ?? 0}
                oninput={(event) => patch({ [row.key]: Number(event.currentTarget.value) })}
              />
              <span class="text-xs text-muted-foreground">ms</span>
            </span>
            <Button type="button" variant="outline" size="icon" aria-label={`${row.label} plus 5 ms`} onclick={() => step(row.key, 5)}>+</Button>
          </SettingsRow>
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
        <SettingsRow label="Reset local data" help="Deletes sessions, mastery, songs, takes and settings on this device.">
          {#if confirmReset}
            <span class="text-sm">Delete everything?</span>
            <Button type="button" variant="destructive" onclick={resetLocalData}>Yes, reset</Button>
            <Button type="button" variant="ghost" onclick={() => (confirmReset = false)}>Keep</Button>
          {:else}
            <Button type="button" variant="outline" disabled={!store} onclick={() => (confirmReset = true)}>Reset local data</Button>
          {/if}
        </SettingsRow>
      </Card.Content>
    </Card.Root>
  </div>
</PracticeScreen>
