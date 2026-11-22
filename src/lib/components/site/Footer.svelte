<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { Button } from "@repo/ui/button";
  import CircuitPaths from "./CircuitPaths.svelte";
  import LanguageMenu from "./LanguageMenu.svelte";
  import LogoMark from "./LogoMark.svelte";
  import StudioCover from "./StudioCover.svelte";
  import ThemeSwitch from "./ThemeSwitch.svelte";
  import { replayIntro, site } from "./intro.svelte";
  import { isFullscreenApp, name, nav, socials } from "#lib/config.ts";
  import { STUDIO } from "#lib/content/studio.ts";
  import { m } from "@repo/i18n/messages.js";

  const path = $derived(page.url?.pathname ?? "/");
  const year = new Date().getFullYear();
  const hint = $props.id();
  // The projects as the Studio holds them, so each can be drawn with its cover.
  const projects = STUDIO.projects.flatMap((item) =>
    item.media.type === "project" ? [{ item, project: item.media.project }] : [],
  );
</script>

{#if page.error || !isFullscreenApp(path)}
  <footer class="site-footer" data-site-chrome>
    <!-- The board again, hanging from the footer's top edge as it hangs from the header's. -->
    {#if site.board}
      <div class="board" aria-hidden="true"><CircuitPaths board={site.board} /></div>
    {/if}
    <div class="inner">
      <div class="who">
        <p class="name"><LogoMark size={40} class="shrink-0" />{name}</p>
        <p class="note">{m.footer_note()}</p>
        <!-- What the button does and its keyboard shortcut show under it on hover and
             keyboard focus, and are read out as its description. -->
        <p class="replay">
          <Button variant="outline" class="h-11" onclick={replayIntro} aria-describedby={hint}>
            <RotateCcw aria-hidden="true" />{m.footer_replay()}
          </Button>
          <span id={hint} class="gm-tip start wide">
            {m.footer_replay_hint()}
            <span class="keys">
              <kbd>Ctrl</kbd>+<kbd>{m.footer_replay_shift()}</kbd>+<kbd>G</kbd><kbd>M</kbd><kbd>E</kbd>
            </span>
          </span>
        </p>
      </div>

      <nav aria-label={m.footer_nav_label()} class="cols">
        <div class="projects">
          <h2><a href="{resolve('/studio')}?type=projects">{m.footer_projects()}</a></h2>
          <ul>
            {#each projects as { item, project } (project.slug)}
              <li>
                <span class="thumb" aria-hidden="true"><StudioCover {item} size={80} /></span>
                <!-- The link is named by the project alone. Its line is the link's
                     description, and the link's hit area covers the whole cell. -->
                <a href={project.href} aria-describedby="{hint}-{project.slug}">
                  {project.title}<ArrowRight aria-hidden="true" />
                </a>
                <span id="{hint}-{project.slug}" class="about">{project.summary}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="pages">
          <h2>{m.footer_site()}</h2>
          <ul>
            {#each nav as link (link.href)}
              <li><a href={resolve(link.href)}>{link.label}</a></li>
            {/each}
          </ul>
        </div>
        {#if socials.length > 0}
          <div class="elsewhere">
            <h2>{m.footer_elsewhere()}</h2>
            <ul>
              {#each socials as social (social.href)}
                <li>
                  <a href={social.href} rel="me noopener" class="social">
                    <social.icon size={16} aria-hidden="true" />{social.label}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </nav>
    </div>
    <!-- Under 860px the header keeps language and theme inside its menu, so the end
         of the page offers them again. A wide screen has both in the header, always
         in view. -->
    <div class="controls">
      <LanguageMenu named />
      <ThemeSwitch />
    </div>
    <p class="legal">
      <!-- A phone shows the year alone: the name stands at the top of this footer. -->
      <span>© {year} <span class="holder">{name}</span></span>
    </p>
  </footer>
{/if}

<style>
  .social {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* A solid surface, so nothing runs behind its links. The space above it is the
     same on every page. */
  .site-footer {
    position: relative;
    isolation: isolate;
    margin-top: clamp(3.5rem, 8vw, 6rem);
    border-top: 1px solid var(--border);
    background: var(--background);
    font-family: var(--font-gm-display);
    color: var(--foreground);
  }
  /* A slice of the site's board (a different one from the header's), at low strength,
     gone before the footer's first line of text. */
  .board {
    position: absolute;
    inset: 0 0 auto;
    z-index: -1;
    height: 2.75rem;
    overflow: hidden;
    pointer-events: none;
    opacity: 0.6;
    mask-image: linear-gradient(#000, transparent);
  }
  .board :global(svg) {
    position: absolute;
    inset: -62lvh 0 auto;
    height: 100lvh;
  }
  /* Four columns on one grid, evenly spaced: who this is, the projects two by two
     with a cover and a line each, the site's pages, and where else to find me. */
  .inner {
    display: grid;
    grid-template-columns: minmax(0, 17rem) minmax(0, 1fr) auto auto;
    gap: 2rem clamp(2rem, 4.5vw, 3.75rem);
    max-width: 76rem;
    margin-inline: auto;
    padding: 3.25rem clamp(1rem, 4vw, 3rem) 2rem;
  }
  .who {
    display: grid;
    align-content: start;
    gap: 0.75rem;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 650;
    font-size: 1.15rem;
    line-height: 1.2;
  }
  .note {
    font-family: var(--font-gm-serif);
    color: var(--muted-foreground);
    line-height: 1.5;
    text-wrap: pretty;
  }
  .replay {
    position: relative;
    width: fit-content;
    margin-top: 0.25rem;
  }
  .replay:has(:global(button:hover), :global(button:focus-visible)) .gm-tip {
    opacity: 1;
  }
  /* The shortcut as key caps, on their own line under the sentence. */
  .keys {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.4rem;
    color: var(--muted-foreground);
  }
  kbd {
    min-width: 1.6rem;
    padding: 0.15rem 0.4rem;
    border: 1px solid color-mix(in oklab, var(--foreground) 28%, var(--border));
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--muted);
    color: var(--foreground);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.3;
    text-align: center;
  }
  .cols {
    grid-column: 2 / -1;
    display: grid;
    grid-template-columns: subgrid;
  }
  h2 {
    font-size: 0.95rem;
    font-weight: 650;
    margin-bottom: 0.75rem;
  }
  h2 a {
    color: inherit;
  }
  ul {
    display: grid;
    gap: 0.4rem;
  }
  a {
    color: var(--muted-foreground);
    border-radius: 4px;
  }
  a:hover {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  a:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  /* A project is its cover, its name with an arrow, and one line about it. Only the
     name underlines. The link stretches over the whole cell, so the cover and the
     line press too. */
  .projects ul {
    grid-template-columns: 1fr 1fr;
    gap: 1.1rem 1.75rem;
  }
  .projects li {
    position: relative;
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr);
    align-content: start;
    gap: 0.1rem 0.75rem;
    color: var(--muted-foreground);
  }
  .thumb {
    position: relative;
    grid-row: 1 / span 2;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  /* At this size the picture stands alone, without the project's icon chip. */
  .thumb :global(.chip) {
    display: none;
  }
  .projects li a {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    width: fit-content;
    color: var(--foreground);
    font-weight: 600;
    line-height: 1.3;
  }
  .projects li a :global(svg) {
    flex: none;
    width: 0.95em;
    height: 0.95em;
    color: var(--muted-foreground);
    transition: transform 0.15s;
  }
  .projects li:hover a :global(svg) {
    color: var(--foreground);
    transform: translateX(0.15rem);
  }
  .projects li a::after {
    content: "";
    position: absolute;
    inset: -0.25rem;
  }
  .projects li a:focus-visible {
    outline: none;
  }
  .projects li:has(a:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 4px;
    border-radius: 6px;
  }
  .about {
    font-size: 0.875rem;
    line-height: 1.4;
    text-wrap: pretty;
  }
  .controls {
    display: none;
  }
  @media (width < 860px) {
    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      max-width: 76rem;
      margin-inline: auto;
      padding: 0 clamp(1rem, 4vw, 3rem) 1rem;
    }
  }
  .legal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    max-width: 76rem;
    margin-inline: auto;
    padding: 0 clamp(1rem, 4vw, 3rem) 2.5rem;
    font-size: 0.9rem;
    color: var(--muted-foreground);
  }
  @media (prefers-reduced-motion: reduce) {
    .projects li a :global(svg) {
      transition: none;
    }
    .projects li:hover a :global(svg) {
      transform: none;
    }
  }

  /* Narrower than four columns hold: who on top, the three lists under it. */
  @media (width < 1000px) {
    .inner {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }
    .who {
      grid-column: 1 / -1;
      max-width: 26rem;
    }
    .cols {
      grid-column: 1 / -1;
    }
  }
  /* Any touch screen: every link is tall enough for a thumb. */
  @media (pointer: coarse), (width < 640px) {
    ul {
      gap: 0;
    }
    h2 a,
    ul a,
    h2:has(a) {
      margin-bottom: 0;
    }
    .projects ul {
      gap: 0.5rem 1.75rem;
    }
    .projects li a {
      min-height: 0;
    }
  }
  /* A phone: one compact block. The name beside the logo, the note, replay. The
     projects two by two as bounded cells with their covers and no line (the line is
     still each link's description). The pages in one row and elsewhere in another.
     Then language and theme, which a phone's header keeps in its menu. */
  @media (width < 640px) {
    .inner {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.6rem;
      padding-block: 2.25rem 0;
    }
    .who {
      gap: 0.4rem;
    }
    .note {
      font-size: 0.9375rem;
      line-height: 1.4;
    }
    .replay {
      margin-top: 0;
    }
    .cols {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    h2,
    h2:has(a) {
      margin-bottom: 0.25rem;
    }
    h2 a {
      min-height: 0;
    }
    .projects {
      padding-bottom: 0.5rem;
    }
    .projects ul {
      gap: 0.5rem;
    }
    .projects li {
      grid-template-columns: 2rem minmax(0, 1fr);
      align-items: center;
      gap: 0 0.5rem;
      min-height: 2.75rem;
      padding: 0.3rem 0.4rem 0.3rem 0.35rem;
      border: 1px solid color-mix(in oklab, var(--foreground) 16%, var(--border));
      border-radius: var(--radius);
      background: var(--card);
    }
    .thumb {
      grid-row: auto;
      width: 2rem;
      height: 2rem;
      border-radius: 0.4rem;
    }
    .projects li a {
      font-size: 0.9375rem;
      white-space: nowrap;
    }
    .projects li a::after {
      inset: 0;
    }
    .projects li:has(a:focus-visible) {
      outline-offset: 2px;
      border-radius: var(--radius);
    }
    /* The line about a project, and the headings of the two rows of links, are
       kept for a screen reader and not drawn. */
    .about,
    .pages h2,
    .elsewhere h2,
    .holder {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* The pages in one row, elsewhere in the next. */
    .pages,
    .elsewhere {
      border-top: 1px solid var(--border);
    }
    .pages ul,
    .elsewhere ul {
      display: flex;
      flex-wrap: wrap;
      gap: 0 1.25rem;
    }
    .pages a,
    .elsewhere a {
      color: var(--foreground);
    }
    .controls {
      margin-inline: clamp(1rem, 4vw, 3rem);
      padding: 0.4rem 0 0;
      border-top: 1px solid var(--border);
    }
    .legal {
      gap: 0 1rem;
      padding-bottom: 0.5rem;
      font-size: 0.875rem;
    }
  }
</style>
