<script lang="ts">
  // Call and response over a groove: six turns of a call (one or two bars) and
  // your answer in the bars after it, the band playing throughout. Echo is
  // graded like Phrases (notes in order, in time); Answer on landing on a chord
  // tone and staying on the eighth-note grid. The whole run is kept as a take.
  import { onDestroy } from "svelte";
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
  import { gradePhrase, phraseEvents } from "@repo/music-core/scoring/phrases";
  import { chordTonesLesson } from "@repo/music-core/lessons/tier1";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import InstrumentStage from "#lib/music/components/InstrumentStage.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, settings, type SequenceHandle, type SequenceNote } from "#lib/music/runtime/index.ts";
  import { backingNotes } from "#lib/music/drills/jam/backing.ts";
  import { pairNotes, saveTake } from "#lib/music/takes.ts";

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
  const barMs = () => beatMs * BEATS_PER_BAR;
  const answerStart = (k: number) => downbeat + (turnBar(k, bars) + bars) * barMs();

  async function start(ctx: RunContext) {
    summary = null;
    turns = [];
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
    seq = audio.playSequence([...band, ...lead], { startPerf: ctx.downbeat });
    for (let k = 0; k < CALL_TURNS; k++) timers.push(setTimeout(() => void grade(k), answerStart(k) + bars * barMs() - beatMs / 4 + 30 - performance.now()));
    ticker = setInterval(() => {
      const bar = (performance.now() - downbeat) / barMs();
      if (bar < 0) return;
      const k = Math.floor(bar / (2 * bars));
      now = k < CALL_TURNS ? { turn: k, part: bar - turnBar(k, bars) < bars ? "call" : "answer" } : null;
    }, 40);
  }

  function onNote(e: NoteEvent) {
    if (phase !== "running" || mode !== "practice") return;
    const bar = Math.floor((e.at - downbeat) / barMs());
    const k = Math.floor(bar / (2 * bars));
    const good =
      callMode === "echo"
        ? (calls[k] ?? []).some((n) => pc(n.midi) === pc(e.midi))
        : parseChordSymbol(chordAtBar(groove, bar).symbol)!.pcs.includes(pc(e.midi));
    flashes.add(e.midi, good ? "correct" : "wrong");
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
      const r = gradePhrase({ events: phraseEvents(calls[k]), notes, beatMs, startAt: answerStart(k) });
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
    summary = {
      headline: `${right} of ${turns.length} ${callMode === "echo" ? "calls echoed" : "answers landed in time"}.${all.length ? " The take is saved in Record." : ""}`,
      metric: pct(score),
      metricLabel: callMode === "echo" ? "notes and timing" : "landing and timing",
      delta: fin.delta,
      best: fin.best,
      clean: mode === "check" && right === turns.length,
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: turns.map((t, i) => ({ label: `Turn ${i + 1}`, value: t.score, text: t.text })),
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

  onDestroy(() => {
    teardown();
    cap?.stop();
  });

  const grooveLabel = $derived(CALL_GROOVES.find((g) => g.id === groove.id)?.label ?? groove.name);
  const summaryLine = $derived([
    { text: callMode === "echo" ? "Echo the call" : "Answer the call", focus: "mode" },
    { text: `over a ${grooveLabel.toLowerCase()} in ${groove.key}`, focus: "groove" },
    { text: `${bars}-bar calls`, focus: "bars" },
    { text: `${CALL_TURNS} turns at ${bpm} BPM` },
  ]);
</script>

<svelte:head><title>Call and response | Woodshed</title></svelte:head>

<DrillShell
  lesson={callMode === "answer" ? { lessons: [chordTonesLesson(chordAtBar(groove, 0).symbol)] } : null}
  title="Call and response"
  hue="ear"
  blurb="The band plays; a short call comes in, then the same number of bars are yours. Echo it back in time, or answer it with your own phrase that ends on a chord tone."
  modeNotes={{ practice: "Each note lights right or wrong, and each turn is judged as it ends.", check: "No feedback until the end. Counts toward mastery." }}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  clock={{ bpm, beatsPerBar: BEATS_PER_BAR }}
  progress={phase === "running" ? turns.length / CALL_TURNS : null}
  onstart={start}
  onstop={stop}
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
      {#if mode === "practice"}<Stat label="Right so far" value={turns.filter((t) => t.correct).length} />{/if}
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
      {#if turns.length && mode === "practice"}
        <ol class="flex flex-wrap gap-1.5" aria-label="Turns">
          {#each turns as t, i (i)}
            <li class="turn rounded-full px-3 py-1 text-sm" data-state={t.correct ? "right" : "wrong"}>{i + 1}: {t.text}</li>
          {/each}
        </ol>
      {/if}
      <InstrumentStage line={[60, 76]} {flashes} />
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>

<style>
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
