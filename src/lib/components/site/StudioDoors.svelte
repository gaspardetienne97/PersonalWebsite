<script lang="ts">
  import { resolve } from "$app/paths";
  import { Badge } from "@repo/ui/badge";
  import StudioCover from "./StudioCover.svelte";
  import { STUDIO, kindsByWork, type StudioKindInfo } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

  let { headingLevel = 3, writing

  /** Show Writing as one more door: the newest titles and how many posts there are. */
   }: { 
    headingLevel?: 2 | 3;
    writing?: { titles: string[]; count: number }
   } = $props();

  const studio = resolve("/studio");
  const kinds = kindsByWork();
  const full = kinds.filter((info) => STUDIO[info.kind].length > 0);
  const empty = kinds.filter((info) => STUDIO[info.kind].length === 0);
  const badge = "shrink-0 text-[0.8125rem]";
</script>

<!--
  The Studio by kind: one equal, compact door per kind. A kind that holds work
  shows up to three of its pieces and how many there are. A kind with nothing
  yet shows its icon and "Soon"; what is on the way is said in a tooltip (hover
  or keyboard focus) and to screen readers. Kinds that hold work come first.
  Given `writing` (the home page), the blog is one more door after them.

  Under 1000px a door is a row 72px tall: pictures, name, count. From 1000px
  the doors stand four across with the pictures on top.
-->

{#snippet label(name: string, dot: string, count?: number)}
  <span class="label">
    <span class="name" role="heading" aria-level={headingLevel}>
      <i class="dot" style:background={dot}></i>{name}
    </span>
    {#if count}
      <Badge variant="secondary" class={badge}>{count}</Badge>
    {:else}
      <Badge variant="outline" class="{badge} text-foreground">{m.studio_soon()}</Badge>
    {/if}
  </span>
{/snippet}

{#snippet door(info: StudioKindInfo)}
  {@const items = STUDIO[info.kind]}
  <li>
    <a class="door" href="{studio}?type={info.kind}">
      {#if items.length}
        <span class="peek" aria-hidden="true">
          {#each items.slice(0, 3) as item (item.media.id)}
            <span class="cell"><StudioCover {item} size={240} eager /></span>
          {/each}
        </span>
      {:else}
        <span class="peek" aria-hidden="true">
          <span class="cell empty">
            <span class="glyph" style:color={info.dot}><info.icon size={22} /></span>
          </span>
        </span>
      {/if}
      {@render label(info.label, info.dot, items.length)}
      {#if !items.length}<span class="sr-only">{info.empty}</span>{/if}
    </a>
    {#if !items.length}<span class="tip" aria-hidden="true">{info.empty}</span>{/if}
  </li>
{/snippet}

<ul class="doors">
  {#each full as info (info.kind)}
    {@render door(info)}
  {/each}
  {#if writing}
    <li>
      <a class="door" href={resolve("/blog")}>
        <span class="peek" aria-hidden="true">
          <span class="cell page">
            {#each writing.titles.slice(0, 3) as title (title)}
              <span>{title}</span>
            {/each}
          </span>
        </span>
        {@render label(m.kind_writing(), "var(--foreground)", writing.count)}
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
    gap: 0.75rem;
  }
  @media (width >= 640px) {
    .doors {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (width >= 1000px) {
    .doors {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
    }
  }
  li {
    position: relative;
  }

  /* A row: pictures (or the icon), the name, the count (or "Soon"). */
  .door {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 4.5rem;
    padding: 0.75rem;
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

  /* Up to three pieces side by side, in the same box whatever the kind. */
  .peek {
    flex: none;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 1px;
    width: 8.75rem;
    height: 3rem;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 4px);
    background: var(--border);
  }
  .cell {
    position: relative;
    overflow: hidden;
    background: var(--muted);
  }
  /* A project's icon chip is as large as a thumbnail this small. */
  .cell :global(.chip) {
    display: none;
  }
  /* A kind with nothing in it yet: its icon on bare perfboard. */
  .empty {
    display: grid;
    place-items: center;
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
  /* Writing's peek is a page of its newest titles. In a row there is room for
     the newest one, on two lines. */
  .page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 0.6rem;
    font-family: var(--font-gm-serif);
    font-size: 0.8125rem;
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
  .page span:first-child {
    font-weight: 600;
  }
  .page span:not(:first-child) {
    display: none;
  }

  /* The name and the badge share one line, and the line is the same height on
     every door. */
  .label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
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
  .cell :global(.cover img) {
    transition: scale 0.3s ease;
  }
  .door:hover .cell :global(.cover img) {
    scale: 1.04;
  }

  /* What is on the way, shown over the door on hover and on keyboard focus. */
  .tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.4rem);
    z-index: 5;
    translate: -50% 0.25rem;
    width: max-content;
    max-width: min(17rem, 100%);
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
    translate: -50% 0;
  }
  @media (hover: hover) {
    li:has(.door:hover) .tip {
      opacity: 1;
      translate: -50% 0;
    }
  }

  /* Four across: the pictures on top, the label line under them. */
  @media (width >= 1000px) {
    .door {
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      height: 12.5rem;
      padding: 0;
    }
    .peek {
      flex: 1;
      width: auto;
      height: auto;
      min-height: 0;
      border: 0;
      border-bottom: 1px solid var(--border);
      border-radius: 0;
    }
    .cell :global(.chip) {
      display: grid;
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
      padding: 0 1.1rem;
      font-size: 1rem;
      line-height: 1.3;
    }
    .page span,
    .page span:not(:first-child) {
      display: -webkit-box;
      padding-block: 0.4rem;
      box-sizing: content-box;
      max-height: 2.6em;
      border-bottom: 1px solid var(--border);
    }
    .page span:last-child {
      border-bottom: 0;
    }
    .label {
      flex: none;
      height: 3.25rem;
      padding-inline: 0.9rem;
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
