<script lang="ts">
  import { page } from "$app/state";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import ProgressStrip from "$lib/music/hubs/progress/ProgressStrip.svelte";
  import NextView from "$lib/music/hubs/progress/NextView.svelte";
  import SkillsView from "$lib/music/hubs/progress/SkillsView.svelte";
  import SessionsView from "$lib/music/hubs/progress/SessionsView.svelte";

  const TABS = [
    { id: "next", label: "What next" },
    { id: "skills", label: "Skills" },
    { id: "sessions", label: "Sessions" },
  ] as const;
  const view = $derived(page.url.searchParams.get("view") ?? "next");
  const title = $derived(TABS.find((t) => t.id === view)?.label ?? "What next");
</script>

<svelte:head><title>Progress: {title} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Progress</h1>
      <p class="mt-1 text-ws-soft">
        What to play next, how each skill stands, and what you actually did. <a
          class="font-semibold text-instr-ink underline underline-offset-4"
          href="/music/journal">Open the journal</a
        >
      </p>
    </div>
    <HubTabs param="view" tabs={TABS} label="Progress views" />
  </header>
  <p role="status" class="sr-only">Showing {title}.</p>
  <ProgressStrip />
  {#if view === "skills"}<SkillsView />{:else if view === "sessions"}<SessionsView />{:else}<NextView />{/if}
</div>
