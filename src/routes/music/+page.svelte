<script lang="ts">
  import { page } from "$app/state";
  import TodayView from "$lib/music/hubs/TodayView.svelte";
  import DrillsView from "$lib/music/hubs/DrillsView.svelte";
  import PathsView from "$lib/music/hubs/PathsView.svelte";

  // Two tabs. Paths is a view inside Drills; its address (?tab=paths) is the one every path link already uses.
  const TABS = [
    { href: "/music", label: "Today", tabs: ["today"] },
    { href: "/music?tab=drills", label: "Drills", tabs: ["drills", "paths"] },
  ];
  const VIEWS = [
    { href: "/music?tab=drills", label: "All drills", tabs: ["drills"] },
    { href: "/music?tab=paths", label: "Paths", tabs: ["paths"] },
  ];
  const TITLE: Record<string, string> = { today: "Today", drills: "Drills", paths: "Paths" };
  const TAGLINE: Record<string, string> = {
    today: "Short sessions, honest scores, and what to play next.",
    drills: "Every drill, grouped by what it trains.",
    paths: "Step by step, from first notes to a real repertoire.",
  };
  const tab = $derived(page.url.searchParams.get("tab") ?? "today");
  const title = $derived(TITLE[tab] ?? "Today");
</script>

<svelte:head><title>{title} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <!-- One title per view, named for it. From lg the sidebar lists Today and Drills, so that control is for smaller screens; Drills keeps its own switch to Paths at every size. -->
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p class="mt-1 text-ws-soft max-sm:hidden">{TAGLINE[tab] ?? TAGLINE.today}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {@render switcher("Practice views", TABS, "lg:hidden")}
      {#if tab === "drills" || tab === "paths"}{@render switcher("Drill views", VIEWS, "")}{/if}
    </div>
  </header>
  {#if tab === "drills"}<DrillsView />{:else if tab === "paths"}<PathsView />{:else}<TodayView />{/if}
</div>

<!-- The same pill control as HubTabs, with fixed addresses: Paths is a tab value that sits under Drills. -->
{#snippet switcher(label: string, items: typeof TABS, cls: string)}
  <nav aria-label={label} class="flex gap-1 rounded-full border border-ws-line bg-ws-surface p-1 {cls}">
    {#each items as t (t.href)}
      {@const on = t.tabs.includes(tab)}
      <a
        href={t.href}
        aria-current={on ? "page" : undefined}
        data-sveltekit-noscroll
        class="flex min-h-11 items-center rounded-full px-4 text-sm font-medium {on ? 'bg-ws-ink text-ws-bg' : 'text-ws-soft hover:text-ws-ink'}">{t.label}</a
      >
    {/each}
  </nav>
{/snippet}
