<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { MediaQuery } from "svelte/reactivity";
  import { mode, setMode, toggleMode } from "mode-watcher";
  import Check from "@lucide/svelte/icons/check";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import Menu from "@lucide/svelte/icons/menu";
  import X from "@lucide/svelte/icons/x";
  import { fade } from "svelte/transition";
  import * as DropdownMenu from "@repo/ui/dropdown-menu";
  import { Button } from "@repo/ui/button";
  import CircuitBackground from "./CircuitBackground.svelte";
  import LanguageMenu from "./LanguageMenu.svelte";
  import LogoMark from "./LogoMark.svelte";
  import { replayIntro, shortcutListener } from "./intro.svelte";
  import { isFullscreenApp, nav, shortName } from "#lib/config.ts";
  import { projects } from "#lib/content/projects.ts";
  import { m } from "@repo/i18n/messages.js";

  const path = $derived(page.url?.pathname ?? "/");
  const narrow = new MediaQuery("(width < 640px)");
  let menuOpen = $state(false);
  let menuPanel = $state<HTMLElement | null>(null);
  let menuByPointer = false;
  // A project that lives inside the site's pages (Listplay) belongs to the Studio.
  const inStudio = $derived(
    projects.some(
      ({ href, fullscreen }) =>
        !fullscreen && !href.includes("#") && (path === href || path.startsWith(`${href}/`)),
    ),
  );
  const isCurrent = (href: string) =>
    path === href ||
    (href !== "/" && path.startsWith(`${href}/`)) ||
    (href === "/studio" && inStudio);
  const themes = [
    { value: "light", icon: Sun, label: () => m.header_theme_light() },
    { value: "dark", icon: Moon, label: () => m.header_theme_dark() },
  ] as const;

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
            <!-- The name stays "Site menu" for a screen reader; the eye gets "Menu". -->
            <DropdownMenu.Trigger
              class="gm-icon-btn menu-button"
              aria-label={m.header_menu()}
              onpointerdown={() => (menuByPointer = true)}
              onkeydown={() => (menuByPointer = false)}
            >
              {#if menuOpen}
                <X aria-hidden="true" />
              {:else}
                <Menu aria-hidden="true" />
              {/if}
              <span class="menu-word" aria-hidden="true">{m.header_menu_short()}</span>
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
                <!-- Theme: both choices shown, the one in use marked. Choosing keeps the menu open. -->
                <DropdownMenu.Group class="site-menu-group">
                  <DropdownMenu.GroupHeading class="site-menu-heading">
                    {#if mode.current === "dark"}<Moon aria-hidden="true" />{:else}<Sun aria-hidden="true" />{/if}
                    {m.header_theme()}
                  </DropdownMenu.GroupHeading>
                  <DropdownMenu.RadioGroup
                    value={mode.current ?? "light"}
                    onValueChange={(value) => setMode(value as "light" | "dark")}
                    class="site-menu-options"
                  >
                    {#each themes as theme (theme.value)}
                      <DropdownMenu.PlainRadioItem
                        value={theme.value}
                        closeOnSelect={false}
                        class="site-menu-option"
                      >
                        {#snippet children({ checked })}
                          <span class="site-menu-check">
                            {#if checked}<Check aria-hidden="true" />{/if}
                          </span>
                          {theme.label()}
                          <theme.icon class="site-menu-glyph" aria-hidden="true" />
                        {/snippet}
                      </DropdownMenu.PlainRadioItem>
                    {/each}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Group>
              </DropdownMenu.ContentStatic>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}

        <div class="tools">
          <LanguageMenu />
          <!-- The icon is the theme in use. The tip, which is also the button's name,
               says what a press gives. It shows on hover and on keyboard focus. -->
          <button type="button" class="gm-icon-btn theme-button" onclick={toggleMode}>
            <Sun class="dark:hidden" aria-hidden="true" />
            <Moon class="hidden dark:block" aria-hidden="true" />
            <span class="gm-tip dark:hidden">{m.header_theme_to_dark()}</span>
            <span class="gm-tip hidden dark:block">{m.header_theme_to_light()}</span>
          </button>
        </div>
      </div>
    </div>
  </header>
  <!-- Dims and blurs the page under the open phone menu. -->
  {#if menuOpen && narrow.current}
    <div class="scrim" transition:fade={{ duration: 150 }}></div>
  {/if}
{/if}

<style>
  .site-header {
    position: sticky;
    top: 0;
    z-index: 50;
    /* Opaque: scrolled content never shows through as a smudge. */
    background: var(--background);
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
      gap: 0.5rem;
      margin-left: 0.5rem;
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

  /* The phone's menu button: the shared bordered shape, an icon and the word. Under
     360px the word goes and the button is a square. */
  :global(.menu-button svg) {
    width: 1.375rem;
    height: 1.375rem;
  }
  @media (width < 360px) {
    .menu-word {
      display: none;
    }
  }

  /* Under the open phone menu the page is dimmed and blurred until it cannot be read. */
  .scrim {
    position: fixed;
    inset: 4rem 0 0;
    z-index: 40;
    background: color-mix(in oklab, var(--foreground) 55%, transparent);
    backdrop-filter: blur(12px);
  }
  :global(.dark) .scrim {
    background: rgb(0 0 0 / 0.82);
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
    padding: 0.25rem clamp(0.75rem, 2vw, 2.5rem) 1rem;
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
  @media (prefers-reduced-motion: reduce) {
    :global(.site-menu-panel) {
      animation: none;
    }
  }
  :global(.site-menu-row) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-height: 3.5rem;
    padding-inline: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    font-size: 1.25rem;
    cursor: default;
    user-select: none;
    outline: none;
  }
  :global(.site-menu-row svg) {
    flex: none;
    width: 1.375rem;
    height: 1.375rem;
    color: var(--muted-foreground);
  }
  /* Under the pointer a row tints. Reached by keyboard it gets the site's blue
     outline, the one the desktop links use, so focus never looks like a choice. */
  :global(.site-menu-row[data-highlighted]) {
    background: var(--accent);
    color: var(--accent-foreground);
  }
  :global(:is(.site-menu-row, .site-menu-option)[data-highlighted]:not(:hover)) {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
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

  /* Language and theme: a heading over bounded options, two to a row. The one in
     use carries a check mark, heavier type and a darker edge. LanguageMenu draws
     its rows with the same classes. */
  :global(.site-menu-heading) {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 1.1rem 0.5rem 0.5rem;
    font-size: 0.9375rem;
    font-weight: 650;
    color: var(--muted-foreground);
  }
  :global(.site-menu-heading svg) {
    width: 1.125rem;
    height: 1.125rem;
  }
  :global(.site-menu-options) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  :global(.site-menu-option) {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.25rem 0.75rem 0.25rem 0.5rem;
    border: 1px solid color-mix(in oklab, var(--foreground) 22%, var(--border));
    border-radius: var(--radius);
    background: var(--card);
    font-size: 1.0625rem;
    line-height: 1.2;
    cursor: default;
    user-select: none;
    outline: none;
  }
  :global(.site-menu-option:hover) {
    border-color: var(--foreground);
  }
  :global(.site-menu-option[data-state="checked"]) {
    border-color: var(--foreground);
    font-weight: 700;
  }
  :global(.site-menu-check) {
    display: grid;
    place-items: center;
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
  }
  :global(.site-menu-check svg) {
    width: 1.1rem;
    height: 1.1rem;
    stroke-width: 3;
  }
  :global(.site-menu-glyph) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    margin-left: auto;
    color: var(--muted-foreground);
  }
  .brand:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 0.5rem;
  }
</style>
