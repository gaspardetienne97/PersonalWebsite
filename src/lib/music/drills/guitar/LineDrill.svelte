<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  // Spider, Positions, Legato and Fingerpicking: a fretted line played after the
  // count-in, graded pitch x 0.85 + evenness x 0.15 (scoring rules 7).
  // Input: on-screen frets (which also carry the string), MIDI, or the microphone.
  // Before a run, Spider and Legato take their string and start fret from a tap on the neck.
  import { onDestroy } from "svelte";
  import { conceptCard, positionsCard } from "@repo/music-core/lessons/cards";
  import type { NoteEvent } from "@repo/music-core";
  import { evennessRow, noteName, pc } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import {
    positionPatternsFor,
    positionRootFretMax,
    positionRootFretMin,
    harmonicMidi,
    harmonicTargets,
    isTremolo,
    positionTargets,
    SPIDER_PATTERNS,
    spiderStrings,
    GUITAR_GRADE_TEMPOS,
    FINGERPICK_PATTERNS,
    FINGERPICK_SONGS,
    LEGATO_PATTERNS,
    legatoTargets,
    legatoText,
    fingerpickable,
    fingerpickTargets,
    spiderMaxStartFret,
    spiderTargets,
    type FretTarget,
  } from "@repo/music-core/content/technique";
  import { gradeLine, legatoAttacks, type LineResult } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Fretboard, { type FretMark } from "#lib/music/components/Fretboard.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import NoteHighway, { highway, viewSwitch, type HighwayNote } from "#lib/music/notation/NoteHighway.svelte";
  import type { Hit } from "#lib/music/notation/highway.ts";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { btn, btnStage } from "#lib/music/components/ui.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, tuningText, type Capture } from "#lib/music/drill.svelte.ts";
  import { nearMiss } from "@repo/music-core/signal/pitch";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, mic, settings } from "#lib/music/runtime/index.ts";
  import { exerciseFor, skillsFor, withSlips, type Outcome } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import MicPanel from "./MicPanel.svelte";
  import Verdict from "#lib/music/components/Verdict.svelte";
  import { strokeVerdict, timingCounts } from "./strum-slots";
  import ChordCycleSetup from "./ChordCycleSetup.svelte";
  import ChordStrip from "./ChordStrip.svelte";
  import { CHORD_MODES, FRETBOARD_MODES, openMode } from "./modes";
  import { chordId, chordLabel, cyclePositions, cycleRefs, positionsOn, shapesFor, symbolRef, type ChordRef } from "./chords";
  import { formatList } from "@repo/i18n/format";

  let { kind }: { kind: "spider" | "positions" | "fingerpick" | "legato" | "harmonics" } = $props();
  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");

  // svelte-ignore state_referenced_locally
  const isSpider = kind === "spider";
  // svelte-ignore state_referenced_locally
  const isPick = kind === "fingerpick";
  // svelte-ignore state_referenced_locally
  const isLegato = kind === "legato";
  // svelte-ignore state_referenced_locally
  const isHarm = kind === "harmonics";
  const cfg = new DrillSetup(isPick ? "chords-fingerpick" : `fretboard-${kind}`, {
    pattern: isPick ? "travis" : isLegato ? "hammer-pull" : isSpider ? "ascending-1234" : "minor-pentatonic-box-1",
    shape: "guitar.c-major",
    to: "guitar.a-minor",
    string: isLegato ? 3 : 6,
    span: "single",
    /** Fingerpicking: the chords as shape ids and each one's chosen position ("" is an older setup's shape and to). */
    chords: "" as string,
    positions: "" as string,
    /** Spider: any strings, comma separated ("" falls back to string and span). */
    strings: "" as string,
    startFret: 5,
    crossing: false as boolean,
    /** Spider: speed bursts, each cell then a rest as long. */
    burst: false as boolean,
    rootFret: 5,
    perBeat: isPick || isLegato ? 2 : 1,
    /** An exam click to aim for, Spider and Positions only ("" for none). */
    grade: "" as string,
  });
  const s = $derived(cfg.value);
  const entry = isPick ? catalogEntry("chords")!.modes.find((m) => m.id === "fingerpick")! : catalogEntry("fretboard")!.modes.find((m) => m.id === kind)!;

  const instr = $derived(fretted());
  // Every mode follows the strip's tuning; Positions moves its shapes onto it from the pitches.
  const tuning = $derived(tuningFor(instr));
  // Fingerpicking: the instrument's patterns over two to eight chords, each at its chosen position, else the first that sounds every string the pattern uses.
  const pickPattern = $derived(FINGERPICK_PATTERNS.find((p) => p.id === s.pattern && p.instrument === instr) ?? FINGERPICK_PATTERNS.find((p) => p.instrument === instr)!);
  // Start from a song: its pattern, chords, tempo and notes a click in one tap.
  const songs = $derived(FINGERPICK_SONGS.filter((x) => x.instrument === instr));
  const songRefs = (x: (typeof FINGERPICK_SONGS)[number]) => x.chords.flatMap((c) => symbolRef(c) ?? []);
  /** A song's chords as the cycle will hold them (a repeated chord in a row is one). */
  const songIds = (x: (typeof FINGERPICK_SONGS)[number]) =>
    cycleRefs(instr, songRefs(x).map((r) => chordId(instr, r)).join(","))
      .map((r) => chordId(instr, r))
      .join(",");
  /** The song the setup matches now, if any (changing a chord or the pattern leaves it). */
  const song = $derived(isPick ? songs.find((x) => x.pattern === pickPattern.id && songIds(x) === pickRefs.map((r) => chordId(instr, r)).join(",")) : undefined);
  function useSong(id: string) {
    const x = songs.find((y) => y.id === id);
    if (!x) return;
    savePick(songRefs(x), []);
    cfg.set({ pattern: x.pattern, perBeat: x.perBeat });
    settings.update({ bpm: x.bpm });
  }
  /** The instrument's patterns by kind, each kind a row of buttons in the setup. */
  const pickGroups = $derived.by(() => {
    const kind = (p: (typeof FINGERPICK_PATTERNS)[number]) =>
      isTremolo(p) ? m.music_strings_line_group_tremolo() : p.strings.length === 6 ? m.music_strings_line_group_triple() : p.strings.some((x) => x === "-" || x.includes("+")) ? m.music_strings_line_group_pinches() : p.id.startsWith("travis") ? m.music_strings_line_group_travis() : instr === "ukulele" ? m.music_strings_line_group_thumb() : m.music_strings_line_group_arpeggios();
    const groups = new Map<string, (typeof FINGERPICK_PATTERNS)[number][]>();
    for (const p of FINGERPICK_PATTERNS.filter((x) => x.instrument === instr)) groups.set(kind(p), [...(groups.get(kind(p)) ?? []), p]);
    return [...groups];
  });
  /** A six-step pattern is a bar of three: 3/4 at two notes a click, 6/8 at three. */
  const triple = $derived(isPick && pickPattern.strings.length === 6);
  const C: ChordRef = { root: 0, quality: "maj" };
  // A link naming a pair (shape and to) and no chord list opens on that pair.
  const pairLink = $derived(page.url.searchParams.has("to") && !page.url.searchParams.has("chords"));
  const pickRefs = $derived(isPick ? cycleRefs(instr, s.chords && !pairLink ? s.chords : `${s.shape},${s.to}`, undefined, s.positions) : [C, C]);
  const pickChosen = $derived(cyclePositions(s.positions, pickRefs.length));
  const pickShapes = $derived(
    pickRefs.map((r, i) => {
      const ps = positionsOn(chordId(instr, r), tuning);
      const at = pickChosen[i];
      return (at !== null ? ps[Math.min(at, ps.length - 1)] : undefined) ?? ps.find((p) => fingerpickable(pickPattern, p)) ?? ps[0] ?? shapesFor(instr)[0];
    }),
  );
  const pickNames = $derived(pickRefs.map(chordLabel));
  const pickKey = $derived(pickShapes.map((x) => x.id).join(">"));
  function savePick(list: ChordRef[], positions: (number | null)[]) {
    if (pairLink) {
      const url = new URL(page.url.href);
      url.searchParams.delete("shape");
      url.searchParams.delete("to");
      goto(url, { shallow: true, replace: true, state: page.state });
    }
    cfg.set({ chords: list.map((r) => chordId(instr, r)).join(","), positions: positions.map((p) => p ?? "").join(",") });
  }
  const legatoPattern = $derived(LEGATO_PATTERNS.find((p) => p.id === s.pattern) ?? LEGATO_PATTERNS[0]);
  const bpm = () => Math.min(200, Math.max(40, settings.value.bpm));
  // Fingerpicking patterns are eighths; the others also take triplets (3) and sextuplets (6).
  const PER_STEPS = $derived(isHarm ? [1] : isPick ? (triple ? [1, 2, 3] : [1, 2, 4]) : [1, 2, 3, 4, 6]);
  const perBeat = $derived(PER_STEPS.includes(s.perBeat) ? s.perBeat : 1);
  /** Three or six to a click is compound time: the tab is written in 12/8 (6/8 for a six-step pattern), a click to each dotted quarter. */
  const compound = $derived(perBeat % 3 === 0);
  const quartersPerClick = $derived(compound ? 1.5 : 1);
  const tabMeter = $derived<[number, number] | undefined>(triple ? (compound ? [6, 8] : [3, 4]) : compound ? [12, 8] : undefined);
  /** Clicks in a bar: 3 for 3/4, 2 for 6/8, else 4. */
  const clickBar = $derived(triple ? (compound ? 2 : 3) : 4);
  /** One note's time: the click divided by the notes to a click. */
  const stepMs = () => 60000 / bpm() / perBeat;
  const target = $derived(isSpider || kind === "positions" ? GUITAR_GRADE_TEMPOS.find((g) => g.id === s.grade) : undefined);
  const PER_NAME: Record<number, string> = { 1: m.music_strings_per_name_1(), 2: m.music_strings_per_name_2(), 3: m.music_strings_per_name_3(), 4: m.music_strings_per_name_4(), 6: m.music_strings_per_name_6() };
  const PER: Record<number, string> = { 1: m.music_strings_per_1(), 2: m.music_strings_per_2(), 3: m.music_strings_per_3(), 4: m.music_strings_per_4(), 6: m.music_strings_per_6() };

  const spiderPattern = $derived(SPIDER_PATTERNS.find((p) => p.id === s.pattern) ?? SPIDER_PATTERNS[0]);
  const shapes = $derived(positionPatternsFor(instr));
  const box = $derived(shapes.find((p) => p.id === s.pattern) ?? shapes[0]);
  // Check-mode cards: spider technique, and the card for the Positions shape the setup is on (placed on the strip's tuning).
  const card = $derived(isSpider ? "tips.spider" : kind === "positions" ? positionsCard(box) : null);
  /** The open note of the string the root fret is on (6 on guitar, 1 on ukulele). */
  const rootOpen = $derived(tuning.openStrings[(box.rootString ?? 6) - 1]);
  const stringCount = $derived(tuning.openStrings.length);
  const startFret = $derived(Math.min(s.startFret, spiderMaxStartFret(tuning)));
  /** The lowest root fret that keeps every note on the neck (drop D pushes a root at the nut up an octave). */
  const rootMin = $derived(positionRootFretMin(box, tuning));
  const above = (f: number) => (f < rootMin ? f + 12 * Math.ceil((rootMin - f) / 12) : f);
  const rootFret = $derived(Math.min(above(s.rootFret), positionRootFretMax(box, tuning)));
  const string = $derived(Math.min(s.string, stringCount));
  const pickedStrings = $derived([...new Set(s.strings.split(",").map(Number))].filter((n) => n >= 1 && n <= stringCount));
  /** The spider's strings, bass first; an older setup's string and span until strings are picked. */
  // A link with a span and no strings (an older link) still opens on that span.
  const spanLink = $derived(page.url.searchParams.has("span") && !page.url.searchParams.has("strings"));
  const spiderSet = $derived(pickedStrings.length && !spanLink ? pickedStrings.sort((a, b) => b - a) : spiderStrings(string, s.span as never, stringCount));
  /** Crossing needs two strings or more. */
  const crossing = $derived(s.crossing && (isSpider ? spiderSet.length > 1 : s.span !== "single"));
  const burst = $derived(isSpider && s.burst);
  function toggleString(n: number) {
    const next = spiderSet.includes(n) ? spiderSet.filter((x) => x !== n) : [...spiderSet, n];
    if (!next.length) return;
    if (spanLink) {
      const url = new URL(page.url.href);
      url.searchParams.delete("span");
      url.searchParams.delete("string");
      goto(url, { shallow: true, replace: true, state: page.state });
    }
    cfg.set({ strings: next.sort((a, b) => a - b).join(",") });
  }
  /** The highest start fret that keeps the legato pattern on the neck. */
  const legatoMax = $derived(tuning.fretCount - Math.max(...legatoPattern.steps.map((x) => x[0])));
  const legatoStart = $derived(Math.max(1, Math.min(s.startFret, legatoMax)));
  /** The lowest root fret on the root string for a note, so the whole shape fits. */
  const rootFretFor = (note: number) => above((note - pc(rootOpen) + 12) % 12);
  const rootMax = $derived(positionRootFretMax(box, tuning));

  const steps = $derived.by((): FretTarget[] => {
    if (isPick) return fingerpickTargets({ pattern: pickPattern, shapes: pickShapes, tuning, rounds: 2 });
    if (isLegato) return legatoTargets({ patternId: legatoPattern.id, tuning, string, startFret: legatoStart, repeats: 4 });
    if (isHarm) return harmonicTargets(tuning);
    if (isSpider) return spiderTargets({ patternId: spiderPattern.id, tuning, string, span: s.span as never, strings: spiderSet, startFret, crossing });
    return positionTargets({ patternId: box.id, tuning, rootFret });
  });
  const key = $derived(
    isPick
      ? `fingerpick:${pickPattern.id}:${pickKey}:${bpm()}x${perBeat}`
      : isLegato
      ? `legato:${legatoPattern.id}:${tuning.id}:s${string}:f${legatoStart}:${bpm()}x${perBeat}`
      : isHarm
      ? `harmonics:${tuning.id}:${bpm()}`
      : isSpider
      ? `spider:${spiderPattern.id}:${tuning.id}:s${spiderSet.join("")}:f${startFret}:${crossing ? "x" : "-"}:${bpm()}${perBeat > 1 ? `x${perBeat}` : ""}${burst ? ":burst" : ""}`
      : `positions:${instr === "ukulele" || tuning.id !== "guitar.standard" ? `${tuning.id}:` : ""}${box.id}:r${rootFret}:${bpm()}${perBeat > 1 ? `x${perBeat}` : ""}`,
  );
  const frets = $derived(steps.map((t) => t.fret));
  /** Spider and Legato before a run: a wide neck to tap the start on. */
  const picking = $derived((isSpider || isLegato) && (phase === "ready" || phase === "results"));
  const from = $derived(picking || Math.min(...frets) <= 1 ? 0 : Math.min(...frets) - 1);
  const to = $derived(Math.min(tuning.fretCount, Math.max(picking ? 12 : from + 4, Math.max(...frets) + 1)));
  function pickStart(st: number, f: number) {
    if (isSpider) cfg.set({ startFret: Math.min(f, spiderMaxStartFret(tuning)) });
    else cfg.set({ string: st, startFret: Math.max(1, Math.min(f, legatoMax)) });
  }


  let status = $state("");
  let stepIndex = $state(0);
  let viewW = $state(1280);
  let demoStep = $state<number | null>(null);
  // The tab: the line as it will be played, a cursor that runs with the click
  // (or the demo), so the next notes can be read ahead.
  let runDownbeat = $state(0);
  let now = $state(0);
  let raf = 0;
  // Each note's time step: fingerpicking pinches share one, and its holds leave one empty.
  // Speed bursts: each spider cell, then a rest as long before the next.
  const slotOf = $derived(steps.map((t, i) => t.slot ?? (burst ? i + Math.floor(i / spiderPattern.fretOffsets.length) * spiderPattern.fretOffsets.length : i)));
  const slotCount = $derived(isPick ? 2 * pickShapes.length * pickPattern.strings.length : Math.max(0, ...slotOf) + 1);
  /** The tab's groups are the steps that sound, in order. */
  const groupOf = $derived.by(() => {
    const sounding = [...new Set(slotOf)];
    return slotOf.map((sl) => sounding.indexOf(sl));
  });
  // A harmonic is written at its fret, so the tab takes the fretted pitch there.
  const tabNotes = $derived(steps.map((t, i) => ({ midi: isHarm ? tuning.openStrings[t.string - 1] + t.fret : t.midi, startBeat: (slotOf[i] * quartersPerClick) / perBeat, durationBeats: quartersPerClick / perBeat, string: t.string, fret: t.fret })));
  const tabCursor = $derived(
    demoStep !== null ? (slotOf[demoStep] / perBeat) * quartersPerClick : phase === "running" && now >= runDownbeat ? Math.min(slotCount / perBeat, (now - runDownbeat) / (60000 / bpm())) * quartersPerClick : null,
  );
  /** After a run: each note as the grader heard it, so the marked tab shows the counts' own marks. */
  let doneStates = $state<Record<number, GroupState>>({});
  const tabStates = $derived.by(() => {
    if (phase === "results") return doneStates;
    const out: Record<number, GroupState> = {};
    if (phase !== "running") return out;
    for (let i = 0; i < Math.min(stepIndex, steps.length); i++) out[groupOf[i]] = "correct";
    if (stepIndex < steps.length) out[groupOf[stepIndex]] = "active";
    return out;
  });
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  /** The highway: each note's offset from its time when played, and the demo's start on the audio clock. */
  let hits = $state<Record<number, Hit>>({});
  let demoAt = $state<number | null>(null);
  const clickMs = () => 60000 / bpm();
  const hwBeat = $derived(
    demoAt !== null ? ((now - demoAt) / clickMs()) * quartersPerClick : phase === "running" || phase === "countin" ? ((now - runDownbeat) / clickMs()) * quartersPerClick : null,
  );
  // The fret on the pill, the finger in its colour; picking letters and legato marks ride on it.
  const hwNotes = $derived(
    steps.map((t, i): HighwayNote => ({ startBeat: tabNotes[i].startBeat, durationBeats: tabNotes[i].durationBeats, string: t.string, fret: t.fret, finger: t.finger || undefined, tag: isPick || isLegato || isHarm ? t.label : undefined })),
  );
  /** Fingerpicking: each chord's name over its bar. */
  const hwLabels = $derived(
    isPick ? Array.from({ length: 2 * pickShapes.length }, (_, k) => ({ beat: (k * pickPattern.strings.length * quartersPerClick) / perBeat, text: pickNames[k % pickShapes.length] })) : [],
  );
  let summary = $state<RunSummary | null>(null);
  let result = $state<LineResult | null>(null);
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let stopClockRef: (() => void) | null = null;
  /** When each step was first played (legato: to look for a pick attack at it). */
  let hitAt: (number | undefined)[] = [];
  /** The first wrong note heard while each step was due. */
  let firstWrong: (number | undefined)[] = [];

  /** A stretch shows which way the finger reaches: ←1 back toward the nut, 4→ up the neck. */
  const finger = (t: FretTarget) => t.label ?? (t.finger ? (t.stretch === "back" ? `←${t.finger}` : t.stretch === "up" ? `${t.finger}→` : String(t.finger)) : undefined);
  /** Spider: each fret's place in the pattern (the same on every string), so 1-4-3-2 reads 1 4 3 2 across the neck. */
  const spiderLen = $derived(spiderPattern.fretOffsets.length);
  const order = (i: number) => (isSpider ? String((i % spiderLen) + 1) : undefined);
  // The number is the order (spider) or the finger; the colour is always the fretting finger.
  const mark = (t: FretTarget, i: number, demo = false): FretMark => ({
    string: t.string,
    fret: t.fret,
    label: order(i) ?? finger(t),
    spoken: order(i) ? m.music_strings_line_spoken_order({ n: order(i)! }) : t.stretch ? (t.stretch === "back" ? m.music_strings_line_spoken_back() : m.music_strings_line_spoken_up()) : undefined,
    // The colour is always the fretting finger; a letter (picking hand, or P h p) rides on it.
    finger: t.finger || undefined,
    demo,
  });
  const marks = $derived.by((): FretMark[] => {
    if (demoStep !== null && steps[demoStep]) return steps.flatMap((t, i) => (slotOf[i] === slotOf[demoStep!] ? [mark(t, i, true)] : []));
    if (mode !== "practice" || phase === "results") return [];
    if (phase === "running" || phase === "countin") {
      // Every note of the step (a pinch is two or more).
      return steps.flatMap((t, i) => (slotOf[i] === slotOf[stepIndex] && i >= stepIndex ? [mark(t, i)] : []));
    }
    // Fingerpicking shows the first chord only; the second follows in the run.
    const shown = isPick ? fingerpickTargets({ pattern: pickPattern, shapes: [pickShapes[0]], tuning, rounds: 1 }) : steps;
    const seen = new Set<number>();
    return shown.flatMap((t, i) => (seen.has(t.string * 100 + t.fret) ? [] : (seen.add(t.string * 100 + t.fret), [mark(t, i)])));
  });
  /** The spider's key: the pattern's fingers in playing order. */
  const FINGERS = [m.music_strings_finger_open(), m.music_strings_finger_index(), m.music_strings_finger_middle(), m.music_strings_finger_ring(), m.music_strings_finger_pinky()];
  /** A step in words: "bass", "string 3", "bass + 2" for a pinch, "hold". */
  const PICK_STRING = (st: string) => {
    if (st === "-") return m.music_strings_pick_hold();
    const parts = st.split("+").map((x) => (x === "B" ? m.music_strings_pick_bass() : x === "A" ? m.music_strings_pick_alt_bass() : x));
    return parts.length === 1 && /^\d$/.test(parts[0]) ? m.music_strings_string_lower({ n: parts[0] }) : parts.join(" + ");
  };
  /** The order row above the neck: the spider's fingers, or the picking pattern's steps. */
  const orderKey = $derived(
    isSpider
      ? steps.slice(0, spiderLen).map((t, i) => ({ mark: String(i + 1), text: FINGERS[t.finger ?? 0], finger: t.finger ?? 0 }))
      : isPick
        ? pickPattern.fingers.map((f, i) => ({ mark: f === "-" ? "" : f.replaceAll("+", ""), text: PICK_STRING(pickPattern.strings[i]), finger: 0 }))
        : [],
  );
  /** The note sounding now (run or demo) and its step. */
  const nowSlot = $derived.by(() => {
    const at = demoStep ?? (phase === "running" ? stepIndex : null);
    return at === null || at >= steps.length ? null : slotOf[at];
  });
  /** Fingerpicking: the chord sounding now, a pattern's bar each. */
  const pickNow = $derived(isPick && nowSlot !== null ? Math.floor(nowSlot / pickPattern.strings.length) % pickShapes.length : null);
  /** The pattern step sounding now. */
  const orderNow = $derived(nowSlot === null || !orderKey.length ? null : nowSlot % orderKey.length);

  /** One pass of a fingerpicking pattern in bars. */
  const pickBars = $derived(pickPattern.strings.length / perBeat / clickBar);
  const stringsText = (set: number[]) => {
    const up = [...set].sort((a, b) => a - b);
    return up.length === 1 ? m.music_strings_string_lower({ n: up[0] }) : m.music_strings_strings_list({ list: formatList(up.map(String)) });
  };
  const BARS: Record<number, string> = { 0.5: m.music_strings_bars_half(), 1: m.music_strings_bars_one(), 2: m.music_strings_bars_two() };
  const per = $derived({ text: PER[perBeat], focus: "per" });
  const summaryLine = $derived(
    isPick
      ? [...(song ? [{ text: `${song.song} (${song.artist})`, focus: "song" }] : []), { text: pickPattern.label, focus: "pattern" }, { text: pickNames.reduce((a, b) => m.music_strings_then_plain({ a, b })), focus: "chords" }, { text: BARS[pickBars] ?? m.music_strings_bars_n({ n: pickBars }) }, per]
      : isHarm
        ? [{ text: m.music_strings_harm_summary() }, { text: m.music_strings_harm_every_string({ tuning: tuning.name }) }]
      : isLegato
        ? [{ text: `${legatoPattern.label}, ${legatoText(legatoPattern, legatoStart)}`, focus: "pattern" }, { text: m.music_strings_legato_on_string({ string, fret: legatoStart }) }, per]
        : isSpider
          ? [
              { text: spiderPattern.label, focus: "pattern" },
              { text: stringsText(spiderSet), focus: "strings" },
              { text: startFret === 0 ? m.music_strings_spider_from_open() : m.music_strings_spider_from_fret({ fret: startFret }) },
              ...(crossing ? [{ text: m.music_strings_spider_crossing(), focus: "crossing" }] : []),
              ...(burst ? [{ text: m.music_strings_spider_in_bursts(), focus: "burst" }] : []),
              ...(perBeat > 1 ? [per] : []),
              ...(target ? [{ text: m.music_strings_aiming_for({ target: target.label }), focus: "grade" }] : []),
            ]
          : [
              { text: box.label, focus: "pattern" },
              { text: (box.rootString === 1 ? m.music_strings_positions_root_s1 : m.music_strings_positions_root)({ note: noteName(rootOpen + rootFret, "sharp", false), fret: rootFret }), focus: "root" },
              ...(perBeat > 1 ? [per] : []),
              ...(target ? [{ text: m.music_strings_aiming_for({ target: target.label }), focus: "grade" }] : []),
            ],
  );

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoStep = null;
    demoAt = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = stepMs() / 1000;
    const handle = audio.playSequence(
      steps.map((t, i) => ({ midi: t.midi, time: slotOf[i] * beatS, duration: beatS * 0.9 })),
      { onNote: (i: number) => (demoStep = i) },
    );
    demo = handle;
    demoAt = handle.startPerf;
    loop();
    status = m.music_strings_line_demo();
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  /** How many more notes share the step at `i` (a pinch). */
  const pinch = (i: number) => slotOf.filter((sl, j) => j > i && sl === slotOf[i]).length;
  /** Harmonics: a tap on fret 12, 7 or 5 stands for the harmonic there, not the fretted note. */
  const asHarmonic = (e: NoteEvent): NoteEvent =>
    isHarm && e.source === "onscreen" && e.string !== undefined && e.fret !== undefined ? { ...e, midi: harmonicMidi(tuning, e.string, e.fret) ?? e.midi } : e;
  function onNote(raw: NoteEvent) {
    const e = asHarmonic(raw);
    if (e.kind !== "noteon" || phase !== "running") return;
    // Follow the order, allowing a skipped note or two, like the grader does.
    // A pinch's notes come in either order; a later step skips what was missed.
    const k = steps.findIndex((t, i) => i >= stepIndex && i <= stepIndex + 2 + pinch(stepIndex) && hitAt[i] === undefined && t.midi === e.midi);
    if (k >= 0) {
      if (mode === "practice") flashes.add(steps[k].string * 100 + steps[k].fret, "correct");
      hitAt[k] = e.at;
      hits[k] = e.at - (runDownbeat + slotOf[k] * stepMs());
      missText = null;
      lastHit = { key: k, ...strokeVerdict(hits[k] as number, onTimeMs()) };
      if (slotOf[k] !== slotOf[stepIndex]) stepIndex = k;
      while (stepIndex < steps.length && hitAt[stepIndex] !== undefined) stepIndex++;
      if (stepIndex >= steps.length) void finish();
    } else {
      if (mode === "practice" && e.string !== undefined && e.fret !== undefined) flashes.add(e.string * 100 + e.fret, "wrong");
      // Practice says what was played and where the note is; Check never names the target.
      const want = steps[stepIndex];
      // The first wrong note on a step makes it a slip: it leaves the clean count, as the marks show.
      if (stepIndex < steps.length && firstWrong[stepIndex] === undefined) firstWrong[stepIndex] = e.midi;
      if (mode === "practice" && want)
        missText =
          e.string !== undefined && e.fret !== undefined
            ? m.music_strings_line_miss_at({ string: stringText(e.string), fret: e.fret, wantString: stringText(want.string), wantFret: want.fret })
            : m.music_strings_line_miss_note({ note: noteName(e.midi), wantString: stringText(want.string), wantFret: want.fret });
      // A quarter tone off rounds to the next note: name the tuning; Practice moves past it (it still scores as missed).
      const open = steps.flatMap((t, i) => (i >= stepIndex && slotOf[i] === slotOf[stepIndex] && hitAt[i] === undefined ? [i] : []));
      const miss = e.source === "audio" ? nearMiss(e.midi, e.cents, open.map((i) => steps[i].midi)) : null;
      if (!miss) return;
      detuned = [...detuned, miss];
      status = tuningText(miss, e.midi, instr);
      if (mode !== "practice") return;
      hitAt[open.find((i) => steps[i].midi === miss.midi)!] = e.at;
      while (stepIndex < steps.length && hitAt[stepIndex] !== undefined) stepIndex++;
      if (stepIndex >= steps.length) void finish();
    }
  }
  /** Notes heard close to a target but out of tune, this run. */
  let detuned: { midi: number; cents: number }[] = [];
  /** Practice: the last wrong note and where the next one is, in words; cleared by a right note. */
  let missText = $state<string | null>(null);
  /** A string by number and open note: "string 3 (C)". */
  const stringText = (n: number) => m.music_strings_shape_string_note({ string: n, note: noteName(tuning.openStrings[n - 1], "flat", false) });
  /** Beside Stop on a phone: the string and fret to play now (Practice), or only where you are (Check). */
  const cue = $derived.by(() => {
    const t = steps[stepIndex];
    if (phase !== "running" || !t) return "";
    return mode === "check" ? m.music_strings_line_cue_check({ n: stepIndex + 1, total: steps.length }) : t.fret ? m.music_strings_line_cue_fret({ string: t.string, fret: t.fret }) : m.music_strings_line_cue_open({ string: t.string });
  });
  /** On time within the highway's window: a third of a note, 35 to 60 ms. */
  const onTimeMs = () => Math.max(35, Math.min(60, stepMs() * 0.3));
  /** The latest note that landed, as a timing word. */
  let lastHit = $state<{ key: number; kind: "ontime" | "early" | "late"; text: string } | null>(null);
  /** The run so far: notes landed, and notes passed without one. */
  const rightSoFar = $derived(Object.keys(hits).length);
  const missedSoFar = $derived(Array.from({ length: Math.min(stepIndex, steps.length) }, (_, i) => i).filter((i) => hits[i] === undefined).length);

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    stepIndex = 0;
    hitAt = [];
    firstWrong = [];
    hits = {};
    detuned = [];
    missText = null;
    lastHit = null;
    flashes.clear();
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: isHarm ? 0.4 : isPick ? (pickPattern.id === "travis" ? 0.5 : 0.4) : isLegato ? (legatoPattern.id === "three-note" ? 0.5 : 0.4) : isSpider ? (spiderPattern.group === "classic" ? 0.3 : 0.4) + (crossing ? 0.15 : 0) + (s.span === "single" ? 0 : 0.1) : box.family === "caged-major" ? 0.5 : 0.45,
      instrument: instr,
      params: isPick
        ? { bpm: ctx.bpm, perBeat, pattern: pickPattern.id, shapes: pickKey }
        : isLegato
        ? { bpm: ctx.bpm, perBeat, pattern: legatoPattern.id, string, startFret: legatoStart }
        : isHarm
        ? { bpm: ctx.bpm, tuning: tuning.id }
        : isSpider
        ? { bpm: ctx.bpm, perBeat, pattern: spiderPattern.id, tuning: tuning.id, strings: spiderSet.join(","), startFret, crossing, ...(burst ? { burst } : {}) }
        : { bpm: ctx.bpm, perBeat, pattern: box.id, rootFret, ...(instr === "ukulele" || tuning.id !== "guitar.standard" ? { tuning: tuning.id } : {}) },
    });
    // Scored only after the count-in, so the speakers can't bleed into the take.
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + slotCount * stepMs() + 4 * ctx.beatMs);
    stopClockRef = ctx.stopClock;
    runDownbeat = ctx.downbeat;
    loop();
  }

  /** One frame clock for the tab cursor and the highway, in a run or a demo. */
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      now = performance.now();
      if (phase === "running" || phase === "countin" || demo) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
    cap?.stop();
    const notes = (cap?.notes ?? []).map(asHarmonic);
    const beats: { midi: number }[][] = Array.from({ length: slotCount }, () => []);
    steps.forEach((t, i) => beats[slotOf[i]]?.push({ midi: t.midi }));
    const evennessWeight = isPick && isTremolo(pickPattern) ? 0.5 : undefined;
    // Each click's take, from the steps due on it: a wrong note first is a slip, a step never played is missed.
    const played: (Outcome | undefined)[] = [];
    const wrongAt: (number | undefined)[] = [];
    beats.forEach((_, sl) => {
      const mine = steps.flatMap((_, i) => (slotOf[i] === sl ? [i] : []));
      const wrong = mine.map((i) => firstWrong[i]).find((m) => m !== undefined);
      wrongAt[sl] = wrong;
      played[sl] = wrong !== undefined ? "wrong" : mine.every((i) => hitAt[i] !== undefined) ? "correct" : "missed";
    });
    // The grader follows the line by pitch; the marks decide what counts as right first time.
    const r = withSlips(gradeLine({ beats, beatMs: stepMs(), notes, ...(evennessWeight ? { evennessWeight } : {}) }), beats.map((notes) => ({ notes })), played, wrongAt, evennessWeight);
    result = r;
    const states: Record<number, GroupState> = {};
    steps.forEach((_, i) => {
      const g = groupOf[i];
      const mine = r.outcomes[slotOf[i]];
      // A pinch shows its worst note.
      if (states[g] === undefined || states[g] === "correct") states[g] = mine;
    });
    doneStates = states;
    phase = "results";
    await run!.attempt({
      promptId: key,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, instr) ?? null,
      target: steps.map((t) => t.midi),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: m.music_strings_line_run_headline({ score: pct(r.score), bpm: bpm() }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    // The string is only known for on-screen taps; MIDI and the microphone carry pitch.
    const ons = notes.filter((n) => n.kind === "noteon");
    const taps = ons.filter((n) => n.source === "onscreen" && n.string !== undefined);
    const onString = taps.filter((n) => steps.some((t) => t.midi === n.midi && t.string === n.string && t.fret === n.fret)).length;
    const clean = r.correct && mode === "check";
    summary = {
      headline: r.slips.length && ons.length
        ? `${r.slips.length === 1 ? m.music_strings_line_slips_one({ clean: r.clean, total: r.total }) : m.music_strings_line_slips_many({ clean: r.clean, total: r.total, slips: r.slips.length })}${r.pitch < 0.75 ? ` ${m.music_strings_line_slow_down()}` : ""}`
        : r.correct
        ? mode === "check"
          ? m.music_strings_line_clean_even({ bpm: bpm() })
          : m.music_strings_line_clean({ bpm: bpm() })
        : !ons.length
          ? m.music_strings_line_nothing_heard()
          : r.pitch < 0.9
            ? detuned.length
              ? (instr === "ukulele" ? m.music_strings_line_detuned_ukulele : m.music_strings_line_detuned_guitar)({ clean: r.clean, total: r.total, n: detuned.length, cents: Math.round(detuned.reduce((a, d) => a + Math.abs(d.cents), 0) / detuned.length) })
              : m.music_strings_line_some_right({ clean: r.clean, total: r.total })
            : m.music_strings_line_uneven({ ms: Math.round(r.evennessErrorMs) }),
      metric: pct(r.score),
      metricLabel: evennessWeight ? m.music_strings_line_metric_tremolo() : m.music_strings_line_metric(),
      delta: fin.delta,
      best: fin.best,
      clean,
      cleanMeans: m.music_strings_line_clean_means(),
      xp: fin.xp,
      mode,
      timing: timingCounts(
        steps.map((_, i) => (typeof hits[i] === "number" ? hits[i] : undefined)),
        onTimeMs(),
      ),
      rows: [
        { label: m.music_strings_notes_right(), value: r.pitch, text: r.slips.length ? m.music_strings_line_slips_text({ clean: r.clean, total: r.total, slips: r.slips.length }) : m.music_strings_n_of_total({ n: r.clean, total: r.total }) },
        evennessRow(r.evenness, r.clean, r.total),
        taps.length && taps.length === ons.length
          ? { label: m.music_strings_line_on_written(), value: taps.length ? onString / taps.length : 0, text: m.music_strings_line_taps({ n: onString, total: taps.length }) }
          : { label: m.music_strings_find_string_fret(), notMeasured: true },
        ...(isLegato
          ? (() => {
              const fromMic = ons.length > 0 && ons.every((n) => n.source === "audio");
              if (!fromMic) return [{ label: m.music_strings_line_legato_mic(), notMeasured: true }];
              const v = legatoAttacks(steps.map((t) => t.label), hitAt, (cap?.onsets ?? []).filter((o) => o.source === "audio")).filter((x) => x !== null);
              const legato = v.filter((x) => x === "legato").length;
              return [{ label: m.music_strings_line_legato_row(), value: v.length ? legato / v.length : 0, text: m.music_strings_line_legato_text({ n: legato, total: v.length, picked: v.filter((x) => x === "picked").length }) }];
            })()
          : []),
        ...(target
          ? [
              {
                label: m.music_strings_line_grade_row({ grade: target.label, bpm: target.bpm }),
                value: Math.min(1, bpm() / target.bpm),
                text: bpm() >= target.bpm ? (r.correct ? m.music_strings_line_reached() : m.music_strings_line_at_tempo()) : m.music_strings_line_bpm_of({ bpm: bpm(), target: target.bpm }),
              },
            ]
          : []),
      ],
      advance: ons.length ? await advanceAfter(r.score, r.correct) : undefined,
    };
    status = summary.headline;
  }

  /** The tempo climbs to the goal (the chosen grade's click, or 120), then the notes a click double. */
  function advanceAfter(score: number, correct: boolean) {
    const goal = target?.bpm ?? 120;
    // The goal click falls as the notes a click rise, so the note rate climbs gently.
    const FACTOR: Record<number, number> = { 1: 1, 2: 92 / 120, 3: 80 / 120, 4: 72 / 120, 6: 56 / 120 };
    const steps = PER_STEPS.map((n) => ({ label: PER[n].replace(/^./, (c) => c.toUpperCase()), goal: Math.round(goal * FACTOR[n]) }));
    const id = isPick ? `${instr}.fingerpick.${pickPattern.id}.${pickKey}` : `${instr}.${kind}.${isHarm ? tuning.id : isLegato ? legatoPattern.id : isSpider ? spiderPattern.id : box.id}`;
    return nextRun(id, { bpm: bpm(), tempo: { min: 40, goal, max: 200 }, steps, step: PER_STEPS.indexOf(perBeat) }, { score, correct }, tempoAnd((i) => cfg.set({ perBeat: PER_STEPS[i] })));
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    phase = "ready";
    status = m.music_strings_nothing_saved();
  }

  /** The next shape or pattern in the list. */
  function nextPattern() {
    const list = isPick ? FINGERPICK_PATTERNS.filter((p) => p.instrument === instr) : isLegato ? LEGATO_PATTERNS : isSpider ? SPIDER_PATTERNS : shapes;
    const i = list.findIndex((p) => p.id === (isPick ? pickPattern.id : isLegato ? legatoPattern.id : isSpider ? spiderPattern.id : box.id));
    cfg.set({ pattern: list[(i + 1) % list.length].id });
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
    mic.stop();
  });

  /** The pattern as fingers in playing order (1-4-3-2 is index, pinky, ring, middle). */
  const patternFingers = $derived(spiderPattern.fretOffsets.map((o) => o + 1));
  let draft = $state<number[]>([]);
  function tapFinger(f: number) {
    draft = [...draft, f];
    if (draft.length < 4) return;
    const p = SPIDER_PATTERNS.find((x) => x.fretOffsets.every((o, i) => o + 1 === draft[i]));
    if (p) cfg.set({ pattern: p.id });
    draft = [];
  }
  function nextOrder() {
    const i = SPIDER_PATTERNS.findIndex((p) => p.id === spiderPattern.id);
    cfg.set({ pattern: SPIDER_PATTERNS[(i + 1) % SPIDER_PATTERNS.length].id });
  }
  /** Positions: the roots whose lowest fret on string 6 keeps the shape on the neck. */
  /** The shapes a row each: pentatonic boxes (and the run joining them), CAGED, triads. */
  const SHAPE_GROUPS: [string, string[]][] = [
    [m.music_strings_shape_group_pentatonic(), ["minor-pentatonic", "connected"]],
    [m.music_strings_shape_group_blues(), ["blues-box"]],
    [m.music_strings_shape_group_caged(), ["caged-major"]],
    [m.music_strings_chordpicker_group_triads(), ["triads"]],
  ];
  const shapeGroups = $derived(SHAPE_GROUPS.map(([g, families]) => [g, shapes.filter((p) => families.includes(p.family))] as const).filter(([, list]) => list.length));
  const rootOptions = $derived(
    Array.from({ length: 12 }, (_, n) => n)
      .filter((n) => rootFretFor(n) <= rootMax)
      .map((n) => ({ value: n, label: noteName(n, "sharp", false) })),
  );
</script>

<svelte:window bind:innerWidth={viewW} />

<DrillShell
  lesson={card ? { lessons: conceptCard(card, { tuning }), trigger: "check" } : null}
  title={isPick ? m.music_strings_line_title_pick() : isHarm ? m.music_strings_line_title_harm() : isLegato ? m.music_strings_line_title_legato() : isSpider ? m.music_strings_line_title_spider() : m.music_strings_line_title_positions()}
  hue={instr}
  blurb={isHarm
    ? m.music_strings_line_blurb_harm()
    : isLegato
    ? m.music_strings_line_blurb_legato()
    : isPick
    ? m.music_strings_line_blurb_pick()
    : isSpider
    ? m.music_strings_line_blurb_spider()
    : instr === "ukulele"
    ? m.music_strings_line_blurb_uke()
    : m.music_strings_line_blurb_positions()}
  summary={summaryLine}
  tabs={isPick ? CHORD_MODES : FRETBOARD_MODES}
  tab={kind}
  ontab={(id) => openMode(isPick ? CHORD_MODES : FRETBOARD_MODES, id)}
  bind:phase
  bind:mode
  bind:status
  progress={steps.length ? stepIndex / steps.length : 0}
  clock={{ bpm: bpm(), beatsPerBar: clickBar }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  {cue}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if isPick}
        {#if songs.length}
          <div class="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-3" data-setup="song">
            <Choice label={m.music_strings_line_start_song()} options={songs.map((x) => ({ value: x.id, label: x.song, detail: x.artist }))} value={song?.id ?? ""} onchange={useSong} />
            {#if song}<p class="text-[13px] text-ws-soft">{song.note} {m.music_strings_line_song_tempo({ bpm: song.bpm })}</p>{/if}
          </div>
        {/if}
        <div class="flex min-w-0 flex-col gap-3 sm:col-span-2 lg:col-span-3" data-setup="pattern">
          <span class="text-sm font-medium">{m.music_strings_pattern()}</span>
          {#each pickGroups as [group, list] (group)}
            <Choice label={group} options={list.map((p) => ({ value: p.id, label: p.label, detail: p.fingers.join(" ") }))} value={pickPattern.id} onchange={(v) => cfg.set({ pattern: v })} />
          {/each}
        </div>
        <ChordCycleSetup instrument={instr} {tuning} refs={pickRefs} shapes={pickShapes} positions={pickChosen} onchange={savePick} setupKey="chords" />
      {:else if isHarm}
        <p class="text-sm text-ws-soft sm:col-span-2">{m.music_strings_line_harm_help()}</p>
      {:else if isLegato}
        <Choice label={m.music_strings_pattern()} setupKey="pattern" options={LEGATO_PATTERNS.map((p) => ({ value: p.id, label: p.label, detail: legatoText(p, legatoStart) }))} value={legatoPattern.id} onchange={(v) => cfg.set({ pattern: v })} />
        <p class="self-end text-sm text-ws-soft">{m.music_strings_line_legato_tap()}</p>
      {:else if isSpider}
        <div class="flex min-w-0 flex-col gap-2" data-setup="pattern">
          <span class="text-sm font-medium" id="spider-order">{m.music_strings_spider_order()}</span>
          <!-- The order so far: four slots, filled as the fingers are tapped. -->
          <ol class="flex gap-1.5" aria-labelledby="spider-order">
            {#each [0, 1, 2, 3] as i (i)}
              {@const f = draft.length ? draft[i] : patternFingers[i]}
              <li class="grid size-10 place-items-center rounded-full border-2 text-base font-extrabold {f ? 'border-transparent text-[#1b120b]' : 'border-dashed border-ws-line text-ws-soft'}" style:background={f ? `var(--finger-${f})` : undefined}>
                {f ?? i + 1}<span class="sr-only">{f ? m.music_strings_spider_slot_finger({ finger: FINGERS[f] }) : m.music_strings_spider_slot_empty()}</span>
              </li>
            {/each}
          </ol>
          <p class="text-[13px] text-ws-soft" aria-live="polite">{draft.length ? m.music_strings_spider_more_to_tap({ n: 4 - draft.length }) : m.music_strings_spider_tap_help()}</p>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label={m.music_strings_spider_tap_label()}>
            {#each [1, 2, 3, 4] as f (f)}
              <button type="button" class="flex min-h-11 items-center gap-1.5 rounded-full border border-ws-line px-3 text-sm font-medium disabled:opacity-40" disabled={draft.includes(f)} onclick={() => tapFinger(f)}>
                <span class="size-3 rounded-full" style:background="var(--finger-{f})" aria-hidden="true"></span>{f} {FINGERS[f]}
              </button>
            {/each}
            {#if draft.length}<button type="button" class="min-h-11 px-2 text-sm text-ws-soft underline underline-offset-4" onclick={() => (draft = [])}>{m.music_strings_clear()}</button>{/if}
          </div>
          <button type="button" class="self-start text-sm font-medium text-instr-ink underline underline-offset-4" onclick={nextOrder}>{m.music_strings_spider_next_order()}</button>
        </div>
        <div class="flex min-w-0 flex-col gap-2" data-setup="strings">
          <span class="text-sm font-medium" id="spider-strings">{m.music_strings_strings()}</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="spider-strings">
            {#each tuning.openStrings as open, i (i)}
              {@const n = i + 1}
              {@const on = spiderSet.includes(n)}
              <button type="button" class="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg border px-2 text-sm font-semibold {on ? 'border-instr bg-instr-wash' : 'border-ws-line'}" aria-pressed={on} aria-label={m.music_strings_string_n_note({ n, note: noteName(open, "flat", false) })} onclick={() => toggleString(n)}>
                {n}<span class="text-[13px] font-normal text-ws-soft">{noteName(open, "flat", false)}</span>
              </button>
            {/each}
          </div>
          <p class="text-[13px] text-ws-soft">{m.music_strings_spider_strings_help()}</p>
        </div>
        <Choice
          label={m.music_strings_spider_crossing_label()}
          setupKey="crossing"
          disabled={spiderSet.length < 2}
          options={[
            { value: 0, label: m.music_strings_spider_one_string() },
            { value: 1, label: m.music_strings_spider_cross_each(), hint: m.music_strings_spider_cross_hint() },
          ]}
          value={crossing ? 1 : 0}
          onchange={(v) => cfg.set({ crossing: v === 1 })}
        />
        <Choice
          label={m.music_strings_spider_bursts_label()}
          setupKey="burst"
          options={[
            { value: 0, label: m.music_strings_spider_steady() },
            { value: 1, label: m.music_strings_spider_bursts(), hint: m.music_strings_spider_bursts_hint() },
          ]}
          value={burst ? 1 : 0}
          onchange={(v) => cfg.set({ burst: v === 1 })}
        />
      {:else}
        <div class="flex min-w-0 flex-col gap-3 sm:col-span-2 lg:col-span-3" data-setup="pattern">
          <span class="text-sm font-medium">{m.music_strings_shape()}</span>
          {#each shapeGroups as [group, list] (group)}
            <Choice label={group} options={list.map((p) => ({ value: p.id, label: p.label.replace(/^(Minor pentatonic|CAGED) /, "").replace(/^./, (c) => c.toUpperCase()) }))} value={box.id} onchange={(v) => cfg.set({ pattern: v })} />
          {/each}
        </div>
        <Choice label={m.music_strings_chordpicker_root()} setupKey="root" options={rootOptions} value={pc(rootOpen + rootFret)} onchange={(n) => cfg.set({ rootFret: rootFretFor(n) })} />
      {/if}
      {#if !isHarm}
        <Choice
          label={m.music_strings_notes_a_click()}
          setupKey="per"
          options={PER_STEPS.map((n) => ({ value: n, label: String(n), detail: PER_NAME[n] }))}
          value={perBeat}
          onchange={(v) => cfg.set({ perBeat: v })}
        />
      {/if}
      {#if isSpider || kind === "positions"}
        <div class="flex min-w-0 flex-col gap-1" data-setup="grade">
          <Choice
            label={m.music_strings_exam_target()}
            options={[{ value: "", label: m.music_strings_none() }, ...GUITAR_GRADE_TEMPOS.map((g) => ({ value: g.id, label: `${g.label}: ${g.bpm} BPM`, group: g.label.split(" ")[0] }))]}
            value={target?.id ?? ""}
            onchange={(v) => cfg.set({ grade: v })}
          />
          <p class="text-[13px] text-ws-soft">{m.music_strings_exam_help()}</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_strings_note()} value={m.music_strings_n_of_total({ n: Math.min(stepIndex + 1, steps.length), total: steps.length })} />
      <Stat label={m.music_strings_right()} value="✓ {rightSoFar}  ✕ {missedSoFar}" />
    {:else if result}
      <!-- Evenness waits for the results rows, where too few landed notes read Not measured. -->
      <Stat label={m.music_strings_notes_right()} value="{result.clean}/{result.total}" tone={result.pitch >= 0.9 ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if isPick && mode === "practice"}
      <ChordStrip shapes={pickShapes} names={pickNames} current={pickNow} />
    {/if}
    {#if mode === "practice" && phase !== "results"}
      <!-- On a laptop the switch sits beside the capped tab, not on a row of its own, so the neck stays in view. -->
      <div class="mb-2 flex justify-end {highway.on ? '' : 'lg:float-right lg:mb-0 lg:ml-3'}">{@render viewSwitch(m.music_strings_tab())}</div>
    {/if}
    {#if mode === "practice" && phase !== "results" && highway.on}
      <!-- The highway is a play-time view; the results go back to the tab. -->
      <div class="mb-3">
        <NoteHighway
          notes={hwNotes}
          labels={hwLabels}
          strings={tuning.openStrings.map((m) => noteName(m, "flat", false))}
          beat={hwBeat}
          noteHits={hits}
          judge={phase === "running"}
          perfectMs={Math.max(35, Math.min(60, stepMs() * 0.3))}
          barBeats={clickBar * quartersPerClick}
          clickBeats={quartersPerClick}
        />
      </div>
    {:else if mode === "practice" || phase === "results"}
      <!-- Capped on a laptop so the tab does not zoom past what a read needs and the whole neck fits under it. -->
      <div class="mb-3 lg:max-w-2xl">
        <!-- A phone keeps the tab at a readable size on one row that scrolls with the cursor. -->
        <LineNotation notes={tabNotes} tuning={{ openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name }} title={key} cursorBeat={tabCursor} groupStates={tabStates} meter={tabMeter} oneRow={viewW < 640} />
      </div>
    {/if}
    {#if orderKey.length && mode === "practice" && phase !== "results"}
      <ol class="mb-2 flex flex-wrap items-center gap-1.5 text-sm" aria-label={isPick ? m.music_strings_picking_order() : m.music_strings_play_order()}>
        {#each orderKey as k, i (i)}
          <li class="flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 font-semibold {orderNow === i ? 'bg-ws-stage-ink/25 ring-2 ring-ws-stage-ink' : 'bg-ws-stage-ink/8'}" aria-current={orderNow === i ? "step" : undefined}>
            <span class="grid size-6 place-items-center rounded-full text-[13px] font-extrabold text-[#1b120b]" style:background={k.finger ? `var(--finger-${k.finger})` : "var(--ws-stage-soft)"} aria-hidden="true">{k.mark}</span>{k.text}
          </li>
        {/each}
      </ol>
    {/if}
    {#if phase === "running" && missText}
      <p class="mb-2 flex items-start gap-2 text-sm font-medium text-ws-stage-ink" data-testid="heard-miss"><span class="text-warn" aria-hidden="true">⚠</span>{missText}</p>
    {/if}
    <!-- The verdict's own rail above the neck, never over its fret numbers. -->
    {#if phase === "running" || phase === "countin"}<Verdict rail kind={lastHit?.kind} text={lastHit?.text} key={lastHit?.key ?? 0} />{/if}
    <div class="flex flex-col justify-end" data-dock="instrument"><div class="relative">
      <Fretboard
        openStrings={tuning.openStrings}
        {from}
        {to}
        {marks}
        {flashes}
        barres={isPick}
        targetString={phase === "running" && mode === "practice" ? (steps[stepIndex]?.string ?? null) : null}
        onpick={picking ? pickStart : undefined}
        label={instr === "ukulele" ? m.music_strings_board_ukulele() : m.music_strings_board_guitar()}
      />
    </div></div>
    <!-- Spider's order row already names each finger in its colour: one key, not two. -->
    {#if mode === "practice" && !isHarm && !isSpider}
      <!-- The colour key: the fretting hand by colour; on fingerpicking, the picking hand by letter. -->
      <dl class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ws-stage-soft" aria-label={m.music_strings_finger_key()}>
        <div class="flex flex-wrap items-center gap-2">
          <dt class="font-semibold text-ws-stage-ink">{m.music_strings_fretting_hand()}</dt>
          {#each [1, 2, 3, 4] as f (f)}
            <dd class="flex items-center gap-1"><span class="size-3 rounded-full" style:background="var(--finger-{f})" aria-hidden="true"></span>{f} {FINGERS[f]}</dd>
          {/each}
        </div>
        {#if isPick}
          <div class="flex flex-wrap items-center gap-2">
            <dt class="font-semibold text-ws-stage-ink">{m.music_strings_picking_hand()}</dt>
            {#each [["p", m.music_strings_finger_thumb()], ["i", m.music_strings_finger_index()], ["m", m.music_strings_finger_middle()], ["a", m.music_strings_finger_ring()]] as [l, name] (l)}
              <dd class="flex items-center gap-1"><span class="grid size-4 place-items-center rounded-full bg-ws-stage-ink/15 font-bold text-ws-stage-ink" aria-hidden="true">{l}</span>{name}</dd>
            {/each}
          </div>
        {/if}
      </dl>
    {/if}
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ws-stage-soft">
      {#if mode === "check" && phase !== "results"}<p>{m.music_strings_line_check_note()}</p>{:else if phase === "ready"}<p>{isPick ? m.music_strings_line_ready_pick({ chord: pickNames[0] }) : isLegato ? m.music_strings_line_ready_legato() : isSpider ? m.music_strings_line_ready_spider() : isHarm ? m.music_strings_line_ready_harm() : m.music_strings_line_ready_fingers()}</p>{/if}
      {#if picking}<p>{isSpider ? m.music_strings_line_pick_spider() : m.music_strings_line_pick_start()}</p>{/if}
      {#if kind === "positions" && phase === "ready"}<p>{box.family === "triads" ? m.music_strings_pos_triads() : box.instrument === "ukulele" ? m.music_strings_pos_uke() : box.family === "blues-box" ? m.music_strings_pos_bb() : m.music_strings_pos_shapes()} {tuning.id === "guitar.standard" || tuning.id === "ukulele.high-g" || tuning.id === "ukulele.low-g" ? "" : `${m.music_strings_pos_retuned({ tuning: tuning.name })} `}{steps.some((t) => t.stretch) ? m.music_strings_pos_stretch() : ""}</p>{/if}
    </div>
    <!-- The run's clock rides along as data, for tests and tools. -->
    <div class="mt-3" data-downbeat={phase === "running" || phase === "countin" ? Math.round(runDownbeat) : undefined} data-step-ms={stepMs()}><MicPanel disabled={phase === "running" || phase === "countin"} offer={phase !== "ready"} hint={instr === "ukulele" ? m.music_strings_line_mic_ukulele() : m.music_strings_line_mic_guitar()} /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <!-- The run written out with each note's mark, the marks the counts are made of. -->
      {#snippet figure()}
        <div class="flex flex-col gap-2" data-testid="line-marked">
          <p class="text-sm font-semibold">{m.music_strings_line_your_run()}</p>
          <LineNotation notes={tabNotes} tuning={{ openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name }} title={key} groupStates={tabStates} meter={tabMeter} oneRow={viewW < 640} />
        </div>
      {/snippet}
      <Results {summary} {figure}>
        {#snippet actions()}
          {#if !isHarm}<button type="button" class={btn} onclick={nextPattern}>{kind === "positions" ? m.music_strings_next_shape() : m.music_strings_next_pattern()}</button>{/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>
