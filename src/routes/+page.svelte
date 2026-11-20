<script lang="ts">
  import { resolve } from "$app/paths";
  import { Button } from "@repo/ui/button";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import StudioCover from "#lib/components/site/StudioCover.svelte";
  import StudioDoors from "#lib/components/site/StudioDoors.svelte";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { description, title } from "#lib/config.ts";
  import { kindInfo, newest } from "#lib/content/studio.ts";
  import { formatDate } from "#lib/utils.ts";

  let { data } = $props();
  const posts = $derived(data.posts);
  const latestPost = $derived(posts[0]);

  const studio = resolve('studio');
  const piece = newest();
  const pieceInfo = piece && kindInfo(piece.kind);
  // A project opens itself; anything else opens its kind in the Studio.
  const pieceHref = piece
    ? piece.media.type === "project"
      ? piece.media.project.href
      : `${studio}?type=${piece.kind}`
    : studio;
</script>

<!--
  Home: a short intro, the newest post and the newest piece side by side, then
  one equal door for every kind of thing on the site, Writing included.
-->

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
</svelte:head>

<div class="gm-page home">
  <header class="intro">
    <div class="flex flex-col gap-4">
      <h1 class="gm-title">Gaspard Michel Etienne</h1>
      <p class="gm-lede">Full-stack software engineer based in Boston.</p>
    </div>
    <div class="flex flex-col items-start gap-3">
      <p class="statement">
        I like owning a feature from end to end: the schema, the API, the interface and the server
        it runs on. This site is where I keep what I make.
      </p>

      <Button
        variant="link"
        href={resolve('about')}
        class="h-auto px-0"
      >More about me</Button>
    </div>
  </header>

  <section class="block" aria-labelledby="newest-heading">
    <h2 id="newest-heading" class="gm-h2">Newest</h2>
    <ul class="newest">
      {#if latestPost}
        <li class="stretch">
          <span class="thumb" aria-hidden="true">
            {#if latestPost.cover}
              <img src={latestPost.cover} alt="" />
            {:else}
              <CircuitArt
                seed={latestPost.slug}
                colors={[MARKERS.blue, MARKERS.violet, MARKERS.red, MARKERS.yellow]}
                width={240}
                height={240}
              />
            {/if}
          </span>
          <span class="text">
            <span class="kind">
              <i class="dot" style:background="var(--foreground)"></i>
              <span>Post, <time datetime={latestPost.date}>{formatDate(latestPost.date)}</time></span>
            </span>
            <a href={resolve("/blog/[slug]", { slug: latestPost.slug })} class="stretch-link name">
              {latestPost.title}
            </a>
            <span class="note">{latestPost.description}</span>
            <span class="note">{latestPost.readingMinutes} min read</span>
          </span>
        </li>
      {/if}
      {#if piece && pieceInfo}
        <li class="stretch">
          <span class="thumb" aria-hidden="true"><StudioCover item={piece} size={240} /></span>
          <span class="text">
            <span class="kind">
              <i class="dot" style:background={pieceInfo.dot}></i>{pieceInfo.singular}{piece.media
                .year
                ? `, ${piece.media.year}`
                : ""}
            </span>
            <a href={pieceHref} class="stretch-link name">{piece.media.title}</a>
            {#if piece.media.note}
              <span class="note">{piece.media.note}</span>
            {/if}
            {#if piece.media.type === "project" && piece.media.project.fullscreen}
              <span class="note">Opens full screen</span>
            {/if}
          </span>
        </li>
      {/if}
    </ul>
  </section>

  <section class="block" aria-labelledby="everything-heading">
    <div class="block-head">
      <h2 id="everything-heading" class="gm-h2">Everything I make</h2>
      <Button variant="link" href={studio} class="h-auto px-0">Open the Studio</Button>
    </div>
    <StudioDoors
      writing={{ titles: posts.map((post) => post.title), count: data.postCount ?? posts.length }}
    />
  </section>
</div>

<style>
  .home {
    padding-top: clamp(3rem, 8vw, 6rem);
  }

  /* The name on the left, the statement on the right, sharing a baseline. */
  .intro {
    display: grid;
    gap: 2rem;
    align-items: end;
  }
  @media (width >= 900px) {
    .intro {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: 4rem;
    }
  }
  .statement {
    font-family: var(--font-gm-serif);
    font-size: clamp(1.2rem, 2vw, 1.4rem);
    line-height: 1.5;
    max-width: 40ch;
    text-wrap: pretty;
  }

  .block {
    margin-top: clamp(3.5rem, 8vw, 5.5rem);
  }
  .block > h2,
  .block-head {
    margin-bottom: 1.25rem;
  }
  .block-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem 2rem;
  }

  /* Newest: the latest post and the latest piece, side by side. */
  .newest {
    display: grid;
    gap: 1rem;
  }
  @media (width >= 800px) {
    .newest {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .newest li {
    position: relative;
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    gap: 1.25rem;
    align-items: center;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    color: var(--card-foreground);
  }
  .thumb {
    position: relative;
    display: block;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    background: var(--muted);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb :global(.art) {
    position: absolute;
    inset: 0;
    height: 100%;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .name {
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .note {
    font-size: 0.9rem;
    color: var(--muted-foreground);
    line-height: 1.4;
  }
</style>
