<script lang="ts">
  import type { EarTrainingResultView } from "@repo/music-core/engines/ear-training";
  import { midiToNote } from "@repo/music-core/engines/theory";

  let { result }: { result: EarTrainingResultView } = $props();

  const positions = $derived.by(() =>
    result.result.metrics
      .filter((metric) => metric.kind === "pitch")
      .map((metric, index) => {
        const matched = samePitchClass(metric.expectedMidi, metric.actualMidi);
        return {
          key: `${index}-${metric.expectedMidi}-${metric.actualMidi ?? "missing"}`,
          index,
          expectedMidi: metric.expectedMidi,
          actualMidi: metric.actualMidi,
          state: metric.actualMidi === undefined ? "missing" : matched ? "correct" : "review",
        };
      }),
  );
  const matchedCount = $derived(
    positions.filter((position) => position.state === "correct").length,
  );

  function samePitchClass(expected: number, actual: number | undefined): boolean {
    return actual !== undefined && (((expected - actual) % 12) + 12) % 12 === 0;
  }
</script>

{#if positions.length > 0}
  <section class="grid gap-3 rounded-md border bg-card p-4" data-testid="phrase-result-feedback">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-semibold">Position feedback</p>
      <p class="text-sm tabular-nums text-muted-foreground">
        {matchedCount} / {positions.length} matched
      </p>
    </div>

    <ol class="grid gap-2 sm:grid-cols-3">
      {#each positions as position (position.key)}
        <li
          class={[
            "grid gap-1 rounded-md border px-3 py-2 text-sm",
            position.state === "correct"
              ? "border-success/40 bg-success/10"
              : position.state === "missing"
                ? "border-destructive/40 bg-destructive/10"
                : "border-warn/40 bg-warn/10",
          ]}
          data-testid="phrase-result-position"
          data-state={position.state}
        >
          <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Note {position.index + 1}
          </span>
          <span class="font-semibold">Expected {midiToNote(position.expectedMidi)}</span>
          <span class="text-muted-foreground">
            {#if position.actualMidi === undefined}
              Missing
            {:else}
              Played {midiToNote(position.actualMidi)}
            {/if}
          </span>
        </li>
      {/each}
    </ol>
  </section>
{/if}
