<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import Check from "@lucide/svelte/icons/check";
  import PartyPopper from "@lucide/svelte/icons/party-popper";
  import { BUDGET_OPTIONS, roleLabel } from "@repo/music-core/progress/routine";
  import { levelFor } from "@repo/music-core/progress/rewards";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import { blockReason, localWeekday, setDayInstrument, splitOptions, todayChallenges, todayPlan, WEEKDAYS } from "../today.svelte";
  import { btnPrimary, panel } from "../components/ui";
  import Picker from "../components/Picker.svelte";
  import { HUE_ICON } from "./hue-icons";
  import Ring from "./progress/Ring.svelte";

  const plan = $derived(todayPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes));
  const instrument = $derived(plan.instrument);
  const weekday = localWeekday();
  const budget = $derived(plan.routine.budgetMinutes);
  const challenges = $derived(todayChallenges(plan.advice));
  const nextStep = $derived(plan.routine.steps.find((s) => !plan.done.includes(s.n)));
  const allDone = $derived(plan.routine.steps.length > 0 && !nextStep);
  const minutesLeft = $derived(
    plan.routine.steps.filter((s) => !plan.done.includes(s.n)).reduce((m, s) => m + s.minutes, 0),
  );

  const hueOf = (href: string) => hueForRoute(href, instrument);
  // The end-of-set burst: twelve dots in the set's hues, flung out on a circle.
  const burst = $derived(
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const step = plan.routine.steps[i % plan.routine.steps.length];
      return { dx: Math.cos(a) * 70, dy: Math.sin(a) * 46, hue: step ? hueVar(hueOf(step.href)) : "var(--instr)" };
    }),
  );

  // The burst plays the first time a done set is seen each day, not on every visit.
  let fresh = $state(false);
  $effect(() => {
    if (!allDone) return;
    const day = new Date().toDateString();
    try {
      if (localStorage.getItem("woodshed.set-celebrated") === day) return;
      localStorage.setItem("woodshed.set-celebrated", day);
    } catch {
      // No storage: celebrate anyway.
    }
    fresh = true;
  });

  const DAY = ["M", "T", "W", "T", "F", "S", "S"];
  const dayLetter = (d: string) => DAY[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
  const dotLabel = { practised: "practised", frozen: "covered by a freeze", missed: "no practice", today: "today, not yet", upcoming: "still to come" };
  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Morning session" : h < 18 ? "Afternoon session" : "Evening session";
  };
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <section aria-labelledby="set-title" class="min-w-0">
    <p class="text-ws-soft">{greeting()}, {INSTRUMENT_LABEL[instrument]}{plan.pass > 1 ? `, pass ${plan.pass}` : ""}</p>
    <h2 id="set-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
      {#if allDone}Set complete. Nice work.{:else if plan.done.length}{minutesLeft} minutes to go{:else}Today's set, {budget} minutes{/if}
    </h2>

    <!-- The set as a ribbon that fills block by block, and the one button that plays it. -->
    <div class="relative mt-4 overflow-hidden rounded-3xl border border-ws-line bg-ws-surface p-4 shadow-sm sm:p-5">
      <div
        class="flex gap-1.5"
        role="progressbar"
        aria-label="Today's set"
        aria-valuemin={0}
        aria-valuemax={plan.routine.steps.length}
        aria-valuenow={plan.done.length}
        aria-valuetext="{plan.done.length} of {plan.routine.steps.length} blocks done"
      >
        {#each plan.routine.steps as step (step.n)}
          {@const done = plan.done.includes(step.n)}
          {@const isNext = nextStep?.n === step.n}
          {@const Icon = HUE_ICON[hueOf(step.href)]}
          <div class="min-w-11 basis-0" style:flex-grow={step.minutes} style:--step-hue={hueVar(hueOf(step.href))}>
            <div class="relative h-11 overflow-hidden rounded-full bg-ws-raised {isNext ? 'ring-2 ring-[color:var(--step-hue)] ring-offset-2 ring-offset-ws-surface' : ''}">
              <div
                class="absolute inset-y-0 left-0 rounded-full bg-[color:var(--step-hue)] motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
                style:width={done ? "100%" : "0%"}
              ></div>
              <span class="relative flex h-full items-center gap-1.5 px-1.5">
                <span class="grid size-8 shrink-0 place-items-center rounded-full bg-ws-surface text-ws-ink shadow-sm">
                  {#if done}<Check class="size-4 text-success" aria-hidden="true" />{:else}<Icon class="size-4" aria-hidden="true" />{/if}
                </span>
                <span class="tnum hidden truncate text-xs font-semibold sm:inline {done ? 'text-[oklch(0.2_0.04_288)]' : 'text-ws-soft'}">{step.minutes} min</span>
              </span>
            </div>
            <p class="mt-1.5 truncate text-xs font-medium {done ? 'text-ws-soft line-through' : ''}">{step.label}</p>
          </div>
        {/each}
      </div>

      {#if nextStep}
        <a class={btnPrimary + " mt-4 min-h-14 w-full px-6 font-display text-base sm:w-auto sm:text-lg"} href={nextStep.href}>
          <Play class="size-5" aria-hidden="true" />
          {plan.done.length ? `Continue with ${nextStep.label}` : `Start with ${nextStep.label}`}
        </a>
      {:else if allDone}
        <div class="relative mt-4 flex flex-wrap items-center gap-3">
          <span class:fresh class="celebrate relative grid size-12 shrink-0 place-items-center rounded-full bg-success/15 text-success" aria-hidden="true">
            <PartyPopper class="size-6" />
            {#each burst as b, i (i)}
              <span class="spark absolute size-2 rounded-full" style:background={b.hue} style:--dx="{b.dx}px" style:--dy="{b.dy}px"></span>
            {/each}
          </span>
          <p class="min-w-0 flex-1 text-sm">
            {plan.summary.completedSteps} of {plan.summary.totalSteps} blocks, +{plan.summary.xp} XP{#if plan.summary.accuracy !== undefined},
              {Math.round(plan.summary.accuracy * 100)}% correct{/if}, {Math.round(plan.summary.durationMs / 60000)} min.
          </p>
          <a class={btnPrimary} href={plan.repeatHref}>Repeat the set</a>
          <a class="inline-flex min-h-11 items-center text-sm font-semibold text-instr-ink underline-offset-4 hover:underline" href="/music/journal">Open journal</a>
        </div>
      {/if}
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Time available">
        {#each BUDGET_OPTIONS as m (m)}
          <button
            type="button"
            class="tnum min-h-11 min-w-12 rounded-full border px-3 text-sm {m === budget
              ? 'border-transparent bg-instr font-semibold text-ws-stage'
              : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
            aria-pressed={m === budget}
            onclick={() => settings.update({ routineBudgetMinutes: m })}>{m} min</button
          >
        {/each}
      </div>
      <div class="flex items-center gap-2 text-sm text-ws-soft">
        <span aria-hidden="true">{WEEKDAYS[weekday]}s</span>
        <Picker
          class="w-auto"
          label="Instrument on {WEEKDAYS[weekday]}s"
          value={settings.value.weeklySplit?.[weekday] ?? ""}
          options={splitOptions(settings.value.activeInstrument)}
          onchange={(v) => setDayInstrument(weekday, v)}
        />
      </div>
    </div>

    <ol class="mt-4 flex flex-col gap-2">
      {#each plan.routine.steps as step (step.n)}
        {@const done = plan.done.includes(step.n)}
        {@const isNext = nextStep?.n === step.n}
        {@const Icon = HUE_ICON[hueOf(step.href)]}
        <li
          class="flex min-w-0 items-center gap-4 rounded-2xl border px-4 py-3 {isNext
            ? 'border-transparent bg-ws-surface shadow-sm ring-2 ring-[color:var(--step-hue)]'
            : 'border-ws-line'}"
          style:--step-hue={hueVar(hueOf(step.href))}
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full {done ? 'bg-success text-white' : 'bg-[color:var(--step-hue)] text-[oklch(0.2_0.04_288)]'}"
            aria-hidden="true">{#if done}<Check class="size-4" />{:else}<Icon class="size-4" />{/if}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-ws-soft">{roleLabel(step)}</p>
            <p class="font-semibold">
              <span class="sr-only">Step {step.n}{done ? ", done" : ""}: </span>{step.label}
            </p>
            <p class="text-sm text-ws-soft">{blockReason(step)}</p>
          </div>
          <span class="tnum hidden text-sm text-ws-soft sm:inline">{step.minutes} min</span>
          <a href={step.href} class="flex min-h-11 shrink-0 items-center rounded-full border border-ws-line px-4 text-sm font-semibold hover:bg-ws-raised">
            {done ? "Again" : "Start"}<span class="sr-only">&nbsp;{step.label}</span>
          </a>
        </li>
      {/each}
    </ol>
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
                    : d.state === 'upcoming'
                      ? 'border border-dashed border-ws-line'
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
      {#if plan.advice.focus}
        <!-- One figure for the focus skill: its checked answers, all time, on this instrument. -->
        <div class="mt-3 flex items-center gap-3">
          <Ring value={plan.advice.focus.accuracy} stroke={plan.advice.focus.accuracy >= 0.85 ? "var(--success)" : "var(--warn)"} class="size-16">
            <span class="tnum font-display text-base font-semibold">{Math.round(plan.advice.focus.accuracy * 100)}%</span>
          </Ring>
          <p class="text-sm text-ws-soft">
            correct on {plan.advice.focus.name}, from {plan.advice.focus.attempts} checked answers on {INSTRUMENT_LABEL[instrument]}
          </p>
        </div>
      {:else}
        <p class="mt-1 text-sm">{plan.advice.summary}</p>
      {/if}
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

<style>
  /* The end-of-set burst plays once a day, and only for people who have not asked for less motion. */
  .spark {
    opacity: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .fresh .spark {
      animation: spark 900ms ease-out 200ms both;
    }
    .celebrate.fresh {
      animation: pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
    }
  }
  @keyframes spark {
    0% {
      opacity: 1;
      transform: translate(0, 0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(0.4);
    }
  }
  @keyframes pop {
    from {
      transform: scale(0.4);
    }
  }
</style>
