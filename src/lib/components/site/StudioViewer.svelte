<!--
  The Studio's viewer: a dialog close to the size of the screen (the whole
  screen on a phone), with the pieces in a carousel. A picture sits whole on a
  mat of paper cut to its shape, centred on a tinted stage. Its box is reserved
  from the picture's known size and the small copy from the wall shows until the
  large one has loaded, so a half-painted picture is never on screen. The zoom
  control (or a click on the picture) shows it at twice, then four times its
  size in a box you can drag, scroll or pan with the arrow keys, with a small
  locator in the foot showing which part is in view; Escape, the minus button or
  another click goes back. The piece on screen plays if it's a video or music
  (the others show their cover, so moving on stops playback). Swipe, use the
  arrow buttons, the arrow keys, or the strip of small pictures under the stage.
  The arrows always point their own way; on the first and last piece their tip
  and name say where the loop goes ("Last drawing"). On a phone the arrows sit
  under the strip, beside the count.
-->
<script lang="ts">
  import { untrack, type ComponentProps } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Hand from "@lucide/svelte/icons/hand";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import { m } from "@repo/i18n/messages.js";
  import * as Carousel from "@repo/ui/carousel";
  import * as Dialog from "@repo/ui/dialog";
  import StudioCover from "./StudioCover.svelte";
  import { kindInfo, zoomSteps, type StudioItem } from "#lib/content/studio.ts";

  let {
    items,
    open = $bindable(false),
    index = $bindable(0),
  }: { items: StudioItem[]; open?: boolean; index?: number } = $props();

  type CarouselAPI = Parameters<NonNullable<ComponentProps<typeof Carousel.Root>["setApi"]>>[0];
  let api = $state<CarouselAPI>();

  // Read once per opening: changing Embla's options re-initialises it, which
  // would happen on every slide if this followed `index`.
  // Slides start at the stage's left edge: centred (Embla's default) they sit
  // half a slide gap to the right, which cut a full-width mat at the edge.
  const opts = $derived({
    align: "start" as const,
    loop: items.length > 1,
    startIndex: untrack(() => index),
  });

  const item = $derived(items[index]);
  const image = $derived(item?.media.type === "image" ? item.media : undefined);
  // The line under the title: the kind, then the year and the medium when the
  // piece has them. A note follows as its own sentence.
  const facts = $derived(
    item ? [kindInfo(item.kind).singular, item.media.year, item.media.medium].filter(Boolean).join(", ") : "",
  );

  // What is being stepped through: one kind when every piece here is of that
  // kind (projects are links, so a wall of drawings and projects steps through
  // the drawings), otherwise everything.
  const oneKind = $derived(!!item && items.every((other) => other.kind === item.kind));
  const set = $derived(item && oneKind ? kindInfo(item.kind).label : m.studio_everything());
  // The word the wrapping arrows use: the kind's own ("Last drawing") when one
  // kind is being stepped through, otherwise "piece".
  const setKind = $derived(item && oneKind ? item.kind : "all");

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

  // Zoom: the picture at twice, then four times its fitted width, in a box that
  // scrolls, laid over the stage so the carousel under it can't be dragged. The
  // second step is offered only while it stays near the picture's own pixels.
  // ponytail: two fixed steps; continuous zoom (wheel, pinch) if it is asked for.
  let stage = $state<HTMLElement>();
  /** 0 while the piece shows whole, otherwise the step that is on. */
  let level = $state(0);
  let steps = $state([2]);
  let fitted = $state(0);
  const zoomed = $derived(level > 0);
  const zoomWidth = $derived(fitted * level);
  const canZoomIn = $derived(!zoomed || steps.indexOf(level) < steps.length - 1);
  let box = $state<HTMLElement>();
  let zoomInButton = $state<HTMLElement>();
  // The part of the zoomed picture in view, as fractions of the whole (for the locator).
  let view = $state({ x: 0, y: 0, w: 1, h: 1 });
  // The middle of the view, kept in place from one step to the next.
  let centre = { x: 0.5, y: 0.5 };
  function locate() {
    if (!box) return;
    view = {
      x: box.scrollLeft / box.scrollWidth,
      y: box.scrollTop / box.scrollHeight,
      w: box.clientWidth / box.scrollWidth,
      h: box.clientHeight / box.scrollHeight,
    };
  }
  function zoomTo(next: number) {
    if (next === level) return;
    if (!level) {
      const img = stage?.querySelector<HTMLImageElement>("[data-current] img.large");
      if (!img) return;
      fitted = img.clientWidth;
      steps = zoomSteps(fitted, img.naturalWidth || fitted);
      centre = { x: 0.5, y: 0.5 };
    } else {
      centre = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    }
    level = next;
  }
  const zoomIn = () => zoomTo(steps[steps.indexOf(level) + 1] ?? level);
  const zoomOut = () => zoomTo(steps[steps.indexOf(level) - 1] ?? 0);
  // Moving to another piece leaves the zoom.
  $effect(() => {
    void index;
    level = 0;
  });
  // Each step opens on the middle of what was in view (the picture's own middle at first).
  $effect(() => {
    void level;
    if (!zoomed || !box) return;
    box.scrollTo(
      centre.x * box.scrollWidth - box.clientWidth / 2,
      centre.y * box.scrollHeight - box.clientHeight / 2,
    );
    locate();
  });

  // The "drag to look around" line shows until the visitor first moves a zoomed
  // picture, and for three seconds at most.
  let moved = $state(false);
  let hint = $state(false);
  $effect(() => {
    if (!zoomed) {
      hint = false;
      return;
    }
    hint = true;
    const timer = setTimeout(() => (hint = false), 3000);
    return () => clearTimeout(timer);
  });

  // A mouse drags the zoomed picture (touch and the wheel scroll the box as
  // usual). A press that doesn't move is a click, which leaves the zoom.
  let drag: { x: number; y: number; far: boolean } | undefined;
  let grabbing = $state(false);
  function grab(event: PointerEvent) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, far: false };
    box?.setPointerCapture(event.pointerId);
  }
  function pull(event: PointerEvent) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.far && Math.hypot(dx, dy) < 4) return;
    drag = { x: event.clientX, y: event.clientY, far: true };
    grabbing = moved = true;
    box?.scrollBy(-dx, -dy);
  }
  function release() {
    grabbing = false;
    // Read by the click that follows, then cleared.
    setTimeout(() => (drag = undefined));
  }

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
        moved = true;
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

  // The strip keeps the current piece in the middle, and fades at an edge that
  // has more to show.
  let strip = $state<HTMLElement>();
  let more = $state({ left: false, right: false });
  function edges() {
    if (!strip) return;
    more = {
      left: strip.scrollLeft > 4,
      right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4,
    };
  }
  $effect(() => {
    void index;
    const current = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !current) return;
    strip.scrollTo({
      left: Math.max(0, current.offsetLeft - strip.clientWidth / 2 + current.offsetWidth / 2),
    });
    edges();
  });
</script>

<svelte:window onresize={edges} />

<!-- Previous and next: one filled disc in both themes, the left one always a left
     arrow. The carousel loops, so on the first and last piece the arrow that
     wraps is named for where it goes. The name shows as a tip under the pointer
     and the keyboard (drawn here, since a browser's own tooltip is slow and
     never shows for the keyboard). -->
{#snippet arrow(dir: "prev" | "next")}
  {@const prev = dir === "prev"}
  {@const wraps = prev ? index === 0 : index === items.length - 1}
  {@const label = prev
    ? wraps
      ? m.viewer_to_last({ kind: setKind })
      : m.viewer_previous()
    : wraps
      ? m.viewer_to_first({ kind: setKind })
      : m.viewer_next()}
  <button
    type="button"
    class="arrow {dir}"
    aria-label={label}
    data-tip={label}
    onclick={() => (prev ? api?.scrollPrev() : api?.scrollNext())}
  >
    {#if prev}<ArrowLeft aria-hidden="true" />{:else}<ArrowRight aria-hidden="true" />{/if}
  </button>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content
    class="studio-viewer flex h-dvh w-screen max-w-none flex-col gap-2 rounded-none border-0 p-4 sm:h-[96dvh] sm:w-[96vw] sm:rounded-lg sm:border"
    {onkeydown}
    onOpenAutoFocus={(event) => {
      // Zoom out comes first and has nothing to do yet: start on Zoom in.
      if (!zoomInButton) return;
      event.preventDefault();
      zoomInButton.focus();
    }}
    onEscapeKeydown={(event) => {
      // Escape leaves the zoom first, then the viewer.
      if (!zoomed) return;
      event.preventDefault();
      zoomTo(0);
    }}
  >
    <Dialog.Header class="min-h-12 justify-center space-y-0.5 pr-48 text-left">
      <Dialog.Title class="viewer-title">{item?.media.title ?? ""}</Dialog.Title>
      <Dialog.Description class="text-foreground/80">
        {#if item}<i class="dot" style:background={kindInfo(item.kind).dot} aria-hidden="true"></i>{/if}{facts}{#if item?.media.note}<span class="note">{item.media.note}</span>{/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if image}
      <!-- Zoom out, the step that is on, zoom in. A button at its limit stays
           focusable and says so, instead of dropping the keyboard's place. -->
      <div class="zoomer">
        <button
          type="button"
          aria-label={m.viewer_zoom_out()}
          data-tip={m.viewer_zoom_out()}
          aria-disabled={!zoomed}
          onclick={zoomOut}
        >
          <ZoomOut aria-hidden="true" />
        </button>
        <output class="level" aria-live="polite">{m.viewer_zoom_level({ level: level || 1 })}</output>
        <button
          type="button"
          bind:this={zoomInButton}
          aria-label={m.viewer_zoom_in()}
          data-tip={m.viewer_zoom_in()}
          aria-disabled={!canZoomIn}
          onclick={zoomIn}
        >
          <ZoomIn aria-hidden="true" />
        </button>
      </div>
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
                    onclick={() => i === index && zoomIn()}
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
      </Carousel.Root>

      {#if zoomed && image}
        <!-- A click leaves the zoom, for the pointer; Zoom out and Escape are the keyboard's way. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="zoombox"
          class:grabbing
          bind:this={box}
          onscroll={locate}
          onwheel={() => (moved = true)}
          ontouchmove={() => (moved = true)}
          onpointerdown={grab}
          onpointermove={pull}
          onpointerup={release}
          onpointercancel={release}
          onclick={() => !drag?.far && zoomTo(0)}
        >
          <img
            src={image.large}
            alt={image.alt}
            draggable="false"
            style:width="{zoomWidth}px"
            style:aspect-ratio="{image.width} / {image.height}"
          />
        </div>
        {#if hint && !moved}
          <p class="hint" out:fade={{ duration: prefersReducedMotion.current ? 0 : 300 }}>
            <Hand size={16} aria-hidden="true" />{m.viewer_zoom_hint()}
          </p>
        {/if}
      {/if}

      {#if items.length > 1}
        <div class="side">{@render arrow("prev")}{@render arrow("next")}</div>
      {/if}
    </div>

    {#if items.length > 1 || zoomed}
      <div class="foot">
        {#if items.length > 1}
          <div
            class="strip"
            bind:this={strip}
            onscroll={edges}
            role="group"
            aria-label={m.viewer_pieces()}
            style:--l={more.left ? "2.5rem" : "0px"}
            style:--r={more.right ? "2.5rem" : "0px"}
          >
            {#each items as piece, i (piece.kind + piece.media.id)}
              <button
                type="button"
                class="thumb"
                aria-label={piece.media.title}
                title={piece.media.title}
                aria-current={i === index ? "true" : undefined}
                onclick={() => api?.scrollTo(i)}
              >
                <StudioCover item={piece} size={112} eager />
              </button>
            {/each}
          </div>
        {/if}
        <div class="bar">
          {#if items.length > 1}{@render arrow("prev")}{/if}
          <div class="where">
            {#if zoomed && image}
              <!-- Where the box is looking: the whole picture small, the part in view framed. -->
              <div class="locator" aria-hidden="true" style:--w={image.width} style:--h={image.height}>
                <img src={image.small} alt="" />
                <i
                  style:left="{view.x * 100}%"
                  style:top="{view.y * 100}%"
                  style:width="{view.w * 100}%"
                  style:height="{view.h * 100}%"
                ></i>
              </div>
            {/if}
            {#if items.length > 1}
              <p class="count" aria-hidden="true">
                {m.viewer_position({ set, position: index + 1, total: items.length })}
              </p>
            {/if}
          </div>
          {#if items.length > 1}{@render arrow("next")}{/if}
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  /* A darker scrim than the kit's, so the page behind doesn't show round the edges. */
  :global([data-dialog-overlay]:has(+ .studio-viewer)) {
    background: rgb(0 0 0 / 0.92);
    backdrop-filter: blur(6px);
  }
  :global(.studio-viewer .viewer-title) {
    font-family: var(--font-gm-display);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.4rem;
    border-radius: 50%;
  }
  .note::before {
    content: ". ";
  }

  /* The header's controls: zoom, then close, two bordered boxes 44px tall. */
  .zoomer,
  :global(.studio-viewer [data-dialog-close]) {
    position: absolute;
    top: 1.125rem;
    height: 2.75rem;
    border: 1px solid var(--input);
    border-radius: calc(var(--radius) - 2px);
    color: var(--foreground);
    background: var(--background);
  }
  .zoomer {
    right: 4.25rem;
    display: flex;
    align-items: stretch;
  }
  .zoomer button {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.75rem;
    border-radius: calc(var(--radius) - 3px);
    outline: 2px solid transparent;
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .zoomer button:hover {
      background: var(--accent);
    }
  }
  .zoomer button:focus-visible {
    outline-color: var(--ring);
  }
  .zoomer button[aria-disabled="true"] {
    color: color-mix(in oklab, var(--foreground) 40%, transparent);
    background: transparent;
    cursor: default;
  }
  .zoomer :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }
  .level {
    display: grid;
    place-items: center;
    min-width: 2rem;
    font-family: var(--font-gm-display);
    font-size: 0.9375rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  /* The kit's close button is a small cross at 70% opacity, faint on the white dialog. */
  :global(.studio-viewer [data-dialog-close]) {
    display: grid;
    place-items: center;
    right: 1rem;
    width: 2.75rem;
    opacity: 1;
  }
  :global(.studio-viewer [data-dialog-close]:hover) {
    background: var(--accent);
  }
  :global(.studio-viewer [data-dialog-close] svg) {
    width: 1.25rem;
    height: 1.25rem;
  }

  /* A button's name as a tip, under the pointer and the keyboard. */
  [data-tip]::after {
    content: attr(data-tip);
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.5rem);
    z-index: 5;
    translate: -50% 0;
    padding: 0.35rem 0.65rem;
    border-radius: 0.375rem;
    font-family: var(--font-gm-display);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    color: var(--background);
    background: var(--foreground);
    box-shadow: 0 2px 10px -2px rgb(0 0 0 / 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
  }
  [data-tip]:focus-visible::after {
    opacity: 1;
  }
  @media (hover: hover) {
    [data-tip]:hover::after {
      opacity: 1;
    }
  }
  /* The zoom buttons sit at the top, so their tips open downward. A press
     changes the step shown beside them, so the tip steps aside once pressed
     (an arrow's stays: its name changes when the next press would wrap). */
  .zoomer [data-tip]::after {
    top: calc(100% + 0.5rem);
    bottom: auto;
  }
  .zoomer [data-tip]:focus:not(:focus-visible)::after {
    opacity: 0;
  }
  /* The arrows sit at the edges, so their tips start from their own edge. */
  .arrow.prev::after {
    left: 0;
    translate: none;
  }
  .arrow.next::after {
    left: auto;
    right: 0;
    translate: none;
  }

  /* The stage takes all the room between the header and the foot, on a faint
     tint so the paper stands apart from the panel. The piece is centred in it:
     a wide drawing on a phone is as large as the width allows, with the spare
     room shared above and below. From 640px a gutter each side holds the arrows. */
  .stage {
    --pad: 0.625rem;
    /* A sliver each side on a phone, so the mat's edge is never at the clip. */
    --gutter: 0.375rem;
    --box-gutter: 0rem;
    /* Room round the mat for its shadow, so its edges are always seen. */
    --room: 1rem;
    position: relative;
    flex: 1;
    min-height: 0;
    border-radius: var(--radius);
    background: color-mix(in oklab, var(--muted) 70%, var(--background));
  }
  @media (width >= 640px) {
    .stage {
      --pad: 1rem;
      --gutter: 4.25rem;
      --box-gutter: 4.25rem;
    }
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

  /* The mat: one warm paper cut to the picture with an even margin, the same in
     both themes. The picture's box is the largest of its shape that fits the
     slide in both directions (less the arrows' gutters from 640px), so the whole
     mat is always on screen and nothing moves when the large image arrives. */
  .mat {
    --max-w: calc(100cqw - 2 * var(--gutter) - 2 * var(--pad) - 2px);
    --max-h: calc(100cqh - 2 * var(--pad) - 2px - var(--room));
    box-sizing: content-box;
    width: min(var(--max-w), var(--max-h) * var(--w) / var(--h));
    padding: var(--pad);
    border: 1px solid var(--gm-paper-edge, rgb(0 0 0 / 0.08));
    border-radius: calc(var(--radius) - 2px);
    background: var(--gm-paper, #f5f2ea);
    box-shadow: 0 2px 14px -6px rgb(0 0 0 / 0.3);
    cursor: zoom-in;
  }
  /* The picture's white ground takes the paper's tone, as on the wall. */
  .pic {
    position: relative;
    aspect-ratio: var(--w) / var(--h);
    mix-blend-mode: multiply;
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
    /* From 640px the box stops short of the arrows, which stay on the stage's own colour. */
    inset: 0 var(--box-gutter);
    z-index: 2;
    display: grid;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--gm-paper-edge, rgb(0 0 0 / 0.08));
    border-radius: calc(var(--radius) - 2px);
    background: var(--gm-paper, #f5f2ea);
    cursor: grab;
  }

  .zoombox.grabbing {
    cursor: grabbing;
  }
  .zoombox img {
    max-width: none;
    margin: auto;
    mix-blend-mode: multiply;
    user-select: none;
  }
  .hint {
    position: absolute;
    left: 50%;
    top: 0.75rem;
    z-index: 3;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    color: var(--background);
    background: var(--foreground);
    box-shadow: 0 2px 10px -2px rgb(0 0 0 / 0.4);
    pointer-events: none;
  }

  /* The arrows: filled discs in the text colour with the page colour's glyph,
     the same in both themes. From 640px they sit in the stage's gutters, beside
     the zoom box too; on a phone they flank the count under the strip. */
  .arrow {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    color: var(--background);
    background: var(--foreground);
    outline: 2px solid transparent;
    outline-offset: 2px;
  }
  .arrow :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
    transition: scale 0.15s ease;
  }
  .arrow:hover :global(svg) {
    scale: 1.15;
  }
  .arrow:focus-visible {
    outline-color: var(--ring);
  }
  .side {
    display: none;
  }
  @media (width >= 640px) {
    .side {
      display: contents;
    }
    .side .arrow {
      position: absolute;
      top: 50%;
      z-index: 3;
      translate: 0 -50%;
    }
    .side .prev {
      left: 0.75rem;
    }
    .side .next {
      right: 0.75rem;
    }
    .bar .arrow {
      display: none;
    }
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

  /* Under the stage. On a phone: the strip of pieces, which scrolls from one
     screen edge to the other, then the count between the arrows. From 640px one
     row: the count, then the strip in the middle of the dialog. Zoomed, the
     locator sits beside the count. */
  .foot {
    display: grid;
    gap: 0.375rem;
    min-width: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.75rem;
  }
  .where {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .count {
    font-family: var(--font-gm-display);
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  /* The whole picture, faint, with the part in view framed at full strength. */
  .locator {
    position: relative;
    flex: none;
    width: min(4rem * var(--w) / var(--h), 5.5rem);
    aspect-ratio: var(--w) / var(--h);
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--foreground) 45%, var(--border));
    border-radius: 0.25rem;
    background: var(--gm-paper, #f5f2ea);
  }
  .locator img {
    width: 100%;
    height: 100%;
    mix-blend-mode: multiply;
    opacity: 0.45;
  }
  .locator i {
    position: absolute;
    border: 2px solid var(--gm-blue);
    border-radius: 2px;
    background: color-mix(in oklab, var(--gm-blue) 18%, transparent);
    /* A paper-coloured edge outside the frame, so it stands off the drawing's own lines. */
    box-shadow: 0 0 0 1px var(--gm-paper, #f5f2ea);
  }
  .strip {
    display: flex;
    gap: 0.5rem;
    min-width: 0;
    /* To the dialog's edges, with 16px of room before the first piece and after the last. */
    margin-inline: -1rem;
    padding: 0.25rem 1rem;
    overflow-x: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 var(--l, 0px),
      #000 calc(100% - var(--r, 0px)),
      transparent
    );
  }
  @media (width >= 640px) {
    .foot {
      grid-template-columns: 1fr minmax(0, auto) 1fr;
      align-items: center;
      gap: 1rem;
    }
    .bar {
      grid-area: 1 / 1;
    }
    .where {
      justify-content: flex-end;
    }
    .strip {
      grid-area: 1 / 2;
      margin-inline: 0;
      padding: 0.25rem;
    }
  }
  /* Every piece at full strength, so thin drawings never fade and the paper is
     never greyed; the piece on screen is marked by a ring. */
  .thumb {
    position: relative;
    flex: none;
    width: 3.5rem;
    height: 3.5rem;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    outline: 2px solid transparent;
    outline-offset: 2px;
  }
  .thumb[aria-current="true"] {
    outline-color: var(--foreground);
  }
  .thumb:hover:not([aria-current="true"]) {
    outline-color: color-mix(in oklab, var(--foreground) 45%, transparent);
  }
  .thumb:focus-visible {
    outline-color: var(--ring);
  }
  .thumb :global(.paper img) {
    padding: 7%;
  }

  @media (prefers-reduced-motion: reduce) {
    .large,
    .arrow :global(svg),
    [data-tip]::after {
      transition: none;
    }
    .arrow:hover :global(svg) {
      scale: none;
    }
  }
</style>
