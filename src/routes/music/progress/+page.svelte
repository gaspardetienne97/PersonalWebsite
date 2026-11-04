<script lang="ts">
  import { bench } from "$lib/music/bench.svelte";
  import { page } from "$app/state";
  import Play from "lucide-svelte/icons/play";
  import NotebookPen from "lucide-svelte/icons/notebook-pen";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Ellipsis from "lucide-svelte/icons/ellipsis";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import { btnPrimary } from "$lib/music/components/ui";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { todayPlan } from "$lib/music/today.svelte";
  import NextView from "$lib/music/hubs/progress/NextView.svelte";
  import SkillsView from "$lib/music/hubs/progress/SkillsView.svelte";
  import SessionsView from "$lib/music/hubs/progress/SessionsView.svelte";
  import DrillPreview from "$lib/music/hubs/DrillPreview.svelte";

  // The page keeps one accent of its own, whatever the strip's instrument is.
  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });

  const TABS = [
    { id: "next", label: "What next" },
    { id: "skills", label: "Skills" },
    { id: "sessions", label: "Sessions" },
  ] as const;
  const view = $derived(page.url.searchParams.get("view") ?? "next");
  const title = $derived(TABS.find((t) => t.id === view)?.label ?? "What next");

  // Nothing practised yet: one card and one button in place of empty charts. Wait for the
  // saved sessions first, so a full history never flashes the empty card.
  let loaded = $state(false);
  $effect(() => void practice.ready.then(() => (loaded = true)));
  const empty = $derived(loaded && practice.sessions.length === 0);
  // Journal and Your tunes wait in one overflow menu beside the tabs, so the header has one navigation.
  let more = $state(false);
  const first = $derived(todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes).routine.steps[0]);
</script>

<svelte:head><title>Progress: {title} | Woodshed</title></svelte:head>
<svelte:window onkeydown={(e) => e.key === "Escape" && (more = false)} />

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Progress</h1>
    </div>
    <div class="flex items-center gap-2">
      <HubTabs param="view" tabs={TABS} label="Progress views" />
      <div class="relative">
        <button
          type="button"
          class="grid size-11 place-items-center rounded-full border border-ws-line bg-ws-surface text-ws-soft hover:text-ws-ink"
          aria-label="More: journal and your tunes"
          aria-expanded={more}
          aria-controls="progress-more"
          onclick={() => (more = !more)}><Ellipsis class="size-5" aria-hidden="true" /></button
        >
        {#if more}
          <nav id="progress-more" aria-label="Related pages" class="absolute right-0 top-full z-30 mt-2 flex w-48 flex-col rounded-2xl border border-ws-line bg-ws-surface p-1.5 shadow-lg">
            <a class="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-ws-raised" href="/music/journal"
              ><NotebookPen class="size-4" aria-hidden="true" />Journal</a
            >
            <a class="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-ws-raised" href="/music/tunes"
              ><ListMusic class="size-4" aria-hidden="true" />Your tunes</a
            >
          </nav>
        {/if}
      </div>
    </div>
  </header>
  <p role="status" class="sr-only">Showing {title}.</p>
  {#if empty && view !== "skills"}
    <section aria-labelledby="empty-title" class="grid items-center gap-5 rounded-3xl border border-ws-line bg-ws-surface p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="flex flex-col items-start gap-3">
      <h2 id="empty-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Nothing practised yet</h2>
      <p class="max-w-prose text-ws-soft">
        Play one short block and this page fills in: your streak, the minutes you played, and which skill to work on next.
      </p>
      {#if first}
        <a class="{btnPrimary} min-h-12 px-6 text-base" href={first.href}><Play class="size-4" aria-hidden="true" />Start with {first.label}</a>
      {/if}
      </div>
      {#if first}<DrillPreview href={first.href} size="md" />{/if}
    </section>
    <p class="-mt-2 text-sm text-ws-soft">After your first block you will see your streak, your minutes and the next skill to work on here.</p>
  {:else if view === "skills"}
    <SkillsView />
  {:else if view === "sessions"}
    <SessionsView />
  {:else}
    <NextView strip={!empty} />
  {/if}
</div>
