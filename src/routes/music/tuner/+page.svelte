<script lang="ts">
  import { page } from "$app/state";
  import { m } from "@repo/i18n/messages.js";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import Listen from "#lib/music/hubs/tools/tuner/Listen.svelte";
  import Drone from "#lib/music/hubs/tools/tuner/Drone.svelte";

  const TABS = [
    { id: "tune", label: m.music_runtime_tuner_tab_tune() },
    { id: "intonation", label: m.music_runtime_tuner_tab_intonation() },
    { id: "drone", label: m.music_runtime_tuner_tab_drone() },
  ] as const;
  const BLURB = {
    tune: m.music_runtime_tuner_blurb_tune(),
    intonation: m.music_runtime_tuner_blurb_intonation(),
    drone: m.music_runtime_tuner_blurb_drone(),
  };
  type Mode = (typeof TABS)[number]["id"];
  const mode = $derived<Mode>(
    TABS.find((t) => t.id === page.url.searchParams.get("mode"))?.id ?? "tune",
  );
  let status = $state("");
  const title = $derived(mode === "drone" ? m.music_runtime_tuner_tab_drone() : m.music_runtime_tuner_title());
</script>

<svelte:head><title>{m.music_runtime_tuner_head_title({ title })}</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      <p class="mt-1 max-w-prose text-ws-soft">{BLURB[mode]}</p>
    </div>
    <HubTabs param="mode" tabs={TABS} label={m.music_runtime_tuner_tabs_label()} />
  </header>

  {#if mode === "drone"}
    <Drone onstatus={(s) => (status = s)} />
  {:else}
    <Listen {mode} onstatus={(s) => (status = s)} />
  {/if}

  <!-- Announced to screen readers; the page already shows the state. -->
  <p role="status" class="sr-only">{status}</p>
</div>
