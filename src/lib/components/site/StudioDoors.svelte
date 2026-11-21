<script lang="ts">
  import { resolve } from "$app/paths";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { Badge } from "@repo/ui/badge";
  import StudioCover from "./StudioCover.svelte";
  import { STUDIO, everything, kindsByWork, type StudioKindInfo } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

  let { headingLevel = 3, writing

  /** Show Writing as one more door: the newest titles and how many posts there are. */
   }: { 
    headingLevel?: 2 | 3;
    writing?: { titles: string[]; count: number }
   } = $props();

  const studio = resolve('studio');
  const all = everything();
  const kinds = kindsByWork();
  const full = kinds.filter((info) => STUDIO[info.kind].length > 0);
  const empty = kinds.filter((info) => STUDIO[info.kind].length === 0);
  const badge = "text-[0.8125rem]";
</script>

<!--
  The Studio by kind: one equal card per kind, each with a peek at up to four of
  its pieces. Kinds that hold work come first; a kind with nothing yet says what
  is on the way. One more card, after the kinds with work, is everything together
  (the Studio's "Kinds" view) or, given `writing`, the blog (the home page).
-->

{#snippet door(info: StudioKindInfo)}
  {@const items = STUDIO[info.kind]}
  <li>
    <a class="door" href="{studio}?type={info.kind}">
      {#if items.length}
        <span class="peek n{Math.min(items.length, 4)}" aria-hidden="true">
          {#each items.slice(0, 4) as item (item.media.id)}
            <span class="cell"><StudioCover item={item} size={240} eager /></span>
          {/each}
        </span>
      {:else}
        <span class="peek n0">
          <span class="cell empty">
            <span class="glyph" style:color={info.dot} aria-hidden="true"><info.icon size={26} /></span>
            <span class="coming">{info.empty}</span>
          </span>
        </span>
      {/if}
      <span class="label">
        <span class="name" role="heading" aria-level={headingLevel}>
          <i class="dot" style:background={info.dot}></i>{info.label}
        </span>
        {#if items.length}
          <Badge variant="secondary" class={badge}>{items.length}</Badge>
        {:else}
          <Badge variant="outline" class="{badge} text-foreground">{m.studio_soon()}</Badge>
        {/if}
      </span>
    </a>
  </li>
{/snippet}

<ul class="doors">
  {#each full as info (info.kind)}
    {@render door(info)}
  {/each}
  {#if writing}
    <li>
      <a class="door" href={resolve('blog')}>
        <span class="peek n1" aria-hidden="true">
          <span class="cell page">
            {#each writing.titles.slice(0, 4) as title (title)}
              <span>{title}</span>
            {/each}
          </span>
        </span>
        <span class="label">
          <span class="name" role="heading" aria-level={headingLevel}>
            <i class="dot" style:background="var(--foreground)"></i>{m.kind_writing()}
          </span>
          <Badge variant="secondary" class={badge}>{writing.count}</Badge>
        </span>
      </a>
    </li>
  {:else}
    <li>
      <a class="door all" href={studio}>
        <span class="peek n{Math.min(all.length, 4)}" aria-hidden="true">
          {#each all.slice(0, 4) as item (item.kind + item.media.id)}
            <span class="cell"><StudioCover item={item} size={240} eager /></span>
          {/each}
        </span>
        <span class="label">
          <span class="name" role="heading" aria-level={headingLevel}>
            {m.studio_everything()}<ArrowRight size={16} aria-hidden="true" />
          </span>
          <Badge variant="secondary" class={badge}>{all.length}</Badge>
        </span>
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
    gap: 1rem;
  }
  @media (width >= 800px) {
    .doors {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .door {
    display: flex;
    flex-direction: column;
    height: 100%;
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

  /* Up to four pieces: one fills the card, two split it, three put one tall on
     the left, four make a two by two. */
  .peek {
    display: grid;
    aspect-ratio: 1;
    gap: 1px;
    background: var(--border);
    border-bottom: 1px solid var(--border);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }
  .peek.n0 > .cell,
  .peek.n1 > .cell {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
  }
  .peek.n2 > .cell {
    grid-row: 1 / -1;
  }
  .peek.n3 > .cell:first-child {
    grid-row: 1 / -1;
  }
  .cell {
    position: relative;
    overflow: hidden;
    background: var(--muted);
  }
  /* A kind with nothing in it yet: its icon on bare perfboard and a line about
     what is coming, in place of a picture. */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 8%;
    text-align: center;
    background-color: var(--card);
    background-image: radial-gradient(circle, var(--gm-dot) 1px, transparent 1.6px);
    background-size: 16px 16px;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--card);
  }
  .coming {
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--card-foreground);
    text-wrap: balance;
    /* The page colour behind the words, so the dots stop short of them. */
    background: var(--card);
    box-shadow: 0 0 0 0.3rem var(--card);
    border-radius: 0.25rem;
  }
  @media (width >= 800px) {
    .coming {
      font-size: 0.875rem;
    }
  }
  /* Writing's peek is a page of its newest titles, one ruled row each. */
  .page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 10%;
    font-family: var(--font-gm-serif);
    font-size: 1.05rem;
    line-height: 1.3;
    color: var(--card-foreground);
    background: var(--card);
  }
  .page span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    padding-block: 0.55rem;
    box-sizing: content-box;
    max-height: 2.6em;
    border-bottom: 1px solid var(--border);
  }
  .page span:first-child {
    font-weight: 600;
  }
  .page span:last-child {
    border-bottom: 0;
  }
  .label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem 0.75rem;
    padding: 0.75rem 0.9rem;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }
  .door:hover .name {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
  .cell :global(.cover img) {
    transition: scale 0.3s ease;
  }
  .door:hover .cell :global(.cover img) {
    scale: 1.04;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  @media (prefers-reduced-motion: reduce) {
    .door,
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
