<script lang="ts">
  // Chord changes round a cycle of two to eight chords (catalog 4.5, scoring rules 9):
  // clusters split by 350 ms of silence, graded per arrival. With no clock a cluster
  // counts as a change only when it sounds like the next chord (groupChanges).
  // Round trips or a timed minute, optionally against a clock (BPM and beats per chord). Taps and MIDI
  // give notes; with the microphone on, each strum is read from the audio and checked against the cycle's chords.
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { noteName, type NoteEvent } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { CHANGES_SETUP, chordPerfectTargets, shapePcs } from "@repo/music-core/content/technique";
  import { gradeChanges, type ChangesResult } from "@repo/music-core/scoring/technique";
  import { CHANGE_GAP_MS } from "@repo/music-core/scoring/timing";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Hint from "#lib/music/components/Hint.svelte";
  import ChordDiagram from "#lib/music/components/ChordDiagram.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { assistanceFor, capture, readKeyed, runInstrument, runSource, writeKeyed, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { mic, settings } from "#lib/music/runtime/index.ts";
  import { exerciseFor, neckLabel, skillsFor } from "./fretted";
  import { formatList, formatNumber, intlLocale } from "@repo/i18n/format";
  import { fretted, tuningFor } from "./instrument.svelte";
  import { chord, note } from "#lib/music/names.svelte.ts";
  import { chordId, chordLabel, chordRef, cyclePositions, cycleRefs, groupChanges, groupedNotes, hardestPairs, mergePairRuns, PAIR_HISTORY_KEY, positionsOn, shapesFor, type ChordRef, type HardPair, type PairRun } from "./chords";
  import { ChordListener } from "./strum.svelte";
  import { checkChord } from "@repo/music-core/signal/chord";
  import MicPanel from "./MicPanel.svelte";
  import ChordCycleSetup from "./ChordCycleSetup.svelte";
  import ChordStrip from "./ChordStrip.svelte";
  import ShapeBoard from "./ShapeBoard.svelte";
  import NoteHighway, { highway, viewSwitch, type HighwayChord } from "#lib/music/notation/NoteHighway.svelte";
  import type { Hit } from "#lib/music/notation/highway.ts";
  import { CHORD_MODES, openMode } from "./modes";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";

  const IDLE_MS = 20_000;
  const CLOCK_STEPS = [{ label: m.music_strings_changes_step_bar() }, { label: m.music_strings_changes_step_2beats() }, { label: m.music_strings_changes_step_beat() }];
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
  const refs = $derived(cycleRefs(instr, s.chords && !pairLink ? s.chords : `${s.shape},${s.to}`, undefined, s.positions));
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
  /** The chords in letters (the saved run's target), and as the player reads note names. */
  const symbols = $derived(refs.map(chordLabel));
  const names = $derived(symbols.map((x) => chord(x)));
  /** Two chords go there and back (a round trip); more go round the cycle. */
  const roundsText = (k: number) => (n === 2 ? m.music_strings_changes_round_trips({ k }) : m.music_strings_changes_times_round({ k }));
  const cycleText = $derived(n === 2 ? formatList([names[0], names[1]]) : names.join(", "));
  /** The history key: the pair's own key for two chords, so older history carries on. */
  const cycleKey = $derived(shapes.map((x) => x.id).join(">"));

  function save(list: ChordRef[], positions: (number | null)[]) {
    if (pairLink) {
      const url = new URL(page.url.href);
      url.searchParams.delete("shape");
      url.searchParams.delete("to");
      goto(url, { shallow: true, replace: true, state: page.state });
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

  let historyRead = $state(false);
  void readKeyed<PairRun[]>(PAIR_HISTORY_KEY).then((h) => {
    history = h;
    historyRead = true;
  });
  /** The five slowest pairs on this instrument; a run on one of them records `hardest`. */
  const hardest = $derived(hardestPairs(history, instr));
  const inHardest = $derived(n === 2 && hardest.some((h) => h.key === cycleKey));
  const pairName = (h: HardPair) => h.chords.split(",").map((id) => { const r = chordRef(id); return r ? chord(chordLabel(r)) : id; });
  const pairText = (h: HardPair) => formatList(pairName(h));
  const useHard = (h: HardPair) => cfg.set({ chords: h.chords, positions: h.positions });
  // A link with ?hardest (a path's) opens on the slowest pair once the history is read.
  let openedHardest = false;
  $effect(() => {
    if (openedHardest || !historyRead || !page.url.searchParams.has("hardest")) return;
    openedHardest = true;
    if (hardest.length && !inHardest) useHard(hardest[0]);
  });

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
  /** Beside Stop on a phone: the chord now and the change coming. */
  const cue = $derived(phase === "running" ? m.music_strings_changes_cue({ now: names[target], next: names[(target + 1) % n] }) : "");
  const liveGrade = $derived(live ? grade(Math.max(1, now - downbeat)) : null);
  const shown = $derived(shapes[target]);
  const pairRuns = $derived(history[cycleKey] ?? []);

  // Against a clock, the highway: a block per chord over the strings it sounds on, scrolling into the line.
  const timedView = $derived(beatsPerChord > 0 && highway.on);
  const blockCount = $derived(s.timed ? Math.ceil((CHANGES_SETUP.timedSeconds * bpm()) / 60 / beatsPerChord) + 1 : trips * n + 1);
  const blocks = $derived(
    Array.from({ length: blockCount }, (_, k): HighwayChord => {
      const i = k % n;
      return { startBeat: k * beatsPerChord, durationBeats: beatsPerChord, strings: chordPerfectTargets(shapes[i], tuning).map((t) => t.string), name: names[i] };
    }),
  );
  /** Each arrival on its block: how far from the change it landed, or wrong when it lacked a tone. */
  const blockHits = $derived.by(() => {
    const out: Record<number, Hit> = {};
    if (!periodMs || !liveGrade) return out;
    for (const c of liveGrade.clusters) {
      if (c.errorMs === undefined) continue;
      const k = Math.round((c.start - c.errorMs - downbeat) / periodMs);
      if (out[k] === undefined) out[k] = c.verification.correct ? c.errorMs : "wrong";
    }
    return out;
  });
  let raf = 0;
  $effect(() => {
    if (!live || !timedView) return;
    const frame = () => {
      now = performance.now();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

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
      params: { from: shapes[0].id, to: shapes[1].id, chords: cycleKey, timed: s.timed, trips, ...(periodMs ? { bpm: ctx.bpm, beatsPerChord } : {}), ...(inHardest ? { hardest: true } : {}) },
    });
    cap = capture(ctx.downbeat - (ctx.beatMs || 0) / 2, (e) => e.kind === "noteon" && onNote(e));
    usedMic = mic.state === "on";
    if (usedMic)
      listener.start({
        onStrum: (h) => {
          if (phase !== "running" || h.at < ctx.downbeat - 100) return;
          // The cycle's chords are known: when exactly one passes the target check,
          // that is the chord, even if the blind read missed a faint tone.
          const passed = [...new Set(pcs.filter((p) => checkChord(h.analysis, p).accepted).map((p) => p.join()))];
          const got = passed.length === 1 ? passed[0].split(",").map(Number) : h.pcs;
          if (!got.length) return;
          notes = [...notes, ...got.map((pc) => ({ midi: 60 + pc, at: h.at }))];
          lastNoteAt = h.at;
        },
      });
    now = performance.now();
    ticker = setInterval(tick, 100);
    const chords = names.reduce((a, b) => m.music_strings_changes_then({ a, b }));
    status = n > 2 ? m.music_strings_changes_play_back({ chords, first: names[0] }) : m.music_strings_changes_play({ chords });
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
      target: symbols.join(" "),
      response: `${r.completed} changes`,
      heard: notes.length > 0,
    });
    const perMinute = Math.round(r.changesPerMinute * 10) / 10;
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: m.music_strings_changes_run_headline({ rate: formatNumber(perMinute), clean: r.clean, completed: r.completed }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const hk = cycleKey;
    const bestBefore = Math.max(0, ...(history[hk] ?? []).map((x) => x.perMinute));
    if (r.completed) history = await writeKeyed<PairRun[]>(PAIR_HISTORY_KEY, hk, [{ date: new Date().toISOString(), perMinute, clean: r.clean, completed: r.completed }], mergePairRuns);
    summary = {
      headline: !notes.length
        ? m.music_strings_changes_nothing_heard()
        : r.completed === 0
          ? m.music_strings_changes_none_landed({ first: names[0], second: names[1] })
          : `${(s.timed ? m.music_strings_changes_result_timed : m.music_strings_changes_result)({ completed: r.completed, clean: r.clean, rate: formatNumber(perMinute) })}${perMinute > bestBefore && bestBefore > 0 ? ` ${m.music_strings_changes_fastest({ cycle: cycleText })}` : ""}${
              // What held a clean run back from a pass: the clock, named with its count.
              !r.correct && r.clean === r.completed && r.onTime !== null ? ` ${m.music_strings_changes_on_click({ onTime: r.onTime, completed: r.completed })}` : ""
            }`,
      metric: formatNumber(perMinute),
      metricLabel: m.music_strings_changes_per_minute(),
      score: r.score,
      delta: fin.delta,
      best: fin.best || (perMinute > bestBefore && bestBefore > 0),
      clean: r.correct && mode === "check",
      cleanMeans: periodMs ? m.music_strings_changes_clean_clock() : m.music_strings_changes_clean(),
      xp: fin.xp,
      mode,
      rows: [
        { label: m.music_strings_changes_completed(), text: s.timed ? m.music_strings_changes_in_a_minute({ n: r.completed }) : m.music_strings_n_of_total({ n: r.completed, total: trips * n }) },
        { label: m.music_strings_changes_every_target(), value: r.completed ? r.clean / r.completed : 0, text: m.music_strings_n_of_total({ n: r.clean, total: r.completed }) },
        r.onTime !== null ? { label: m.music_strings_on_time(), value: r.completed ? r.onTime / r.completed : 0, text: m.music_strings_n_of_total({ n: r.onTime, total: r.completed }) } : { label: m.music_strings_on_time_no_clock(), notMeasured: true },
        { label: m.music_strings_changes_notes_per_chord(), value: r.score },
        { label: m.music_strings_row_which_strings(), notMeasured: true },
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
    // Untimed with no clock: Stop is the one end control, and grades the changes played (nothing heard is not scored).
    if (phase === "running" && !periodMs && !s.timed) return void finish();
    halt();
    phase = "ready";
    status = m.music_strings_nothing_saved();
  }

  onDestroy(() => {
    halt();
    mic.stop();
  });

  const summaryLine = $derived([
    { text: inHardest ? m.music_strings_changes_hardest_of({ cycle: cycleText }) : cycleText, focus: "from" },
    { text: s.timed ? m.music_strings_changes_one_timed_minute() : roundsText(trips), focus: "length" },
    { text: beatsPerChord ? (beatsPerChord === 4 ? m.music_strings_changes_every_bar() : beatsPerChord === 1 ? m.music_strings_changes_every_beat() : m.music_strings_changes_every_2beats()) : m.music_strings_no_clock_lower(), focus: "clock" },
  ]);
  const maxRun = $derived(Math.max(1, ...pairRuns.map((x) => x.perMinute)));
</script>

<DrillShell
  lesson={{ lessons: conceptCard("tips.changes", { tuning }), trigger: "check" }}
  title={m.music_strings_changes_title()}
  hue={instr}
  blurb={m.music_strings_changes_blurb()}
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
  {cue}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ChordCycleSetup instrument={instr} {tuning} {refs} {shapes} positions={chosen} onchange={save} setupKey="from" />
      <div class="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-3" data-setup="hardest">
        {#if hardest.length}
          <Choice label={m.music_strings_changes_hardest()} options={hardest.map((h) => ({ value: h.key, label: pairText(h), detail: m.music_strings_changes_a_minute({ rate: formatNumber(h.perMinute) }) }))} value={inHardest ? cycleKey : ""} onchange={(k) => useHard(hardest.find((h) => h.key === k)!)} />
          <p class="text-[13px] text-ws-soft">{m.music_strings_changes_hardest_help()}</p>
        {:else}
          <p class="text-sm"><span class="font-medium">{m.music_strings_changes_hardest_label()}</span> <span class="text-ws-soft">{m.music_strings_changes_hardest_empty()}</span></p>
        {/if}
      </div>
      <Choice
        label={m.music_strings_changes_stop_after()}
        setupKey="length"
        options={[
          ...[1, 2, 4, 8].map((k) => ({ value: k, label: roundsText(k) })),
          { value: 0, label: m.music_strings_changes_one_minute() },
        ]}
        value={s.timed ? 0 : trips}
        onchange={(v) => cfg.set(v === 0 ? { timed: true } : { timed: false, trips: v })}
      />
      <Choice
        label={m.music_strings_changes_every()}
        setupKey="clock"
        options={[
          { value: 0, label: m.music_strings_no_clock() },
          { value: 1, label: m.music_strings_beat_cap() },
          { value: 2, label: m.music_strings_2_beats() },
          { value: 4, label: m.music_strings_bar_cap() },
        ]}
        value={beatsPerChord}
        onchange={(v) => cfg.set({ clock: v })}
      />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && liveGrade}
      <Stat label={m.music_strings_changes()} value={liveGrade.completed} />
      {#if s.timed}<Stat label={m.music_strings_left()} value={m.music_strings_seconds_short({ s: Math.max(0, Math.ceil((endAt - now) / 1000)) })} />{/if}
    {:else if result}
      <Stat label={m.music_strings_changes()} value={result.completed} />
      <Stat label={m.music_strings_with_every_note()} value="{result.clean}/{result.completed}" tone={result.completed && result.clean === result.completed ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if mode === "practice" && (!live || timedView)}
      <!-- The whole cycle before the run (and over the highway); live without it, the chord now and the next one say it. -->
      <ChordStrip {shapes} {names} current={live ? target : null} />
    {/if}
    {#if beatsPerChord && phase !== "results"}
      <div class="mb-2 flex justify-end">{@render viewSwitch(m.music_strings_chord())}</div>
    {/if}
    {#if timedView && phase !== "results"}
      <div class="mb-3">
        <NoteHighway
          chords={blocks}
          strings={tuning.openStrings.map((m) => note(noteName(m, "flat", false)))}
          beat={live && periodMs ? ((now - downbeat) / periodMs) * beatsPerChord : null}
          chordHits={blockHits}
          judge={phase === "running"}
          perfectMs={Math.round(periodMs / beatsPerChord / 8) || 60}
        />
      </div>
    {:else if live || mode === "check"}
      <!-- Before a Practice run the chord strip already shows the cycle: the neck moves up instead. -->
      {@const now = live ? target : 0}
      {@const next = (now + 1) % n}
      <!-- The chord now over its own diagram, then the next one smaller to its right: the move is seen before it is due. -->
      <div class="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2" data-dock="music">
        <div class="flex flex-col gap-2">
          <p class="font-display text-5xl font-bold leading-none">{names[now]}</p>
          {#if mode === "practice"}
            <div class="w-24 rounded-lg bg-ws-surface p-1 text-ws-ink ring-3 ring-instr sm:w-28">
              <ChordDiagram frets={shapes[now].frets} fingers={shapes[now].fingers} barre={shapes[now].barre} label={m.music_strings_chord_now({ name: names[now] })} />
            </div>
          {/if}
        </div>
        {#if mode === "practice"}
          <ArrowRight class="mb-12 size-7 shrink-0 text-ws-stage-soft" aria-hidden="true" />
          <div class="flex flex-col gap-2" data-testid="next-chord">
            <p class="flex items-baseline gap-2 leading-none"><span class="text-sm text-ws-stage-soft">{m.music_strings_next_cap()}</span><span class="font-display text-2xl font-semibold">{names[next]}</span></p>
            <div class="w-20 rounded-lg bg-ws-surface p-1 text-ws-ink opacity-85 sm:w-24">
              <ChordDiagram frets={shapes[next].frets} fingers={shapes[next].fingers} barre={shapes[next].barre} label={m.music_strings_chord_next({ name: names[next] })} />
            </div>
          </div>
        {:else}
          <p class="pb-1 text-lg text-ws-stage-soft">{m.music_strings_then_name({ name: names[next] })}</p>
        {/if}
      </div>
    {/if}
    <!-- The microphone sits above the neck, so a silent run is fixed without scrolling. -->
    <div class="mb-3 empty:hidden"><MicPanel disabled={live} offer={phase !== "ready"} hint={m.music_strings_changes_mic_hint()} /></div>
    <div class="flex flex-col justify-end" data-dock="instrument"><ShapeBoard shape={live ? shown : from} {tuning} show={mode === "practice" || phase === "results"} {flashes} compact label={neckLabel(instr, live ? names[target] : names[0])} /></div>
    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 [&_button[data-hint]]:text-ws-stage-soft">
      {#if phase === "running" && !periodMs && !s.timed}
        <span class="text-sm text-ws-stage-soft">{m.music_strings_changes_pause_hint()}</span>
      {:else}
        <span class="text-sm text-ws-stage-soft">{m.music_strings_changes_how_counts()}</span>
      {/if}
      <Hint about={m.music_strings_changes_how_counts_about()} text={m.music_strings_changes_how_counts_text()} />
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      {#snippet figure()}
        {#if pairRuns.length === 1}
          <p class="text-base">{@html m.music_strings_changes_first_run({ cycle: cycleText, rate: `<span class="font-semibold">${m.music_strings_changes_a_minute({ rate: formatNumber(pairRuns[0].perMinute) })}</span>` })}</p>
        {:else if pairRuns.length}
          <section aria-labelledby="pair-history">
            <h3 id="pair-history" class="text-sm font-semibold">{m.music_strings_changes_chart_title({ cycle: cycleText })}</h3>
            <ol class="mt-3 flex h-28 items-end gap-1.5 overflow-x-auto pb-1">
              {#each pairRuns.slice(-16) as r, i (r.date + i)}
                <li class="flex h-full w-8 shrink-0 flex-col items-center justify-end gap-1">
                  <span class="tnum text-[13px]">{formatNumber(r.perMinute)}</span>
                  <span class="w-full rounded-t bg-instr" style:height="{Math.max(4, (r.perMinute / maxRun) * 72)}px" aria-hidden="true"></span>
                  <span class="sr-only">{m.music_strings_changes_bar_sr({ date: new Date(r.date).toLocaleDateString(intlLocale()), rate: formatNumber(r.perMinute), clean: r.clean, completed: r.completed })}</span>
                </li>
              {/each}
            </ol>
            <p class="mt-2 text-sm text-ws-soft">{m.music_strings_changes_best({ rate: formatNumber(maxRun), count: pairRuns.length })}</p>
          </section>
        {/if}
      {/snippet}
      <Results {summary} figure={pairRuns.length ? figure : undefined} />
    {/if}
  {/snippet}
</DrillShell>
