<script lang="ts">
  import { resolve } from "$app/paths";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { Button } from "@repo/ui/button";
  import { Separator } from "@repo/ui/separator";
  import CircuitArt from "#lib/components/site/CircuitArt.svelte";
  import LogoMark from "#lib/components/site/LogoMark.svelte";
  import { socials } from "#lib/config.ts";
  import { MARKERS } from "#lib/circuit/router.ts";

  const work = [
    {
      title: "Interfaces",
      body: "Svelte, React and TypeScript. I care about the details people feel and their experience using the interfaces that I build: quick loads, clear states, consistent UIs and pages that are accessible.",
    },
    {
      title: "APIs and data",
      body: "Node.js, Python, Temporal, Airflow, GraphQL and PostgreSQL. Schemas that model the domain honestly, Pipelines that are reliable, and APIs that are pleasant to call.",
    },
    {
      title: "Infrastructure",
      body: "Containers, Kubernetes, CI and a homelab managed with Nix, where I run my own services and try ideas before they go anywhere else.",
    },
    {
      title: "Tools I build for myself",
      body: "Woodshed, Narrator and Listplay started as things I wanted to exist: a practice room for my instruments, a way to listen to long reads, and my most-played songs turned into a monthly playlist.",
    },
  ];

  const stack = [
    ["Framework", "SvelteKit 2 with Svelte 5 runes"],
    ["Styling", "Tailwind CSS 4"],
    ["Posts", "Markdown, compiled by MDsveX"],
    ["Data", "PostgreSQL through Drizzle ORM, session cookies for accounts"],
    ["Languages", "Paraglide, set up for English, Spanish, French and Haitian Creole which are the 4 languages that I speak"],
    ["Build", "A Vite+ monorepo with shared packages, built by a Nix flake"],
    ["Hosting", "A Node server in my homelab"],
  ];

  let boardSeed = $state(1);
</script>

<svelte:head>
  <title>About | Gaspard Michel Etienne</title>
  <meta
    name="description"
    content="About Gaspard Michel Etienne, a full-stack software engineer in Boston, and about this website."
  />
</svelte:head>

<div class="gm-page about">
  <header class="intro">
    <h1 class="gm-title">Hi, I'm Gaspard.</h1>
    <p class="gm-lede">
      I'm a full-stack software engineer based in Boston. I've spent my career building web applications
      that people rely on at work during the day, and my evenings building fun tools I want for myself.
    </p>
  </header>

  <Separator class="row-rule" />
  <section class="row" aria-labelledby="work">
    <h2 id="work" class="gm-h2 side">What I work on</h2>
    <div class="main">
      <p class="gm-text">
       I'm inquisitive. I like owning features end to end. I love digging deep to understand the problem space and working across the stack to come up with inovative solutions. From the infrastucture to the data layer, to the back-end, and to the user interface I enjoy working on each level. I love seeing the whole path which is what allows me to craft great user experiences for clients.
      </p>
      <dl class="work">
        {#each work as item (item.title)}
          <div>
            <dt>{item.title}</dt>
            <dd>{item.body}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </section>

  <Separator class="row-rule" />
  <section class="row" aria-labelledby="outside">
    <h2 id="outside" class="gm-h2 side">Outside work</h2>
    <div class="main">
      <p class="gm-text">
        Away from the keyboard I'm usually,listening to music, playing soccer, travelling somewhere new, or
        experimenting in the kitchen. Music takes up the rest: I try to practise piano most days, mostly just sitting down relaxing and jamming. I'm
        slowly learning a few other instruments, which is how <a
          class="gm-inline-link"
          href="/music">Woodshed</a
        > started.
      </p>
      <p class="gm-text">
        I also doodle here and there, paint sometimes and do a ton of other things. Mostly as a way to relax and try to connect with my creative side, which you'll find in my <a
          class="gm-inline-link"
          href="{resolve('studio')}?type=drawings"
        >Studio</a>

        .
      </p>
    </div>
  </section>

  <Separator class="row-rule" />
  <section class="row" id="this-website" aria-labelledby="site">
    <h2 id="site" class="gm-h2 side">About this website</h2>
    <div class="main">
      <p class="gm-text">
        This site is my little corner of the internet: one place for everything I make and want to
        share, from apps and writing to music, drawings, paintings, photos and videos etc. It's less a polished portfolio than a workshop with the
        door open, so expect it to change as I build.
      </p>

      <h3>What's here</h3>
      <dl class="map">
        <div>
          <dt>
            <Button
              variant="link"
              href={resolve('studio')}
              class="h-auto px-0"
            >Studio</Button>
          </dt>

          <dd>
            Everything I make, from apps to doodles, each kind given the same space. See it as one
            wall or kind by kind.
          </dd>
        </div>
        <div>
          <dt>
            <Button
              variant="link"
              href={resolve('blog')}
              class="h-auto px-0"
            >Blog</Button>
          </dt>

          <dd>Notes on what I'm building and learning.</dd>
        </div>
        <div>
          <dt>
            <Button
              variant="link"
              href="{resolve('studio')}?type=projects"
              class="h-auto px-0"
            >Projects</Button>
          </dt>
          <dd>
            Apps and Tools that I want to use. some expamples are: <a class="gm-inline-link" href="/music"
              >Woodshed</a
            >
            and <a class="gm-inline-link" href="/pdf">Narrator</a>.
          </dd>
        </div>
      </dl>

      <h3>The intro</h3>
      <div class="router">
        <p class="gm-text">
          The circuits on the home page are drawn fresh on every visit. A small router written for
          this site lays traces out from the logo on a 16 pixel grid. Traces only run straight or
          at 45 degrees and never touch each other, the way a circuit board autorouter works. Then
          the G and E of the logo slide apart and an M is routed between them. Click the initials
          to fold them back and route a new board.
        </p>
        <figure class="board">
          <CircuitArt
            seed="about-{boardSeed}"
            colors={["#2bc4ff", "#c531f2", "#ff1f2a", MARKERS.yellow, MARKERS.green]}
            width={480}
            height={320}
          />
          <figcaption>
            <span>Board {boardSeed}, routed by the same code.</span>
            <Button variant="outline" size="sm" onclick={() => boardSeed++}>
              <Shuffle data-icon="inline-start" aria-hidden="true" />Route another
            </Button>
          </figcaption>
        </figure>
      </div>

      <h3>How it's built</h3>
      <dl class="stack">
        {#each stack as [label, value] (label)}
          <div>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        {/each}
      </dl>

      <h3>Type and colour</h3>
      <div class="brand">
        <LogoMark size={64} />
        <p class="gm-text">
          The mark is a G and an E sharing one ring. Headings are set in Bricolage Grotesque and
          long text in Newsreader. The colours come from the logo's gradient and from the colors in
          some of my doodles.
        </p>
      </div>
      <ul class="swatches" aria-label="Site colours">
        <li style="--c: var(--gm-red)">Red</li>
        <li style="--c: var(--gm-blue)">Cobalt</li>
        <li style="--c: var(--gm-green)">Green</li>
        <li style="--c: var(--gm-violet)">Violet</li>
        <li style="--c: var(--gm-yellow)">Yellow</li>
      </ul>
    </div>
  </section>

  {#if socials.length > 0}
    <Separator class="row-rule" />
  <section class="row" aria-labelledby="contact">
      <h2 id="contact" class="gm-h2 side">Say hello</h2>
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
