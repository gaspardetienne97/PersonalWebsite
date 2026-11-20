<script lang="ts">
  import { resolve } from "$app/paths";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import * as Card from "@repo/ui/card";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import { Separator } from "@repo/ui/separator";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { name } from "#lib/config.ts";
  import { formatDate } from "#lib/utils.ts";

  let { data } = $props();
  const post = $derived(data.post);
  const Content = $derived(data.Content);
  const neighbours = $derived(
    [
      data.newer && { label: "Newer", post: data.newer },
      data.older && { label: "Older", post: data.older },
    ].filter((n) => !!n),
  );
</script>

<svelte:head>
  <title>{post.title} | {name}</title>
  <meta name="description" content={post.description} />
  <meta property="og:type" content="article" />
  <meta property="og:title" content={post.title} />
  <meta property="og:description" content={post.description} />
</svelte:head>

<article class="gm-page post">
  <Button
    variant="ghost"
    href={resolve('blog')}
    class="-ml-3"
  >
    <ChevronLeft data-icon="inline-start" aria-hidden="true" />
    All posts
  </Button>

  <header class="head">
    <div class="flex flex-wrap gap-2">
      {#each post.categories as category (category)}
        <Badge variant="secondary" class="capitalize">{category}</Badge>
      {/each}
    </div>
    <h1 class="title">{post.title}</h1>
    <p class="gm-lede">{post.description}</p>
    <p class="text-sm text-muted-foreground">
      <time datetime={post.date}>{formatDate(post.date, "long")}</time>, {post.readingMinutes} min
      read
    </p>
  </header>

  <div class="cover">
    {#if post.cover}
      <img src={post.cover} alt="" />
    {:else}
      <CircuitArt
        seed={post.slug}
        colors={[MARKERS.blue, MARKERS.violet, MARKERS.red, MARKERS.yellow]}
        width={1200}
        height={340}
      />
    {/if}
  </div>

  <div class="gm-prose body">
    <Content />
  </div>

  {#if neighbours.length > 0}
    <Separator class="mt-16" />
    <nav class="more" aria-label="More posts">
      {#each neighbours as { label, post: other } (other.slug)}
        <Card.Root class="stretch relative">
          <Card.Header class="pb-6">
            <Card.Description>{label}</Card.Description>
            <Card.Title level={2} class="text-xl">
              <a href={resolve("/blog/[slug]", { slug: other.slug })} class="stretch-link">
                {other.title}
              </a>
            </Card.Title>
          </Card.Header>
        </Card.Root>
      {/each}
    </nav>
  {/if}
</article>

<style>
  .post {
    padding-top: clamp(2rem, 5vw, 3.5rem);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 48rem;
    margin-top: 2rem;
  }
  .title {
    font-weight: 700;
    font-size: clamp(2.25rem, 5vw, 3.75rem);
    line-height: 1.02;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  .head .gm-lede {
    max-width: 44ch;
  }
  .cover {
    margin-top: 2.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--muted);
  }
  .cover img {
    display: block;
    width: 100%;
    aspect-ratio: 1200 / 340;
    object-fit: cover;
  }
  .body {
    margin-top: clamp(2.5rem, 6vw, 4rem);
  }
  .more {
    display: grid;
    gap: 1rem;
    margin-top: 2rem;
  }
  @media (width >= 700px) {
    .more {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
