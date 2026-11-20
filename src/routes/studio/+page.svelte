<script lang="ts">
  import { goto } from "$app/navigation";
  import LayoutGrid from "lucide-svelte/icons/layout-grid";
  import Shapes from "lucide-svelte/icons/shapes";
  import * as ToggleGroup from "@repo/ui/toggle-group";
  import { Empty } from "@repo/ui/empty";
  import StudioDoors from "$lib/components/site/StudioDoors.svelte";
  import StudioTile from "$lib/components/site/StudioTile.svelte";
  import StudioViewer from "$lib/components/site/StudioViewer.svelte";
  import {
    STUDIO,
    STUDIO_KINDS,
    everything,
    kindInfo,
    type StudioItem,
  } from "$lib/content/studio";

  let { data } = $props();

  const all = everything();

  // Both choices live in the URL so any view can be linked to.
  const type = $derived(data.type);
  const view = $derived(data.view);
  const items = $derived(type === "all" ? all : STUDIO[type]);
  const heading = $derived(type === "all" ? "Everything" : kindInfo(type).label);

  const go = (query: string) =>
    goto(query ? `?${query}` : "?", { replaceState: true, noScroll: true, keepFocus: true });

  // Clicking the active option again would clear it; keep it selected instead.
  function chooseType(value: string) {
    if (!value || value === type) return;
    go(value === "all" ? "" : `type=${value}`);
  }
  function chooseView(value: string) {
    if (!value || value === view) return;
    go(value === "kinds" ? "view=kinds" : type === "all" ? "" : `type=${type}`);
  }

  // The viewer steps through what's on the wall, minus projects (those are links).
  const viewable = $derived(items.filter((item) => item.media.type !== "project"));
  let viewer = $state({ open: false, index: 0 });
  const open = (item: StudioItem) =>
    (viewer = { open: true, index: viewable.indexOf(item) });

  // On a phone the kinds scroll sideways: keep the selected one in view.
  let tabs = $state<HTMLElement | null>(null);
  $effect(() => {
    void type;
    const active = tabs?.querySelector<HTMLElement>('[data-state="on"]');
    if (!tabs || !active) return;
    const left = active.offsetLeft - tabs.clientWidth / 2 + active.offsetWidth / 2;
    tabs.scrollTo({ left: Math.max(0, left) });
  });
</script>

<svelte:head>
  <title>Studio | Gaspard Michel Etienne</title>
  <meta
    name="description"
    content="Doodles, drawings, music, paintings, photos, projects and videos by Gaspard Michel Etienne."
  />
</svelte:head>

<div class="gm-page studio">
  <header class="flex flex-col gap-5">
    <h1 class="gm-title">My Studio</h1>
    <p class="gm-lede">
      Everything I make. Code, Music, Drawings, Paintings, Photos etc... all hang on the same wall
      here in my Studio.
    </p>
  </header>

  <!-- One toolbar along the top edge of the wall: the kinds read like the site's
       nav, the layout switch sits flush with the wall's right edge. -->
  <div class="toolbar">
    <ToggleGroup.Root
      type="single"
      bind:value={() => (view === "kinds" ? "" : type), chooseType}
      bind:ref={tabs}
      class="tabs"
      aria-label="Show"
    >
      <ToggleGroup.Item value="all" class="tab">
        All <span class="count">{all.length}</span>
      </ToggleGroup.Item>
      {#each STUDIO_KINDS as info (info.kind)}
        {@const count = STUDIO[info.kind].length}
        <ToggleGroup.Item value={info.kind} class="tab">
          <i class="dot" style:background={info.dot} aria-hidden="true"></i>
          {info.label}
          <span class="count" class:none={count === 0}>{count}</span>
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>

    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      bind:value={() => view, chooseView}
      class="views"
      aria-label="Layout"
    >
      <ToggleGroup.Item value="wall" aria-label="Wall" title="Wall: everything on one grid">
        <LayoutGrid aria-hidden="true" />
      </ToggleGroup.Item>
      <ToggleGroup.Item value="kinds" aria-label="Kinds" title="Kinds: one card per kind">
        <Shapes aria-hidden="true" />
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  </div>

  {#if view === "kinds"}
    <section class="group" aria-labelledby="kinds-heading">
      <h2 id="kinds-heading" class="sr-only">By kind</h2>
      <StudioDoors />
    </section>
  {:else}
    <section class="group" aria-labelledby="wall-heading">
      <h2 id="wall-heading" class="sr-only">{heading}</h2>
      {#if items.length === 0 && type !== "all"}
        {@const info = kindInfo(type)}
        <Empty title="No {info.label.toLowerCase()} yet" description={info.empty}>
          {#snippet icon()}<info.icon />{/snippet}
        </Empty>
      {:else}
        <ul class="wall">
          {#each items as item (item.kind + item.media.id)}
            <li><StudioTile {item} onopen={open} /></li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<StudioViewer items={viewable} bind:open={viewer.open} bind:index={viewer.index} />

<style>
  .studio {
    padding-top: clamp(3rem, 8vw, 6rem);
  }

  /* The toolbar spans the wall's width and ends in a hairline; the current
     kind's gradient underline sits on that line, like the header nav's. */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: clamp(2.5rem, 6vw, 3.5rem);
    border-bottom: 1px solid var(--border);
  }
  .toolbar :global(.tabs) {
    flex: 1;
    min-width: 0;
    gap: 0.125rem;
    /* Pull the first label's text onto the wall's left edge. */
    margin-left: -0.75rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  /* When the kinds don't fit, the row scrolls; its right edge fades out to say so. */
  @media (width < 900px) {
    .toolbar :global(.tabs) {
      /* The left fade fits inside the first tab's padding, so "All" is never dimmed. */
      mask-image: linear-gradient(
        90deg,
        transparent,
        #000 0.75rem,
        #000 calc(100% - 2.5rem),
        transparent
      );
    }
  }
  .toolbar :global(.tab) {
    position: relative;
    height: 2.75rem;
    gap: 0.45rem;
    border-radius: 0.375rem 0.375rem 0 0;
    font-family: var(--font-gm-display);
    font-size: 0.975rem;
    color: var(--muted-foreground);
    background: transparent;
  }
  .toolbar :global(.tab:hover),
  .toolbar :global(.tab[data-state="on"]) {
    color: var(--foreground);
    background: transparent;
  }
  .toolbar :global(.tab[data-state="on"])::after {
    content: "";
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--gm-brand);
  }
  .count {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
  }
  .count.none {
    opacity: 0.55;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .toolbar :global(.views) {
    flex: none;
  }

  .group {
    margin-top: 2rem;
  }

  /* One even wall: every piece gets the same square, whatever it is. */
  .wall {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.75rem 1rem;
  }
  @media (width >= 640px) {
    .wall {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (width >= 1000px) {
    .wall {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 2rem 1.25rem;
    }
  }
</style>
