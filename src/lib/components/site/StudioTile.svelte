<!--
  One piece on the Studio wall. Every kind gets the same square tile with a small
  tag saying what it is. Projects link to the project; everything else opens in
  the viewer.
-->
<script lang="ts">
  import Maximize from "@lucide/svelte/icons/maximize-2";
  import StudioCover from "./StudioCover.svelte";
  import { kindInfo, type StudioItem } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

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
  <!-- One line under every title: what a project is, or the year of a piece. The
       full-screen note is the arrows in the tag, and words for screen readers. -->
  {#if media.type === "project"}
    <span class="sub">
      {media.project.summary}{#if media.project.fullscreen}<span class="sr-only"> {m.opens_full_screen()}</span>{/if}
    </span>
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
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
  /* Extra paper at the top so artwork starts below the kind tag. */
  .frame :global(.paper img) {
    padding: 2.4rem 1rem 1rem;
  }
  .frame :global(.cover img) {
    transition: scale 0.3s ease;
  }
  /* The whole tile answers the pointer and the keyboard: the frame lifts, its
     border darkens and the picture grows a touch. */
  .tile:hover .frame,
  .tile:focus-visible .frame {
    translate: 0 -3px;
    border-color: color-mix(in oklab, var(--foreground) 55%, var(--border));
    box-shadow: 0 10px 24px -10px rgb(0 0 0 / 0.35);
  }
  .tile:hover .frame :global(.cover img),
  .tile:focus-visible .frame :global(.cover img) {
    scale: 1.04;
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
    .frame,
    .frame :global(.cover img) {
      transition: none;
    }
    .tile:hover .frame,
    .tile:focus-visible .frame {
      translate: none;
    }
    .tile:hover .frame :global(.cover img),
    .tile:focus-visible .frame :global(.cover img) {
      scale: none;
    }
  }
</style>
