<script lang="ts">
  // Each path is a road map: a node per step, lit when passed, with "Up next" pulsing. A node opens
  // to what the step adds, what done means and its drill. Levelled paths show one level at a time:
  // its steps, then its song shelf and its test as checkpoints on the same road.
  import Check from "lucide-svelte/icons/check";
  import Lock from "lucide-svelte/icons/lock";
  import Music from "lucide-svelte/icons/music";
  import Flag from "lucide-svelte/icons/flag";
  import type { Snippet } from "svelte";
  import {
    LEARNING_PATHS,
    PATH_FOR_INSTRUMENT,
    pathProgress,
    type LevelProgress,
    type PathId,
    type StepProgress,
    type StepStatus,
  } from "@repo/music-core/progress/paths";
  import { practice } from "../practice.svelte";
  import { db, settings } from "../runtime";
  import type { Hue } from "../bench.svelte";
  import { addShelfSong, type Song } from "./library/songs";

  const ORDER: { id: PathId; hue: Hue }[] = [
    { id: "guitar", hue: "guitar" },
    { id: "ukulele", hue: "ukulele" },
    { id: "piano", hue: "piano" },
    { id: "aerophone", hue: "aerophone" },
    { id: "mpc", hue: "mpc" },
    { id: "ear", hue: "ear" },
    { id: "reading", hue: "reading" },
    { id: "jazz", hue: "piano" },
    { id: "theory", hue: "reading" },
    { id: "studio", hue: "create" },
  ];
  const preferred = $derived(PATH_FOR_INSTRUMENT[settings.value.activeInstrument]);
  let open = $state<PathId | null>(null);
  const selected = $derived(open ?? preferred);
  const runs = $derived(practice.sessions.flatMap((s) => s.runs));
  const progress = $derived(
    Object.fromEntries(ORDER.map((p) => [p.id, pathProgress(LEARNING_PATHS[p.id], practice.events, undefined, runs)])),
  );
  const current = $derived(progress[selected]);

  // Levelled paths: the level shown, the current one until another is picked.
  let pickedLevel = $state<Record<string, string>>({});
  const levelId = $derived(pickedLevel[selected] ?? current.currentLevel ?? current.levels?.at(-1)?.level.id);
  const level = $derived(current.levels?.find((l) => l.level.id === levelId));
  const levelSteps = $derived(level ? current.steps.filter((s) => s.step.level === level.level.id) : current.steps);

  // Library songs saved for a shelf entry, by shelf key, and the scores downloaded to the server.
  let shelved = $state<Record<string, Song>>({});
  let downloaded = $state<Set<string>>(new Set());
  let adding = $state("");
  let shelfError = $state("");
  $effect(() => {
    void (db.songs.toArray() as unknown as Promise<Song[]>).then((songs) => {
      shelved = Object.fromEntries(songs.filter((s) => s.shelf).map((s) => [s.shelf!, s]));
    });
    void fetch("/api/music/scores")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { key: string }[]) => (downloaded = new Set(list.map((x) => x.key))))
      .catch(() => {});
  });

  async function addToSongs(key: string, title: string, artist: string) {
    adding = key;
    shelfError = "";
    try {
      shelved = { ...shelved, [key]: await addShelfSong(key, title, artist) };
    } catch (e) {
      shelfError = (e as Error).message;
    } finally {
      adding = "";
    }
  }


  const statusText: Record<StepStatus, string> = {
    done: "Done",
    review: "Review",
    next: "Up next",
    "in-progress": "In progress",
    "not-assessed": "Not started",
    locked: "Locked",
    todo: "Read and play",
  };
  const strandName: Record<string, string> = {
    S: "Chords and strumming",
    F: "Fingerpicking",
    L: "Lead",
    R: "Riffs",
    T: "Reading, theory and ear",
  };
  const passed = (st: StepStatus) => st === "done" || st === "review";

  // One node open at a time per level, the "Up next" step until another is picked ("" for none).
  let opened = $state<Record<string, string>>({});
  const mapKey = $derived(`${selected}:${level?.level.id ?? ""}`);
  const openId = $derived(
    opened[mapKey] ??
      (levelSteps.find((s) => s.status === "next") ?? levelSteps.find((s) => !passed(s.status) && s.status !== "locked"))?.step.id ??
      "",
  );
  const toggle = (id: string) => (opened = { ...opened, [mapKey]: openId === id ? "" : id });
  /** The road winds: each node sits left, centre or right of its lane (percent of the lane). */
  const x = (i: number) => [50, 70, 50, 30][i % 4];
  const seg = (i: number) => `M ${x(i)} 0 C ${x(i)} 50, ${x(i + 1)} 50, ${x(i + 1)} 100`;
  const stepLabel = (sp: StepProgress) => (sp.step.level ? sp.step.id.split(".").slice(1).join(".") : String(sp.step.order));
</script>

{#snippet road(i: number, lit: boolean)}
  <!-- From this node's centre to the next one's: the li's height, shifted down half a node. -->
  <svg class="road pointer-events-none absolute left-0 top-6 h-full w-20 sm:w-28" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d={seg(i)} class="stroke-ws-line" stroke-width="12" />
    {#if lit}<path d={seg(i)} stroke="var(--p)" stroke-width="12" />{/if}
    <path d={seg(i)} class="stroke-ws-surface" stroke-width="1.5" stroke-dasharray="4 7" />
  </svg>
{/snippet}

{#snippet node(i: number, look: "passed" | "next" | "review" | "open" | "locked", content: Snippet)}
  <span class="relative h-12" aria-hidden="true">
    <span
      class="node absolute top-0 grid size-12 -translate-x-1/2 place-items-center rounded-full font-display text-sm font-semibold tnum {look === 'passed'
        ? 'bg-[color:var(--p)] text-[oklch(0.2_0.04_288)]'
        : look === 'next'
          ? 'pulse bg-ws-surface text-instr-ink ring-4 ring-[color:var(--p)]'
          : look === 'review'
            ? 'bg-ws-surface text-instr-ink ring-2 ring-[color:var(--p)]'
            : look === 'open'
              ? 'border-2 border-ws-line bg-ws-surface'
              : 'bg-ws-raised text-ws-soft'}"
      style:left="{x(i)}%">{@render content()}</span
    >
  </span>
{/snippet}

{#snippet head(id: string, title: string, sub: string, strong: boolean, sr = "")}
  <button
    type="button"
    class="flex min-h-12 w-full flex-col items-start justify-center text-left after:absolute after:inset-x-0 after:top-0 after:h-12"
    aria-expanded={openId === id}
    aria-controls={openId === id ? `stop-${id}` : undefined}
    onclick={() => toggle(id)}
  >
    <span class="font-semibold">{#if sr}<span class="sr-only">{sr}</span>{/if}{title}</span>
    <span class="text-sm {strong ? 'font-semibold text-instr-ink' : 'text-ws-soft'}">{sub}</span>
  </button>
{/snippet}

{#snippet map(steps: StepProgress[], lv?: LevelProgress)}
  {@const count = steps.length + (lv ? 2 : 0)}
  <ol class="mt-6 flex flex-col">
    {#each steps as sp, i (sp.step.id)}
      {@const st = sp.status}
      {@const coming = sp.step.kind === "new"}
      <li class="relative grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 pb-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
        {#if i < count - 1}{@render road(i, passed(st))}{/if}
        {#snippet face()}
          {#if passed(st)}<Check class="size-5" />{:else if st === "locked"}<Lock class="size-4" />{:else}{stepLabel(sp)}{/if}
        {/snippet}
        {@render node(i, passed(st) ? (st === "review" ? "review" : "passed") : st === "next" ? "next" : st === "locked" ? "locked" : "open", face)}
        <div class="min-w-0">
          {@render head(
            sp.step.id,
            sp.step.title,
            coming ? "Coming" : sp.almost ? "Almost there" : statusText[st],
            st === "next",
            `Step ${stepLabel(sp)}: `,
          )}
          {#if openId === sp.step.id}
            <div id="stop-{sp.step.id}" class="mt-2 rounded-2xl border-l-4 border-[color:var(--p)] bg-ws-surface p-4 shadow-sm">
              {#if sp.step.strand}
                <p class="text-xs text-ws-soft">{sp.step.strand.split(/,\s*/).map((c) => strandName[c] ?? c).join(", ")}</p>
              {/if}
              <p class="mt-0.5 text-sm">{sp.step.summary}</p>
              {#if sp.step.detail}<p class="mt-1 text-sm text-ws-soft">Done means: {sp.step.detail}</p>{/if}
              {#if coming}
                <p class="mt-1 text-xs text-ws-soft">Waits for: {sp.step.needs}</p>
              {:else if st === "review"}
                <p class="mt-1 text-xs text-ws-soft">A later step you passed covers this. Use it to review.</p>
              {:else if sp.evidence.length && st !== "done" && sp.evidence.some((e) => e.attempts)}
                {@const tried = sp.evidence.reduce((n, e) => n + e.attempts, 0)}
                <p class="tnum mt-1 text-xs text-ws-soft">
                  {tried} checked attempt{tried === 1 ? "" : "s"} so far, the latest averaging
                  {Math.round((sp.evidence.reduce((n, e) => n + e.mean, 0) / sp.evidence.length) * 100)}%.
                  {#if sp.evidence.length > 1}{sp.evidence.filter((e) => e.done).length} of {sp.evidence.length} passed.{/if}
                  {#if sp.almost}Passing now: {sp.evidence.some((e) => e.days < sp.step.minDays)
                      ? "play it again on another day to confirm."
                      : "a few more checked attempts to confirm."}{/if}
                </p>
              {/if}
              {#if sp.step.minBpm && st !== "done"}<p class="tnum mt-1 text-xs text-ws-soft">Counts at {sp.step.minBpm} BPM or faster.</p>{/if}
              {#if st === "locked"}<p class="mt-1 text-xs text-ws-soft">Opens once the steps before it pass.</p>{/if}
              {#if st !== "locked" && sp.step.href && !coming}
                <div class="mt-3 flex flex-wrap gap-2">
                  <a
                    href={sp.step.href}
                    class="flex min-h-11 items-center rounded-full px-5 text-sm font-semibold {st === 'next'
                      ? 'bg-[color:var(--p)] text-[oklch(0.2_0.04_288)]'
                      : 'border border-ws-line hover:bg-ws-raised'}"
                  >
                    {sp.step.kind === "reference" ? "Open" : st === "done" ? "Practise again" : "Practise"}<span class="sr-only">&nbsp;{sp.step.title}</span>
                  </a>
                  {#each sp.step.links as l (l.href)}
                    <a href={l.href} class="flex min-h-11 items-center rounded-full px-3 text-sm text-instr-ink underline-offset-4 hover:underline">{l.label}</a>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </li>
    {/each}
    {#if lv}
      {@const enough = lv.played >= Math.min(lv.level.pick, lv.songs.length)}
      <li class="relative grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 pb-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
        {@render road(steps.length, enough)}
        {#snippet songFace()}<Music class="size-5" />{/snippet}
        {@render node(steps.length, enough ? "passed" : "open", songFace)}
        <div class="min-w-0">
          {@render head("songs", "Song shelf", `${lv.played} of ${lv.level.pick} songs played`, false)}
          <!-- The checkpoint's songs as badges, lit once played. -->
          <ul class="mt-1 flex flex-wrap gap-1.5" aria-label="Songs on the shelf">
            {#each lv.songs as row (row.key)}
              <li
                class="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs {row.played
                  ? 'border-transparent bg-[color:var(--p)] text-[oklch(0.2_0.04_288)]'
                  : 'border-ws-line text-ws-soft'}"
              >
                {#if row.played}<Check class="size-3" aria-hidden="true" /><span class="sr-only">Played: </span>{/if}{row.song.title}
              </li>
            {/each}
          </ul>
          {#if openId === "songs"}
            <section id="stop-songs" aria-label="Song shelf" class="mt-2">
              <p class="text-sm text-ws-soft">
                Pick any {lv.level.pick}. A song counts when you play it in Song Studio's Performance mode at 80% or better, near the record's tempo, on two days.
              </p>
              {#if shelfError}<p class="mt-2 text-sm text-destructive" role="alert">{shelfError}</p>{/if}
              <ul class="mt-3 flex flex-col divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface">
                {#each lv.songs as row (row.key)}
                  {@const mine = shelved[row.key]}
                  <li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="font-semibold">
                        {#if row.played}<Check class="mr-1 inline size-4 text-success" aria-hidden="true" /><span class="sr-only">Played: </span>{/if}{row.song.title}<span class="font-normal text-ws-soft">, {row.song.artist}</span>
                      </p>
                      <p class="text-sm">{row.song.teaches}</p>
                      {#if row.song.detail}<p class="text-sm text-ws-soft">{row.song.detail}</p>{/if}
                      <p class="mt-1 flex flex-wrap gap-x-3 text-sm">
                        {#each row.song.scores as sc (sc.url)}
                          <a href={sc.url} target="_blank" rel="noopener" class="text-instr-ink underline-offset-4 hover:underline">MuseScore: {sc.label}</a>
                        {/each}
                        {#if row.song.fallback}
                          <a href={row.song.fallback.url} target={row.song.fallback.url.startsWith("/") ? undefined : "_blank"} rel="noopener" class="text-instr-ink underline-offset-4 hover:underline">{row.song.fallback.label}</a>
                        {/if}
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                      {#if mine}
                        <a href="/music/songs/{mine.id}" class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised">Play in Song Studio</a>
                      {:else if downloaded.has(row.key)}
                        <button
                          type="button"
                          class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised"
                          disabled={adding === row.key}
                          onclick={() => addToSongs(row.key, row.song.title, row.song.artist)}>{adding === row.key ? "Adding" : "Add to my songs"}</button
                        >
                      {:else}
                        <a
                          href="/music/library?tab=import&shelf={encodeURIComponent(row.key)}&for={encodeURIComponent(row.song.title)}"
                          class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised">Import its score</a
                        >
                      {/if}
                      <span class="tnum text-xs text-ws-soft">{row.days ? `${Math.min(row.days, 2)} of 2 days` : "Not played yet"}</span>
                    </div>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      </li>
      <li class="relative grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 pb-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
        {#snippet testFace()}<Flag class="size-5" />{/snippet}
        {@render node(steps.length + 1, lv.passed ? "passed" : "open", testFace)}
        <div class="min-w-0">
          {@render head("test", "Level test", lv.passed ? "Level passed" : "The checkpoint at the end of the level", false)}
          {#if openId === "test"}
            <p id="stop-test" class="mt-2 rounded-2xl border-l-4 border-[color:var(--p)] bg-ws-surface p-4 text-sm shadow-sm">{lv.level.test}</p>
          {/if}
        </div>
      </li>
    {/if}
  </ol>
{/snippet}

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
          <span class="tnum block text-sm text-ws-soft">
            {#if pr.levels?.length}Level {pr.currentLevel ?? pr.levels.at(-1)!.level.id}, {pr.levels.filter((l) => l.passed).length} of {pr.levels.length} passed{:else}{pr.done} of {pr.total} done{/if}
          </span>
        </span>
      </button>
    {/each}
  </nav>

  <section aria-labelledby="path-title" class="min-w-0" style:--p="var(--hue-{ORDER.find((o) => o.id === selected)?.hue})">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="path-title" class="font-display text-2xl font-semibold tracking-tight">{current.path.title}</h2>
        <p class="text-ws-soft">
          {#if current.levels?.length}<span class="tnum">{current.levels.length} level{current.levels.length === 1 ? "" : "s"}, {current.steps.length} steps.</span>{:else}<span class="tnum">{current.steps.length} steps.</span>{/if}
          {current.path.subtitle}
        </p>
        {#if current.path.benchmark}<p class="text-sm text-ws-soft">Ends around {current.path.benchmark}.</p>{/if}
      </div>
      {#if current.continueHref}
        <a
          href={current.continueHref}
          class="flex min-h-11 items-center rounded-full bg-[color:var(--p)] px-5 text-sm font-semibold text-[oklch(0.2_0.04_288)]">Continue</a
        >
      {/if}
    </div>

    {#if current.levels?.length && level}
      <!-- The levels as stops on one line, lit up to the last one passed. -->
      <div class="mt-4 flex items-center overflow-x-auto p-1" role="group" aria-label="Levels">
        {#each current.levels as l, k (l.level.id)}
          {#if k}<span class="h-1 w-3 shrink-0 rounded-full {current.levels[k - 1].passed ? 'bg-[color:var(--p)]' : 'bg-ws-line'}" aria-hidden="true"></span>{/if}
          <button
            type="button"
            class="tnum flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-sm {l.level.id === level.level.id
              ? 'border-transparent bg-[color:var(--p)] font-semibold text-[oklch(0.2_0.04_288)]'
              : l.passed
                ? 'border-[color:var(--p)] bg-ws-surface hover:bg-ws-raised'
                : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
            aria-pressed={l.level.id === level.level.id}
            aria-label="Level {l.level.id}{l.passed ? ', passed' : l.level.id === current.currentLevel ? ', current' : ''}"
            onclick={() => (pickedLevel = { ...pickedLevel, [selected]: l.level.id })}
          >
            {#if l.passed}<Check class="size-3.5" aria-hidden="true" />{/if}{l.level.id}
          </button>
        {/each}
      </div>

      <div class="mt-5">
        <h3 class="font-display text-xl font-semibold">{level.level.title}</h3>
        <p class="mt-1">{level.level.goal}</p>
        {#if level.level.adds}<p class="mt-1 text-sm text-ws-soft">Adds: {level.level.adds}</p>{/if}
        <p class="tnum mt-2 text-sm text-ws-soft">
          {level.done} of {level.total} steps passed, {level.played} of {level.level.pick} songs played.
          {#if level.passed}Level passed.{/if}
        </p>
      </div>

      {@render map(levelSteps, level)}
    {:else}
      {@render map(current.steps)}
    {/if}
  </section>
</div>

<style>
  .road path {
    fill: none;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  /* "Up next" breathes: a ring of its hue that grows and fades. */
  .pulse::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 9999px;
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--p) 60%, transparent);
    animation: pulse 2s ease-out infinite;
  }
  @keyframes pulse {
    to {
      box-shadow: 0 0 0 14px transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse::after {
      animation: none;
    }
  }
  :global(html[data-reduce-motion]) .pulse::after {
    animation: none;
  }
</style>
