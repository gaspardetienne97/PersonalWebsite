<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import TodayView from "#lib/music/hubs/TodayView.svelte";
  import DrillsView from "#lib/music/hubs/DrillsView.svelte";
  import PathsView from "#lib/music/hubs/PathsView.svelte";

  const TABS = [
    { id: "today", label: "Today" },
    { id: "drills", label: "Drills" },
    { id: "paths", label: "Paths" },
  ] as const;
  const tab = $derived(page.url.searchParams.get("tab") ?? "today");
</script>

<svelte:head><title>{TABS.find((t) => t.id === tab)?.label ?? "Today"} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Woodshed</h1>
      <p class="mt-1 text-ws-soft">Short sessions, honest scores, and what to play next.</p>
    </div>
    <HubTabs param="tab" tabs={TABS} label="Practice views" />
  </header>
  {#if tab === "drills"}<DrillsView />{:else if tab === "paths"}<PathsView />{:else}<TodayView />{/if}
</div>
