<script lang="ts">
  import { page } from "$app/state";
  import TodayView from "#lib/music/hubs/TodayView.svelte";
  import DrillsView from "#lib/music/hubs/DrillsView.svelte";
  import PathsView from "#lib/music/hubs/PathsView.svelte";
  import { m } from "@repo/i18n/messages.js";

  // Two tabs. Paths is a view inside Drills; its address (?tab=paths) is the one every path link already uses.
  const TABS = [
    { href: "/music", label: m.music_shell_nav_today(), tabs: ["today"] },
    { href: "/music?tab=drills", label: m.music_shell_nav_drills(), tabs: ["drills", "paths"] },
  ];
  const VIEWS = [
    { href: "/music?tab=drills", label: m.music_shell_home_all_drills(), tabs: ["drills"] },
    { href: "/music?tab=paths", label: m.music_shell_home_paths(), tabs: ["paths"] },
  ];
  const TITLE: Record<string, string> = { today: m.music_shell_nav_today(), drills: m.music_shell_nav_drills(), paths: m.music_shell_home_paths() };
  const TAGLINE: Record<string, string> = {
    drills: m.music_shell_home_drills_tagline(),
    paths: m.music_shell_home_paths_tagline(),
  };
  const tab = $derived(page.url.searchParams.get("tab") ?? "today");
  const title = $derived(TITLE[tab] ?? m.music_shell_nav_today());
</script>

<svelte:head><title>{title} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <!-- One title per view, named for it. From lg the sidebar lists Today and Drills, so that control is for smaller screens; Drills keeps its own switch to Paths at every size. -->
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <!-- Today needs no tagline: the set's own heading sits right under the title. -->
      {#if TAGLINE[tab]}<p class="mt-1 text-ws-soft max-sm:hidden">{TAGLINE[tab]}</p>{/if}
    </div>
    <div class="flex flex-wrap gap-2">
      {@render switcher(m.music_shell_home_practice_views(), TABS, "lg:hidden")}
      {#if tab === "drills" || tab === "paths"}{@render switcher(m.music_shell_home_drill_views(), VIEWS, "")}{/if}
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
        data-sveltekit-reset="false"
        class="flex min-h-11 items-center rounded-full px-4 text-sm font-medium {on ? 'bg-ws-ink text-ws-bg' : 'text-ws-soft hover:text-ws-ink'}">{t.label}</a
      >
    {/each}
  </nav>
{/snippet}
