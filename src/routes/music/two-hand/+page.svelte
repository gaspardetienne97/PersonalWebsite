<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import type { HandMode, TwoHandPatternId } from "@repo/music-core/data/index";
  import { TWO_HAND_MODES, TWO_HAND_PATTERNS, TWO_HAND_TONICS, twoHandPattern, twoHandSkills } from "@repo/music-core/content/piano";
  import { gradeTwoHand, type TwoHandResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Choice from "$lib/music/components/Choice.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import BeatLane, { type LaneRow } from "$lib/music/drills/piano/BeatLane.svelte";
  import { FINGERING_NOTE, Transport, toWritten, benchFromUrl, sounding, spanOf, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const TEMPO = { min: 50, max: 140 };
  const BARS = 2;
  const ABOUT = (tonicName: string): Record<TwoHandPatternId, string> => ({
    "lh-pulse-rh-line": "Left hand holds the root on every beat while the right hand runs eighths up and down the scale.",
    "rh-pulse-lh-line": "Roles swapped: the right hand keeps the pulse, the left hand runs the eighth-note line.",
    "lh-shell-rh-line": "Left hand walks root, fifth, seventh, fifth; the right hand plays an eighth-note fragment over it.",
    "alberti-rh-holds": "Left hand plays an Alberti figure in eighths; the right hand holds one note per beat.",
    "contrary-motion-scale": "Both hands run the scale in eighths, moving in opposite directions.",
    "contrary-five": `Both thumbs on ${tonicName}, an octave apart. Walk outward, then back, same finger in both hands on every beat.`,
  });

  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("two-hand", {
    pattern: "lh-pulse-rh-line" as string,
    tonic: "C4",
    hand: "both" as string,
    dynamics: false as boolean,
  });
  const s = $derived(cfg.value);
  const pattern = $derived((TWO_HAND_PATTERNS.some((p) => p.id === s.pattern) ? s.pattern : "lh-pulse-rh-line") as TwoHandPatternId);
  const tonic = $derived(TWO_HAND_TONICS.find((t) => t.name === s.tonic)?.midi ?? 60);
  const hand = $derived((["both", "left", "right"].includes(s.hand) ? s.hand : "both") as HandMode);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const rendering = $derived(twoHandPattern({ pattern, tonic, bars: BARS, handMode: hand }));
  const mirror = $derived(rendering.measuresTogether);
  /** Mirror hands is the easiest pattern, contrary motion the hardest. */
  const level = (p: TwoHandPatternId) => (p === "contrary-five" ? 0.3 : p === "contrary-motion-scale" ? 0.6 : 0.45);
  const LADDER = [...TWO_HAND_PATTERNS].sort((a, b) => level(a.id) - level(b.id));
  const measuresTogether = $derived(mirror && hand === "both");

  // One note per hand event; its length is that hand's own spacing (a beat or an eighth).
  const notes = $derived.by((): TimedNote[] => {
    const evs = rendering.targetEvents;
    const spacing = (h: "left" | "right") => {
      const beats = [...new Set(evs.filter((e) => e.hand === h).map((e) => e.beat))].sort((a, b) => a - b);
      return beats.length > 1 ? beats[1] - beats[0] : 1;
    };
    const sp = { left: spacing("left"), right: spacing("right") };
    const loud = s.dynamics ? { melody: 0.9, other: 0.45 } : { melody: 0.75, other: 0.75 };
    return evs.map((e) => ({
      midi: e.midiNote,
      beat: e.beat,
      dur: sp[e.hand],
      hand: e.hand,
      finger: e.finger,
      velocity: e.hand === rendering.melodyHand ? loud.melody : loud.other,
    }));
  });
  const totalBeats = BARS * 4;
  const span = $derived(spanOf(notes.map((n) => n.midi)));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<TwoHandResult | null>(null);
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

  // Practice shows the beat that is due (from half a note before it); Check shows nothing.
  const due = (b: number) => notes.filter((n) => b >= n.beat - n.dur / 2 && b < n.beat + n.dur / 2);
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(notes, transport.beat)) out[n.midi] = markFor(n, true);
      return out;
    }
    if (mode !== "practice" || phase === "results") return out;
    const b = phase === "running" || phase === "countin" ? (transport.beat ?? 0) : 0;
    for (const n of due(Math.max(0, b))) out[n.midi] = markFor(n, false);
    return out;
  });

  const lanes = $derived<LaneRow[]>(
    (["left", "right"] as const)
      .filter((h) => hand === "both" || hand === h)
      .map((h) => ({
        id: h,
        mark: h === "left" ? "L" : "R",
        label: h === "left" ? "Left hand" : "Right hand",
        hand: h,
        notes: notes.filter((n) => n.hand === h).map((n) => ({ beat: n.beat, dur: n.dur, text: noteName(n.midi, "flat", false) })),
      }))
      .reverse(),
  );
  const eighths = $derived(notes.some((n) => n.beat % 1 !== 0));

  const patternLabel = $derived(TWO_HAND_PATTERNS.find((p) => p.id === pattern)?.label ?? pattern);
  const tonicName = $derived(noteName(tonic, "flat", false));
  const about = $derived(ABOUT(tonicName));
  const summaryLine = $derived<SetupClause[]>([
    { text: `${patternLabel} from ${tonicName}`, focus: "pattern" },
    { text: hand === "both" ? "both hands" : `${hand} hand only`, focus: "hand" },
    ...(s.dynamics ? [{ text: "melody louder" }] : []),
  ]);
  const setupKey = $derived(`two-hand:${pattern}:${s.tonic}:${hand}:${s.dynamics ? "dyn" : "flat"}:${bpm}`);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = "Listen: both hands at tempo. Notes in one column of the lane strike together.";
    await transport.demo(notes, bpm);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running" || mode !== "practice") return;
    const b = transport.beat ?? 0;
    flashes.add(e.midi, due(b).some((n) => n.midi === e.midi) ? "correct" : "wrong");
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    flashes.clear();
    stopClock = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: "technique.piano.two-hand-independence",
      setupKey,
      skillIds: twoHandSkills(pattern),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, level(pattern) + (bpm - 60) / 300),
      instrument: "piano",
      params: { bpm, pattern, tonic: s.tonic, hand, dynamics: s.dynamics },
    });
    // Scored input starts half a beat before the downbeat, after the count-in.
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
    const r = gradeTwoHand({
      targets: rendering.targetEvents.map((t) => ({ hand: t.hand, midi: t.midiNote, beat: t.beat })),
      splitMidi: rendering.splitMidi,
      measuresTogether: measuresTogether,
      melodyHand: rendering.melodyHand,
      dynamics: s.dynamics,
      beatMs: ctx.beatMs,
      startAt: ctx.downbeat,
      notes: played,
    });
    result = r;
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(played),
      instrument: runInstrument(played, "piano") ?? null,
      target: rendering.targetEvents.map((t) => t.midiNote),
      response: played.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} at ${bpm} BPM` });
    const advance = played.some((n) => n.kind === "noteon")
      ? await nextRun(`two-hand.${s.tonic}.${hand}.${s.dynamics ? "dyn" : "flat"}`, { bpm, tempo: { min: TEMPO.min, goal: 100, max: TEMPO.max }, steps: LADDER.map((p) => ({ label: p.label })), step: Math.max(0, LADDER.findIndex((p) => p.id === pattern)) }, r, tempoAnd((i) => cfg.set({ pattern: LADDER[i].id })))
      : undefined;
    summary = { ...buildSummary(r, fin), advance };
    status = summary.headline;
  }

  function buildSummary(r: TwoHandResult, fin: { delta: number | null; best: boolean; xp: number }): RunSummary {
    const weak = [...r.hands].sort((a, b) => a.pitch - b.pitch)[0];
    const togetherShare = r.together && r.together.beats ? r.together.count / r.together.beats : null;
    const headline = !r.hands.some((h) => h.matched)
      ? "No notes landed on the beats. Start on the first click after the count-in."
      : r.correct
        ? togetherShare !== null
          ? `Clean, and the hands struck together on ${r.together!.count} of ${r.together!.beats} beats.`
          : mode === "check"
            ? `Both parts clean at ${bpm} BPM, from memory.`
            : `Clean at ${bpm} BPM. Try it in Check to count it.`
        : r.pitch >= 0.9 && togetherShare !== null && togetherShare < 0.8
          ? `Every note right, but the hands struck together on only ${r.together!.count} of ${r.together!.beats} beats.`
          : weak && weak.pitch < 0.9
            ? `The ${weak.hand} hand found ${weak.matched} of ${weak.total} notes. Slow down and let that hand lead.`
            : `The notes are right but the spacing wandered. Keep both hands on the click.`;
    const rows: ResultRow[] = r.hands.map((h) => ({
      label: `${h.hand === "left" ? "Left" : "Right"} hand notes`,
      value: h.pitch,
      text: `${h.matched} of ${h.total}`,
    }));
    rows.push({ label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(Math.max(...r.hands.map((h) => h.spacingErrorMs)))} ms off` });
    if (measuresTogether)
      rows.push(
        r.together
          ? { label: "Hands together (40 ms)", value: togetherShare ?? 0, text: `${r.together.count} of ${r.together.beats} beats` }
          : { label: "Hands together (on-screen input)", notMeasured: true },
      );
    if (s.dynamics)
      rows.push(r.dynamics === null ? { label: "Dynamics, melody louder", notMeasured: true } : { label: "Dynamics, melody louder", value: r.dynamics });
    return {
      headline,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows,
      next:
        r.correct && mirror && mode === "check"
          ? { label: "Closest chords, I IV V I", href: "/music/voicings?variant=inversions&key=0", reason: "the next harmony step on the piano path" }
          : undefined,
    };
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

<svelte:head><title>Two hands | Woodshed</title></svelte:head>

<DrillShell
  title="Two hands"
  hue="piano"
  blurb="Each hand plays its own part on the click. Mirror hands asks them to strike together."
  summary={summaryLine}
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
    <div class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
      <Choice label="Pattern" setupKey="pattern" options={TWO_HAND_PATTERNS.map((p) => ({ value: p.id as string, label: p.label, hint: about[p.id] }))} value={pattern} onchange={(v) => cfg.set({ pattern: v })} />
      <Choice label="Tonic" options={TWO_HAND_TONICS.map((t) => ({ value: t.name, label: noteName(t.midi, "flat", false) }))} value={s.tonic} onchange={(v) => cfg.set({ tonic: v })} />
      <Choice label="Practise" setupKey="hand" options={TWO_HAND_MODES.map((m) => ({ value: m.id as string, label: m.id === "both" ? "Both hands" : `${m.label} only` }))} value={hand} onchange={(v) => cfg.set({ hand: v })} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">Tempo comes from the practice strip. Mirror hands starts at 60 to 66 BPM. Dynamics sits on the stage.</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <Stat label="Beat" value="{Math.min(totalBeats, Math.floor(Math.max(0, transport.beat)) + 1)} of {totalBeats}" />
    {:else if result}
      {#each result.hands as h (h.hand)}
        <Stat label="{h.hand === 'left' ? 'Left' : 'Right'} hand" value="{h.matched}/{h.total}" tone={h.pitch >= 0.9 ? "success" : "warn"} />
      {/each}
      {#if result.together}<Stat label="Together" value="{result.together.count}/{result.together.beats}" />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p class="max-w-prose text-ws-stage-soft">{about[pattern]}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium {s.dynamics ? 'bg-ws-stage-ink/15' : ''}"
          aria-pressed={s.dynamics}
          disabled={phase === "running" || phase === "countin"}
          onclick={() => cfg.set({ dynamics: !s.dynamics })}
          >{s.dynamics ? "Dynamics on: melody louder" : "Dynamics off"}</button
        >
      </div>
    </div>
    {#if mode === "practice" || transport.playing || phase === "results"}
      <div class="mb-3"><LineNotation notes={toWritten(notes)} title={setupKey} cursorBeat={transport.beat} keyFifths={signatureFor(tonic % 12, "major")} /></div>
    {/if}
    <BeatLane
      rows={lanes}
      beats={totalBeats}
      beat={transport.beat}
      {eighths}
      hidden={mode === "check" && !transport.playing}
      label="Beat lane: {lanes.map((l) => `${l.label}, ${l.notes.length} notes`).join('; ')}. Notes in one column strike together."
    />
    <Piano low={span.low} high={span.high} {marks} {flashes} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand keys marked L, right hand R." />
    <div class="mt-3 flex flex-col gap-1 text-sm text-ws-stage-soft">
      {#if mode === "check" && phase !== "results"}<p>Check mode: the lane keeps the rhythm, the notes are hidden.</p>{/if}
      <p>{mirror ? FINGERING_NOTE : "Keys show L and R. Fingering is authored only for Mirror hands."}</p>
      {#if measuresTogether}<p>Together is measured over MIDI only (both hands within 40 ms). On-screen keys play one note at a time, so an on-screen run reads Together: not measured.</p>{/if}
      {#if s.dynamics}<p>Dynamics: play the {rendering.melodyHand} hand louder. Velocity needs MIDI; on-screen keys can't measure it.</p>{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => retempo(mirror ? 6 : 10)}>Faster by {mirror ? 6 : 10}</button>
          <button type="button" class={btn} onclick={() => retempo(mirror ? -6 : -10)}>Slower</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>
