<script lang="ts">
  import { MIN_COACH_ATTEMPTS, type SkillDriftRow } from "@repo/music-core/engines/dashboard";

  // One skill's estimate: the bar is today's decayed estimate, the dashed tick
  // is where it was last measured, the hatch covers what has been lost. Under
  // five unaided attempts the bar is hollow — visible, but not trusted — and the
  // review-due verdict is the projection's, so Skills and What next agree.
  let { row }: { row: SkillDriftRow } = $props();

  const estimate = $derived(row.estimatePercent);
  const hollow = $derived(row.attempts < MIN_COACH_ATTEMPTS);
  const due = $derived(row.dueForReview);
  const measuredAt = $derived(Math.min(100, (estimate ?? 0) + row.dropPercent));
  const label = $derived(
    estimate === undefined
      ? `${row.name}: not measured yet`
      : `${row.name}: ${estimate}% estimated${due ? ", review due" : ""}, ${row.attempts} unaided attempt${row.attempts === 1 ? "" : "s"}`,
  );
  const when = $derived(
    row.lastPracticed === undefined
      ? "Never practised unaided"
      : `Last practised ${new Date(row.lastPracticed).toLocaleDateString()}`,
  );
</script>

<li data-testid="skill-row" class="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-2 border-b py-2.5 last:border-b-0 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)_3.5rem_minmax(0,11rem)]">
  <div class="min-w-0 sm:order-1">
    <a class="block truncate text-sm font-semibold underline-offset-4 hover:underline" href={row.href}>
      {row.name}
    </a>
    <span class="block truncate text-xs text-muted-foreground">{row.capability}</span>
  </div>

  <span class="text-right font-mono text-sm sm:order-3">
    {estimate === undefined ? "—" : `${estimate}%`}
  </span>

  <div
    class="relative col-span-2 h-3 overflow-hidden rounded-full bg-muted sm:order-2 sm:col-span-1"
    role="img"
    aria-label={label}
  >
    {#if estimate !== undefined}
      {#if due}
        <span
          class="absolute inset-y-0 left-0 rounded-full"
          style={`width:${measuredAt}%;background:repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklab, var(--warn) 60%, transparent) 4px 8px)`}
        ></span>
      {/if}
      <span
        class="absolute inset-y-0 left-0 rounded-full {hollow
          ? 'border-2 border-dashed border-primary'
          : 'bg-primary'}"
        style={`width:${Math.max(estimate, 2)}%`}
      ></span>
      <span
        class="absolute inset-y-0 w-0.5 bg-foreground/50"
        style={`left:calc(${measuredAt}% - 1px)`}
      ></span>
    {/if}
  </div>

  <p class="col-span-2 text-xs sm:order-4 sm:col-span-1 sm:text-right">
    {#if due}<span class="font-bold text-warn">Review due</span> <span class="text-muted-foreground">·</span>
    {/if}<span class="text-muted-foreground"
      >{when}{#if hollow && estimate !== undefined}
        · {row.attempts} attempt{row.attempts === 1 ? "" : "s"}{/if}</span
    >
  </p>
</li>
