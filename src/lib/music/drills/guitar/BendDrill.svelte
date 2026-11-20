<script lang="ts">
  // Bends and vibrato, by microphone: pick the note, bend it to the target
  // and hold it (judged where it settles, in cents), or hold a note with
  // vibrato (its rate and width described, not judged). A trace draws the
  // pitch against the target line as you play.
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import { noteName } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { midiAt } from "@repo/music-core/theory/fretboard";
  import { analyseBend, analyseVibrato, BEND, BEND_PROMPT_MS, BEND_SETTLE_MS, type BendResult, type PitchPoint, type VibratoResult } from "@repo/music-core/scoring/bends";
  import { bendLesson } from "@repo/music-core/lessons/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Fretboard from "#lib/music/components/Fretboard.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { pct } from "#lib/music/drill.svelte.ts";
  import { formatNumber } from "@repo/i18n/format";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { mic } from "#lib/music/runtime/index.ts";
  import { exerciseFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import MicPanel from "./MicPanel.svelte";
  import { FRETBOARD_MODES, openMode } from "./modes";

  const EXERCISES = [
    { value: "whole", label: m.music_strings_bend_ex_whole() },
    { value: "half", label: m.music_strings_bend_ex_half() },
    { value: "vibrato", label: m.music_strings_bend_ex_vibrato() },
  ];
  /** Easy to hard, for the next run. */
  const LADDER = ["half", "vibrato", "whole"];
  /** Give up on a prompt after this long, judging what was heard. */
  const PROMPT_MS = BEND_PROMPT_MS;
  /** Vibrato: this long from the first pitched frame. */
  const VIBRATO_MS = 3000;
  /** Judge a bend once it has been held this long. */
  const SETTLED_MS = BEND_SETTLE_MS;

  const cfg = new DrillSetup("fretboard-bends", { exercise: "whole" as string, string: 3, fret: 7, reps: 4 });
  const s = $derived(cfg.value);
  const instr = $derived(fretted());
  const tuning = $derived(tuningFor(instr));
  const exercise = $derived((EXERCISES.some((e) => e.value === s.exercise) ? s.exercise : "whole") as "whole" | "half" | "vibrato");
  const vibrato = $derived(exercise === "vibrato");
  const string = $derived(Math.min(Math.max(1, s.string), tuning.openStrings.length));
  const fret = $derived(Math.min(Math.max(1, s.fret), tuning.fretCount - 2));
  const fromMidi = $derived(midiAt(tuning, string, fret));
  const toMidi = $derived(fromMidi + (exercise === "half" ? 1 : exercise === "whole" ? 2 : 0));
  const reps = $derived([2, 4, 8].includes(s.reps) ? s.reps : 4);
  const entry = catalogEntry("fretboard")!.modes.find((m) => m.id === "bends")!;

  let phase = $state<Phase>("ready");
  // No hidden-target variant: the string, fret and target line are always shown.
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let rep = $state(0);
  let trace = $state.raw<PitchPoint[]>([]);
  let bends = $state.raw<BendResult[]>([]);
  let vibratos = $state.raw<VibratoResult[]>([]);
  let promptAt = 0;
  let unsub: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let judging = false;

  const summaryLine = $derived([
    { text: EXERCISES.find((e) => e.value === exercise)!.label, focus: "exercise" },
    { text: vibrato ? m.music_strings_bend_where({ string, fret, from: noteName(fromMidi) }) : m.music_strings_bend_where_to({ string, fret, from: noteName(fromMidi), to: noteName(toMidi) }) },
    { text: m.music_strings_n_times({ n: reps }), focus: "reps" },
  ]);

  function prompt() {
    trace = [];
    judging = false;
    promptAt = performance.now();
    status = vibrato
      ? m.music_strings_bend_prompt_vibrato({ n: rep + 1, total: reps, note: noteName(fromMidi), seconds: VIBRATO_MS / 1000 })
      : m.music_strings_bend_prompt_bend({ n: rep + 1, total: reps, from: noteName(fromMidi), to: noteName(toMidi) });
    clearTimeout(timer);
    timer = setTimeout(() => judge(), PROMPT_MS);
  }

  function onFrame(f: { at: number; pitch: { hz: number } | null }) {
    if (phase !== "running" || judging) return;
    trace = [...trace, { at: f.at, hz: f.pitch?.hz ?? null }];
    if (vibrato) {
      const first = trace.find((p) => p.hz);
      if (first && f.at - first.at >= VIBRATO_MS) judge();
    } else if (analyseBend(trace, fromMidi, toMidi).heldMs >= SETTLED_MS) judge();
  }

  async function judge() {
    if (judging || phase !== "running") return;
    judging = true;
    clearTimeout(timer);
    if (vibrato) {
      const first = trace.find((p) => p.hz);
      const v = analyseVibrato(first ? trace.filter((p) => p.at >= first.at && p.at <= first.at + VIBRATO_MS) : []);
      vibratos = [...vibratos, v];
      await run!.attempt({ promptId: `vibrato:${fromMidi}`, correct: v.rateHz !== null, partialCredit: v.rateHz !== null ? 1 : 0, metrics: [], source: "audio", heard: trace.some((p) => p.hz) });
      status = v.rateHz === null ? m.music_strings_bend_no_vibrato() : m.music_strings_bend_vibrato_at({ rate: dec1(v.rateHz), width: Math.round(v.widthCents!) });
    } else {
      const b = analyseBend(trace, fromMidi, toMidi);
      bends = [...bends, b];
      await run!.attempt({ promptId: `bend:${fromMidi}>${toMidi}`, correct: b.correct, partialCredit: b.score, metrics: b.metrics, source: "audio", target: toMidi, heard: trace.some((p) => p.hz) });
      status = bendLine(b);
    }
    rep += 1;
    timer = setTimeout(() => (rep >= reps ? void finish() : prompt()), 1200);
  }

  const centsText = (c: number) => m.music_strings_cents({ cents: `${c > 0 ? "+" : ""}${Math.round(c)}` });
  /** One decimal, in the player's language (4.5, 4,5). */
  const dec1 = (x: number) => formatNumber(x, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function bendLine(b: BendResult) {
    if (b.verdict === "not-held") return m.music_strings_bend_not_held_line();
    const where = centsText(b.errorCents!);
    return b.verdict === "in-tune" ? m.music_strings_bend_in_tune_line({ where }) : b.verdict === "close" ? m.music_strings_bend_close_line({ where }) : b.verdict === "flat" ? m.music_strings_bend_flat_line({ where }) : m.music_strings_bend_sharp_line({ where });
  }
  const VERDICT = { "in-tune": m.music_strings_bend_verdict_in_tune, close: m.music_strings_bend_verdict_close, flat: m.music_strings_bend_verdict_flat, sharp: m.music_strings_bend_verdict_sharp } as const;

  async function start(ctx: RunContext) {
    summary = null;
    bends = [];
    vibratos = [];
    rep = 0;
    if (mic.state !== "on" && !(await mic.start())) {
      ctx.stopClock();
      phase = "ready";
      status = mic.error || m.music_strings_bend_mic_failed();
      return;
    }
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: `bends:${exercise}:${tuning.id}:${string}:${fret}:${reps}`,
      skillIds: vibrato ? ["technique.vibrato"] : ["technique.bends"],
      capabilities: ["technique"],
      modality: "played",
      assistance: "guided",
      difficulty: exercise === "half" ? 0.4 : exercise === "whole" ? 0.5 : 0.45,
      instrument: instr,
      params: { exercise, string, fret, reps },
    });
    unsub = mic.subscribeFrames(onFrame);
    prompt();
  }

  async function finish() {
    if (phase !== "running") return;
    clearTimeout(timer);
    unsub?.();
    unsub = null;
    phase = "results";
    if (vibrato) {
      const heard = vibratos.filter((v) => v.rateHz !== null);
      const avg = (f: (v: VibratoResult) => number) => heard.reduce((a, v) => a + f(v), 0) / Math.max(1, heard.length);
      const score = heard.length / vibratos.length;
      const fin = await run!.finish({ score, correct: heard.length === vibratos.length, headline: m.music_strings_bend_run_vibrato({ n: heard.length, total: vibratos.length }) });
      if (!fin.heard) {
        summary = silentRun();
        status = summary.headline;
        return;
      }
      summary = {
        headline: heard.length
          ? m.music_strings_bend_vibrato_summary({ rate: dec1(avg((v) => v.rateHz!)), width: Math.round(avg((v) => v.widthCents!)) })
          : m.music_strings_bend_vibrato_none(),
        metric: `${heard.length}/${vibratos.length}`,
        metricLabel: m.music_strings_bend_with_vibrato(),
        delta: fin.delta,
        best: fin.best,
        xp: fin.xp,
        assistance: m.music_strings_bend_vibrato_assist(),
        rows: vibratos.map((v, i) => ({
          label: m.music_strings_try_n({ n: i + 1 }),
          text: v.rateHz === null ? m.music_strings_bend_no_vibrato_row() : m.music_strings_bend_vibrato_row({ rate: dec1(v.rateHz), width: Math.round(v.widthCents!), evenness: pct(v.evenness ?? 0) }),
        })),
        advance: heard.length ? await advanceAfter(score, heard.length === vibratos.length) : undefined,
      };
    } else {
      const inTune = bends.filter((b) => b.verdict === "in-tune").length;
      const held = bends.filter((b) => b.errorCents !== null);
      const score = bends.reduce((a, b) => a + b.score, 0) / Math.max(1, bends.length);
      const meanErr = held.reduce((a, b) => a + b.errorCents!, 0) / Math.max(1, held.length);
      const correct = inTune === bends.length;
      const fin = await run!.finish({ score, correct, headline: m.music_strings_bend_run_bends({ n: inTune, total: bends.length }) });
      if (!fin.heard) {
        summary = silentRun();
        status = summary.headline;
        return;
      }
      summary = {
        headline: correct
          ? m.music_strings_bend_all_in_tune({ cents: BEND.inTune, note: noteName(toMidi) })
          : held.length
            ? (Math.abs(meanErr) > BEND.inTune ? (meanErr < 0 ? m.music_strings_bend_avg_push : m.music_strings_bend_avg_ease) : m.music_strings_bend_avg)({ n: inTune, total: bends.length, where: centsText(meanErr) })
            : m.music_strings_bend_none_held(),
        metric: `${inTune}/${bends.length}`,
        metricLabel: m.music_strings_in_tune(),
        delta: fin.delta,
        best: fin.best,
        clean: correct,
        cleanMeans: m.music_strings_bend_clean_means(),
        xp: fin.xp,
        assistance: m.music_strings_bend_assist(),
        rows: [
          { label: m.music_strings_bend_row_in_tune({ cents: BEND.inTune }), value: inTune / Math.max(1, bends.length), text: m.music_strings_n_of_total({ n: inTune, total: bends.length }) },
          ...bends.map((b, i) => ({ label: m.music_strings_bend_n({ n: i + 1 }), text: b.verdict === "not-held" ? m.music_strings_bend_not_held() : VERDICT[b.verdict]({ where: centsText(b.errorCents!) }) })),
        ],
        advance: held.length ? await advanceAfter(score, correct) : undefined,
      };
    }
    status = summary.headline;
  }

  /** Half step, vibrato, then a whole step, on this string and fret. */
  function advanceAfter(score: number, correct: boolean) {
    const steps = LADDER.map((v) => ({ label: EXERCISES.find((e) => e.value === v)!.label }));
    return nextRun(`${instr}.bends.${tuning.id}.s${string}.f${fret}`, { steps, step: LADDER.indexOf(exercise) }, { score, correct }, ({ step }) => step !== undefined && cfg.set({ exercise: LADDER[step] }));
  }

  function stop() {
    clearTimeout(timer);
    unsub?.();
    unsub = null;
    phase = "ready";
    status = m.music_strings_stopped_tries_saved();
  }

  onDestroy(() => {
    clearTimeout(timer);
    unsub?.();
  });

  // The trace: cents above the fretted note over the last few seconds, the target dashed.
  const W = 600;
  const H = 140;
  const top = $derived(Math.max(250, (toMidi - fromMidi) * 100 + 80));
  const yOf = (c: number) => H - 8 - ((c + 80) / (top + 80)) * (H - 16);
  const path = $derived.by(() => {
    const pts = trace.filter((p) => p.hz);
    if (pts.length < 2) return "";
    const t0 = Math.max(promptAt, pts.at(-1)!.at - 4000);
    const cents = (hz: number) => 1200 * Math.log2(hz / (440 * 2 ** ((fromMidi - 69) / 12)));
    return pts
      .filter((p) => p.at >= t0)
      .map((p, i) => `${i ? "L" : "M"}${(((p.at - t0) / 4000) * W).toFixed(1)},${yOf(Math.max(-80, Math.min(top, cents(p.hz!)))).toFixed(1)}`)
      .join(" ");
  });
  const last = $derived(bends.at(-1));
</script>

<DrillShell
  title={m.music_strings_bend_title()}
  lesson={{ lessons: [bendLesson(instr, tuning.openStrings)] }}
  hue={instr}
  blurb={m.music_strings_bend_blurb()}
  summary={summaryLine}
  tabs={FRETBOARD_MODES}
  tab="bends"
  ontab={(id) => openMode(FRETBOARD_MODES, id)}
  checkable={false}
  bind:phase
  bind:mode
  bind:status
  progress={rep / reps}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice label={m.music_strings_exercise()} setupKey="exercise" options={EXERCISES} value={exercise} onchange={(v) => cfg.set({ exercise: v })} />
      <Choice label={m.music_strings_tries()} setupKey="reps" options={[2, 4, 8].map((n) => ({ value: n, label: String(n) }))} value={reps} onchange={(v) => cfg.set({ reps: v })} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">{m.music_strings_bend_norms({ inTune: BEND.inTune, close: BEND.close })}</p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_strings_try()} value={m.music_strings_n_of_total({ n: Math.min(rep + 1, reps), total: reps })} />
      {#if last && !vibrato}<Stat label={m.music_strings_bend_last()} value={last.errorCents === null ? m.music_strings_bend_not_held() : centsText(last.errorCents)} tone={last.correct ? "success" : "warn"} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <figure class="mb-3 rounded-xl bg-ws-stage-ink/6 p-3">
      <svg viewBox="0 0 {W} {H}" class="h-36 w-full" preserveAspectRatio="none" role="img" aria-label={vibrato ? m.music_strings_bend_trace({ from: noteName(fromMidi) }) : m.music_strings_bend_trace_to({ from: noteName(fromMidi), to: noteName(toMidi) })}>
        <line x1="0" x2={W} y1={yOf(0)} y2={yOf(0)} class="base" vector-effect="non-scaling-stroke" />
        {#if !vibrato}<line x1="0" x2={W} y1={yOf((toMidi - fromMidi) * 100)} y2={yOf((toMidi - fromMidi) * 100)} class="target" vector-effect="non-scaling-stroke" />{/if}
        {#if path}<path d={path} class="trace" vector-effect="non-scaling-stroke" />{/if}
      </svg>
      <figcaption class="flex justify-between text-[13px] text-ws-stage-soft"><span>{m.music_strings_bend_fretted_note({ note: noteName(fromMidi) })}</span>{#if !vibrato}<span>{m.music_strings_bend_dashed({ note: noteName(toMidi) })}</span>{/if}</figcaption>
    </figure>
    {@const picking = phase === "ready"}
    <Fretboard
      openStrings={tuning.openStrings}
      from={picking ? 0 : Math.max(0, fret - 2)}
      to={picking ? Math.min(tuning.fretCount, Math.max(12, fret + 1)) : Math.min(tuning.fretCount, fret + 3)}
      marks={[{ string, fret, label: vibrato ? "~" : "↑", spoken: m.music_strings_bend_spoken() }]}
      onpick={picking ? (st, f) => cfg.set({ string: st, fret: Math.max(1, f) }) : undefined}
      label={(instr === "ukulele" ? m.music_strings_bend_board_ukulele : m.music_strings_bend_board_guitar)({ string, fret })}
    />
    {#if picking}<p class="mt-2 text-sm text-ws-stage-soft">{m.music_strings_bend_tap_neck()}</p>{/if}
    <div class="mt-3"><MicPanel disabled={phase === "running"} offer={phase !== "ready"} hint={m.music_strings_bend_mic_hint()} /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>

<style>
  .base {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
    stroke-width: 1;
  }
  .target {
    stroke: var(--instr);
    stroke-width: 2;
    stroke-dasharray: 6 5;
  }
  .trace {
    fill: none;
    stroke: var(--ws-stage-ink);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
</style>
