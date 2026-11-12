<script lang="ts">
  // Studio: the songs you play and the tools that make new ones, in one hub. Songs come first;
  // the making tools (their own pages under /music/create and /music/record) sit one tap away.
  import { page } from "$app/state";
  import Grid from "lucide-svelte/icons/grid-3x3";
  import Piano from "lucide-svelte/icons/piano";
  import CircleDot from "lucide-svelte/icons/circle-dot";
  import Drum from "lucide-svelte/icons/drum";
  import BookOpen from "lucide-svelte/icons/book-open";
  import { bench } from "$lib/music/bench.svelte";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import SongsView from "$lib/music/hubs/library/SongsView.svelte";
  import ImportView from "$lib/music/hubs/library/ImportView.svelte";

  const TABS = [
    { id: "songs", label: "Songs" },
    { id: "import", label: "Import" },
  ] as const;
  const TOOLS = [
    { href: "/music/create", label: "Beat", hint: "Loop drums on a grid", icon: Grid },
    { href: "/music/create?mode=roll", label: "Melody", hint: "Write lines in the piano roll", icon: Piano },
    { href: "/music/record", label: "Record", hint: "Audio and MIDI takes", icon: CircleDot },
    { href: "/music/create/kits", label: "Sample kits", hint: "Your own pad sounds", icon: Drum },
    { href: "/music/create/reference", label: "Chords and scales", hint: "Look one up, hear it", icon: BookOpen },
  ];
  const tab = $derived(page.url.searchParams.get("tab") ?? "songs");
  const label = $derived(TABS.find((t) => t.id === tab)?.label ?? "Songs");
  let status = $state("");
  $effect(() => {
    status = `Showing ${label}.`;
  });

  // The hub keeps one accent of its own, as Create and Progress do.
  $effect(() => {
    bench.hue = "create";
    return () => {
      if (bench.hue === "create") bench.hue = null;
    };
  });
</script>

<svelte:head><title>Studio: {label} | Woodshed</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
  <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Studio</h1>
      <p class="mt-1 text-ws-soft max-sm:hidden">Songs to play, and tools to make your own.</p>
    </div>
    <HubTabs param="tab" tabs={TABS} label="Studio views" />
  </header>
  <p role="status" class="sr-only">{status}</p>
  {#if tab === "import"}
    <ImportView onstatus={(s) => (status = s)} />
  {:else}
    <!-- One strip of links, not cards: names only on a phone, a line of help from sm up. -->
    <nav aria-labelledby="make-title" class="flex flex-col gap-2">
      <h2 id="make-title" class="font-display text-xl font-semibold">Make</h2>
      <ul class="flex flex-wrap gap-2 sm:grid sm:grid-cols-3 sm:gap-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-ws-line sm:bg-ws-surface lg:grid-cols-5">
        {#each TOOLS as tool (tool.href)}
          <li class="sm:-mr-px sm:-mb-px sm:border-r sm:border-b sm:border-ws-line">
            <a
              href={tool.href}
              class="flex min-h-11 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-4 text-sm font-semibold hover:bg-instr-wash sm:h-full sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-4"
            >
              <tool.icon class="size-4 shrink-0 text-instr-ink sm:mt-0.5 sm:size-5" aria-hidden="true" />
              <span class="flex min-w-0 flex-col">
                <span class="sm:font-display sm:text-base">{tool.label}</span>
                <span class="text-[13px] font-normal text-ws-soft max-sm:hidden">{tool.hint}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
    <SongsView onstatus={(s) => (status = s)} />
  {/if}
</div>
