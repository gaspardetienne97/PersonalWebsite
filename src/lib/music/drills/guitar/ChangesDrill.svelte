<script lang="ts">
  // Chord changes round a cycle of two to six chords (catalog 4.5, scoring rules 9):
  // clusters split by 350 ms of silence, graded per arrival. With no clock a cluster
  // counts as a change only when it sounds like the next chord (groupChanges).
  // Round trips or a timed minute, optionally against a clock (BPM and beats per chord). Taps and MIDI
  // give notes; with the microphone on, each strum is read as chroma instead.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import type { NoteEvent } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { CHANGES_SETUP, shapePcs } from "@repo/music-core/content/technique";
  import { gradeChanges, type ChangesResult } from "@repo/music-core/scoring/technique";
  import { CHANGE_GAP_MS } from "@repo/music-core/scoring/timing";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { btnStage, panel } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import { assistanceFor, assistanceText, capture, readKeyed, runInstrument, runSource, writeKeyed, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { mic, settings } from "$lib/music/runtime";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import { chordId, chordLabel, cyclePositions, cycleRefs, groupChanges, groupedNotes, mergePairRuns, PAIR_HISTORY_KEY, positionsOn, shapesFor, type ChordRef, type PairRun } from "./chords";
  import { ChordListener } from "./strum.svelte";
  import MicPanel from "./MicPanel.svelte";
  import ChordCycleSetup from "./ChordCycleSetup.svelte";
  import ChordStrip from "./ChordStrip.svelte";
  import ShapeBoard from "./ShapeBoard.svelte";
  import { CHORD_MODES, openMode } from "./modes";

  const IDLE_MS = 20_000;
  const CLOCK_STEPS = [{ label: "A change every bar" }, { label: "A change every 2 beats" }, { label: "A change every beat" }];
  const cfg = new DrillSetup("chords-changes", {
    shape: "guitar.c-major",
    to: "guitar.g-major",
    /** The cycle as shape ids, comma separated ("" is an older setup's shape and to). */
    chords: "" as string,
    /** Each chord's position up the neck (0 is the open or curated shape). */
    positions: "" as string,
    timed: false as boolean,
    trips: 2,
    clock: 0,
  });
  const s = $derived(cfg.value);
  const entry = catalogEntry("chords")!.modes.find((m) => m.id === "changes")!;
  const instr = $derived(fretted());
  const tuning = $derived(tuningFor(instr));
  // A link naming a pair (shape and to) and no chord list, like a path's, opens on that pair.
  const pairLink = $derived(page.url.searchParams.has("to") && !page.url.searchParams.has("chords"));
  // Root and quality of each chord, from the setup's shape ids (curated, generated, or the other instrument's).
  const refs = $derived(cycleRefs(instr, s.chords && !pairLink ? s.chords : `${s.shape},${s.to}`));
  const chordIds = $derived(refs.map((r) => chordId(instr, r)));
  const n = $derived(refs.length);
  const chosen = $derived(cyclePositions(s.positions, n));
  const posList = $derived(chosen.map((p) => p ?? 0));
  // Each chord at its chosen position on the strip's tuning (the curated open shape first).
  const shapes = $derived(
    chordIds.map((id, i) => {
      const ps = positionsOn(id, tuning);
      return ps[Math.min(posList[i], ps.length - 1)] ?? shapesFor(instr)[i % shapesFor(instr).length];
    }),
  );
  const from = $derived(shapes[0]);
  const pcs = $derived(shapes.map((sh) => shapePcs(sh, tuning)));
  const names = $derived(refs.map(chordLabel));
  /** Two chords go there and back (a round trip); more go round the cycle. */
  const roundsText = (k: number) => (n === 2 ? `${k} round trip${k > 1 ? "s" : ""}` : `${k} time${k > 1 ? "s" : ""} round`);
  const cycleText = $derived(n === 2 ? `${names[0]} and ${names[1]}` : names.join(", "));
  /** The history key: the pair's own key for two chords, so older history carries on. */
  const cycleKey = $derived(shapes.map((x) => x.id).join(">"));

  function save(list: ChordRef[], positions: (number | null)[]) {
    if (pairLink) {
      const url = new URL(page.url);
      url.searchParams.delete("shape");
      url.searchParams.delete("to");
      replaceState(url, page.state);
    }
    cfg.set({ chords: list.map((r) => chordId(instr, r)).join(","), positions: positions.map((p) => p ?? "").join(",") });
  }
  /** Round trips: 1, 2, 4 or 8 (an older setup's count rounds up). */
  const trips = $derived([1, 2, 4, 8].find((n) => n >= s.trips) ?? CHANGES_SETUP.roundTrips[1]);
  const beatsPerChord = $derived([0, 1, 2, 4].includes(s.clock) ? s.clock : CHANGES_SETUP.beatsPerChord);
  const bpm = () => Math.min(160, Math.max(30, settings.value.bpm));
  const key = $derived(`changes:${cycleKey}:${s.timed ? "60s" : `${trips}x`}:${beatsPerChord ? `${bpm()}/${beatsPerChord}` : "free"}`);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let now = $state(0);
  let notes = $state.raw<{ midi: number; at: number }[]>([]);
  let result = $state<ChangesResult | null>(null);
  let summary = $state<RunSummary | null>(null);
  let history = $state<Record<string, PairRun[]>>({});
  const flashes = new Flashes();
  const listener = new ChordListener();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let downbeat = $state(0);
  let periodMs = $state(0);
  let endAt = $state(Infinity);
  let lastNoteAt = 0;
  let usedMic = false;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let stopClockRef: (() => void) | null = null;

  void readKeyed<PairRun[]>(PAIR_HISTORY_KEY).then((h) => (history = h));

  const live = $derived(phase === "running" || phase === "countin");
  // No clock: one group per chord played, however many pauses it took.
  const groups = $derived(periodMs ? [] : groupChanges(notes, pcs));
  const graded = $derived(periodMs ? notes : groupedNotes(groups));
  /** The chord to play now: with no clock, the next one once the current one has every tone and a pause. */
  const target = $derived.by((): number => {
    if (periodMs) return Math.max(0, Math.floor((now - downbeat) / periodMs)) % n;
    const g = groups.at(-1);
    if (!g) return 0;
    const done = pcs[g.target].every((p) => g.midis.some((m) => m % 12 === p)) && now - g.end > CHANGE_GAP_MS;
    return done ? (g.target + 1) % n : g.target;
  });
  const liveGrade = $derived(live ? grade(Math.max(1, now - downbeat)) : null);
  const shown = $derived(shapes[target]);
  const pairRuns = $derived(history[cycleKey] ?? []);

  function grade(durationMs: number) {
    return gradeChanges({
      from: { id: shapes[0].id, pcs: pcs[0] },
      to: { id: shapes[1].id, pcs: pcs[1] },
      chords: shapes.map((sh, i) => ({ id: sh.id, pcs: pcs[i] })),
      tuningId: tuning.id,
      notes: graded,
      durationMs,
      clock: periodMs ? { bpm: bpm(), beatsPerChord, anchorAt: downbeat } : undefined,
    });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    // With the microphone on, strums are read as chroma; single detected pitches would double them.
    if (e.source === "audio" && usedMic) return;
    notes = [...notes, { midi: e.midi, at: e.at }];
    lastNoteAt = e.at;
    if (mode === "practice" && e.string !== undefined && e.fret !== undefined) {
      const ok = pcs[target].includes(e.midi % 12);
      flashes.add(e.string * 100 + e.fret, ok ? "correct" : "wrong");
    }
  }

  function tick() {
    now = performance.now();
    if (phase !== "running") return;
    if (now >= endAt) return void finish();
    if (!periodMs && !s.timed) {
      const g = grade(1);
      if (g.completed >= trips * n && now - (groups.at(-1)?.end ?? now) > CHANGE_GAP_MS) return void finish();
      if (lastNoteAt && now - lastNoteAt > IDLE_MS) return void finish();
    }
  }

  async function start(ctx: RunContext) {
    summary = null;
    result = null;
    notes = [];
    lastNoteAt = 0;
    flashes.clear();
    downbeat = ctx.downbeat;
    periodMs = beatsPerChord && ctx.beatMs ? ctx.beatMs * beatsPerChord : 0;
    endAt = s.timed ? downbeat + CHANGES_SETUP.timedSeconds * 1000 : periodMs ? downbeat + (trips * n + 1) * periodMs + periodMs / 2 : Infinity;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, shapes.reduce((a, x) => a + x.difficulty, 0) / n / 5 + (periodMs ? 0.1 : 0) + (s.timed ? 0.1 : 0)),
      instrument: instr,
      params: { from: shapes[0].id, to: shapes[1].id, chords: cycleKey, timed: s.timed, trips, ...(periodMs ? { bpm: ctx.bpm, beatsPerChord } : {}) },
    });
    cap = capture(ctx.downbeat - (ctx.beatMs || 0) / 2, (e) => e.kind === "noteon" && onNote(e));
    usedMic = mic.state === "on";
    if (usedMic)
      listener.start({
        onStrum: (h) => {
          if (phase !== "running" || h.at < ctx.downbeat - 100 || !h.pcs.length) return;
          notes = [...notes, ...h.pcs.map((pc) => ({ midi: 60 + pc, at: h.at }))];
          lastNoteAt = h.at;
        },
      });
    now = performance.now();
    ticker = setInterval(tick, 100);
    status = `Play ${names.join(", then ")}${n > 2 ? `, and back to ${names[0]}` : ""}.`;
  }

  function halt() {
    clearInterval(ticker);
    stopClockRef?.();
    cap?.stop();
    listener.stop();
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    halt();
    const durationMs = s.timed
      ? CHANGES_SETUP.timedSeconds * 1000
      : periodMs
        ? endAt - downbeat
        : groups.length > 1
          ? groups[groups.length - 1].start - groups[0].start
          : 0;
    const r = grade(Math.max(1, durationMs));
    result = r;
    phase = "results";
    const src = cap?.notes ?? [];
    await run!.attempt({
      promptId: cycleKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: usedMic ? "audio" : runSource(src),
      instrument: runInstrument(src, instr) ?? null,
      target: names.join(" "),
      response: `${r.completed} changes`,
    });
    const perMinute = Math.round(r.changesPerMinute * 10) / 10;
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${perMinute} changes per minute, ${r.clean} of ${r.completed} with every note` });
    const hk = cycleKey;
    const bestBefore = Math.max(0, ...(history[hk] ?? []).map((x) => x.perMinute));
    if (r.completed) history = await writeKeyed<PairRun[]>(PAIR_HISTORY_KEY, hk, [{ date: new Date().toISOString(), perMinute, clean: r.clean, completed: r.completed }], mergePairRuns);
    summary = {
      headline: !notes.length
        ? "Nothing was heard during the run. Tap the strings, strum into the microphone, or connect MIDI, then try again."
        : r.completed === 0
          ? `No change landed yet: play ${names[0]}, pause, then ${names[1]}.`
          : `${r.completed} change${r.completed === 1 ? "" : "s"}, ${r.clean} with every target note, at ${perMinute} per minute.${perMinute > bestBefore && bestBefore > 0 ? ` Your fastest ${cycleText} yet.` : ""}`,
      metric: String(perMinute),
      metricLabel: "changes per minute",
      delta: fin.delta,
      best: fin.best || (perMinute > bestBefore && bestBefore > 0),
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Changes completed", text: `${r.completed}${s.timed ? " in a minute" : ` of ${trips * n}`}` },
        { label: "Changes with every target note", value: r.completed ? r.clean / r.completed : 0, text: `${r.clean} of ${r.completed}` },
        r.onTime !== null ? { label: "On time", value: r.completed ? r.onTime / r.completed : 0, text: `${r.onTime} of ${r.completed}` } : { label: "On time (no clock)", notMeasured: true },
        { label: "Target notes per chord", value: r.score },
        { label: "Which strings rang", notMeasured: true },
      ],
      // With the clock on: the tempo climbs to 100, then the chords change twice as often. No clock, no ladder.
      advance:
        notes.length && beatsPerChord
          ? await nextRun(`${instr}.changes.${hk}.${s.timed ? "60s" : `${trips}x`}`, { bpm: bpm(), tempo: { min: 30, goal: 100, max: 160 }, steps: CLOCK_STEPS, step: [4, 2, 1].indexOf(beatsPerChord) }, { score: r.score, correct: r.correct }, tempoAnd((i) => cfg.set({ clock: [4, 2, 1][i] })))
          : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    halt();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    halt();
    mic.stop();
  });

  const summaryLine = $derived([
    { text: cycleText, focus: "from" },
    { text: s.timed ? "one timed minute" : roundsText(trips), focus: "length" },
    { text: beatsPerChord ? `change every ${beatsPerChord === 4 ? "bar" : beatsPerChord === 1 ? "beat" : "2 beats"}` : "no clock", focus: "clock" },
  ]);
  const maxRun = $derived(Math.max(1, ...pairRuns.map((x) => x.perMinute)));
</script>

<DrillShell
  title="Chord changes"
  hue={instr}
  blurb="Move through two or more chords and back to the first. Each arrival counts when its target notes are there, and each set of chords keeps a history of changes per minute."
  summary={summaryLine}
  tabs={CHORD_MODES}
  tab="changes"
  ontab={(id) => openMode(CHORD_MODES, id)}
  bind:phase
  bind:mode
  bind:status
  progress={s.timed ? Math.min(1, Math.max(0, now - downbeat) / (CHANGES_SETUP.timedSeconds * 1000)) : Math.min(1, (liveGrade?.completed ?? 0) / (trips * n))}
  clock={beatsPerChord ? { bpm: bpm(), beatsPerBar: 4 } : null}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ChordCycleSetup instrument={instr} {tuning} {refs} {shapes} positions={chosen} onchange={save} setupKey="from" />
      <Choice
        label="Stop after"
        setupKey="length"
        options={[
          ...[1, 2, 4, 8].map((k) => ({ value: k, label: roundsText(k) })),
          { value: 0, label: "One minute" },
        ]}
        value={s.timed ? 0 : trips}
        onchange={(v) => cfg.set(v === 0 ? { timed: true } : { timed: false, trips: v })}
      />
      <Choice
        label="A change every"
        setupKey="clock"
        options={[
          { value: 0, label: "No clock" },
          { value: 1, label: "Beat" },
          { value: 2, label: "2 beats" },
          { value: 4, label: "Bar" },
        ]}
        value={beatsPerChord}
        onchange={(v) => cfg.set({ clock: v })}
      />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && liveGrade}
      <Stat label="Changes" value={liveGrade.completed} />
      {#if s.timed}<Stat label="Left" value="{Math.max(0, Math.ceil((endAt - now) / 1000))} s" />{/if}
    {:else if result}
      <Stat label="Changes" value={result.completed} />
      <Stat label="With every note" value="{result.clean}/{result.completed}" tone={result.completed && result.clean === result.completed ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if mode === "practice"}
      <ChordStrip {shapes} {names} current={live ? target : null} />
    {/if}
    <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <p class="font-display text-5xl font-bold leading-none">{live ? names[target] : names[0]}</p>
      <p class="text-lg text-ws-stage-soft">then {live ? names[(target + 1) % n] : names[1]}</p>
    </div>
    <ShapeBoard shape={live ? shown : from} {tuning} show={mode === "practice" || phase === "results"} {flashes} label="{live ? names[target] : names[0]} on the {instr} neck" />
    {#if phase === "running" && !periodMs && !s.timed}
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" class={btnStage} onclick={() => void finish()}>Finish now</button>
        <span class="text-sm text-ws-stage-soft">Pause briefly between chords. The change counts when the next chord's notes sound.</span>
      </div>
    {/if}
    <p class="mt-3 max-w-prose text-sm text-ws-stage-soft">A change counts as having every note when the target notes of the arriving chord are all there and nothing else is. Which string sounded each note is not measured.</p>
    <div class="mt-3"><MicPanel disabled={live} hint="Optional: strum into the microphone, or tap the chord's strings here." /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} />
      {#if pairRuns.length}
        <section class="{panel} mt-3" aria-labelledby="pair-history">
          <h3 id="pair-history" class="font-display text-lg font-semibold">{cycleText}: changes per minute</h3>
          <ol class="mt-3 flex h-28 items-end gap-1.5 overflow-x-auto pb-1">
            {#each pairRuns.slice(-16) as r, i (r.date + i)}
              <li class="flex h-full w-8 shrink-0 flex-col items-center justify-end gap-1">
                <span class="tnum text-xs">{r.perMinute}</span>
                <span class="w-full rounded-t bg-instr" style:height="{Math.max(4, (r.perMinute / maxRun) * 72)}px" aria-hidden="true"></span>
                <span class="sr-only">{new Date(r.date).toLocaleDateString()}: {r.perMinute} per minute, {r.clean} of {r.completed} with every note</span>
              </li>
            {/each}
          </ol>
          <p class="mt-2 text-sm text-ws-soft">Best {maxRun} per minute over {pairRuns.length} run{pairRuns.length > 1 ? "s" : ""}.</p>
        </section>
      {/if}
    {/if}
  {/snippet}
</DrillShell>
