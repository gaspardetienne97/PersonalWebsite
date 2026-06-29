<script lang="ts">
  import type { IntonationZone } from "@repo/music-core/engines/audio-in";

  let {
    cents = 0,
    zone = "in-tune",
    toleranceCents = 5,
    rangeCents = 50,
    active = true,
    class: cls = "",
  }: {
    cents?: number;
    zone?: IntonationZone;
    toleranceCents?: number;
    rangeCents?: number;
    active?: boolean;
    class?: string;
  } = $props();

  // Needle position: −range → 0%, 0 → 50%, +range → 100%.
  const pct = $derived(Math.min(Math.max((cents / rangeCents + 1) / 2, 0), 1));
  const pctLeft = $derived(Math.round(pct * 100));
  // In-tune window width as a fraction of the full range, centred on 50%.
  const windowPct = $derived(Math.min(100, (toleranceCents / rangeCents) * 100));
</script>

<div
  class="relative h-12 overflow-hidden rounded-full border bg-card {cls}"
  role="img"
  aria-label="Intonation: {Math.round(cents)} cents ({zone})"
>
  <div
    class="absolute inset-y-0 border-x border-success/25 bg-success/10"
    style="left:{50 - windowPct / 2}%; width:{windowPct}%"
  ></div>
  <div class="absolute inset-y-0 w-px bg-success/60" style="left:50%"></div>
  <div
    class="absolute inset-y-1.5 w-1.5 -translate-x-1/2 rounded-full transition-[left] duration-100 {!active
      ? 'bg-muted-foreground/40'
      : zone === 'in-tune'
        ? 'bg-success'
        : 'bg-warn'}"
    style="left:{active ? pctLeft : 50}%"
  ></div>
  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">♭ flat</span>
  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
    >sharp ♯</span
  >
</div>
