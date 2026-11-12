<script lang="ts">
  import { CHANGES_TITLE, changesTrainer } from "./modes";
  // Call and response over a groove: six turns of a call (one or two bars) and
  // your answer in the bars after it, the band playing throughout. Echo is
  // graded like Phrases (notes in order, in time); Answer on landing on a chord
  // tone and staying on the eighth-note grid. The whole run is kept as a take.
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { noteName, pc, type NoteEvent } from "@repo/music-core";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { chorusBars } from "@repo/music-core/content/jam";
  import { rng } from "@repo/music-core/content/random";
  import {
    BEATS_PER_BAR,
    CALL_GROOVES,
    CALL_TURNS,
    callPhrase,
    chordAtBar,
    gradeAnswer,
    grooveOf,
    turnBar,
    type CallMode,
    type CallNote,
  } from "@repo/music-core/content/call-response";
  import { gradePhrase, matchEvents, phraseEvents } from "@repo/music-core/scoring/phrases";
  import { chordTonesLesson } from "@repo/music-core/lessons/tier1";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary, type RunTiming } from "$lib/music/components/Results.svelte";
  import Verdict from "$lib/music/components/Verdict.svelte";
  import InstrumentStage from "$lib/music/components/InstrumentStage.svelte";
  import BeatLane, { type LaneRow } from "$lib/music/drills/piano/BeatLane.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import type { CellMarks } from "$lib/music/components/feedback.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, settings, type SequenceHandle, type SequenceNote } from "$lib/music/runtime";
  import { backingNotes } from "$lib/music/drills/jam/backing";
  import { pairNotes, saveTake } from "$lib/music/takes";

  const TEMPO = { min: 50, max: 160 };
  const cfg = new DrillSetup("call-response", { mode: "echo", groove: "blues", bars: "1" });
  const s = $derived(cfg.value);
  const callMode = $derived<CallMode>(s.mode === "answer" ? "answer" : "echo");
  const groove = $derived(grooveOf(s.groove));
  const bars = $derived(s.bars === "2" ? 2 : 1);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let calls = $state.raw<CallNote[][]>([]);
  let turns = $state<{ score: number; correct: boolean; text: string }[]>([]);
  let now = $state<{ turn: number; part: "call" | "answer" } | null>(null);
  let downbeat = $state(0);
  let beatMs = $state(500);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let seq: SequenceHandle | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let ticker: ReturnType<typeof setInterval> | undefined;
  const flashes = new Flashes();
  let inTimer: ReturnType<typeof setTimeout> | undefined;
  /** Call notes sounding now (Practice only: in Check the call is heard, never shown). */
  let lit = $state<number[]>([]);
  const litMarks = $derived(Object.fromEntries(lit.map((m) => [m, { target: true, demo: true } satisfies CellMarks])));
  /** Calls stay between C4 and E5: the keys always fit that range, on a phone too. */
  const CALL_RANGE = [60, 76];
  /** Practice: the word for the note just played (in the call or not, a chord tone or not). */
  let verdict = $state<{ kind: "right" | "wrong" | "in"; text: string; key: number } | null>(null);
  /** Check: the notes heard this turn, by name only (no right or wrong until the end). */
  let heard = $state<string[]>([]);
  /** Check: the last finished turn's notes, shown by name only once that turn is over. */
  let lastHeard = $state<string[]>([]);
  /** Your notes this turn, as beats from the start of your bars: the lane's second row fills in as you play. */
  let reply = $state<{ beat: number; midi: number }[]>([]);
  /** Where the lane's playhead is: beats into the call, then into your bars. */
  let laneBeat = $state<number | null>(null);
  /** Echo: how the call's notes landed, over every turn. */
  let timing: RunTiming = { onTime: 0, early: 0, late: 0, missed: 0 };
  const barMs = () => beatMs * BEATS_PER_BAR;
  const answerStart = (k: number) => downbeat + (turnBar(k, bars) + bars) * barMs();

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    turns = [];
    verdict = null;
    heard = [];
    lastHeard = [];
    reply = [];
    timing = { onTime: 0, early: 0, late: 0, missed: 0 };
    downbeat = ctx.downbeat;
    beatMs = ctx.beatMs;
    const rand = rng(Math.floor(Math.random() * 2 ** 31));
    calls = Array.from({ length: CALL_TURNS }, (_, k) => callPhrase(rand, { groove, bar: turnBar(k, bars), bars }));
    run = practice.beginRun({
      exerciseId: `ear.call-response.${callMode}`,
      setupKey: `call-response|${callMode}|${groove.id}|${bars}`,
      skillIds: ["ear.call-response"],
      capabilities: ["ear"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: bars === 2 ? 0.6 : 0.4,
      params: { mode: callMode, groove: groove.id, bpm, bars },
    });
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    // The band and the calls as one sequence from the downbeat.
    const sec = ctx.beatMs / 1000;
    const total = CALL_TURNS * 2 * bars;
    const band = backingNotes(groove, { bpm: ctx.bpm, mode: "both", choruses: Math.ceil(total / chorusBars(groove)) + 1 })
      .filter((n) => n.time < total * BEATS_PER_BAR * sec)
      .map((n) => ({ ...n, velocity: (n.velocity ?? 0.6) * 0.7 }));
    const lead: SequenceNote[] = calls.flatMap((c, k) => c.map((n) => ({ midi: n.midi, time: (turnBar(k, bars) * BEATS_PER_BAR + n.startBeat) * sec, duration: n.durationBeats * sec * 0.9, velocity: 0.9 })));
    seq = audio.playSequence([...band, ...lead], {
      startPerf: ctx.downbeat,
      onNote: (i) => {
        if (i < band.length || mode !== "practice" || phase !== "running") return;
        const n = lead[i - band.length];
        lit = [...lit.filter((m) => m !== n.midi), n.midi];
        timers.push(setTimeout(() => (lit = lit.filter((m) => m !== n.midi)), n.duration * 1000));
      },
    });
    for (let k = 0; k < CALL_TURNS; k++) timers.push(setTimeout(() => void grade(k), answerStart(k) + bars * barMs() - beatMs / 4 + 30 - performance.now()));
    ticker = setInterval(() => {
      const bar = (performance.now() - downbeat) / barMs();
      if (bar < 0) return;
      const k = Math.floor(bar / (2 * bars));
      const next = k < CALL_TURNS ? { turn: k, part: bar - turnBar(k, bars) < bars ? ("call" as const) : ("answer" as const) } : null;
      if (next?.part === "call" && now?.part !== "call") {
        lastHeard = now ? heard : [];
        heard = [];
        reply = [];
      }
      now = next;
      laneBeat = next ? ((bar - turnBar(next.turn, bars) - (next.part === "answer" ? bars : 0)) * BEATS_PER_BAR) : null;
    }, 40);
  }

  function onNote(e: NoteEvent) {
    if (phase !== "running") return;
    // Your bars: the note lands on the lane's second row at its beat (in Check too: what you played, not a verdict).
    const turn = Math.floor((e.at - downbeat) / barMs() / (2 * bars));
    if (turn >= 0 && turn < CALL_TURNS) {
      const b = (e.at - answerStart(turn)) / beatMs;
      if (b >= -0.5 && b < bars * BEATS_PER_BAR) reply = [...reply, { beat: Math.max(0, b), midi: e.midi }];
    }
    if (mode !== "practice") {
      heard = [...heard.slice(-7), noteName(e.midi, "flat")];
      return;
    }
    const bar = Math.floor((e.at - downbeat) / barMs());
    const k = Math.floor(bar / (2 * bars));
    const good =
      callMode === "echo"
        ? (calls[k] ?? []).some((n) => pc(n.midi) === pc(e.midi))
        : parseChordSymbol(chordAtBar(groove, bar).symbol)!.pcs.includes(pc(e.midi));
    flashes.add(e.midi, good ? "correct" : "wrong");
    clearTimeout(inTimer);
    if (callMode === "echo" && good) inTimer = setTimeout(() => verdict?.kind === "in" && (verdict = null), 1400);
    const name = noteName(e.midi, "flat");
    verdict = {
      // In the call is not yet right (order and time are judged as the turn ends): a neutral mark, not a tick.
      kind: callMode === "echo" ? (good ? "in" : "wrong") : good ? "right" : "wrong",
      text: callMode === "echo" ? `${name}${good ? " is in the call" : " is not in the call"}` : `${name}${good ? ", a chord tone" : ", off the chord"}`,
      key: (verdict?.key ?? 0) + 1,
    };
  }

  async function grade(k: number) {
    if (!run || phase !== "running") return;
    const from = answerStart(k) - beatMs / 2;
    // From half a beat early to a quarter beat before the next call.
    const to = answerStart(k) + bars * barMs() - beatMs / 4;
    const notes = (cap?.notes ?? []).filter((n) => n.kind === "noteon" && n.at >= from && n.at < to);
    let score: number;
    let correct: boolean;
    let text: string;
    if (callMode === "echo") {
      const events = phraseEvents(calls[k]);
      const r = gradePhrase({ events, notes, beatMs, startAt: answerStart(k) });
      // The same match and window gradePhrase uses: a note out of the window is early or late by its sign.
      const tol = Math.min(180, beatMs / 4);
      const m = matchEvents(events, notes);
      events.forEach((ev, i) => {
        const x = m[i];
        if (!x?.right || x.at === null) return void timing.missed++;
        const err = x.at - (answerStart(k) + ev.startBeat * beatMs);
        if (Math.abs(err) <= tol) timing.onTime++;
        else if (err < 0) timing.early++;
        else timing.late++;
      });
      score = (r.matched + r.onTime) / (2 * r.total);
      correct = r.matched === r.total && r.onTime >= 0.75 * r.total;
      text = `${r.matched} of ${r.total} notes, ${r.onTime} in time`;
    } else {
      const r = gradeAnswer({ notes, groove, downbeat, startAt: answerStart(k), beatMs });
      ({ score, correct } = r);
      text = !r.notes ? "No answer" : `${r.landed ? "Landed on a chord tone" : "Ended off the chord"}, ${pct(r.inTime)} in time`;
    }
    turns = [...turns, { score, correct, text }];
    await run.attempt({ promptId: `turn-${k}`, correct, partialCredit: score, source: runSource(notes), target: calls[k].map((n) => noteName(n.midi, "flat")).join(" "), response: notes.map((n) => noteName(n.midi, "flat")).join(" ") });
    status = mode === "practice" ? `Turn ${k + 1}: ${text}.` : `Answer ${k + 1} saved.`;
    if (k === CALL_TURNS - 1) await finish();
  }

  function teardown() {
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(ticker);
    seq?.stop();
    seq = null;
    now = null;
    laneBeat = null;
    lit = [];
    verdict = null;
    clearTimeout(inTimer);
  }

  async function finish() {
    const ctxRun = run;
    if (!ctxRun) return;
    run = null;
    teardown();
    const all = cap?.notes ?? [];
    cap?.stop();
    cap = null;
    phase = "results";
    if (!turns.length) {
      status = "Stopped before the first answer: nothing recorded.";
      return;
    }
    const right = turns.filter((t) => t.correct).length;
    const fin = await ctxRun.finish({ headline: `${right} of ${turns.length} ${callMode === "echo" ? "echoes" : "answers"} right` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    if (all.length) {
      await saveTake({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        name: `Call and response: ${CALL_GROOVES.find((g) => g.id === groove.id)?.label ?? groove.name}, ${callMode}`,
        notes: pairNotes(all, downbeat, performance.now()),
        durationMs: Math.round(performance.now() - downbeat),
        instrument: runInstrument(all),
      });
    }
    const score = fin.run.score ?? 0;
    const goal = 120;
    const advance = await nextRun(
      `ear.call-response.${callMode}.${groove.id}`,
      { bpm, tempo: { min: TEMPO.min, goal, max: TEMPO.max }, steps: [{ label: "One-bar calls" }, { label: "Two-bar calls" }], step: bars - 1 },
      { score, correct: right === turns.length },
      tempoAnd((i) => cfg.set({ bars: String(i + 1) })),
    );
    // Played past the goal: say the tempo played and the goal in one breath, not "clean at the goal".
    if (bpm > goal && advance.reason.startsWith("clean at the goal")) advance.reason = `clean at ${bpm} BPM, past the ${goal} goal`;
    summary = {
      headline: `${right} of ${turns.length} ${callMode === "echo" ? "calls echoed" : "answers landed in time"} at ${bpm} BPM.${all.length ? " The take is saved in Record." : ""}`,
      metric: pct(score),
      metricLabel: callMode === "echo" ? "notes and timing" : "landing and timing",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === turns.length,
      cleanMeans: callMode === "echo" ? "every call echoed" : "every answer in time on a chord tone",
      xp: fin.xp,
      mode,
      rows: turns.map((t, i) => ({ label: `Turn ${i + 1}`, value: t.score, text: t.text })),
      // Echo measures each call note against its beat; an answer has no set notes to be early or late to.
      timing: callMode === "echo" ? { ...timing } : undefined,
      // The next run by the shared rule: faster, then two-bar calls.
      advance,
    };
    status = summary.headline;
  }

  function stop() {
    if (run && turns.length) void finish();
    else {
      teardown();
      cap?.stop();
      cap = null;
      run = null;
      phase = "ready";
      status = "Stopped before the first answer: nothing recorded.";
    }
  }

  // ---------------------------------------------------------------------------
  // Before Start: a sample call over the band, its keys lit as it plays. Not scored.

  let demo = $state.raw<SequenceHandle | null>(null);
  /** The demo's place on the lane, from its own clock. */
  let demoBeat = $state<number | null>(null);
  let demoRaf = 0;
  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const sec = 60 / bpm;
    const call = sampleCall;
    const band = backingNotes(groove, { bpm, mode: "both", choruses: 1 })
      .filter((n) => n.time < bars * BEATS_PER_BAR * sec)
      .map((n) => ({ ...n, velocity: (n.velocity ?? 0.6) * 0.7 }));
    const lead: SequenceNote[] = call.map((n) => ({ midi: n.midi, time: n.startBeat * sec, duration: n.durationBeats * sec * 0.9, velocity: 0.9 }));
    const h = audio.playSequence([...band, ...lead], {
      onNote: (i) => {
        if (i < band.length) return;
        const n = lead[i - band.length];
        lit = [...lit.filter((m) => m !== n.midi), n.midi];
        setTimeout(() => (lit = lit.filter((m) => m !== n.midi)), n.duration * 1000);
      },
    });
    demo = h;
    const tick = () => {
      if (demo !== h) return;
      demoBeat = (performance.now() - h.startPerf) / 1000 / sec;
      demoRaf = requestAnimationFrame(tick);
    };
    demoRaf = requestAnimationFrame(tick);
    status = "A sample call over the band, its keys lit as it plays. Not scored.";
    void h.done.then(() => demo === h && stopDemo());
  }
  function stopDemo() {
    demo?.stop();
    demo = null;
    cancelAnimationFrame(demoRaf);
    demoBeat = null;
    lit = [];
  }

  onDestroy(() => {
    teardown();
    stopDemo();
    cap?.stop();
  });

  /** Before Start, the keys a call starts and ends on: the first chord's tones in the call range. */
  const startTones = $derived.by(() => {
    const pcs = parseChordSymbol(chordAtBar(groove, 0).symbol)?.pcs ?? [];
    return Array.from({ length: CALL_RANGE[1] - CALL_RANGE[0] + 1 }, (_, i) => CALL_RANGE[0] + i).filter((m) => pcs.includes(pc(m)));
  });
  const marks = $derived(
    phase === "ready" && !demo?.playing ? Object.fromEntries(startTones.map((m) => [m, { role: "chord", label: noteName(m, "flat").replace(/\d+$/, "") } satisfies CellMarks])) : litMarks,
  );
  /** The call on the lane: this turn's while running, the sample call before Start (what Hear it plays). */
  const sampleCall = $derived(callPhrase(rng(7), { groove, bar: 0, bars }));
  const laneTurn = $derived(now?.turn ?? Math.max(0, turns.length - 1));
  const laneCall = $derived(phase === "running" || phase === "countin" ? (calls[laneTurn] ?? []) : sampleCall);
  /** Check hides the notes: the blocks show where in time, blank, never a name or a beat number. */
  /** Before the run the lane holds an example, not the first call: it says so, so the ear task is not given away. */
  const sample = $derived(phase !== "running" && phase !== "countin");
  const blankLane = $derived(mode === "check" && !demo?.playing);
  const laneRows = $derived<LaneRow[]>([
    // Named with their octave (C4, E5), so the call and your notes compare pitch for pitch.
    { id: "call", mark: sample ? "e.g." : "Call", label: sample ? "A sample call" : "The call", hand: "right", notes: laneCall.map((n) => ({ beat: n.startBeat, dur: n.durationBeats, text: blankLane ? "" : noteName(n.midi, "flat") })) },
    ...(phase === "running" ? [{ id: "you", mark: "You", label: "Your notes", hand: "left" as const, notes: reply.map((r, i) => ({ beat: r.beat, dur: Math.max(0.25, Math.min(1, (reply[i + 1]?.beat ?? r.beat + 1) - r.beat)), text: blankLane ? "" : noteName(r.midi, "flat") })) }] : []),
  ]);
  const laneChords = $derived(
    Array.from({ length: bars }, (_, i) => ({ beat: i * BEATS_PER_BAR, symbol: chordAtBar(groove, (phase === "running" ? turnBar(laneTurn, bars) : 0) + i).symbol })),
  );
  /** The keys span every call note of the run and everything you play, so a note never falls off the keyboard. */
  const keyLine = $derived([...CALL_RANGE, ...(phase === "ready" ? sampleCall : calls.flat()).map((n) => n.midi), ...reply.map((r) => r.midi)]);
  /** A phone shows only the call's own span (and what you play), at least an octave and a bit, so keys stay wide. */
  const phone = new MediaQuery("(max-width: 639px)");
  const span = $derived.by(() => {
    if (!phone.current) return {};
    const ms = [...(phase === "running" || phase === "countin" ? (calls[laneTurn] ?? []) : sampleCall).map((n) => n.midi), ...reply.map((r) => r.midi)];
    if (!ms.length) return {};
    const lo = Math.min(...ms) - 2;
    const hi = Math.max(Math.max(...ms) + 2, lo + 14);
    return { low: lo, high: hi };
  });
  const grooveLabel = $derived(CALL_GROOVES.find((g) => g.id === groove.id)?.label ?? groove.name);
  const summaryLine = $derived([
    { text: callMode === "echo" ? "Echo the call" : "Answer the call", focus: "mode" },
    { text: `over a ${grooveLabel.toLowerCase()} in ${groove.key}`, focus: "groove" },
    { text: `${bars}-bar calls`, focus: "bars" },
    { text: `${CALL_TURNS} turns at ${bpm} BPM` },
  ]);
</script>

<DrillShell
  lesson={callMode === "answer" ? { lessons: [chordTonesLesson(chordAtBar(groove, 0).symbol)] } : null}
  title={CHANGES_TITLE}
  trainer={changesTrainer("call-response")}
  hue="ear"
  blurb="A short call over the band, then your turn: echo it back, or answer with your own phrase."
  modeNotes={{ practice: "Hints shown. Clean runs move you on.", check: "No hints. Counts in your skill scores." }}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  clock={{ bpm, beatsPerBar: BEATS_PER_BAR }}
  progress={phase === "running" ? Math.min(1, (turns.length + 1) / CALL_TURNS) : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  cue={phase === "countin" ? "Count-in: the call comes first" : phase !== "running" ? "" : !now ? "Get ready" : now.part === "call" ? "Listen to the call" : callMode === "echo" ? "Your turn: echo it" : "Your turn: answer it"}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice
        label="Your part"
        setupKey="mode"
        options={[
          { value: "echo", label: "Echo the call", hint: "Play the call back, in time, in any octave." },
          { value: "answer", label: "Answer it", hint: "Your own phrase: stay on the grid and end on a chord tone." },
        ]}
        value={callMode}
        onchange={(v) => cfg.set({ mode: v })}
      />
      <Choice label="Groove" setupKey="groove" options={CALL_GROOVES.map((g) => ({ value: g.id, label: g.label }))} value={groove.id} onchange={(v) => cfg.set({ groove: v })} />
      <Choice label="Call length" setupKey="bars" options={[{ value: "1", label: "One bar" }, { value: "2", label: "Two bars" }]} value={String(bars)} onchange={(v) => cfg.set({ bars: v })} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">The tempo is the strip's. The run is kept as a take you can hear in Record.</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Turn" value="{Math.min(CALL_TURNS, (now?.turn ?? 0) + 1)} of {CALL_TURNS}" />
      {#if mode === "practice"}<Stat label="Turns right" value={turns.filter((t) => t.correct).length} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <div
      class="flex flex-col gap-3"
      data-testid="call-response"
      data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined}
      data-beat-ms={Math.round(beatMs)}
      data-bars={bars}
      data-calls={JSON.stringify(calls.map((c) => c.map((n) => [n.midi, n.startBeat])))}
    >
      <div class="flex flex-wrap items-center gap-3">
        <p class="cue font-display text-3xl font-semibold" data-part={now?.part ?? ""} aria-live="polite">
          {phase !== "running" ? "Listen, then play" : !now ? "Get ready" : now.part === "call" ? "Listen" : "Your turn"}
        </p>
        <p class="text-sm text-ws-stage-soft">
          Key of {groove.key.replace(/ major$/, "")}, now {chordAtBar(groove, now ? Math.floor((performance.now() - downbeat) / barMs()) : 0).symbol}
        </p>
      </div>
      <!-- The call as note blocks in time, lit as it plays; your notes fill the row under it as you play. -->
      <div data-dock="music">
        <BeatLane
          rows={laneRows}
          beats={bars * BEATS_PER_BAR}
          beat={demo?.playing ? demoBeat : laneBeat}
          chords={laneChords}
          hidden={false}
          label={phase === "running" ? `Turn ${laneTurn + 1}: the call, ${laneCall.length} notes, and your notes so far, ${reply.length}` : `A sample call: ${laneCall.length} notes over ${laneChords.map((c) => c.symbol).join(", ")}`}
        />
      </div>
      {#if phase === "running" && mode === "practice" && verdict?.kind === "in"}
        <!-- Neutral: the note is in the call, but order and timing are judged when the turn ends. -->
        {#key verdict.key}
          <p class="in-call flex h-8 items-center gap-1.5 text-sm font-semibold" aria-live="polite" data-testid="verdict">
            <span class="dot" aria-hidden="true"></span>{verdict.text}
          </p>
        {/key}
      {:else if phase === "running" && mode === "practice"}
        <Verdict kind={verdict?.kind === "in" ? null : verdict?.kind} text={verdict?.text} key={verdict?.key ?? 0} class="flex h-8 items-center" />
      {:else if phase === "running"}
        <!-- Check: while you play only a count (the notes stay hidden); once the turn is over, what you played by
             name. Right or wrong waits for the end. -->
        <p class="min-h-8 text-sm" aria-live="polite">
          {#if now?.part === "answer"}<span class="text-ws-stage-soft">Notes heard:</span> <span class="font-medium">{heard.length}</span>
          {:else if lastHeard.length}<span class="text-ws-stage-soft">You played:</span> <span class="font-medium [word-spacing:0.4rem]">{lastHeard.join(" ")}</span>{/if}
        </p>
      {/if}
      {#if turns.length && mode === "practice"}
        <ol class="flex flex-wrap gap-1.5" aria-label="Turns">
          {#each turns as t, i (i)}
            <li class="turn rounded-full px-3 py-1 text-sm" data-state={t.correct ? "right" : "wrong"}>{i + 1}: {t.text}</li>
          {/each}
        </ol>
      {/if}
      <!-- On a live phone run this grows; the keys sit at its foot, under the thumb. -->
      <!-- A live phone run: this region takes the free height and the keys sit at its foot, under the thumb. -->
      <div class="flex flex-col justify-end" data-dock="instrument" data-grow={phone.current && phase === "running" ? "" : undefined}><InstrumentStage line={keyLine} {marks} {flashes} {...span} /></div>
      {#if phase === "ready" && !demo?.playing}
        <p class="text-sm text-ws-stage-soft">The lane shows a sample call. Each turn brings a new one between C4 and E5. Each starts and ends on a chord tone: the lit keys are the tones of {chordAtBar(groove, 0).symbol}, the first chord.</p>
      {:else if mode === "practice"}<p class="text-sm text-ws-stage-soft">The call's keys light as it plays; your notes flash with a tick or a cross.</p>{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>

<style>
  .in-call .dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
    border: 2px solid var(--ws-stage-ink);
    background: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
  }
  .cue[data-part="answer"] {
    color: var(--instr);
  }
  .turn {
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    border: 1.5px solid transparent;
  }
  .turn[data-state="right"] {
    border-color: var(--success);
  }
  .turn[data-state="wrong"] {
    border-color: var(--destructive);
  }
</style>
