<script lang="ts">
  // Song Studio (catalog 4.11). Transport and practice actions sit above the
  // score; the score scrolls in its own viewport. Wait mode waits for each
  // group; Performance keeps time over 1 to 8 takes. Imported songs never
  // write mastery (skillIds: []), and the whole session is one run.
  import { onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Download from "lucide-svelte/icons/download";
  import Headphones from "lucide-svelte/icons/headphones";
  import Settings2 from "lucide-svelte/icons/sliders-horizontal";
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import Timer from "lucide-svelte/icons/timer";
  import Pencil from "lucide-svelte/icons/pencil";
  import { clamp, noteName, pc, type InputEvent, type NoteEvent } from "@repo/music-core";
  import { TUNINGS } from "@repo/music-core/data/index";
  import { scoreToMidi } from "@repo/music-core/io/midi-file";
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
  import HubTabs from "$lib/music/components/HubTabs.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { bench, INSTRUMENT_LABEL } from "$lib/music/bench.svelte";
  import { audio, db, input, settings, type SequenceHandle } from "$lib/music/runtime";
  import { barBeats, scoreGroups as viewGroupsOf, voiceSides, type BeatRange } from "$lib/music/notation/groups";
  import { barsText, durationText, scoreFacts, songSections, type Song } from "$lib/music/hubs/library/songs";
  import StudioScore, { type View } from "./StudioScore.svelte";
  import { buildPass, fitToRange, planPasses, retryBpm, statesByBeat, statesFor, toScoreBeat, tuningRange, voiceChoices, type Pass, type RangeMode, type SectionOrder } from "./studio";
  import Picker from "$lib/music/components/Picker.svelte";

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
  });
  const s = $derived(setup.value);
  const perfMode = $derived(s.mode === "performance");
  const bpm = $derived(clamp(Math.round(s.bpm) || score.bpm, 20, 300));
  const takes = $derived(perfMode ? ([1, 2, 4, 8].includes(s.takes) ? s.takes : 1) : 1);
  const tuning = $derived(TUNING_LIST.find((t) => t.id === s.tuning) ?? TUNING_LIST[0]);
  const custom = $derived<BeatRange | null>(s.rangeStart >= 0 && s.rangeEnd > s.rangeStart ? { startBeat: s.rangeStart, endBeat: s.rangeEnd } : null);

  // Session-local: which voices and sections.
  let picked = $state<string[]>(choices.map((c) => c.id));
  let pickedSections = $state<number[]>([]);
  const voiceIds = $derived(choices.filter((c) => picked.includes(c.id)).flatMap((c) => c.voiceIds));

  const VIEWS = [
    { id: "staff", label: "Staff" },
    { id: "tab", label: "Tab" },
    { id: "fingering", label: "Fingering" },
    { id: "waterfall", label: "Waterfall" },
  ] as const;
  const view = $derived((VIEWS.find((v) => v.id === page.url.searchParams.get("view"))?.id ?? "staff") as View);

  // On guitar or ukulele (or in Tab) the score moves by octaves into the
  // instrument's range, so every note has a string and a fret.
  const fretted = $derived(view === "tab" || ["guitar", "ukulele"].includes(settings.value.activeInstrument));
  const fitted = $derived.by(() => {
    const { low, high } = tuningRange(tuning);
    return fitToRange(score, voiceIds, low, high);
  });
  const fitting = $derived(fretted && s.fit === "auto" && fitted.score !== score);
  const played = $derived(fitting ? fitted.score : score);
  const fitNote = $derived.by(() => {
    const inst = tuning.instrument === "ukulele" ? "ukulele" : "guitar";
    const moved = fitted.shift ? `Moved ${fitted.shift > 0 ? "up" : "down"} ${Math.abs(fitted.shift) / 12 === 1 ? "an octave" : `${Math.abs(fitted.shift) / 12} octaves`}` : "";
    const folded = fitted.folded ? `${fitted.folded} note${fitted.folded === 1 ? "" : "s"} folded by an octave` : "";
    return `${[moved, folded].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase())} to fit the ${inst} (${tuning.name}).`;
  });

  const passes = $derived(
    planPasses(played, sections, { mode: s.range as RangeMode, picked: pickedSections, order: s.order as SectionOrder, custom }).map((segs) =>
      buildPass(played, voiceIds, segs, sections),
    ),
  );
  const viewGroups = $derived(viewGroupsOf(played, voiceIds));
  const sides = $derived(voiceSides(played, voiceIds));
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
  type Phase = "ready" | "countin" | "running" | "results";
  interface Done {
    pass: number;
    take: number;
    label: string;
    result: PerformanceResult | WaitResult;
    state: FollowerState;
    notes: NoteEvent[];
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
  const live = $derived(phase === "running" || phase === "countin");
  const beatMs = $derived(60000 / bpm);
  const octaveExact = $derived(!["guitar", "ukulele", "voice"].includes(settings.value.activeInstrument));

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
        if (g.startBeat <= previewBeat + 1e-6 && previewBeat < g.startBeat + g.durationBeats) for (const n of g.notes) out[n.midi] = { demo: true, role: sides[n.voiceId] };
      return out;
    }
    if (live && ls) for (const m of ls.expected) out[m] = { target: true, role: handAt(m, cursorBeat) };
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
    const pass = passes[0];
    const beatS = 60 / bpm;
    const notes = pass.groups.flatMap((g) => g.notes.map((n) => ({ midi: n.midi, time: g.startBeat * beatS, duration: Math.max(0.08, n.durationBeats * beatS * 0.95), velocity: n.velocity ?? 0.8 })));
    previewPass = pass;
    const h = audio.playSequence(notes);
    preview = h;
    status = `Playing ${pass.label.toLowerCase()} at ${bpm} BPM. Not scored.`;
    void h.done.then(() => {
      if (preview === h) stopPreview();
    });
  }

  function metronomeToSong() {
    settings.update({ bpm });
    status = `The metronome is at ${bpm} BPM, the song's tempo.`;
  }

  function exportMidi() {
    const bytes = scoreToMidi({ ...score, bpm });
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/midi" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.title.replace(/[^\w\- ]+/g, "").trim() || "song"}.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status = `Exported ${a.download} at ${bpm} BPM.`;
  }

  // ---- Running --------------------------------------------------------
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  async function start() {
    if (live) return;
    stopPreview();
    await audio.unlock();
    setupOpen = false;
    summary = null;
    done = [];
    flashes.clear();
    queue = passes.flatMap((_, p) => Array.from({ length: takes }, (_, t) => ({ pass: p, take: t })));
    qi = 0;
    run = practice.beginRun({
      exerciseId: "song.studio",
      setupKey: `${score.id}|${s.mode}|${passes.map((p) => p.label).join("+")}|${voiceIds.join(",")}|${bpm}|${s.strictness}`,
      // Imported songs never write mastery: no skills, deliberately.
      skillIds: [],
      capabilities: ["reading"],
      modality: "read",
      assistance: "guided",
      difficulty: 0.5,
      instrument: settings.value.activeInstrument,
      source: "song",
      params: { song: score.id, mode: s.mode, bpm, takes, strictness: s.strictness, range: s.range },
    });
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
      status = `Wait mode: play ${pass.label.toLowerCase()} at your own pace. The score waits for each note.`;
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
    status = `Take ${item.take + 1} of ${takes}${passes.length > 1 ? `, ${pass.label}` : ""}. Count-in: ${bars} bar${bars > 1 ? "s" : ""}.`;
    // Scored input only after the count-in, so the speakers cannot bleed into the take.
    cap = capture(downbeat - beatMs / 2, onInput);
    timers.push(
      setTimeout(() => {
        if (phase === "countin") {
          phase = "running";
          status = "Go.";
        }
      }, downbeat - performance.now()),
      setTimeout(endTake, downbeat - performance.now() + pass.lengthBeats * beatMs + 350),
    );
    void tick().then(() => document.getElementById("studio-run")?.focus());
  }

  function onInput(e: InputEvent) {
    if ((e.kind !== "noteon" && e.kind !== "noteoff") || !fstate) return;
    const ev = e as NoteEvent;
    if (ev.kind === "noteon") {
      const expected = liveState(fstate, performance.now()).expected;
      const hit = expected.some((m) => (octaveExact ? m === ev.midi : pc(m) === pc(ev.midi)));
      flashes.add(ev.midi, hit ? "correct" : "wrong");
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
    const label = `${passes.length > 1 ? `${active.label}, ` : ""}take ${item.take + 1}`;
    done = [...done, { ...item, label, result, state: fstate, notes: cap?.notes ?? [] }];
    cap = null;
    qi += 1;
    if (qi < queue.length) {
      status = `${label.replace(/^./, (c) => c.toUpperCase())}: ${pct(result.score)}. Next take after the count-in.`;
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
    bench.beat = 0;
    input.router.releaseAll();
    fstate = null;
    active = null;
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  // ---- Results --------------------------------------------------------
  const isPerf = (r: PerformanceResult | WaitResult): r is PerformanceResult => "matched" in r;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  interface Row {
    label: string;
    score: number;
    detail: string;
    best?: boolean;
  }
  let takeRows = $state.raw<Row[]>([]);
  let sectionRows = $state.raw<{ label: string; value: number; text: string }[]>([]);

  async function finish() {
    phase = "results";
    const all = [...done];
    const notes = all.flatMap((d) => d.notes);
    const instrument = runInstrument(notes) ?? null;
    for (const d of all)
      await run!.attempt({
        promptId: `${score.id}:${d.label}`,
        correct: d.result.correct,
        partialCredit: d.result.score,
        metrics: d.result.metrics,
        source: runSource(d.notes),
        instrument,
        skillIds: [],
      });
    // "Pick up where you left off" in Songs follows the last song practised.
    void db.songs.update(song.id, { updatedAt: Date.now() });
    const perf = all.filter((d) => isPerf(d.result)).map((d) => d.result as PerformanceResult);
    const mean = sum(all.map((d) => d.result.score)) / Math.max(1, all.length);
    const agg = perf.length ? aggregateTakes(perf) : null;
    const bestIdx = all.reduce((b, d, i) => (d.result.score > all[b].result.score ? i : b), 0);

    takeRows = all.map((d, i) => ({
      label: d.label.replace(/^./, (c) => c.toUpperCase()),
      score: d.result.score,
      best: all.length > 1 && i === bestIdx,
      detail: isPerf(d.result)
        ? `${d.result.matched} of ${d.result.expected} notes, ${Math.round(d.result.meanAbsErrorMs)} ms off, ${d.result.early} early, ${d.result.onTime} on time, ${d.result.late} late, ${d.result.missed} missed, ${d.result.extra} extra`
        : `${(d.result as WaitResult).cleanGroups} of ${(d.result as WaitResult).total} groups clean, ${(d.result as WaitResult).wrongNotes} wrong note${(d.result as WaitResult).wrongNotes === 1 ? "" : "s"}`,
    }));
    sectionRows = tallySections(all);

    const fin = await run!.finish({
      score: mean,
      correct: all.every((d) => d.result.correct),
      headline: `${pct(mean)} at ${bpm} BPM, ${perfMode ? "performance" : "wait"}`,
      params: { takesPlayed: all.length },
    });

    if (perf.length && agg) {
      const matched = sum(perf.map((r) => r.matched));
      const expected = sum(perf.map((r) => r.expected));
      const errMs = matched ? sum(perf.map((r) => r.meanAbsErrorMs * r.matched)) / matched : 0;
      const best = agg.best!;
      summary = {
        headline:
          best.correct
            ? `Clean take at ${bpm} BPM: ${pct(best.score)} on your best try.`
            : best.pitchCompletion < 0.7
              ? `You found ${best.matched} of ${best.expected} notes on your best take. Try Wait mode or 8 BPM slower.`
              : `The notes are there; timing drifted ${Math.round(best.meanAbsErrorMs)} ms on average. Same tempo again.`,
        metric: pct(agg.meanScore),
        metricLabel: perf.length > 1 ? `mean of ${perf.length} takes` : "score",
        delta: fin.delta,
        best: fin.best,
        clean: perf.every((r) => r.correct),
        xp: fin.xp,
        assistance: "Song practice goes in your journal. Imported songs don't change skill mastery.",
        rows: [
          { label: "Notes matched", value: expected ? matched / expected : 0, text: `${matched} of ${expected}` },
          { label: "Pitch completion", value: expected ? matched / expected : 0 },
          { label: "Timing error (mean)", text: matched ? `${Math.round(errMs)} ms` : "No notes matched" },
          { label: "Best take", text: `Take ${agg.bestIndex + 1}, ${pct(best.score)}` },
          { label: "Early / on time / late", text: `${sum(perf.map((r) => r.early))} / ${sum(perf.map((r) => r.onTime))} / ${sum(perf.map((r) => r.late))}` },
          { label: "Missed / extra", text: `${sum(perf.map((r) => r.missed))} / ${sum(perf.map((r) => r.extra))}` },
        ],
      };
    } else {
      const w = all.map((d) => d.result as WaitResult);
      const clean = sum(w.map((r) => r.cleanGroups));
      const total = sum(w.map((r) => r.total));
      const wrong = sum(w.map((r) => r.wrongNotes));
      summary = {
        headline:
          clean === total
            ? "Every note found with no wrong ones. Try it in Performance mode."
            : `${clean} of ${total} groups clean; ${wrong} wrong note${wrong === 1 ? "" : "s"} along the way.`,
        metric: pct(mean),
        metricLabel: "groups clean",
        delta: fin.delta,
        best: fin.best,
        clean: clean === total,
        xp: fin.xp,
        assistance: "Wait mode is guided practice. Imported songs don't change skill mastery.",
        rows: [
          { label: "Groups played clean", value: total ? clean / total : 0, text: `${clean} of ${total}` },
          { label: "Pitch completion", value: total ? sum(w.map((r) => r.completed)) / total : 0 },
          { label: "Wrong notes", text: String(wrong) },
          { label: "Timing", notMeasured: true },
          { label: "Early / on time / late", notMeasured: true },
        ],
      };
    }
    status = summary.headline;
    fstate = all.at(-1)?.state ?? null;
    active = all.at(-1) ? passes[all.at(-1)!.pass] : null;
    now = performance.now() + 1e7;
    await tick();
    document.getElementById("studio-results")?.focus();
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
    return [...acc].filter(([, a]) => a.total).map(([label, a]) => ({ label, value: a.hit / a.total, text: `${a.hit} of ${a.total}` }));
  }

  function retry(delta: number) {
    setup.set({ bpm: retryBpm(bpm, delta) });
    void start();
  }

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
    } else if (e.key === "Escape" && live) {
      e.preventDefault();
      stop();
    }
  }

  onDestroy(() => {
    clearTimers();
    cap?.stop();
    metro?.stop();
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
    if (picked.includes(id)) {
      if (picked.length > 1) picked = picked.filter((p) => p !== id);
    } else picked = [...picked, id];
  }
  function toggleSection(i: number) {
    pickedSections = pickedSections.includes(i) ? pickedSections.filter((x) => x !== i) : [...pickedSections, i].sort((a, b) => a - b);
  }
  function pickRange(r: BeatRange) {
    setup.set({ rangeStart: r.startBeat, rangeEnd: r.endBeat });
    const bars = Math.round((r.endBeat - r.startBeat) / barLen);
    status = `Custom range set: ${bars >= 1 ? `${bars} bar${bars === 1 ? "" : "s"}` : "a few notes"} from bar ${Math.floor(r.startBeat / barLen) + 1}.`;
  }

  const rangeSummary = $derived(
    s.range === "custom" ? (custom ? `bars ${Math.floor(custom.startBeat / barLen) + 1} to ${Math.ceil(custom.endBeat / barLen)}` : "custom range (not set yet)") : s.range === "sections" && pickedSections.length ? `${pickedSections.length} section${pickedSections.length > 1 ? "s" : ""}${pickedSections.length > 1 ? (s.order === "per-section" ? ", one at a time" : ", in sequence") : ""}` : "whole score",
  );
  const summaryLine = $derived(
    `${perfMode ? `Performance, ${takes} take${takes > 1 ? "s" : ""}` : "Wait mode"}, ${rangeSummary}, ${bpm} BPM, ${picked.length === choices.length ? "all voices" : choices.filter((c) => picked.includes(c.id)).map((c) => c.label).join(" and ")}`,
  );
  const progress = $derived(ls && fstate ? Math.min(1, ls.index / Math.max(1, fstate.groups.length)) : 0);
  const selection = $derived(custom);
</script>

<svelte:window onkeydown={onKey} />

<section class="mx-auto flex w-full max-w-6xl flex-col gap-4" aria-labelledby="studio-title">
  {#if !live}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href="/music/library"><ArrowLeft class="size-4" aria-hidden="true" />Back to your songs</a>
        <h1 id="studio-title" class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{song.title}</h1>
        <p class="mt-1 text-ws-soft">
          {song.composer ? `${song.composer}. ` : ""}{barsText(facts.bars)} in {facts.meter}{facts.key ? `, ${facts.key}` : ""}, written at {score.bpm} BPM ({durationText(facts.seconds)}).
        </p>
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-ws-line bg-ws-surface px-4 py-2">
      <p class="min-w-0 flex-1 text-sm"><span class="text-ws-soft">Setup:</span> <span class="font-medium">{summaryLine}</span></p>
      <button
        type="button"
        class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash"
        aria-expanded={setupOpen}
        aria-controls="studio-setup"
        onclick={() => (setupOpen = !setupOpen)}
      >
        <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? "Done" : "Change setup"}
      </button>
    </div>

    {#if setupOpen}
      <div id="studio-setup" class="grid gap-5 rounded-xl border border-ws-line bg-ws-surface p-4 md:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-1 text-sm md:col-span-2" role="group" aria-labelledby="voices-l">
          <span id="voices-l" class="font-medium">{score.source?.kind === "musicxml" ? "Parts" : "Voices"}</span>
          <div class="flex flex-wrap gap-1.5">
            {#each choices as c (c.id)}
              {@const on = picked.includes(c.id)}
              <button
                type="button"
                class="min-h-11 rounded-lg border px-3 text-sm {on ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
                aria-pressed={on}
                disabled={on && picked.length === 1}
                onclick={() => toggleVoice(c.id)}>{on ? "✓ " : ""}{c.label}</button
              >
            {/each}
          </div>
          {#if choices.length > 1}<span class="text-ws-soft">At least one stays on.</span>{/if}
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <Choice
            label="Range"
            options={[
              { value: "whole", label: "Whole score" },
              { value: "sections", label: "Sections" },
              { value: "custom", label: "Custom" },
            ]}
            value={s.range}
            onchange={(v) => setup.set({ range: v })}
          />
          {#if s.range === "sections"}
            <div class="flex min-w-0 flex-col gap-1 text-sm" role="group" aria-labelledby="sections-l">
              <span id="sections-l" class="font-medium">Sections</span>
              <div class="flex flex-wrap gap-1.5">
                {#each sections as sec, i (sec.label + i)}
                  {@const on = pickedSections.includes(i)}
                  <button type="button" class="min-h-11 rounded-lg border px-3 text-sm {on ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line hover:bg-ws-raised'}" aria-pressed={on} onclick={() => toggleSection(i)}>{sec.label}</button>
                {/each}
              </div>
              {#if !pickedSections.length}<span class="text-ws-soft">None picked yet: the whole score plays.</span>{/if}
            </div>
            <Choice
              label="Order"
              options={[
                { value: "sequence", label: "In sequence" },
                { value: "per-section", label: "One at a time" },
              ]}
              value={s.order}
              onchange={(v) => setup.set({ order: v })}
            />
          {:else if s.range === "custom"}
            <Choice
              label="Snap to"
              options={[
                { value: "bar", label: "Measure" },
                { value: "group", label: "Note group" },
              ]}
              value={s.snap}
              onchange={(v) => setup.set({ snap: v })}
            />
            <p class="text-sm text-ws-soft">
              {view === "staff" || view === "tab" ? "Tap where the range starts on the score below, then where it ends. Drag the Start and End handles to adjust." : "Switch to Staff or Tab to mark the range."}
              {#if custom}<button type="button" class="ml-1 font-medium text-instr-ink underline underline-offset-4" onclick={() => setup.set({ rangeStart: -1, rangeEnd: -1 })}>Clear the range</button>{/if}
            </p>
          {/if}
        </div>

        <div class="grid min-w-0 gap-3 sm:grid-cols-2">
          <Choice
            label="Mode"
            options={[
              { value: "wait", label: "Wait" },
              { value: "performance", label: "Performance" },
            ]}
            value={s.mode}
            onchange={(v) => setup.set({ mode: v })}
          />
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Tempo (BPM)</span>
            <input class="tnum min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" type="number" min="20" max="300" value={bpm} onchange={(e) => setup.set({ bpm: clamp(Number(e.currentTarget.value) || score.bpm, 20, 300) })} />
          </label>
          <Choice
            label="Strictness"
            options={[
              { value: "relaxed", label: "Relaxed" },
              { value: "normal", label: "Normal" },
              { value: "strict", label: "Strict" },
            ]}
            value={s.strictness}
            disabled={!perfMode}
            onchange={(v) => setup.set({ strictness: v })}
          />
          <Choice
            label="Count-in"
            options={[
              { value: 0, label: "Off" },
              { value: 1, label: "1 bar" },
              { value: 2, label: "2 bars" },
            ]}
            value={settings.value.countInBars}
            onchange={(v) => settings.update({ countInBars: v as 0 | 1 | 2 })}
          />
          <Choice label="Takes" options={[1, 2, 4, 8].map((n) => ({ value: n, label: String(n) }))} value={takes} disabled={!perfMode} onchange={(v) => setup.set({ takes: v })} />
          <p class="self-end text-sm text-ws-soft">{perfMode ? "Performance keeps time; a count-in of at least one bar always plays." : "Wait mode is one take and never rushes you; strictness and takes apply to Performance."}</p>
        </div>
      </div>
    {/if}
  {:else}
    <h1 id="studio-run" tabindex="-1" class="sr-only">{song.title}, running</h1>
  {/if}

  <!-- Transport and practice actions: above the score. -->
  <div class="flex flex-wrap items-center gap-2">
    {#if live}
      <button type="button" class="{btnPrimary} min-h-12 px-6" onclick={stop}><Square class="size-4" aria-hidden="true" />Stop <kbd class="text-xs opacity-70">Esc</kbd></button>
      <p class="min-w-0 flex-1 truncate font-display text-lg font-semibold">{song.title}</p>
    {:else}
      <button type="button" class="{btnPrimary} min-h-12 px-6 font-display text-base" onclick={start}>
        <Play class="size-5" aria-hidden="true" />{phase === "results" ? "Again" : perfMode ? "Start performance" : "Start in wait mode"}
      </button>
      <button type="button" class={btn} aria-pressed={!!preview?.playing} onclick={togglePreview}>
        {#if preview?.playing}<Square class="size-4" aria-hidden="true" />Stop preview{:else}<Headphones class="size-4" aria-hidden="true" />Hear it{/if}
      </button>
      <a class={btn} href="/music/songs/{song.id}/edit"><Pencil class="size-4" aria-hidden="true" />Edit notes</a>
      <button type="button" class={btn} onclick={exportMidi}><Download class="size-4" aria-hidden="true" />Export MIDI</button>
      <button type="button" class={btn} disabled={settings.value.bpm === bpm} onclick={metronomeToSong}>
        <Timer class="size-4" aria-hidden="true" />{settings.value.bpm === bpm ? `Metronome at ${bpm} BPM` : `Set metronome to ${bpm} BPM`}
      </button>
      <span class="hidden text-sm text-ws-soft sm:inline">Space starts, Esc stops.</span>
    {/if}
    <div class="ml-auto flex flex-wrap items-center gap-2">
      <HubTabs param="view" tabs={VIEWS} label="Score view" />
    </div>
  </div>

  {#if phase === "results" && summary}
    <div class="results-enter flex flex-col gap-4">
      <h2 id="studio-results" tabindex="-1" class="sr-only">Results</h2>
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => retry(8)}>Again at {retryBpm(bpm, 8)} BPM</button>
          <button type="button" class={btn} onclick={() => retry(0)}>Same tempo</button>
          <button type="button" class={btn} onclick={() => retry(-8)}>Slower, {retryBpm(bpm, -8)} BPM</button>
        {/snippet}
      </Results>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4">
          <h3 class="font-semibold">Takes</h3>
          <ul class="mt-2 divide-y divide-ws-line" aria-label="Per-take results">
            {#each takeRows as r (r.label)}
              <li class="flex items-baseline gap-3 py-2 text-sm">
                <span class="min-w-0 flex-1"><span class="font-medium">{r.label}</span>{#if r.best}<span class="ml-2 rounded-full bg-instr-wash px-2 py-0.5 text-xs font-semibold text-instr-ink">Best take</span>{/if}<span class="block text-ws-soft">{r.detail}</span></span>
                <span class="tnum font-display text-xl font-semibold">{pct(r.score)}</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4">
          <h3 class="font-semibold">Sections</h3>
          {#if sectionRows.length}
            <ul class="mt-2 divide-y divide-ws-line" aria-label="Per-section results">
              {#each sectionRows as r (r.label)}
                <li class="py-2 text-sm">
                  <div class="flex items-baseline justify-between gap-3"><span class="font-medium">{r.label}</span><span class="tnum text-ws-soft">{r.text} {perfMode ? "notes" : "groups clean"}</span></div>
                  <div class="mt-1 h-1.5 rounded-full bg-ws-raised"><div class="h-full rounded-full {r.value >= 0.67 ? 'bg-success' : r.value >= 0.34 ? 'bg-warn' : 'bg-destructive'}" style:width="{Math.max(2, r.value * 100)}%"></div></div>
                </li>
              {/each}
            </ul>
          {:else}<p class="mt-2 text-sm text-ws-soft">This range has no sections to split.</p>{/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="stage relative overflow-hidden rounded-2xl p-3 sm:p-5" class:dim={phase === "results"}>
    {#if live}
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-ws-stage-ink/10" role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div class="h-full rounded-full bg-instr" style:width="{progress * 100}%"></div>
      </div>
      <div class="mb-3 flex flex-wrap gap-2">
        <Stat label={perfMode ? "Take" : "Mode"} value={perfMode ? `${(queue[qi]?.take ?? 0) + 1} of ${takes}` : "Wait"} />
        {#if ls && fstate}<Stat label="Group" value="{Math.min(ls.index + 1, fstate.groups.length)} of {fstate.groups.length}" />{/if}
        {#if ls?.expected.length}<Stat label="Next" value={ls.expected.map((m) => noteName(m)).join(" ")} />{/if}
        <Stat label="Tempo" value="{bpm} BPM" />
      </div>
    {:else if preview?.playing}
      <p class="mb-2 text-sm text-ws-stage-soft">Listening, not scored. The cursor follows the sound.</p>
    {/if}
    {#if staffFailed && view === "staff"}
      <p class="mb-3 rounded-xl bg-ws-stage-ink/10 p-3 text-sm">
        Staff preview unavailable for this score. <a class="font-semibold underline underline-offset-4" href="?view=waterfall">Open the Waterfall</a>, which shows every note.
      </p>
    {/if}
    {#if (view === "tab" || fretted) && !live}
      <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium">Tuning</span>
          <Picker class="w-auto" tone="stage" label="Tuning" value={tuning.id} options={TUNING_LIST.map((t) => ({ value: t.id, label: `${t.instrument === "guitar" ? "Guitar" : "Ukulele"}, ${t.name}` }))} onchange={(v) => setup.set({ tuning: v })} />
        </div>
        {#if fitted.score !== score}
          <p class="min-w-0 flex-1 text-ws-stage-soft" data-fit>
            {s.fit === "auto" ? fitNote : `As written: some notes are out of the ${tuning.instrument === "ukulele" ? "ukulele" : "guitar"}'s range.`}
            <button type="button" class="ml-1 font-semibold text-ws-stage-ink underline underline-offset-4" onclick={() => setup.set({ fit: s.fit === "auto" ? "written" : "auto" })}>{s.fit === "auto" ? "Show as written" : "Fit to the instrument"}</button>
          </p>
        {/if}
      </div>
    {/if}
    {#if view === "fingering" && settings.value.activeInstrument !== "aerophone" && !live}
      <p class="mb-2 text-sm text-ws-stage-soft">Aerophone fingerings for the top line of the selected voices.</p>
    {/if}
    <StudioScore
      score={played}
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
      onfallback={(r) => (staffFailed = r)}
    />
    {#if !live && phase !== "results"}
      <p class="mt-3 text-sm text-ws-stage-soft">Playing on {INSTRUMENT_LABEL[settings.value.activeInstrument]}{octaveExact ? "" : "; octaves don't count against you through the microphone"}. MIDI, the on-screen keys and your computer keyboard all work.</p>
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
