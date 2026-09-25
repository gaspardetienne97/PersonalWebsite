<script lang="ts">
  // ⌘K / Ctrl-K: one flat index over hubs, drills and paths. Arrows move, Enter goes.
  import * as Dialog from "@repo/ui/dialog";
  import { goto } from "$app/navigation";
  import { palette } from "./palette.svelte";
  import { searchIndex } from "../search";

  let query = $state("");
  let active = $state(0);
  const items = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const all = searchIndex();
    if (!q) return all.slice(0, 12);
    return all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(q)).slice(0, 20);
  });

  $effect(() => {
    void query;
    active = 0;
  });

  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (palette.isOpen) palette.close();
      else palette.open();
    }
  }

  function go(href: string) {
    palette.close();
    query = "";
    void goto(href);
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
      go(items[active].href);
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<Dialog.Root bind:open={() => palette.isOpen, (v) => (v ? palette.open() : palette.close())}>
  <Dialog.Content class="top-[20%] max-w-xl translate-y-0 gap-2 p-3">
    <Dialog.Title class="sr-only">Search Woodshed</Dialog.Title>
    <input
      bind:value={query}
      onkeydown={onKey}
      placeholder="Drill, path, song or page"
      aria-label="Search"
      aria-controls="palette-results"
      aria-activedescendant={items[active] ? `palette-${active}` : undefined}
      class="h-12 w-full rounded-md border border-input bg-background px-3 text-base"
    />
    <ul id="palette-results" role="listbox" aria-label="Results" class="max-h-[50vh] overflow-y-auto">
      {#each items as item, i (item.href + item.label)}
        <li
          id="palette-{i}"
          role="option"
          aria-selected={i === active}
          class="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-sm {i === active ? 'bg-accent' : ''}"
          onpointerenter={() => (active = i)}
          onclick={() => go(item.href)}
          onkeydown={() => {}}
        >
          <span class="font-medium">{item.label}</span>
          {#if item.hint}<span class="truncate text-muted-foreground">{item.hint}</span>{/if}
        </li>
      {:else}
        <li class="px-3 py-4 text-sm text-muted-foreground">Nothing matches "{query}".</li>
      {/each}
    </ul>
  </Dialog.Content>
</Dialog.Root>
