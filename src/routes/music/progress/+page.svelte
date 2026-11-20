<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { bench } from "#lib/music/bench.svelte.ts";
  import { page } from "$app/state";
  import Play from "@lucide/svelte/icons/play";
  import ListMusic from "@lucide/svelte/icons/list-music";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import { btnPrimary } from "#lib/music/components/ui.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import { todayPlan } from "#lib/music/today.svelte.ts";
  import NextView from "#lib/music/hubs/progress/NextView.svelte";
  import SkillsView from "#lib/music/hubs/progress/SkillsView.svelte";
  import SessionsView from "#lib/music/hubs/progress/SessionsView.svelte";
  import JournalView from "#lib/music/hubs/journal/JournalView.svelte";
  import DrillPreview from "#lib/music/hubs/DrillPreview.svelte";

  // The page keeps one accent of its own, whatever the strip's instrument is.
  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });

  const TABS = [
    { id: "next", label: m.music_hubs_progress_tab_next() },
    { id: "skills", label: m.music_hubs_progress_tab_skills() },
    { id: "sessions", label: m.music_hubs_progress_tab_sessions() },
    { id: "journal", label: m.music_hubs_progress_tab_journal() },
  ] as const;
  const view = $derived(page.url.searchParams.get("view") ?? "next");
  const title = $derived(TABS.find((t) => t.id === view)?.label ?? m.music_hubs_progress_tab_next());

  // Nothing practised yet: one card and one button in place of empty charts. Wait for the
  // saved sessions first, so a full history never flashes the empty card.
  let loaded = $state(false);
  $effect(() => void practice.ready.then(() => (loaded = true)));
  const empty = $derived(loaded && practice.sessions.length === 0);
  // The journal's own announcements (a note saved, a filter cleared). Cleared first so the same message twice is still read out.
  let said = $state("");
  const announce = (msg: string) => {
    said = "";
    queueMicrotask(() => (said = msg));
  };
  const first = $derived(todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes).routine.steps[0]);
</script>

<svelte:head><title>{m.music_hubs_progress_head({ title })}</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <!-- On a phone, Your tunes shares the title's line, so the tabs are the only row under it. -->
    <div class="flex min-w-0 items-center justify-between gap-3 max-sm:w-full">
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{m.music_hubs_progress_title()}</h1>
      <a class="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-instr-ink hover:underline sm:hidden" href="/music/tunes"
        ><ListMusic class="size-4" aria-hidden="true" />{m.music_hubs_progress_tunes()}</a
      >
    </div>
    <!-- The journal is a view of this page; Your tunes is a plain link beside the tabs. -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <HubTabs param="view" tabs={TABS} label={m.music_hubs_progress_views()} class="max-sm:[&>a]:px-3" />
      <a class="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-instr-ink hover:underline max-sm:hidden" href="/music/tunes"
        ><ListMusic class="size-4" aria-hidden="true" />{m.music_hubs_progress_tunes()}</a
      >
    </div>
  </header>
  <p role="status" class="sr-only">{said || m.music_hubs_progress_showing({ title })}</p>
  {#if view === "journal"}
    <JournalView {announce} />
  {:else if empty && view !== "skills"}
    <section aria-labelledby="empty-title" class="grid items-center gap-5 rounded-3xl border border-ws-line bg-ws-surface p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="flex flex-col items-start gap-3">
      <h2 id="empty-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{m.music_hubs_progress_empty_title()}</h2>
      <p class="max-w-prose text-ws-soft">
        {m.music_hubs_progress_empty_body()}
      </p>
      {#if first}
        <a class="{btnPrimary} min-h-12 px-6 text-base" href={first.href}><Play class="size-4" aria-hidden="true" />{m.music_hubs_today_start_with({ label: first.label })}</a>
      {/if}
      </div>
      {#if first}<DrillPreview href={first.href} size="md" />{/if}
    </section>
  {:else if view === "skills"}
    <SkillsView />
  {:else if view === "sessions"}
    <SessionsView />
  {:else}
    <NextView strip={!empty} />
  {/if}
</div>
