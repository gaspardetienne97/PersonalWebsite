<!--
  The site's error page, drawn inside the root layout (header and footer included)
  for a missing address or a page that failed to load, in any section. One layout
  for every case: the status drawn as a broken connection from the logo, what
  happened, the address that was asked for, and ways on. A missing post also gets
  the list of posts and the newest ones.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { Button } from "@repo/ui/button";
  import CircuitPaths from "#lib/components/site/CircuitPaths.svelte";
  import LogoMark from "#lib/components/site/LogoMark.svelte";
  import type { Board } from "#lib/circuit/router.ts";
  import { name, nav } from "#lib/config.ts";
  import { getPosts } from "#lib/posts.ts";
  import { m } from "@repo/i18n/messages.js";

  const missing = $derived(page.status === 404);
  const title = $derived(missing ? m.error_not_found_title() : m.error_other_title());
  const path = $derived(page.url.pathname);
  const post = $derived(missing && path.startsWith("/blog/"));
  const recent = $derived(post ? getPosts().slice(0, 3) : []);
  // A missing post leads with the list of posts, which stands in for the nav's own link to it.
  const links = $derived(post ? nav.filter((link) => link.href !== "/blog") : nav);

  // Two traces that stop short of each other: one leaves the logo, one leaves the number.
  const chain = (color: string, points: [number, number][]) => ({
    points: points.map(([x, y]) => ({ x, y })),
    color,
    start: 0,
    steps: 1,
    branch: false,
  });
  const open: Board = {
    width: 96,
    height: 40,
    chains: [
      chain("var(--gm-red)", [[0, 20], [24, 20], [32, 12], [40, 12]]),
      chain("var(--gm-blue)", [[96, 20], [72, 20], [64, 28], [56, 28]]),
    ],
    junctions: [],
    ends: [],
    depth: 1,
  };
</script>

<svelte:head>
  <title>{title} | {name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page error">
  <p class="status">
    <span class="sr-only">{m.error_status({ status: page.status })}</span>
    <span class="broken" aria-hidden="true">
      <LogoMark size={72} class="mark" />
      <span class="gap"><CircuitPaths board={open} /></span>
      <span class="number">{page.status}</span>
    </span>
  </p>
  <h1 class="gm-title">{title}</h1>
  <p class="gm-lede">{missing ? m.error_not_found_body() : m.error_other_body()}</p>
  {#if missing}
    <p class="address gm-clear"><code>{path}</code></p>
  {/if}
  <ul class="links">
    {#if post}
      <li><Button href={resolve("/blog")} class="h-11 text-base">{m.error_all_posts()}</Button></li>
    {/if}
    {#each links as link, i (link.href)}
      <li>
        <Button
          variant={i === 0 && !post ? "default" : "outline"}
          href={resolve(link.href)}
          class="h-11 text-base"
        >
          {link.label}
        </Button>
      </li>
    {/each}
  </ul>
  {#if recent.length > 0}
    <section class="recent" aria-labelledby="recent-posts">
      <h2 id="recent-posts">{m.error_recent_posts()}</h2>
      <ul>
        {#each recent as entry (entry.slug)}
          <li>
            <a class="gm-link" href={resolve("/blog/[slug]", { slug: entry.slug })}>
              {entry.title}<ArrowRight aria-hidden="true" />
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
    padding-top: clamp(2.5rem, 7vw, 5rem);
  }
  .broken {
    display: flex;
    align-items: center;
    gap: clamp(0.4rem, 1.5vw, 0.9rem);
  }
  .broken :global(.mark) {
    flex: none;
    width: clamp(3.25rem, 9vw, 4.5rem);
    height: auto;
  }
  .gap {
    flex: none;
    width: clamp(5.5rem, 16vw, 9rem);
    aspect-ratio: 96 / 40;
  }
  /* The status in the display face, filled with the logo's ring. */
  .number {
    font-weight: 750;
    font-size: clamp(4rem, 13vw, 7.5rem);
    line-height: 1;
    letter-spacing: -0.04em;
    background: var(--gm-brand);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
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
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .recent {
    margin-top: 1.5rem;
  }
  .recent h2 {
    font-size: 1.05rem;
    font-weight: 650;
    margin-bottom: 0.35rem;
  }
  .recent ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 2rem;
  }
  .recent .gm-link {
    min-height: 2.75rem;
    font-size: 1.1rem;
  }
</style>
