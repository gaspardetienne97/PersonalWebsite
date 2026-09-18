<script lang="ts">
  import { timingVerdict } from "@repo/music-core/engines/semantic-color";

  let {
    offsetMs = 0,
    rangeMs = 100,
    pocketMs = 15,
    class: cls = "",
  }: {
    offsetMs: number;
    rangeMs?: number;
    pocketMs?: number;
    class?: string;
  } = $props();

  const pct = $derived(Math.min(Math.max((offsetMs / rangeMs + 1) / 2, 0), 1));
  const pctLeft = $derived(Math.round(pct * 100));
  // errorMs is hit minus expected, so a positive reading landed after the beat.
  const verdict = $derived(timingVerdict(offsetMs, pocketMs));
  const label = $derived(
    verdict === "pocket"
      ? `Timing offset: ${Math.round(offsetMs)} ms, on the beat`
      : `Timing offset: ${Math.abs(Math.round(offsetMs))} ms ${verdict}`,
  );
</script>

<div class="relative h-10 overflow-hidden rounded-full border bg-card {cls}" aria-label={label}>
  <div class="absolute inset-y-0 w-[20%] border-x border-success/20 bg-success/10" style="left:40%"></div>
  <div class="absolute inset-y-0 w-px bg-success/60" style="left:50%"></div>
  <div
    class="absolute inset-y-1 w-1 -translate-x-1/2 rounded-full transition-[left] duration-150 {verdict === 'pocket'
      ? 'bg-success'
      : 'bg-warn'}"
    style="left:{pctLeft}%"
  ></div>
  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Early</span>
  <span
    class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-success"
    >On beat</span
  >
  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Late</span>
</div>
