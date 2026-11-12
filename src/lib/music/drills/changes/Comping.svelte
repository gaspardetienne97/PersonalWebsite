<script lang="ts">
  import { CHANGES_TITLE, changesTrainer, shortStage } from "./modes";
  import { TimedRun } from "./timed-run";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { COMPING_PATTERNS } from "@repo/music-core/content/piano";
  import { conceptCard } from "@repo/music-core/lessons/cards";
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
  import Results, { silentRun, type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import BeatLane, { type LaneRow } from "$lib/music/drills/piano/BeatLane.svelte";
  import { laneOutcomes, verdictOf, type LaneOutcome } from "$lib/music/drills/piano/lane-outcomes";
  import { timingBreakdown, timingRow } from "@repo/music-core";
  import Verdict, { type VerdictKind } from "$lib/music/components/Verdict.svelte";
  import StaffFold from "$lib/music/notation/StaffFold.svelte";
  import { FINGERING_NOTE, Transport, benchFromUrl, sounding, spanOf, swingBeat, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, pct, runInstrument, runSource } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { midi, settings } from "$lib/music/runtime";
  import { goto } from "$app/navigation";
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
  const tight = $derived(spanOf(notes.map((n) => n.midi), 0, false));
  const root = $derived(parseChordSymbol(p.chord)!);
  // A dominant's line sits in its mixolydian (C7 in F major's signature), so the 7th reads as a flat.
  const keyFifths = $derived(signatureFor(root.rootPc, "mixolydian"));
  const approach = JAZZ.IMPROV_TECHNIQUES.find((t) => t.id === "half-step-below");

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<(CompingResult & { lhMeasured: boolean }) | null>(null);
  const transport = new Transport();
  const timedRun = new TimedRun(transport);
  const flashes = new Flashes();
  let run: ReturnType<typeof practice.beginRun> | null = null;
  /** Note-ons this run in beats from the downbeat, and whether every one came over MIDI (a struck shell needs it). */
  let heard = $state<{ midi: number; beat: number }[]>([]);
  let allMidi = $state(true);
  let clock0 = { downbeat: 0, beatMs: 500 };
  let verdict = $state<{ kind: VerdictKind; text?: string; key: number } | null>(null);
  /** Wrong keys struck so far in Practice: the lane counts them, so the tally and the word agree. */
  let liveWrong = $state(0);
  /** After a run: each lane note's error in ms from the grader's own claims (null missed), so the lane, the breakdown and the score agree. */
  let graded = $state<{ right: (number | null)[]; left?: (number | null)[]; onTimeMs: number } | null>(null);

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
        // The shell named by its chord: "C+Bb" would be cut short in a narrow cell.
        .map((n) => ({ beat: n.beat, dur: n.dur, text: p.chord })),
    },
  ]);

  // The lane's targets on the written (straight) beat: the grader lets a swung off-beat land anywhere from
  // straight to swung at no cost, and the lane judges with the same slack.
  const laneTargets = $derived({
    right: p.lick.map((n) => ({ midi: n.midiNote, beat: n.startBeat, dur: Math.min(0.5, n.durationBeats) })),
    left: Array.from({ length: p.bars }, (_, bar) => p.compRhythm.map((hit) => ({ midi: lhMidi[0], beat: bar * BEATS_PER_BAR + hit.beat, dur: Math.min(0.5, hit.durationBeats) }))).flat(),
  });
  const slack = (b: number) => (swing ? swingBeat(b) - b : 0);
  const outcomeOf = (e: number | null, onTimeMs: number): LaneOutcome => (e === null ? "miss" : e < -onTimeMs ? "early" : e > onTimeMs ? "late" : "ok");
  // Each note marked on the lane as it lands: live in Practice, after the run in both modes. The left hand
  // only when it can be measured (MIDI); on-screen keys can't strike a shell.
  const outcomes = $derived.by((): Record<string, (LaneOutcome | undefined)[]> => {
    if (phase === "results") {
      if (!graded) return {};
      const out: Record<string, LaneOutcome[]> = { right: graded.right.map((e) => outcomeOf(e, graded!.onTimeMs)) };
      if (graded.left) out.left = graded.left.map((e) => outcomeOf(e, graded!.onTimeMs));
      return out;
    }
    if (!(phase === "running" && mode === "practice")) return {};
    const now = transport.beat ?? 0;
    const right = laneOutcomes(laneTargets.right, heard, now, { slack });
    if (!allMidi) return { right };
    // The left hand's shell counts in any octave, as the grader takes it; the line is octave-exact, as graded.
    return { right, left: laneOutcomes(laneTargets.left, heard, now, { slack, pitchClass: true }) };
  });

  /** Beside Stop on a phone: what lands now ("Bar 1: Eb, and the C7 shell"); Check names the bar only. */
  const cue = $derived.by(() => {
    if (phase !== "running" || transport.beat === null || transport.beat < 0) return "";
    const bar = Math.min(p.bars, Math.floor(transport.beat / BEATS_PER_BAR) + 1);
    if (mode !== "practice") return `Bar ${bar} of ${p.bars}: from memory`;
    const now = due(transport.beat);
    const line = [...new Set(now.filter((n) => n.hand === "right").map((n) => noteName(n.midi, "flat", false)))];
    const shell = now.some((n) => n.hand === "left");
    return `Bar ${bar}: ${[...line, ...(shell ? [`the ${p.chord} shell`] : [])].join(", and ") || "rest"}`;
  });

  const summaryLine = $derived<SetupClause[]>([
    { text: p.label, focus: "pattern" },
    { text: `${s.lh === "guide" ? "Guide tones (3rd and 7th)" : "Shell (root and 7th)"} in the left hand`, focus: "lh" },
    { text: `${swing ? "Swung" : "Straight"} eighths`, focus: "feel" },
  ]);
  const setupKey = $derived(`comping:${p.id}:${s.lh}:${s.feel}:${bpm}`);

  async function playDemo(speed = 1) {
    if (transport.playing) return transport.stop();
    status = speed < 1 ? "Listen: slowly, both hands. The lane shows what lands together." : "Listen: both hands at tempo. The lane shows what lands together.";
    await transport.demo(notes, bpm, speed);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const beat = (e.at - clock0.downbeat) / clock0.beatMs;
    heard = [...heard, { midi: e.midi, beat }];
    if (e.source !== "midi") allMidi = false;
    if (mode !== "practice") return;
    // The note judged as the lane will mark it: the written beat, with the swing slack.
    const want = [...laneTargets.right, ...laneTargets.left].find((t) => t.midi === e.midi && beat > t.beat - t.dur / 2 && beat < t.beat + slack(t.beat) + t.dur / 2);
    flashes.add(e.midi, want ? "correct" : "wrong");
    if (!want) liveWrong++;
    const err = want ? (beat < want.beat ? beat - want.beat : Math.max(0, beat - want.beat - slack(want.beat))) : 0;
    const v = want
      ? verdictOf(Math.abs(err) <= want.dur / 4 ? "ok" : err < 0 ? "early" : "late", err * clock0.beatMs)
      : { kind: "wrong" as const, text: `Wrong note: ${noteName(e.midi, "flat")}` };
    verdict = { ...v, key: (verdict?.key ?? 0) + 1 };
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    graded = null;
    flashes.clear();
    heard = [];
    allMidi = true;
    verdict = null;
    liveWrong = 0;
    clock0 = { downbeat: ctx.downbeat, beatMs: ctx.beatMs };
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
    timedRun.begin(ctx, totalBeats + 1, onNote, () => void finish(ctx));
  }

  async function finish(ctx: RunContext) {
    if (phase !== "running" && phase !== "countin") return;
    const played = timedRun.end(true);
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
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    // One source: the lane marks, the breakdown and the Timing row all come from the grader's claims.
    const timed = r.metrics.flatMap((m) => (m.kind === "timing" ? [m] : []));
    const errsFor = (ts: readonly { beat: number }[], ms: typeof timed) => ts.map((t) => ms.find((m) => Math.abs(m.expectedMs - (ctx.downbeat + t.beat * ctx.beatMs)) < 1)?.errorMs ?? null);
    graded = {
      right: errsFor(laneTargets.right, timed.slice(0, r.lick.matched)),
      ...(lhMeasured ? { left: errsFor(laneTargets.left, timed.slice(r.lick.matched)) } : {}),
      onTimeMs: r.windowMs / 2,
    };
    const errs = timed.map((m) => m.errorMs);
    const total = r.lick.total + r.comp.total;
    const rows: ResultRow[] = [
      { label: "Right hand line", value: r.lick.matched / r.lick.total, text: `${r.lick.matched} of ${r.lick.total}` },
      lhMeasured
        ? {
            label: "Left hand Charleston",
            value: r.comp.total ? r.comp.matched / r.comp.total : 0,
            text: `${r.comp.matched} of ${r.comp.total}${r.comp.extra ? `, ${r.comp.extra} extra` : ""}`,
          }
        : { label: "Left hand Charleston (on-screen input)", notMeasured: true },
      timingRow(errs, total, r.windowMs, "Timing", r.windowMs / 2),
      ...(r.lick.extra ? [{ label: "Wrong keys in the line", text: String(r.lick.extra) }] : []),
    ];
    const idx = COMPING_PATTERNS.findIndex((x) => x.id === p.id);
    const nextPattern = COMPING_PATTERNS[idx + 1];
    summary = {
      headline: !played.length
        ? "Nothing landed. Come in on the first beat after the count-in."
        : r.correct
          ? `The line and the Charleston both landed at ${bpm} BPM.`
          : r.lick.extra && r.lick.matched === r.lick.total && r.comp.matched === r.comp.total && !r.comp.extra && !r.comp.incomplete
            ? `Every note landed, but ${r.lick.extra} wrong key${r.lick.extra > 1 ? "s" : ""} slipped into the line. Once more without ${r.lick.extra > 1 ? "them" : "it"}.`
          : r.comp.extra
            ? `The left hand added ${r.comp.extra} extra hit${r.comp.extra > 1 ? "s" : ""}. Charleston is one and the and-of-two, nothing else.`
            : r.comp.incomplete
              ? `${r.comp.incomplete} left-hand hit${r.comp.incomplete > 1 ? "s were" : " was"} missing a note. Strike both notes as one.`
              : r.lick.matched < r.lick.total && lhMeasured && r.comp.matched < r.comp.total
                ? `Right hand ${r.lick.matched} of ${r.lick.total}, left hand ${r.comp.matched} of ${r.comp.total}. Slow it down, or try each hand alone first.`
                : r.lick.matched < r.lick.total
                  ? `Right hand ${r.lick.matched} of ${r.lick.total}. Slow it down and let the last note sit.`
                  : `Left hand ${r.comp.matched} of ${r.comp.total}. Keep the hits on one and the and-of-two.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      rows,
      cleanMeans: "the line and every shell hit on the beat",
      timing: timingBreakdown([...graded.right, ...(graded.left ?? [])], graded.onTimeMs),
      next:
        r.correct && mode === "check" && nextPattern
          ? { label: nextPattern.label, href: `/music/changes/comping?pattern=${nextPattern.id}&bpm=${bpm}`, reason: "the same lick transposed" }
          : undefined,
      advance: played.some((n) => n.kind === "noteon")
        ? await nextRun(`comping.${p.id}.${s.feel}`, { bpm, tempo: { min: TEMPO.min, goal: 120, max: TEMPO.max }, steps: LH_STEPS, step: s.lh === "guide" ? 1 : 0 }, r, tempoAnd((i) => cfg.set({ lh: LH_STEPS[i].id })))
        : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    timedRun.end();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    timedRun.end();
  });
</script>

<DrillShell
  lesson={{ lessons: conceptCard("comping.charleston"), trigger: "check" }}
  title={CHANGES_TITLE}
  trainer={changesTrainer("comping")}
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
  {cue}
  requires={midi.inputs.length ? [] : [{ text: "left hand on MIDI", action: { label: "Connect a MIDI keyboard (on-screen keys play one note at a time, so they grade the right-hand line only)", run: () => goto("/music/connect") } }]}
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
      <!-- The HUD's own readout counts the beats; this counts the bars. -->
      <Stat label="Bar" value="{Math.min(totalBeats / BEATS_PER_BAR, Math.floor(Math.max(0, transport.beat) / BEATS_PER_BAR) + 1)} of {totalBeats / BEATS_PER_BAR}" />
    {/if}
  {/snippet}

  {#snippet stage()}
    <!-- While the line runs on a phone the lane names the chord, so this row leaves and the keys keep the room. -->
    <div class="mb-2 flex flex-wrap items-start justify-between gap-3 text-sm {phase === 'running' || phase === 'countin' ? 'max-sm:hidden' : ''}">
      <div class="min-w-0 max-w-prose">
        <p class="font-display text-2xl font-semibold">{p.chord}</p>
        <!-- The theory steps aside while the line runs, so the lane and the keys stay in view. -->
        {#if mode === "practice" && phase === "ready" && !transport.playing}
          <p class="text-ws-stage-soft">
            Slide from the {noteName(p.lick[6].midiNote, "flat", false)} into the {noteName(p.lick[7].midiNote, "flat", false)}: the blue third, a minor third over a dominant chord, resolving up to the major third.
            The rest of the line stays in {root.rootName} mixolydian.
          </p>
          <!-- The two things to open sit on one row, so the lane and the keys keep the room. -->
          <div class="flex flex-wrap items-start gap-x-6 text-ws-stage-soft">
            {#if approach}
              <details class="min-w-0">
                <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center font-medium text-ws-stage-ink [&::-webkit-details-marker]:hidden">Why it works: approach a note from a half step below</summary>
                <p>{approach.summary}</p>
              </details>
            {/if}
            {@render marked()}
          </div>
        {/if}
      </div>
      {#if phase === "ready" && mode === "practice" && !transport.playing}
        <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => playDemo(0.6)}>Hear it at 60%</button>
      {/if}
    </div>
    <!-- The music grows into the free height (no spacer between the lane and the keys). -->
    <div class="flex min-h-0 flex-col gap-3" data-dock="music">
    {#if mode === "practice" || transport.playing || phase === "results"}
      <StaffFold live={phase === "running" || phase === "countin" || transport.playing} fold={shortStage.current}><LineNotation maxZoom={1.1} notes={written} title={setupKey} cursorBeat={transport.beat} {keyFifths} /></StaffFold>
    {/if}
    <BeatLane
      rows={lanes}
      beats={totalBeats}
      beat={transport.beat}
      chords={[{ beat: 0, symbol: p.chord }]}
      hidden={mode === "check" && !transport.playing}
      label="Beat lane: right hand lick of {p.lick.length} notes; left hand shell on one and the and-of-two in each bar."
      {outcomes}
      wrong={phase === "running" && mode === "practice" ? liveWrong : 0}
    />
    </div>
    <div class="flex flex-col" data-dock="instrument">
      <!-- The word for the last note has its own row between the lane and the keys, never over them. -->
      {#if phase === "running"}<Verdict kind={verdict?.kind} text={verdict?.text} key={verdict?.key ?? 0} rail />{/if}
      <Piano low={span.low} high={span.high} fit={tight} {marks} {flashes} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand keys marked L, right hand R." />
    </div>
    <div class="mt-3 text-sm text-ws-stage-soft">
      {#if mode === "check" && (phase === "running" || phase === "countin")}
        <p>Notes hidden. Keep the rhythm on the lane; keys light only where you play.</p>
      {:else if phase === "running" || phase === "countin"}
        <!-- A phone has the cue beside Stop; this line would only sit under the dock. -->
        <p class="max-sm:hidden">Shell on one and the and-of-two; the line on top.</p>
      {:else}
        {#if mode === "check" && phase !== "results"}<p class="mb-1">Check: the lane keeps the rhythm, the notes are hidden.</p>{/if}
        {#if !(mode === "practice" && phase === "ready" && !transport.playing)}{@render marked()}{/if}
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} {figure} />
    {/if}
  {/snippet}
</DrillShell>

{#snippet marked()}
  <details class="min-w-0">
    <summary class="flex min-h-11 cursor-pointer items-center">How this is marked</summary>
    <div class="flex flex-col gap-1 pb-1">
      <p>{FINGERING_NOTE}</p>
    </div>
  </details>
{/snippet}

<!-- The run as the grader claimed it, note by note on the lane, under the breakdown. -->
{#snippet figure()}
  {#if graded}
    <div class="stage rounded-2xl p-3">
      <p class="mb-2 text-sm font-medium text-ws-stage-soft">Each note as it landed</p>
      <BeatLane rows={lanes} beats={totalBeats} chords={[{ beat: 0, symbol: p.chord }]} label="Your run on the beat lane, each note marked on time, early, late or missed." {outcomes} wrong={result?.lick.extra ?? 0} />
    </div>
  {/if}
{/snippet}
