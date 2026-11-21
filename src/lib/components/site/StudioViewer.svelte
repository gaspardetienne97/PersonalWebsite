<!--
  The Studio's viewer: a dialog close to the size of the screen, with the pieces
  in a carousel. A picture sits whole on a mat of paper cut to its shape. Its box
  is reserved from the picture's known size and the small copy from the wall
  shows until the large one has loaded, so a half-painted picture is never on
  screen. "Zoom in" (or a click on the picture) shows it large in a box you can
  pan; Escape, the button or another click goes back. The piece on screen plays
  if it's a video or music (the others show their cover, so moving on stops
  playback). Swipe, use the arrow buttons, the arrow keys, or from 640px the
  strip of small pictures under the stage. On a phone the arrows sit under the
  stage, beside the count.
-->
<script lang="ts">
  import { untrack, type ComponentProps } from "svelte";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import { m } from "@repo/i18n/messages.js";
  import { Button } from "@repo/ui/button";
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

  // What is being stepped through: one kind when every piece here is of that
  // kind (projects are links, so a wall of drawings and projects steps through
  // the drawings), otherwise everything.
  const set = $derived(
    item && items.every((other) => other.kind === item.kind)
      ? kindInfo(item.kind).label
      : m.studio_everything(),
  );

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

  // Large pictures that have loaded whole, by address. Until then the small one shows.
  let whole = $state<Record<string, boolean>>({});
  function loaded(img: HTMLImageElement, src: string) {
    const done = () => (whole[src] = true);
    if (img.complete && img.naturalWidth) done();
    else img.addEventListener("load", done, { once: true });
  }

  // Zoom: the picture at up to three times its fitted width (never past its own
  // pixels), in a box that scrolls, laid over the stage so the carousel under
  // it can't be dragged.
  let stage = $state<HTMLElement>();
  let zoomed = $state(false);
  let zoomWidth = $state(0);
  let box = $state<HTMLElement>();
  function zoom(on = !zoomed) {
    if (on) {
      const img = stage?.querySelector<HTMLImageElement>("[data-current] img.large");
      if (!img) return;
      zoomWidth = Math.min(img.naturalWidth || img.clientWidth * 3, img.clientWidth * 3);
    }
    zoomed = on;
  }
  // Moving to another piece leaves the zoom.
  $effect(() => {
    void index;
    zoomed = false;
  });
  // Start in the middle of the picture.
  $effect(() => {
    if (!zoomed || !box) return;
    box.scrollTo((box.scrollWidth - box.clientWidth) / 2, (box.scrollHeight - box.clientHeight) / 2);
  });

  function onkeydown(event: KeyboardEvent) {
    // Leave the arrow keys to a focused player, which uses them to seek.
    if (event.target instanceof HTMLMediaElement || !api) return;
    if (zoomed) {
      // While zoomed the arrow keys pan the picture.
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-80, 0],
        ArrowRight: [80, 0],
        ArrowUp: [0, -80],
        ArrowDown: [0, 80],
      };
      const by = step[event.key];
      if (by) {
        event.preventDefault();
        box?.scrollBy(by[0], by[1]);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      api.scrollPrev();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      api.scrollNext();
    }
  }

  // The strip keeps the current piece in view.
  let strip = $state<HTMLElement>();
  $effect(() => {
    void index;
    const current = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !current) return;
    strip.scrollTo({
      left: Math.max(0, current.offsetLeft - strip.clientWidth / 2 + current.offsetWidth / 2),
    });
  });

  // Dark on the paper in both themes (the kit's outline button is white in the
  // light one), 44px, and on a phone under the stage beside the count.
  const arrow =
    "size-11 border-foreground bg-foreground text-background dark:border-input dark:bg-background dark:text-foreground max-sm:top-full max-sm:mt-3 max-sm:translate-y-0";
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="studio-viewer flex h-[min(42rem,94dvh)] w-[96vw] max-w-none flex-col gap-3 rounded-lg p-4 sm:h-[94dvh] sm:p-5"
    {onkeydown}
    onEscapeKeydown={(event) => {
      // Escape leaves the zoom first, then the viewer.
      if (!zoomed) return;
      event.preventDefault();
      zoomed = false;
    }}
  >
    <Dialog.Header class="min-h-11 justify-center space-y-0.5 pr-40 text-left">
      <Dialog.Title>{item?.media.title ?? ""}</Dialog.Title>
      <Dialog.Description class="text-foreground/80">{details}</Dialog.Description>
    </Dialog.Header>

    {#if item?.media.type === "image"}
      <Button
        variant="outline"
        class="zoom absolute top-3 right-16 h-11 gap-2 px-3"
        aria-pressed={zoomed}
        onclick={() => zoom()}
      >
        {#if zoomed}
          <ZoomOut aria-hidden="true" />{m.viewer_zoom_out()}
        {:else}
          <ZoomIn aria-hidden="true" />{m.viewer_zoom_in()}
        {/if}
      </Button>
    {/if}

    <div class="stage" bind:this={stage}>
      <Carousel.Root {opts} {setApi} class="h-full">
        <Carousel.Content class="h-full">
          {#each items as piece, i (piece.kind + piece.media.id)}
            {@const media = piece.media}
            <Carousel.Item
              class="h-full"
              data-current={i === index ? "" : undefined}
              aria-label={m.viewer_slide_label({ position: i + 1, total: items.length, title: media.title })}
            >
              <div class="slide" class:plain={media.type !== "image"}>
                {#if media.type === "image"}
                  <!-- A click zooms, for the pointer; the Zoom button is the keyboard's way. -->
                  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                  <div
                    class="mat"
                    style:--w={media.width}
                    style:--h={media.height}
                    onclick={() => i === index && zoom(true)}
                  >
                    <div class="pic">
                      <img class="small" src={media.small} alt="" aria-hidden="true" />
                      <img
                        class="large"
                        class:whole={whole[media.large]}
                        src={media.large}
                        alt={media.alt}
                        loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                        use:loaded={media.large}
                      />
                    </div>
                  </div>
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
          <Carousel.Previous class="left-0 {arrow}" />
          <Carousel.Next class="right-0 {arrow}" />
        {/if}
      </Carousel.Root>

      {#if zoomed && item?.media.type === "image"}
        <div class="zoombox" bind:this={box}>
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <img
            src={item.media.large}
            alt={item.media.alt}
            style:width="{zoomWidth}px"
            style:aspect-ratio="{item.media.width} / {item.media.height}"
            onclick={() => zoom(false)}
          />
        </div>
      {/if}
    </div>

    {#if items.length > 1}
      <div class="foot">
        <p class="count" aria-hidden="true">
          {m.viewer_position({ set, position: index + 1, total: items.length })}
        </p>
        <div class="strip" bind:this={strip} role="group" aria-label={m.viewer_pieces()}>
          {#each items as piece, i (piece.kind + piece.media.id)}
            <button
              type="button"
              class="thumb"
              aria-label={piece.media.title}
              aria-current={i === index ? "true" : undefined}
              onclick={() => api?.scrollTo(i)}
            >
              <StudioCover item={piece} size={96} eager />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  /* The stage keeps one size; whatever is in it fits inside. */
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
    container-type: size;
    display: grid;
    place-items: center;
    height: 100%;
  }
  .slide.plain {
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--muted);
  }

  /* The mat: paper cut to the picture with an even margin, the same in both
     themes. The picture's box is the largest of its shape that fits the slide
     (less the arrows' gutters from 640px), so nothing moves when the large
     image arrives. */
  .mat {
    --pad: 0.625rem;
    --gutter: 0rem;
    --max-w: calc(100cqw - 2 * var(--gutter) - 2 * var(--pad));
    --max-h: calc(100cqh - 2 * var(--pad));
    width: calc(min(var(--max-w), var(--max-h) * var(--w) / var(--h)) + 2 * var(--pad));
    padding: var(--pad);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    background: #fff;
    box-shadow: 0 2px 14px -6px rgb(0 0 0 / 0.3);
    cursor: zoom-in;
  }
  @media (width >= 640px) {
    .mat {
      --pad: 1rem;
      --gutter: 3.75rem;
    }
  }
  /* Dimmed a little on the dark page, like the drawings on the wall. */
  :global(.dark) .mat,
  :global(.dark) .zoombox {
    filter: brightness(0.9);
  }
  .pic {
    position: relative;
    aspect-ratio: var(--w) / var(--h);
  }
  .pic img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .large {
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .large.whole {
    opacity: 1;
  }

  .zoombox {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    background: #fff;
  }
  .zoombox img {
    max-width: none;
    margin: auto;
    cursor: zoom-out;
  }

  /* The kit's close button is a small cross at 70% opacity, faint on the white dialog. */
  :global(.studio-viewer [data-dialog-close]) {
    display: grid;
    place-items: center;
    top: 0.75rem;
    right: 0.75rem;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    opacity: 1;
    color: var(--foreground);
  }
  :global(.studio-viewer [data-dialog-close]:hover) {
    background: var(--accent);
  }
  :global(.studio-viewer [data-dialog-close] svg) {
    width: 1.25rem;
    height: 1.25rem;
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

  /* Under the stage: on a phone the count, centred between the arrows. From
     640px the count on the left and the strip of pieces in the middle. */
  .foot {
    display: grid;
    align-items: center;
    min-height: 2.75rem;
  }
  .count {
    text-align: center;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  .strip {
    display: none;
  }
  @media (width >= 640px) {
    .foot {
      grid-template-columns: minmax(max-content, 1fr) minmax(0, auto) 1fr;
      gap: 1rem;
    }
    .count {
      text-align: left;
    }
    .strip {
      display: flex;
      gap: 0.5rem;
      padding: 0.25rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
  }
  .thumb {
    position: relative;
    flex: none;
    width: 3rem;
    height: 3rem;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    outline: 2px solid transparent;
    outline-offset: 1px;
    opacity: 0.8;
  }
  .thumb:hover {
    opacity: 1;
  }
  /* The current piece: a ring, and full strength (never by colour alone). */
  .thumb[aria-current="true"] {
    outline-color: var(--foreground);
    opacity: 1;
  }
  .thumb:focus-visible {
    outline-color: var(--ring);
    outline-offset: 2px;
    opacity: 1;
  }
  .thumb :global(.paper img) {
    padding: 10%;
  }

  @media (prefers-reduced-motion: reduce) {
    .large {
      transition: none;
    }
  }
</style>
