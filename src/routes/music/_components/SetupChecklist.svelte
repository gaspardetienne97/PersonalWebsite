<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "@repo/ui/button";

  // What is ready on this device: one row per prerequisite with a status LED
  // (colour plus the status word), a detail line, and the one action that
  // fixes it. Shared by Connect and the Guide.
  export interface SetupItem {
    id: string;
    title: string;
    detail: string;
    state: "ok" | "warn" | "off";
    action?: { label: string; href?: string; onclick?: () => void; disabled?: boolean };
  }

  let {
    items,
    label = "Setup checklist",
    children,
    class: cls = "",
  }: {
    items: SetupItem[];
    label?: string;
    children?: Snippet;
    class?: string;
  } = $props();

  const STATE_WORD = { ok: "Ready", warn: "Needs attention", off: "Not set up" } as const;
  const LED = {
    ok: "[--led-color:var(--success)]",
    warn: "[--led-color:var(--warn)]",
    off: "[--led-color:var(--muted-foreground)]",
  } as const;
</script>

<ol class="grid divide-y rounded-xl border bg-card {cls}" aria-label={label} data-testid="setup-checklist">
  {#each items as item (item.id)}
    <li class="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3" data-setup-state={item.state}>
      <span class="led {LED[item.state]}" aria-hidden="true"></span>
      <span class="grid min-w-0">
        <span class="text-sm font-semibold">
          {item.title}
          <span class="sr-only">, {STATE_WORD[item.state]}</span>
        </span>
        <span class="text-xs text-muted-foreground">{item.detail}</span>
      </span>
      {#if item.action}
        <Button
          size="sm"
          variant={item.state === "ok" ? "ghost" : "outline"}
          href={item.action.href}
          disabled={item.action.disabled}
          onclick={item.action.onclick}
        >
          {item.action.label}
        </Button>
      {/if}
    </li>
  {/each}
  {#if children}{@render children()}{/if}
</ol>
