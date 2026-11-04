<script lang="ts">
  // A HUD fact on the stage. Only rendered once it has a value (no dead tiles).
  let { label, value, tone }: { label: string; value: string | number; tone?: "success" | "warn" | "error" } = $props();
  const toneClass = { success: "text-success", warn: "text-warn", error: "text-destructive" };
</script>

<div class="min-w-20 rounded-xl bg-ws-stage-ink/8 px-3 py-1.5 sm:min-w-24 sm:py-2">
  <p class="text-xs text-ws-stage-soft">{label}</p>
  <p class="tnum font-display text-lg font-semibold sm:text-xl {tone ? toneClass[tone] : ''}">{value}</p>
</div>
