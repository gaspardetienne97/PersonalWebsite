<script lang="ts">
  import {
    PLAYBACK_SOUND_IDS,
    PLAYBACK_SOUND_LABELS,
    type MusicSettings,
  } from "@repo/music-core/engines/settings";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();

  let settings = $state(runtime.getMusicSettings());
  let ready = $state(runtime.settingsReady);
  let status = $state(runtime.settingsReady ? "Settings loaded." : "Loading settings.");

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
</script>

<svelte:head>
  <title>Settings | Practice OS</title>
  <meta name="description" content="Audio, MIDI, latency calibration, and appearance preferences for the Music app." />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Settings" subtitle="Audio, MIDI, latency calibration, and appearance." />

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
  {#if runtime.settingsError}
    <p class="text-sm text-destructive" role="alert">
      Changes are not saved: {runtime.settingsError}
    </p>
  {/if}

  <div class="grid gap-6">
    <!-- Audio & MIDI -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Audio &amp; MIDI</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={runtime.audioPending || runtime.playbackVoicePending} onclick={testAudio}>
            {runtime.audioEnabled ? "Test audio" : "Enable/Test audio"}
          </Button>
          <span class="text-sm text-muted-foreground">{runtime.audioMessage}</span>
        </div>

        {#if runtime.playbackFallback}
          <p class="text-sm text-warn" role="status">{runtime.playbackFallback}</p>
        {/if}

        <div class="grid gap-2 sm:max-w-sm">
          <Label for="audio-input-label">Audio input label</Label>
          <Input
            id="audio-input-label"
            aria-label="Audio input label"
            value={settings?.audioInputLabel ?? ""}
            oninput={(event) => patch({ audioInputLabel: event.currentTarget.value })}
          />
          <p class="text-xs text-muted-foreground">Display label for your chosen audio input.</p>
        </div>

        <label class="flex items-center justify-between gap-4">
          <span>
            <span class="block font-medium">Echo cancellation / AGC</span>
            <span class="text-xs text-muted-foreground">Off is recommended for instruments.</span>
          </span>
          <input
            type="checkbox"
            class="size-5 accent-primary"
            aria-label="Echo cancellation"
            checked={settings?.echoCancellation ?? false}
            onchange={(event) => patch({ echoCancellation: event.currentTarget.checked })}
          />
        </label>

        <div class="flex items-center justify-between gap-4">
          <span>
            <span class="block font-medium">MIDI devices</span>
            <span class="text-xs text-muted-foreground">
              {runtime.midi.state.enabled
                ? `${runtime.midi.state.inputs.length} connected`
                : "Not requested"}
            </span>
          </span>
          <Button type="button" variant="outline" onclick={() => runtime.midi.enable()}>
            {runtime.midi.state.enabled ? "Connected" : "Enable MIDI"}
          </Button>
        </div>

        <div class="grid gap-2 sm:max-w-sm">
          <Label for="playback-sound">Playback sound</Label>
          <select
            id="playback-sound"
            class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Playback sound"
            value={settings?.preferredPlaybackSound ?? "salamander-piano"}
            onchange={(event) => patch({ preferredPlaybackSound: event.currentTarget.value })}
          >
            {#each PLAYBACK_SOUND_IDS as sound}
              <option value={sound}>{PLAYBACK_SOUND_LABELS[sound]}</option>
            {/each}
          </select>
          <p class="text-xs text-muted-foreground">
            Used for prompts and generated notes. Effective this session: {PLAYBACK_SOUND_LABELS[runtime.effectivePlaybackSound]}.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <label class="grid gap-2 text-sm font-medium">
            Playback &amp; drill sounds
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings?.playbackLevel ?? 0.8}
              oninput={(event) => patch({ playbackLevel: Number(event.currentTarget.value) })}
            />
          </label>
          <label class="grid gap-2 text-sm font-medium">
            Metronome
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings?.metronomeLevel ?? 0.7}
              oninput={(event) => patch({ metronomeLevel: Number(event.currentTarget.value) })}
            />
          </label>
          <label class="grid gap-2 text-sm font-medium">
            Master volume
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings?.masterLevel ?? 1}
              oninput={(event) => patch({ masterLevel: Number(event.currentTarget.value) })}
            />
          </label>
        </div>

        <label class="flex items-center justify-between gap-4">
          <span>
            <span class="block font-medium">Mute all audio</span>
            <span class="text-xs text-muted-foreground">Keeps the volume slider values unchanged.</span>
          </span>
          <input
            type="checkbox"
            class="size-5 accent-primary"
            aria-label="Mute all audio"
            checked={settings?.muted ?? false}
            onchange={(event) => patch({ muted: event.currentTarget.checked })}
          />
        </label>

        <p class="text-xs text-muted-foreground">
          Sampled Piano uses the
          <a class="underline" href="https://github.com/sfzinstruments/SalamanderGrandPiano" target="_blank" rel="noreferrer">Salamander Grand Piano</a>
          by Alexander Holm, licensed
          <a class="underline" href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>.
        </p>
      </Card.Content>
    </Card.Root>



    <!-- Latency -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Latency calibration</Card.Title>
        <Card.Description>
          Round-trip offsets keep scoring fair across audio and MIDI.
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-5 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="audio-offset">Audio offset (ms)</Label>
          <Input
            id="audio-offset"
            aria-label="Audio offset"
            type="number"
            value={settings?.audioOffsetMs ?? 0}
            oninput={(event) => patch({ audioOffsetMs: Number(event.currentTarget.value) })}
          />
        </div>
        <div class="grid gap-2">
          <Label for="midi-offset">MIDI offset (ms)</Label>
          <Input
            id="midi-offset"
            aria-label="MIDI offset"
            type="number"
            value={settings?.midiOffsetMs ?? 0}
            oninput={(event) => patch({ midiOffsetMs: Number(event.currentTarget.value) })}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Appearance -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Appearance</Card.Title>
        <Card.Description>Theme is controlled by the site toggle; these tune the Music app.</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-5">
        <label class="flex items-center justify-between gap-4">
          <span>
            <span class="block font-medium">Reduce motion</span>
            <span class="text-xs text-muted-foreground">Minimise animations and glow pulses.</span>
          </span>
          <input
            type="checkbox"
            class="size-5 accent-primary"
            aria-label="Reduce motion"
            checked={settings?.reduceMotion ?? false}
            onchange={(event) => patch({ reduceMotion: event.currentTarget.checked })}
          />
        </label>
        <label class="flex items-center justify-between gap-4">
          <span>
            <span class="block font-medium">Instrument color coding</span>
            <span class="text-xs text-muted-foreground">Tint UI by the active instrument.</span>
          </span>
          <input
            type="checkbox"
            class="size-5 accent-primary"
            aria-label="Instrument color coding"
            checked={settings?.instrumentColorCoding ?? true}
            onchange={(event) => patch({ instrumentColorCoding: event.currentTarget.checked })}
          />
        </label>
      </Card.Content>
    </Card.Root>
  </div>
</PracticeScreen>
