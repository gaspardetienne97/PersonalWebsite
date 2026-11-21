<script lang="ts">
  import { resolve } from "$app/paths";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import type Piano from "@lucide/svelte/icons/piano";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { Button } from "@repo/ui/button";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import LogoMark from "#lib/components/site/LogoMark.svelte";
  import StudioCover from "#lib/components/site/StudioCover.svelte";
  import { name, socials } from "#lib/config.ts";
  import { STUDIO } from "#lib/content/studio.ts";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { m } from "@repo/i18n/messages.js";
  import { formatList } from "#lib/utils.ts";

  // The owner's portrait, once there is one: a file named portrait.webp (or .avif,
  // .jpg, .png) in src/lib/images/. Until then the hero shows the mark on a board.
  const portrait = Object.values(
    import.meta.glob<string>("/src/lib/images/portrait.{webp,avif,jpg,jpeg,png}", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  )[0];
  const brand = ["#2bc4ff", "#c531f2", "#ff1f2a", MARKERS.yellow, MARKERS.green];

  // Each is a heading, its text and, where the site shows that kind of work, a way to it.
  const work = [
    {
      title: m.about_work_interfaces,
      body: m.about_work_interfaces_body,
      link: { href: `${resolve("/studio")}?type=projects`, label: m.kind_projects },
    },
    { title: m.about_work_data, body: m.about_work_data_body },
    {
      title: m.about_work_infra,
      body: m.about_work_infra_body,
      link: { href: "#this-website", label: m.about_site_heading },
    },
    { title: m.about_work_tools, body: m.about_work_tools_body },
  ];
  // The projects, with their pictures: two to a row.
  const tools = STUDIO.projects;
  const drawings = STUDIO.drawings.slice(0, 4);
  // Three real pieces beside the greeting: a drawing between two projects. Each
  // is a link: a project to itself, anything else to its kind in the Studio.
  const fan = [STUDIO.projects[0], STUDIO.drawings[0], STUDIO.projects[1]]
    .filter(Boolean)
    .map((item) => ({
      item,
      href:
        item.media.type === "project"
          ? item.media.project.href
          : `${resolve("/studio")}?type=${item.kind}`,
    }));

  const stack = [
    [m.about_stack_framework, m.about_stack_framework_value],
    [m.about_stack_styling, m.about_stack_styling_value],
    [m.about_stack_posts, m.about_stack_posts_value],
    [m.about_stack_data, m.about_stack_data_value],
    [m.about_stack_languages, m.about_stack_languages_value],
    [m.about_stack_build, m.about_stack_build_value],
    [m.about_stack_hosting, m.about_stack_hosting_value],
  ];

  const swatches = [
    ["--gm-red", m.colour_red],
    ["--gm-blue", m.colour_cobalt],
    ["--gm-green", m.colour_green],
    ["--gm-violet", m.colour_violet],
    ["--gm-yellow", m.colour_yellow],
  ] as const;

  // An email address, when the list has one, comes first as the main button.
  const isEmail = (href: string) => href.startsWith("mailto:");
  const contacts = [...socials].sort((a, b) => Number(isEmail(b.href)) - Number(isEmail(a.href)));
  const hasEmail = contacts.some((contact) => isEmail(contact.href));

  // The page index. Its labels are shorter than the headings they lead to, so
  // each fits one line of a chip on a phone in every language.
  const jumps = [
    ["#work", m.about_jump_work],
    ["#outside", m.about_jump_outside],
    ["#this-website", m.about_jump_site],
    ...(contacts.length > 0 ? [["#contact", m.about_say_hello] as const] : []),
  ] as const;

  // Links that sit inside translated sentences. The messages are this site's own
  // text, so rendering them as HTML is safe.
  const link = (href: string, text: string) => `<a class="gm-inline-link" href="${href}">${text}</a>`;
  const woodshed = link("/music", "Woodshed");
  const narrator = link("/pdf", "Narrator");
  // Written out like the two above: resolve() gives "./studio" on the server and "/studio"
  // in the browser, and an {@html} block must be the same text on both.
  const studio = link("/studio?type=drawings", m.nav_studio());

  let boardSeed = $state(1);

  // The page index marks the section being read: the last one whose top has
  // passed a line a third of the way down the screen (the first section until
  // then, so one is marked from the top of the page), or the last section once
  // the page can scroll no further.
  let current = $state<string>(jumps[0][0]);
  function spy() {
    const line = innerHeight * 0.35;
    let found: string = jumps[0][0];
    for (const [href] of jumps) {
      const top = document.getElementById(href.slice(1))?.getBoundingClientRect().top;
      if (top !== undefined && top <= line) found = href;
    }
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    current = atEnd && scrollY > 0 ? jumps[jumps.length - 1][0] : found;
  }
  $effect(spy);
</script>

<svelte:window onscroll={spy} onresize={spy} />

<svelte:head>
  <title>{m.nav_about()} | {name}</title>
  <meta name="description" content={m.about_meta()} />
</svelte:head>

<div class="gm-page about">
  <header class="intro">
    <div class="hello">
      <h1 class="gm-title gm-clear">{m.about_title()}</h1>
      <p class="gm-lede">{m.about_lede()}</p>
    </div>
    <!-- The picture: a portrait once there is one, until then the mark on the main
         chip of a board routed for this page. Three real pieces lean on its edge. -->
    <div class="art">
      {#if portrait}
        <img class="picture portrait" src={portrait} alt={m.about_portrait_alt()} />
      {:else}
        <div class="picture board-mark" aria-hidden="true">
          <CircuitArt
            seed="about-hero"
            colors={brand}
            icon={LogoMark as unknown as typeof Piano}
            width={416}
            height={304}
          />
        </div>
      {/if}
      <ul class="fan">
        {#each fan as { item, href } (item.media.id)}
          <li class="card">
            <a {href} aria-label={item.media.title}><StudioCover {item} size={240} eager /></a>
          </li>
        {/each}
      </ul>
    </div>
  </header>

  <div class="body">
    <!-- One index for the page: two rows of chips on a phone, a narrow column
         that stays in view from 900px. The section being read is marked. -->
    <nav class="index" aria-label={m.post_on_this_page()}>
      <ul>
        {#each jumps as [href, label] (href)}
          <li>
            <a {href} aria-current={current === href ? "location" : undefined}>{label()}</a>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="sections">
      <section id="work" aria-labelledby="work-title">
        <h2 id="work-title" class="gm-h2 gm-clear">{m.about_work_heading()}</h2>
        <p class="gm-text">{m.about_work_intro()}</p>
        <ul class="tools" aria-label={m.kind_projects()}>
          {#each tools as item (item.media.id)}
            {#if item.media.type === "project"}
              <li class="stretch">
                <span class="shot"><StudioCover {item} size={480} eager /></span>
                <span class="tool-text">
                  <a class="stretch-link" href={item.media.project.href}>
                    {item.media.project.title}
                  </a>
                  <span class="sum">{item.media.project.summary}</span>
                  <!-- What a press does, by name. The card about this site leads
                       down this page, not to another one. -->
                  <span class="open" aria-hidden="true">
                    {#if item.media.project.href.includes("#")}
                      {m.about_site_heading()}<ArrowDown />
                    {:else}
                      {m.about_open_project({ name: item.media.project.title })}<ArrowRight />
                    {/if}
                  </span>
                </span>
              </li>
            {/if}
          {/each}
        </ul>
        <dl class="work gm-clear">
          {#each work as { title, body, link }, i (i)}
            <div>
              <dt>{title()}</dt>
              <dd>
                {body()}
                {#if link}
                  <a class="gm-link" href={link.href}>{link.label()}<ArrowRight /></a>
                {/if}
              </dd>
            </div>
          {/each}
        </dl>
      </section>

      <section id="outside" aria-labelledby="outside-title">
        <h2 id="outside-title" class="gm-h2 gm-clear">{m.about_outside_heading()}</h2>
        <p class="gm-text">{@html m.about_outside_music({ woodshed })}</p>
        <p class="gm-text">{@html m.about_outside_creative({ studio })}</p>
        <ul class="drawings">
          {#each drawings as item (item.media.id)}
            <li class="stretch">
              <span class="thumb"><StudioCover {item} size={320} eager /></span>
              <a class="stretch-link" href="{resolve('/studio')}?type=drawings">
                {item.media.title}
              </a>
            </li>
          {/each}
        </ul>
        <a class="gm-link see-all" href="{resolve('/studio')}?type=drawings">
          {m.about_see_all_studio()}<ArrowRight />
        </a>
      </section>

      <section id="this-website" aria-labelledby="site-title">
        <h2 id="site-title" class="gm-h2 gm-clear">{m.about_site_heading()}</h2>
        <p class="gm-text">{m.about_site_intro()}</p>

        <h3>{m.about_whats_here()}</h3>
        <ul class="map">
          <li class="stretch">
            <a class="gm-link stretch-link" href={resolve("/studio")}>
              {m.nav_studio()}<ArrowRight />
            </a>
            <p>{m.about_map_studio()}</p>
          </li>
          <li class="stretch">
            <a class="gm-link stretch-link" href={resolve("/blog")}>
              {m.kind_writing()}<ArrowRight />
            </a>
            <p>{m.about_map_blog()}</p>
          </li>
          <li class="stretch">
            <a class="gm-link stretch-link" href="{resolve('/studio')}?type=projects">
              {m.kind_projects()}<ArrowRight />
            </a>
            <p>{@html m.about_map_projects({ woodshed, narrator })}</p>
          </li>
        </ul>

        <h3>{m.about_intro_heading()}</h3>
        <div class="router">
          <p class="gm-text">{m.about_intro_body()}</p>
          <figure class="board">
            <CircuitArt seed="about-{boardSeed}" colors={brand} width={480} height={320} />
            <figcaption>
              <span>{m.about_board_caption({ number: boardSeed })}</span>
              <Button variant="outline" size="sm" class="min-h-11" onclick={() => boardSeed++}>
                <Shuffle data-icon="inline-start" aria-hidden="true" />{m.about_route_another()}
              </Button>
            </figcaption>
          </figure>
        </div>

        <!-- The colophon, for those who want it. Closed, so the page stays about the person. -->
        <details class="colophon">
          <summary><ChevronRight size={18} aria-hidden="true" />{m.about_colophon()}</summary>
          <div class="inside">
            <h4>{m.about_built_heading()}</h4>
            <dl class="stack">
              {#each stack as [label, value], i (i)}
                <div>
                  <dt>{label()}</dt>
                  <dd>{value()}</dd>
                </div>
              {/each}
            </dl>

            <h4>{m.about_type_heading()}</h4>
            <div class="brand">
              <LogoMark size={64} />
              <p class="gm-text">{m.about_type_body()}</p>
            </div>
            <ul class="swatches" aria-label={m.about_swatches_label()}>
              {#each swatches as [token, name] (token)}
                <li style="--c: var({token})">{name()}</li>
              {/each}
            </ul>
          </div>
        </details>
      </section>

      {#if contacts.length > 0}
        <section id="contact" aria-labelledby="contact-title">
          <h2 id="contact-title" class="gm-h2 gm-clear">{m.about_say_hello()}</h2>
          <!-- "Write to me" only once there is an address to write to. -->
          <p class="gm-text">
            {hasEmail
              ? m.about_hello_body()
              : m.about_hello_body_social({
                  places: formatList(
                    contacts.map((contact) => contact.label),
                    "disjunction",
                  ),
                })}
          </p>
          <ul class="socials">
            {#each contacts as social (social.href)}
              <li>
                <Button
                  variant={isEmail(social.href) ? "default" : "outline"}
                  size="lg"
                  href={social.href}
                  rel="me noopener"
                  class="h-11 px-5 text-base"
                >
                  <social.icon size={20} aria-hidden="true" />{social.label}
                </Button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .about {
    padding-top: clamp(2rem, 5vw, 3.5rem);
  }

  /* The greeting, with a picture beside it from 900px. */
  .intro {
    display: grid;
    gap: 2rem;
    align-items: center;
  }
  .hello {
    display: grid;
    gap: 1.5rem;
    justify-items: start;
    max-width: 52rem;
  }
  .intro .gm-lede {
    max-width: 44ch;
  }
  /* The picture, with a fan of three pieces leaning on its lower edge. */
  /* Compact on a phone, so the index and the first section stay near the fold. */
  .art {
    position: relative;
    width: 100%;
    max-width: 18rem;
    padding-bottom: 4rem;
    justify-self: center;
  }
  .picture {
    display: block;
    width: 100%;
    aspect-ratio: 26 / 19;
    border: 1px solid var(--border);
    border-radius: 1.25rem;
    overflow: hidden;
  }
  .portrait {
    object-fit: cover;
  }
  .board-mark {
    background: color-mix(in oklab, var(--muted) 55%, var(--background));
  }
  .board-mark :global(.icon svg) {
    width: 4.5rem;
    height: 4.5rem;
  }
  .fan {
    position: absolute;
    inset: auto 0 0;
    display: flex;
    justify-content: center;
  }
  .card {
    position: relative;
    width: 34%;
    aspect-ratio: 4 / 5;
    margin-inline: -1.5%;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    overflow: hidden;
    background: var(--card);
    box-shadow: 0 12px 24px -14px rgb(0 0 0 / 0.5);
    transition:
      translate 0.2s ease,
      border-color 0.2s ease;
  }
  .card a {
    position: absolute;
    inset: 0;
    outline: none;
  }
  /* A piece under the pointer or the keyboard comes forward. */
  .card:hover,
  .card:has(a:focus-visible) {
    z-index: 2;
    border-color: var(--foreground);
  }
  .card:has(a:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .card:nth-child(1) {
    rotate: -7deg;
    translate: 0 6%;
  }
  .card:nth-child(2) {
    z-index: 1;
    translate: 0 -4%;
  }
  .card:nth-child(3) {
    rotate: 7deg;
    translate: 0 6%;
  }
  .card:nth-child(odd):hover {
    translate: 0 1%;
  }
  .card:nth-child(2):hover {
    translate: 0 -9%;
  }
  .card :global(.chip) {
    display: none;
  }
  @media (width >= 900px) {
    .intro {
      grid-template-columns: minmax(0, 1fr) 26rem;
      gap: 3rem;
    }
    .art {
      max-width: 26rem;
      padding-bottom: 5.5rem;
    }
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    margin-top: clamp(2rem, 5vw, 3.5rem);
  }
  .sections {
    min-width: 0;
  }

  /* The page index. On a phone: four chips of one size, two to a row, the
     section being read filled. */
  .index ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .index a {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding-inline: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--foreground) 22%, var(--border));
    border-radius: 999px;
    background: var(--background);
    font-size: 0.9375rem;
    font-weight: 550;
    white-space: nowrap;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }
  .index a:hover {
    border-color: var(--foreground);
    background: var(--muted);
  }
  .index a:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .index a[aria-current] {
    border-color: var(--foreground);
    background: var(--foreground);
    color: var(--background);
    font-weight: 650;
  }
  /* From 900px: a narrow column that stays in view, the section being read
     marked by a bar and a heavier weight. */
  @media (width >= 900px) {
    .body {
      grid-template-columns: 11rem minmax(0, 1fr);
      gap: 3rem;
    }
    .index {
      position: sticky;
      top: 6rem;
      align-self: start;
      padding-top: 2rem;
    }
    .index ul {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      background: var(--background);
      box-shadow: 0 0 0.9rem 0.6rem var(--background);
    }
    .index a {
      justify-content: flex-start;
      padding-inline: 1rem 0.5rem;
      border: 0;
      border-left: 2px solid var(--border);
      border-radius: 0;
      background: none;
      color: var(--muted-foreground);
      white-space: normal;
      line-height: 1.25;
    }
    .index a:hover {
      background: none;
      color: var(--foreground);
      border-color: color-mix(in oklab, var(--foreground) 45%, var(--border));
    }
    .index a[aria-current] {
      background: none;
      color: var(--foreground);
      border-color: var(--foreground);
    }
  }

  section {
    display: grid;
    gap: 1.5rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border);
    /* A section jumped to lands clear of the header, with room over its heading. */
    scroll-margin-top: calc(var(--gm-header-h, 4rem) + 1.5rem);
  }
  section + section {
    margin-top: clamp(3rem, 6vw, 4.5rem);
  }
  h3 {
    margin-top: 1.5rem;
    font-size: 1.25rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  h4 {
    font-size: 1.1rem;
    font-weight: 650;
  }

  .work {
    display: grid;
    gap: 1.5rem 2.5rem;
    margin-top: 0.5rem;
  }
  @media (width >= 640px) {
    .work {
      grid-template-columns: 1fr 1fr;
    }
  }
  .work div {
    border-top: 2px solid var(--foreground);
    padding-top: 0.8rem;
  }
  .work div:nth-child(1) {
    border-color: var(--gm-blue);
  }
  .work div:nth-child(2) {
    border-color: var(--gm-red);
  }
  .work div:nth-child(3) {
    border-color: var(--gm-green);
  }
  .work div:nth-child(4) {
    border-color: var(--gm-violet);
  }
  .work dt {
    font-weight: 650;
    font-size: 1.2rem;
  }
  /* Set like the rest of the page's running text. */
  .work dd {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    margin-top: 0.35rem;
    font-family: var(--font-gm-serif);
    font-size: 1.2rem;
    line-height: 1.6;
  }
  .work .gm-link {
    font-family: var(--font-gm-display);
    font-size: 0.9375rem;
  }

  /* The projects, two to a row at every width: the cover whole (it is square),
     the name, one line, and what a press opens. The whole card is the link.
     Where a card is wide enough the cover stands beside the words. */
  .tools {
    container-type: inline-size;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .tools li {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    background: var(--card);
    color: var(--card-foreground);
    transition: border-color 0.15s;
  }
  .tools li:hover {
    border-color: var(--foreground);
  }
  .shot {
    position: relative;
    display: block;
    flex: none;
    aspect-ratio: 1;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
  }
  .tool-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 0.3rem;
    align-items: flex-start;
    min-width: 0;
    padding: 0.7rem 0.65rem 0.8rem;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .tool-text a {
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .open {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    margin-top: auto;
    padding-top: 0.35rem;
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.25em;
  }
  .open :global(svg) {
    flex: none;
    width: 1em;
    height: 1em;
    transition: translate 0.15s;
  }
  .tools li:hover .open :global(svg) {
    translate: 0.15em 0;
  }
  @container (width >= 44rem) {
    .tools li {
      flex-direction: row;
    }
    .shot {
      width: 10.5rem;
      min-height: 10.5rem;
      aspect-ratio: auto;
      border-bottom: 0;
      border-right: 1px solid var(--border);
    }
    .tool-text {
      padding: 0.9rem 1rem 1rem;
      font-size: 1rem;
      line-height: 1.45;
    }
    .tool-text a {
      font-size: 1.25rem;
    }
    .open {
      font-size: 0.9375rem;
    }
  }
  @media (width >= 640px) {
    .tools {
      gap: 1.25rem;
    }
  }

  /* Drawings under "Outside work": four in a row, two by two on a phone. */
  .drawings {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  @media (width >= 640px) {
    .drawings {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .drawings li {
    position: relative;
    display: grid;
    gap: 0.5rem;
    border-radius: 0.875rem;
  }
  .drawings a {
    font-size: 1.05rem;
    font-weight: 650;
  }
  .thumb {
    position: relative;
    display: block;
    aspect-ratio: 1;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .stretch:hover .thumb {
    border-color: var(--foreground);
  }
  .see-all {
    justify-self: start;
  }

  .map,
  .stack {
    display: grid;
    border-top: 1px solid var(--border);
  }
  .map li,
  .stack div {
    display: grid;
    gap: 0.25rem 2rem;
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--border);
  }
  /* Each row of "What's here" is one link: the label carries it, the whole row
     takes the press, and links inside the sentence still work. */
  .map li {
    position: relative;
    align-items: center;
    margin-inline: -0.75rem;
    padding-inline: 0.75rem;
    transition: background-color 0.15s;
  }
  .map li:hover {
    background: var(--muted);
  }
  .map .gm-link {
    justify-self: start;
  }
  .map p :global(a) {
    position: relative;
    z-index: 1;
  }
  @media (width >= 640px) {
    .map li,
    .stack div {
      grid-template-columns: 9rem minmax(0, 1fr);
    }
  }
  .stack dt {
    color: var(--muted-foreground);
    font-weight: 500;
  }
  .map p {
    font-family: var(--font-gm-serif);
    font-size: 1.125rem;
    line-height: 1.5;
  }

  .router {
    display: grid;
    gap: 1.5rem;
    align-items: start;
  }
  @media (width >= 1100px) {
    .router {
      grid-template-columns: minmax(0, 1fr) 20rem;
    }
  }
  .board {
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    overflow: hidden;
    background: color-mix(in oklab, var(--muted) 55%, var(--background));
  }
  .board figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--border);
    background: var(--background);
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }

  .colophon {
    margin-top: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    background: var(--background);
  }
  .colophon summary {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 3.25rem;
    padding: 0.5rem 1rem;
    border-radius: 0.875rem;
    font-size: 1.1rem;
    font-weight: 650;
    cursor: pointer;
    list-style: none;
  }
  .colophon summary::-webkit-details-marker {
    display: none;
  }
  .colophon summary:hover {
    background: var(--muted);
  }
  .colophon summary:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .colophon summary :global(svg) {
    flex: none;
    transition: transform 0.15s;
  }
  .colophon[open] summary :global(svg) {
    transform: rotate(90deg);
  }
  .inside {
    display: grid;
    gap: 1.25rem;
    padding: 0.75rem 1rem 1.25rem;
  }
  .inside h4:not(:first-child) {
    margin-top: 0.75rem;
  }

  .brand {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }
  .brand :global(svg) {
    flex: none;
    margin-top: 0.3rem;
  }
  /* Each colour as a block large enough to tell from its neighbours, named under it. */
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
    gap: 0.75rem;
  }
  .swatches li {
    display: grid;
    gap: 0.4rem;
    font-size: 0.95rem;
    font-weight: 550;
  }
  .swatches li::before {
    content: "";
    height: 3.25rem;
    border: 1px solid color-mix(in oklab, var(--foreground) 14%, transparent);
    border-radius: 0.6rem;
    background: var(--c);
  }
  .socials {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  /* A phone reads this page as one long column, so its text is set a step
     smaller and the sections sit closer, to keep the way to "Say hello" short. */
  @media (width < 640px) {
    .about :global(.gm-text) {
      font-size: 1.0625rem;
      line-height: 1.6;
    }
    .work dt,
    .work dd {
      font-size: 1.0625rem;
    }
    .map p {
      font-size: 1rem;
    }
    section {
      padding-top: 1.5rem;
    }
    section + section {
      margin-top: 2.5rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .index a,
    .card,
    .map li,
    .tools li,
    .thumb,
    .open :global(svg),
    .colophon summary :global(svg) {
      transition: none;
    }
    .tools li:hover .open :global(svg) {
      translate: none;
    }
    .card:nth-child(odd):hover {
      translate: 0 6%;
    }
    .card:nth-child(2):hover {
      translate: 0 -4%;
    }
  }
</style>
