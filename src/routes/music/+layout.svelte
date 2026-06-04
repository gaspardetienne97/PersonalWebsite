<script lang="ts">
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { pwaInfo } from "virtual:pwa-info";

  import AudioGate from "./_components/AudioGate.svelte";
  import MusicNavigation from "./_components/MusicNavigation.svelte";
  import { createMusicRuntime } from "./_runtime.svelte";

  let { children } = $props();
  const webManifest = pwaInfo?.webManifest.linkTag;
  const currentPath = $derived($page.url?.pathname ?? "/music");
  const runtime = createMusicRuntime();

  onMount(async () => {
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
  <div class="min-w-0 flex-1 pb-16 md:pb-0">
    <AudioGate {runtime} />
    {@render children()}
  </div>
</div>
