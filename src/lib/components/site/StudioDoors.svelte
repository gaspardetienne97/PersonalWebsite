<script lang="ts">
  import { resolve } from "$app/paths";
  import StudioCover from "./StudioCover.svelte";
  import { STUDIO, kindsByWork, type StudioKindInfo } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

  let {
    headingLevel = 3,
    writing,
  }: {
    headingLevel?: 2 | 3;
    /** Show Writing as one more door: the newest title and how many posts there are. */
    writing?: { titles: string[]; count: number };
  } = $props();

  const studio = resolve("/studio");
  const kinds = kindsByWork();
  const full = kinds.filter((info) => STUDIO[info.kind].length > 0);
  const empty = kinds.filter((info) => STUDIO[info.kind].length === 0);
  // One row from 1000px: a column for every door, however many there are.
  const count = $derived(kinds.length + (writing ? 1 : 0));
</script>

<!--
  The Studio by kind: one equal, compact door per kind. Each is a picture cell
  with the name under it, and how many pieces the kind holds (or "Soon") on a
  small badge in the cell's corner. A kind that holds work shows one of its
  pieces, large. A kind with nothing yet shows its icon; what is on the way is
  said in a tooltip (hover or keyboard focus) and to screen readers. Kinds that
  hold work come first. Given `writing` (the home page), the blog is one more
  door after them.

  Two columns on a phone, four from 640px, and from 1000px one row of square
  cells (eight doors on home, seven in the Studio).
-->

{#snippet label(name: string, dot: string)}
  <span class="name" role="heading" aria-level={headingLevel}>
    <i class="dot" style:background={dot}></i>{name}
  </span>
{/snippet}

{#snippet badge(count?: number)}
  <span class="badge">{count || m.studio_soon()}</span>
{/snippet}

{#snippet door(info: StudioKindInfo)}
  {@const items = STUDIO[info.kind]}
  <li>
    <a class="door" href="{studio}?type={info.kind}">
      {#if items.length}
        <span class="cell" aria-hidden="true"><StudioCover item={items[0]} size={240} eager /></span>
      {:else}
        <span class="cell empty" aria-hidden="true">
          <span class="glyph" style:color={info.dot}><info.icon size={22} /></span>
        </span>
      {/if}
      {@render label(info.label, info.dot)}
      {@render badge(items.length)}
      {#if !items.length}<span class="sr-only">{info.empty}</span>{/if}
    </a>
    {#if !items.length}<span class="tip" aria-hidden="true">{info.empty}</span>{/if}
  </li>
{/snippet}

<ul class="doors" style:--doors={count}>
  {#each full as info (info.kind)}
    {@render door(info)}
  {/each}
  {#if writing}
    <li>
      <a class="door" href={resolve("/blog")}>
        <span class="cell page" aria-hidden="true">
          {#if writing.titles[0]}<span>{writing.titles[0]}</span>{/if}
        </span>
        {@render label(m.kind_writing(), "var(--foreground)")}
        {@render badge(writing.count)}
      </a>
    </li>
  {/if}
  {#each empty as info (info.kind)}
    {@render door(info)}
  {/each}
</ul>

<style>
  .doors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  @media (width >= 640px) {
    .doors {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  @media (width >= 1000px) {
    .doors {
      grid-template-columns: repeat(var(--doors, 8), minmax(0, 1fr));
    }
  }
  li {
    position: relative;
    min-width: 0;
  }

  /* A door: the picture cell on top, the name under it, the badge in the cell's
     top right corner. 96px tall on a phone. */
  .door {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    color: var(--card-foreground);
    outline: none;
    transition:
      translate 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
  .door:hover {
    translate: 0 -2px;
    border-color: color-mix(in oklab, var(--foreground) 45%, var(--border));
    box-shadow: 0 8px 22px -12px rgb(0 0 0 / 0.3);
  }
  .door:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }

  /* One piece (or the kind's icon), in the same box whatever the kind. */
  .cell {
    position: relative;
    display: block;
    height: 3.625rem;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
    background: var(--muted);
  }
  /* The badge sits where a project's icon chip would be read as a second mark. */
  .cell :global(.chip) {
    display: none;
  }
  /* A screenshot keeps its top edge. In a strip this low a drawing is a close
     view of its lines, not a small whole sheet: the square cells from 1000px
     show it whole. */
  .cell :global(.cover img) {
    object-position: top;
    transition: scale 0.3s ease;
  }
  .cell :global(.cover.paper img) {
    padding: 0;
    object-fit: cover;
    object-position: center;
  }
  .door:hover .cell :global(.cover img) {
    scale: 1.04;
  }
  /* A kind with nothing in it yet: its icon on bare perfboard, at the left on a
     phone so the badge has the corner to itself. */
  .empty {
    display: grid;
    place-items: center start;
    padding-left: 0.65rem;
    background-color: var(--card);
    background-image: radial-gradient(circle, var(--gm-dot) 1px, transparent 1.6px);
    background-size: 16px 16px;
    background-position: center;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    background: var(--card);
  }
  /* Writing's cell is a page: its newest title over a few ruled lines. */
  .page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 3.25rem 0 0.75rem;
    font-family: var(--font-gm-serif);
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.25;
    color: var(--card-foreground);
    background: var(--card);
  }
  .page span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    height: 2.25rem;
    padding-inline: 0.65rem;
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .door:hover .name {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
  .dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  /* How many pieces, or "Soon": one small solid badge, so it reads on a picture
     and on the perfboard alike. */
  .badge {
    position: absolute;
    top: 0.375rem;
    right: 0.375rem;
    display: grid;
    place-items: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding-inline: 0.45rem;
    border: 1px solid color-mix(in oklab, var(--foreground) 22%, var(--border));
    border-radius: 999px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* What is on the way, shown over the door on hover and on keyboard focus. */
  .tip {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 0.4rem);
    z-index: 5;
    translate: 0 0.25rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--foreground);
    color: var(--background);
    font-size: 0.875rem;
    line-height: 1.35;
    text-align: center;
    text-wrap: balance;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.15s ease,
      translate 0.15s ease;
  }
  li:has(.door:focus-visible) .tip {
    opacity: 1;
    translate: 0 0;
  }
  @media (hover: hover) {
    li:has(.door:hover) .tip {
      opacity: 1;
      translate: 0 0;
    }
  }

  /* One row: square cells, and a tip wider than its door (the last door's tip
     stays inside the row's right edge). */
  @media (width >= 1000px) {
    .cell {
      height: auto;
      aspect-ratio: 1;
    }
    .empty {
      place-items: center;
      padding-left: 0;
    }
    .cell :global(.cover.paper img) {
      padding: 7%;
      object-fit: contain;
    }
    .glyph {
      width: 3rem;
      height: 3rem;
      border-radius: 0.75rem;
    }
    .glyph :global(svg) {
      width: 1.625rem;
      height: 1.625rem;
    }
    .page {
      justify-content: flex-start;
      padding: 2.25rem 0.75rem 0;
      font-size: 1.0625rem;
      /* Ruled lines under the title, like the rest of a page. */
      background-image: repeating-linear-gradient(
        to bottom,
        transparent 0 0.6rem,
        var(--border) 0.6rem calc(0.6rem + 1px)
      );
      background-size: calc(100% - 1.5rem) 2.5rem;
      background-position: 0.75rem calc(100% - 0.6rem);
      background-repeat: no-repeat;
    }
    .page span {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }
    .name {
      height: 2.5rem;
    }
    .tip {
      left: 50%;
      right: auto;
      translate: -50% 0.25rem;
      width: max-content;
      max-width: 15rem;
    }
    li:has(.door:focus-visible) .tip {
      translate: -50% 0;
    }
    @media (hover: hover) {
      li:has(.door:hover) .tip {
        translate: -50% 0;
      }
    }
    li:last-child .tip {
      left: auto;
      right: 0;
      translate: 0 0.25rem;
    }
    li:last-child:has(.door:focus-visible) .tip {
      translate: 0 0;
    }
    @media (hover: hover) {
      li:last-child:has(.door:hover) .tip {
        translate: 0 0;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .door,
    .tip,
    .cell :global(.cover img) {
      transition: none;
    }
    .door:hover {
      translate: none;
    }
    .door:hover .cell :global(.cover img) {
      scale: none;
    }
  }
</style>
