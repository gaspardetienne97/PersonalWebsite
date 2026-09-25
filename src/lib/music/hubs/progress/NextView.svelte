<script lang="ts">
  // What next: what to play in the next few minutes and why. It is a heuristic,
  // so it always links to the evidence (Skills, Sessions).
  import { BUDGET_OPTIONS } from "@repo/music-core/progress/routine";
  import { skillName } from "@repo/music-core/progress/graph";
  import { INSTRUMENT_LABEL } from "../../bench.svelte";
  import { hueForRoute, hueVar } from "../../hues";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { todayPlan } from "../../today.svelte";
  import { MIN_EVIDENCE, nextBuckets, pct, plural, relativeDay, skillRows, type SkillRow } from "./model";

  let { now = Date.now() }: { now?: number } = $props();

  const instrument = $derived(settings.value.activeInstrument);
  const budget = $derived(settings.value.routineBudgetMinutes);
  const plan = $derived(todayPlan(instrument, budget));
  const rows = $derived(skillRows({ stats: practice.stats, mastery: practice.mastery, instrument, now }));
  const buckets = $derived(nextBuckets(rows));
  const anything = $derived(buckets.falling.length + buckets.holding.length + buckets.unmeasured.length > 0);

  const reasoning = $derived.by(() => {
    const parts = [plan.advice.summary];
    const { falling, holding, unmeasured } = buckets;
    if (falling.length)
      parts.push(
        `${falling[0].skill.id === plan.advice.focus?.skillId ? "It has also" : falling[0].skill.name}${falling.length > 1 ? ` and ${plural(falling.length - 1, "other skill")}` : ""} dropped ten points or more since you last measured, so a short review comes first.`,
      );
    else if (holding.length) parts.push("Nothing you have measured is falling yet.");
    if (unmeasured.length)
      parts.push(
        `${plural(unmeasured.length, "skill has", "skills have")} fewer than ${MIN_EVIDENCE} checked attempts, so there is no verdict on ${unmeasured.length === 1 ? "it" : "them"} yet.`,
      );
    return parts.join(" ");
  });

  const drop = (r: SkillRow) => Math.round(((r.lastMeasured ?? 0) - (r.estimate ?? 0)) * 100);
</script>

<div class="flex flex-col gap-10">
  <section aria-labelledby="next-title" class="grid min-w-0 gap-x-10 gap-y-4 lg:grid-cols-2">
    <div class="min-w-0">
    <p class="text-ws-soft">Practise next on {INSTRUMENT_LABEL[instrument].toLowerCase()}</p>
    <h2 id="next-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{plan.advice.headline}</h2>
    <p class="mt-2 max-w-prose">{reasoning}</p>

    <div class="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Time available">
      {#each BUDGET_OPTIONS as m (m)}
        <button
          type="button"
          class="tnum min-h-11 min-w-12 rounded-full border px-3 text-sm {m === budget
            ? 'border-transparent bg-ws-ink font-semibold text-ws-bg'
            : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
          aria-pressed={m === budget}
          onclick={() => settings.update({ routineBudgetMinutes: m })}>{m} min</button
        >
      {/each}
    </div>

    <p class="mt-4 text-sm text-ws-soft">
      This is a heuristic. The evidence behind it is in
      <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/progress?view=skills">every skill</a>
      and
      <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/progress?view=sessions">your sessions</a>.
    </p>
    </div>

    <ol aria-label="Today's set" class="flex min-w-0 flex-col self-start divide-y divide-ws-line border-y border-ws-line">
      {#each plan.routine.steps as step (step.n)}
        {@const done = plan.done.includes(step.n)}
        <li class="flex min-w-0 items-center gap-3 py-2.5" style:--step-hue={hueVar(hueForRoute(step.href, instrument))}>
          <span class="h-9 w-1.5 shrink-0 rounded-full bg-[color:var(--step-hue)]" aria-hidden="true"></span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              <span class="sr-only">Step {step.n}: </span>{step.label}{#if done}<span class="font-normal text-success"> (done)</span>{/if}
            </p>
            <p class="text-sm text-ws-soft">
              {step.reason === "weak-spot" && step.skillId ? `Your weak spot, ${skillName(step.skillId)}.` : step.description}
              <span class="tnum">{step.minutes} min.</span>
            </p>
          </div>
          <a
            href={step.href}
            class="flex min-h-11 shrink-0 items-center rounded-full border border-ws-line px-4 text-sm font-semibold hover:bg-ws-raised"
          >
            {done ? "Again" : "Start"}<span class="sr-only">&nbsp;{step.label}</span>
          </a>
        </li>
      {/each}
    </ol>

  </section>

  <section aria-labelledby="picks-title" class="min-w-0">
    <h2 id="picks-title" class="font-display text-xl font-semibold">Where your skills stand</h2>
    {#if anything}
      <p class="text-sm text-ws-soft">
        Lowest estimates first, up to eight, from checked attempts on {INSTRUMENT_LABEL[instrument].toLowerCase()}.
      </p>
      <div class="mt-4 grid gap-6 sm:grid-cols-3">
        {@render column("Falling", "Dropped ten points or more since last measured.", buckets.falling, "falling")}
        {@render column("Holding", "Measured and not slipping.", buckets.holding, "holding")}
        {@render column("Not measured yet", `Under ${MIN_EVIDENCE} checked attempts, or practice only.`, buckets.unmeasured.slice(0, 8), "new")}
      </div>
    {:else}
      <p class="mt-2">
        Nothing touched on {INSTRUMENT_LABEL[instrument].toLowerCase()} yet. Five checked attempts on a skill give it an estimate.
      </p>
      {#if plan.routine.steps[0]}
        <a
          class="mt-3 inline-flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage"
          href={plan.routine.steps[0].href}>Start with {plan.routine.steps[0].label}</a
        >
      {/if}
    {/if}
  </section>
</div>

{#snippet column(title: string, hint: string, list: SkillRow[], kind: "falling" | "holding" | "new")}
  <div class="min-w-0">
    <h3 class="flex items-center gap-2 font-semibold">
      <span
        class="size-2.5 rounded-full {kind === 'falling'
          ? 'bg-warn'
          : kind === 'holding'
            ? 'bg-success'
            : 'border-2 border-ws-soft'}"
        aria-hidden="true"
      ></span>{title}
    </h3>
    <p class="text-xs text-ws-soft">{hint}</p>
    {#if list.length}
      <ul class="mt-2 flex flex-col">
        {#each list as r (r.skill.id)}
          <li>
            <a href={r.href} class="flex min-h-11 flex-col justify-center rounded-lg px-2 py-1.5 -mx-2 hover:bg-ws-raised">
              <span class="font-medium">{r.skill.name}</span>
              <span class="tnum text-sm text-ws-soft">
                {#if kind === "falling"}
                  {pct(r.estimate ?? 0)} now, down {drop(r)} points, last practised {relativeDay(r.lastPracticed ?? now, now)}
                {:else if kind === "holding"}
                  {pct(r.estimate ?? 0)}, {plural(r.checked, "checked attempt")}
                {:else}
                  {r.checked
                    ? `${plural(r.checked, "checked attempt")} so far`
                    : `${plural(r.attempts, "practice attempt")}, none checked`}
                {/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-sm text-ws-soft">None right now.</p>
    {/if}
  </div>
{/snippet}
