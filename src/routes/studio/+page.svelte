<script lang="ts">
  import { flip } from "svelte/animate";
  import { prefersReducedMotion } from "svelte/motion";
  import { goto } from "$app/navigation";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Shapes from "@lucide/svelte/icons/shapes";
  import * as ToggleGroup from "@repo/ui/toggle-group";
  import { Button } from "@repo/ui/button";
  import { Empty } from "@repo/ui/empty";
  import StudioDoors from "#lib/components/site/StudioDoors.svelte";
  import StudioTile from "#lib/components/site/StudioTile.svelte";
  import StudioViewer from "#lib/components/site/StudioViewer.svelte";
  import {
    STUDIO,
    everything,
    kindInfo,
    kindsByWork,
    type StudioItem,
  } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

  let { data } = $props();

  const all = everything();
  // Kinds that hold work lead the row; the empty ones follow, all still there.
  const kinds = kindsByWork();
  const withWork = kinds.filter((info) => STUDIO[info.kind].length > 0);

  // Both choices live in the URL so any view can be linked to.
  const type = $derived(data.type);
  const view = $derived(data.view);
  const items = $derived(type === "all" ? all : STUDIO[type]);
  const heading = $derived(type === "all" ? m.studio_everything() : kindInfo(type).label);

  const go = (query: string) =>
    goto(query ? `?${query}` : "?", { replace: true, reset: false });

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
</script>

<svelte:head>
  <title>{m.nav_studio()} | Gaspard Michel Etienne</title>
  <meta
    name="description"
    content={m.studio_meta()}
  />
</svelte:head>

<div class="gm-page studio">
  <header class="hero">
    <h1 class="gm-title">{m.studio_title()}</h1>
    <p class="gm-lede">{m.studio_lede()}</p>
  </header>

  <!-- One toolbar along the top edge of the wall: the kinds read like the site's
       nav, the layout switch sits flush with the wall's right edge. -->
  <div class="toolbar" class:by-kind={view === "kinds"}>
    <!-- Every kind is here, each with its count, or "Soon" in words while it holds
         nothing. A row of tabs from 1280px; under that a grid of chips, so no kind
         is ever off screen. -->
    <ToggleGroup.Root
      type="single"
      bind:value={() => (view === "kinds" ? "" : type), chooseType}
      class="tabs"
      aria-label={m.studio_show()}
    >
      <ToggleGroup.Item value="all" class="tab">
        <span class="name">{m.studio_all()}</span>
        <span class="count">{all.length}</span>
      </ToggleGroup.Item>
      {#each kinds as info (info.kind)}
        {@const count = STUDIO[info.kind].length}
        <ToggleGroup.Item value={info.kind} class="tab {count ? '' : 'none'}">
          <span class="name"><i class="dot" style:background={info.dot} aria-hidden="true"></i>{info.label}</span>
          <span class="count">{count || m.studio_soon()}</span>
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>

    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      bind:value={() => view, chooseView}
      class="views"
      aria-label={m.studio_layout()}
    >
      <ToggleGroup.Item value="wall" title={m.studio_wall_hint()}>
        <LayoutGrid aria-hidden="true" />{m.studio_wall()}
      </ToggleGroup.Item>
      <ToggleGroup.Item value="kinds" title={m.studio_kinds_hint()}>
        <Shapes aria-hidden="true" />{m.studio_kinds()}
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  </div>

  {#if view === "kinds"}
    <section class="group" aria-labelledby="kinds-heading">
      <h2 id="kinds-heading" class="sr-only">{m.studio_by_kind()}</h2>
      <StudioDoors />
    </section>
  {:else}
    <section class="group" aria-labelledby="wall-heading">
      <h2 id="wall-heading" class="sr-only">{heading}</h2>
      {#if items.length === 0 && type !== "all"}
        {@const info = kindInfo(type)}
        <Empty title={m.studio_empty_title({ kind: info.label.toLowerCase() })} description={info.empty}>
          {#snippet icon()}<info.icon />{/snippet}
          <!-- The way back to what is here: everything, and each kind that holds work. -->
          <Button href="?" class="h-11">{m.studio_see_everything()}</Button>
          {#each withWork as other (other.kind)}
            <Button variant="outline" href="?type={other.kind}" class="h-11">
              <i class="dot" style:background={other.dot} aria-hidden="true"></i>
              {other.label}
              <span class="count">{STUDIO[other.kind].length}</span>
            </Button>
          {/each}
        </Empty>
      {:else}
        <ul class="wall">
          {#each items as item (item.kind + item.media.id)}
            <li animate:flip={{ duration: prefersReducedMotion.current ? 0 : 260 }}>
              <StudioTile {item} onopen={open} />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<StudioViewer items={viewable} bind:open={viewer.open} bind:index={viewer.index} />

<style>
  .studio {
    padding-top: 1.5rem;
  }

  /* The title on the left, the introduction on the right, sharing a baseline
     (like the home page's hero), so the wall starts high on the screen. */
  .hero {
    display: grid;
    gap: 1rem;
    align-items: end;
  }
  @media (width >= 900px) {
    .hero {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      gap: 3rem;
    }
    .hero :global(.gm-lede) {
      font-size: 1.25rem;
      max-width: 46ch;
      justify-self: end;
    }
  }

  /* The toolbar spans the wall's width and ends in a hairline; the current
     kind's gradient underline sits on that line, like the header nav's. */
  .toolbar {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .toolbar :global(.tabs) {
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0;
    /* Pull the first label's text onto the wall's left edge. */
    margin-left: -0.45rem;
  }
  .toolbar :global(.tab) {
    position: relative;
    flex: none;
    height: 2.75rem;
    /* Tight, so all eight fit one row at 1280px in French and Spanish too. */
    gap: 0.3rem;
    padding-inline: 0.45rem;
    border-radius: 0.375rem 0.375rem 0 0;
    font-family: var(--font-gm-display);
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--foreground);
    background: transparent;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
  /* Kinds that hold work read at full strength and carry a count; the ones
     still empty are quieter and say "Soon". */
  .toolbar :global(.tab.none) {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .toolbar :global(.tab:hover),
  .toolbar :global(.tab[data-state="on"]) {
    color: var(--foreground);
    background: transparent;
  }
  .toolbar :global(.tab[data-state="on"]) {
    font-weight: 650;
  }
  .toolbar :global(.tab[data-state="on"])::after {
    content: "";
    position: absolute;
    left: 0.45rem;
    right: 0.45rem;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--gm-brand);
  }
  .count {
    font-size: 0.75rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
  }
  .dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  /* Under 1280px the row of tabs would wrap, so the layout switch gets its own
     row above the kinds and the kinds are chips in a grid, 48px tall, the name
     over its count: four across on a phone, all eight in one row from 900px. The
     chosen one is filled, so it is marked by shape as well as colour. */
  @media (width < 1280px) {
    .toolbar {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 0.75rem;
      border-bottom: 0;
    }
    .toolbar :global(.views) {
      align-self: flex-end;
    }
    .toolbar :global(.tabs) {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.375rem;
      /* The kit's group is only as wide as its items. */
      width: 100%;
      margin-left: 0;
    }
    .toolbar :global(.tab) {
      flex-direction: column;
      gap: 0;
      min-width: 0;
      height: 3rem;
      padding-inline: 0.2rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      line-height: 1.25;
      background: var(--card);
    }
    .name {
      gap: 0.3rem;
      max-width: 100%;
    }
    .count {
      font-size: 0.75rem;
    }
    .dot {
      width: 0.4rem;
      height: 0.4rem;
    }
    .toolbar :global(.tab:hover) {
      background: var(--card);
    }
    .toolbar :global(.tab[data-state="on"]) {
      border-color: var(--foreground);
      color: var(--background);
      background: var(--foreground);
    }
    .toolbar :global(.tab[data-state="on"] .count) {
      color: inherit;
    }
    .toolbar :global(.tab[data-state="on"])::after {
      content: none;
    }
  }
  /* The longest names ("Gribouillis", "Garabatos") still fit four across on a small phone. */
  @media (width < 380px) {
    .toolbar :global(.tab) {
      font-size: 0.75rem;
    }
    .name {
      gap: 0.2rem;
    }
  }
  /* In the kinds view the doors under the switch are the same eight links, so
     the chips would say everything twice: they step aside (the row of tabs from
     1280px stays). */
  @media (width < 1280px) {
    .toolbar.by-kind :global(.tabs) {
      display: none;
    }
  }
  @media (900px <= width < 1280px) {
    .toolbar :global(.tabs) {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }
  .toolbar :global(.views) {
    flex: none;
    margin-bottom: 0.4rem;
  }
  .toolbar :global(.views > *) {
    height: 2.75rem;
    gap: 0.4rem;
    padding-inline: 0.8rem;
    font-size: 0.875rem;
  }
  @media (width >= 640px) and (pointer: fine) {
    .toolbar :global(.views > *) {
      height: 2.25rem;
    }
  }

  .group {
    margin-top: 1rem;
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
      gap: 2rem 1.5rem;
    }
  }
</style>
