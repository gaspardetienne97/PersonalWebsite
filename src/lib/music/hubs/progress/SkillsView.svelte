<script lang="ts">
  // Skills: what is solid and what is stale, one row per skill, grouped by capability.
  import Lock from "lucide-svelte/icons/lock";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import type { Capability, Instrument } from "@repo/music-core";
  import { INSTRUMENTS } from "@repo/music-core";
  import { SKILL_GRAPH, capabilitySummary } from "@repo/music-core/progress/graph";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { practice } from "../../practice.svelte";
  import Choice from "../../components/Choice.svelte";
  import { CAPABILITY_LABEL, MIN_EVIDENCE, pct, plural, relativeDay, skillRows, type SkillRow } from "./model";

  let { now = Date.now() }: { now?: number } = $props();

  let scope = $state<Instrument | "all">("all");
  let showAll = $state(false);

  const options = [{ value: "all" as const, label: "All instruments" }, ...INSTRUMENTS.map((i) => ({ value: i, label: INSTRUMENT_LABEL[i] }))];
  const rows = $derived(
    skillRows({ stats: practice.stats, mastery: practice.mastery, instrument: scope === "all" ? undefined : scope, now }),
  );
  const summaries = $derived(capabilitySummary(practice.mastery, SKILL_GRAPH, now));
  const touchedCount = $derived(rows.filter((r) => r.touched).length);
  const groups = $derived(
    summaries
      .filter((s) => s.total > 0)
      .map((s) => ({
      ...s,
      rows: rows.filter((r) => r.skill.capability === s.capability && (showAll || r.touched)),
      touched: rows.filter((r) => r.skill.capability === s.capability && r.touched).length,
    })),
  );

  const describe = (r: SkillRow) => {
    if (r.estimate === undefined) return "No estimate yet";
    const parts = [`Estimate ${pct(r.estimate)}`];
    if (r.lastMeasured !== undefined) parts.push(`last measured ${pct(r.lastMeasured)}`);
    if (r.due) parts.push("due for review");
    if (r.checked < MIN_EVIDENCE) parts.push(`only ${plural(r.checked, "answer")} in Check mode`);
    return parts.join(", ");
  };
  const capLabel = (c: Capability) => CAPABILITY_LABEL[c];
</script>

<div class="flex flex-col gap-6">
  <!-- The filter takes its own full-width line, so its chips wrap across the page, not down a column. -->
  <div class="flex flex-col gap-2">
    <div class="w-full min-w-0">
      <Choice label="Instrument" {options} bind:value={scope} />
    </div>
    <label class="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" class="size-5 accent-[color:var(--instr)]" bind:checked={showAll} />
      Show all {SKILL_GRAPH.skills.filter((s) => !s.deprecated).length} skills
    </label>
  </div>

  <!-- The method and the key wait behind one disclosure, so the first skill is in view. -->
  <details class="group -mt-3 text-sm">
    <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-instr-ink [&::-webkit-details-marker]:hidden">
      <ChevronDown class="size-4 -rotate-90 motion-safe:transition-transform group-open:rotate-0" aria-hidden="true" />How scores work
    </summary>
    <p class="max-w-prose text-ws-soft">
      Only answers in Check mode move the estimate, and it fades a little each day you do not practise. Attempts and accuracy count
      every attempt on {scope === "all" ? "any instrument" : INSTRUMENT_LABEL[scope]}.
    </p>
    <div class="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-ws-soft" aria-label="How to read the bars">
      <span class="flex items-center gap-2"><span class="h-2.5 w-8 rounded-full bg-instr" aria-hidden="true"></span>Estimate today</span>
      <span class="flex items-center gap-2"><span class="h-4 w-0 border-l-2 border-dashed border-ws-ink" aria-hidden="true"></span>Last measured</span>
      <span class="flex items-center gap-2"><span class="hatch h-2.5 w-8 rounded-full" aria-hidden="true"></span>Needs review: down ten points</span>
      <span class="flex items-center gap-2"><span class="h-2.5 w-8 rounded-full border-2 border-instr-ink" aria-hidden="true"></span>Under {MIN_EVIDENCE} answers in Check mode</span>
    </div>
  </details>

  {#if touchedCount === 0 && !showAll}
    <div class="rounded-2xl border border-dashed border-ws-line p-6">
      <p class="font-semibold">No skills touched {scope === "all" ? "yet" : `on ${INSTRUMENT_LABEL[scope]} yet`}.</p>
      <p class="text-sm text-ws-soft">Every graded attempt lands here, grouped by what it trains.</p>
      <a class="mt-3 inline-flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage" href="/music"
        >Start today's set</a
      >
    </div>
  {:else}
    {#each groups as g (g.capability)}
      <section aria-labelledby="cap-{g.capability}" class="min-w-0">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-ws-line pb-2">
          <h2 id="cap-{g.capability}" class="font-display text-xl font-semibold">{capLabel(g.capability)}</h2>
          <p class="tnum text-sm text-ws-soft">
            {g.total} skills, {g.mastered} mastered, average {pct(g.average)}{#if !showAll}, {g.touched} touched{/if}
          </p>
        </div>
        {#if g.rows.length}
          <!-- On a phone, one card per skill: name, bar, percent and a review glyph. -->
          <ul class="divide-y divide-ws-line sm:hidden">
            {#each g.rows as r (r.skill.id)}
              <li class="flex items-center gap-3 py-2" data-skill={r.skill.id}>
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1.5 font-medium">
                    {r.skill.name}
                    {#if !r.unlocked}<Lock class="size-3.5 shrink-0 text-ws-soft" aria-label="Locked" />{:else if r.due}<RotateCcw class="size-3.5 shrink-0 text-warn" aria-hidden="true" /><span class="sr-only">Needs review</span>{/if}
                  </p>
                  <div class="mt-1 flex items-center gap-2">
                    {@render bar(r)}
                    <span class="tnum w-10 shrink-0 text-right text-sm font-semibold">{r.estimate === undefined ? "None" : pct(r.estimate)}</span>
                  </div>
                  <p class="tnum text-xs text-ws-soft">
                    {r.checked} in Check{#if r.accuracy !== undefined}, {pct(r.accuracy)} right{/if}{#if r.lastPracticed}, {relativeDay(r.lastPracticed, now)}{/if}
                  </p>
                  <span class="sr-only">{describe(r)}</span>
                </div>
                <a href={r.href} class="inline-flex min-h-11 shrink-0 items-center rounded-full border border-ws-line px-3 text-sm font-medium hover:bg-ws-raised"
                  >Practise<span class="sr-only">&nbsp;{r.skill.name}</span></a
                >
              </li>
            {/each}
          </ul>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="relative overflow-x-auto max-sm:hidden" role="region" aria-label="{capLabel(g.capability)} skills" tabindex="0">
            <table class="w-full min-w-[48rem] table-fixed text-left text-sm">
              <colgroup>
                <col class="w-[24%]" />
                <col class="w-[22%]" />
                <col class="w-[9%]" />
                <col class="w-[10%]" />
                <col class="w-[8%]" />
                <col class="w-[11%]" />
                <col class="w-[9%]" />
                <col class="w-[7.5rem]" />
              </colgroup>
              <thead class="text-ws-soft">
                <tr>
                  <th scope="col" class="sticky left-0 z-10 bg-ws-bg py-2 pr-3 font-medium">Skill</th>
                  <th scope="col" class="w-44 py-2 pr-3 font-medium">Estimate</th>
                  <th scope="col" class="py-2 pr-3 text-right font-medium">Confidence</th>
                  <th scope="col" class="py-2 pr-3 text-right font-medium">Attempts</th>
                  <th scope="col" class="py-2 pr-3 text-right font-medium">Accuracy</th>
                  <th scope="col" class="py-2 pr-3 font-medium">Last practised</th>
                  <th scope="col" class="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" class="py-2 font-medium"><span class="sr-only">Practice link</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ws-line">
                {#each g.rows as r (r.skill.id)}
                  <tr data-skill={r.skill.id}>
                    <th scope="row" class="sticky left-0 z-10 bg-ws-bg py-2 pr-3 font-medium">
                      {r.skill.name}{#if r.umbrella && !r.direct}<span class="block text-xs font-normal text-ws-soft">Average of its parts</span>{/if}
                    </th>
                    <td class="py-2 pr-3">
                      <div class="flex items-center gap-2">
                        {@render bar(r)}
                        <span class="tnum w-10 text-right">{r.estimate === undefined ? "None" : pct(r.estimate)}</span>
                      </div>
                      <span class="sr-only">{describe(r)}</span>
                    </td>
                    <td class="tnum py-2 pr-3 text-right">{r.estimate === undefined ? "" : pct(r.confidence)}</td>
                    <td class="tnum py-2 pr-3 text-right">
                      {#if r.umbrella && !r.direct}<span class="text-ws-soft">{r.checked} in Check</span>{:else}{r.attempts}<span
                          class="block text-xs text-ws-soft">{r.checked} in Check</span
                        >{/if}
                    </td>
                    <td class="tnum py-2 pr-3 text-right">{r.accuracy === undefined ? "" : pct(r.accuracy)}</td>
                    <td class="py-2 pr-3">{r.lastPracticed ? relativeDay(r.lastPracticed, now) : "Never"}</td>
                    <td class="py-2 pr-3">
                      {#if !r.unlocked}
                        <span class="inline-flex items-center gap-1 text-ws-soft"><Lock class="size-3.5" aria-hidden="true" />Locked</span>
                      {:else if r.due}
                        <span class="font-medium text-ws-ink">Needs review</span>
                      {:else}
                        <span class="text-ws-soft">Unlocked</span>
                      {/if}
                    </td>
                    <td class="py-1 text-right">
                      <a
                        href={r.href}
                        class="inline-flex min-h-11 items-center rounded-full border border-ws-line px-3 font-medium hover:bg-ws-raised"
                        >Practise<span class="sr-only">&nbsp;{r.skill.name}</span></a
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="py-3 text-sm text-ws-soft">None touched {scope === "all" ? "yet" : `on ${INSTRUMENT_LABEL[scope]}`}.</p>
        {/if}
      </section>
    {/each}
  {/if}
</div>

{#snippet bar(r: SkillRow)}
  {@const est = (r.estimate ?? 0) * 100}
  {@const last = r.lastMeasured === undefined ? undefined : r.lastMeasured * 100}
  {@const hollow = r.checked < MIN_EVIDENCE}
  <div class="relative h-2.5 flex-1 rounded-full bg-ws-raised" aria-hidden="true">
    {#if r.estimate !== undefined}
      <div
        class="absolute inset-y-0 left-0 rounded-full {hollow ? 'border-2 border-instr-ink' : 'bg-instr'}"
        style:width="{Math.max(est, 4)}%"
      ></div>
      {#if r.due && last !== undefined}
        <div class="hatch absolute inset-y-0" style:left="{est}%" style:width="{last - est}%"></div>
      {/if}
      {#if last !== undefined}
        <div class="absolute -inset-y-1 w-0 border-l-2 border-dashed border-ws-ink" style:left="{last}%"></div>
      {/if}
    {/if}
  </div>
{/snippet}

<style>
  .hatch {
    background: repeating-linear-gradient(
      135deg,
      transparent 0 3px,
      color-mix(in oklch, var(--warn) 75%, transparent) 3px 6px
    );
  }
</style>
