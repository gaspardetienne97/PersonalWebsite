<script lang="ts">
  import { onDestroy } from "svelte";
  import type { InputEvent, NoteEvent } from "@repo/music-core";
  import { clamp, noteName } from "@repo/music-core";
  import {
    AEROPHONE_CHART,
    AEROPHONE_MODES,
    AEROPHONE_RANGE,
    FINGERING_LESSONS,
    fingeringSlip,
    lessonSequence,
    ARTICULATION_TARGET,
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
  import AeroSkills from "$lib/music/drills/aerophone/AeroSkills.svelte";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import AerophoneKeys from "$lib/music/components/AerophoneKeys.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type ResultRow, type RunSummary } from "$lib/music/components/Results.svelte";
  import { btnStage } from "$lib/music/components/ui";
  import { capturePointer } from "$lib/music/components/feedback.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, input } from "$lib/music/runtime";
  import BreathTrace from "$lib/music/drills/aerophone/BreathTrace.svelte";
  import PitchLane from "$lib/music/drills/aerophone/PitchLane.svelte";
  import AttackGrid from "$lib/music/drills/aerophone/AttackGrid.svelte";
  import MidiStatus from "$lib/music/drills/pads/MidiStatus.svelte";

  const LANDING_HOLD_MS = 3000;
  const NO_NOTE_MS = 15000;
  const cfg = new DrillSetup("aerophone", {
    mode: "fingering" as string,
    lesson: "g-a-b" as string,
    target: 67,
    seconds: 5,
    swellSeconds: 6,
    style: "staccato" as string,
    artBpm: 90,
    count: 8,
    interval: 7,
    direction: "up" as string,
    drone: 60,
    level: "any" as string,
  });
  const s = $derived(cfg.value);
  const m = $derived(s.mode as AerophoneMode);
  const style = $derived(s.style === "legato" ? ("legato" as const) : ("staccato" as const));
  const landing = $derived(landingTarget(s.drone, s.interval, s.direction === "down" ? "down" : "up"));
  const lesson = $derived(FINGERING_LESSONS.find((l) => l.id === s.lesson) ?? FINGERING_LESSONS[0]);
  const seq = $derived(lessonSequence(lesson.notes));
  // Fingering: the note waiting to be played (flash cards: nothing moves on until it is right).
  /** The chart's spelling (G#4, Eb4), so names match the buttons and the slip hints. */
  const chartName = (midi: number) => fingeringFor(midi)?.name ?? noteName(midi);
  let step = $state(0);
  let firstTry = $state<boolean[]>([]);
  let slip = $state<{ played: number; text: string } | null>(null);
  const targetMidi = $derived(
    m === "fingering"
      ? seq[clamp(step, 0, seq.length - 1)]
      : m === "interval-landing"
        ? (landing ?? s.drone)
        : clamp(s.target, AEROPHONE_RANGE.lowestMidi, AEROPHONE_RANGE.highestMidi),
  );
  const holdMs = $derived(m === "long-tone" ? s.seconds * 1000 : m === "swell" ? s.swellSeconds * 1000 : LANDING_HOLD_MS);
  const beatMs = $derived(60000 / s.artBpm);
  const fingering = $derived(fingeringFor(targetMidi));
  const intervalLabel = $derived(LANDING_INTERVALS.find((i) => i.semitones === s.interval)?.label ?? `${s.interval} semitones`);

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
      ? `long-tone:${targetMidi}:${s.seconds}${level ? `:${level.id}` : ""}`
      : m === "swell"
        ? `swell:${targetMidi}:${s.swellSeconds}`
        : m === "articulation"
          ? `articulation:${targetMidi}:${style}:${s.artBpm}:${s.count}`
          : `interval-landing:${s.drone}:${s.interval}:${s.direction}`,
  );
  const SKILL_MODES = ["scales", "tonguing", "register", "trills", "vibrato"] as const;
  const skillMode = $derived(SKILL_MODES.find((x) => x === s.mode) ?? null);
  /** Breath inside the level's band while the note was held; null when no level is set. */
  let levelShare = $state<number | null>(null);
  const summaryLine = $derived(
    m === "fingering"
      ? `Fingering: ${lesson.label}, up and back down`
      : m === "long-tone"
      ? `Long tone on ${noteName(targetMidi)}, hold ${s.seconds} s${level ? ` at ${level.id}` : ""}`
      : m === "swell"
        ? `Swell on ${noteName(targetMidi)} over ${s.swellSeconds} s`
        : m === "articulation"
          ? `Articulation: ${s.count} ${style} ${noteName(targetMidi)}s at ${s.artBpm} BPM`
          : `Land a ${intervalLabel.toLowerCase()} ${s.direction} from a ${noteName(s.drone)} drone, hold 3 s`,
  );
  const blocked = $derived(m === "interval-landing" && landing === undefined ? `That interval leaves the fingering chart (${noteName(AEROPHONE_RANGE.lowestMidi, "flat")} to ${noteName(AEROPHONE_RANGE.highestMidi)}). Pick another drone or direction.` : null);

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
    if (m === "interval-landing") audio.drone.start(s.drone);
    const handle = audio.playSequence(notes);
    demo = handle;
    status = m === "interval-landing" ? `Listen: the ${noteName(s.drone)} drone, then ${noteName(targetMidi)} landing on it. Not scored.` : "Listen: how it should sound. Not scored.";
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
      difficulty: m === "long-tone" ? 0.25 + s.seconds / 40 : m === "swell" ? 0.45 : m === "articulation" ? 0.35 + (s.artBpm - 70) / 200 : 0.5,
      instrument: "aerophone",
      params: { mode: m, target: targetMidi, ...(m === "interval-landing" ? { drone: s.drone, interval: s.interval, direction: s.direction } : {}) },
    });
    if (m === "fingering") {
      step = 0;
      firstTry = [];
      slip = null;
      status = `Finger ${chartName(seq[0])} and play it.`;
      cap = capture(ctx.downbeat, (e) => {
        if (e.kind !== "noteon" || step >= seq.length) return;
        const want = seq[step];
        if (e.midi === want) {
          if (firstTry[step] === undefined) firstTry[step] = true;
          slip = null;
          step++;
          if (step >= seq.length) void finishFingering();
          else status = `Now ${chartName(seq[step])}.`;
        } else {
          firstTry[step] = false;
          const hint = fingeringSlip(want, e.midi);
          slip = { played: e.midi, text: hint ? `${hint.text}.` : `Check the fingering for ${chartName(want)}.` };
          status = `That was ${chartName(e.midi)}, not ${chartName(want)}. ${slip.text}`;
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
    if (m === "interval-landing") audio.drone.start(s.drone);
    status = `Play and hold ${noteName(targetMidi)} when you're ready.`;
    // The hold starts at the first note; nothing arriving ends the run with nothing scored as held.
    cap = capture(ctx.downbeat, (e) => {
      if (e.kind === "noteon" && windowStart === null) {
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
    const fin = await run!.finish({ score, correct, headline: `${pct(score)} ${summaryLine}` });
    summary = {
      headline: correct
        ? `${lesson.label}: every note right on the first try.`
        : `${clean} of ${seq.length} right on the first try. Slow down on ${missed.map(chartName).join(", ")}.`,
      rows: [{ label: "Right on the first try", value: score, text: `${clean} of ${seq.length}` }],
      metric: pct(score),
      metricLabel: "first try",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: correct && mode === "check",
      assistance: assistanceText(mode),
    };
    status = summary.headline;
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
            : gradeArticulation({ targetMidi, count: s.count, style, beatMs, notes });
    // A level: half the score is the share of breath inside the band, and it must be mostly there.
    const inHold = controls.filter((c) => c.kind === "cc" && c.controller === 2 && windowStart !== null && c.at >= windowStart && c.at <= endAt).map((c) => c.value);
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
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} ${summaryLine}` });
    const told = describe(r, ons);
    if (level && levelShare !== null) {
      told.rows = [...(told.rows ?? []), { label: `Breath at ${level.id}`, value: levelShare, text: `${pct(levelShare)} of the hold in the band` }];
      if (levelShare < 0.7 && "progress" in r && r.progress >= 1) told.headline = `Held, but only ${pct(levelShare)} of it at ${level.id}: aim for the shaded band.`;
    }
    summary = {
      ...told,
      metric: pct(r.score),
      metricLabel: r.notMeasured.length ? `score, ${r.notMeasured.join(" and ")} not measured` : "score",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: r.correct && mode === "check",
      assistance: assistanceText(mode),
    };
    status = summary.headline;
  }

  const onScreen = (ons: NoteEvent[]) => ons.some((n) => n.source !== "midi");
  const whyNot = (ons: NoteEvent[]) => (onScreen(ons) ? "the chart and keys have no breath" : "no CC 2 arrived");

  function describe(r: BreathResult | SwellResult | ArticulationResult, ons: NoteEvent[]): Pick<RunSummary, "headline" | "rows"> {
    const played = ons[0]?.midi;
    if (!ons.length) return { headline: `No note arrived, so nothing was held. The line under the stage says why.`, rows: [] };
    if ("articulation" in r) {
      const rows: ResultRow[] = [
        { label: "Pitch", value: r.pitch, text: `${Math.round(r.pitch * s.count)} of ${s.count} on ${noteName(targetMidi)}` },
        r.articulation === null
          ? { label: `Articulation (${onScreen(ons) ? "taps have no real note length" : "no note-offs arrived"})`, notMeasured: true }
          : { label: `Articulation, target ${Math.round(ARTICULATION_TARGET[style] * 100)}% of the beat`, value: r.articulation, text: `${Math.round((r.meanSoundingFraction ?? 0) * 100)}% sounding` },
      ];
      const headline =
        r.pitch < 1
          ? `${Math.round(r.pitch * s.count)} of ${s.count} notes were ${noteName(targetMidi)}. Keep the fingering still between attacks.`
          : r.articulation === null
            ? `Every pitch right. Articulation needs the Aerophone to be measured.`
            : r.correct
              ? `Clean ${style}: every ${noteName(targetMidi)} right, ${Math.round((r.meanSoundingFraction ?? 0) * 100)}% of each beat sounding.`
              : (r.meanSoundingFraction ?? 0) > ARTICULATION_TARGET[style]
                ? `Right notes, but they ran long (${Math.round((r.meanSoundingFraction ?? 0) * 100)}% of the beat). Stop the air sooner.`
                : `Right notes, but they were clipped (${Math.round((r.meanSoundingFraction ?? 0) * 100)}% of the beat). Let each one ring.`;
      return { headline, rows };
    }
    const rows: ResultRow[] = [];
    if ("shape" in r) {
      rows.push(r.shape === null ? { label: `Swell shape (${whyNot(ons)})`, notMeasured: true } : { label: "Swell shape", value: r.shape });
      rows.push(r.smoothness === null ? { label: "Smoothness", notMeasured: true } : { label: "Smoothness", value: r.smoothness });
    } else {
      rows.push(r.steadiness === null ? { label: `Breath steadiness (${whyNot(ons)})`, notMeasured: true } : { label: "Breath steadiness", value: r.steadiness });
    }
    rows.push({ label: "Pitch", value: r.pitchCorrect ? 1 : 0, text: r.pitchCorrect ? `${noteName(targetMidi)}, right` : `${played !== undefined ? noteName(played) : "none"}, wanted ${noteName(targetMidi)}` });
    rows.push({ label: "Held", value: r.progress, text: `${((r.progress * holdMs) / 1000).toFixed(1)} of ${holdMs / 1000} s` });
    const secs = ((r.progress * holdMs) / 1000).toFixed(1);
    let headline: string;
    if (!r.pitchCorrect) {
      const hint = played === undefined ? null : fingeringSlip(targetMidi, played);
      headline = `That was ${played !== undefined ? noteName(played) : "no note"}; the target is ${noteName(targetMidi)}. ${hint ? `${hint.text}.` : "Check the fingering on the right."}`;
    }
    else if (r.progress < 1) headline = `Right note, but it stopped at ${secs} of ${holdMs / 1000} seconds.`;
    else if ("shape" in r && r.shape !== null && !r.correct)
      headline = r.shape < 0.8 ? `Full swell on ${noteName(targetMidi)}, but the curve missed the shape (${pct(r.shape)}). Peak in the middle.` : `The shape was there; the air moved in steps (smoothness ${pct(r.smoothness ?? 0)}).`;
    else if (r.steadiness !== null && !r.correct) headline = `Right note, full hold, but the breath wobbled (steadiness ${pct(r.steadiness)}).`;
    else if (r.notMeasured.length) headline = `${noteName(targetMidi)} held for ${holdMs / 1000} s. Breath needs the Aerophone to be measured.`;
    else headline = m === "interval-landing" ? `Landed the ${intervalLabel.toLowerCase()} and held it steady.` : m === "swell" ? `A smooth swell on ${noteName(targetMidi)}.` : `Steady ${noteName(targetMidi)} for ${holdMs / 1000} seconds.`;
    return { headline, rows };
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    audio.drone.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function stepTarget(d: number) {
    const i = AEROPHONE_CHART.findIndex((c) => c.midi === targetMidi);
    const next = AEROPHONE_CHART[clamp(i + d, 0, AEROPHONE_CHART.length - 1)];
    cfg.set({ target: next.midi });
  }

  // On-screen chart: a real input surface (pitch only).
  const pointers = new Map<number, number>();
  function press(e: PointerEvent, midi: number) {
    if (e.button > 0) return;
    capturePointer(e);
    pointers.set(e.pointerId, midi);
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
    input.tap(midi, down);
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
  });

  const envelope = Array.from({ length: TRACE_SAMPLES }, (_, i) => swellEnvelope(i / (TRACE_SAMPLES - 1)));
  const showTargets = $derived(mode === "practice" || phase === "results");
</script>

<svelte:head><title>Aerophone | Woodshed</title></svelte:head>

{#if skillMode}
  {#key skillMode}<AeroSkills skill={skillMode} modes={AEROPHONE_MODES} onmode={(v) => cfg.set({ mode: v })} />{/key}
{:else}
<DrillShell
  title="Aerophone"
  hue="aerophone"
  blurb="Fingerings in Roland's lesson order, then breath control: hold, swell, tongue and land notes. Breath is read from CC 2."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={m === "fingering" ? (phase === "results" ? 1 : step / seq.length) : m === "articulation" ? (artBeat === null ? 0 : clamp(artBeat / s.count, 0, 1)) : holdProgress}
  clock={m === "articulation" ? { bpm: s.artBpm, beatsPerBar: 4 } : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  {blocked}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Mode" options={AEROPHONE_MODES.map((x) => ({ value: x.id as string, label: x.label }))} value={s.mode} onchange={(v) => cfg.set({ mode: v })} />
      {#if m === "fingering"}
        <Choice label="Lesson" select options={FINGERING_LESSONS.map((l, i) => ({ value: l.id as string, label: `${i + 1}. ${l.label}` }))} value={s.lesson} onchange={(v) => cfg.set({ lesson: v })} />
      {:else if m !== "interval-landing"}
        <Choice label="Target note" select options={AEROPHONE_CHART.map((c) => ({ value: c.midi, label: `${c.name}${c.verified ? "" : " (best-effort fingering)"}` }))} value={targetMidi} onchange={(v) => cfg.set({ target: v })} />
      {/if}
      {#if m === "long-tone"}
        <Choice label="Hold" options={AEROPHONE_MODES[1].seconds.map((x) => ({ value: x as number, label: `${x} s` }))} value={s.seconds} onchange={(v) => cfg.set({ seconds: v })} />
        <Choice label="Level" options={[{ value: "any", label: "Any" }, ...BREATH_LEVELS.map((l) => ({ value: l.id as string, label: l.id }))]} value={s.level} onchange={(v) => cfg.set({ level: v })} />
      {:else if m === "swell"}
        <Choice label="Swell length" options={AEROPHONE_MODES[2].seconds.map((x) => ({ value: x as number, label: `${x} s` }))} value={s.swellSeconds} onchange={(v) => cfg.set({ swellSeconds: v })} />
      {:else if m === "articulation"}
        <Choice label="Style" options={[{ value: "staccato", label: "Staccato" }, { value: "legato", label: "Legato" }]} value={s.style} onchange={(v) => cfg.set({ style: v })} />
        <Choice label="Tempo" options={AEROPHONE_MODES[3].bpm.map((x) => ({ value: x as number, label: `${x} BPM` }))} value={s.artBpm} onchange={(v) => cfg.set({ artBpm: v })} />
        <Choice label="Notes" options={[4, 8, 12].map((x) => ({ value: x, label: String(x) }))} value={s.count} onchange={(v) => cfg.set({ count: v })} />
      {:else}
        <Choice label="Interval" select options={LANDING_INTERVALS.map((x) => ({ value: x.semitones as number, label: x.label }))} value={s.interval} onchange={(v) => cfg.set({ interval: v })} />
        <Choice label="Direction" options={[{ value: "up", label: "Up" }, { value: "down", label: "Down" }]} value={s.direction} onchange={(v) => cfg.set({ direction: v })} />
        <Choice label="Drone" options={[60, 65, 67, 72].map((x) => ({ value: x, label: noteName(x) }))} value={s.drone} onchange={(v) => cfg.set({ drone: v })} />
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && m === "fingering"}
      <Stat label="Note" value={`${Math.min(step + 1, seq.length)} of ${seq.length}`} />
      <Stat label="First try" value={String(firstTry.filter(Boolean).length)} />
    {:else if phase === "running" && m !== "articulation"}
      <Stat label="Held" value={windowStart === null ? "waiting" : `${((holdProgress * holdMs) / 1000).toFixed(1)} s`} />
      {#if breathSeen}<Stat label="Breath" value={pct(breath[breath.length - 1] ?? 0)} />{/if}
    {:else if phase === "running" && artBeat !== null}
      <Stat label="Note" value="{clamp(artBeat + 1, 1, s.count)} of {s.count}" />
    {:else if result}
      <Stat label="Score" value={pct(result.score)} tone={result.correct ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_16rem]" data-testid="aerophone-stage">
      <div class="flex min-w-0 flex-col gap-3">
        {#if m === "fingering"}
          <div class="rounded-xl bg-ws-stage-ink/6 p-4">
            <p class="text-xs text-ws-stage-soft">{lesson.label}, up and back down</p>
            <ol class="mt-3 flex flex-wrap gap-1.5" aria-label="Lesson notes">
              {#each seq as n, i (i)}
                {@const done = phase === "results" || (phase === "running" && i < step)}
                {@const now = phase === "running" && i === step}
                <li
                  class="grid min-h-11 min-w-11 place-items-center rounded-lg px-1.5 text-sm font-semibold {now ? 'bg-instr text-ws-stage' : done ? (firstTry[i] ? 'bg-ws-stage-ink/15' : 'bg-warn/25') : 'bg-ws-stage-ink/6 text-ws-stage-soft'}"
                  aria-current={now ? "step" : undefined}
                >
                  {chartName(n)}{#if done}<span class="sr-only">{firstTry[i] ? ", right first try" : ", took more than one try"}</span>{/if}
                </li>
              {/each}
            </ol>
            {#if slip && phase === "running"}
              <p class="mt-3 text-sm" data-testid="fingering-slip">
                That was <b>{chartName(slip.played)}</b>. {slip.text}
              </p>
            {/if}
          </div>
        {/if}
        {#if m === "long-tone" && showTargets}
          <div class="rounded-xl bg-ws-stage-ink/6 p-3">
            <div class="flex items-baseline justify-between text-xs text-ws-stage-soft"><span>Hold {noteName(targetMidi)}</span><span class="tnum">{s.seconds} s</span></div>
            <div class="mt-2 h-3 overflow-hidden rounded-full bg-ws-stage-ink/10"><div class="h-full rounded-full bg-instr" style:width="{holdProgress * 100}%"></div></div>
          </div>
        {/if}
        {#if m !== "fingering"}<BreathTrace
          values={breath}
          points={m === "swell" && (phase === "running" || phase === "results") ? swellPts : undefined}
          target={m === "swell" && showTargets ? envelope : level && showTargets ? Array(TRACE_SAMPLES).fill((level.band[0] + level.band[1]) / 2) : undefined}
          measured={breathSeen}
          label={m === "swell" ? "Breath over the swell, dashed line is the target shape" : "Breath, last 64 samples"}
        />{/if}
        {#if m === "articulation"}
          <AttackGrid count={s.count} target={ARTICULATION_TARGET[style]} played={artPlayed} current={artBeat} {style} />
        {/if}
        <PitchLane values={pitch} target={targetMidi} drone={m === "interval-landing" ? s.drone : null} label="Pitch, last 64 samples, target {noteName(targetMidi)}" />
      </div>
      <div class="flex flex-col items-center gap-2">
        {#if showTargets}
          <AerophoneKeys midi={targetMidi} heldMidi={sounding} compact />
          <p class="text-center font-display text-2xl font-semibold">{noteName(targetMidi)}</p>
          <p class="text-center text-xs text-ws-stage-soft">
            {fingering?.verified ? "Fingering verified on your instrument." : "Best-effort fingering, not yet confirmed on the unit."}
          </p>
        {:else}
          <p class="rounded-xl bg-ws-stage-ink/8 p-3 text-center text-sm text-ws-stage-soft">Check: fingering hidden. Target {noteName(targetMidi)}.</p>
        {/if}
        {#if phase === "ready" && m !== "interval-landing" && m !== "fingering"}
          <div class="flex gap-2">
            <button type="button" class={btnStage} aria-label="Lower target note" onclick={() => stepTarget(-1)}>−</button>
            <button type="button" class={btnStage} aria-label="Higher target note" onclick={() => stepTarget(1)}>+</button>
          </div>
        {/if}
      </div>
    </div>
    <div class="mt-4">
      <p class="mb-2 text-xs text-ws-stage-soft">Play from the chart: taps choose the pitch and score pitch only. Breath and articulation need the Aerophone.</p>
      <div class="flex flex-wrap gap-1" role="group" aria-label="Fingering chart notes">
        {#each AEROPHONE_CHART as c (c.midi)}
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-lg px-1.5 text-xs font-semibold {sounding === c.midi ? 'bg-instr text-ws-stage' : 'bg-ws-stage-ink/10 hover:bg-ws-stage-ink/20'}"
            aria-label="Play {c.name}"
            aria-pressed={sounding === c.midi}
            onpointerdown={(e) => press(e, c.midi)}
            onpointerup={release}
            onpointercancel={release}
            onlostpointercapture={release}
            onkeydown={(e) => chartKey(e, c.midi, true)}
            onkeyup={(e) => chartKey(e, c.midi, false)}>{c.name}</button
          >
        {/each}
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="aerophone" /></div>
  {/snippet}
</DrillShell>
{/if}
