<script lang="ts">
  // Song practice (catalog 4.11; once "Song Studio"). Transport and practice actions sit above the
  // score; the score scrolls in its own viewport. Wait mode waits for each
  // group; Performance keeps time over 1 to 8 takes; No-stop is one take that
  // keeps going through slips, scored on what was played and how continuously.
  // Any mode can run from memory, in another key, and (in time) with the
  // score's dynamics and breaths or vibrato on held notes graded too.
  // Imported songs never write mastery (skillIds: []), and the whole session
  // is one run.
  import { onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Download from "@lucide/svelte/icons/download";
  import Headphones from "@lucide/svelte/icons/headphones";
  import Settings2 from "@lucide/svelte/icons/sliders-horizontal";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Timer from "@lucide/svelte/icons/timer";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Drum from "@lucide/svelte/icons/drum";
  import Dots from "@lucide/svelte/icons/ellipsis";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import Repeat from "@lucide/svelte/icons/repeat";
  import * as Menu from "@repo/ui/dropdown-menu";
  import { goto } from "$app/navigation";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { clamp, noteName, pc, type ControlEvent, type InputEvent, type NoteEvent } from "@repo/music-core";
  import { TUNINGS } from "@repo/music-core/data/index";
  import { transposeFifths, transposeScore, writtenOffset } from "@repo/music-core/theory/transposition";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
  import { GROOVE_VOICES, hitDrumKey } from "@repo/music-core/content/winds-pads";
  import {
    aggregateTakes,
    followerInput,
    followerResult,
    liveState,
    performanceStart,
    waitStart,
    type FollowerState,
    type PerformanceResult,
    type WaitResult,
    type WaitState,
  } from "@repo/music-core/scoring/follower";
  import HubTabs from "#lib/music/components/HubTabs.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btn, btnPrimary, btnStage } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { bench, INSTRUMENT_LABEL } from "#lib/music/bench.svelte.ts";
  import { audio, db, input, settings, type SequenceHandle } from "#lib/music/runtime/index.ts";
  import { barBeats, scoreGroups as viewGroupsOf, voiceSides, type BeatRange } from "#lib/music/notation/groups.ts";
  import { barsText, durationText, scoreFacts, songSections, type Song } from "#lib/music/hubs/library/songs.ts";
  import StudioScore, { type View } from "./StudioScore.svelte";
  import { buildPass, continuity, defaultParts, firstSlip, fitToRange, gradeBalance, gradeExpression, gradeVibrato, gradedDrums, hideBefore, isFirstRun, melodyVoice, noStopVerdict, passMarks, passSequence, planPasses, segmentAt, segmentLabel, SIGHT_LOOK_S, SPOT, spotAfter, spotRange, startSpot, statesByBeat, statesFor, TAP_MIDI, TAP_VOICE, tapScore, toScoreBeat, tuningRange, voiceChoices, type Continuity, type ExpressionResult, type Pass, type RangeMode, type SectionOrder, type SpotDrill } from "./studio";
  import Picker from "#lib/music/components/Picker.svelte";
  import { stripUnused } from "#lib/music/components/BenchStrip.svelte";
  import { m } from "@repo/i18n/messages.js";

  let { song }: { song: Song } = $props();
  // The page keys this component by song id, so reading the prop once is safe.
  // svelte-ignore state_referenced_locally
  const score = song.score;
  const facts = scoreFacts(score);
  const choices = voiceChoices(score);
  const sections = songSections(score);
  const barLen = barBeats(score.meter);
  const TUNING_LIST = [...TUNINGS.guitar, ...TUNINGS.ukulele];

  const setup = new DrillSetup(`song-studio.${score.id}`, {
    mode: "wait" as string,
    bpm: score.bpm,
    strictness: "normal" as string,
    takes: 1,
    range: "whole" as string,
    order: "sequence" as string,
    snap: "bar" as string,
    tuning: (settings.value.activeInstrument === "ukulele" ? settings.value.ukuleleTuningId : settings.value.guitarTuningId) as string,
    fit: "auto" as string,
    rangeStart: -1,
    rangeEnd: -1,
    memory: "off" as string,
    transpose: 0,
    grade: "notes" as string,
    tap: false as boolean,
    partner: false as boolean,
  });
  const s = $derived(setup.value);
  // Performance and No-stop keep time; No-stop is one take that never stops for a slip.
  // Sight-read is a No-stop pass after a 30 second look, read at sight only on the song's first run.
  const sightRead = $derived(s.mode === "sight-read");
  const noStop = $derived(s.mode === "no-stop" || sightRead);
  const perfMode = $derived(s.mode === "performance" || noStop);
  let loaded = $state(false);
  void practice.ready.then(() => (loaded = true));
  const firstRun = $derived(
    loaded &&
      isFirstRun(
        practice.sessions.flatMap((x) => x.runs),
        score.id,
        song.shelf,
      ),
  );
  // Tap the rhythm: any key, pad or MIDI note (or Space) at each onset; only the timing is graded.
  const tap = $derived(perfMode && s.tap);
  const transpose = $derived(clamp(Math.round(s.transpose) || 0, -6, 6));
  const memory = $derived(s.memory === "look" || s.memory === "bars" ? s.memory : "off");
  const hasMarks = $derived(!!(score.dynamics?.length || score.hairpins?.length || score.breaths?.length));
  /** What else a timed run grades: the score's dynamics and breaths, or vibrato on held notes. */
  const grade = $derived(perfMode && !tap && ((s.grade === "dynamics" && hasMarks) || s.grade === "vibrato" || s.grade === "balance") ? s.grade : "notes");
  const bpm = $derived(clamp(Math.round(s.bpm) || score.bpm, 20, 300));
  // The song has its own tempo (setup, and "Set metronome to ..." in Song options): the strip's tempo would
  // show the metronome's, not the song's. The click and count-in pills stay: a run reads both.
  stripUnused("tempo");
  const takes = $derived(perfMode && !noStop ? ([1, 2, 4, 8].includes(s.takes) ? s.takes : 1) : 1);
  const tuning = $derived(TUNING_LIST.find((t) => t.id === s.tuning) ?? TUNING_LIST[0]);
  const custom = $derived<BeatRange | null>(s.rangeStart >= 0 && s.rangeEnd > s.rangeStart ? { startBeat: s.rangeStart, endBeat: s.rangeEnd } : null);

  // Session-local: which voices and sections. Drum parts and pitched parts are
  // graded differently, so one kind is picked at a time: the drums on the MPC.
  const drumIds = new Set(score.voices.filter((v) => v.drums).map((v) => v.id));
  const isDrumChoice = (c: (typeof choices)[number]) => c.voiceIds.every((id) => drumIds.has(id));
  const mixed = choices.some(isDrumChoice) && !choices.every(isDrumChoice);
  const partsOf = (drumsOn: boolean) => choices.filter((c) => isDrumChoice(c) === drumsOn).map((c) => c.id);
  let picked = $state<string[]>(partsOf(defaultParts(score, settings.value.activeInstrument)));
  let pickedSections = $state<number[]>([]);
  const voiceIds = $derived(choices.filter((c) => picked.includes(c.id)).flatMap((c) => c.voiceIds));
  const drums = $derived(voiceIds.length > 0 && voiceIds.every((id) => drumIds.has(id)));
  // The duet partner: the app plays the parts you don't, in time with the take.
  const others = $derived(choices.filter((c) => !picked.includes(c.id)));
  const partner = $derived(perfMode && s.partner && others.length > 0);

  // On guitar and ukulele, the note highway too.
  const VIEWS = $derived([
    { id: "staff", label: m.music_drills_studio_view_staff() },
    { id: "tab", label: m.music_drills_studio_view_tab() },
    { id: "fingering", label: m.music_drills_studio_view_fingering() },
    { id: "waterfall", label: m.music_drills_studio_view_waterfall() },
    ...(["guitar", "ukulele"].includes(settings.value.activeInstrument) ? [{ id: "highway", label: m.music_drills_studio_view_highway() }] : []),
  ]);
  const view = $derived((VIEWS.find((v) => v.id === page.url.searchParams.get("view"))?.id ?? "staff") as View);

  // On guitar or ukulele (or in Tab) the score moves by octaves into the
  // instrument's range, so every note has a string and a fret.
  const fretted = $derived(!drums && (view === "tab" || ["guitar", "ukulele"].includes(settings.value.activeInstrument)));
  // A transposed run plays the song in another key: the notes, the staff and the grading all move.
  const keyed = $derived(transposeScore(score, transpose));
  const fitted = $derived.by(() => {
    const { low, high } = tuningRange(tuning);
    return fitToRange(keyed, voiceIds, low, high);
  });
  const fitting = $derived(fretted && s.fit === "auto" && fitted.score !== keyed);
  const played = $derived(fitting ? fitted.score : keyed);
  // The staff shows what the player reads: guitar an octave up, the Aerophone in its reading key.
  const written = $derived(fretted ? writtenOffset(tuning.instrument, settings.value, tuning) : writtenOffset(settings.value.activeInstrument, settings.value));
  const fitNote = $derived.by(() => {
    const inst = tuning.instrument === "ukulele" ? "ukulele" : "guitar";
    const moved = fitted.shift ? (fitted.shift > 0 ? m.music_drills_studio_fit_moved_up : m.music_drills_studio_fit_moved_down)({ count: Math.abs(fitted.shift) / 12 }) : "";
    const folded = fitted.folded ? m.music_drills_studio_fit_folded({ count: fitted.folded }) : "";
    const change = [moved, folded].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase());
    return (inst === "ukulele" ? m.music_drills_studio_fit_note_ukulele : m.music_drills_studio_fit_note_guitar)({ change, tuning: tuning.name });
  });

  const plans = $derived(planPasses(played, sections, { mode: s.range as RangeMode, picked: pickedSections, order: s.order as SectionOrder, custom }));
  // Drums are graded by drum: the follower sees each drum's key, never its pitch.
  // Tapping, the follower sees one note at each onset of the selected voices.
  const passes = $derived(plans.map((segs) => (tap ? buildPass(tapScore(played, voiceIds), [TAP_VOICE], segs, sections) : buildPass(drums ? gradedDrums(played) : played, voiceIds, segs, sections))));
  /** The hand of the selected voice sounding `midi` in the group at `beat`. */
  const handAt = (midi: number, beat: number | null) => {
    if (beat === null) return undefined;
    const g = viewGroups.findLast((x) => x.startBeat <= beat + 1e-6);
    const n = g?.notes.find((x) => x.midi === midi);
    return n ? sides[n.voiceId] : undefined;
  };
  const highlights = $derived(s.range === "sections" ? pickedSections.map((i) => sections[i]).filter(Boolean) : []);

  let staffFailed = $state<string | null>(null);

  // ---- Run state ------------------------------------------------------
  type Phase = "ready" | "look" | "countin" | "running" | "results";
  interface Done {
    pass: number;
    take: number;
    label: string;
    result: PerformanceResult | WaitResult;
    state: FollowerState;
    notes: NoteEvent[];
    controls: ControlEvent[];
    /** The take's beat 0. */
    startAt: number;
  }
  let phase = $state<Phase>("ready");
  let status = $state("");
  let setupOpen = $state(false);
  let fstate = $state.raw<FollowerState | null>(null);
  let active = $state.raw<Pass | null>(null);
  let startAt = $state(0);
  let now = $state(performance.now());
  let queue = $state.raw<{ pass: number; take: number }[]>([]);
  let qi = $state(0);
  let done = $state.raw<Done[]>([]);
  let summary = $state<RunSummary | null>(null);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let metro: { stop(): void } | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const flashes = new Flashes();
  let partnerSeq: SequenceHandle | null = null;
  let runFirst = false;
  const live = $derived(phase === "running" || phase === "countin" || phase === "look");
  // Sight-read on a first run: the notes stay hidden until the look starts.
  const unseen = $derived(sightRead && phase === "ready" && (!loaded || firstRun));
  let lookEnds = $state(0);
  const lookLeft = $derived(Math.max(0, Math.ceil((lookEnds - now) / 1000)));
  // From memory: during a run the notes are hidden, all of them after the look, or bar by bar from the start.
  let memBars = $state(1);
  const hideBeat = $derived(unseen ? played.lengthBeats + 1 : live && phase !== "look" && memory !== "off" ? (memory === "look" ? played.lengthBeats + 1 : Math.min(memBars * barLen, played.lengthBeats)) : 0);
  const shown = $derived(hideBefore(played, hideBeat));
  const viewGroups = $derived(viewGroupsOf(shown, voiceIds));
  const sides = $derived(voiceSides(played, voiceIds));
  const beatMs = $derived(60000 / bpm);
  const octaveExact = $derived(drums || !["guitar", "ukulele", "voice"].includes(settings.value.activeInstrument));

  const ls = $derived(fstate ? liveState(fstate, now) : null);

  // ---- Preview --------------------------------------------------------
  let preview = $state.raw<SequenceHandle | null>(null);
  let previewPass = $state.raw<Pass | null>(null);
  let previewBeat = $state<number | null>(null);

  // One animation loop drives the cursor during a run or a preview.
  $effect(() => {
    if (!live && !preview?.playing) return;
    let raf = 0;
    const loop = () => {
      now = performance.now();
      if (preview?.playing && previewPass) previewBeat = toScoreBeat(previewPass, Math.max(0, (now - preview.startPerf) / (60000 / bpm)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const cursorBeat = $derived.by(() => {
    if (preview?.playing) return previewBeat;
    if (!active || !ls || phase === "ready") return null;
    if (fstate?.mode === "wait") return active.scoreBeat[Math.min(ls.index, active.scoreBeat.length - 1)] ?? null;
    return toScoreBeat(active, Math.max(0, (now - startAt) / beatMs));
  });

  const groupStates = $derived(active && ls && phase !== "ready" ? statesFor(viewGroups, statesByBeat(active, ls.verdicts, ls.wrong.length > 0, ls.index)) : {});

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (preview?.playing && previewPass && previewBeat !== null) {
      for (const g of viewGroups)
        if (g.startBeat <= previewBeat + 1e-6 && previewBeat < g.startBeat + g.durationBeats) for (const n of g.notes) if (previewBeat < g.startBeat + n.durationBeats) out[n.midi] = { demo: true, role: sides[n.voiceId] };
      return out;
    }
    // From memory the keys don't show what comes next.
    // The wanted key carries its name ("E4"), so the eye goes from the staff straight to it.
    if (live && ls && memory === "off" && !tap) for (const m of ls.expected) out[m] = { target: true, role: handAt(m, cursorBeat), label: drums ? undefined : noteName(m + written) };
    return out;
  });

  function stopPreview() {
    preview?.stop();
    preview = null;
    previewBeat = null;
  }

  async function togglePreview() {
    if (preview?.playing) return stopPreview();
    await audio.unlock();
    // The score's own drums (not the graded keys), on the app's kit.
    const pass = buildPass(played, voiceIds, plans[0], sections);
    const notes = passSequence(pass, bpm, (id) => drumIds.has(id));
    previewPass = pass;
    const h = audio.playSequence(notes);
    preview = h;
    status = m.music_drills_studio_preview_status({ range: segmentLabel(pass.label).toLowerCase(), bpm });
    void h.done.then(() => {
      if (preview === h) stopPreview();
    });
  }

  function metronomeToSong() {
    settings.update({ bpm });
    status = m.music_drills_studio_metronome_set({ bpm });
  }

  function exportMidi() {
    const bytes = scoreToMidi({ ...score, bpm });
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/midi" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.title.replace(/[^\w\- ]+/g, "").trim() || "song"}.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status = m.music_drills_studio_exported({ file: a.download, bpm });
  }

  // ---- Running --------------------------------------------------------
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /** The last wrong note, said against what was wanted ("Played C#4, expected E4"); cleared on a right one. */
  let lastMiss = $state("");
  async function start() {
    if (live) return;
    lastMiss = "";
    stopPreview();
    await audio.unlock();
    setupOpen = false;
    summary = null;
    done = [];
    flashes.clear();
    queue = passes.flatMap((_, p) => Array.from({ length: takes }, (_, t) => ({ pass: p, take: t })));
    qi = 0;
    // Read at sight only when no earlier run played this song.
    await practice.ready;
    const first = (runFirst = isFirstRun(
      practice.sessions.flatMap((x) => x.runs),
      score.id,
      song.shelf,
    ));
    run = practice.beginRun({
      exerciseId: "song.studio",
      setupKey: `${score.id}|${s.mode}|${passes.map((p) => p.label).join("+")}|${voiceIds.join(",")}|${bpm}|${s.strictness}${transpose ? `|t${transpose}` : ""}${memory !== "off" ? `|${memory}` : ""}${grade !== "notes" ? `|${grade}` : ""}${tap ? "|tap" : ""}${partner ? "|partner" : ""}`,
      // Imported songs never write mastery: no skills, deliberately.
      skillIds: [],
      capabilities: ["reading"],
      modality: "read",
      // Performance keeps time without waiting, so its runs count as checked (a path's shelf songs
      // and riffs); still no skills, so no mastery.
      assistance: perfMode ? "independent" : "guided",
      difficulty: 0.5,
      instrument: settings.value.activeInstrument,
      source: "song",
      params: {
        song: score.id,
        mode: s.mode,
        bpm,
        takes,
        strictness: s.strictness,
        range: s.range,
        ...(song.shelf ? { shelf: song.shelf } : {}),
        ...(memory !== "off" ? { memory } : {}),
        ...(memory === "bars" ? { hiddenBars: memBars } : {}),
        ...(transpose ? { transpose } : {}),
        firstRun: first,
        ...(tap ? { tap } : {}),
        ...(partner ? { partner } : {}),
      },
    });
    if (!sightRead) return beginTake();
    // Sight-read: look for 30 seconds (nothing to play yet), then one pass in time.
    phase = "look";
    startAt = 0;
    now = performance.now();
    lookEnds = now + SIGHT_LOOK_S * 1000;
    status = `${m.music_drills_studio_look_status({ seconds: SIGHT_LOOK_S })}${first ? "" : m.music_drills_studio_look_played_before()}`;
    timers.push(setTimeout(endLook, SIGHT_LOOK_S * 1000));
  }

  function endLook() {
    if (phase !== "look") return;
    clearTimers();
    beginTake();
  }

  function beginTake() {
    const item = queue[qi];
    const pass = passes[item.pass];
    active = pass;
    fstate = null;
    if (!perfMode) {
      fstate = waitStart(pass.groups, octaveExact);
      startAt = performance.now();
      phase = "running";
      status = `${m.music_drills_studio_wait_status({ range: segmentLabel(pass.label).toLowerCase() })}${memory === "look" ? m.music_drills_studio_hidden_memory() : ""}`;
      cap = capture(startAt, onInput);
      void tick().then(() => document.getElementById("studio-run")?.focus());
      return;
    }
    const bars = Math.max(1, settings.value.countInBars);
    const perBar = Math.max(1, Math.round(barLen));
    bench.beatsPerBar = perBar;
    const h = audio.metronome.start({
      bpm,
      beatsPerBar: perBar,
      countInBars: bars,
      audible: bench.clickDuringRun,
      onBeat: (beat) => (bench.beat = beat + 1),
    });
    metro = h;
    // Without running audio the metronome returns at once; keep the count-in anyway.
    const downbeat = h.downbeatPerf > performance.now() + 10 ? h.downbeatPerf : performance.now() + bars * perBar * beatMs;
    startAt = downbeat;
    fstate = performanceStart(pass.groups, { bpm, startAt: downbeat, strictness: s.strictness as "relaxed" | "normal" | "strict", octaveExact, sections: pass.sections });
    phase = "countin";
    const head = sightRead ? m.music_drills_studio_head_sight() : noStop ? m.music_drills_studio_head_nostop() : m.music_drills_studio_head_take({ n: item.take + 1, total: takes });
    status = m.music_drills_studio_countin_status({
      head: passes.length > 1 ? m.music_drills_studio_head_pass({ head, pass: segmentLabel(pass.label) }) : head,
      tap: tap ? m.music_drills_studio_tap_hint() : "",
      count: bars,
    });
    if (partner)
      partnerSeq = audio.playSequence(
        passSequence(
          buildPass(
            played,
            others.flatMap((c) => c.voiceIds),
            pass.segments,
          ),
          bpm,
          (id) => drumIds.has(id),
        ),
        { startPerf: downbeat },
      );
    // Scored input only after the count-in, so the speakers cannot bleed into the take.
    cap = capture(downbeat - beatMs / 2, onInput);
    timers.push(
      setTimeout(() => {
        if (phase === "countin") {
          phase = "running";
          status = m.music_drills_studio_go();
        }
      }, downbeat - performance.now()),
      setTimeout(endTake, downbeat - performance.now() + pass.lengthBeats * beatMs + 350),
    );
    void tick().then(() => document.getElementById("studio-run")?.focus());
  }

  function onInput(e: InputEvent) {
    if ((e.kind !== "noteon" && e.kind !== "noteoff") || !fstate) return;
    const raw = e as NoteEvent;
    const ev = tap ? { ...raw, midi: TAP_MIDI } : drums ? { ...raw, midi: hitDrumKey(raw.midi) } : raw;
    if (ev.kind === "noteon") {
      const expected = liveState(fstate, performance.now()).expected;
      const hit = expected.some((m) => (octaveExact ? m === ev.midi : pc(m) === pc(ev.midi)));
      flashes.add(tap ? raw.midi : ev.midi, hit ? "correct" : "wrong");
      if (!tap && !drums) lastMiss = hit || !expected.length ? "" : m.music_drills_studio_last_miss({ played: noteName(ev.midi + written), expected: expected.map((x) => noteName(x + written)).join(" ") });
    }
    fstate = followerInput(fstate, ev);
    if (fstate.mode === "wait" && fstate.index >= fstate.groups.length) endTake();
  }

  function endTake() {
    if (!fstate || !active) return;
    clearTimers();
    cap?.stop();
    metro?.stop();
    metro = null;
    bench.beat = 0;
    const item = queue[qi];
    const result = followerResult(fstate);
    // The label stays English: it is part of the stored prompt id. takeName shows it.
    const label = `${passes.length > 1 ? `${active.label}, ` : ""}take ${item.take + 1}`;
    done = [...done, { ...item, label, result, state: fstate, notes: cap?.notes ?? [], controls: cap?.controls ?? [], startAt }];
    cap = null;
    qi += 1;
    if (qi < queue.length) {
      status = m.music_drills_studio_take_done({ take: takeName(item), score: pct(result.score) });
      timers.push(setTimeout(beginTake, 600));
    } else void finish();
  }

  function stop() {
    if (!live) return;
    clearTimers();
    cap?.stop();
    cap = null;
    metro?.stop();
    metro = null;
    partnerSeq?.stop();
    partnerSeq = null;
    bench.beat = 0;
    input.router.releaseAll();
    fstate = null;
    active = null;
    phase = "ready";
    status = m.music_drills_studio_stopped();
    if (spot) endSpot(m.music_drills_studio_loop_stopped());
  }

  // ---- Results --------------------------------------------------------
  const isPerf = (r: PerformanceResult | WaitResult): r is PerformanceResult => "matched" in r;
  /** A take as shown: "Take 2", or "Verse, take 2" when the run has several passes. */
  const takeName = (d: { pass: number; take: number }) =>
    (passes.length > 1 ? m.music_drills_studio_pass_take({ pass: segmentLabel(passes[d.pass].label), n: d.take + 1 }) : m.music_drills_studio_take_lower({ n: d.take + 1 })).replace(/^./, (c) => c.toUpperCase());
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  interface Row {
    label: string;
    score: number;
    detail: string;
    best?: boolean;
  }
  let takeRows = $state.raw<Row[]>([]);
  let sectionRows = $state.raw<{ label: string; value: number; text: string }[]>([]);

  interface Extra {
    score: number;
    correct: boolean;
    cont: Continuity | null;
    kept: boolean;
    expr: ExpressionResult | null;
    vib: ReturnType<typeof gradeVibrato> | null;
    bal: ReturnType<typeof gradeBalance> | null;
    /** The extra measure blended in (dynamics or vibrato), null when not measured. */
    measure: number | null;
  }
  /**
   * A take's score with what else the run grades: No-stop scales it by
   * continuity; dynamics or vibrato, when measured, make half of it.
   */
  function takeExtras(d: Done): Extra {
    const pass = passes[d.pass];
    let score = d.result.score;
    let correct = d.result.correct;
    let cont: Continuity | null = null;
    let kept = true;
    let expr: ExpressionResult | null = null;
    let vib: Extra["vib"] = null;
    let bal: Extra["bal"] = null;
    let measure: number | null = null;
    if (isPerf(d.result)) {
      if (noStop) {
        // The follower's notes: they include Space taps, which the capture never sees.
        const heard = d.state.mode === "performance" ? d.state.notes : d.notes;
        cont = continuity(pass, heard.filter((n) => n.kind === "noteon").map((n) => n.at), d.startAt, beatMs, barLen);
        const v = noStopVerdict(score, cont);
        score = v.score;
        kept = v.kept;
        correct = correct && kept;
      }
      if (grade === "dynamics") {
        expr = gradeExpression({ marks: passMarks(played, pass), notes: d.notes, controls: d.controls, startAt: d.startAt, beatMs, lengthBeats: pass.lengthBeats });
        measure = expr.score;
      } else if (grade === "vibrato") {
        vib = gradeVibrato({ pass, notes: d.notes, controls: d.controls, startAt: d.startAt, beatMs });
        measure = vib.share;
      } else if (grade === "balance") {
        bal = gradeBalance({ pass, melody: melodyVoice(played, voiceIds), notes: d.notes, startAt: d.startAt, beatMs });
        measure = bal.share;
      }
      if (measure !== null) {
        score = score * 0.5 + measure * 0.5;
        correct = correct && measure >= 0.8;
      }
    }
    return { score, correct, cont, kept, expr, vib, bal, measure };
  }

  async function finish() {
    phase = "results";
    const all = [...done];
    const extras = all.map(takeExtras);
    const notes = all.flatMap((d) => d.notes);
    const instrument = runInstrument(notes) ?? null;
    for (const [i, d] of all.entries())
      await run!.attempt({
        promptId: `${score.id}:${d.label}`,
        correct: extras[i].correct,
        partialCredit: extras[i].score,
        metrics: d.result.metrics,
        source: runSource(d.notes),
        instrument,
        skillIds: [],
      });
    const perf = all.filter((d) => isPerf(d.result)).map((d) => d.result as PerformanceResult);
    const mean = sum(extras.map((x) => x.score)) / Math.max(1, all.length);
    const agg = perf.length ? aggregateTakes(perf) : null;
    const bestIdx = extras.reduce((b, x, i) => (x.score > extras[b].score ? i : b), 0);

    takeRows = all.map((d, i) => ({
      label: takeName(d),
      score: extras[i].score,
      best: all.length > 1 && i === bestIdx,
      detail: isPerf(d.result)
        ? m.music_drills_studio_detail_perf({ matched: d.result.matched, expected: d.result.expected, ms: Math.round(d.result.meanAbsErrorMs), early: d.result.early, onTime: d.result.onTime, late: d.result.late, missed: d.result.missed, extra: d.result.extra })
        : m.music_drills_studio_detail_wait({ clean: (d.result as WaitResult).cleanGroups, total: (d.result as WaitResult).total, wrong: (d.result as WaitResult).wrongNotes }),
    }));
    sectionRows = tallySections(all);

    const conts = extras.flatMap((x) => (x.cont ? [x.cont] : []));
    const measured = grade !== "notes" && extras.length > 0 && extras.every((x) => x.measure !== null);
    const fin = await run!.finish({
      score: mean,
      correct: extras.every((x) => x.correct),
      headline: (tap ? m.music_drills_studio_run_headline_tapped : m.music_drills_studio_run_headline)({
        score: pct(mean),
        bpm,
        mode: sightRead ? m.music_drills_studio_mode_sight_lower() : noStop ? m.music_drills_studio_mode_nostop_lower() : perfMode ? m.music_drills_studio_mode_perf_lower() : m.music_drills_studio_mode_wait_lower(),
      }),
      params: {
        takesPlayed: all.length,
        ...(conts.length ? { continuity: Math.round(Math.min(...conts.map((c) => c.share)) * 100) / 100, kept: extras.every((x) => x.kept) } : {}),
        // A run counts as graded for dynamics or vibrato only when every take could be measured.
        ...(measured ? { grade } : {}),
      },
    });
    if (!fin.heard) {
      summary = silentRun();
      return settle(all);
    }
    // "Pick up where you left off" in Songs follows the last song practised.
    void db.songs.update(song.id, { updatedAt: Date.now() });

    if (perf.length && agg) {
      const matched = sum(perf.map((r) => r.matched));
      const expected = sum(perf.map((r) => r.expected));
      const errMs = matched ? sum(perf.map((r) => r.meanAbsErrorMs * r.matched)) / matched : 0;
      const best = agg.best!;
      summary = {
        headline:
          best.correct
            ? m.music_drills_studio_clean_take({ bpm, score: pct(best.score) })
            : best.pitchCompletion < 0.7
              ? m.music_drills_studio_found_some({ matched: best.matched, expected: best.expected })
              : m.music_drills_studio_drifted({ ms: Math.round(best.meanAbsErrorMs) }),
        metric: pct(agg.meanScore),
        metricLabel: perf.length > 1 ? m.music_drills_studio_mean_of_takes({ count: perf.length }) : m.music_drills_studio_score(),
        delta: fin.delta,
        best: fin.best,
        clean: perf.every((r) => r.correct),
        xp: fin.xp,
        assistance: m.music_drills_studio_assistance_song(),
        rows: [
          { label: m.music_drills_studio_row_notes_matched(), value: expected ? matched / expected : 0, text: m.music_drills_studio_of({ a: matched, b: expected }) },
          // The same share as the row above, so it only earns a line when it names what was listened for.
          ...(tap || drums ? [{ label: tap ? m.music_drills_studio_row_taps_found() : m.music_drills_studio_row_drums_found(), value: expected ? matched / expected : 0 }] : []),
          { label: m.music_drills_studio_row_timing_error(), text: matched ? `${Math.round(errMs)} ms` : m.music_drills_studio_no_notes_matched() },
          { label: m.music_drills_studio_best_take(), text: m.music_drills_studio_take_score({ n: agg.bestIndex + 1, score: pct(best.score) }) },
          { label: m.music_drills_studio_row_early_late(), text: `${sum(perf.map((r) => r.early))} / ${sum(perf.map((r) => r.onTime))} / ${sum(perf.map((r) => r.late))}` },
          { label: m.music_drills_studio_row_missed_extra(), text: `${sum(perf.map((r) => r.missed))} / ${sum(perf.map((r) => r.extra))}` },
          ...extraRows(extras),
        ],
      };
      const x = extras[bestIdx];
      if (noStop && x.cont) {
        const c = x.cont;
        summary.headline = x.kept
          ? m.music_drills_studio_kept_end({ score: pct(x.score) })
          : c.longestGapBeats > 1
            ? m.music_drills_studio_stopped_for({ beats: c.longestGapBeats % 1 ? c.longestGapBeats.toFixed(1) : c.longestGapBeats, where: barsOf({ startBeat: c.gapAt ?? 0, endBeat: (c.gapAt ?? 0) + 0.01 }) })
            : m.music_drills_studio_bars_played_head({ played: c.barsPlayed, bars: c.bars });
      } else if (grade !== "notes" && x.measure !== null && x.measure < 0.8)
        summary.headline =
          grade === "balance"
            ? m.music_drills_studio_hl_balance({ notes: pct(isPerf(all[bestIdx].result) ? all[bestIdx].result.score : 0), share: pct(x.measure) })
            : grade === "vibrato"
            ? m.music_drills_studio_hl_vibrato({ notes: pct(isPerf(all[bestIdx].result) ? all[bestIdx].result.score : 0), share: pct(x.measure) })
            : m.music_drills_studio_hl_dynamics({ notes: pct(isPerf(all[bestIdx].result) ? all[bestIdx].result.score : 0), share: pct(x.measure) });
    } else {
      const w = all.map((d) => d.result as WaitResult);
      const clean = sum(w.map((r) => r.cleanGroups));
      const total = sum(w.map((r) => r.total));
      const wrong = sum(w.map((r) => r.wrongNotes));
      summary = {
        headline:
          clean === total
            ? m.music_drills_studio_all_found()
            : m.music_drills_studio_wait_head({ clean, total, wrong }),
        metric: pct(mean),
        metricLabel: m.music_drills_studio_right_first_time_lower(),
        delta: fin.delta,
        best: fin.best,
        clean: clean === total,
        xp: fin.xp,
        assistance: m.music_drills_studio_assistance_wait(),
        rows: [
          // Non-breaking spaces, so "14 of 15" never splits across two lines in the narrow stat column.
          { label: m.music_drills_studio_row_right_first_time(), value: total ? clean / total : 0, text: m.music_drills_studio_of_nbsp({ a: clean, b: total }) },
          { label: drums ? m.music_drills_studio_row_drums_found() : m.music_drills_studio_row_notes_found(), value: total ? sum(w.map((r) => r.completed)) / total : 0 },
          { label: m.music_drills_studio_row_wrong_notes(), text: String(wrong) },
        ],
      };
    }
    // The next run by the shared rule (B4): a timed mode climbs toward the song's tempo and past it;
    // Wait mode is untimed, so it offers the same again. Taking the offer sets the tempo and starts.
    if (!spot)
      summary.advance = await nextRun(
        `song-studio.${score.id}.${s.mode}`,
        perfMode ? { bpm, tempo: { min: Math.max(20, Math.round(score.bpm * 0.5)), goal: score.bpm, max: Math.round(score.bpm * 1.25) } } : {},
        { score: mean, correct: !!summary.clean },
        ({ bpm: b }) => {
          if (b !== undefined) setup.set({ bpm: b });
          void tick().then(start);
        },
      );
    if (spot) summary.headline = spotTake(all);
    if (sightRead) summary.headline += runFirst ? m.music_drills_studio_sight_counts() : m.music_drills_studio_sight_not_counted();
    // Bar by bar: a take at 90% or better hides one more bar next time.
    if (memory === "bars" && Math.max(...extras.map((x) => x.score)) >= 0.9 && memBars * barLen < played.lengthBeats - 1e-6) {
      memBars += 1;
      summary.headline += m.music_drills_studio_memory_next({ n: memBars });
    }
    await settle(all);
  }

  /** The stage rests on the last take, and focus moves to the results. */
  async function settle(all: Done[]) {
    status = summary!.headline;
    fstate = all.at(-1)?.state ?? null;
    active = all.at(-1) ? passes[all.at(-1)!.pass] : null;
    now = performance.now() + 1e7;
    await tick();
    document.getElementById("studio-results")?.focus();
  }

  /** Result rows for continuity, dynamics and vibrato, from the best take. */
  function extraRows(extras: Extra[]): NonNullable<RunSummary["rows"]> {
    const best = extras.reduce((b, x) => (x.score > b.score ? x : b), extras[0]);
    if (!best) return [];
    const rows: NonNullable<RunSummary["rows"]> = [];
    if (best.cont) {
      const c = best.cont;
      rows.push({ label: m.music_drills_studio_row_kept(), value: c.share, text: m.music_drills_studio_kept_text({ played: c.barsPlayed, bars: c.bars, beats: c.longestGapBeats % 1 ? c.longestGapBeats.toFixed(1) : c.longestGapBeats, count: c.longestGapBeats }) });
    }
    if (grade === "dynamics" && best.expr) {
      const e = best.expr;
      rows.push(
        e.score === null
          ? { label: m.music_drills_studio_dyn_unmeasured({ reason: e.unmeasured ?? m.music_drills_studio_nothing_marked() }), notMeasured: true }
          : { label: m.music_drills_studio_dyn_row(), value: e.score, text: m.music_drills_studio_dyn_text({ dr: e.dynamics.right, dt: e.dynamics.total, br: e.breaths.right, bt: e.breaths.total }) },
      );
    }
    if (grade === "balance" && best.bal) {
      const b = best.bal;
      rows.push(b.share === null ? { label: m.music_drills_studio_bal_unmeasured(), notMeasured: true } : { label: m.music_drills_studio_bal_row(), value: b.share, text: m.music_drills_studio_of({ a: b.right, b: b.total }) });
    }
    if (grade === "vibrato" && best.vib) {
      const v = best.vib;
      rows.push(v.share === null ? { label: m.music_drills_studio_vib_unmeasured(), notMeasured: true } : { label: m.music_drills_studio_vib_row(), value: v.share, text: m.music_drills_studio_of({ a: v.withVibrato, b: v.held }) });
    }
    return rows;
  }

  function tallySections(all: Done[]) {
    const acc = new Map<string, { hit: number; total: number }>();
    const add = (label: string, hit: number, total: number) => {
      const a = acc.get(label) ?? { hit: 0, total: 0 };
      acc.set(label, { hit: a.hit + hit, total: a.total + total });
    };
    for (const d of all) {
      const pass = passes[d.pass];
      if (isPerf(d.result)) {
        if (d.result.perSection.length) for (const t of d.result.perSection) add(t.label, t.matched, t.total);
        else add(pass.label, d.result.matched, d.result.expected);
      } else {
        const st = d.state as WaitState;
        for (const sec of pass.sections) {
          const idx = pass.groups.flatMap((g, i) => (g.startBeat >= sec.startBeat - 1e-6 && g.startBeat < sec.endBeat - 1e-6 ? [i] : []));
          add(sec.label, idx.filter((i) => i < st.index && st.wrongCounts[i] === 0).length, idx.length);
        }
      }
    }
    return [...acc].filter(([, a]) => a.total).map(([label, a]) => ({ label: segmentLabel(label), value: a.hit / a.total, text: m.music_drills_studio_of({ a: a.hit, b: a.total }) }));
  }

  // ---- Fix the trouble spot ---------------------------------------------
  /** Whether group `i` of a take was clean: hit in time, or found with no wrong note. */
  const cleanAt = (d: Done) => (i: number) =>
    isPerf(d.result) ? d.result.groupVerdicts[i] === "hit" : (d.state as WaitState).wrongCounts[i] === 0 && i < (d.state as WaitState).index;
  let spot = $state<SpotDrill | null>(null);
  let spotRestore: { range: string; rangeStart: number; rangeEnd: number; bpm: number; takes: number } | null = null;
  const barsOf = (r: BeatRange) => {
    const a = Math.floor(r.startBeat / barLen + 1e-6) + 1;
    const b = Math.ceil(r.endBeat / barLen - 1e-6);
    return a === b ? m.music_drills_studio_bar_n({ n: a }) : m.music_drills_studio_bars_range({ a, b });
  };
  /** Where the last take first went wrong, as a loop to fix. */
  const trouble = $derived.by(() => {
    if (phase !== "results" || spot) return null;
    const d = done.at(-1);
    if (!d) return null;
    const pass = passes[d.pass];
    const beat = firstSlip(pass, cleanAt(d));
    if (beat === null) return null;
    const bounds = segmentAt(pass, beat);
    return { range: spotRange(beat, barLen, bounds), bounds };
  });
  function applySpot(sp: SpotDrill) {
    setup.set({ range: "custom", rangeStart: sp.range.startBeat, rangeEnd: sp.range.endBeat, bpm: sp.bpm, takes: 1 });
  }
  function fixSpot() {
    if (!trouble) return;
    spotRestore = { range: s.range, rangeStart: s.rangeStart, rangeEnd: s.rangeEnd, bpm: s.bpm, takes: s.takes };
    spot = startSpot(trouble.range, trouble.bounds, bpm);
    applySpot(spot);
    void start();
  }
  function endSpot(message?: string) {
    clearTimers();
    spot = null;
    if (spotRestore) setup.set(spotRestore);
    spotRestore = null;
    if (message) status = message;
  }
  /** Score the loop's take, say where it stands, and go round again unless it is fixed. */
  function spotTake(all: Done[]): string {
    const d = all.at(-1)!;
    const pass = passes[d.pass];
    const clean = pass.groups.every((_, i) => cleanAt(d)(i));
    const was = spot!;
    const next = spotAfter(was, clean, barLen);
    spot = next;
    let line: string;
    if (next.stage === "done") {
      line = m.music_drills_studio_spot_fixed({ where: barsOf(next.range), count: SPOT.clean, bpm: next.targetBpm });
      endSpot();
      return line;
    }
    if (!clean) line = m.music_drills_studio_spot_not_clean({ where: barsOf(next.range), bpm: next.bpm });
    else if (next.stage !== was.stage) line = next.stage === "tempo" ? m.music_drills_studio_spot_clean_row({ count: SPOT.clean, bpm: next.bpm }) : m.music_drills_studio_spot_clean_full({ where: barsOf(next.range) });
    else line = m.music_drills_studio_spot_streak({ streak: next.streak, count: SPOT.clean, bpm: next.bpm });
    applySpot(next);
    timers.push(setTimeout(() => void start(), 1500));
    return m.music_drills_studio_spot_next({ line });
  }

  /** The results card holds the next run, so Again steps back to secondary. */
  /** After a run with a slip (and not already looping one), the fix leads the row. */
  const fixable = $derived(phase === "results" && !spot && !!trouble);
  const offersNext = $derived(phase === "results" && !!summary?.advance && !["same", "top"].includes(summary.advance.kind));

  // ---- Shell ------------------------------------------------------------
  $effect(() => {
    bench.running = live;
    bench.countingIn = phase === "countin";
    bench.setFocus(live);
  });

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl = t?.closest("button, a, input, select, textarea, [contenteditable], [role=slider]");
    if (e.code === "Space" && !onControl && !e.repeat && (phase === "ready" || phase === "results")) {
      e.preventDefault();
      void start();
    } else if (e.code === "Space" && tap && !e.repeat && (phase === "countin" || phase === "running")) {
      // Space taps the rhythm, like any key or pad.
      e.preventDefault();
      audio.drum(37, 0.5);
      onInput({ kind: "noteon", midi: TAP_MIDI, velocity: 0.8, at: e.timeStamp || performance.now(), source: "onscreen", confidence: 1 });
    } else if (e.key === "Escape" && live) {
      e.preventDefault();
      stop();
    }
  }

  onDestroy(() => {
    if (spot && spotRestore) setup.set(spotRestore);
    clearTimers();
    cap?.stop();
    metro?.stop();
    partnerSeq?.stop();
    stopPreview();
    flashes.clear();
    bench.running = false;
    bench.countingIn = false;
    bench.beat = 0;
    bench.setFocus(false);
  });

  // ---- Setup helpers ------------------------------------------------------
  function toggleVoice(id: string) {
    if (live) return;
    const c = choices.find((x) => x.id === id)!;
    if (picked.includes(id)) {
      if (picked.length > 1) picked = picked.filter((p) => p !== id);
    } else picked = [...picked.filter((p) => isDrumChoice(choices.find((x) => x.id === p)!) === isDrumChoice(c)), id];
  }
  function toggleSection(i: number) {
    pickedSections = pickedSections.includes(i) ? pickedSections.filter((x) => x !== i) : [...pickedSections, i].sort((a, b) => a - b);
  }
  function pickRange(r: BeatRange) {
    setup.set({ rangeStart: r.startBeat, rangeEnd: r.endBeat });
    const bars = Math.round((r.endBeat - r.startBeat) / barLen);
    status = m.music_drills_studio_range_set({ what: bars >= 1 ? m.music_drills_studio_bars_count({ count: bars }) : m.music_drills_studio_few_notes(), n: Math.floor(r.startBeat / barLen) + 1 });
  }

  const rangeSummary = $derived(
    s.range === "custom"
      ? custom
        ? m.music_drills_studio_bars_range({ a: Math.floor(custom.startBeat / barLen) + 1, b: Math.ceil(custom.endBeat / barLen) })
        : m.music_drills_studio_sum_custom_unset()
      : s.range === "sections" && pickedSections.length
        ? pickedSections.length > 1
          ? (s.order === "per-section" ? m.music_drills_studio_sum_sections_each : m.music_drills_studio_sum_sections_sequence)({ count: pickedSections.length })
          : m.music_drills_studio_sum_sections({ count: pickedSections.length })
        : m.music_drills_studio_sum_whole_score(),
  );
  /** Part names joined "A and B and C", as the setup line reads them. */
  const and = (names: string[]) => (names.length ? names.reduce((a, b) => m.music_drills_studio_and({ a, b })) : "");
  const MAJOR_BY_FIFTHS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const MINOR_BY_FIFTHS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
  /** The song's key moved by `t` semitones, when the score names its key. */
  const keyAt = (t: number) => {
    if (score.keyFifths === undefined) return "";
    const f = transposeFifths(score.keyFifths, t);
    return score.keyMode === "minor" ? m.music_drills_studio_key_minor({ key: MINOR_BY_FIFTHS[f + 7] }) : m.music_drills_studio_key_major({ key: MAJOR_BY_FIFTHS[f + 7] });
  };
  const transposeLabel = (t: number) =>
    t
      ? `${(t > 0 ? m.music_drills_studio_tr_up : m.music_drills_studio_tr_down)({ n: Math.abs(t) })}${keyAt(t) ? `, ${keyAt(t)}` : ""}`
      : `${m.music_drills_studio_as_written()}${keyAt(0) ? `, ${keyAt(0)}` : ""}`;
  const marksText = $derived(
    [
      score.dynamics?.length ? m.music_drills_studio_dynamics_count({ count: score.dynamics.length }) : "",
      score.hairpins?.length ? m.music_drills_studio_hairpins_count({ count: score.hairpins.length }) : "",
      score.breaths?.length ? m.music_drills_studio_breaths_count({ count: score.breaths.length }) : "",
    ]
      .filter(Boolean)
      .join(", "),
  );
  const summaryLine = $derived(
    [
      sightRead ? m.music_drills_studio_mode_sight() : noStop ? m.music_drills_studio_sum_nostop() : perfMode ? m.music_drills_studio_sum_perf({ count: takes }) : m.music_drills_studio_sum_wait(),
      rangeSummary,
      `${bpm} BPM`,
      picked.length === choices.length ? m.music_drills_studio_all_voices() : and(choices.filter((c) => picked.includes(c.id)).map((c) => c.label)),
      ...(transpose ? [`${(transpose > 0 ? m.music_drills_studio_sum_up : m.music_drills_studio_sum_down)({ count: Math.abs(transpose) })}${keyAt(transpose) ? ` (${keyAt(transpose)})` : ""}`] : []),
      ...(memory === "look" ? [m.music_drills_studio_sum_memory()] : memory === "bars" ? [m.music_drills_studio_sum_memory_bars({ n: memBars })] : []),
      ...(grade === "dynamics" ? [m.music_drills_studio_sum_dynamics()] : grade === "vibrato" ? [m.music_drills_studio_sum_vibrato()] : grade === "balance" ? [m.music_drills_studio_sum_balance()] : []),
      ...(tap ? [m.music_drills_studio_sum_tapping()] : []),
      ...(partner ? [m.music_drills_studio_sum_partner({ parts: and(others.map((c) => c.label)) })] : []),
    ].join(", "),
  );
  const progress = $derived(ls && fstate ? Math.min(1, ls.index / Math.max(1, fstate.groups.length)) : 0);
  const selection = $derived(custom);
</script>

<svelte:window onkeydown={onKey} />


{#snippet stat(label: string, value: string)}
  <span class="inline-flex items-baseline gap-1.5 whitespace-nowrap leading-tight" data-stat>
    <span class="text-ws-stage-soft">{label}</span>
    <span class="tnum font-semibold text-ws-stage-ink">{value}</span>
  </span>
{/snippet}

<!-- Live on a laptop the run fills the screen: the stage takes the height and the score grows into it. -->
<section class="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:gap-4 {live ? 'lg:min-h-[calc(100dvh-7.25rem)]' : ''}" aria-labelledby="studio-title">
  {#if !live}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href="/music/library"><ArrowLeft class="size-4" aria-hidden="true" />{m.music_drills_studio_back_songs()}</a>
        <h1 id="studio-title" class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{song.title}</h1>
        <p class="mt-1 text-ws-soft max-sm:text-sm">
          {song.composer ? `${song.composer}. ` : ""}{m.music_drills_studio_facts({ bars: barsText(facts.bars), meter: facts.meter, key: facts.key ? `, ${facts.key}` : "", bpm: score.bpm, duration: durationText(facts.seconds) })}
        </p>
      </div>
    </header>

  {:else}
    <h1 id="studio-run" tabindex="-1" class="sr-only">{m.music_drills_studio_running({ title: song.title })}</h1>
  {/if}

  <!-- Transport and practice actions: above the score. -->
  <div class="flex flex-wrap items-center gap-2">
    {#if live}
      <button type="button" class="{btnPrimary} min-h-12 px-6" onclick={stop}><Square class="size-4" aria-hidden="true" />{m.music_drills_studio_stop()} <kbd class="text-[13px] opacity-70">Esc</kbd></button>
      {#if phase === "look"}<button type="button" class={btn} onclick={endLook}><Play class="size-4" aria-hidden="true" />{m.music_drills_studio_ready_count_in()}</button>{/if}
      <p class="min-w-0 flex-1 truncate font-display text-lg font-semibold">{song.title}</p>
    {:else}
      <!-- After a run with a slip, the loop on the slipped bars is the useful next step, so it leads and Again steps back. -->
      {#if fixable}
        <button type="button" class="{btnPrimary} min-h-12 px-6 font-display text-base" onclick={fixSpot}><Repeat class="size-5" aria-hidden="true" />{m.music_drills_studio_fix_spot({ where: barsOf(trouble!.range) })}</button>
      {/if}
      <button type="button" class="{offersNext || fixable ? btn : `${btnPrimary} min-h-12 px-6 font-display text-base`}" onclick={start}>
        <Play class="size-5" aria-hidden="true" />{phase === "results" ? m.music_drills_studio_again() : sightRead ? m.music_drills_studio_start_sight() : noStop ? m.music_drills_studio_start_nostop() : perfMode ? m.music_drills_studio_start_perf() : m.music_drills_studio_start()}
      </button>
      <button type="button" class={btn} aria-pressed={!!preview?.playing} disabled={unseen} onclick={togglePreview}>
        {#if preview?.playing}<Square class="size-4" aria-hidden="true" />{m.music_drills_studio_stop_demo()}{:else}<Headphones class="size-4" aria-hidden="true" />{m.music_drills_studio_hear_it()}{/if}
      </button>
      <!-- Editing, export and the metronome are not part of playing along: one menu. -->
      <Menu.Root>
        <Menu.Trigger class="grid size-11 shrink-0 place-items-center rounded-full border border-ws-line bg-ws-surface hover:bg-ws-raised" aria-label={m.music_drills_studio_song_options()}><Dots class="size-5" aria-hidden="true" /></Menu.Trigger>
        <Menu.Content align="start" class="w-60">
          <Menu.Item onSelect={() => goto(`/music/songs/${song.id}/edit`)}><Pencil class="size-4" aria-hidden="true" />{m.music_drills_studio_edit_song()}</Menu.Item>
          <Menu.Item onSelect={exportMidi}><Download class="size-4" aria-hidden="true" />{m.music_drills_studio_export_midi()}</Menu.Item>
          <Menu.Item disabled={settings.value.bpm === bpm} onSelect={metronomeToSong}>
            <Timer class="size-4" aria-hidden="true" />{settings.value.bpm === bpm ? m.music_drills_studio_metronome_at({ bpm }) : m.music_drills_studio_metronome_to({ bpm })}
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>
      <!-- What Start will run, in one line beside it; Setup opens the rest. -->
      <div class="flex min-w-0 flex-1 basis-64 items-center gap-x-2 rounded-full border border-ws-line bg-ws-surface py-0.5 pr-1 pl-4">
        <p class="min-w-0 flex-1 text-sm sm:truncate"><span class="sr-only">{m.music_drills_studio_setup_colon()}</span> <span class="font-medium">{summaryLine}</span></p>
        <button
          type="button"
          class="flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash"
          aria-expanded={setupOpen}
          aria-controls="studio-setup"
          title={m.music_drills_studio_keys_title()}
          onclick={() => (setupOpen = !setupOpen)}
        >
          <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? m.music_drills_studio_hide_setup() : m.music_drills_studio_setup()}
        </button>
      </div>
    {/if}
    {#if live && !drums}<div class="ml-auto"><HubTabs param="view" tabs={VIEWS} label={m.music_drills_studio_notation_view()} /></div>{/if}
  </div>

  {#if !live && setupOpen}
    <div id="studio-setup" class="grid gap-5 rounded-xl border border-ws-line bg-ws-surface p-4 md:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-1 text-sm md:col-span-2" role="group" aria-labelledby="voices-l">
        <span id="voices-l" class="font-medium">{score.source?.kind === "musicxml" ? m.music_drills_studio_parts() : m.music_drills_studio_voices()}</span>
        <div class="flex flex-wrap gap-1.5">
          {#each choices as c (c.id)}
            {@const on = picked.includes(c.id)}
            <button
              type="button"
              class="min-h-11 rounded-lg border px-3 text-sm {on ? 'border-transparent bg-instr-strong font-semibold text-on-instr' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
              aria-pressed={on}
              disabled={on && picked.length === 1}
              onclick={() => toggleVoice(c.id)}>{on ? "✓ " : ""}{c.label}</button
            >
          {/each}
        </div>
        {#if choices.length > 1}<span class="text-ws-soft">{m.music_drills_studio_one_stays_on()}{mixed ? m.music_drills_studio_one_kind() : ""}</span>{/if}
      </div>

      <div class="flex min-w-0 flex-col gap-3">
        <Choice
          label={m.music_drills_studio_range()}
          options={[
            { value: "whole", label: m.music_drills_studio_whole_song() },
            { value: "sections", label: m.music_drills_studio_sections() },
            { value: "custom", label: m.music_drills_studio_custom() },
          ]}
          value={s.range}
          onchange={(v) => setup.set({ range: v })}
        />
        {#if s.range === "sections"}
          <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-labelledby="sections-l">
            <span id="sections-l" class="font-medium">{m.music_drills_studio_sections()}</span>
            <div class="flex flex-wrap gap-1.5">
              {#each sections as sec, i (sec.label + i)}
                {@const on = pickedSections.includes(i)}
                <button type="button" class="min-h-11 rounded-lg border px-3 text-sm {on ? 'border-transparent bg-instr-strong font-semibold text-on-instr' : 'border-ws-line hover:bg-ws-raised'}" aria-pressed={on} onclick={() => toggleSection(i)}>{sec.label}</button>
              {/each}
            </div>
            {#if !pickedSections.length}<span class="text-ws-soft">{m.music_drills_studio_none_picked()}</span>{/if}
          </div>
          <Choice
            label={m.music_drills_studio_order()}
            options={[
              { value: "sequence", label: m.music_drills_studio_in_sequence() },
              { value: "per-section", label: m.music_drills_studio_one_at_a_time() },
            ]}
            value={s.order}
            onchange={(v) => setup.set({ order: v })}
          />
        {:else if s.range === "custom"}
          <Choice
            label={m.music_drills_studio_snap_to()}
            options={[
              { value: "bar", label: m.music_drills_studio_measure() },
              { value: "group", label: m.music_drills_studio_note_group() },
            ]}
            value={s.snap}
            onchange={(v) => setup.set({ snap: v })}
          />
          <p class="text-sm text-ws-soft">
            {drums ? m.music_drills_studio_range_drums() : view === "staff" || view === "tab" ? m.music_drills_studio_range_tap() : m.music_drills_studio_range_switch()}
            {#if custom}<button type="button" class="ml-1 font-medium text-instr-ink underline underline-offset-4" onclick={() => setup.set({ rangeStart: -1, rangeEnd: -1 })}>{m.music_drills_studio_clear_range()}</button>{/if}
          </p>
        {/if}
      </div>

      <div class="grid min-w-0 gap-3 sm:grid-cols-2">
        <Choice
          label={m.music_drills_studio_mode()}
          options={[
            { value: "wait", label: m.music_drills_studio_mode_wait() },
            { value: "performance", label: m.music_drills_studio_mode_perf() },
            { value: "no-stop", label: m.music_drills_studio_mode_nostop() },
            { value: "sight-read", label: m.music_drills_studio_mode_sight() },
          ]}
          value={s.mode}
          onchange={(v) => setup.set({ mode: v })}
        />
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Tempo (BPM)</span>
          <input class="tnum min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" type="number" min="20" max="300" value={bpm} onchange={(e) => setup.set({ bpm: clamp(Number(e.currentTarget.value) || score.bpm, 20, 300) })} />
        </label>
        <Choice
          label={m.music_drills_studio_strictness()}
          options={[
            { value: "relaxed", label: m.music_drills_studio_relaxed() },
            { value: "normal", label: m.music_drills_studio_normal() },
            { value: "strict", label: m.music_drills_studio_strict() },
          ]}
          value={s.strictness}
          disabled={!perfMode}
          onchange={(v) => setup.set({ strictness: v })}
        />
        <Choice
          label={m.music_drills_studio_count_in()}
          options={[
            { value: 0, label: m.music_drills_studio_off() },
            { value: 1, label: m.music_drills_studio_bars_count({ count: 1 }) },
            { value: 2, label: m.music_drills_studio_bars_count({ count: 2 }) },
          ]}
          value={settings.value.countInBars}
          onchange={(v) => settings.update({ countInBars: v as 0 | 1 | 2 })}
        />
        <Choice label={m.music_drills_studio_takes()} options={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))} value={takes} disabled={!perfMode || noStop} onchange={(v) => setup.set({ takes: v })} />
        <p class="self-end text-sm text-ws-soft">{sightRead ? (firstRun ? m.music_drills_studio_hint_sight_first : m.music_drills_studio_hint_sight_played)({ seconds: SIGHT_LOOK_S }) : noStop ? m.music_drills_studio_hint_nostop() : perfMode ? m.music_drills_studio_hint_perf() : m.music_drills_studio_hint_wait()}</p>
      </div>

      <div class="grid min-w-0 gap-3 sm:grid-cols-2 md:col-span-2">
        <Choice
          label={m.music_drills_studio_from_memory()}
          options={[
            { value: "off", label: m.music_drills_studio_off() },
            { value: "look", label: m.music_drills_studio_after_look() },
            { value: "bars", label: m.music_drills_studio_bar_by_bar() },
          ]}
          value={memory}
          onchange={(v) => setup.set({ memory: v })}
        />
        <Choice label={m.music_drills_studio_key()} select options={[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((t) => ({ value: t, label: transposeLabel(t) }))} value={transpose} onchange={(v) => setup.set({ transpose: v })} />
        <Choice
          label={m.music_drills_studio_also_score()}
          options={[
            { value: "notes", label: m.music_drills_studio_notes_only() },
            { value: "dynamics", label: m.music_drills_studio_dynamics_breaths() },
            { value: "vibrato", label: "Vibrato" },
            { value: "balance", label: m.music_drills_studio_melody_balance() },
          ]}
          value={grade === "notes" ? s.grade : grade}
          disabled={!perfMode}
          onchange={(v) => setup.set({ grade: v })}
        />
        <p class="self-end text-sm text-ws-soft">
          {memory === "look" ? m.music_drills_studio_hint_memory_look() : memory === "bars" ? m.music_drills_studio_hint_memory_bars({ count: memBars }) : ""}
          {s.grade === "dynamics" && !hasMarks ? m.music_drills_studio_hint_no_marks() : s.grade === "dynamics" ? m.music_drills_studio_hint_dynamics({ marks: marksText }) : s.grade === "vibrato" ? m.music_drills_studio_hint_vibrato() : hasMarks ? m.music_drills_studio_hint_marks({ marks: marksText }) : ""}
          {s.grade === "balance" ? m.music_drills_studio_hint_balance() : ""}
          {!perfMode && s.grade !== "notes" ? m.music_drills_studio_hint_needs_timed() : ""}
        </p>
        <Choice
          label={m.music_drills_studio_play()}
          options={[
            { value: "notes", label: m.music_drills_studio_the_notes() },
            { value: "tap", label: m.music_drills_studio_tap_rhythm() },
          ]}
          value={tap ? "tap" : "notes"}
          disabled={!perfMode}
          onchange={(v) => setup.set({ tap: v === "tap" })}
        />
        <Choice
          label={m.music_drills_studio_duet_partner()}
          options={[
            { value: "off", label: m.music_drills_studio_off() },
            { value: "on", label: m.music_drills_studio_plays_others() },
          ]}
          value={partner ? "on" : "off"}
          disabled={!perfMode || !others.length}
          onchange={(v) => setup.set({ partner: v === "on" })}
        />
        <p class="self-end text-sm text-ws-soft md:col-span-2">
          {tap ? m.music_drills_studio_hint_tap() : ""}
          {!others.length ? m.music_drills_studio_hint_partner_off() : partner ? m.music_drills_studio_hint_partner_on({ parts: and(others.map((c) => c.label)) }) : m.music_drills_studio_hint_partner_can()}
        </p>
      </div>
    </div>
  {/if}

  {#if phase === "results" && summary}
    <div class="results-enter flex flex-col gap-4">
      <h2 id="studio-results" tabindex="-1" class="sr-only">{m.music_drills_studio_results()}</h2>
      <Results {summary}>
        {#snippet actions()}
          {#if spot}
            <button type="button" class={btn} onclick={() => endSpot(m.music_drills_studio_loop_ended())}>{m.music_drills_studio_end_loop()}</button>
          {/if}
        {/snippet}
      </Results>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4">
          <h3 class="font-semibold">{m.music_drills_studio_takes()}</h3>
          <ul class="mt-2 divide-y divide-ws-line" aria-label={m.music_drills_studio_per_take()}>
            {#each takeRows as r (r.label)}
              <li class="flex items-baseline gap-3 py-2 text-sm">
                <span class="min-w-0 flex-1"><span class="font-medium">{r.label}</span>{#if r.best}<span class="ml-2 rounded-full bg-instr-wash px-2 py-0.5 text-[13px] font-semibold text-instr-ink">{m.music_drills_studio_best_take()}</span>{/if}<span class="block text-ws-soft">{r.detail}</span></span>
                <span class="tnum font-display text-xl font-semibold">{pct(r.score)}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4">
          <h3 class="font-semibold">{m.music_drills_studio_sections()}</h3>
          {#if sectionRows.length}
            <ul class="mt-2 divide-y divide-ws-line" aria-label={m.music_drills_studio_per_section()}>
              {#each sectionRows as r (r.label)}
                <li class="py-2 text-sm">
                  <div class="flex items-baseline justify-between gap-3"><span class="font-medium">{r.label}</span><span class="tnum text-ws-soft">{(perfMode ? m.music_drills_studio_sec_notes : m.music_drills_studio_sec_right_first)({ text: r.text })}</span></div>
                  <div class="mt-1 h-1.5 rounded-full bg-ws-raised"><div class="h-full rounded-full {r.value >= 0.67 ? 'bg-success' : r.value >= 0.34 ? 'bg-warn' : 'bg-destructive'}" style:width="{Math.max(2, r.value * 100)}%"></div></div>
                </li>
              {/each}
            </ul>
          {:else}<p class="mt-2 text-sm text-ws-soft">{m.music_drills_studio_no_sections()}</p>{/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="stage relative overflow-hidden rounded-2xl p-3 sm:p-5 {live ? 'lg:flex lg:flex-1 lg:flex-col' : ''}" class:dim={phase === "results"} data-testid="studio-stage" data-downbeat={(phase === "countin" || phase === "running") && perfMode ? Math.round(startAt) : undefined}>
    {#if !live && (mixed || !drums)}
      <!-- How the score is drawn belongs with the score, not with Start. -->
      <div class="mb-3 flex flex-wrap items-center justify-end gap-2">
        {#if mixed}
          <button type="button" class={btn} aria-pressed={drums} onclick={() => (picked = partsOf(!drums))}><Drum class="size-4" aria-hidden="true" />{drums ? m.music_drills_studio_play_others() : m.music_drills_studio_play_drums()}</button>
        {/if}
        {#if !drums}<HubTabs param="view" tabs={VIEWS} label={m.music_drills_studio_notation_view()} class="max-sm:flex-nowrap max-sm:whitespace-nowrap max-sm:[&>a]:px-2.5" />{/if}
      </div>
    {/if}
    {#if live}
      <!-- Progress in a neutral ink, so the wanted key (in the instrument hue) never reads as part of it. -->
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-ws-stage-ink/10" role="progressbar" aria-label={m.music_drills_studio_run_progress()} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div class="h-full rounded-full bg-ws-stage-ink/70" style:width="{progress * 100}%"></div>
      </div>
      <!-- The run's readout in stage ink: the stage is dark in both themes. -->
      <div class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-base">
        {#if phase === "look"}{@render stat(m.music_drills_studio_stat_look(), `${lookLeft} s`)}{:else}{@render stat(perfMode ? m.music_drills_studio_stat_take() : m.music_drills_studio_mode(), perfMode ? m.music_drills_studio_of({ a: (queue[qi]?.take ?? 0) + 1, b: takes }) : m.music_drills_studio_mode_wait())}{/if}
        {#if ls && fstate}{@render stat(m.music_drills_studio_stat_note(), m.music_drills_studio_of({ a: Math.min(ls.index + 1, fstate.groups.length), b: fstate.groups.length }))}{/if}
        {#if ls?.expected.length && memory === "off" && !tap}{@render stat(m.music_drills_studio_next(), ls.expected.map((x) => (drums ? (GROOVE_VOICES.find((v) => v.midi === x)?.name ?? "") : noteName(x + written))).join(drums ? ", " : " "))}{/if}
        {@render stat("Tempo", `${bpm} BPM`)}
        {#if spot}{@render stat(m.music_drills_studio_stat_loop({ where: barsOf(spot.range) }), m.music_drills_studio_stat_clean({ streak: spot.streak, count: SPOT.clean }))}{/if}
      </div>
      {#if lastMiss && memory === "off"}<p class="mb-2 flex items-center gap-2 text-base font-semibold text-destructive" aria-live="polite"><CircleX class="size-5 shrink-0" aria-hidden="true" />{lastMiss}</p>{/if}
    {:else if preview?.playing}
      <p class="mb-2 text-sm text-ws-stage-soft">{m.music_drills_studio_demo_playing()}</p>
    {/if}
    {#if staffFailed && view === "staff"}
      <p class="mb-3 rounded-xl bg-ws-stage-ink/10 p-3 text-sm">
        {@html m.music_drills_studio_staff_failed({ link: `<a class="font-semibold underline underline-offset-4" href="?view=waterfall">${m.music_drills_studio_open_falling()}</a>` })}
      </p>
    {/if}
    {#if (view === "tab" || fretted) && !live}
      <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium">{m.music_drills_studio_tuning()}</span>
          <Picker class="w-auto" tone="stage" label={m.music_drills_studio_tuning()} value={tuning.id} options={TUNING_LIST.map((t) => ({ value: t.id, label: (t.instrument === "guitar" ? m.music_drills_studio_tuning_guitar : m.music_drills_studio_tuning_ukulele)({ name: t.name }) }))} onchange={(v) => setup.set({ tuning: v })} />
        </div>
        {#if fitted.score !== score}
          <p class="min-w-0 flex-1 text-ws-stage-soft" data-fit>
            {s.fit === "auto" ? fitNote : tuning.instrument === "ukulele" ? m.music_drills_studio_out_of_range_ukulele() : m.music_drills_studio_out_of_range_guitar()}
            <button type="button" class="ml-1 font-semibold text-ws-stage-ink underline underline-offset-4" onclick={() => setup.set({ fit: s.fit === "auto" ? "written" : "auto" })}>{s.fit === "auto" ? m.music_drills_studio_show_written() : m.music_drills_studio_fit_instrument()}</button>
          </p>
        {/if}
      </div>
    {/if}
    {#if view === "fingering" && settings.value.activeInstrument !== "aerophone" && !live}
      <p class="mb-2 text-sm text-ws-stage-soft">{m.music_drills_studio_aero_fingerings()}</p>
    {/if}
    {#if live && memory === "look"}<p class="mb-2 text-sm text-ws-stage-soft">{m.music_drills_studio_memory_hidden()}</p>{/if}
    <StudioScore
      score={played}
      hide={hideBeat}
      {voiceIds}
      {view}
      tuning={{ openStrings: tuning.openStrings, fretCount: tuning.fretCount, name: tuning.name }}
      {cursorBeat}
      {groupStates}
      {marks}
      {flashes}
      {selection}
      onselect={s.range === "custom" && !live ? pickRange : undefined}
      snap={s.snap === "group" ? "group" : "bar"}
      {bpm}
      compact={live}
      {highlights}
      {written}
      {drums}
      timed={perfMode && live}
      onfallback={(r) => (staffFailed = r)}
    />
    {#if unseen}
      <p class="mt-3 text-sm text-ws-stage-soft">{m.music_drills_studio_unseen({ seconds: SIGHT_LOOK_S })}</p>
    {:else if !live && phase !== "results"}
      {#if drums}
        <p class="mt-3 text-sm text-ws-stage-soft">{m.music_drills_studio_drums_hint()}</p>
      {:else}
        <!-- A phone leaves this out so the staff and keys end above the tab bar; the strip names the input. -->
        <p class="mt-3 text-sm text-ws-stage-soft max-sm:hidden">{(octaveExact ? m.music_drills_studio_playing_on : m.music_drills_studio_playing_on_mic)({ instrument: INSTRUMENT_LABEL[settings.value.activeInstrument] })}</p>
      {/if}
    {/if}
  </div>

  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
</section>

<style>
  .stage.dim {
    opacity: 0.7;
  }
  .results-enter {
    animation: ws-rise 220ms ease-out;
  }
</style>
