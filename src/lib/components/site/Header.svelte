<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { MediaQuery } from "svelte/reactivity";
  import { toggleMode } from "mode-watcher";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import Menu from "@lucide/svelte/icons/menu";
  import * as DropdownMenu from "@repo/ui/dropdown-menu";
  import { Button, buttonVariants } from "@repo/ui/button";
  import CircuitBackground from "./CircuitBackground.svelte";
  import LanguageMenu from "./LanguageMenu.svelte";
  import LogoMark from "./LogoMark.svelte";
  import { replayIntro, shortcutListener } from "./intro.svelte";
  import { isFullscreenApp, nav, shortName } from "#lib/config.ts";
  import { m } from "@repo/i18n/messages.js";

  const path = $derived(page.url?.pathname ?? "/");
  const narrow = new MediaQuery("(width < 640px)");
  const isCurrent = (href: string) =>
    path === href || (href !== "/" && path.startsWith(`${href}/`));

  // Ctrl+Shift+G, M, E replays the logo intro from any site page.
  const listen = shortcutListener(replayIntro);
  function onkeydown(event: KeyboardEvent) {
    if (listen(event)) event.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<!-- An error page is drawn by the site, wherever the address pointed. -->
{#if page.error || !isFullscreenApp(path)}
  <CircuitBackground />
  <header class="site-header" data-site-chrome>
    <div class="inner">
      <a href={resolve("/")} class="brand" aria-label={m.header_home_label({ name: shortName })}>
        <LogoMark size={30} class="shrink-0" />
        <span class="brand-name">{shortName}</span>
      </a>

      <div class="actions">
        <nav aria-label={m.header_nav_label()} class="links">
          <ul>
            {#each nav as link (link.href)}
              <li>
                <Button
                  variant="ghost"
                  href={resolve(link.href)}
                  aria-current={isCurrent(link.href) ? "page" : undefined}
                  class="nav-link"
                >
                  {link.label}
                </Button>
              </li>
            {/each}
          </ul>
        </nav>

        {#if narrow.current}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger class={buttonVariants({ variant: "ghost" })}>
              <Menu class="size-4" aria-hidden="true" />
              <!-- A phone has no room for the label beside the name: the icon stands alone. -->
              <span class="max-[480px]:sr-only">{m.header_menu()}</span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="min-w-44" preventScroll={false}>
              {#each nav as link (link.href)}
                <DropdownMenu.Item class="min-h-11 text-base">
                  {#snippet child({ props })}
                    <a
                      {...props}
                      href={resolve(link.href)}
                      aria-current={isCurrent(link.href) ? "page" : undefined}
                    >
                      <span class={isCurrent(link.href) ? "site-menu-current" : undefined}>
                        {link.label}
                      </span>
                    </a>
                  {/snippet}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}

        <LanguageMenu />

        <Button variant="ghost" size="icon" onclick={toggleMode}>
          <Sun class="dark:hidden" aria-hidden="true" />
          <Moon class="hidden dark:block" aria-hidden="true" />
          <span class="sr-only">{m.header_toggle_theme()}</span>
        </Button>
      </div>
    </div>
  </header>
{/if}

<style>
  .site-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: color-mix(in oklab, var(--background) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-gm-display);
    color: var(--foreground);
  }
  .inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    max-width: 76rem;
    min-width: 0;
    height: 4rem;
    margin-inline: auto;
    padding-inline: clamp(1rem, 4vw, 3rem);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    font-weight: 650;
    font-size: 1.05rem;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  /* The mark keeps its size. Below 360px the name no longer fits beside the
     three buttons, so the mark stands alone (the link keeps its label). */
  @media (width < 360px) {
    .brand-name {
      display: none;
    }
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: none;
  }
  .links {
    display: none;
  }
  @media (width >= 640px) {
    .links {
      display: block;
    }
  }
  .links ul {
    display: flex;
    gap: 0.25rem;
    white-space: nowrap;
  }
  /* Nav links are kit ghost buttons; the current page carries a short stretch of
     the logo's gradient. */
  .links :global(.nav-link) {
    position: relative;
    font-family: var(--font-gm-display);
    font-size: 0.975rem;
    color: var(--muted-foreground);
  }
  .links :global(.nav-link:hover),
  .links :global(.nav-link[aria-current="page"]) {
    color: var(--foreground);
  }
  .links :global(.nav-link[aria-current="page"])::after {
    content: "";
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 0.3rem;
    height: 2px;
    border-radius: 2px;
    background: var(--gm-brand);
  }
  /* The phone menu marks the current page with the same stretch of gradient. Its
     items are portalled out of the header, hence :global. */
  :global(.site-menu-current) {
    padding-block: 0.3rem;
    font-weight: 650;
    background: var(--gm-brand) no-repeat left bottom / 100% 2px;
  }
  .brand:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 0.5rem;
  }
</style>
