<!--
  The picture for one Studio piece, filling its box: the image itself, a video's
  poster, a song's cover, or generated circuit art (with the kind's icon) for
  anything without one. Videos and music get a play mark.
-->
<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import CircuitArt from "./CircuitArt.svelte";
  import { kindInfo, type StudioItem } from "#lib/content/studio.ts";

  let { item, size = 400 }: { item: StudioItem; size?: number } = $props();

  const media = $derived(item.media);
  const info = $derived(kindInfo(item.kind));
  const picture = $derived.by(() => {
    if (media.type === "image") return media.small;
    if (media.type === "video")
      return media.poster ?? (media.youtubeId && `https://i.ytimg.com/vi/${media.youtubeId}/hqdefault.jpg`);
    if (media.type === "audio") return media.cover;
    return undefined;
  });
  const plays = $derived(media.type === "video" || media.type === "audio");
</script>

<span class="cover" class:paper={media.type === "image"}>
  {#if picture}
    <img src={picture} alt="" loading="lazy" decoding="async" />
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
  /* Drawings, doodles, paintings and photos sit on white whatever the theme,
     like paper or a print's border. */
  .paper {
    background: #fff;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* Artwork is shown whole, never cropped: it sits inside the square with a
     margin of paper around it. Posters and covers still fill their box. */
  .paper img {
    object-fit: contain;
    padding: 8%;
  }
  .cover :global(.art) {
    position: absolute;
    inset: 0;
    height: 100%;
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
