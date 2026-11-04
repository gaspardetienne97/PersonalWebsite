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
    drone: "A held home note to play scales and long tones against. Press Play, then play along.",
  };
  type Mode = (typeof TABS)[number]["id"];
  const mode = $derived<Mode>(
    TABS.find((t) => t.id === page.url.searchParams.get("mode"))?.id ?? "tune",
  );
  let status = $state("");
</script>

<svelte:head><title>{mode === "drone" ? "Drone" : "Tuner"} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight">{mode === "drone" ? "Drone" : "Tuner"}</h1>
      <p class="mt-1 max-w-prose text-ws-soft">{BLURB[mode]}</p>
    </div>
    <HubTabs param="mode" tabs={TABS} label="Tuner modes" />
  </header>

  {#if mode === "drone"}
    <Drone onstatus={(s) => (status = s)} />
  {:else}
    <Listen {mode} onstatus={(s) => (status = s)} />
  {/if}

  <!-- Announced to screen readers; the page already shows the state. -->
  <p role="status" class="sr-only">{status}</p>
</div>
