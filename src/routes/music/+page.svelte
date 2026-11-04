<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import TodayView from "$lib/music/hubs/TodayView.svelte";
  import DrillsView from "$lib/music/hubs/DrillsView.svelte";
  import PathsView from "$lib/music/hubs/PathsView.svelte";

  const TABS = [
    { id: "today", label: "Today" },
    { id: "drills", label: "Drills" },
    { id: "paths", label: "Paths" },
  ] as const;
  const tab = $derived(page.url.searchParams.get("tab") ?? "today");
  const title = $derived(TABS.find((t) => t.id === tab)?.label ?? "Today");
  const TAGLINE: Record<string, string> = {
    today: "Short sessions, honest scores, and what to play next.",
    drills: "Every drill, grouped by what it trains.",
    paths: "Step by step, from first notes to a real repertoire.",
  };
</script>

<svelte:head><title>{title} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <!-- One title per view, named for it; the segmented control switches views, the sidebar switches sections. -->
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p class="mt-1 text-ws-soft max-sm:hidden">{TAGLINE[tab] ?? TAGLINE.today}</p>
    </div>
    <HubTabs param="tab" tabs={TABS} label="Practice views" />
  </header>
  {#if tab === "drills"}<DrillsView />{:else if tab === "paths"}<PathsView />{:else}<TodayView />{/if}
</div>
