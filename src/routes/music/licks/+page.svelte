<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc, pcOf } from "@repo/music-core";
  import { KEY_CYCLE, LICKS, LICK_CATEGORY_LABEL, cycleTranspose, lickChordAt, lickChunk, lickChunkIn, lickNotes, lickSkills, lickTip, transposeText, type LickNote } from "@repo/music-core/content/piano";
  import { JAZZ, TUNINGS } from "@repo/music-core/data/index";
  import { gradeLick, type LickResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions } from "$lib/music/components/InstrumentStage.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Fretboard, { type FretMark } from "$lib/music/components/Fretboard.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import FallingKeys from "$lib/music/notation/FallingKeys.svelte";
  import { lineScore } from "$lib/music/notation/falling";
  import ViewSwitch from "$lib/music/notation/ViewSwitch.svelte";
  import { page } from "$app/state";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import CatalogPicker from "$lib/music/components/CatalogPicker.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import BeatLane from "$lib/music/drills/piano/BeatLane.svelte";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import Verdict, { type VerdictKind } from "$lib/music/components/Verdict.svelte";
  import { lineOutcomes, timingOf, verdictOf } from "$lib/music/drills/piano/lane-outcomes";
  import { Transport, benchFromUrl, sounding, spanOf, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const TEMPO = { min: 40, max: 220 };
  const CATEGORY_LABEL = LICK_CATEGORY_LABEL;
  const GUITAR = TUNINGS.guitar.find((t) => t.id === "standard") ?? TUNINGS.guitar[0];

  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  // `category` is a setup key, so a category link (the drill's modes) lands on that category's first lick over any saved one.
  // `ear`: the transcription loop. The line is heard, looped and slowed, never shown until the
  // results; showing it (a hint) makes the run practice.
  const cfg = new DrillSetup("licks", { lick: 1, key: "C", category: "" as string, ear: false as boolean });
  const s = $derived(cfg.value);
  const lick = $derived.by(() => {
    const picked = LICKS.find((l) => l.number === s.lick) ?? LICKS[0];
    return s.category && picked.category !== s.category ? (LICKS.find((l) => l.category === s.category) ?? picked) : picked;
  });
  const original = $derived(lickNotes(lick.number));
  const fretted = $derived(original.some((n) => n.string !== undefined));
  const keyName = $derived(fretted || !KEY_CYCLE.includes(s.key) ? "C" : s.key);
  const transpose = $derived(fretted ? 0 : cycleTranspose(keyName));
  const minor = $derived(lick.category.startsWith("minor"));
  // Spelled the way the key's signature is: sharps in sharp keys, flats otherwise.
  const keyFifths = $derived(signatureFor(pcOf(keyName) ?? 0, minor ? "natural-minor" : "major"));
  const sharps = $derived(keyFifths > 0);
  const tx = (text: string) => transposeText(text, transpose, sharps);
  const spell = (m: number) => noteName(m, sharps ? "sharp" : "flat", false);
  const all = $derived(lickNotes(lick.number, transpose));
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));

  // The chunk to hear and play: first and last note, inclusive. Resets with the lick.
  let chunkSel = $state<{ key: string; first: number; last: number } | null>(null);
  const lickKey = $derived(`${lick.number}:${transpose}`);
  const sel = $derived(chunkSel?.key === lickKey ? chunkSel : { first: 0, last: all.length - 1 });
  const first = $derived(sel.first);
  const last = $derived(sel.last);
  const setChunk = (f: number, l: number) => (chunkSel = { key: lickKey, first: f, last: l });
  const lo = $derived(Math.min(first, last, all.length - 1));
  const hi = $derived(Math.min(Math.max(first, last), all.length - 1));
  const chunk = $derived(lickChunk(all, lo, hi));
  const whole = $derived(lo === 0 && hi === all.length - 1);
  const t0 = $derived(all[lo]?.startBeat ?? 0);
  // The lane ends on the beat of the last attack (a held last note doesn't add an empty beat).
  const chunkBeats = $derived(Math.max(1, Math.floor(chunk.reduce((m, n) => Math.max(m, n.startBeat), 0)) + 1));
  /** The chunk as beats on the written lick: tinted on the staff or tab, which shows the whole lick. */
  const chunkRange = $derived(whole ? null : { startBeat: t0, endBeat: all[hi + 1]?.startBeat ?? all[hi].startBeat + all[hi].durationBeats });
  /** Two taps on the staff or tab mark a chunk by its notes. */
  function tapChunk(range: { startBeat: number; endBeat: number }) {
    const c = lickChunkIn(all, range);
    if (!c) return;
    setChunk(c[0], c[1]);
    status = `Chunk set to notes ${c[0] + 1} to ${c[1] + 1}. Loop it, then Start.`;
  }
  /** First and last note of each bar: the chunks offered on the stage. */
  const barChunks = $derived.by(() => {
    const out: [number, number][] = [];
    for (const n of all) {
      const b = Math.floor(n.startBeat / 4);
      if (out[b]) out[b][1] = n.index;
      else out[b] = [n.index, n.index];
    }
    return out.filter(Boolean);
  });

  const timed = $derived<(TimedNote & { index: number })[]>(chunk.map((n) => ({ midi: n.midi, beat: n.startBeat, dur: n.durationBeats, finger: n.finger, index: n.index })));
  const progression = $derived(lick.progression.map(tx));
  // One chord a bar unless the lick gives its chords' lengths (half-bar changes), the last one held.
  const chordAt = (beat: number) => lickChordAt(lick, beat, progression);
  const laneChords = $derived.by(() => {
    const out: { beat: number; symbol: string }[] = [{ beat: 0, symbol: chordAt(t0) }];
    for (let b = Math.ceil(t0 / 2) * 2; b < t0 + chunkBeats; b += 2) if (b > t0 && chordAt(b) !== out[out.length - 1].symbol) out.push({ beat: b - t0, symbol: chordAt(b) });
    return out;
  });
  // The drill plays the line only, so the left-hand textures are left out.
  const techniques = $derived(lick.techniques.flatMap((id) => JAZZ.IMPROV_TECHNIQUES.filter((t) => t.id === id && id !== "lh-textures")));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<LickResult | null>(null);
  let played = $state(0);
  /** The notes played this run, in beats from the downbeat: the lane marks each one as it lands. */
  let hits = $state<{ midi: number; beat: number }[]>([]);
  let verdict = $state<{ kind: VerdictKind; text?: string; key: number } | null>(null);
  const transport = new Transport();
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctxRef: RunContext | null = null;
  /** The demo's playhead on the whole lick (a loop starts over at the chunk each time). */
  const demoCursor = $derived(transport.playing && transport.beat !== null ? (transport.beat % (chunkBeats + 1)) + t0 : null);
  /** Taps choose a chunk only between runs. */
  const picking = $derived(phase !== "running" && phase !== "countin" && !transport.playing);

  const next = $derived<LickNote | undefined>(phase === "running" ? chunk[played] : phase === "ready" || phase === "countin" ? chunk[0] : undefined);
  const lit = $derived(transport.playing ? sounding(timed, transport.beat) : []);
  /** A peek holds for this lick in this key; another lick or key is unseen again. */
  let peekedKey = $state("");
  const peeked = $derived(peekedKey === lickKey);
  /** By ear: no notation, lane or lit keys until the results (or a peek). */
  const hideNotes = $derived(s.ear && !peeked && phase !== "results");
  const showTargets = $derived(mode === "practice" && phase !== "results" && !hideNotes);
  /** Tab marks while running: notes played so far, and the one up next. */
  const tabStates = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (phase === "running") chunk.forEach((_, i) => (i < played ? (out[lo + i] = "correct") : i === played && (out[lo + i] = "active")));
    return out;
  });

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing && !hideNotes) for (const n of lit) out[n.midi] = { demo: true };
    else if (showTargets && next) out[next.midi] = { target: true };
    return out;
  });
  const fretMarks = $derived.by((): FretMark[] => {
    if (transport.playing && hideNotes) return [];
    if (transport.playing) return lit.map((n) => ({ string: chunk.find((c) => c.index === n.index)!.string!, fret: chunk.find((c) => c.index === n.index)!.fret!, label: n.finger ? String(n.finger) : undefined, demo: true }));
    if (!showTargets || !next || next.string === undefined) return [];
    return [{ string: next.string, fret: next.fret!, label: next.finger ? String(next.finger) : undefined, role: "root" }];
  });
  const frets = $derived.by(() => {
    const fs = original.flatMap((n) => (n.fret === undefined ? [] : [n.fret]));
    return fs.length ? { from: Math.max(0, Math.min(...fs) - 1), to: Math.max(...fs) + 1 } : { from: 0, to: 5 };
  });
  const span = $derived(spanOf(all.map((n) => n.midi)));
  // A piano lick written out on the strip's instrument: a staff, or tab in one hand position, an octave up where the stage moves it.
  const inst = $derived(settings.value.activeInstrument);
  const lift = $derived(fitShift(all.map((n) => n.midi), inst));
  const liftedPos = $derived(linePositions(inst, all.map((n) => n.midi + lift)));
  const written = $derived(all.map((n) => ({ midi: n.midi + lift, startBeat: n.startBeat, durationBeats: n.durationBeats, ...liftedPos.get(n.midi + lift) })));
  /** On the piano the lick can fall onto the keys instead, on the run's clock (the chunk starts at t0). */
  const lineShown = $derived(!fretted && !hideNotes && inst === "piano" && (mode === "practice" || transport.playing || phase === "results"));
  const falling = $derived(lineShown && page.url.searchParams.get("view") === "falling");
  const fallBeat = $derived(transport.beat === null ? null : (demoCursor ?? transport.beat + t0));

  const summaryLine = $derived<SetupClause[]>([
    { text: `Lick ${lick.number}, ${CATEGORY_LABEL[lick.category] ?? lick.category}`, focus: "lick" },
    fretted ? { text: progression.join(" ") } : { text: `${progression.join(" ")}${transpose ? ` in ${keyName}` : ""}`, focus: "key" },
    ...(whole ? [] : [{ text: `notes ${lo + 1} to ${hi + 1}` }]),
  ]);
  const setupKey = $derived(`lick:${lick.number}:${transpose}:${lo}-${hi}:${bpm}`);

  async function demo(speed: number, times = 1) {
    if (transport.playing) return transport.stop();
    const gap = chunkBeats + 1;
    const notes = Array.from({ length: times }, (_, r) => timed.map((n) => ({ ...n, beat: n.beat + r * gap }))).flat();
    status = times > 3 ? `Looping ${whole ? "the lick" : `notes ${lo + 1} to ${hi + 1}`} at ${Math.round(speed * 100)}%, ${times} times. Press it again to stop.` : times > 1 ? `Listen: notes ${lo + 1} to ${hi + 1}, three times.` : `Listen: ${whole ? "the whole lick" : `notes ${lo + 1} to ${hi + 1}`}${speed < 1 ? " at half speed" : " at tempo"}.`;
    await transport.demo(notes, bpm, speed);
  }

  /** On time within min(180 ms, a quarter beat), as the grade counts it. */
  const tolBeats = (beatMs: number) => Math.min(180, beatMs / 4) / beatMs;
  let runBeatMs = $state(500);
  const outcomes = $derived(hits.length ? lineOutcomes(timed.map((n) => ({ midi: n.midi, beat: n.beat })), hits, tolBeats(runBeatMs)) : []);

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const want = chunk[played];
    played += 1;
    if (ctxRef) {
      const beat = (e.at - ctxRef.downbeat) / ctxRef.beatMs;
      hits = [...hits, { midi: e.midi, beat }];
      // Practice says how each note landed; Check keeps it for the results.
      if (want && mode === "practice") {
        const o = lineOutcomes([{ midi: want.midi, beat: want.startBeat }], [{ midi: e.midi, beat }], tolBeats(ctxRef.beatMs))[0]!;
        const v = o === "miss" ? { kind: "wrong" as const, text: `Wanted ${spell(want.midi)}, heard ${spell(e.midi)}` } : verdictOf(o, (beat - want.startBeat) * ctxRef.beatMs);
        verdict = { ...v, key: (verdict?.key ?? 0) + 1 };
      }
    }
    if (want && mode === "practice") {
      const ok = pc(e.midi) === pc(want.midi) && (e.string === undefined || want.string === undefined || (e.string === want.string && e.fret === want.fret));
      if (fretted) {
        const key = e.string !== undefined ? e.string * 100 + (e.fret ?? 0) : want.string! * 100 + want.fret!;
        flashes.add(key, ok ? "correct" : "wrong");
      } else flashes.add(e.midi, ok ? "correct" : "wrong");
    }
    // Grading is positional and ignores extras past the phrase: done once every note has a place.
    if (played >= chunk.length) {
      clearTimeout(timer);
      timer = setTimeout(() => void finish(), 350);
    }
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    played = 0;
    hits = [];
    verdict = null;
    runBeatMs = ctx.beatMs;
    flashes.clear();
    ctxRef = ctx;
    run = practice.beginRun({
      exerciseId: "jazz.lick.playback",
      setupKey,
      skillIds: lickSkills(lick.category),
      capabilities: ["harmony"],
      modality: "played",
      assistance: assistanceFor(mode, s.ear && peeked),
      difficulty: Math.min(1, 0.4 + chunk.length / 60 + (lick.category.startsWith("minor-ii") ? 0.15 : 0)),
      instrument: fretted ? "guitar" : settings.value.activeInstrument,
      params: { bpm, lick: lick.number, transpose, first: lo, last: hi, ...(s.ear ? { byEar: true } : {}) },
    });
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    transport.follow(ctx.downbeat, ctx.beatMs);
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + (chunkBeats + 2) * ctx.beatMs);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    ctxRef?.stopClock();
    transport.stop();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const r = gradeLick({ expected: chunk, notes, beatMs: ctxRef!.beatMs, startAt: ctxRef!.downbeat });
    result = r;
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, fretted ? "guitar" : undefined) ?? null,
      target: chunk.map((n) => n.midi),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${r.matched} of ${r.total} notes` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const rows: ResultRow[] = [
      { label: "Notes in order", value: r.score, text: `${r.matched} of ${r.total}` },
      { label: `On time (within ${Math.round(Math.min(180, ctxRef!.beatMs / 4))} ms)`, value: r.matched ? r.onTime / r.total : 0, text: `${r.onTime} of ${r.total}` },
    ];
    if (fretted)
      rows.push(r.positions === null ? { label: "String and fret (MIDI and microphone can't see them)", notMeasured: true } : { label: "String and fret", value: r.positions / r.total, text: `${r.positions} of ${r.total}` });
    const wrong = r.firstWrong === null ? null : chunk[r.firstWrong];
    summary = {
      headline: !r.matched
        ? "No notes matched. Hear it at half speed, then try a chunk."
        : r.correct
          ? mode === "check"
            ? `All ${r.total} notes in order, from memory.`
            : `${r.matched} of ${r.total} in order. Try it in Check with the notes hidden.`
          : `${r.matched} of ${r.total} right. It slipped at note ${lo + (r.firstWrong ?? 0) + 1}${wrong ? `, the ${spell(wrong.midi)}` : ""}.`,
      metric: pct(r.score),
      metricLabel: "notes in order",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode, s.ear && peeked),
      rows,
      advance: notes.some((n) => n.kind === "noteon") ? await advanceAfter(r.score, r.correct) : undefined,
      timing: timingOf(timed.map((_, i) => outcomes[i])),
    };
    status = summary.headline;
  }

  /** The licks carry no tempo: climb to 75% of the top. Piano licks then move round the key cycle; guitar licks stay in their key. */
  function advanceAfter(score: number, correct: boolean) {
    const plan = { bpm, tempo: { min: TEMPO.min, goal: Math.round(TEMPO.max * 0.75), max: TEMPO.max } };
    const keys = fretted ? {} : { steps: KEY_CYCLE.map((k) => ({ label: `Key of ${k}` })), step: Math.max(0, KEY_CYCLE.indexOf(s.key)) };
    return nextRun(`licks.${lick.number}.${lo}-${hi}`, { ...plan, ...keys }, { score, correct }, tempoAnd((i) => cfg.set({ key: KEY_CYCLE[i] })));
  }

  function practiseWindow() {
    if (!result?.practiceWindow) return;
    const [a, b] = result.practiceWindow;
    const base = lo;
    setChunk(base + a, base + b - 1);
    phase = "ready";
    summary = null;
    status = `Chunk set to notes ${base + a + 1} to ${base + b}.`;
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

  const lickItems = LICKS.map((l) => ({ value: l.number, title: `Lick ${l.number}: ${l.progression.join(" ")}`, meta: lickTip(l), group: CATEGORY_LABEL[l.category] ?? l.category, keywords: l.scales.join(" ") }));
</script>

<svelte:head><title>Jazz licks | Woodshed</title></svelte:head>

<DrillShell
  title="Jazz licks"
  hue="piano"
  blurb="Hear a transcribed line over the changes, then play it back. Chunk it, loop it, and move it through the keys."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={chunk.length ? Math.min(1, played / chunk.length) : 0}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={() => demo(1)}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <CatalogPicker label="Lick" setupKey="lick" noun="lick" recentKey="licks" items={lickItems} value={lick.number} onchange={(v) => cfg.set({ lick: v, category: LICKS.find((l) => l.number === v)?.category ?? "" })} />
      {#if fretted}
        <p class="self-end text-sm text-ws-soft">A guitar lick on its fretboard position; it stays in its own key. Lick 31 is lick 30's shape moved to the fifth fret.</p>
      {:else}
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">Key</span>
        <KeyPicker label="Key" value={pcOf(KEY_CYCLE.includes(s.key) ? s.key : "C")!} name={(p) => KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C"} onchange={(p) => cfg.set({ key: KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C" })} />
      </div>
      {/if}
    </div>
    <div class="mt-3">
      <Choice
        label="How you learn it"
        setupKey="ear"
        options={[
          { value: "read", label: "Read and hear" },
          { value: "ear", label: "By ear", hint: "Transcribe it: loop it slowed down, play it back, then move it round the keys. The notes stay hidden until the results." },
        ]}
        value={s.ear ? "ear" : "read"}
        onchange={(v) => cfg.set({ ear: v === "ear" })}
      />
    </div>
    <p class="mt-3 text-sm text-ws-soft">Tempo comes from the practice strip. The licks are written in C; the key moves the line, the chords and the text together.</p>
    {#if !fretted}<p class="mt-1 text-sm text-ws-soft">The licks carry no fingering. Any octave counts; the order is what's graded.</p>{/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Note" value="{Math.min(played + 1, chunk.length)} of {chunk.length}" />
      {#if mode === "practice" && next}<Stat label="Next" value={spell(next.midi)} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <!-- Text first; a long row of bar chunks wraps under it rather than squeezing it. -->
    <div class="mb-3 flex flex-wrap gap-3 text-sm">
      <div class="min-w-0 flex-[1_1_20rem]">
        {#if phase !== "running" && phase !== "countin" && (lineShown)}<ViewSwitch class="float-right mb-1 ml-3" />{/if}
        <p class="font-display text-xl font-semibold">{progression.join("  ")}</p>
        <!-- The reading text steps aside while the line runs, so the lane and the keys stay in view. -->
        {#if phase !== "running" && phase !== "countin"}
          <p class="mt-1"><span class="font-semibold">Tip:</span> {tx(lickTip(lick))}</p>
          <!-- The theory folds away, so the lane, the staff and the keys fit a laptop screen before Start. -->
          <details class="mt-1 text-ws-stage-soft">
            <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 font-medium text-ws-stage-ink [&::-webkit-details-marker]:hidden"><ChevronRight class="size-4 transition-transform [details[open]>summary>&]:rotate-90" aria-hidden="true" />About this lick</summary>
            <p>Scales: {lick.scales.map(tx).join(", ")}.</p>
            {#each techniques as t (t.id)}
              <p class="mt-1"><span class="font-semibold text-ws-stage-ink">{t.name}.</span> {tx(t.summary)}</p>
            {/each}
          </details>
        {/if}
      </div>
      {#if phase !== "running" && phase !== "countin"}
        <div class="flex flex-wrap items-end gap-2 lg:justify-end">
          {#if barChunks.length > 1}
            <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chunk">
              <span class="text-xs text-ws-stage-soft">Chunk</span>
              {#each barChunks as [a, b], i (i)}
                <button type="button" class="min-h-11 rounded-full border px-3 font-medium {lo === a && hi === b ? 'border-transparent bg-instr text-ws-stage' : 'border-ws-stage-ink/25 hover:bg-ws-stage-ink/10'}" aria-pressed={lo === a && hi === b} onclick={() => setChunk(a, b)}>Bar {i + 1}</button>
              {/each}
              <button type="button" class="min-h-11 rounded-full border px-3 font-medium {whole ? 'border-transparent bg-instr text-ws-stage' : 'border-ws-stage-ink/25 hover:bg-ws-stage-ink/10'}" aria-pressed={whole} onclick={() => (chunkSel = null)}>Whole lick</button>
            </div>
          {/if}
          {#if s.ear}
            {#each [0.5, 0.75, 1] as speed (speed)}
              <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => demo(speed, 8)}>Loop at {Math.round(speed * 100)}%</button>
            {/each}
            {#if hideNotes}
              <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => (peekedKey = lickKey)}>Show the notes</button>
            {/if}
          {:else if mode === "practice"}
            <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => demo(0.5)}>Half speed</button>
            {#if whole}
              <span class="text-sm text-ws-stage-soft">{barChunks.length > 1 ? "Pick a bar, or tap two notes on the staff, to loop a chunk." : "Tap two notes on the staff to loop a chunk."}</span>
            {:else}
              <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => demo(1, 3)}>Loop chunk 3 times</button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
    {#if hideNotes}
      <p class="mb-3 rounded-xl bg-ws-stage-ink/8 p-4 text-sm" data-testid="licks-by-ear">
        By ear: loop the {whole ? "lick" : "chunk"} slowed down until you can sing it, find it on your instrument, then Start and play it back. Showing the notes makes the run practice.
      </p>
    {:else}
    <div class="relative">
      <BeatLane
        rows={[{ id: "line", mark: "♪", label: "The line", hand: fretted ? undefined : "right", notes: timed.map((n) => ({ beat: n.beat, dur: n.dur, text: spell(n.midi) })) }]}
        beats={chunkBeats}
        beat={transport.beat}
        chords={laneChords}
        hidden={mode === "check" && !transport.playing}
        outcomes={mode === "practice" || phase === "results" ? { line: outcomes } : {}}
        label="Beat lane: {chunk.length} notes over {progression.join(', ')}."
      />
    </div>
    {/if}
    {#if hideNotes}
      <!-- By ear: nothing written until the results. -->
    {:else if fretted && (mode === "practice" || transport.playing || phase === "results")}
      <div class="mb-3">
        <LineNotation
          notes={all.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, string: n.string, fret: n.fret }))}
          tuning={{ openStrings: GUITAR.openStrings, fretCount: GUITAR.fretCount, name: GUITAR.name }}
          title={lickKey}
          cursorBeat={demoCursor}
          groupStates={tabStates}
          selection={chunkRange}
          onselect={picking ? tapChunk : undefined}
          {bpm}
        />
      </div>
    {:else if falling}
      <FallingKeys score={lineScore(written)} low={span.low} high={span.high} beat={fallBeat} rest={t0} groupStates={tabStates} {marks} {flashes} />
    {:else if !fretted && (mode === "practice" || transport.playing || phase === "results")}
      <div class="mb-3">
        <LineNotation maxZoom={1.3} notes={written} tuning={fretTuning(inst)} title={lickKey} cursorBeat={demoCursor} groupStates={tabStates} {keyFifths} selection={chunkRange} onselect={picking ? tapChunk : undefined} {bpm} />
      </div>
    {/if}
    {#if fretted}
      <Fretboard openStrings={GUITAR.openStrings} from={frets.from} to={frets.to} marks={fretMarks} {flashes} label="Guitar fretboard, standard tuning" />
      <p class="mt-3 text-sm text-ws-stage-soft">
        Numbers on the dots are the authored fingers, never graded. Taps on the fretboard also check the string and fret; MIDI and the microphone only know the pitch.
      </p>
    {:else}
      {#if !falling}
        <div class="flex flex-col justify-end" data-dock="instrument"><div class="relative">
          <InstrumentStage line={all.map((n) => n.midi)} low={span.low} high={span.high} {marks} {flashes} fit />
          {#if verdict && phase === "running"}<Verdict {...verdict} class="absolute inset-x-0 top-3 z-10 flex justify-center" />{/if}
        </div></div>
      {/if}
    {/if}
    {#if mode === "check" && phase !== "results"}<p class="mt-1 text-sm text-ws-stage-soft">Check mode: the notes are hidden. Play the line from memory.</p>{/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if result?.practiceWindow}
            {@const [a, b] = result.practiceWindow}
            <button type="button" class={btn} onclick={practiseWindow}>Practise notes {lo + a + 1} to {lo + b}</button>
          {/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>
