<script lang="ts">
  // The pad skills beyond rudiments and grooves (docs/research/pads-aerophone-gaps.md):
  // dynamics on a velocity ladder, fills that land on the one, playing a groove
  // back by ear, an ostinato under a reading line, rudiments spread across the
  // kit, and improvising over a loop. The grooves go through the groove grader;
  // dynamics and improvising have their own measures (content/pad-skills).
  import { enough, timingBreakdown, timingRow, TOO_FEW } from "@repo/music-core";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { GROOVE_VOICES, grooveTargetsFor } from "@repo/music-core/content/winds-pads";
  import { gradeGroove, type GrooveResult } from "@repo/music-core/scoring/pads";
  import {
    DYNAMICS,
    DEFAULT_RANGE,
    DYNAMICS_EXERCISES,
    ECHO_LEVELS,
    ECHO_PASS,
    ORCHESTRATIONS,
    PAD_FILLS,
    INTERPRETATIONS,
    READING_LINES,
    echoGroove,
    fillGroove,
    fillReport,
    gradeDynamics,
    improviseReport,
    gradeImprovise,
    inRange,
    ladderBand,
    orchestrationGroove,
    ostinatoGroove,
    ostinatoReport,
    quantise,
    readingLines,
    velocityRange,
    type DynamicsId,
    type VelocityRange,
  } from "@repo/music-core/content/pad-skills";
  import { padStyleLabel, repertoireFor } from "@repo/music-core/content/pads-repertoire";
  import { sectionLabelText } from "@repo/music-core/content/pads-grid";
  import { CHOP_PADS, DYN_BANDS, NOTE_REPEAT_EXERCISES, SONG_FORMS, chopSource, gradeBuild, gradeWrittenSong, newWrittenSong, noteRepeatPiece, sectionDynamics, sectionPasses, setCheck, songFormPiece, writtenPiece, type Dyn, type WrittenSong } from "@repo/music-core/content/pads-studio";
  import type { GrooveDef } from "@repo/music-core/data/index";
  import { padImproviseLesson } from "@repo/music-core/lessons/tier1";
  import { PAD_PHRASES, padLessons, repeatRates } from "@repo/music-core/lessons/pads";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Pads from "#lib/music/components/Pads.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btn, btnStage } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, getSetting, input, putSetting, settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import GrooveGrid from "./GrooveGrid.svelte";
  import MidiStatus from "./MidiStatus.svelte";
  import { judgeHit, laneColor, orderLanes, overdue, type Judgement } from "./lanes";
  import PadHighway, { type HighwayLane, type HighwayNote } from "./PadHighway.svelte";
  import { backingFor } from "./backing";
  import { NoteRepeat } from "./note-repeat";
  import SongBuilder from "./SongBuilder.svelte";
  import { loadSlices, padSound, restoreKit } from "./slices";
  import { m } from "@repo/i18n/messages.js";
  import { formatList } from "@repo/i18n/format";

  /** A dynamic level's word ("soft", "rising"): the id is what the code compares, this is what reads. */
  const DYN_WORDS: Record<Dyn, () => string> = { soft: m.music_winds_dyn_soft, medium: m.music_winds_dyn_medium, loud: m.music_winds_dyn_loud, rising: m.music_winds_dyn_rising };
  const dynName = (d: string) => DYN_WORDS[d as Dyn]?.() ?? d;
  /** Facts about a section or a take, each a whole phrase, read as one line. */
  /** A section name at the start of a row: "Intro", "Groove 2". */
  const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const facts = (...parts: (string | false | null | undefined | 0)[]) => parts.filter(Boolean).join(", ");

  type SkillMode = "dynamics" | "fills" | "echo" | "ostinato" | "orchestrate" | "improvise" | "phrases" | "repeat" | "song";
  let { skill, modes, onmode }: { skill: SkillMode; modes: readonly (readonly [string, string])[]; onmode: (m: string) => void } = $props();

  const cfg = new DrillSetup("pad-skills", {
    fill: "snare-eighths" as string,
    orch: "hats-snare" as string,
    line: "quarters" as string,
    echo: "kick-snare" as string,
    dyn: "ladder" as string,
    bars: 4,
    // What Improvise plays over: the band's funk vamp, or a groove on the kit with the band in its style.
    loop: "funk" as string,
    // Improvise: a fill every this many bars (0: free), each to land on the next one.
    fillEvery: 0,
    phrase: "son-clave" as string,
    // Ostinato and a line: who reads a generated line (snare or kick).
    interp: "snare" as string,
    // Note repeat: the build or the roll bars. Song form: the piece.
    rep: "build" as string,
    form: "house-drop" as string,
    // The lanes (notes sliding onto a hit line, the pads beside) or the step grid; how many bars the lanes read ahead.
    view: "lanes" as string,
    ahead: 1,
  });
  const s = $derived(cfg.value);
  const lanesView = $derived(s.view !== "grid");
  const aheadBars = $derived([1, 2, 4].includes(s.ahead) ? s.ahead : 1);
  const padPhrase = $derived(PAD_PHRASES.find((r) => r.groove.value === s.phrase) ?? PAD_PHRASES[0]);
  const bpm = $derived(clamp(settings.value.bpm, 30, 240));
  const beatMs = $derived(60000 / bpm);
  const barMs = $derived(4 * beatMs);
  const voicePads = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));

  /** Ostinato "New lines to read": four bars, new after every run. */
  let readLines = $state(readingLines(Math.random));
  const interp = $derived(INTERPRETATIONS.find((x) => x.id === s.interp)?.id ?? "snare");
  const ostinatoDef = $derived(skill === "ostinato" ? ostinatoGroove(s.line, { interp, lines: readLines }) : null);
  const repeatDef = $derived(skill === "repeat" ? noteRepeatPiece(s.rep) : null);
  const songForm = $derived(SONG_FORMS.find((f) => f.id === s.form) ?? SONG_FORMS[0]);
  // Song form: the pieces you write ("own-<id>"), kept with the settings.
  const SONGS_KEY = "pads.written-songs";
  let written = $state.raw<WrittenSong[] | null>(null);
  void getSetting<WrittenSong[]>(SONGS_KEY, []).then((x) => (written = Array.isArray(x) ? x : []));
  const ownWanted = $derived(skill === "song" && s.form.startsWith("own-"));
  const ownSong = $derived(ownWanted ? (written?.find((w) => `own-${w.id}` === s.form) ?? null) : null);
  const ownPiece = $derived(ownSong ? writtenPiece(ownSong) : null);
  const ownSet = $derived(ownSong ? setCheck(ownSong, bpm) : null);
  const songDef = $derived(skill === "song" ? (ownPiece ?? songFormPiece(songForm)) : null);
  function saveSongs(next: WrittenSong[]) {
    written = next;
    void putSetting(SONGS_KEY, next);
  }
  function newPiece() {
    const song = newWrittenSong(Date.now().toString(36));
    saveSongs([...(written ?? []), song]);
    cfg.set({ form: `own-${song.id}` });
    settings.update({ bpm: song.bpm });
  }
  /** Reading is the point of a generated line, so it stays on screen in Check. */
  const readingShown = $derived(skill === "ostinato" && s.line === "read");
  // The groove-shaped skills share one path: targets, the grader, a grid.
  const grooveDef = $derived(
    skill === "phrases" ? padPhrase.groove : skill === "fills" ? fillGroove(s.fill) : skill === "orchestrate" ? orchestrationGroove(s.orch) : skill === "ostinato" ? ostinatoDef : skill === "echo" ? echoGroove(s.echo) : skill === "repeat" ? repeatDef : skill === "song" ? songDef : null,
  );
  const gt = $derived(grooveDef ? grooveTargetsFor(grooveDef as GrooveDef, bpm, CHOP_PADS) : null);

  // A written piece's chop: the loop's slices on A01 to A16, played by MIDI hits in the chop bars only.
  let slicesFor = $state("");
  let slicing = $state<string | null>(null);
  const wantSlices = $derived(ownPiece?.chop ? `${ownPiece.chop}@${bpm}` : "");
  $effect(() => {
    const key = wantSlices;
    const source = chopSource(key.split("@")[0]);
    if (!key || key === slicesFor || !source) return;
    const t = setTimeout(() => {
      slicing = m.music_winds_skills_cutting();
      loadSlices(source, bpm)
        .then(() => (slicesFor = key))
        .then(() => (slicing = null))
        .catch((e: Error) => (slicing = m.music_winds_skills_cut_error({ error: e.message })));
    }, 250);
    return () => clearTimeout(t);
  });
  const chopSpans = $derived(ownPiece?.spans.filter((x) => x.role === "chop") ?? []);
  padSound.slicesAt = (at) => (phase === "running" || phase === "countin") && chopSpans.some((x) => at >= downbeat + x.from * barMs - beatMs / 8 && at < downbeat + (x.from + x.bars) * barMs - beatMs / 8);
  $effect(() =>
    input.subscribe((e) => {
      if (e.kind === "noteon" && e.source !== "onscreen" && padSound.slicesAt?.(e.at)) audio.playKitPad(e.midi, e.velocity);
    }),
  );
  /** A target as a note to hear: a drum on the synth kit, a slice on the slices. */
  const hearTarget = (t: { voice: string; beat: number; accent: string }, lead = 0) =>
    t.voice.startsWith("slice-") ? { midi: CHOP_PADS[t.voice], time: lead + (t.beat * beatMs) / 1000, duration: 0.2, velocity: 0.9, voice: "kit" as const } : { midi: voicePads[t.voice], time: lead + (t.beat * beatMs) / 1000, duration: 0.12, velocity: t.accent === "accent" ? 1 : t.accent === "ghost" ? 0.35 : 0.75, voice: "drum" as const };
  /** Grid steps a beat: sixteenths, or triplets for the shuffle fills. */
  const gridPer = $derived(grooveDef?.stepsPerBeat ?? 4);
  const dyn = $derived(DYNAMICS_EXERCISES.find((d) => d.id === s.dyn) ?? DYNAMICS_EXERCISES[0]);
  const dynSlots = $derived(Array.from({ length: dyn.notes }, (_, i) => (i * beatMs) / dyn.perBeat));
  const improBars = $derived([4, 8, 16, 32].includes(s.bars) ? s.bars : 4);
  const fillEvery = $derived([4, 8].includes(s.fillEvery) && s.fillEvery <= improBars ? s.fillEvery : 0);
  const LOOPS = ["funk", "boom-bap-b", "basic-rock", "house", "funk-sixteenths", "blues-shuffle"];
  const loopEntry = $derived(s.loop === "funk" ? null : (repertoireFor(s.loop) ?? null));
  /** The loop under Improvise: the groove on the kit, repeated to fill the bars, and the band in its style. */
  function improBacking() {
    if (!loopEntry) return backingFor("Funk", Array.from({ length: improBars }, (_, b) => [{ beat: b * 4, voice: "kick" }, { beat: b * 4 + 2.5, voice: "kick" }]).flat(), improBars, beatMs);
    const g = loopEntry.groove;
    const targets = Array.from({ length: Math.ceil(improBars / g.bars) }, (_, c) => g.targets.map((t) => ({ ...t, beat: t.beat + c * g.bars * 4 })))
      .flat()
      .filter((t) => t.beat < improBars * 4);
    const kit = targets.map((t) => ({ midi: voicePads[t.voice], time: (t.beat * beatMs) / 1000, duration: 0.12, velocity: t.accent === "accent" ? 0.8 : t.accent === "ghost" ? 0.3 : 0.55, voice: "drum" as const }));
    return [...kit, ...backingFor(loopEntry.style, targets, improBars, beatMs)];
  }
  const loopName = (id: string) => (id === "funk" ? m.music_winds_skills_funk_vamp() : (repertoireFor(id)?.groove.label ?? id));
  const lengthMs = $derived(gt ? gt.lengthMs + (grooveDef!.targets.some((t) => t.beat >= grooveDef!.bars * 4) ? beatMs : 0) : skill === "dynamics" ? dyn.notes * (beatMs / dyn.perBeat) : improBars * barMs);

  /** Intro lessons: the mode's, then a card for each item the setup picked (a fill, a line, a repeat rate...). */
  const lessonRef = $derived.by(() => {
    if (skill === "improvise") return { lessons: [padImproviseLesson()] };
    const items = skill === "dynamics" ? [s.dyn] : skill === "phrases" ? [padPhrase.groove.value] : skill === "fills" ? [s.fill] : skill === "echo" ? [s.echo] : skill === "ostinato" ? [s.line] : skill === "orchestrate" ? [s.orch] : skill === "repeat" ? repeatRates(s.rep) : skill === "song" ? [s.form] : [];
    const lessons = padLessons(skill, undefined, items);
    return lessons.length ? { lessons } : null;
  });

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let grv = $state.raw<GrooveResult | null>(null);
  let ownGrade = $state.raw<ReturnType<typeof gradeWrittenSong> | null>(null);
  let levels = $state.raw<(number | null)[]>([]);
  let take = $state.raw<{ at: number; midi: number; velocity: number }[]>([]);
  let downbeat = $state(0);
  let now = $state(0);
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;
  let band: { stop(): void } | null = null;
  const flashes = new Flashes();
  /** Note repeat: the app repeats the held pad on the chart's rate (the MPC's own stays off in Controller Mode). */
  const repeater = new NoteRepeat({
    origin: () => (phase === "running" || phase === "countin" ? downbeat : null),
    beatMs: () => beatMs,
    rate: (at) => repeatDef?.rateAt((at - downbeat) / beatMs) ?? "1/16",
    pad: () => (repeatDef ? voicePads[repeatDef.repeatVoice] : null),
    onRepeat: (e) => {
      if (!cap) return;
      cap.notes.push(e);
      audio.drum(e.midi, e.velocity);
      onHit(e);
    },
  });
  const rateNow = $derived(repeatDef && phase === "running" && now >= downbeat ? repeatDef.rateAt((now - downbeat) / beatMs) : null);

  // Dynamics: the player's soft-to-loud range on this controller, set once.
  const RANGE_KEY = "pads.velocity-range";
  let range = $state<VelocityRange | null>(null);
  void getSetting<VelocityRange | null>(RANGE_KEY, null).then((r) => (range = r));
  let calibrating = $state<"soft" | "loud" | null>(null);
  let calSoft = $state<number[]>([]);
  let calLoud = $state<number[]>([]);
  let calStop: (() => void) | null = null;
  let demo = $state<{ stop(): void; playing: boolean } | null>(null);
  function calibrate() {
    calibrating = "soft";
    calSoft = [];
    calLoud = [];
    calStop?.();
    const c = capture(performance.now(), (e) => {
      if (e.kind !== "noteon") return;
      if (!e.velocityMeasured) {
        status = m.music_winds_skills_cal_needs_mpc();
        return;
      }
      if (calibrating === "soft") {
        calSoft.push(e.velocity);
        if (calSoft.length >= 4) calibrating = "loud";
      } else if (calibrating === "loud") {
        calLoud.push(e.velocity);
        if (calLoud.length >= 4) {
          calibrating = null;
          calStop?.();
          const r = velocityRange(calSoft, calLoud);
          if (r) {
            range = r;
            void putSetting(RANGE_KEY, r);
            status = m.music_winds_skills_cal_set({ soft: Math.round(r.soft * 127), loud: Math.round(r.loud * 127) });
          } else status = m.music_winds_skills_cal_too_close();
        }
      }
    });
    calStop = c.stop;
    status = m.music_winds_skills_cal_prompt();
  }

  const sixteenthNow = $derived(phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / (beatMs / gridPer)) : null);
  const inCallBar = $derived(skill === "echo" && phase === "running" && now >= downbeat ? Math.floor((now - downbeat) / barMs) % 2 === 0 : false);

  const usedVoices = $derived(gt ? GROOVE_VOICES.filter((v) => gt.targets.some((t) => t.voice === v.id)) : []);
  const names = $derived<Record<number, string>>(Object.fromEntries(usedVoices.map((v) => [v.midi, v.name])));
  const colors = $derived<Record<number, string>>(Object.fromEntries(usedVoices.map((v) => [v.midi, laneColor(v.id)])));
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (!gt || mode !== "practice" || phase !== "running" || skill === "echo" || sixteenthNow === null) return out;
    for (const t of gt.targets) if (Math.round(t.beat * gridPer) === sixteenthNow) out[t.pad] = { target: true };
    return out;
  });

  // The lanes: one per drum (or slice), the notes judged live as they pass.
  const lanes = $derived<HighwayLane[]>(
    gt ? orderLanes(gt.targets.map((t) => t.voice)).map((v) => ({ id: v, label: GROOVE_VOICES.find((x) => x.id === v)?.name ?? (v.startsWith("slice-") ? m.music_winds_grid_slice({ n: v.slice(6) }) : v), color: laneColor(v), pad: gt!.targets.find((t) => t.voice === v)!.pad })) : [],
  );
  const live = $derived<(HighwayNote & { pad: number })[]>(gt ? gt.targets.map((t) => ({ pad: t.pad, atMs: t.atMs, lane: lanes.findIndex((l) => l.id === t.voice), kind: t.accent ? "accent" : t.ghost ? "ghost" : "normal" })) : []);
  const judgeWindow = $derived({ perfect: (gt?.matchWindowMs ?? 60) / 2, good: gt?.matchWindowMs ?? 60 });
  let judged = $state<Record<number, Judgement>>({});
  let flashKey = 0;
  let flashNote = $state<{ judgement: Judgement | "extra"; ms?: number; key: number } | null>(null);
  const timing = new Flashes<"early" | "late" | "perfect">();
  /** The notes show in Practice and after a run (Play it back only after); a generated line stays to read in Check. */
  const notesShown = $derived(!!gt && !!grooveDef && (skill !== "echo" || phase === "results") && (mode === "practice" || phase === "results" || readingShown));
  /** The lanes before and while it plays; the results read on the grid, each note marked. */
  const showLanes = $derived(lanesView && phase !== "results");
  function sweepMisses() {
    if (phase !== "running" || !gt || skill === "echo") return;
    const missed = overdue(live, judged, performance.now() - downbeat, judgeWindow.good);
    if (!missed.length) return;
    judged = { ...judged, ...Object.fromEntries(missed.map((i) => [i, "miss" as const])) };
    flashNote = { judgement: "miss", key: ++flashKey };
  }

  const orch = $derived(ORCHESTRATIONS.find((o) => o.id === s.orch) ?? ORCHESTRATIONS[0]);
  const summaryLine = $derived<SetupClause[]>([
    ...(skill === "phrases"
      ? [{ text: `${padPhrase.groove.label} (${padStyleLabel(padPhrase.style)})`, focus: "phrase" }]
      : skill === "fills"
        ? [{ text: m.music_winds_skills_sum_fill({ fill: PAD_FILLS.find((f) => f.id === s.fill)?.label ?? "" }), focus: "fill" }, { text: PAD_FILLS.find((f) => f.id === s.fill)?.groove ? m.music_winds_skills_sum_after_shuffle() : m.music_winds_skills_sum_after_rock() }]
        : skill === "orchestrate"
          ? [{ text: m.music_winds_skills_sum_paradiddle({ orch: orch.label.toLowerCase() }), focus: "orch" }]
          : skill === "ostinato"
            ? s.line === "clave"
              ? [{ text: m.music_winds_skills_sum_clave_rim() }, { text: m.music_winds_skills_sum_kick_moves(), focus: "line" }]
              : s.line === "read"
                ? [{ text: m.music_winds_skills_sum_hats_eighths() }, { text: interp === "kick" ? m.music_winds_skills_sum_kick_reads() : m.music_winds_skills_sum_snare_reads(), focus: "line" }]
                : [{ text: m.music_winds_skills_sum_hats_eighths() }, { text: m.music_winds_skills_sum_snare_line({ line: READING_LINES.find((r) => r.id === s.line)?.label ?? "" }), focus: "line" }]
            : skill === "repeat"
              ? [{ text: m.music_winds_skills_sum_repeat({ exercise: NOTE_REPEAT_EXERCISES.find((x) => x.id === s.rep)?.label ?? "" }), focus: "rep" }]
              : skill === "song"
                ? [{ text: ownSong?.label ?? songForm.label, focus: "form" }, { text: (ownSet?.ok ? m.music_winds_skills_sum_one_take_set : m.music_winds_skills_sum_one_take)({ bars: songDef?.bars ?? 0 }) }]
            : skill === "echo"
              ? [{ text: m.music_winds_skills_sum_echo({ level: ECHO_LEVELS.find((l) => l.id === s.echo)?.label ?? "" }), focus: "echo" }, { text: m.music_winds_skills_sum_four_rounds() }]
              : skill === "dynamics"
                ? [{ text: dyn.label, focus: "dyn" }]
                : [{ text: m.music_winds_skills_sum_improvise({ bars: improBars }), focus: "bars" }, { text: loopEntry ? m.music_winds_skills_sum_of_loop({ loop: loopEntry.groove.label }) : m.music_winds_skills_sum_of_band(), focus: "loop" }, ...(fillEvery ? [{ text: m.music_winds_skills_sum_fill_every({ bars: fillEvery }), focus: "fillEvery" }] : [])]),
    { text: `${bpm} BPM` },
  ]);

  function hearCalls(fromPerf: number) {
    if (skill !== "echo" || !grooveDef || !("calls" in grooveDef)) return null;
    const lead = Math.max(0, (fromPerf - performance.now()) / 1000);
    return audio.playSequence(
      (grooveDef as ReturnType<typeof echoGroove>).calls.map((t) => ({ midi: voicePads[t.voice], time: lead + (t.beat * beatMs) / 1000, duration: 0.12, velocity: t.accent === "accent" ? 1 : t.accent === "ghost" ? 0.35 : 0.75, voice: "drum" as const })),
    );
  }

  function stopDemo() {
    demo?.stop();
    demo = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes = gt
      ? [...(skill === "echo" ? (grooveDef as ReturnType<typeof echoGroove>).calls : grooveDef!.targets), ...(ownPiece?.under ?? [])].map((t) => hearTarget(t))
      : skill === "dynamics"
        ? dynSlots.map((at, i) => ({ midi: 38, time: at / 1000, duration: 0.1, velocity: s.dyn === "ladder" ? 0.2 + ladderBand(i)[0] * 0.8 : s.dyn === "crescendo" ? 0.15 + (i / 15) * 0.85 : 0.6, voice: "drum" as const }))
        : improBacking();
    const handle = audio.playSequence(notes);
    demo = handle;
    status = skill === "echo" ? m.music_winds_skills_demo_calls() : m.music_winds_skills_demo_playing();
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onHit(e: NoteEvent) {
    if (e.kind !== "noteon" || (phase !== "running" && phase !== "countin")) return;
    if (!gt) return;
    const at = e.at - downbeat;
    const near = gt.targets.some((t) => t.pad === e.midi && Math.abs(t.atMs - at) <= gt.matchWindowMs);
    if (mode !== "practice") return;
    flashes.add(e.midi, near ? "correct" : "wrong", 250);
    if (skill === "echo") return;
    const hit = judgeHit(live, judged, e.midi, at, judgeWindow);
    if (!hit) {
      flashNote = { judgement: "extra", key: ++flashKey };
      return;
    }
    judged = { ...judged, [hit.index]: hit.judgement };
    timing.add(e.midi, hit.judgement as "early" | "late" | "perfect", 450);
    flashNote = { judgement: hit.judgement, ms: hit.err, key: ++flashKey };
  }

  let readUsed = false;
  function start(ctx: RunContext) {
    stopDemo();
    // A generated line is read once: the next run brings four new bars.
    if (readingShown && readUsed) readLines = readingLines(Math.random);
    readUsed = readingShown;
    summary = null;
    grv = null;
    ownGrade = null;
    levels = [];
    take = [];
    flashes.clear();
    timing.clear();
    judged = {};
    flashNote = null;
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: `technique.mpc.${skill}`,
      setupKey: `pad-skills:${skill}:${grooveDef?.value ?? s.dyn}:${bpm}`,
      skillIds: ["technique.mpc", `technique.mpc.${skill === "orchestrate" ? "orchestration" : skill === "ostinato" ? "independence" : skill}`],
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: skill === "dynamics" ? 0.45 : skill === "echo" ? 0.5 : skill === "improvise" ? 0.4 : 0.55,
      instrument: "mpc",
      params: {
        skill,
        bpm,
        setup: grooveDef?.value ?? (skill === "improvise" ? s.loop : s.dyn),
        ...(skill === "improvise" ? { bars: improBars, fillEvery: fillEvery } : {}),
        ...(skill === "ostinato" ? { line: s.line, ...(s.line === "clave" ? {} : { interp }) } : {}),
        ...(skill === "repeat" ? { exercise: s.rep } : {}),
        ...(skill === "song" && ownPiece && ownSet ? { form: "own", sections: ownPiece.spans.length, minutes: Math.round(ownSet.minutes * 10) / 10, ...(ownSet.ok ? { set: true } : {}) } : skill === "song" ? { form: songForm.id } : {}),
      },
    });
    repeater.stop();
    cap = capture(ctx.downbeat - beatMs / 2, (e) => {
      if (skill === "repeat") repeater.handle(e);
      if (e.kind === "noteon") onHit(e as NoteEvent);
    });
    if (skill === "echo") band = hearCalls(ctx.downbeat);
    if (skill === "improvise") {
      const lead = Math.max(0, (ctx.downbeat - performance.now()) / 1000);
      band = audio.playSequence(improBacking().map((n) => ({ ...n, time: n.time + lead })));
      status = loopEntry ? m.music_winds_skills_go_improvise_loop() : m.music_winds_skills_go_improvise_band();
    } else if (skill === "dynamics") status = s.dyn === "ladder" ? m.music_winds_skills_go_ladder() : s.dyn === "crescendo" ? m.music_winds_skills_go_crescendo() : m.music_winds_skills_go_even();
    else if (skill === "echo") status = m.music_winds_skills_go_echo();
    else if (skill === "repeat") status = m.music_winds_skills_go_repeat();
    if (ownPiece?.under.length) {
      const lead = Math.max(0, (ctx.downbeat - performance.now()) / 1000);
      band = audio.playSequence(ownPiece.under.map((t) => hearTarget(t, lead)));
    }
    const tick = () => {
      now = performance.now();
      if (mode === "practice") sweepMisses();
      if (phase === "running" || phase === "countin") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + lengthMs + beatMs / 2 + 150);
  }

  /** The calibrated range when there is one; else most of the MPC's velocity (Full Level off). */
  function dynWord(d: { dyn: Dyn; level: number | null; ok: boolean | null }) {
    if (d.ok === null) return m.music_winds_skills_dyn_nothing({ dyn: dynName(d.dyn) });
    if (d.ok) return m.music_winds_skills_dyn_right({ dyn: dynName(d.dyn) });
    if (d.dyn === "rising") return m.music_winds_skills_dyn_no_climb();
    return (d.level! > DYN_BANDS[d.dyn][1] ? m.music_winds_skills_dyn_too_loud : m.music_winds_skills_dyn_too_soft)({ dyn: dynName(d.dyn) });
  }
  const ms = (x: number | null | undefined) => (x === null || x === undefined ? m.music_winds_skills_none() : m.music_winds_stick_ms({ value: `${x > 0 ? "+" : ""}${Math.round(x)}` }));
  /** A drift in BPM, signed: "+1.5". */
  const signed = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}`;
  /** "3 of 4, 1 extra": the notes a section matched, and any extras. */
  const matchedOf = (x: { matched: number; missed: number; extra: number }) => facts(m.music_winds_chop_of({ n: x.matched, total: x.matched + x.missed }), x.extra && m.music_winds_skills_extra({ count: x.extra }));

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    band?.stop();
    band = null;
    cap?.stop();
    repeater.stop();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    phase = "results";
    let score = 0;
    let correct = false;
    let headline = "";
    let rows: RunSummary["rows"] = [];
    /** A run whose measure needs velocity the input did not carry is not recorded. */
    let unmeasured = false;

    if (ownPiece) {
      const measured = ons.length > 1 && ons.every((h) => h.velocityMeasured) && new Set(ons.map((h) => Math.round(h.velocity * 127))).size > 1;
      const g = gradeWrittenSong(ownPiece, notes, downbeat, beatMs, measured ? (range ?? DEFAULT_RANGE) : null);
      ownGrade = g;
      score = g.score;
      correct = g.correct;
      rows = g.sections.map((x) => ({
        label: capital(sectionLabelText(x.label)),
        value: x.solo ? x.solo.score : x.matched / Math.max(1, x.matched + x.missed),
        text: facts(
          x.solo
            ? x.solo.meanAbsMs === null
              ? m.music_winds_skills_nothing_played()
              : facts(m.music_winds_skills_solo_grid({ ms: Math.round(x.solo.meanAbsMs) }), m.music_winds_skills_solo_kept({ pct: pct(x.solo.density) }), x.solo.driftBpm !== null && Math.abs(x.solo.driftBpm) >= 2 && m.music_winds_skills_drifted({ value: signed(x.solo.driftBpm) }))
            : matchedOf(x),
          x.dyn && dynWord(x.dyn),
          x.pass && m.music_winds_skills_passed(),
        ),
      }));
      if (!measured) rows.push({ label: m.music_winds_skills_dyn_unmeasured(), notMeasured: true });
      if (ownSet) rows.push({ label: m.music_winds_skills_the_set(), text: ownSet.ok ? m.music_winds_skills_set_shape({ minutes: Math.round(ownSet.minutes * 10) / 10 }) : m.music_winds_skills_set_needs({ missing: formatList(ownSet.missing) }) });
      headline = correct ? (measured ? m.music_winds_skills_all_sections_level() : m.music_winds_skills_all_sections()) : m.music_winds_skills_sections_passed({ passed: g.passed, total: g.sections.length, sections: formatList(g.sections.filter((x) => !x.pass).map((x) => sectionLabelText(x.label))) });
    } else if (gt && grooveDef) {
      // Play it back: only the answer bars are scored, so playing along with a call costs nothing.
      const hits = skill === "echo" ? ons.filter((h) => Math.floor((h.at - downbeat + gt.matchWindowMs) / barMs) % 2 === 1) : ons;
      const r = gradeGroove({ targets: grooveDef.targets, voicePads, sectionLabels: grooveDef.sectionLabels, beatsPerBar: 4, beatMs, startAt: downbeat, hits });
      if ("error" in r) {
        status = r.error;
        phase = "ready";
        return;
      }
      grv = r;
      score = r.score;
      correct = r.correct;
      const total = grooveDef.targets.length;
      const landedErrs = r.perTarget.filter((e): e is number => e !== null);
      rows = [
        { label: m.music_winds_skills_notes_matched(), value: r.accuracy, text: m.music_winds_skills_matched_extra({ n: r.matched, total, extra: r.extra }) },
        // 180 ms is where the groove grader's timing credit reaches zero; too few landed reads Not measured (K3).
        timingRow(landedErrs, total, 180),
      ];
      if (skill === "fills") {
        const fg = grooveDef as ReturnType<typeof fillGroove>;
        const f = fillReport(fg, r.perTarget);
        correct = r.correct && f.landed && !f.rushed;
        // The fill and the landing speak only from enough of their own notes.
        const fillOk = enough(fg.fill.filter((i) => r.perTarget[i] !== null).length, fg.fill.length);
        const landOk = enough(fg.landing.filter((i) => r.perTarget[i] !== null).length, fg.landing.length);
        rows.push(
          fillOk ? { label: m.music_winds_skills_the_fill(), text: (f.rushed ? m.music_winds_skills_fill_avg_rushed : m.music_winds_skills_fill_avg)({ ms: ms(f.fillMeanMs) }) } : { label: m.music_winds_skills_the_fill(), notMeasured: true, text: f.fillMeanMs === null ? m.music_winds_skills_not_played() : TOO_FEW },
          landOk ? { label: m.music_winds_skills_landing(), text: f.landed ? m.music_winds_skills_landed({ ms: ms(f.landingMs) }) : ms(f.landingMs) } : { label: m.music_winds_skills_landing(), notMeasured: true, text: m.music_winds_missed() },
        );
        // Misses first: under 70% landed, timing advice would be read off a few notes.
        headline =
          r.matched < 0.7 * total
            ? m.music_winds_skills_fill_head_missed({ missed: total - r.matched, total })
            : !landOk
              ? m.music_winds_skills_fill_head_no_land()
              : f.rushed && fillOk
                ? m.music_winds_skills_fill_head_rushed({ ms: ms(f.fillMeanMs) })
                : f.landed
                  ? m.music_winds_skills_fill_head_landed({ ms: ms(f.landingMs) })
                  : m.music_winds_skills_fill_head_off({ ms: ms(f.landingMs) });
      } else if (skill === "ostinato") {
        const voice = ostinatoDef!.ostinato;
        const o = ostinatoReport(grooveDef as GrooveDef, r.perTarget, voice);
        const clave = voice === "rim";
        correct = r.correct && o.held;
        rows.push({ label: clave ? m.music_winds_skills_clave_alone() : m.music_winds_skills_hats_alone(), value: o.alone, text: pct(o.alone) }, { label: clave ? m.music_winds_skills_clave_under() : m.music_winds_skills_hats_under(), value: o.together, text: pct(o.together) }, { label: m.music_winds_skills_the_line(), value: o.line, text: pct(o.line) });
        const said = { together: pct(o.together), alone: pct(o.alone) };
        headline = o.held ? (clave ? m.music_winds_skills_clave_held : m.music_winds_skills_hats_held)(said) : (clave ? m.music_winds_skills_clave_slipped : m.music_winds_skills_hats_slipped)(said);
      } else if (skill === "repeat" && repeatDef) {
        const secs = r.perSection.map((x) => ({ ...x, pass: sectionPasses(x, null) }));
        if (s.rep === "build") {
          const mine = ons.filter((h) => h.midi === voicePads[repeatDef.repeatVoice] && h.at < downbeat + 16 * beatMs);
          const measured = mine.length > 1 && mine.every((h) => h.velocityMeasured);
          const b = measured ? gradeBuild(mine, downbeat, beatMs, 16, range ?? DEFAULT_RANGE) : null;
          unmeasured = !b;
          score = b ? r.accuracy * 0.5 + b.score * 0.5 : r.accuracy;
          correct = secs.every((x) => x.pass) && !!b?.rising;
          rows.push(b ? { label: m.music_winds_skills_rising_all(), value: Math.max(0, b.rho), text: m.music_winds_skills_rho_text({ rho: b.rho.toFixed(2), pct: pct(b.span) }) } : { label: m.music_winds_skills_rising_unmeasured(), notMeasured: true });
          headline = !b ? m.music_winds_skills_build_needs_velocity() : correct ? m.music_winds_skills_build_ok() : !b.rising ? m.music_winds_skills_build_climb() : m.music_winds_skills_build_hold({ sections: formatList(secs.filter((x) => !x.pass).map((x) => sectionLabelText(x.label))) });
        } else {
          score = r.score;
          correct = secs.every((x) => x.pass);
          rows = [...rows, ...secs.map((x) => ({ label: m.music_winds_grid_bar_section({ n: secs.indexOf(x) + 1, section: sectionLabelText(x.label) }), value: x.matched / Math.max(1, x.matched + x.missed), text: matchedOf(x) }))];
          headline = correct ? m.music_winds_skills_rolls_ok() : m.music_winds_skills_rolls_tighten({ count: secs.filter((x) => !x.pass).length });
        }
        if (repeater.aftertouch) rows.push({ label: m.music_winds_skills_aftertouch(), text: m.music_winds_skills_aftertouch_text() });
      } else if (skill === "song" && songDef) {
        const measured = ons.length > 1 && ons.every((h) => h.velocityMeasured) && new Set(ons.map((h) => Math.round(h.velocity * 127))).size > 1;
        const dyn = measured ? sectionDynamics(songDef, ons, downbeat, beatMs, range ?? DEFAULT_RANGE) : null;
        const secs = r.perSection.map((x) => {
          const d = dyn?.find((y) => y.label === x.label) ?? null;
          return { ...x, d, pass: sectionPasses(x, d?.ok ?? null) };
        });
        const passed = secs.filter((x) => x.pass).length;
        score = passed / secs.length;
        correct = passed === secs.length;
        rows = secs.map((x) => ({
          label: capital(sectionLabelText(x.label)),
          value: x.matched / Math.max(1, x.matched + x.missed),
          text: facts(matchedOf(x), x.d && dynWord(x.d), x.pass && m.music_winds_skills_passed()),
        }));
        if (!dyn) rows.push({ label: m.music_winds_skills_dyn_unmeasured(), notMeasured: true });
        headline = correct ? (dyn ? m.music_winds_skills_all_sections_level() : m.music_winds_skills_all_sections()) : m.music_winds_skills_sections_passed({ passed, total: secs.length, sections: formatList(secs.filter((x) => !x.pass).map((x) => sectionLabelText(x.label))) });
      } else if (skill === "echo") {
        const rounds = [0, 1, 2, 3].map((k) => {
          const idx = grooveDef.targets.flatMap((t, i) => (Math.floor(t.beat / 8) === k ? [i] : []));
          return idx.filter((i) => r.perTarget[i] !== null).length / Math.max(1, idx.length);
        });
        const passed = rounds.filter((x) => x >= ECHO_PASS).length;
        correct = passed === 4 && r.extra === 0;
        rows = [...rows, ...rounds.map((x, k) => ({ label: m.music_winds_skills_round({ n: k + 1 }), value: x, text: x >= ECHO_PASS ? m.music_winds_skills_played_back({ pct: pct(x) }) : pct(x) }))];
        headline = r.extra ? m.music_winds_skills_echo_head_extra({ passed, extra: r.extra }) : m.music_winds_skills_echo_head({ passed });
      } else headline = r.correct ? m.music_winds_skills_clean({ n: r.matched, total: grooveDef.targets.length, ms: Math.round(r.meanAbsErrorMs) }) : m.music_winds_skills_notes_extra({ n: r.matched, total: grooveDef.targets.length, extra: r.extra });
    } else if (skill === "dynamics") {
      const measured = ons.length > 0 && ons.every((n) => n.velocityMeasured);
      if (!measured || !range) {
        headline = !range ? m.music_winds_skills_range_first() : !ons.length ? m.music_winds_chop_head_no_hits() : m.music_winds_skills_dyn_need_velocity();
        rows = [{ label: m.music_winds_skills_velocity(), notMeasured: true }];
      } else {
        const slotMs = beatMs / dyn.perBeat;
        levels = dynSlots.map((at) => {
          const h = ons.find((n) => Math.abs(n.at - downbeat - at) <= slotMs / 2);
          return h ? inRange(h.velocity, range!) : null;
        });
        const g = gradeDynamics(dyn.id as DynamicsId, levels);
        score = g.score;
        correct = g.correct;
        rows =
          dyn.id === "ladder"
            ? [{ label: m.music_winds_skills_hits_in_level(), value: g.inBand ?? 0, text: pct(g.inBand ?? 0) }]
            : dyn.id === "crescendo"
              ? [{ label: m.music_winds_skills_always_growing(), value: Math.max(0, g.rho ?? 0), text: (g.rho ?? 0).toFixed(2) }, { label: m.music_winds_skills_range_covered(), value: Math.min(1, g.span ?? 0), text: pct(g.span ?? 0) }]
              : [{ label: m.music_winds_skills_spread(), text: m.music_winds_skills_spread_text({ pct: pct(g.spread ?? 0), aim: pct(DYNAMICS.evenSpread) }) }];
        headline = g.correct ? m.music_winds_skills_dyn_ok() : dyn.id === "ladder" ? m.music_winds_skills_dyn_ladder_head({ pct: pct(g.inBand ?? 0) }) : dyn.id === "crescendo" ? m.music_winds_skills_dyn_crescendo_head() : m.music_winds_skills_dyn_even_head({ pct: pct(g.spread ?? 0) });
      }
    } else {
      take = ons.map((n) => ({ at: n.at, midi: n.midi, velocity: n.velocity }));
      const rep = improviseReport(take, downbeat, beatMs);
      const g = gradeImprovise(take, downbeat, beatMs, improBars, { stepsPerBeat: loopEntry?.groove.stepsPerBeat ?? 4, fillEvery });
      score = g.score;
      correct = g.correct;
      rows = [
        { label: m.music_winds_chop_row_time(), value: g.time, text: g.meanAbsMs === null ? m.music_winds_chop_no_hits() : facts(m.music_winds_skills_grid_avg({ ms: Math.round(g.meanAbsMs) }), g.driftBpm !== null && (Math.abs(g.driftBpm) < 0.5 ? m.music_winds_skills_no_drift() : m.music_winds_skills_drifted({ value: signed(g.driftBpm) }))) },
        { label: m.music_winds_skills_bars_kept(), value: g.density, text: pct(g.density) },
        ...(g.fills ? [{ label: m.music_winds_skills_fills_landed(), value: g.fills.landed / Math.max(1, g.fills.expected), text: m.music_winds_chop_of({ n: g.fills.landed, total: g.fills.expected }) }] : []),
        { label: m.music_winds_skills_different_fills(), text: String(g.distinctFills) },
        { label: m.music_winds_chop_row_hits(), text: String(rep.hits) },
        { label: m.music_winds_skills_distance(), text: rep.timingSpreadMs === null ? m.music_winds_skills_too_few_hits() : m.music_winds_skills_ms_spread({ ms: Math.round(rep.timingSpreadMs) }) },
        { label: m.music_winds_skills_swing(), text: rep.swing === null ? m.music_winds_skills_few_offbeats() : m.music_winds_skills_swing_text({ swing: rep.swing }) },
        { label: m.music_winds_skills_loudness(), text: rep.velocity ? m.music_winds_skills_from_to({ from: Math.round(rep.velocity[0] * 127), to: Math.round(rep.velocity[1] * 127) }) : m.music_winds_skills_none() },
        { label: m.music_winds_skills_pads_used(), text: `${rep.pads.length}` },
      ];
      headline = !rep.hits
        ? m.music_winds_chop_head_nothing()
        : g.correct
          ? m.music_winds_skills_impro_ok({ hits: rep.hits, pads: rep.pads.length })
          : g.driftBpm !== null && Math.abs(g.driftBpm) >= 2
            ? m.music_winds_skills_impro_drift({ value: signed(g.driftBpm) })
            : g.fills && g.fills.landed < g.fills.expected
              ? m.music_winds_skills_impro_fills({ landed: g.fills.landed, expected: g.fills.expected })
              : g.density < 1
                ? m.music_winds_skills_impro_quiet({ count: Math.round((1 - g.density) * improBars) })
                : m.music_winds_chop_head_grid_off({ ms: Math.round(g.meanAbsMs ?? 0) });
    }
    // Nothing played: the standard not-heard card, no score or bars from zero hits.
    if (!ons.length) {
      grv = null;
      ownGrade = null;
      summary = silentRun();
      status = summary.headline;
      return;
    }
    // Dynamics the app could not measure are not a fail, so they are not recorded.
    if (!graded(ons.length) || unmeasured) {
      summary = { headline, metric: m.music_winds_not_measured(), metricLabel: m.music_winds_not_scored(), assistance: m.music_winds_nothing_to_measure(), rows, recorded: false };
      status = headline;
      return;
    }
    await run!.attempt({ promptId: `${skill}:${grooveDef?.value ?? (skill === "improvise" ? s.loop : s.dyn)}`, correct, partialCredit: score, metrics: grv?.metrics ?? ownGrade?.metrics ?? [], source: runSource(notes), instrument: "mpc" });
    const fin = await run!.finish({ score, correct, headline });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    summary = { headline, metric: pct(score), metricLabel: m.music_winds_score(), delta: fin.delta, best: fin.best, clean: correct && mode === "check", xp: fin.xp, mode, rows, timing: grv && gt ? timingBreakdown(grv.perTarget, gt.matchWindowMs / 2) : undefined, advance: skill === "improvise" || ownPiece ? undefined : await advanceAfter(score, correct) };
    status = headline;
  }

  /** Dynamics count only with velocity measured. */
  const graded = (hits: number) => hits > 0 && (skill !== "dynamics" || levels.length > 0);
  /** Each skill climbs the tempo to 120, then moves through its own list. */
  function advanceAfter(score: number, correct: boolean) {
    if (skill === "phrases")
      return nextRun("pads.phrases", { bpm, tempo: { min: 40, goal: padPhrase.bpm.target }, steps: PAD_PHRASES.map((r) => ({ label: r.groove.label, goal: r.bpm.target, start: r.bpm.start })), step: PAD_PHRASES.indexOf(padPhrase) }, { score, correct }, tempoAnd((i) => cfg.set({ phrase: PAD_PHRASES[i].groove.value })));
    const [list, key] = ({ fills: [PAD_FILLS, "fill"], orchestrate: [ORCHESTRATIONS, "orch"], ostinato: [READING_LINES, "line"], echo: [ECHO_LEVELS, "echo"], dynamics: [DYNAMICS_EXERCISES, "dyn"], repeat: [NOTE_REPEAT_EXERCISES, "rep"], song: [SONG_FORMS, "form"] } as const)[skill as Exclude<SkillMode, "improvise" | "phrases">];
    const xs = list as readonly { id: string; label: string }[];
    const step = Math.max(0, xs.findIndex((x) => x.id === s[key]));
    return nextRun(`pads.${skill}`, { bpm, tempo: { min: 40, goal: 120 }, steps: xs.map((x) => ({ label: x.label })), step }, { score, correct }, tempoAnd((i) => cfg.set({ [key]: xs[i].id })));
  }

  function hearTake(amount: number) {
    if (!take.length) return;
    const q = amount ? quantise(take, downbeat, beatMs, amount) : take;
    audio.playSequence(q.map((h) => ({ midi: h.midi, time: (h.at - downbeat) / 1000 + 0.05, duration: 0.12, velocity: h.velocity, voice: "drum" as const })));
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    band?.stop();
    band = null;
    cap?.stop();
    repeater.stop();
    phase = "ready";
    status = m.music_winds_nothing_saved();
  }

  onDestroy(() => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    band?.stop();
    cap?.stop();
    repeater.stop();
    calStop?.();
    stopDemo();
    padSound.slicesAt = null;
    if (slicesFor) restoreKit();
  });
</script>

{#snippet padGrid()}
  <div data-dock="answers">
    <Pads marks={marks} {flashes} {timing} {names} {colors} label={m.music_winds_skills_pads_label()} />
  </div>
{/snippet}

<DrillShell
  title={skill === "phrases" ? m.music_winds_skills_title_phrases() : m.music_winds_pads_title()}
  hue="mpc"
  blurb={skill === "phrases" ? m.music_winds_skills_blurb_phrases() : skill === "dynamics" ? m.music_winds_skills_blurb_dynamics() : skill === "fills" ? m.music_winds_skills_blurb_fills() : skill === "echo" ? m.music_winds_skills_blurb_echo() : skill === "ostinato" ? m.music_winds_skills_blurb_ostinato() : skill === "repeat" ? m.music_winds_skills_blurb_repeat() : skill === "song" ? m.music_winds_skills_blurb_song() : skill === "orchestrate" ? m.music_winds_skills_blurb_orchestrate() : m.music_winds_skills_blurb_improvise()}
  summary={summaryLine}
  tabs={modes.map(([id, label]) => ({ id, label }))}
  tab={skill}
  ontab={onmode}
  bind:phase
  bind:mode
  bind:status
  progress={phase === "running" && now >= downbeat ? clamp((now - downbeat) / lengthMs, 0, 1) : 0}
  clock={{ bpm, beatsPerBar: 4 }}
  lesson={lessonRef}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  blocked={skill === "dynamics" && !range ? m.music_winds_skills_blocked_range() : ownWanted && !ownSong ? (written ? m.music_winds_skills_blocked_missing() : m.music_winds_skills_loading_pieces()) : ownPiece?.chop && slicesFor !== wantSlices ? (slicing ?? m.music_winds_skills_cutting()) : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if skill === "phrases"}
        <Choice label={m.music_winds_skills_phrase()} select options={PAD_PHRASES.map((r) => ({ value: r.groove.value, label: `${r.groove.label} (${padStyleLabel(r.style)})`, group: m.music_winds_song_level_group({ level: r.level }) }))} value={padPhrase.groove.value} setupKey="phrase" onchange={(v) => {
          cfg.set({ phrase: v });
          const r = PAD_PHRASES.find((x) => x.groove.value === v);
          if (r) settings.update({ bpm: r.bpm.start });
        }} />
      {:else if skill === "fills"}
        <Choice label={m.music_winds_skills_fill()} options={PAD_FILLS.map((f) => ({ value: f.id, label: f.label }))} value={s.fill} onchange={(v) => cfg.set({ fill: v })} setupKey="fill" />
      {:else if skill === "orchestrate"}
        <Choice label={m.music_winds_skills_orchestration()} options={ORCHESTRATIONS.map((o) => ({ value: o.id as string, label: o.label, detail: o.detail }))} value={s.orch} onchange={(v) => cfg.set({ orch: v })} setupKey="orch" />
      {:else if skill === "ostinato"}
        <Choice label={m.music_winds_skills_reading_line()} options={READING_LINES.map((r) => ({ value: r.id as string, label: r.label }))} value={s.line} onchange={(v) => cfg.set({ line: v })} setupKey="line" />
        {#if s.line === "read"}
          <Choice label={m.music_winds_skills_who_reads()} options={INTERPRETATIONS.map((x) => ({ value: x.id as string, label: x.label }))} value={interp} onchange={(v) => cfg.set({ interp: v })} setupKey="interp" />
        {/if}
      {:else if skill === "repeat"}
        <Choice label={m.music_winds_exercise()} options={NOTE_REPEAT_EXERCISES.map((x) => ({ value: x.id as string, label: x.label, detail: x.detail }))} value={s.rep} onchange={(v) => cfg.set({ rep: v })} setupKey="rep" />
      {:else if skill === "song"}
        <Choice label={m.music_winds_skills_piece()} options={[...SONG_FORMS.map((f) => ({ value: f.id, label: f.label, detail: m.music_winds_skills_form_detail({ level: f.level, sections: f.sections.map((x) => `${sectionLabelText(x.label)} ${x.bars}`).join(", "), start: f.bpm.start, target: f.bpm.target }) })), ...(written ?? []).map((w) => ({ value: `own-${w.id}`, label: w.label, detail: m.music_winds_skills_own_detail({ count: w.sections.length, bpm: w.bpm }) }))]} value={ownSong ? s.form : songForm.id} setupKey="form" onchange={(v) => {
          cfg.set({ form: v });
          const start = SONG_FORMS.find((x) => x.id === v)?.bpm.start ?? written?.find((w) => `own-${w.id}` === v)?.bpm;
          if (start) settings.update({ bpm: start });
        }} />
        <div class="flex items-end"><button type="button" class={btn} onclick={newPiece}>{m.music_winds_skills_write_new()}</button></div>
        {#if ownSong}
          <SongBuilder song={ownSong} {bpm} onchange={(next) => saveSongs(written!.map((w) => (w.id === next.id ? next : w)))} ondelete={() => {
            saveSongs(written!.filter((w) => w.id !== ownSong.id));
            cfg.set({ form: SONG_FORMS[0].id });
          }} />
        {/if}
      {:else if skill === "echo"}
        <Choice label={m.music_winds_level()} options={ECHO_LEVELS.map((l) => ({ value: l.id as string, label: l.label }))} value={s.echo} onchange={(v) => cfg.set({ echo: v })} setupKey="echo" />
      {:else if skill === "dynamics"}
        <Choice label={m.music_winds_exercise()} options={DYNAMICS_EXERCISES.map((d) => ({ value: d.id as string, label: d.label }))} value={s.dyn} onchange={(v) => cfg.set({ dyn: v })} setupKey="dyn" />
      {:else}
        <Choice label={m.music_winds_bars()} options={[4, 8, 16, 32].map((n) => ({ value: n, label: String(n) }))} value={improBars} onchange={(v) => cfg.set({ bars: v })} setupKey="bars" />
        <Choice label={m.music_winds_chop_loop()} options={LOOPS.map((id) => ({ value: id, label: loopName(id) }))} value={loopEntry ? s.loop : "funk"} onchange={(v) => cfg.set({ loop: v })} setupKey="loop" />
        <Choice label={m.music_winds_skills_fill_every()} options={[{ value: 0, label: m.music_winds_skills_no_set_fills() }, { value: 4, label: m.music_winds_bars_count({ count: 4 }) }, { value: 8, label: m.music_winds_bars_count({ count: 8 }) }]} value={fillEvery} onchange={(v) => cfg.set({ fillEvery: v })} setupKey="fillEvery" />
      {/if}
      {#if gt && skill !== "echo"}
        <Choice label={m.music_winds_view()} options={[{ value: "lanes", label: m.music_winds_view_lanes() }, { value: "grid", label: m.music_winds_view_grid() }]} value={lanesView ? "lanes" : "grid"} onchange={(v) => cfg.set({ view: v })} setupKey="view" />
        {#if lanesView}
          <Choice label={m.music_winds_look_ahead()} options={[1, 2, 4].map((n) => ({ value: n, label: m.music_winds_bars_count({ count: n }) }))} value={aheadBars} onchange={(v) => cfg.set({ ahead: v })} setupKey="ahead" />
        {/if}
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && skill === "echo"}
      <Stat label={m.music_winds_chop_now()} value={inCallBar ? m.music_winds_skills_listen() : m.music_winds_skills_your_turn()} tone={inCallBar ? undefined : "success"} />
    {:else if phase === "running" && rateNow}
      {#if sixteenthNow !== null}<Stat label={m.music_winds_bar()} value={m.music_winds_chop_of({ n: Math.min(Math.floor(sixteenthNow / (gridPer * 4)) + 1, Math.ceil(lengthMs / barMs)), total: Math.ceil(lengthMs / barMs) })} />{/if}
      <Stat label={m.music_winds_skills_rate()} value={rateNow} />
    {:else if phase === "running" && skill === "song" && sixteenthNow !== null && songDef}
      {@const b = Math.min(Math.floor(sixteenthNow / (gridPer * 4)), songDef.bars - 1)}
      <Stat label={m.music_winds_skills_section()} value={m.music_winds_skills_section_dyn({ section: sectionLabelText(songDef.sectionLabels[b]), dyn: dynName(songDef.dyn[b]) })} />
    {:else if phase === "running" && sixteenthNow !== null}
      <Stat label={m.music_winds_bar()} value={m.music_winds_chop_of({ n: Math.min(Math.floor(sixteenthNow / (gridPer * 4)) + 1, Math.ceil(lengthMs / barMs)), total: Math.ceil(lengthMs / barMs) })} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-4" data-testid="pad-skills" data-view={notesShown && showLanes ? "lanes" : "grid"} data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-targets={gt ? JSON.stringify(gt.targets.map((t) => [t.pad, Math.round(t.atMs), t.accent ? "a" : t.ghost ? "g" : "n"])) : undefined}>
      {#if skill === "phrases"}
        <p class="text-sm"><span class="font-semibold">{padPhrase.groove.label}.</span> <span class="text-ws-stage-soft">{padPhrase.feel} {padPhrase.fingers}</span></p>
      {/if}
      {#if skill === "repeat" && repeatDef}
        <p class="text-sm"><span class="font-semibold">{m.music_winds_skills_hold_to_repeat({ voice: GROOVE_VOICES.find((v) => v.id === repeatDef.repeatVoice)?.name.toLowerCase() ?? "" })}</span> <span class="text-ws-stage-soft">{NOTE_REPEAT_EXERCISES.find((x) => x.id === s.rep)?.detail}. {m.music_winds_skills_rate_follows()} {repeater.aftertouch ? m.music_winds_skills_aftertouch_yes() : m.music_winds_skills_aftertouch_maybe()}</span></p>
      {/if}
      {#if skill === "song" && ownSong && ownPiece}
        <p class="text-sm"><span class="font-semibold">{ownSong.label}.</span> <span class="text-ws-stage-soft">{ownPiece.spans.map((x, i) => m.music_winds_skills_section_item({ label: sectionLabelText(x.label), count: x.bars, dyn: dynName(ownSong.sections[i].dyn) })).join(", ")}. {m.music_winds_skills_own_song_help()} {range ? m.music_winds_skills_levels_range() : m.music_winds_skills_levels_default()}</span></p>
      {:else if skill === "song" && songDef}
        <p class="text-sm"><span class="font-semibold">{songForm.label}.</span> <span class="text-ws-stage-soft">{songForm.sections.map((x) => m.music_winds_skills_section_item({ label: sectionLabelText(x.label), count: x.bars, dyn: dynName(x.dyn) })).join(", ")}. {range ? m.music_winds_skills_levels_range() : m.music_winds_skills_levels_default()}</span></p>
      {/if}
      {#if readingShown}
        <p class="text-sm text-ws-stage-soft">{interp === "kick" ? m.music_winds_skills_read_kick() : m.music_winds_skills_read_snare()}</p>
      {/if}
      {#if skill === "orchestrate"}
        <p class="text-sm"><span class="font-semibold">{m.music_winds_skills_paradiddle_title({ orch: orch.label.toLowerCase() })}</span> <span class="text-ws-stage-soft">{orch.detail}. {m.music_winds_skills_paradiddle_help()}</span></p>
      {/if}
      {#if notesShown && showLanes}
        <PadHighway
          {lanes}
          notes={live}
          now={phase === "running" || phase === "countin" ? now - downbeat : -beatMs}
          {beatMs}
          stepsPerBeat={gridPer}
          {aheadBars}
          {lengthMs}
          {judged}
          flash={mode === "practice" ? flashNote : null}
          countIn={phase === "countin" ? Math.max(1, Math.ceil((downbeat - now) / beatMs)) : null}
          label={m.music_winds_skills_highway_label({ lanes: lanes.map((l) => l.label).join(", ") })}
          pads={padGrid}
        />
      {:else if notesShown && gt && grooveDef}
        <GrooveGrid targets={gt.targets} bars={grooveDef.bars} sectionLabels={grooveDef.sectionLabels} playhead={sixteenthNow} outcomes={grv?.perTarget ?? ownGrade?.perTarget} windowMs={gt.matchWindowMs / 2} stepsPerBeat={gridPer} />
      {:else if skill === "echo"}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm" aria-live="polite">{phase === "running" ? (inCallBar ? m.music_winds_skills_echo_listen() : m.music_winds_skills_echo_turn()) : m.music_winds_skills_echo_help()}</p>
      {:else if skill === "dynamics"}
        <div class="rounded-xl bg-ws-stage-ink/8 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>{range ? m.music_winds_skills_your_range({ soft: Math.round(range.soft * 127), loud: Math.round(range.loud * 127) }) : m.music_winds_skills_no_range()} {calibrating ? (calibrating === "soft" ? m.music_winds_skills_now_softest({ n: calSoft.length }) : m.music_winds_skills_now_loudest({ n: calLoud.length })) : ""}</p>
            <button type="button" class={btnStage} onclick={calibrate} disabled={phase === "running"}>{range ? m.music_winds_skills_recalibrate() : m.music_winds_skills_calibrate()}</button>
          </div>
          <svg viewBox="0 0 320 100" class="mt-3 h-28 w-full" preserveAspectRatio="none" role="img" aria-label={levels.length ? m.music_winds_skills_levels_aria() : m.music_winds_skills_levels_aria_after()}>
            {#each dynSlots as _, i (i)}
              {@const w = 320 / dyn.notes}
              {@const band = dyn.id === "ladder" ? ladderBand(i) : dyn.id === "crescendo" ? [Math.max(0, i / (dyn.notes - 1) - 0.1), Math.min(1, i / (dyn.notes - 1) + 0.1)] : [0.4, 0.6]}
              <rect x={i * w + 1} y={100 - band[1] * 100} width={w - 2} height={(band[1] - band[0]) * 100} class="band" />
              {#if levels[i] !== undefined && levels[i] !== null}
                <rect x={i * w + w * 0.25} y={100 - levels[i]! * 100} width={w * 0.5} height={levels[i]! * 100} class="lvl" />
              {/if}
            {/each}
          </svg>
          <p class="mt-1 text-sm text-ws-stage-soft">{m.music_winds_skills_shaded()}</p>
        </div>
      {:else}
        <p class="rounded-xl bg-ws-stage-ink/8 p-4 text-sm">
          {loopEntry ? m.music_winds_skills_play_over_loop({ loop: loopEntry.groove.label, bars: improBars }) : m.music_winds_skills_play_over_vamp({ bars: improBars })}{fillEvery ? ` ${m.music_winds_skills_fill_every_nth({ n: fillEvery })}` : ""}
          <span class="mt-1 block text-ws-stage-soft">{m.music_winds_skills_scored_on()}{phase === "results" ? ` ${m.music_winds_skills_hear_back_help()}` : ""}</span>
        </p>
      {/if}
      {#if !(notesShown && showLanes)}{@render padGrid()}{/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if skill === "improvise" && take.length}
            <button type="button" class={btn} onclick={() => hearTake(0)}>{m.music_winds_skills_hear_take()}</button>
            <button type="button" class={btn} onclick={() => hearTake(0.5)}>{m.music_winds_skills_hear_nudged()}</button>
          {/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="mpc" /></div>
  {/snippet}
</DrillShell>

<style>
  .band {
    fill: color-mix(in oklch, var(--instr) 22%, transparent);
  }
  .lvl {
    fill: var(--instr);
  }
</style>
