<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Each path is a road map: a node per step, lit when passed, with "Up next" pulsing. A node opens
  // to what the step adds, what done means and its drill. Levelled paths show one level at a time:
  // its steps, then its song shelf and its test as checkpoints on the same road.
  import Check from "@lucide/svelte/icons/check";
  import Lock from "@lucide/svelte/icons/lock";
  import Music from "@lucide/svelte/icons/music";
  import Flag from "@lucide/svelte/icons/flag";
  import Play from "@lucide/svelte/icons/play";
  import Target from "@lucide/svelte/icons/target";
  import Info from "@lucide/svelte/icons/info";
  import Circle from "@lucide/svelte/icons/circle";
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
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
  import { plainPathText } from "./progress/model";
  import DrillPreview from "./DrillPreview.svelte";

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
    done: m.music_hubs_done(),
    review: m.music_hubs_paths_status_review(),
    next: m.music_hubs_up_next(),
    "in-progress": m.music_hubs_paths_status_in_progress(),
    "not-assessed": m.music_hubs_paths_status_not_started(),
    locked: m.music_hubs_locked(),
    todo: m.music_hubs_paths_status_todo(),
  };
  // Strand letters mean different things per path (S is strumming on guitar, songs on the ear
  // path). A code with no name here is left out rather than printed.
  const STRUMMING = {
    S: m.music_hubs_paths_strand_chords(),
    C: m.music_hubs_paths_strand_chords(),
    F: m.music_hubs_paths_strand_fingerpicking(),
    L: m.music_hubs_paths_strand_lead(),
    R: m.music_hubs_paths_strand_riffs(),
    T: m.music_hubs_paths_strand_reading(),
  };
  const STRANDS: Partial<Record<PathId, Record<string, string>>> = {
    guitar: STRUMMING,
    ukulele: STRUMMING,
    ear: { E: m.music_hubs_paths_strand_ear(), H: m.music_hubs_paths_strand_harmony(), S: m.music_hubs_paths_strand_songs() },
  };
  const strands = (code: string) => [
    ...new Set(code.split(/,\s*/).flatMap((c) => STRANDS[selected]?.[c] ?? [])),
  ];
  /** "Level 3"; a placement level 0 goes by its own name ("Check-in"). */
  const levelName = (l: LevelProgress) => (l.level.id === "0" ? l.level.title : m.music_hubs_paths_level({ id: l.level.id }));
  const passed = (st: StepStatus) => st === "done" || st === "review";
  /** One status format everywhere: "Check-in: 0 of 6 steps", "Level 1: 3 of 10 steps". */
  const levelStatus = (l: LevelProgress) => m.music_hubs_paths_level_status({ name: levelName(l), done: l.done, total: l.total });
  /** A level's name on the map in two words at most, the full title in its label and heading. */
  const STOP = new Set(["a", "an", "and", "the", "from", "of", "to", "with", "for", "in", "on", "by"]);
  const shortTitle = (t: string) => {
    const w = t.replace(/[:,]/g, "").split(/\s+/).slice(0, 2);
    while (w.length > 1 && STOP.has(w.at(-1)!.toLowerCase())) w.pop();
    return w.join(" ");
  };

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
  const x = (i: number) => [50, 66, 50, 34][i % 4];
  const seg = (i: number) => `M ${x(i)} 0 C ${x(i)} 50, ${x(i + 1)} 50, ${x(i + 1)} 100`;
  let pathInfo = $state(false);
  /** The path's one line: its subtitle up to the first semicolon; the rest waits behind the info button. */
  const oneLine = (t: string) => plainPathText(t).split(/;\s*/)[0].replace(/[.,]?$/, ".");
  /** Steps count from 1 on each map, whatever their ids say ("0.1" on a check-in). */
  const stepLabel = (i: number) => String(i + 1);
  /** Path words a learner has not met yet, said plainly on the map. */
  const plain = (t: string) =>
    plainPathText(t)
      .replace(/\bmajor pentachord\b/g, "the first five notes of the major scale")
      .replace(/\bminor pentachord\b/g, "the first five notes of the minor scale")
      .replace(/\bpentachords?\b/g, "five-note scale")
      .replace(/\b(a|the) shelf song\b/g, "$1 song from this level's list")
      .replace(/\bshelf songs\b/g, "songs from this level's list");
  /** A path's goal in a few words: its benchmark up to the first comma or semicolon. */
  const goal = (id: PathId) => {
    const b = LEARNING_PATHS[id].benchmark;
    return b ? m.music_hubs_paths_goal({ goal: b.split(/[;,]\s*/)[0] }) : "";
  };
</script>

{#snippet road(i: number, lit: boolean)}
  <!-- From this node's centre to the next one's: the li's height, shifted down half a node. -->
  <svg class="road pointer-events-none absolute left-0 top-4 h-full w-12 sm:top-6 sm:w-28" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d={seg(i)} class="stroke-ws-line" stroke-width="12" />
    {#if lit}<path d={seg(i)} stroke="var(--p)" stroke-width="12" />{/if}
    <path d={seg(i)} class="stroke-ws-surface" stroke-width="1.5" stroke-dasharray="4 7" />
  </svg>
{/snippet}

{#snippet node(i: number, look: "passed" | "next" | "review" | "open" | "locked", content: Snippet)}
  <span class="relative h-8 sm:h-12" aria-hidden="true">
    <span
      class="node absolute top-0 grid size-8 -translate-x-1/2 place-items-center rounded-full font-display text-[13px] font-semibold tnum sm:size-12 sm:text-sm {look === 'passed'
        ? 'bg-[color:var(--p)] text-ws-stage'
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

{#snippet head(id: string, title: string, sub: string, strong: boolean, sr = "", look = "", href = "", teaches = "")}
  <button
    type="button"
    class="flex min-h-12 w-full scroll-mt-[calc(var(--ws-strip-h,3.75rem)+5rem)] items-center gap-3 text-left after:absolute after:inset-x-0 after:top-0 after:h-12 lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)]"
    aria-expanded={openId === id}
    aria-controls={openId === id ? `stop-${id}` : undefined}
    onclick={() => toggle(id)}
  >
    <span class="flex min-w-0 flex-1 flex-col items-start">
      <span class="font-semibold">{#if sr}<span class="sr-only">{sr}</span>{/if}{title}</span>
      <!-- The state as an icon and a word, never colour alone. -->
      <span class="flex items-start gap-1 text-sm {strong ? 'font-semibold text-instr-ink' : 'text-ws-soft'}">
        {#if look === "passed" || look === "review"}<Check class="size-3.5 text-success" aria-hidden="true" />{:else if look === "locked"}<Lock class="size-3.5" aria-hidden="true" />{:else if look === "next"}<Play class="size-3.5" aria-hidden="true" />{:else if look === "open"}<Circle class="size-3.5 shrink-0" aria-hidden="true" />{/if}{#if teaches}<span class="sr-only">{sub}. </span><span class="text-ws-ink/80">{teaches}</span>{:else}{sub}{/if}
      </span>
    </span>
    {#if href && look !== "locked" && openId !== id}<DrillPreview {href} class="max-sm:hidden opacity-90" />{/if}
  </button>
{/snippet}

{#snippet map(steps: StepProgress[], lv?: LevelProgress)}
  {@const count = steps.length + (lv ? 2 : 0)}
  <ol class="mt-6 flex flex-col">
    {#each steps as sp, i (sp.step.id)}
      {@const st = sp.status}
      {@const coming = sp.step.kind === "new"}
      {@const look = passed(st) ? (st === "review" ? "review" : "passed") : st === "next" ? "next" : st === "locked" ? "locked" : "open"}
      <li class="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 pb-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-3">
        {#if i < count - 1}{@render road(i, passed(st))}{/if}
        {#snippet face()}
          {#if passed(st)}<Check class="size-5" />{:else if st === "locked"}<Lock class="size-4" />{:else}{stepLabel(i)}{/if}
        {/snippet}
        {@render node(i, look, face)}
        <div class="min-w-0">
          {@render head(
            sp.step.id,
            plainPathText(sp.step.title),
            coming ? m.music_hubs_paths_coming() : sp.almost ? m.music_hubs_paths_almost() : statusText[st],
            st === "next",
            m.music_hubs_paths_step_sr({ n: stepLabel(i) }),
            look,
            coming ? "" : (sp.step.href ?? ""),
            // An open step says what it teaches, not "not started" on every row; the ring is the status.
            st === "not-assessed" && !coming && !sp.almost && openId !== sp.step.id ? plain(sp.step.summary) : "",
          )}
          {#if openId === sp.step.id}
            <div
              id="stop-{sp.step.id}"
              class="mt-2 rounded-2xl border-l-4 border-[color:var(--p)] p-4 shadow-sm {st === 'next'
                ? 'bg-[color-mix(in_oklch,var(--p)_12%,var(--ws-surface))] ring-1 ring-[color:var(--p)]/40 sm:p-5'
                : 'bg-ws-surface'}"
            >
              {#if sp.step.href && !coming && sp.step.kind !== "reference"}
                <!-- What the step plays, drawn, before what it asks. -->
                <DrillPreview href={sp.step.href} size="md" class="mb-3 max-w-xs" />
              {/if}
              {#if sp.step.strand && strands(sp.step.strand).length}
                <p class="inline-flex rounded-full bg-ws-raised px-2.5 py-0.5 text-[13px] font-medium">{strands(sp.step.strand).join(", ")}</p>
              {/if}
              <p class="mt-1.5 text-sm">{plain(sp.step.summary)}</p>
              {#if sp.step.detail}
                <p class="mt-2 flex gap-2 rounded-xl bg-ws-raised px-3 py-2 text-sm">
                  <Target class="mt-0.5 size-4 shrink-0 text-instr-ink" aria-hidden="true" /><span><span class="font-semibold">{m.music_hubs_paths_to_pass()}</span> {plainPathText(sp.step.detail)}</span>
                </p>
              {/if}
              {#if coming}
                <p class="mt-1 text-[13px] text-ws-soft">{m.music_hubs_paths_waits_for({ needs: plainPathText(sp.step.needs ?? "") })}</p>
              {:else if st === "review"}
                <p class="mt-1 text-[13px] text-ws-soft">{m.music_hubs_paths_review_note()}</p>
              {:else if sp.evidence.length && st !== "done" && sp.evidence.some((e) => e.attempts)}
                {@const tried = sp.evidence.reduce((n, e) => n + e.attempts, 0)}
                <p class="tnum mt-1 text-[13px] text-ws-soft">
                  {m.music_hubs_paths_runs_so_far({ count: tried, pct: Math.round((sp.evidence.reduce((n, e) => n + e.mean, 0) / sp.evidence.length) * 100) })}
                  {#if sp.evidence.length > 1}{m.music_hubs_paths_runs_passed({ done: sp.evidence.filter((e) => e.done).length, total: sp.evidence.length })}{/if}
                  {#if sp.almost}{sp.evidence.some((e) => e.days < sp.step.minDays)
                      ? m.music_hubs_paths_passing_days()
                      : m.music_hubs_paths_passing_runs()}{/if}
                </p>
              {/if}
              {#if sp.step.minBpm && st !== "done"}<p class="tnum mt-1 text-[13px] text-ws-soft">{m.music_hubs_paths_min_bpm({ bpm: sp.step.minBpm })}</p>{/if}
              {#if st === "locked"}<p class="mt-1 text-[13px] text-ws-soft">{m.music_hubs_paths_locked_note()}</p>{/if}
              {#if st !== "locked" && sp.step.href && !coming}
                <div class="mt-3 flex flex-wrap gap-2">
                  <a
                    href={sp.step.href}
                    class="flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold {st === 'next' || openId === sp.step.id
                      ? 'bg-[color:var(--p)] text-ws-stage hover:brightness-105'
                      : 'border border-ws-line hover:bg-ws-raised'}"
                  >
                    <Play class="size-4" aria-hidden="true" />{sp.step.kind === "reference" ? m.music_hubs_open() : st === "done" ? m.music_hubs_again() : m.music_hubs_start()}<span class="sr-only">&nbsp;{sp.step.title}</span>
                  </a>
                  {#each sp.step.links as l (l.href)}
                    <a href={l.href} class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:border-[color:var(--p)] hover:bg-ws-raised">{l.label}</a>
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
      <li class="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 pb-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-3">
        {@render road(steps.length, enough)}
        {#snippet songFace()}<Music class="size-5" />{/snippet}
        {@render node(steps.length, enough ? "passed" : "open", songFace)}
        <div class="min-w-0">
          {@render head("songs", m.music_hubs_paths_song_list(), lv.level.pick ? m.music_hubs_paths_songs_played_of({ played: lv.played, pick: lv.level.pick }) : m.music_hubs_paths_songs_along(), false)}
          <!-- The checkpoint's songs as badges, lit once played. -->
          <ul class="mt-1 flex flex-wrap gap-1.5" aria-label={m.music_hubs_paths_songs_label()}>
            {#each lv.songs as row (row.key)}
              <li
                class="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[13px] {row.played
                  ? 'border-transparent bg-[color:var(--p)] text-ws-stage'
                  : 'border-ws-line text-ws-soft'}"
              >
                {#if row.played}<Check class="size-3" aria-hidden="true" /><span class="sr-only">{m.music_hubs_paths_played_sr()}</span>{/if}{row.song.title}
              </li>
            {/each}
          </ul>
          {#if openId === "songs"}
            <section id="stop-songs" aria-label={m.music_hubs_paths_song_list()} class="mt-2">
              <p class="text-sm text-ws-soft">
                {m.music_hubs_paths_pick_any({ pick: lv.level.pick })}
              </p>
              {#if shelfError}<p class="mt-2 text-sm text-destructive" role="alert">{shelfError}</p>{/if}
              <ul class="mt-3 flex flex-col divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface">
                {#each lv.songs as row (row.key)}
                  {@const mine = shelved[row.key]}
                  <li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="font-semibold">
                        {#if row.played}<Check class="mr-1 inline size-4 text-success" aria-hidden="true" /><span class="sr-only">{m.music_hubs_paths_played_sr()}</span>{/if}{row.song.title}<span class="font-normal text-ws-soft">, {row.song.artist}</span>
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
                        <a href="/music/songs/{mine.id}" class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised">{m.music_hubs_paths_play_in_songs()}</a>
                      {:else if downloaded.has(row.key)}
                        <button
                          type="button"
                          class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised"
                          disabled={adding === row.key}
                          onclick={() => addToSongs(row.key, row.song.title, row.song.artist)}>{adding === row.key ? m.music_hubs_paths_adding() : m.music_hubs_paths_add_to_songs()}</button
                        >
                      {:else}
                        <a
                          href="/music/studio?tab=import&shelf={encodeURIComponent(row.key)}&for={encodeURIComponent(row.song.title)}"
                          class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm font-medium hover:bg-ws-raised">{m.music_hubs_paths_import_score()}</a
                        >
                      {/if}
                      <span class="tnum text-[13px] text-ws-soft">{row.days ? m.music_hubs_paths_days_of_2({ n: Math.min(row.days, 2) }) : m.music_hubs_paths_not_played()}</span>
                    </div>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      </li>
      <li class="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 pb-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-3">
        {#snippet testFace()}<Flag class="size-5" />{/snippet}
        {@render node(steps.length + 1, lv.passed ? "passed" : "open", testFace)}
        <div class="min-w-0">
          {@render head("test", m.music_hubs_paths_level_test(), lv.passed ? m.music_hubs_paths_level_passed() : m.music_hubs_paths_checkpoint(), false)}
          {#if openId === "test"}
            <p id="stop-test" class="mt-2 rounded-2xl border-l-4 border-[color:var(--p)] bg-ws-surface p-4 text-sm shadow-sm">{plainPathText(lv.level.test)}</p>
          {/if}
        </div>
      </li>
    {/if}
  </ol>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
  <nav aria-label={m.music_hubs_paths_nav()} class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
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
          {#if pr.levels?.length}
            {@const at = pr.levels.find((l) => l.level.id === pr.currentLevel) ?? pr.levels.at(-1)!}
            <span class="tnum block text-sm text-ws-soft">{levelStatus(at)}</span>
            <span class="mt-1 block h-1.5 w-28 rounded-full bg-ws-line" aria-hidden="true"
              ><span class="block h-full rounded-full bg-[color:var(--p)]" style:width="{at.total ? (at.done / at.total) * 100 : 0}%"></span></span
            >
          {:else}
            <span class="tnum block text-sm text-ws-soft">{m.music_hubs_paths_steps_of({ done: pr.done, total: pr.total })}</span>
            <span class="mt-1 block h-1.5 w-28 rounded-full bg-ws-line" aria-hidden="true"
              ><span class="block h-full rounded-full bg-[color:var(--p)]" style:width="{pr.total ? (pr.done / pr.total) * 100 : 0}%"></span></span
            >
          {/if}
          {#if goal(p.id)}<span class="mt-1 block text-[13px] text-ws-soft max-lg:hidden">{goal(p.id)}</span>{/if}
        </span>
      </button>
    {/each}
  </nav>

  <section aria-labelledby="path-title" class="min-w-0" style:--p="var(--hue-{ORDER.find((o) => o.id === selected)?.hue})">
    <!-- On a phone the path, its level and the Continue button stay pinned under the strip while the road scrolls. -->
    <div
      class="z-10 flex items-center justify-between gap-3 max-lg:sticky max-lg:top-[var(--ws-strip-h,3.75rem)] max-lg:-mx-4 max-lg:border-b max-lg:border-ws-line max-lg:bg-ws-bg/95 max-lg:px-4 max-lg:py-2 max-lg:backdrop-blur"
    >
      <div class="min-w-0">
        <h2 id="path-title" class="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">{current.path.title}</h2>
        <p class="tnum truncate text-sm text-ws-soft">
          {#if level}{m.music_hubs_paths_level_status_passed({ name: levelName(level), done: level.done, total: level.total })}{:else}{m.music_hubs_paths_steps_passed({ done: current.done, total: current.total })}{/if}
        </p>
      </div>
      {#if current.continueHref}
        <!-- Named by where it goes. While a step card is open its Practise is the one primary, so this one steps back. -->
        {@const target = current.levels?.find((l) => l.level.id === current.currentLevel)}
        {@const go = target?.level.id === "0" && !target.done
          ? { first: m.music_hubs_paths_go_start(), rest: m.music_hubs_paths_go_checkin() }
          : current.done === 0 && !target?.done
            ? { first: m.music_hubs_paths_go_start(), rest: m.music_hubs_paths_go_path() }
            : { first: m.music_hubs_paths_go_continue(), rest: "" }}
        <a
          href={current.continueHref}
          class="flex min-h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold {openId
            ? 'border border-ws-line bg-ws-surface hover:bg-ws-raised'
            : 'bg-[color:var(--p)] text-ws-stage hover:brightness-105'}"
          ><Play class="size-4" aria-hidden="true" />{go.first}<span class="max-sm:sr-only">{go.rest ? ` ${go.rest}` : ""}</span></a
        >
      {/if}
    </div>
    <p class="mt-2 flex items-start gap-1 text-ws-soft">
      <span class="min-w-0 flex-1">
        {#each oneLine(current.path.subtitle).split(/(ABRSM Grade \d+)/) as part, k (k)}{#if k % 2}<button type="button" popovertarget="abrsm-{selected}" class="font-medium text-ws-ink underline decoration-dotted underline-offset-4">{part}</button><span id="abrsm-{selected}" popover class="m-auto max-w-sm rounded-2xl border border-ws-line bg-ws-surface p-4 text-sm text-ws-ink shadow-lg">{m.music_hubs_paths_abrsm({ grade: part.replace("ABRSM ", "") })}</span>{:else}{part}{/if}{/each}
      </span>
      <button
        type="button"
        class="-my-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-ws-raised hover:text-ws-ink"
        aria-label={m.music_hubs_paths_about()}
        aria-expanded={pathInfo}
        aria-controls="path-info"
        onclick={() => (pathInfo = !pathInfo)}><Info class="size-5" aria-hidden="true" /></button
      >
    </p>
    {#if pathInfo}
      <p id="path-info" class="mt-1 rounded-xl bg-ws-raised px-3 py-2 text-sm">
        {plainPathText(current.path.subtitle)}
        {#if current.path.benchmark}{m.music_hubs_paths_benchmark({ benchmark: current.path.benchmark })}{/if}
        <span class="tnum">{current.levels?.length ? m.music_hubs_paths_levels_steps({ levels: current.levels.length, steps: current.steps.length }) : m.music_hubs_paths_steps_all({ steps: current.steps.length })}</span>
      </p>
    {/if}

    {#if current.levels?.length && level}
      <!-- The levels as stops on one line: a check when passed, a ring on the current one, a lock ahead.
           The current and the next level carry their names. -->
      <div class="levels -mx-1 mt-4 flex items-start overflow-x-auto pb-2 pl-1 pr-10 pt-2" role="group" aria-label={m.music_hubs_paths_levels()}>
        {#each current.levels as l, k (l.level.id)}
          {@const isCurrent = l.level.id === current.currentLevel}
          {@const ahead = !l.passed && !isCurrent}
          {#if k}<span class="mt-5 h-1 w-2 shrink-0 rounded-full {current.levels[k - 1].passed ? 'bg-[color:var(--p)]' : 'bg-ws-line'}" aria-hidden="true"></span>{/if}
          <button
            type="button"
            class="flex min-w-[4.25rem] flex-1 basis-0 flex-col items-center gap-1 rounded-xl px-0.5"
            aria-pressed={l.level.id === level.level.id}
            aria-label={(l.passed ? m.music_hubs_paths_level_passed_label : isCurrent ? m.music_hubs_paths_level_current_label : m.music_hubs_paths_level_ahead_label)({ name: levelName(l), title: l.level.title })}
            onclick={() => (pickedLevel = { ...pickedLevel, [selected]: l.level.id })}
          >
            <span
              class="tnum grid place-items-center rounded-full font-semibold {isCurrent ? 'size-12 text-base' : 'size-10 text-sm'} {l.level.id === level.level.id
                ? 'ring-2 ring-ws-ink ring-offset-2 ring-offset-ws-bg'
                : ''} {l.passed
                ? 'bg-[color:var(--p)] text-ws-stage'
                : isCurrent
                  ? 'bg-ws-surface text-ws-ink ring-4 ring-[color:var(--p)]'
                  : 'relative border-2 border-dashed border-ws-soft bg-ws-surface text-ws-soft'}"
            >
              {#if l.passed}<Check class="size-4" aria-hidden="true" />{:else}{#if l.level.id === "0"}<Flag class="size-4" aria-hidden="true" />{:else}{l.level.id}{/if}{#if ahead}<span
                    class="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-ws-ink text-ws-bg ring-2 ring-ws-bg"
                    aria-hidden="true"><Lock class="size-3" /></span
                  >{/if}{/if}
            </span>
            <span class="text-center text-[13px] leading-tight {isCurrent ? 'font-semibold text-ws-ink' : 'text-ws-soft'}" aria-hidden="true">{shortTitle(l.level.title)}</span>
          </button>
        {/each}
      </div>

      <div class="mt-4">
        <h3 class="font-display text-xl font-semibold">{level.level.id === "0" ? level.level.title : m.music_hubs_paths_level_heading({ name: levelName(level), title: level.level.title })}</h3>
        {#if level.level.id === "0"}
          <!-- One sentence; the rules wait behind a disclosure. -->
          <p class="mt-1">{m.music_hubs_paths_checkin_intro()}</p>
          <details class="group mt-2 text-sm">
            <summary class="inline-flex min-h-11 cursor-pointer items-center gap-1 font-medium text-instr-ink">{m.music_hubs_paths_checkin_how()}</summary>
          <ol class="mt-1 flex flex-col gap-2 sm:flex-row sm:gap-4">
            <li class="flex items-center gap-2"><span class="grid size-8 shrink-0 place-items-center rounded-full bg-ws-raised text-instr-ink"><Target class="size-4" aria-hidden="true" /></span>{m.music_hubs_paths_checkin_play()}</li>
            <li class="flex items-center gap-2"><span class="grid size-8 shrink-0 place-items-center rounded-full bg-ws-raised text-instr-ink"><CalendarDays class="size-4" aria-hidden="true" /></span>{m.music_hubs_paths_checkin_review()}</li>
          </ol>
          </details>
        {:else}
          <p class="mt-1">{plain(level.level.goal)}</p>
        {/if}
        {#if level.level.adds && level.level.id !== "0"}<p class="mt-1 text-sm text-ws-soft">{m.music_hubs_paths_new_here({ adds: plain(level.level.adds) })}</p>{/if}
        <!-- The level's progress as one bar, with the map's three marks named once. -->
        <div class="mt-3 flex flex-col gap-2">
          <div class="flex items-center gap-3">
            <div class="h-2 max-w-sm flex-1 rounded-full bg-ws-raised" role="progressbar" aria-label={m.music_hubs_paths_steps_passed_label()} aria-valuemin={0} aria-valuemax={level.total} aria-valuenow={level.done}>
              <div class="ws-fill h-full rounded-full bg-[color:var(--p)]" style:width="{level.total ? (level.done / level.total) * 100 : 0}%"></div>
            </div>
            <span class="tnum text-sm font-semibold">{m.music_hubs_paths_done_of({ done: level.done, total: level.total })}</span>
            {#if level.passed}<span class="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success"><Check class="size-4" aria-hidden="true" />{m.music_hubs_paths_level_passed()}</span>{/if}
          </div>
          <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ws-soft" aria-hidden="true">
            <span class="inline-flex items-center gap-1"><span class="grid size-5 place-items-center rounded-full bg-[color:var(--p)] text-ws-stage"><Check class="size-3" /></span>{m.music_hubs_paths_passed()}</span>
            <span class="inline-flex items-center gap-1"><span class="size-5 rounded-full bg-ws-surface ring-2 ring-[color:var(--p)]"></span>{m.music_hubs_up_next()}</span>
            <span class="inline-flex items-center gap-1"><span class="grid size-5 place-items-center rounded-full bg-ws-raised"><Lock class="size-3" /></span>{m.music_hubs_locked()}</span>
            {#if level.level.pick && level.songs.length}<span class="tnum">{m.music_hubs_paths_songs_played({ played: level.played, pick: level.level.pick })}</span>{/if}
          </p>
        </div>
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
  /* One row of levels that scrolls sideways; its right edge fades so a cut label reads as more. */
  .levels {
    scrollbar-width: thin;
    mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent);
  }
  :global(html[data-reduce-motion]) .pulse::after {
    animation: none;
  }
</style>
