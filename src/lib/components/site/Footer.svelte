<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { Button } from "@repo/ui/button";
  import LogoMark from "./LogoMark.svelte";
  import { replayIntro } from "./intro.svelte";
  import { isFullscreenApp, name, nav, socials } from "$lib/config";
  import { projects } from "$lib/content/projects";

  const path = $derived(page.url?.pathname ?? "/");
  const year = new Date().getFullYear();
</script>

{#if !isFullscreenApp(path)}
  <footer class="site-footer" data-site-chrome>
    <div class="inner">
      <div class="who">
        <LogoMark size={40} />
        <p class="name">{name}</p>
        <p class="note">Software engineer in Boston. This site runs on a server in my homelab.</p>
        <p class="replay">
          <Button variant="link" class="h-auto px-0" onclick={replayIntro}>Replay the intro</Button>
          <span class="keys">
            or <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>G</kbd> <kbd>M</kbd> <kbd>E</kbd>
          </span>
        </p>
      </div>

      <nav aria-label="Footer" class="cols">
        <div>
          <h2>Site</h2>
          <ul>
            {#each nav as link (link.href)}
              <li><a href={resolve(link.href)}>{link.label}</a></li>
            {/each}
          </ul>
        </div>
        <div>
          <h2>Projects</h2>
          <ul>
            {#each projects as project (project.slug)}
              <li><a href={project.href}>{project.title}</a></li>
            {/each}
          </ul>
        </div>
        {#if socials.length > 0}
          <div>
            <h2>Elsewhere</h2>
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
    <p class="legal">© {year} {name}</p>
  </footer>
{/if}

<style>
  .social {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .site-footer {
    margin-top: clamp(4rem, 10vw, 8rem);
    border-top: 1px solid var(--border);
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
    align-items: baseline;
    gap: 0.25rem 0.6rem;
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
    max-width: 76rem;
    margin-inline: auto;
    padding: 0 clamp(1rem, 4vw, 3rem) 2.5rem;
    font-size: 0.9rem;
    color: var(--muted-foreground);
  }
</style>
