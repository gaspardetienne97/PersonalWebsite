<script lang="ts">
  // A HUD fact on the stage. Only rendered once it has a value (no dead tiles).
  let { label, value, tone }: { label: string; value: string | number; tone?: "success" | "warn" | "error" } = $props();
  const toneClass = { success: "text-success", warn: "text-warn", error: "text-destructive" };
</script>

<div class="min-w-24 rounded-xl bg-ws-stage-ink/8 px-3 py-2">
  <p class="text-xs text-ws-stage-soft">{label}</p>
  <p class="tnum font-display text-xl font-semibold {tone ? toneClass[tone] : ''}">{value}</p>
</div>
