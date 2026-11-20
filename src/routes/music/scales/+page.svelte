<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { evennessRow, noteName, pc } from "@repo/music-core";
  import { SCALE_GROUPS } from "@repo/music-core/theory/scales";
  import { conceptCard, hasThumbUnder } from "@repo/music-core/lessons/cards";
  import {
    ABRSM_SPEEDS,
    CHORD_KINDS,
    HANDS_APART,
    SCALE_PATTERNS,
    HANDS_TOGETHER_PRESET,
    SCALE_TEMPO,
    isScaleLine,
    gradeLabel,
    gradeSpeed,
    scaleDrillTargets,
    scaleSetupKey,
    scaleSkills,
    type ChordKind,
    type DrillScaleKind,
    type HandsApart,
    type ScalePattern,
  } from "@repo/music-core/content/technique";
  import {
    gradeLine,
    ladderAfterRun,
    ladderProjection,
    mergeLadders,
    type LadderState,
    type LineResult,
  } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions } from "#lib/music/components/InstrumentStage.svelte";
  import Fretboard from "#lib/music/components/Fretboard.svelte";
  import { scaleFretMarks, type Outcome } from "./fret-marks";
  import { withSlips } from "#lib/music/drills/guitar/fretted.ts";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import FallingKeys from "#lib/music/notation/FallingKeys.svelte";
  import { lineScore } from "#lib/music/notation/falling.ts";
  import Verdict, { type VerdictKind } from "#lib/music/components/Verdict.svelte";
  import ViewSwitch from "#lib/music/notation/ViewSwitch.svelte";
  import { page } from "$app/state";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { scaleFingerMap } from "@repo/music-core/content/piano-fingering";
  import Choice from "#lib/music/components/Choice.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import Picker from "#lib/music/components/Picker.svelte";
  import type { SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, readKeyed, runInstrument, runSource, tuningText, writeKeyed, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { benchFromUrl, Transport } from "#lib/music/drills/piano/transport.svelte.ts";
  import { audio, settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { formatList } from "@repo/i18n/format";

  const LADDER_KEY = "technique.tempo-ladder.v1";
  const cfg = new DrillSetup("scales", {
    kind: "major" as string,
    tonic: 60,
    span: "one-octave" as string,
    motion: "up-down" as string,
    hands: "right" as string,
    preset: false as boolean,
    pattern: "scale" as string,
    chord: "major" as string,
    perBeat: 1,
    /** An ABRSM grade whose speed was picked ("" for none). */
    grade: "" as string,
    /** Both hands: an octave apart, contrary motion, a third or a sixth apart. */
    apart: "octave" as string,
    /** Arpeggios: from the root (0), the 3rd (1), the 5th (2) or the 7th (3). */
    inversion: 0,
    /** After a clean checked run, move the tonic up a fifth round the circle. */
    rotate: false as boolean,
  });
  const PATTERNS = SCALE_PATTERNS.map((p) => ({ value: p.id, label: p.label, hint: p.hint }));
  const s = $derived(cfg.value);
  const pattern = $derived((PATTERNS.some((p) => p.value === s.pattern) ? s.pattern : "scale") as ScalePattern);
  const perBeat = $derived(([1, 2, 3, 4, 6].includes(s.perBeat) ? s.perBeat : 1) as 1 | 2 | 3 | 4 | 6);
  /** Three or six a click is compound time: written in 12/8, a click to each dotted quarter. */
  const quartersPerClick = $derived(perBeat % 3 === 0 ? 1.5 : 1);
  const inst = $derived(settings.value.activeInstrument);
  const onPiano = $derived(inst === "piano");
  const scaleSetup = $derived({
    pattern,
    chord: (pattern === "triad-pairs" && s.chord !== "minor" ? "major" : s.chord) as ChordKind,
    perBeat,
    kind: s.kind as DrillScaleKind,
    tonic: s.tonic,
    apart: (HANDS_APART.some((a) => a.id === s.apart) ? s.apart : "octave") as HandsApart,
    inversion: pattern === "arpeggio" ? s.inversion : 0,
    span: (!isScaleLine(pattern) && s.span === "pentascale" ? "one-octave" : s.span) as "pentascale" | "one-octave" | "two-octave",
    motion: s.motion as "up" | "down" | "up-down",
    // One line off the piano: hands are a keyboard idea.
    hands: (onPiano ? s.hands : "right") as "right" | "left" | "both",
    bpm: bpm(),
    minEvenness: s.preset && onPiano ? HANDS_TOGETHER_PRESET.minEvenness : undefined,
  });
  // Up an octave when the instrument can't reach the line's low notes (ukulele, Aerophone).
  const steps = $derived.by(() => {
    const raw = scaleDrillTargets(scaleSetup);
    const shift = fitShift(raw.flatMap((st) => st.notes.map((n) => n.midi)), inst);
    return shift ? raw.map((st) => ({ ...st, notes: st.notes.map((n) => ({ ...n, midi: n.midi + shift })) })) : raw;
  });
  const key = $derived(scaleSetupKey(scaleSetup));
  // Cards for a scale line, shown the first time Check is chosen: the formula (major, minor), and on the piano where the thumb passes under.
  const cards = $derived(
    !isScaleLine(pattern)
      ? []
      : [
          ...(s.kind === "major" ? ["scales.major-formula"] : ["natural-minor", "harmonic-minor", "melodic-minor"].includes(s.kind) ? ["scales.minor-forms"] : []),
          ...(onPiano && scaleSetup.span !== "pentascale" && hasThumbUnder(s.kind) ? ["scales.thumb-under"] : []),
        ],
  );

  function bpm() {
    return Math.min(SCALE_TEMPO.max, Math.max(SCALE_TEMPO.min, settings.value.bpm));
  }
  /** One note's time: the click divided by the notes to a click. */
  const stepMs = () => 60000 / bpm() / perBeat;
  const target = $derived(s.grade ? gradeSpeed(s.grade, pattern) : undefined);
  const PER = { 1: m.music_strings_per_1(), 2: m.music_strings_per_2(), 3: m.music_strings_per_3(), 4: m.music_strings_per_4(), 6: m.music_strings_per_6() } as const;
  const PER_NAME: Record<number, string> = { 1: m.music_strings_per_name_1(), 2: m.music_strings_per_name_2(), 3: m.music_strings_per_name_3(), 4: m.music_strings_per_name_4(), 6: m.music_strings_per_name_6() };
  /** One menu for the setups that set tempo and notes a click together: the hands-together preset, a plain start, or an ABRSM grade's speed. */
  function pickPreset(v: string) {
    if (v === "together") {
      cfg.set({ pattern: "scale", perBeat: 1, grade: "", span: HANDS_TOGETHER_PRESET.span, motion: HANDS_TOGETHER_PRESET.motion, hands: HANDS_TOGETHER_PRESET.hands, preset: true });
      settings.update({ bpm: HANDS_TOGETHER_PRESET.bpm });
    } else if (v === "plain") cfg.set({ perBeat: 1, grade: "", preset: false });
    else {
      const sp = gradeSpeed(v, pattern);
      cfg.set({ grade: v, ...(sp ? { perBeat: sp[1] } : {}), preset: false });
      if (sp) settings.update({ bpm: sp[0] });
    }
  }
  const presetOptions = $derived([
    ...(onPiano ? [{ value: "together", label: m.music_strings_scales_preset_together() }] : []),
    { value: "plain", label: m.music_strings_scales_preset_plain() },
    ...ABRSM_SPEEDS.map((g) => {
      const sp = gradeSpeed(g.grade, pattern);
      return { value: g.grade, label: sp ? m.music_strings_scales_preset_grade({ grade: gradeLabel(g.grade), bpm: sp[0], per: PER[sp[1]] }) : m.music_strings_scales_preset_no_speed({ grade: gradeLabel(g.grade) }), group: m.music_strings_scales_preset_group(), disabled: !sp };
    }),
  ]);

  // Keyboard spans the line, snapped out to whole octaves from C.
  const all = $derived(steps.flatMap((st) => st.notes.map((n) => n.midi)));
  const low = $derived(Math.floor((Math.min(...all) - 2) / 12) * 12);
  const high = $derived(Math.ceil((Math.max(...all) + 2) / 12) * 12);
  // Falling notes run on their own beat clock, in quarters, from the run's downbeat or the demo's start.
  const falling = $derived(onPiano && page.url.searchParams.get("view") === "falling");
  const clock = new Transport();
  const quarterMs = () => 60000 / bpm() / quartersPerClick;

  let phase = $state<Phase>("ready");
  // Path links carry the tempo (and Check): apply them once.
  let mode = $state<DrillMode>(benchFromUrl(SCALE_TEMPO));
  let status = $state("");
  let stepIndex = $state(0);
  /** How each step went this run, as it is played. */
  let played = $state<Outcome[]>([]);
  /** A wrong note was heard on the current step. */
  let slipped = false;
  /** The first wrong note heard on each slipped step. */
  let firstWrong: (number | undefined)[] = [];
  let demoStep = $state<number | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let summary = $state<RunSummary | null>(null);
  let result = $state<(LineResult & { outcomes: Outcome[]; slips: number[] }) | null>(null);
  let ladders = $state<Record<string, LadderState>>({});
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;

  void readKeyed<LadderState>(LADDER_KEY).then((l) => (ladders = l));

  // Piano scales carry the standard fingering for each hand, on the keys and the staff.
  const fingerOf = $derived.by(() => {
    const out = new Map<string, number>();
    if (!onPiano || pattern !== "scale") return out;
    for (const hand of ["right", "left"] as const) {
      const ms = steps.flatMap((st) => st.notes.filter((n) => n.hand === hand).map((n) => n.midi));
      if (!ms.length) continue;
      // From the tonic at or below the hand's lowest note: a hand a third or a sixth off the tonic keeps the scale's fingering.
      const lo = Math.min(...ms) - pc(Math.min(...ms) - s.tonic);
      const span = (Math.max(...ms) - lo) / 12;
      const map = scaleFingerMap(s.kind, lo, hand === "right" ? "rh" : "lh", scaleSetup.span === "pentascale" ? "pentascale" : Math.max(1, Number.isInteger(span) ? span : Math.ceil(span)));
      map?.forEach((f, m) => out.set(`${hand}:${m}`, f));
    }
    return out;
  });
  const fingerFor = (n: { midi: number; hand: "left" | "right" }) => fingerOf.get(`${n.hand}:${n.midi}`);
  /** The key's label: its finger, else L or R when both hands play. */
  const keyLabel = (n: { midi: number; hand: "left" | "right" }) => fingerFor(n)?.toString() ?? (scaleSetup.hands === "both" ? (n.hand === "left" ? "L" : "R") : undefined);

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    const both = scaleSetup.hands === "both";
    // Before a run: every note of the line at once, by hand when both play.
    if (demoStep === null && phase === "ready" && mode === "practice") {
      for (const st of steps)
        for (const n of st.notes) {
          const prev = out[n.midi];
          const mine = keyLabel(n);
          // A key both hands play (the middle octave of two): both fingers, left then right.
          out[n.midi] =
            both && prev && prev.role !== n.hand && prev.label && mine && !prev.label.includes("/")
              ? { target: true, label: n.hand === "left" ? `${mine}/${prev.label}` : `${prev.label}/${mine}` }
              : { target: true, label: mine, role: both ? n.hand : "scale" };
        }
      return out;
    }
    const show = demoStep ?? (mode === "practice" && phase !== "results" ? stepIndex : null);
    if (show === null || !steps[show]) return out;
    for (const n of steps[show].notes)
      out[n.midi] = demoStep !== null ? { demo: true, label: fingerFor(n)?.toString() } : { target: true, label: keyLabel(n), role: scaleSetup.hands === "both" ? n.hand : undefined };
    return out;
  });

  const SCALE_LABEL: Record<string, () => string> = {
    major: m.music_strings_scale_major,
    "natural-minor": m.music_strings_scale_natural_minor,
    "harmonic-minor": m.music_strings_scale_harmonic_minor,
    dorian: m.music_strings_scale_dorian,
    phrygian: m.music_strings_scale_phrygian,
    lydian: m.music_strings_scale_lydian,
    mixolydian: m.music_strings_scale_mixolydian,
    locrian: m.music_strings_scale_locrian,
    "melodic-minor": m.music_strings_scale_melodic_minor,
    "major-pentatonic": m.music_strings_scale_major_pentatonic,
    "minor-pentatonic": m.music_strings_scale_minor_pentatonic,
    blues: m.music_strings_scale_blues,
    altered: m.music_strings_scale_altered,
    "bebop-major": m.music_strings_scale_bebop_major,
    "bebop-dominant": m.music_strings_scale_bebop_dominant,
    "whole-tone": m.music_strings_scale_whole_tone,
    diminished: m.music_strings_scale_diminished,
    chromatic: m.music_strings_scale_chromatic,
  };
  const scaleLabel = (k: string) => SCALE_LABEL[k]?.() ?? k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const CHORD_KIND_WORD: Record<string, () => string> = { major: m.music_strings_chordkind_major, minor: m.music_strings_chordkind_minor, "dominant-7": m.music_strings_chordkind_dominant_7, "diminished-7": m.music_strings_chordkind_diminished_7 };
  const chordLabel = $derived((CHORD_KIND_WORD[s.chord] ?? CHORD_KIND_WORD.major)());
  const tonicName = (p: number) => noteName(p, "flat", false);
  /** Where an arpeggio starts, by inversion: the chord tone's name. */
  const INVERSIONS = ["", m.music_strings_inv_noun_1(), m.music_strings_inv_noun_2(), m.music_strings_inv_noun_3()];
  const START_ON = [m.music_strings_scales_start_0, m.music_strings_scales_start_1, m.music_strings_scales_start_2, m.music_strings_scales_start_3];
  const START_HINT = [undefined, m.music_strings_scales_start_hint_1, m.music_strings_scales_start_hint_2, m.music_strings_scales_start_hint_3];
  const what = $derived.by(() => {
    const tonic = tonicName(s.tonic);
    if (isScaleLine(pattern)) {
      const scale = scaleLabel(s.kind).toLowerCase();
      return (pattern === "thirds" ? m.music_strings_scales_what_thirds : pattern === "octaves" ? m.music_strings_scales_what_octaves : m.music_strings_scales_what_scale)({ tonic, scale });
    }
    if (pattern === "arpeggio")
      return scaleSetup.inversion ? m.music_strings_scales_what_arpeggio_from({ tonic, chord: chordLabel, from: INVERSIONS[scaleSetup.inversion] }) : m.music_strings_scales_what_arpeggio({ tonic, chord: chordLabel });
    if (pattern === "triad-pairs") return (s.chord === "minor" ? m.music_strings_scales_what_pairs_minor : m.music_strings_scales_what_pairs_major)({ a: tonic, b: tonicName(s.tonic + 2) });
    return (pattern === "blocked" ? m.music_strings_scales_what_blocked : m.music_strings_scales_what_broken)({ tonic, chord: chordLabel });
  });
  const apartLabel = $derived(HANDS_APART.find((a) => a.id === scaleSetup.apart)!.label.toLowerCase());
  const setupLine = $derived<SetupClause[]>([
    { text: what, focus: "kind" },
    { text: scaleSetup.span === "pentascale" ? m.music_strings_span_five() : scaleSetup.span === "two-octave" ? m.music_strings_span_two_octave() : m.music_strings_span_one_octave(), focus: "span" },
    { text: s.motion === "up-down" ? m.music_strings_motion_up_down() : s.motion === "down" ? m.music_strings_motion_down() : m.music_strings_motion_up(), focus: "motion" },
    onPiano ? { text: scaleSetup.hands === "both" ? (scaleSetup.apart === "octave" ? m.music_strings_hands_together() : m.music_strings_hands_together_apart({ apart: apartLabel })) : scaleSetup.hands === "left" ? m.music_strings_left_hand() : m.music_strings_right_hand(), focus: "hands" } : { text: m.music_strings_on_inst({ inst }) },
    ...(s.rotate ? [{ text: m.music_strings_scales_round_circle(), focus: "rotate" }] : []),
    ...(perBeat > 1 ? [{ text: PER[perBeat], focus: "per" }] : []),
    ...(target ? [{ text: m.music_strings_scales_aiming({ grade: gradeLabel(s.grade), bpm: target[0], per: PER[target[1]] }), focus: "preset" }] : []),
  ]);

  function stopDemo() {
    clock.stop();
    demo?.stop();
    demo = null;
    demoStep = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = stepMs() / 1000;
    const notes = steps.flatMap((st, i) => st.notes.map((n) => ({ midi: n.midi, time: i * beatS, duration: beatS * 0.9 })));
    const handle = audio.playSequence(notes, {
      onNote: (i: number) => {
        const idx = Math.floor(notes[i].time / beatS + 1e-6);
        demoStep = idx;
      },
    });
    demo = handle;
    clock.follow(handle.startPerf, quarterMs());
    status = m.music_strings_scales_demo();
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const step = steps[stepIndex];
    if (!step) return;
    const expected = step.notes.map((n) => n.midi);
    if (expected.includes(e.midi)) {
      if (mode === "practice") flashes.add(e.midi, "correct");
      const hit = new Set(cap!.notes.filter((n) => n.kind === "noteon" && n.at >= stepStart).map((n) => n.midi));
      if (expected.every((m) => hit.has(m))) advance(e.at);
    } else {
      if (!slipped) firstWrong[stepIndex] = e.midi;
      slipped = true;
      // Name both notes, so the red key or fret says what went wrong. Check says it after the slip,
      // played note first ("F, wanted G"); the target was never shown before it.
      flashes.add(e.midi, "wrong");
      const want = expected.map((x) => noteName(x, spell, mode === "practice")).join(" ");
      const heard = noteName(e.midi, spell, mode === "practice");
      verdict = { kind: "wrong", text: mode === "practice" ? m.music_strings_scales_wanted_heard({ want, heard }) : m.music_strings_scales_heard_wanted({ heard, want }), key: (verdict?.key ?? 0) + 1 };
      // A quarter tone off rounds to the next note: say it is the tuning, not the playing.
      const miss = e.source === "audio" ? nearMiss(e.midi, e.cents, expected) : null;
      if (miss) {
        detuned = [...detuned, miss];
        status = tuningText(miss, e.midi, inst);
        // Practice moves on past a single out-of-tune note (it still scores as missed); Check waits.
        if (mode === "practice" && expected.length === 1) advance(e.at);
      }
    }
  }
  /** On to the next step, the one just left green when no wrong note came first. */
  function advance(at: number) {
    played[stepIndex] = slipped ? "wrong" : "correct";
    slipped = false;
    stepIndex += 1;
    stepStart = at - 60;
    if (stepIndex >= steps.length) void finish();
  }
  let stepStart = 0;
  let verdict = $state<{ kind: VerdictKind; text?: string; key: number } | null>(null);
  /** Notes heard close to the target but out of tune, this run. */
  let detuned: { midi: number; cents: number }[] = [];

  // The line written out above the instrument (tab on guitar and ukulele, a staff otherwise), its cursor on the step.
  const frets = $derived(linePositions(inst, all));
  const written = $derived(steps.flatMap((st) => st.notes.map((n) => ({ midi: n.midi, startBeat: st.atBeat * quartersPerClick, durationBeats: quartersPerClick / perBeat, hand: onPiano ? n.hand : undefined, finger: fingerFor(n), ...frets.get(n.midi) }))));
  // A triad pair is written in the key it belongs to: a major pair is IV and V a 4th up, a minor pair ii and iii a step down.
  const signature = $derived(pattern === "triad-pairs" ? signatureFor((s.tonic + (s.chord === "minor" ? 10 : 5)) % 12, "major") : isScaleLine(pattern) ? signatureFor(s.tonic % 12, s.kind === "chromatic" ? "major" : s.kind) : s.chord === "minor" ? signatureFor(s.tonic % 12, "natural-minor") : s.chord === "major" ? signatureFor(s.tonic % 12, "major") : 0);
  /** Every note this page names (the cue, a slip, the chips, a held fret) is spelled by the exercise's key. */
  const spell = $derived<"flat" | "sharp">(signature < 0 ? "flat" : "sharp");
  const cursorClick = $derived(demoStep !== null ? (steps[demoStep]?.atBeat ?? null) : phase === "running" ? (steps[Math.min(stepIndex, steps.length - 1)]?.atBeat ?? null) : null);
  const cursor = $derived(cursorClick === null ? null : cursorClick * quartersPerClick);
  /** Each step's take: as played during a run, and after it the steps never reached are missed. */
  const outcomes = $derived(phase === "running" ? played : phase === "results" ? (result?.outcomes ?? steps.map((_, i) => played[i] ?? "missed")) : []);
  const lineStates = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    outcomes.forEach((o, i) => o && (out[i] = o));
    if (phase === "running" && stepIndex < steps.length) out[stepIndex] = "active";
    return out;
  });

  // Guitar and ukulele draw the neck here: fingers, the root, and the run as it is played.
  const tuning = $derived(fretTuning(inst));
  const fretWindow = $derived.by(() => {
    const fs = [...frets.values()].map((p) => p.fret);
    const from = fs.length ? Math.max(0, Math.min(...fs) - 1) : 0;
    return { from, to: Math.max(from + 4, (fs.length ? Math.max(...fs) : 0) + 1) };
  });
  const fretMarks = $derived(
    mode === "check" && phase === "running"
      ? []
      : scaleFretMarks({ steps, at: frets, tonic: s.tonic, all: mode === "practice" || phase === "results", outcomes, now: phase === "running" ? stepIndex : null, demo: demoStep }),
  );
  /** What to do now, beside Stop on a phone: the note and its finger (or fret) in Practice, only where you are in Check. */
  const cue = $derived.by(() => {
    if (phase === "countin") return m.music_strings_count_in();
    const st = steps[stepIndex];
    if (phase !== "running" || !st) return "";
    if (mode === "check") return m.music_strings_line_cue_check({ n: stepIndex + 1, total: steps.length });
    const n = st.notes[0];
    const p = frets.get(n.midi);
    const how = tuning && p ? (p.fret ? m.music_strings_how_string_fret({ string: p.string, fret: p.fret }) : m.music_strings_how_open_string({ string: p.string })) : fingerFor(n) ? m.music_strings_how_finger({ finger: fingerFor(n)! }) : "";
    const notes = st.notes.map((x) => noteName(x.midi, spell)).join(" + ");
    return how && st.notes.length === 1 ? m.music_strings_play_notes_how({ notes, how }) : m.music_strings_play_notes({ notes });
  });
  const unplayable = $derived(tuning ? [...new Set(all.filter((m) => !frets.has(m)))] : []);

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    stepIndex = 0;
    played = [];
    slipped = false;
    firstWrong = [];
    detuned = [];
    flashes.clear();
    verdict = null;
    const beatMs = ctx.beatMs;
    stepStart = ctx.downbeat - beatMs / 2;
    run = practice.beginRun({
      exerciseId: "technique.scale",
      setupKey: key,
      skillIds: scaleSkills(scaleSetup.kind, pattern),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, (s.span === "two-octave" ? 0.6 : scaleSetup.hands === "both" ? 0.5 : 0.35) + (perBeat - 1) * 0.05 + (pattern === "scale" ? 0 : 0.05)),
      instrument: settings.value.activeInstrument,
      params: { bpm: ctx.bpm, kind: s.kind, tonic: s.tonic, span: scaleSetup.span, motion: s.motion, hands: scaleSetup.hands, pattern, chord: s.chord, perBeat, apart: scaleSetup.hands === "both" ? scaleSetup.apart : "octave", inversion: scaleSetup.inversion },
    });
    // Input is scored only after the count-in, so speakers can't bleed into the take.
    cap = capture(ctx.downbeat - beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    clock.follow(ctx.downbeat, quarterMs());
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + steps.length * stepMs() + 4 * beatMs);
    stopClockRef = ctx.stopClock;
  }
  let stopClockRef: (() => void) | null = null;

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
    clock.stop();
    cap?.stop();
    const notes = cap?.notes ?? [];
    // The step the run ended on, after a wrong note: a slip, not a step never reached.
    if (slipped && stepIndex < steps.length) played[stepIndex] = "wrong";
    // The grader follows the line by pitch; the per-step marks decide what counts (a slip is not clean).
    const r = withSlips(
      gradeLine({
        beats: steps.map((st) => st.notes),
        beatMs: stepMs(),
        notes,
        handsTogether: scaleSetup.hands === "both",
        minEvenness: scaleSetup.minEvenness,
      }),
      steps,
      played,
      firstWrong,
    );
    result = r;
    phase = "results";
    const instrument = runInstrument(notes);
    await run!.attempt({
      promptId: key,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: instrument ?? null,
      target: steps.flatMap((st) => st.notes.map((n) => n.midi)),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: m.music_strings_line_run_headline({ score: pct(r.score), bpm: bpm() }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    // The tempo ladder climbs one note a click; faster subdivisions are judged against the grade speed instead.
    const laddered = perBeat === 1;
    const before = ladders[key];
    const after = laddered ? ladderAfterRun(before, { bpm: bpm(), correct: r.correct && mode === "check" }) : before;
    if (laddered && after) ladders = await writeKeyed(LADDER_KEY, key, after, (a, b) => mergeLadders({ k: a }, { k: b }).k);
    // The per-setup ladder (catalog 4.4) is drawn as a record on the ready screen, not as a second next-run offer.
    const atSpeed = target ? bpm() * perBeat >= target[0] * target[1] : null;
    summary = {
      // A slip is named before anything else: the counts and the marks below show it.
      headline: detuned.length
        ? m.music_strings_scales_detuned({ clean: r.clean, total: r.total, notes: [...new Set(detuned.map((d) => noteName(d.midi, spell, false)))].reduce((a, b) => m.music_strings_and_pair({ a, b })), cents: Math.round(detuned.reduce((a, d) => a + Math.abs(d.cents), 0) / detuned.length), inst })
        : r.slips.length
          ? `${m.music_strings_scales_n_right({ clean: r.clean, total: r.total })} ${slipText(r.slips)}${r.pitch < 0.75 ? ` ${m.music_strings_scales_slow_down()}` : ""}`
          : r.correct
            ? target
              ? atSpeed
                ? m.music_strings_scales_clean_grade({ grade: gradeLabel(s.grade) })
                : m.music_strings_scales_clean_bpm_grade({ bpm: bpm(), grade: gradeLabel(s.grade), speed: target[0], per: PER[target[1]] })
              : m.music_strings_scales_clean_bpm({ bpm: bpm(), per: PER[perBeat] })
            : r.pitch < 0.9
              ? m.music_strings_scales_some_right({ clean: r.clean, total: r.total })
              : m.music_strings_line_uneven({ ms: Math.round(r.evennessErrorMs) }),
      metric: pct(r.score),
      metricLabel: m.music_strings_scales_metric(),
      // Exactly what gradeLine's correct tests: the score, and the preset's evenness floor when one is set.
      cleanMeans: scaleSetup.minEvenness !== undefined ? m.music_strings_scales_clean_means_even({ pct: pct(scaleSetup.minEvenness) }) : m.music_strings_line_clean_means(),
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      rows: [
        { label: m.music_strings_notes_right(), value: r.pitch, text: r.slips.length ? m.music_strings_line_slips_text({ clean: r.clean, total: r.total, slips: r.slips.length }) : m.music_strings_n_of_total({ n: r.clean, total: r.total }) },
        evennessRow(r.evenness, r.clean, r.total),
        ...(pattern === "blocked"
          ? [
              r.chordTogether
                ? { label: m.music_strings_scales_chord_together_40(), value: r.chordTogether.chords ? r.chordTogether.count / r.chordTogether.chords : 0, text: m.music_strings_scales_chord_together_text({ n: r.chordTogether.count, total: r.chordTogether.chords, ms: Math.round(r.chordTogether.meanSpreadMs) }) }
                : { label: m.music_strings_scales_chord_together(), notMeasured: true },
            ]
          : []),
        ...(target ? [{ label: m.music_strings_scales_grade_row({ grade: gradeLabel(s.grade), speed: target[0], per: PER[target[1]] }), value: atSpeed ? 1 : (bpm() * perBeat) / (target[0] * target[1]), text: atSpeed ? m.music_strings_reached() : m.music_strings_pct_of_it({ pct: Math.round(((bpm() * perBeat) / (target[0] * target[1])) * 100) }) }] : []),
        ...(scaleSetup.hands === "both"
          ? [
              r.together
                ? { label: m.music_strings_hands_together_40(), value: r.together.beats ? r.together.count / r.together.beats : 0, text: m.music_strings_n_of_total_beats({ n: r.together.count, total: r.together.beats }) }
                : { label: m.music_strings_hands_together_cap(), notMeasured: true },
            ]
          : []),
      ],
      advance: await advanceAfter(r.score, r.correct),
    };
    // Round the circle: a clean check moves on to the key a fifth up.
    if (s.rotate && r.correct && mode === "check") {
      const next = 60 + pc(s.tonic + 7);
      cfg.set({ tonic: next });
      summary.rows = [...(summary.rows ?? []), { label: m.music_strings_next_key(), text: m.music_strings_fifth_up({ key: tonicName(next) }) }];
    }
    status = summary.headline;
  }

  /** Where the slips were, by note number and name: "Slipped on note 5 (G4): a wrong note was played for it." */
  function slipText(at: number[]) {
    const name = (i: number) => m.music_strings_scales_slip_note({ n: i + 1, notes: steps[i].notes.map((n) => noteName(n.midi, spell)).join(" + ") });
    const list = at.length > 2 ? m.music_strings_scales_slip_count({ n: at.length }) : formatList(at.map(name));
    return (at.length > 1 ? m.music_strings_scales_slipped_each : m.music_strings_scales_slipped)({ list });
  }

  /** Notes a click as steps; goals are the fastest ABRSM speed for two and four (blocked chords have none). */
  function advanceAfter(score: number, correct: boolean) {
    const col = (n: 2 | 4) => Math.max(...ABRSM_SPEEDS.map((g) => (isScaleLine(pattern) ? g.scale : g.arpeggio)).filter((x) => x[1] === n).map((x) => x[0]));
    const goals = pattern === "blocked" ? [120, 100, 80] : [120, col(2), col(4)];
    const steps = ([1, 2, 4] as const).map((n, i) => ({ label: PER[n].replace(/^./, (c) => c.toUpperCase()), goal: goals[i] }));
    const id = `scales.${pattern}.${isScaleLine(pattern) ? s.kind : s.chord}.${scaleSetup.span}.${s.motion}.${scaleSetup.hands}${scaleSetup.hands === "both" && scaleSetup.apart !== "octave" ? `-${scaleSetup.apart}` : ""}.${s.tonic}`;
    // Three or six a click sits outside the ABRSM ladder: the next run moves the tempo only.
    const laddered = ([1, 2, 4] as number[]).includes(perBeat);
    return nextRun(id, { bpm: bpm(), tempo: { min: SCALE_TEMPO.min, goal: 120, max: SCALE_TEMPO.max }, ...(laddered ? { steps, step: [1, 2, 4].indexOf(perBeat) } : {}) }, { score, correct }, tempoAnd((i) => cfg.set({ perBeat: [1, 2, 4][i], preset: false })));
  }

  function stop() {
    clearTimeout(timer);
    clock.stop();
    cap?.stop();
    phase = "ready";
    status = m.music_strings_nothing_saved();
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
  });

  const scaleOptions = [
    ...SCALE_GROUPS.modes.map((k) => ({ value: k as string, label: scaleLabel(k), group: m.music_strings_scales_group_modes() })),
    { value: "chromatic", label: m.music_strings_scale_chromatic(), group: m.music_strings_scales_group_modes() },
    ...SCALE_GROUPS.jazz.map((k) => ({ value: k as string, label: scaleLabel(k), group: m.music_strings_scales_group_jazz() })),
  ];
</script>

<svelte:head><title>{m.music_strings_scales_page_title()}</title></svelte:head>

<DrillShell
  lesson={cards.length ? { lessons: cards.flatMap((c) => conceptCard(c, tuning ? { tuning } : {})), trigger: "check" } : null}
  title={m.music_strings_scales_title()}
  hue="piano"
  blurb={m.music_strings_scales_blurb()}
  summary={setupLine}
  bind:phase
  bind:mode
  bind:status
  progress={steps.length ? stepIndex / steps.length : 0}
  clock={{ bpm: bpm(), beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  {cue}
>
  {#snippet setup()}
    <div class="flex flex-col gap-5">
      <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-sm font-semibold text-ws-soft">{m.music_strings_what()}</legend>
        <Choice label={m.music_strings_play()} options={PATTERNS} value={pattern} onchange={(v) => cfg.set({ pattern: v, preset: false })} />
        {#if isScaleLine(pattern)}
          <Choice label={m.music_strings_scale()} setupKey="kind" options={scaleOptions} value={s.kind} onchange={(v) => cfg.set({ kind: v, preset: false })} />
        {:else}
          <Choice label={m.music_strings_chord()} setupKey="kind" options={CHORD_KINDS.filter((c) => pattern !== "triad-pairs" || c.id === "major" || c.id === "minor").map((c) => ({ value: c.id as string, label: c.label }))} value={scaleSetup.chord} onchange={(v) => cfg.set({ chord: v, inversion: 0 })} />
          {#if pattern === "arpeggio"}
            <Choice
              label={m.music_strings_start_on()}
              setupKey="inversion"
              options={INVERSIONS.slice(0, CHORD_KINDS.find((c) => c.id === s.chord)?.intervals.length ?? 3).map((_, i) => ({ value: i, label: START_ON[i](), hint: START_HINT[i]?.() }))}
              value={scaleSetup.inversion}
              onchange={(v) => cfg.set({ inversion: v })}
            />
          {/if}
        {/if}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="tonic">
          <span class="font-medium">{m.music_strings_tonic()}</span>
          <KeyPicker label={m.music_strings_tonic()} value={s.tonic % 12} name={tonicName} onchange={(p) => cfg.set({ tonic: 60 + p })} />
        </div>
      </fieldset>
      <fieldset class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-sm font-semibold text-ws-soft">{m.music_strings_how()}</legend>
        <Choice
          label={m.music_strings_span()}
          setupKey="span"
          options={[
            ...(isScaleLine(pattern) ? [{ value: "pentascale", label: m.music_strings_five_notes() }] : []),
            { value: "one-octave", label: m.music_strings_one_octave() },
            { value: "two-octave", label: m.music_strings_two_octaves() },
          ]}
          value={scaleSetup.span}
          onchange={(v) => cfg.set({ span: v, preset: false })}
        />
        <Choice
          label={m.music_strings_direction()}
          setupKey="motion"
          options={[
            { value: "up", label: m.music_strings_up() },
            { value: "down", label: m.music_strings_down() },
            { value: "up-down", label: m.music_strings_up_and_down() },
          ]}
          value={s.motion}
          onchange={(v) => cfg.set({ motion: v, preset: false })}
        />
        {#if onPiano}
          <Choice
            label={m.music_strings_hands()}
            setupKey="hands"
            options={[
              { value: "right", label: m.music_strings_right_cap() },
              { value: "left", label: m.music_strings_left_cap() },
              { value: "both", label: m.music_strings_both() },
            ]}
            value={scaleSetup.hands}
            onchange={(v) => cfg.set({ hands: v, preset: false })}
          />
          {#if scaleSetup.hands === "both" && isScaleLine(pattern)}
            <Choice label={m.music_strings_hands_apart()} setupKey="apart" options={HANDS_APART.map((a) => ({ value: a.id as string, label: a.label, hint: a.hint }))} value={scaleSetup.apart} onchange={(v) => cfg.set({ apart: v, preset: false })} />
          {/if}
        {/if}
        <Choice
          label={m.music_strings_keys()}
          setupKey="rotate"
          options={[
            { value: "one", label: m.music_strings_this_key() },
            { value: "circle", label: m.music_strings_round_circle(), hint: m.music_strings_round_circle_hint() },
          ]}
          value={s.rotate ? "circle" : "one"}
          onchange={(v) => cfg.set({ rotate: v === "circle" })}
        />
        <Choice label={m.music_strings_notes_a_click()} setupKey="per" options={[1, 2, 3, 4, 6].map((n) => ({ value: n, label: String(n), detail: PER_NAME[n] }))} value={perBeat} onchange={(v) => cfg.set({ perBeat: v, grade: "", preset: false })} />
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="preset">
          <span class="font-medium">{m.music_strings_preset()}</span>
          <Picker label={m.music_strings_preset()} action placeholder={m.music_strings_preset_placeholder()} options={presetOptions} onchange={pickPreset} />
        </div>
      </fieldset>
      {#if perBeat === 1}
        {@const proj = ladderProjection(ladders[key], bpm())}
        <!-- The tempo ladder for this exact setup: a record of what is unlocked, never a second next-run button. -->
        <div class="flex flex-col gap-2 text-sm" data-testid="tempo-ladder">
          <span class="font-semibold text-ws-soft">{m.music_strings_ladder_for_setup()}</span>
          <ol class="flex flex-wrap gap-1.5" aria-label={m.music_strings_ladder()}>
            {#each proj.rungs as r (r.bpm)}
              {@const here = r.bpm === bpm()}
              <li
                class="tnum flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-semibold {r.status === 'unlocked'
                  ? 'border-success bg-success/15 text-ws-ink'
                  : r.status === 'next'
                    ? 'border-instr text-ws-ink'
                    : 'border-dashed border-ws-line text-ws-soft'} {here ? 'ring-2 ring-instr ring-offset-2 ring-offset-ws-surface' : ''}"
                aria-current={here ? "true" : undefined}
              >
                {#if r.status === "unlocked"}<span aria-hidden="true">✓</span>{/if}{r.bpm}<span class="sr-only">
                  {(here ? m.music_strings_ladder_sr_here : m.music_strings_ladder_sr)({ status: r.status === "unlocked" ? m.music_strings_ladder_unlocked() : r.status === "next" ? m.music_strings_ladder_next() : m.music_strings_ladder_locked() })}</span
                >
              </li>
            {/each}
          </ol>
          <span class="text-ws-soft"
            >{bpm() < proj.rungs[0].bpm
              ? m.music_strings_ladder_below({ bpm: bpm(), start: proj.rungs[0].bpm })
              : m.music_strings_ladder_help()}</span
          >
        </div>
      {/if}
      <p class="text-sm text-ws-soft">{m.music_strings_scales_tempo_help()}</p>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_strings_step()} value={m.music_strings_n_of_total({ n: Math.min(stepIndex + 1, steps.length), total: steps.length })} />
      {#if mode === "practice" && steps[stepIndex]}<Stat label={m.music_strings_next_note()} value={steps[stepIndex].notes.map((n) => noteName(n.midi, spell)).join(" + ")} />{/if}
    {:else if result}
      <!-- Evenness waits for the results rows, where too few landed notes read Not measured. -->
      <Stat label={m.music_strings_notes_right()} value="{result.clean}/{result.total}" tone={result.pitch >= 0.9 ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {@const ladderLine = phase === "ready" && perBeat === 1}
    {@const views = phase !== "running" && phase !== "countin" && onPiano && (mode === "practice" || phase === "results")}
    {#if ladderLine || views}
      <!-- One row above the music: the ladder's line and the view switch, so the staff keeps the stage's whole width. -->
      <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {#if ladderLine}
          {@const proj = ladderProjection(ladders[key], bpm())}
          <!-- One line for the ladder; its rungs are in Setup. Checked runs climb it, the strip's BPM is this run. -->
          <p class="min-w-0 flex-1 basis-64 text-sm text-ws-stage-soft" data-testid="tempo-ladder-line">
            {bpm() < proj.rungs[0].bpm
              ? m.music_strings_ladder_below({ bpm: bpm(), start: proj.rungs[0].bpm })
              : proj.rungs.some((r) => r.bpm === bpm())
                ? m.music_strings_ladder_at({ bpm: bpm() })
                : m.music_strings_ladder_starts({ bpm: proj.rungs[0].bpm })}
          </p>
        {/if}
        {#if views}<ViewSwitch class="ml-auto" />{/if}
      </div>
    {/if}
    {#if mode === "check" && phase !== "results"}
      <!-- Check: no targets, only where you are in the line and the notes already played, named once they are behind you. -->
      <div class="mb-1 flex min-h-0 flex-col justify-center gap-3" data-testid="check-progress" data-dock="music">
        <ol class="flex flex-wrap gap-1.5" aria-label={m.music_strings_steps_played()}>
          {#each steps as st, i (i)}
            {@const done = phase === "running" && i < stepIndex}
            {@const now = phase === "running" && i === stepIndex}
            <li
              class="tnum flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border-2 px-2 text-base font-semibold {done
                ? played[i] === 'wrong'
                  ? 'border-destructive bg-destructive text-white'
                  : 'border-success bg-success text-success-foreground'
                : now
                  ? 'border-instr bg-instr/20 text-ws-stage-ink'
                  : 'border-ws-stage-soft/50 text-ws-stage-soft'}"
            >
              {#if done}
                <span aria-hidden="true">{played[i] === "wrong" ? "✕" : "✓"}</span>{st.notes.map((n) => noteName(n.midi, spell, false)).join("+")}
                <span class="sr-only">{played[i] === "wrong" ? m.music_strings_step_slipped() : m.music_strings_step_clean()}</span>
              {:else}
                <span class="sr-only">{now ? m.music_strings_step_n_now({ n: i + 1 }) : m.music_strings_step_n({ n: i + 1 })}</span><span aria-hidden="true">{i + 1}</span>
              {/if}
            </li>
          {/each}
        </ol>
        <p class="text-sm text-ws-stage-soft">
          {(tuning ? m.music_strings_scales_check_frets : m.music_strings_scales_check_keys)({ what, n: steps.length })}
        </p>
      </div>
    {/if}
    {#if falling && (mode === "practice" || phase === "results")}
      <FallingKeys score={lineScore(written, quartersPerClick > 1 ? { beats: 12, beatUnit: 8 } : undefined)} {low} {high} beat={clock.beat} groupStates={lineStates} {marks} {flashes} />
    {:else}
      {#if mode === "practice" || phase === "results"}
        <!-- On a phone before Start the instrument alone fits above the docked Start; the line shows once running. -->
        <div class="mb-1 min-h-0 {phase === 'ready' ? 'max-sm:hidden' : ''}" data-dock="music">
          <LineNotation notes={written} tuning={fretTuning(inst)} title={key} cursorBeat={cursor} groupStates={lineStates} keyFifths={signature} meter={quartersPerClick > 1 ? [12, 8] : undefined} />
        </div>
      {/if}
      {#if phase === "running" || phase === "countin"}
        <!-- The verdict's own rail, never over the keys or frets it names. -->
        <Verdict rail kind={verdict?.kind} text={verdict?.text} key={verdict?.key ?? 0} />
      {/if}
      <div class="relative flex flex-col justify-end" data-dock="instrument">
      {#if tuning}
        <div style:--instr="var(--hue-{inst})">
          <Fretboard openStrings={tuning.openStrings} from={fretWindow.from} to={fretWindow.to} marks={fretMarks} {flashes} flashByPitch stringNames fingerRings compact={phase === "ready"} heldName={mode === "check" ? (x) => noteName(x, spell, false) : undefined} label={m.music_strings_inst_fretboard({ inst })} />
        </div>
        {#if unplayable.length}
          <p class="mt-1 text-sm text-ws-stage-soft">{(unplayable.length > 1 ? m.music_strings_out_of_range_many : m.music_strings_out_of_range_one)({ notes: unplayable.map((x) => noteName(x, spell)).join(", "), inst })}</p>
        {/if}
      {:else}
        <InstrumentStage line={all} {low} {high} {marks} {flashes} spelling={spell} />
      {/if}
      </div>
    {/if}
    {#if tuning && mode === "practice"}
      <!-- One badge per state on the neck, the same before, during and after a run. -->
      <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-stage-soft {phase === 'ready' ? 'max-sm:hidden' : ''}" aria-label={m.music_strings_neck_marks()}>
        <li class="flex items-center gap-1.5"><span class="grid size-5 place-items-center rounded-full bg-ws-stage text-[0.8125rem] font-bold text-ws-stage-ink ring-2 ring-ws-stage-ink" aria-hidden="true">1</span>{m.music_strings_mark_note_finger()}</li>
        <li class="flex items-center gap-1.5"><span class="size-5 rounded-md bg-ws-stage ring-2 ring-ws-stage-ink" aria-hidden="true"></span>{m.music_strings_mark_root()}</li>
        <li class="flex items-center gap-1.5"><span class="size-5 rounded-full bg-ws-stage-ink" aria-hidden="true"></span>{phase === "running" ? m.music_strings_mark_play_now() : demo ? m.music_strings_mark_sounding() : m.music_strings_mark_play_now_run()}</li>
        {#if phase !== "ready"}
          <li class="flex items-center gap-1.5"><span class="grid size-5 place-items-center rounded-full bg-success text-sm font-bold text-white" aria-hidden="true">✓</span>{m.music_strings_mark_played_right()}</li>
          <li class="flex items-center gap-1.5"><span class="grid size-5 place-items-center rounded-full bg-destructive text-sm font-bold text-white" aria-hidden="true">✕</span>{m.music_strings_mark_slipped_missed()}</li>
        {/if}
      </ul>
    {:else if onPiano && pattern === "scale" && phase === "ready"}
      <p class="mt-3 text-sm text-ws-stage-soft">
        {fingerOf.size ? m.music_strings_scales_fingering() : m.music_strings_scales_no_fingering()}
      </p>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <!-- The run written out with each step's mark: the same marks the counts above are made of. -->
      {#snippet figure()}
        <div class="flex flex-col gap-2" data-testid="scales-marked">
          <p class="text-sm font-semibold">{m.music_strings_line_your_run()}</p>
          <LineNotation notes={written} tuning={fretTuning(inst)} title={key} groupStates={lineStates} keyFifths={signature} meter={quartersPerClick > 1 ? [12, 8] : undefined} />
          <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-soft" aria-label={m.music_strings_marks_mean()}>
            <li class="flex items-center gap-1.5"><span class="grid size-5 place-items-center rounded-full bg-success text-sm font-bold text-success-foreground" aria-hidden="true">✓</span>{m.music_strings_right_first_time()}</li>
            <li class="flex items-center gap-1.5"><span class="grid size-5 place-items-center rounded-full bg-destructive text-sm font-bold text-[color:var(--on-destructive)]" aria-hidden="true">✕</span>{m.music_strings_slipped_wrong_first()}</li>
            <li class="flex items-center gap-1.5"><span class="size-4 rounded-full border-2 border-ws-soft" aria-hidden="true"></span>{m.music_strings_not_played()}</li>
          </ul>
        </div>
      {/snippet}
      <Results {summary} {figure} />
    {/if}
  {/snippet}
</DrillShell>
