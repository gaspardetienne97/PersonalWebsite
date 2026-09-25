<script lang="ts">
  // Strum a progression (catalog table row, weakness 7): chroma per strum onset
  // from the microphone, followed against the chart with followChords. One run
  // is recorded with no skill mastery: real-strum following is unverified on a
  // physical guitar, so it must not claim a skill.
  import { onDestroy, onMount } from "svelte";
  import { FLAT_NAMES } from "@repo/music-core";
  import type { Strictness } from "@repo/music-core";
  import { chordPerfectTargets } from "@repo/music-core/content/technique";
  import { PROGRESSIONS } from "@repo/music-core/content/jam";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { followChords, type ChordFollowResult } from "@repo/music-core/scoring/chord-follower";
  import DrillShell, { type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { pct } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic, settings } from "$lib/music/runtime";
  import { exerciseFor } from "$lib/music/drills/guitar/fretted";
  import { applyBenchParams, fretted } from "$lib/music/drills/guitar/instrument.svelte";
  import { chordSymbol, shapesFor } from "$lib/music/drills/guitar/chords";
  import { ChordListener, type Heard } from "$lib/music/drills/guitar/strum.svelte";
  import MicPanel from "$lib/music/drills/guitar/MicPanel.svelte";
  import ToneMap from "$lib/music/drills/guitar/ToneMap.svelte";

  const cfg = new DrillSetup("strum-progression", { progression: "guitar-g-d-em-c", strictness: "relaxed", choruses: 1 });
  const s = $derived(cfg.value);
  onMount(() => void applyBenchParams());

  const instr = $derived(fretted());
  const prog = $derived(PROGRESSIONS.find((p) => p.id === s.progression) ?? PROGRESSIONS.find((p) => p.id === "guitar-g-d-em-c")!);
  const strictness = $derived((["relaxed", "normal", "strict"].includes(s.strictness) ? s.strictness : "relaxed") as Strictness);
  const choruses = $derived(Math.min(4, Math.max(1, s.choruses)));
  const bpm = () => Math.min(160, Math.max(40, settings.value.bpm));
  const chart = $derived.by(() => {
    let beat = 0;
    return Array.from({ length: choruses }, () => prog.chords)
      .flat()
      .map((c) => {
        const parsed = parseChordSymbol(c.symbol);
        const item = { symbol: c.symbol, pcs: parsed?.pcs ?? [], startBeat: beat, durationBeats: c.bars * 4, bars: c.bars };
        beat += c.bars * 4;
        return item;
      });
  });
  const totalBeats = $derived(chart.reduce((n, c) => n + c.durationBeats, 0));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let now = $state(0);
  let observed = $state.raw<Heard[]>([]);
  let result = $state<ChordFollowResult | null>(null);
  let summary = $state<RunSummary | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let demoIndex = $state<number | null>(null);
  const listener = new ChordListener();
  let downbeat = $state(0);
  let beatMs = $state(0);
  let ticker: ReturnType<typeof setInterval> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopClockRef: (() => void) | null = null;

  const live = $derived(phase === "running" || phase === "countin");
  const current = $derived.by(() => {
    if (demoIndex !== null) return demoIndex;
    if (phase !== "running" || !beatMs) return -1;
    const b = (now - downbeat) / beatMs;
    return chart.findIndex((c) => b >= c.startBeat && b < c.startBeat + c.durationBeats);
  });

  /** The instrument's own shape when there is one, else a close triad. */
  function voicing(symbol: string) {
    const shape = shapesFor(instr).find((x) => chordSymbol(x) === symbol);
    if (shape) return chordPerfectTargets(shape).map((t) => t.midi);
    const p = parseChordSymbol(symbol);
    return p ? p.intervals.slice(0, 4).map((i) => 48 + p.rootPc + i) : [];
  }

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoIndex = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = 60 / bpm();
    const notes: { midi: number; time: number; duration: number; chord: number }[] = [];
    prog.chords.forEach((c, i) => {
      const start = chart[i].startBeat;
      for (let b = 0; b < c.bars * 4; b += 2)
        voicing(c.symbol).forEach((m, k) => notes.push({ midi: m, time: (start + b) * beatS + k * 0.015, duration: beatS * 1.8, chord: i }));
    });
    const handle = audio.playSequence(notes, { onNote: (i: number) => (demoIndex = notes[i].chord) });
    demo = handle;
    status = "Listen: one chorus, strummed on beats one and three. The microphone is not listening to this.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    observed = [];
    downbeat = ctx.downbeat;
    beatMs = ctx.beatMs;
    stopClockRef = ctx.stopClock;
    listener.start({
      onStrum: (h) => {
        if (h.at >= ctx.downbeat - ctx.beatMs / 2 && h.pcs.length) observed = [...observed, h];
      },
    });
    ticker = setInterval(() => (now = performance.now()), 80);
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + (totalBeats + 1) * ctx.beatMs + 700);
  }

  function halt() {
    clearInterval(ticker);
    clearTimeout(timer);
    stopClockRef?.();
    listener.stop();
    mic.stop();
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    halt();
    const r = followChords({ chords: chart, observed, bpm: bpm(), startAt: downbeat, strictness });
    result = r;
    phase = "results";
    const setupKey = `strum:${prog.id}:${choruses}:${strictness}:${bpm()}`;
    // One run, no skills: nothing here moves mastery.
    const run = practice.beginRun({
      exerciseId: exerciseFor("technique.guitar.strum-progression", instr),
      setupKey,
      skillIds: [],
      capabilities: ["harmony"],
      modality: "played",
      assistance: "guided",
      difficulty: prog.difficulty === "beginner" ? 0.3 : prog.difficulty === "intermediate" ? 0.5 : 0.7,
      instrument: instr,
      params: { progression: prog.id, bpm: bpm(), strictness, choruses },
    });
    await run.attempt({
      promptId: prog.id,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: "audio",
      instrument: instr,
      skillIds: [],
      target: chart.map((c) => c.symbol).join(" "),
      response: `${r.matched} of ${r.total}`,
    });
    const fin = await run.finish({ score: r.score, correct: r.correct, headline: `${r.matched} of ${r.total} chords followed` });
    const timed = r.chords.filter((c) => c.errorMs !== undefined);
    summary = {
      headline: !observed.length
        ? "No strums were heard. Check the level meter moves when you play, then try again."
        : r.correct
          ? `Every chord followed, ${r.total} of ${r.total}, in time.`
          : `${r.matched} of ${r.total} chords followed. ${r.chords.find((c) => !c.matched) ? `The first miss was ${r.chords.find((c) => !c.matched)!.symbol}.` : ""}`,
      metric: `${r.matched}/${r.total}`,
      metricLabel: "chords followed",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      assistance: "Kept as a practice run only: chord following through the microphone has not been checked on a real guitar yet, so it does not count toward any skill.",
      rows: [
        { label: "Chord tones per chord", value: r.score, text: pct(r.score) },
        { label: "Strums heard", text: String(observed.length) },
        timed.length
          ? { label: "Mean timing", text: `${Math.round(timed.reduce((n, c) => n + Math.abs(c.errorMs!), 0) / timed.length)} ms from the beat` }
          : { label: "Timing", notMeasured: true },
        { label: "Which strings rang", notMeasured: true },
        { label: "Skill mastery", notMeasured: true },
      ],
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
    stopDemo();
  });

  const tones = $derived(current >= 0 ? chart[current]?.pcs ?? [] : (chart[0]?.pcs ?? []));
</script>

<svelte:head><title>Strum a progression | Woodshed</title></svelte:head>

<DrillShell
  title="Strum a progression"
  hue={instr}
  blurb="Strum the chart in time while the microphone follows each chord. A practice run: it keeps a record, not a skill score."
  summary="{prog.name} in {prog.key}, {choruses} chorus{choruses > 1 ? 'es' : ''}, {strictness} timing, {bpm()} BPM"
  bind:phase
  bind:status
  checkable={false}
  progress={totalBeats && beatMs ? Math.min(1, Math.max(0, (now - downbeat) / beatMs) / totalBeats) : 0}
  clock={{ bpm: bpm(), beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  blocked={mic.state === "on" ? null : "Start the microphone on the stage first."}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice
        label="Progression"
        select
        options={PROGRESSIONS.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
        value={prog.id}
        onchange={(v) => {
          cfg.set({ progression: v });
          const p = PROGRESSIONS.find((x) => x.id === v);
          if (p) settings.update({ bpm: p.bpm });
        }}
      />
      <Choice
        label="Timing window"
        options={[
          { value: "relaxed", label: "Relaxed" },
          { value: "normal", label: "Normal" },
          { value: "strict", label: "Strict" },
        ]}
        value={strictness}
        onchange={(v) => cfg.set({ strictness: v })}
      />
      <Choice
        label="Choruses"
        options={[
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 4, label: "4" },
        ]}
        value={choruses}
        onchange={(v) => cfg.set({ choruses: v })}
      />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Chord" value={current >= 0 ? chart[current].symbol : "Ready"} />
      <Stat label="Strums heard" value={observed.length} />
    {:else if result}
      <Stat label="Followed" value="{result.matched}/{result.total}" tone={result.correct ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <ol class="flex flex-wrap gap-1.5" aria-label="Chord chart">
      {#each chart as c, i (i)}
        {@const graded = result?.chords[i]}
        <li
          class="relative flex min-h-16 min-w-16 flex-col justify-between rounded-xl border px-3 py-2 transition-colors {i === current
            ? 'border-transparent bg-instr text-ws-stage'
            : 'border-ws-stage-ink/20 bg-ws-stage-ink/5'}"
          style:flex-grow={c.bars}
          aria-current={i === current ? "step" : undefined}
        >
          <span class="font-display text-2xl font-bold leading-none">{c.symbol}</span>
          <span class="text-xs {i === current ? '' : 'text-ws-stage-soft'}">
            {#if graded}
              {graded.matched ? "✓ followed" : graded.verification ? "✕ tones off" : "✕ not heard"}
            {:else}
              {c.bars} bar{c.bars > 1 ? "s" : ""}
            {/if}
          </span>
        </li>
      {/each}
    </ol>
    <div class="mt-4 grid gap-2">
      <p class="text-sm font-medium">Tones of {current >= 0 ? chart[current].symbol : chart[0].symbol}{live ? ", against what the microphone hears" : ""}</p>
      <ToneMap expected={tones} heard={live ? listener.live : []} label="Detected tones" />
      {#if live}<p class="text-sm text-ws-stage-soft">Heard now: {listener.live.length ? listener.live.map((p) => FLAT_NAMES[p]).join(" ") : "nothing"}</p>{/if}
    </div>
    <p class="mt-3 max-w-prose text-sm text-ws-stage-soft">
      The microphone reads which notes ring after each strum, not which strings rang them. This drill is still unverified on a real guitar, so it records the run without claiming a skill.
    </p>
    <div class="mt-3"><MicPanel disabled={live} /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>
