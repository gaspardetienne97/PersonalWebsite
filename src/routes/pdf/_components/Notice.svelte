<script lang="ts" module>
  export interface NoticeAction {
    label: string;
    onclick: () => void;
    /** The one action to take first. Drawn as the app's primary button; the others are outlined buttons. */
    primary?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import { m } from "@repo/i18n/messages.js";

  import Btn from "./Btn.svelte";

  // One look for every Narrator error and status: an icon, a plain sentence and what to do next.
  // The surface is always the same neutral one. The meaning is in the rule on the left edge and
  // the icon: red for "failed", amber for "fell back", blue for information. So a main button
  // never sits on a red panel.
  // Errors interrupt a screen reader (role="alert"); the others wait their turn (role="status").
  // "block" is a card inside the page. "line" is one row, 48 px tall at every width, for a status
  // that sits on the edge of something else (above the player, at the bottom of the library):
  // the sentence is cut with an ellipsis when it runs out of room, and its action and close
  // button are cells at the row's end.
  let {
    tone = "error",
    variant = "block",
    title,
    short,
    actions = [],
    ondismiss,
    class: className = "",
    children,
  }: {
    tone?: "error" | "warn" | "info";
    variant?: "block" | "line";
    title?: string;
    /** "line" only: a shorter sentence shown under 480 px. Screen readers still get the full one. */
    short?: string;
    actions?: NoticeAction[];
    /** Draws a close button. The caller removes the notice. */
    ondismiss?: () => void;
    class?: string;
    children?: Snippet;
  } = $props();

  // One primary at most, and it comes first.
  const primary = $derived(actions.find((a) => a.primary));
  const others = $derived(actions.filter((a) => a !== primary));

  // A cut sentence shows whole in a tooltip. Read when the pointer arrives, so it is never stale.
  let words = $state<HTMLElement>();
  const tip = () => {
    if (words) words.title = words.querySelector(".full")?.textContent?.trim() ?? "";
  };
</script>

<div
  class="notice {tone} {variant} {className}"
  class:has-short={variant === "line" && short}
  role={tone === "error" ? "alert" : "status"}
>
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="words" bind:this={words} onpointerenter={variant === "line" ? tip : undefined}>
      <div class="full">
        {#if title}<strong class="title">{title}</strong>{/if}
        {#if children}<div class="text">{@render children()}</div>{/if}
      </div>
      {#if variant === "line" && short}<span class="short" aria-hidden="true">{short}</span>{/if}
    </div>
    {#if actions.length}
      <div class="actions">
        {#if primary}
          <Btn variant="primary" type="button" onclick={primary.onclick}>{primary.label}</Btn>
        {/if}
        {#each others as a (a.label)}
          <button type="button" class="second" onclick={a.onclick}>{a.label}</button>
        {/each}
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
    padding: 14px 16px 14px 18px;
    border-radius: 12px;
    border: 1px solid var(--n-border-2);
    /* A neutral raised surface, opaque so the notice reads the same above the reader's text.
       The tone is a rule down the left edge, inside the rounded corner. */
    background: var(--n-bg-2);
    box-shadow: inset 4px 0 0 var(--tone);
    color: var(--n-fg-0);
    font-family: var(--n-font-sans);
    text-align: left;
  }
  .warn {
    --tone: var(--n-warn, #f59e0b);
  }
  .info {
    --tone: var(--n-link);
  }
  .icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: color-mix(in srgb, var(--tone) 75%, var(--n-fg-0));
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
    color: var(--n-fg-1);
    overflow-wrap: anywhere;
  }
  .title + .text {
    margin-top: 2px;
  }
  .short {
    display: none;
  }
  /* One filled button per notice, first. Every other action is an outlined button of the same
     height beside it. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .second {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--n-border-3);
    border-radius: 8px;
    background: transparent;
    color: var(--n-fg-0);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.25;
    cursor: pointer;
  }
  .second:hover {
    background: var(--n-bg-3);
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
    background: var(--n-bg-3);
    color: var(--n-fg-0);
  }
  .second:focus-visible,
  .dismiss:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }

  /* ---- one row: icon, one sentence, one action, an optional close ---- */
  .line {
    align-items: stretch;
    gap: 10px;
    min-height: 48px;
    padding: 0 0 0 16px;
    overflow: hidden;
  }
  .line .icon {
    align-self: center;
    margin-top: 0;
  }
  .line .body {
    display: flex;
    align-items: stretch;
  }
  /* The sentence never takes a second row: it is cut, and the tooltip has the rest. */
  .line .words {
    flex: 1;
    min-width: 0;
    align-self: center;
    padding-right: 12px;
    font-size: 14px;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line :is(.full, .title, .text) {
    display: inline;
    font-size: 14px;
    line-height: 1.4;
  }
  .line .text {
    color: var(--n-fg-0);
  }
  .line .title + .text {
    margin-left: 0.3em;
  }
  /* The action and the close button are cells the height of the row, each behind a rule. */
  .line .actions {
    flex-wrap: nowrap;
    flex-shrink: 0;
    gap: 0;
    margin-top: 0;
  }
  .line .second,
  .line .dismiss {
    min-height: 46px;
    height: auto;
    margin: 0;
    border: 0;
    border-left: 1px solid var(--n-border-2);
    border-radius: 0;
    white-space: nowrap;
  }
  .line .second {
    font-weight: 700;
  }
  .line .dismiss {
    width: 48px;
  }
  .line :is(.second, .dismiss):focus-visible {
    outline-offset: -3px;
  }
  /* A filled button keeps its own shape inside the row. */
  .line .actions :global(.btn) {
    align-self: center;
    margin-right: 2px;
  }

  @media (max-width: 560px) {
    /* One thumb-sized column: every action is the full width of the notice (under the icon too),
       the main one first. */
    .block .actions {
      flex-direction: column;
      align-items: stretch;
      margin-left: -34px;
    }
  }
  @media (max-width: 479px) {
    /* The shorter sentence takes the full one's place. The full one stays for screen readers. */
    .has-short .full {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .has-short .short {
      display: inline;
    }
  }
</style>
