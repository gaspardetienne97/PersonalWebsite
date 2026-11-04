<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc, pcOf } from "@repo/music-core";
  import { CHORD_PATTERNS, KEY_CYCLE, chordPatternLine, chordScaleTargets, cycleTranspose, goToScale } from "@repo/music-core/content/piano";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import { gradeChordScales, gradeLick, type ChordScaleResult, type LickResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions } from "$lib/music/components/InstrumentStage.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Choice from "$lib/music/components/Choice.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { Transport, benchFromUrl, sounding, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { toneLabel } from "$lib/music/drills/piano/tones";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const TEMPO = { min: 40, max: 200 };
  /** Two bars a chord then one, major changes then minor. */
  const LADDER = [
    { changes: "major", beats: 8, label: "Major, two bars a chord" },
    { changes: "major", beats: 4, label: "Major, one bar a chord" },
    { changes: "minor", beats: 8, label: "Minor, two bars a chord" },
    { changes: "minor", beats: 4, label: "Minor, one bar a chord" },
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
      return { ...t, chord, hint: sc?.hint?.replace(/\s*\(JT\d+\)/g, "") };
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
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
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
  const currentIndex = $derived(transport.beat === null ? 0 : chordIndexAt(transport.beat));
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
      : h.startsWith("Brighter than major")
        ? "Brighter than major: the 4th is raised (#11), so it never rubs against the chord's 3rd."
        : h.replace(/\s+\u2014\s+/g, ": ").replace(/\s\+\s/g, " plus ").replace(/\s*\(JT\d+\)/g, "").replace(/\s*\/\s*/g, ", ");
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
    for (let m = current.midi[0]; m <= current.midi[0] + 12; m++) {
      if (out[m]) continue;
      out[m] = { label: toneLabel(m - current.midi[0], current.chord.intervals), role: current.roles[pc(m)] };
    }
    return out;
  });

  const summaryLine = $derived<SetupClause[]>(
    pattern
      ? [
          { text: `${pattern.label} up and back on each chord`, focus: "pattern" },
          { text: `${changes === "major" ? "Major ii-V-I" : "Minor ii-V-i"} from ${key}`, focus: "key" },
          { text: keyCount === 12 ? "all 12 keys" : `${keyCount} key${keyCount > 1 ? "s" : ""}`, focus: "keys" },
        ]
      : [
          { text: `${changes === "major" ? "Major ii-V-I" : "Minor ii-V-i"} in ${key} (${targets.map((t) => t.symbol).join(" ")})`, focus: "key" },
          { text: `${perChord === 8 ? "two bars" : "one bar"} per chord`, focus: "beats" },
        ],
  );
  const setupKey = $derived(`chord-scales:${changes}:${key}:${perChord}:${bpm}${pattern ? `:${pattern.id}:${keyCount}` : ""}`);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = pattern ? `Listen: ${pattern.label} up and back on each chord, the chord in the left hand.` : "Listen: each chord in the left hand with its go-to scale on top.";
    await transport.demo(demoNotes, bpm);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    if (pattern) {
      const want = patternLine[played];
      played += 1;
      nextIndex = Math.min(played, patternLine.length - 1);
      if (mode === "practice" && want) flashes.add(e.midi, pc(e.midi) === pc(want.midi) ? "correct" : "wrong");
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
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    transport.follow(ctx.downbeat, ctx.beatMs);
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + totalBeats * ctx.beatMs + 200);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    ctxRef?.stopClock();
    transport.stop();
    cap?.stop();
    const ctx = ctxRef!;
    const ons = (cap?.notes ?? []).filter((n) => n.kind === "noteon");
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
          ? "Nothing was played over the changes. Start on the first beat after the count-in."
          : r.correct
            ? `Every chord got its scale: ${r.chords.map((c) => c.chord + c.scale).reduce((a, b) => a + b, 0)} notes inside, ${outside} outside.`
            : r.graded < targets.length
              ? `You played over ${r.graded} of ${targets.length} chords. Keep going through each change.`
              : `${outside} note${outside === 1 ? "" : "s"} fell outside the scale, most over ${worst.symbol}.`,
      metric: pct(r.score),
      metricLabel: "inside the scale",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: r.chords.map((c, i) => ({
        label: `${c.symbol}, ${targets[i].scaleLabel}`,
        value: c.chord + c.scale + c.avoid ? c.score : null,
        text: c.chord + c.scale + c.avoid ? `${c.chord} chord, ${c.scale} scale, ${c.avoid} outside` : "Nothing played",
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
        ? "No notes matched. Hear it first, then start on the first beat after the count-in."
        : r.correct
          ? mode === "check"
            ? `${pattern!.label} through every chord, from memory.`
            : `${r.matched} of ${r.total} in order. Try it in Check with the colour key hidden.`
          : `${r.matched} of ${r.total} right. It slipped over ${slip?.symbol ?? "a chord"}.`,
      metric: pct(r.score),
      metricLabel: "notes in order",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Notes in order", value: r.score, text: `${r.matched} of ${r.total}` },
        { label: `On time (within ${Math.round(Math.min(180, ctx.beatMs / 4))} ms)`, value: r.matched ? r.onTime / r.total : 0, text: `${r.onTime} of ${r.total}` },
      ],
      advance: ons.length ? await nextRun(`chord-scales.pattern.${pattern!.id}.${keyCount}`, { bpm, tempo: { min: TEMPO.min, goal: 120, max: TEMPO.max } }, r) : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(timer);
    transport.stop();
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    transport.stop();
  });
</script>

<svelte:head><title>Chord scales | Woodshed</title></svelte:head>

<DrillShell
  lesson={{ lessons: conceptCard(pattern ? "chord-scales.patterns" : changes === "major" ? "chord-scales.why" : "chord-scales.minor"), trigger: "check" }}
  title="Chord scales"
  hue="piano"
  blurb="As the ii-V-I moves, play the go-to scale for the chord you're on, every note judged against that chord's scale; or play 1-2-3-5 or 3-5-7-9 on each chord through the keys."
  summary={summaryLine}
  tabs={[
    { id: "major", label: "Major ii-V-I" },
    { id: "minor", label: "Minor ii-V-i" },
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
>
  {#snippet setup()}
    <div class="mb-4">
      <Choice
        label="Play"
        setupKey="pattern"
        options={[{ value: "", label: "The scales" }, ...CHORD_PATTERNS.map((p) => ({ value: p.id as string, label: `${p.label} pattern` }))]}
        value={pattern?.id ?? ""}
        onchange={(v) => cfg.set({ pattern: v })}
      />
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">{pattern ? "Start key" : "Key"}</span>
        <KeyPicker label="Key" value={pcOf(key)!} name={(p) => KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C"} onchange={(p) => cfg.set({ key: KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C" })} />
      </div>
      {#if pattern}
        <Choice
          label="Keys"
          setupKey="keys"
          options={[
            { value: 1, label: "One" },
            { value: 3, label: "Three" },
            { value: 12, label: "All 12" },
          ]}
          value={keyCount}
          onchange={(v) => cfg.set({ keys: v })}
        />
      {:else}
        <Choice
          label="Each chord lasts"
          setupKey="beats"
          options={[
            { value: 4, label: "One bar" },
            { value: 8, label: "Two bars" },
          ]}
          value={perChord}
          onchange={(v) => cfg.set({ beats: v })}
        />
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <Stat label="Chord" value="{currentIndex + 1} of {targets.length}" />
      <Stat label="Beat" value="{Math.min(perChord, Math.floor(Math.max(0, transport.beat) % perChord) + 1)} of {perChord}" />
    {:else if patternResult}
      <Stat label="Notes in order" value={pct(patternResult.score)} tone={patternResult.correct ? "success" : "warn"} />
    {:else if result}
      <Stat label="Chords played" value="{result.graded}/{targets.length}" />
      <Stat label="Inside" value={pct(result.score)} tone={result.score >= 0.9 ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <ol class="mb-3 grid grid-cols-3 gap-2" aria-label="Chord chart">
      {#each targets.slice(chartFrom, chartFrom + 3) as t, j (t.symbol)}
        {@const i = chartFrom + j}
        {@const now = (phase === "running" || transport.playing) && i === currentIndex}
        {@const done = result?.chords[i]}
        <li class="min-w-0 rounded-lg border px-2 py-2 sm:px-3 {now ? 'border-instr bg-instr/20' : 'border-ws-stage-ink/15'}" aria-current={now ? "step" : undefined}>
          <p class="font-display text-xl font-semibold sm:text-2xl">{t.symbol}</p>
          {#if mode === "practice" || phase === "results"}
            <p class="truncate text-sm text-ws-stage-soft">{t.scaleLabel}</p>
          {/if}
          {#if done}<p class="text-xs text-ws-stage-soft">{done.avoid ? `✕ ${done.avoid} outside` : done.chord + done.scale ? "✓ all inside" : "not played"}</p>{/if}
        </li>
      {/each}
    </ol>
    {#if mode === "practice" && current}
      <p class="mb-3 text-sm text-ws-stage-soft">
        <span class="font-semibold text-ws-stage-ink">{current.symbol}: {current.scaleLabel}.</span>
        {plainHint(current.hint)}{current.others.length ? ` These also count as inside: ${current.others.join(", ")}.` : ""}
      </p>
    {:else if mode === "check" && phase !== "results"}
      <p class="mb-3 text-sm text-ws-stage-soft">Check mode: the scale names and the colour key are hidden. {pattern ? `Play ${pattern.label} up and back on each chord.` : "Play what fits each chord."}</p>
    {/if}
    {#if mode === "practice" || transport.playing || phase === "results"}
      <div class="mb-3"><LineNotation notes={written} tuning={fretTuning(inst)} title={setupKey} cursorBeat={transport.beat} keyFifths={signatureFor(pcOf(key) ?? 0, changes === "major" ? "major" : "natural-minor")} /></div>
    {/if}
    <InstrumentStage line={current ? [...current.midi, current.midi[0] + 12] : stageLine} {low} {high} {marks} {flashes} fit />
    <!-- The colour key goes with the colours on the keys: Check (and the results) hide both. -->
    {#if transport.playing || (mode === "practice" && phase !== "results")}
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-stage-soft" aria-label="Colour key">
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="chord" aria-hidden="true">3</span>Chord tone (filled, named R 3 5 7)</li>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="scale" aria-hidden="true">9</span>Scale tone (filled, named as a tension)</li>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="avoid" aria-hidden="true">b9</span>Outside the scale (dashed ring)</li>
    </ul>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>

<style>
  .key-swatch {
    min-width: 1.5rem;
    height: 1.35rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: #17120c;
  }
  .key-swatch[data-role="chord"] {
    background: var(--tone-chord);
  }
  .key-swatch[data-role="scale"] {
    background: var(--tone-scale);
  }
  .key-swatch[data-role="avoid"] {
    border: 2px dashed var(--tone-avoid);
    color: var(--ws-stage-ink);
  }
</style>
