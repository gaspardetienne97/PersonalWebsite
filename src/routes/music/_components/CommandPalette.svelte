<script lang="ts">
  import { goto } from "$app/navigation";
  import Search from "lucide-svelte/icons/search";

  import * as Dialog from "@repo/ui/dialog";
  import { cn } from "@repo/ui/utils";

  import { CREATE_ITEMS, DRILLS, LIBRARY_ITEMS, PATHS } from "./musicCatalog";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  type Command = { label: string; href: string; group: string };

  // One flat index over the shared catalog + key destinations. ⌘K jumps anywhere.
  const COMMANDS: Command[] = [
    { label: "Start today's plan", href: "/music", group: "Today" },
    ...DRILLS.map((d) => ({ label: d.title, href: d.href, group: "Drill" })),
    ...PATHS.map((p) => ({ label: p.title, href: p.href, group: "Path" })),
    ...LIBRARY_ITEMS.map((l) => ({ label: l.title, href: l.href, group: "Library" })),
    ...CREATE_ITEMS.map((c) => ({ label: c.title, href: c.href, group: "Create" })),
    { label: "Tuner & Intonation", href: "/music/tuner", group: "Tool" },
    { label: "Connect a device", href: "/music/connect", group: "Tool" },
    { label: "Progress & skill tree", href: "/music/progress", group: "Go" },
    { label: "Practice journal", href: "/music/track", group: "Go" },
    { label: "Settings", href: "/music/settings", group: "Tool" },
  ];

  let query = $state("");
  let activeIndex = $state(0);

  const results = $derived(
    query.trim() === ""
      ? COMMANDS
      : COMMANDS.filter((c) =>
          `${c.label} ${c.group}`.toLowerCase().includes(query.trim().toLowerCase()),
        ),
  );

  let input = $state<HTMLInputElement>();

  // Reset and focus each time the palette opens.
  $effect(() => {
    if (open) {
      query = "";
      activeIndex = 0;
      queueMicrotask(() => input?.focus());
    }
  });

  function select(command: Command): void {
    open = false;
    void goto(command.href);
  }

  function onListKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, results.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) select(command);
    }
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open = !open;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open>
  <Dialog.Content class="overflow-hidden p-0 sm:max-w-lg">
    <Dialog.Title class="sr-only">Command palette</Dialog.Title>
    <div class="flex items-center gap-2 border-b px-3">
      <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        bind:this={input}
        bind:value={query}
        onkeydown={onListKeydown}
        type="text"
        placeholder="Search drills, songs, tools…"
        aria-label="Search"
        class="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
    <ul class="max-h-80 overflow-y-auto p-1.5" role="listbox" aria-label="Commands">
      {#each results as command, index (command.href)}
        <li>
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onclick={() => select(command)}
            onmousemove={() => (activeIndex = index)}
            class={cn(
              "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
              index === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground",
            )}
          >
            <span class="truncate">{command.label}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{command.group}</span>
          </button>
        </li>
      {:else}
        <li class="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
      {/each}
    </ul>
  </Dialog.Content>
</Dialog.Root>
