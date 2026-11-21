<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { resolve } from "$app/paths";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { Button } from "@repo/ui/button";
  import * as Carousel from "@repo/ui/carousel";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import StudioCover from "#lib/components/site/StudioCover.svelte";
  import StudioDoors from "#lib/components/site/StudioDoors.svelte";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { name, socials, title } from "#lib/config.ts";
  import { m } from "@repo/i18n/messages.js";
  import { STUDIO, kindInfo, newestByKind, type StudioItem } from "#lib/content/studio.ts";
  import { formatDate } from "#lib/utils.ts";

  let { data } = $props();
  const posts = $derived(data.posts);
  const latestPost = $derived(posts[0]);

  const studio = resolve("/studio");

  type Slide = {
    key: string;
    year: number;
    href: string;
    title: string;
    dot: string;
    /** The kind's name alone ("Project"), for the position marks. */
    kindName: string;
    /** The kind and, when the piece has one, its date. */
    kind: string;
    aside?: string;
    note?: string;
    item?: StudioItem;
    post?: (typeof posts)[number];
  };

  // "Newest": one slide per kind that holds work, the latest post among them,
  // newest first. A piece with no year comes after those that have one.
  const slides = $derived.by(() => {
    const out: Slide[] = newestByKind().map((item) => {
      const info = kindInfo(item.kind);
      const { media } = item;
      const project = media.type === "project" ? media.project : undefined;
      return {
        key: `${item.kind}:${media.id}`,
        year: media.year ?? 0,
        // A project opens itself; anything else opens its kind in the Studio.
        href: project ? project.href : `${studio}?type=${item.kind}`,
        title: media.title,
        dot: info.dot,
        kindName: info.singular,
        kind: media.year ? `${info.singular}, ${media.year}` : info.singular,
        aside: project?.fullscreen ? m.opens_full_screen() : undefined,
        // Every slide has a line under its title: the piece's own note, or how
        // many of its kind the Studio holds.
        note:
          media.note ??
          m.home_reel_in_studio({ kind: info.label, count: STUDIO[item.kind].length }),
        item,
      };
    });
    if (latestPost)
      out.push({
        key: `post:${latestPost.slug}`,
        year: Number.parseInt(latestPost.date, 10) || 0,
        href: resolve("/blog/[slug]", { slug: latestPost.slug }),
        title: latestPost.title,
        dot: "var(--foreground)",
        kindName: m.home_post(),
        kind: m.home_post_dated({ date: formatDate(latestPost.date) }),
        aside: m.reading_time({ minutes: latestPost.readingMinutes }),
        note: latestPost.description,
        post: latestPost,
      });
    return out.sort((a, b) => b.year - a.year);
  });

  type CarouselAPI = Parameters<NonNullable<ComponentProps<typeof Carousel.Root>["setApi"]>>[0];
  let api = $state<CarouselAPI>();
  let selected = $state(0);
  $effect(() => {
    const embla = api;
    if (!embla) return;
    const sync = () => (selected = embla.selectedScrollSnap());
    sync();
    embla.on("select", sync).on("reInit", sync);
    return () => void embla.off("select", sync).off("reInit", sync);
  });

  // The reel only moves when asked, and jumps instead of gliding under reduced motion.
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (index: number) => api?.scrollTo(index, still());
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    show(selected + (event.key === "ArrowLeft" ? -1 : 1));
  }
</script>

<!--
  Home: who this is (the name, the role and a few words, on the left from 900px)
  and the newest work as a reel (one slide per kind that holds work, on the
  right), then one equal door for every kind of thing on the site, Writing
  included, and a closing row of ways on.
-->

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={m.site_description()} />
</svelte:head>

<div class="gm-page home">
  <div class="hero">
    <header class="who">
      <h1 class="gm-title">{name}</h1>
      <p class="gm-lede">{m.home_lede()}</p>
    </header>

    <div class="say">
      <p class="statement gm-clear">{m.home_statement()}</p>
      <a class="gm-link" href={resolve("/about")}>
        {m.home_more_about()}<ArrowRight aria-hidden="true" />
      </a>
    </div>

    <section class="reel" aria-labelledby="newest-heading">
      <h2 id="newest-heading" class="gm-h2">{m.home_newest()}</h2>
      <!-- The slide that peeks in fades out at the reel's edge: on the right while
           there is more that way, on the left at the last slide. -->
      <div
        class="track"
        class:more={selected < slides.length - 1}
        class:last={slides.length > 1 && selected === slides.length - 1}
      >
      <Carousel.Root
        opts={{ align: "start", containScroll: "trimSnaps" }}
        setApi={(next) => (api = next)}
        aria-labelledby="newest-heading"
        {onkeydown}
      >
        <Carousel.Content>
          {#each slides as slide, i (slide.key)}
            <Carousel.Item
              class={slides.length > 1 ? "basis-[86%] sm:basis-[62%] min-[900px]:basis-[78%]" : ""}
              aria-label={m.home_reel_slide({
                position: i + 1,
                total: slides.length,
                title: slide.title,
              })}
            >
              <div class="slide" class:aside={i !== selected}>
                <span class="shot" aria-hidden="true">
                  {#if slide.item}
                    <StudioCover item={slide.item} size={420} eager />
                  {:else if slide.post?.cover}
                    <img src={slide.post.cover} alt="" />
                  {:else if slide.post}
                    <CircuitArt
                      seed={slide.post.slug}
                      colors={[MARKERS.blue, MARKERS.violet, MARKERS.red, MARKERS.yellow]}
                      width={416}
                      height={312}
                    />
                  {/if}
                </span>
                <span class="text">
                  <span class="meta">
                    <span class="kind">
                      <i class="dot" style:background={slide.dot}></i>{slide.kind}
                    </span>
                    {#if slide.aside}<span>{slide.aside}</span>{/if}
                  </span>
                  <a href={slide.href} class="stretch-link name">{slide.title}</a>
                  <span class="note">{slide.note ?? ""}</span>
                </span>
              </div>
            </Carousel.Item>
          {/each}
        </Carousel.Content>
      </Carousel.Root>
      </div>
      {#if slides.length > 1}
        <div class="controls">
          <div class="pips">
            {#each slides as slide, i (slide.key)}
              <button
                type="button"
                class="pip"
                aria-label={m.home_reel_show({ kind: slide.kindName, title: slide.title })}
                aria-current={selected === i ? "true" : undefined}
                onclick={() => show(i)}
              >
                <i></i>
                <span class="pip-tip" aria-hidden="true">{slide.kindName}</span>
              </button>
            {/each}
          </div>
          <button
            type="button"
            class="gm-icon-btn"
            aria-label={m.home_reel_previous()}
            disabled={selected === 0}
            onclick={() => show(selected - 1)}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            class="gm-icon-btn"
            aria-label={m.home_reel_next()}
            disabled={selected === slides.length - 1}
            onclick={() => show(selected + 1)}
          >
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      {/if}
    </section>
  </div>

  <section class="block" aria-labelledby="everything-heading">
    <h2 id="everything-heading" class="gm-h2">{m.home_everything()}</h2>
    <StudioDoors
      writing={{ titles: posts.map((post) => post.title), count: data.postCount ?? posts.length }}
    />
  </section>

  <!-- The way on, once the doors have been seen. -->
  <section class="closing" aria-label={m.home_closing_label()}>
    <p class="thanks gm-clear">{m.home_closing()}</p>
    <div class="ways">
      <a class="gm-link" href={resolve("/about")}>
        {m.home_more_about()}<ArrowRight aria-hidden="true" />
      </a>
      <a class="gm-link" href={studio}>{m.home_open_studio()}<ArrowRight aria-hidden="true" /></a>
    </div>
    {#if socials.length > 0}
      <ul class="socials">
        {#each socials as social (social.href)}
          <li>
            <Button variant="outline" href={social.href} rel="me noopener" class="h-11 px-4">
              <social.icon size={18} aria-hidden="true" />{social.label}
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .home {
    padding-top: clamp(2rem, 5vw, 3rem);
  }

  /* One column on a phone: the name, the statement, then the reel. From 900px
     the words make one column on the left and the reel stands beside them. */
  .hero {
    display: grid;
    gap: 2rem;
  }
  .who,
  .say {
    display: grid;
    gap: 1rem;
    justify-items: start;
    align-content: start;
  }
  @media (width >= 900px) {
    .hero {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto 1fr;
      gap: 2rem 3rem;
    }
    .who,
    .say {
      grid-column: 1;
    }
    .reel {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .who {
      padding-top: 0.5rem;
    }
    .shot {
      aspect-ratio: 4 / 3;
    }
  }
  .statement {
    font-family: var(--font-gm-serif);
    font-size: clamp(1.2rem, 2vw, 1.4rem);
    line-height: 1.5;
    max-width: 40ch;
    text-wrap: pretty;
  }

  /* Newest: a reel of real pieces. A slide is narrower than the reel, so the
     next one shows at the edge and a still reads as something that moves. */
  .reel {
    min-width: 0;
  }
  .reel > h2 {
    margin-bottom: 1rem;
  }
  .track.more {
    mask-image: linear-gradient(to left, transparent, #000 3rem);
  }
  .track.last {
    mask-image: linear-gradient(to right, transparent, #000 3rem);
  }
  .slide {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    color: var(--card-foreground);
    transition: border-color 0.2s ease;
  }
  .slide:hover {
    border-color: color-mix(in oklab, var(--foreground) 45%, var(--border));
  }
  /* The reel clips what leaves it, so the ring is drawn inside the card. */
  .slide:has(.stretch-link:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  /* The picture: 16:9 on a phone, so the reel starts on the first screen under
     the words, and 4:3 beside them from 900px. */
  .shot {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
    background: var(--muted);
  }
  .shot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .shot :global(.art) {
    position: absolute;
    inset: 0;
    height: 100%;
  }
  /* A screenshot is cut to the frame from the bottom, so the app's own top bar
     stays whole. Drawings are never cut. */
  .shot :global(.cover:not(.paper) img) {
    object-position: top;
  }
  .shot :global(.cover img) {
    transition: scale 0.3s ease;
    transform-origin: top;
  }
  .slide:hover .shot :global(.cover img) {
    scale: 1.03;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.9rem 1rem 1rem;
    transition: opacity 0.25s ease;
  }
  /* A slide that only peeks in at the reel's edge shows its picture and no
     words, so no word is ever cut to its first letters. */
  .aside .text {
    opacity: 0;
  }
  .aside:has(.stretch-link:focus-visible) .text {
    opacity: 1;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.1rem 1rem;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .name {
    font-size: 1.35rem;
    font-weight: 650;
    letter-spacing: -0.015em;
    line-height: 1.2;
  }
  /* Two lines on every slide, so the cards and what they say stay even. */
  .note {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: 2.8em;
    font-size: 0.9375rem;
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  /* Under the reel: one pip per slide (the current one long and solid, each
     with its kind's name as a tip), then previous and next. */
  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .pips {
    display: flex;
    margin-right: auto;
  }
  .pip {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.5rem;
    outline: none;
    cursor: pointer;
  }
  .pip i {
    width: 0.75rem;
    height: 0.25rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--foreground) 38%, var(--background));
    transition:
      width 0.2s ease,
      background-color 0.2s ease;
  }
  .pip:hover i {
    background: var(--foreground);
  }
  .pip[aria-current] i {
    width: 2.25rem;
    height: 0.375rem;
    background: var(--foreground);
  }
  .pip:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -4px;
  }
  .controls .gm-icon-btn {
    border-radius: 50%;
    cursor: pointer;
  }
  /* The kind a pip stands for, shown over it on hover and keyboard focus. */
  .pip-tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% - 0.35rem);
    z-index: 5;
    translate: -50% 0;
    padding: 0.3rem 0.6rem;
    border-radius: 0.4rem;
    background: var(--foreground);
    color: var(--background);
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  .pip:first-child .pip-tip {
    left: 0;
    translate: 0 0;
  }
  .pip:focus-visible .pip-tip {
    opacity: 1;
  }
  @media (hover: hover) {
    .pip:hover .pip-tip {
      opacity: 1;
    }
  }
  /* Nothing further that way: the button stays, flat and quiet, with its arrow
     still readable. */
  .controls .gm-icon-btn:disabled,
  .controls .gm-icon-btn:disabled:hover {
    border-color: var(--border);
    background: transparent;
    color: var(--muted-foreground);
    cursor: default;
  }

  .block {
    margin-top: clamp(3rem, 6vw, 3.75rem);
  }
  .block > h2 {
    margin-bottom: 1.25rem;
  }

  /* The closing row: a line, the two ways further in, and where else to find me. */
  .closing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 2rem;
    margin-top: clamp(2.5rem, 5vw, 3.5rem);
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }
  .thanks {
    font-family: var(--font-gm-serif);
    font-size: clamp(1.2rem, 2vw, 1.4rem);
    line-height: 1.4;
  }
  .ways {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.5rem;
    margin-right: auto;
  }
  .socials {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  @media (width < 640px) {
    .closing {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .slide,
    .text,
    .pip-tip,
    .shot :global(.cover img),
    .pip i {
      transition: none;
    }
    .slide:hover .shot :global(.cover img) {
      scale: none;
    }
  }
</style>
