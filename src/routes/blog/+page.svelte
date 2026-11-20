<script lang="ts">
  import { resolve } from "$app/paths";
  import FileText from "@lucide/svelte/icons/file-text";
  import * as Card from "@repo/ui/card";
  import * as ToggleGroup from "@repo/ui/toggle-group";
  import { Badge } from "@repo/ui/badge";
  import { Empty } from "@repo/ui/empty";
  import { Separator } from "@repo/ui/separator";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { parseDate } from "#lib/posts.ts";
  import { formatDate } from "#lib/utils.ts";

  let { data } = $props();

  const categories = $derived([...new Set(data.posts.flatMap((post) => post.categories))].sort());
  let category = $state("all");
  const visible = $derived(
    category === "all"
      ? data.posts
      : data.posts.filter((post) => post.categories.includes(category)),
  );
  const [featured, ...rest] = $derived(visible);
  const years = $derived.by(() => {
    const byYear = new Map<number, typeof rest>();
    for (const post of rest) {
      const year = parseDate(post.date).getFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), post]);
    }
    return [...byYear].sort(([a], [b]) => b - a);
  });
  const coverColors = [MARKERS.blue, MARKERS.violet, MARKERS.red, MARKERS.yellow];
</script>

<svelte:head>
  <title>Blog | Gaspard Michel Etienne</title>
  <meta
    name="description"
    content="Notes from Gaspard Michel Etienne on what he's building and learning."
  />
</svelte:head>

<div class="gm-page blog">
  <header class="flex flex-col gap-5">
    <h1 class="gm-title">Writing</h1>
    <p class="gm-lede">Notes on what I'm building, what broke, and what I learned fixing it.</p>
  </header>

  {#if categories.length > 1}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      bind:value={() => category, (value) => value && (category = value)}
      class="filters"
      aria-label="Filter by topic"
    >
      <ToggleGroup.Item value="all">All</ToggleGroup.Item>
      {#each categories as name (name)}
        <ToggleGroup.Item value={name} class="capitalize">{name}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  {/if}

  {#if !featured}
    <Empty class="mt-12" title="No posts yet" description="The first one is being written.">
      {#snippet icon()}<FileText />{/snippet}
    </Empty>
  {:else}
    <Card.Root class="stretch featured relative overflow-hidden">
      <div class="cover">
        <CircuitArt seed={featured.slug} colors={coverColors} width={720} height={400} />
      </div>
      <div class="flex flex-col">
        <Card.Header class="gap-3">
          <p class="text-sm text-muted-foreground">
            Latest, <time datetime={featured.date}>{formatDate(featured.date, "long")}</time>
          </p>
          <Card.Title level={2} class="text-3xl">
            
              <a href={resolve("/blog/[slug]", { slug: featured.slug })} class="stretch-link">
                {featured.title}
              </a>
            
          </Card.Title>
          <Card.Description class="text-base">{featured.description}</Card.Description>
        </Card.Header>
        <Card.Footer class="mt-auto flex-wrap gap-2 pt-6">
          {#each featured.categories as name (name)}
            <Badge variant="secondary" class="capitalize">{name}</Badge>
          {/each}
          <Badge variant="outline">{featured.readingMinutes} min read</Badge>
        </Card.Footer>
      </div>
    </Card.Root>

    {#each years as [year, posts] (year)}
      <section class="year" aria-labelledby="year-{year}">
        <h2 id="year-{year}" class="gm-h2">{year}</h2>
        <Separator class="mt-4" />
        <ul>
          {#each posts as post (post.slug)}
            <li>
              <a href={resolve("/blog/[slug]", { slug: post.slug })} class="row">
                <time datetime={post.date} class="text-sm text-muted-foreground">
                  {formatDate(post.date)}
                </time>
                <span class="flex flex-col gap-1">
                  <span class="title">{post.title}</span>
                  <span class="text-muted-foreground">{post.description}</span>
                </span>
                <span class="flex flex-wrap gap-2">
                  {#each post.categories as name (name)}
                    <Badge variant="secondary" class="capitalize">{name}</Badge>
                  {/each}
                </span>
              </a>
              <Separator />
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
  :global(.blog .filters) {
    flex-wrap: wrap;
    margin-top: 2.5rem;
  }
  :global(.blog .featured) {
    display: grid;
    margin-top: 2.5rem;
  }
  @media (width >= 900px) {
    :global(.blog .featured) {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    }
  }
  .cover {
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  @media (width >= 900px) {
    .cover {
      border-bottom: 0;
      border-right: 1px solid var(--border);
    }
  }
  .year {
    margin-top: clamp(3.5rem, 8vw, 5rem);
  }
  .row {
    display: grid;
    gap: 0.5rem 2rem;
    padding: 1.4rem 0.25rem;
  }
  @media (width >= 760px) {
    .row {
      grid-template-columns: 9rem minmax(0, 1fr) auto;
      align-items: baseline;
    }
  }
  .row:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: var(--radius);
  }
  .title {
    font-size: 1.3rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .row:hover .title {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
</style>
