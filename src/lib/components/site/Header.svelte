<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { MediaQuery } from "svelte/reactivity";
  import { toggleMode } from "mode-watcher";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import Menu from "@lucide/svelte/icons/menu";
  import X from "@lucide/svelte/icons/x";
  import { fade } from "svelte/transition";
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
  let menuOpen = $state(false);
  let menuPanel = $state<HTMLElement | null>(null);
  let menuByPointer = false;
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

        <!-- Under 640px the header is the brand and one menu button. The menu is a
             panel as wide as the screen, with the pages, the language and the theme. -->
        {#if narrow.current}
          <DropdownMenu.Root bind:open={menuOpen}>
            <DropdownMenu.Trigger
              class="{buttonVariants({ variant: 'ghost' })} h-11 min-w-11 px-3 data-[state=open]:bg-accent"
              onpointerdown={() => (menuByPointer = true)}
              onkeydown={() => (menuByPointer = false)}
            >
              {#if menuOpen}
                <X class="size-5" aria-hidden="true" />
              {:else}
                <Menu class="size-5" aria-hidden="true" />
              {/if}
              <!-- A phone has no room for the label beside the name: the icon stands alone. -->
              <span class="max-[480px]:sr-only">{m.header_menu()}</span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <!-- Opened from the keyboard, focus lands on the first row. Opened by a tap
                   it goes to the panel, so no row looks chosen. -->
              <DropdownMenu.ContentStatic
                bind:ref={menuPanel}
                class="site-menu-panel"
                preventScroll={false}
                onOpenAutoFocus={(event) => {
                  if (!menuByPointer) return;
                  event.preventDefault();
                  menuPanel?.focus();
                }}
              >
                {#each nav as link (link.href)}
                  <DropdownMenu.Item class="site-menu-row">
                    {#snippet child({ props })}
                      <a
                        {...props}
                        href={resolve(link.href)}
                        aria-current={isCurrent(link.href) ? "page" : undefined}
                      >
                        <link.icon aria-hidden="true" />
                        {link.label}
                      </a>
                    {/snippet}
                  </DropdownMenu.Item>
                {/each}
                <LanguageMenu rows />
                <DropdownMenu.Item class="site-menu-row" closeOnSelect={false} onSelect={toggleMode}>
                  <Sun class="dark:hidden" aria-hidden="true" />
                  <Moon class="hidden dark:block" aria-hidden="true" />
                  {m.header_toggle_theme()}
                </DropdownMenu.Item>
              </DropdownMenu.ContentStatic>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}

        <div class="tools">
          <LanguageMenu />
          <Button variant="ghost" size="icon" class="size-11" onclick={toggleMode}>
            <Sun class="dark:hidden" aria-hidden="true" />
            <Moon class="hidden dark:block" aria-hidden="true" />
            <span class="sr-only">{m.header_toggle_theme()}</span>
          </Button>
        </div>
      </div>
    </div>
  </header>
  <!-- Dims the page under the open phone menu. Outside the header, whose blur would
       otherwise pin it to the header's own box. -->
  {#if menuOpen && narrow.current}
    <div class="scrim" transition:fade={{ duration: 150 }}></div>
  {/if}
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
  .links,
  .tools {
    display: none;
  }
  @media (width >= 640px) {
    .links {
      display: block;
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }
  .links ul {
    display: flex;
    gap: 0.25rem;
    white-space: nowrap;
  }
  /* Nav links are kit ghost buttons; the current page carries a short stretch of
     the logo's gradient, and the others draw it in on hover. */
  .links :global(.nav-link) {
    position: relative;
    height: 2.75rem;
    font-family: var(--font-gm-display);
    font-size: 1rem;
    color: var(--muted-foreground);
  }
  .links :global(.nav-link:hover),
  .links :global(.nav-link[aria-current="page"]) {
    color: var(--foreground);
  }
  .links :global(.nav-link)::after {
    content: "";
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 0.4rem;
    height: 2px;
    border-radius: 2px;
    background: var(--gm-brand);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.2s;
  }
  .links :global(.nav-link:hover)::after,
  .links :global(.nav-link[aria-current="page"])::after {
    transform: none;
  }
  .links :global(.nav-link[aria-current="page"]) {
    font-weight: 650;
  }

  .scrim {
    position: fixed;
    inset: 4rem 0 0;
    z-index: 40;
    background: color-mix(in oklab, var(--foreground) 45%, transparent);
  }
  :global(.dark) .scrim {
    background: rgb(0 0 0 / 0.6);
  }
  /* The phone menu: a panel as wide as the screen, right under the header. It is
     portalled out of the header, hence :global. */
  :global(.site-menu-panel) {
    position: fixed;
    top: 4rem;
    inset-inline: 0;
    z-index: 50;
    max-height: calc(100dvh - 4rem);
    overflow-y: auto;
    padding: 0.25rem clamp(0.5rem, 2vw, 2.5rem) 0.75rem;
    background: var(--background);
    color: var(--foreground);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 1.5rem 2rem -1.5rem rgb(0 0 0 / 0.35);
    font-family: var(--font-gm-display);
    outline: none;
    animation: site-menu-in 0.16s ease-out;
  }
  @keyframes -global-site-menu-in {
    from {
      opacity: 0;
      transform: translateY(-0.4rem);
    }
  }
  :global(.site-menu-row) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.25rem;
    padding-inline: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    font-size: 1.125rem;
    cursor: default;
    user-select: none;
    outline: none;
  }
  :global(.site-menu-row:last-child) {
    margin-top: 0.75rem;
    border-top: 1px solid var(--border);
    border-bottom: 0;
  }
  :global(.site-menu-row svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--muted-foreground);
  }
  :global(.site-menu-row[data-highlighted]) {
    background: var(--accent);
    color: var(--accent-foreground);
  }
  /* The page you are on: heavier type and a bar of the logo's gradient. */
  :global(.site-menu-row[aria-current="page"]) {
    font-weight: 700;
  }
  :global(.site-menu-row[aria-current="page"] svg) {
    color: var(--foreground);
  }
  :global(.site-menu-row[aria-current="page"])::before {
    content: "";
    position: absolute;
    inset: 0.6rem auto 0.6rem -0.25rem;
    width: 4px;
    border-radius: 4px;
    background: var(--gm-brand-down);
  }
  .brand:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 0.5rem;
  }
</style>
