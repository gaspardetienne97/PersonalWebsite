<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { resolve } from "$app/paths";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import FileText from "@lucide/svelte/icons/file-text";
  import * as Card from "@repo/ui/card";
  import * as ToggleGroup from "@repo/ui/toggle-group";
  import { Badge } from "@repo/ui/badge";
  import { Empty } from "@repo/ui/empty";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { name } from "#lib/config.ts";
  import { categoryLabel, parseDate } from "#lib/posts.ts";
  import { formatDate } from "#lib/utils.ts";

  let { data } = $props();

  // A category every post carries would filter nothing out, so only the others are offered.
  const categories = $derived(
    [...new Set(data.posts.flatMap((post) => post.categories))]
      .filter((name) => data.posts.some((post) => !post.categories.includes(name)))
      .sort(),
  );
  let category = $state("all");
  const visible = $derived(
    category === "all"
      ? data.posts
      : data.posts.filter((post) => post.categories.includes(category)),
  );
  const [featured, ...rest] = $derived(visible);
  // Year headings only earn their place once the list is long enough to need
  // them. A short list is one group under a plain heading.
  const groups = $derived.by(() => {
    if (rest.length === 0) return [];
    if (visible.length < 4) return [{ id: "earlier", title: m.blog_earlier(), posts: rest }];
    const byYear = new Map<number, typeof rest>();
    for (const post of rest) {
      const year = parseDate(post.date).getFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), post]);
    }
    return [...byYear]
      .sort(([a], [b]) => b - a)
      .map(([year, posts]) => ({ id: `year-${year}`, title: String(year), posts }));
  });
  const coverColors = [MARKERS.blue, MARKERS.violet, MARKERS.red, MARKERS.yellow];
</script>

<svelte:head>
  <title>{m.kind_writing()} | {name}</title>
  <meta name="description" content={m.blog_meta()} />
</svelte:head>

<div class="gm-page blog">
  <header class="flex flex-col gap-5">
    <h1 class="gm-title">{m.kind_writing()}</h1>
    <p class="gm-lede">{m.blog_lede()}</p>
  </header>

  {#if categories.length > 0}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      bind:value={() => category, (value) => value && (category = value)}
      class="filters"
      aria-label={m.blog_filter()}
    >
      <ToggleGroup.Item value="all">{m.blog_all()}</ToggleGroup.Item>
      {#each categories as name (name)}
        <ToggleGroup.Item value={name} class="capitalize">{categoryLabel(name)}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  {/if}

  {#if !featured}
    <Empty class="mt-12" title={m.blog_empty_title()} description={m.blog_empty_body()}>
      {#snippet icon()}<FileText />{/snippet}
    </Empty>
  {:else}
    <Card.Root class="stretch featured relative gap-0 overflow-hidden py-0">
      <div class="cover">
        {#if featured.cover}
          <img src={featured.cover} alt="" />
        {:else}
          <CircuitArt seed={featured.slug} colors={coverColors} width={416} height={224} />
        {/if}
      </div>
      <div class="lead">
        <p class="when">
          <time datetime={featured.date}>
            {m.blog_latest({ date: formatDate(featured.date, "long") })}
          </time>
          <span aria-hidden="true">·</span>
          <span>{m.reading_time({ minutes: featured.readingMinutes })}</span>
        </p>
        <h2 class="lead-title">
          <a href={resolve("/blog/[slug]", { slug: featured.slug })} class="stretch-link">
            {featured.title}
          </a>
        </h2>
        <p class="summary">{featured.description}</p>
        <div class="foot">
          <span class="chips">
            {#each featured.categories as name (name)}
              <Badge variant="secondary" class="chip capitalize">{categoryLabel(name)}</Badge>
            {/each}
          </span>
          <!-- The title is the link; this repeats it for the eye only. -->
          <span class="gm-link" aria-hidden="true">
            {m.blog_read()}<ArrowRight />
          </span>
        </div>
      </div>
    </Card.Root>

    {#each groups as group (group.id)}
      <section class="year" aria-labelledby={group.id}>
        <h2 id={group.id} class="gm-h2 gm-clear">{group.title}</h2>
        <ul class="gm-clear">
          {#each group.posts as post (post.slug)}
            <li>
              <a href={resolve("/blog/[slug]", { slug: post.slug })} class="row">
                <time datetime={post.date} class="date">{formatDate(post.date)}</time>
                <span class="text">
                  <span class="title">{post.title}</span>
                  <span class="summary">{post.description}</span>
                  <span class="chips">
                    {#each post.categories as name (name)}
                      <Badge variant="secondary" class="chip capitalize">
                        {categoryLabel(name)}
                      </Badge>
                    {/each}
                    <span class="minutes">{m.reading_time({ minutes: post.readingMinutes })}</span>
                  </span>
                </span>
                <span class="go" aria-hidden="true"><ArrowRight size={20} /></span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .blog {
    padding-top: clamp(3rem, 8vw, 6rem);
  }

  /* The topic filter: a filled pill marks the choice, and each one is a full
     touch target on a phone. */
  :global(.blog .filters) {
    flex-wrap: wrap;
    margin-top: 2.5rem;
    background: var(--background);
  }
  :global(.blog .filters [data-slot="toggle-group-item"]) {
    padding-inline: 1rem;
  }
  :global(.blog .filters [data-slot="toggle-group-item"][data-state="on"]) {
    background: var(--foreground);
    color: var(--background);
  }
  @media (width < 640px), (pointer: coarse) {
    :global(.blog .filters [data-slot="toggle-group-item"]) {
      min-height: 44px;
      font-size: 1rem;
    }
  }

  /* The newest post: a short cover beside its title, summary and facts. */
  :global(.blog .featured) {
    display: grid;
    margin-top: 2.5rem;
  }
  .cover {
    overflow: hidden;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .cover img {
    display: block;
    width: 100%;
    height: 100%;
    max-height: 14rem;
    object-fit: cover;
  }
  .lead {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.25rem 1.25rem 1.1rem;
  }
  @media (width >= 760px) {
    :global(.blog .featured) {
      grid-template-columns: 26rem minmax(0, 1fr);
    }
    .cover {
      border-bottom: 0;
      border-right: 1px solid var(--border);
    }
    .lead {
      padding: 1.5rem 1.75rem 1.25rem;
    }
  }
  .when {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.5rem;
    font-size: 0.9375rem;
    color: var(--muted-foreground);
  }
  .lead-title {
    font-size: clamp(1.6rem, 3vw, 2rem);
    font-weight: 650;
    line-height: 1.12;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .summary {
    font-family: var(--font-gm-serif);
    font-size: 1.125rem;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .lead .summary {
    max-width: 52ch;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: auto;
    padding-top: 0.75rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  :global(.blog .chip) {
    font-size: 0.8125rem;
  }
  :global(.blog .featured:hover) {
    border-color: color-mix(in oklab, var(--foreground) 35%, var(--border));
  }

  /* Older posts. Each row is one link: the whole row tints and its arrow steps
     forward under the pointer or the keyboard. */
  .year {
    margin-top: clamp(3rem, 7vw, 4.5rem);
  }
  .year h2 {
    width: fit-content;
  }
  .year ul {
    margin-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .year li {
    border-bottom: 1px solid var(--border);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.4rem 1.5rem;
    margin-inline: -0.75rem;
    padding: 1.25rem 0.75rem;
    border-radius: var(--radius);
    transition: background-color 0.15s;
  }
  .date {
    grid-column: 1 / -1;
    font-size: 0.9375rem;
    color: var(--muted-foreground);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }
  @media (width >= 760px) {
    .row {
      grid-template-columns: 9rem minmax(0, 1fr) auto;
      align-items: start;
    }
    .date {
      grid-column: auto;
      padding-top: 0.3rem;
    }
    .go {
      align-self: center;
    }
  }
  .title {
    font-size: 1.3rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .row .chips {
    margin-top: 0.3rem;
  }
  .minutes {
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }
  .go {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    color: var(--muted-foreground);
    transition:
      transform 0.15s,
      color 0.15s;
  }
  .row:hover,
  .row:focus-visible {
    background: color-mix(in oklab, var(--muted) 55%, var(--background));
  }
  /* The chips share the tint's colour, so an edge keeps them visible on it. */
  :global(.blog .row .chip) {
    border-color: var(--border);
  }
  .row:hover .go,
  .row:focus-visible .go {
    color: var(--foreground);
    transform: translateX(0.25rem);
  }
  .row:hover .title {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.18em;
  }
  .row:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .row,
    .go {
      transition: none;
    }
    .row:hover .go,
    .row:focus-visible .go {
      transform: none;
    }
  }
</style>
