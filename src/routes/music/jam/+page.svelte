<script lang="ts">
  // Jam (catalog 4.10): solo over a progression or a standard's form with every
  // pitch class of the current chord lit as chord tone, scale tone or avoid.
  // Practice describes each chorus. Check hides the tone roles, keeps the form
  // on the clock for a set number of choruses and grades each one on a game
  // (scoring/improv): chord tones on strong beats, guide-tone landings, time,
  // rests, or a constraint the paths name. Every run is saved as a take.
  // One of your scores with chord symbols and a melody plays as a tune too
  // (progression=song-<id>, or ?shelf=<path>/<song> for a shelf song), and its
  // head is drawn on the lead sheet for the games that need the melody.
  import { onDestroy, onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Music from "lucide-svelte/icons/music";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Upload from "lucide-svelte/icons/upload";
  import { FLAT_NAMES, noteName, pc, type NoteEvent } from "@repo/music-core";
  import { JAM_GROUPS, jamToneRoles, swings, transposeProgression, chorusBars } from "@repo/music-core/content/jam";
  import { ACCOMP_PROGRESSIONS } from "@repo/music-core/content/accompany";
  import { REHARM_DEVICES, TUNES, chorusLabel, formatReharm, parseReharm, reharmDevice, reharmOptions, reharmonise, sectionStarts, tuneFromScore, type HeadNote, type ReharmDevice } from "@repo/music-core/content/tunes";
  import type { Progression } from "@repo/music-core/content/jam";
  import { LEARNING_PATHS, type PathId } from "@repo/music-core/progress/paths";
  import { rng } from "@repo/music-core/content/random";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import { chorusReport, type ChorusReport } from "@repo/music-core/scoring/jam";
  import { IMPROV_GAMES, gameOf, gradeImprov, isCount, rangeText, restBar, tradeWindows, type ImprovGrade, type ImprovNote } from "@repo/music-core/scoring/improv";
  import type { Score } from "@repo/music-core";
  import { clamp } from "@repo/music-core/theory/notes";
  import { page } from "$app/state";
  import Staff from "$lib/music/notation/Staff.svelte";
  import type { ToneRole } from "@repo/music-core/theory/chords";
  import { TUNINGS } from "@repo/music-core/data/index";
  import { jamGameLesson } from "@repo/music-core/lessons/jam";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Results, { silentRun } from "$lib/music/components/Results.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Fretboard, { type FretMark } from "$lib/music/components/Fretboard.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import KeyPicker from "$lib/music/components/KeyPicker.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import type { CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage, panel } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, db, settings, type SequenceHandle } from "$lib/music/runtime";
  import { addShelfSong, shelfSong, type Song } from "$lib/music/hubs/library/songs";
  import { backingNotes, callNotes, chordVoicing, degreeLabel, positionAt, type BackingMode } from "$lib/music/drills/jam/backing";
  import { importTrack, listTracks, playTrack, type BackingTrack } from "$lib/music/drills/jam/tracks";
  import { chordToneNames, formPosition, laneBlocks, laneScale } from "$lib/music/drills/jam/lane";
  import { pairNotes, saveTake, takeToSequence, type MidiTake } from "$lib/music/takes";
  import Picker from "$lib/music/components/Picker.svelte";

  /** Jam's loops, the accompaniment's (minor blues, Bird blues, rhythm changes...) and the standards. */
  const POOL = [...ACCOMP_PROGRESSIONS, ...TUNES];
  const cfg = new DrillSetup("jam", { progression: "ii-v-i", backing: "both", transpose: 0, track: "", game: "free", choruses: 2, trade: 0, meter: 4, reharm: "" });
  const s = $derived(cfg.value);
  /** Your scores with chord symbols and a melody, as tunes with their head. */
  let library = $state.raw<{ progression: Progression; head: HeadNote[] }[]>([]);
  let libraryNote = $state("");
  const pool = $derived([...POOL, ...library.map((l) => l.progression)]);
  const base = $derived(pool.find((p) => p.id === s.progression) ?? POOL[0]);
  const game = $derived(gameOf(s.game));
  const CHORUS_COUNTS = [1, 2, 3, 4, 6, 8];
  const runChoruses = $derived(CHORUS_COUNTS.includes(s.choruses) ? s.choruses : 2);
  /** Bars you play and bars the band takes: the game's own, or trading fours or twos. */
  const windows = $derived(game.windows ?? tradeWindows(s.trade === 4 || s.trade === 2 ? s.trade : 0));
  let mode = $state<DrillMode>("practice");
  // A path link carries its tempo: the strip takes it once.
  const urlBpm = Number(page.url.searchParams.get("bpm"));
  if (urlBpm) void settings.ready.then(() => settings.update({ bpm: clamp(Math.round(urlBpm), 40, 220) }));
  /** The chart as written (in the chosen key), then with the sandbox's swaps and the meter. */
  const writtenProg = $derived(transposeProgression(base, s.transpose));
  const swaps = $derived(parseReharm(s.reharm));
  const meter = $derived(s.meter === 3 ? 3 : 4);
  const prog = $derived({ ...reharmonise(writtenProg, swaps), beatsPerBar: meter });
  /** The tune's melody in the chosen key, when it is one of your scores. */
  const head = $derived(library.find((l) => l.progression.id === base.id)?.head.map((n) => ({ ...n, midi: n.midi + s.transpose })) ?? null);
  const bpb = $derived(meter);
  // The practice strip owns the tempo; picking a progression sets it to the tune's.
  const bpm = $derived(settings.value.bpm);
  const beatMs = $derived(60000 / bpm);
  function pickProgression(id: string) {
    const tune = pool.find((p) => p.id === id);
    cfg.set({ progression: id, reharm: "", meter: tune?.beatsPerBar ?? 4 });
    if (tune) settings.update({ bpm: tune.bpm });
  }
  /** The key the circle shows; a pick becomes the shortest transposition to it. */
  const keyPc = $derived(pc(base.keyPc + s.transpose));
  function pickKey(target: number) {
    let t = (target - base.keyPc) % 12;
    if (t > 6) t -= 12;
    if (t < -6) t += 12;
    cfg.set({ transpose: t });
  }
  const backingMode = $derived(s.backing as BackingMode | "track");

  let phase = $state<Phase>("ready");
  let status = $state("");
  let chordIdx = $state(0);
  let chorus = $state(1);
  let beatInChord = $state(0);
  let backingOn = $state(false);
  let lastNote = $state<{ midi: number; role: ToneRole; label: string; symbol: string } | null>(null);
  let played = $state.raw<{ midi: number; at: number; chordIndex: number; chorus: number }[]>([]);
  let choruses = $state.raw<{ n: number; report: ChorusReport; startAt: number; endAt: number }[]>([]);
  let savedTake = $state.raw<MidiTake | null>(null);
  let tracks = $state.raw<BackingTrack[]>([]);
  let trackError = $state("");
  let cap: Capture | null = null;
  let seq: SequenceHandle | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  /** True while the form runs on the clock (`seg`), so the lane can glide with it. */
  let clockOn = $state(false);
  let seg = { startPerf: 0, fromChord: 0, chorusBase: 1 };
  let runStart = 0;
  let chorusStart = 0;
  let review: SequenceHandle | null = $state(null);
  /** Check mode: the form runs on the clock from the downbeat, and the run ends after its choruses. */
  let checking = $state(false);
  let downbeat = $state(0);
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let stopClockRef: (() => void) | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let graded = $state.raw<ImprovGrade | null>(null);
  let delta = $state<number | null>(null);

  async function loadLibrary() {
    const rows = (await db.songs.toArray()) as unknown as Song[];
    library = rows.flatMap((r) => {
      const t = r.score ? tuneFromScore(r.score, `song-${r.id}`, r.title) : null;
      return t ? [t] : [];
    });
  }

  onMount(async () => {
    tracks = await listTracks().catch(() => []);
    await loadLibrary().catch(() => {});
    // A shelf song by its key: the library copy, added from its downloaded score when there is none.
    const key = page.url.searchParams.get("shelf");
    if (!key) return;
    const [path, id] = key.split("/");
    const entry = LEARNING_PATHS[path as PathId]?.levels?.flatMap((l) => l.shelf).find((x) => x.id === id);
    try {
      const song = (await shelfSong(key)) ?? (await addShelfSong(key, entry?.title ?? id, entry?.artist));
      await loadLibrary();
      if (!library.some((l) => l.progression.id === `song-${song.id}`)) throw new Error(`${song.title} has no chord symbols, so Jam cannot read its changes.`);
      pickProgression(`song-${song.id}`);
    } catch (e) {
      libraryNote = (e as Error).message;
    }
  });

  const chord = $derived(prog.chords[chordIdx] ?? prog.chords[0]);
  const roles = $derived(jamToneRoles(chord));
  const instrument = $derived(settings.value.activeInstrument);
  const fretted = $derived(instrument === "guitar" || instrument === "ukulele");
  const tuning = $derived(
    instrument === "ukulele"
      ? (TUNINGS.ukulele.find((t) => t.id === settings.value.ukuleleTuningId) ?? TUNINGS.ukulele[0])
      : (TUNINGS.guitar.find((t) => t.id === settings.value.guitarTuningId) ?? TUNINGS.guitar[0]),
  );

  /** Check hides the tone roles: the targets are the player's to hear. */
  const showRoles = $derived(!(checking || (mode === "check" && phase !== "results")));
  const pianoMarks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (!showRoles) return out;
    // Degrees only on the notes that fit (chord and scale tones); an avoid note keeps its dashed ring, unlabelled.
    for (let m = 48; m <= 84; m++) out[m] = { label: roles[pc(m)] === "avoid" ? undefined : degreeLabel(chord.symbol, pc(m)), role: roles[pc(m)] };
    return out;
  });
  const fretMarks = $derived.by(() => {
    const out: FretMark[] = [];
    if (!showRoles) return out;
    tuning.openStrings.forEach((open, i) => {
      for (let f = 0; f <= 12; f++) out.push({ string: i + 1, fret: f, label: roles[pc(open + f)] === "avoid" ? undefined : degreeLabel(chord.symbol, pc(open + f)), role: roles[pc(open + f)] });
    });
    return out;
  });

  const ROLE_TEXT: Record<ToneRole, string> = { chord: "chord tone", scale: "scale tone", avoid: "avoid note" };
  const scaleName = (c: typeof chord) => `${FLAT_NAMES[c.scale.rootPc]} ${c.scale.name}`;

  // ---- Backing ------------------------------------------------------------
  function tick() {
    const pos = positionAt(prog, seg.fromChord, (performance.now() - seg.startPerf) / beatMs);
    const nextChorus = seg.chorusBase + pos.choruses;
    beatInChord = pos.beatInChord;
    if (nextChorus !== chorus) closeChorus();
    chordIdx = pos.chordIndex;
  }

  async function startBacking() {
    if (backingOn || backingMode === "none") return;
    await audio.unlock();
    try {
      if (backingMode === "track") {
        if (!s.track) throw new Error("Pick or import a backing track in the setup first.");
        seq = await playTrack(s.track);
      } else {
        const band = backingNotes(prog, { bpm, mode: backingMode, choruses: checking ? runChoruses : 64, fromChord: chordIdx, windows: checking ? windows : undefined });
        const calls = checking && windows?.bandPlays === "call" ? callNotes(prog, windows, runChoruses * barsTotal, bpm, rng(Math.floor(Math.random() * 2 ** 31))) : [];
        seq = audio.playSequence([...band, ...calls], checking ? { startPerf: downbeat } : {});
      }
    } catch (e) {
      status = (e as Error).message;
      return;
    }
    // The form clock starts with the audio, or now if the browser has no sound yet.
    seg = { startPerf: checking ? downbeat : seq.playing ? seq.startPerf : performance.now(), fromChord: chordIdx, chorusBase: chorus };
    backingOn = true;
    ticker = setInterval(tick, 40);
    clockOn = true;
    status = backingMode === "track" ? "Backing track playing. Chords follow the tempo you set." : `Backing playing at ${bpm} BPM.`;
  }

  function stopBacking() {
    clearInterval(ticker);
    clockOn = false;
    seq?.stop();
    seq = null;
    if (backingOn) status = "Backing paused. Move through the chords with Next chord.";
    backingOn = false;
    beatInChord = 0;
  }

  // ---- Run ----------------------------------------------------------------
  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    played = [...played, { midi: e.midi, at: e.at, chordIndex: chordIdx, chorus }];
    lastNote = { midi: e.midi, role: roles[pc(e.midi)], label: degreeLabel(chord.symbol, pc(e.midi)), symbol: chord.symbol };
  }

  function closeChorus() {
    const now = performance.now();
    if (checking) {
      // Check says nothing about a chorus until the run is graded.
      chorus += 1;
      chorusStart = now;
      return;
    }
    const notes = played.filter((n) => n.chorus === chorus);
    const report = chorusReport(prog, notes);
    choruses = [...choruses, { n: chorus, report, startAt: chorusStart, endAt: now }];
    status = `Chorus ${chorus}: ${report.headline}`;
    chorus += 1;
    chorusStart = now;
  }

  function nextChord() {
    if (backingOn) return;
    const next = (chordIdx + 1) % prog.chords.length;
    if (next === 0) closeChorus();
    chordIdx = next;
  }

  function playChord() {
    void audio.unlock().then(() => {
      const v = chordVoicing(chord.symbol);
      audio.playChord([v.bass, ...v.upper], 1.4);
    });
  }

  async function start(ctx: RunContext) {
    stopReview();
    graded = null;
    delta = null;
    checking = ctx.mode === "check";
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = checking
      ? practice.beginRun({
          exerciseId: "jam.improv",
          setupKey: `jam|${base.id}|${s.transpose}|${game.id}|${s.trade}|${runChoruses}|${bpm}|${meter}|${s.reharm}`,
          skillIds: [],
          capabilities: ["harmony"],
          modality: "played",
          assistance: assistanceFor(ctx.mode),
          difficulty: base.difficulty === "advanced" ? 0.7 : base.difficulty === "intermediate" ? 0.5 : 0.3,
        })
      : null;
    chordIdx = 0;
    chorus = 1;
    played = [];
    choruses = [];
    lastNote = null;
    savedTake = null;
    runStart = ctx.downbeat;
    chorusStart = ctx.downbeat;
    // Half a beat of grace before the downbeat, as the timed drills allow.
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => (e.kind === "noteon" || e.kind === "noteoff") && onNote(e));
    if (checking) {
      // The form follows the clock whatever the backing, and the run ends with its last chorus.
      status = `${game.label}: ${game.about}`;
      if (backingMode === "none" || backingMode === "track") {
        if (backingMode === "track") await startBacking();
        seg = { startPerf: ctx.downbeat, fromChord: 0, chorusBase: 1 };
        clearInterval(ticker);
        ticker = setInterval(tick, 40);
        clockOn = true;
      } else await startBacking();
      endTimer = setTimeout(() => void stop(), ctx.downbeat + runChoruses * barsTotal * bpb * beatMs + beatMs / 2 - performance.now());
      return;
    }
    status = backingMode === "none" ? "Play. Move to the next chord with Next chord (or N)." : "Play over the changes.";
    await startBacking();
  }

  async function stop() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(endTimer);
    stopClockRef?.();
    stopBacking();
    clearInterval(ticker);
    clockOn = false;
    cap?.stop();
    const endAt = performance.now();
    if (played.some((n) => n.chorus === chorus)) closeChorus();
    phase = "results";
    const events = cap?.notes ?? [];
    cap = null;
    const count = played.length;
    if (checking) return finishCheck(events, endAt);
    if (!count) {
      status = "Nothing was played, so nothing was saved.";
      return;
    }
    const inst = runInstrument(events);
    const headline = `${count} note${count === 1 ? "" : "s"} over ${choruses.length} chorus${choruses.length === 1 ? "" : "es"} of ${prog.name} in ${prog.key}`;
    const take: MidiTake = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      name: `Jam: ${prog.name} in ${prog.key}`,
      notes: pairNotes(events, runStart, endAt),
      durationMs: Math.round(endAt - runStart),
      instrument: inst,
      note: choruses.map((c) => `Chorus ${c.n}: ${c.report.headline}`).join("\n"),
    };
    await saveTake(take);
    savedTake = take;
    await practice.logSession(
      "jam",
      inst,
      {
        exerciseId: "jam.improv",
        setupKey: `${prog.id}|${s.transpose}|${s.backing}|${bpm}`,
        promptIds: [],
        skillIds: [],
        difficulty: base.difficulty === "advanced" ? 0.7 : base.difficulty === "intermediate" ? 0.5 : 0.3,
        instrument: inst,
        params: { progression: prog.id, key: prog.key, bpm, transpose: s.transpose, backing: s.backing, notes: count, choruses: choruses.length, takeId: take.id, meter, ...reharmParams },
        startedAt: Date.now() - take.durationMs,
        endedAt: Date.now(),
        assistance: "guided",
        headline,
      },
      ["jam", prog.group],
    );
    status = `${headline}. Saved as a take and logged in your journal.`;
  }

  /** Pair each note-on with its release, in beats from the top of the form. */
  function improvNotes(events: { kind: string; midi: number; at: number }[]): ImprovNote[] {
    const out: ImprovNote[] = [];
    const open = new Map<number, ImprovNote>();
    for (const e of events) {
      const beat = (e.at - downbeat) / beatMs;
      if (e.kind === "noteon") {
        const n: ImprovNote = { midi: e.midi, beat };
        out.push(n);
        open.set(e.midi, n);
      } else if (e.kind === "noteoff" && open.has(e.midi)) {
        open.get(e.midi)!.end = beat;
        open.delete(e.midi);
      }
    }
    return out;
  }

  /** Grade the choruses that finished (a stop part way through grades the whole ones before it). */
  async function finishCheck(events: NonNullable<Capture["notes"]>, endAt: number) {
    checking = false;
    const done = Math.min(runChoruses, Math.floor((endAt - downbeat + beatMs / 2) / (barsTotal * bpb * beatMs)));
    const notes = improvNotes(events);
    if (!done || !notes.length) {
      status = !notes.length ? "Nothing was played, so nothing was recorded." : "Stopped before the first chorus ended, so nothing was graded.";
      return;
    }
    const g = gradeImprov(prog, notes, { game, choruses: done, swing: swings(prog), bpm, windows: s.trade ? windows : undefined, head: head ?? undefined });
    graded = g;
    const inst = runInstrument(events);
    const take: MidiTake = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      name: `Jam: ${game.label} over ${prog.name} in ${prog.key}`,
      notes: pairNotes(events, runStart, endAt),
      durationMs: Math.round(endAt - runStart),
      instrument: inst,
      note: g.choruses.map((c) => `${chorusName(c.index, done)}: ${pct(c.score)}`).join("\n"),
    };
    await saveTake(take);
    savedTake = take;
    choruses = g.choruses.map((c) => ({ n: c.index + 1, report: chorusReport(prog, []), startAt: downbeat + c.index * barsTotal * bpb * beatMs, endAt: downbeat + (c.index + 1) * barsTotal * bpb * beatMs }));
    const fin = await run!.finish({
      score: g.score,
      correct: g.passed,
      headline: g.headline,
      params: { progression: prog.id, key: prog.key, bpm, transpose: s.transpose, backing: s.backing, game: game.id, trade: s.trade, notes: notes.length, choruses: done, takeId: take.id, meter, ...reharmParams },
    });
    delta = fin.delta;
    status = g.headline;
  }

  /** "Head", "Solo 2" in a tune's form; "Chorus 3" otherwise. */
  const chorusName = (k: number, total: number) => (base.sections || head ? chorusLabel(k, total) : `Chorus ${k + 1}`);

  function stopReview() {
    review?.stop();
    review = null;
  }
  async function playChorus(c: { startAt: number; endAt: number }) {
    stopReview();
    if (!savedTake) return;
    await audio.unlock();
    const from = c.startAt - runStart;
    const to = c.endAt - runStart;
    const notes = takeToSequence({ ...savedTake, notes: savedTake.notes.filter((n) => n.startMs >= from && n.startMs < to).map((n) => ({ ...n, startMs: n.startMs - from })) });
    review = audio.playSequence(notes);
  }

  async function addTrack(file: File | undefined) {
    if (!file) return;
    trackError = "";
    try {
      const t = await importTrack(file);
      tracks = [t, ...tracks];
      cfg.set({ track: t.id, backing: "track" });
      status = `Imported ${t.name}. It plays as the backing.`;
    } catch (e) {
      trackError = (e as Error).message;
      status = trackError;
    }
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (e.code === "KeyN" && phase === "running" && !backingOn && !t?.closest("input, select, textarea")) {
      e.preventDefault();
      nextChord();
    }
  }

  onDestroy(() => {
    clearTimeout(endTimer);
    stopBacking();
    cap?.stop();
    stopReview();
  });

  const summaryLine = $derived([
    { text: `${prog.name} in ${prog.key}`, focus: "progression" },
    { text: game.id === "free" ? "solo over the changes" : game.label.toLowerCase(), focus: "game" },
    { text: `${runChoruses} chorus${runChoruses === 1 ? "" : "es"} in Check${s.trade && !game.windows ? `, trading ${s.trade === 4 ? "fours" : "twos"}` : ""}`, focus: "choruses" },
    { text: backingMode === "none" ? "no backing, chords by hand" : backingMode === "track" ? "your backing track" : backingMode === "both" ? "drums and chords" : backingMode === "rhythm" ? "drums and bass" : backingMode, focus: "backing" },
    ...(meter === 3 ? [{ text: "in 3/4", focus: "meter" }] : []),
    ...(swaps.size ? [{ text: `${swaps.size} chord${swaps.size === 1 ? "" : "s"} reharmonised`, focus: "reharm" }] : []),
    ...(s.transpose ? [{ text: `transposed ${s.transpose > 0 ? "+" : ""}${s.transpose}`, focus: "transpose" }] : []),
  ]);
  const barsTotal = $derived(chorusBars(prog));
  /** Where the form is now, in beats from the top of the chorus. */
  const formBeat = $derived(prog.chords.slice(0, chordIdx).reduce((n, c) => n + c.bars, 0) * bpb + beatInChord);
  const sections = $derived(sectionStarts(prog));
  /** A tune's lead sheet: the changes over empty bars, read with the player's own melody, or your score's head. */
  const leadSheet = $derived<Score | null>(
    base.sections || head
      ? {
          id: `lead-${prog.id}-${s.transpose}-${meter}-${s.reharm}`,
          title: prog.name,
          bpm,
          meter: { beats: bpb, beatUnit: 4 },
          keyFifths: signatureFor(prog.keyPc, /minor/.test(prog.key) ? "natural-minor" : /dorian/.test(prog.key) ? "dorian" : "major"),
          voices: [{ id: "line", name: "Melody", notes: (head ?? []).map((n) => ({ midi: n.midi, startBeat: n.beat, durationBeats: n.end - n.beat })) }],
          lengthBeats: barsTotal * bpb,
          chords: prog.chords.map((c, i) => ({ symbol: c.symbol, startBeat: prog.chords.slice(0, i).reduce((n, x) => n + x.bars, 0) * bpb, durationBeats: c.bars * bpb })),
          source: { kind: "generated" },
        }
      : null,
  );
  /** Whose bars these are, in a game or trade with windows (bars from the top of the run). */
  const runBar = $derived((chorus - 1) * barsTotal + Math.floor(formBeat / bpb));
  const bandNow = $derived(restBar(prog, game, windows, runBar));
  /** A reharmonised run records its device (one kind, or "mixed") and the swaps. */
  const reharmParams = $derived<Record<string, string>>(swaps.size ? { reharm: reharmDevice(swaps)!, swaps: formatReharm(swaps) } : {});

  // ---- Reharmonisation sandbox -------------------------------------------
  let swapAt = $state(0);
  const swapIndex = $derived(Math.min(swapAt, writtenProg.chords.length - 1));
  function toggleSwap(i: number, d: ReharmDevice) {
    const next = new Map(swaps);
    if (next.get(i) === d) next.delete(i);
    else next.set(i, d);
    cfg.set({ reharm: formatReharm(next) });
  }
  let preview = $state<SequenceHandle | null>(null);
  async function hearChart() {
    if (preview) {
      preview.stop();
      preview = null;
      return;
    }
    await audio.unlock();
    const h = audio.playSequence(backingNotes(prog, { bpm, mode: "both", choruses: 1 }));
    preview = h;
    setTimeout(() => preview === h && (preview = null), chorusBars(prog) * bpb * beatMs + 500);
  }
  const compHref = $derived(`/music/accompany?mode=comping&progression=${base.id}&transpose=${s.transpose}${s.reharm ? `&reharm=${s.reharm}` : ""}`);
  const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  // ---- Form lane ----------------------------------------------------------
  const chordBeats = $derived(prog.chords.map((c) => c.bars * bpb));
  /** Beats from the top of the run, read off the form clock every frame while it runs. */
  let clockBeat = $state(0);
  $effect(() => {
    if (!clockOn) return;
    const lengths = chordBeats;
    let raf = 0;
    const frame = () => {
      clockBeat = formPosition(lengths, seg.chorusBase, seg.fromChord) + (performance.now() - seg.startPerf) / beatMs;
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  });
  const reduceQuery = new MediaQuery("(prefers-reduced-motion: reduce)");
  const still = $derived(reduceQuery.current || settings.value.reduceMotion);
  const laneBeat = $derived(clockOn ? clockBeat : formPosition(chordBeats, chorus, chordIdx) + beatInChord);
  /** Reduced motion: the lane steps a beat at a time instead of gliding. */
  const laneAt = $derived(still ? Math.floor(laneBeat + 1e-6) : laneBeat);
  let laneW = $state(0);
  const scale = $derived(laneScale(laneW));
  const lane = $derived(laneBlocks(chordBeats, laneAt, scale.playheadX / scale.pxPerBeat + 1, (laneW - scale.playheadX) / scale.pxPerBeat + 1));
  const tones = $derived(chordToneNames(chord.symbol));
</script>

<svelte:head><title>Jam | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<DrillShell
  title="Jam"
  hue={instrument}
  blurb="Solo over a progression or a standard's form as the changes slide by."
  summary={summaryLine}
  modeNotes={{ practice: "Tone roles lit, each chorus described. Nothing is graded.", check: "Tone roles hidden. The form runs for the choruses you set, each graded on the game." }}
  clock={{ bpm, beatsPerBar: bpb }}
  bind:phase
  bind:mode
  bind:status
  progress={checking ? ((chorus - 1) * barsTotal + formBeat / bpb) / (runChoruses * barsTotal) : formBeat / bpb / barsTotal}
  lesson={{ lessons: jamGameLesson(game.id), trigger: "check" }}
  blocked={backingMode === "track" && !s.track ? "Pick or import a backing track in the setup first." : game.head && !head ? `${game.label} needs a tune with its melody: pick one of your scores in Progression.` : null}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="progression">
        <span class="font-medium">Progression</span>
        <Picker
          label="Progression"
          value={base.id}
          options={[
            ...JAM_GROUPS.flatMap((g) => POOL.filter((p) => p.group === g.id).map((p) => ({ value: p.id, label: `${p.name} (${p.difficulty})`, group: g.label }))),
            ...library.map((l) => ({ value: l.progression.id, label: l.progression.name, group: "Your scores with chords and melody" })),
          ]}
          onchange={pickProgression}
        />
        <span class="text-ws-soft">Written at {base.bpm} BPM; the tempo is in the practice strip.{base.composer ? ` ${base.composer}: the changes only, read the head from your book.` : head ? " Your score: its chords and its melody." : ""}</span>
        {#if libraryNote}<p role="alert" class="font-medium text-destructive">{libraryNote} <a class="underline underline-offset-4" href="/music/library?tab=import">Import a score</a></p>{/if}
      </div>
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="game">
        <span class="font-medium">Game</span>
        <Picker label="Game" value={game.id} options={IMPROV_GAMES.map((g) => ({ value: g.id, label: g.label, group: g.id === "free" || g.id === "changes" || g.id === "chord-tones" ? "Over the changes" : g.head ? "On the head (your scores)" : g.windows || g.only ? "Space and answers" : g.set ? "Note sets" : "Targets and rhythm" }))} onchange={(v) => cfg.set({ game: v })} />
        <span class="text-ws-soft">{game.about}</span>
        {#if game.head && !head}<span class="text-ws-soft">Import a lead sheet with chord symbols (MusicXML from MuseScore) in Library, then pick it in Progression.</span>{/if}
      </div>
      <Choice label="Choruses in Check" setupKey="choruses" options={CHORUS_COUNTS.map((n) => ({ value: n, label: String(n) }))} value={runChoruses} onchange={(v) => cfg.set({ choruses: v })} />
      <Choice
        label="Trade with the band"
        setupKey="trade"
        disabled={!!game.windows}
        options={[
          { value: 0, label: "No trading" },
          { value: 4, label: "Fours", hint: "You take four bars, the drums take four." },
          { value: 2, label: "Twos", hint: "You take two bars, the drums take two." },
        ]}
        value={game.windows ? 0 : s.trade}
        onchange={(v) => cfg.set({ trade: v })}
      />
      <Choice
        label="Backing"
        setupKey="backing"
        options={[
          { value: "both", label: "Drums and chords" },
          { value: "drums", label: "Drums" },
          { value: "rhythm", label: "Drums and bass" },
          { value: "chords", label: "Chords" },
          ...(tracks.length ? [{ value: "track", label: "Your track" }] : []),
          { value: "none", label: "None, chords by hand" },
        ]}
        value={s.backing}
        onchange={(v) => cfg.set({ backing: v })}
      />
      <Choice
        label="Meter"
        setupKey="meter"
        options={[
          { value: 4, label: "4/4" },
          { value: 3, label: "3/4 waltz", hint: "Three beats a bar; the band plays a jazz waltz." },
        ]}
        value={meter}
        onchange={(v) => cfg.set({ meter: v })}
      />
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="transpose">
        <span class="font-medium">Key</span>
        <KeyPicker label="Key" value={keyPc} onchange={pickKey} name={(k) => `${FLAT_NAMES[k]}${k === base.keyPc ? " (written)" : ""}`} />
        <span class="text-ws-soft">{s.transpose ? `Transposed ${s.transpose > 0 ? "+" : ""}${s.transpose} from ${base.key}.` : "The written key."}</span>
      </div>
    </div>
    <div class="mt-4 border-t border-ws-line pt-4" data-setup="reharm">
      <p class="text-sm font-medium">Reharmonise</p>
      <p class="text-sm text-ws-soft">Swap a chord for a substitute, hear the chart, then play over it. To grade your comping on it, open it in Accompaniment.</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Picker class="w-auto min-w-40" label="Chord to swap" value={String(swapIndex)} options={writtenProg.chords.map((c, i) => ({ value: String(i), label: `${i + 1}. ${c.symbol}${swaps.has(i) ? " (swapped)" : ""}` }))} onchange={(v) => (swapAt = Number(v))} />
        {#each REHARM_DEVICES.filter((d) => reharmOptions(writtenProg, swapIndex).includes(d.id)) as d (d.id)}
          <button type="button" class={btn} aria-pressed={swaps.get(swapIndex) === d.id} title={d.about} onclick={() => toggleSwap(swapIndex, d.id)}>{d.label}</button>
        {/each}
      </div>
      {#if swaps.size}
        <p class="mt-2 text-sm" data-testid="jam-reharm">Now: {prog.chords.map((c) => c.symbol).join(" ")}</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" class={btn} aria-pressed={!!preview} onclick={hearChart}>{#if preview}<Square class="size-4" aria-hidden="true" />Stop{:else}<Play class="size-4" aria-hidden="true" />Hear it{/if}</button>
          <a class={btn} href={compHref}>Comp it in Accompaniment</a>
          <button type="button" class={btn} onclick={() => cfg.set({ reharm: "" })}>Back to the written chart</button>
        </div>
      {/if}
    </div>
    <div class="mt-4 border-t border-ws-line pt-4" id="backing-tracks">
      <p class="text-sm font-medium">Your backing tracks</p>
      <p class="text-sm text-ws-soft">Audio files you bring (the jazz tracks in the Reference aren't shipped). They stay in this browser.</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        {#if tracks.length}
          <Picker class="w-auto min-w-40" label="Backing track" placeholder="Choose a track" value={s.track} options={tracks.map((t) => ({ value: t.id, label: t.name }))} onchange={(v) => cfg.set({ track: v, backing: "track" })} />
        {/if}
        <label class="{btn} cursor-pointer focus-within:outline-2">
          <Upload class="size-4" aria-hidden="true" />Import a track
          <input class="sr-only" type="file" accept="audio/*" aria-label="Import a backing track" onchange={(e) => addTrack(e.currentTarget.files?.[0])} />
        </label>
        {#if trackError}<p role="alert" class="text-sm font-medium text-destructive">{trackError}</p>{/if}
      </div>
    </div>
  {/snippet}

  {#snippet hud()}
    <Stat label="Backing" value={phase === "running" ? (backingOn ? "Playing" : backingMode === "none" ? "By hand" : "Stopped") : backingMode === "none" ? "By hand" : "Ready"} />
    {#if phase === "running" || phase === "results"}
      <Stat label="Notes recorded" value={played.length} />
      <Stat label="Chorus" value={phase === "results" ? choruses.length : chorus} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div hidden data-testid="jam-clock" data-downbeat={phase === "running" || phase === "countin" ? Math.round(downbeat) : undefined} data-beat-ms={beatMs}></div>
    {#if mode === "check" || checking}
      <p class="mb-3 text-sm" data-testid="jam-game">
        <span class="font-semibold">{game.label}.</span>
        {#if phase === "running" && windows}
          <span class="window-pill" data-band={bandNow}>{bandNow ? (windows.bandPlays === "call" ? "The band's call: listen" : windows.bandPlays === "drums" ? "The drums' bars: rest" : "Rest") : "Your bars: play"}</span>
        {:else if phase === "running" && game.only}
          <span class="window-pill" data-band={bandNow}>{bandNow ? "An A section: rest or play the head" : "The bridge: improvise"}</span>
        {/if}
        {#if phase === "running" && checking}<span class="text-ws-stage-soft">{chorusName(chorus - 1, runChoruses)}, {chorus} of {runChoruses}</span>{/if}
      </p>
    {/if}
    {#if leadSheet}
      <div class="mb-4" data-testid="jam-lead-sheet">
        <p class="mb-1 text-sm text-ws-stage-soft">
          {prog.name}, {sections.map((x) => x.label).join(" ")} ({barsTotal} bars){phase === "running" && !checking ? `. ${chorusName(chorus - 1, chorus + 2)}` : ""}
        </p>
        <Staff score={leadSheet} cursorBeat={phase === "running" ? formBeat : null} highlights={sections.map((x) => ({ startBeat: x.bar * bpb, endBeat: (x.bar + x.bars) * bpb, label: x.label }))} maxHeight="24rem" />
      </div>
    {/if}
    <ol class="sr-only" aria-label="The form, {prog.name}">
      {#each prog.chords as c, i (i)}
        <li aria-current={i === chordIdx ? "step" : undefined}>{c.symbol}, {c.bars} bar{c.bars > 1 ? "s" : ""}{i === chordIdx ? ", now" : ""}</li>
      {/each}
    </ol>
    <!-- The form lane: chords as wide as their beats slide left past a fixed playhead, so the next one is always arriving. -->
    <div class="lane mb-4" class:glide={!clockOn && !still} bind:clientWidth={laneW} aria-hidden="true" data-testid="jam-lane">
      <div class="track" style:transform="translateX({scale.playheadX - laneAt * scale.pxPerBeat}px)">
        {#each lane as b (b.key)}
          {@const sym = prog.chords[b.index].symbol}
          <div class="block" data-state={b.state} style:left="{b.start * scale.pxPerBeat}px" style:width="{b.beats * scale.pxPerBeat - 4}px">
            {#if b.state === "next"}<span class="next-tag">Next</span>{/if}
            <span class="sym font-display">{sym}</span>
            <!-- A dot in the middle of each beat, lit once the playhead is in it; a bar's first beat is a dash. -->
            <span class="ticks">
              {#each Array.from({ length: Math.ceil(b.beats - 1e-6) }, (_, k) => k) as k (k)}
                <span class="tick" class:bar={(b.start + k) % bpb === 0} class:on={b.state === "past" || (b.state === "now" && b.start + k <= laneAt + 1e-6)} style:left="{(k + 0.5) * scale.pxPerBeat}px"></span>
              {/each}
            </span>
          </div>
        {/each}
      </div>
      <div class="playhead" style:left="{scale.playheadX}px"></div>
    </div>

    <div class="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div class="min-w-0">
        <p class="text-sm text-ws-stage-soft">Now</p>
        <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
          {#key chord.symbol}
            <p class="now-chord font-display text-5xl font-bold leading-none" data-testid="jam-chord">{chord.symbol}</p>
          {/key}
          {#if showRoles && tones.length}
            <ul class="flex flex-wrap gap-1.5" aria-label="Chord tones of {chord.symbol}">
              {#each tones as t (t.label)}
                <li class="tone-chip"><span class="text-xs opacity-75">{t.label}</span>{t.name}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <p class="mt-2 text-ws-stage-soft">{showRoles ? `${scaleName(chord)} fits. ` : ""}Next: {prog.chords[(chordIdx + 1) % prog.chords.length].symbol}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btnStage} onclick={playChord}><Music class="size-4" aria-hidden="true" />Play the chord</button>
        {#if phase === "running"}
          {#if !checking && !backingOn}<button type="button" class={btnStage} onclick={nextChord}><SkipForward class="size-4" aria-hidden="true" />Next chord <kbd class="text-xs opacity-60">N</kbd></button>{/if}
          {#if backingMode !== "none" && !checking}
            <button type="button" class={btnStage} aria-pressed={backingOn} onclick={() => (backingOn ? stopBacking() : startBacking())}>
              {#if backingOn}<Square class="size-4" aria-hidden="true" />Pause the backing{:else}<Play class="size-4" aria-hidden="true" />Play the backing{/if}
            </button>
          {/if}
        {/if}
      </div>
    </div>

    {#if fretted}
      <Fretboard openStrings={tuning.openStrings} from={0} to={12} marks={fretMarks} label="{tuning.name} fretboard, tone roles over {chord.symbol}" />
    {:else}
      <Piano low={48} high={84} marks={pianoMarks} names="c" label="Keyboard, tone roles over {chord.symbol}" />
    {/if}

    <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" class:hidden={!showRoles}>
      <span class="flex items-center gap-2"><span class="legend fill" style:background="var(--tone-chord)" aria-hidden="true"></span>Chord tone (filled gold)</span>
      <span class="flex items-center gap-2"><span class="legend fill" style:background="var(--tone-scale)" aria-hidden="true"></span>Scale tone (filled blue)</span>
      <span class="flex items-center gap-2"><span class="legend ring" aria-hidden="true"></span>Avoid (dashed ring)</span>
      <span class="text-ws-stage-soft">Labels are degrees over the chord, on the notes that fit.</span>
    </div>

    {#if lastNote && showRoles}
      <p class="mt-3 text-lg" data-testid="jam-last">
        <span class="font-display font-semibold">{noteName(lastNote.midi)}</span>
        <span class="role-pill" data-role={lastNote.role}>{lastNote.role === "chord" ? "●" : lastNote.role === "scale" ? "◐" : "○"} {ROLE_TEXT[lastNote.role]}</span>
        <span class="text-ws-stage-soft">({lastNote.label} of {lastNote.symbol})</span>
      </p>
    {/if}
    {#if phase === "running" && choruses.length && !checking}
      {@const c = choruses[choruses.length - 1]}
      <p class="mt-2 text-sm text-ws-stage-soft">Chorus {c.n}: {c.report.headline}</p>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if graded}
      <article class="{panel} flex flex-col gap-4" data-testid="jam-graded">
        <div class="flex flex-wrap items-start gap-4">
          <div class="min-w-0 flex-1 basis-72">
            <p class="font-display text-2xl font-semibold leading-snug">{graded.headline}</p>
            <p class="mt-1 text-sm text-ws-soft">{assistanceText("check")} {game.combine === "min" ? "A chorus scores its weakest part against its aim; the run is the mean of its choruses." : "A chorus scores the mean of its parts against their aims; the run is the mean of its choruses."}</p>
            {#if savedTake}<p class="mt-2 text-sm">Saved as a take. <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Open it in Record</a></p>{/if}
          </div>
          <div class="text-right">
            <p class="tnum font-display text-5xl font-bold leading-none" data-testid="jam-score">{pct(graded.score)}</p>
            <p class="mt-1 text-sm text-ws-soft">score{delta !== null ? `, ${delta >= 0 ? "+" : ""}${Math.round(delta)} on last time` : ""}</p>
          </div>
        </div>
        <ol class="flex flex-col gap-3" aria-label="Choruses graded">
          {#each graded.choruses as c (c.index)}
            <li class="rounded-xl border border-ws-line p-3">
              <div class="flex flex-wrap items-center gap-3">
                <p class="min-w-0 flex-1"><span class="font-semibold">{chorusName(c.index, graded.choruses.length)}.</span> {pct(c.score)}{c.passed ? ", every aim met" : ""}</p>
                {#if savedTake && c.notes}
                  <button type="button" class={btn} onclick={() => playChorus(choruses[c.index])}><Play class="size-4" aria-hidden="true" />Hear this chorus</button>
                {/if}
              </div>
              <ul class="mt-2 flex flex-col gap-1 text-sm">
                {#each c.parts as part (part.metric)}
                  <li class="flex flex-wrap gap-x-2">
                    <span class="font-medium">{part.label}:</span>
                    <span>{part.detail}{part.value !== null && !isCount(part.metric) ? ` (${pct(part.value)})` : ""}, aim {isCount(part.metric) ? part.aim : pct(part.aim)}</span>
                    {#if part.credit >= 1}<span class="text-ws-soft">met</span>{/if}
                  </li>
                {/each}
              </ul>
              <p class="mt-2 text-sm text-ws-soft">
                {c.notes} notes, range {rangeText(c.range)}. {c.phrases.count} phrase{c.phrases.count === 1 ? "" : "s"}, {c.phrases.meanBars} bars long on average; {c.measures.rests?.detail}.
                {c.measures.time?.value != null ? `${pct(c.measures.time.value)} on the ${swings(prog) ? "swing (triplet)" : "sixteenth"} grid` : ""}{c.swing !== null ? `, swing ${c.swing}:1` : ""}.
                {game.id !== "free" && c.measures.strong?.value != null ? ` Chord tones on 1 and 3: ${pct(c.measures.strong.value)}.` : ""}
              </p>
            </li>
          {/each}
        </ol>
      </article>
    {:else if !played.length}
      <Results summary={silentRun()} />
    {:else}
    <article class="{panel} flex flex-col gap-4">
      <div class="flex flex-wrap items-start gap-4">
        <div class="min-w-0 flex-1 basis-72">
          <p class="font-display text-2xl font-semibold leading-snug">
            {played.length} notes over {choruses.length} chorus{choruses.length === 1 ? "" : "es"}.
          </p>
          <p class="mt-1 text-sm text-ws-soft">Jam is not scored. The reports below describe where your notes landed, chorus by chorus.</p>
          {#if savedTake}<p class="mt-2 text-sm">Saved as a take. <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Open it in Record</a></p>{/if}
        </div>
        {#if played.length}
          {@const t = choruses.reduce((a, c) => ({ chord: a.chord + c.report.chord, notes: a.notes + c.report.notes }), { chord: 0, notes: 0 })}
          <div class="text-right">
            <p class="tnum font-display text-5xl font-bold leading-none">{pctOf(t.chord, t.notes)}%</p>
            <p class="mt-1 text-sm text-ws-soft">on chord tones</p>
          </div>
        {/if}
      </div>
      {#if choruses.length}
        <ol class="flex flex-col gap-3" aria-label="Chorus reports">
          {#each choruses as c (c.n)}
            <li class="rounded-xl border border-ws-line p-3">
              <div class="flex flex-wrap items-center gap-3">
                <p class="min-w-0 flex-1"><span class="font-semibold">Chorus {c.n}.</span> {c.report.headline}</p>
                {#if savedTake && c.report.notes}
                  <button type="button" class={btn} onclick={() => playChorus(c)}><Play class="size-4" aria-hidden="true" />Hear this chorus</button>
                {/if}
              </div>
              {#if c.report.notes}
                <div class="share mt-2" role="img" aria-label="{pctOf(c.report.chord, c.report.notes)}% chord tones, {pctOf(c.report.scale, c.report.notes)}% scale tones, {pctOf(c.report.avoid, c.report.notes)}% avoid notes">
                  <span style:width="{pctOf(c.report.chord, c.report.notes)}%" style:background="var(--tone-chord)"></span>
                  <span style:width="{pctOf(c.report.scale, c.report.notes)}%" style:background="var(--tone-scale)"></span>
                  <span class="avoid" style:width="{pctOf(c.report.avoid, c.report.notes)}%"></span>
                </div>
                <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-soft">
                  {#each c.report.perChord as pc_ (pc_.index)}
                    <li><span class="font-medium text-ws-ink">{pc_.symbol}</span> {pc_.notes ? `${pc_.chord} chord, ${pc_.scale} scale, ${pc_.avoid} avoid` : "nothing played"}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </article>
    {/if}
  {/snippet}
</DrillShell>

<style>
  .lane {
    position: relative;
    height: 4.75rem;
    overflow: hidden;
    border-radius: 0.75rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 5%, transparent);
  }
  /* The past fades out behind the playhead. */
  .lane::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 1;
    width: 22%;
    background: linear-gradient(90deg, var(--ws-stage), transparent);
    opacity: 0.7;
    pointer-events: none;
  }
  .track {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .lane.glide .track {
    transition: transform 280ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .block {
    position: absolute;
    top: 0.5rem;
    bottom: 0.5rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    padding: 0 0.6rem;
    border-radius: 0.6rem;
    white-space: nowrap;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
    color: var(--ws-stage-soft);
    transition:
      background-color 150ms,
      color 150ms;
  }
  .block .sym {
    font-weight: 600;
    font-size: 1rem;
    line-height: 1.1;
  }
  .block[data-state="now"] {
    background: var(--instr);
    color: var(--ws-stage);
    box-shadow: 0 0 1.25rem color-mix(in oklch, var(--instr) 45%, transparent);
  }
  .block[data-state="now"] .sym {
    font-size: 1.5rem;
    font-weight: 700;
  }
  .block[data-state="next"] {
    color: var(--ws-stage-ink);
    box-shadow: inset 0 0 0 2px var(--instr);
  }
  .block[data-state="past"] {
    opacity: 0.5;
  }
  .next-tag {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--instr);
  }
  .ticks {
    position: absolute;
    inset: auto 0 0.3rem 0;
    height: 0.4rem;
  }
  .tick {
    position: absolute;
    bottom: 0;
    width: 0.3rem;
    height: 0.3rem;
    translate: -50% 0;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.3;
  }
  .tick.bar {
    width: 0.6rem;
    border-radius: 2px;
  }
  .tick.on {
    opacity: 0.9;
  }
  .playhead {
    position: absolute;
    top: 0.2rem;
    bottom: 0.2rem;
    z-index: 2;
    width: 3px;
    margin-left: -1.5px;
    border-radius: 999px;
    background: var(--ws-stage-ink);
    box-shadow: 0 0 0.5rem color-mix(in oklch, var(--ws-stage-ink) 60%, transparent);
  }
  .now-chord {
    color: var(--instr);
    animation: chord-in 220ms ease-out;
  }
  @keyframes chord-in {
    from {
      transform: translateX(0.75rem);
      opacity: 0.4;
    }
  }
  .tone-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-weight: 600;
    background: var(--tone-chord);
    color: var(--ws-stage);
  }
  @media (prefers-reduced-motion: reduce) {
    .now-chord,
    .block {
      animation: none;
      transition: none;
    }
  }
  :global([data-reduce-motion]) .now-chord,
  :global([data-reduce-motion]) .block {
    animation: none;
    transition: none;
  }
  .legend {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
  }
  .legend.ring {
    border: 2px dashed var(--tone-avoid);
  }
  .role-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0 0.4rem;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ws-stage);
  }
  .role-pill[data-role="chord"] {
    background: var(--tone-chord);
  }
  .role-pill[data-role="scale"] {
    background: var(--tone-scale);
  }
  .role-pill[data-role="avoid"] {
    background: transparent;
    color: inherit;
    border: 2px dashed var(--tone-avoid);
  }
  .window-pill {
    display: inline-block;
    margin: 0 0.4rem;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    font-weight: 600;
    background: var(--instr);
    color: var(--ws-stage);
  }
  .window-pill[data-band="true"] {
    background: transparent;
    color: inherit;
    border: 2px dashed var(--ws-stage-soft);
  }
  .share {
    display: flex;
    height: 0.6rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--ws-raised);
  }
  .share .avoid {
    background: repeating-linear-gradient(90deg, var(--tone-avoid) 0 4px, transparent 4px 7px);
  }
</style>
