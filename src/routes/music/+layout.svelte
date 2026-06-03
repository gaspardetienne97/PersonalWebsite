<script lang="ts">
  import { onMount } from "svelte";
  import { pwaInfo } from "virtual:pwa-info";

  let { children } = $props();
  const webManifest = pwaInfo?.webManifest.linkTag;

  onMount(async () => {
    if (!pwaInfo) return;

    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  });
</script>

<svelte:head>
  {#if webManifest}
    {@html webManifest}
  {/if}
</svelte:head>

{@render children()}
