<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { getLocale } from "@repo/i18n/runtime.js";
  import { resolve } from "$app/paths";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import Clock from "@lucide/svelte/icons/clock";
  import Languages from "@lucide/svelte/icons/languages";
  import Tag from "@lucide/svelte/icons/tag";
  import * as Card from "@repo/ui/card";
  import { Button } from "@repo/ui/button";
  import { name } from "#lib/config.ts";
  import { categoryLabel } from "#lib/posts.ts";
  import { formatDate, formatList } from "#lib/utils.ts";

  let { data } = $props();
  const post = $derived(data.post);
  const Content = $derived(data.Content);
  // Posts are written in English whatever language the site is shown in.
  const translated = $derived(getLocale() !== "en");

  // A category's name with a capital, as the list page's chips show it.
  const category = (id: string) => {
    const label = categoryLabel(id);
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  };

  let copied = $state("");

  /**
   * What the Markdown can't carry: ids on the headings so "On this page" can
   * link to them, and a Copy button in each code block's header.
   */
  function enhance(body: HTMLElement) {
    body.querySelectorAll("h2, h3").forEach((heading, i) => {
      const id = data.headings[i]?.id;
      if (id) heading.id = id;
    });
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

    for (const head of body.querySelectorAll(".gm-code-head")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gm-code-copy";
      button.textContent = m.post_copy();
      button.addEventListener("click", async () => {
        const code = head.parentElement?.querySelector("pre")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          return; // No clipboard here (an insecure page): the code is still selectable.
        }
        button.textContent = copied = m.post_copied();
        setTimeout(() => {
          button.textContent = m.post_copy();
          copied = "";
        }, 2000);
      });
      head.append(button);
    }
  }
</script>

<svelte:head>
  <title>{post.title} | {name}</title>
  <meta name="description" content={post.description} />
  <meta property="og:type" content="article" />
  <meta property="og:title" content={post.title} />
  <meta property="og:description" content={post.description} />
</svelte:head>

<!-- The posts on either side in the list's order. "Previous" and "next" say
     nothing about dates, which two posts may share. -->
{#snippet neighbour(other: typeof post, label: string, side: "previous" | "next")}
  <Card.Root class="stretch near {side} relative gap-1.5 px-5 py-4">
    <p class="near-label">
      {#if side === "previous"}<ArrowLeft size={16} aria-hidden="true" />{/if}
      {label}
      {#if side === "next"}<ArrowRight size={16} aria-hidden="true" />{/if}
    </p>
    <h2 class="near-title" lang="en">
      <a href={resolve("/blog/[slug]", { slug: other.slug })} class="stretch-link">
        {other.title}
      </a>
    </h2>
    <time datetime={other.date} class="near-date">{formatDate(other.date, "long")}</time>
  </Card.Root>
{/snippet}

<article class="gm-page post">
  <div class="back">
    <Button variant="ghost" href={resolve("/blog")} class="-ml-3 min-h-11">
      <ChevronLeft data-icon="inline-start" aria-hidden="true" />
      {m.post_all()}
    </Button>
  </div>

  <header class="head">
    <h1 class="title gm-clear" lang="en">{post.title}</h1>
    <!-- The summary stands right under the title, a size above the text. Then the
         facts in one line: the categories are words, since they lead nowhere. -->
    <p class="standfirst" lang="en">{post.description}</p>
    <ul class="facts gm-clear" aria-label={m.post_about()}>
      <li>
        <CalendarDays size={16} aria-hidden="true" />
        <time datetime={post.date}>{formatDate(post.date, "long")}</time>
      </li>
      <li>
        <Clock size={16} aria-hidden="true" />{m.reading_time({ minutes: post.readingMinutes })}
      </li>
      {#if post.categories.length > 0}
        <li>
          <Tag size={16} aria-hidden="true" />{formatList(post.categories.map(category))}
        </li>
      {/if}
    </ul>
    {#if translated}
      <p class="note gm-clear">
        <Languages size={16} aria-hidden="true" />{m.post_in_english()}
      </p>
    {/if}
  </header>

  <!-- A post with sections lists them: beside the text on a wide screen, under
       the title on a narrow one. A short post has no side column at all. -->
  {#if data.headings.length >= 2}
    <aside class="side">
      <nav class="toc gm-clear" aria-labelledby="toc-title">
        <h2 id="toc-title">{m.post_on_this_page()}</h2>
        <ol lang="en">
          {#each data.headings as heading (heading.id)}
            <li class:sub={heading.depth === 3}><a href="#{heading.id}">{heading.text}</a></li>
          {/each}
        </ol>
      </nav>
    </aside>
  {/if}

  {#if post.cover}
    <div class="cover"><img src={post.cover} alt="" /></div>
  {/if}

  {#key post.slug}
    <div class="gm-prose body" lang="en" {@attach enhance}>
      <Content />
    </div>
  {/key}
  <p class="sr-only" aria-live="polite">{copied}</p>

  <footer class="end">
    {#if data.newer || data.older}
      <nav class="more" aria-label={m.post_more()}>
        {#if data.newer}{@render neighbour(data.newer, m.post_previous(), "previous")}{/if}
        {#if data.older}{@render neighbour(data.older, m.post_next(), "next")}{/if}
      </nav>
    {/if}
    <a href={resolve("/blog")} class="gm-link gm-clear">{m.post_all()}<ArrowRight /></a>
  </footer>
</article>

<style>
  .post {
    padding-top: clamp(1.5rem, 4vw, 2.5rem);
  }
  /* One reading column, in the middle of the page: the way back, the title, the
     text and the cards at the end share its two edges. From 1100px a post with
     sections lists them in the margin at its right, where they stay in view. */
  .post > * {
    max-width: 46rem;
    margin-inline: auto;
  }
  @media (width >= 1100px) {
    .post {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 46rem) minmax(0, 1fr);
      column-gap: 2rem;
    }
    .post > * {
      grid-column: 2;
      width: 100%;
    }
    .post > .side {
      grid-column: 3;
      grid-row: 2 / span 4;
      align-self: start;
      position: sticky;
      top: calc(var(--gm-header-h, 4rem) + 2rem);
      max-width: 15rem;
      margin: 1.75rem 0 0;
      padding-left: 1.25rem;
      border-left: 1px solid var(--border);
    }
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    margin-top: 1.25rem;
  }
  .title {
    font-weight: 700;
    font-size: clamp(2.25rem, 5vw, 3.5rem);
    line-height: 1.04;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  /* A size above the text it introduces (1.2rem), in the same serif. */
  .standfirst {
    font-family: var(--font-gm-serif);
    font-size: clamp(1.3rem, 2.4vw, 1.5rem);
    line-height: 1.4;
    color: var(--muted-foreground);
    text-wrap: pretty;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: fit-content;
    font-size: 0.9375rem;
    color: var(--muted-foreground);
  }

  .side {
    margin-top: 1.5rem;
    font-size: 0.9375rem;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.5rem;
    width: fit-content;
    font-size: 0.9375rem;
  }
  .facts li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .facts :global(svg) {
    flex: none;
    color: var(--muted-foreground);
  }
  .toc {
    padding-top: 1.25rem;
    border-top: 1px solid var(--border);
  }
  @media (width >= 1100px) {
    .toc {
      padding-top: 0;
      border-top: 0;
    }
  }
  .toc h2 {
    font-size: 0.8125rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .toc ol {
    display: grid;
    margin-top: 0.5rem;
  }
  .toc a {
    display: block;
    padding-block: 0.35rem;
    line-height: 1.35;
    color: var(--muted-foreground);
    border-radius: 4px;
  }
  .toc a:hover {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .toc a:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .toc .sub a {
    padding-left: 1rem;
    font-size: 0.875rem;
  }
  @media (pointer: coarse) {
    .toc a {
      padding-block: 0.7rem;
    }
  }
  .cover {
    margin-top: 2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--muted);
  }
  .cover img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 7;
    object-fit: cover;
  }
  .body {
    margin-top: clamp(1.75rem, 4vw, 2.5rem);
  }
  .body :global(> :first-child) {
    margin-top: 0;
  }

  .end {
    margin-top: clamp(3rem, 7vw, 4.5rem);
    padding-top: 2rem;
    border-top: 1px solid var(--border);
  }
  .more {
    display: grid;
    gap: 1rem;
    margin-bottom: 1.75rem;
  }
  @media (width >= 600px) {
    .more {
      grid-template-columns: 1fr 1fr;
    }
    .more :global(.next) {
      grid-column: 2;
      text-align: right;
    }
    .more :global(.next .near-label) {
      justify-content: flex-end;
    }
  }
  .near-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.875rem;
    font-weight: 550;
    color: var(--muted-foreground);
  }
  .near-title {
    font-size: 1.25rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .near-date {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  :global(.post .near) {
    transition: border-color 0.15s;
  }
  :global(.post .near:hover) {
    border-color: color-mix(in oklab, var(--foreground) 35%, var(--border));
  }
  .near-label :global(svg) {
    transition: transform 0.15s;
  }
  :global(.post .previous:hover .near-label svg) {
    transform: translateX(-0.2rem);
  }
  :global(.post .next:hover .near-label svg) {
    transform: translateX(0.2rem);
  }
  @media (prefers-reduced-motion: reduce) {
    .near-label :global(svg) {
      transition: none;
      transform: none !important;
    }
  }
</style>
