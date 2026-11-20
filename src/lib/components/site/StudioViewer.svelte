<!--
  The Studio's viewer: a dialog of one fixed size whatever is in it, with the
  pieces in a carousel. Images are fitted inside the frame; the piece on screen
  plays if it's a video or music (the others show their cover, so moving on stops
  playback). Swipe, use the arrow buttons, or the arrow keys.
-->
<script lang="ts">
  import { untrack, type ComponentProps } from "svelte";
  import { m } from "#lib/paraglide/messages.js";
  import * as Carousel from "@repo/ui/carousel";
  import * as Dialog from "@repo/ui/dialog";
  import StudioCover from "./StudioCover.svelte";
  import { kindInfo, type StudioItem } from "#lib/content/studio.ts";

  let {
    items,
    open = $bindable(false),
    index = $bindable(0),
  }: { items: StudioItem[]; open?: boolean; index?: number } = $props();

  type CarouselAPI = Parameters<NonNullable<ComponentProps<typeof Carousel.Root>["setApi"]>>[0];
  let api = $state<CarouselAPI>();

  // Read once per opening: changing Embla's options re-initialises it, which
  // would happen on every slide if this followed `index`.
  const opts = $derived({
    loop: items.length > 1,
    startIndex: untrack(() => index),
  });

  const item = $derived(items[index]);
  const details = $derived.by(() => {
    if (!item) return "";
    const { year, note } = item.media;
    return [kindInfo(item.kind).singular, year, note].filter(Boolean).join(", ");
  });

  // The carousel calls this from an effect, so it must not read `index`: that
  // would re-run it on every slide, jumping back and breaking Embla's looping.
  function setApi(next: CarouselAPI | undefined) {
    if (!next || next === api) return;
    api = next;
    untrack(() => {
      // Open on the piece that was clicked, and follow the carousel from there.
      if (next.selectedScrollSnap() !== index) next.scrollTo(index, true);
      next.on("select", () => (index = next.selectedScrollSnap()));
    });
  }

  function onkeydown(event: KeyboardEvent) {
    // Leave the arrow keys to a focused player, which uses them to seek.
    if (event.target instanceof HTMLMediaElement || !api) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      api.scrollPrev();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      api.scrollNext();
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex h-[min(46rem,92dvh)] w-[min(64rem,94vw)] max-w-none flex-col gap-4"
    {onkeydown}
  >
    <Dialog.Header class="pr-8">
      <Dialog.Title>{item?.media.title ?? ""}</Dialog.Title>
      <Dialog.Description>{details}</Dialog.Description>
    </Dialog.Header>

    <div class="stage">
      <Carousel.Root {opts} {setApi} class="h-full">
        <Carousel.Content class="h-full">
          {#each items as piece, i (piece.kind + piece.media.id)}
            {@const media = piece.media}
            <Carousel.Item class="h-full" aria-label={m.viewer_slide_label({ position: i + 1, total: items.length, title: media.title })}>
              <div class="slide" class:paper={media.type === "image"}>
                {#if media.type === "image"}
                  <img src={media.large} alt={media.alt} loading={i === index ? "eager" : "lazy"} />
                {:else if media.type === "video" && i === index && media.youtubeId}
                  <iframe
                    class="player"
                    src="https://www.youtube-nocookie.com/embed/{media.youtubeId}"
                    title={media.title}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowfullscreen
                  ></iframe>
                {:else if media.type === "video" && i === index && media.src}
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video class="player" src={media.src} poster={media.poster} controls></video>
                {:else if media.type === "audio" && i === index}
                  <div class="song">
                    <div class="song-cover"><StudioCover item={piece} /></div>
                    {#if media.embed}
                      <iframe class="h-40 w-full rounded-md" src={media.embed} title={media.title} allow="autoplay; encrypted-media"></iframe>
                    {:else if media.src}
                      <audio class="w-full" src={media.src} controls></audio>
                    {/if}
                  </div>
                {:else}
                  <div class="song-cover"><StudioCover item={piece} /></div>
                {/if}
              </div>
            </Carousel.Item>
          {/each}
        </Carousel.Content>
        {#if items.length > 1}
          <Carousel.Previous class="left-3" />
          <Carousel.Next class="right-3" />
        {/if}
      </Carousel.Root>
    </div>

    {#if items.length > 1}
      <p class="count" aria-hidden="true">{index + 1} / {items.length}</p>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  /* The frame keeps one size; whatever is in it fits inside. */
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .stage :global([data-embla-container]),
  .stage :global([aria-roledescription="carousel"] > .overflow-hidden) {
    height: 100%;
  }
  .slide {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--muted);
  }
  .slide.paper {
    background: #fff;
  }
  /* Pinned to the frame (a percentage max-height inside an auto grid row would
     let a tall drawing overflow and be cropped), then fitted whole inside it.
     The side padding keeps it clear of the arrow buttons. */
  .slide img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 0.5rem 3.5rem;
  }
  .player {
    width: 100%;
    height: 100%;
    background: #000;
  }
  .song {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: min(26rem, 90%);
  }
  .song-cover {
    position: relative;
    width: min(20rem, 70%);
    max-height: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .count {
    text-align: center;
    font-size: 0.875rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
