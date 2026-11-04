<script lang="ts">
  import Play from "lucide-svelte/icons/play";
  import Check from "lucide-svelte/icons/check";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal";
  import Star from "lucide-svelte/icons/star";
  import Info from "lucide-svelte/icons/info";
  import { BUDGET_OPTIONS, blockStars, roleLabel } from "@repo/music-core/progress/routine";
  import { COACH_MIN_ATTEMPTS } from "@repo/music-core/progress/coach";
  import { levelFor } from "@repo/music-core/progress/rewards";
  import { INSTRUMENT_LABEL } from "../bench.svelte";
  import { hueForRoute, hueVar } from "../hues";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import {
    blockReason,
    blockSummary,
    localWeekday,
    nextDrill,
    setDayInstrument,
    splitOptions,
    todayChallenges,
    todayPlan,
    tomorrowPlan,
    WEEKDAYS,
  } from "../today.svelte";
  import { btn, btnPrimary, panel } from "../components/ui";
  import Picker from "../components/Picker.svelte";
  import { HUE_ICON } from "./hue-icons";
  import Ring from "./progress/Ring.svelte";
  import StreakWeek from "./progress/StreakWeek.svelte";
  import { formatDuration } from "./progress/model";
  import DrillPreview from "./DrillPreview.svelte";

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
  // The coach's bar, drawn: checked answers so far against the five it needs.
  const toMeasure = $derived(Math.min(plan.checked, COACH_MIN_ATTEMPTS));
  // A set run in Practice: true, and the card says why the coach still has nothing.
  const practiceOnly = $derived(plan.done.length > 0 && !plan.advice.measured && plan.checked === 0);

  // Length and the weekday's routine: changed rarely, so they wait behind Adjust.
  let adjusting = $state(false);
  // One block's details open at a time; the block about to start is open until another is picked.
  // Its Start is the set's one primary button. -1: the reader closed it.
  let openRow = $state<number | null>(null);
  const shownRow = $derived(openRow ?? nextStep?.n ?? null);
  let coachInfo = $state(false);
  const plannedMinutes = $derived(plan.routine.steps.reduce((m, s) => m + s.minutes, 0));

  // Once the set is done: one named drill to try next (the coach's when it has measured something,
  // else the first drill on this instrument the set did not use), and tomorrow's set.
  const tomorrow = $derived(allDone ? tomorrowPlan(settings.value.activeInstrument, settings.value.routineBudgetMinutes) : undefined);
  const nextUp = $derived(allDone ? nextDrill(plan) : undefined);

  const hueOf = (href: string) => hueForRoute(href, instrument);
  // Stars per block on the advance rule's lines (70%, 85%, clean); a block with no scored run has none.
  const stars = $derived(allDone ? blockStars(plan.routine, practice.sessions) : {});
  const STAR_WORDS = ["under 70%", "70% or better", "a pass at 85% or better", "a clean run"];
  // Confetti only when a block passed at 85%, never on a set with nothing scored.
  const passed = $derived(Object.values(stars).some((n) => n >= 2));
  // Static confetti, drawn at rest so a still frame shows it; motion only adds a short fall.
  const confetti = $derived(
    Array.from({ length: 24 }, (_, i) => {
      const step = plan.routine.steps[i % Math.max(1, plan.routine.steps.length)];
      return {
        x: ((i * 41) % 97) + 1.5,
        y: ((i * 53) % 30) + 6,
        r: (i * 47) % 180,
        round: i % 3 === 0,
        hue: step ? hueVar(hueOf(step.href)) : "var(--instr)",
      };
    }),
  );
  // Before any practice the side cards have nothing to say: no challenges, no second button.
  const fresh0 = $derived(practice.sessions.length === 0);

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

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Morning session" : h < 18 ? "Afternoon session" : "Evening session";
  };
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <section aria-labelledby="set-title" class="min-w-0">
    <div class="flex items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-ws-soft">{greeting()}, {INSTRUMENT_LABEL[instrument]}{plan.pass > 1 ? `, pass ${plan.pass}` : ""}</p>
        <h2 id="set-title" class="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {#if allDone}Set complete. Nice work.{:else if plan.done.length}{minutesLeft} minutes to go{:else}Today's set, {budget} minutes{/if}
        </h2>
      </div>
      <button type="button" class="{btn} shrink-0" aria-expanded={adjusting} aria-controls="set-adjust" onclick={() => (adjusting = !adjusting)}>
        <SlidersHorizontal class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Adjust</span><ChevronDown
          class="size-4 motion-safe:transition-transform max-sm:hidden {adjusting ? 'rotate-180' : ''}"
          aria-hidden="true"
        />
      </button>
    </div>

    {#if adjusting}
      <div id="set-adjust" class="mt-3 flex flex-col gap-3 rounded-2xl border border-ws-line bg-ws-surface p-3 sm:p-4">
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium" id="len-label">Length of the set</span>
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="len-label">
            {#each BUDGET_OPTIONS as m (m)}
              <button
                type="button"
                class="tnum min-h-11 min-w-12 rounded-full border px-3 text-sm {m === budget
                  ? 'border-transparent bg-instr-strong font-semibold text-on-instr'
                  : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
                aria-pressed={m === budget}
                onclick={() => settings.update({ routineBudgetMinutes: m })}>{m} min</button
              >
            {/each}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="font-medium" aria-hidden="true">{WEEKDAYS[weekday]} routine</span>
          <Picker
            class="w-auto"
            label="Instrument on {WEEKDAYS[weekday]}s"
            value={settings.value.weeklySplit?.[weekday] ?? ""}
            options={splitOptions(settings.value.activeInstrument)}
            onchange={(v) => setDayInstrument(weekday, v)}
          />
          <span class="text-ws-soft">Repeats every {WEEKDAYS[weekday]}.</span>
        </div>
      </div>
    {/if}

    <!-- The set as a ribbon that fills block by block, and the one button that plays it. -->
    <div
      class="relative mt-4 overflow-hidden rounded-3xl border bg-ws-surface p-4 shadow-sm sm:p-5 {allDone
        ? 'border-success/60 ring-1 ring-success/30'
        : 'border-ws-line'}"
    >
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
                class="ws-fill absolute inset-y-0 left-0 rounded-full bg-[color:var(--step-hue)] {done ? '' : 'opacity-60'}"
                style:width={done ? "100%" : `${Math.min(95, ((plan.playedMs[step.n] ?? 0) / (step.minutes * 600)))}%`}
                style:transition-delay={fresh ? `${(step.n - 1) * 180}ms` : undefined}
              ></div>
              <span class="relative flex h-full items-center gap-1.5 px-1.5">
                <span class="grid size-8 shrink-0 place-items-center rounded-full bg-ws-surface text-ws-ink shadow-sm">
                  {#if done}<span class={fresh ? "ws-pop" : ""} style:animation-delay={fresh ? `${(step.n - 1) * 180 + 300}ms` : undefined}
                      ><Check class="size-4 text-success" aria-hidden="true" /></span
                    >{:else}<Icon class="size-4" aria-hidden="true" />{/if}
                </span>
                <span class="tnum hidden truncate text-xs font-semibold sm:inline {done ? 'text-ws-stage' : 'text-ws-soft'}">{step.minutes} min</span>
              </span>
            </div>
            <span class="sr-only">{step.label}{done ? ", done" : isNext ? ", now" : ""}</span>
          </div>
        {/each}
      </div>

      {#if allDone}
        <!-- The set's moment: stars per block on the advance rule's lines, confetti only on a pass. -->
        <div class="relative mt-4 overflow-hidden rounded-2xl bg-success/10 p-4 sm:p-5 {passed ? 'pt-12 sm:pt-12' : ''}">
          <!-- A band of confetti over the stars, clear of the text. -->
          <span class:fresh class="celebrate pointer-events-none absolute inset-x-0 top-0 h-11" aria-hidden="true">
            {#if passed}
              <svg class="size-full overflow-visible">
                {#each confetti as c, i (i)}
                  {#if c.round}
                    <ellipse class="bit" style:--d="{(i % 6) * 60}ms" cx="{c.x}%" cy={c.y} rx="3.5" ry="5" fill={c.hue} style:rotate="{c.r}deg" />
                  {:else}
                    <rect class="bit" style:--d="{(i % 6) * 60}ms" x="{c.x}%" y={c.y - 6} width="5" height="12" rx="1.5" fill={c.hue} style:rotate="{c.r}deg" />
                  {/if}
                {/each}
              </svg>
            {/if}
          </span>
          <ul class="relative flex flex-wrap gap-x-6 gap-y-3">
            {#each plan.routine.steps as step (step.n)}
              {@const n = stars[step.n]}
              <li class="flex min-w-0 flex-col gap-1">
                <span class="text-sm font-semibold">{step.label}</span>
                {#if n === undefined}
                  <span class="text-sm text-ws-soft">Not measured</span>
                {:else}
                  <span class="flex gap-0.5" role="img" aria-label="{n} of 3 stars: {STAR_WORDS[n]}">
                    {#each [1, 2, 3] as k (k)}
                      <Star class="size-7 {k <= n ? 'fill-current text-warn' : 'text-ws-line'}" aria-hidden="true" />
                    {/each}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
          <!-- What the set came to, measured: time spent in its runs, beside the plan's minutes, so the two never read as one figure. -->
          <dl class="tnum relative mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <div><dt class="text-xs text-ws-soft">Blocks</dt><dd class="font-semibold">{plan.summary.completedSteps} of {plan.summary.totalSteps}</dd></div>
            {#if plan.summary.accuracy !== undefined}
              <div><dt class="text-xs text-ws-soft">Correct</dt><dd class="font-semibold">{Math.round(plan.summary.accuracy * 100)}%</dd></div>
            {/if}
            <div>
              <dt class="text-xs text-ws-soft">In runs today</dt>
              <dd><span class="font-semibold">{formatDuration(plan.summary.durationMs)}</span><span class="block text-xs text-ws-soft">of {plannedMinutes} min planned</span></dd>
            </div>
            <div><dt class="text-xs text-ws-soft">XP</dt><dd class="font-semibold">+{plan.summary.xp}</dd></div>
          </dl>
          {#if nextUp}<p class="relative mt-4 text-sm">{nextUp.why}</p>{/if}
          <div class="relative mt-2 flex flex-wrap items-center gap-2">
            {#if nextUp}<a class={btnPrimary} href={nextUp.href}><Play class="size-4" aria-hidden="true" />{nextUp.label}</a>{/if}
            <a class={nextUp ? btn : btnPrimary} href={plan.repeatHref}>Repeat the set</a>
            <a class="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-instr-ink hover:underline" href="/music/journal">Open journal</a>
          </div>
        </div>
      {/if}
    </div>

    {#if allDone && tomorrow}
      <section aria-labelledby="tomorrow-title" class="mt-4 rounded-3xl border border-ws-line bg-ws-surface p-4 sm:p-5">
        <h2 id="tomorrow-title" class="font-display text-lg font-semibold">Tomorrow, {tomorrow.routine.budgetMinutes} minutes on {INSTRUMENT_LABEL[tomorrow.instrument]}</h2>
        <ol class="mt-2 flex flex-col gap-1.5 text-sm">
          {#each tomorrow.routine.steps as st (st.n)}
            {@const T = HUE_ICON[hueOf(st.href)]}
            <li class="flex items-center gap-2" style:--step-hue={hueVar(hueOf(st.href))}>
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--step-hue)] text-ws-stage" aria-hidden="true"><T class="size-3.5" /></span>
              <span class="min-w-0 flex-1 truncate">{st.label}</span>
              <span class="tnum text-ws-soft">{st.minutes} min</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <!-- The blocks: what each one plays and why it is here. A row opens to its details and its own Start. -->
    <ol class="mt-4 flex flex-col gap-2">
      {#each plan.routine.steps as step (step.n)}
        {@const done = plan.done.includes(step.n)}
        {@const isNext = nextStep?.n === step.n}
        {@const expanded = shownRow === step.n}
        {@const played = plan.playedMs[step.n]}
        <li
          class="min-w-0 rounded-2xl border {isNext ? 'border-transparent bg-ws-surface shadow-sm ring-2 ring-[color:var(--step-hue)]' : 'border-ws-line'}"
          style:--step-hue={hueVar(hueOf(step.href))}
        >
          <button
            type="button"
            class="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-ws-raised/60 sm:gap-4 sm:px-4"
            aria-expanded={expanded}
            aria-controls="block-{step.n}"
            onclick={() => (openRow = expanded ? -1 : step.n)}
          >
            <span class="relative {expanded ? 'hidden' : ''}">
              <DrillPreview href={step.href} {instrument} class="rounded-lg" />
              {#if done}<span class="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-success text-white" aria-hidden="true"><Check class="size-3.5" /></span>{/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-x-2 text-xs font-medium text-ws-soft">
                <span>{roleLabel(step)}</span>
                {#if done}<span class="font-semibold text-success">Done</span>{:else if isNext}<span class="rounded-full bg-instr-wash px-2 font-semibold text-instr-ink">Now</span>{/if}
              </span>
              <span class="block font-semibold"><span class="sr-only">Step {step.n}{done ? ", done" : ""}: </span>{step.label}</span>
              {#if !expanded}<span class="line-clamp-2 text-sm text-ws-soft">{blockSummary(step)}</span>{/if}
            </span>
            <span class="tnum shrink-0 text-right text-sm text-ws-soft">
              {step.minutes} min{#if played}<span class="block text-xs">{formatDuration(played)} played</span>{/if}
            </span>
            <ChevronDown class="size-4 shrink-0 text-ws-soft motion-safe:transition-transform {expanded ? 'rotate-180' : ''}" aria-hidden="true" />
          </button>
          {#if expanded}
            <div id="block-{step.n}" class="flex flex-col gap-3 border-t border-ws-line px-3 py-3 sm:flex-row sm:items-center sm:px-4">
              <DrillPreview href={step.href} size="md" {instrument} class="sm:w-60 sm:shrink-0" />
              <div class="flex min-w-0 flex-col items-start gap-3">
                <p class="text-sm">{blockReason(step)}</p>
                {#if isNext && !done}
                  <a class={btnPrimary + " min-h-14 w-full px-6 font-display text-base sm:w-auto sm:text-lg"} href={step.href}>
                    <Play class="size-5" aria-hidden="true" />Start with {step.label}
                  </a>
                {:else}
                  <a href={step.href} class={btn}>
                    <Play class="size-4" aria-hidden="true" />{done ? "Play again" : "Start"}<span class="sr-only">&nbsp;{step.label}</span>
                  </a>
                {/if}
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  </section>

  <aside class="flex min-w-0 flex-col gap-4">
    <section class={panel} aria-label="Streak">
      <StreakWeek week={plan.streak.week} current={plan.streak.current} freezes={plan.freezes} pop={fresh ? plan.today : undefined} />
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
            correct on {plan.advice.focus.name}, from {plan.advice.focus.attempts} answers in Check mode on {INSTRUMENT_LABEL[instrument]}
          </p>
        </div>
      {:else if !plan.advice.measured && plan.checked < COACH_MIN_ATTEMPTS}
        <!-- Nothing measured yet: one line and the bar; the method waits behind the info button. -->
        <p class="mt-1 flex items-start gap-1 text-sm">
          <span class="flex-1">Weak spots show up after {COACH_MIN_ATTEMPTS} checked answers.</span>
          <button
            type="button"
            class="-my-2 grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
            aria-label="How weak spots are found"
            aria-expanded={coachInfo}
            aria-controls="coach-info"
            onclick={() => (coachInfo = !coachInfo)}><Info class="size-5" aria-hidden="true" /></button
          >
        </p>
        {#if coachInfo}<p id="coach-info" class="mt-1 rounded-xl bg-ws-raised px-3 py-2 text-sm">{plan.advice.summary} Check mode is the run that counts: no hints, every answer scored.</p>{/if}
        <div class="mt-3 flex items-center gap-3">
          <div
            class="h-2 flex-1 rounded-full bg-ws-raised"
            role="progressbar"
            aria-label="Answers in Check mode"
            aria-valuemin={0}
            aria-valuemax={COACH_MIN_ATTEMPTS}
            aria-valuenow={toMeasure}
          >
            <div class="h-full rounded-full bg-instr" style:width="{(toMeasure / COACH_MIN_ATTEMPTS) * 100}%"></div>
          </div>
          <span class="tnum text-sm font-semibold">{toMeasure} of {COACH_MIN_ATTEMPTS}</span>
        </div>
        {#if practiceOnly}
          <p class="mt-2 text-sm text-ws-soft">Today's set ran in Practice. Answers in Check mode count here.</p>
        {/if}
      {:else}
        <p class="mt-1 text-sm">{plan.advice.summary}</p>
      {/if}
      {#if plan.advice.measured && plan.advice.insights.length}
        <ul class="mt-3 flex flex-col gap-1 text-sm text-ws-soft">
          {#each plan.advice.insights as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}
      {#if !fresh0 && !(allDone && nextUp?.href === plan.advice.action.href)}
        <a class="{btn} mt-3" href={plan.advice.action.href}>{plan.advice.action.label}</a>
      {/if}
    </section>

    {#if !fresh0}
    <section class={panel} aria-labelledby="challenges-title">
      <h2 id="challenges-title" class="font-display text-lg font-semibold">Today's challenges</h2>
      <ul class="mt-3 flex flex-col gap-3">
        {#each challenges as c (c.id)}
          <li class="text-sm">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-medium"
                >{#if c.done}<Check class="mr-1 inline size-4 text-success" aria-hidden="true" /><span class="sr-only">Done: </span>{/if}{c.title}</span
              >
              <span class="tnum text-ws-soft">{c.progress} of {c.target}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-ws-raised" aria-hidden="true">
              <div class="h-full rounded-full {c.done ? 'bg-success' : 'bg-instr'}" style:width="{(c.progress / c.target) * 100}%"></div>
            </div>
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-xs text-ws-soft">Level {levelFor(practice.xpTotal)}, {practice.xpTotal} XP in total.</p>
    </section>
    {/if}
  </aside>
</div>

<style>
  /* Confetti rests in place; for people who have not asked for less motion it falls in once a day. */
  @media (prefers-reduced-motion: no-preference) {
    .fresh .bit {
      animation: fall 900ms ease-out var(--d) both;
    }
  }
  .bit {
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes fall {
    from {
      opacity: 0;
      translate: 0 -12px;
    }
  }
</style>
