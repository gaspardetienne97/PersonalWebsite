<script lang="ts">
  import { resolve } from "$app/paths";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { Badge } from "@repo/ui/badge";
  import CircuitArt from "./CircuitArt.svelte";
  import StudioCover from "./StudioCover.svelte";
  import { STUDIO, STUDIO_KINDS, everything } from "#lib/content/studio.ts";

  let { headingLevel = 3, writing

  /** Show Writing as the last door: the newest titles and how many posts there are. */
   }: { 
    headingLevel?: 2 | 3;
    writing?: { titles: string[]; count: number }
   } = $props();

  const studio = resolve('studio');
  const all = everything();
</script>

<!--
  The Studio by kind: one equal card per kind, each with a peek at up to four of
  its pieces. The last card is everything together (the Studio's "Kinds" view),
  or, given `writing`, the blog as one more door (the home page).
-->

<ul class="doors">
  {#each STUDIO_KINDS as info (info.kind)}
    {@const items = STUDIO[info.kind]}
    <li>
      <a class="door" href="{studio}?type={info.kind}">
        <span class="peek n{Math.min(items.length, 4)}" aria-hidden="true">
          {#each items.slice(0, 4) as item (item.media.id)}
            <span class="cell"><StudioCover item={item} size={240} /></span>
          {:else}
            <span class="cell empty">
              <CircuitArt seed="door-{info.kind}" colors={info.colors} icon={info.icon} width={320} height={320} />
            </span>
          {/each}
        </span>
        <span class="label">
          <span class="name" role="heading" aria-level={headingLevel}>
            <i class="dot" style:background={info.dot}></i>{info.label}
          </span>
          {#if items.length}
            <Badge variant="secondary">{items.length}</Badge>
          {:else}
            <Badge variant="outline">Soon</Badge>
          {/if}
        </span>
      </a>
    </li>
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
            <i class="dot" style:background="var(--foreground)"></i>Writing
          </span>
          <Badge variant="secondary">{writing.count}</Badge>
        </span>
      </a>
    </li>
  {:else}
    <li>
      <a class="door all" href={studio}>
        <span class="peek n{Math.min(all.length, 4)}" aria-hidden="true">
          {#each all.slice(0, 4) as item (item.kind + item.media.id)}
            <span class="cell"><StudioCover item={item} size={240} /></span>
          {/each}
        </span>
        <span class="label">
          <span class="name" role="heading" aria-level={headingLevel}>
            Everything<ArrowRight size={16} aria-hidden="true" />
          </span>
          <Badge variant="secondary">{all.length}</Badge>
        </span>
      </a>
    </li>
  {/if}
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
      box-shadow 0.2s ease;
  }
  .door:hover {
    translate: 0 -2px;
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
  .empty :global(.art) {
    position: absolute;
    inset: 0;
    height: 100%;
    opacity: 0.55;
  }
  /* Writing's peek is a page of its newest titles, each written on a ruled line. */
  .page {
    --rule: 2.1rem;
    display: flex;
    flex-direction: column;
    padding: var(--rule) 12% 0;
    font-family: var(--font-gm-serif);
    font-size: 1.05rem;
    line-height: var(--rule);
    color: var(--muted-foreground);
    background: var(--card);
    background-image: repeating-linear-gradient(
      transparent 0 calc(var(--rule) - 1px),
      color-mix(in oklab, var(--border) 80%, transparent) calc(var(--rule) - 1px) var(--rule)
    );
  }
  .page span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .page span:first-child {
    color: var(--foreground);
  }
  .label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  @media (prefers-reduced-motion: reduce) {
    .door {
      transition: none;
    }
  }
</style>
