<script lang="ts">
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { pwaInfo } from "virtual:pwa-info";

  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Toaster } from "@repo/ui/sonner";

  import CommandPalette from "./_components/CommandPalette.svelte";
  import FloatingPracticeControls from "./_components/FloatingPracticeControls.svelte";
  import MusicNavigation from "./_components/MusicNavigation.svelte";
  import MusicTopBar from "./_components/MusicTopBar.svelte";
  import { createMusicRuntime } from "./_runtime.svelte";

  let { children } = $props();
  let paletteOpen = $state(false);
  const webManifest = pwaInfo?.webManifest.linkTag;
  const currentPath = $derived($page.url?.pathname ?? "/music");
  // Drill routes: on a phone the search + streak bar gives its row back to
  // the drill; streak and XP still live on Practice home and Progress.
  const drillRoute = $derived(/^\/music\/(?:play|learn)\/.|^\/music\/jam$/.test(currentPath));
  const runtime = createMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const storageReady = store ? runtime.attachStorage(store.settings) : Promise.resolve();
  let practiceNavigationActivation = 0;

  afterNavigate((navigation) => {
    if (navigation.type === "enter") return;
    runtime.activatePracticeNavigation(
      ++practiceNavigationActivation,
      Number(navigation.to?.url.searchParams.get("bpm")) || undefined,
    );
  });

  onMount(async () => {
    if (store) {
      await storageReady;
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

<div
  class="flex h-full bg-background text-foreground"
  data-music-shell
  data-app="music"
  data-instr={runtime.activeInstrument}
>
  {#if !runtime.drillFocus}
    <MusicNavigation {currentPath} />
  {/if}
  <div class="flex min-w-0 flex-1 flex-col">
    {#if !runtime.drillFocus}
      <MusicTopBar class={drillRoute ? "hidden lg:flex" : ""} onSearch={() => (paletteOpen = true)} />
    {/if}
    <div
      class="pointer-events-none sticky {runtime.drillFocus
        ? 'top-0'
        : drillRoute
          ? 'top-12 lg:top-[5.75rem]'
          : 'top-[5.75rem]'} z-30 flex justify-center px-2 py-2"
      data-practice-controls-row
    >
      <div class="pointer-events-auto">
        <FloatingPracticeControls
          instrument={runtime.activeInstrument}
          instruments={runtime.practiceInstrumentOptions}
          instrumentPinned={runtime.practiceInstrumentPinned}
          bpm={runtime.practiceBpm}
          countInBars={runtime.countInBars}
          metronomeEnabled={runtime.metronomeEnabled}
          metronomeRunning={runtime.metronomeRunning}
          performancePending={runtime.performancePending}
          phase={runtime.practicePhase}
          activeBeat={runtime.activeBeat}
          beatsPerBar={runtime.practiceMeter.numerator}
          onInstrument={(instrument) => runtime.setActiveInstrument(instrument)}
          onToggleMetronome={() => runtime.toggleMetronome()}
          onBpm={(bpm) => runtime.setPracticeBpm(bpm)}
          onCountIn={(bars) => runtime.setCountIn(bars)}
        />
      </div>
    </div>
    <div class="flex-1">
      {@render children()}
    </div>
  </div>
  <CommandPalette bind:open={paletteOpen} />
  <Toaster position="bottom-center" richColors closeButton />
</div>

<style>
  @media (width < 48rem) {
    :global(.app:has([data-music-shell])) {
      padding-bottom: 53px;
    }

    :global(.drill-focus .app:has([data-music-shell])) {
      padding-bottom: 0;
    }
  }
</style>
