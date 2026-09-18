<script lang="ts">
  import { INSTRUMENT_LABELS, type InstrumentId } from "@repo/music-core/domain";
  import type { SkillDriftRow } from "@repo/music-core/engines/dashboard";
  import * as Card from "@repo/ui/card";

  import InstrumentSwitcher from "../../_components/InstrumentSwitcher.svelte";
  import PracticeStage from "../../_components/PracticeStage.svelte";
  import SectionHeading from "../../_components/SectionHeading.svelte";
  import SkillTreeGraph from "../../_components/SkillTreeGraph.svelte";
  import SkillEstimateRow from "./SkillEstimateRow.svelte";

  // "Skills": what is solid and what is stale. One row per skill, scoped to the
  // instrument whose unaided history the estimate is built from.
  let {
    rows,
    instrument,
    onInstrument,
    capabilityRoot,
    capabilityNodes,
  }: {
    rows: SkillDriftRow[];
    instrument: InstrumentId;
    onInstrument: (instrument: InstrumentId) => void;
    capabilityRoot: { label: string; percent: number };
    capabilityNodes: { label: string; percent: number }[];
  } = $props();

  const instruments = Object.entries(INSTRUMENT_LABELS).map(([value, label]) => ({ value, label }));
</script>

<section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Skill estimates">
  <div class="grid content-start gap-4">
    <SectionHeading
      title="{INSTRUMENT_LABELS[instrument]} skills"
      eyebrow="Estimate today, decayed since last practised"
    >
      {#snippet action()}
        <InstrumentSwitcher
          options={instruments}
          value={instrument}
          onChange={(value) => onInstrument(value as InstrumentId)}
          ariaLabel="Instrument filter"
          class="max-w-full flex-wrap"
        />
      {/snippet}
    </SectionHeading>

    <Card.Root class="p-4">
      {#if rows.length === 0}
        <p class="text-sm text-muted-foreground">No skills to show for this instrument yet.</p>
      {:else}
        <ul class="grid">
          {#each rows as row (row.skillId)}
            <SkillEstimateRow {row} />
          {/each}
        </ul>
      {/if}
      <p class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5">
          <span class="h-2.5 w-3.5 rounded-sm bg-primary" aria-hidden="true"></span>
          Estimated mastery today
        </span>
        <span class="flex items-center gap-1.5">
          <span
            class="h-2.5 w-3.5 rounded-sm"
            style="background:repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklab, var(--warn) 60%, transparent) 4px 8px)"
            aria-hidden="true"
          ></span>
          Review due, dropped 10+ points
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-2.5 w-0.5 bg-foreground/50" aria-hidden="true"></span>
          Last measured
        </span>
      </p>
    </Card.Root>

    {#if capabilityNodes.length > 0}
      <PracticeStage class="p-4 sm:p-5">
        <p class="mb-2 eyebrow text-stage-muted">Skill map · capability coverage</p>
        <SkillTreeGraph root={capabilityRoot} nodes={capabilityNodes} height={240} />
      </PracticeStage>
    {/if}
  </div>

  <aside class="grid content-start gap-4">
    <Card.Root class="grid gap-2 p-4">
      <SectionHeading title="Reading the estimate" level={3} />
      <p class="text-sm text-muted-foreground">
        Mastery is the mean partial credit of unaided attempts, decayed a little per day since the
        last one. <span class="text-foreground">Confidence</span> is how many attempts stand behind
        it: under five and the bar is drawn hollow. Nothing here is a grade of the person.
      </p>
    </Card.Root>
  </aside>
</section>
