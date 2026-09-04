<script lang="ts">
  import { browser } from "$app/environment";

  import type { UnixMs } from "@repo/music-core/domain";
  import { lastRunReference, type LastRunReference } from "@repo/music-core/engines/sessions";
  import { PracticeStore } from "@repo/music-core/engines/store";

  // "82% · ▲ +6% vs last run" — the moment right after a rep is where a
  // comparison motivates most. `before` is the page-visit time, so the run
  // that just recorded (and mid-visit retries) never compare against
  // themselves; the baseline is the last run before this visit.
  let {
    tags,
    accuracy,
    before,
  }: {
    /** Journal tags identifying this drill (all must match). */
    tags: string[];
    /** This run's accuracy, 0-1. */
    accuracy: number;
    /** Page-visit timestamp; only earlier sessions count as "last run". */
    before: UnixMs;
  } = $props();

  let baseline = $state<LastRunReference | undefined>();
  let loaded = $state(false);

  $effect(() => {
    void load(tags);
  });

  async function load(runTags: string[]): Promise<void> {
    if (!browser) return;
    try {
      const sessions = await new PracticeStore().sessions.all();
      baseline = lastRunReference(sessions, runTags, before);
    } catch {
      baseline = undefined;
    }
    loaded = true;
  }

  const deltaPct = $derived(
    baseline === undefined ? 0 : Math.round((accuracy - baseline.accuracy) * 100),
  );
</script>

{#if loaded}
  <p class="text-sm tabular-nums" data-testid="last-run-delta">
    {#if baseline === undefined}
      <span class="text-muted-foreground">First logged run. The next one compares here.</span>
    {:else if deltaPct > 0}
      <span class="font-medium text-success">▲ +{deltaPct}%</span>
      <span class="text-muted-foreground">
        vs last run ({Math.round(baseline.accuracy * 100)}%)</span>
    {:else if deltaPct < 0}
      <span class="font-medium text-warn">▼ {deltaPct}%</span>
      <span class="text-muted-foreground">
        vs last run ({Math.round(baseline.accuracy * 100)}%)</span>
    {:else}
      <span class="text-muted-foreground">
        Even with your last run ({Math.round(baseline.accuracy * 100)}%).</span>
    {/if}
  </p>
{/if}
