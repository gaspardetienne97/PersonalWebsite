<script lang="ts">
  import ArrowRight from "lucide-svelte/icons/arrow-right";
  import type { Component } from "svelte";

  import { Badge } from "@repo/ui/badge";
  import * as Card from "@repo/ui/card";
  import { cn } from "@repo/ui/utils";

  import HueMotif from "./HueMotif.svelte";
  import type { Hue } from "./musicCatalog";

  // Literal class strings so Tailwind's scanner emits the gradient stops; no
  // hardcoded colors — the fallback band reads straight from the theme tokens.
  const HUE_BAND: Record<Hue, string> = {
    ear: "from-skill-ear to-skill-ear/40",
    rhythm: "from-skill-rhythm to-skill-rhythm/40",
    harmony: "from-skill-harmony to-skill-harmony/40",
    reading: "from-skill-reading to-skill-reading/40",
    technique: "from-skill-technique to-skill-technique/40",
    piano: "from-instr-piano to-instr-piano/40",
    guitar: "from-instr-guitar to-instr-guitar/40",
    ukulele: "from-instr-ukulele to-instr-ukulele/40",
    aerophone: "from-instr-aerophone to-instr-aerophone/40",
    mpc: "from-instr-mpc to-instr-mpc/40",
    voice: "from-instr-voice to-instr-voice/40",
  };

  let {
    href,
    title,
    description,
    eyebrow,
    meta,
    action,
    icon,
    hue = "piano",
    class: className,
  }: {
    href: string;
    title: string;
    description: string;
    eyebrow: string;
    meta?: string;
    action: string;
    icon?: Component;
    hue?: Hue;
    class?: string;
  } = $props();
</script>

<Card.Root class={cn("overflow-hidden", className)}>
  <a
    {href}
    class="group flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:min-h-56"
  >
    <!-- Hue plate: the skill or instrument hue with its motif. A desktop flourish; on the phone the card is a compact row. -->
    <div class="hidden aspect-[5/2] w-full overflow-hidden md:block" data-testid="music-tool-card-band">
      <div class="relative size-full bg-linear-to-br text-white {HUE_BAND[hue]}" aria-hidden="true">
        <HueMotif {hue} class="absolute inset-0 size-full" />
      </div>
    </div>

    <div class="grid flex-1 gap-3 p-4 transition-colors group-hover:bg-accent/50 md:gap-6 md:p-6">
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
        <span class="rounded-md border bg-muted p-2.5 text-foreground md:p-3">
          <Icon class="size-5" aria-hidden="true" />
        </span>
      {/if}
      <div class="min-w-0 space-y-2">
        <Card.Title class="font-display">{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
    </div>

      <p class="mt-auto hidden text-sm font-medium text-muted-foreground group-hover:text-foreground md:block">
        {action}
      </p>
    </div>
  </a>
</Card.Root>
