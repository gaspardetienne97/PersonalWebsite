<script lang="ts">
  import { tabLines } from "@repo/music-core/engines/projection";
  import type { InstrumentProjection } from "@repo/music-core/domain";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";

  const {
    projection,
    tuning,
    beatsPerMeasure = 4,
    measuresPerRow = 4,
  }: {
    projection: InstrumentProjection;
    tuning: TuningProfile;
    beatsPerMeasure?: number;
    measuresPerRow?: number;
  } = $props();

  const rows = $derived(tabLines(projection, tuning, { beatsPerMeasure, measuresPerRow }));
</script>

<div class="grid gap-4 overflow-x-auto" aria-label="Guitar tab">
  {#each rows as lines, index (index)}
    <pre class="font-mono text-sm leading-tight text-foreground">{lines.join("\n")}</pre>
  {/each}
</div>
