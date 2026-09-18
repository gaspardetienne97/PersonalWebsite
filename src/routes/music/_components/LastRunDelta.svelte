<script lang="ts">
  import { browser } from "$app/environment";
  import { INSTRUMENT_LABELS, type UnixMs } from "@repo/music-core/domain";
  import { inputSourceLabel } from "@repo/music-core/engines/device-profiles";
  import { hasComparableInput, lastRunReference, meanPartialCredit, type LastRunReference } from "@repo/music-core/engines/sessions";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";

  let { tags, before, runtime = useMusicRuntime(), store }: {
    tags: string[];
    /** Keep the baseline fixed before this visit, including after Again. */
    before: UnixMs;
    runtime?: MusicRuntime;
    store?: PracticeStore;
  } = $props();

  let baseline = $state<LastRunReference | undefined>();
  let previous = $state(false);
  let loaded = $state(false);
  let failed = $state(false);
  const capture = $derived(runtime.lastPracticeCapture);
  const current = $derived(capture && (capture.endedAt ?? 0) >= before && tags.every((tag) => capture.tags?.includes(tag)) ? capture : undefined);
  const setup = $derived(current?.comparison);
  const inputLabel = $derived([...new Set(current?.scoringEvents?.map((event) => `${inputSourceLabel(event.source)} / ${event.instrument ? INSTRUMENT_LABELS[event.instrument] : "Unknown instrument"} / ${event.assistance ?? "unknown assistance"}`) ?? [])].join(", "));

  $effect(() => {
    const run = current;
    const runTags = tags;
    const cutoff = before;
    let cancelled = false;
    loaded = false;
    failed = false;
    if (browser) void (store ?? new PracticeStore()).sessions.all().then((sessions) => {
      if (cancelled) return;
      previous = lastRunReference(sessions, runTags, cutoff) !== undefined;
      baseline = run?.comparison && Number.isFinite(run.comparison.bpm) && run.comparison.bpm > 0 && hasComparableInput(run.scoringEvents ?? [])
        ? lastRunReference(sessions, run.tags ?? [], cutoff) : undefined;
      loaded = true;
    }).catch(() => { if (!cancelled) { failed = true; loaded = true; } });
    return () => { cancelled = true; };
  });

  const deltaPct = $derived(baseline === undefined ? 0 : Math.round((meanPartialCredit(current?.scoringEvents ?? []) - baseline.accuracy) * 100));
</script>

{#if loaded}
  <div class="grid gap-1 text-sm tabular-nums" data-testid="last-run-delta">
    {#if failed}
      <p class="text-muted-foreground">Could not load earlier sessions for comparison.</p>
    {:else if baseline === undefined}
      <p class="text-muted-foreground">{previous ? "Previous session used a different setup or has no comparable setup metadata." : "First visit with a logged run."} Comparisons update on a later visit.</p>
    {:else}
      <p>
        {#if deltaPct > 0}<span class="font-medium text-success">▲ +{deltaPct}%</span>
        {:else if deltaPct < 0}<span class="font-medium text-warn">▼ {deltaPct}%</span>
        {:else}<span class="text-muted-foreground">Even</span>{/if}
        <span class="text-muted-foreground"> vs previous matching run ({Math.round(baseline.accuracy * 100)}%).</span>
      </p>
      <p class="text-xs text-muted-foreground">Matched {setup?.dimensions}. Baseline: {setup?.bpm} BPM · {inputLabel}. Other settings may differ.</p>
    {/if}
  </div>
{/if}
