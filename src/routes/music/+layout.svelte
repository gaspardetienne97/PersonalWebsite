<script lang="ts">
  import "./woodshed.css";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import House from "lucide-svelte/icons/house";
  import Library from "lucide-svelte/icons/library";
  import Grid from "lucide-svelte/icons/grid-3x3";
  import Chart from "lucide-svelte/icons/chart-column";
  import CircleDot from "lucide-svelte/icons/circle-dot";
  import Cable from "lucide-svelte/icons/cable";
  import Gauge from "lucide-svelte/icons/gauge";
  import Cog from "lucide-svelte/icons/settings";
  import Help from "lucide-svelte/icons/circle-question-mark";
  import Collapse from "lucide-svelte/icons/panel-left-close";
  import Expand from "lucide-svelte/icons/panel-left-open";
  import Ellipsis from "lucide-svelte/icons/ellipsis";
  import BenchStrip from "$lib/music/components/BenchStrip.svelte";
  import CommandPalette from "$lib/music/components/CommandPalette.svelte";
  import { bench } from "$lib/music/bench.svelte";
  import { audio, input, midi, settings } from "$lib/music/runtime";

  let { children } = $props();

  const hubs = [
    { href: "/music", label: "Today", icon: House, owns: ["/music/ear", "/music/reading", "/music/rhythm", "/music/scales", "/music/two-hand", "/music/comping", "/music/voicings", "/music/licks", "/music/chord-scales", "/music/fretboard", "/music/chords", "/music/strum", "/music/pads", "/music/aerophone", "/music/lab", "/music/jam"] },
    { href: "/music/library", label: "Library", icon: Library, owns: ["/music/songs"] },
    { href: "/music/create", label: "Create", icon: Grid, owns: [] },
    { href: "/music/progress", label: "Progress", icon: Chart, owns: ["/music/journal"] },
  ];
  const utilities = [
    { href: "/music/record", label: "Record", icon: CircleDot },
    { href: "/music/connect", label: "Connect", icon: Cable },
    { href: "/music/tuner", label: "Tuner", icon: Gauge },
    { href: "/music/settings", label: "Settings", icon: Cog },
    { href: "/music/guide", label: "Guide", icon: Help },
  ];

  const path = $derived(page.url.pathname.replace(/\/$/, "") || "/music");
  const current = (item: { href: string; owns?: string[] }) =>
    path === item.href ||
    (item.href !== "/music" && path.startsWith(item.href + "/")) ||
    (item.owns ?? []).some((p) => path === p || path.startsWith(p + "/"));

  let collapsed = $state(false);
  let moreOpen = $state(false);
  const hue = $derived(bench.hue ?? settings.value.activeInstrument);

  onMount(() => {
    try {
      collapsed = localStorage.getItem("woodshed.rail") === "collapsed";
    } catch {
      /* private mode: default expanded */
    }
    midi.init();
    const unlock = () => {
      if (!audio.unlocked) void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      audio.stopAll();
      input.router.releaseAll();
      bench.setFocus(false);
    };
  });

  function toggleRail() {
    collapsed = !collapsed;
    try {
      localStorage.setItem("woodshed.rail", collapsed ? "collapsed" : "open");
    } catch {
      /* ignore */
    }
  }

  // Route-owned playback stops on navigation.
  let lastPath = "";
  $effect(() => {
    if (lastPath && lastPath !== path) {
      audio.stopAll();
      moreOpen = false;
    }
    lastPath = path;
  });
</script>

<svelte:head><title>Woodshed</title></svelte:head>

<div
  class="woodshed flex min-h-[calc(100dvh-3rem)] w-full"
  style:--instr={`var(--hue-${hue})`}
  data-hue={settings.value.instrumentColorCoding ? "on" : "off"}
>
  {#if !bench.running}
    <nav
      aria-label="Woodshed"
      class="sticky top-12 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r border-ws-line bg-ws-surface lg:flex {collapsed ? 'w-16' : 'w-56'}"
    >
      <a href="/music" class="flex min-h-14 items-center gap-2 px-4 font-display text-lg font-semibold tracking-tight">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-instr text-ws-stage" aria-hidden="true">W</span>
        {#if !collapsed}<span>Woodshed</span>{/if}
      </a>
      <ul class="flex flex-col gap-1 px-2 pt-2">
        {#each hubs as item (item.href)}
          {@render navItem(item, current(item))}
        {/each}
      </ul>
      <ul class="mt-auto flex flex-col gap-1 border-t border-ws-line px-2 py-2">
        {#each utilities as item (item.href)}
          {@render navItem(item, current(item))}
        {/each}
        <li>
          <button
            type="button"
            onclick={toggleRail}
            class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-ws-soft hover:bg-ws-raised"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {#if collapsed}<Expand class="size-5 shrink-0" />{:else}<Collapse class="size-5 shrink-0" /><span>Collapse</span>{/if}
          </button>
        </li>
      </ul>
    </nav>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col">
    <BenchStrip />
    <main class="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10">
      {@render children()}
    </main>
  </div>

  {#if !bench.running}
    <nav
      aria-label="Woodshed sections"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-ws-line bg-ws-surface/95 backdrop-blur lg:hidden"
    >
      <ul class="grid grid-cols-5">
        {#each hubs as item (item.href)}
          {@const on = current(item)}
          <li>
            <a
              href={item.href}
              aria-current={on ? "page" : undefined}
              class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs {on ? 'text-instr-ink font-semibold' : 'text-ws-soft'}"
            >
              <item.icon class="size-5" aria-hidden="true" />{item.label}
            </a>
          </li>
        {/each}
        <li>
          <button
            type="button"
            class="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs {utilities.some(current) ? 'text-instr-ink font-semibold' : 'text-ws-soft'}"
            aria-expanded={moreOpen}
            aria-controls="woodshed-more"
            onclick={() => (moreOpen = !moreOpen)}
          >
            <Ellipsis class="size-5" aria-hidden="true" />More
          </button>
        </li>
      </ul>
      {#if moreOpen}
        <ul id="woodshed-more" class="grid grid-cols-2 gap-1 border-t border-ws-line p-2 sm:grid-cols-5">
          {#each utilities as item (item.href)}
            {@render navItem(item, current(item))}
          {/each}
        </ul>
      {/if}
    </nav>
  {/if}
  <CommandPalette />
</div>

{#snippet navItem(item: { href: string; label: string; icon: typeof House }, on: boolean)}
  <li>
    <a
      href={item.href}
      aria-current={on ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      class="relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors {on
        ? 'bg-instr-wash font-semibold text-ws-ink'
        : 'text-ws-soft hover:bg-ws-raised hover:text-ws-ink'}"
    >
      {#if on}<span class="absolute inset-y-2 left-0 w-1 rounded-full bg-instr" aria-hidden="true"></span>{/if}
      <item.icon class="size-5 shrink-0" aria-hidden="true" />
      <span class={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
    </a>
  </li>
{/snippet}
