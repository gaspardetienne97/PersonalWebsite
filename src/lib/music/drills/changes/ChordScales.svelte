<script lang="ts">
  import { CHANGES_TITLE, changesTrainer } from "./modes";
  import { TimedRun } from "./timed-run";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc, pcOf } from "@repo/music-core";
  import { CHORD_PATTERNS, KEY_CYCLE, chordPatternLine, chordScaleTargets, cycleTranspose, goToScale } from "@repo/music-core/content/piano";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import { gradeChordScales, gradeLick, type ChordScaleResult, type LickResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions } from "#lib/music/components/InstrumentStage.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Choice from "#lib/music/components/Choice.svelte";
  import type { SetupClause } from "#lib/music/components/DrillShell.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks, type FlashKind } from "#lib/music/components/feedback.svelte.ts";
  import { lineOutcomes } from "#lib/music/drills/piano/lane-outcomes.ts";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import { Transport, benchFromUrl, sounding, type TimedNote } from "#lib/music/drills/piano/transport.svelte.ts";
  import { toneLabel } from "#lib/music/drills/piano/tones.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, pct, runInstrument, runSource } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { scaleTip } from "#lib/music/drills/piano/tones.ts";
  import { m } from "@repo/i18n/messages.js";

  const TEMPO = { min: 40, max: 200 };
  /** Two bars a chord then one, major changes then minor. */
  const LADDER = [
    { changes: "major", beats: 8, label: m.music_drills_chordscales_ladder_major_two() },
    { changes: "major", beats: 4, label: m.music_drills_chordscales_ladder_major_one() },
    { changes: "minor", beats: 8, label: m.music_drills_chordscales_ladder_minor_two() },
    { changes: "minor", beats: 4, label: m.music_drills_chordscales_ladder_minor_one() },
  ];
  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  // `pattern`: empty plays the scales; 1235 or 3579 plays that pattern up and back on each chord, a bar each, through `keys` keys of the cycle.
  const cfg = new DrillSetup("chord-scales", { changes: "major" as string, key: "C", beats: 8, pattern: "" as string, keys: 1 });
  const s = $derived(cfg.value);
  const changes = $derived((s.changes === "minor" ? "minor" : "major") as "major" | "minor");
  const key = $derived(KEY_CYCLE.includes(s.key) ? s.key : "C");
  const pattern = $derived(CHORD_PATTERNS.find((p) => p.id === s.pattern));
  const keyCount = $derived(pattern ? ([1, 3, 12].includes(s.keys) ? s.keys : 1) : 1);
  const keyList = $derived(Array.from({ length: keyCount }, (_, i) => KEY_CYCLE[(KEY_CYCLE.indexOf(key) + i) % 12]));
  const perChord = $derived(pattern || s.beats === 4 ? 4 : 8);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const targets = $derived(
    keyList.flatMap((k) => chordScaleTargets(changes, cycleTranspose(k))).map((t) => {
      const chord = parseChordSymbol(t.symbol)!;
      const sc = goToScale(t.symbol);
      return { ...t, chord, scaleId: sc?.scale, hint: sc?.hint?.replace(/\s*\(JT\d+\)/g, "") };
    }),
  );
  const totalBeats = $derived(targets.length * perChord);
  const patternLine = $derived(pattern ? chordPatternLine(targets.map((t) => t.symbol), pattern.id) : []);
  // One keyboard from the lowest root to an octave above the highest.
  const low = $derived(Math.floor(Math.min(...targets.map((t) => t.midi[0])) / 12) * 12);
  const high = $derived(Math.ceil((Math.max(...targets.map((t) => t.midi[0])) + 13) / 12) * 12);

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<ChordScaleResult | null>(null);
  let patternResult = $state<LickResult | null>(null);
  let played = 0;
  const transport = new Transport();
  const timedRun = new TimedRun(transport);
  const flashes = new Flashes<FlashKind | "order">();
  /** Pattern mode: the notes played, in beats from the downbeat, for the marks on the run's staff. */
  let hits = $state<{ midi: number; beat: number }[]>([]);
  let beatMsRun = $state(500);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let ctxRef: RunContext | null = null;

  // Each chord's go-to scale written out (the demo's line), on the strip's instrument, an octave up where the stage moves it.
  const inst = $derived(settings.value.activeInstrument);
  const stageLine = $derived(targets.flatMap((t) => [t.midi[0], t.midi[0] + 12]));
  const lift = $derived(fitShift(stageLine, inst));
  const written = $derived.by(() => {
    if (pattern) {
      const at = linePositions(inst, patternLine.map((n) => n.midi + lift));
      return patternLine.map((n) => ({ midi: n.midi + lift, startBeat: n.startBeat, durationBeats: n.durationBeats, ...at.get(n.midi + lift) }));
    }
    // Plain values (a nine-note scale over eight beats would be tuplets): the longest that fits, rests after.
    // Each chord's scale in its own hand position on a fretted instrument.
    return targets.flatMap((tg, i) => {
      const line = [...tg.midi, tg.midi[0] + 12].map((m) => m + lift);
      const dur = [1, 0.5, 0.25].find((d) => d * line.length <= perChord) ?? 0.25;
      const at = linePositions(inst, line);
      return line.map((midi, k) => ({ midi, startBeat: i * perChord + k * dur, durationBeats: dur, ...at.get(midi) }));
    });
  });

  // A change is anticipated by half a beat: a note just before the bar line belongs to the next chord.
  const chordIndexAt = (beat: number) => Math.min(targets.length - 1, Math.max(0, Math.floor((beat + 0.5) / perChord)));
  // What is lit follows the transport clock (the playhead), never ahead of it; grading keeps the anticipation.
  const currentIndex = $derived(transport.beat === null ? 0 : Math.min(targets.length - 1, Math.max(0, Math.floor(transport.beat / perChord))));
  const current = $derived(targets[currentIndex]);
  /** The chart shows one key's ii-V-I at a time. */
  const chartFrom = $derived(Math.floor(currentIndex / 3) * 3);
  /** Pattern mode: the next note to play. */
  let nextIndex = $state(0);

  const demoNotes = $derived<TimedNote[]>(
    targets.flatMap((t, i) => {
      const line = [...t.midi, t.midi[0] + 12];
      const step = perChord / line.length;
      const shell = [t.chord.rootPc + 48, ...t.chord.intervals.filter((iv) => iv === 3 || iv === 4 || iv === 10 || iv === 11).map((iv) => t.chord.rootPc + 48 + iv)];
      const right = pattern ? patternLine.filter((n) => n.chord === i).map((n) => ({ midi: n.midi, beat: n.startBeat, dur: 0.5 })) : line.map((midi, k) => ({ midi, beat: i * perChord + k * step, dur: step }));
      return [
        ...shell.map((midi) => ({ midi, beat: i * perChord, dur: perChord * 0.95, hand: "left" as const, velocity: 0.45 })),
        ...right.map((n) => ({ ...n, hand: "right" as const, velocity: 0.8 })),
      ];
    }),
  );

  /** The data's scale hints in plain words: no dashes or plus signs, no internal lesson codes, and why Lydian over a major 7th. */
  const plainHint = (h: string | undefined) =>
    !h
      ? ""
      : h.replace(/\s+\u2014\s+/g, ": ").replace(/\s\+\s/g, ` ${m.music_drills_chordscales_plus()} `).replace(/\s*\(JT\d+\)/g, "").replace(/\s*\/\s*/g, ", ");
  // The colour key sits on the keys you play: every key of the current chord's octave, by role.
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      // Each sounding note is named by its own chord, not the one the chart is about to change to.
      for (const n of sounding(demoNotes, transport.beat)) {
        const own = targets[Math.min(targets.length - 1, Math.floor(n.beat / perChord))];
        if (n.hand === "right") out[n.midi] = { demo: true, label: toneLabel(n.midi - own.chord.rootPc, own.chord.intervals), role: own.roles[pc(n.midi)] };
      }
    }
    const showKey = transport.playing || (mode === "practice" && phase !== "results");
    if (!showKey || !current) return out;
    const next = pattern && !transport.playing ? patternLine[phase === "running" ? nextIndex : 0] : undefined;
    if (next) out[next.midi] = { ...out[next.midi], target: true };
    for (let k = current.midi[0]; k <= current.midi[0] + 12; k++) {
      if (out[k]) continue;
      out[k] = { label: toneLabel(k - current.midi[0], current.chord.intervals), role: current.roles[pc(k)] };
    }
    return out;
  });

  const changesLabel = $derived(changes === "major" ? m.music_drills_voicings_v_major() : m.music_drills_voicings_v_minor());
  const summaryLine = $derived<SetupClause[]>(
    pattern
      ? [
          { text: m.music_drills_chordscales_up_and_back({ pattern: pattern.label }), focus: "pattern" },
          { text: m.music_drills_voicings_summary_from({ label: changesLabel, key }), focus: "key" },
          { text: keyCount === 12 ? m.music_drills_voicings_summary_all_keys() : m.music_drills_voicings_summary_keys({ count: keyCount }), focus: "keys" },
        ]
      : [
          { text: m.music_drills_chordscales_summary_in({ label: changesLabel, key, chords: targets.map((t) => t.symbol).join(" ") }), focus: "key" },
          { text: perChord === 8 ? m.music_drills_chordscales_two_bars_per_chord() : m.music_drills_chordscales_one_bar_per_chord(), focus: "beats" },
        ],
  );
  const setupKey = $derived(`chord-scales:${changes}:${key}:${perChord}:${bpm}${pattern ? `:${pattern.id}:${keyCount}` : ""}`);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = pattern ? m.music_drills_chordscales_demo_pattern({ pattern: pattern.label }) : m.music_drills_chordscales_demo_scales();
    await transport.demo(demoNotes, bpm);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    if (pattern) {
      const want = patternLine[played];
      played += 1;
      nextIndex = Math.min(played, patternLine.length - 1);
      if (ctxRef) hits = [...hits, { midi: e.midi, beat: (e.at - ctxRef.downbeat) / ctxRef.beatMs }];
      if (mode === "practice" && want) {
        // A note of this chord's pattern out of its turn is an order slip (amber), not a wrong note (red X).
        const inPattern = patternLine.some((n) => n.chord === want.chord && pc(n.midi) === pc(e.midi));
        flashes.add(e.midi, pc(e.midi) === pc(want.midi) ? "correct" : inPattern && inst === "piano" ? "order" : "wrong");
      }
      return;
    }
    if (mode !== "practice") return;
    const t = targets[chordIndexAt(transport.beat ?? 0)];
    flashes.add(e.midi, t.roles[pc(e.midi)] === "avoid" ? "wrong" : "correct");
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    patternResult = null;
    played = 0;
    nextIndex = 0;
    hits = [];
    beatMsRun = ctx.beatMs;
    flashes.clear();
    ctxRef = ctx;
    run = practice.beginRun({
      exerciseId: "jazz.chord-scales",
      setupKey,
      skillIds: [`harmony.ii-v-i.chord-scales.${changes}`],
      capabilities: ["harmony"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: changes === "minor" ? 0.65 : 0.5,
      instrument: settings.value.activeInstrument,
      params: { bpm, changes, key, beatsPerChord: perChord, ...(pattern ? { pattern: pattern.id, keys: keyCount } : {}) },
    });
    timedRun.begin(ctx, totalBeats, onNote, () => void finish(), 200);
  }

  /** Pattern mode, after the run: each note right, wrong or missed, graded by position as the run is. */
  const patternStates = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (!patternResult) return out;
    const tol = Math.min(180, beatMsRun / 4) / beatMsRun;
    lineOutcomes(patternLine.map((n) => ({ midi: n.midi, beat: n.startBeat })), hits, tol).forEach((o, i) => (out[i] = !o ? "missed" : o === "miss" ? "wrong" : "correct"));
    return out;
  });
  /** Beside Stop on a phone: the chord now and, in Practice, its scale. */
  const cue = $derived(phase === "running" && transport.beat !== null && transport.beat >= 0 && current ? mode === "practice"
        ? pattern
          ? m.music_drills_chordscales_cue_pattern({ symbol: current.symbol, pattern: pattern.label })
          : m.music_drills_chordscales_cue_scale({ symbol: current.symbol, scale: current.scaleLabel })
        : m.music_drills_chordscales_cue_hidden({ symbol: current.symbol })
      : "");

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    const ons = timedRun.end(true).filter((n) => n.kind === "noteon");
    const ctx = ctxRef!;
    if (pattern) return finishPattern(ctx, ons);
    const byChord = targets.map(() => [] as number[]);
    for (const n of ons) byChord[chordIndexAt((n.at - ctx.downbeat) / ctx.beatMs)].push(n.midi);
    const r = gradeChordScales(targets.map((t, i) => ({ symbol: t.symbol, chordPcs: t.chord.pcs, scalePcs: t.accepted, played: byChord[i] })));
    result = r;
    phase = "results";
    const source = runSource(ons);
    const instrument = runInstrument(ons) ?? null;
    for (const [i, t] of targets.entries())
      await run!.attempt({
        promptId: `${setupKey}:${t.symbol}`,
        correct: byChord[i].length > 0 && r.chords[i].score >= 0.9,
        partialCredit: r.chords[i].score,
        metrics: [r.metrics[i]],
        source,
        instrument,
        target: t.midi,
        response: byChord[i],
      });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} inside the scales` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const outside = r.chords.reduce((a, c) => a + c.avoid, 0);
    const worst = [...r.chords].sort((a, b) => b.avoid - a.avoid)[0];
    summary = {
      headline:
        r.graded === 0
          ? m.music_drills_chordscales_h_silent()
          : r.correct
            ? m.music_drills_chordscales_h_correct({ inside: r.chords.map((c) => c.chord + c.scale).reduce((a, b) => a + b, 0), outside })
            : r.graded < targets.length
              ? m.music_drills_chordscales_h_partial({ played: r.graded, total: targets.length })
              : m.music_drills_chordscales_h_outside({ count: outside, symbol: worst.symbol }),
      metric: pct(r.score),
      metricLabel: m.music_drills_chordscales_metric_inside(),
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      cleanMeans: m.music_drills_chordscales_clean_scales(),
      rows: r.chords.map((c, i) => ({
        label: `${c.symbol}, ${targets[i].scaleLabel}`,
        value: c.chord + c.scale + c.avoid ? c.score : null,
        text: c.chord + c.scale + c.avoid ? m.music_drills_chordscales_row_text({ chord: c.chord, scale: c.scale, avoid: c.avoid }) : m.music_drills_chordscales_nothing_played(),
      })),
      advance: ons.length
        ? await nextRun(`chord-scales.${key}`, { bpm, tempo: { min: TEMPO.min, goal: 150, max: TEMPO.max }, steps: LADDER, step: LADDER.findIndex((l) => l.changes === changes && l.beats === perChord) }, r, tempoAnd((i) => cfg.set({ changes: LADDER[i].changes, beats: LADDER[i].beats })))
        : undefined,
    };
    status = summary.headline;
  }

  /** Pattern mode: graded note by note in order, like a lick. */
  async function finishPattern(ctx: RunContext, ons: NoteEvent[]) {
    const r = gradeLick({ expected: patternLine, notes: ons, beatMs: ctx.beatMs, startAt: ctx.downbeat });
    patternResult = r;
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(ons),
      instrument: runInstrument(ons) ?? null,
      target: patternLine.map((n) => n.midi),
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${r.matched} of ${r.total} notes` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const slip = r.firstWrong === null ? null : targets[patternLine[r.firstWrong].chord];
    summary = {
      headline: !r.matched
        ? m.music_drills_chordscales_h_no_match()
        : r.correct
          ? mode === "check"
            ? m.music_drills_chordscales_h_pattern_check({ pattern: pattern!.label })
            : m.music_drills_chordscales_h_pattern_all({ pattern: pattern!.label, total: r.total })
          : m.music_drills_chordscales_h_slipped({ matched: r.matched, total: r.total, symbol: slip?.symbol ?? m.music_drills_chordscales_a_chord() }),
      metric: pct(r.score),
      metricLabel: m.music_drills_chordscales_metric_order(),
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      rows: [
        { label: m.music_drills_chordscales_row_order(), value: r.score, text: m.music_drills_voicings_n_of({ n: r.matched, total: r.total }) },
        // Timing is judged on the notes that came in order, so it says how many of those.
        { label: m.music_drills_chordscales_row_on_time({ ms: Math.round(Math.min(180, ctx.beatMs / 4)) }), value: r.matched ? r.onTime / r.matched : 0, text: m.music_drills_voicings_n_of({ n: r.onTime, total: r.matched }) },
        ...perChordRows(),
      ],
      cleanMeans: m.music_drills_chordscales_clean_order(),
      advance: ons.length ? await nextRun(`chord-scales.pattern.${pattern!.id}.${keyCount}`, { bpm, tempo: { min: TEMPO.min, goal: 120, max: TEMPO.max } }, r) : undefined,
    };
    status = summary.headline;
  }

  /** Pattern mode on one key: how each chord went, so the slip has a place. */
  function perChordRows() {
    if (targets.length > 6) return [];
    const marks = Object.values(patternStates);
    return targets.map((t, i) => {
      const own = patternLine.flatMap((n, k) => (n.chord === i ? [marks[k]] : []));
      const right = own.filter((s) => s === "correct").length;
      return { label: t.symbol, value: own.length ? right / own.length : 0, text: m.music_drills_voicings_n_of({ n: right, total: own.length }) };
    });
  }

  function stop() {
    timedRun.end();
    phase = "ready";
    status = m.music_drills_comping_stopped();
  }

  onDestroy(() => {
    timedRun.end();
  });
</script>

<DrillShell
  lesson={{ lessons: conceptCard(pattern ? "chord-scales.patterns" : changes === "major" ? "chord-scales.why" : "chord-scales.minor"), trigger: "check" }}
  title={CHANGES_TITLE}
  trainer={changesTrainer("chord-scales")}
  hue="piano"
  blurb={m.music_drills_chordscales_blurb()}
  summary={summaryLine}
  tabs={[
    { id: "major", label: m.music_drills_voicings_v_major() },
    { id: "minor", label: m.music_drills_voicings_v_minor() },
  ]}
  tab={changes}
  ontab={(id) => cfg.set({ changes: id })}
  bind:phase
  bind:mode
  bind:status
  progress={transport.beat === null ? 0 : Math.min(1, Math.max(0, transport.beat / totalBeats))}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
  {cue}
>
  {#snippet setup()}
    <div class="mb-4">
      <Choice
        label={m.music_drills_chordscales_choice_play()}
        setupKey="pattern"
        options={[{ value: "", label: m.music_drills_chordscales_the_scales() }, ...CHORD_PATTERNS.map((p) => ({ value: p.id as string, label: m.music_drills_chordscales_pattern_label({ pattern: p.label }) }))]}
        value={pattern?.id ?? ""}
        onchange={(v) => cfg.set({ pattern: v })}
      />
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">{pattern ? m.music_drills_voicings_kw_start_key() : m.music_drills_voicings_kw_key()}</span>
        <KeyPicker label={m.music_drills_voicings_kw_key()} value={pcOf(key)!} name={(p) => KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C"} onchange={(p) => cfg.set({ key: KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C" })} />
      </div>
      {#if pattern}
        <Choice
          label={m.music_drills_voicings_choice_keys()}
          setupKey="keys"
          options={[
            { value: 1, label: m.music_drills_voicings_keys_one() },
            { value: 3, label: m.music_drills_voicings_keys_three() },
            { value: 12, label: m.music_drills_voicings_keys_all() },
          ]}
          value={keyCount}
          onchange={(v) => cfg.set({ keys: v })}
        />
      {:else}
        <Choice
          label={m.music_drills_chordscales_choice_lasts()}
          setupKey="beats"
          options={[
            { value: 4, label: m.music_drills_chordscales_one_bar() },
            { value: 8, label: m.music_drills_chordscales_two_bars() },
          ]}
          value={perChord}
          onchange={(v) => cfg.set({ beats: v })}
        />
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <Stat label={m.music_drills_voicings_stat_chord()} value={m.music_drills_voicings_n_of({ n: currentIndex + 1, total: targets.length })} />
    {/if}
    <!-- After a run the HUD stays quiet: the results card says the numbers once (and a silent run has none). -->
  {/snippet}

  {#snippet stage()}
    <div class="flex min-h-0 flex-col" data-dock="music">
    <ol class="mb-3 grid grid-cols-3 gap-2" aria-label={m.music_drills_voicings_chord_chart()}>
      {#each targets.slice(chartFrom, chartFrom + 3) as t, j (t.symbol)}
        {@const i = chartFrom + j}
        {@const now = (phase === "running" || transport.playing) && i === currentIndex}
        {@const done = result?.chords[i]}
        <li class="min-w-0 rounded-lg border px-2 py-2 sm:px-3 {now ? 'border-instr bg-instr/20' : 'border-ws-stage-ink/15'}" aria-current={now ? "step" : undefined}>
          <p class="font-display text-xl font-semibold sm:text-2xl">{t.symbol}</p>
          {#if mode === "practice" || phase === "results"}
            <p class="truncate text-sm text-ws-stage-soft">{t.scaleLabel}</p>
            {#if scaleTip(t.scaleId) && phase !== "running"}<p class="text-[0.8125rem] text-ws-stage-soft max-sm:hidden">{scaleTip(t.scaleId)}</p>{/if}
          {/if}
          {#if done}<p class="text-[0.8125rem] text-ws-stage-soft">{done.avoid ? m.music_drills_chordscales_n_outside({ count: done.avoid }) : done.chord + done.scale ? m.music_drills_chordscales_all_inside() : m.music_drills_voicings_not_played()}</p>{/if}
        </li>
      {/each}
    </ol>
    {#if mode === "practice" && current}
      <p class="mb-3 text-sm text-ws-stage-soft">
        <span class="font-semibold text-ws-stage-ink">{m.music_drills_chordscales_scale_line({ symbol: current.symbol, scale: current.scaleLabel })}</span>
        {plainHint(current.hint)}{current.others.length ? ` ${m.music_drills_chordscales_also_inside({ scales: current.others.join(", ") })}` : ""}
      </p>
    {:else if mode === "check" && phase !== "results"}
      <p class="mb-3 text-sm text-ws-stage-soft">{m.music_drills_chordscales_check_hidden()} {pattern ? m.music_drills_chordscales_check_pattern({ pattern: pattern.label }) : m.music_drills_chordscales_check_fits()}</p>
    {/if}
    {#if mode === "practice" || transport.playing || phase === "results"}
      <!-- Each chord's symbol over its bars, so the change is read on the music itself. -->
      <!-- Before Start the staff engraves smaller, so the whole keyboard is in the first screen. -->
      <div class="mb-3"><LineNotation oneRow maxZoom={phase === "running" || transport.playing ? undefined : 0.75} notes={written} tuning={fretTuning(inst)} title={setupKey} cursorBeat={transport.beat} keyFifths={signatureFor(pcOf(key) ?? 0, changes === "major" ? "major" : "natural-minor")} chords={targets.map((t, i) => ({ symbol: t.symbol, startBeat: i * perChord, durationBeats: perChord }))} /></div>
    {/if}
    </div>
    <div class="flex flex-col justify-end" data-dock="instrument">
      <InstrumentStage line={current ? [...current.midi, current.midi[0] + 12] : stageLine} {low} {high} {marks} {flashes} fit />
    </div>
    <!-- The colour key goes with the colours on the keys: Check (and the results) hide both. -->
    {#if transport.playing || (mode === "practice" && phase !== "results")}
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-stage-ink" aria-label={m.music_drills_chordscales_colour_key()}>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="chord" aria-hidden="true">3</span>{m.music_drills_chordscales_key_chord()}</li>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="scale" aria-hidden="true">9</span>{m.music_drills_chordscales_key_scale()}</li>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="avoid" aria-hidden="true">b9</span>{m.music_drills_chordscales_key_avoid()}</li>
      {#if pattern}<li class="flex items-center gap-1.5"><span class="key-swatch" data-role="order" aria-hidden="true">5</span>{m.music_drills_chordscales_key_order()}</li>{/if}
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="wrong" aria-hidden="true">✕</span>{pattern ? m.music_drills_chordscales_key_not_pattern() : m.music_drills_chordscales_key_outside()}</li>
    </ul>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} {figure} />{/if}
  {/snippet}
</DrillShell>

<!-- Pattern mode: the line as you played it, each note right, wrong or missed on the staff or tab. -->
{#snippet figure()}
  {#if pattern && patternResult && hits.length}
    <div class="stage rounded-2xl p-3">
      <p class="mb-2 text-sm font-medium text-ws-stage-soft">{m.music_drills_chordscales_figure_title()}</p>
      <LineNotation oneRow notes={written} tuning={fretTuning(inst)} title="{setupKey}-run" groupStates={patternStates} keyFifths={signatureFor(pcOf(key) ?? 0, changes === "major" ? "major" : "natural-minor")} chords={targets.map((t, i) => ({ symbol: t.symbol, startBeat: i * perChord, durationBeats: perChord }))} />
    </div>
  {/if}
{/snippet}

<style>
  .key-swatch {
    min-width: 1.5rem;
    height: 1.35rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #17120c;
  }
  .key-swatch[data-role="wrong"] {
    background: var(--destructive);
    color: white;
  }
  .key-swatch[data-role="chord"] {
    background: var(--tone-chord);
  }
  .key-swatch[data-role="scale"] {
    background: var(--tone-scale);
  }
  .key-swatch[data-role="avoid"] {
    background: color-mix(in oklch, var(--tone-avoid) 35%, #fffdf8);
    text-decoration: line-through;
    text-decoration-thickness: 2px;
  }
  .key-swatch[data-role="order"] {
    background: #fffdf8;
    box-shadow: inset 0 0 0 3px var(--warn);
  }
</style>
