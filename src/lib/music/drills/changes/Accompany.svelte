<script lang="ts">
  import { CHANGES_TITLE, changesTrainer, shortStage } from "./modes";
  import { TimedRun } from "./timed-run";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  // Accompaniment (piano path drill 1, jazz rank 2, piano drill 3): hand patterns,
  // comping and lead sheets over a chord chart in any key, every slot graded on
  // its pitch classes and its timing (gradeAccompaniment).
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import type { NoteEvent, Score } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { FLAT_NAMES, pc } from "@repo/music-core/theory/notes";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { JAM_GROUPS, barBeats, chorusBars, transposeProgression } from "@repo/music-core/content/jam";
  import { TUNES, formatReharm, parseReharm, reharmDevice, reharmonise } from "@repo/music-core/content/tunes";
  import { backingNotes } from "$lib/music/drills/jam/backing";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import {
    ACCOMP_PATTERNS,
    ACCOMP_PROGRESSIONS,
    CHART_LEVELS,
    LEAD_LEVELS,
    chartProgression,
    isChartLevel,
    isLeadLevel,
    jazzLeadSheet,
    compRhythmsFor,
    COMP_VOICINGS,
    LEAD_LEFT,
    LEAD_SHEETS,
    PATTERN_GROUPS,
    chartOf,
    compingRendering,
    generatedLeadSheet,
    leadSheetFromScore,
    leadSheetRendering,
    patternRendering,
    type AccompSlot,
    type HandChoice,
    type LeadLeft,
    type LeadSheet,
    type Rendering,
    wholeBars,
  } from "@repo/music-core/content/accompany";
  import { gradeAccompaniment, type AccompanimentResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import StaffFold from "$lib/music/notation/StaffFold.svelte";
  import LineNotation from "$lib/music/notation/LineNotation.svelte";
  import FallingKeys from "$lib/music/notation/FallingKeys.svelte";
  import { lineScore } from "$lib/music/notation/falling";
  import ViewSwitch from "$lib/music/notation/ViewSwitch.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import BeatLane, { type LaneRow } from "$lib/music/drills/piano/BeatLane.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
    import { Transport, benchFromUrl, sounding, spanOf, swingBeat, type TimedNote } from "$lib/music/drills/piano/transport.svelte";
  import { modeFrom, openMode } from "$lib/music/drills/guitar/modes";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, pct, runInstrument, runSource } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, db, midi, settings, type SequenceHandle } from "$lib/music/runtime";
  import { goto } from "$app/navigation";
  import { nextRun } from "$lib/music/advance.svelte";
  import { timingRow } from "@repo/music-core";

  const TEMPO = { min: 40, max: 180 };
  const ENTRY = catalogEntry("accompany")!;
  // "Comping" is also its own drill: this tab says what it adds, as the Drills list does.
  const TABS = ENTRY.modes.map((m) => ({ id: m.id, label: m.id === "comping" ? "Comping over changes" : m.label }));
  const tab = $derived(modeFrom(TABS, page.url.searchParams.get("mode")) as "patterns" | "comping" | "lead-sheet");
  const drillMode = $derived(ENTRY.modes.find((m) => m.id === tab)!);

  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("accompany", {
    pattern: "root-fifth-octave",
    progression: "pop-axis",
    transpose: 0,
    hands: "both",
    voicing: "shells",
    rhythm: "whole",
    feel: "swing",
    tune: "twinkle",
    lh: "roots",
    seed: 1,
    meter: 4,
    band: "click",
    choruses: 1,
    reharm: "",
  });
  const s = $derived(cfg.value);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  // Hand patterns and generated melodies need one chord a bar; comping takes half-bar changes too.
  // Comping also takes the tune player's standards (half-bar changes, 3/4).
  const pool = $derived(tab === "comping" ? [...ACCOMP_PROGRESSIONS, ...TUNES] : ACCOMP_PROGRESSIONS.filter(wholeBars));
  // A generated chart (chart-1 to chart-3) is drawn afresh from the seed; New chart moves it.
  const charted = $derived(isChartLevel(s.progression));
  const base = $derived(charted ? chartProgression(s.progression, s.seed) : (pool.find((p) => p.id === s.progression) ?? pool[0]));
  /** A melody the app writes over the progression: a plain one, or a jazz head (lead-1, lead-2). */
  const jazzHead = $derived(isLeadLevel(s.tune));
  const genTune = $derived(s.tune === "generated" || jazzHead);
  const pattern = $derived(ACCOMP_PATTERNS.find((p) => p.id === s.pattern) ?? ACCOMP_PATTERNS[0]);
  const voicing = $derived(COMP_VOICINGS.find((v) => v.id === s.voicing) ?? COMP_VOICINGS[0]);
  /** Comping's chart: the meter (3 for a waltz), Jam's reharmonisation swaps, and how many times through. */
  const bpb = $derived(tab === "comping" && s.meter === 3 ? 3 : 4);
  const swaps = $derived(tab === "comping" ? parseReharm(s.reharm) : new Map());
  const compProg = $derived({ ...reharmonise(base, swaps), beatsPerBar: bpb });
  const compChoruses = $derived([1, 2, 4].includes(s.choruses) ? s.choruses : 1);
  const rhythms = $derived(compRhythmsFor(bpb));
  const rhythm = $derived(rhythms.find((r) => r.id === s.rhythm) ?? rhythms[0]);
  const hands = $derived((["both", "left", "right"].includes(s.hands) ? s.hands : "both") as HandChoice);
  const lh = $derived((LEAD_LEFT.find((l) => l.id === s.lh)?.id ?? "roots") as LeadLeft);

  // Your own scores with chord symbols (MusicXML <harmony>) join the lead sheets; a shelf score
  // keeps its shelf key in the run, so the tune ladder can read it.
  let library = $state<LeadSheet[]>([]);
  let shelfOf = $state<Record<string, string>>({});
  onMount(() => {
    void db.songs.toArray().then((rows) => {
      library = rows.flatMap((r) => {
        const sheet = r.score ? leadSheetFromScore(r.score as Score) : null;
        return sheet ? [{ ...sheet, id: `song-${r.id}`, title: r.title }] : [];
      });
      shelfOf = Object.fromEntries(rows.flatMap((r) => ((r as { shelf?: string }).shelf ? [[`song-${r.id}`, (r as { shelf?: string }).shelf!]] : [])));
    });
  });
  const tunes = $derived<{ value: string; label: string; group: string }[]>([
    ...LEAD_SHEETS.map((t) => ({ value: t.id, label: t.title, group: "Lead sheets" })),
    { value: "generated", label: "A new melody over the progression", group: "Generated" },
    ...LEAD_LEVELS.map((l) => ({ value: l.id, label: l.label, group: "Generated" })),
    ...library.map((t) => ({ value: t.id, label: t.title, group: "Your songs with chord symbols" })),
  ]);
  const sheet = $derived<LeadSheet>(
    jazzHead ? jazzLeadSheet(s.tune, base, 0, s.seed) : s.tune === "generated" ? generatedLeadSheet(base, 0, s.seed) : ([...LEAD_SHEETS, ...library].find((t) => t.id === s.tune) ?? LEAD_SHEETS[0]),
  );
  /** The written key the key picker moves from. */
  const writtenKey = $derived(tab === "lead-sheet" && !genTune ? sheet.keyPc : base.keyPc);
  const keyPc = $derived(pc(writtenKey + s.transpose));
  const minor = $derived(tab !== "lead-sheet" || genTune ? /minor/.test(base.key) : false);

  const full = $derived.by((): Rendering => {
    if (tab === "comping") return compingRendering(chartOf(compProg, s.transpose, compChoruses), voicing.id, rhythm.id, s.feel === "swing", bpb);
    if (tab === "lead-sheet") {
      // A jazz head is written straight and played swung.
      if (jazzHead) return { ...leadSheetRendering(jazzLeadSheet(s.tune, base, s.transpose, s.seed), lh, 0, hands), swing: true };
      return s.tune === "generated" ? leadSheetRendering(generatedLeadSheet(base, s.transpose, s.seed), lh, 0, hands) : leadSheetRendering(sheet, lh, s.transpose, hands);
    }
    return patternRendering(chartOf(base, s.transpose), pattern.id, hands);
  });
  /** The results' fix for a weak bar: that one bar, played four times. Any setup change goes back to the whole chart. */
  let loopBar = $state<number | null>(null);
  const LOOPS = 4;
  $effect(() => {
    void full;
    loopBar = null;
  });
  const rendering = $derived.by((): Rendering => {
    if (loopBar === null) return full;
    const from = loopBar * bpb;
    const to = from + bpb;
    const times = Array.from({ length: LOOPS }, (_, k) => k * bpb - from);
    return {
      ...full,
      beats: LOOPS * bpb,
      slots: times.flatMap((d) => full.slots.filter((sl) => sl.beat >= from && sl.beat < to).map((sl) => ({ ...sl, beat: sl.beat + d }))),
      chart: times.flatMap((d) =>
        full.chart
          .filter((c) => c.startBeat < to && c.startBeat + c.durationBeats > from)
          .map((c) => {
            const a = Math.max(from, c.startBeat);
            return { ...c, startBeat: a + d, durationBeats: Math.min(to, c.startBeat + c.durationBeats) - a };
          }),
      ),
    };
  });
  const slots = $derived(rendering.slots);
  const totalBeats = $derived(rendering.beats);
  const feel = (b: number) => (rendering.swing ? swingBeat(b) : b);

  const notes = $derived<TimedNote[]>(
    slots.flatMap((sl) => sl.midi.map((midi) => ({ midi, beat: feel(sl.beat), dur: sl.dur, hand: sl.hand, velocity: sl.hand === "right" ? 0.8 : 0.6 }))),
  );
  // A lead sheet shows its melody (the top of each right-hand slot); the rest is read from the symbols.
  const written = $derived(
    tab === "lead-sheet"
      ? slots.filter((sl) => sl.hand === "right").map((sl) => ({ midi: Math.max(...sl.midi), startBeat: sl.beat, durationBeats: sl.dur }))
      : slots.flatMap((sl) => sl.midi.map((midi) => ({ midi, startBeat: sl.beat, durationBeats: sl.dur, hand: sl.hand }))),
  );
  const span = $derived(spanOf(notes.map((n) => n.midi)));
  const tight = $derived(spanOf(notes.map((n) => n.midi), 0, false));
  const falling = $derived(page.url.searchParams.get("view") === "falling");
  /** Check's rhythm guide, the same R/L lane Comping draws: one chip a slot, the notes hidden. */
  const checkLanes = $derived<LaneRow[]>(
    (["right", "left"] as const)
      .map((h) => ({ id: h, mark: h === "left" ? "L" : "R", label: h === "left" ? "Left hand" : "Right hand", hand: h, notes: slots.filter((sl) => sl.hand === h).map((sl) => ({ beat: feel(sl.beat), dur: sl.dur, text: "" })) }))
      .filter((r) => r.notes.length),
  );
  const fallScore = $derived(lineScore(notes.map((n) => ({ midi: n.midi, startBeat: n.beat, durationBeats: n.dur, hand: n.hand })), { beats: bpb, beatUnit: 4 }));
  // Written as Jam writes the key: a blues in its mixolydian (C7's Bb reads as a flat).
  const scaleKind = $derived(tab === "lead-sheet" && !genTune ? "major" : minor ? "natural-minor" : /dorian/.test(base.key) ? "dorian" : base.group === "blues" ? "mixolydian" : "major");
  const keyFifths = $derived(signatureFor(keyPc, scaleKind));
  const chordNow = $derived.by(() => {
    const b = Math.max(0, transport.beat ?? 0);
    const i = rendering.chart.findIndex((c) => b >= c.startBeat && b < c.startBeat + c.durationBeats);
    return Math.max(0, i);
  });

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<AccompanimentResult | null>(null);
  let downbeat = $state(0);
  let beatMs = $state(1000);
  const transport = new Transport();
  const timedRun = new TimedRun(transport);
  const flashes = new Flashes();
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let band: SequenceHandle | null = null;
  const stopBand = () => {
    band?.stop();
    band = null;
  };

  /** Beside Stop on a phone: the bar and the chord to play now. */
  const cue = $derived(
    phase === "running" && transport.beat !== null && transport.beat >= 0
      ? `Bar ${Math.min(totalBeats / bpb, Math.floor(transport.beat / bpb) + 1)} of ${totalBeats / bpb}: ${rendering.chart[chordNow]?.symbol ?? ""}${mode === "check" ? ", notes hidden" : ""}`
      : "",
  );

  const markFor = (hand: "left" | "right" | undefined, demo: boolean): CellMarks => ({ [demo ? "demo" : "target"]: true, label: hand === "left" ? "L" : "R", role: hand });
  const due = (b: number) => slots.filter((sl) => b >= feel(sl.beat) - 0.25 && b < feel(sl.beat) + Math.min(0.5, sl.dur));
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(notes, transport.beat)) out[n.midi] = markFor(n.hand, true);
      return out;
    }
    if (mode !== "practice" || phase === "results") return out;
    const live = phase === "running" || phase === "countin";
    const now: AccompSlot[] = live ? due(Math.max(0, transport.beat ?? 0)) : slots.filter((sl) => sl.beat === slots[0]?.beat);
    for (const sl of now) for (const m of sl.midi) out[m] = markFor(sl.hand, false);
    return out;
  });

  const handsText = $derived(hands === "both" ? "both hands" : `${hands} hand only`);
  const keyText = $derived(`${FLAT_NAMES[keyPc]}${minor ? " minor" : ""}`);
  const loopClause = $derived<SetupClause[]>(loopBar === null ? [] : [{ text: `bar ${loopBar + 1} only, ${LOOPS} times` }]);
  const summaryLine = $derived<SetupClause[]>([...loopClause, ...(
    tab === "comping"
      ? [
          { text: `${voicing.label} on ${rhythm.label.toLowerCase()}`, focus: "voicing" },
          { text: `over ${base.name} in ${keyText}`, focus: "progression" },
          { text: rendering.swing ? "swung" : "straight", focus: "feel" },
          ...(bpb === 3 ? [{ text: "in 3/4", focus: "meter" }] : []),
          ...(compChoruses > 1 ? [{ text: `${compChoruses} times through`, focus: "choruses" }] : []),
          ...(s.band === "rhythm" ? [{ text: "with drums and bass", focus: "band" }] : []),
          ...(swaps.size ? [{ text: `${swaps.size} chord${swaps.size === 1 ? "" : "s"} reharmonised`, focus: "progression" }] : []),
        ]
      : tab === "lead-sheet"
        ? [
            { text: s.tune === "generated" ? `a new melody over ${base.name}` : jazzHead ? `${LEAD_LEVELS.find((l) => l.id === s.tune)!.label.toLowerCase()} over ${base.name}` : sheet.title, focus: "tune" },
            { text: `in ${keyText}`, focus: "key" },
            { text: LEAD_LEFT.find((l) => l.id === lh)!.label.toLowerCase(), focus: "lh" },
            ...(hands === "both" ? [] : [{ text: handsText, focus: "hands" }]),
          ]
        : [
            { text: pattern.label, focus: "pattern" },
            { text: `over ${base.name} in ${keyText}`, focus: "progression" },
            ...(hands === "both" ? [] : [{ text: handsText, focus: "hands" }]),
          ]
  )]);
  const runParams = $derived<Record<string, string | number>>(
    tab === "comping"
      ? { bpm, voicing: voicing.id, rhythm: rhythm.id, feel: s.feel, progression: base.id, key: keyPc, meter: bpb, choruses: compChoruses, band: s.band, ...(swaps.size ? { reharm: reharmDevice(swaps)!, swaps: formatReharm(swaps) } : {}) }
      : tab === "lead-sheet"
        ? { bpm, tune: jazzHead ? s.tune : s.tune === "generated" ? `generated-${base.id}` : sheet.id, lh, hands, key: keyPc, ...(charted ? { progression: base.id } : {}), ...(shelfOf[sheet.id] && !genTune ? { shelf: shelfOf[sheet.id] } : {}), ...(s.transpose ? { transpose: s.transpose } : {}) }
        : { bpm, pattern: pattern.id, progression: base.id, hands, key: keyPc },
  );
  const setupKey = $derived(`accompany:${tab}:${Object.values(runParams).join(":")}${loopBar === null ? "" : `:bar${loopBar + 1}`}`);

  function pickKey(target: number) {
    let t = (target - writtenKey) % 12;
    if (t > 6) t -= 12;
    if (t < -6) t += 12;
    cfg.set({ transpose: t });
  }

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = "Demo playing, not scored: both hands at tempo, in step with the chart.";
    await transport.demo(notes, bpm);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running" || mode !== "practice") return;
    const hit = due(transport.beat ?? 0).some((sl) => sl.midi.some((m) => pc(m) === pc(e.midi)));
    flashes.add(e.midi, hit ? "correct" : "wrong");
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    flashes.clear();
    downbeat = ctx.downbeat;
    beatMs = ctx.beatMs;
    run = practice.beginRun({
      exerciseId: drillMode.exerciseId,
      setupKey,
      skillIds: drillMode.skillIds,
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, (tab === "patterns" ? 0.3 + pattern.n / 40 : 0.55) + (bpm - 70) / 300),
      instrument: "piano",
      params: loopBar === null ? runParams : { ...runParams, loopBar: loopBar + 1 },
    });
    timedRun.begin(ctx, totalBeats + 1, onNote, () => void finish(ctx));
    // Comping over a band: drums and bass from the downbeat, as many times as the chart runs.
    if (tab === "comping" && s.band === "rhythm" && loopBar === null) {
      const p = transposeProgression(compProg, s.transpose);
      const times = Math.ceil(totalBeats / (chorusBars(p) * barBeats(p)) - 1e-9);
      void audio.unlock().then(() => (band = audio.playSequence(backingNotes({ ...p, feel: rendering.swing ? "swing" : "straight" }, { bpm, mode: "rhythm", choruses: times }), { startPerf: ctx.downbeat })));
    }
  }

  async function finish(ctx: RunContext) {
    if (phase !== "running" && phase !== "countin") return;
    stopBand();
    const played = timedRun.end(true);
    const r = gradeAccompaniment({ slots, splitMidi: rendering.splitMidi, swing: rendering.swing, beatMs: ctx.beatMs, startAt: ctx.downbeat, notes: played, beatsPerBar: bpb });
    result = r;
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
    const chordsOff = r.notMeasured.includes("chords");
    const weak = r.hands.slice().sort((a, b) => a.matched / a.total - b.matched / b.total)[0];
    const rows: ResultRow[] = r.hands.map((h) => ({
      label: `${h.hand === "left" ? "Left" : "Right"} hand${tab === "lead-sheet" && h.hand === "right" ? ", the melody" : ""}`,
      value: h.matched / h.total,
      text: `${h.matched} of ${h.total}`,
    }));
    // Timing speaks only when enough slots landed to judge it (K3), and says how many it is from.
    rows.push(timingRow(r.metrics.flatMap((m) => (m.kind === "timing" ? [m.errorMs] : [])), r.hands.reduce((t, h) => t + h.total, 0), r.windowMs));
    if (chordsOff) rows.push({ label: "Chords (on-screen input)", notMeasured: true });
    summary = {
      headline: r.correct
        ? `Clean at ${bpm} BPM: ${r.hands.map((h) => `${h.matched} of ${h.total} ${h.hand}-hand`).join(", ")}.`
        : r.weakBar !== null && weak && weak.matched < weak.total
          ? `The ${weak.hand} hand found ${weak.matched} of ${weak.total}. Bar ${r.weakBar + 1} lost the most.${loopBar === null ? " Loop it on its own." : ""}`
          : `Every chord landed, but the timing wandered. Keep your hands on the click.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      cleanMeans: "every chord on its beat",
      rows,
      // The headline's fix as one button: that bar on its own, four times (back on the ready screen).
      coach:
        !r.correct && loopBar === null && r.weakBar !== null && weak && weak.matched < weak.total
          ? { label: `Loop bar ${r.weakBar + 1}`, run: () => ((loopBar = r.weakBar), (phase = "ready"), (status = `Bar ${r.weakBar! + 1} on its own, ${LOOPS} times. Here it comes.`)) }
          : undefined,
      // A looped bar is a fix, not a step on the tempo ladder.
      advance: loopBar !== null ? undefined : await nextRun(`accompany.${tab}.${tab === "patterns" ? pattern.id : tab === "comping" ? voicing.id : lh}`, { bpm, tempo: { min: 50, goal: 100, max: TEMPO.max } }, r),
    };
    status = summary.headline;
  }

  function stop() {
    stopBand();
    timedRun.end();
    phase = "ready";
    status = "Stopped. Nothing saved.";
  }

  /** The staff is on screen (not the falling view): the chart rides in its fold row. */
  const staffHasChart = $derived(
    !(falling && (mode === "practice" || transport.playing || phase === "results")) && (tab === "lead-sheet" || mode === "practice" || transport.playing || phase === "results"),
  );

  onDestroy(() => {
    stopBand();
    timedRun.end();
  });

  const progressionOptions = $derived([
    ...CHART_LEVELS.map((l) => ({ value: l.id, label: l.label, group: "Generated charts" })),
    ...JAM_GROUPS.flatMap((g) => pool.filter((p) => p.group === g.id).map((p) => ({ value: p.id, label: p.name, group: g.label }))),
  ]);
  const handOptions = [
    { value: "both", label: "Both hands" },
    { value: "left", label: "Left only" },
    { value: "right", label: "Right only" },
  ];
  const blurb = $derived(
    tab === "comping"
      ? "Comp through the changes on a rhythm: shells or rootless voicings, every chord scored in any octave."
      : tab === "lead-sheet"
        ? "Read the melody and the chord symbols: the tune in the right hand, the chords in the left."
        : "A left- and right-hand pattern over a chord loop. Any inversion counts. The rhythm has to land.",
  );
</script>

<DrillShell
  lesson={tab === "lead-sheet" ? { lessons: conceptCard("accompany.chord-symbols"), trigger: "check" } : null}
  title={CHANGES_TITLE}
  trainer={changesTrainer("accompany")}
  hue="piano"
  {blurb}
  summary={summaryLine}
  tabs={TABS}
  {tab}
  ontab={(id) => openMode(TABS, id)}
  bind:phase
  bind:mode
  bind:status
  progress={transport.beat === null ? 0 : Math.min(1, Math.max(0, transport.beat / totalBeats))}
  clock={{ bpm, beatsPerBar: bpb }}
  ondemo={playDemo}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
  {cue}
  requires={midi.inputs.length ? [] : [{ text: "chords on MIDI", action: { label: "Connect a MIDI keyboard (on-screen keys play one note at a time, so only single notes are scored)", run: () => goto("/music/connect") } }]}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if tab === "patterns"}
        <Choice
          label="Pattern"
          setupKey="pattern"
          options={PATTERN_GROUPS.flatMap((g) => ACCOMP_PATTERNS.filter((p) => p.group === g.id).map((p) => ({ value: p.id, label: p.label, hint: p.about, group: g.label })))}
          value={pattern.id}
          onchange={(v) => cfg.set({ pattern: v })}
        />
      {:else if tab === "comping"}
        <Choice label="Voicing" setupKey="voicing" options={COMP_VOICINGS.map((v) => ({ value: v.id, label: v.label, hint: v.about }))} value={voicing.id} onchange={(v) => cfg.set({ voicing: v })} />
        <Choice label="Rhythm" setupKey="rhythm" options={rhythms.map((r) => ({ value: r.id, label: r.label, hint: r.about }))} value={rhythm.id} onchange={(v) => cfg.set({ rhythm: v })} />
        <Choice
          label="Meter"
          setupKey="meter"
          options={[
            { value: 4, label: "4/4" },
            { value: 3, label: "3/4 waltz" },
          ]}
          value={bpb}
          onchange={(v) => cfg.set({ meter: v })}
        />
        <Choice
          label="Band"
          setupKey="band"
          options={[
            { value: "click", label: "Click only" },
            { value: "rhythm", label: "Drums and bass", hint: "A swing (or straight) groove with the bass on the roots, for you to comp over." },
          ]}
          value={s.band}
          onchange={(v) => cfg.set({ band: v })}
        />
        <Choice label="Times through" setupKey="choruses" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={compChoruses} onchange={(v) => cfg.set({ choruses: v })} />
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
      {:else}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="tune">
          <span class="font-medium">Tune</span>
          <Picker label="Tune" value={s.tune} options={tunes} onchange={(v) => cfg.set({ tune: v, transpose: 0, ...(isLeadLevel(v) && base.group !== "jazz" ? { progression: "ii-v-i" } : {}) })} />
          <span class="text-ws-soft">{s.tune === "generated" ? "Chord tones on 1 and 3, steps between." : jazzHead ? `${LEAD_LEVELS.find((l) => l.id === s.tune)!.about} Written straight, played swung` : sheet.source}. Import a MusicXML lead sheet in Studio and it appears here.</span>
        </div>
        <Choice label="Left hand" setupKey="lh" options={LEAD_LEFT.map((l) => ({ value: l.id, label: l.label, hint: l.about }))} value={lh} onchange={(v) => cfg.set({ lh: v })} />
      {/if}
      {#if tab !== "lead-sheet" || genTune}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="progression">
          <span class="font-medium">Progression</span>
          <Picker label="Progression" value={base.id} options={progressionOptions} onchange={(v) => cfg.set({ progression: v, transpose: 0, reharm: "", meter: pool.find((p) => p.id === v)?.beatsPerBar ?? 4 })} />
          <span class="text-ws-soft">{charted ? `${CHART_LEVELS.find((l) => l.id === base.id)!.about} A new chart each time you press New chart` : `${(tab === "comping" ? compProg : base).chords.map((c) => c.symbol).join(" ")}, written in ${base.key}${base.song ? `. ${base.song.artist}` : ""}${swaps.size ? ", reharmonised in Jam" : ""}`}.</span>
        </div>
      {/if}
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">Key</span>
        <KeyPicker label="Key" value={keyPc} onchange={pickKey} name={(k) => `${FLAT_NAMES[k]}${k === writtenKey ? " (written)" : ""}`} />
      </div>
      {#if tab !== "comping"}
        <Choice label="Hands" setupKey="hands" options={handOptions} value={hands} onchange={(v) => cfg.set({ hands: v })} />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">Set the tempo in the top bar. Any inversion or octave of a chord counts. Extra notes don't lower your score.</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <Stat label="Bar" value="{Math.min(totalBeats / bpb, Math.floor(Math.max(0, transport.beat) / bpb) + 1)} of {totalBeats / bpb}" />
      {#if tab === "comping" && s.band === "rhythm" && loopBar === null}<Stat label="Band" value="Bass and drums playing" />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if phase !== "running" && phase !== "countin" && (mode === "practice" || phase === "results")}<ViewSwitch class="float-right mb-2 ml-3" />{/if}
    <div
      data-testid="accompany"
      data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined}
      data-beat-ms={Math.round(beatMs)}
      data-slots={JSON.stringify(slots.map((sl) => [sl.beat, sl.midi]))}
    >
      <div class="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-ws-stage-soft">Now</p>
          <p class="font-display text-4xl font-bold leading-none">{rendering.chart[chordNow]?.symbol}</p>
        </div>
        {#if phase !== "running" && phase !== "countin"}
          <p class="max-w-prose text-sm text-ws-stage-soft">
            {tab === "comping" ? `${voicing.about} ${rhythm.about}` : tab === "lead-sheet" ? LEAD_LEFT.find((l) => l.id === lh)!.about : pattern.about}
          </p>
        {/if}
        {#if loopBar !== null && phase !== "running" && phase !== "countin"}
          <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => (loopBar = null)}>Whole chart</button>
        {/if}
        {#if ((tab === "lead-sheet" && genTune) || charted) && phase !== "running" && phase !== "countin"}
          <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => cfg.set({ seed: s.seed + 1 })}>{charted ? "New chart" : "New melody"}</button>
        {/if}
      </div>
      {#if !staffHasChart}<div class="mb-3 flex">{@render chart()}</div>{/if}
      {#if falling && (mode === "practice" || transport.playing || phase === "results")}
        <FallingKeys score={fallScore} low={span.low} high={span.high} beat={transport.beat} {marks} {flashes} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand keys marked L, right hand R." />
      {:else}
        {#if mode === "check" && tab !== "lead-sheet" && !transport.playing && phase !== "results"}
          <BeatLane rows={checkLanes} beats={totalBeats} beat={transport.beat} beatsPerBar={bpb} chords={rendering.chart.map((c, i) => ({ beat: rendering.chart.slice(0, i).reduce((t, x) => t + x.durationBeats, 0), symbol: c.symbol }))} hidden label="Beat lane: when each hand plays, the notes hidden." />
        {/if}
        {#if tab === "lead-sheet" || mode === "practice" || transport.playing || phase === "results"}
          <StaffFold live={phase === "running" || phase === "countin"} aside={chart}><LineNotation maxZoom={shortStage.current ? 1 : 1.1} notes={written} title={setupKey} cursorBeat={transport.beat} {keyFifths} beatsPerBar={bpb} instrument="piano" oneRow chords={tab === "lead-sheet" ? rendering.chart : undefined} /></StaffFold>
        {/if}
        <div class="flex flex-col justify-end" data-dock="instrument">
          <Piano low={span.low} high={span.high} fit={tight} {marks} {flashes} fill={phase === "running" || phase === "countin"} label="Piano keyboard, {noteName(span.low)} to {noteName(span.high)}. Left hand keys marked L, right hand R." />
        </div>
      {/if}
      <div class="mt-3 flex flex-col gap-1 text-sm text-ws-stage-soft">
        {#if mode === "check" && phase !== "results"}<p>{tab === "lead-sheet" ? "Check: read the melody and the symbols. The keys stay dark." : "Check: play the pattern from the chart. The notes are hidden."}</p>{/if}
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} />
    {/if}
  {/snippet}
</DrillShell>

<!-- The chart shares the staff fold's row when the staff is drawn, so the staff and the keys keep the height. -->
{#snippet chart()}
  <ol class="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="The chart">
    {#each rendering.chart as c, i (i)}
      <li class="chord-cell flex min-h-10 items-center justify-center rounded-lg px-3 font-display font-semibold" class:now={i === chordNow && transport.beat !== null} style:flex-grow={c.durationBeats} aria-current={i === chordNow && transport.beat !== null ? "step" : undefined}>
        {c.symbol}{#if charted}<span class="slashes" aria-hidden="true">{"/".repeat(c.durationBeats)}</span>{/if}<span class="sr-only">, {c.durationBeats / bpb} bar{c.durationBeats === bpb ? "" : "s"}</span>
      </li>
    {/each}
  </ol>
{/snippet}

<style>
  .chord-cell {
    flex-basis: 3.5rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    color: var(--ws-stage-soft);
  }
  .slashes {
    margin-left: 0.6em;
    letter-spacing: 0.35em;
    font-weight: 400;
    opacity: 0.7;
  }
  .chord-cell.now {
    background: var(--instr);
    color: var(--ws-stage);
  }
</style>
