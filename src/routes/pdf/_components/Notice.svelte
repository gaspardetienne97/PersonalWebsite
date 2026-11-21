<script lang="ts" module>
  export interface NoticeAction {
    label: string;
    onclick: () => void;
    /** The one action to take first. Drawn as the app's primary button; the others are links. */
    primary?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import { m } from "@repo/i18n/messages.js";

  import Btn from "./Btn.svelte";

  // One look for every Narrator error and status: an icon, a plain sentence and what to do next.
  // One colour per meaning: red for "failed", amber for "fell back", blue for information.
  // Errors interrupt a screen reader (role="alert"); the others wait their turn (role="status").
  // "block" is a card inside the page. "line" is one row for a status that sits on the edge of
  // something else (above the player, at the bottom of the library).
  let {
    tone = "error",
    variant = "block",
    title,
    actions = [],
    ondismiss,
    class: className = "",
    children,
  }: {
    tone?: "error" | "warn" | "info";
    variant?: "block" | "line";
    title?: string;
    actions?: NoticeAction[];
    /** Draws a close button. The caller removes the notice. */
    ondismiss?: () => void;
    class?: string;
    children?: Snippet;
  } = $props();

  // One primary at most, and it comes first.
  const primary = $derived(actions.find((a) => a.primary));
  const links = $derived(actions.filter((a) => a !== primary));
</script>

<div class="notice {tone} {variant} {className}" role={tone === "error" ? "alert" : "status"}>
  <!-- Inline icons: a new lucide import would need an entry in vite.config.ts's optimizeDeps. -->
  <svg
    class="icon"
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if tone === "warn"}
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    {:else}
      <circle cx="12" cy="12" r="10" />
      {#if tone === "error"}
        <path d="M12 7.5v5.5" />
        <path d="M12 16.5h.01" />
      {:else}
        <path d="M12 16.5V11" />
        <path d="M12 7.5h.01" />
      {/if}
    {/if}
  </svg>
  <div class="body">
    <div class="words">
      {#if title}<strong class="title">{title}</strong>{/if}
      {#if children}<div class="text">{@render children()}</div>{/if}
    </div>
    {#if actions.length}
      <div class="actions">
        {#if primary}
          <Btn variant="primary" type="button" onclick={primary.onclick}>{primary.label}</Btn>
        {/if}
        {#if links.length}
          <div class="links">
            {#each links as a (a.label)}
              <button type="button" class="link" onclick={a.onclick}>{a.label}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if ondismiss}
    <button type="button" class="dismiss" aria-label={m.narrator_close()} onclick={ondismiss}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  {/if}
</div>

<style>
  .notice {
    --tone: var(--n-danger);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--tone) 45%, transparent);
    /* Mixed over an opaque surface so the notice reads the same above the reader's text. */
    background: color-mix(in srgb, var(--tone) 11%, var(--n-bg-1));
    color: var(--n-fg-0);
    font-family: var(--n-font-sans);
    text-align: left;
  }
  .warn {
    /* WP4 defines --n-warn in narrator.css; this amber until then. */
    --tone: var(--n-warn, #f59e0b);
  }
  .info {
    --tone: var(--n-link);
  }
  .icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: color-mix(in srgb, var(--tone) 70%, var(--n-fg-0));
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .title {
    display: block;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .text {
    font-size: 15px;
    line-height: 1.5;
    /* Lighter than --n-fg-2: the tinted surface is brighter than the page. */
    color: var(--n-fg-1);
    overflow-wrap: anywhere;
  }
  .title + .text {
    margin-top: 2px;
  }
  /* One filled button per notice. Every other action is a link, in a row under it. */
  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    margin-top: 12px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 24px;
  }
  .link {
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--n-fg-0);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--n-fg-0) 45%, transparent);
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .link:hover {
    text-decoration-color: currentColor;
  }
  .dismiss {
    width: 44px;
    height: 44px;
    margin: -10px -12px -10px 0;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .dismiss:hover {
    background: color-mix(in srgb, var(--n-fg-0) 10%, transparent);
    color: var(--n-fg-0);
  }
  .link:focus-visible,
  .dismiss:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }

  /* ---- one row: icon, one sentence, one action, an optional close ---- */
  .line {
    align-items: center;
    min-height: 44px;
    padding: 4px 6px 4px 14px;
  }
  /* With no close button the action is the last thing on the row: it keeps the left edge's inset. */
  .line:not(:has(.dismiss)) {
    padding-right: 14px;
  }
  .line .icon {
    margin-top: 0;
  }
  .line .body {
    display: flex;
    align-items: center;
    gap: 2px 14px;
  }
  .line .words {
    flex: 1;
    min-width: 0;
    padding: 6px 0;
  }
  .line :is(.title, .text) {
    display: inline;
    font-size: 14px;
    line-height: 1.4;
  }
  .line .actions {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    margin-top: 0;
  }
  .line .dismiss {
    margin: 0;
  }

  @media (max-width: 560px) {
    /* One thumb-sized column: the main action is the full width of the notice. */
    .block .actions {
      align-items: stretch;
    }
    .block .links {
      flex-direction: column;
      align-items: center;
    }
    .block .link {
      text-align: center;
    }
    /* A long sentence and its action do not fit one row on a phone: the action drops under it. */
    .line .body {
      flex-wrap: wrap;
    }
    .line .words {
      flex-basis: 12em;
    }
  }
</style>
