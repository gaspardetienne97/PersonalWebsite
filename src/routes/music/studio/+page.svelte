<script lang="ts">
  // Studio: the songs you play and the tools that make new ones, in one hub. Songs come first;
  // the making tools (their own pages under /music/create and /music/record) sit one tap away.
  import { page } from "$app/state";
  import { m } from "@repo/i18n/messages.js";
  import Grid from "@lucide/svelte/icons/grid-3x3";
  import Piano from "@lucide/svelte/icons/piano";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import Drum from "@lucide/svelte/icons/drum";
  import Ear from "@lucide/svelte/icons/ear";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import { bench } from "#lib/music/bench.svelte.ts";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import SongsView from "#lib/music/hubs/library/SongsView.svelte";
  import ImportView from "#lib/music/hubs/library/ImportView.svelte";

  const TABS = [
    { id: "songs", label: m.music_runtime_studio_tab_songs() },
    { id: "import", label: m.music_runtime_studio_tab_import() },
  ] as const;
  const TOOLS = [
    { href: "/music/create", label: m.music_runtime_studio_tool_beat(), hint: m.music_runtime_studio_tool_beat_hint(), icon: Grid },
    { href: "/music/create?mode=roll", label: m.music_runtime_studio_tool_melody(), hint: m.music_runtime_studio_tool_melody_hint(), icon: Piano },
    { href: "/music/record", label: m.music_runtime_studio_tool_record(), hint: m.music_runtime_studio_tool_record_hint(), icon: CircleDot },
    { href: "/music/by-ear", label: m.music_runtime_studio_tool_by_ear(), hint: m.music_runtime_studio_tool_by_ear_hint(), icon: Ear },
    { href: "/music/create/kits", label: m.music_runtime_studio_tool_kits(), hint: m.music_runtime_studio_tool_kits_hint(), icon: Drum },
    { href: "/music/create/reference", label: m.music_runtime_studio_tool_reference(), hint: m.music_runtime_studio_tool_reference_hint(), icon: BookOpen },
  ];
  const tab = $derived(page.url.searchParams.get("tab") ?? "songs");
  const label = $derived(TABS.find((t) => t.id === tab)?.label ?? m.music_runtime_studio_tab_songs());
  let status = $state("");
  $effect(() => {
    status = m.music_runtime_studio_showing({ view: label });
  });

  // The hub keeps one accent of its own, as Create and Progress do.
  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });
</script>

<svelte:head><title>{m.music_runtime_studio_head_title({ view: label })}</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{m.music_runtime_studio_title()}</h1>
      <p class="mt-1 text-ws-soft max-sm:hidden">{m.music_runtime_studio_intro()}</p>
    </div>
    <HubTabs param="tab" tabs={TABS} label={m.music_runtime_studio_tabs_label()} />
  </header>
  <p role="status" class="sr-only">{status}</p>
  {#if tab === "import"}
    <ImportView onstatus={(s) => (status = s)} />
  {:else}
    <!-- Songs are the page's job, so the tools take one row: a line of links that scrolls sideways on a phone. -->
    <nav aria-labelledby="make-title" class="-my-1 flex items-center gap-2">
      <h2 id="make-title" class="shrink-0 text-sm font-semibold text-ws-soft">{m.music_runtime_studio_make()}</h2>
      <ul class="make-row -mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 pr-4 sm:mr-0 sm:pr-0">
        {#each TOOLS as tool (tool.href)}
          <li class="shrink-0">
            <a
              href={tool.href}
              title={tool.hint}
              class="flex min-h-11 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-3.5 text-sm font-semibold whitespace-nowrap hover:bg-instr-wash"
            >
              <tool.icon class="size-4 shrink-0 text-instr-ink" aria-hidden="true" />{tool.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
    <SongsView onstatus={(s) => (status = s)} />
  {/if}
</div>

<style>
  /* The last chip peeks past the edge on a phone, which is the cue that the row scrolls. */
  .make-row {
    scrollbar-width: none;
  }
</style>
