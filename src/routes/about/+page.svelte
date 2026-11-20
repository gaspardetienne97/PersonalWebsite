<script lang="ts">
  import { resolve } from "$app/paths";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { Button } from "@repo/ui/button";
  import { Separator } from "@repo/ui/separator";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import LogoMark from "#lib/components/site/LogoMark.svelte";
  import { socials } from "#lib/config.ts";
  import { MARKERS } from "#lib/circuit/router.ts";
  import { m } from "#lib/paraglide/messages.js";

  // Each pair is a heading and its text, read in the visitor's language.
  const work = [
    [m.about_work_interfaces, m.about_work_interfaces_body],
    [m.about_work_data, m.about_work_data_body],
    [m.about_work_infra, m.about_work_infra_body],
    [m.about_work_tools, m.about_work_tools_body],
  ];

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

  // Links that sit inside translated sentences. The messages are this site's own
  // text, so rendering them as HTML is safe.
  const link = (href: string, text: string) => `<a class="gm-inline-link" href="${href}">${text}</a>`;
  const woodshed = link("/music", "Woodshed");
  const narrator = link("/pdf", "Narrator");
  const studio = link(`${resolve("/studio")}?type=drawings`, m.nav_studio());

  let boardSeed = $state(1);
</script>

<svelte:head>
  <title>{m.nav_about()} | Gaspard Michel Etienne</title>
  <meta name="description" content={m.about_meta()} />
</svelte:head>

<div class="gm-page about">
  <header class="intro">
    <h1 class="gm-title">{m.about_title()}</h1>
    <p class="gm-lede">{m.about_lede()}</p>
  </header>

  <Separator class="row-rule" />
  <section class="row" aria-labelledby="work">
    <h2 id="work" class="gm-h2 side">{m.about_work_heading()}</h2>
    <div class="main">
      <p class="gm-text">{m.about_work_intro()}</p>
      <dl class="work">
        {#each work as [title, body], i (i)}
          <div>
            <dt>{title()}</dt>
            <dd>{body()}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </section>

  <Separator class="row-rule" />
  <section class="row" aria-labelledby="outside">
    <h2 id="outside" class="gm-h2 side">{m.about_outside_heading()}</h2>
    <div class="main">
      <p class="gm-text">{@html m.about_outside_music({ woodshed })}</p>
      <p class="gm-text">{@html m.about_outside_creative({ studio })}</p>
    </div>
  </section>

  <Separator class="row-rule" />
  <section class="row" id="this-website" aria-labelledby="site">
    <h2 id="site" class="gm-h2 side">{m.about_site_heading()}</h2>
    <div class="main">
      <p class="gm-text">{m.about_site_intro()}</p>

      <h3>{m.about_whats_here()}</h3>
      <dl class="map">
        <div>
          <dt>
            <Button variant="link" href={resolve("/studio")} class="h-auto px-0">
              {m.nav_studio()}
            </Button>
          </dt>
          <dd>{m.about_map_studio()}</dd>
        </div>
        <div>
          <dt>
            <Button variant="link" href={resolve("/blog")} class="h-auto px-0">
              {m.nav_blog()}
            </Button>
          </dt>
          <dd>{m.about_map_blog()}</dd>
        </div>
        <div>
          <dt>
            <Button variant="link" href="{resolve('/studio')}?type=projects" class="h-auto px-0">
              {m.kind_projects()}
            </Button>
          </dt>
          <dd>{@html m.about_map_projects({ woodshed, narrator })}</dd>
        </div>
      </dl>

      <h3>{m.about_intro_heading()}</h3>
      <div class="router">
        <p class="gm-text">{m.about_intro_body()}</p>
        <figure class="board">
          <CircuitArt
            seed="about-{boardSeed}"
            colors={["#2bc4ff", "#c531f2", "#ff1f2a", MARKERS.yellow, MARKERS.green]}
            width={480}
            height={320}
          />
          <figcaption>
            <span>{m.about_board_caption({ number: boardSeed })}</span>
            <Button variant="outline" size="sm" onclick={() => boardSeed++}>
              <Shuffle data-icon="inline-start" aria-hidden="true" />{m.about_route_another()}
            </Button>
          </figcaption>
        </figure>
      </div>

      <h3>{m.about_built_heading()}</h3>
      <dl class="stack">
        {#each stack as [label, value], i (i)}
          <div>
            <dt>{label()}</dt>
            <dd>{value()}</dd>
          </div>
        {/each}
      </dl>

      <h3>{m.about_type_heading()}</h3>
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
  </section>

  {#if socials.length > 0}
    <Separator class="row-rule" />
    <section class="row" aria-labelledby="contact">
      <h2 id="contact" class="gm-h2 side">{m.about_say_hello()}</h2>
      <ul class="main socials">
        {#each socials as social (social.href)}
          <li>
            <a class="gm-inline-link social" href={social.href} rel="me noopener">
              <social.icon size={20} aria-hidden="true" />{social.label}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .about {
    padding-top: clamp(3rem, 8vw, 6rem);
  }
  .intro {
    display: grid;
    gap: 1.5rem;
    max-width: 52rem;
  }
  .intro .gm-lede {
    max-width: 44ch;
  }

  .row {
    display: grid;
    gap: 1.5rem;
    padding-top: 2rem;
    scroll-margin-top: 5rem;
  }
  @media (width >= 960px) {
    .row {
      grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
      gap: 3rem;
    }
    .side {
      position: sticky;
      top: 6rem;
      align-self: start;
    }
  }
  :global(.row-rule) {
    margin-top: clamp(4rem, 9vw, 7rem);
  }
  .main {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
  }
  h3 {
    margin-top: 1.5rem;
    font-size: 1.25rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .work {
    display: grid;
    gap: 1.25rem 2.5rem;
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
    font-size: 1.1rem;
  }
  .work dd {
    margin-top: 0.35rem;
    font-family: var(--font-gm-serif);
    font-size: 1.1rem;
    line-height: 1.55;
    color: var(--muted-foreground);
  }

  .map,
  .stack {
    display: grid;
    border-top: 1px solid var(--border);
  }
  .map div,
  .stack div {
    display: grid;
    gap: 0.25rem 2rem;
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--border);
  }
  @media (width >= 640px) {
    .map div,
    .stack div {
      grid-template-columns: 9rem minmax(0, 1fr);
    }
  }
  .map dt,
  .stack dt {
    font-weight: 600;
  }
  .stack dt {
    color: var(--muted-foreground);
    font-weight: 500;
  }
  .map dd {
    font-family: var(--font-gm-serif);
    font-size: 1.1rem;
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

  .brand {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }
  .brand :global(svg) {
    flex: none;
    margin-top: 0.3rem;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
  }
  .swatches li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    color: var(--muted-foreground);
  }
  .swatches li::before {
    content: "";
    width: 1.75rem;
    height: 4px;
    border-radius: 2px;
    background: var(--c);
  }
  .socials {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 2rem;
    font-size: 1.15rem;
  }
  .social {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
