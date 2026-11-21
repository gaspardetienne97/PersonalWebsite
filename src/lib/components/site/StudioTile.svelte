<!--
  One piece on the Studio wall. Every kind gets the same tile: a square picture,
  a title and one line under it (what a project is, or a piece's kind and year),
  led by the kind's colour dot. Projects link to the project; everything else
  opens in the viewer. Under the pointer or the keyboard the tile lifts, the
  picture grows and an "Open" mark shows in the same corner on every kind.
-->
<script lang="ts">
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
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
    <span class="open" aria-hidden="true">{m.studio_open()}<ArrowUpRight size={14} /></span>
  </span>
  <!-- A piece's line names its kind; a project's line is its summary, so the kind is added for screen readers. -->
  <span class="title"
    >{media.title}{#if project}<span class="sr-only">, {info.singular.toLowerCase()}</span>{/if}</span
  >
  <!-- Clamped to one line so every row has one height: the whole text is in the tooltip. -->
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
     border darkens, the picture grows a touch and the "Open" mark shows. */
  .tile:hover,
  .tile:focus-visible {
    translate: 0 -4px;
  }
  .tile:hover .frame,
  .tile:focus-visible .frame {
    border-color: color-mix(in oklab, var(--foreground) 55%, var(--border));
    box-shadow: 0 12px 26px -10px rgb(0 0 0 / 0.4);
  }
  .tile:hover .frame :global(.cover img),
  .tile:focus-visible .frame :global(.cover img),
  .tile:hover .frame :global(.cover .art),
  .tile:focus-visible .frame :global(.cover .art) {
    scale: 1.05;
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
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    font-size: 0.875rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }
  .dot {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
  }
  .line {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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
