<script lang="ts">
  // Strum a progression (catalog table row, weakness 7): chroma per strum onset
  // from the microphone, followed against the chart with followChords. One run
  // is recorded with no skill mastery: real-strum following is unverified on a
  // physical guitar, so it must not claim a skill.
  import { onDestroy, onMount } from "svelte";
  import { FLAT_NAMES, noteName } from "@repo/music-core";
  import type { Strictness } from "@repo/music-core";
  import { chordPerfectTargets } from "@repo/music-core/content/technique";
  import { PROGRESSIONS } from "@repo/music-core/content/jam";
  import { CHART_LEVELS, chartProgression, isChartLevel } from "@repo/music-core/content/accompany";
  import { RHYTHM_PATTERNS } from "@repo/music-core/content/rhythm";
  import { parseChordSymbol } from "@repo/music-core/theory/chords";
  import { followChords, onChord, type ChordFollowResult } from "@repo/music-core/scoring/chord-follower";
  import DrillShell, { type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { pct } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, mic, settings } from "#lib/music/runtime/index.ts";
  import { exerciseFor } from "#lib/music/drills/guitar/fretted.ts";
  import { applyBenchParams, fretted, tuningFor } from "#lib/music/drills/guitar/instrument.svelte.ts";
  import { chordId, positionsOn, symbolRef, toneName } from "#lib/music/drills/guitar/chords.ts";
  import { ChordListener, type Heard } from "#lib/music/drills/guitar/strum.svelte.ts";
  import MicPanel, { startMic } from "#lib/music/drills/guitar/MicPanel.svelte";
  import StrumSlots, { type SlotMark } from "#lib/music/drills/guitar/StrumSlots.svelte";
  import { pairStrums, slotAt, strokeTally, strokeVerdict, strumScore, strumSlots } from "#lib/music/drills/guitar/strum-slots.ts";
  import Verdict from "#lib/music/components/Verdict.svelte";
  import Info from "@lucide/svelte/icons/info";
  import ShapeBoard from "#lib/music/drills/guitar/ShapeBoard.svelte";
  import ToneMap from "#lib/music/drills/guitar/ToneMap.svelte";
  import NoteHighway, { highway, viewSwitch, type HighwayChord } from "#lib/music/notation/NoteHighway.svelte";
  import type { Hit } from "#lib/music/notation/highway.ts";

  // seed: the generated charts' draw; New chart moves it on. pattern: "" is the instrument's
  // starter strum (D DU UDU), "any" is any strum.
  const cfg = new DrillSetup("strum-progression", { progression: "guitar-g-d-em-c", strictness: "relaxed", choruses: 1, pattern: "" as string, seed: 1 });
  const s = $derived(cfg.value);
  onMount(() => void applyBenchParams());

  const instr = $derived(fretted());
  const tuning = $derived(tuningFor(instr));
  /** A chart symbol's first shape on this instrument and tuning, or undefined (G7alt, slash chords). */
  const shapeOf = (symbol: string) => {
    const ref = symbolRef(symbol);
    return ref ? positionsOn(chordId(instr, ref), tuning)[0] : undefined;
  };
  const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
  /** Only progressions whose every chord has a shape to show and a voicing a strum can cover. */
  /** Eight-bar charts to read at sight (the reading path's chart-1 to chart-3), where every chord has a shape here. */
  const charts = $derived(CHART_LEVELS.map((l) => chartProgression(l.id, s.seed)).filter((p) => p.chords.every((c) => shapeOf(c.symbol))));
  const playable = $derived([...PROGRESSIONS.filter((p) => p.chords.every((c) => shapeOf(c.symbol))), ...charts]);
  const prog = $derived(playable.find((p) => p.id === s.progression) ?? playable.find((p) => p.id === "guitar-g-d-em-c") ?? playable[0]);
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
  /** The progressions from beginner to advanced, for the next run. */
  const LADDER = $derived(DIFFICULTIES.flatMap((d) => playable.filter((p) => p.difficulty === d && !p.song && !isChartLevel(p.id))));
  /** Songs' chord loops, apart from the ladder. */
  const songs = $derived(playable.filter((p) => p.song));
  const pick = (v: string) => {
    cfg.set({ progression: v });
    const p = PROGRESSIONS.find((x) => x.id === v);
    if (p) settings.update({ bpm: p.bpm });
  };
  const totalBeats = $derived(chart.reduce((n, c) => n + c.durationBeats, 0));
  // A strum pattern from Rhythm's strums for this instrument (4/4 ones: the charts are in 4/4).
  // It shapes the demo, the stroke row and the per-stroke timing; the chords are still followed by tone.
  const strums = $derived(RHYTHM_PATTERNS.filter((p) => p.chords?.length && p.meter.beats === 4 && p.id.startsWith(`${instr}-`)));
  /** The pattern a first run draws: the classic D DU UDU where the instrument has it. */
  const STARTER: Record<string, string> = { guitar: "guitar-old-faithful", ukulele: "ukulele-island-strum" };
  const strum = $derived(s.pattern === "any" ? undefined : (strums.find((p) => p.id === (s.pattern || STARTER[instr])) ?? strums[0]));
  const strumName = (p: (typeof strums)[number]) => p.label.replace(/^(Guitar|Ukulele): /, "").replace(/ \([^)]*\)$/, "");
  /** The pattern's strokes in one bar of the chart (a two-bar pattern alternates). */
  const strokesIn = (bar: number) => (strum ? strum.events.filter((e) => Math.floor(e.beat / 4) === bar % strum.defaultBars).map((e) => ({ ...e, beat: e.beat % 4 })) : []);

  let phase = $state<Phase>("ready");
  let status = $state("");
  let now = $state(0);
  let observed = $state.raw<Heard[]>([]);
  let result = $state<ChordFollowResult | null>(null);
  let summary = $state<RunSummary | null>(null);
  /** The last run's strums by where they landed (strokeTally): the results' tally, on the bar grid's own marks. */
  let tally = $state<ReturnType<typeof strokeTally> | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let demoIndex = $state<number | null>(null);
  let demoAt = $state<number | null>(null);
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

  /** The chord's shape on this instrument when there is one, else a close triad. */
  function voicing(symbol: string) {
    const shape = shapeOf(symbol);
    if (shape) return chordPerfectTargets(shape, tuning).map((t) => t.midi);
    const p = parseChordSymbol(symbol);
    return p ? p.intervals.slice(0, 4).map((i) => 48 + p.rootPc + i) : [];
  }

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoIndex = null;
    demoAt = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = 60 / bpm();
    const notes: { midi: number; time: number; duration: number; chord: number }[] = [];
    prog.chords.forEach((c, i) => {
      const start = chart[i].startBeat;
      const v = voicing(c.symbol);
      for (let bar = 0; bar < c.bars; bar++) {
        const at = start + bar * 4;
        if (!strum) for (const b of [0, 2]) v.forEach((m, k) => notes.push({ midi: m, time: (at + b) * beatS + k * 0.015, duration: beatS * 1.8, chord: i }));
        // A muted chuck is a short, quiet strum; an up stroke runs from the top string.
        else
          for (const e of strokesIn(at / 4))
            (e.stroke === "up" ? [...v].reverse() : v).forEach((m, k) =>
              notes.push({ midi: m, time: (at + e.beat) * beatS + k * 0.012, duration: e.stroke === "mute" ? 0.05 : beatS * (e.durationBeats ?? 0.5) * 0.9, chord: i }),
            );
      }
    });
    const handle = audio.playSequence(notes, { onNote: (i: number) => (demoIndex = notes[i].chord) });
    demo = handle;
    demoAt = handle.startPerf;
    status = `Demo: one chorus, ${strum ? strumName(strum) : "strummed on beats one and three"}. The microphone isn't listening.`;
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  async function start(ctx: RunContext) {
    stopDemo();
    // Start turns the microphone on (its label says so): a refused one ends the run before it begins.
    if (mic.state !== "on" && !(await startMic())) {
      ctx.stopClock();
      phase = "ready";
      status = mic.error || "The microphone didn't start. Check the browser allows it, then press Start again.";
      return;
    }
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
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    halt();
    const r = followChords({ chords: chart, observed, bpm: bpm(), startAt: downbeat, strictness });
    result = r;
    // The score is the expected strums (contradiction 7): with a pattern, the share that landed on time on their
    // chord (onChord, the rule a chord followed uses); with any strum, the chords followed. Chord tones heard is a row, never the ring.
    const landed = strumScore(blocks.map((_, k) => blockHits[k]), onTimeMs());
    const score = strum ? landed.score : r.total ? r.matched / r.total : 0;
    const correct = r.correct && (!strum || landed.landed === landed.total);
    phase = "results";
    const setupKey = `strum:${prog.id}:${choruses}:${strictness}:${bpm()}${strum ? `:${strum.id}` : ""}`;
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
      params: { progression: prog.id, bpm: bpm(), strictness, choruses, ...(strum ? { pattern: strum.id } : {}), ...(isChartLevel(prog.id) ? { seed: s.seed } : {}) },
    });
    await run.attempt({
      promptId: prog.id,
      correct,
      partialCredit: score,
      metrics: r.metrics,
      source: "audio",
      instrument: instr,
      skillIds: [],
      target: chart.map((c) => c.symbol).join(" "),
      response: `${r.matched} of ${r.total}`,
      // The strum listener has its own path from the microphone.
      heard: observed.length > 0,
    });
    const fin = await run.finish({ score, correct, headline: strum ? `${landed.landed} of ${landed.total} strums on time on the chord` : `${r.matched} of ${r.total} chords followed` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const timed = r.chords.filter((c) => c.errorMs !== undefined);
    // With a pattern each stroke is a target, in one of five places (the bar grid's marks): on time, early or late on
    // its chord, on the wrong chord, or missed. They add up to the strums expected, and on time is the score's count,
    // so the breakdown and the headline tell one story (a strum on the beat on the wrong chord is not "on time").
    tally = strum ? strokeTally(blocks.map((_, k) => blockHits[k]), onTimeMs()) : null;
    summary = {
      headline: !observed.length
        ? "No strums were heard. Check the level meter moves when you play, then try again."
        : correct
          ? `All ${r.total} chords followed, ${strum ? "every strum on time" : "in time"}.`
          : `${strum ? `${landed.landed} of ${landed.total} strums on time on the chord. ` : ""}${r.matched} of ${r.total} chords followed.${r.chords.find((c) => !c.matched) ? ` ${r.chords.find((c) => !c.matched)!.symbol} is the one to work on first.` : ""}`,
      // The ring is the run's score (the expected strums that landed), the metric "since last time" compares.
      metric: pct(score),
      metricLabel: strum ? "strums on time on the chord" : "chords followed",
      score,
      cleanMeans: strum ? "every strum on time on its chord, every chord followed" : "every chord followed, in time",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      assistance: "Kept as practice history, not counted toward your skill scores yet.",
      rows: [
        ...(strum && tally
          ? [
              // Four counts that add up to the strums expected; the first is the headline's and the ring's.
              { label: "On time on the chord", value: landed.score, text: `${landed.landed} of ${landed.total}` },
              { label: "On the wrong chord", text: `${tally.wrong} of ${landed.total}` },
              { label: "Early or late", text: `${tally.early + tally.late} of ${landed.total}` },
              { label: "Missed", text: `${tally.miss} of ${landed.total}` },
            ]
          : []),
        { label: "Chords followed", value: r.total ? r.matched / r.total : 0, text: `${r.matched} of ${r.total}` },
        { label: "Chord tones heard", value: r.score, text: pct(r.score) },
        { label: "Strums heard", text: String(observed.length) },
        timed.length
          ? { label: "Mean timing", text: `${Math.round(timed.reduce((n, c) => n + Math.abs(c.errorMs!), 0) / timed.length)} ms from the beat` }
          : { label: "Timing", notMeasured: true },
        { label: "Which strings rang", notMeasured: true },
        { label: "Skill score", notMeasured: true },
      ],
      // The tempo climbs to the progression's own, then the next progression up.
      advance: observed.length
        ? await nextRun(`${instr}.strum.${strictness}.${choruses}`, { bpm: bpm(), tempo: { min: 40, goal: prog.bpm, max: 160 }, steps: LADDER.map((p) => ({ label: p.name, goal: p.bpm })), step: LADDER.indexOf(prog) }, { score, correct }, tempoAnd((i) => cfg.set({ progression: LADDER[i].id })))
        : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    halt();
    phase = "ready";
    status = "Nothing saved.";
  }

  onDestroy(() => {
    halt();
    stopDemo();
    mic.stop();
  });

  // The highway: a block per strum (the pattern's arrows), or per chord with any strum, over the chord's strings.
  const allStrings = $derived(tuning.openStrings.map((_, i) => i + 1));
  const blocks = $derived(
    chart.flatMap((c): HighwayChord[] => {
      const shape = shapeOf(c.symbol);
      const strings = shape ? chordPerfectTargets(shape, tuning).map((t) => t.string) : allStrings;
      if (!strum) return [{ startBeat: c.startBeat, durationBeats: c.durationBeats, strings, name: c.symbol }];
      return Array.from({ length: c.bars }, (_, bar) => strokesIn(c.startBeat / 4 + bar).map((e) => ({ beat: c.startBeat + bar * 4 + e.beat, e })))
        .flat()
        .map(({ beat, e }, k) => ({ startBeat: beat, durationBeats: e.durationBeats ?? 0.5, strings, name: k === 0 ? c.symbol : undefined, strum: e.stroke, accent: e.accent === "accent" }));
    }),
  );
  /** Each block's time (perf ms) in this run. */
  const blockTimes = $derived(beatMs ? blocks.map((b) => downbeat + b.startBeat * beatMs) : []);
  /** Each block's nearest strum within half a beat (one strum a block): its offset in ms. */
  const blockOffsets = $derived(beatMs ? pairStrums(blockTimes, observed.map((h) => h.at), beatMs) : []);
  /** The strum that landed on each block, for its tones. */
  const blockStrum = (k: number) => observed.find((h) => h.at - blockTimes[k] === blockOffsets[k]);
  /** Each judged block: its offset, or wrong when its strum is not on the chord (the follower's own rule, onChord). */
  const blockHits = $derived.by(() => {
    const out: Record<number, Hit> = {};
    blockOffsets.forEach((off, k) => {
      if (off === undefined) return;
      const pcs = chart.findLast((c) => c.startBeat <= blocks[k].startBeat + 1e-6)?.pcs ?? [];
      out[k] = onChord(pcs, blockStrum(k)?.pcs ?? []) ? off : "wrong";
    });
    return out;
  });
  /** On time: within an eighth of a beat (40 ms at the least), as the highway draws it. */
  const onTimeMs = () => Math.max(40, Math.round(60000 / bpm() / 8));

  const hwBeat = $derived(demoAt !== null ? (now - demoAt) / (60000 / bpm()) : live && beatMs ? (now - downbeat) / beatMs : null);
  let raf = 0;
  $effect(() => {
    if (!live && !demo) return;
    const frame = () => {
      now = performance.now();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  const shownIndex = $derived(current >= 0 ? current : 0);
  /** Beside Stop on a phone: the chord to strum now and the one after it. */
  const cue = $derived(phase === "running" && current >= 0 ? `Strum ${chart[current].symbol}${chart[current + 1] ? `, then ${chart[current + 1].symbol}` : ", the last chord"}` : "");
  const tones = $derived(chart[shownIndex]?.pcs ?? []);
  /** The shown chord's tones spelled from its root (F# in D major); flats when the symbol has no root to spell from. */
  const shownRef = $derived(chart[shownIndex] ? symbolRef(chart[shownIndex].symbol) : null);
  const spell = (p: number) => (shownRef ? toneName(p, shownRef, false) : FLAT_NAMES[p]);
  const shownShape = $derived(chart[shownIndex] ? shapeOf(chart[shownIndex].symbol) : undefined);

  // The stroke row: the bar sounding now (or the shown chord's first bar), its slot lit on the click,
  // each of its strokes marked once judged. Strokes not reached yet carry no mark.
  const rowBeat = $derived(hwBeat !== null && hwBeat >= 0 ? hwBeat : null);
  /** The chart's chord sounding at a beat. */
  const chordAt = (beat: number) => chart.findLast((c) => c.startBeat <= beat + 1e-6)?.symbol ?? "the chord";
  const rowBar = $derived(rowBeat !== null ? Math.floor(rowBeat / 4) : Math.max(0, chart[shownIndex]?.startBeat ?? 0) / 4);
  const row = $derived(strumSlots(strokesIn(rowBar).map((e) => ({ beat: e.beat, stroke: e.stroke, accent: e.accent === "accent" }))));
  const rowLit = $derived(slotAt(rowBeat, row.step));
  const rowMarks = $derived.by(() => {
    const out: Record<number, SlotMark> = {};
    if (!live || !beatMs || rowBeat === null) return out;
    blocks.forEach((b, k) => {
      if (Math.floor(b.startBeat / 4 + 1e-6) !== rowBar) return;
      const slot = Math.round((b.startBeat - rowBar * 4) / row.step);
      const hit = blockHits[k];
      if (hit === "wrong") out[slot] = { kind: "wrong", text: `Not ${chordAt(b.startBeat)}` };
      else if (typeof hit === "number") out[slot] = strokeVerdict(hit, onTimeMs());
      else if (rowBeat - b.startBeat > 0.5) out[slot] = { kind: "miss", text: "Missed" };
    });
    return out;
  });
  /** After a run: every bar of the chart as its slots, each stroke marked (missed where no strum came). */
  const barMarks = $derived.by(() => {
    if (!strum || !result || !beatMs) return [];
    return Array.from({ length: Math.round(totalBeats / 4) }, (_, bar) => {
      const r = strumSlots(strokesIn(bar).map((e) => ({ beat: e.beat, stroke: e.stroke, accent: e.accent === "accent" })));
      const marks: Record<number, SlotMark> = {};
      blocks.forEach((b, k) => {
        if (Math.floor(b.startBeat / 4 + 1e-6) !== bar) return;
        const hit = blockHits[k];
        marks[Math.round((b.startBeat - bar * 4) / r.step)] =
          hit === "wrong" ? { kind: "wrong", text: `Not ${chordAt(b.startBeat)}` } : typeof hit === "number" ? strokeVerdict(hit, onTimeMs()) : { kind: "miss", text: "Missed" };
      });
      return { bar, chord: chordAt(bar * 4), slots: r.slots, marks };
    });
  });
  /** The latest judged strum, as a word over the row. */
  const lastVerdict = $derived.by(() => {
    if (!live || !strum) return null;
    let k = -1;
    blockOffsets.forEach((off, i) => off !== undefined && (k < 0 || blockTimes[i] > blockTimes[k]) && (k = i));
    if (k < 0) return null;
    const hit = blockHits[k];
    return { key: k, ...(typeof hit === "number" ? strokeVerdict(hit, onTimeMs()) : { kind: "wrong" as const, text: `Not ${chordAt(blocks[k].startBeat)}` }) };
  });
</script>

<svelte:head><title>Strum a progression | Woodshed</title></svelte:head>

<DrillShell
  title="Strum a progression"
  hue={instr}
  blurb="Strum the pattern through the chart while the microphone follows each chord."
  summary={[
    { text: `${prog.name} in ${prog.key}`, focus: "progression" },
    { text: strum ? strumName(strum) : "any strum", focus: "pattern" },
    { text: `${choruses} chorus${choruses > 1 ? "es" : ""}`, focus: "choruses" },
    { text: `${strictness} timing`, focus: "timing" },
  ]}
  bind:phase
  bind:status
  checkable={false}
  progress={totalBeats && beatMs ? Math.min(1, Math.max(0, (now - downbeat) / beatMs) / totalBeats) : 0}
  clock={{ bpm: bpm(), beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  startLabel={mic.state === "on" ? "Start" : "Start (turns on the mic)"}
  {cue}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-3 sm:col-span-2 lg:col-span-3" role="group" aria-label="Progression" data-setup="progression">
        <p class="text-sm font-medium">Progression</p>
        {#each DIFFICULTIES as d (d)}
          {@const list = playable.filter((p) => p.difficulty === d && !p.song && !isChartLevel(p.id))}
          {#if list.length}
            <Choice
              label={d[0].toUpperCase() + d.slice(1)}
              options={list.map((p) => ({ value: p.id, label: `${p.name} in ${p.key}`, detail: [...new Set(p.chords.map((c) => c.symbol))].join(" ") }))}
              value={prog.id}
              onchange={pick}
            />
          {/if}
        {/each}
        {#if charts.length}
          <div class="flex flex-wrap items-end gap-2">
            <Choice
              label="Read a new chart"
              options={charts.map((p) => ({ value: p.id, label: p.name, detail: p.chords.map((c) => c.symbol).join(" ") }))}
              value={prog.id}
              onchange={pick}
            />
            <button type="button" class="min-h-11 rounded-full border border-ws-line px-4 text-sm font-medium" onclick={() => cfg.set({ seed: s.seed + 1 })}>New chart</button>
          </div>
          {#if isChartLevel(prog.id)}<p class="text-sm text-ws-soft">Eight bars in C you haven't seen: read it once, then strum it. Some bars change chord on beat 3.</p>{/if}
        {/if}
        {#if songs.length}
          <Choice
            label="Songs"
            options={songs.map((p) => ({ value: p.id, label: `${p.name}, ${p.song!.artist}`, detail: [...new Set(p.chords.map((c) => c.symbol))].join(" ") + `, ${p.bpm} BPM` }))}
            value={prog.id}
            onchange={pick}
          />
          {#if prog.song?.note}<p class="text-sm text-ws-soft">{prog.song.note}</p>{/if}
        {/if}
      </div>
      {#if strums.length}
        <Choice
          label="Strum pattern"
          setupKey="pattern"
          select
          options={[...strums.map((p) => ({ value: p.id, label: strumName(p) })), { value: "any", label: "Any strum" }]}
          value={strum?.id ?? "any"}
          onchange={(v) => cfg.set({ pattern: v })}
        />
      {/if}
      <Choice
        label="Timing window"
        setupKey="timing"
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
        setupKey="choruses"
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
    {#if phase !== "results"}
      <!-- From lg, over the chart, the switch shares the chords' heading row (pulled up over it, its caption left to
           the switch's own words), so the chart starts one row higher. The highway keeps the row and its caption. -->
      <div class="mb-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 {highway.on ? '' : 'lg:pointer-events-none lg:relative lg:z-10 lg:-mb-11'}">
        <p class="text-sm text-ws-stage-soft max-sm:hidden {highway.on ? '' : 'lg:hidden'}">{highway.on ? "Highway: each strum slides down to the line as it's due." : "Highway: a scrolling view"}</p>
        <div class="pointer-events-auto">{@render viewSwitch("Chart")}</div>
      </div>
    {/if}
    {#if highway.on && phase !== "results"}
      <NoteHighway chords={blocks} strings={tuning.openStrings.map((m) => noteName(m, "flat", false))} beat={hwBeat} chordHits={blockHits} judge={phase === "running"} perfectMs={onTimeMs()} />
    {:else}
      <!-- From lg the pattern and the chart sit side by side, so the chord's shape is in a laptop's first view. -->
      <div class="lg:flex lg:items-start lg:gap-6">
      {#if strum && phase !== "results"}
        <!-- The strum pattern above the chords: what the hand does, slot by slot, lit on the click. -->
        <div class="relative mb-3 max-w-xl lg:w-[30rem] lg:shrink-0" data-pattern={strum.id}>
          <div class="mb-1.5 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:min-h-11">
            <p class="text-sm"><span class="text-ws-stage-soft">Strum pattern:</span> <span class="font-semibold">{strumName(strum)}</span> <span class="whitespace-nowrap text-ws-stage-soft">(D = down, U = up)</span></p>
            <Verdict kind={lastVerdict?.kind} text={lastVerdict?.text} key={lastVerdict?.key ?? 0} />
            {#if phase === "running" && current >= 0}
              <!-- The change coming, big enough to read mid-strum. -->
              <p class="flex items-baseline gap-2 rounded-xl border-2 border-ws-stage-ink/25 px-3 py-1" data-testid="next-chord">
                <span class="text-sm text-ws-stage-soft">Next</span><span class="font-display text-2xl font-bold leading-none">{chart[current + 1]?.symbol ?? "End"}</span>
              </p>
            {/if}
          </div>
          <StrumSlots slots={row.slots} lit={live || demo ? rowLit : null} marks={rowMarks} legend={!live} label="{strumName(strum)}, one bar: down and up strokes on the count" />
        </div>
      {/if}
      <div class="min-w-0 flex-1">
      <p class="mb-1.5 flex items-center text-sm text-ws-stage-soft lg:min-h-11">Chords</p>
      <ol class="flex flex-wrap gap-1.5" aria-label="Chord chart">
        {#each chart as c, i (i)}
          {@const graded = result?.chords[i]}
          <li
            class="relative flex min-h-16 min-w-16 flex-col justify-between rounded-xl border px-3 py-2 transition-colors {i === current
              ? 'border-transparent bg-instr-strong text-on-instr'
              : 'border-ws-stage-ink/20 bg-ws-stage-ink/5'}"
            style:flex-grow={c.bars}
            aria-current={i === current ? "step" : undefined}
          >
            <span class="font-display text-2xl font-bold leading-none">{c.symbol}</span>
            <span class="text-[13px] {i === current ? '' : 'text-ws-stage-soft'}">
              {#if graded}
                {graded.matched ? "followed" : graded.verification ? "tones off" : "not heard"}
              {:else}
                {c.bars} bar{c.bars > 1 ? "s" : ""}
              {/if}
            </span>
          </li>
        {/each}
      </ol>
      {#if !strum}
        <p class="mt-2 max-w-prose text-sm text-ws-stage-soft">Any strum: what counts is each chord ringing on its bar. Pick a pattern in Setup to practise one.</p>
      {/if}
      </div>
      </div>
    {/if}
    {#if shownShape}
      <div class="mt-3 flex flex-col justify-end" data-dock="instrument"><ShapeBoard shape={shownShape} {tuning} interactive={false} compact label="{chart[shownIndex].symbol} on the {instr} neck" /></div>
    {/if}
    <!-- From lg the chord's tones and the microphone share one row under the neck (the tones first). -->
    <div class="mt-3 flex flex-col gap-3 lg:flex-row-reverse lg:items-center lg:gap-6">
      <div class="lg:min-w-0 lg:flex-1"><MicPanel disabled={live} offer={phase !== "ready"} /></div>
      <div class="grid gap-2 lg:flex lg:max-w-[55%] lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-1">
        <p class="text-sm font-medium">Tones of {chart[shownIndex]?.symbol}{live ? ", against what the microphone hears" : ""}</p>
        <ToneMap expected={tones} heard={live ? listener.live : []} plain={!live} label="Detected tones" name={spell} />
        {#if live}<p class="text-sm text-ws-stage-soft">Heard now: {listener.live.length ? listener.live.map(spell).join(" ") : "nothing"}</p>{/if}
      </div>
    </div>
    <details class="group mt-3 max-w-prose text-sm text-ws-stage-soft">
      <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-ws-stage-ink [&::-webkit-details-marker]:hidden">
        <Info class="size-4" aria-hidden="true" />Why this run doesn't count toward skills
      </summary>
      <p class="pb-1">
        The microphone hears which notes ring after each strum, not which strings rang them. Chord following hasn't been tested on a real {instr} yet. So a run is kept as practice history, with your timing, but doesn't change a skill score.
      </p>
    </details>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <!-- Where in the pattern the misses were: every bar's strokes, marked as the row marked them live. -->
      {#snippet figure()}
        <section aria-labelledby="strum-bars" style="--ws-stage-ink: var(--ws-ink); --ws-stage-soft: var(--ws-soft)">
          <h3 id="strum-bars" class="text-sm font-semibold">Each strum, bar by bar</h3>
          <ol class="mt-2 grid max-w-2xl gap-2">
            {#each barMarks as b, i (b.bar)}
              <li class="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-2">
                <span class="pt-0.5 font-display text-lg font-bold">{b.chord}</span>
                <!-- Under the last bar, the marks' key is the run's tally: the same glyphs, each with its count. -->
                <div><StrumSlots slots={b.slots} marks={b.marks} compact legend={i === barMarks.length - 1} counts={tally ?? undefined} label="Bar {b.bar + 1}, {b.chord}" /></div>
              </li>
            {/each}
          </ol>
        </section>
      {/snippet}
      <Results {summary} figure={barMarks.length && summary.heard !== false ? figure : undefined} />
    {/if}
  {/snippet}
</DrillShell>
