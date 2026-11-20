<script lang="ts">
  // Aerophone technique beyond the lessons and breath holds (docs/research/
  // pads-aerophone-gaps.md): timed scales and arpeggios in any key, tonguing
  // patterns told apart by the breath, register crossings, trills, and bite
  // vibrato at a rate, swing articulation (doo-DAH over swung eighths) and a
  // long-tone scale at one level. The lines are graded by order and evenness;
  // the rest by their own measures in content/aero-skills.
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { ControlEvent, NoteEvent } from "@repo/music-core";
  import { clamp, evennessRow, noteName } from "@repo/music-core";
  import { pushTrace } from "@repo/music-core/scoring/aerophone";
  import BreathTrace from "./BreathTrace.svelte";
  import { aeroSpeller, fingeringWords } from "./names";
  import {
    AERO_GRADE_SPEEDS,
    AERO_PATTERNS,
    AERO_SCALES,
    BREATH_LEVELS,
    LONG_SCALE_BEATS,
    SWING,
    gradeSwing,
    heldBand,
    patternFits,
    swingMarks,
    REGISTER_PAIRS,
    TONGUING,
    TRILL_PAIRS,
    TRILL_SECONDS,
    VIBRATO,
    VIBRATO_SETS,
    bendWobble,
    crossingLine,
    glitches,
    gradeTrill,
    joinTypes,
    octaveSlip,
    scaleLine,
    tonguingMarks,
    tonguingScore,
    tonguingVerdict,
  } from "@repo/music-core/content/aero-skills";
  import { gradeLine, type LineResult } from "@repo/music-core/scoring/technique";
  import { attackTiming } from "@repo/music-core/scoring/aerophone";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import { biteVibratoLesson } from "@repo/music-core/lessons/tier1";
  import { aeroLessons } from "@repo/music-core/lessons/technique";
  import AerophoneKeys from "#lib/music/components/AerophoneKeys.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { transposeFifths, writtenOffset } from "@repo/music-core/theory/transposition";
  import Choice from "#lib/music/components/Choice.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import { btn } from "#lib/music/components/ui.ts";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { benchFromUrl } from "#lib/music/drills/piano/transport.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { audio, input, settings } from "#lib/music/runtime/index.ts";
  import MidiStatus from "#lib/music/drills/pads/MidiStatus.svelte";
  import { aerophoneSkills, type AerophoneMode } from "@repo/music-core/content/winds-pads";
  import { m } from "@repo/i18n/messages.js";

  type Skill = "scales" | "tonguing" | "register" | "trills" | "vibrato" | "swing" | "long-scale";
  let { skill, modes, onmode }: { skill: Skill; modes: readonly { id: string; label: string }[]; onmode: (m: string) => void } = $props();

  const cfg = new DrillSetup("aero-skills", {
    scale: "major" as string,
    key: 0,
    perBeat: 1,
    tongue: "slur2-tongue2" as string,
    pair: "cs5-d5" as string,
    trill: "g4-a4" as string,
    vib: "4-at-60" as string,
    vibNote: 67,
    octaves: 1,
    pattern: "straight" as string,
    level: "p" as string,
  });
  const s = $derived(cfg.value);
  const vib = $derived(VIBRATO_SETS.find((v) => v.id === s.vib) ?? VIBRATO_SETS[0]);
  const bpm = $derived(skill === "vibrato" ? vib.bpm : clamp(settings.value.bpm, 30, 240));
  const perBeat = $derived(skill === "scales" ? ([1, 2, 4].includes(s.perBeat) ? s.perBeat : 1) : skill === "long-scale" ? 1 / LONG_SCALE_BEATS : 2);
  const beatMs = $derived(60000 / bpm);
  const octaves = $derived(skill === "scales" && s.octaves === 2 ? 2 : 1);
  const pattern = $derived(skill === "scales" && patternFits(s.scale) ? (AERO_PATTERNS.find((p) => p.id === s.pattern)?.id ?? "straight") : "straight");
  const level = $derived(BREATH_LEVELS.find((l) => l.id === s.level) ?? BREATH_LEVELS[1]);
  const scaleOf = $derived(AERO_SCALES.find((x) => x.id === s.scale) ?? AERO_SCALES[0]);
  const stepMs = $derived(60000 / bpm / perBeat);
  const trillPair = $derived(TRILL_PAIRS.find((p) => p.id === s.trill) ?? TRILL_PAIRS[0]);
  const regPair = $derived(REGISTER_PAIRS.find((p) => p.id === s.pair) ?? REGISTER_PAIRS[0]);
  // The material is written for the fingering chart (keys, pairs and notes as
  // read); the run is concert, what the AE-20 sends in its reading key.
  const shift = $derived(writtenOffset("aerophone", settings.value));
  const concert = (written: readonly number[]) => written.map((m) => m - shift);
  const trillNotes = $derived(concert(trillPair.notes));
  const vibNote = $derived(s.vibNote - shift);

  /** The notes to play in time (scales, tonguing and crossings), concert. */
  const writtenLine = $derived.by(() => {
    if (skill === "scales") return scaleLine(s.scale, s.key, { octaves, pattern });
    if (skill === "swing") return scaleLine(s.scale, s.key);
    // The long-tone scale goes up only: a note every four beats.
    if (skill === "long-scale") {
      const l = scaleLine(s.scale, s.key);
      return l.slice(0, (l.length + 1) / 2);
    }
    return skill === "tonguing" ? scaleLine("major", s.key) : skill === "register" ? crossingLine(s.pair) : [];
  });
  const line = $derived(concert(writtenLine));
  const marks = $derived(skill === "tonguing" ? tonguingMarks(s.tongue, line.length) : skill === "swing" ? swingMarks(line.length) : []);
  const keyed = $derived(skill === "scales" || skill === "tonguing" || skill === "swing" || skill === "long-scale");
  const timed = $derived(line.length > 0);
  /** The written line's key signature: the scale's own (arpeggios their key's), the major key for tonguing, none for crossings. */
  const scaleKind = $derived(skill === "tonguing" ? "major" : s.scale === "major-arpeggio" ? "major" : ["minor-arpeggio", "blues", "minor-pentatonic", "melodic-minor"].includes(s.scale) ? "natural-minor" : s.scale);
  const signature = $derived(keyed ? (scaleKind === "chromatic" ? 0 : signatureFor(s.key, scaleKind)) : 0);
  /** A concert note by its written name: spelled by the key in scales and tonguing (Db major reads Db, not C#), the chart's
   *  spelling elsewhere. The one speller for the chips, the heard note, the cue and the fingering caption (contradiction 9). */
  const spell = $derived(aeroSpeller(shift, keyed ? signature : null));
  const keyName = (pc: number) => noteName(pc, (scaleKind === "chromatic" ? 0 : signatureFor(pc, scaleKind)) < 0 ? "flat" : "sharp", false);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>(benchFromUrl({ min: 40, max: 160 }));
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let downbeat = $state(0);
  let now = $state(0);
  let firstAt = $state<number | null>(null);
  let sounding = $state<number | null>(null);
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;
  let joins = $state<("T" | "S")[]>([]);
  let breathNow = $state<number | null>(null);
  /** The last breath samples (CC 2), on the ready screen too, so a test blow shows the sensor works. */
  let breath = $state<number[]>([]);
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind === "cc" && e.controller === 2) {
        breathNow = e.value;
        breath = pushTrace(breath, e.value);
      }
    }),
  );
  /** The breath trace takes the free height of the live stage on a laptop only (the phone stage scrolls). */
  const wide = new MediaQuery("min-width: 64rem");
  /** Where steady air sits for most players (p to mf): a guide on the trace, never graded. */
  const GUIDE_BAND = [0.25, 0.65] as const;
  let lineResult = $state.raw<LineResult | null>(null);
  /** The note heard on each step this run (Practice marks the chips with it as the run goes). */
  let heardOn = $state<Record<number, number>>({});

  /** The line's note at `t` ms after the downbeat: swung eighths split the beat late, long tones change on the beat. */
  const stepAt = (t: number) =>
    skill === "swing" ? Math.floor(t / beatMs) * 2 + ((t % beatMs) / beatMs >= SWING.ideal - 0.25 ? 1 : 0) : skill === "long-scale" ? Math.floor(t / stepMs) : Math.floor(t / stepMs + 0.5);
  const stepNow = $derived(timed && phase === "running" && now >= downbeat ? Math.min(line.length - 1, stepAt(now - downbeat)) : null);
  /** Notes in a bar of four clicks. */
  const barNotes = $derived(Math.max(1, Math.round(4 * perBeat)));
  /** Each chip's verdict: as the run goes in Practice (a step once passed), after it from the grade in both modes. */
  const chipOut = $derived.by((): ("ok" | "miss" | undefined)[] => {
    if (phase === "results" && lineResult)
      return lineResult.metrics.filter((mt) => mt.kind === "pitch").map((mt) => (mt.kind === "pitch" && mt.actualMidi === mt.expectedMidi ? "ok" : "miss"));
    if (phase !== "running" || mode !== "practice" || stepNow === null) return [];
    return line.map((m, i) => (heardOn[i] === m ? "ok" : i < stepNow ? "miss" : undefined));
  });

  const patternLabel = $derived(AERO_PATTERNS.find((p) => p.id === pattern)!.label.toLowerCase());
  const summaryLine = $derived<SetupClause[]>(
    skill === "scales"
      ? [
          { text: `${keyName(s.key)} ${scaleOf.label.toLowerCase()}`, focus: "scale" },
          { text: pattern === "straight" ? "up and down" : `${patternLabel}, up and down`, focus: "pattern" },
          { text: `${bpm} BPM` },
          { text: `${perBeat === 1 ? "a note" : `${perBeat} notes`} a click`, focus: "perBeat" },
          ...(octaves === 2 ? [{ text: "two octaves", focus: "octaves" }] : []),
        ]
      : skill === "swing"
        ? [{ text: `${keyName(s.key)} ${scaleOf.label.toLowerCase()}`, focus: "scale" }, { text: "swung eighths, doo-DAH" }, { text: `${bpm} BPM` }]
      : skill === "long-scale"
        ? [{ text: `${keyName(s.key)} ${scaleOf.label.toLowerCase()}`, focus: "scale" }, { text: `${LONG_SCALE_BEATS} beats a note` }, { text: `at ${level.id}`, focus: "level" }, { text: `${bpm} BPM` }]
      : skill === "tonguing"
        ? [{ text: `${keyName(s.key)} major`, focus: "key" }, { text: `${TONGUING.find((t) => t.id === s.tongue)?.label.toLowerCase()}`, focus: "tongue" }, { text: `${bpm} BPM` }, { text: "eighths" }]
        : skill === "register"
          ? [{ text: regPair.label, focus: "pair" }, { text: `back and forth in eighths at ${bpm} BPM` }]
          : skill === "trills"
            ? [{ text: `Trill ${trillPair.label}`, focus: "trill" }, { text: `${TRILL_SECONDS} seconds, as fast and even as you can` }]
            : [{ text: `Bite vibrato on ${spell(vibNote)}`, focus: "vibNote" }, { text: vib.label.toLowerCase(), focus: "vib" }, { text: "the rate sets the tempo" }],
  );
  // The saved setup key keeps its words (in English, whatever the language); the screen reads the line below.
  const summaryText = $derived(summaryLine.map((c) => c.text).join(", "));
  /**
   * The setup in the reader's language. `full` is the staff's title, tempo and all; otherwise the setup strip's
   * line, which leaves the tempo out (it is on the practice strip, S5) and says "one note per beat" in plain words.
   */
  function displayLine(full: boolean): SetupClause[] {
    const keyScale = { text: m.music_winds_aero_key_scale({ key: keyName(s.key), scale: scaleOf.label.toLowerCase() }), focus: "scale" };
    const tempo = full ? [{ text: `${bpm} BPM` }] : [];
    if (skill === "scales")
      return [
        keyScale,
        { text: pattern === "straight" ? m.music_winds_aero_up_down() : m.music_winds_aero_pattern_up_down({ pattern: patternLabel }), focus: "pattern" },
        ...tempo,
        { text: full ? (perBeat === 1 ? m.music_winds_aero_note_a_click() : m.music_winds_aero_notes_a_click({ n: perBeat })) : perBeat === 1 ? m.music_winds_aero_one_per_beat() : m.music_winds_aero_n_per_beat({ n: perBeat }), focus: "perBeat" },
        ...(octaves === 2 ? [{ text: m.music_winds_aero_two_octaves_clause(), focus: "octaves" }] : []),
      ];
    if (skill === "swing") return [keyScale, { text: m.music_winds_aero_swung_doodah() }, ...tempo];
    if (skill === "long-scale") return [keyScale, { text: m.music_winds_aero_beats_a_note({ n: LONG_SCALE_BEATS }) }, { text: m.music_winds_aero_at_level({ level: level.id }), focus: "level" }, ...tempo];
    if (skill === "tonguing") return [{ text: m.music_winds_aero_key_major({ key: keyName(s.key) }), focus: "key" }, { text: `${TONGUING.find((t) => t.id === s.tongue)?.label.toLowerCase()}`, focus: "tongue" }, ...tempo, { text: m.music_winds_aero_eighths() }];
    if (skill === "register") return [{ text: regPair.label, focus: "pair" }, { text: full ? m.music_winds_aero_back_forth_bpm({ bpm }) : m.music_winds_aero_back_forth() }];
    if (skill === "trills") return [{ text: m.music_winds_aero_trill({ pair: trillPair.label }), focus: "trill" }, { text: m.music_winds_aero_trill_seconds({ n: TRILL_SECONDS }) }];
    return [{ text: m.music_winds_aero_bite_on({ note: spell(vibNote) }), focus: "vibNote" }, { text: vib.label.toLowerCase(), focus: "vib" }, { text: m.music_winds_aero_rate_sets_tempo() }];
  }
  const shownLine = $derived(displayLine(false));
  const shownTitle = $derived(displayLine(true).map((c) => c.text).join(", "));
  /** Beside Stop on a phone: the note to play now, or how the untimed skills start. */
  const cue = $derived(
    phase !== "running" ? "" : timed ? (stepNow === null ? m.music_winds_aero_cue_next_one() : mode === "check" ? m.music_winds_aero_cue_check() : m.music_winds_aero_cue_play({ note: spell(line[stepNow]) })) : skill === "trills" ? m.music_winds_aero_trill({ pair: trillPair.label }) : m.music_winds_aero_cue_vibrato({ note: spell(vibNote) }),
  );
  let demo = $state<{ stop(): void; playing: boolean } | null>(null);
  let demoAt = $state(0);
  function stopDemo() {
    demo?.stop();
    demo = null;
  }
  // While the demo plays, the clock moves so the chip and the fingering follow the note sounding.
  $effect(() => {
    if (!demo) return;
    const id = setInterval(() => (now = performance.now()), 50);
    return () => clearInterval(id);
  });
  /** The line's note the demo is sounding (it plays a note a step, swung or held like the run). */
  const demoStep = $derived(
    demo && timed && phase === "ready" ? clamp(skill === "swing" || skill === "long-scale" ? stepAt(now - demoAt) : Math.floor((now - demoAt) / stepMs), 0, line.length - 1) : null,
  );

  const target = $derived(timed ? line[stepNow ?? demoStep ?? 0] : skill === "trills" ? trillNotes[0] : skill === "vibrato" ? vibNote : null);

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes = skill === "swing"
      ? line.map((midi, i) => {
          const at = Math.floor(i / 2) * beatMs + (i % 2 ? SWING.ideal * beatMs : 0);
          const next = Math.floor((i + 1) / 2) * beatMs + ((i + 1) % 2 ? SWING.ideal * beatMs : 0);
          return { midi, time: at / 1000, duration: ((next - at) * (marks[i + 1] === "S" ? 1 : 0.8)) / 1000 };
        })
      : timed
      ? line.map((midi, i) => ({ midi, time: (i * stepMs) / 1000, duration: (stepMs * (marks[i + 1] === "S" ? 1 : 0.8)) / 1000 }))
      : skill === "trills"
        ? Array.from({ length: 24 }, (_, i) => ({ midi: trillNotes[i % 2], time: i * 0.125, duration: 0.12 }))
        : [{ midi: vibNote, time: 0, duration: VIBRATO.seconds }];
    const handle = audio.playSequence(notes);
    demoAt = now = performance.now();
    demo = handle;
    status = m.music_winds_skills_demo_playing();
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onEvent(e: NoteEvent | ControlEvent) {
    if (e.kind === "noteon") {
      sounding = (e as NoteEvent).midi;
      if (timed && phase === "running" && e.at >= downbeat - stepMs / 2) {
        const i = Math.max(0, stepAt(e.at - downbeat));
        // A step keeps its right note once heard; a wrong one shows until the right one comes.
        if (i < line.length && heardOn[i] !== line[i]) heardOn = { ...heardOn, [i]: sounding };
      }
      if (firstAt === null && phase === "running") {
        firstAt = e.at;
        // Trills and vibrato are timed from the first note.
        if (!timed) {
          clearTimeout(timer);
          timer = setTimeout(() => void finish(), e.at + (skill === "trills" ? TRILL_SECONDS : VIBRATO.seconds) * 1000 - performance.now() + 100);
        }
      }
    } else if (e.kind === "noteoff" && (e as NoteEvent).midi === sounding) sounding = null;
  }

  function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    lineResult = null;
    heardOn = {};
    joins = [];
    breathNow = null;
    firstAt = null;
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: `technique.aerophone.${skill}`,
      setupKey: `aero:${summaryText}`,
      skillIds: aerophoneSkills(skill as AerophoneMode),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: skill === "scales" ? 0.4 + perBeat * 0.05 + (octaves - 1) * 0.1 : skill === "register" ? 0.55 : skill === "swing" ? 0.55 : 0.5,
      instrument: "aerophone",
      params: {
        skill,
        bpm,
        setup: summaryText,
        ...(keyed && skill !== "tonguing" ? { scale: s.scale, key: s.key } : {}),
        ...(skill === "scales" ? { perBeat, octaves, pattern } : {}),
        ...(skill === "long-scale" ? { level: level.id } : {}),
        ...(skill === "register" ? { pair: s.pair } : {}),
      },
    });
    cap = capture(timed ? ctx.downbeat - stepMs / 2 : performance.now(), (e) => onEvent(e as NoteEvent | ControlEvent));
    status = timed ? m.music_winds_aero_go_timed() : skill === "trills" ? m.music_winds_aero_go_trill({ pair: trillPair.label }) : m.music_winds_aero_go_vibrato({ note: spell(vibNote), pulses: vib.pulses });
    timer = setTimeout(() => void finish(), timed ? Math.max(0, ctx.downbeat - performance.now()) + line.length * stepMs + 60000 / bpm : 15000);
    const tick = () => {
      now = performance.now();
      if (phase === "running" || phase === "countin") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const controls = cap?.controls ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    phase = "results";
    let score = 0;
    let correct = false;
    let headline = "";
    let rows: RunSummary["rows"] = [];
    let lateTongue: string | null = null;
    if (!ons.length) headline = m.music_winds_aero_no_note();
    else if (skill === "swing") {
      const r = gradeSwing({ line, beatMs, downbeat, notes, breath: controls });
      joins = r.joins;
      score = r.score;
      correct = r.correct;
      const ratio = r.frac === null ? null : r.frac / (1 - r.frac);
      rows = [
        { label: m.music_winds_aero_notes_right(), value: r.pitch, text: m.music_winds_chop_of({ n: Math.round(r.pitch * line.length), total: line.length }) },
        { label: m.music_winds_aero_swing_row(), value: r.swing, text: ratio === null ? m.music_winds_aero_no_pairs() : m.music_winds_aero_ratio({ ratio: ratio.toFixed(1) }) },
        r.articulation === null ? { label: m.music_winds_aero_doodah_unmeasured(), notMeasured: true } : { label: m.music_winds_aero_offbeats_tongued(), value: r.articulation, text: pct(r.articulation) },
      ];
      headline =
        r.pitch < 0.9
          ? m.music_winds_aero_head_notes({ right: Math.round(r.pitch * line.length), total: line.length })
          : r.swing < 0.6
            ? r.frac !== null && r.frac < SWING.full[0]
              ? m.music_winds_aero_too_straight({ ratio: ratio!.toFixed(1) })
              : ratio === null
                ? m.music_winds_aero_too_jerky_uneven()
                : m.music_winds_aero_too_jerky({ ratio: ratio.toFixed(1) })
            : r.articulation !== null && r.articulation < 0.8
              ? m.music_winds_aero_swung_tongue()
              : m.music_winds_aero_swung_ok({ bpm });
    } else if (timed) {
      const r = gradeLine({ beats: line.map((m) => [{ midi: m }]), beatMs: stepMs, notes });
      lineResult = r;
      const strays = Math.max(0, ons.length - r.clean);
      const slips = r.metrics.flatMap((mt) => (mt.kind === "pitch" && mt.actualMidi !== undefined && mt.actualMidi !== mt.expectedMidi ? [octaveSlip(mt.expectedMidi + shift, mt.actualMidi + shift)] : [])).filter(Boolean);
      score = r.score;
      correct = r.correct;
      rows = [
        { label: m.music_winds_aero_notes_right(), value: r.pitch, text: m.music_winds_chop_of({ n: r.clean, total: r.total }) },
        evennessRow(r.evenness, r.clean, r.total),
        { label: m.music_winds_aero_stray_between(), text: String(strays) },
      ];
      if (skill === "register") {
        // Evenness still counts: an uneven crossing is not a clean one.
        const g = glitches(notes, concert(regPair.notes));
        correct = r.correct && g <= 1;
        rows[2] = { label: m.music_winds_aero_glitches(), text: g <= 1 ? String(g) : m.music_winds_aero_glitches_fix({ count: g }) };
      }
      if (skill === "long-scale") {
        const band = heldBand(controls, level.band as [number, number], ons[0].at, ons.at(-1)!.at + stepMs);
        score = r.score * 0.5 + (band ?? 0) * 0.5;
        correct = r.pitch >= 0.9 && (band ?? 0) >= 0.8;
        rows[1] = band === null ? { label: m.music_winds_aero_breath_at_unmeasured({ level: level.id }), notMeasured: true } : { label: m.music_winds_aero_breath_at({ level: level.id }), value: band, text: m.music_winds_aero_in_band({ pct: pct(band) }) };
        rows.pop();
      }
      if (skill === "tonguing") {
        const got = joinTypes(notes, controls);
        joins = got;
        const breathSeen = controls.some((c) => c.kind === "cc" && c.controller === 2);
        const t = tonguingScore(marks, got);
        ({ score, correct } = tonguingVerdict(r, t, breathSeen));
        rows.push(breathSeen ? { label: m.music_winds_aero_tongued_as_marked(), value: t, text: pct(t) } : { label: m.music_winds_aero_tonguing_unmeasured(), notMeasured: true });
        // Each attack, tongued or slurred, against its click: a fifth of the grade, and three in four must land.
        const at = attackTiming({ count: line.length, stepMs, downbeat, notes, breath: controls });
        const drift = at.meanOffsetMs === null || Math.abs(at.meanOffsetMs) < 10 ? null : (at.meanOffsetMs < 0 ? m.music_winds_aero_drift_early : m.music_winds_aero_drift_late)({ ms: Math.round(Math.abs(at.meanOffsetMs)) });
        const withDrift = (text: string) => (drift ? `${text}, ${drift}` : text);
        rows.push({ label: m.music_winds_aero_attacks_row({ ms: Math.round(at.windowMs) }), value: at.timing, text: withDrift(m.music_winds_chop_of({ n: at.onTime, total: line.length })) });
        score = score * 0.8 + at.timing * 0.2;
        lateTongue = at.timing < 0.75 ? withDrift(m.music_winds_aero_attacks_missed({ missed: line.length - at.onTime, total: line.length })) : null;
        correct = correct && !lateTongue;
      }
      headline = !r.correct
        ? slips.length
          ? m.music_winds_aero_slips({ right: r.clean, total: r.total, count: slips.length, slip: String(slips[0]) })
          : r.pitch < 0.9
            ? m.music_winds_aero_head_notes({ right: r.clean, total: r.total })
            : m.music_winds_aero_spacing({ ms: Math.round(r.evennessErrorMs) })
        : skill === "tonguing" && lateTongue
          ? m.music_winds_aero_attacks_missed_head({ missed: lateTongue })
          : skill === "tonguing" && !correct
          ? m.music_winds_aero_tonguing_off()
          : skill === "register" && !correct
            ? m.music_winds_aero_register_off()
            : skill === "long-scale" && !correct
              ? m.music_winds_aero_long_off({ level: level.id, pct: rows[1]?.value == null ? m.music_winds_skills_none() : pct(rows[1].value) })
              : skill === "long-scale"
                ? m.music_winds_aero_long_ok({ level: level.id })
                : m.music_winds_aero_clean_even({ bpm });
    } else if (skill === "trills") {
      const t = gradeTrill(notes, trillNotes);
      score = t.score;
      correct = t.correct;
      rows = [
        { label: m.music_winds_aero_notes_a_second(), text: t.perSecond.toFixed(1) },
        { label: m.music_winds_aero_evenness(), value: t.evenness, text: pct(t.evenness) },
        { label: m.music_winds_aero_stray(), text: String(t.strays) },
      ];
      headline = t.correct ? m.music_winds_aero_trill_ok({ rate: t.perSecond.toFixed(1), pct: pct(t.evenness) }) : t.strays ? m.music_winds_aero_trill_strays({ count: t.strays }) : t.evenness < 0.7 ? m.music_winds_aero_trill_uneven({ pct: pct(t.evenness) }) : m.music_winds_aero_trill_slow({ rate: t.perSecond.toFixed(1) });
    } else {
      const bends = controls.filter((c) => c.kind === "pitchbend" && firstAt !== null && c.at >= firstAt && c.at <= firstAt + VIBRATO.seconds * 1000).map((c) => ({ at: c.at, value: c.value }));
      const w = bends.length ? bendWobble(bends) : null;
      const want = (vib.pulses * vib.bpm) / 60;
      if (!w) {
        headline = m.music_winds_aero_no_bite();
        rows = [{ label: m.music_winds_aero_bite_row(), notMeasured: true }];
      } else if (w.rateHz === null) {
        headline = m.music_winds_aero_pitch_still();
        rows = [{ label: m.music_winds_aero_vibrato(), text: m.music_winds_aero_none_heard() }];
      } else {
        const off = Math.abs(w.rateHz - want) / want;
        score = Math.max(0, 1 - off) * 0.6 + (w.evenness ?? 0) * 0.4;
        correct = off <= VIBRATO.rateTolerance && (w.evenness ?? 0) >= VIBRATO.evenness;
        rows = [
          { label: m.music_winds_aero_rate_target({ want: want.toFixed(1) }), text: m.music_winds_aero_a_second({ rate: w.rateHz.toFixed(1) }) },
          { label: m.music_winds_aero_evenness(), value: w.evenness ?? 0, text: pct(w.evenness ?? 0) },
          { label: m.music_winds_aero_depth(), text: m.music_winds_aero_depth_text({ pct: Math.round(w.depth * 100) }) },
        ];
        headline = correct ? m.music_winds_aero_vib_ok({ pulses: vib.pulses }) : w.rateHz < want ? m.music_winds_aero_vib_slow({ rate: w.rateHz.toFixed(1), want: want.toFixed(1) }) : off > VIBRATO.rateTolerance ? m.music_winds_aero_vib_fast({ rate: w.rateHz.toFixed(1), want: want.toFixed(1) }) : m.music_winds_aero_vib_uneven({ pct: pct(w.evenness ?? 0) });
      }
    }
    await run!.attempt({ promptId: `aero:${skill}`, correct, partialCredit: score, metrics: lineResult?.metrics ?? [], source: runSource(notes), instrument: runInstrument(notes, "aerophone") ?? null });
    const fin = await run!.finish({ score, correct, headline });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const makeUp =
      skill === "long-scale" ? m.music_winds_aero_make_long() : skill === "scales" || skill === "register" ? m.music_winds_aero_make_scales() : skill === "tonguing" ? m.music_winds_aero_make_tonguing() : m.music_winds_score();
    summary = { headline, metric: pct(score), metricLabel: ons.length ? makeUp : m.music_winds_score(), cleanMeans: CLEAN_MEANS[skill](), delta: fin.delta, best: fin.best, clean: correct && mode === "check", xp: fin.xp, mode, rows, advance: ons.length ? await advanceAfter(score, correct) : undefined };
    status = headline;
  }

  /** What each skill's `correct` tests, in words (contradiction 4: the star key and pips say exactly this). */
  const CLEAN_MEANS: Record<Skill, () => string> = {
    scales: m.music_winds_aero_clean_scales,
    "long-scale": m.music_winds_aero_clean_long,
    register: m.music_winds_aero_clean_register,
    tonguing: m.music_winds_aero_clean_tonguing,
    swing: m.music_winds_aero_clean_swing,
    trills: m.music_winds_aero_clean_trills,
    vibrato: m.music_winds_aero_clean_vibrato,
  };
  /** Scales climb the tempo, then notes a click; the others move through their lists. */
  const PER_BEAT_STEPS = [
    { label: m.music_winds_aero_step_one(), goal: 120 },
    { label: m.music_winds_aero_step_two(), goal: 92 },
    { label: m.music_winds_aero_step_four(), goal: 72 },
  ];
  function advanceAfter(score: number, correct: boolean) {
    const run = { score, correct };
    const list = <T extends { id: string; label: string }>(xs: readonly T[], at: string) => ({ steps: xs.map((x) => ({ label: x.label })), step: Math.max(0, xs.findIndex((x) => x.id === at)) });
    if (skill === "swing") return nextRun(`aero.swing.${s.scale}.${s.key}`, { bpm, tempo: { min: 80, goal: 140, max: 200 } }, run);
    if (skill === "long-scale") return nextRun(`aero.long-scale.${s.scale}.${s.key}`, list(BREATH_LEVELS, s.level), run, ({ step }) => step !== undefined && cfg.set({ level: BREATH_LEVELS[step].id }));
    if (skill === "scales")
      return nextRun(`aero.scales.${s.scale}.${s.key}${octaves === 2 ? ".2" : ""}${pattern === "straight" ? "" : `.${pattern}`}`, { bpm, tempo: { min: 40, goal: 120 }, steps: PER_BEAT_STEPS, step: [1, 2, 4].indexOf(perBeat) }, run, tempoAnd((i) => cfg.set({ perBeat: [1, 2, 4][i] })));
    if (skill === "tonguing") return nextRun(`aero.tonguing.${s.key}`, { bpm, tempo: { min: 40, goal: 120 }, ...list(TONGUING, s.tongue) }, run, tempoAnd((i) => cfg.set({ tongue: TONGUING[i].id })));
    if (skill === "register") return nextRun("aero.register", { bpm, tempo: { min: 40, goal: 100 }, ...list(REGISTER_PAIRS, s.pair) }, run, tempoAnd((i) => cfg.set({ pair: REGISTER_PAIRS[i].id })));
    if (skill === "trills") return nextRun("aero.trills", list(TRILL_PAIRS, s.trill), run, ({ step }) => step !== undefined && cfg.set({ trill: TRILL_PAIRS[step].id }));
    return nextRun(`aero.vibrato.${s.vibNote}`, list(VIBRATO_SETS, s.vib), run, ({ step }) => step !== undefined && cfg.set({ vib: VIBRATO_SETS[step].id }));
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    phase = "ready";
    status = m.music_winds_nothing_saved();
  }
  onDestroy(() => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    stopDemo();
  });
</script>

<!-- The MIDI line. Before a run on a laptop or a tablet it sits in the stage's rail (the hud), so it costs no row
     (then this is not passed, so no empty row is drawn); on a phone, and after a run, it is under the stage.
     Not during a run: Connect has no use then. Not under a silent run's card either: a note heard before or
     after the run would contradict "no note arrived". -->
{#snippet statusLine()}
  {#if summary?.heard !== false && phase !== "running" && phase !== "countin"}<div class="w-full"><MidiStatus instrument="aerophone" /></div>{/if}
{/snippet}
<DrillShell
  actions={wide.current && phase === "ready" ? undefined : statusLine}
  title={m.music_winds_aerophone_title()}
  hue="aerophone"
  blurb={skill === "scales" ? m.music_winds_aero_blurb_scales() : skill === "swing" ? m.music_winds_aero_blurb_swing() : skill === "long-scale" ? m.music_winds_aero_blurb_long() : skill === "tonguing" ? m.music_winds_aero_blurb_tonguing() : skill === "register" ? m.music_winds_aero_blurb_register() : skill === "trills" ? m.music_winds_aero_blurb_trills() : m.music_winds_aero_blurb_vibrato()}
  summary={shownLine}
  tabs={modes}
  tab={skill}
  ontab={onmode}
  bind:phase
  bind:mode
  bind:status
  progress={timed && stepNow !== null ? (stepNow + 1) / line.length : 0}
  clock={timed || skill === "vibrato" ? { bpm, beatsPerBar: 4 } : null}
  lesson={skill === "vibrato" ? { lessons: [biteVibratoLesson()] } : skill === "register" ? { lessons: aeroLessons("register", s.pair, shift) } : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  {cue}
  blocked={timed && !line.length ? m.music_winds_aero_blocked_range() : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if keyed}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
          <span class="font-medium">{m.music_winds_key()}</span>
          <KeyPicker label={m.music_winds_key()} value={s.key} name={keyName} onchange={(v) => cfg.set({ key: v })} />
        </div>
      {/if}
      {#if skill === "swing" || skill === "long-scale"}
        <Choice label={m.music_winds_aero_scale()} options={AERO_SCALES.filter((x) => (skill === "swing" ? x.id !== "chromatic" : !x.id.includes("arpeggio") && x.id !== "chromatic")).map((x) => ({ value: x.id, label: x.label }))} value={s.scale} onchange={(v) => cfg.set({ scale: v })} setupKey="scale" />
        {#if skill === "long-scale"}
          <Choice label={m.music_winds_level()} options={BREATH_LEVELS.map((l) => ({ value: l.id as string, label: l.label }))} value={level.id} onchange={(v) => cfg.set({ level: v })} setupKey="level" />
        {:else}
          <p class="self-end text-sm text-ws-soft">{m.music_winds_aero_swing_help()}</p>
        {/if}
      {:else if skill === "scales"}
        <div class="flex min-w-0 flex-col gap-3">
          <Choice label={m.music_winds_aero_scale()} options={AERO_SCALES.map((x) => ({ value: x.id, label: x.label }))} value={s.scale} onchange={(v) => cfg.set({ scale: v })} setupKey="scale" />
          <Choice label={m.music_winds_aero_pattern()} options={AERO_PATTERNS.map((x) => ({ value: x.id as string, label: x.label }))} value={pattern} disabled={!patternFits(s.scale)} onchange={(v) => cfg.set({ pattern: v })} setupKey="pattern" />
          <Choice label={m.music_winds_aero_range()} options={[{ value: 1, label: m.music_winds_aero_one_octave() }, { value: 2, label: m.music_winds_aero_two_octaves() }]} value={octaves} onchange={(v) => cfg.set({ octaves: v })} setupKey="octaves" />
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          <Choice label={m.music_winds_aero_notes_click()} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={perBeat} onchange={(v) => cfg.set({ perBeat: v })} setupKey="perBeat" />
          <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-label={m.music_winds_aero_grade_speeds()}>
            <span class="text-ws-soft">{m.music_winds_aero_grade_speeds_help()}</span>
            <div class="flex flex-wrap gap-1.5">
              {#each AERO_GRADE_SPEEDS as g (g.id)}
                <button type="button" class={btn} aria-pressed={bpm === g.bpm && perBeat === g.perBeat} onclick={() => {
                  cfg.set({ perBeat: g.perBeat });
                  void settings.update({ bpm: g.bpm });
                }}>{g.label}</button>
              {/each}
            </div>
          </div>
        </div>
      {:else if skill === "tonguing"}
        <Choice label={m.music_winds_aero_pattern()} options={TONGUING.map((x) => ({ value: x.id as string, label: x.label, detail: x.group.split("").join(" ") }))} value={s.tongue} onchange={(v) => cfg.set({ tongue: v })} setupKey="tongue" />
      {:else if skill === "register"}
        <Choice label={m.music_winds_aero_crossing()} options={REGISTER_PAIRS.map((x) => ({ value: x.id as string, label: x.label, detail: x.detailText || undefined }))} value={s.pair} onchange={(v) => cfg.set({ pair: v })} setupKey="pair" />
      {:else if skill === "trills"}
        <Choice label={m.music_winds_aero_trill_label()} options={TRILL_PAIRS.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail || undefined }))} value={s.trill} onchange={(v) => cfg.set({ trill: v })} setupKey="trill" />
      {:else}
        <Choice label={m.music_winds_skills_rate()} options={VIBRATO_SETS.map((x) => ({ value: x.id as string, label: x.label }))} value={s.vib} onchange={(v) => cfg.set({ vib: v })} setupKey="vib" />
        <Choice label={m.music_winds_aero_note()} options={[62, 67, 69, 74].map((m) => ({ value: m, label: spell(m - shift) }))} value={s.vibNote} onchange={(v) => cfg.set({ vibNote: v })} setupKey="vibNote" />
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    <!-- Before a run, from lg: what the Aerophone's MIDI is doing, in the stage's rail beside Hear it. -->
    {#if wide.current && phase === "ready" && summary?.heard !== false}<div class="min-w-0 flex-1"><MidiStatus instrument="aerophone" /></div>{/if}
    {#if phase === "running" && timed && stepNow !== null}
      <Stat label={m.music_winds_aero_note()} value={m.music_winds_chop_of({ n: stepNow + 1, total: line.length })} />
    {:else if phase === "running" && !timed}
      <Stat label={m.music_winds_aero_time()} value={firstAt === null ? m.music_winds_aero_waiting() : m.music_winds_aero_seconds({ s: ((now - firstAt) / 1000).toFixed(1) })} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid items-start gap-5 {skill === 'trills' ? '' : 'md:grid-cols-[minmax(0,1fr)_14rem]'}" data-testid="aero-skills" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-line={line.join(",")} data-step-ms={Math.round(stepMs)} data-beat-ms={Math.round(beatMs)}>
      <div class="flex min-w-0 flex-col gap-3 max-md:contents">
        {#if mode === "practice" && target !== null && (demoStep !== null || (phase === "running" && stepNow !== null))}
          <!-- On a phone the drawing is below the line: the note sounding and its keys, in words, at the top. -->
          <p class="flex items-baseline gap-3 md:hidden" data-testid="phone-fingering">
            <span class="font-display text-2xl font-semibold">{spell(target)}</span>
            <span class="text-sm text-ws-stage-soft">{fingeringWords(target + shift) ?? m.music_winds_aero_outside_chart()}</span>
          </p>
        {/if}
        {#if timed}
          {#if skill === "register" && regPair.detailText}<p class="text-sm text-ws-stage-soft">{regPair.label}: {regPair.detailText}.</p>{/if}
          <!-- Check hides the fingering, not the line: the staff stays for reading, without the cursor on the target. -->
          <div data-dock="music">
            <LineNotation notes={line.map((midi, i) => ({ midi, startBeat: i / perBeat, durationBeats: 1 / perBeat }))} title={shownTitle} cursorBeat={stepNow === null || mode === "check" ? null : stepNow / perBeat} keyFifths={transposeFifths(signature, -shift)} instrument="aerophone" maxZoom={1.15} />
          </div>
          {#if skill === "swing"}<p class="text-sm text-ws-stage-soft">{m.music_winds_aero_swing_written()}</p>{/if}
          <!-- A bar a group, so a wrap falls between bars and never leaves one note alone on a row. -->
          <ol class="flex flex-wrap gap-x-3 gap-y-1.5" aria-label={m.music_winds_aero_the_line()}>
            {#each Array.from({ length: Math.ceil(line.length / barNotes) }, (_, b) => b) as b (b)}
              <li class="flex flex-wrap gap-1.5" aria-label={m.music_winds_grid_bar({ n: b + 1 })}>
                {#each line.slice(b * barNotes, (b + 1) * barNotes) as n, k (k)}
                  {@const i = b * barNotes + k}
                  <!-- Check never lights the target: only the note count in the HUD says where you are. -->
                  {@const nowHere = (stepNow === i && mode === "practice") || demoStep === i}
                  {@const out = chipOut[i]}
                  <!-- Check keeps your place without a verdict: the current chip outlined, the passed ones a shade darker with a dot. -->
                  {@const checkNow = stepNow === i && mode === "check" && phase === "running"}
                  {@const checkPast = mode === "check" && phase === "running" && stepNow !== null && i < stepNow}
                  <!-- A wrong note sounding on the current chip rings it in the error colour, so it does not read as the plain "now" highlight. -->
                  {@const off = nowHere && phase === "running" && sounding !== null && sounding !== n}
                  <span class="flex min-h-12 min-w-11 flex-col items-center justify-center rounded-lg px-1.5 text-sm font-semibold {off ? 'outline-[3px] outline-offset-2 outline-destructive ' : ''}{nowHere ? 'bg-instr-strong text-on-instr' : out === 'miss' ? 'bg-destructive/25 ring-1 ring-destructive' : out === 'ok' ? 'bg-success/25 ring-1 ring-success' : checkNow ? 'bg-ws-stage-ink/8 ring-2 ring-instr' : checkPast ? 'bg-ws-stage-ink/20' : 'bg-ws-stage-ink/8'}" aria-current={nowHere || checkNow ? "step" : undefined}>
                    {#if marks.length}<span class="text-[13px] font-bold" title={marks[i] === "T" ? m.music_winds_aero_tongued() : m.music_winds_aero_slurred()}>{marks[i] === "T" ? "T" : "⌒"}{#if joins.length && joins[i] !== undefined}{joins[i] === marks[i] ? " ✓" : " ✕"}{/if}</span>{/if}
                    {spell(n)}
                    {#if off && sounding !== null}<span class="text-[13px] leading-none">{m.music_winds_aero_heard({ note: spell(sounding) })}</span>{/if}
                    {#if checkPast}<span class="text-[13px] leading-none" aria-hidden="true">•</span><span class="sr-only">{m.music_winds_aero_played_sr()}</span>{/if}
                    {#if out && !nowHere}<span class="text-[13px] leading-none" aria-hidden="true">{out === "ok" ? "✓" : heardOn[i] !== undefined ? `✕ ${spell(heardOn[i])}` : "✕"}</span><span class="sr-only">{out === "ok" ? m.music_winds_aero_right_sr() : heardOn[i] !== undefined ? m.music_winds_aero_played_note_sr({ note: spell(heardOn[i]) }) : m.music_winds_aero_missed_sr()}</span>{/if}
                  </span>
                {/each}
              </li>
            {/each}
          </ol>
          {#if marks.length}<p class="text-sm text-ws-stage-soft">{m.music_winds_aero_marks_help()}{skill === "swing" ? ` ${m.music_winds_aero_marks_swing()}` : ""}</p>{/if}
          <!-- Live breath over time, in the free height on a laptop. The long-tone scale's band is its target (Practice
               only); elsewhere a guide band that is not scored shows where steady air sits. -->
          <div class="max-md:order-last">
            <BreathTrace
              values={breath}
              measured={breath.length > 0}
              band={mode === "practice" ? (skill === "long-scale" ? level.band : GUIDE_BAND) : undefined}
              bandLabel={skill === "long-scale" ? m.music_winds_aero_band_level({ level: level.id }) : m.music_winds_aero_band_guide()}
              label={skill === "long-scale" ? m.music_winds_aero_breath_label_level({ level: level.id }) : m.music_winds_aero_breath_label()}
              grow={wide.current && (phase === "running" || phase === "countin")}
            />
          </div>
        {:else if skill === "trills"}
          <p class="text-sm text-ws-stage-soft">{trillPair.detail ? m.music_winds_aero_trill_help_detail({ pair: trillPair.label, detail: trillPair.detail }) : m.music_winds_aero_trill_help({ pair: trillPair.label })}</p>
          {#if mode === "practice"}
            <!-- The two fingerings side by side, the one sounding lit. -->
            <div class="flex flex-wrap justify-center gap-4">
              {#each trillNotes as n (n)}
                <div class="flex flex-col items-center gap-1 {sounding === n ? '' : 'opacity-80'}">
                  <AerophoneKeys midi={n} heldMidi={sounding} compact name={spell} />
                  <p class="text-center font-display text-2xl font-semibold">{spell(n)}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">{m.music_winds_aero_fingering_hidden()}</p>
          {/if}
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">{m.music_winds_aero_vibrato_help({ note: spell(vibNote), pulses: vib.pulses, bpm: vib.bpm })}</p>
        {/if}
      </div>
      {#if skill !== "trills"}
        <div class="keys flex flex-col items-center gap-2">
          {#if mode === "practice" && target !== null}
            <AerophoneKeys midi={target} heldMidi={sounding} compact name={spell} />
            <p class="name text-center font-display text-2xl font-semibold">{spell(target)}</p>
          {:else}
            <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">{m.music_winds_aero_fingering_hidden()}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

</DrillShell>

<style>
  /* A wide, short window (tablet landscape, a 13 inch laptop; DrillShell's one-row rule): the note's name sits in
     the drawing's empty top corner, so the drawing, its key colours and its fingering in words fit one view. */
  @media (min-width: 64rem) and (max-height: 56rem) {
    .keys {
      position: relative;
    }
    .keys .name {
      position: absolute;
      top: 0;
      right: 0;
    }
  }
</style>
