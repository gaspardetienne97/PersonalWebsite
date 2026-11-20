<script lang="ts">
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { InputEvent, NoteEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { aeroSpeller } from "#lib/music/drills/aerophone/names.ts";
  import {
    AEROPHONE_CHART,
    AEROPHONE_MODES,
    AEROPHONE_RANGE,
    FINGERING_LESSONS,
    fingeringSlip,
    lessonLine,
    ARTICULATION_TARGET,
    LANDING_HOLD_MS,
    LANDING_INTERVALS,
    aerophoneSkills,
    fingeringFor,
    landingTarget,
    type AerophoneMode,
  } from "@repo/music-core/content/winds-pads";
  import {
    SWELL,
    TRACE_SAMPLES,
    gradeArticulation,
    gradeIntervalLanding,
    gradeLongTone,
    gradeSwell,
    pushTrace,
    swellEnvelope,
    type ArticulationResult,
    type BreathResult,
    type SwellResult,
  } from "@repo/music-core/scoring/aerophone";
  import { BREATH_LEVELS, inBandShare } from "@repo/music-core/content/aero-skills";
  import { writtenOffset } from "@repo/music-core/theory/transposition";
  import { aeroLessons } from "@repo/music-core/lessons/technique";
  import AeroSkills from "#lib/music/drills/aerophone/AeroSkills.svelte";
  import AeroCalibrate from "#lib/music/drills/aerophone/AeroCalibrate.svelte";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import AerophoneKeys from "#lib/music/components/AerophoneKeys.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type ResultRow, type RunSummary } from "#lib/music/components/Results.svelte";
  import { capturePointer } from "#lib/music/components/feedback.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, input, settings } from "#lib/music/runtime/index.ts";
  import BreathTrace from "#lib/music/drills/aerophone/BreathTrace.svelte";
  import PitchLane from "#lib/music/drills/aerophone/PitchLane.svelte";
  import AttackGrid from "#lib/music/drills/aerophone/AttackGrid.svelte";
  import MidiStatus from "#lib/music/drills/pads/MidiStatus.svelte";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  // `m` is the drill's mode on this page, so the messages go by another name.
  import { m as msg } from "@repo/i18n/messages.js";
  import { formatList } from "@repo/i18n/format";

  const NO_NOTE_MS = 15000;
  const cfg = new DrillSetup("aerophone", {
    mode: "fingering" as string,
    lesson: "g-a-b" as string,
    target: 67,
    seconds: 5,
    swellSeconds: 6,
    style: "staccato" as string,
    count: 8,
    interval: 7,
    direction: "up" as string,
    drone: 60,
    level: "any" as string,
  });
  const s = $derived(cfg.value);
  const m = $derived(s.mode as AerophoneMode);
  const style = $derived(s.style === "legato" ? ("legato" as const) : ("staccato" as const));
  // Lessons, targets, drones and the chart are written notes, as fingered; the
  // run is concert, what the AE-20 sends in its reading key.
  const shift = $derived(writtenOffset("aerophone", settings.value));
  const landing = $derived(landingTarget(s.drone, s.interval, s.direction === "down" ? "down" : "up"));
  const drone = $derived(s.drone - shift);
  const lesson = $derived(FINGERING_LESSONS.find((l) => l.id === s.lesson) ?? FINGERING_LESSONS[0]);
  const seq = $derived(lessonLine(lesson).map((m) => m - shift));
  // Fingering: the note waiting to be played (flash cards: nothing moves on until it is right).
  /** A concert note by the chart's spelling of its written note (G#4, Eb4), so names match the buttons and the slip hints. */
  const chartName = $derived(aeroSpeller(shift, null));
  /** The breath trace takes the free height of the live stage on a laptop only (the phone stage scrolls). */
  const wide = new MediaQuery("min-width: 64rem");
  const slipHint = (want: number, played: number) => fingeringSlip(want + shift, played + shift);
  let step = $state(0);
  let firstTry = $state<boolean[]>([]);
  let slip = $state<{ played: number; text: string } | null>(null);
  const targetMidi = $derived(
    m === "fingering"
      ? seq[clamp(step, 0, seq.length - 1)]
      : (m === "interval-landing" ? (landing ?? s.drone) : clamp(s.target, AEROPHONE_RANGE.lowestMidi, AEROPHONE_RANGE.highestMidi)) - shift,
  );
  /** The target as written: history keys stay the same in any reading key. */
  const writtenTarget = $derived(targetMidi + shift);
  const holdMs = $derived(m === "long-tone" ? s.seconds * 1000 : m === "swell" ? s.swellSeconds * 1000 : LANDING_HOLD_MS);
  // Articulation is timed on the practice strip's tempo.
  const bpm = $derived(clamp(settings.value.bpm, 30, 240));
  const beatMs = $derived(60000 / bpm);
  const fingering = $derived(fingeringFor(writtenTarget));
  const intervalLabel = $derived(LANDING_INTERVALS.find((i) => i.semitones === s.interval)?.label ?? msg.music_winds_ae_semitones({ n: s.interval }));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<BreathResult | SwellResult | ArticulationResult | null>(null);
  let demo = $state<{ stop(): void; playing: boolean } | null>(null);

  // Live traces: breath on every CC 2, pitch sampled at 20 Hz from what is sounding.
  let breath = $state<number[]>([]);
  let pitch = $state<number[]>([]);
  let sounding = $state<number | null>(null);
  let breathSeen = $state(false);
  let windowStart = $state<number | null>(null);
  let swellPts = $state<{ p: number; v: number }[]>([]);
  let artNotes = $state<NoteEvent[]>([]);
  let downbeat = $state(0);
  let now = $state(0);

  $effect(() =>
    input.subscribe((e: InputEvent) => {
      if (e.kind === "cc" && e.controller === 2) {
        breathSeen = true;
        breath = pushTrace(breath, e.value);
        if (windowStart !== null && phase === "running" && m === "swell") {
          const p = (e.at - windowStart) / holdMs;
          if (p >= 0 && p <= 1) swellPts = [...swellPts, { p, v: e.value }];
        }
      } else if (e.kind === "noteon") sounding = e.midi;
      else if (e.kind === "noteoff" && e.midi === sounding) sounding = null;
    }),
  );
  $effect(() => {
    const id = setInterval(() => {
      pitch = pushTrace(pitch, sounding ?? NaN, TRACE_SAMPLES);
      now = performance.now();
    }, 50);
    return () => clearInterval(id);
  });

  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;

  const level = $derived(m === "long-tone" ? (BREATH_LEVELS.find((l) => l.id === s.level) ?? null) : null);
  const setupKey = $derived(
    m === "fingering"
      ? `fingering:${lesson.id}`
      : m === "long-tone"
      ? `long-tone:${writtenTarget}:${s.seconds}${level ? `:${level.id}` : ""}`
      : m === "swell"
        ? `swell:${writtenTarget}:${s.swellSeconds}`
        : m === "articulation"
          ? `articulation:${writtenTarget}:${style}:${bpm}:${s.count}`
          : `interval-landing:${s.drone}:${s.interval}:${s.direction}`,
  );
  const SKILL_MODES = ["scales", "tonguing", "register", "trills", "vibrato", "swing", "long-scale"] as const;
  const skillMode = $derived(SKILL_MODES.find((x) => x === s.mode) ?? null);
  /** Breath inside the level's band while the note was held; null when no level is set. */
  let levelShare = $state<number | null>(null);
  const summaryLine = $derived<SetupClause[]>(
    m === "fingering"
      ? [{ text: msg.music_winds_ae_sum_fingering({ lesson: lesson.label }), focus: "lesson" }, { text: "line" in lesson ? msg.music_winds_ae_sum_notes({ count: seq.length }) : msg.music_winds_ae_up_back_down() }]
      : m === "long-tone"
        ? [{ text: msg.music_winds_ae_sum_long_tone({ note: chartName(targetMidi) }) }, { text: msg.music_winds_ae_sum_hold({ s: s.seconds }), focus: "seconds" }, ...(level ? [{ text: msg.music_winds_aero_at_level({ level: level.id }), focus: "level" }] : [])]
        : m === "swell"
          ? [{ text: msg.music_winds_ae_sum_swell({ note: chartName(targetMidi) }) }, { text: msg.music_winds_ae_sum_over({ s: s.swellSeconds }), focus: "swellSeconds" }]
          : m === "articulation"
            ? [{ text: msg.music_winds_ae_sum_articulation({ count: s.count, style, note: chartName(targetMidi) }), focus: "style" }, { text: `${bpm} BPM` }]
            : [{ text: msg.music_winds_ae_sum_land({ interval: intervalLabel.toLowerCase(), direction: s.direction === "down" ? msg.music_winds_ae_dir_down() : msg.music_winds_ae_dir_up() }), focus: "interval" }, { text: msg.music_winds_ae_sum_from_drone({ note: chartName(drone) }), focus: "drone" }, { text: msg.music_winds_ae_sum_hold({ s: LANDING_HOLD_MS / 1000 }) }],
  );
  const summaryText = $derived(summaryLine.map((c) => c.text).join(", "));
  const blocked = $derived(m === "interval-landing" && landing === undefined ? msg.music_winds_ae_blocked({ low: chartName(AEROPHONE_RANGE.lowestMidi - shift), high: chartName(AEROPHONE_RANGE.highestMidi - shift) }) : null);

  const holdProgress = $derived(
    phase === "results" && result && "progress" in result
      ? result.progress
      : windowStart === null || phase !== "running"
        ? 0
        : clamp((now - windowStart) / holdMs, 0, 1),
  );
  const artBeat = $derived(phase === "running" && m === "articulation" && now >= downbeat ? Math.floor((now - downbeat) / beatMs) : null);
  const artPlayed = $derived.by(() => {
    const out: (number | null)[] = [];
    const ons = artNotes.filter((n) => n.kind === "noteon");
    for (const on of ons) {
      const i = Math.round((on.at - downbeat) / beatMs);
      if (i < 0 || i >= s.count || out[i] !== undefined) continue;
      const off = artNotes.find((n) => n.kind === "noteoff" && n.midi === on.midi && n.at > on.at);
      const next = ons.find((n) => n.at > on.at);
      const end = Math.min(off?.at ?? Infinity, next?.at ?? Infinity);
      out[i] = Number.isFinite(end) ? clamp((end - on.at) / beatMs, 0, 1) : null;
    }
    return out;
  });

  function stopDemo() {
    demo?.stop();
    demo = null;
    audio.drone.stop();
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes =
      m === "fingering"
        ? seq.map((midi, i) => ({ midi, time: i * 0.6, duration: 0.5 }))
        : m === "articulation"
        ? Array.from({ length: s.count }, (_, i) => ({ midi: targetMidi, time: (i * beatMs) / 1000, duration: (beatMs * ARTICULATION_TARGET[style]) / 1000 }))
        : [{ midi: targetMidi, time: m === "interval-landing" ? 1 : 0, duration: holdMs / 1000 }];
    if (m === "interval-landing") audio.drone.start(drone);
    const handle = audio.playSequence(notes);
    demo = handle;
    status = m === "interval-landing" ? msg.music_winds_ae_demo_drone({ drone: chartName(drone), note: chartName(targetMidi) }) : msg.music_winds_skills_demo_playing();
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    windowStart = null;
    swellPts = [];
    artNotes = [];
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: `technique.aerophone.${m}`,
      setupKey,
      skillIds: aerophoneSkills(m),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: m === "long-tone" ? 0.25 + s.seconds / 40 : m === "swell" ? 0.45 : m === "articulation" ? 0.35 + (bpm - 70) / 200 : 0.5,
      instrument: "aerophone",
      params: { mode: m, target: targetMidi, ...(m === "fingering" ? { lesson: lesson.id } : {}), ...(m === "interval-landing" ? { drone: s.drone, interval: s.interval, direction: s.direction } : {}) },
    });
    if (m === "fingering") {
      step = 0;
      firstTry = [];
      slip = null;
      status = msg.music_winds_ae_finger_first({ note: chartName(seq[0]) });
      cap = capture(ctx.downbeat, (e) => {
        if (e.kind !== "noteon" || step >= seq.length) return;
        const want = seq[step];
        if (e.midi === want) {
          if (firstTry[step] === undefined) firstTry[step] = true;
          slip = null;
          step++;
          if (step >= seq.length) void finishFingering();
          else status = msg.music_winds_ae_now_note({ note: chartName(seq[step]) });
        } else {
          firstTry[step] = false;
          const hint = slipHint(want, e.midi);
          slip = { played: e.midi, text: hint ? msg.music_winds_ae_hint({ hint: hint.text }) : msg.music_winds_ae_check_fingering_for({ note: chartName(want) }) };
          status = msg.music_winds_ae_that_was_not({ played: chartName(e.midi), want: chartName(want), hint: slip.text });
        }
      });
      return;
    }
    if (m === "articulation") {
      cap = capture(ctx.downbeat - beatMs / 2, (e) => {
        if (e.kind === "noteon" || e.kind === "noteoff") artNotes = [...artNotes, e];
      });
      timer = setTimeout(() => void finish(), ctx.downbeat - performance.now() + s.count * beatMs + beatMs / 2);
      return;
    }
    if (m === "interval-landing") audio.drone.start(drone);
    status = msg.music_winds_ae_play_hold({ note: chartName(targetMidi) });
    // The hold starts at the first target note (a fumbled fingering first costs nothing); nothing arriving ends the run with nothing scored as held.
    cap = capture(ctx.downbeat, (e) => {
      if (e.kind === "noteon" && e.midi === targetMidi && windowStart === null) {
        windowStart = e.at;
        clearTimeout(timer);
        timer = setTimeout(() => void finish(), e.at + holdMs - performance.now() + 120);
      }
    });
    timer = setTimeout(() => void finish(), NO_NOTE_MS);
  }

  async function finishFingering() {
    if (phase !== "running" && phase !== "countin") return;
    cap?.stop();
    stopClockRef?.();
    phase = "results";
    const clean = firstTry.filter(Boolean).length;
    const score = clean / seq.length;
    const correct = clean === seq.length;
    const missed = [...new Set(seq.filter((_, i) => firstTry[i] === false))];
    const ons = (cap?.notes ?? []).filter((n) => n.kind === "noteon");
    await run!.attempt({
      promptId: setupKey,
      correct,
      partialCredit: score,
      metrics: seq.map((want, i) => ({ kind: "pitch" as const, expectedMidi: want, actualMidi: firstTry[i] ? want : undefined })),
      source: runSource(cap?.notes ?? []),
      instrument: runInstrument(cap?.notes ?? [], "aerophone") ?? null,
      target: seq,
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score, correct, headline: `${pct(score)} ${summaryText}` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    summary = {
      headline: correct
        ? msg.music_winds_ae_head_fingering_ok({ lesson: lesson.label })
        : msg.music_winds_ae_head_fingering({ clean, total: seq.length, missed: missed.map(chartName).join(", ") }),
      rows: [{ label: msg.music_winds_ae_first_try_row(), value: score, text: msg.music_winds_chop_of({ n: clean, total: seq.length }) }],
      metric: pct(score),
      metricLabel: msg.music_winds_ae_first_try(),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: correct && mode === "check",
      cleanMeans: msg.music_winds_ae_first_try_means(),
      mode,
      advance: await advanceAfter(score, correct),
    };
    status = summary.headline;
  }

  /** Fingering moves through the lessons, holds and swells lengthen, articulation climbs the tempo then the note count, landing moves through the intervals. */
  function advanceAfter(score: number, correct: boolean) {
    const run = { score, correct };
    const at = (labels: string[], i: number) => ({ steps: labels.map((label) => ({ label })), step: Math.max(0, i) });
    const set = (patch: (i: number) => Parameters<typeof cfg.set>[0]) => ({ step }: { step?: number }) => step !== undefined && cfg.set(patch(step));
    const holds = AEROPHONE_MODES[1].seconds as readonly number[];
    const swells = AEROPHONE_MODES[2].seconds as readonly number[];
    const counts = [4, 8, 12];
    if (m === "fingering") return nextRun("aero.fingering", at(FINGERING_LESSONS.map((l) => l.label), FINGERING_LESSONS.indexOf(lesson)), run, set((i) => ({ lesson: FINGERING_LESSONS[i].id })));
    if (m === "long-tone") return nextRun(`aero.long-tone.${writtenTarget}.${s.level}`, at(holds.map((x) => msg.music_winds_ae_step_hold({ s: x })), holds.indexOf(s.seconds)), run, set((i) => ({ seconds: holds[i] })));
    if (m === "swell") return nextRun(`aero.swell.${writtenTarget}`, at(swells.map((x) => msg.music_winds_ae_step_swell({ s: x })), swells.indexOf(s.swellSeconds)), run, set((i) => ({ swellSeconds: swells[i] })));
    if (m === "articulation")
      return nextRun(`aero.articulation.${writtenTarget}.${style}`, { bpm, tempo: { min: 60, goal: 110, max: 140 }, ...at(counts.map((x) => msg.music_winds_ae_sum_notes({ count: x })), counts.indexOf(s.count)) }, run, tempoAnd((i) => cfg.set({ count: counts[i] })));
    return nextRun(`aero.landing.${s.drone}.${s.direction}`, at(LANDING_INTERVALS.map((x) => x.label), LANDING_INTERVALS.findIndex((x) => x.semitones === s.interval)), run, set((i) => ({ interval: LANDING_INTERVALS[i].semitones })));
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
    audio.drone.stop();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const controls = cap?.controls ?? [];
    const endAt = performance.now();
    const w = { targetMidi, startAt: windowStart ?? endAt, durationMs: holdMs, endAt, notes, breath: controls };
    const graded =
      m === "long-tone"
        ? gradeLongTone(w)
        : m === "swell"
          ? gradeSwell({ ...w, low: SWELL.low, peak: SWELL.peak })
          : m === "interval-landing"
            ? gradeIntervalLanding(w)
            : gradeArticulation({ targetMidi, count: s.count, style, beatMs, notes, downbeat, breath: controls });
    // A level: half the score is the share of breath inside the band, and it must be mostly there (the release after the hold does not count).
    const inHold = controls.filter((c) => c.kind === "cc" && c.controller === 2 && windowStart !== null && c.at >= windowStart && c.at <= windowStart + holdMs).map((c) => c.value);
    levelShare = level && inHold.length ? inBandShare(inHold, level.band) : null;
    const r = levelShare === null ? graded : { ...graded, score: graded.score * 0.5 + levelShare * 0.5, correct: graded.correct && levelShare >= 0.7 };
    result = r;
    phase = "results";
    const ons = notes.filter((n) => n.kind === "noteon");
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, "aerophone") ?? null,
      target: targetMidi,
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} ${summaryText}` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const told = describe(r, ons);
    if (level && levelShare !== null) {
      told.rows = [...(told.rows ?? []), { label: msg.music_winds_aero_breath_at({ level: level.id }), value: levelShare, text: msg.music_winds_ae_breath_in_hold({ pct: pct(levelShare) }) }];
      if (levelShare < 0.7 && "progress" in r && r.progress >= 1) told.headline = msg.music_winds_ae_held_level_off({ pct: pct(levelShare), level: level.id });
    }
    summary = {
      ...told,
      metric: pct(r.score),
      metricLabel: r.notMeasured.length ? msg.music_winds_ae_score_not_measured({ what: formatList(r.notMeasured.map(unmeasuredName)) }) : msg.music_winds_score(),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: r.correct && mode === "check",
      cleanMeans: m === "articulation" ? msg.music_winds_ae_means_articulation() : level ? msg.music_winds_ae_means_hold_level({ level: level.id }) : msg.music_winds_ae_means_hold(),
      mode,
      advance: ons.length ? await advanceAfter(r.score, r.correct) : undefined,
    };
    status = summary.headline;
  }

  const signedMs = (o: number) => `${o > 0 ? "+" : ""}${Math.round(o)}`;
  const onScreen = (ons: NoteEvent[]) => ons.some((n) => n.source !== "midi");
  const whyNot = (ons: NoteEvent[]) => (onScreen(ons) ? msg.music_winds_ae_why_screen() : msg.music_winds_ae_why_sensor());
  /** What a grade could not measure ("breath"), in words. */
  const unmeasuredName = (what: string) => (what === "breath" ? msg.music_winds_ae_nm_breath() : what === "articulation" ? msg.music_winds_ae_nm_articulation() : what);

  function describe(r: BreathResult | SwellResult | ArticulationResult, ons: NoteEvent[]): Pick<RunSummary, "headline" | "rows"> {
    const played = ons[0]?.midi;
    if (!ons.length) return { headline: msg.music_winds_ae_no_note_held(), rows: [] };
    if ("articulation" in r) {
      const rows: ResultRow[] = [
        { label: msg.music_winds_ae_pitch(), value: r.pitch, text: msg.music_winds_ae_pitch_on({ n: Math.round(r.pitch * s.count), total: s.count, note: chartName(targetMidi) }) },
        r.articulation === null
          ? { label: onScreen(ons) ? msg.music_winds_ae_art_taps() : msg.music_winds_ae_art_no_offs(), notMeasured: true }
          : { label: msg.music_winds_ae_art_target({ pct: Math.round(ARTICULATION_TARGET[style] * 100) }), value: r.articulation, text: msg.music_winds_ae_sounding({ pct: Math.round((r.meanSoundingFraction ?? 0) * 100) }) },
      ];
      const t = r.timing;
      const drift = t?.meanOffsetMs == null ? "" : Math.abs(t.meanOffsetMs) < 10 ? msg.music_winds_ae_drift_on_it() : (t.meanOffsetMs < 0 ? msg.music_winds_aero_drift_early : msg.music_winds_aero_drift_late)({ ms: Math.round(Math.abs(t.meanOffsetMs)) });
      const withDrift = (text: string) => (drift ? `${text}, ${drift}` : text);
      if (t) {
        rows.push({ label: msg.music_winds_aero_attacks_row({ ms: Math.round(t.windowMs) }), value: t.timing, text: withDrift(msg.music_winds_chop_of({ n: t.onTime, total: s.count })) });
        rows.push({ label: msg.music_winds_ae_attack_offsets(), text: t.offsets.map((o) => (o === null ? msg.music_winds_skills_none() : signedMs(o))).join(", ") });
      }
      const sounded = Math.round((r.meanSoundingFraction ?? 0) * 100);
      const headline =
        r.pitch < 1
          ? msg.music_winds_ae_head_pitch({ n: Math.round(r.pitch * s.count), total: s.count, note: chartName(targetMidi) })
          : t && t.timing < 0.75
            ? msg.music_winds_ae_head_attacks({ missed: withDrift(msg.music_winds_aero_attacks_missed({ missed: s.count - t.onTime, total: s.count })) })
            : r.articulation === null
            ? t ? msg.music_winds_ae_head_pitch_click() : msg.music_winds_ae_head_pitch_only()
            : r.correct
              ? msg.music_winds_ae_head_clean({ style, note: chartName(targetMidi), pct: sounded })
              : (r.meanSoundingFraction ?? 0) > ARTICULATION_TARGET[style]
                ? msg.music_winds_ae_head_long({ pct: sounded })
                : msg.music_winds_ae_head_clipped({ pct: sounded });
      return { headline, rows };
    }
    const rows: ResultRow[] = [];
    if ("shape" in r) {
      rows.push(r.shape === null ? { label: msg.music_winds_ae_swell_shape_nm({ why: whyNot(ons) }), notMeasured: true } : { label: msg.music_winds_ae_swell_shape(), value: r.shape });
      rows.push(r.smoothness === null ? { label: msg.music_winds_ae_smoothness(), notMeasured: true } : { label: msg.music_winds_ae_smoothness(), value: r.smoothness });
    } else {
      rows.push(r.steadiness === null ? { label: msg.music_winds_ae_steadiness_nm({ why: whyNot(ons) }), notMeasured: true } : { label: msg.music_winds_ae_steadiness(), value: r.steadiness });
    }
    rows.push({ label: msg.music_winds_ae_pitch(), value: r.pitchCorrect ? 1 : 0, text: r.pitchCorrect ? msg.music_winds_ae_pitch_right({ note: chartName(targetMidi) }) : msg.music_winds_ae_pitch_wanted({ played: played !== undefined ? chartName(played) : msg.music_winds_skills_none(), note: chartName(targetMidi) }) });
    rows.push({ label: msg.music_winds_ae_held(), value: r.progress, text: msg.music_winds_ae_held_text({ held: ((r.progress * holdMs) / 1000).toFixed(1), total: holdMs / 1000 }) });
    const secs = ((r.progress * holdMs) / 1000).toFixed(1);
    let headline: string;
    if (!r.pitchCorrect) {
      const hint = played === undefined ? null : slipHint(targetMidi, played);
      headline = msg.music_winds_ae_head_wrong({ played: played !== undefined ? chartName(played) : msg.music_winds_ae_no_note(), note: chartName(targetMidi), hint: hint ? msg.music_winds_ae_hint({ hint: hint.text }) : msg.music_winds_ae_check_right() });
    }
    else if (r.progress < 1) headline = msg.music_winds_ae_head_stopped({ held: secs, total: holdMs / 1000 });
    else if ("shape" in r && r.shape !== null && !r.correct)
      headline = r.shape < 0.8 ? msg.music_winds_ae_head_shape({ note: chartName(targetMidi), pct: pct(r.shape) }) : msg.music_winds_ae_head_steps({ pct: pct(r.smoothness ?? 0) });
    else if (r.steadiness !== null && !r.correct) headline = msg.music_winds_ae_head_wobbled({ pct: pct(r.steadiness) });
    else if (r.notMeasured.length) headline = msg.music_winds_ae_head_unmeasured({ note: chartName(targetMidi), s: holdMs / 1000 });
    else headline = m === "interval-landing" ? msg.music_winds_ae_head_landed({ interval: intervalLabel.toLowerCase() }) : m === "swell" ? msg.music_winds_ae_head_swell_ok({ note: chartName(targetMidi) }) : msg.music_winds_ae_head_steady({ note: chartName(targetMidi), s: holdMs / 1000 });
    return { headline, rows };
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    audio.drone.stop();
    phase = "ready";
    status = msg.music_winds_nothing_saved();
  }

  /** Before a run, a chart note tapped becomes the target (holds, swells and articulation); `midi` is concert, the target written. */
  const picksTarget = $derived(phase === "ready" && m !== "fingering" && m !== "interval-landing");
  function pickTarget(midi: number) {
    if (picksTarget && midi !== targetMidi) cfg.set({ target: midi + shift });
  }

  // On-screen chart: a real input surface (pitch only).
  const pointers = new Map<number, number>();
  function press(e: PointerEvent, midi: number) {
    if (e.button > 0) return;
    capturePointer(e);
    pointers.set(e.pointerId, midi);
    pickTarget(midi);
    input.tap(midi, true);
  }
  function release(e: PointerEvent) {
    const midi = pointers.get(e.pointerId);
    if (midi === undefined) return;
    pointers.delete(e.pointerId);
    input.tap(midi, false);
  }
  function chartKey(e: KeyboardEvent, midi: number, down: boolean) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (down && e.repeat) return;
    if (down) pickTarget(midi);
    input.tap(midi, down);
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
  });

  const envelope = Array.from({ length: TRACE_SAMPLES }, (_, i) => swellEnvelope(i / (TRACE_SAMPLES - 1)));
  const showTargets = $derived(mode === "practice" || phase === "results");
  const BLURB: Record<string, string> = {
    fingering: msg.music_winds_ae_blurb_fingering(),
    "long-tone": msg.music_winds_ae_blurb_long_tone(),
    swell: msg.music_winds_ae_blurb_swell(),
    articulation: msg.music_winds_ae_blurb_articulation(),
    "interval-landing": msg.music_winds_ae_blurb_landing({ s: LANDING_HOLD_MS / 1000 }),
  };
</script>

<svelte:head><title>{msg.music_winds_ae_head_title()}</title></svelte:head>

{#if skillMode}
  {#key skillMode}<AeroSkills skill={skillMode} modes={AEROPHONE_MODES} onmode={(v) => cfg.set({ mode: v })} />{/key}
{:else if s.mode === "calibrate"}
  <AeroCalibrate modes={AEROPHONE_MODES} onmode={(v) => cfg.set({ mode: v })} />
{:else}
<!-- The MIDI line. Before a run on a laptop or a tablet it sits in the stage's rail (the hud), so it costs no row
     (then this is not passed, so no empty row is drawn); on a phone, and after a run, it is under the stage.
     Not during a run: Connect has no use then. Not under a silent run's card either: a note heard before or
     after the run would contradict "no note arrived". -->
{#snippet statusLine()}
  {#if summary?.heard !== false && phase !== "running" && phase !== "countin"}<div class="w-full"><MidiStatus instrument="aerophone" /></div>{/if}
{/snippet}
<DrillShell
  actions={wide.current && phase === "ready" ? undefined : statusLine}
  title={msg.music_winds_aerophone_title()}
  hue="aerophone"
  blurb={BLURB[m]}
  lesson={m === "long-tone" ? { lessons: aeroLessons(m, s.level) } : m === "articulation" || m === "interval-landing" ? { lessons: aeroLessons(m, undefined, shift) } : null}
  summary={summaryLine.filter((c) => c.text !== `${bpm} BPM`)}
  tabs={AEROPHONE_MODES}
  tab={s.mode}
  ontab={(v) => cfg.set({ mode: v })}
  bind:phase
  bind:mode
  bind:status
  progress={m === "fingering" ? (phase === "results" ? 1 : step / seq.length) : m === "articulation" ? (artBeat === null ? 0 : clamp(artBeat / s.count, 0, 1)) : holdProgress}
  clock={m === "articulation" ? { bpm, beatsPerBar: 4 } : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  {blocked}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if m === "fingering"}
        <Choice label={msg.music_winds_ae_lesson()} select options={FINGERING_LESSONS.map((l, i) => ({ value: l.id as string, label: `${i + 1}. ${l.label}` }))} value={s.lesson} onchange={(v) => cfg.set({ lesson: v })} setupKey="lesson" />
      {:else if m === "long-tone"}
        <Choice label={msg.music_winds_ae_hold()} options={AEROPHONE_MODES[1].seconds.map((x) => ({ value: x as number, label: `${x} s` }))} value={s.seconds} onchange={(v) => cfg.set({ seconds: v })} setupKey="seconds" />
        <Choice label={msg.music_winds_level()} options={[{ value: "any", label: msg.music_winds_ae_any() }, ...BREATH_LEVELS.map((l) => ({ value: l.id as string, label: l.label }))]} value={s.level} onchange={(v) => cfg.set({ level: v })} setupKey="level" />
      {:else if m === "swell"}
        <Choice label={msg.music_winds_ae_swell_length()} options={AEROPHONE_MODES[2].seconds.map((x) => ({ value: x as number, label: `${x} s` }))} value={s.swellSeconds} onchange={(v) => cfg.set({ swellSeconds: v })} setupKey="swellSeconds" />
      {:else if m === "articulation"}
        <Choice label={msg.music_winds_ae_style()} options={[{ value: "staccato", label: "Staccato" }, { value: "legato", label: "Legato" }]} value={s.style} onchange={(v) => cfg.set({ style: v })} setupKey="style" />
        <Choice label={msg.music_winds_ae_notes()} options={[4, 8, 12].map((x) => ({ value: x, label: String(x) }))} value={s.count} onchange={(v) => cfg.set({ count: v })} setupKey="count" />
      {:else if m === "interval-landing"}
        <Choice label={msg.music_winds_ae_interval()} options={LANDING_INTERVALS.map((x) => ({ value: x.semitones as number, label: x.label }))} value={s.interval} onchange={(v) => cfg.set({ interval: v })} setupKey="interval" />
        <Choice label={msg.music_winds_ae_direction()} options={[{ value: "up", label: msg.music_winds_ae_up() }, { value: "down", label: msg.music_winds_ae_down() }]} value={s.direction} onchange={(v) => cfg.set({ direction: v })} setupKey="direction" />
        <Choice label={msg.music_winds_ae_drone()} options={[60, 65, 67, 72].map((x) => ({ value: x, label: chartName(x - shift) }))} value={s.drone} onchange={(v) => cfg.set({ drone: v })} setupKey="drone" />
      {/if}
    </div>
    {#if m !== "fingering" && m !== "interval-landing"}<p class="mt-3 text-sm text-ws-soft">{msg.music_winds_ae_target_help({ note: chartName(targetMidi) })}</p>{/if}
  {/snippet}

  {#snippet hud()}
    <!-- Before a run, from lg: what the Aerophone's MIDI is doing, in the stage's rail beside Hear it. -->
    {#if wide.current && phase === "ready" && summary?.heard !== false}<div class="min-w-0 flex-1"><MidiStatus instrument="aerophone" /></div>{/if}
    {#if phase === "running" && m === "fingering"}
      <Stat label={msg.music_winds_aero_note()} value={msg.music_winds_chop_of({ n: Math.min(step + 1, seq.length), total: seq.length })} />
      <Stat label={msg.music_winds_ae_first_try_stat()} value={String(firstTry.filter(Boolean).length)} />
    {:else if phase === "running" && m !== "articulation"}
      <Stat label={msg.music_winds_ae_held()} value={windowStart === null ? msg.music_winds_aero_waiting() : msg.music_winds_aero_seconds({ s: ((holdProgress * holdMs) / 1000).toFixed(1) })} />
      {#if breathSeen}<Stat label={msg.music_winds_ae_breath()} value={pct(breath[breath.length - 1] ?? 0)} />{/if}
    {:else if phase === "running" && artBeat !== null}
      <Stat label={msg.music_winds_aero_note()} value={msg.music_winds_chop_of({ n: clamp(artBeat + 1, 1, s.count), total: s.count })} />
    {:else if result}
      <Stat label={msg.music_winds_ae_score()} value={pct(result.score)} tone={result.correct ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_16rem]" data-testid="aerophone-stage" data-downbeat={phase === "running" || phase === "countin" ? downbeat : undefined} data-beat-ms={beatMs} data-target={targetMidi}>
      <div class="flex min-w-0 flex-col gap-3 max-md:contents">
        {#if m === "fingering"}
          <div class="rounded-xl bg-ws-stage-ink/6 p-4">
            <p class="text-sm text-ws-stage-soft">{"line" in lesson ? msg.music_winds_ae_lesson_line({ lesson: lesson.label, count: seq.length }) : msg.music_winds_ae_lesson_updown({ lesson: lesson.label })}</p>
            <ol class="mt-3 flex flex-wrap gap-1.5" aria-label={msg.music_winds_ae_lesson_notes()}>
              {#each seq as n, i (i)}
                {@const done = phase === "results" || (phase === "running" && i < step)}
                {@const now = phase === "running" && i === step}
                <li
                  class="grid min-h-11 min-w-11 place-items-center rounded-lg px-1.5 text-sm font-semibold {now ? 'bg-instr-strong text-on-instr' : done ? (firstTry[i] ? 'bg-ws-stage-ink/15' : 'bg-warn/25') : 'bg-ws-stage-ink/6 text-ws-stage-soft'}"
                  aria-current={now ? "step" : undefined}
                >
                  {chartName(n)}{#if done}<span class="sr-only">{firstTry[i] ? msg.music_winds_ae_right_first() : msg.music_winds_ae_more_tries()}</span>{/if}
                </li>
              {/each}
            </ol>
            {#if slip && phase === "running"}
              <p class="mt-3 text-sm" data-testid="fingering-slip">
                {msg.music_winds_ae_that_was()} <b>{chartName(slip.played)}</b>. {slip.text}
              </p>
            {/if}
          </div>
        {/if}
        {#if m === "long-tone" && showTargets}
          <div class="rounded-xl bg-ws-stage-ink/6 p-3">
            <div class="flex items-baseline justify-between text-sm text-ws-stage-soft"><span>{msg.music_winds_ae_hold_note({ note: chartName(targetMidi) })}</span><span class="tnum">{s.seconds} s</span></div>
            <div class="mt-2 h-3 overflow-hidden rounded-full bg-ws-stage-ink/10"><div class="h-full rounded-full bg-instr" style:width="{holdProgress * 100}%"></div></div>
          </div>
        {/if}
        {#if m !== "fingering"}<div class="max-md:order-last"><BreathTrace
          values={breath}
          points={m === "swell" && (phase === "running" || phase === "results") ? swellPts : undefined}
          target={m === "swell" && showTargets ? envelope : undefined}
          band={level && showTargets ? level.band : undefined}
          bandLabel={level ? msg.music_winds_aero_band_level({ level: level.id }) : undefined}
          measured={breathSeen}
          grow={wide.current && (phase === "running" || phase === "countin")}
          label={m === "swell" ? msg.music_winds_ae_breath_swell_label() : msg.music_winds_ae_breath_64()}
        /></div>{/if}
        {#if m === "articulation"}
          <AttackGrid count={s.count} target={ARTICULATION_TARGET[style]} played={artPlayed} current={artBeat} {style} offsets={phase === "results" && result && "timing" in result ? result.timing?.offsets : undefined} />
        {/if}
        <div class="max-md:order-last"><PitchLane values={pitch} target={targetMidi} drone={m === "interval-landing" ? drone : null} label={msg.music_winds_ae_pitch_label({ note: chartName(targetMidi) })} name={chartName} /></div>
      </div>
      <!-- From md the drawing is the tall column: it spans the lanes and the chart's notes, which sit under the lanes. -->
      <div class="keys flex flex-col items-center gap-2 md:col-start-2 md:row-span-2 md:row-start-1">
        {#if showTargets}
          <AerophoneKeys midi={targetMidi} heldMidi={sounding} compact name={chartName} />
          <p class="name text-center font-display text-2xl font-semibold">{chartName(targetMidi)}</p>
          <p class="text-center text-sm text-ws-stage-soft">
            {fingering?.verified ? msg.music_winds_ae_verified() : msg.music_winds_ae_unverified()}
          </p>
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">{msg.music_winds_ae_hidden_target({ note: chartName(targetMidi) })}</p>
        {/if}
      </div>
    <div class="max-md:order-last md:col-start-1">
      <p class="mb-2 text-sm text-ws-stage-soft">{picksTarget ? `${msg.music_winds_ae_tap_target()} ` : ""}{msg.music_winds_ae_chart_help()}</p>
      <div class="flex flex-wrap gap-1" role="group" aria-label={msg.music_winds_ae_chart_notes()}>
        {#each AEROPHONE_CHART as c (c.midi)}
          {@const at = c.midi - shift}
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-lg px-1.5 text-sm font-semibold {sounding === at ? 'bg-instr-strong text-on-instr' : 'bg-ws-stage-ink/10 hover:bg-ws-stage-ink/20'} {at === targetMidi && m !== 'fingering' ? 'ring-2 ring-instr' : ''}"
            aria-label={msg.music_winds_ae_play_note({ note: c.name })}
            aria-current={at === targetMidi && m !== "fingering" ? "true" : undefined}
            aria-pressed={sounding === at}
            onpointerdown={(e) => press(e, at)}
            onpointerup={release}
            onpointercancel={release}
            onlostpointercapture={release}
            onkeydown={(e) => chartKey(e, at, true)}
            onkeyup={(e) => chartKey(e, at, false)}>{c.name}</button
          >
        {/each}
      </div>
    </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

</DrillShell>
{/if}

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
