<!--
  The theme as two choices side by side, Light and Dark, the one in use filled. It
  is the header's theme control on a wide screen and the footer's on a phone, and
  it says the same thing the phone menu's two theme options say. Each part is named
  by its tip, which shows under the pointer and on keyboard focus.
-->
<script lang="ts">
  import Moon from "@lucide/svelte/icons/moon";
  import Sun from "@lucide/svelte/icons/sun";
  import { mode, setMode } from "mode-watcher";
  import { m } from "@repo/i18n/messages.js";

  const themes = [
    { value: "light", icon: Sun, label: () => m.header_theme_light() },
    { value: "dark", icon: Moon, label: () => m.header_theme_dark() },
  ] as const;
</script>

<div class="theme-switch" role="group" aria-label={m.header_theme()}>
  {#each themes as theme (theme.value)}
    <button
      type="button"
      class="part {theme.value}"
      aria-pressed={(mode.current ?? "light") === theme.value}
      onclick={() => setMode(theme.value)}
    >
      <theme.icon aria-hidden="true" />
      <span class="gm-tip">{theme.label()}</span>
    </button>
  {/each}
</div>

<style>
  /* The language pill's height, border and surface, holding two parts. */
  .theme-switch {
    display: inline-flex;
    flex: none;
    gap: 2px;
    height: 2.75rem;
    padding: 3px;
    border: 1px solid color-mix(in oklab, var(--foreground) 22%, var(--border));
    border-radius: 999px;
    background: var(--card);
  }
  .part {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 100%;
    border-radius: 999px;
    color: var(--muted-foreground);
    transition:
      background-color 0.15s,
      color 0.15s;
  }
  .part :global(svg) {
    width: 1.2rem;
    height: 1.2rem;
  }
  .part:hover {
    background: var(--accent);
    color: var(--foreground);
  }
  /* The theme in use, filled. It follows the page's own theme class, so it is right
     before the script that reads the stored choice has run. */
  :global(html:not(.dark)) .part.light,
  :global(html.dark) .part.dark {
    background: var(--foreground);
    color: var(--background);
  }
  .part:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  /* On a touch screen each part is a full 44px target, and looks it. */
  @media (pointer: coarse), (width < 860px) {
    .theme-switch {
      height: 3rem;
    }
    .part {
      width: 2.75rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .part {
      transition: none;
    }
  }
</style>
