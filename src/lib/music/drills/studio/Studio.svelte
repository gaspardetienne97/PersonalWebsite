<script lang="ts">
  // Song Studio (catalog 4.11). Transport and practice actions sit above the
  // score; the score scrolls in its own viewport. Wait mode waits for each
  // group; Performance keeps time over 1 to 8 takes; No-stop is one take that
  // keeps going through slips, scored on what was played and how continuously.
  // Any mode can run from memory, in another key, and (in time) with the
  // score's dynamics and breaths or vibrato on held notes graded too.
  // Imported songs never write mastery (skillIds: []), and the whole session
  // is one run.
  import { onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Download from "lucide-svelte/icons/download";
  import Headphones from "lucide-svelte/icons/headphones";
  import Settings2 from "lucide-svelte/icons/sliders-horizontal";
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import Timer from "lucide-svelte/icons/timer";
  import Pencil from "lucide-svelte/icons/pencil";
  import Drum from "lucide-svelte/icons/drum";
  import { clamp, noteName, pc, type ControlEvent, type InputEvent, type NoteEvent } from "@repo/music-core";
  import { TUNINGS } from "@repo/music-core/data/index";
  import { transposeFifths, transposeScore, writtenOffset } from "@repo/music-core/theory/transposition";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import { GROOVE_VOICES, hitDrumKey, scoreDrumPad } from "@repo/music-core/content/winds-pads";
  import {
    aggregateTakes,
    followerInput,
    followerResult,
    liveState,
    performanceStart,
    waitStart,
    type FollowerState,
    type PerformanceResult,
    type WaitResult,
    type WaitState,
  } from "@repo/music-core/scoring/follower";
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { bench, INSTRUMENT_LABEL } from "$lib/music/bench.svelte";
  import { audio, db, input, settings, type SequenceHandle } from "$lib/music/runtime";
  import { barBeats, scoreGroups as viewGroupsOf, voiceSides, type BeatRange } from "$lib/music/notation/groups";
  import { barsText, durationText, scoreFacts, songSections, type Song } from "$lib/music/hubs/library/songs";
  import StudioScore, { type View } from "./StudioScore.svelte";
  import { buildPass, continuity, defaultParts, firstSlip, fitToRange, gradeExpression, gradeVibrato, gradedDrums, hideBefore, noStopVerdict, passMarks, planPasses, retryBpm, segmentAt, SPOT, spotAfter, spotRange, startSpot, statesByBeat, statesFor, toScoreBeat, tuningRange, voiceChoices, type Continuity, type ExpressionResult, type Pass, type RangeMode, type SectionOrder, type SpotDrill } from "./studio";
  import Picker from "$lib/music/components/Picker.svelte";

  let { song }: { song: Song } = $props();
  // The page keys this component by song id, so reading the prop once is safe.
  // svelte-ignore state_referenced_locally
  const score = song.score;
  const facts = scoreFacts(score);
  const choices = voiceChoices(score);
  const sections = songSections(score);
  const barLen = barBeats(score.meter);
  const TUNING_LIST = [...TUNINGS.guitar, ...TUNINGS.ukulele];

  const setup = new DrillSetup(`song-studio.${score.id}`, {
    mode: "wait" as string,
    bpm: score.bpm,
    strictness: "normal" as string,
    takes: 1,
    range: "whole" as string,
    order: "sequence" as string,
    snap: "bar" as string,
    tuning: (settings.value.activeInstrument === "ukulele" ? settings.value.ukuleleTuningId : settings.value.guitarTuningId) as string,
    fit: "auto" as string,
    rangeStart: -1,
    rangeEnd: -1,
    memory: "off" as string,
    transpose: 0,
    grade: "notes" as string,
  });
  const s = $derived(setup.value);
  // Performance and No-stop keep time; No-stop is one take that never stops for a slip.
  const noStop = $derived(s.mode === "no-stop");
  const perfMode = $derived(s.mode === "performance" || noStop);
  const transpose = $derived(clamp(Math.round(s.transpose) || 0, -6, 6));
  const memory = $derived(s.memory === "look" || s.memory === "bars" ? s.memory : "off");
  const hasMarks = $derived(!!(score.dynamics?.length || score.hairpins?.length || score.breaths?.length));
  /** What else a timed run grades: the score's dynamics and breaths, or vibrato on held notes. */
  const grade = $derived(perfMode && ((s.grade === "dynamics" && hasMarks) || s.grade === "vibrato") ? s.grade : "notes");
  const bpm = $derived(clamp(Math.round(s.bpm) || score.bpm, 20, 300));
  const takes = $derived(perfMode && !noStop ? ([1, 2, 4, 8].includes(s.takes) ? s.takes : 1) : 1);
  const tuning = $derived(TUNING_LIST.find((t) => t.id === s.tuning) ?? TUNING_LIST[0]);
  const custom = $derived<BeatRange | null>(s.rangeStart >= 0 && s.rangeEnd > s.rangeStart ? { startBeat: s.rangeStart, endBeat: s.rangeEnd } : null);

  // Session-local: which voices and sections. Drum parts and pitched parts are
  // graded differently, so one kind is picked at a time: the drums on the MPC.
  const drumIds = new Set(score.voices.filter((v) => v.drums).map((v) => v.id));
  const isDrumChoice = (c: (typeof choices)[number]) => c.voiceIds.every((id) => drumIds.has(id));
  const mixed = choices.some(isDrumChoice) && !choices.every(isDrumChoice);
  const partsOf = (drumsOn: boolean) => choices.filter((c) => isDrumChoice(c) === drumsOn).map((c) => c.id);
  let picked = $state<string[]>(partsOf(defaultParts(score, settings.value.activeInstrument)));
  let pickedSections = $state<number[]>([]);
  const voiceIds = $derived(choices.filter((c) => picked.includes(c.id)).flatMap((c) => c.voiceIds));
  const drums = $derived(voiceIds.length > 0 && voiceIds.every((id) => drumIds.has(id)));

  const VIEWS = [
    { id: "staff", label: "Staff" },
    { id: "tab", label: "Tab" },
    { id: "fingering", label: "Fingering" },
    { id: "waterfall", label: "Waterfall" },
  ] as const;
  const view = $derived((VIEWS.find((v) => v.id === page.url.searchParams.get("view"))?.id ?? "staff") as View);

  // On guitar or ukulele (or in Tab) the score moves by octaves into the
  // instrument's range, so every note has a string and a fret.
  const fretted = $derived(!drums && (view === "tab" || ["guitar", "ukulele"].includes(settings.value.activeInstrument)));
  // A transposed run plays the song in another key: the notes, the staff and the grading all move.
  const keyed = $derived(transposeScore(score, transpose));
  const fitted = $derived.by(() => {
    const { low, high } = tuningRange(tuning);
    return fitToRange(keyed, voiceIds, low, high);
  });
  const fitting = $derived(fretted && s.fit === "auto" && fitted.score !== keyed);
  const played = $derived(fitting ? fitted.score : keyed);
  // The staff shows what the player reads: guitar an octave up, the Aerophone in its reading key.
  const written = $derived(fretted ? writtenOffset(tuning.instrument, settings.value, tuning) : writtenOffset(settings.value.activeInstrument, settings.value));
  const fitNote = $derived.by(() => {
    const inst = tuning.instrument === "ukulele" ? "ukulele" : "guitar";
    const moved = fitted.shift ? `Moved ${fitted.shift > 0 ? "up" : "down"} ${Math.abs(fitted.shift) / 12 === 1 ? "an octave" : `${Math.abs(fitted.shift) / 12} octaves`}` : "";
    const folded = fitted.folded ? `${fitted.folded} note${fitted.folded === 1 ? "" : "s"} folded by an octave` : "";
    return `${[moved, folded].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase())} to fit the ${inst} (${tuning.name}).`;
  });

  const plans = $derived(planPasses(played, sections, { mode: s.range as RangeMode, picked: pickedSections, order: s.order as SectionOrder, custom }));
  // Drums are graded by drum: the follower sees each drum's key, never its pitch.
  const passes = $derived(plans.map((segs) => buildPass(drums ? gradedDrums(played) : played, voiceIds, segs, sections)));
  /** The hand of the selected voice sounding `midi` in the group at `beat`. */
  const handAt = (midi: number, beat: number | null) => {
    if (beat === null) return undefined;
    const g = viewGroups.findLast((x) => x.startBeat <= beat + 1e-6);
    const n = g?.notes.find((x) => x.midi === midi);
    return n ? sides[n.voiceId] : undefined;
  };
  const highlights = $derived(s.range === "sections" ? pickedSections.map((i) => sections[i]).filter(Boolean) : []);

  let staffFailed = $state<string | null>(null);

  // ---- Run state ------------------------------------------------------
  type Phase = "ready" | "countin" | "running" | "results";
  interface Done {
    pass: number;
    take: number;
    label: string;
    result: PerformanceResult | WaitResult;
    state: FollowerState;
    notes: NoteEvent[];
    controls: ControlEvent[];
    /** The take's beat 0. */
    startAt: number;
  }
  let phase = $state<Phase>("ready");
  let status = $state("");
  let setupOpen = $state(false);
  let fstate = $state.raw<FollowerState | null>(null);
  let active = $state.raw<Pass | null>(null);
  let startAt = $state(0);
  let now = $state(performance.now());
  let queue = $state.raw<{ pass: number; take: number }[]>([]);
  let qi = $state(0);
  let done = $state.raw<Done[]>([]);
  let summary = $state<RunSummary | null>(null);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let metro: { stop(): void } | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const flashes = new Flashes();
  const live = $derived(phase === "running" || phase === "countin");
  // From memory: during a run the notes are hidden, all of them after the look, or bar by bar from the start.
  let memBars = $state(1);
  const hideBeat = $derived(live && memory !== "off" ? (memory === "look" ? played.lengthBeats + 1 : Math.min(memBars * barLen, played.lengthBeats)) : 0);
  const shown = $derived(hideBefore(played, hideBeat));
  const viewGroups = $derived(viewGroupsOf(shown, voiceIds));
  const sides = $derived(voiceSides(played, voiceIds));
  const beatMs = $derived(60000 / bpm);
  const octaveExact = $derived(drums || !["guitar", "ukulele", "voice"].includes(settings.value.activeInstrument));

  const ls = $derived(fstate ? liveState(fstate, now) : null);

  // ---- Preview --------------------------------------------------------
  let preview = $state.raw<SequenceHandle | null>(null);
  let previewPass = $state.raw<Pass | null>(null);
  let previewBeat = $state<number | null>(null);

  // One animation loop drives the cursor during a run or a preview.
  $effect(() => {
    if (!live && !preview?.playing) return;
    let raf = 0;
    const loop = () => {
      now = performance.now();
      if (preview?.playing && previewPass) previewBeat = toScoreBeat(previewPass, Math.max(0, (now - preview.startPerf) / (60000 / bpm)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const cursorBeat = $derived.by(() => {
    if (preview?.playing) return previewBeat;
    if (!active || !ls || phase === "ready") return null;
    if (fstate?.mode === "wait") return active.scoreBeat[Math.min(ls.index, active.scoreBeat.length - 1)] ?? null;
    return toScoreBeat(active, Math.max(0, (now - startAt) / beatMs));
  });

  const groupStates = $derived(active && ls && phase !== "ready" ? statesFor(viewGroups, statesByBeat(active, ls.verdicts, ls.wrong.length > 0, ls.index)) : {});

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (preview?.playing && previewPass && previewBeat !== null) {
      for (const g of viewGroups)
        if (g.startBeat <= previewBeat + 1e-6 && previewBeat < g.startBeat + g.durationBeats) for (const n of g.notes) out[n.midi] = { demo: true, role: sides[n.voiceId] };
      return out;
    }
    // From memory the keys don't show what comes next.
    if (live && ls && memory === "off") for (const m of ls.expected) out[m] = { target: true, role: handAt(m, cursorBeat) };
    return out;
  });

  function stopPreview() {
    preview?.stop();
    preview = null;
    previewBeat = null;
  }

  async function togglePreview() {
    if (preview?.playing) return stopPreview();
    await audio.unlock();
    // The score's own drums (not the graded keys), on the app's kit.
    const pass = buildPass(played, voiceIds, plans[0], sections);
    const beatS = 60 / bpm;
    const notes = pass.groups.flatMap((g) =>
      g.notes.map((n) => ({
        ...(drumIds.has(n.voiceId) ? { midi: scoreDrumPad(n.midi), voice: "kit" as const } : { midi: n.midi }),
        time: g.startBeat * beatS,
        duration: Math.max(0.08, n.durationBeats * beatS * 0.95),
        velocity: n.velocity ?? 0.8,
      })),
    );
    previewPass = pass;
    const h = audio.playSequence(notes);
    preview = h;
    status = `Playing ${pass.label.toLowerCase()} at ${bpm} BPM. Not scored.`;
    void h.done.then(() => {
      if (preview === h) stopPreview();
    });
  }

  function metronomeToSong() {
    settings.update({ bpm });
    status = `The metronome is at ${bpm} BPM, the song's tempo.`;
  }

  function exportMidi() {
    const bytes = scoreToMidi({ ...score, bpm });
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/midi" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.title.replace(/[^\w\- ]+/g, "").trim() || "song"}.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status = `Exported ${a.download} at ${bpm} BPM.`;
  }

  // ---- Running --------------------------------------------------------
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  async function start() {
    if (live) return;
    stopPreview();
    await audio.unlock();
    setupOpen = false;
    summary = null;
    done = [];
    flashes.clear();
    queue = passes.flatMap((_, p) => Array.from({ length: takes }, (_, t) => ({ pass: p, take: t })));
    qi = 0;
    run = practice.beginRun({
      exerciseId: "song.studio",
      setupKey: `${score.id}|${s.mode}|${passes.map((p) => p.label).join("+")}|${voiceIds.join(",")}|${bpm}|${s.strictness}${transpose ? `|t${transpose}` : ""}${memory !== "off" ? `|${memory}` : ""}${grade !== "notes" ? `|${grade}` : ""}`,
      // Imported songs never write mastery: no skills, deliberately.
      skillIds: [],
      capabilities: ["reading"],
      modality: "read",
      // Performance keeps time without waiting, so its runs count as checked (a path's shelf songs
      // and riffs); still no skills, so no mastery.
      assistance: perfMode ? "independent" : "guided",
      difficulty: 0.5,
      instrument: settings.value.activeInstrument,
      source: "song",
      params: {
        song: score.id,
        mode: s.mode,
        bpm,
        takes,
        strictness: s.strictness,
        range: s.range,
        ...(song.shelf ? { shelf: song.shelf } : {}),
        ...(memory !== "off" ? { memory } : {}),
        ...(memory === "bars" ? { hiddenBars: memBars } : {}),
        ...(transpose ? { transpose } : {}),
      },
    });
    beginTake();
  }

  function beginTake() {
    const item = queue[qi];
    const pass = passes[item.pass];
    active = pass;
    fstate = null;
    if (!perfMode) {
      fstate = waitStart(pass.groups, octaveExact);
      startAt = performance.now();
      phase = "running";
      status = `Wait mode: play ${pass.label.toLowerCase()} at your own pace. The score waits for each note.${memory === "look" ? " The notes are hidden: play from memory." : ""}`;
      cap = capture(startAt, onInput);
      void tick().then(() => document.getElementById("studio-run")?.focus());
      return;
    }
    const bars = Math.max(1, settings.value.countInBars);
    const perBar = Math.max(1, Math.round(barLen));
    bench.beatsPerBar = perBar;
    const h = audio.metronome.start({
      bpm,
      beatsPerBar: perBar,
      countInBars: bars,
      audible: bench.clickDuringRun,
      onBeat: (beat) => (bench.beat = beat + 1),
    });
    metro = h;
    // Without running audio the metronome returns at once; keep the count-in anyway.
    const downbeat = h.downbeatPerf > performance.now() + 10 ? h.downbeatPerf : performance.now() + bars * perBar * beatMs;
    startAt = downbeat;
    fstate = performanceStart(pass.groups, { bpm, startAt: downbeat, strictness: s.strictness as "relaxed" | "normal" | "strict", octaveExact, sections: pass.sections });
    phase = "countin";
    status = `${noStop ? "No-stop run: keep going through any slip" : `Take ${item.take + 1} of ${takes}`}${passes.length > 1 ? `, ${pass.label}` : ""}. Count-in: ${bars} bar${bars > 1 ? "s" : ""}.`;
    // Scored input only after the count-in, so the speakers cannot bleed into the take.
    cap = capture(downbeat - beatMs / 2, onInput);
    timers.push(
      setTimeout(() => {
        if (phase === "countin") {
          phase = "running";
          status = "Go.";
        }
      }, downbeat - performance.now()),
      setTimeout(endTake, downbeat - performance.now() + pass.lengthBeats * beatMs + 350),
    );
    void tick().then(() => document.getElementById("studio-run")?.focus());
  }

  function onInput(e: InputEvent) {
    if ((e.kind !== "noteon" && e.kind !== "noteoff") || !fstate) return;
    const ev = drums ? { ...(e as NoteEvent), midi: hitDrumKey((e as NoteEvent).midi) } : (e as NoteEvent);
    if (ev.kind === "noteon") {
      const expected = liveState(fstate, performance.now()).expected;
      const hit = expected.some((m) => (octaveExact ? m === ev.midi : pc(m) === pc(ev.midi)));
      flashes.add(ev.midi, hit ? "correct" : "wrong");
    }
    fstate = followerInput(fstate, ev);
    if (fstate.mode === "wait" && fstate.index >= fstate.groups.length) endTake();
  }

  function endTake() {
    if (!fstate || !active) return;
    clearTimers();
    cap?.stop();
    metro?.stop();
    metro = null;
    bench.beat = 0;
    const item = queue[qi];
    const result = followerResult(fstate);
    const label = `${passes.length > 1 ? `${active.label}, ` : ""}take ${item.take + 1}`;
    done = [...done, { ...item, label, result, state: fstate, notes: cap?.notes ?? [], controls: cap?.controls ?? [], startAt }];
    cap = null;
    qi += 1;
    if (qi < queue.length) {
      status = `${label.replace(/^./, (c) => c.toUpperCase())}: ${pct(result.score)}. Next take after the count-in.`;
      timers.push(setTimeout(beginTake, 600));
    } else void finish();
  }

  function stop() {
    if (!live) return;
    clearTimers();
    cap?.stop();
    cap = null;
    metro?.stop();
    metro = null;
    bench.beat = 0;
    input.router.releaseAll();
    fstate = null;
    active = null;
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
    if (spot) endSpot("Stopped the loop. Your range and tempo are back.");
  }

  // ---- Results --------------------------------------------------------
  const isPerf = (r: PerformanceResult | WaitResult): r is PerformanceResult => "matched" in r;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  interface Row {
    label: string;
    score: number;
    detail: string;
    best?: boolean;
  }
  let takeRows = $state.raw<Row[]>([]);
  let sectionRows = $state.raw<{ label: string; value: number; text: string }[]>([]);

  interface Extra {
    score: number;
    correct: boolean;
    cont: Continuity | null;
    kept: boolean;
    expr: ExpressionResult | null;
    vib: ReturnType<typeof gradeVibrato> | null;
    /** The extra measure blended in (dynamics or vibrato), null when not measured. */
    measure: number | null;
  }
  /**
   * A take's score with what else the run grades: No-stop scales it by
   * continuity; dynamics or vibrato, when measured, make half of it.
   */
  function takeExtras(d: Done): Extra {
    const pass = passes[d.pass];
    let score = d.result.score;
    let correct = d.result.correct;
    let cont: Continuity | null = null;
    let kept = true;
    let expr: ExpressionResult | null = null;
    let vib: Extra["vib"] = null;
    let measure: number | null = null;
    if (isPerf(d.result)) {
      if (noStop) {
        cont = continuity(pass, d.notes.filter((n) => n.kind === "noteon").map((n) => n.at), d.startAt, beatMs, barLen);
        const v = noStopVerdict(score, cont);
        score = v.score;
        kept = v.kept;
        correct = correct && kept;
      }
      if (grade === "dynamics") {
        expr = gradeExpression({ marks: passMarks(played, pass), notes: d.notes, controls: d.controls, startAt: d.startAt, beatMs, lengthBeats: pass.lengthBeats });
        measure = expr.score;
      } else if (grade === "vibrato") {
        vib = gradeVibrato({ pass, notes: d.notes, controls: d.controls, startAt: d.startAt, beatMs });
        measure = vib.share;
      }
      if (measure !== null) {
        score = score * 0.5 + measure * 0.5;
        correct = correct && measure >= 0.8;
      }
    }
    return { score, correct, cont, kept, expr, vib, measure };
  }

  async function finish() {
    phase = "results";
    const all = [...done];
    const extras = all.map(takeExtras);
    const notes = all.flatMap((d) => d.notes);
    const instrument = runInstrument(notes) ?? null;
    for (const [i, d] of all.entries())
      await run!.attempt({
        promptId: `${score.id}:${d.label}`,
        correct: extras[i].correct,
        partialCredit: extras[i].score,
        metrics: d.result.metrics,
        source: runSource(d.notes),
        instrument,
        skillIds: [],
      });
    // "Pick up where you left off" in Songs follows the last song practised.
    void db.songs.update(song.id, { updatedAt: Date.now() });
    const perf = all.filter((d) => isPerf(d.result)).map((d) => d.result as PerformanceResult);
    const mean = sum(extras.map((x) => x.score)) / Math.max(1, all.length);
    const agg = perf.length ? aggregateTakes(perf) : null;
    const bestIdx = extras.reduce((b, x, i) => (x.score > extras[b].score ? i : b), 0);

    takeRows = all.map((d, i) => ({
      label: d.label.replace(/^./, (c) => c.toUpperCase()),
      score: extras[i].score,
      best: all.length > 1 && i === bestIdx,
      detail: isPerf(d.result)
        ? `${d.result.matched} of ${d.result.expected} notes, ${Math.round(d.result.meanAbsErrorMs)} ms off, ${d.result.early} early, ${d.result.onTime} on time, ${d.result.late} late, ${d.result.missed} missed, ${d.result.extra} extra`
        : `${(d.result as WaitResult).cleanGroups} of ${(d.result as WaitResult).total} groups clean, ${(d.result as WaitResult).wrongNotes} wrong note${(d.result as WaitResult).wrongNotes === 1 ? "" : "s"}`,
    }));
    sectionRows = tallySections(all);

    const conts = extras.flatMap((x) => (x.cont ? [x.cont] : []));
    const measured = grade !== "notes" && extras.length > 0 && extras.every((x) => x.measure !== null);
    const fin = await run!.finish({
      score: mean,
      correct: extras.every((x) => x.correct),
      headline: `${pct(mean)} at ${bpm} BPM, ${noStop ? "no-stop" : perfMode ? "performance" : "wait"}`,
      params: {
        takesPlayed: all.length,
        ...(conts.length ? { continuity: Math.round(Math.min(...conts.map((c) => c.share)) * 100) / 100, kept: extras.every((x) => x.kept) } : {}),
        // A run counts as graded for dynamics or vibrato only when every take could be measured.
        ...(measured ? { grade } : {}),
      },
    });

    if (perf.length && agg) {
      const matched = sum(perf.map((r) => r.matched));
      const expected = sum(perf.map((r) => r.expected));
      const errMs = matched ? sum(perf.map((r) => r.meanAbsErrorMs * r.matched)) / matched : 0;
      const best = agg.best!;
      summary = {
        headline:
          best.correct
            ? `Clean take at ${bpm} BPM: ${pct(best.score)} on your best try.`
            : best.pitchCompletion < 0.7
              ? `You found ${best.matched} of ${best.expected} notes on your best take. Try Wait mode or 8 BPM slower.`
              : `The notes are there; timing drifted ${Math.round(best.meanAbsErrorMs)} ms on average. Same tempo again.`,
        metric: pct(agg.meanScore),
        metricLabel: perf.length > 1 ? `mean of ${perf.length} takes` : "score",
        delta: fin.delta,
        best: fin.best,
        clean: perf.every((r) => r.correct),
        xp: fin.xp,
        assistance: "Song practice goes in your journal. Imported songs don't change skill mastery.",
        rows: [
          { label: "Notes matched", value: expected ? matched / expected : 0, text: `${matched} of ${expected}` },
          { label: drums ? "Drums found" : "Pitch completion", value: expected ? matched / expected : 0 },
          { label: "Timing error (mean)", text: matched ? `${Math.round(errMs)} ms` : "No notes matched" },
          { label: "Best take", text: `Take ${agg.bestIndex + 1}, ${pct(best.score)}` },
          { label: "Early / on time / late", text: `${sum(perf.map((r) => r.early))} / ${sum(perf.map((r) => r.onTime))} / ${sum(perf.map((r) => r.late))}` },
          { label: "Missed / extra", text: `${sum(perf.map((r) => r.missed))} / ${sum(perf.map((r) => r.extra))}` },
          ...extraRows(extras),
        ],
      };
      const x = extras[bestIdx];
      if (noStop && x.cont) {
        const c = x.cont;
        summary.headline = x.kept
          ? `Kept going to the end: every bar played, ${pct(x.score)}.`
          : c.longestGapBeats > 1
            ? `Stopped for ${c.longestGapBeats % 1 ? c.longestGapBeats.toFixed(1) : c.longestGapBeats} beats at ${barsOf({ startBeat: c.gapAt ?? 0, endBeat: (c.gapAt ?? 0) + 0.01 })}. After a slip, come back in on the next beat.`
            : `${c.barsPlayed} of ${c.bars} bars played. Keep going through every bar.`;
      } else if (grade !== "notes" && x.measure !== null && x.measure < 0.8)
        summary.headline =
          grade === "vibrato"
            ? `Notes ${pct(isPerf(all[bestIdx].result) ? all[bestIdx].result.score : 0)}; vibrato on ${pct(x.measure)} of the held notes. Pulse the bite 4 to 5 times a second on every long note.`
            : `Notes ${pct(isPerf(all[bestIdx].result) ? all[bestIdx].result.score : 0)}; ${pct(x.measure)} of the dynamics and breaths came out. Make the changes bigger than feels natural.`;
    } else {
      const w = all.map((d) => d.result as WaitResult);
      const clean = sum(w.map((r) => r.cleanGroups));
      const total = sum(w.map((r) => r.total));
      const wrong = sum(w.map((r) => r.wrongNotes));
      summary = {
        headline:
          clean === total
            ? "Every note found with no wrong ones. Try it in Performance mode."
            : `${clean} of ${total} groups clean; ${wrong} wrong note${wrong === 1 ? "" : "s"} along the way.`,
        metric: pct(mean),
        metricLabel: "groups clean",
        delta: fin.delta,
        best: fin.best,
        clean: clean === total,
        xp: fin.xp,
        assistance: "Wait mode is guided practice. Imported songs don't change skill mastery.",
        rows: [
          { label: "Groups played clean", value: total ? clean / total : 0, text: `${clean} of ${total}` },
          { label: drums ? "Drums found" : "Pitch completion", value: total ? sum(w.map((r) => r.completed)) / total : 0 },
          { label: "Wrong notes", text: String(wrong) },
          { label: "Timing", notMeasured: true },
          { label: "Early / on time / late", notMeasured: true },
        ],
      };
    }
    if (spot) summary.headline = spotTake(all);
    // Bar by bar: a take at 90% or better hides one more bar next time.
    if (memory === "bars" && Math.max(...extras.map((x) => x.score)) >= 0.9 && memBars * barLen < played.lengthBeats - 1e-6) {
      memBars += 1;
      summary.headline += ` Next run hides bars 1 to ${memBars}.`;
    }
    status = summary.headline;
    fstate = all.at(-1)?.state ?? null;
    active = all.at(-1) ? passes[all.at(-1)!.pass] : null;
    now = performance.now() + 1e7;
    await tick();
    document.getElementById("studio-results")?.focus();
  }

  /** Result rows for continuity, dynamics and vibrato, from the best take. */
  function extraRows(extras: Extra[]): NonNullable<RunSummary["rows"]> {
    const best = extras.reduce((b, x) => (x.score > b.score ? x : b), extras[0]);
    if (!best) return [];
    const rows: NonNullable<RunSummary["rows"]> = [];
    if (best.cont) {
      const c = best.cont;
      rows.push({ label: "Kept going (bars played)", value: c.share, text: `${c.barsPlayed} of ${c.bars}, longest slip ${c.longestGapBeats % 1 ? c.longestGapBeats.toFixed(1) : c.longestGapBeats} beat${c.longestGapBeats === 1 ? "" : "s"}` });
    }
    if (grade === "dynamics" && best.expr) {
      const e = best.expr;
      rows.push(
        e.score === null
          ? { label: `Dynamics and breaths (${e.unmeasured ?? "nothing marked in this range"})`, notMeasured: true }
          : { label: "Dynamics and breaths as marked", value: e.score, text: `${e.dynamics.right} of ${e.dynamics.total} changes, ${e.breaths.right} of ${e.breaths.total} breaths` },
      );
    }
    if (grade === "vibrato" && best.vib) {
      const v = best.vib;
      rows.push(v.share === null ? { label: "Vibrato on held notes (no bite arrived as pitch bend)", notMeasured: true } : { label: "Vibrato on held notes, 4 to 5 a second", value: v.share, text: `${v.withVibrato} of ${v.held}` });
    }
    return rows;
  }

  function tallySections(all: Done[]) {
    const acc = new Map<string, { hit: number; total: number }>();
    const add = (label: string, hit: number, total: number) => {
      const a = acc.get(label) ?? { hit: 0, total: 0 };
      acc.set(label, { hit: a.hit + hit, total: a.total + total });
    };
    for (const d of all) {
      const pass = passes[d.pass];
      if (isPerf(d.result)) {
        if (d.result.perSection.length) for (const t of d.result.perSection) add(t.label, t.matched, t.total);
        else add(pass.label, d.result.matched, d.result.expected);
      } else {
        const st = d.state as WaitState;
        for (const sec of pass.sections) {
          const idx = pass.groups.flatMap((g, i) => (g.startBeat >= sec.startBeat - 1e-6 && g.startBeat < sec.endBeat - 1e-6 ? [i] : []));
          add(sec.label, idx.filter((i) => i < st.index && st.wrongCounts[i] === 0).length, idx.length);
        }
      }
    }
    return [...acc].filter(([, a]) => a.total).map(([label, a]) => ({ label, value: a.hit / a.total, text: `${a.hit} of ${a.total}` }));
  }

  // ---- Fix the trouble spot ---------------------------------------------
  /** Whether group `i` of a take was clean: hit in time, or found with no wrong note. */
  const cleanAt = (d: Done) => (i: number) =>
    isPerf(d.result) ? d.result.groupVerdicts[i] === "hit" : (d.state as WaitState).wrongCounts[i] === 0 && i < (d.state as WaitState).index;
  let spot = $state<SpotDrill | null>(null);
  let spotRestore: { range: string; rangeStart: number; rangeEnd: number; bpm: number; takes: number } | null = null;
  const barsOf = (r: BeatRange) => {
    const a = Math.floor(r.startBeat / barLen + 1e-6) + 1;
    const b = Math.ceil(r.endBeat / barLen - 1e-6);
    return a === b ? `bar ${a}` : `bars ${a} to ${b}`;
  };
  /** Where the last take first went wrong, as a loop to fix. */
  const trouble = $derived.by(() => {
    if (phase !== "results" || spot) return null;
    const d = done.at(-1);
    if (!d) return null;
    const pass = passes[d.pass];
    const beat = firstSlip(pass, cleanAt(d));
    if (beat === null) return null;
    const bounds = segmentAt(pass, beat);
    return { range: spotRange(beat, barLen, bounds), bounds };
  });
  function applySpot(sp: SpotDrill) {
    setup.set({ range: "custom", rangeStart: sp.range.startBeat, rangeEnd: sp.range.endBeat, bpm: sp.bpm, takes: 1 });
  }
  function fixSpot() {
    if (!trouble) return;
    spotRestore = { range: s.range, rangeStart: s.rangeStart, rangeEnd: s.rangeEnd, bpm: s.bpm, takes: s.takes };
    spot = startSpot(trouble.range, trouble.bounds, bpm);
    applySpot(spot);
    void start();
  }
  function endSpot(message?: string) {
    clearTimers();
    spot = null;
    if (spotRestore) setup.set(spotRestore);
    spotRestore = null;
    if (message) status = message;
  }
  /** Score the loop's take, say where it stands, and go round again unless it is fixed. */
  function spotTake(all: Done[]): string {
    const d = all.at(-1)!;
    const pass = passes[d.pass];
    const clean = pass.groups.every((_, i) => cleanAt(d)(i));
    const was = spot!;
    const next = spotAfter(was, clean, barLen);
    spot = next;
    let line: string;
    if (next.stage === "done") {
      line = `Fixed: ${barsOf(next.range)} clean ${SPOT.clean} times running at ${next.targetBpm} BPM.`;
      endSpot();
      return line;
    }
    if (!clean) line = `Not clean yet: ${barsOf(next.range)} again at ${next.bpm} BPM.`;
    else if (next.stage !== was.stage) line = next.stage === "tempo" ? `${SPOT.clean} clean in a row. Back to full tempo, ${next.bpm} BPM.` : `Clean at full tempo. The loop widens to ${barsOf(next.range)}.`;
    else line = `Clean ${next.streak} of ${SPOT.clean} at ${next.bpm} BPM.`;
    applySpot(next);
    timers.push(setTimeout(() => void start(), 1500));
    return `${line} The next try starts in a moment.`;
  }

  function retry(delta: number) {
    setup.set({ bpm: retryBpm(bpm, delta) });
    void start();
  }

  // ---- Shell ------------------------------------------------------------
  $effect(() => {
    bench.running = live;
    bench.countingIn = phase === "countin";
    bench.setFocus(live);
  });

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl = t?.closest("button, a, input, select, textarea, [contenteditable], [role=slider]");
    if (e.code === "Space" && !onControl && !e.repeat && (phase === "ready" || phase === "results")) {
      e.preventDefault();
      void start();
    } else if (e.key === "Escape" && live) {
      e.preventDefault();
      stop();
    }
  }

  onDestroy(() => {
    if (spot && spotRestore) setup.set(spotRestore);
    clearTimers();
    cap?.stop();
    metro?.stop();
    stopPreview();
    flashes.clear();
    bench.running = false;
    bench.countingIn = false;
    bench.beat = 0;
    bench.setFocus(false);
  });

  // ---- Setup helpers ------------------------------------------------------
  function toggleVoice(id: string) {
    if (live) return;
    const c = choices.find((x) => x.id === id)!;
    if (picked.includes(id)) {
      if (picked.length > 1) picked = picked.filter((p) => p !== id);
    } else picked = [...picked.filter((p) => isDrumChoice(choices.find((x) => x.id === p)!) === isDrumChoice(c)), id];
  }
  function toggleSection(i: number) {
    pickedSections = pickedSections.includes(i) ? pickedSections.filter((x) => x !== i) : [...pickedSections, i].sort((a, b) => a - b);
  }
  function pickRange(r: BeatRange) {
    setup.set({ rangeStart: r.startBeat, rangeEnd: r.endBeat });
    const bars = Math.round((r.endBeat - r.startBeat) / barLen);
    status = `Custom range set: ${bars >= 1 ? `${bars} bar${bars === 1 ? "" : "s"}` : "a few notes"} from bar ${Math.floor(r.startBeat / barLen) + 1}.`;
  }

  const rangeSummary = $derived(
    s.range === "custom" ? (custom ? `bars ${Math.floor(custom.startBeat / barLen) + 1} to ${Math.ceil(custom.endBeat / barLen)}` : "custom range (not set yet)") : s.range === "sections" && pickedSections.length ? `${pickedSections.length} section${pickedSections.length > 1 ? "s" : ""}${pickedSections.length > 1 ? (s.order === "per-section" ? ", one at a time" : ", in sequence") : ""}` : "whole score",
  );
  const MAJOR_BY_FIFTHS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const MINOR_BY_FIFTHS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
  /** The song's key moved by `t` semitones, when the score names its key. */
  const keyAt = (t: number) => {
    if (score.keyFifths === undefined) return "";
    const f = transposeFifths(score.keyFifths, t);
    return score.keyMode === "minor" ? `${MINOR_BY_FIFTHS[f + 7]} minor` : `${MAJOR_BY_FIFTHS[f + 7]} major`;
  };
  const transposeLabel = (t: number) => (t ? `${t > 0 ? "Up" : "Down"} ${Math.abs(t)}${keyAt(t) ? `, ${keyAt(t)}` : ""}` : `As written${keyAt(0) ? `, ${keyAt(0)}` : ""}`);
  const marksText = $derived(
    [
      score.dynamics?.length ? `${score.dynamics.length} dynamic${score.dynamics.length === 1 ? "" : "s"}` : "",
      score.hairpins?.length ? `${score.hairpins.length} hairpin${score.hairpins.length === 1 ? "" : "s"}` : "",
      score.breaths?.length ? `${score.breaths.length} breath mark${score.breaths.length === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  );
  const summaryLine = $derived(
    [
      noStop ? "No-stop run" : perfMode ? `Performance, ${takes} take${takes > 1 ? "s" : ""}` : "Wait mode",
      rangeSummary,
      `${bpm} BPM`,
      picked.length === choices.length ? "all voices" : choices.filter((c) => picked.includes(c.id)).map((c) => c.label).join(" and "),
      ...(transpose ? [`${transpose > 0 ? "up" : "down"} ${Math.abs(transpose)} semitone${Math.abs(transpose) === 1 ? "" : "s"}${keyAt(transpose) ? ` (${keyAt(transpose)})` : ""}`] : []),
      ...(memory === "look" ? ["from memory"] : memory === "bars" ? [`from memory, bars 1 to ${memBars} hidden`] : []),
      ...(grade === "dynamics" ? ["dynamics and breaths graded"] : grade === "vibrato" ? ["vibrato graded"] : []),
    ].join(", "),
  );
  const progress = $derived(ls && fstate ? Math.min(1, ls.index / Math.max(1, fstate.groups.length)) : 0);
  const selection = $derived(custom);
</script>

<svelte:window onkeydown={onKey} />

<section class="mx-auto flex w-full max-w-6xl flex-col gap-4" aria-labelledby="studio-title">
  {#if !live}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href="/music/library"><ArrowLeft class="size-4" aria-hidden="true" />Back to your songs</a>
        <h1 id="studio-title" class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{song.title}</h1>
        <p class="mt-1 text-ws-soft">
          {song.composer ? `${song.composer}. ` : ""}{barsText(facts.bars)} in {facts.meter}{facts.key ? `, ${facts.key}` : ""}, written at {score.bpm} BPM ({durationText(facts.seconds)}).
        </p>
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-ws-line bg-ws-surface px-4 py-2">
      <p class="min-w-0 flex-1 text-sm"><span class="text-ws-soft">Setup:</span> <span class="font-medium">{summaryLine}</span></p>
      <button
        type="button"
        class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash"
        aria-expanded={setupOpen}
        aria-controls="studio-setup"
        onclick={() => (setupOpen = !setupOpen)}
      >
        <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? "Hide setup" : "Setup"}
      </button>
    </div>

    {#if setupOpen}
      <div id="studio-setup" class="grid gap-5 rounded-xl border border-ws-line bg-ws-surface p-4 md:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-1 text-sm md:col-span-2" role="group" aria-labelledby="voices-l">
          <span id="voices-l" class="font-medium">{score.source?.kind === "musicxml" ? "Parts" : "Voices"}</span>
          <div class="flex flex-wrap gap-1.5">
            {#each choices as c (c.id)}
              {@const on = picked.includes(c.id)}
              <button
                type="button"
                class="min-h-11 rounded-lg border px-3 text-sm {on ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
                aria-pressed={on}
                disabled={on && picked.length === 1}
                onclick={() => toggleVoice(c.id)}>{on ? "✓ " : ""}{c.label}</button
              >
            {/each}
          </div>
          {#if choices.length > 1}<span class="text-ws-soft">At least one stays on.{mixed ? " Drums and the other parts are practised one kind at a time." : ""}</span>{/if}
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <Choice
            label="Range"
            options={[
              { value: "whole", label: "Whole score" },
              { value: "sections", label: "Sections" },
              { value: "custom", label: "Custom" },
            ]}
            value={s.range}
            onchange={(v) => setup.set({ range: v })}
          />
          {#if s.range === "sections"}
            <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-labelledby="sections-l">
              <span id="sections-l" class="font-medium">Sections</span>
              <div class="flex flex-wrap gap-1.5">
                {#each sections as sec, i (sec.label + i)}
                  {@const on = pickedSections.includes(i)}
                  <button type="button" class="min-h-11 rounded-lg border px-3 text-sm {on ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line hover:bg-ws-raised'}" aria-pressed={on} onclick={() => toggleSection(i)}>{sec.label}</button>
                {/each}
              </div>
              {#if !pickedSections.length}<span class="text-ws-soft">None picked yet: the whole score plays.</span>{/if}
            </div>
            <Choice
              label="Order"
              options={[
                { value: "sequence", label: "In sequence" },
                { value: "per-section", label: "One at a time" },
              ]}
              value={s.order}
              onchange={(v) => setup.set({ order: v })}
            />
          {:else if s.range === "custom"}
            <Choice
              label="Snap to"
              options={[
                { value: "bar", label: "Measure" },
                { value: "group", label: "Note group" },
              ]}
              value={s.snap}
              onchange={(v) => setup.set({ snap: v })}
            />
            <p class="text-sm text-ws-soft">
              {drums ? "The drum grid can't mark a range yet; pick Sections instead." : view === "staff" || view === "tab" ? "Tap where the range starts on the score below, then where it ends. Drag the Start and End handles to adjust." : "Switch to Staff or Tab to mark the range."}
              {#if custom}<button type="button" class="ml-1 font-medium text-instr-ink underline underline-offset-4" onclick={() => setup.set({ rangeStart: -1, rangeEnd: -1 })}>Clear the range</button>{/if}
            </p>
          {/if}
        </div>

        <div class="grid min-w-0 gap-3 sm:grid-cols-2">
          <Choice
            label="Mode"
            options={[
              { value: "wait", label: "Wait" },
              { value: "performance", label: "Performance" },
              { value: "no-stop", label: "No-stop" },
            ]}
            value={s.mode}
            onchange={(v) => setup.set({ mode: v })}
          />
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Tempo (BPM)</span>
            <input class="tnum min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" type="number" min="20" max="300" value={bpm} onchange={(e) => setup.set({ bpm: clamp(Number(e.currentTarget.value) || score.bpm, 20, 300) })} />
          </label>
          <Choice
            label="Strictness"
            options={[
              { value: "relaxed", label: "Relaxed" },
              { value: "normal", label: "Normal" },
              { value: "strict", label: "Strict" },
            ]}
            value={s.strictness}
            disabled={!perfMode}
            onchange={(v) => setup.set({ strictness: v })}
          />
          <Choice
            label="Count-in"
            options={[
              { value: 0, label: "Off" },
              { value: 1, label: "1 bar" },
              { value: 2, label: "2 bars" },
            ]}
            value={settings.value.countInBars}
            onchange={(v) => settings.update({ countInBars: v as 0 | 1 | 2 })}
          />
          <Choice label="Takes" options={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))} value={takes} disabled={!perfMode || noStop} onchange={(v) => setup.set({ takes: v })} />
          <p class="self-end text-sm text-ws-soft">{noStop ? "No-stop is one take in time: keep going through any slip. It is scored on what you played and how many bars you kept going through." : perfMode ? "Performance keeps time; a count-in of at least one bar always plays." : "Wait mode is one take and never rushes you; strictness and takes apply to Performance."}</p>
        </div>

        <div class="grid min-w-0 gap-3 sm:grid-cols-2 md:col-span-2">
          <Choice
            label="From memory"
            options={[
              { value: "off", label: "Off" },
              { value: "look", label: "After a look" },
              { value: "bars", label: "Bar by bar" },
            ]}
            value={memory}
            onchange={(v) => setup.set({ memory: v })}
          />
          <Choice label="Key" select options={[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((t) => ({ value: t, label: transposeLabel(t) }))} value={transpose} onchange={(v) => setup.set({ transpose: v })} />
          <Choice
            label="Also grade"
            options={[
              { value: "notes", label: "Notes only" },
              { value: "dynamics", label: "Dynamics and breaths" },
              { value: "vibrato", label: "Vibrato" },
            ]}
            value={grade === "notes" ? s.grade : grade}
            disabled={!perfMode}
            onchange={(v) => setup.set({ grade: v })}
          />
          <p class="self-end text-sm text-ws-soft">
            {memory === "look" ? "Look at the score as long as you like; it hides when the run starts and comes back for the results." : memory === "bars" ? `The first ${memBars === 1 ? "bar hides" : `${memBars} bars hide`} during the run; a take at 90% hides one more.` : ""}
            {s.grade === "dynamics" && !hasMarks ? "This score has no dynamics or breath marks to grade." : s.grade === "dynamics" ? `Marked: ${marksText}. Graded loosely from breath (CC 2) or MIDI velocity: louder where it says louder, a break where it says breathe.` : s.grade === "vibrato" ? "Held notes of a beat or more should pulse 4 to 5 times a second, read from the bite (pitch bend)." : hasMarks ? `The score marks ${marksText}; they show on the staff.` : ""}
            {!perfMode && s.grade !== "notes" ? " Grading dynamics or vibrato needs Performance or No-stop." : ""}
          </p>
        </div>
      </div>
    {/if}
  {:else}
    <h1 id="studio-run" tabindex="-1" class="sr-only">{song.title}, running</h1>
  {/if}

  <!-- Transport and practice actions: above the score. -->
  <div class="flex flex-wrap items-center gap-2">
    {#if live}
      <button type="button" class="{btnPrimary} min-h-12 px-6" onclick={stop}><Square class="size-4" aria-hidden="true" />Stop <kbd class="text-xs opacity-70">Esc</kbd></button>
      <p class="min-w-0 flex-1 truncate font-display text-lg font-semibold">{song.title}</p>
    {:else}
      <button type="button" class="{btnPrimary} min-h-12 px-6 font-display text-base" onclick={start}>
        <Play class="size-5" aria-hidden="true" />{phase === "results" ? "Again" : noStop ? "Start no-stop run" : perfMode ? "Start performance" : "Start in wait mode"}
      </button>
      <button type="button" class={btn} aria-pressed={!!preview?.playing} onclick={togglePreview}>
        {#if preview?.playing}<Square class="size-4" aria-hidden="true" />Stop preview{:else}<Headphones class="size-4" aria-hidden="true" />Hear it{/if}
      </button>
      <a class={btn} href="/music/songs/{song.id}/edit"><Pencil class="size-4" aria-hidden="true" />Edit notes</a>
      <button type="button" class={btn} onclick={exportMidi}><Download class="size-4" aria-hidden="true" />Export MIDI</button>
      <button type="button" class={btn} disabled={settings.value.bpm === bpm} onclick={metronomeToSong}>
        <Timer class="size-4" aria-hidden="true" />{settings.value.bpm === bpm ? `Metronome at ${bpm} BPM` : `Set metronome to ${bpm} BPM`}
      </button>
      <span class="hidden text-sm text-ws-soft sm:inline">Space starts, Esc stops.</span>
    {/if}
    <div class="ml-auto flex flex-wrap items-center gap-2">
      {#if mixed && !live}
        <button type="button" class={btn} aria-pressed={drums} onclick={() => (picked = partsOf(!drums))}><Drum class="size-4" aria-hidden="true" />{drums ? "Play the other parts" : "Play the drums"}</button>
      {/if}
      {#if !drums}<HubTabs param="view" tabs={VIEWS} label="Score view" />{/if}
    </div>
  </div>

  {#if phase === "results" && summary}
    <div class="results-enter flex flex-col gap-4">
      <h2 id="studio-results" tabindex="-1" class="sr-only">Results</h2>
      <Results {summary}>
        {#snippet actions()}
          {#if spot}
            <button type="button" class={btn} onclick={() => endSpot("Ended the loop. Your range and tempo are back.")}>End the loop</button>
          {:else if trouble}
            <button type="button" class={btn} onclick={fixSpot}>Fix the trouble spot, {barsOf(trouble.range)}</button>
          {/if}
          <button type="button" class={btn} onclick={() => retry(8)}>Again at {retryBpm(bpm, 8)} BPM</button>
          <button type="button" class={btn} onclick={() => retry(0)}>Same tempo</button>
          <button type="button" class={btn} onclick={() => retry(-8)}>Slower, {retryBpm(bpm, -8)} BPM</button>
        {/snippet}
      </Results>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4">
          <h3 class="font-semibold">Takes</h3>
          <ul class="mt-2 divide-y divide-ws-line" aria-label="Per-take results">
            {#each takeRows as r (r.label)}
              <li class="flex items-baseline gap-3 py-2 text-sm">
                <span class="min-w-0 flex-1"><span class="font-medium">{r.label}</span>{#if r.best}<span class="ml-2 rounded-full bg-instr-wash px-2 py-0.5 text-xs font-semibold text-instr-ink">Best take</span>{/if}<span class="block text-ws-soft">{r.detail}</span></span>
                <span class="tnum font-display text-xl font-semibold">{pct(r.score)}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4">
          <h3 class="font-semibold">Sections</h3>
          {#if sectionRows.length}
            <ul class="mt-2 divide-y divide-ws-line" aria-label="Per-section results">
              {#each sectionRows as r (r.label)}
                <li class="py-2 text-sm">
                  <div class="flex items-baseline justify-between gap-3"><span class="font-medium">{r.label}</span><span class="tnum text-ws-soft">{r.text} {perfMode ? "notes" : "groups clean"}</span></div>
                  <div class="mt-1 h-1.5 rounded-full bg-ws-raised"><div class="h-full rounded-full {r.value >= 0.67 ? 'bg-success' : r.value >= 0.34 ? 'bg-warn' : 'bg-destructive'}" style:width="{Math.max(2, r.value * 100)}%"></div></div>
                </li>
              {/each}
            </ul>
          {:else}<p class="mt-2 text-sm text-ws-soft">This range has no sections to split.</p>{/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="stage relative overflow-hidden rounded-2xl p-3 sm:p-5" class:dim={phase === "results"} data-testid="studio-stage" data-downbeat={live && perfMode ? Math.round(startAt) : undefined}>
    {#if live}
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-ws-stage-ink/10" role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div class="h-full rounded-full bg-instr" style:width="{progress * 100}%"></div>
      </div>
      <div class="mb-3 flex flex-wrap gap-2">
        <Stat label={perfMode ? "Take" : "Mode"} value={perfMode ? `${(queue[qi]?.take ?? 0) + 1} of ${takes}` : "Wait"} />
        {#if ls && fstate}<Stat label="Group" value="{Math.min(ls.index + 1, fstate.groups.length)} of {fstate.groups.length}" />{/if}
        {#if ls?.expected.length && memory === "off"}<Stat label="Next" value={ls.expected.map((m) => (drums ? (GROOVE_VOICES.find((v) => v.midi === m)?.name ?? "") : noteName(m + written))).join(drums ? ", " : " ")} />{/if}
        <Stat label="Tempo" value="{bpm} BPM" />
        {#if spot}<Stat label="Loop, {barsOf(spot.range)}" value={`${spot.streak} of ${SPOT.clean} clean`} />{/if}
      </div>
    {:else if preview?.playing}
      <p class="mb-2 text-sm text-ws-stage-soft">Listening, not scored. The cursor follows the sound.</p>
    {/if}
    {#if staffFailed && view === "staff"}
      <p class="mb-3 rounded-xl bg-ws-stage-ink/10 p-3 text-sm">
        Staff preview unavailable for this score. <a class="font-semibold underline underline-offset-4" href="?view=waterfall">Open the Waterfall</a>, which shows every note.
      </p>
    {/if}
    {#if (view === "tab" || fretted) && !live}
      <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium">Tuning</span>
          <Picker class="w-auto" tone="stage" label="Tuning" value={tuning.id} options={TUNING_LIST.map((t) => ({ value: t.id, label: `${t.instrument === "guitar" ? "Guitar" : "Ukulele"}, ${t.name}` }))} onchange={(v) => setup.set({ tuning: v })} />
        </div>
        {#if fitted.score !== score}
          <p class="min-w-0 flex-1 text-ws-stage-soft" data-fit>
            {s.fit === "auto" ? fitNote : `As written: some notes are out of the ${tuning.instrument === "ukulele" ? "ukulele" : "guitar"}'s range.`}
            <button type="button" class="ml-1 font-semibold text-ws-stage-ink underline underline-offset-4" onclick={() => setup.set({ fit: s.fit === "auto" ? "written" : "auto" })}>{s.fit === "auto" ? "Show as written" : "Fit to the instrument"}</button>
          </p>
        {/if}
      </div>
    {/if}
    {#if view === "fingering" && settings.value.activeInstrument !== "aerophone" && !live}
      <p class="mb-2 text-sm text-ws-stage-soft">Aerophone fingerings for the top line of the selected voices.</p>
    {/if}
    {#if live && memory === "look"}<p class="mb-2 text-sm text-ws-stage-soft">From memory: the notes are hidden until the results.</p>{/if}
    <StudioScore
      score={played}
      hide={hideBeat}
      {voiceIds}
      {view}
      tuning={{ openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name }}
      {cursorBeat}
      {groupStates}
      {marks}
      {flashes}
      {selection}
      onselect={s.range === "custom" && !live ? pickRange : undefined}
      snap={s.snap === "group" ? "group" : "bar"}
      {bpm}
      compact={live}
      {highlights}
      {written}
      {drums}
      onfallback={(r) => (staffFailed = r)}
    />
    {#if !live && phase !== "results"}
      {#if drums}
        <p class="mt-3 text-sm text-ws-stage-soft">Play it on the MPC pads, any MIDI pads, or the on-screen pads with the strip on MPC pads. Graded by drum: any hat counts for a hat, kick and snare must be exact.</p>
      {:else}
        <p class="mt-3 text-sm text-ws-stage-soft">Playing on {INSTRUMENT_LABEL[settings.value.activeInstrument]}{octaveExact ? "" : "; octaves don't count against you through the microphone"}. MIDI, the on-screen keys and your computer keyboard all work.</p>
      {/if}
    {/if}
  </div>

  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
</section>

<style>
  .stage.dim {
    opacity: 0.7;
  }
  .results-enter {
    animation: ws-rise 220ms ease-out;
  }
</style>
