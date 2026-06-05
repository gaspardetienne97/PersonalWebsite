<script lang="ts">
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import type { Component } from "svelte";

  import { Badge } from "@repo/ui/badge";
  import * as Card from "@repo/ui/card";
  import { cn } from "@repo/ui/utils";

  let {
    href,
    title,
    description,
    eyebrow,
    meta,
    action,
    icon,
    class: className,
  }: {
    href: string;
    title: string;
    description: string;
    eyebrow: string;
    meta?: string;
    action: string;
    icon?: Component;
    class?: string;
  } = $props();
</script>

<Card.Root class={cn("overflow-hidden", className)}>
  <a
    {href}
    class="group grid h-full min-h-56 gap-6 p-6 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="outline">{eyebrow}</Badge>
        {#if meta}
          <span class="text-xs font-medium text-muted-foreground">{meta}</span>
        {/if}
      </div>
      <ArrowRight
        data-testid="music-tool-card-action"
        class="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
        aria-hidden="true"
      />
    </div>

    <div class="flex items-start gap-4">
      {#if icon}
        {@const Icon = icon}
        <span class="rounded-md border bg-muted p-3 text-foreground">
          <Icon class="size-5" aria-hidden="true" />
        </span>
      {/if}
      <div class="min-w-0 space-y-2">
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
    </div>

    <p class="mt-auto text-sm font-medium text-muted-foreground group-hover:text-foreground">
      {action}
    </p>
  </a>
</Card.Root>
