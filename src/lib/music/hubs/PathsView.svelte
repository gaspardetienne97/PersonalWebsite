<script lang="ts">
  // Each path is a trail: what each step adds, what done means, and where you are.
  import Lock from "lucide-svelte/icons/lock";
  import Check from "lucide-svelte/icons/check";
  import { LEARNING_PATHS, pathProgress, type PathId, type StepStatus } from "@repo/music-core/progress/paths";
  import { practice } from "../practice.svelte";
  import { settings } from "../runtime";
  import type { Hue } from "../bench.svelte";

  const ORDER: { id: PathId; hue: Hue }[] = [
    { id: "piano", hue: "piano" },
    { id: "guitar", hue: "guitar" },
    { id: "mpc", hue: "mpc" },
    { id: "ear", hue: "ear" },
    { id: "jazz", hue: "piano" },
    { id: "studio", hue: "create" },
  ];
  const preferred = $derived(
    ({ piano: "piano", guitar: "guitar", ukulele: "guitar", mpc: "mpc", aerophone: "ear", voice: "ear" } as const)[
      settings.value.activeInstrument
    ],
  );
  let open = $state<PathId | null>(null);
  const selected = $derived(open ?? preferred);
  const progress = $derived(Object.fromEntries(ORDER.map((p) => [p.id, pathProgress(LEARNING_PATHS[p.id], practice.events)])));
  const current = $derived(progress[selected]);

  const statusText: Record<StepStatus, string> = {
    done: "Done",
    next: "Up next",
    "in-progress": "In progress",
    "not-assessed": "Not started",
    locked: "Locked",
    todo: "Read and play",
  };
</script>

<div class="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
  <nav aria-label="Learning paths" class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
    {#each ORDER as p (p.id)}
      {@const pr = progress[p.id]}
      <button
        type="button"
        class="flex min-h-14 shrink-0 items-center gap-3 rounded-2xl border px-4 py-2 text-left lg:w-full {selected === p.id
          ? 'border-transparent bg-ws-surface shadow-sm ring-2 ring-[color:var(--p)]'
          : 'border-ws-line hover:bg-ws-raised'}"
        style:--p="var(--hue-{p.hue})"
        aria-pressed={selected === p.id}
        onclick={() => (open = p.id)}
      >
        <span class="size-3 shrink-0 rounded-full bg-[color:var(--p)]" aria-hidden="true"></span>
        <span class="min-w-0">
          <span class="block font-semibold">{pr.path.title}</span>
          <span class="tnum block text-sm text-ws-soft">{pr.done} of {pr.total} done</span>
        </span>
      </button>
    {/each}
  </nav>

  <section aria-labelledby="path-title" class="min-w-0" style:--p="var(--hue-{ORDER.find((o) => o.id === selected)?.hue})">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="path-title" class="font-display text-2xl font-semibold tracking-tight">{current.path.title}</h2>
        <p class="text-ws-soft">{current.path.subtitle}</p>
      </div>
      {#if current.continueHref}
        <a
          href={current.continueHref}
          class="flex min-h-11 items-center rounded-full bg-[color:var(--p)] px-5 text-sm font-semibold text-[oklch(0.2_0.04_288)]">Continue</a
        >
      {/if}
    </div>

    <ol class="relative mt-5 flex flex-col">
      {#each current.steps as sp, i (sp.step.id)}
        {@const st = sp.status}
        <li class="relative flex gap-4 pb-5">
          {#if i < current.steps.length - 1}
            <span class="absolute left-[1.05rem] top-9 bottom-0 w-0.5 {st === 'done' ? 'bg-[color:var(--p)]' : 'bg-ws-line'}" aria-hidden="true"></span>
          {/if}
          <span
            class="tnum relative z-10 grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-semibold {st === 'done'
              ? 'bg-[color:var(--p)] text-[oklch(0.2_0.04_288)]'
              : st === 'next'
                ? 'bg-ws-surface ring-2 ring-[color:var(--p)]'
                : 'bg-ws-raised text-ws-soft'}"
            aria-hidden="true"
          >
            {#if st === "done"}<Check class="size-4" />{:else if st === "locked"}<Lock class="size-3.5" />{:else}{sp.step.order}{/if}
          </span>
          <div class="min-w-0 flex-1 rounded-2xl {st === 'next' ? 'bg-ws-surface p-4 shadow-sm' : 'pt-1'}">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 class="font-semibold">
                <span class="sr-only">Step {sp.step.order}: </span>{sp.step.title}
              </h3>
              <span class="text-sm {st === 'next' ? 'font-semibold text-instr-ink' : 'text-ws-soft'}">{statusText[st]}</span>
            </div>
            <p class="mt-0.5 text-sm">{sp.step.summary}</p>
            {#if sp.step.detail}<p class="mt-1 text-sm text-ws-soft">Done means: {sp.step.detail}</p>{/if}
            {#if sp.evidence.length && st !== "done" && sp.evidence.some((e) => e.attempts)}
              <p class="tnum mt-1 text-xs text-ws-soft">
                {sp.evidence.reduce((n, e) => n + e.attempts, 0)} checked attempts so far, averaging
                {Math.round((sp.evidence.reduce((n, e) => n + e.mean, 0) / sp.evidence.length) * 100)}%.
              </p>
            {/if}
            {#if st !== "locked"}
              <div class="mt-2 flex flex-wrap gap-2">
                <a href={sp.step.href} class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised">
                  {sp.step.kind === "reference" ? "Open" : st === "done" ? "Practise again" : "Practise"}<span class="sr-only">&nbsp;{sp.step.title}</span>
                </a>
                {#each sp.step.links as l (l.href)}
                  <a href={l.href} class="flex min-h-11 items-center rounded-full px-3 text-sm text-instr-ink underline-offset-4 hover:underline">{l.label}</a>
                {/each}
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </section>
</div>
