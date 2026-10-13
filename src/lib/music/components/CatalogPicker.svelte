<script lang="ts" module>
  export interface CatalogItem<V> {
    value: V;
    title: string;
    /** One line under the title: style, tempo, chords, what it trains. */
    meta?: string;
    /** Filter chip and list heading (a level, a style, an instrument). */
    group?: string;
    /** A short tag on the right (stars, a level number). */
    badge?: string;
    /** Extra words the search matches. */
    keywords?: string;
  }
</script>

<script lang="ts" generics="T extends string | number">
  // A long catalogue (grooves, phrases, licks, lessons) picked from a sheet,
  // not a dropdown: the setup shows the current item; Change opens a list
  // with search, group filter chips and the last few picks on top.
  import * as Sheet from "@repo/ui/sheet";
  import Search from "lucide-svelte/icons/search";
  import { getSetting, putSetting } from "$lib/music/runtime";

  interface Props {
    label: string;
    items: readonly CatalogItem<T>[];
    value: T;
    onchange: (v: T) => void;
    /** Remembers the last picks under this key (per drill). */
    recentKey?: string;
    disabled?: boolean;
    /** The noun for the search box and the empty state ("groove", "phrase"). */
    noun?: string;
    /** Lets the setup sentence jump here (DrillShell summary clauses). */
    setupKey?: string;
  }
  let { label, items, value, onchange, recentKey, disabled = false, noun = "item", setupKey }: Props = $props();

  let open = $state(false);
  let query = $state("");
  let group = $state<string | null>(null);
  let recent = $state<T[]>([]);
  $effect(() => {
    if (recentKey) void getSetting<T[]>(`catalog-recent.${recentKey}`, []).then((r) => (recent = Array.isArray(r) ? r : []));
  });

  const current = $derived(items.find((i) => i.value === value));
  const groups = $derived([...new Set(items.flatMap((i) => (i.group ? [i.group] : [])))]);
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const shown = $derived(
    items.filter((i) => (!group || i.group === group) && words.every((w) => `${i.title} ${i.meta ?? ""} ${i.group ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(w))),
  );
  const recents = $derived(query || group ? [] : recent.flatMap((v) => items.filter((i) => i.value === v)).slice(0, 4));
  // One section per group, in the order groups first appear (items need not arrive sorted).
  const sections = $derived.by(() => {
    const out = new Map<string, CatalogItem<T>[]>();
    for (const i of shown) {
      const name = i.group ?? "";
      out.set(name, [...(out.get(name) ?? []), i]);
    }
    return [...out].map(([name, rows]) => ({ name, rows }));
  });

  function pick(v: T) {
    onchange(v);
    open = false;
    if (recentKey) {
      recent = [v, ...recent.filter((x) => x !== v)].slice(0, 6);
      void putSetting(`catalog-recent.${recentKey}`, $state.snapshot(recent));
    }
  }
</script>

<div class="flex min-w-0 flex-col gap-1 text-sm" data-setup={setupKey}>
  <span class="font-medium">{label}</span>
  <button
    type="button"
    class="flex min-h-11 w-full items-center gap-3 rounded-lg border border-ws-line bg-ws-surface px-3 py-2 text-left hover:bg-ws-raised disabled:opacity-50"
    {disabled}
    aria-haspopup="dialog"
    onclick={() => {
      query = "";
      group = null;
      open = true;
    }}
  >
    <span class="min-w-0 flex-1">
      <span class="block truncate font-semibold">{current?.title ?? `Choose a ${noun}`}</span>
      {#if current?.meta}<span class="block truncate text-xs text-ws-soft">{current.meta}</span>{/if}
    </span>
    <span class="shrink-0 text-sm font-medium text-instr-ink">Change</span>
  </button>
</div>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="flex w-full flex-col gap-3 bg-ws-surface p-4 text-ws-ink sm:max-w-md">
    <Sheet.Header class="p-0">
      <Sheet.Title class="font-display text-xl">{label}</Sheet.Title>
      <Sheet.Description class="text-sm text-ws-soft">{items.length} to choose from.</Sheet.Description>
    </Sheet.Header>
    <label class="flex min-h-11 items-center gap-2 rounded-lg border border-ws-line bg-ws-bg px-3">
      <Search class="size-4 text-ws-soft" aria-hidden="true" />
      <span class="sr-only">Search</span>
      <input class="min-w-0 flex-1 bg-transparent text-sm outline-none" type="search" placeholder="Search {noun}s" bind:value={query} />
    </label>
    {#if groups.length > 1}
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
        <button type="button" class="chip" aria-pressed={group === null} onclick={() => (group = null)}>All</button>
        {#each groups as g (g)}
          <button type="button" class="chip" aria-pressed={group === g} onclick={() => (group = group === g ? null : g)}>{g}</button>
        {/each}
      </div>
    {/if}
    <div class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      {#if recents.length}
        <p class="mb-1 mt-1 text-xs font-medium text-ws-soft">Recent</p>
        <ul class="mb-3 flex flex-col gap-1">
          {#each recents as i (`r-${i.value}`)}{@render row(i)}{/each}
        </ul>
      {/if}
      {#each sections as s (s.name)}
        {#if s.name}<p class="mb-1 mt-2 text-xs font-medium text-ws-soft">{s.name}</p>{/if}
        <ul class="flex flex-col gap-1">
          {#each s.rows as i (i.value)}{@render row(i)}{/each}
        </ul>
      {:else}
        <p class="py-6 text-center text-sm text-ws-soft">No {noun} matches "{query}".</p>
      {/each}
    </div>
  </Sheet.Content>
</Sheet.Root>

{#snippet row(i: CatalogItem<T>)}
  <li>
    <button
      type="button"
      class="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left {i.value === value ? 'bg-instr-wash ring-1 ring-instr' : 'hover:bg-ws-raised'}"
      aria-current={i.value === value ? "true" : undefined}
      onclick={() => pick(i.value)}
    >
      <span class="min-w-0 flex-1">
        <span class="block font-medium">{i.title}</span>
        {#if i.meta}<span class="block text-xs text-ws-soft">{i.meta}</span>{/if}
      </span>
      {#if i.badge}<span class="shrink-0 text-xs text-ws-soft">{i.badge}</span>{/if}
    </button>
  </li>
{/snippet}

<style>
  .chip {
    min-height: 2.25rem;
    border-radius: 9999px;
    border: 1px solid var(--ws-line);
    padding: 0 0.75rem;
    font-size: 0.8125rem;
  }
  .chip[aria-pressed="true"] {
    border-color: transparent;
    background: var(--instr);
    color: var(--ws-stage);
    font-weight: 600;
  }
</style>
