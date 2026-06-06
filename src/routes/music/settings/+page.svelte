<script lang="ts">
  import { browser } from "$app/environment";

  import {
    DEFAULT_MUSIC_SETTINGS,
    MusicSettingsStore,
    type MusicSettings,
  } from "@repo/music-core/engines/settings";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const settingsStore = new MusicSettingsStore(store?.settings);

  let settings = $state<MusicSettings>({ ...DEFAULT_MUSIC_SETTINGS });
  let ready = $state(false);
  let status = $state("Loading settings.");

  void initialize();

  async function initialize(): Promise<void> {
    try {
      settings = await settingsStore.load();
      ready = true;
      status = "Settings loaded.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Settings could not be loaded.";
    }
  }

  async function patch(next: Partial<MusicSettings>): Promise<void> {
    if (!ready) return;
    try {
      settings = await settingsStore.update(next);
      status = "Saved.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Settings could not be saved.";
    }
  }
</script>

<svelte:head>
  <title>Settings | Musicianship OS</title>
  <meta name="description" content="Audio, MIDI, latency, and appearance preferences for the Music app." />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Settings" subtitle="Audio, MIDI, latency calibration, and appearance." />

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>

  <div class="grid gap-6">
    <!-- Audio & MIDI -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Audio &amp; MIDI</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-5">
        <div class="grid gap-2 sm:max-w-sm">
          <Label for="audio-input">Audio input</Label>
          <Input
            id="audio-input"
            aria-label="Audio input"
            value={settings.audioInputLabel}
            oninput={(event) => patch({ audioInputLabel: event.currentTarget.value })}
          />
          <p class="text-xs text-muted-foreground">Disable processing for accurate pitch detection.</p>
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
            checked={settings.echoCancellation}
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
          <Label for="sound-set">Default sound set</Label>
          <Input
            id="sound-set"
            aria-label="Default sound set"
            value={settings.defaultSoundSet}
            oninput={(event) => patch({ defaultSoundSet: event.currentTarget.value })}
          />
          <p class="text-xs text-muted-foreground">Used for prompt playback.</p>
        </div>
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
            value={settings.audioOffsetMs}
            oninput={(event) => patch({ audioOffsetMs: Number(event.currentTarget.value) })}
          />
        </div>
        <div class="grid gap-2">
          <Label for="midi-offset">MIDI offset (ms)</Label>
          <Input
            id="midi-offset"
            aria-label="MIDI offset"
            type="number"
            value={settings.midiOffsetMs}
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
            checked={settings.reduceMotion}
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
            checked={settings.instrumentColorCoding}
            onchange={(event) => patch({ instrumentColorCoding: event.currentTarget.checked })}
          />
        </label>
      </Card.Content>
    </Card.Root>
  </div>
</PracticeScreen>
