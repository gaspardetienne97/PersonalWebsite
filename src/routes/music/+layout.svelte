<script lang="ts">
  import "./woodshed.css";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { afterNavigate, replaceState } from "$app/navigation";
  import { DRILL_ROUTES, noteNavigation } from "$lib/music/came-from.svelte";
  import House from "lucide-svelte/icons/house";
  import Disc from "lucide-svelte/icons/disc-3";
  import Drills from "lucide-svelte/icons/layout-grid";
  import Chart from "lucide-svelte/icons/chart-column";
  import CircleDot from "lucide-svelte/icons/circle-dot";
  import Cog from "lucide-svelte/icons/settings";
  import Help from "lucide-svelte/icons/circle-question-mark";
  import Collapse from "lucide-svelte/icons/panel-left-close";
  import Expand from "lucide-svelte/icons/panel-left-open";
  import Ellipsis from "lucide-svelte/icons/ellipsis";
  import Globe from "lucide-svelte/icons/globe";
  import Sun from "lucide-svelte/icons/sun";
  import Moon from "lucide-svelte/icons/moon";
  import { toggleMode } from "mode-watcher";
  import BenchStrip from "$lib/music/components/BenchStrip.svelte";
  import CommandPalette from "$lib/music/components/CommandPalette.svelte";
  import { bench } from "$lib/music/bench.svelte";
  import { audio, input, midi, settings } from "$lib/music/runtime";
  import { INSTRUMENTS, type Instrument } from "@repo/music-core";

  let { children } = $props();

  type NavItem = { href: string; label: string; icon: typeof House; owns?: string[]; tab?: string };
  const hubs: NavItem[] = [
    // Three hubs. Today owns every drill; Studio owns the songs and the making tools; Progress holds the journal.
    { href: "/music", label: "Today", icon: House, owns: DRILL_ROUTES },
    { href: "/music/studio", label: "Studio", icon: Disc, owns: ["/music/songs", "/music/create", "/music/library"] },
    { href: "/music/progress", label: "Progress", icon: Chart, owns: ["/music/journal", "/music/tunes"] },
  ];
  // Tuner and Connect are icons in the top strip (BenchStrip), on every page.
  const utilities = [
    { href: "/music/record", label: "Record", icon: CircleDot },
    { href: "/music/settings", label: "Settings", icon: Cog },
    { href: "/music/guide", label: "Guide", icon: Help },
  ];

  // The sidebar lists Today's two tabs apart, each current on its own view (Paths is a view of Drills).
  const sideHubs: NavItem[] = [
    { href: "/music", label: "Today", icon: House, tab: "today" },
    { href: "/music?tab=drills", label: "Drills", icon: Drills, tab: "drills", owns: DRILL_ROUTES },
    ...hubs.slice(1),
  ];

  const path = $derived(page.url.pathname.replace(/\/$/, "") || "/music");
  const hubTab = $derived((page.url.searchParams.get("tab") ?? "today").replace("paths", "drills"));
  const current = (item: NavItem) =>
    item.tab && path === "/music"
      ? hubTab === item.tab
      : (!item.tab && path === item.href) ||
        (item.href !== "/music" && !item.tab && path.startsWith(item.href + "/")) ||
        (item.owns ?? []).some((p) => path === p || path.startsWith(p + "/"));

  // Remember where each page was opened from (drills show "Back to ...").
  afterNavigate((nav) => noteNavigation(nav.from?.url, nav.to?.url));

  let collapsed = $state(false);
  let moreOpen = $state(false);
  let moreButton = $state<HTMLButtonElement>();
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
    // Any first gesture starts sound, a key press as well as a tap, so Settings' "Sound on" holds.
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
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

  // Routine and path links carry ?instrument= so the strip lands on the right
  // one. Applied once, then dropped from the URL so a later strip change is
  // not undone by a tab link or a reload.
  $effect(() => {
    const want = page.url.searchParams.get("instrument");
    if (want && (INSTRUMENTS as readonly string[]).includes(want) && !bench.locked)
      void settings.ready.then(() => {
        if (settings.value.activeInstrument !== want) void settings.update({ activeInstrument: want as Instrument });
        const url = new URL(page.url);
        url.searchParams.delete("instrument");
        try {
          replaceState(url, page.state);
        } catch {
          /* before the router starts: the next navigation drops it */
        }
      });
  });

  // Pages that run no clock: the strip leaves out Metronome, Tempo and Count-in there.
  const UNTIMED = ["/music/ear", "/music/circle", "/music/listening", "/music/voicings", "/music/lab", "/music/create"];
  // Hubs and tools where nothing is played to a click: the strip is just
  // the instrument, sound and input, and search.
  const COMPACT = [
    "/music",
    "/music/progress",
    "/music/journal",
    "/music/studio",
    "/music/settings",
    "/music/guide",
    "/music/connect",
    "/music/tuner",
  ];
  $effect(() => {
    bench.timed = !UNTIMED.some((r) => path === r || path.startsWith(r + "/"));
    bench.compact = COMPACT.includes(path);
  });

  /** A run (or a drill session: lesson, run, results) owns the screen: no sidebar and no tab bar.
   *  A session leaves out the strip too; its HUD carries the beat and the click. */
  const away = $derived(bench.running || bench.session);

  // One state: whether runs click. The session HUD and the strip both flip the saved setting, and the
  // metronome reads bench.clickDuringRun on every beat (here, since a session leaves the strip out).
  $effect(() => {
    bench.clickDuringRun = settings.value.metronomeEnabled;
  });

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


<div
  class="woodshed flex min-h-dvh w-full"
  style:--instr={`var(--hue-${hue})`}
  style:--ws-strip-h={bench.stripH ? `${bench.stripH}px` : undefined}
  data-hue={settings.value.instrumentColorCoding ? "on" : "off"}
  data-running={away ? "" : undefined}
  data-session={bench.session ? "" : undefined}
>
  {#if !away}
    <nav
      aria-label="Woodshed"
      class="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-ws-line bg-ws-surface lg:flex {collapsed ? 'w-16' : 'w-56'}"
    >
      <a href="/music" class="flex min-h-14 items-center gap-2 px-4 font-display text-lg font-semibold tracking-tight">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-instr text-ws-stage" aria-hidden="true">W</span>
        {#if !collapsed}<span>Woodshed</span>{/if}
      </a>
      <ul class="flex flex-col gap-1 px-2 pt-2">
        {#each sideHubs as item (item.href)}
          {@render navItem(item, current(item))}
        {/each}
      </ul>
      <ul class="mt-auto flex flex-col gap-1 border-t border-ws-line px-2 py-2">
        {#each utilities as item (item.href)}
          {@render navItem(item, current(item))}
        {/each}
        <!-- App controls, apart from the places: a divider with its name. -->
        <li class="mt-1 border-t border-ws-line px-3 pt-2 pb-1 text-[13px] font-medium text-ws-soft {collapsed ? 'lg:sr-only' : ''}" role="presentation">App</li>
        {@render siteItems()}
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
    {#if !bench.session}<BenchStrip />{/if}
    <main class="min-w-0 flex-1 {bench.session ? '' : 'px-4 pb-[calc(var(--ws-dock-h)+3rem)] pt-4 sm:px-6 lg:px-8 lg:pb-10'}">
      {@render children()}
    </main>
  </div>

  {#if !away}
    <nav
      aria-label="Woodshed sections"
      onkeydown={(e) => {
        if (e.key !== "Escape" || !moreOpen) return;
        moreOpen = false;
        moreButton?.focus();
      }}
      class="ws-bar ws-bar-bottom fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul class="grid grid-cols-4">
        {#each hubs as item (item.href)}
          {@const on = current(item)}
          <li>
            <a
              href={item.href}
              aria-current={on ? "page" : undefined}
              class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px] {on ? 'text-instr-ink font-semibold' : 'text-ws-soft'}"
            >
              {@render tabIcon(item.icon, on)}{item.label}
            </a>
          </li>
        {/each}
        <li>
          <button
            type="button"
            class="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[13px] {utilities.some(current) ? 'text-instr-ink font-semibold' : 'text-ws-soft'}"
            aria-expanded={moreOpen}
            aria-controls="woodshed-more"
            bind:this={moreButton}
            onclick={() => (moreOpen = !moreOpen)}
          >
            {@render tabIcon(Ellipsis, utilities.some(current))}More
          </button>
        </li>
      </ul>
      {#if moreOpen}
        <ul id="woodshed-more" class="grid grid-cols-2 gap-1 border-t border-ws-line p-2 sm:grid-cols-4">
          {#each utilities as item (item.href)}
            {@render navItem(item, current(item))}
          {/each}
          {@render siteItems()}
        </ul>
      {/if}
    </nav>
  {/if}
  <CommandPalette />
</div>

<!-- The site header is left out in the app, so its theme toggle and a way home live here. -->
{#snippet siteItems()}
  <li>
    <button
      type="button"
      onclick={toggleMode}
      aria-label="Toggle theme"
      title={collapsed ? "Toggle theme" : undefined}
      class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
    >
      <Sun class="size-5 shrink-0 dark:hidden" aria-hidden="true" /><Moon class="hidden size-5 shrink-0 dark:block" aria-hidden="true" />
      <!-- A quick toggle that says the theme now on. -->
      <span class={collapsed ? "lg:sr-only" : ""}>Theme: <span class="font-medium text-ws-ink dark:hidden">Light</span><span class="hidden font-medium text-ws-ink dark:inline">Dark</span></span>
    </button>
  </li>
  <li>
    <a
      href="/"
      title={collapsed ? "Site home" : undefined}
      class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
    >
      <Globe class="size-5 shrink-0" aria-hidden="true" />
      <span class={collapsed ? "lg:sr-only" : ""}>Site home</span>
    </a>
  </li>
{/snippet}

<!-- The current tab: its icon sits in a filled pill, so the place reads without colour alone. -->
{#snippet tabIcon(Icon: typeof House, on: boolean)}
  <span class="grid h-7 w-12 place-items-center rounded-full {on ? 'bg-instr-wash' : ''}"><Icon class="size-5" aria-hidden="true" /></span>
{/snippet}

{#snippet navItem(item: NavItem, on: boolean)}
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
