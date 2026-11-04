<script lang="ts">
  // A live counter in the session HUD, as inline text ("Question 3 of 10"), not a tile (contract K1).
  // Only rendered once it has a value (no dead counters). A tone colours the value; the value's own words
  // or glyph (✓, ✕) carry the meaning, so colour is never the only cue. Short of room the label gives way,
  // never the value.
  let { label, value, tone }: { label: string; value: string | number; tone?: "success" | "warn" | "error" } = $props();
  const toneClass = { success: "text-success", warn: "text-warn", error: "text-destructive" };
</script>

<span class="inline-flex min-w-0 items-baseline gap-1.5 ws-hud whitespace-nowrap pr-1 leading-tight" data-stat>
  <span class="min-w-0 truncate text-ws-stage-soft">{label}</span>
  <span class="tnum shrink-0 font-semibold {tone ? toneClass[tone] : ''}">{value}</span>
</span>
