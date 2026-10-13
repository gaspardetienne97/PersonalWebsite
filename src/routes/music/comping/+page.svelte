<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { COMPING_PATTERNS } from "@repo/music-core/content/piano";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { JAZZ } from "@repo/music-core/data/index";
  import { gradeComping, type CompingResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import BeatLane, { type LaneRow } from "$lib/music/drills/piano/BeatLane.svelte";
  import { FINGERING_NOTE, Transport, benchFromUrl, sounding, spanOf, swingBeat, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const TEMPO = { min: 60, max: 140 };
  const LH_STEPS = [
    { id: "shell", label: "Shell, root and 7th" },
    { id: "guide", label: "Guide tones, 3rd and 7th" },
  ];
  const BEATS_PER_BAR = 4;

  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("comping", {
    pattern: "blue-third-c7" as string,
    lh: "shell" as string,
    feel: "swing" as string,
  });
  const s = $derived(cfg.value);
  const p = $derived(COMPING_PATTERNS.find((x) => x.id === s.pattern) ?? COMPING_PATTERNS[0]);
  const swing = $derived(s.feel === "swing");
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const totalBeats = $derived(p.bars * BEATS_PER_BAR);
  // Shell = root + 7th (the data); guide tones = 3rd + 7th, the rootless variation from curriculum P3.
  const lhMidi = $derived(s.lh === "guide" ? [p.shellMidi[0] + 4, p.shellMidi[1]] : p.shellMidi);
  // Curriculum P3: LH 5 on the root, 2 on the 7th. The guide-tone grip has no authored fingering.
  const lhFingers = $derived(s.lh === "guide" ? [undefined, undefined] : [5, 2]);
  const feel = (b: number) => (swing ? swingBeat(b) : b);

  const notes = $derived<TimedNote[]>([
    ...p.lick.map((n) => ({ midi: n.midiNote, beat: feel(n.startBeat), dur: n.durationBeats, hand: "right" as const, finger: n.finger, velocity: 0.85 })),
    ...Array.from({ length: p.bars }, (_, bar) =>
      p.compRhythm.flatMap((hit) =>
        lhMidi.map((midi, k) => ({ midi, beat: feel(bar * BEATS_PER_BAR + hit.beat), dur: hit.durationBeats, hand: "left" as const, finger: lhFingers[k], velocity: 0.6 })),
      ),
    ).flat(),
  ]);
  // Written straight, the way swing is written; the swing is in the playing.
  const written = $derived([
    ...p.lick.map((n) => ({ midi: n.midiNote, startBeat: n.startBeat, durationBeats: n.durationBeats, hand: "right" as const })),
    ...Array.from({ length: p.bars }, (_, bar) => p.compRhythm.flatMap((hit) => lhMidi.map((midi) => ({ midi, startBeat: bar * BEATS_PER_BAR + hit.beat, durationBeats: hit.durationBeats, hand: "left" as const })))).flat(),
  ]);
  const span = $derived(spanOf(notes.map((n) => n.midi)));
  const root = $derived(parseChordSymbol(p.chord)!);
  // A dominant's line sits in its mixolydian (C7 in F major's signature), so the 7th reads as a flat.
  const keyFifths = $derived(signatureFor(root.rootPc, "mixolydian"));
  const approach = JAZZ.IMPROV_TECHNIQUES.find((t) => t.id === "half-step-below");

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<(CompingResult & { lhMeasured: boolean }) | null>(null);
  const transport = new Transport();
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopClock: (() => void) | null = null;

  const markFor = (n: TimedNote, demo: boolean): CellMarks => ({
    [demo ? "demo" : "target"]: true,
    label: `${n.hand === "left" ? "L" : "R"}${n.finger ?? ""}`,
    role: n.hand,
  });
  const due = (b: number) => notes.filter((n) => b >= n.beat - 0.25 && b < n.beat + Math.min(0.5, n.dur));
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(notes, transport.beat)) out[n.midi] = markFor(n, true);
      return out;
    }
    if (mode !== "practice" || phase === "results") return out;
    const live = phase === "running" || phase === "countin";
    for (const n of live ? due(Math.max(0, transport.beat ?? 0)) : notes.filter((x) => x.beat === 0)) out[n.midi] = markFor(n, false);
    return out;
  });

  const lanes = $derived<LaneRow[]>([
    {
      id: "right",
      mark: "R",
      label: "Right hand, the lick",
      hand: "right",
      notes: notes.filter((n) => n.hand === "right").map((n) => ({ beat: n.beat, dur: n.dur, text: noteName(n.midi, "flat", false) })),
    },
    {
      id: "left",
      mark: "L",
      label: "Left hand, Charleston",
      hand: "left",
      notes: notes
        .filter((n) => n.hand === "left" && n.midi === lhMidi[0])
        .map((n) => ({ beat: n.beat, dur: n.dur, text: lhMidi.map((m) => noteName(m, "flat", false)).join("+") })),
    },
  ]);

  const summaryLine = $derived<SetupClause[]>([
    { text: p.label, focus: "pattern" },
    { text: `${s.lh === "guide" ? "guide tones (3rd and 7th)" : "shell (root and 7th)"} in the left hand`, focus: "lh" },
    { text: `${swing ? "swung" : "straight"} eighths`, focus: "feel" },
  ]);
  const setupKey = $derived(`comping:${p.id}:${s.lh}:${s.feel}:${bpm}`);

  async function playDemo(speed = 1) {
    if (transport.playing) return transport.stop();
    status = speed < 1 ? "Listen: slowly, both hands. The lane shows what lands together." : "Listen: both hands at tempo. The lane shows what lands together.";
    await transport.demo(notes, bpm, speed);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running" || mode !== "practice") return;
    flashes.add(e.midi, due(transport.beat ?? 0).some((n) => n.midi === e.midi) ? "correct" : "wrong");
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    flashes.clear();
    stopClock = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: "comping",
      setupKey,
      skillIds: ["technique.piano.comping"],
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, 0.6 + (bpm - 84) / 200),
      instrument: "piano",
      params: { bpm, pattern: p.id, lh: s.lh, feel: s.feel },
    });
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    transport.follow(ctx.downbeat, ctx.beatMs);
    timer = setTimeout(() => void finish(ctx), Math.max(0, ctx.downbeat - performance.now()) + (totalBeats + 1) * ctx.beatMs);
  }

  async function finish(ctx: RunContext) {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClock?.();
    transport.stop();
    cap?.stop();
    const played = cap?.notes ?? [];
    // On-screen keys play one note at a time, so a struck shell can't be seen: grade the line only.
    const lhMeasured = played.length > 0 && played.every((n) => n.source === "midi");
    const r = gradeComping({
      lick: p.lick.map((n) => ({ midi: n.midiNote, startBeat: n.startBeat })),
      compRhythm: lhMeasured ? p.compRhythm : [],
      bars: p.bars,
      beatsPerBar: BEATS_PER_BAR,
      swing,
      beatMs: ctx.beatMs,
      startAt: ctx.downbeat,
      strictness: "normal",
      shellMidi: lhMidi,
      notes: lhMeasured ? played : played.filter((n) => n.midi >= Math.min(...p.lick.map((l) => l.midiNote))),
    });
    result = { ...r, lhMeasured };
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(played),
      instrument: runInstrument(played, "piano") ?? null,
      target: notes.map((n) => n.midi),
      response: played.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} at ${bpm} BPM` });
    const rows: ResultRow[] = [
      { label: "Right hand line", value: r.lick.matched / r.lick.total, text: `${r.lick.matched} of ${r.lick.total}` },
      lhMeasured
        ? {
            label: "Left hand Charleston",
            value: r.comp.total ? r.comp.matched / r.comp.total : 0,
            text: `${r.comp.matched} of ${r.comp.total}${r.comp.extra ? `, ${r.comp.extra} extra` : ""}`,
          }
        : { label: "Left hand Charleston (on-screen input)", notMeasured: true },
      { label: "Timing", value: r.meanAbsErrorMs ? Math.max(0, 1 - r.meanAbsErrorMs / r.windowMs) : null, text: `${Math.round(r.meanAbsErrorMs)} ms off on average` },
    ];
    const idx = COMPING_PATTERNS.findIndex((x) => x.id === p.id);
    const nextPattern = COMPING_PATTERNS[idx + 1];
    summary = {
      headline: !played.length
        ? "Nothing landed. Come in on the first beat after the count-in."
        : r.correct
          ? `The line and the Charleston both landed at ${bpm} BPM.`
          : r.comp.extra
            ? `The left hand added ${r.comp.extra} extra hit${r.comp.extra > 1 ? "s" : ""}. Charleston is one and the and-of-two, nothing else.`
            : r.comp.incomplete
              ? `${r.comp.incomplete} left-hand hit${r.comp.incomplete > 1 ? "s were" : " was"} missing a note. Strike both notes as one.`
              : r.lick.matched < r.lick.total
                ? `${r.lick.matched} of ${r.lick.total} right-hand notes landed. Slow it down and let the last note sit.`
                : `${r.comp.matched} of ${r.comp.total} left-hand hits landed. Keep them on one and the and-of-two.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: lhMeasured ? assistanceText(mode) : `${assistanceText(mode)} The left hand needs MIDI; this run graded the right-hand line only.`,
      rows,
      next:
        r.correct && mode === "check" && nextPattern
          ? { label: nextPattern.label, href: `/music/comping?pattern=${nextPattern.id}&bpm=${bpm}`, reason: "the same lick transposed" }
          : undefined,
      advance: played.some((n) => n.kind === "noteon")
        ? await nextRun(`comping.${p.id}.${s.feel}`, { bpm, tempo: { min: TEMPO.min, goal: 120, max: TEMPO.max }, steps: LH_STEPS, step: s.lh === "guide" ? 1 : 0 }, r, tempoAnd((i) => cfg.set({ lh: LH_STEPS[i].id })))
        : undefined,
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

  function retempo(delta: number) {
    void settings.update({ bpm: Math.min(TEMPO.max, Math.max(TEMPO.min, bpm + delta)) });
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    transport.stop();
  });
</script>

<svelte:head><title>Comping | Woodshed</title></svelte:head>

<DrillShell
  title="Comping"
  hue="piano"
  blurb="A blues line in the right hand over a Charleston shell in the left: one, and-of-two, nothing else."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={transport.beat === null ? 0 : Math.min(1, Math.max(0, transport.beat / totalBeats))}
  clock={{ bpm, beatsPerBar: BEATS_PER_BAR }}
  ondemo={() => playDemo(1)}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-3">
      <Choice label="Key" setupKey="pattern" options={COMPING_PATTERNS.map((x) => ({ value: x.id, label: parseChordSymbol(x.chord)!.rootName, detail: x.chord }))} value={p.id} onchange={(v) => cfg.set({ pattern: v })} />
      <Choice
        label="Left hand"
        setupKey="lh"
        options={LH_STEPS.map((x) => ({ value: x.id, label: x.label }))}
        value={s.lh}
        onchange={(v) => cfg.set({ lh: v })}
      />
      <Choice
        label="Eighths"
        setupKey="feel"
        options={[
          { value: "swing", label: "Swung" },
          { value: "straight", label: "Straight" },
        ]}
        value={s.feel}
        onchange={(v) => cfg.set({ feel: v })}
      />
    </div>
    <p class="mt-3 text-sm text-ws-soft">Tempo comes from the practice strip; this lick sits well from 76 to 104 BPM.</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <Stat label="Beat" value="{Math.min(totalBeats, Math.floor(Math.max(0, transport.beat)) + 1)} of {totalBeats}" />
    {:else if result}
      <Stat label="Line" value="{result.lick.matched}/{result.lick.total}" tone={result.lick.matched === result.lick.total ? "success" : "warn"} />
      {#if result.lhMeasured}<Stat label="Comp hits" value="{result.comp.matched}/{result.comp.total}" tone={result.comp.matched === result.comp.total && !result.comp.extra ? "success" : "warn"} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3 text-sm">
      <div class="min-w-0 max-w-prose">
        <p class="font-display text-2xl font-semibold">{p.chord}</p>
        {#if mode === "practice"}
          <p class="text-ws-stage-soft">
            Slide from the {noteName(p.lick[6].midiNote, "flat", false)} into the {noteName(p.lick[7].midiNote, "flat", false)}: the blue third, a minor third over a dominant chord, resolving up to the major third.
            The rest of the line stays in {root.rootName} mixolydian.
          </p>
          {#if approach}<p class="mt-1 text-ws-stage-soft"><span class="font-semibold text-ws-stage-ink">{approach.name}.</span> {approach.summary}</p>{/if}
        {/if}
      </div>
      {#if phase !== "running" && phase !== "countin" && mode === "practice"}
        <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => playDemo(0.6)}>Hear it at 60%</button>
      {/if}
    </div>
    {#if mode === "practice" || transport.playing || phase === "results"}
      <div class="mb-3"><LineNotation notes={written} title={setupKey} cursorBeat={transport.beat} {keyFifths} /></div>
    {/if}
    <BeatLane
      rows={lanes}
      beats={totalBeats}
      beat={transport.beat}
      chords={[{ beat: 0, symbol: p.chord }]}
      hidden={mode === "check" && !transport.playing}
      label="Beat lane: right hand lick of {p.lick.length} notes; left hand shell on one and the and-of-two in each bar."
    />
    <Piano low={span.low} high={span.high} {marks} {flashes} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand keys marked L, right hand R." />
    <div class="mt-3 flex flex-col gap-1 text-sm text-ws-stage-soft">
      {#if mode === "check" && phase !== "results"}<p>Check mode: the lane keeps the rhythm, the notes are hidden.</p>{/if}
      <p>{FINGERING_NOTE}</p>
      <p>Together is not measured on on-screen keys: they play one note at a time, so an on-screen run grades the right-hand line and reads the left hand as not measured.</p>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => retempo(6)}>Faster by 6</button>
          <button type="button" class={btn} onclick={() => retempo(-6)}>Slower</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>
