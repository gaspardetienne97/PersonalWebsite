<script lang="ts">
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import type { NoteEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import {
    GROOVE_VOICES,
    GROOVES,
    RUDIMENT_HIT_COUNTS,
    RUDIMENTS,
    SUBDIVISION_NAMES,
    grooveSkills,
    grooveTargetsFor,
    rudimentHits,
    rudimentPerBeat,
    rudimentSkills,
  } from "@repo/music-core/content/winds-pads";
  import { gradeGroove, gradeRudiment, grooveCaptureEnd, tempoDrift, type GrooveResult, type RudimentResult } from "@repo/music-core/scoring/pads";
  import { closestGapMs, gradeTier, measuredSwing, PAD_LEVELS, PAD_REPERTOIRE, repertoireFor, TIERS, topicSkill } from "@repo/music-core/content/pads-repertoire";
  import { canSwing, grooveMeter, reswing } from "@repo/music-core/content/pads-grid";
  import { grooveLessonItems, padLessons, rudimentItem, SWING_CHOICES } from "@repo/music-core/lessons/pads";
  import { getSetting, putSetting } from "$lib/music/runtime";
  import CatalogPicker from "$lib/music/components/CatalogPicker.svelte";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Pads from "$lib/music/components/Pads.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, input, settings } from "$lib/music/runtime";
  import GrooveGrid from "$lib/music/drills/pads/GrooveGrid.svelte";
  import StickingLane from "$lib/music/drills/pads/StickingLane.svelte";
  import MidiStatus from "$lib/music/drills/pads/MidiStatus.svelte";
  import PadHighway, { type HighwayLane, type HighwayNote } from "$lib/music/drills/pads/PadHighway.svelte";
  import { judgeHit, laneColor, orderLanes, overdue, padsDue, starsFor, type Judgement } from "$lib/music/drills/pads/lanes";
  import { backingChords, backingFor } from "$lib/music/drills/pads/backing";
  import { padLabel } from "$lib/music/drills/pads/midi-status";
  import PadSkills from "$lib/music/drills/pads/PadSkills.svelte";
  import ChopDrill from "$lib/music/drills/pads/ChopDrill.svelte";
  import { padSound } from "$lib/music/drills/pads/slices";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const cfg = new DrillSetup("pads", {
    mode: "rudiment" as string,
    pattern: "single-strokes" as string,
    sub: 2,
    hits: 16,
    padL: 36,
    padR: 38,
    groove: "backbeat" as string,
    sound: true as boolean,
    // Hold the tempo: the groove played for twelve bars, the click gone after four.
    steady: "basic-rock" as string,
    // Practice tools, as play-along apps have them: play it more than once, or wait for each note.
    plays: 1,
    wait: false as boolean,
    // A small band under the groove (chords by style, bass on the kick).
    backing: false as boolean,
    // MPC swing on any groove whose hits sit on the grid (0: as written).
    swing: 0,
    // Check, faded: the notes and live judgements for the first two plays, then the guide fades and only the rest counts.
    fade: false as boolean,
    // The lanes (notes sliding onto a hit line, the pads beside) or the step grid; how many bars the lanes read ahead.
    view: "lanes" as string,
    ahead: 1,
  });
  const s = $derived(cfg.value);
  // Path steps carry their tempo (?bpm=); the practice strip owns it from then on.
  const urlBpm = Number(page.url.searchParams.get("bpm"));
  // Wait for the stored row: an update before it loads would write defaults over it.
  if (urlBpm) void settings.ready.then(() => settings.update({ bpm: clamp(Math.round(urlBpm), 30, 240) }));
  const bpm = $derived(clamp(settings.value.bpm, 30, 240));
  const beatMs = $derived(60000 / bpm);

  /** Hold the tempo: a groove too, longer, with the click for the first four bars only. */
  const isSteady = $derived(s.mode === "steady");
  const isGroove = $derived(s.mode === "groove" || isSteady);
  const pattern = $derived(RUDIMENTS.find((r) => r.id === s.pattern) ?? RUDIMENTS[0]);
  /** The rudiment's own grid wins; a pyramid is timed on its closest spacing (four a beat). */
  const perBeat = $derived(rudimentPerBeat(pattern, s.sub as 2 | 3 | 4));
  const fixedGrid = $derived(!!pattern.subdivision || !!pattern.perBeat);
  const stepMs = $derived(beatMs / perBeat);
  const pads = $derived<[number, number]>(s.padL === s.padR ? [36, 38] : [s.padL, s.padR]);
  /** Stick Control fixes the length (20 repetitions); the rest take the chosen count. */
  const hitCount = $derived(pattern.hits ?? s.hits);
  const hits = $derived(rudimentHits({ patternId: pattern.id, subdivision: s.sub as 2 | 3 | 4, hits: hitCount, bpm, pads }));
  const strokes = $derived(hits.filter((h) => !h.grace));
  const STEADY_BARS = 12;
  const CLICK_BARS = 4;
  // The repertoire holds the table's grooves and the app's, by level.
  const entry = $derived(repertoireFor(isSteady ? s.steady : s.groove) ?? PAD_REPERTOIRE[0]);
  const levelOf = $derived(PAD_LEVELS.find((l) => l.level === entry.level)!);
  /** The groove's own swing, whether it can take another, and the one played. */
  const writtenSwing = $derived(entry.swing ?? 50);
  const swingable = $derived(!isSteady && canSwing(entry.groove, writtenSwing));
  const swing = $derived(swingable && s.swing ? s.swing : writtenSwing);
  /** Clicks a bar and grid steps a click: 4 and 4 unless the groove says (5/4, 7/8, triplets). */
  const perBar = $derived(entry.groove.beatsPerBar ?? 4);
  const perBeatStep = $derived(entry.groove.stepsPerBeat ?? 4);
  /** Hold the tempo repeats the groove to twelve bars: four with the click, eight without. */
  const played = $derived.by(() => {
    const g = reswing(entry.groove, writtenSwing, swing);
    const plays = waitMode ? 1 : faded ? Math.max(FADE_PLAYS + 2, Math.min(32, Math.round(s.plays))) : Math.max(1, Math.min(32, Math.round(s.plays)));
    if (!isSteady && plays === 1) return g;
    const cycles = isSteady ? Math.ceil(STEADY_BARS / g.bars) : plays;
    return {
      ...g,
      bars: cycles * g.bars,
      sectionLabels: isSteady
        ? Array.from({ length: cycles * g.bars }, (_, b) => (b < CLICK_BARS ? "with the click" : "on your own"))
        : faded
          ? Array.from({ length: cycles * g.bars }, (_, b) => (b < FADE_PLAYS * g.bars ? "with the guide" : "on your own"))
          : Array.from({ length: cycles }, () => g.sectionLabels).flat(),
      targets: Array.from({ length: cycles }, (_, c) => g.targets.map((t) => ({ ...t, beat: t.beat + c * g.bars * perBar }))).flat(),
    };
  });
  const groove = $derived(grooveTargetsFor(played, bpm));
  const voicePads = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  /** Wait mode: no click; each note waits until its pads are hit (learn it, then time it). */
  const waitMode = $derived(!!s.wait && !isSteady && mode === "practice");
  /** Faded feedback (Check only): the guide for FADE_PLAYS plays, then summary only; the plays after it are graded. */
  const FADE_PLAYS = 2;
  const faded = $derived(!!s.fade && isGroove && !isSteady && mode === "check");
  const fadeMs = $derived(faded ? FADE_PLAYS * entry.groove.bars * perBar * beatMs : 0);
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let rud = $state<RudimentResult | null>(null);
  let grv = $state<GrooveResult | null>(null);
  /** The research's measures on top of the groove grade: perfect and good, swing, drift, each drum's lean. */
  let extra = $state.raw<{
    tier: ReturnType<typeof gradeTier>;
    swing: number | null;
    drift: ReturnType<typeof tempoDrift>;
    bias: { voice: string; ms: number | null }[];
    pass: boolean;
  } | null>(null);
  const ladderKey = (id: string) => `music.pads.ladder.${id}`;
  /** Pick a groove and start at its ladder's tempo (its start tempo the first time). */
  async function pickGroove(id: string, key: "groove" | "steady" = "groove") {
    cfg.set({ [key]: id, swing: 0 });
    const r = repertoireFor(id);
    if (!r) return;
    const saved = await getSetting<number>(ladderKey(id), r.bpm.start);
    void settings.update({ bpm: saved });
  }
  let downbeat = $state(0);
  let now = $state(0);
  /** The guide shows: in Practice, or a faded run before the fade. */
  const guided = $derived(mode === "practice" || (faded && (phase === "countin" || now - downbeat < fadeMs)));
  let demo = $state<{ stop(): void; playing: boolean; startPerf: number } | null>(null);
  const playing = $derived(phase === "running" || phase === "countin" || !!demo?.playing);
  let demoLit = $state<Record<number, boolean>>({});
  const flashes = new Flashes();
  /** How each hit landed, on its pad. */
  const timing = new Flashes<"early" | "late" | "perfect">();
  const lanesView = $derived(s.view !== "grid");
  const aheadBars = $derived([1, 2, 4].includes(s.ahead) ? s.ahead : 1);
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let band: { stop(): void } | null = null;
  /** The band plays under grooves, never under Hold the tempo (it would carry the tempo) or Wait mode. */
  const withBacking = $derived(!!s.backing && isGroove && !isSteady && !waitMode);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;

  // Visual clock only (scheduling stays on the audio clock).
  $effect(() => {
    if (phase !== "running" && phase !== "countin" && !demo?.playing) return;
    let raf = 0;
    const loop = () => {
      now = performance.now();
      sweepMisses();
      // Wait mode glides the highway to the next waiting note.
      if (waitMode && waitGroups.length) waitShown += ((waitGroups[Math.min(waitIdx, waitGroups.length - 1)] ?? 0) - 120 - waitShown) * 0.2;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });
  const base = $derived(demo?.playing ? demo.startPerf : phase === "running" ? downbeat : null);
  /** The notes show in Practice, while a guide or the demo plays, and after a run; Check otherwise plays from memory. */
  const notesShown = $derived(playing ? guided || !!demo?.playing : mode === "practice" || phase === "results");
  /** The lanes while it plays and before; the results read on the grid, each note marked. */
  const showLanes = $derived(lanesView && phase !== "results");
  /** The stroke due now: the one whose half-gap window holds the clock (a pyramid's gaps vary). */
  const strokeNow = $derived.by(() => {
    if (base === null) return null;
    const rel = now - base;
    let i = -1;
    for (const [k, h] of strokes.entries()) if (rel >= h.atMs - (k ? (h.atMs - strokes[k - 1].atMs) / 2 : stepMs / 2)) i = k;
    return i;
  });
  /** The grid step due now (a sixteenth, or a triplet on a triplet grid). */
  const stepNow = $derived(base === null || now < base ? null : Math.floor((now - base) / (beatMs / (isGroove ? perBeatStep : 4))));

  // MIDI pad hits sound here (the MPC in Controller Mode is silent); on-screen
  // taps already sound through the input layer.
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind === "noteon" && e.source !== "onscreen" && cfg.value.sound && cfg.value.mode !== "chop" && !padSound.slicesAt?.(e.at)) audio.drum(e.midi, e.velocity);
    }),
  );

  // Technique, before a run: tapping a pad makes it the left hand's, the next tap the right's (one-pad rolls take one tap).
  let assign = $state<"left" | "right">("left");
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind !== "noteon" || phase !== "ready" || cfg.value.mode !== "rudiment" || demo?.playing || e.midi < 36 || e.midi > 51) return;
      const m = e.midi;
      if (pattern.onePad || assign === "right") {
        cfg.set(m === pads[0] ? { padR: m, padL: pads[1] } : { padR: m });
        assign = "left";
      } else {
        cfg.set(m === pads[1] ? { padL: m, padR: pads[0] } : { padL: m });
        assign = "right";
      }
    }),
  );

  const names = $derived<Record<number, string>>(
    isGroove
      ? Object.fromEntries(GROOVE_VOICES.filter((v) => groove.targets.some((t) => t.voice === v.id)).map((v) => [v.midi, v.name]))
      : pattern.onePad
        ? { [pads[1]]: "Both fingers" }
        : { [pads[0]]: "Left", [pads[1]]: "Right" },
  );

  // ---------------------------------------------------------------------------
  // The highway: lanes, notes, live judgements, streak.

  /** Top to bottom as drum notation reads: cymbals, hats, toms, snare, kick. */
  const lanes = $derived<HighwayLane[]>(
    isGroove
      ? orderLanes(groove.targets.map((t) => t.voice)).map((v) => ({ id: v, label: voiceName(v), color: laneColor(v), pad: groove.targets.find((t) => t.voice === v)!.pad }))
      : pattern.onePad
        ? [{ id: "both", label: "Both", color: laneColor("both"), pad: pads[1] }]
        : [
            { id: "right", label: "Right", color: laneColor("right"), pad: pads[1] },
            { id: "left", label: "Left", color: laneColor("left"), pad: pads[0] },
          ],
  );
  /** What is judged live, in order: the groove's targets or the rudiment's strokes. */
  const live = $derived(
    isGroove
      ? groove.targets.map((t) => ({ pad: t.pad, atMs: t.atMs, lane: lanes.findIndex((l) => l.id === t.voice), kind: (t.accent ? "accent" : t.ghost ? "ghost" : "normal") as HighwayNote["kind"] }))
      : strokes.map((h) => ({ pad: h.pad, atMs: h.atMs, lane: pattern.onePad || h.hand === "right" ? 0 : 1, kind: (h.accent ? "accent" : h.velocityBand ? "ghost" : "normal") as HighwayNote["kind"] })),
  );
  const padColors = $derived<Record<number, string>>(
    isGroove
      ? Object.fromEntries(GROOVE_VOICES.filter((v) => groove.targets.some((t) => t.voice === v.id)).map((v) => [v.midi, laneColor(v.id)]))
      : pattern.onePad
        ? { [pads[1]]: laneColor("both") }
        : { [pads[0]]: laneColor("left"), [pads[1]]: laneColor("right") },
  );
  /** The level's perfect and good windows (beginner for technique), good capped by the closest spacing. */
  const judgeWindow = $derived.by(() => {
    const tier = isGroove ? TIERS[levelOf.tier] : TIERS.beginner;
    const good = Math.min(tier.good, 0.4 * (isGroove ? closestGapMs(groove.targets, beatMs) : stepMs));
    return { perfect: Math.min(tier.perfect, good), good };
  });
  let judged = $state<Record<number, Judgement>>({});
  let streak = $state(0);
  let bestStreak = $state(0);
  let flashKey = 0;
  let flashNote = $state<{ judgement: Judgement | "extra"; ms?: number; key: number } | null>(null);
  const judgedCount = $derived(Object.keys(judged).length);
  const liveScore = $derived(
    judgedCount ? Object.values(judged).reduce((t, j) => t + (j === "perfect" ? 1 : j === "miss" ? 0 : 0.7), 0) / judgedCount : null,
  );
  /** A hit, judged against the nearest unjudged note on its pad inside the good window. */
  function judge(e: NoteEvent) {
    const hit = judgeHit(live, judged, e.midi, e.at - downbeat, judgeWindow);
    if (!hit) {
      flashNote = { judgement: "extra", key: ++flashKey };
      return;
    }
    judged = { ...judged, [hit.index]: hit.judgement };
    if (hit.judgement !== "miss") timing.add(e.midi, hit.judgement, 450);
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    flashNote = { judgement: hit.judgement, ms: hit.err, key: ++flashKey };
  }
  /** Notes gone past the good window unhit: missed, and the streak resets. */
  function sweepMisses() {
    if (phase !== "running" || waitMode) return;
    const missed = overdue(live, judged, performance.now() - downbeat, judgeWindow.good);
    if (!missed.length) return;
    judged = { ...judged, ...Object.fromEntries(missed.map((i) => [i, "miss" as const])) };
    streak = 0;
    flashNote = { judgement: "miss", key: ++flashKey };
  }

  // Wait mode: the notes stop at each group until its pads are hit.
  let waitGroups = $state<number[]>([]);
  let waitIdx = $state(0);
  let waitShown = $state(0);
  let wrongPads = 0;
  function waitHit(e: NoteEvent) {
    const at = waitGroups[waitIdx];
    const due = live.flatMap((t, i) => (Math.abs(t.atMs - at) < 1 && !judged[i] ? [i] : []));
    const hit = due.find((i) => live[i].pad === e.midi);
    if (hit === undefined) {
      wrongPads++;
      streak = 0;
      flashNote = { judgement: "extra", key: ++flashKey };
      return;
    }
    judged = { ...judged, [hit]: "perfect" };
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    flashNote = { judgement: "perfect", key: ++flashKey };
    if (due.length === 1) {
      waitIdx++;
      if (waitIdx >= waitGroups.length) finishWait();
    }
  }
  function finishWait() {
    clearTimeout(timer);
    cap?.stop();
    phase = "results";
    const n = live.length;
    summary = {
      headline: `All ${n} notes in order${wrongPads ? `, with ${wrongPads} wrong pad${wrongPads > 1 ? "s" : ""}` : ", no wrong pads"}. Now turn Wait off and play it in time.`,
      metric: String(n),
      metricLabel: "notes learned",
      rows: [
        { label: "Wrong pads", text: String(wrongPads) },
        { label: "Longest run without a wrong pad", text: String(bestStreak) },
      ],
      assistance: "Wait mode waits for you, so it is learning, not timing: nothing is recorded.",
      recorded: false,
    };
    status = summary.headline;
  }

  // Stars, best kept per groove or rudiment.
  const STARS_KEY = "music.pads.stars";
  let bestStars = $state<Record<string, number>>({});
  void getSetting<Record<string, number>>(STARS_KEY, {}).then((v) => (bestStars = v));
  let stars = $state<number | null>(null);
  const starsId = $derived(isSteady ? `steady:${entry.groove.value}` : isGroove ? entry.groove.value : `rudiment:${pattern.id}`);
  const starText = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    for (const [m, on] of Object.entries(demoLit)) if (on) out[+m] = { demo: true };
    if ((mode === "check" && !guided) || phase === "results" || demo?.playing) return out;
    if (phase === "running" && waitMode) {
      // The pads the waiting notes need.
      const at = waitGroups[waitIdx];
      live.forEach((t, i) => {
        if (Math.abs(t.atMs - at) < 1 && !judged[i]) out[t.pad] = { target: true };
      });
      return out;
    }
    if (phase === "running") {
      // A pad glows in its lane's colour as its note comes up (half a beat ahead).
      for (const p of padsDue(live, now - downbeat, Math.min(beatMs / 2, 260))) out[p] = { target: true };
      return out;
    }
    if (!isGroove)
      for (const [i, p] of pads.entries()) if (!pattern.onePad || i === 1) out[p] = { role: i ? "right" : "left", target: phase === "ready" };
    return out;
  });

  const summaryLine = $derived<SetupClause[]>(
    isSteady
      ? [{ text: `Hold the tempo: ${entry.groove.label}`, focus: "steady" }, { text: `${CLICK_BARS} bars with the click and ${STEADY_BARS - CLICK_BARS} on your own` }, { text: `${bpm} BPM` }]
      : isGroove
        ? [
            { text: `Level ${entry.level}: ${groove.groove.label}`, focus: "groove" },
            { text: `${groove.groove.bars} bar${groove.groove.bars > 1 ? "s" : ""}` },
            ...(grooveMeter(entry.groove) !== "4/4" && !groove.groove.label.includes(grooveMeter(entry.groove)) ? [{ text: `in ${grooveMeter(entry.groove)}` }] : perBeatStep % 2 ? [{ text: "on triplets" }] : []),
            { text: `${bpm} BPM (aim for ${entry.bpm.target})` },
            ...(swing !== 50 ? [{ text: `swing ${swing}%`, focus: "swing" }] : []),
            ...(faded ? [{ text: `the guide fades after ${FADE_PLAYS} plays`, focus: "fade" }] : []),
          ]
        : [
            { text: `Rudiment: ${pattern.label}`, focus: "pattern" },
            { text: SUBDIVISION_NAMES[perBeat], focus: "sub" },
            { text: pattern.hits ? `${pattern.hits / pattern.unit.length} repetitions` : `${s.hits} hits`, focus: "hits" },
            { text: pattern.onePad ? `pad ${padLabel(pads[1])}` : `pads ${padLabel(pads[0])} and ${padLabel(pads[1])}` },
            { text: `${bpm} BPM` },
          ],
  );
  const setupKey = $derived(
    isSteady ? `steady:${s.steady}:${bpm}` : isGroove ? `groove:${s.groove}:${bpm}${swing !== writtenSwing ? `:swing${swing}` : ""}` : `rudiment:${pattern.id}:${perBeat}:${hitCount}:${pads.join("-")}:${bpm}`,
  );

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoLit = {};
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes = isGroove
      ? [...groove.targets.map((t) => ({ midi: t.pad, time: t.atMs / 1000, duration: 0.12, velocity: t.accent ? 1 : 0.7, voice: "drum" as const })), ...(withBacking ? backingFor(entry.style, groove.targets, groove.groove.bars, beatMs, perBar) : [])]
      : hits.map((h) => ({ midi: h.pad, time: (h.atMs + 30) / 1000, duration: 0.1, velocity: h.grace ? 0.4 : h.accent || !hits.some((x) => x.accent) ? 0.95 : 0.55, voice: "drum" as const }));
    const handle = audio.playSequence(notes, {
      onNote: (i: number) => {
        if (notes[i].voice !== "drum") return;
        const m = notes[i].midi;
        demoLit = { ...demoLit, [m]: true };
        setTimeout(() => (demoLit = { ...demoLit, [m]: false }), 110);
      },
    });
    demo = handle;
    status = "Listen: the pattern at tempo, pads lit as they sound. Not scored.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function nearest<T extends { atMs: number }>(list: T[], at: number, ok: (t: T) => boolean) {
    let best: T | null = null;
    for (const t of list) if (ok(t) && (!best || Math.abs(t.atMs - at) < Math.abs(best.atMs - at))) best = t;
    return best;
  }

  function onHit(e: NoteEvent) {
    if ((phase !== "running" && phase !== "countin") || !guided) return;
    if (waitMode) return waitHit(e);
    judge(e);
    const at = e.at - downbeat;
    if (isGroove) {
      const t = nearest(groove.targets, at, (x) => x.pad === e.midi);
      flashes.add(e.midi, t && Math.abs(t.atMs - at) <= groove.matchWindowMs ? "correct" : "wrong");
    } else {
      const t = nearest(strokes, at, () => true);
      flashes.add(e.midi, t && t.pad === e.midi && Math.abs(t.atMs - at) <= stepMs / 2 ? "correct" : "wrong");
    }
  }

  function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    rud = null;
    grv = null;
    extra = null;
    flashes.clear();
    timing.clear();
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    judged = {};
    streak = 0;
    bestStreak = 0;
    flashNote = null;
    stars = null;
    if (waitMode) {
      waitGroups = [...new Set(live.map((t) => Math.round(t.atMs)))].sort((a, b) => a - b);
      waitIdx = 0;
      waitShown = -beatMs;
      wrongPads = 0;
      run = null;
      cap = capture(performance.now() - 50, (e) => e.kind === "noteon" && onHit(e));
      status = "Wait mode: hit the glowing pads; each note waits for you.";
      return;
    }
    run = practice.beginRun({
      exerciseId: isSteady ? "technique.mpc.steadiness" : isGroove ? "technique.mpc.groove" : "technique.mpc.single-strokes",
      setupKey,
      skillIds: isSteady
        ? ["technique.mpc", "technique.mpc.steadiness"]
        : isGroove
          ? [...new Set([...(GROOVES.some((g) => g.value === s.groove) ? grooveSkills(s.groove) : ["technique.mpc"]), topicSkill(entry.topic)])]
          : rudimentSkills(pattern.id),
      capabilities: ["technique", "rhythm"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: isGroove
        ? clamp(0.1 + entry.level * 0.12 + (bpm / entry.bpm.target - 1) * 0.3, 0.05, 0.95)
        : clamp(0.25 + (perBeat - 2) * 0.1 + (bpm - 60) / 300 + (pattern.id === "paradiddle" || pattern.id === "flam" ? 0.1 : 0), 0, 1),
      instrument: "mpc",
      params: isGroove
        ? { bpm, groove: entry.groove.value, mode: s.mode, ...(swingable ? { swing } : {}), ...(isSteady ? {} : { plays: played.bars / entry.groove.bars, backing: withBacking }), ...(faded ? { fade: FADE_PLAYS } : {}) }
        : { bpm, pattern: pattern.id, sub: perBeat, hits: hitCount, padL: pads[0], padR: pads[1] },
    });
    const wait = Math.max(0, ctx.downbeat - performance.now());
    if (withBacking) band = audio.playSequence(backingFor(entry.style, groove.targets, groove.groove.bars, beatMs, perBar), { startPerf: ctx.downbeat });
    if (isGroove) {
      // Scored input opens after the count-in; the grader's window catches an early first hit.
      cap = capture(ctx.downbeat - groove.matchWindowMs, (e) => e.kind === "noteon" && onHit(e));
      const lastAt = Math.max(...groove.targets.map((t) => t.atMs));
      const end = grooveCaptureEnd(ctx.downbeat + lastAt, beatMs, ctx.downbeat + groove.lengthMs);
      timer = setTimeout(() => void finish(), end - performance.now() + 150);
      if (isSteady) {
        clickTimer = setTimeout(() => {
          ctx.stopClock();
          if (phase === "running") status = "On your own now: hold the tempo.";
        }, ctx.downbeat + CLICK_BARS * perBar * beatMs - performance.now() - 30);
      }
    } else {
      cap = capture(ctx.downbeat - stepMs / 2, (e) => e.kind === "noteon" && onHit(e));
      timer = setTimeout(() => void finish(), wait + strokes[strokes.length - 1].atMs + stepMs + 200);
    }
  }

  const velocityWhy = (notes: NoteEvent[]) =>
    notes.some((n) => n.source !== "midi") ? "on-screen hits carry no velocity" : "every hit had the same velocity; is Full Level on?";

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    clearTimeout(clickTimer);
    band?.stop();
    band = null;
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    let graded: { score: number; correct: boolean; metrics: RudimentResult["metrics"] };
    if (isGroove) {
      const r = gradeGroove({
        targets: groove.targets.map((t) => ({ voice: t.voice, beat: t.beat, accent: t.accent ? "accent" : "normal" })),
        voicePads,
        sectionLabels: played.sectionLabels,
        beatsPerBar: perBar,
        beatMs,
        startAt: downbeat,
        hits: notes,
        responseEnd: downbeat + groove.lengthMs,
      });
      if ("error" in r) {
        phase = "ready";
        status = r.error;
        return;
      }
      grv = r;
      // Faded: only the plays after the guide count.
      const own = faded ? r.perSection.find((x) => x.label === "on your own") : null;
      const tier = gradeTier(faded ? r.perTarget.filter((_, i) => groove.targets[i].atMs >= fadeMs - 1) : r.perTarget, levelOf.tier, closestGapMs(groove.targets, beatMs));
      // On your own: the tempo read from the raw hits, since a steady drift leaves the match window.
      const drift = isSteady ? tempoDrift(groove.targets, notes, beatMs, downbeat, CLICK_BARS * 4) : null;
      // Early (negative) or late per drum: each finger has its own lean.
      const bias = [...new Set(groove.targets.map((t) => t.voice))].map((voice) => {
        const errs = groove.targets.flatMap((t, i) => (t.voice === voice && r.perTarget[i] !== null ? [r.perTarget[i]!] : []));
        return { voice, ms: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : null };
      });
      // No readable tempo once the click stopped is not steady either, unless nothing was played.
      const steadyOk = !isSteady || (drift ? Math.abs(drift.driftBpm) < 3 : !ons.length);
      extra = { tier, swing: swing !== 50 && perBeatStep === 4 ? measuredSwing(groove.targets, r.perTarget, beatMs) : null, drift, bias, pass: tier.pass && steadyOk };
      // Holding the tempo counts in the score: drifting 3 BPM or more costs 40%.
      const base = own ? own.matched / Math.max(1, own.matched + own.missed + own.extra) : r.score;
      graded = { ...r, score: steadyOk ? base : base * 0.6, correct: tier.pass && steadyOk };
    } else {
      const r = gradeRudiment({
        strokes: strokes.map((h) => ({ pad: h.pad, offsetMs: h.atMs, band: h.velocityBand ? (h.accent ? ("accent" as const) : ("tap" as const)) : undefined })),
        stepMs,
        anchorAt: downbeat,
        hits: notes,
      });
      rud = r;
      graded = r;
    }
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: graded.correct,
      partialCredit: graded.score,
      metrics: graded.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, "mpc") ?? null,
      target: isGroove ? groove.targets.map((t) => t.pad) : strokes.map((h) => h.pad),
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score: graded.score, correct: graded.correct, headline: `${pct(graded.score)} at ${bpm} BPM` });
    if (!fin.heard) {
      // Nothing measured: no marks, stars or timing from zero hits.
      rud = grv = null;
      summary = silentRun();
      status = summary.headline;
      return;
    }
    summary = {
      ...(isGroove ? grooveSummary(grv!, ons) : rudimentSummary(rud!, ons)),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: graded.correct && mode === "check",
      assistance: assistanceText(mode),
      advance: await advanceAfter(graded.score, graded.correct),
    };
    // The tempo this groove starts at next time it is picked: where the Next run offer leaves it.
    const nx = summary.advance;
    if (isGroove && !isSteady && nx) void putSetting(ladderKey(entry.groove.value), nx.kind === "harder" ? entry.bpm.target : nx.kind === "easier" ? bpm : (nx.bpm ?? bpm));
    stars = starsFor(graded.score, isGroove ? !!extra?.pass : graded.correct);
    if (stars > (bestStars[starsId] ?? 0)) {
      bestStars = { ...bestStars, [starsId]: stars };
      void putSetting(STARS_KEY, bestStars);
    }
    status = summary.headline;
  }

  /** Grooves climb the tempo to the target, then the next groove by level; rudiments climb to 120, then the subdivision or the length. */
  const GROOVE_STEPS = [...PAD_REPERTOIRE].sort((a, b) => a.level - b.level);
  const SUB_STEPS = [{ label: "Eighths" }, { label: "Triplets" }, { label: "Sixteenths" }];
  function advanceAfter(score: number, correct: boolean) {
    const run = { score, correct };
    if (isSteady) return nextRun(`pads.steady.${s.steady}`, { bpm, tempo: { min: 40, goal: entry.bpm.target } }, run);
    if (isGroove)
      return nextRun("pads.groove", { bpm, tempo: { min: Math.min(bpm, entry.bpm.start), goal: entry.bpm.target }, steps: GROOVE_STEPS.map((r) => ({ label: `Level ${r.level}, ${r.groove.label}`, goal: r.bpm.target, start: r.bpm.start })), step: GROOVE_STEPS.indexOf(entry) }, run, tempoAnd((i) => cfg.set({ groove: GROOVE_STEPS[i].groove.value })));
    const tempo = { min: 40, goal: 120 };
    // A rudiment with its own subdivision grows in length instead.
    // Stick Control moves through the stickings once each holds at the goal.
    if (pattern.hits) {
      const sticks = RUDIMENTS.filter((r) => r.hits);
      return nextRun("pads.stick-control", { bpm, tempo: { min: 40, goal: 90 }, steps: sticks.map((r) => ({ label: r.label })), step: Math.max(0, sticks.indexOf(pattern)) }, run, tempoAnd((i) => cfg.set({ pattern: sticks[i].id })));
    }
    if (fixedGrid)
      return nextRun(`pads.rudiment.${pattern.id}`, { bpm, tempo, steps: RUDIMENT_HIT_COUNTS.map((n) => ({ label: `${n} hits` })), step: Math.max(0, RUDIMENT_HIT_COUNTS.indexOf(s.hits as 8)) }, run, tempoAnd((i) => cfg.set({ hits: RUDIMENT_HIT_COUNTS[i] })));
    return nextRun(`pads.rudiment.${pattern.id}.${s.hits}`, { bpm, tempo, steps: SUB_STEPS, step: Math.max(0, [2, 3, 4].indexOf(s.sub)) }, run, tempoAnd((i) => cfg.set({ sub: [2, 3, 4][i] })));
  }

  function rudimentSummary(r: RudimentResult, ons: NoteEvent[]): RunSummary {
    const ms = Math.round(r.meanAbsErrorMs);
    const wrongPads = r.perStroke.filter((p) => p && !p.rightPad).length;
    const headline = !ons.length
      ? "No hits arrived. Check the line under the stage for why."
      : r.correct
        ? `Clean: every stroke landed, ${ms} ms off the click on average.`
        : r.completion < 1
          ? `${r.matched} of ${r.total} strokes landed. Keep going to the last one.`
          : r.pad < 0.875
            ? `${wrongPads} stroke${wrongPads === 1 ? "" : "s"} on the wrong pad. Slow down and say the sticking.`
            : ms > 90
              ? `Right pads, but ${ms} ms off the click on average. Aim for 90 or less.`
              : "Timing and pads are right; the accents missed their velocity bands.";
    return {
      headline,
      metric: pct(r.score),
      metricLabel: r.velocity === null ? "score, velocity not measured" : "score",
      rows: [
        { label: "Right pad", value: r.pad, text: `${r.matched - wrongPads} of ${r.total}` },
        r.matched ? { label: "Timing vs the click", value: r.timing, text: `${ms} ms off` } : { label: "Timing vs the click", notMeasured: true },
        r.velocity === null
          ? { label: `Velocity: ${velocityWhy(ons)}`, notMeasured: true }
          : { label: hits.some((h) => h.velocityBand) ? "Accents in band" : "Velocity evenness", value: r.velocity },
        { label: "Completed", value: r.completion, text: `${r.matched} of ${r.total}${r.extra ? `, ${r.extra} extra` : ""}` },
      ],
    };
  }

  function sectionWord(label: string, r: GrooveResult) {
    const sec = r.perSection.find((x) => x.label === label)!;
    if (sec.missed) return `${sec.missed} missed`;
    if (sec.extra) return `${sec.extra} extra`;
    const errs = groove.targets.flatMap((t, i) => (t.section === label && r.perTarget[i] !== null ? [r.perTarget[i]!] : []));
    const signed = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
    if (sec.meanAbsErrorMs > 45) return signed > 0 ? "late" : "early";
    return "clean";
  }

  function grooveSummary(r: GrooveResult, ons: NoteEvent[]): RunSummary {
    const ms = Math.round(r.meanAbsErrorMs);
    const labels = [...new Set(groove.groove.sectionLabels)];
    const total = groove.targets.length;
    let headline: string;
    if (!ons.length) headline = "No hits arrived. Check the line under the stage for why.";
    else if (labels.length > 1) {
      const parts = labels.map((l) => `${l} ${sectionWord(l, r)}`).join(", ");
      headline = parts.charAt(0).toUpperCase() + parts.slice(1) + ".";
    } else if (r.correct) headline = `Clean: all ${total} hits in the window, ${ms} ms off on average.`;
    else if (r.missed || r.extra) headline = `${r.missed ? `${r.missed} missed` : ""}${r.missed && r.extra ? " and " : ""}${r.extra ? `${r.extra} extra` : ""} out of ${total}. The grid shows where.`;
    else headline = `Every hit landed, ${ms} ms off on average. Tighten it under 90.`;
    const x = extra!;
    if (ons.length && isSteady && x.drift) {
      const d = x.drift;
      const way = Math.abs(d.driftBpm) < 0.5 ? "held it" : d.driftBpm > 0 ? `rushed to ${d.bpmPlayed.toFixed(1)}` : `dragged to ${d.bpmPlayed.toFixed(1)}`;
      headline = `On your own you ${way} (${bpm} BPM asked), and ended ${Math.abs(Math.round(d.endOffsetMs))} ms ${d.endOffsetMs < 0 ? "ahead of" : "behind"} the grid. ${x.pass ? "Steady." : Math.abs(d.driftBpm) >= 3 ? "Aim to stay within 3 BPM." : ""}`.trim();
    } else if (ons.length && isSteady) headline = `${headline} Too few hits landed on your own to read the tempo.`;
    else if (ons.length && !isSteady)
      headline = x.pass
        ? `Passed level ${entry.level} at ${bpm} BPM: ${Math.round(x.tier.perfect * 100)}% perfect, ${Math.round(x.tier.good * 100)}% good.${bpm < entry.bpm.target ? "" : " At the target tempo."}`
        : `${headline} ${Math.round(x.tier.good * 100)}% good of the 90% to pass, ${Math.round(x.tier.perfect * 100)}% perfect of 70%.`;
    const leans = x.bias.filter((b) => b.ms !== null && Math.abs(b.ms) >= 8);
    return {
      headline,
      metric: pct(r.score),
      metricLabel: r.inBand === null ? "score, accents not measured" : "score",
      rows: [
        ...(faded ? [{ label: "Graded", text: `the ${played.bars / entry.groove.bars - FADE_PLAYS} plays on your own, after the guide faded` }] : []),
        { label: `Perfect (within ${Math.round(x.tier.perfectMs)} ms)`, value: x.tier.perfect, text: `${Math.round(x.tier.perfect * 100)}%, 70% to pass` },
        { label: `Good (within ${Math.round(x.tier.goodMs)} ms)`, value: x.tier.good, text: `${Math.round(x.tier.good * 100)}%, 90% to pass` },
        ...(x.swing !== null ? [{ label: "Swing played", value: Math.max(0, 1 - Math.abs(x.swing - swing) / 10), text: `${x.swing}%, aiming for ${swing}%` }] : []),
        ...(leans.length ? [{ label: "Each drum's lean", text: leans.map((b) => `${voiceName(b.voice)} ${Math.abs(b.ms!)} ms ${b.ms! < 0 ? "early" : "late"}`).join(", ") }] : []),
        { label: "Hits matched", value: r.matched / total, text: `${r.matched} of ${total}` },
        { label: "Extra hits", value: r.extra ? Math.max(0, 1 - r.extra / total) : 1, text: String(r.extra) },
        r.matched ? { label: "Timing", value: Math.max(0, 1 - r.meanAbsErrorMs / 180), text: `${ms} ms off` } : { label: "Timing", notMeasured: true },
        r.inBand === null
          ? { label: `Accents: ${velocityWhy(ons)}`, notMeasured: true }
          : { label: "Accents in band", value: r.inBand / total, text: `${r.inBand} of ${total}` },
      ],
    };
  }

  function stop() {
    clearTimeout(timer);
    clearTimeout(clickTimer);
    band?.stop();
    band = null;
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function setMode(m: string) {
    if (phase === "running" || phase === "countin") return;
    stopDemo();
    cfg.set({ mode: m });
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    clearTimeout(timer);
    clearTimeout(clickTimer);
    band?.stop();
    cap?.stop();
    stopDemo();
  });

  const MODES = [
    ["rudiment", "Technique"],
    ["groove", "Grooves"],
    ["steady", "Hold the tempo"],
    ["dynamics", "Dynamics"],
    ["fills", "Fills"],
    ["echo", "Play it back"],
    ["ostinato", "Ostinato and a line"],
    ["orchestrate", "Rudiments on the kit"],
    ["improvise", "Improvise"],
    ["chop", "Chop"],
    ["repeat", "Note repeat"],
    ["song", "Song form"],
  ] as const;
  const SKILL_MODES = ["dynamics", "fills", "echo", "ostinato", "orchestrate", "improvise", "repeat", "song"] as const;
  const skillMode = $derived(SKILL_MODES.find((m) => m === s.mode) ?? null);
  /** The grooves by level (the drum phrases have their own drill), style and tempo on the line under, stars earned as the badge. */
  const grooveItems = $derived(
    PAD_REPERTOIRE.filter((r) => r.topic !== "phrases").map((r) => ({
      value: r.groove.value,
      title: r.groove.label,
      meta: `${r.style}, ${r.groove.bars} bar${r.groove.bars > 1 ? "s" : ""}${grooveMeter(r.groove) !== "4/4" ? ` of ${grooveMeter(r.groove)}` : (r.groove.stepsPerBeat ?? 4) % 2 ? " of triplets" : ""}, ${r.bpm.start} to ${r.bpm.target} BPM${r.swing ? `, swing ${r.swing}%` : ""}`,
      group: `Level ${r.level}: ${PAD_LEVELS.find((l) => l.level === r.level)!.title}`,
      badge: bestStars[r.groove.value] ? starText(bestStars[r.groove.value]) : undefined,
      keywords: r.feel,
    })),
  );
  /** Rudiments grouped as the skills are: singles and doubles, rolls, accents, paradiddles. */
  const rudimentOptions = ["Singles and doubles", "Rolls", "Accents", "Paradiddles", "Stick Control, page one"].flatMap((group) =>
    RUDIMENTS.filter((r) => (r.hits ? "Stick Control, page one" : rudimentSkills(r.id)[1] === "technique.mpc.paradiddles" ? "Paradiddles" : rudimentSkills(r.id)[1] === "technique.mpc.rolls" ? "Rolls" : rudimentSkills(r.id)[1] === "technique.mpc.accents" ? "Accents" : "Singles and doubles") === group).map((r) => ({ value: r.id, label: r.hits ? r.label.replace("Stick Control: ", "") : r.label, group })),
  );
  const voiceName = (id: string) => GROOVE_VOICES.find((v) => v.id === id)?.name ?? id;
</script>

<svelte:head><title>Pads | Woodshed</title></svelte:head>

{#snippet padGrid()}
  <Pads {marks} {flashes} {timing} {names} colors={padColors} label="MPC pads, bank A. Computer keys Z X C V play the bottom row." />
{/snippet}

{#if s.mode === "chop"}
  <ChopDrill modes={MODES} onmode={setMode} />
{:else if skillMode}
  {#key skillMode}<PadSkills skill={skillMode} modes={MODES} onmode={setMode} />{/key}
{:else}
<DrillShell
  title="Pads"
  hue="mpc"
  blurb={isSteady
    ? "Play a groove with the click, then keep it going when the click stops."
    : isGroove
      ? "Play the groove as the notes come at you. Each level tightens the timing; a pass moves the tempo up."
      : "Finger technique on the click: strokes, rolls, accents and ghosts."}
  summary={summaryLine}
  tabs={MODES.map(([id, label]) => ({ id, label }))}
  firstTabs={4}
  tab={s.mode}
  ontab={setMode}
  lesson={{ lessons: isGroove ? padLessons("grooves", entry.level, grooveLessonItems(entry, swing)) : padLessons("rudiments", undefined, [rudimentItem(pattern.id)]) }}
  modeNotes={{ practice: "The notes come at you, judged as they pass. Practice, not a test.", check: "From memory, no notes shown. Counts toward mastery." }}
  bind:phase
  bind:mode
  bind:status
  progress={base === null ? 0 : clamp((now - base) / (isGroove ? groove.lengthMs : strokes[strokes.length - 1].atMs + stepMs), 0, 1)}
  clock={waitMode ? undefined : { bpm, beatsPerBar: isGroove ? perBar : 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if isSteady}
        <div class="sm:col-span-2">
          <CatalogPicker label="Groove to hold" items={grooveItems.filter((o) => (repertoireFor(o.value)?.level ?? 9) <= 3)} value={s.steady} onchange={(v) => pickGroove(v, "steady")} recentKey="pads-steady" noun="groove" setupKey="steady" />
        </div>
      {:else if isGroove}
        <div class="sm:col-span-2">
          <CatalogPicker label="Groove" items={grooveItems} value={entry.groove.value} onchange={(v) => pickGroove(v)} recentKey="pads-groove" noun="groove" setupKey="groove" />
        </div>
      {:else}
        <Choice label="Rudiment" options={rudimentOptions} value={s.pattern} onchange={(v) => cfg.set({ pattern: v })} setupKey="pattern" />
        <Choice
          label="Subdivision{fixedGrid ? ` (the rudiment sets it: ${SUBDIVISION_NAMES[perBeat]})` : ''}"
          options={[
            { value: 2, label: "Eighths" },
            { value: 3, label: "Triplets" },
            { value: 4, label: "Sixteenths" },
          ]}
          value={perBeat}
          disabled={fixedGrid}
          onchange={(v) => cfg.set({ sub: v })}
          setupKey="sub"
        />
        {#if pattern.hits}
          <p class="text-sm text-ws-soft sm:pt-6">Stick Control: {pattern.hits / pattern.unit.length} repetitions of {pattern.label.replace("Stick Control: ", "")}, one pad a hand, so the app can check the sticking.</p>
        {:else}
          <Choice label="Hits" options={RUDIMENT_HIT_COUNTS.map((n) => ({ value: n as number, label: String(n) }))} value={s.hits} onchange={(v) => cfg.set({ hits: v })} setupKey="hits" />
        {/if}
      {/if}
      {#if isGroove && !isSteady && mode === "check"}
        <Choice label="Feedback" setupKey="fade" options={[{ value: "off", label: "None: from memory" }, { value: "on", label: `Fades after ${FADE_PLAYS} plays` }]} value={s.fade ? "on" : "off"} onchange={(v) => cfg.set({ fade: v === "on" })} />
      {/if}
      {#if !isSteady && mode !== "check"}
        <Choice label="Wait mode (learn it)" options={[{ value: "off", label: "Off" }, { value: "on", label: "On: no click, notes wait" }]} value={s.wait ? "on" : "off"} onchange={(v) => cfg.set({ wait: v === "on" })} />
      {/if}
      {#if isGroove && !isSteady && !waitMode}
        <Choice
          label="Backing"
          options={[
            { value: "off", label: "Click only" },
            { value: "on", label: `Band: ${backingChords(entry.style).join(" ")}` },
          ]}
          value={s.backing ? "on" : "off"}
          onchange={(v) => cfg.set({ backing: v === "on" })}
        />
        <Choice label="Plays" options={[1, 2, 4, 8, 16, 32].map((n) => ({ value: n, label: n === 1 ? "Once" : `${n} times` }))} value={s.plays} onchange={(v) => cfg.set({ plays: v })} />
        {#if swingable}
          <Choice
            label="Swing"
            options={[{ value: 0, label: `As written (${writtenSwing}%)` }, ...SWING_CHOICES.filter((n) => n !== writtenSwing).map((n) => ({ value: n, label: n === 50 ? "Straight" : `${n}%` }))]}
            value={s.swing === writtenSwing ? 0 : s.swing}
            onchange={(v) => cfg.set({ swing: v })}
            setupKey="swing"
          />
        {/if}
      {/if}
      <Choice label="View" options={[{ value: "lanes", label: "Lanes" }, { value: "grid", label: isGroove ? "Grid" : "Sticking" }]} value={lanesView ? "lanes" : "grid"} onchange={(v) => cfg.set({ view: v })} setupKey="view" />
      {#if lanesView}
        <Choice label="Look ahead" options={[1, 2, 4].map((n) => ({ value: n, label: n === 1 ? "1 bar" : `${n} bars` }))} value={aheadBars} onchange={(v) => cfg.set({ ahead: v })} setupKey="ahead" />
      {/if}
    </div>
    {#if !isGroove}<p class="mt-3 text-sm text-ws-soft">The pads: tap one on the stage to set the {pattern.onePad ? "pad" : "left hand, then the right"}.</p>{/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && guided}
      <Stat label="Streak" value={streak} tone={streak >= 8 ? "success" : undefined} />
      {#if liveScore !== null}<Stat label="Score so far" value="{Math.round(liveScore * 100)}%" />{/if}
    {/if}
    {#if phase === "running" && waitMode}
      <Stat label="Notes" value="{Object.keys(judged).length} of {live.length}" />
    {:else if phase === "running" && !isGroove && strokeNow !== null}
      <Stat label="Stroke" value="{clamp(strokeNow + 1, 1, strokes.length)} of {strokes.length}" />
    {:else if phase === "running" && isGroove && stepNow !== null}
      <Stat label="Bar" value="{Math.min(groove.groove.bars, Math.floor(stepNow / (perBeatStep * perBar)) + 1)} of {groove.groove.bars}" />
    {:else if rud}
      <Stat label="Landed" value="{rud.matched}/{rud.total}" tone={rud.completion === 1 ? "success" : "warn"} />
      <Stat label="Mean error" value={rud.matched ? `${Math.round(rud.meanAbsErrorMs)} ms` : "Not measured"} tone={rud.matched && rud.meanAbsErrorMs <= 90 ? "success" : "warn"} />
    {:else if grv}
      <Stat label="Matched" value="{grv.matched}/{groove.targets.length}" tone={grv.missed ? "warn" : "success"} />
      <Stat label="Extra" value={grv.extra} tone={grv.extra ? "warn" : "success"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-4" data-downbeat={phase === "running" || phase === "countin" ? downbeat : undefined} data-targets={isGroove ? JSON.stringify(groove.targets.map((t) => [t.pad, Math.round(t.atMs), t.accent ? "a" : t.ghost ? "g" : "n"])) : undefined} data-testid="pads-stage" data-view={notesShown && showLanes ? "lanes" : "grid"}>
      {#if !notesShown}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm text-ws-stage-soft">
          {#if faded}{phase === "running" ? "The guide has faded: keep it going. " : `Check, faded: the notes and judgements for ${FADE_PLAYS} plays, then summary only; the plays after the fade count. `}{/if}
          Check: from memory, no grid.
          {#if isGroove}{groove.groove.label}, {groove.groove.bars} bar{groove.groove.bars > 1 ? "s" : ""} after the count-in.{:else if pattern.onePad}{pattern.label} on {padLabel(pads[1])}.{:else}{pattern.label}, left on {padLabel(pads[0])}, right on {padLabel(pads[1])}.{/if}
        </p>
      {:else}
        {#if isGroove && !playing}
          <div class="rounded-xl bg-ws-stage-ink/8 p-3 text-sm" aria-label="About this groove">
            <p class="font-semibold">
              {entry.groove.label} <span class="font-normal text-ws-stage-soft">· {entry.style}, level {entry.level} ({levelOf.tier}: perfect within {TIERS[levelOf.tier].perfect} ms, good within {TIERS[levelOf.tier].good} ms){grooveMeter(entry.groove) !== "4/4" ? ` · ${grooveMeter(entry.groove)}` : ""}{swing !== 50 ? ` · swing ${swing}%` : ""}</span>
            </p>
            <p class="mt-1 text-ws-stage-soft">{entry.feel}</p>
            <p class="mt-1"><span class="text-ws-stage-soft">Fingers:</span> {entry.fingers}</p>
            <p class="mt-1 text-ws-stage-soft">
              {#if isSteady}Four bars with the click, then {STEADY_BARS - CLICK_BARS} on your own: stay within 3 BPM.{:else}Starts at {entry.bpm.start} BPM, aims for {entry.bpm.target}; two clean runs in a row move it up. Now {bpm}.{/if}
            </p>
          </div>
        {/if}
        {#if showLanes}
          <!-- The notes slide onto the hit line, judged as they pass; the pads beside light the next hit. -->
          <PadHighway
            {lanes}
            notes={live}
            now={waitMode && phase === "running" ? waitShown : demo?.playing ? now - demo.startPerf : playing ? now - downbeat : -beatMs}
            {beatMs}
            beatsPerBar={isGroove ? perBar : 4}
            stepsPerBeat={isGroove ? perBeatStep : perBeat}
            {aheadBars}
            lengthMs={isGroove ? groove.lengthMs : strokes[strokes.length - 1].atMs + stepMs}
            {judged}
            flash={flashNote}
            countIn={phase === "countin" ? Math.max(1, Math.ceil((downbeat - now) / beatMs)) : null}
            label="{lanes.map((l) => l.label).join(', ')}: notes coming up"
            pads={padGrid}
          />
          {#if waitMode}<p class="text-xs text-ws-stage-soft">Wait mode: no click; the notes stop until their pads are hit.</p>{/if}
        {:else if isGroove}
          <GrooveGrid
            targets={groove.targets}
            bars={groove.groove.bars}
            sectionLabels={groove.groove.sectionLabels}
            playhead={stepNow}
            outcomes={grv?.perTarget}
            windowMs={judgeWindow.good}
            stepsPerBeat={perBeatStep}
            beatsPerBar={perBar}
          />
        {:else}
          <StickingLane hits={hits} {beatMs} current={phase === "running" ? strokeNow : demo?.playing ? strokeNow : null} outcomes={rud?.perStroke} windowMs={Math.min(60, stepMs / 3)} />
        {/if}
        {#if !isGroove && hits.some((h) => h.grace)}<p class="text-xs text-ws-stage-soft">Flam: a grace note on the other pad just before each stroke. Only the main strokes are graded.</p>{/if}
        {#if !isGroove && phase === "ready"}<p class="text-xs text-ws-stage-soft">{pattern.onePad ? `One pad, both fingers: tap a pad to pick it (now ${padLabel(pads[1])}).` : `Tap a pad to set the ${assign} hand (left ${padLabel(pads[0])}, right ${padLabel(pads[1])}).`}</p>{/if}
      {/if}
      {#if !(notesShown && showLanes)}{@render padGrid()}{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary && stars !== null}
      <div class="stars mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ws-line bg-ws-surface px-4 py-3" aria-label="{stars} of 3 stars">
        <span class="stars-row" aria-hidden="true">{#each [0, 1, 2] as k (k)}<span class:lit={k < stars}>★</span>{/each}</span>
        <span class="text-sm">
          {stars === 3 ? "Three stars: passed." : stars === 2 ? "Two stars: pass the level's timing for the third." : stars === 1 ? "One star: most of it there." : "No stars yet: slow it down and try again."}
          {#if bestStreak >= 4}Best streak {bestStreak}.{/if}
          {#if (bestStars[starsId] ?? 0) > stars}<span class="text-ws-soft">Your best: {starText(bestStars[starsId])}.</span>{/if}
        </span>
      </div>
    {/if}
    {#if summary}
      <Results {summary} />
      {#if grv}
        <div class="grid gap-4 rounded-2xl border border-ws-line bg-ws-surface p-4 sm:grid-cols-2 sm:p-5">
          <div class="min-w-0 overflow-x-auto">
            <table class="w-full text-sm">
              <caption class="mb-2 text-left font-semibold">By voice</caption>
              <thead class="text-ws-soft"><tr><th class="py-1 text-left font-normal">Voice</th><th class="font-normal">Hit</th><th class="font-normal">Missed</th><th class="font-normal">Extra</th><th class="text-right font-normal">Timing</th></tr></thead>
              <tbody class="tnum">
                {#each grv.perVoice as v (v.voice)}
                  <tr class="border-t border-ws-line">
                    <td class="py-1.5">{voiceName(v.voice)} <span class="text-ws-soft">{padLabel(v.pad)}</span></td>
                    <td class="text-center">{v.matched}</td>
                    <td class="text-center {v.missed ? 'font-semibold text-destructive' : ''}">{v.missed}</td>
                    <td class="text-center {v.extra ? 'font-semibold text-destructive' : ''}">{v.extra}</td>
                    <td class="text-right">{v.matched ? `${Math.round(v.meanAbsErrorMs)} ms` : "none"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div class="min-w-0 overflow-x-auto">
            <table class="w-full text-sm">
              <caption class="mb-2 text-left font-semibold">By section</caption>
              <thead class="text-ws-soft"><tr><th class="py-1 text-left font-normal">Section</th><th class="font-normal">Hit</th><th class="font-normal">Missed</th><th class="text-right font-normal">Verdict</th></tr></thead>
              <tbody class="tnum">
                {#each grv.perSection as sec (sec.label)}
                  <tr class="border-t border-ws-line">
                    <td class="py-1.5 capitalize">{sec.label}</td>
                    <td class="text-center">{sec.matched}</td>
                    <td class="text-center">{sec.missed}</td>
                    <td class="text-right font-medium">{sectionWord(sec.label, grv)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="mpc" sound={{ value: s.sound, onchange: (v) => cfg.set({ sound: v }) }} /></div>
  {/snippet}
</DrillShell>
{/if}

<style>
  .stars-row {
    display: inline-flex;
    gap: 0.15rem;
    font-size: 2rem;
    line-height: 1;
    color: color-mix(in oklch, var(--ws-ink) 18%, transparent);
  }
  .stars-row .lit {
    color: var(--warn);
    text-shadow: 0 0 12px color-mix(in oklch, var(--warn) 50%, transparent);
  }
</style>

