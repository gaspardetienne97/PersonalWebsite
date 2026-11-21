<!--
  One piece on the Studio wall. Every kind gets the same tile: a square picture,
  a title and up to two lines under it (what a project is, or a piece's kind and
  year), led by the kind's colour dot. Projects link to the project; everything
  else opens in the viewer. Under the pointer or the keyboard the tile lifts
  onto a shadow, its frame takes the text colour, the picture grows, the whole
  line shows and a mark in the corner says what a press does: "Open" for a
  project, "View" for a piece.
-->
<script lang="ts">
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
  import Maximize from "@lucide/svelte/icons/maximize-2";
  import StudioCover from "./StudioCover.svelte";
  import { kindInfo, type StudioItem } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

  let { item, onopen }: { item: StudioItem; onopen: (item: StudioItem) => void } = $props();

  const media = $derived(item.media);
  const info = $derived(kindInfo(item.kind));
  const project = $derived(media.type === "project" ? media.project : undefined);
  const line = $derived(
    project ? project.summary : [info.singular, media.year].filter(Boolean).join(", "),
  );
</script>

{#snippet body()}
  <span class="frame" class:pans={project}>
    <StudioCover {item} />
    <span class="open" aria-hidden="true">
      {#if project}{m.studio_open()}<ArrowUpRight size={14} />{:else}{m.studio_view()}<Maximize size={13} />{/if}
    </span>
  </span>
  <!-- A piece's line names its kind; a project's line is its summary, so the kind is added for screen readers. -->
  <span class="title"
    >{media.title}{#if project}<span class="sr-only">, {info.singular.toLowerCase()}</span>{/if}</span
  >
  <!-- Two lines, and room kept for two on every tile, so rows keep one height.
       The whole text shows under the pointer or the keyboard, and is in the tooltip. -->
  <span class="sub" title={line}>
    <i class="dot" style:background={info.dot} aria-hidden="true"></i>
    <span class="line">{line}</span>
    <!-- Outside the clamped line: a hidden span after its cut-off text would sit past the tile's edge. -->
    {#if project?.fullscreen}<span class="sr-only">{m.opens_full_screen()}</span>{/if}
  </span>
{/snippet}

{#if project}
  <a class="tile" href={project.href}>{@render body()}</a>
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
    transition: translate 0.2s ease;
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
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
  .frame :global(.cover img),
  .frame :global(.cover .art) {
    transition: scale 0.3s ease;
  }
  /* The whole tile answers the pointer and the keyboard: it lifts, the frame's
     border takes the text colour over a shadow, the picture grows and the mark shows. */
  .tile:hover,
  .tile:focus-visible {
    translate: 0 -4px;
  }
  .tile:hover .frame,
  .tile:focus-visible .frame {
    border-color: var(--foreground);
    box-shadow:
      0 0 0 1px var(--foreground),
      0 18px 30px -12px rgb(0 0 0 / 0.5);
  }
  /* On the dark page a dark shadow can't be seen: the lift is a soft light under the frame. */
  :global(.dark) .tile:hover .frame,
  :global(.dark) .tile:focus-visible .frame {
    box-shadow:
      0 0 0 1px var(--foreground),
      0 16px 36px -10px color-mix(in oklab, var(--foreground) 45%, transparent);
  }
  .tile:hover .frame :global(.cover img),
  .tile:focus-visible .frame :global(.cover img),
  .tile:hover .frame :global(.cover .art),
  .tile:focus-visible .frame :global(.cover .art) {
    scale: 1.08;
  }
  /* A drawing comes close to its frame already, so it grows less and stays whole. */
  .tile:hover .frame :global(.cover.paper img),
  .tile:focus-visible .frame :global(.cover.paper img) {
    scale: 1.04;
  }
  /* A project's cover is larger than its frame while hovered and drifts slowly
     from side to side, so the screenshot reads as something live. */
  .tile:hover .pans :global(.cover img),
  .tile:focus-visible .pans :global(.cover img) {
    scale: 1.12;
    animation: pan 7s ease-in-out 0.3s infinite alternate;
  }
  @keyframes pan {
    from {
      translate: 0 0;
    }
    33% {
      translate: -4% -2%;
    }
    to {
      translate: 4% 2%;
    }
  }
  .tile:focus-visible .frame {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }
  .open {
    position: absolute;
    right: 0.5rem;
    top: 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.25rem 0.5rem 0.25rem 0.65rem;
    border-radius: 999px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--background);
    background: var(--foreground);
    box-shadow: 0 2px 8px -2px rgb(0 0 0 / 0.4);
    opacity: 0;
    translate: 0 -4px;
    transition:
      opacity 0.15s ease,
      translate 0.15s ease;
  }
  .tile:hover .open,
  .tile:focus-visible .open {
    opacity: 1;
    translate: none;
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
    --lh: 1.35em;
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    min-width: 0;
    /* Room for two lines on every tile. */
    min-height: calc(2 * var(--lh));
    font-size: 0.875rem;
    color: var(--muted-foreground);
    line-height: var(--lh);
  }
  .dot {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    /* Centred on the first line. */
    margin-top: calc((var(--lh) - 0.45rem) / 2);
    border-radius: 50%;
  }
  .line {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  /* A phone's two columns are narrow and have no pointer to show the rest, so a
     project's line runs as long as it needs there (four lines in French). */
  @media (width < 640px) {
    .line {
      -webkit-line-clamp: 4;
      line-clamp: 4;
    }
  }
  /* Under the pointer or the keyboard the whole line shows. The tile keeps its
     height (the text runs into the gap under it), so nothing on the wall moves. */
  @media (width >= 640px) {
    .sub {
      height: calc(2 * var(--lh));
    }
    .tile:hover .line,
    .tile:focus-visible .line {
      position: relative;
      z-index: 1;
      overflow: visible;
      -webkit-line-clamp: unset;
      line-clamp: unset;
      color: var(--foreground);
      background: var(--background);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile,
    .frame,
    .open,
    .frame :global(.cover img),
    .frame :global(.cover .art) {
      transition: none;
    }
    .tile:hover,
    .tile:focus-visible,
    .open {
      translate: none;
    }
    .tile:hover .frame :global(.cover img),
    .tile:focus-visible .frame :global(.cover img),
    .tile:hover .frame :global(.cover .art),
    .tile:focus-visible .frame :global(.cover .art) {
      scale: none;
      animation: none;
    }
  }
</style>
