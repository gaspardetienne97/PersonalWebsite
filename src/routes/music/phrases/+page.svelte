<script lang="ts">
  // Popular short phrases on the strip's instrument: hear one, then play it
  // back after the count-in, graded on the notes in order and their timing.
  // Written above the instrument (a staff, or tab on guitar and ukulele).
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc } from "@repo/music-core";
  import { phraseBeats, phraseNotes, phrasesFor, type PhraseInstrument } from "@repo/music-core/content/phrases";
  import { gradeLick, type LickResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fretTuning } from "$lib/music/components/InstrumentStage.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btnStage } from "$lib/music/components/ui";
  import { Transport, benchFromUrl, sounding, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import PadSkills from "$lib/music/drills/pads/PadSkills.svelte";

  const TEMPO = { min: 40, max: 200 };
  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("phrases", { phrase: "" as string });
  const s = $derived(cfg.value);
  const inst = $derived(settings.value.activeInstrument);
  const own = $derived<PhraseInstrument>(inst === "guitar" || inst === "ukulele" || inst === "aerophone" ? inst : "piano");
  const list = $derived(phrasesFor(own));
  const phrase = $derived(list.find((p) => p.id === s.phrase) ?? list[0]);
  const notes = $derived(phrase ? phraseNotes(phrase) : []);
  const beats = $derived(phrase ? Math.ceil(phraseBeats(phrase)) : 4);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const fretted = $derived(own === "guitar" || own === "ukulele");
  const positions = $derived(fretted ? new Map(notes.flatMap((n) => (n.string !== undefined && n.fret !== undefined ? [[n.midi, { string: n.string, fret: n.fret }] as const] : []))) : undefined);
  const timed = $derived<TimedNote[]>(notes.map((n) => ({ midi: n.midi, beat: n.startBeat, dur: n.durationBeats })));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<LickResult | null>(null);
  let played = $state(0);
  const transport = new Transport();
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctxRef: RunContext | null = null;
  let downbeat = $state(0);

  const next = $derived(phase === "running" ? notes[played] : phase === "ready" || phase === "countin" ? notes[0] : undefined);
  const lit = $derived(transport.playing ? sounding(timed, transport.beat) : []);
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) for (const n of lit) out[n.midi] = { demo: true };
    else if (mode === "practice" && phase !== "results" && next) out[next.midi] = { target: true };
    return out;
  });
  const states = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (phase === "running") notes.forEach((_, i) => (i < played ? (out[i] = "correct") : i === played && (out[i] = "active")));
    return out;
  });
  const summaryLine = $derived(phrase ? `${phrase.title} (${phrase.style}) on the ${own}, ${bpm} BPM; it goes at about ${phrase.bpm}` : `No phrases for the ${own} yet`);

  async function demo(speed = 1) {
    if (transport.playing) return transport.stop();
    status = `Listen: ${phrase.title}${speed < 1 ? " at half speed" : ""}.`;
    await transport.demo(timed, bpm, speed);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const want = notes[played];
    played += 1;
    if (want && mode === "practice") flashes.add(fretted && e.string !== undefined ? e.string * 100 + (e.fret ?? 0) : e.midi, pc(e.midi) === pc(want.midi) ? "correct" : "wrong");
    if (played >= notes.length) {
      clearTimeout(timer);
      timer = setTimeout(() => void finish(), 350);
    }
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    played = 0;
    flashes.clear();
    ctxRef = ctx;
    downbeat = ctx.downbeat;
    run = practice.beginRun({
      exerciseId: `repertoire.phrases.${own}`,
      setupKey: `phrase:${phrase.id}:${bpm}`,
      skillIds: [`repertoire.phrases.${own}`],
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: 0.25 + phrase.level * 0.15,
      instrument: own,
      params: { bpm, phrase: phrase.id },
    });
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    transport.follow(ctx.downbeat, ctx.beatMs);
    status = "Play it back.";
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + (beats + 2) * ctx.beatMs);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    ctxRef?.stopClock();
    transport.stop();
    cap?.stop();
    const got = cap?.notes ?? [];
    const r = gradeLick({ expected: notes, notes: got, beatMs: ctxRef!.beatMs, startAt: ctxRef!.downbeat });
    result = r;
    phase = "results";
    await run!.attempt({ promptId: phrase.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: runSource(got), instrument: runInstrument(got, own) ?? null, target: notes.map((n) => n.midi), response: got.filter((n) => n.kind === "noteon").map((n) => n.midi) });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${r.matched} of ${r.total} notes` });
    const rows: ResultRow[] = [
      { label: "Notes in order", value: r.score, text: `${r.matched} of ${r.total}` },
      { label: `On time (within ${Math.round(Math.min(180, ctxRef!.beatMs / 4))} ms)`, value: r.matched ? r.onTime / r.total : 0, text: `${r.onTime} of ${r.total}` },
    ];
    if (fretted) rows.push(r.positions === null ? { label: "String and fret (MIDI and microphone can't see them)", notMeasured: true } : { label: "String and fret", value: r.positions / r.total, text: `${r.positions} of ${r.total}` });
    const wrong = r.firstWrong === null ? null : notes[r.firstWrong];
    const any = got.some((n) => n.kind === "noteon");
    summary = {
      headline: !r.matched ? "No notes matched. Hear it at half speed, then try again." : r.correct ? (mode === "check" ? `All ${r.total} notes, from memory.` : `${r.matched} of ${r.total} in order. Try it in Check with the notes hidden.`) : `${r.matched} of ${r.total} right. It slipped at note ${(r.firstWrong ?? 0) + 1}${wrong ? `, the ${noteName(wrong.midi, phrase.keyFifths < 0 ? "flat" : "sharp", false)}` : ""}.`,
      metric: pct(r.score),
      metricLabel: "notes in order",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows,
      // Up to the phrase's own tempo, then the next phrase for this instrument.
      advance: any ? await nextRun(`phrases.${own}`, { bpm, tempo: { min: TEMPO.min, goal: phrase.bpm, max: TEMPO.max }, steps: list.map((p) => ({ label: p.title, goal: p.bpm, start: Math.max(TEMPO.min, Math.round(p.bpm * 0.75)) })), step: list.indexOf(phrase) }, { score: r.score, correct: r.correct }, tempoAnd((i) => cfg.set({ phrase: list[i].id }))) : undefined,
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

<svelte:head><title>Phrases | Woodshed</title></svelte:head>

{#if inst === "mpc"}
  <PadSkills skill="phrases" modes={[]} onmode={() => {}} />
{:else}
<DrillShell
  title="Phrases"
  hue={own}
  blurb="Popular short phrases for your instrument: famous public-domain melodies and the stock licks of a style. Hear one, then play it back."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={notes.length ? Math.min(1, played / notes.length) : 0}
  clock={{ bpm, beatsPerBar: phrase?.beatsPerBar ?? 4 }}
  ondemo={() => demo(1)}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
  blocked={phrase ? null : "No phrases for this instrument yet."}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice label="Phrase" select options={list.map((p) => ({ value: p.id, label: `${p.title} (${p.style})`, group: `Level ${p.level}` }))} value={phrase?.id ?? ""} onchange={(v) => {
        cfg.set({ phrase: v });
        const p = list.find((x) => x.id === v);
        if (p) settings.update({ bpm: Math.max(TEMPO.min, Math.round(p.bpm * 0.75)) });
      }} />
      <p class="self-end text-sm text-ws-soft">Picking a phrase starts it at three quarters of its tempo. The instrument comes from the practice strip; on MPC pads the phrases are drum phrases.</p>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Note" value="{Math.min(played + 1, notes.length)} of {notes.length}" />
      {#if mode === "practice" && next}<Stat label="Next" value={noteName(next.midi)} />{/if}
    {:else if result}
      <Stat label="In order" value="{result.matched}/{result.total}" tone={result.correct ? "success" : "warn"} />
      <Stat label="On time" value="{result.onTime}/{result.total}" />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phrase}
      <div class="mb-3 flex flex-wrap items-start justify-between gap-3 text-sm" data-testid="phrase" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-beat-ms={Math.round(60000 / bpm)} data-notes={JSON.stringify(notes.map((n) => [n.midi, n.startBeat]))}>
        <div class="min-w-0 max-w-prose">
          <p class="font-display text-xl font-semibold">{phrase.title}</p>
          <p class="text-ws-stage-soft">{phrase.style}. {phrase.why} <span class="whitespace-nowrap">Source: {phrase.source}.</span></p>
        </div>
        {#if phase !== "running" && phase !== "countin" && mode === "practice"}
          <button type="button" class={btnStage} onclick={() => demo(0.5)}>Half speed</button>
        {/if}
      </div>
      {#if mode === "practice" || transport.playing || phase === "results"}
        <div class="mb-3"><LineNotation notes={notes.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, string: n.string, fret: n.fret }))} tuning={fretTuning(own)} title={phrase.id} beatsPerBar={phrase.beatsPerBar}
          meter={phrase.meter} keyFifths={phrase.keyFifths} cursorBeat={transport.beat} groupStates={states} /></div>
      {:else}
        <p class="mb-3 text-sm text-ws-stage-soft">Check mode: the notes are hidden. Hear it, then play it from memory.</p>
      {/if}
      <InstrumentStage instrument={own} line={notes.map((n) => n.midi)} {marks} {flashes} {positions} />
    {:else}
      <p class="text-sm text-ws-stage-soft">No phrases for this instrument yet.</p>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>
{/if}
