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
</script>

{#if page.error || !isFullscreenApp(path)}
  <footer class="site-footer" data-site-chrome>
    <div class="inner">
      <div class="who">
        <LogoMark size={40} />
        <p class="name">{name}</p>
        <p class="note">{m.footer_note()}</p>
        <p class="replay">
          <Button variant="outline" class="h-11" onclick={replayIntro}>
            <RotateCcw aria-hidden="true" />{m.footer_replay()}
          </Button>
          <!-- A keyboard shortcut is no use on a touch screen. -->
          <span class="keys">
            {m.footer_replay_or()} <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>G</kbd> <kbd>M</kbd> <kbd>E</kbd>
          </span>
        </p>
      </div>

      <nav aria-label={m.footer_nav_label()} class="cols">
        <div>
          <h2>{m.footer_site()}</h2>
          <ul>
            {#each nav as link (link.href)}
              <li><a href={resolve(link.href)}>{link.label}</a></li>
            {/each}
          </ul>
        </div>
        <div>
          <h2><a href="{resolve('/studio')}?type=projects">{m.footer_projects()}</a></h2>
          <ul>
            {#each projects as project (project.slug)}
              <li><a href={project.href}>{project.title}</a></li>
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
      <a href={resolve("/private")} class="social"><Lock size={16} aria-hidden="true" />{m.footer_private()}</a>
    </p>
  </footer>
{/if}

<style>
  .social {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* A solid surface, so the board stops at the footer and never runs behind its links. */
  .site-footer {
    margin-top: clamp(4rem, 10vw, 8rem);
    border-top: 1px solid var(--border);
    background: var(--background);
    font-family: var(--font-gm-display);
    color: var(--foreground);
  }
  .inner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2.5rem 4rem;
    max-width: 76rem;
    margin-inline: auto;
    padding: 3rem clamp(1rem, 4vw, 3rem) 2rem;
  }
  .who {
    display: grid;
    gap: 0.6rem;
    max-width: 22rem;
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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-top: 0.4rem;
  }
  .keys {
    font-size: 0.85rem;
    color: var(--muted-foreground);
  }
  kbd {
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--muted);
    color: var(--foreground);
  }
  .cols {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem 4rem;
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

  /* A phone, or any touch screen: no shortcut keys, two columns of links, and every
     link a row tall enough for a thumb. */
  @media (hover: none), (width < 640px) {
    .keys {
      display: none;
    }
  }
  @media (pointer: coarse), (width < 640px) {
    ul {
      gap: 0;
    }
    /* Headings take a row's height too, linked or not, so the columns line up. */
    h2 {
      margin-bottom: 0;
    }
    h2,
    ul a,
    h2 a,
    .legal a {
      display: flex;
      align-items: center;
      min-height: 2.75rem;
    }
  }
  @media (width < 640px) {
    .cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem 1rem;
      width: 100%;
    }
  }
</style>
