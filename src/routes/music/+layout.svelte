<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { pwaInfo } from "virtual:pwa-info";

  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Toaster } from "@repo/ui/sonner";

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

  // Focus mode: while a drill run is active, hide the site header/footer via
  // a class on <html> (see .drill-focus rules in app.css) — the music-local
  // chrome (nav, topbar) is hidden in the template below. Cleared on layout
  // destroy so leaving /music mid-run never strands the class.
  $effect(() => {
    if (!browser) return;
    document.documentElement.classList.toggle("drill-focus", runtime.drillFocus);
    return () => document.documentElement.classList.remove("drill-focus");
  });
</script>

<svelte:head>
  {#if webManifest}
    {@html webManifest}
  {/if}
</svelte:head>

<div class="flex min-h-screen bg-background text-foreground">
  {#if !runtime.drillFocus}
    <MusicNavigation {currentPath} />
  {/if}
  <div class="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
    {#if !runtime.drillFocus}
      <MusicTopBar onSearch={() => (paletteOpen = true)} />
    {/if}
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
  <Toaster position="bottom-center" richColors closeButton />
</div>
