<script lang="ts">
  import Play from "lucide-svelte/icons/play";
  import Check from "lucide-svelte/icons/check";
  import { BUDGET_OPTIONS } from "@repo/music-core/progress/routine";
  import { levelFor } from "@repo/music-core/progress/rewards";
  import { skillName } from "@repo/music-core/progress/graph";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import { todayChallenges, todayPlan } from "../today.svelte";
  import { btnPrimary, panel } from "../components/ui";

  const instrument = $derived(settings.value.activeInstrument);
  const budget = $derived(settings.value.routineBudgetMinutes);
  const plan = $derived(todayPlan(instrument, budget));
  const challenges = $derived(todayChallenges(plan.advice));
  const nextStep = $derived(plan.routine.steps.find((s) => !plan.done.includes(s.n)));
  const allDone = $derived(plan.routine.steps.length > 0 && !nextStep);
  const minutesLeft = $derived(
    plan.routine.steps.filter((s) => !plan.done.includes(s.n)).reduce((m, s) => m + s.minutes, 0),
  );

  const DAY = ["M", "T", "W", "T", "F", "S", "S"];
  const dayLetter = (d: string) => DAY[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
  const dotLabel = { practised: "practised", frozen: "covered by a freeze", missed: "no practice", today: "today, not yet" };
  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Morning session" : h < 18 ? "Afternoon session" : "Evening session";
  };
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <section aria-labelledby="set-title" class="min-w-0">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-ws-soft">{greeting()}, {INSTRUMENT_LABEL[instrument].toLowerCase()}</p>
        <h2 id="set-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {#if allDone}Set complete. Nice work.{:else if plan.done.length}{minutesLeft} minutes to go{:else}Today's set, {budget} minutes{/if}
        </h2>
      </div>
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Time available">
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
    </div>

    <!-- The set as a strip of blocks, sized by minutes, coloured by what you will play. -->
    <div class="mt-5 flex h-16 gap-1.5 overflow-hidden rounded-2xl" aria-hidden="true">
      {#each plan.routine.steps as step (step.n)}
        {@const done = plan.done.includes(step.n)}
        <div
          class="relative flex min-w-0 items-end rounded-xl p-2 text-sm font-semibold text-[oklch(0.2_0.04_288)]"
          style:flex-grow={step.minutes}
          style:background={done
            ? `repeating-linear-gradient(135deg, ${hueVar(hueForRoute(step.href, instrument))} 0 6px, color-mix(in oklch, ${hueVar(hueForRoute(step.href, instrument))} 70%, white) 6px 12px)`
            : hueVar(hueForRoute(step.href, instrument))}
          style:opacity={done ? 0.6 : 1}
        >
          <span class="truncate">{step.label}</span>
          {#if done}<Check class="absolute right-2 top-2 size-4" />{/if}
        </div>
      {/each}
    </div>

    <ol class="mt-4 flex flex-col gap-2">
      {#each plan.routine.steps as step (step.n)}
        {@const done = plan.done.includes(step.n)}
        {@const isNext = nextStep?.n === step.n}
        <li
          class="flex min-w-0 items-center gap-4 rounded-2xl border px-4 py-3 {isNext
            ? 'border-transparent bg-ws-surface shadow-sm ring-2 ring-[color:var(--step-hue)]'
            : 'border-ws-line'}"
          style:--step-hue={hueVar(hueForRoute(step.href, instrument))}
        >
          <span
            class="tnum grid size-9 shrink-0 place-items-center rounded-full font-display font-semibold {done ? 'bg-success text-white' : 'bg-ws-raised'}"
            aria-hidden="true">{#if done}<Check class="size-4" />{:else}{step.n}{/if}</span
          >
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              <span class="sr-only">Step {step.n}{done ? ", done" : ""}: </span>{step.label}
            </p>
            <p class="text-sm text-ws-soft">
              {step.reason === "weak-spot" && step.skillId ? `Your weak spot: ${skillName(step.skillId)}.` : step.description}
            </p>
          </div>
          <span class="tnum hidden text-sm text-ws-soft sm:inline">{step.minutes} min</span>
          <a
            href={step.href}
            class="flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold {isNext
              ? 'bg-[color:var(--step-hue)] text-[oklch(0.2_0.04_288)]'
              : 'border border-ws-line hover:bg-ws-raised'}"
          >
            {done ? "Again" : "Start"}<span class="sr-only">&nbsp;{step.label}</span>
          </a>
        </li>
      {/each}
    </ol>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      {#if nextStep}
        <a class={btnPrimary + " min-h-12 px-6 font-display text-base"} href={nextStep.href}>
          <Play class="size-5" aria-hidden="true" />
          {plan.done.length ? `Continue with ${nextStep.label}` : `Start with ${nextStep.label}`}
        </a>
      {:else if allDone}
        <p class="text-sm">
          {plan.summary.completedSteps} of {plan.summary.totalSteps} blocks, +{plan.summary.xp} XP{#if plan.summary.accuracy !== undefined},
            {Math.round(plan.summary.accuracy * 100)}% correct{/if}, {Math.round(plan.summary.durationMs / 60000)} min.
        </p>
        <a class={btnPrimary} href={plan.routine.steps[0].href}>Repeat the set</a>
        <a class="text-sm font-semibold text-instr-ink underline-offset-4 hover:underline" href="/music/journal">Open journal</a>
      {/if}
    </div>
  </section>

  <aside class="flex min-w-0 flex-col gap-4">
    <section class={panel} aria-labelledby="streak-title">
      <h2 id="streak-title" class="font-display text-lg font-semibold">
        {plan.streak.current ? `${plan.streak.current}-day streak` : "Start a streak today"}
      </h2>
      <ol class="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-ws-soft">
        {#each plan.streak.week as d (d.day)}
          <li class="flex flex-col items-center gap-1">
            <span
              class="grid size-8 place-items-center rounded-full {d.state === 'practised'
                ? 'bg-instr text-ws-stage'
                : d.state === 'frozen'
                  ? 'border-2 border-dashed border-info text-info'
                  : d.state === 'today'
                    ? 'border-2 border-instr-ink'
                    : 'bg-ws-raised'}"
              title="{d.day}: {dotLabel[d.state]}"
            >
              {#if d.state === "practised"}<Check class="size-4" aria-hidden="true" />{:else if d.state === "frozen"}<span aria-hidden="true">❄</span>{/if}
            </span>
            <span aria-hidden="true">{dayLetter(d.day)}</span>
            <span class="sr-only">{d.day}: {dotLabel[d.state]}</span>
          </li>
        {/each}
      </ol>
      <p class="mt-3 text-sm text-ws-soft">
        {plan.freezes} freeze{plan.freezes === 1 ? "" : "s"} held, one earned per week you practise. A missed day is covered automatically.
      </p>
    </section>

    <section class={panel} aria-labelledby="coach-title">
      <h2 id="coach-title" class="font-display text-lg font-semibold">{plan.advice.headline}</h2>
      <p class="mt-1 text-sm">{plan.advice.summary}</p>
      {#if plan.advice.insights.length}
        <ul class="mt-3 flex flex-col gap-1 text-sm text-ws-soft">
          {#each plan.advice.insights as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}
      <a class="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-instr-ink underline-offset-4 hover:underline" href={plan.advice.action.href}>
        {plan.advice.action.label}
      </a>
    </section>

    <section class={panel} aria-labelledby="challenges-title">
      <h2 id="challenges-title" class="font-display text-lg font-semibold">Today's challenges</h2>
      <ul class="mt-3 flex flex-col gap-3">
        {#each challenges as c (c.id)}
          <li class="text-sm">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-medium">{#if c.done}<span class="text-success" aria-hidden="true">✓ </span>{/if}{c.title}</span>
              <span class="tnum text-ws-soft">{c.progress}/{c.target}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-ws-raised" aria-hidden="true">
              <div class="h-full rounded-full {c.done ? 'bg-success' : 'bg-instr'}" style:width="{(c.progress / c.target) * 100}%"></div>
            </div>
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-xs text-ws-soft">Level {levelFor(practice.xpTotal)}, {practice.xpTotal} XP in total.</p>
    </section>
  </aside>
</div>
