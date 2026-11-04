<script lang="ts">
  // Popular short phrases on the strip's instrument: hear one, then play it
  // back after the count-in, graded on the notes in order and their timing.
  // Written above the instrument (a staff, or tab on guitar and ukulele).
  import { onDestroy, onMount } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc } from "@repo/music-core";
  import { phraseBeats, phraseNotes, phrasesFor, userPhrase, type PhraseInstrument, type UserLick } from "@repo/music-core/content/phrases";
  import { gradePhrase, matchEvents, phraseEvents, type PhraseResult } from "@repo/music-core/scoring/phrases";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions, writtenShift } from "$lib/music/components/InstrumentStage.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import { listUserLicks, removeUserLick } from "$lib/music/user-licks";
  import { transposeFifths } from "@repo/music-core/theory/transposition";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import NoteHighway, { highway, viewSwitch, type HighwayNote } from "$lib/music/notation/NoteHighway.svelte";
  import FallingKeys from "$lib/music/notation/FallingKeys.svelte";
  import { assignTab } from "$lib/music/notation/groups";
  import type { Hit } from "$lib/music/notation/highway";
  import { lineScore } from "$lib/music/notation/falling";
  import Verdict, { type VerdictKind } from "$lib/music/components/Verdict.svelte";
  import { timingFromErrors, verdictOf } from "$lib/music/drills/piano/lane-outcomes";
  import ViewSwitch from "$lib/music/notation/ViewSwitch.svelte";
  import { page } from "$app/state";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import CatalogPicker from "$lib/music/components/CatalogPicker.svelte";
  import type { SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { Transport, benchFromUrl, sounding, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";
  import PadSkills from "$lib/music/drills/pads/PadSkills.svelte";

  const TEMPO = { min: 40, max: 200 };
  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  // transpose: your licks only, -5 to +6 semitones.
  const cfg = new DrillSetup("phrases", { phrase: "" as string, transpose: 0 });
  const s = $derived(cfg.value);
  const inst = $derived(settings.value.activeInstrument);
  const own = $derived<PhraseInstrument>(inst === "guitar" || inst === "ukulele" || inst === "aerophone" ? inst : "piano");
  /** Your licks, saved from Learn by ear or a transcription, after the instrument's phrases. */
  let licks = $state.raw<UserLick[]>([]);
  onMount(async () => (licks = await listUserLicks()));
  const list = $derived([...phrasesFor(own), ...licks.map((l) => userPhrase(l, own))]);
  const phrase = $derived(list.find((p) => p.id === s.phrase) ?? list[0]);
  const isUser = $derived(!!phrase?.id.startsWith("user."));
  const transpose = $derived(isUser ? Math.max(-5, Math.min(6, Math.round(Number(s.transpose) || 0))) : 0);
  const fretted = $derived(own === "guitar" || own === "ukulele");
  // Aerophone phrases are written for the fingering chart; the run is concert, what the AE-20 sends.
  // Your licks are concert already (they were played or heard).
  const shift = $derived(own === "aerophone" && !isUser ? writtenShift("aerophone") : 0);
  const base = $derived(phrase ? phraseNotes(phrase).map((n) => (shift ? { ...n, midi: n.midi - shift } : n)) : []);
  // A lick in another key, an octave into the instrument's reach, placed in one hand position on the neck.
  const lift = $derived(isUser ? fitShift(base.map((n) => n.midi + transpose), own) : 0);
  const userAt = $derived(isUser && fretted ? linePositions(own, base.map((n) => n.midi + transpose + lift)) : null);
  const notes = $derived(isUser ? base.map((n) => ({ ...n, midi: n.midi + transpose + lift, ...(userAt?.get(n.midi + transpose + lift) ?? {}) })) : base);
  /** The run counts clicks: a 12/8 phrase clicks each dotted quarter (`click` 1.5). */
  const click = $derived(phrase?.click ?? 1);
  const clicked = $derived(notes.map((n) => ({ ...n, startBeat: n.startBeat / click, durationBeats: n.durationBeats / click })));
  const beats = $derived(phrase ? Math.ceil(phraseBeats(phrase) / click) : 4);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const positions = $derived(fretted ? new Map(notes.flatMap((n) => (n.string !== undefined && n.fret !== undefined ? [[n.midi, { string: n.string, fret: n.fret }] as const] : []))) : undefined);
  /** Notes that start together are one step: a chord or a double stop. */
  const events = $derived(phraseEvents(clicked));
  const spell = (midis: number[]) => midis.map((m) => noteName(m + shift, phrase?.keyFifths < 0 ? "flat" : "sharp", false)).join(" ");
  const chords = $derived(events.some((e) => e.notes.length > 1));
  const timed = $derived<TimedNote[]>(clicked.map((n) => ({ midi: n.midi, beat: n.startBeat, dur: n.durationBeats })));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<PhraseResult | null>(null);
  /** Steps settled so far in the run: right, or with a wrong note in them. */
  let played = $state(0);
  const transport = new Transport();
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctxRef: RunContext | null = null;
  let downbeat = $state(0);

  // The moving views: the highway on guitar and ukulele (every note at its string and fret
  // on the strip's tuning), falling notes over the keys on piano (?view=falling, as the piano drills).
  // A phone draws the one-row staff larger (it scrolls with the cursor), so the noteheads read at arm's length.
  let narrow = $state(false);
  $effect(() => {
    const q = matchMedia("(max-width: 639px)");
    const set = () => (narrow = q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  });
  const phoneZoom = $derived(narrow ? 1.5 : 1);
  const moving = $derived(fretted ? highway.on : own === "piano" && page.url.searchParams.get("view") === "falling");
  const tuning = $derived(fretTuning(own));
  const hwNotes = $derived.by((): HighwayNote[] => {
    if (!tuning) return [];
    const at = assignTab(notes, tuning);
    return notes.flatMap((n, i) => (at[i] ? [{ startBeat: n.startBeat, durationBeats: n.durationBeats, ...at[i]! }] : []));
  });
  /** By event: how far from its beat the step's first note came, or wrong. */
  let eventHits = $state<Record<number, Hit>>({});
  let verdict = $state<{ kind: VerdictKind; text?: string; key: number } | null>(null);
  /** On time within min(180 ms, a quarter beat), as the grade counts it. */
  const onTimeMs = () => Math.min(180, (ctxRef?.beatMs ?? 500) / 4);
  const noteHits = $derived.by(() => {
    const out: Record<number, Hit> = {};
    hwNotes.forEach((n, i) => {
      const e = events.findIndex((x) => Math.abs(x.startBeat * click - n.startBeat) < 1e-6);
      if (eventHits[e] !== undefined) out[i] = eventHits[e];
    });
    return out;
  });
  const pianoLow = $derived(Math.floor((Math.min(...notes.map((n) => n.midi), 60) - 2) / 12) * 12);
  const pianoHigh = $derived(Math.max(pianoLow + 24, Math.ceil((Math.max(...notes.map((n) => n.midi), 60) + 2) / 12) * 12));
  const fallScore = $derived(
    lineScore(
      notes.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, ...(phrase?.split !== undefined ? { hand: n.midi < phrase.split ? ("left" as const) : ("right" as const) } : {}) })),
      { beats: phrase?.beatsPerBar ?? 4, beatUnit: 4 },
    ),
  );

  const next = $derived(phase === "running" ? events[played] : phase === "ready" || phase === "countin" ? events[0] : undefined);
  const lit = $derived(transport.playing ? sounding(timed, transport.beat) : []);
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) for (const n of lit) out[n.midi] = { demo: true };
    else if (mode === "practice" && phase !== "results" && next) for (const n of next.notes) out[n.midi] = { target: true };
    return out;
  });
  /** Staff marks from the heard pitch of each step (the same hits the word above the keys reads), so a
   *  wrong step is never ticked; after the run a step never played is missed. Check keeps them for the results. */
  const states = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (phase === "running" && mode !== "practice") return out;
    if (phase !== "running" && phase !== "results") return out;
    events.forEach((_, i) => {
      const h = eventHits[i];
      if (h === "wrong") out[i] = "wrong";
      else if (typeof h === "number") out[i] = "correct";
      else if (phase === "results") out[i] = "missed";
      else if (i === played) out[i] = "active";
    });
    return out;
  });
  /** Beside Stop on a phone: the step to play now. */
  const cue = $derived(phase === "running" && next ? `${chords ? "Step" : "Note"} ${Math.min(played + 1, events.length)} of ${events.length}${mode === "practice" ? `: ${spell(next.notes.map((n) => n.midi))}` : ", from memory"}` : "");
  const KEYS = Array.from({ length: 12 }, (_, i) => i - 5).map((n) => ({ value: n, label: n === 0 ? "As saved" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`, detail: n === 0 ? undefined : "semitones" }));
  const summaryLine = $derived<SetupClause[] | string>(
    phrase
      ? [{ text: `${phrase.title} (${phrase.style})`, focus: "phrase" }, ...(isUser ? [{ text: transpose ? `moved ${transpose > 0 ? "up" : "down"} ${Math.abs(transpose)} semitones` : "in the key it was saved in", focus: "transpose" }] : []), { text: bpm === phrase.bpm ? `at its own ${bpm} BPM` : `at ${bpm} BPM, the phrase goes at about ${phrase.bpm}` }]
      : `No phrases for the ${own} yet`,
  );
  const items = $derived(list.map((p) => ({ value: p.id, title: p.title, meta: `${p.style}, about ${p.bpm} BPM`, group: p.id.startsWith("user.") ? "Your licks" : `Level ${p.level}`, keywords: p.source })));
  async function removeLick() {
    if (!isUser) return;
    await removeUserLick(phrase.id);
    licks = licks.filter((l) => l.id !== phrase.id);
    cfg.set({ phrase: "" });
    status = "Removed that lick.";
  }
  /** Picking a phrase starts it at three quarters of its own tempo, and says so. */
  function pickPhrase(id: string) {
    cfg.set({ phrase: id });
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const start = Math.max(TEMPO.min, Math.round(p.bpm * 0.75));
    if (start !== bpm) {
      settings.update({ bpm: start });
      status = `Tempo set to ${start} BPM, three quarters of the phrase's ${p.bpm}.`;
    }
  }

  async function demo(speed = 1) {
    if (transport.playing) return transport.stop();
    status = `Listen: ${phrase.title}${speed < 1 ? " at half speed" : ""}.`;
    await transport.demo(timed, bpm, speed);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const want = events[played];
    if (want && mode === "practice") flashes.add(fretted && e.string !== undefined ? e.string * 100 + (e.fret ?? 0) : e.midi, want.notes.some((n) => pc(n.midi) === pc(e.midi)) ? "correct" : "wrong");
    // A step is settled once it is complete or has a wrong note in it.
    const m = matchEvents(events, cap?.notes ?? []);
    const hits: Record<number, Hit> = {};
    m.forEach((x, i) => {
      if (x.at !== null && ctxRef) hits[i] = x.right || x.played.length < events[i].notes.length ? x.at - (ctxRef.downbeat + events[i].startBeat * ctxRef.beatMs) : "wrong";
    });
    eventHits = hits;
    // The word for the step this note answered: on time, early or late by so many ms, or the note it wanted.
    const h = hits[m.findLastIndex((x) => x.at !== null)];
    if (want && mode === "practice" && (h === "wrong" || typeof h === "number")) {
      const v = typeof h === "number" ? verdictOf(Math.abs(h) <= onTimeMs() ? "ok" : h < 0 ? "early" : "late", h) : { kind: "wrong" as const, text: `Wanted ${spell(want.notes.map((n) => n.midi))}, heard ${spell([e.midi])}` };
      verdict = { ...v, key: (verdict?.key ?? 0) + 1 };
    }
    played = m.filter((x, i) => x.right || x.played.some((q) => !events[i].notes.some((n) => pc(n.midi) === pc(q.midi)))).length;
    if (played >= events.length) {
      clearTimeout(timer);
      timer = setTimeout(() => void finish(), 350);
    }
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    played = 0;
    eventHits = {};
    verdict = null;
    flashes.clear();
    ctxRef = ctx;
    downbeat = ctx.downbeat;
    run = practice.beginRun({
      exerciseId: `repertoire.phrases.${own}`,
      setupKey: `phrase:${phrase.id}:${transpose ? `${transpose}:` : ""}${bpm}`,
      skillIds: [`repertoire.phrases.${own}`],
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: 0.25 + phrase.level * 0.15,
      instrument: own,
      params: { bpm, phrase: phrase.id, ...(isUser ? { user: true, transpose } : {}) },
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
    const r = gradePhrase({ events, notes: got, beatMs: ctxRef!.beatMs, startAt: ctxRef!.downbeat });
    result = r;
    phase = "results";
    await run!.attempt({ promptId: phrase.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: runSource(got), instrument: runInstrument(got, own) ?? null, target: notes.map((n) => n.midi), response: got.filter((n) => n.kind === "noteon").map((n) => n.midi) });
    const what = chords ? "steps" : "notes";
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${r.matched} of ${r.total} ${what}` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const rows: ResultRow[] = [
      { label: chords ? "Notes and chords in order" : "Notes in order", value: r.score, text: `${r.matched} of ${r.total}` },
      // Timing is judged on the steps that came in order, so it says how many of those.
      { label: `On time (within ${Math.round(Math.min(180, ctxRef!.beatMs / 4))} ms)`, value: r.matched ? r.onTime / r.matched : 0, text: `${r.onTime} of the ${r.matched} in order` },
    ];
    if (fretted) rows.push(r.positions === null ? { label: "String and fret (MIDI and microphone can't see them)", notMeasured: true } : { label: "String and fret", value: r.positions / r.total, text: `${r.positions} of ${r.total}` });
    const wrong = r.firstWrong === null ? null : events[r.firstWrong];
    const any = got.some((n) => n.kind === "noteon");
    summary = {
      headline: !r.matched
        ? "Nothing matched. Hear it at half speed, then try again."
        : r.correct
          ? mode === "check"
            ? `All ${r.total} ${what}, from memory.`
            : `All ${r.total} ${what} in order.`
          : `${r.matched} of ${r.total} right. It slipped at ${chords ? "step" : "note"} ${(r.firstWrong ?? 0) + 1}${wrong ? `, ${wrong.notes.length > 1 ? `the chord ${spell(wrong.notes.map((n) => n.midi))}` : `the ${spell([wrong.notes[0].midi])}`}` : ""}.`,
      metric: pct(r.score),
      metricLabel: `${what} in order`,
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      rows,
      cleanMeans: `every ${chords ? "step" : "note"} in order`,
      timing: any ? timingFromErrors(events.map((_, i) => (typeof eventHits[i] === "number" ? (eventHits[i] as number) : null)), onTimeMs()) : undefined,
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
  progress={events.length ? Math.min(1, played / events.length) : 0}
  clock={{ bpm, beatsPerBar: (phrase?.beatsPerBar ?? 4) / click }}
  ondemo={() => demo(1)}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
  {cue}
  blocked={phrase ? null : "No phrases for this instrument yet."}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <CatalogPicker label="Phrase" setupKey="phrase" noun="phrase" recentKey="phrases.{own}" {items} value={phrase?.id ?? ""} onchange={pickPhrase} />
      <p class="self-end text-sm text-ws-soft">Picking a phrase starts it at three quarters of its tempo. The instrument comes from the practice strip; on MPC pads the phrases are drum phrases. Save a lick in Learn by ear or from a transcription and it joins the list under Your licks.</p>
      {#if isUser}
        <div class="flex min-w-0 flex-col gap-2 sm:col-span-2" data-setup="transpose">
          <Choice label="Key" options={KEYS} value={transpose} onchange={(v) => cfg.set({ transpose: v })} />
          <button type="button" class="{btn} self-start" onclick={removeLick}>Remove this lick</button>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Step" value="{Math.min(played + 1, events.length)} of {events.length}" />
      {#if mode === "practice" && next}<Stat label="Next" value={spell(next.notes.map((n) => n.midi))} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phrase}
      <div class="mb-3 flex flex-wrap items-start justify-between gap-3 text-sm" data-testid="phrase" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-beat-ms={Math.round(60000 / bpm)} data-notes={JSON.stringify(clicked.map((n) => [n.midi, n.startBeat]))}>
        <div class="min-w-0 max-w-prose">
          <p class="font-display text-xl font-semibold">{phrase.title}</p>
          <!-- The notes take the room while it runs. -->
          {#if phase !== "running" && phase !== "countin"}<p class="text-ws-stage-soft">{phrase.style}. {phrase.why} <span class="whitespace-nowrap">Source: {phrase.source}.</span></p>{/if}
        </div>
        {#if phase !== "running" && phase !== "countin" && mode === "practice"}
          <button type="button" class={btnStage} onclick={() => demo(0.5)}>Half speed</button>
        {/if}
      </div>
      {#if (fretted || own === "piano") && (mode === "practice" || transport.playing) && phase === "ready"}
        <div class="mb-2 flex justify-end">
          {#if fretted}{@render viewSwitch("Tab")}{:else}<ViewSwitch />{/if}
        </div>
      {/if}
      <!-- On a laptop the Aerophone's fingering chart stands beside the staff, so both fit one screen. -->
      <div class={own === "aerophone" ? "flex min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6" : "contents"}>
      <div class="flex min-h-0 flex-col justify-center" data-dock="music">
      {#if moving && (mode === "practice" || transport.playing) && phase !== "results"}
        {@const beat = transport.beat === null ? null : transport.beat * click}
        <div class="mb-3">
          {#if fretted && tuning}
            <NoteHighway notes={hwNotes} strings={tuning.openStrings.map((m) => noteName(m, "flat", false))} {beat} {noteHits} judge={phase === "running"} perfectMs={Math.max(40, Math.round(60000 / bpm / 8))} barBeats={phrase.beatsPerBar} clickBeats={click} />
          {:else}
            <!-- Falling notes bring their own keyboard, lined up lane for key. -->
            <FallingKeys score={fallScore} low={pianoLow} high={pianoHigh} {beat} {marks} {flashes} height="min(34dvh, 16rem)" />
          {/if}
        </div>
      {:else if mode === "practice" || transport.playing || phase === "results"}
        <div class="mb-3"><LineNotation notes={notes.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, string: n.string, fret: n.fret, ...(phrase.split !== undefined ? { hand: n.midi < phrase.split ? ("left" as const) : ("right" as const) } : {}) }))} tuning={fretTuning(own)} title="{phrase.id}{transpose ? `-${transpose}` : ''}" beatsPerBar={phrase.beatsPerBar}
          meter={phrase.meter} keyFifths={transposeFifths(phrase.keyFifths, -shift)} instrument={own} cursorBeat={transport.beat === null ? null : transport.beat * click} groupStates={states} oneRow minZoom={phoneZoom} /></div>
      {:else}
        <!-- Check: the notes stay hidden; a slot a note shows how many are left, and the phrase can be heard again before a run. -->
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3" data-testid="check-progress">
          <div class="flex min-w-0 flex-col gap-2">
            <ol class="flex flex-wrap gap-1.5" aria-hidden="true">
              {#each events as _, i (i)}
                <li class="size-3 rounded-full border-2 {phase === 'running' && i < played ? 'border-ws-stage-ink bg-ws-stage-ink' : phase === 'running' && i === played ? 'border-instr bg-instr/40' : 'border-ws-stage-soft/50'}"></li>
              {/each}
            </ol>
            <p class="text-sm text-ws-stage-soft">
              {phase === "running" ? `${chords ? "Step" : "Note"} ${Math.min(played + 1, events.length)} of ${events.length}. Play it from memory.` : `Check: the notes are hidden. ${events.length} ${chords ? "steps" : "notes"}: hear it, then play it from memory.`}
            </p>
          </div>
          {#if phase !== "running" && phase !== "countin"}
            <button type="button" class={btnStage} onclick={() => demo(1)}>Hear it again</button>
          {/if}
        </div>
      {/if}
      </div>
      {#if !(moving && !fretted && (mode === "practice" || transport.playing) && phase !== "results")}
        <div class="flex flex-col" data-dock="instrument">
          <!-- The word for the last note has its own row between the music and the instrument, never over it. -->
          {#if phase === "running" && mode === "practice"}<Verdict kind={verdict?.kind} text={verdict?.text} key={verdict?.key ?? 0} rail />{/if}
          <InstrumentStage instrument={own} line={notes.map((n) => n.midi)} {marks} {flashes} {positions} />
        </div>
      {/if}
      </div>
    {:else}
      <p class="text-sm text-ws-stage-soft">No phrases for this instrument yet.</p>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} {figure} />{/if}
  {/snippet}
</DrillShell>
{/if}

<!-- The phrase as you played it: each step marked right, wrong or missed on the staff or tab. -->
{#snippet figure()}
  {#if phrase && result && Object.keys(eventHits).length}
    <div class="stage rounded-2xl p-3">
      <p class="mb-2 text-sm font-medium text-ws-stage-soft">Where each {chords ? "step" : "note"} landed</p>
      <LineNotation notes={notes.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, string: n.string, fret: n.fret, ...(phrase.split !== undefined ? { hand: n.midi < phrase.split ? ("left" as const) : ("right" as const) } : {}) }))} tuning={fretTuning(own)} title="{phrase.id}{transpose ? `-${transpose}` : ''}-run" beatsPerBar={phrase.beatsPerBar}
        meter={phrase.meter} keyFifths={transposeFifths(phrase.keyFifths, -shift)} instrument={own} groupStates={states} oneRow />
    </div>
  {/if}
{/snippet}
