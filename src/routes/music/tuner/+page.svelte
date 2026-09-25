<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import Listen from "$lib/music/hubs/tools/tuner/Listen.svelte";
  import Drone from "$lib/music/hubs/tools/tuner/Drone.svelte";

  const TABS = [
    { id: "tune", label: "Tune" },
    { id: "intonation", label: "Intonation" },
    { id: "drone", label: "Drone" },
  ] as const;
  const BLURB = {
    tune: "Play one note. The needle shows how far off it is and which way to turn.",
    intonation: "Hold notes steadily and see how well you stay on pitch over ten seconds.",
    drone: "A sustained reference pitch to play scales and long tones against.",
  };
  type Mode = (typeof TABS)[number]["id"];
  const mode = $derived<Mode>(
    TABS.find((t) => t.id === page.url.searchParams.get("mode"))?.id ?? "tune",
  );
  let status = $state("");
</script>

<svelte:head><title>Tuner | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-5">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Tuner</h1>
      <p class="mt-1 max-w-prose text-ws-soft">{BLURB[mode]}</p>
    </div>
    <HubTabs param="mode" tabs={TABS} label="Tuner modes" />
  </header>

  {#if mode === "drone"}
    <Drone onstatus={(s) => (status = s)} />
  {:else}
    <Listen {mode} onstatus={(s) => (status = s)} />
  {/if}

  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
</div>
