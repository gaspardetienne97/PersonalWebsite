<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc, pcOf } from "@repo/music-core";
  import { KEY_CYCLE, chordScaleTargets, cycleTranspose, goToScale } from "@repo/music-core/content/piano";
  import { JAZZ } from "@repo/music-core/data/index";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { gradeChordScales, type ChordScaleResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage from "$lib/music/components/InstrumentStage.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
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
  const cfg = new DrillSetup("chord-scales", { changes: "major" as string, key: "C", beats: 8 });
  const s = $derived(cfg.value);
  const changes = $derived((s.changes === "minor" ? "minor" : "major") as "major" | "minor");
  const key = $derived(KEY_CYCLE.includes(s.key) ? s.key : "C");
  const perChord = $derived(s.beats === 4 ? 4 : 8);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const targets = $derived(
    chordScaleTargets(changes, cycleTranspose(key)).map((t) => {
      const chord = parseChordSymbol(t.symbol)!;
      const sc = goToScale(t.symbol);
      const others = JAZZ.CHORD_SCALE_MAP.filter((r) => sc && r.family === sc.family && r.scale !== sc.scale).map((r) => r.label);
      return { ...t, chord, hint: sc?.hint?.replace(/\s*\(JT\d+\)/g, ""), others };
    }),
  );
  const totalBeats = $derived(targets.length * perChord);
  // One keyboard from the lowest root to an octave above the highest.
  const low = $derived(Math.floor(Math.min(...targets.map((t) => t.midi[0])) / 12) * 12);
  const high = $derived(Math.ceil((Math.max(...targets.map((t) => t.midi[0])) + 13) / 12) * 12);

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<ChordScaleResult | null>(null);
  const transport = new Transport();
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctxRef: RunContext | null = null;

  // A change is anticipated by half a beat: a note just before the bar line belongs to the next chord.
  const chordIndexAt = (beat: number) => Math.min(targets.length - 1, Math.max(0, Math.floor((beat + 0.5) / perChord)));
  const currentIndex = $derived(transport.beat === null ? 0 : chordIndexAt(transport.beat));
  const current = $derived(targets[currentIndex]);

  const demoNotes = $derived<TimedNote[]>(
    targets.flatMap((t, i) => {
      const line = [...t.midi, t.midi[0] + 12];
      const step = perChord / line.length;
      const shell = [t.chord.rootPc + 48, ...t.chord.intervals.filter((iv) => iv === 3 || iv === 4 || iv === 10 || iv === 11).map((iv) => t.chord.rootPc + 48 + iv)];
      return [
        ...shell.map((midi) => ({ midi, beat: i * perChord, dur: perChord * 0.95, hand: "left" as const, velocity: 0.45 })),
        ...line.map((midi, k) => ({ midi, beat: i * perChord + k * step, dur: step, hand: "right" as const, velocity: 0.8 })),
      ];
    }),
  );

  // The colour key sits on the keys you play: every key of the current chord's octave, by role.
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(demoNotes, transport.beat)) if (n.hand === "right") out[n.midi] = { demo: true, label: toneLabel(n.midi - current.chord.rootPc, current.chord.intervals), role: current.roles[pc(n.midi)] };
    }
    const showKey = transport.playing || (mode === "practice" && phase !== "results");
    if (!showKey || !current) return out;
    for (let m = current.midi[0]; m <= current.midi[0] + 12; m++) {
      if (out[m]) continue;
      out[m] = { label: toneLabel(m - current.midi[0], current.chord.intervals), role: current.roles[pc(m)] };
    }
    return out;
  });

  const summaryLine = $derived(`${changes === "major" ? "Major ii-V-I" : "Minor ii-V-i"} in ${key} (${targets.map((t) => t.symbol).join(" ")}), ${perChord === 8 ? "two bars" : "one bar"} per chord, ${bpm} BPM`);
  const setupKey = $derived(`chord-scales:${changes}:${key}:${perChord}:${bpm}`);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = "Listen: each chord in the left hand with its go-to scale on top.";
    await transport.demo(demoNotes, bpm);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running" || mode !== "practice") return;
    const t = targets[chordIndexAt(transport.beat ?? 0)];
    flashes.add(e.midi, t.roles[pc(e.midi)] === "avoid" ? "wrong" : "correct");
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
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
      params: { bpm, changes, key, beatsPerChord: perChord },
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
    const byChord = targets.map(() => [] as number[]);
    for (const n of ons) byChord[chordIndexAt((n.at - ctx.downbeat) / ctx.beatMs)].push(n.midi);
    const r = gradeChordScales(targets.map((t, i) => ({ symbol: t.symbol, chordPcs: t.chord.pcs, scalePcs: t.midi, played: byChord[i] })));
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
  title="Chord scales"
  hue="piano"
  blurb="As the ii-V-I moves, play the go-to scale for the chord you're on. Every note is judged against that chord's scale."
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
    <div class="grid gap-4 sm:grid-cols-3">
      <Choice
        label="Changes"
        options={[
          { value: "major", label: "Major ii-V-I" },
          { value: "minor", label: "Minor ii-V-i" },
        ]}
        value={changes}
        onchange={(v) => cfg.set({ changes: v })}
      />
<div class="flex min-w-0 flex-col gap-1 text-sm">
        <span class="font-medium">Key</span>
        <KeyPicker label="Key" value={pcOf(key)!} name={(p) => KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C"} onchange={(p) => cfg.set({ key: KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C" })} />
      </div>
      <Choice
        label="Each chord lasts"
        options={[
          { value: 4, label: "One bar" },
          { value: 8, label: "Two bars" },
        ]}
        value={perChord}
        onchange={(v) => cfg.set({ beats: v })}
      />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <Stat label="Chord" value="{currentIndex + 1} of {targets.length}" />
      <Stat label="Beat" value="{Math.min(perChord, Math.floor(Math.max(0, transport.beat) % perChord) + 1)} of {perChord}" />
    {:else if result}
      <Stat label="Chords played" value="{result.graded}/{targets.length}" />
      <Stat label="Inside" value={pct(result.score)} tone={result.score >= 0.9 ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <ol class="mb-3 grid grid-cols-3 gap-2" aria-label="Chord chart">
      {#each targets as t, i (t.symbol)}
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
        {current.hint ?? ""}{current.others.length ? ` Also works: ${current.others.join(", ")}.` : ""}
      </p>
    {:else if mode === "check" && phase !== "results"}
      <p class="mb-3 text-sm text-ws-stage-soft">Check mode: the scale names and the colour key are hidden. Play what fits each chord.</p>
    {/if}
    <InstrumentStage line={targets.flatMap((t) => [t.midi[0], t.midi[0] + 12])} {low} {high} {marks} {flashes} fit />
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-stage-soft" aria-label="Colour key">
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="chord" aria-hidden="true">3</span>Chord tone (filled, named R 3 5 7)</li>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="scale" aria-hidden="true">9</span>Scale tone (filled, named as a tension)</li>
      <li class="flex items-center gap-1.5"><span class="key-swatch" data-role="avoid" aria-hidden="true">b9</span>Outside the scale (dashed ring)</li>
    </ul>
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
