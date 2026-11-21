<!--
  The picture for one Studio piece, filling its box: the image itself, a video's
  poster, a song's cover, a project's screenshot (with its icon on a corner
  chip), or generated circuit art (with the kind's icon) for anything without
  one. Videos and music get a play mark.
-->
<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import CircuitArt from "./CircuitArt.svelte";
  import { kindInfo, type StudioItem } from "#lib/content/studio.ts";

  let {
    item,
    size = 400,
    eager = false,
  }: {
    item: StudioItem;
    size?: number;
    /** Load the picture at once instead of when it nears the screen. */
    eager?: boolean;
  } = $props();

  const media = $derived(item.media);
  const info = $derived(kindInfo(item.kind));
  const picture = $derived.by(() => {
    if (media.type === "image") return media.small;
    if (media.type === "video")
      return media.poster ?? (media.youtubeId && `https://i.ytimg.com/vi/${media.youtubeId}/hqdefault.jpg`);
    if (media.type === "audio") return media.cover;
    if (media.type === "project") return media.project.cover;
    return undefined;
  });
  const plays = $derived(media.type === "video" || media.type === "audio");
</script>

<span class="cover" class:paper={media.type === "image"}>
  {#if picture}
    <!-- An eager picture is also decoded at once: left to "async", a phone browser
         puts off decoding pictures that are off screen, and a door's cells stay
         blank until they are scrolled to. -->
    <img
      src={picture}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "sync" : "async"}
    />
    {#if media.type === "project"}
      <span class="chip" aria-hidden="true"><media.project.icon size={16} /></span>
    {/if}
  {:else if media.type === "project"}
    <CircuitArt
      seed={media.id}
      colors={media.project.colors}
      icon={media.project.icon}
      width={size}
      height={size}
    />
  {:else}
    <CircuitArt seed={media.id} colors={info.colors} icon={info.icon} width={size} height={size} />
  {/if}
  {#if plays}
    <span class="play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
  {/if}
</span>

<style>
  .cover {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    background: var(--muted);
  }
  /* Drawings, doodles, paintings and photos sit on one warm paper in both themes,
     with a hairline edge. Nothing is dimmed on the dark page, so a piece keeps
     its own lights and darks. */
  .paper {
    isolation: isolate;
    background: var(--gm-paper, #f5f2ea);
    box-shadow: inset 0 0 0 1px var(--gm-paper-edge, rgb(0 0 0 / 0.08));
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* Artwork is shown whole, never cropped: it fills about 86% of the square,
     and its white ground takes the paper's tone so no sheet edge shows. Posters
     and covers still fill their box. */
  .paper img {
    object-fit: contain;
    padding: 7%;
    mix-blend-mode: multiply;
  }
  .cover :global(.art) {
    position: absolute;
    inset: 0;
    height: 100%;
  }
  /* A project's icon, in the corner of its screenshot. */
  .chip {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.5rem;
    color: var(--foreground);
    background: color-mix(in oklab, var(--background) 88%, transparent);
    backdrop-filter: blur(4px);
  }
  .play {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding-left: 2px;
    border-radius: 50%;
    color: var(--foreground);
    background: color-mix(in oklab, var(--background) 88%, transparent);
    box-shadow: 0 1px 6px rgb(0 0 0 / 0.18);
  }
</style>
