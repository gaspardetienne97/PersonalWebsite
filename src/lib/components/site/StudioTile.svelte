<!--
  One piece on the Studio wall. Every kind gets the same square tile with a small
  tag saying what it is. Projects link to the project; everything else opens in
  the viewer.
-->
<script lang="ts">
  import Maximize from "@lucide/svelte/icons/maximize-2";
  import StudioCover from "./StudioCover.svelte";
  import { kindInfo, type StudioItem } from "#lib/content/studio.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { item, onopen }: { item: StudioItem; onopen: (item: StudioItem) => void } = $props();

  const media = $derived(item.media);
  const info = $derived(kindInfo(item.kind));
</script>

{#snippet body()}
  <span class="frame">
    <StudioCover {item} />
    <span class="tag" aria-hidden="true">
      <i class="dot" style:background={info.dot}></i>
      {info.singular}
      {#if media.type === "project" && media.project.fullscreen}
        <Maximize size={11} />
      {/if}
    </span>
  </span>
  <span class="title">{media.title}<span class="sr-only">, {info.singular.toLowerCase()}</span></span>
  {#if media.type === "project"}
    <span class="sub">{media.project.fullscreen ? m.opens_full_screen() : media.project.summary}</span>
  {:else if media.year}
    <span class="sub">{media.year}</span>
  {/if}
{/snippet}

{#if media.type === "project"}
  <a class="tile" href={media.project.href}>{@render body()}</a>
{:else}
  <button type="button" class="tile" onclick={() => onopen(item)}>{@render body()}</button>
{/if}

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    text-align: left;
    border-radius: var(--radius);
    outline: none;
  }
  .frame {
    position: relative;
    display: block;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 0.45rem;
    transition:
      translate 0.2s ease,
      box-shadow 0.2s ease;
  }
  /* Extra paper at the top so artwork starts below the kind tag. */
  .frame :global(.paper img) {
    padding: 2.4rem 1rem 1rem;
  }
  .tile:hover .frame {
    translate: 0 -2px;
    box-shadow: 0 6px 18px -8px rgb(0 0 0 / 0.25);
  }
  .tile:focus-visible .frame {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }
  .tag {
    position: absolute;
    left: 0.5rem;
    top: 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--foreground);
    background: color-mix(in oklab, var(--background) 86%, transparent);
    backdrop-filter: blur(4px);
  }
  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
  }
  .title {
    font-weight: 600;
    line-height: 1.3;
  }
  .tile:hover .title {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
  .sub {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }
  @media (prefers-reduced-motion: reduce) {
    .frame {
      transition: none;
    }
  }
</style>
