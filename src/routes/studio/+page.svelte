<script lang="ts">
  import { goto } from "$app/navigation";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
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

  // On a phone the kinds scroll sideways: keep the selected one in view.
  let tabs = $state<HTMLElement | null>(null);
  $effect(() => {
    void type;
    const active = tabs?.querySelector<HTMLElement>('[data-state="on"]');
    if (!tabs || !active) return;
    const left = active.offsetLeft - tabs.clientWidth / 2 + active.offsetWidth / 2;
    tabs.scrollTo({ left: Math.max(0, left) });
  });

  // Whether kinds are hidden past the row's edges. On the right an arrow says so
  // and scrolls to them; on the left the row fades out.
  let back = $state(false);
  let more = $state(false);
  function measure() {
    if (!tabs) return;
    back = tabs.scrollLeft > 1;
    more = tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1;
  }
  $effect(() => {
    if (!tabs) return;
    measure();
    tabs.addEventListener("scroll", measure, { passive: true });
    return () => tabs?.removeEventListener("scroll", measure);
  });
</script>

<svelte:window onresize={measure} />

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
  <div class="toolbar">
    <div class="kinds">
      <ToggleGroup.Root
        type="single"
        bind:value={() => (view === "kinds" ? "" : type), chooseType}
        bind:ref={tabs}
        class="tabs {back ? 'back' : ''} {more ? 'more' : ''}"
        aria-label={m.studio_show()}
      >
        <ToggleGroup.Item value="all" class="tab">
          {m.studio_all()} <span class="count">{all.length}</span>
        </ToggleGroup.Item>
        {#each kinds as info (info.kind)}
          {@const count = STUDIO[info.kind].length}
          <ToggleGroup.Item value={info.kind} class="tab {count ? '' : 'none'}">
            <i class="dot" style:background={info.dot} aria-hidden="true"></i>
            {info.label}
            {#if count}
              <span class="count">{count}</span>
            {:else}
              <span class="sr-only">, {m.studio_soon()}</span>
            {/if}
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      {#if more}
        <!-- A pointer shortcut only: the keyboard and screen readers reach every kind in the group. -->
        <button
          type="button"
          class="more-kinds"
          tabindex="-1"
          aria-hidden="true"
          onclick={() => tabs?.scrollBy({ left: tabs.clientWidth * 0.7, behavior: "smooth" })}
        >
          <ChevronRight />
        </button>
      {/if}
    </div>

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
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
    border-bottom: 1px solid var(--border);
  }
  /* On a phone the layout switch gets its own row above the kinds, so the row
     of kinds has the whole width to scroll in. */
  @media (width < 640px) {
    .toolbar {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 0.5rem;
    }
    .toolbar :global(.views) {
      align-self: flex-end;
    }
  }
  .kinds {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
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
  /* Where kinds are hidden past an edge, the row fades out there: on the right
     under an arrow that scrolls to them. At rest the left fade fits inside the
     first tab's padding, so "All" is never dimmed. */
  .toolbar :global(.tabs) {
    --left: 0.75rem;
    --right-from: 100%;
    --right-to: 100%;
    mask-image: linear-gradient(
      90deg,
      transparent,
      #000 var(--left),
      #000 var(--right-from),
      transparent var(--right-to)
    );
  }
  .toolbar :global(.tabs.back) {
    --left: 2.5rem;
  }
  .toolbar :global(.tabs.more) {
    --right-from: calc(100% - 4.5rem);
    --right-to: calc(100% - 2rem);
  }
  .more-kinds {
    position: absolute;
    right: 0;
    top: 0;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2.75rem;
    color: var(--foreground);
  }
  .more-kinds :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
  }
  .toolbar :global(.tab) {
    position: relative;
    height: 2.75rem;
    gap: 0.45rem;
    border-radius: 0.375rem 0.375rem 0 0;
    font-family: var(--font-gm-display);
    font-size: 0.975rem;
    background: transparent;
  }
  /* Kinds that hold work read at full strength; the ones still empty are
     quieter and carry no count. */
  .toolbar :global(.tab) {
    color: var(--foreground);
    font-weight: 500;
  }
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
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--gm-brand);
  }
  .count {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
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
      gap: 1.75rem 1.25rem;
    }
  }
  /* Five across on a laptop, so two rows show before the fold. */
  @media (width >= 1180px) {
    .wall {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 1.5rem 1.25rem;
    }
    /* A touch smaller, so a project's line fits the narrower tile in two rows. */
    .wall :global(.sub) {
      font-size: 0.8125rem;
    }
  }
</style>
