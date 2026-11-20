<script lang="ts">
  import { CHANGES_TITLE, changesTrainer, shortStage } from "./modes";
  import { TimedRun } from "./timed-run";
  import { onDestroy } from "svelte";
  import { m } from "@repo/i18n/messages.js";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName, pc, pcOf, showChord } from "@repo/music-core";
  import { chord, keyName as namedKey, note, useNamingKey } from "#lib/music/names.svelte.ts";
  import { KEY_CYCLE, LICKS, LICK_CATEGORY_LABEL, cycleTranspose, lickChordAt, lickChunk, lickChunkIn, lickNotes, lickSkills, lickTip, transposeText, type LickNote } from "@repo/music-core/content/piano";
  import { JAZZ, TUNINGS } from "@repo/music-core/data/index";
  import { gradeLick, type LickResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import InstrumentStage, { fitShift, fretTuning, linePositions } from "#lib/music/components/InstrumentStage.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Fretboard, { type FretMark } from "#lib/music/components/Fretboard.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import FallingKeys from "#lib/music/notation/FallingKeys.svelte";
  import { lineScore } from "#lib/music/notation/falling.ts";
  import ViewSwitch from "#lib/music/notation/ViewSwitch.svelte";
  import { page } from "$app/state";
  import type { GroupState } from "#lib/music/notation/NotationFrame.svelte";
  import CatalogPicker from "#lib/music/components/CatalogPicker.svelte";
  import type { SetupClause } from "#lib/music/components/DrillShell.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type ResultRow, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import BeatLane from "#lib/music/drills/piano/BeatLane.svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Verdict, { type VerdictKind } from "#lib/music/components/Verdict.svelte";
  import { lineOutcomes, timingOf, verdictOf } from "#lib/music/drills/piano/lane-outcomes.ts";
  import { Transport, benchFromUrl, sounding, spanOf, type TimedNote } from "#lib/music/drills/piano/transport.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, pct, runInstrument, runSource } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";

  const TEMPO = { min: 40, max: 220 };
  const CATEGORY_LABEL = LICK_CATEGORY_LABEL;
  const GUITAR = TUNINGS.guitar.find((t) => t.id === "standard") ?? TUNINGS.guitar[0];

  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  // `category` is a setup key, so a category link (the drill's modes) lands on that category's first lick over any saved one.
  // `ear`: the transcription loop. The line is heard, looped and slowed, never shown until the
  // results; showing it (a hint) makes the run practice.
  const cfg = new DrillSetup("licks", { lick: 1, key: "C", category: "" as string, ear: false as boolean });
  const s = $derived(cfg.value);
  const lick = $derived.by(() => {
    const picked = LICKS.find((l) => l.number === s.lick) ?? LICKS[0];
    return s.category && picked.category !== s.category ? (LICKS.find((l) => l.category === s.category) ?? picked) : picked;
  });
  const original = $derived(lickNotes(lick.number));
  const fretted = $derived(original.some((n) => n.string !== undefined));
  const keyName = $derived(fretted || !KEY_CYCLE.includes(s.key) ? "C" : s.key);
  const transpose = $derived(fretted ? 0 : cycleTranspose(keyName));
  const minor = $derived(lick.category.startsWith("minor"));
  // Movable do counts from the key the lick is played in.
  useNamingKey(() => ({ tonic: keyName, minor }));
  // Spelled the way the key's signature is: sharps in sharp keys, flats otherwise.
  const keyFifths = $derived(signatureFor(pcOf(keyName) ?? 0, minor ? "natural-minor" : "major"));
  const sharps = $derived(keyFifths > 0);
  const tx = (text: string) => transposeText(text, transpose, sharps);
  const spell = (m: number) => note(noteName(m, sharps ? "sharp" : "flat", false));
  /** A scale as the lick names it ("D dorian"), its root named as the user reads notes. */
  const scaleText = (text: string) => text.replace(/^[A-G][#b♯♭]?/, (root) => note(root));
  const all = $derived(lickNotes(lick.number, transpose));
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));

  // The chunk to hear and play: first and last note, inclusive. Resets with the lick.
  let chunkSel = $state<{ key: string; first: number; last: number } | null>(null);
  const lickKey = $derived(`${lick.number}:${transpose}`);
  const sel = $derived(chunkSel?.key === lickKey ? chunkSel : { first: 0, last: all.length - 1 });
  const first = $derived(sel.first);
  const last = $derived(sel.last);
  const setChunk = (f: number, l: number) => (chunkSel = { key: lickKey, first: f, last: l });
  const lo = $derived(Math.min(first, last, all.length - 1));
  const hi = $derived(Math.min(Math.max(first, last), all.length - 1));
  const chunk = $derived(lickChunk(all, lo, hi));
  const whole = $derived(lo === 0 && hi === all.length - 1);
  const t0 = $derived(all[lo]?.startBeat ?? 0);
  // The lane ends on the beat of the last attack (a held last note doesn't add an empty beat).
  const chunkBeats = $derived(Math.max(1, Math.floor(chunk.reduce((m, n) => Math.max(m, n.startBeat), 0)) + 1));
  /** The chunk as beats on the written lick: tinted on the staff or tab, which shows the whole lick. */
  const chunkRange = $derived(whole ? null : { startBeat: t0, endBeat: all[hi + 1]?.startBeat ?? all[hi].startBeat + all[hi].durationBeats });
  /** Two taps on the staff or tab mark a chunk by its notes. */
  function tapChunk(range: { startBeat: number; endBeat: number }) {
    const c = lickChunkIn(all, range);
    if (!c) return;
    setChunk(c[0], c[1]);
    status = m.music_drills_licks_chunk_set_loop({ first: c[0] + 1, last: c[1] + 1 });
  }
  /** First and last note of each bar: the chunks offered on the stage. */
  const barChunks = $derived.by(() => {
    const out: [number, number][] = [];
    for (const n of all) {
      const b = Math.floor(n.startBeat / 4);
      if (out[b]) out[b][1] = n.index;
      else out[b] = [n.index, n.index];
    }
    return out.filter(Boolean);
  });

  const timed = $derived<(TimedNote & { index: number })[]>(chunk.map((n) => ({ midi: n.midi, beat: n.startBeat, dur: n.durationBeats, finger: n.finger, index: n.index })));
  const progression = $derived(lick.progression.map(tx));
  // One chord a bar unless the lick gives its chords' lengths (half-bar changes), the last one held.
  const chordAt = (beat: number) => lickChordAt(lick, beat, progression);
  const laneChords = $derived.by(() => {
    const out: { beat: number; symbol: string }[] = [{ beat: 0, symbol: chordAt(t0) }];
    for (let b = Math.ceil(t0 / 2) * 2; b < t0 + chunkBeats; b += 2) if (b > t0 && chordAt(b) !== out[out.length - 1].symbol) out.push({ beat: b - t0, symbol: chordAt(b) });
    return out;
  });
  // The drill plays the line only, so the left-hand textures are left out.
  const techniques = $derived(lick.techniques.flatMap((id) => JAZZ.IMPROV_TECHNIQUES.filter((t) => t.id === id && id !== "lh-textures")));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<LickResult | null>(null);
  let played = $state(0);
  /** The notes played this run, in beats from the downbeat: the lane marks each one as it lands. */
  let hits = $state<{ midi: number; beat: number }[]>([]);
  let verdict = $state<{ kind: VerdictKind; text?: string; key: number } | null>(null);
  const transport = new Transport();
  const timedRun = new TimedRun(transport);
  const flashes = new Flashes();
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let ctxRef: RunContext | null = null;
  /** The demo's playhead on the whole lick (a loop starts over at the chunk each time). */
  const demoCursor = $derived(transport.playing && transport.beat !== null ? (transport.beat % (chunkBeats + 1)) + t0 : null);
  /** Taps choose a chunk only between runs. */
  const picking = $derived(phase !== "running" && phase !== "countin" && !transport.playing);

  const next = $derived<LickNote | undefined>(phase === "running" ? chunk[played] : phase === "ready" || phase === "countin" ? chunk[0] : undefined);
  const lit = $derived(transport.playing ? sounding(timed, transport.beat) : []);
  /** A peek holds for this lick in this key; another lick or key is unseen again. */
  let peekedKey = $state("");
  const peeked = $derived(peekedKey === lickKey);
  /** By ear: no notation, lane or lit keys until the results (or a peek). */
  const hideNotes = $derived(s.ear && !peeked && phase !== "results");
  const showTargets = $derived(mode === "practice" && phase !== "results" && !hideNotes);
  /** Staff and tab marks from the lane's own outcomes (one per note), so the two never disagree:
   *  a wrong pitch is wrong, a note never played is missed, the one up next is active. */
  const tabStates = $derived.by(() => {
    const out: Record<number, GroupState> = {};
    if (phase !== "running" && phase !== "results") return out;
    if (phase === "running" && mode !== "practice") return out;
    chunk.forEach((_, i) => {
      const o = outcomes[i];
      if (o) out[lo + i] = o === "miss" ? "wrong" : "correct";
      else if (phase === "results") out[lo + i] = "missed";
      else if (i === played) out[lo + i] = "active";
    });
    return out;
  });
  const ended = $derived(phase === "results");
  /** Beside Stop on a phone: which note is next and, in Practice, what it is. */
  const cue = $derived(phase === "running" && next ? (mode === "practice" && !hideNotes ? m.music_drills_licks_cue_note({ n: Math.min(played + 1, chunk.length), total: chunk.length, note: spell(next.midi) }) : m.music_drills_licks_cue_hidden({ n: Math.min(played + 1, chunk.length), total: chunk.length })) : "");

  /** The last wrong note in Practice: the key heard (its X) and the key wanted (ringed), from the one event the pill names. */
  let slip = $state<{ heard: number; want: number } | null>(null);
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing && !hideNotes) for (const n of lit) out[n.midi] = { demo: true };
    else if (showTargets && next) out[next.midi] = { target: true };
    if (slip && phase === "running" && mode === "practice") {
      out[slip.want] = { ...out[slip.want], target: true };
      // An empty mark keeps the heard key on the keyboard, so its X is never off screen.
      out[slip.heard] ??= {};
    }
    return out;
  });
  const fretMarks = $derived.by((): FretMark[] => {
    if (transport.playing && hideNotes) return [];
    if (transport.playing) return lit.map((n) => ({ string: chunk.find((c) => c.index === n.index)!.string!, fret: chunk.find((c) => c.index === n.index)!.fret!, label: n.finger ? String(n.finger) : undefined, demo: true }));
    if (!showTargets || !next || next.string === undefined) return [];
    return [{ string: next.string, fret: next.fret!, label: next.finger ? String(next.finger) : undefined, role: "root" }];
  });
  const frets = $derived.by(() => {
    const fs = original.flatMap((n) => (n.fret === undefined ? [] : [n.fret]));
    return fs.length ? { from: Math.max(0, Math.min(...fs) - 1), to: Math.max(...fs) + 1 } : { from: 0, to: 5 };
  });
  const span = $derived(spanOf(all.map((n) => n.midi)));
  // A piano lick written out on the strip's instrument: a staff, or tab in one hand position, an octave up where the stage moves it.
  const inst = $derived(settings.value.activeInstrument);
  const lift = $derived(fitShift(all.map((n) => n.midi), inst));
  const liftedPos = $derived(linePositions(inst, all.map((n) => n.midi + lift)));
  const written = $derived(all.map((n) => ({ midi: n.midi + lift, startBeat: n.startBeat, durationBeats: n.durationBeats, ...liftedPos.get(n.midi + lift) })));
  /** On the piano the lick can fall onto the keys instead, on the run's clock (the chunk starts at t0). */
  const lineShown = $derived(!fretted && !hideNotes && inst === "piano" && (mode === "practice" || transport.playing || phase === "results"));
  const falling = $derived(lineShown && page.url.searchParams.get("view") === "falling");
  const fallBeat = $derived(transport.beat === null ? null : (demoCursor ?? transport.beat + t0));

  const summaryLine = $derived<SetupClause[]>([
    { text: m.music_drills_licks_summary_lick({ number: lick.number, category: CATEGORY_LABEL[lick.category] ?? lick.category }), focus: "lick" },
    fretted ? { text: progression.map(chord).join(" ") } : { text: transpose ? m.music_drills_licks_summary_in_key({ progression: progression.map(chord).join(" "), key: namedKey(keyName) }) : progression.map(chord).join(" "), focus: "key" },
    ...(whole ? [] : [{ text: m.music_drills_licks_summary_notes({ first: lo + 1, last: hi + 1 }) }]),
  ]);
  const setupKey = $derived(`lick:${lick.number}:${transpose}:${lo}-${hi}:${bpm}`);

  async function demo(speed: number, times = 1) {
    if (transport.playing) return transport.stop();
    const gap = chunkBeats + 1;
    const notes = Array.from({ length: times }, (_, r) => timed.map((n) => ({ ...n, beat: n.beat + r * gap }))).flat();
    const percent = Math.round(speed * 100);
    const range = { first: lo + 1, last: hi + 1 };
    status =
      times > 3
        ? whole
          ? m.music_drills_licks_status_loop_lick({ percent, times })
          : m.music_drills_licks_status_loop_notes({ ...range, percent, times })
        : times > 1
          ? m.music_drills_licks_status_demo_three(range)
          : whole
            ? speed < 1
              ? m.music_drills_licks_status_demo_whole_half()
              : m.music_drills_licks_status_demo_whole_tempo()
            : speed < 1
              ? m.music_drills_licks_status_demo_notes_half(range)
              : m.music_drills_licks_status_demo_notes_tempo(range);
    await transport.demo(notes, bpm, speed);
  }

  /** On time within min(180 ms, a quarter beat), as the grade counts it. */
  const tolBeats = (beatMs: number) => Math.min(180, beatMs / 4) / beatMs;
  let runBeatMs = $state(500);
  const outcomes = $derived(hits.length ? lineOutcomes(timed.map((n) => ({ midi: n.midi, beat: n.beat })), hits, tolBeats(runBeatMs)) : []);

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const want = chunk[played];
    played += 1;
    if (ctxRef) {
      const beat = (e.at - ctxRef.downbeat) / ctxRef.beatMs;
      hits = [...hits, { midi: e.midi, beat }];
      // Practice says how each note landed; Check keeps it for the results.
      if (want && mode === "practice") {
        const o = lineOutcomes([{ midi: want.midi, beat: want.startBeat }], [{ midi: e.midi, beat }], tolBeats(ctxRef.beatMs))[0]!;
        const samePitch = pc(e.midi) === pc(want.midi);
        const v = o === "miss" ? { kind: "wrong" as const, text: samePitch ? m.music_drills_licks_verdict_off_beat({ note: spell(want.midi) }) : m.music_drills_licks_verdict_heard({ heard: spell(e.midi), want: spell(want.midi) }) } : verdictOf(o, (beat - want.startBeat) * ctxRef.beatMs);
        verdict = { ...v, key: (verdict?.key ?? 0) + 1 };
        slip = o === "miss" && !samePitch ? { heard: e.midi, want: want.midi } : null;
      }
    }
    if (want && mode === "practice") {
      // One mark at a time: the keys show the note the pill names, never an older one still fading.
      flashes.clear();
      const ok = pc(e.midi) === pc(want.midi) && (e.string === undefined || want.string === undefined || (e.string === want.string && e.fret === want.fret));
      if (fretted) {
        const key = e.string !== undefined ? e.string * 100 + (e.fret ?? 0) : want.string! * 100 + want.fret!;
        flashes.add(key, ok ? "correct" : "wrong");
      } else flashes.add(e.midi, ok ? "correct" : "wrong");
    }
    // Grading is positional and ignores extras past the phrase: done once every note has a place.
    if (played >= chunk.length) {
      timedRun.endIn(350);
    }
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    played = 0;
    hits = [];
    verdict = null;
    slip = null;
    runBeatMs = ctx.beatMs;
    flashes.clear();
    ctxRef = ctx;
    run = practice.beginRun({
      exerciseId: "jazz.lick.playback",
      setupKey,
      skillIds: lickSkills(lick.category),
      capabilities: ["harmony"],
      modality: "played",
      assistance: assistanceFor(mode, s.ear && peeked),
      difficulty: Math.min(1, 0.4 + chunk.length / 60 + (lick.category.startsWith("minor-ii") ? 0.15 : 0)),
      instrument: fretted ? "guitar" : settings.value.activeInstrument,
      params: { bpm, lick: lick.number, transpose, first: lo, last: hi, ...(s.ear ? { byEar: true } : {}) },
    });
    timedRun.begin(ctx, chunkBeats + 2, onNote, () => void finish());
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    const notes = timedRun.end(true);
    const r = gradeLick({ expected: chunk, notes, beatMs: ctxRef!.beatMs, startAt: ctxRef!.downbeat });
    result = r;
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes, fretted ? "guitar" : undefined) ?? null,
      target: chunk.map((n) => n.midi),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${r.matched} of ${r.total} notes` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const rows: ResultRow[] = [
      { label: m.music_drills_licks_row_in_order(), value: r.score, text: m.music_drills_changes_x_of_y({ count: r.matched, total: r.total }) },
      // Timing is judged on the notes that came in order, so it says how many of those.
      { label: m.music_drills_licks_row_on_time({ ms: Math.round(Math.min(180, ctxRef!.beatMs / 4)) }), value: r.matched ? r.onTime / r.matched : 0, text: m.music_drills_changes_x_of_y({ count: r.onTime, total: r.matched }) },
    ];
    if (fretted)
      rows.push(r.positions === null ? { label: m.music_drills_licks_row_positions_unmeasured(), notMeasured: true } : { label: m.music_drills_licks_row_positions(), value: r.positions / r.total, text: m.music_drills_changes_x_of_y({ count: r.positions, total: r.total }) });
    const wrong = r.firstWrong === null ? null : chunk[r.firstWrong];
    summary = {
      headline: !r.matched
        ? m.music_drills_licks_headline_none()
        : r.correct
          ? mode === "check"
            ? m.music_drills_licks_headline_all_check({ total: r.total })
            : m.music_drills_licks_headline_all({ total: r.total })
          : wrong
            ? m.music_drills_licks_headline_slipped_note({ matched: r.matched, total: r.total, index: lo + (r.firstWrong ?? 0) + 1, note: spell(wrong.midi) })
            : m.music_drills_licks_headline_slipped({ matched: r.matched, total: r.total, index: lo + (r.firstWrong ?? 0) + 1 }),
      metric: pct(r.score),
      metricLabel: m.music_drills_licks_metric(),
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      hinted: s.ear && peeked,
      rows,
      cleanMeans: m.music_drills_licks_clean_means(),
      advance: notes.some((n) => n.kind === "noteon") ? await advanceAfter(r.score, r.correct) : undefined,
      // The headline's fix: the notes where it slipped, as their own chunk.
      coach: r.practiceWindow ? { label: m.music_drills_licks_coach_loop({ first: lo + r.practiceWindow[0] + 1, last: lo + r.practiceWindow[1] }), run: practiseWindow } : undefined,
      timing: timingOf(timed.map((_, i) => outcomes[i])),
    };
    status = summary.headline;
  }

  /** The licks carry no tempo: climb to 75% of the top. Piano licks then move round the key cycle; guitar licks stay in their key. */
  function advanceAfter(score: number, correct: boolean) {
    const plan = { bpm, tempo: { min: TEMPO.min, goal: Math.round(TEMPO.max * 0.75), max: TEMPO.max } };
    const keys = fretted ? {} : { steps: KEY_CYCLE.map((k) => ({ label: m.music_drills_licks_key_of({ key: namedKey(k) }) })), step: Math.max(0, KEY_CYCLE.indexOf(s.key)) };
    return nextRun(`licks.${lick.number}.${lo}-${hi}`, { ...plan, ...keys }, { score, correct }, tempoAnd((i) => cfg.set({ key: KEY_CYCLE[i] })));
  }

  function practiseWindow() {
    if (!result?.practiceWindow) return;
    const [a, b] = result.practiceWindow;
    const base = lo;
    setChunk(base + a, base + b - 1);
    phase = "ready";
    summary = null;
    status = m.music_drills_licks_chunk_set({ first: base + a + 1, last: base + b });
  }

  function stop() {
    timedRun.end();
    phase = "ready";
    status = m.music_drills_changes_stopped();
  }

  onDestroy(() => {
    timedRun.end();
  });

  const lickItems = LICKS.map((l) => ({ value: l.number, title: m.music_drills_licks_item_title({ number: l.number, progression: l.progression.map((c) => showChord(c, { tonic: "C", minor: l.category.startsWith("minor") })).join(" ") }), meta: lickTip(l), group: CATEGORY_LABEL[l.category] ?? l.category, keywords: l.scales.join(" ") }));
</script>

<DrillShell
  title={CHANGES_TITLE}
  trainer={changesTrainer("licks")}
  hue="piano"
  blurb={m.music_drills_licks_blurb()}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={chunk.length ? Math.min(1, played / chunk.length) : 0}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={() => demo(1)}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
  {cue}
  review
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <CatalogPicker label={m.music_drills_licks_label()} setupKey="lick" noun="lick" recentKey="licks" items={lickItems} value={lick.number} onchange={(v) => cfg.set({ lick: v, category: LICKS.find((l) => l.number === v)?.category ?? "" })} />
      {#if fretted}
        <p class="self-end text-sm text-ws-soft">{m.music_drills_licks_guitar_note()}</p>
      {:else}
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">{m.music_drills_licks_key()}</span>
        <KeyPicker label={m.music_drills_licks_key()} value={pcOf(KEY_CYCLE.includes(s.key) ? s.key : "C")!} name={(p) => namedKey(KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C")} onchange={(p) => cfg.set({ key: KEY_CYCLE.find((k) => pcOf(k) === p) ?? "C" })} />
      </div>
      {/if}
    </div>
    <div class="mt-3">
      <Choice
        label={m.music_drills_licks_learn_label()}
        setupKey="ear"
        options={[
          { value: "read", label: m.music_drills_licks_learn_read() },
          { value: "ear", label: m.music_drills_licks_learn_ear(), hint: m.music_drills_licks_learn_ear_hint() },
        ]}
        value={s.ear ? "ear" : "read"}
        onchange={(v) => cfg.set({ ear: v === "ear" })}
      />
    </div>
    <p class="mt-3 text-sm text-ws-soft">{m.music_drills_licks_setup_tempo({ key: namedKey("C") })}</p>
    {#if !fretted}<p class="mt-1 text-sm text-ws-soft">{m.music_drills_licks_setup_fingering()}</p>{/if}
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_drills_licks_stat_played()} value={m.music_drills_changes_x_of_y({ count: played, total: chunk.length })} />
      {#if mode === "practice" && next}<Stat label={m.music_drills_licks_stat_next()} value={spell(next.midi)} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <!-- Two short rows before a run, so the lane, the staff and the keys share a tablet's screen: the changes with
         the tip beside them, then the theory (folded) with the chunks. The reading text steps aside while the line runs. -->
    <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <p class="font-display text-xl font-semibold">{progression.map(chord).join("  ")}</p>
      {#if phase !== "running" && phase !== "countin" && !ended}
        <p class="min-w-0 flex-[1_1_16rem]"><span class="font-semibold">{m.music_drills_licks_tip()}</span> {tx(lickTip(lick))}</p>
        {#if lineShown}<ViewSwitch />{/if}
      {/if}
    </div>
    <div class="mb-3 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm [&:not(:has(details,button))]:hidden">
      <div class="min-w-0 flex-[1_1_12rem]">
        {#if phase !== "running" && phase !== "countin" && !ended}
          <details class="text-ws-stage-soft">
            <summary class="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 font-medium text-ws-stage-ink [&::-webkit-details-marker]:hidden"><ChevronRight class="size-4 transition-transform [details[open]>summary>&]:rotate-90" aria-hidden="true" />{m.music_drills_licks_about()}</summary>
            <p>{m.music_drills_licks_scales({ scales: lick.scales.map((x) => scaleText(tx(x))).join(", ") })}</p>
            {#each techniques as t (t.id)}
              <p class="mt-1"><span class="font-semibold text-ws-stage-ink">{t.name}.</span> {tx(t.summary)}</p>
            {/each}
          </details>
        {/if}
      </div>
      {#if phase !== "running" && phase !== "countin" && !ended}
        <div class="flex min-w-0 flex-wrap items-end gap-2 max-sm:w-full lg:justify-end">
          {#if barChunks.length > 1}
            <!-- One row that scrolls sideways on a phone, so the chunks never stack over the lick. -->
            <div class="chunks flex min-w-0 items-center gap-1.5 max-sm:w-full max-sm:overflow-x-auto sm:flex-wrap" role="group" aria-label={m.music_drills_licks_chunk()}>
              <span class="shrink-0 text-sm text-ws-stage-soft">{m.music_drills_licks_chunk()}</span>
              {#each barChunks as [a, b], i (i)}
                <button type="button" class="min-h-11 shrink-0 rounded-full border px-3 font-medium {lo === a && hi === b ? 'border-transparent bg-instr text-ws-stage' : 'border-ws-stage-ink/25 hover:bg-ws-stage-ink/10'}" aria-pressed={lo === a && hi === b} onclick={() => setChunk(a, b)}>{m.music_drills_licks_bar({ n: i + 1 })}</button>
              {/each}
              <button type="button" class="min-h-11 shrink-0 rounded-full border px-3 font-medium {whole ? 'border-transparent bg-instr text-ws-stage' : 'border-ws-stage-ink/25 hover:bg-ws-stage-ink/10'}" aria-pressed={whole} onclick={() => (chunkSel = null)}>{m.music_drills_licks_whole()}</button>
            </div>
          {/if}
          {#if s.ear}
            {#each [0.5, 0.75, 1] as speed (speed)}
              <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => demo(speed, 8)}>{m.music_drills_licks_loop_at({ percent: Math.round(speed * 100) })}</button>
            {/each}
            {#if hideNotes}
              <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => (peekedKey = lickKey)}>{m.music_drills_licks_show_notes()}</button>
            {/if}
          {:else if mode === "practice"}
            <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => demo(0.5)}>{m.music_drills_licks_half_speed()}</button>
            {#if whole}
              <!-- The staff carries its own tap hint; with no staff in view, the bars are the way in. -->
              {#if falling && barChunks.length > 1}<span class="text-sm text-ws-stage-soft">{m.music_drills_licks_pick_bar()}</span>{/if}
            {:else}
              <button type="button" class="min-h-11 rounded-full border border-ws-stage-ink/25 px-4 font-medium hover:bg-ws-stage-ink/10" onclick={() => demo(1, 3)}>{m.music_drills_licks_loop_three()}</button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
    <div class="flex min-h-0 flex-col" data-dock="music">
    {#if hideNotes}
      <p class="mb-3 rounded-xl bg-ws-stage-ink/8 p-4 text-sm" data-testid="licks-by-ear">
        {whole ? m.music_drills_licks_by_ear_lick() : m.music_drills_licks_by_ear_chunk()}
      </p>
    {:else}
    <div class="relative">
      <BeatLane
        rows={[{ id: "line", mark: "♪", label: m.music_drills_licks_lane_row(), hand: fretted ? undefined : "right", notes: timed.map((n) => ({ beat: n.beat, dur: n.dur, text: spell(n.midi) })) }]}
        beats={chunkBeats}
        beat={transport.beat}
        chords={laneChords.map((c) => ({ ...c, symbol: chord(c.symbol) }))}
        hidden={mode === "check" && !transport.playing}
        outcomes={mode === "practice" || phase === "results" ? { line: outcomes } : {}}
        label={m.music_drills_licks_lane_label({ count: chunk.length, progression: progression.map(chord).join(", ") })}
        dense={shortStage.current}
      />
    </div>
    {/if}
    {#if hideNotes}
      <!-- By ear: nothing written until the results. -->
    {:else if fretted && (mode === "practice" || transport.playing || phase === "results")}
      <div class="mb-3">
        <LineNotation
          notes={all.map((n) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, string: n.string, fret: n.fret }))}
          tuning={{ openStrings: GUITAR.openStrings, fretCount: GUITAR.fretCount, name: GUITAR.name }}
          title={lickKey}
          cursorBeat={demoCursor}
          groupStates={tabStates}
          selection={chunkRange}
          onselect={picking ? tapChunk : undefined}
          {bpm}
        />
      </div>
    {:else if falling}
      <FallingKeys score={lineScore(written)} low={span.low} high={span.high} beat={fallBeat} rest={t0} groupStates={tabStates} {marks} {flashes} />
    {:else if !fretted && (mode === "practice" || transport.playing || phase === "results")}
      <div class="mb-3">
        <LineNotation maxZoom={shortStage.current ? 1 : 1.3} notes={written} tuning={fretTuning(inst)} title={lickKey} cursorBeat={demoCursor} groupStates={tabStates} {keyFifths} selection={chunkRange} onselect={picking ? tapChunk : undefined} {bpm} />
      </div>
    {/if}
    </div>
    {#if fretted && ended}
      <!-- After the run the tab above, marked, is the result; the idle neck steps aside. -->
    {:else if fretted}
      <Fretboard openStrings={GUITAR.openStrings} from={frets.from} to={frets.to} marks={fretMarks} {flashes} label={m.music_drills_licks_fretboard_label()} />
      <p class="mt-3 text-sm text-ws-stage-soft">
        {m.music_drills_licks_fretboard_note()}
      </p>
    {:else}
      {#if !falling && !ended}
        <div class="flex flex-col" data-dock="instrument">
          <!-- The word for the last note has its own row between the music and the keys, never over them. -->
          {#if phase === "running" && mode === "practice"}<Verdict kind={verdict?.kind} text={verdict?.text} key={verdict?.key ?? 0} rail />{/if}
          <InstrumentStage line={all.map((n) => n.midi)} low={span.low} high={span.high} {marks} {flashes} fit />
        </div>
      {/if}
    {/if}
    {#if mode === "check" && !ended}<p class="mt-1 text-sm text-ws-stage-soft">{m.music_drills_licks_check_hidden()}</p>{/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} />
    {/if}
  {/snippet}
</DrillShell>
