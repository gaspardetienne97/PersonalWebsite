<script lang="ts">
  // Each path is a trail: what each step adds, what done means, and where you are. Levelled paths
  // show one level at a time: its steps, its song shelf and its test.
  import Check from "lucide-svelte/icons/check";
  import {
    LEARNING_PATHS,
    PATH_FOR_INSTRUMENT,
    pathProgress,
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
  const stepLabel = (sp: StepProgress) => (sp.step.level ? sp.step.id.split(".").slice(1).join(".") : String(sp.step.order));
</script>

{#snippet trail(steps: StepProgress[])}
  <ol class="relative mt-5 flex flex-col">
    {#each steps as sp, i (sp.step.id)}
      {@const st = sp.status}
      {@const coming = sp.step.kind === "new"}
      <li class="relative flex gap-4 pb-5">
        {#if i < steps.length - 1}
          <span class="absolute left-[1.05rem] top-9 bottom-0 w-0.5 {st === 'done' || st === 'review' ? 'bg-[color:var(--p)]' : 'bg-ws-line'}" aria-hidden="true"></span>
        {/if}
        <span
          class="tnum relative z-10 grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-semibold {st === 'done'
            ? 'bg-[color:var(--p)] text-[oklch(0.2_0.04_288)]'
            : st === 'next'
              ? 'bg-ws-surface ring-2 ring-[color:var(--p)]'
              : st === 'review'
                ? 'bg-ws-surface text-instr-ink ring-1 ring-[color:var(--p)]'
                : 'bg-ws-raised text-ws-soft'}"
          aria-hidden="true"
        >
          {#if st === "done" || st === "review"}<Check class="size-4" />{:else}{stepLabel(sp)}{/if}
        </span>
        <div class="min-w-0 flex-1 rounded-2xl {st === 'next' ? 'bg-ws-surface p-4 shadow-sm' : 'pt-1'}">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 class="font-semibold">
              <span class="sr-only">Step {stepLabel(sp)}: </span>{sp.step.title}
            </h3>
            <span class="text-sm {st === 'next' ? 'font-semibold text-instr-ink' : 'text-ws-soft'}"
              >{coming ? "Coming" : sp.almost ? "Almost there" : statusText[st]}</span
            >
          </div>
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
          {#if st !== "locked" && sp.step.href && !coming}
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
      <div class="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Levels">
        {#each current.levels as l (l.level.id)}
          <button
            type="button"
            class="tnum flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-sm {l.level.id === level.level.id
              ? 'border-transparent bg-[color:var(--p)] font-semibold text-[oklch(0.2_0.04_288)]'
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

      {@render trail(levelSteps)}

      <section aria-labelledby="shelf-title" class="mt-2">
        <h3 id="shelf-title" class="font-display text-lg font-semibold">Song shelf</h3>
        <p class="text-sm text-ws-soft">
          Pick any {level.level.pick}. A song counts when you play it in Song Studio's Performance mode at 80% or better, near the record's tempo, on two days.
        </p>
        {#if shelfError}<p class="mt-2 text-sm text-destructive" role="alert">{shelfError}</p>{/if}
        <ul class="mt-3 flex flex-col divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface">
          {#each level.songs as row (row.key)}
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

      <section aria-labelledby="test-title" class="mt-5 rounded-2xl bg-ws-raised p-4">
        <h3 id="test-title" class="font-display text-lg font-semibold">Level test</h3>
        <p class="mt-1 text-sm">{level.level.test}</p>
      </section>
    {:else}
      {@render trail(current.steps)}
    {/if}
  </section>
</div>
