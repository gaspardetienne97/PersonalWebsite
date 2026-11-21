<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import Lock from "@lucide/svelte/icons/lock";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { Button } from "@repo/ui/button";
  import LogoMark from "./LogoMark.svelte";
  import { replayIntro } from "./intro.svelte";
  import { isFullscreenApp, name, nav, socials } from "#lib/config.ts";
  import { projects } from "#lib/content/projects.ts";
  import { m } from "@repo/i18n/messages.js";

  const path = $derived(page.url?.pathname ?? "/");
  const year = new Date().getFullYear();
  const hint = $props.id();
</script>

{#if page.error || !isFullscreenApp(path)}
  <footer class="site-footer" data-site-chrome>
    <div class="inner">
      <div class="who">
        <LogoMark size={40} />
        <p class="name">{name}</p>
        <p class="note">{m.footer_note()}</p>
        <!-- What the button does and its keyboard shortcut show under it on hover and
             keyboard focus, and are read out as its description. -->
        <p class="replay">
          <Button variant="outline" class="h-11" onclick={replayIntro} aria-describedby={hint}>
            <RotateCcw aria-hidden="true" />{m.footer_replay()}
          </Button>
          <span id={hint} class="gm-tip start wide">{m.footer_replay_hint()}</span>
        </p>
      </div>

      <nav aria-label={m.footer_nav_label()} class="cols">
        <div class="projects">
          <h2><a href="{resolve('/studio')}?type=projects">{m.footer_projects()}</a></h2>
          <ul>
            {#each projects as project (project.slug)}
              <li>
                <!-- The link is named by the project alone. Its line is the link's
                     description, and the link's hit area covers both. -->
                <a href={project.href} aria-describedby="{hint}-{project.slug}">{project.title}</a>
                <span id="{hint}-{project.slug}" class="about">{project.summary}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div>
          <h2>{m.footer_site()}</h2>
          <ul>
            {#each nav as link (link.href)}
              <li><a href={resolve(link.href)}>{link.label}</a></li>
            {/each}
          </ul>
        </div>
        {#if socials.length > 0}
          <div>
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
    <p class="legal">
      <span>© {year} {name}</span>
      <a href={resolve("/private")} class="social owner">
        <Lock size={16} aria-hidden="true" />{m.footer_private()}
      </a>
    </p>
  </footer>
{/if}

<style>
  .social {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* A solid surface, so the board stops at the footer and never runs behind its links.
     The space above it is the same on every page. */
  .site-footer {
    margin-top: clamp(3.5rem, 8vw, 6rem);
    border-top: 1px solid var(--border);
    background: var(--background);
    font-family: var(--font-gm-display);
    color: var(--foreground);
  }
  /* Who this is, then the links right beside it: projects with a line each, the
     site's pages, and where else to find me. */
  .inner {
    display: grid;
    grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
    gap: 2.5rem clamp(2rem, 6vw, 5rem);
    max-width: 76rem;
    margin-inline: auto;
    padding: 3rem clamp(1rem, 4vw, 3rem) 2rem;
  }
  .who {
    display: grid;
    align-content: start;
    gap: 0.6rem;
  }
  .name {
    font-weight: 650;
    font-size: 1.15rem;
    margin-top: 0.4rem;
  }
  .note {
    font-family: var(--font-gm-serif);
    color: var(--muted-foreground);
    line-height: 1.5;
  }
  .replay {
    position: relative;
    width: fit-content;
    margin-top: 0.4rem;
  }
  .replay:has(:global(button:hover), :global(button:focus-visible)) .gm-tip {
    opacity: 1;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 22rem) auto auto;
    justify-content: space-between;
    gap: 2rem clamp(1.5rem, 4vw, 4rem);
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
  /* A project is its name over one line about it. Only the name underlines. The
     link stretches over the whole row, so the line under it presses too. */
  .projects ul {
    gap: 0.7rem;
  }
  .projects li {
    position: relative;
    display: grid;
    gap: 0.1rem;
    color: var(--muted-foreground);
  }
  .projects li a {
    color: var(--foreground);
    font-weight: 550;
  }
  .projects li a::after {
    content: "";
    position: absolute;
    inset: 0;
  }
  .projects li a:focus-visible {
    outline: none;
  }
  .projects li:has(a:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .about {
    font-size: 0.875rem;
    line-height: 1.4;
    text-wrap: pretty;
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
  /* The owner's own door: there for the owner, quiet for everyone else. */
  .owner {
    color: var(--gm-dim);
  }

  @media (width < 900px) {
    .inner {
      grid-template-columns: minmax(0, 1fr);
    }
    .who {
      max-width: 24rem;
    }
  }
  /* A phone, or any touch screen: every link is a row tall enough for a thumb, with
     a rule under it so the row can be seen. */
  @media (pointer: coarse), (width < 640px) {
    ul,
    .projects ul {
      gap: 0;
    }
    /* Headings take a row's height too, linked or not, so the columns line up. */
    h2 {
      margin-bottom: 0;
    }
    h2,
    h2 a,
    ul a,
    .legal a {
      display: flex;
      align-items: center;
      min-height: 2.75rem;
    }
    .projects li {
      align-content: center;
      min-height: 2.75rem;
      padding-block: 0.6rem;
    }
    .projects li a {
      display: inline;
      min-height: 0;
    }
    ul {
      border-top: 1px solid var(--border);
    }
    li {
      border-bottom: 1px solid var(--border);
    }
  }
  /* A phone: projects across the full width, then pages and elsewhere side by side,
     and the last two lines each on its own row. */
  @media (width < 640px) {
    .inner {
      padding-top: 2.25rem;
    }
    .cols {
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem 1.5rem;
      justify-content: stretch;
    }
    .projects {
      grid-column: 1 / -1;
    }
    .legal {
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
    }
  }
</style>
