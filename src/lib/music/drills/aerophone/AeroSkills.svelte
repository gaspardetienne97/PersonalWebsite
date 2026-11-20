<script lang="ts">
  // Aerophone technique beyond the lessons and breath holds (docs/research/
  // pads-aerophone-gaps.md): timed scales and arpeggios in any key, tonguing
  // patterns told apart by the breath, register crossings, trills, and bite
  // vibrato at a rate, swing articulation (doo-DAH over swung eighths) and a
  // long-tone scale at one level. The lines are graded by order and evenness;
  // the rest by their own measures in content/aero-skills.
  import { onDestroy } from "svelte";
  import type { ControlEvent, NoteEvent } from "@repo/music-core";
  import { clamp, noteName } from "@repo/music-core";
  import { fingeringFor } from "@repo/music-core/content/winds-pads";
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
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { audio, settings } from "#lib/music/runtime/index.ts";
  import MidiStatus from "#lib/music/drills/pads/MidiStatus.svelte";
  import { aerophoneSkills, type AerophoneMode } from "@repo/music-core/content/winds-pads";

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
  /** A concert note by its written name: spelled by the key in scales and tonguing (Db major reads Db, not C#), the chart's spelling elsewhere. */
  const spell = (midi: number) => (keyed ? noteName(midi + shift, signature < 0 ? "flat" : "sharp") : (fingeringFor(midi + shift)?.name ?? noteName(midi + shift)));
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
  let lineResult = $state.raw<LineResult | null>(null);

  /** The line's note at `t` ms after the downbeat: swung eighths split the beat late, long tones change on the beat. */
  const stepAt = (t: number) =>
    skill === "swing" ? Math.floor(t / beatMs) * 2 + ((t % beatMs) / beatMs >= SWING.ideal - 0.25 ? 1 : 0) : skill === "long-scale" ? Math.floor(t / stepMs) : Math.floor(t / stepMs + 0.5);
  const stepNow = $derived(timed && phase === "running" && now >= downbeat ? Math.min(line.length - 1, stepAt(now - downbeat)) : null);
  const target = $derived(timed ? line[stepNow ?? 0] : skill === "trills" ? trillNotes[0] : skill === "vibrato" ? vibNote : null);

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
  const summaryText = $derived(summaryLine.map((c) => c.text).join(", "));
  let demo = $state<{ stop(): void; playing: boolean } | null>(null);
  function stopDemo() {
    demo?.stop();
    demo = null;
  }

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
    demo = handle;
    status = "Listen: how it goes. Not scored.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onEvent(e: NoteEvent | ControlEvent) {
    if (e.kind === "cc" && (e as ControlEvent).controller === 2) breathNow = e.value;
    if (e.kind === "noteon") {
      sounding = (e as NoteEvent).midi;
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
    status = timed ? "Play in time with the click." : skill === "trills" ? `Trill ${trillPair.label}: the clock starts on your first note.` : `Hold ${spell(vibNote)} and pulse the bite ${vib.pulses} times a click.`;
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
    if (!ons.length) headline = "No note arrived. The line under the stage says whether the Aerophone is connected.";
    else if (skill === "swing") {
      const r = gradeSwing({ line, beatMs, downbeat, notes, breath: controls });
      joins = r.joins;
      score = r.score;
      correct = r.correct;
      const ratio = r.frac === null ? null : r.frac / (1 - r.frac);
      rows = [
        { label: "Notes right", value: r.pitch, text: `${Math.round(r.pitch * line.length)} of ${line.length}` },
        { label: "Swing (off-beat late in the beat, about 2 to 1)", value: r.swing, text: ratio === null ? "no pairs heard" : `${ratio.toFixed(1)} to 1` },
        r.articulation === null ? { label: "Doo-DAH (no breath arrived, CC 2)", notMeasured: true } : { label: "Off-beats tongued, beats slurred", value: r.articulation, text: pct(r.articulation) },
      ];
      headline =
        r.pitch < 0.9
          ? `${Math.round(r.pitch * line.length)} of ${line.length} notes right. Slow down until every fingering lands.`
          : r.swing < 0.6
            ? r.frac !== null && r.frac < SWING.full[0]
              ? `Too straight (${ratio!.toFixed(1)} to 1): lean on the beat and play the off-beat later.`
              : `Too jerky (${ratio === null ? "uneven" : `${ratio.toFixed(1)} to 1`}): the off-beat sits a triplet late, not a sixteenth.`
            : r.articulation !== null && r.articulation < 0.8
              ? "Swung, but tongue each off-beat and slur into the beat: doo-DAH."
              : `Swung at ${bpm} BPM, doo-DAH.`;
    } else if (timed) {
      const r = gradeLine({ beats: line.map((m) => [{ midi: m }]), beatMs: stepMs, notes });
      lineResult = r;
      const strays = Math.max(0, ons.length - r.clean);
      const slips = r.metrics.flatMap((mt) => (mt.kind === "pitch" && mt.actualMidi !== undefined && mt.actualMidi !== mt.expectedMidi ? [octaveSlip(mt.expectedMidi + shift, mt.actualMidi + shift)] : [])).filter(Boolean);
      score = r.score;
      correct = r.correct;
      rows = [
        { label: "Notes right", value: r.pitch, text: `${r.clean} of ${r.total}` },
        { label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(r.evennessErrorMs)} ms off` },
        { label: "Stray notes between fingerings", text: String(strays) },
      ];
      if (skill === "register") {
        // Evenness still counts: an uneven crossing is not a clean one.
        const g = glitches(notes, concert(regPair.notes));
        correct = r.correct && g <= 1;
        rows[2] = { label: "Glitches across the break", text: `${g}${g <= 1 ? "" : ": move the fingers and the thumb together"}` };
      }
      if (skill === "long-scale") {
        const band = heldBand(controls, level.band as [number, number], ons[0].at, ons.at(-1)!.at + stepMs);
        score = r.score * 0.5 + (band ?? 0) * 0.5;
        correct = r.pitch >= 0.9 && (band ?? 0) >= 0.8;
        rows[1] = band === null ? { label: `Breath at ${level.id} (no breath arrived, CC 2)`, notMeasured: true } : { label: `Breath at ${level.id}`, value: band, text: `${pct(band)} in the band` };
        rows.pop();
      }
      if (skill === "tonguing") {
        const got = joinTypes(notes, controls);
        joins = got;
        const breathSeen = controls.some((c) => c.kind === "cc" && c.controller === 2);
        const t = tonguingScore(marks, got);
        ({ score, correct } = tonguingVerdict(r, t, breathSeen));
        rows.push(breathSeen ? { label: "Tongued and slurred as marked", value: t, text: pct(t) } : { label: "Tonguing (no breath arrived, CC 2)", notMeasured: true });
        // Each attack, tongued or slurred, against its click: a fifth of the grade, and three in four must land.
        const at = attackTiming({ count: line.length, stepMs, downbeat, notes, breath: controls });
        const drift = at.meanOffsetMs === null || Math.abs(at.meanOffsetMs) < 10 ? "" : `, on average ${Math.round(Math.abs(at.meanOffsetMs))} ms ${at.meanOffsetMs < 0 ? "early" : "late"}`;
        rows.push({ label: `Attacks on the click (within ${Math.round(at.windowMs)} ms)`, value: at.timing, text: `${at.onTime} of ${line.length}${drift}` });
        score = score * 0.8 + at.timing * 0.2;
        lateTongue = at.timing < 0.75 ? `${line.length - at.onTime} of ${line.length} attacks missed the click${drift}. Tongue with the click, not after it.` : null;
        correct = correct && !lateTongue;
      }
      headline = !r.correct
        ? slips.length
          ? `${r.clean} of ${r.total} right; ${slips.length} came out an octave off: ${slips[0]}.`
          : r.pitch < 0.9
            ? `${r.clean} of ${r.total} notes right. Slow down until every fingering lands.`
            : `Every note right; the spacing wandered ${Math.round(r.evennessErrorMs)} ms. Keep it even.`
        : skill === "tonguing" && lateTongue
          ? `Right notes, but ${lateTongue}`
          : skill === "tonguing" && !correct
          ? "The notes were right; the tonguing wasn't as marked. Stop the air (the tongue) only where it says T."
          : skill === "register" && !correct
            ? "Right notes, but the crossing left glitches between them."
            : skill === "long-scale" && !correct
              ? `Every note right; the breath sat at ${level.id} for only ${rows[1]?.value == null ? "none" : pct(rows[1].value)} of the scale. Aim for the shaded band.`
              : skill === "long-scale"
                ? `Every note held at ${level.id}.`
                : `Clean and even at ${bpm} BPM.`;
    } else if (skill === "trills") {
      const t = gradeTrill(notes, trillNotes);
      score = t.score;
      correct = t.correct;
      rows = [
        { label: "Notes a second", text: t.perSecond.toFixed(1) },
        { label: "Evenness", value: t.evenness, text: pct(t.evenness) },
        { label: "Stray notes", text: String(t.strays) },
      ];
      headline = t.correct ? `${t.perSecond.toFixed(1)} notes a second, even to ${pct(t.evenness)}.` : t.strays ? `${t.strays} stray notes: move only the finger that changes.` : t.evenness < 0.7 ? `Uneven (${pct(t.evenness)}): slower and steady first, then faster.` : `${t.perSecond.toFixed(1)} a second: aim for 4 or more, even.`;
    } else {
      const bends = controls.filter((c) => c.kind === "pitchbend" && firstAt !== null && c.at >= firstAt && c.at <= firstAt + VIBRATO.seconds * 1000).map((c) => ({ at: c.at, value: c.value }));
      const w = bends.length ? bendWobble(bends) : null;
      const want = (vib.pulses * vib.bpm) / 60;
      if (!w) {
        headline = "No bite arrived: set the bite to send pitch bend (E-Wind bite mode gives vibrato), then try again.";
        rows = [{ label: "Bite (pitch bend)", notMeasured: true }];
      } else if (w.rateHz === null) {
        headline = "The pitch held still: pulse the bite in time with the click.";
        rows = [{ label: "Vibrato", text: "none heard" }];
      } else {
        const off = Math.abs(w.rateHz - want) / want;
        score = Math.max(0, 1 - off) * 0.6 + (w.evenness ?? 0) * 0.4;
        correct = off <= VIBRATO.rateTolerance && (w.evenness ?? 0) >= VIBRATO.evenness;
        rows = [
          { label: `Rate (target ${want.toFixed(1)} a second)`, text: `${w.rateHz.toFixed(1)} a second` },
          { label: "Evenness", value: w.evenness ?? 0, text: pct(w.evenness ?? 0) },
          { label: "Depth", text: `${Math.round(w.depth * 100)}% of the bend range` },
        ];
        headline = correct ? `${vib.pulses} pulses a click, even.` : w.rateHz < want ? `Too slow: ${w.rateHz.toFixed(1)} a second against ${want.toFixed(1)}.` : off > VIBRATO.rateTolerance ? `Too fast: ${w.rateHz.toFixed(1)} a second against ${want.toFixed(1)}.` : `On rate, but uneven (${pct(w.evenness ?? 0)}).`;
      }
    }
    await run!.attempt({ promptId: `aero:${skill}`, correct, partialCredit: score, metrics: lineResult?.metrics ?? [], source: runSource(notes), instrument: runInstrument(notes, "aerophone") ?? null });
    const fin = await run!.finish({ score, correct, headline });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    summary = { headline, metric: pct(score), metricLabel: "score", delta: fin.delta, best: fin.best, clean: correct && mode === "check", xp: fin.xp, assistance: assistanceText(mode), rows, advance: ons.length ? await advanceAfter(score, correct) : undefined };
    status = headline;
  }

  /** Scales climb the tempo, then notes a click; the others move through their lists. */
  const PER_BEAT_STEPS = [
    { label: "One note a click", goal: 120 },
    { label: "Two notes a click", goal: 92 },
    { label: "Four notes a click", goal: 72 },
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
    status = "Stopped. Nothing was recorded.";
  }
  onDestroy(() => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    stopDemo();
  });
</script>

<DrillShell
  title="Aerophone"
  hue="aerophone"
  blurb={skill === "scales" ? "Scales and arpeggios in any key, in time: every fingering, the octave key at the right moment, in patterns and over two octaves." : skill === "swing" ? "Swing articulation after Niehaus: eighths long-short, each off-beat tongued and slurred into the beat. The swing is read from the timing, the tongue from the breath." : skill === "long-scale" ? "Each note of a scale held four beats at one level: the breath read from CC 2 should stay in the band from the bottom to the top." : skill === "tonguing" ? "Slurred and tongued notes on purpose: a tongued note stops the air, a slurred one changes key with the air still going." : skill === "register" ? "Across the break and over the octave keys, back and forth, with no glitch notes in between." : skill === "trills" ? "Two fingerings back and forth as fast and even as you can." : "Vibrato with the bite, pulsed in time: so many pulses a click."}
  summary={summaryLine}
  tabs={modes}
  tab={skill}
  ontab={onmode}
  modeNotes={{ practice: "The line and the fingering shown. Practice, not a test.", check: "Fingering hidden. Counts toward mastery." }}
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
  blocked={timed && !line.length ? "That scale doesn't fit the Aerophone's charted range in this key." : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if keyed}
        <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
          <span class="font-medium">Key</span>
          <KeyPicker label="Key" value={s.key} name={keyName} onchange={(v) => cfg.set({ key: v })} />
        </div>
      {/if}
      {#if skill === "swing" || skill === "long-scale"}
        <Choice label="Scale" options={AERO_SCALES.filter((x) => (skill === "swing" ? x.id !== "chromatic" : !x.id.includes("arpeggio") && x.id !== "chromatic")).map((x) => ({ value: x.id, label: x.label }))} value={s.scale} onchange={(v) => cfg.set({ scale: v })} setupKey="scale" />
        {#if skill === "long-scale"}
          <Choice label="Level" options={BREATH_LEVELS.map((l) => ({ value: l.id as string, label: l.label }))} value={level.id} onchange={(v) => cfg.set({ level: v })} setupKey="level" />
        {:else}
          <p class="self-end text-sm text-ws-soft">Swung eighths at the strip's tempo: tongue each off-beat (doo) and slur into the beat (DAH). Written straight; play it long-short.</p>
        {/if}
      {:else if skill === "scales"}
        <div class="flex min-w-0 flex-col gap-3">
          <Choice label="Scale" options={AERO_SCALES.map((x) => ({ value: x.id, label: x.label }))} value={s.scale} onchange={(v) => cfg.set({ scale: v })} setupKey="scale" />
          <Choice label="Pattern" options={AERO_PATTERNS.map((x) => ({ value: x.id as string, label: x.label }))} value={pattern} disabled={!patternFits(s.scale)} onchange={(v) => cfg.set({ pattern: v })} setupKey="pattern" />
          <Choice label="Range" options={[{ value: 1, label: "One octave" }, { value: 2, label: "Two octaves" }]} value={octaves} onchange={(v) => cfg.set({ octaves: v })} setupKey="octaves" />
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          <Choice label="Notes a click" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={perBeat} onchange={(v) => cfg.set({ perBeat: v })} setupKey="perBeat" />
          <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-label="Grade speeds (NZMEB saxophone)">
            <span class="text-ws-soft">Grade speeds (NZMEB saxophone): one tap sets the tempo and the notes a click.</span>
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
        <Choice label="Pattern" options={TONGUING.map((x) => ({ value: x.id as string, label: x.label, detail: x.group.split("").join(" ") }))} value={s.tongue} onchange={(v) => cfg.set({ tongue: v })} setupKey="tongue" />
      {:else if skill === "register"}
        <Choice label="Crossing" options={REGISTER_PAIRS.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail || undefined }))} value={s.pair} onchange={(v) => cfg.set({ pair: v })} setupKey="pair" />
      {:else if skill === "trills"}
        <Choice label="Trill" options={TRILL_PAIRS.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail || undefined }))} value={s.trill} onchange={(v) => cfg.set({ trill: v })} setupKey="trill" />
      {:else}
        <Choice label="Rate" options={VIBRATO_SETS.map((x) => ({ value: x.id as string, label: x.label }))} value={s.vib} onchange={(v) => cfg.set({ vib: v })} setupKey="vib" />
        <Choice label="Note" options={[62, 67, 69, 74].map((m) => ({ value: m, label: spell(m - shift) }))} value={s.vibNote} onchange={(v) => cfg.set({ vibNote: v })} setupKey="vibNote" />
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && timed && stepNow !== null}
      <Stat label="Note" value={`${stepNow + 1} of ${line.length}`} />
    {:else if phase === "running" && !timed}
      <Stat label="Time" value={firstAt === null ? "waiting" : `${((now - firstAt) / 1000).toFixed(1)} s`} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid items-start gap-5 {skill === 'trills' ? '' : 'md:grid-cols-[minmax(0,1fr)_14rem]'}" data-testid="aero-skills" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-line={line.join(",")} data-step-ms={Math.round(stepMs)} data-beat-ms={Math.round(beatMs)}>
      <div class="flex min-w-0 flex-col gap-3">
        {#if skill === "long-scale"}
          <div class="rounded-xl bg-ws-stage-ink/6 p-3" data-testid="breath-band">
            <div class="flex items-baseline justify-between text-xs text-ws-stage-soft"><span>Breath, hold it in the {level.id} band</span><span class="tnum">{breathNow === null ? "no breath yet" : pct(breathNow)}</span></div>
            <div class="relative mt-2 h-3 overflow-hidden rounded-full bg-ws-stage-ink/10">
              <div class="absolute inset-y-0 bg-instr/30" style:left="{level.band[0] * 100}%" style:width="{(level.band[1] - level.band[0]) * 100}%"></div>
              {#if breathNow !== null}<div class="absolute inset-y-0 w-1 rounded-full bg-instr" style:left="{clamp(breathNow, 0, 1) * 100}%"></div>{/if}
            </div>
          </div>
        {/if}
        {#if timed}
          {#if skill === "register" && regPair.detail}<p class="text-sm text-ws-stage-soft">{regPair.label}: {regPair.detail}.</p>{/if}
          {#if mode === "practice" || phase === "results"}
            <LineNotation notes={line.map((midi, i) => ({ midi, startBeat: i / perBeat, durationBeats: 1 / perBeat }))} title={summaryText} cursorBeat={stepNow === null ? null : stepNow / perBeat} keyFifths={transposeFifths(signature, -shift)} instrument="aerophone" />
            {#if skill === "swing"}<p class="text-xs text-ws-stage-soft">Written straight, as swing charts are: play each pair long-short.</p>{/if}
          {/if}
          <ol class="flex flex-wrap gap-1.5" aria-label="The line">
            {#each line as n, i (i)}
              {@const nowHere = stepNow === i}
              <li class="flex min-h-12 min-w-11 flex-col items-center justify-center rounded-lg px-1.5 text-sm font-semibold {nowHere ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/8'}" aria-current={nowHere ? "step" : undefined}>
                {#if marks.length}<span class="text-[10px] font-bold opacity-70" title={marks[i] === "T" ? "tongued" : "slurred"}>{marks[i] === "T" ? "T" : "⌒"}{#if joins.length && joins[i] !== undefined}{joins[i] === marks[i] ? " ✓" : " ✕"}{/if}</span>{/if}
                {spell(n)}
              </li>
            {/each}
          </ol>
          {#if marks.length}<p class="text-xs text-ws-stage-soft">T: tongue it (stop the air); ⌒: slur into it from the note before.{skill === "swing" ? " Doo on the off-beat, DAH into the beat." : ""}</p>{/if}
        {:else if skill === "trills"}
          <p class="text-sm text-ws-stage-soft">Trill {trillPair.label}{trillPair.detail ? ` (${trillPair.detail})` : ""}: move only the finger that changes.</p>
          {#if mode === "practice"}
            <!-- The two fingerings side by side, the one sounding lit. -->
            <div class="flex flex-wrap justify-center gap-4">
              {#each trillNotes as n (n)}
                <div class="flex flex-col items-center gap-1 {sounding === n ? '' : 'opacity-80'}">
                  <AerophoneKeys midi={n} heldMidi={sounding} compact />
                  <p class="text-center font-display text-2xl font-semibold">{spell(n)}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">Check: fingering hidden.</p>
          {/if}
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">Hold {spell(vibNote)} steadily and pulse the bite {vib.pulses} times a click: the click plays at {vib.bpm} BPM. The bite reaches the app as pitch bend.</p>
        {/if}
      </div>
      {#if skill !== "trills"}
        <div class="flex flex-col items-center gap-2">
          {#if mode === "practice" && target !== null}
            <AerophoneKeys midi={target} heldMidi={sounding} compact />
            <p class="text-center font-display text-2xl font-semibold">{spell(target)}</p>
          {:else}
            <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">Check: fingering hidden.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="aerophone" /></div>
  {/snippet}
</DrillShell>
