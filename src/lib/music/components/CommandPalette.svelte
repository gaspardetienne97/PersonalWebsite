<script lang="ts">
  // ⌘K / Ctrl-K: one flat index over hubs, drills and paths. Arrows move, Enter goes.
  // Empty, it opens on today's next block and the drills played last.
  import * as Dialog from "@repo/ui/dialog";
  import { goto } from "$app/navigation";
  import { palette } from "./palette.svelte";
  import { drillsFor, kindOf, recentDrills, searchIndex, searchItems, splitMatch, type SearchItem } from "../search";
  import FileText from "@lucide/svelte/icons/file-text";
  import House from "@lucide/svelte/icons/house";
  import Disc from "@lucide/svelte/icons/disc-3";
  import Grid from "@lucide/svelte/icons/grid-3x3";
  import Chart from "@lucide/svelte/icons/chart-column";
  import NotebookPen from "@lucide/svelte/icons/notebook-pen";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import Cable from "@lucide/svelte/icons/cable";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Cog from "@lucide/svelte/icons/settings";
  import Help from "@lucide/svelte/icons/circle-question-mark";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import { lastRun } from "../hubs/drills-layout";
  import { pct } from "../hubs/progress/model";
  import Route from "@lucide/svelte/icons/route";
  import Music from "@lucide/svelte/icons/music";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import SearchX from "@lucide/svelte/icons/search-x";
  import { hueForRoute } from "../hues";
  import { DRILL_ICON, HUE_ICON } from "../hubs/hue-icons";
  import { CATALOG } from "@repo/music-core/content/catalog";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";

  let query = $state("");
  let active = $state(0);
  // The empty palette lists four pages and a "More pages" row; the row opens the rest.
  let allPages = $state(false);
  // Scope chips: every kind, or only drills, paths, songs or pages.
  const SCOPES = [
    { id: "all", label: "All" },
    { id: "drill", label: "Drills" },
    { id: "path", label: "Paths" },
    { id: "song", label: "Songs" },
    { id: "page", label: "Pages" },
  ] as const;
  let scope = $state<(typeof SCOPES)[number]["id"]>("all");
  // Today's plan loads with the palette's first opening, not with every page.
  let plan = $state<typeof import("../today.svelte")>();
  $effect(() => {
    if (palette.isOpen && !plan) void import("../today.svelte").then((m) => (plan = m));
  });
  const lead = $derived.by((): SearchItem[] => {
    if (!palette.isOpen || query.trim()) return [];
    const played = recentDrills(practice.sessions.flatMap((s) => s.runs));
    const recent = played.length
      ? played.map((i) => ({ ...i, group: "Recent" }))
      : drillsFor(settings.value.activeInstrument).map((i) => ({ ...i, group: "Drills to try" }));
    if (!plan) return recent;
    const today = plan.todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes);
    const next = today.routine.steps.find((st) => !today.done.includes(st.n));
    return [...(next ? [{ label: next.label, href: next.href, hint: "Next in Today's set", group: "Up next" }] : []), ...recent];
  });
  // A scope with no words lists every item of its kind; with words, the matches of that kind.
  const items = $derived(
    scope === "all"
      ? searchItems(query, searchIndex(), lead, allPages)
      : (query.trim() ? searchItems(query, searchIndex()) : searchIndex()).filter((i) => kindOf(i) === scope),
  );
  const runs = $derived(practice.sessions.flatMap((s) => s.runs));
  /** A drill row's last score, so a search helps pick between matches. */
  function lastScore(item: SearchItem) {
    if (!item.drill) return undefined;
    const entry = CATALOG.find((e) => e.route === item.href.split("?")[0]);
    const r = entry && lastRun({ entry, modes: [], key: entry.id }, runs);
    return r?.score;
  }
  /** One icon per section, the same as the sidebar's. */
  const PAGE_ICON: [string, typeof FileText][] = [
    ["/music/studio", Disc],
    ["/music/create", Grid],
    ["/music/record", CircleDot],
    ["/music/progress", Chart],
    ["/music/connect", Cable],
    ["/music/tuner", Gauge],
    ["/music/settings", Cog],
    ["/music/guide", Help],
    ["/music", House],
  ];

  /** A type icon per row: a drill's own glyph in its hue, a path, a song, a page. */
  function iconFor(item: SearchItem) {
    const route = item.href.split("?")[0];
    if (item.kind === "all") return { Icon: LayoutGrid };
    if (item.kind === "more") return { Icon: Ellipsis };
    if (item.kind === "path") return { Icon: Route };
    if (item.kind === "song" || route.startsWith("/music/songs")) return { Icon: Music };
    const entry = CATALOG.find((e) => e.route === route);
    if (item.drill || entry || item.group === "Up next")
      return { Icon: (entry && DRILL_ICON[entry.id]) || HUE_ICON[hueForRoute(route, settings.value.activeInstrument)] };
    if (item.href.includes("tab=drills")) return { Icon: LayoutGrid };
    if (item.href.includes("tab=paths")) return { Icon: Route };
    if (item.href.includes("view=journal")) return { Icon: NotebookPen };
    return { Icon: PAGE_ICON.find(([p]) => route.startsWith(p))?.[1] ?? FileText };
  }

  $effect(() => {
    void query;
    void scope;
    active = 0;
  });

  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (palette.isOpen) palette.close();
      else palette.open();
    }
  }

  function go(item: SearchItem) {
    if (item.kind === "more") {
      allPages = true;
      return;
    }
    palette.close();
    query = "";
    scope = "all";
    allPages = false;
    void goto(item.href);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(items.length - 1, active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<Dialog.Root bind:open={() => palette.isOpen, (v) => (v ? palette.open() : palette.close())}>
  <!-- A floating panel on a laptop; a full-height sheet on a phone, so no result sits cut off at its edge. -->
  <Dialog.Content
    class="top-[20%] max-w-xl translate-y-0 gap-2 p-3 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:grid-rows-[auto_auto_minmax(0,1fr)] max-sm:border-0"
  >
    <Dialog.Title class="sr-only">Search Woodshed</Dialog.Title>
    <input
      bind:value={query}
      onkeydown={onKey}
      placeholder="Drill, path, song or page"
      aria-label="Search"
      aria-controls="palette-results"
      aria-activedescendant={items[active] ? `palette-${active}` : undefined}
      class="h-12 w-full rounded-md border border-input bg-background pl-3 pr-10 text-base"
    />
    <!-- Scope: one row of chips, scrolling sideways on a narrow screen. -->
    <div role="group" aria-label="Search in" class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {#each SCOPES as sc (sc.id)}
        <button
          type="button"
          aria-pressed={scope === sc.id}
          class="min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium {scope === sc.id
            ? 'border-transparent bg-foreground text-background'
            : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'}"
          onclick={() => (scope = sc.id)}>{sc.label}</button
        >
      {/each}
    </div>
    <ul id="palette-results" role="listbox" aria-label="Results" class="results max-h-[50vh] overflow-y-auto pb-6 max-sm:max-h-none">
      {#each items as item, i (item.href + item.label)}
        {@const ic = iconFor(item)}
        {@const [pre, hit, post] = splitMatch(item.label, query)}
        {#if item.group && item.group !== items[i - 1]?.group}
          <li role="presentation" class="px-3 pb-1 pt-3 text-[13px] font-semibold text-muted-foreground first:pt-1">{item.group}</li>
        {/if}
        <li
          id="palette-{i}"
          role="option"
          aria-selected={i === active}
          class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-sm {i === active ? 'bg-accent' : ''}"
          onpointerenter={() => (active = i)}
          onclick={() => go(item)}
          onkeydown={() => {}}
        >
          <!-- The dialog sits outside the Woodshed frame, so the row icons use the site's own tokens. -->
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true"><ic.Icon class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium {item.kind === 'all' ? 'text-instr-ink' : ''}">{pre}{#if hit}<strong class="font-bold underline decoration-2 underline-offset-2">{hit}</strong>{/if}{post}</span>
            {#if item.match}<span class="block text-[13px] text-muted-foreground">Matches "{item.match}"</span>{/if}
            <!-- What and where: on a phone the hint joins this line instead of a column beside the title. -->
            {#if item.detail || item.hint}
              <span class="block text-[13px] text-muted-foreground {item.detail ? '' : 'sm:hidden'}"
                >{#if item.hint}<span class="sm:hidden">{item.hint}{item.detail ? ", " : ""}</span>{/if}{item.detail ?? ""}</span
              >
            {/if}
          </span>
          {#if lastScore(item) !== undefined}
            <span class="tnum shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[13px] font-semibold">Last {pct(lastScore(item) ?? 0)}</span>
          {:else if item.drill}
            <span class="shrink-0 whitespace-nowrap text-[13px] text-muted-foreground">Not played</span>
          {/if}
          {#if item.hint}<span class="shrink-0 whitespace-nowrap text-muted-foreground max-sm:hidden">{item.hint}</span>{/if}
        </li>
      {:else}
        <li class="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm" role="presentation">
          <SearchX class="size-6 text-muted-foreground" aria-hidden="true" />
          <span class="font-medium">No matches for "{query}"</span>
          <span class="text-muted-foreground">Try a drill name such as Intervals or Scales, or a page such as Tuner.</span>
          <button type="button" class="mt-1 inline-flex min-h-11 items-center rounded-full border border-input px-4 font-medium hover:bg-accent" onclick={() => go({ label: "All drills", href: "/music?tab=drills" })}>Browse every drill</button>
        </li>
      {/each}
    </ul>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* The list fades at its foot, so a row under the edge reads as more to scroll. */
  .results {
    mask-image: linear-gradient(to bottom, black calc(100% - 1.5rem), transparent);
  }
</style>
