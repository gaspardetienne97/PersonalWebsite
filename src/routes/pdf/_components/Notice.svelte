<script lang="ts" module>
  export interface NoticeAction {
    label: string;
    onclick: () => void;
    /** The one action to take first. Drawn filled; the others are outlined. */
    primary?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  // One look for every Narrator error and status: an icon, a plain sentence and what to do next.
  // Errors interrupt a screen reader (role="alert"); info waits its turn (role="status").
  let {
    tone = "error",
    title,
    actions = [],
    class: className = "",
    children,
  }: {
    tone?: "error" | "info";
    title?: string;
    actions?: NoticeAction[];
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="notice {tone} {className}" role={tone === "error" ? "alert" : "status"}>
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
    <circle cx="12" cy="12" r="10" />
    {#if tone === "error"}
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    {:else}
      <path d="M12 16.5V11" />
      <path d="M12 7.5h.01" />
    {/if}
  </svg>
  <div class="body">
    {#if title}<strong class="title">{title}</strong>{/if}
    {#if children}<div class="text">{@render children()}</div>{/if}
    {#if actions.length}
      <div class="actions">
        {#each actions as a (a.label)}
          <button type="button" class:primary={a.primary} onclick={a.onclick}>{a.label}</button>
        {/each}
      </div>
    {/if}
  </div>
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
    color: var(--n-fg-1);
    overflow-wrap: anywhere;
  }
  .title + .text {
    margin-top: 2px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  button {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid var(--n-border-3);
    background: transparent;
    color: var(--n-fg-0);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background var(--n-dur-1) var(--n-ease-out),
      border-color var(--n-dur-1) var(--n-ease-out);
  }
  button:hover {
    background: var(--n-bg-3);
  }
  button.primary {
    background: var(--n-fg-0);
    border-color: var(--n-fg-0);
    color: var(--n-bg-0);
  }
  button.primary:hover {
    background: var(--n-fg-1);
    border-color: var(--n-fg-1);
  }
  button:focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }
  @media (max-width: 560px) {
    /* One thumb-sized column: every action is the full width of the notice. */
    .actions button {
      flex: 1 1 100%;
    }
  }
</style>
