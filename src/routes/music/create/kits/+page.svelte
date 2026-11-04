<script lang="ts">
  // Sample kits: the pads and samples the beat plays, and what goes to the MPC.
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import KitPanel from "$lib/music/hubs/create/KitPanel.svelte";
  import { bench } from "$lib/music/bench.svelte";

  let status = $state("");

  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });
</script>

<svelte:head><title>Sample kits | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="min-w-0">
    <a class="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-instr-ink" href="/music/create"><ArrowLeft class="size-4" aria-hidden="true" />Create</a>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Sample kits</h1>
    <p class="mt-1 max-w-prose text-ws-soft">
      Put your own sounds on pads. The beat in Create plays them in place of the built-in drums. Kits stay in this browser.
    </p>
  </header>
  <p role="status" class="-my-3 text-sm font-medium empty:sr-only">{status}</p>
  <KitPanel announce={(msg) => (status = msg)} />
</div>
