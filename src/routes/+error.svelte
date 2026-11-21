<!--
  The site's error page, drawn inside the root layout (header and footer included)
  for a missing address or a page that failed to load, in any section. One layout
  for every case: the status drawn as a broken connection from the logo, what
  happened, the address that was asked for (and the one it most likely meant),
  ways on, and three pieces from the Studio to look at instead. A missing post
  also gets the list of posts and the newest ones.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { Button } from "@repo/ui/button";
  import LogoMark from "#lib/components/site/LogoMark.svelte";
  import StudioCover from "#lib/components/site/StudioCover.svelte";
  import { name, nav } from "#lib/config.ts";
  import { projects } from "#lib/content/projects.ts";
  import { everything, kindInfo, type StudioItem } from "#lib/content/studio.ts";
  import { nearest } from "#lib/nearest.ts";
  import { getPosts } from "#lib/posts.ts";
  import { formatDate } from "#lib/utils.ts";
  import { m } from "@repo/i18n/messages.js";

  const missing = $derived(page.status === 404);
  const title = $derived(missing ? m.error_not_found_title() : m.error_other_title());
  const path = $derived(page.url.pathname);
  const post = $derived(missing && path.startsWith("/blog/"));
  const recent = $derived(post ? getPosts().slice(0, 3) : []);
  // A missing post leads with the list of posts, which stands in for the nav's own link to it.
  const links = $derived(post ? nav.filter((link) => link.href !== "/blog") : nav);

  // Every address a visitor could have meant: the pages, the projects and the posts.
  const guess = $derived(
    missing
      ? nearest(path, [
          ...nav.map((link) => link.href).filter((href) => href !== "/"),
          ...projects.map((project) => project.href).filter((href) => !href.includes("#")),
          ...getPosts().map((entry) => `/blog/${entry.slug}`),
        ])
      : null,
  );
  // Built here from the site's own addresses, never from what the visitor typed.
  const guessLink = $derived(guess && `<a class="gm-inline-link" href="${guess}">${guess}</a>`);

  // Three pieces to look at instead: the first of each kind that holds work.
  const pieces = everything().slice(0, 3);
  const pieceHref = (item: StudioItem) =>
    item.media.type === "project"
      ? item.media.project.href
      : `${resolve("/studio")}?type=${item.kind}`;

  // The drawing answers a press as well as the pointer, so a phone can close it too.
  let joined = $state(false);
</script>

<svelte:head>
  <title>{title} | {name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page error">
  <div class="what">
    <p class="status">
      <span class="sr-only">{m.error_status({ status: page.status })}</span>
      <!-- The logo and the number, with the trace between them broken. Under the
           pointer, the keyboard or a press the gap closes and the trace lights. -->
      <button
        type="button"
        class="broken"
        aria-pressed={joined}
        aria-label={m.error_join()}
        onclick={() => (joined = !joined)}
      >
        <LogoMark size={72} class="mark" />
        <svg class="gap" viewBox="0 0 120 40" aria-hidden="true">
          <path class="from" d="M2 20H30L38 10H44" />
          <path class="to" d="M118 20H90L82 30H76" />
          <path class="bridge" d="M44 10H52L68 30H76" pathLength="1" />
          <circle class="from via" cx="44" cy="10" r="3.4" />
          <circle class="to via" cx="76" cy="30" r="3.4" />
          <g class="spark">
            <path d="M60 13l1.6 5.4 5.4 1.6-5.4 1.6L60 27l-1.6-5.4-5.4-1.6 5.4-1.6z" />
            <path class="rays" d="M53 11l2 2.5M67 29l-2-2.5M68 12l-2.5 2M52 28l2.5-2" />
          </g>
        </svg>
        <span class="number">{page.status}</span>
      </button>
    </p>
    <h1 class="gm-title">{title}</h1>
    <p class="gm-lede">{missing ? m.error_not_found_body() : m.error_other_body()}</p>
    {#if missing}
      <p class="address gm-clear"><code>{path}</code></p>
    {/if}
    {#if guessLink}
      <p class="guess gm-clear">{@html m.error_did_you_mean({ link: guessLink })}</p>
    {/if}
    <ul class="links">
      {#if post}
        <li>
          <Button href={resolve("/blog")} class="h-11 w-full text-base">{m.error_all_posts()}</Button>
        </li>
      {/if}
      {#each links as link, i (link.href)}
        <li>
          <Button
            variant={i === 0 && !post ? "default" : "outline"}
            href={resolve(link.href)}
            class="h-11 w-full text-base"
          >
            {link.label}
          </Button>
        </li>
      {/each}
    </ul>
    {#if recent.length > 0}
      <section class="recent" aria-labelledby="recent-posts">
        <h2 id="recent-posts">{m.error_recent_posts()}</h2>
        <ul class="gm-clear">
          {#each recent as entry (entry.slug)}
            <li>
              <a href={resolve("/blog/[slug]", { slug: entry.slug })}>
                <span class="post-title">{entry.title}</span>
                <time datetime={entry.date}>{formatDate(entry.date)}</time>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  {#if pieces.length > 0}
    <aside class="look" aria-labelledby="look-title">
      <h2 id="look-title">{m.error_look()}</h2>
      <ul>
        {#each pieces as item (item.media.id)}
          <li>
            <a href={pieceHref(item)}>
              <span class="frame"><StudioCover {item} eager /></span>
              <span class="piece-title">{item.media.title}</span>
              <span class="piece-kind">
                <i style:background={kindInfo(item.kind).dot} aria-hidden="true"></i>
                {kindInfo(item.kind).singular}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </aside>
  {/if}
</div>

<style>
  /* The page has the first screen to itself, its block in the middle: what went
     wrong on the left, something to look at on the right. The footer starts
     below the fold. */
  .error {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: 3rem;
    min-height: calc(100svh - 4rem);
    padding-block: clamp(2rem, 6vw, 3rem);
  }
  @media (width >= 960px) {
    .error {
      grid-template-columns: minmax(0, 1fr) minmax(0, 24rem);
      align-items: center;
      gap: clamp(2.5rem, 6vw, 5rem);
    }
  }
  .what {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
    min-width: 0;
  }

  .broken {
    display: flex;
    align-items: center;
    gap: clamp(0.4rem, 1.5vw, 0.9rem);
    border-radius: var(--radius);
  }
  .broken:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 6px;
  }
  .broken :global(.mark) {
    flex: none;
    width: clamp(3.25rem, 9vw, 4.5rem);
    height: auto;
  }
  .gap {
    flex: none;
    width: clamp(7rem, 22vw, 11.25rem);
    aspect-ratio: 120 / 40;
    overflow: visible;
  }
  .gap path {
    fill: none;
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .gap .from {
    stroke: var(--gm-red);
    --ink: var(--gm-red);
  }
  .gap .to {
    stroke: var(--gm-blue);
    --ink: var(--gm-blue);
  }
  .gap .via {
    fill: var(--background);
    stroke-width: 1.8;
    transition: fill 0.2s;
  }
  /* The missing stretch. It draws across when the gap closes. */
  .gap .bridge {
    stroke: var(--gm-violet);
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    transition: stroke-dashoffset 0.35s ease-out;
  }
  /* A spark sits in the break, and flickers once as the page arrives. */
  .spark {
    transform-box: fill-box;
    transform-origin: center;
    transition: opacity 0.15s;
    animation: spark 0.9s ease-out 0.5s backwards;
  }
  .spark path {
    fill: var(--gm-yellow);
    stroke: none;
  }
  .spark .rays {
    fill: none;
    stroke: var(--gm-yellow);
    stroke-width: 1.8;
  }
  @keyframes spark {
    0%,
    30%,
    60% {
      opacity: 0;
      transform: scale(0.4);
    }
    15%,
    45% {
      opacity: 1;
      transform: scale(1.5);
    }
  }
  .broken:is(:hover, :focus-visible, [aria-pressed="true"]) .bridge {
    stroke-dashoffset: 0;
  }
  .broken:is(:hover, :focus-visible, [aria-pressed="true"]) .spark {
    opacity: 0;
  }
  .broken:is(:hover, :focus-visible, [aria-pressed="true"]) .via {
    fill: var(--ink);
  }
  .broken:is(:hover, :focus-visible, [aria-pressed="true"]) .gap {
    filter: drop-shadow(0 0 5px color-mix(in oklab, var(--gm-violet) 70%, transparent));
  }
  @media (prefers-reduced-motion: reduce) {
    .spark {
      animation: none;
    }
    .spark,
    .gap .via,
    .gap .bridge {
      transition: none;
    }
  }
  /* The status in the display face, filled with the logo's ring. */
  .number {
    font-family: var(--font-gm-display);
    font-weight: 750;
    font-size: clamp(4rem, 13vw, 7.5rem);
    line-height: 1;
    letter-spacing: -0.04em;
    background: var(--gm-brand);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }
  .error .gm-lede {
    color: var(--foreground);
  }
  .address {
    max-width: 100%;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    padding: 0.4rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.95rem;
    overflow-wrap: anywhere;
  }
  .guess {
    font-size: 1.15rem;
    font-weight: 550;
  }
  .guess :global(a) {
    display: inline-block;
    padding-block: 0.6rem;
    font-family: var(--font-mono);
    font-weight: 500;
  }
  .guess :global(a:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
  /* Four ways on: a row where there is room, two by two on a phone. */
  .links {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    width: 100%;
    margin-top: 0.5rem;
  }
  @media (width >= 640px) {
    .links {
      display: flex;
      flex-wrap: wrap;
      width: auto;
    }
  }

  /* The newest posts: one row each, the whole row a link, its date beside the title. */
  .recent {
    width: 100%;
    max-width: 34rem;
    margin-top: 1rem;
  }
  .recent h2,
  .look h2 {
    font-size: 1.05rem;
    font-weight: 650;
    margin-bottom: 0.5rem;
  }
  .recent ul {
    border-top: 1px solid var(--border);
  }
  .recent li {
    border-bottom: 1px solid var(--border);
  }
  .recent a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 3rem;
    padding-block: 0.4rem;
    font-size: 1.1rem;
    font-weight: 550;
  }
  .recent time {
    font-size: 0.9375rem;
    font-weight: 400;
    color: var(--muted-foreground);
    white-space: nowrap;
  }
  .recent a :global(svg) {
    color: var(--muted-foreground);
    transition: transform 0.15s;
  }
  .recent a:hover .post-title {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .recent a:hover :global(svg) {
    transform: translateX(0.2rem);
    color: var(--foreground);
  }
  .recent a:focus-visible,
  .look a:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
    border-radius: 4px;
  }

  /* Three pieces from the Studio: one large, two beside each other under it. */
  .look ul {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .look li:first-child {
    grid-column: 1 / -1;
  }
  .look a {
    display: grid;
    gap: 0.1rem;
  }
  .frame {
    position: relative;
    display: block;
    aspect-ratio: 1;
    margin-bottom: 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: translate 0.2s ease;
  }
  .look li:first-child .frame {
    aspect-ratio: 4 / 3;
  }
  .look a:hover .frame {
    translate: 0 -3px;
    border-color: color-mix(in oklab, var(--foreground) 35%, var(--border));
  }
  .look a:hover .piece-title {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .piece-title {
    font-weight: 650;
    line-height: 1.25;
  }
  .piece-kind {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .piece-kind i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  @media (prefers-reduced-motion: reduce) {
    .frame,
    .recent a :global(svg) {
      transition: none;
    }
    .look a:hover .frame {
      translate: none;
    }
    .recent a:hover :global(svg) {
      transform: none;
    }
  }
</style>
