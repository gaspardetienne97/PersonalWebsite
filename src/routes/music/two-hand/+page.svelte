<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import type { HandMode, TwoHandPatternId } from "@repo/music-core/data/index";
  import { TWO_HAND_MODES, TWO_HAND_PATTERNS, TWO_HAND_TONICS, twoHandPattern, twoHandSkills } from "@repo/music-core/content/piano";
  import { gradeTwoHand, type TwoHandResult } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Piano from "#lib/music/components/Piano.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import FallingKeys from "#lib/music/notation/FallingKeys.svelte";
  import { lineScore } from "#lib/music/notation/falling.ts";
  import ViewSwitch from "#lib/music/notation/ViewSwitch.svelte";
  import { page } from "$app/state";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Choice from "#lib/music/components/Choice.svelte";
  import type { SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type ResultRow, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import BeatLane, { type LaneRow } from "#lib/music/drills/piano/BeatLane.svelte";
  import { laneOutcomes, timingOf, verdictOf } from "#lib/music/drills/piano/lane-outcomes.ts";
  import Verdict, { type VerdictKind } from "#lib/music/components/Verdict.svelte";
  import StaffFold from "#lib/music/notation/StaffFold.svelte";
  import { FINGERING_NOTE, Transport, toWritten, benchFromUrl, sounding, spanOf, type TimedNote } from "#lib/music/drills/piano/transport.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { evennessRow } from "@repo/music-core";
  import { formatList } from "@repo/i18n/format";

  const TEMPO = { min: 50, max: 140 };
  const BARS = 2;
  const ABOUT = (tonicName: string): Record<TwoHandPatternId, string> => ({
    "lh-pulse-rh-line": m.music_strings_th_about_lh_pulse(),
    "rh-pulse-lh-line": m.music_strings_th_about_rh_pulse(),
    "lh-shell-rh-line": m.music_strings_th_about_lh_shell(),
    "alberti-rh-holds": m.music_strings_th_about_alberti(),
    "contrary-motion-scale": m.music_strings_th_about_contrary_scale(),
    "contrary-five": m.music_strings_th_about_contrary_five({ tonic: tonicName }),
  });

  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("two-hand", {
    pattern: "lh-pulse-rh-line" as string,
    tonic: "C4",
    hand: "both" as string,
    dynamics: false as boolean,
  });
  const s = $derived(cfg.value);
  const pattern = $derived((TWO_HAND_PATTERNS.some((p) => p.id === s.pattern) ? s.pattern : "lh-pulse-rh-line") as TwoHandPatternId);
  const tonic = $derived(TWO_HAND_TONICS.find((t) => t.name === s.tonic)?.midi ?? 60);
  const hand = $derived((["both", "left", "right"].includes(s.hand) ? s.hand : "both") as HandMode);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const rendering = $derived(twoHandPattern({ pattern, tonic, bars: BARS, handMode: hand }));
  const mirror = $derived(rendering.measuresTogether);
  /** Mirror hands is the easiest pattern, contrary motion the hardest. */
  const level = (p: TwoHandPatternId) => (p === "contrary-five" ? 0.3 : p === "contrary-motion-scale" ? 0.6 : 0.45);
  const LADDER = [...TWO_HAND_PATTERNS].sort((a, b) => level(a.id) - level(b.id));
  const measuresTogether = $derived(mirror && hand === "both");

  // One note per hand event; its length is that hand's own spacing (a beat or an eighth).
  const notes = $derived.by((): TimedNote[] => {
    const evs = rendering.targetEvents;
    const spacing = (h: "left" | "right") => {
      const beats = [...new Set(evs.filter((e) => e.hand === h).map((e) => e.beat))].sort((a, b) => a - b);
      return beats.length > 1 ? beats[1] - beats[0] : 1;
    };
    const sp = { left: spacing("left"), right: spacing("right") };
    const loud = s.dynamics ? { melody: 0.9, other: 0.45 } : { melody: 0.75, other: 0.75 };
    return evs.map((e) => ({
      midi: e.midiNote,
      beat: e.beat,
      dur: sp[e.hand],
      hand: e.hand,
      finger: e.finger,
      velocity: e.hand === rendering.melodyHand ? loud.melody : loud.other,
    }));
  });
  const totalBeats = BARS * 4;
  const span = $derived(spanOf(notes.map((n) => n.midi)));
  const tight = $derived(spanOf(notes.map((n) => n.midi), 0, false));
  const falling = $derived(page.url.searchParams.get("view") === "falling");
  const fallScore = $derived(lineScore(notes.map((n) => ({ midi: n.midi, startBeat: n.beat, durationBeats: n.dur, hand: n.hand, finger: n.finger }))));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<TwoHandResult | null>(null);
  const transport = new Transport();
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopClock: (() => void) | null = null;
  /** Note-ons this run, in beats from the downbeat: the lane marks each note as it lands. */
  let heard = $state<{ midi: number; beat: number }[]>([]);
  let clock0 = { downbeat: 0, beatMs: 500 };
  let verdict = $state<{ kind: VerdictKind; text?: string; key: number } | null>(null);
  /** Wrong keys struck so far in Practice (the lane's tally says the same as the word above the keys). */
  let liveWrong = $state(0);
  /** Where each wrong key fell, in beats: the lane draws a cross there, so its ticks never read as a clean run. */
  let strays = $state<number[]>([]);
  const wrongShown = $derived(phase === "results" ? (result?.wrong ?? 0) : liveWrong);

  const markFor = (n: TimedNote, demo: boolean): CellMarks => ({
    [demo ? "demo" : "target"]: true,
    label: `${n.hand === "left" ? "L" : "R"}${n.finger ?? ""}`,
    role: n.hand,
  });

  // Practice shows the beat that is due (from half a note before it); Check shows nothing.
  const due = (b: number) => notes.filter((n) => b >= n.beat - n.dur / 2 && b < n.beat + n.dur / 2);
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(notes, transport.beat)) out[n.midi] = markFor(n, true);
      return out;
    }
    if (mode !== "practice" || phase === "results") return out;
    const b = phase === "running" || phase === "countin" ? (transport.beat ?? 0) : 0;
    for (const n of due(Math.max(0, b))) out[n.midi] = markFor(n, false);
    return out;
  });

  const lanes = $derived<LaneRow[]>(
    (["left", "right"] as const)
      .filter((h) => hand === "both" || hand === h)
      .map((h) => ({
        id: h,
        mark: h === "left" ? "L" : "R",
        label: h === "left" ? m.music_strings_left_hand_cap() : m.music_strings_right_hand_cap(),
        hand: h,
        notes: notes.filter((n) => n.hand === h).map((n) => ({ beat: n.beat, dur: n.dur, text: noteName(n.midi, "flat", false) })),
      }))
      .reverse(),
  );
  const eighths = $derived(notes.some((n) => n.beat % 1 !== 0));
  // Live in Practice, after the run in both modes; never while Check hides the notes, never from nothing heard.
  const outcomes = $derived.by(() => {
    const live = phase === "running" && mode === "practice";
    if (!(live || (phase === "results" && heard.length))) return {};
    const now = phase === "results" ? null : (transport.beat ?? 0);
    return Object.fromEntries((["left", "right"] as const).map((h) => [h, laneOutcomes(notes.filter((n) => n.hand === h), heard, now)]));
  });

  /** What to play now, beside Stop on a phone: the beat and its notes ("Beat 3: E and A"); Check names the beat only. */
  const cue = $derived.by(() => {
    if (phase !== "running" || transport.beat === null || transport.beat < 0) return "";
    const b = transport.beat;
    const at = { bar: Math.min(BARS, Math.floor(b / 4) + 1), beat: (Math.floor(b) % 4) + 1 };
    if (mode !== "practice") return m.music_strings_th_cue_check(at);
    const names = [...new Set(due(b).sort((x, y) => x.midi - y.midi).map((n) => noteName(n.midi, "flat", false)))];
    return names.length ? m.music_strings_th_cue_notes({ beat: at.beat, notes: names.reduce((a, b) => m.music_strings_and_pair({ a, b })) }) : m.music_strings_th_cue_where(at);
  });

  const patternLabel = $derived(TWO_HAND_PATTERNS.find((p) => p.id === pattern)?.label ?? pattern);
  const tonicName = $derived(noteName(tonic, "flat", false));
  const about = $derived(ABOUT(tonicName));
  const summaryLine = $derived<SetupClause[]>([
    { text: m.music_strings_th_pattern_from({ pattern: patternLabel, tonic: tonicName }), focus: "pattern" },
    { text: hand === "both" ? m.music_strings_both_hands() : hand === "left" ? m.music_strings_left_hand_only() : m.music_strings_right_hand_only(), focus: "hand" },
    ...(s.dynamics ? [{ text: m.music_strings_melody_louder(), focus: "dynamics" }] : []),
  ]);
  const setupKey = $derived(`two-hand:${pattern}:${s.tonic}:${hand}:${s.dynamics ? "dyn" : "flat"}:${bpm}`);

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = m.music_strings_th_demo();
    await transport.demo(notes, bpm);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    heard = [...heard, { midi: e.midi, beat: (e.at - clock0.downbeat) / clock0.beatMs }];
    const b = transport.beat ?? 0;
    const dueNow = due(b);
    const want = dueNow.find((n) => n.midi === e.midi);
    const beat = heard.at(-1)!.beat;
    if (!want) strays = [...strays, beat];
    if (mode !== "practice") return;
    flashes.add(e.midi, want ? "correct" : "wrong");
    if (!want) liveWrong++;
    // The word for the note, as the lane will mark it: on time within a quarter of the hand's spacing.
    const v = want
      ? verdictOf(Math.abs(beat - want.beat) <= want.dur / 4 ? "ok" : beat < want.beat ? "early" : "late", (beat - want.beat) * clock0.beatMs)
      : { kind: "wrong" as const, text: wrongText(e.midi, dueNow) };
    verdict = { ...v, key: (verdict?.key ?? 0) + 1 };
  }

  /** "Wrong note: Bb4, wanted E4": the due note nearest the one played, when there is one. */
  const wrongText = (midi: number, dueNow: readonly TimedNote[]) => {
    const near = [...dueNow].sort((a, b) => Math.abs(a.midi - midi) - Math.abs(b.midi - midi))[0];
    return near ? m.music_strings_th_wrong_wanted({ played: noteName(midi, "flat"), want: noteName(near.midi, "flat") }) : m.music_strings_th_wrong({ played: noteName(midi, "flat") });
  };

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    flashes.clear();
    heard = [];
    verdict = null;
    liveWrong = 0;
    strays = [];
    clock0 = { downbeat: ctx.downbeat, beatMs: ctx.beatMs };
    stopClock = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: "technique.piano.two-hand-independence",
      setupKey,
      skillIds: twoHandSkills(pattern),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, level(pattern) + (bpm - 60) / 300),
      instrument: "piano",
      params: { bpm, pattern, tonic: s.tonic, hand, dynamics: s.dynamics },
    });
    // Scored input starts half a beat before the downbeat, after the count-in.
    cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    transport.follow(ctx.downbeat, ctx.beatMs);
    timer = setTimeout(() => void finish(ctx), Math.max(0, ctx.downbeat - performance.now()) + (totalBeats + 1) * ctx.beatMs);
  }

  async function finish(ctx: RunContext) {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClock?.();
    transport.stop();
    cap?.stop();
    const played = cap?.notes ?? [];
    const r = gradeTwoHand({
      targets: rendering.targetEvents.map((t) => ({ hand: t.hand, midi: t.midiNote, beat: t.beat })),
      splitMidi: rendering.splitMidi,
      measuresTogether: measuresTogether,
      melodyHand: rendering.melodyHand,
      dynamics: s.dynamics,
      beatMs: ctx.beatMs,
      startAt: ctx.downbeat,
      notes: played,
    });
    result = r;
    phase = "results";
    await run!.attempt({
      promptId: setupKey,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(played),
      instrument: runInstrument(played, "piano") ?? null,
      target: rendering.targetEvents.map((t) => t.midiNote),
      response: played.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: m.music_strings_line_run_headline({ score: pct(r.score), bpm }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const advance = played.some((n) => n.kind === "noteon")
      ? await nextRun(`two-hand.${s.tonic}.${hand}.${s.dynamics ? "dyn" : "flat"}`, { bpm, tempo: { min: TEMPO.min, goal: 100, max: TEMPO.max }, steps: LADDER.map((p) => ({ label: p.label })), step: Math.max(0, LADDER.findIndex((p) => p.id === pattern)) }, r, tempoAnd((i) => cfg.set({ pattern: LADDER[i].id })))
      : undefined;
    summary = { ...buildSummary(r, fin), advance };
    status = summary.headline;
  }

  function buildSummary(r: TwoHandResult, fin: { delta: number | null; best: boolean; xp: number }): RunSummary {
    const weak = [...r.hands].sort((a, b) => a.pitch - b.pitch)[0];
    const togetherShare = r.together && r.together.beats ? r.together.count / r.together.beats : null;
    const togetherFine = togetherShare === null || togetherShare >= 0.8;
    const headline = !r.hands.some((h) => h.matched)
      ? m.music_strings_th_none_landed()
      : r.wrong && r.score >= 0.9 && togetherFine
        ? m.music_strings_th_wrong_keys({ n: r.wrong })
        : r.correct
        ? togetherShare !== null
          ? m.music_strings_th_clean_together({ n: r.together!.count, total: r.together!.beats })
          : mode === "check"
            ? m.music_strings_th_clean_check({ bpm })
            : m.music_strings_th_clean({ bpm })
        : r.pitch >= 0.9 && togetherShare !== null && togetherShare < 0.8
          ? m.music_strings_th_not_together({ n: r.together!.count, total: r.together!.beats })
          : weak && weak.pitch < 0.9
            ? (weak.hand === "left" ? m.music_strings_th_weak_left : m.music_strings_th_weak_right)({ n: weak.matched, total: weak.total })
            : m.music_strings_th_spacing();
    const rows: ResultRow[] = r.hands.map((h) => ({
      label: h.hand === "left" ? m.music_strings_th_left_notes() : m.music_strings_th_right_notes(),
      value: h.pitch,
      text: m.music_strings_n_of_total({ n: h.matched, total: h.total }),
    }));
    // Evenness is read from the spacings of the notes that landed: too few and it is not measured (K3).
    rows.push(evennessRow(r.evenness, r.hands.reduce((t, h) => t + h.matched, 0), r.hands.reduce((t, h) => t + h.total, 0)));
    if (measuresTogether)
      rows.push(
        r.together
          ? { label: m.music_strings_th_landed_together(), value: togetherShare ?? 0, text: m.music_strings_n_of_total_beats({ n: r.together.count, total: r.together.beats }) }
          : { label: m.music_strings_th_together_onscreen(), notMeasured: true },
      );
    if (r.wrong) rows.push({ label: m.music_strings_th_wrong_keys_row(), text: String(r.wrong) });
    if (s.dynamics)
      rows.push(r.dynamics === null ? { label: m.music_strings_th_dynamics_row(), notMeasured: true } : { label: m.music_strings_th_dynamics_row(), value: r.dynamics });
    return {
      headline,
      metric: pct(r.score),
      metricLabel: m.music_strings_score(),
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      mode,
      rows,
      cleanMeans: measuresTogether ? m.music_strings_th_clean_together_means() : m.music_strings_th_clean_means(),
      timing: heard.length ? timingOf(Object.values(outcomes).flat()) : undefined,
      next:
        r.correct && mirror && mode === "check"
          ? { label: m.music_strings_th_next_label(), href: "/music/changes/voicings?variant=inversions&key=0", reason: m.music_strings_th_next_reason() }
          : undefined,
    };
  }

  function stop() {
    clearTimeout(timer);
    transport.stop();
    cap?.stop();
    phase = "ready";
    status = m.music_strings_nothing_saved();
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    transport.stop();
  });
</script>

<svelte:head><title>{m.music_strings_th_page_title()}</title></svelte:head>

<DrillShell
  lesson={{ lessons: conceptCard("tips.two-hand"), trigger: "check" }}
  title={m.music_strings_th_title()}
  hue="piano"
  blurb={m.music_strings_th_blurb()}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={transport.beat === null ? 0 : Math.min(1, Math.max(0, transport.beat / totalBeats))}
  clock={{ bpm, beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={transport.playing}
  onstart={start}
  onstop={stop}
  {cue}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
      <Choice label={m.music_strings_pattern()} setupKey="pattern" options={TWO_HAND_PATTERNS.map((p) => ({ value: p.id as string, label: p.label, hint: about[p.id] }))} value={pattern} onchange={(v) => cfg.set({ pattern: v })} />
      <Choice label={m.music_strings_tonic()} options={TWO_HAND_TONICS.map((t) => ({ value: t.name, label: noteName(t.midi, "flat", false) }))} value={s.tonic} onchange={(v) => cfg.set({ tonic: v })} />
      <Choice label={m.music_strings_hands()} setupKey="hand" options={TWO_HAND_MODES.map((x) => ({ value: x.id as string, label: x.id === "both" ? m.music_strings_both_hands_cap() : x.id === "left" ? m.music_strings_left_only() : m.music_strings_right_only() }))} value={hand} onchange={(v) => cfg.set({ hand: v })} />
    </div>
    <div class="mt-4 sm:max-w-sm">
      <Choice
        label={m.music_strings_dynamics()}
        setupKey="dynamics"
        options={[
          { value: "flat", label: m.music_strings_off() },
          { value: "dyn", label: m.music_strings_melody_louder_cap() },
        ]}
        value={s.dynamics ? "dyn" : "flat"}
        onchange={(v) => cfg.set({ dynamics: v === "dyn" })}
      />
    </div>
    <p class="mt-3 text-sm text-ws-soft">{m.music_strings_th_setup_help()}</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && transport.beat !== null}
      <!-- The HUD's own readout counts the beats; this counts the bars. -->
      <Stat label={m.music_strings_bar()} value={m.music_strings_n_of_total({ n: Math.min(totalBeats / 4, Math.floor(Math.max(0, transport.beat) / 4) + 1), total: totalBeats / 4 })} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {@const live = phase === "running" || phase === "countin"}
    {@const pianoLabel = m.music_strings_th_piano_label({ low: noteName(span.low), high: noteName(span.high) })}
    {#if falling && (mode === "practice" || transport.playing || phase === "results")}
      {#if !live}<div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">{@render about_()}<ViewSwitch /></div>{/if}
      <FallingKeys score={fallScore} low={span.low} high={span.high} beat={transport.beat} {marks} {flashes} label={pianoLabel} />
    {:else}
      <div class="flex min-h-0 flex-col gap-3" data-dock="music">
        {#if mode === "practice" || transport.playing || phase === "results"}
          <!-- Before Start the staff engraves smaller, so the lane and the keys share the first screen. -->
          <StaffFold live={live || transport.playing} aside={live ? undefined : aside}><LineNotation maxZoom={live ? 1.1 : 0.6} notes={toWritten(notes)} title={setupKey} cursorBeat={transport.beat} keyFifths={signatureFor(tonic % 12, "major")} /></StaffFold>
        {:else if !live}
          <div class="mb-1">{@render about_()}</div>
        {/if}
        <BeatLane
          rows={lanes}
          beats={totalBeats}
          beat={transport.beat}
          {eighths}
          hidden={mode === "check" && !transport.playing}
          label={m.music_strings_th_lane_label({ rows: lanes.map((l) => m.music_strings_th_lane_row({ label: l.label, n: l.notes.length })).join("; ") })}
          {outcomes}
          wrong={phase === "running" && mode === "practice" ? wrongShown : 0}
          strays={phase === "running" && mode === "practice" ? strays : []}
        />
      </div>
      <div class="flex flex-col" data-dock="instrument">
        <!-- The word for the last note has its own row between the lane and the keys, never over them. -->
        {#if phase === "running"}<Verdict kind={verdict?.kind} text={verdict?.text} key={verdict?.key ?? 0} rail />{/if}
        <Piano low={span.low} high={span.high} fit={tight} {marks} {flashes} minKey={26} label={pianoLabel} />
      </div>
    {/if}
    <div class="mt-3 text-sm text-ws-stage-soft">
      {#if mode === "check" && live}
        <p>{m.music_strings_th_notes_hidden()}</p>
      {:else if live || phase === "results"}
        {#if s.dynamics}<p>{rendering.melodyHand === "left" ? m.music_strings_th_play_left_louder() : m.music_strings_th_play_right_louder()}</p>{/if}
      {:else}
        <details>
          <summary class="flex min-h-11 cursor-pointer items-center">{m.music_strings_th_how_marked()}</summary>
          <div class="flex flex-col gap-1 pb-1">
            <p>{mirror ? FINGERING_NOTE : m.music_strings_th_keys_lr()}</p>
            {#if measuresTogether}<p>{m.music_strings_th_together_midi()}</p>{/if}
            {#if s.dynamics}<p>{rendering.melodyHand === "left" ? m.music_strings_th_dynamics_left() : m.music_strings_th_dynamics_right()}</p>{/if}
            {#if mode === "check"}<p>{m.music_strings_th_check_note()}</p>{/if}
          </div>
        </details>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} {figure} />
    {/if}
  {/snippet}
</DrillShell>

<!-- The pattern in a sentence; the view switch beside it when there is room, its own row on a phone. -->
{#snippet about_()}<p hidden={transport.playing} class="min-w-0 max-w-prose flex-1 text-sm text-ws-stage-soft sm:basis-64">{about[pattern]}</p>{/snippet}
{#snippet aside()}
  {@render about_()}
  {#if mode === "practice" || phase === "results"}<ViewSwitch />{/if}
{/snippet}

<!-- The run as the lane marked it, note by note, under the breakdown. -->
{#snippet figure()}
  {#if heard.length}
    <div class="stage rounded-2xl p-3">
      <p class="mb-2 text-sm font-medium text-ws-stage-soft">{m.music_strings_th_each_note()}</p>
      <BeatLane rows={lanes} beats={totalBeats} {eighths} label={m.music_strings_th_run_lane({ hands: formatList(lanes.map((l) => l.label)) })} {outcomes} wrong={wrongShown} strays={strays.length === wrongShown ? strays : []} />
    </div>
  {/if}
{/snippet}
