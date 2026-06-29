<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { pwaInfo } from "virtual:pwa-info";

  import { PracticeStore } from "@repo/music-core/engines/store";

  import CommandPalette from "./_components/CommandPalette.svelte";
  import MusicNavigation from "./_components/MusicNavigation.svelte";
  import MusicTopBar from "./_components/MusicTopBar.svelte";
  import MusicTransportBar from "./_components/MusicTransportBar.svelte";
  import { createMusicRuntime } from "./_runtime.svelte";

  let { children } = $props();
  let paletteOpen = $state(false);
  const webManifest = pwaInfo?.webManifest.linkTag;
  const currentPath = $derived($page.url?.pathname ?? "/music");
  const runtime = createMusicRuntime();

  const inputSourceLabel = $derived(
    runtime.activeSource === "midi"
      ? "MIDI"
      : runtime.activeSource === "audio"
        ? "Audio"
        : "On-screen",
  );

  onMount(async () => {
    if (browser) {
      const store = new PracticeStore();
      await runtime.attachStorage(store.settings);
      runtime.attachJournal(store);
      runtime.attachMedia(store);
    }

    if (!pwaInfo) return;

    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  });

  onDestroy(() => {
    runtime.dispose();
  });
</script>

<svelte:head>
  {#if webManifest}
    {@html webManifest}
  {/if}
</svelte:head>

<div class="flex min-h-screen bg-background text-foreground">
  <MusicNavigation {currentPath} />
  <div class="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
    <MusicTopBar onSearch={() => (paletteOpen = true)} />
    <div class="flex-1">
      {@render children()}
    </div>
    <MusicTransportBar
      bpm={runtime.transportBpm}
      onBpm={(value) => runtime.setTransportBpm(value)}
      running={runtime.playbackSource ? runtime.playbackPlaying : runtime.metronomeRunning}
      onToggle={() => runtime.togglePlayback()}
      playContext={runtime.playbackSource?.label}
      metronomeRunning={runtime.metronomeRunning}
      onToggleMetronome={() => runtime.toggleMetronome()}
      audioEnabled={runtime.audioEnabled}
      audioPending={runtime.audioPending}
      onEnableAudio={() => runtime.enableAudio()}
      countInBars={runtime.countInBars}
      onCountIn={(bars) => runtime.setCountIn(bars)}
      muted={runtime.masterMuted}
      onToggleMute={() => runtime.toggleMute()}
      metronomeLevel={runtime.metronomeLevel}
      onMetronomeLevel={(level) => runtime.setMetronomeLevel(level)}
      instrument={runtime.instrument}
      instruments={runtime.instruments}
      onInstrument={(name) => runtime.setInstrument(name)}
      inputSource={inputSourceLabel}
      midiActive={runtime.activeSource === "midi"}
      midiInstruments={runtime.midiInstruments}
      activeInstrument={runtime.activeInstrument}
      onSelectMidiInstrument={(instrument, channel) =>
        runtime.setActiveMidiInstrument(instrument, channel)}
    />
  </div>
  <CommandPalette bind:open={paletteOpen} />
</div>
