<script lang="ts">
  // Strum & identify: one strum through the microphone. The 600 ms after the
  // attack becomes a chroma reading, the pitch classes are named against 18
  // chord templates on 12 roots, and the reading is checked against the shape.
  // score = confidence x 0.35 + verification x 0.65 (gradeStrumIdentify).
  import { m } from "@repo/i18n/messages.js";
  import { onDestroy } from "svelte";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { chordPerfectTargets, shapePcs } from "@repo/music-core/content/technique";
  import { identifyChord } from "@repo/music-core/theory/chords";
  import { gradeStrumIdentify } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { nextRun } from "#lib/music/advance.svelte.ts";
  import { assistanceFor, pct } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, mic } from "#lib/music/runtime/index.ts";
  import { exerciseFor, neckLabel, skillsFor } from "./fretted";
  import { fretted, tuningFor } from "./instrument.svelte";
  import { chordId, chordLabel, chordRef, positionsOn, shapesFor, toneName } from "./chords";
  import { ChordListener, type Heard } from "./strum.svelte";
  import MicPanel, { micUnblock } from "./MicPanel.svelte";
  import ChordPicker from "./ChordPicker.svelte";
  import PositionPicker from "./PositionPicker.svelte";
  import ShapeBoard from "./ShapeBoard.svelte";
  import ToneMap from "./ToneMap.svelte";
  import { CHORD_MODES, openMode } from "./modes";

  /** The first frame this loud after Start is the strum's attack. */
  const TRIGGER_DB = -45;
  const WAIT_MS = 8000;

  const cfg = new DrillSetup("chords-strum", { shape: "guitar.c-major", position: 0 });
  const s = $derived(cfg.value);
  const entry = catalogEntry("chords")!.modes.find((m) => m.id === "strum")!;
  const instr = $derived(fretted());
  const tuning = $derived(tuningFor(instr));
  const ref = $derived(chordRef(s.shape) ?? { root: 0, quality: "maj" });
  const baseId = $derived(chordId(instr, ref));
  const positions = $derived(positionsOn(baseId, tuning));
  const posIndex = $derived(Math.min(s.position, Math.max(0, positions.length - 1)));
  const shape = $derived(positions[posIndex] ?? positions[0] ?? shapesFor(instr)[0]);
  const symbol = $derived(chordLabel(ref));
  /** Tones spelled from the chord's root: F# in D major, not Gb. */
  const spell = (p: number) => toneName(p, ref, false);
  const expected = $derived(shapePcs(shape, tuning).sort((a, b) => a - b));
  /** Tones a strum must show before it is named: three, or two for a power chord. */
  const need = $derived(Math.min(3, expected.length));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let heard = $state<Heard | null>(null);
  let identified = $state<string | null>(null);
  let summary = $state<RunSummary | null>(null);
  /** Set when the strum could not be graded: nothing was recorded, so there is no run to compare. */
  let ungraded = $state<string | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  const listener = new ChordListener();
  let triggerAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const live = $derived(phase === "running" || phase === "countin");

  async function playDemo() {
    if (demo?.playing) {
      demo.stop();
      demo = null;
      return;
    }
    await audio.unlock();
    // The voicing on the stage, strummed low string to high.
    const handle = audio.playSequence(
      chordPerfectTargets(shape, tuning).map((t, i) => ({ midi: t.midi, time: i * 0.02, duration: 2 })),
      {},
    );
    demo = handle;
    status = m.music_strings_strumid_demo_status({ symbol });
    void handle.done.then(() => {
      if (demo === handle) demo = null;
    });
  }

  function start(ctx: RunContext) {
    demo?.stop();
    summary = null;
    heard = null;
    identified = null;
    ungraded = null;
    triggerAt = null;
    status = m.music_strings_strumid_play({ symbol });
    listener.start({
      onFrame: (f) => {
        if (phase !== "running" || f.at < ctx.downbeat) return;
        if (triggerAt === null && f.db > TRIGGER_DB) triggerAt = f.at;
        if (triggerAt !== null) {
          const h = listener.analyse(triggerAt);
          if (h) void grade(h);
        }
      },
    });
    timer = setTimeout(() => void grade(null), WAIT_MS);
  }

  function halt() {
    clearTimeout(timer);
    listener.stop();
  }

  async function grade(h: Heard | null) {
    if (phase !== "running") return;
    halt();
    heard = h;
    phase = "results";
    if (!h || h.pcs.length < need) {
      // Not enough evidence to grade: nothing is recorded.
      const n = h?.pcs.length ?? 0;
      ungraded = !h
        ? m.music_strings_strumid_none_heard()
        : n === 0
          ? m.music_strings_strumid_too_quiet()
          : (n === 1 ? m.music_strings_strumid_one_tone : m.music_strings_strumid_two_tones)({ notes: h.pcs.map(spell).join(", "), symbol, need });
      status = ungraded;
      return;
    }
    const candidates = identifyChord(h.pcs).map((c) => ({ symbol: c.symbol, confidence: c.score }));
    const g = gradeStrumIdentify({ expectedSymbol: symbol, expectedPcs: expected, observedPcs: h.pcs, candidates });
    identified = g.identified;
    const run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: `strum:${shape.id}`,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, shape.difficulty / 5 + 0.1),
      instrument: instr,
      params: { shape: shape.id, position: posIndex },
    });
    await run.attempt({
      promptId: shape.id,
      correct: g.correct,
      partialCredit: g.score,
      metrics: g.metrics,
      source: "audio",
      instrument: instr,
      target: symbol,
      response: g.identified ?? "",
      // A strum was heard (grade only runs on one), even when no chord could be named.
      heard: true,
    });
    const fin = await run.finish({ score: g.score, correct: g.correct, headline: g.identified ? m.music_strings_strumid_run_heard({ chord: g.identified, symbol }) : m.music_strings_strumid_run_nothing({ symbol }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const v = g.verification;
    summary = {
      headline: g.correct
        ? m.music_strings_strumid_rang_as({ symbol })
        : g.identified && g.identified !== symbol
          ? `${m.music_strings_strumid_read_as({ heard: g.identified, symbol })} ${v.missing.length ? m.music_strings_strumid_missing_notes({ notes: v.missing.map(spell).join(", ") }) : ""} ${v.extra.length ? m.music_strings_strumid_extra_notes({ notes: v.extra.map(spell).join(", ") }) : ""}`.trim()
          : v.missing.length
            ? m.music_strings_strumid_named_missing({ symbol, notes: v.missing.map(spell).join(", ") })
            : m.music_strings_strumid_named_extra({ symbol, notes: v.extra.map(spell).join(", ") }),
      metric: pct(g.score),
      metricLabel: m.music_strings_score(),
      delta: fin.delta,
      best: fin.best,
      clean: g.correct && mode === "check",
      cleanMeans: m.music_strings_strumid_clean_means(),
      xp: fin.xp,
      mode,
      rows: [
        { label: m.music_strings_strumid_row_named(), value: g.identified === symbol ? 1 : 0, text: g.identified ?? m.music_strings_none() },
        { label: m.music_strings_strumid_row_target(), value: v.coverage, text: m.music_strings_n_of_total({ n: expected.length - v.missing.length, total: expected.length }) },
        { label: m.music_strings_strumid_row_extra(), text: v.extra.length ? v.extra.map(spell).join(", ") : m.music_strings_none() },
        { label: m.music_strings_strumid_row_confidence(), value: g.confidence },
        { label: m.music_strings_row_which_strings(), notMeasured: true },
        { label: m.music_strings_row_tone_clean(), notMeasured: true },
      ],
      // The chord's positions up the neck, low to high.
      advance: await nextRun(`${instr}.chords.strum.${baseId}`, { steps: positions.map((p) => ({ label: `${symbol}, ${p.positionLabel}` })), step: posIndex }, { score: g.score, correct: g.correct }, ({ step }) => step !== undefined && cfg.set({ position: step })),
    };
    status = summary.headline;
  }

  function stop() {
    halt();
    phase = "ready";
    status = m.music_strings_nothing_saved();
  }

  onDestroy(() => {
    halt();
    demo?.stop();
    mic.stop();
  });
</script>

<DrillShell
  lesson={{ lessons: conceptCard("tips.strum", { tuning }), trigger: "check" }}
  title={m.music_strings_strumid_title()}
  hue={instr}
  blurb={m.music_strings_strumid_blurb()}
  summary={[{ text: symbol, focus: "chord" }, { text: shape.positionLabel ?? m.music_strings_open_position() }, { text: m.music_strings_strumid_one_strum() }]}
  tabs={CHORD_MODES}
  tab="strum"
  ontab={(id) => openMode(CHORD_MODES, id)}
  bind:phase
  bind:mode
  bind:status
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  startLabel={m.music_strings_strumid_start()}
  blocked={mic.state === "on" ? null : m.music_strings_mic_first()}
  unblock={micUnblock}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <ChordPicker label={m.music_strings_chord()} instrument={instr} value={baseId} onchange={(id) => cfg.set({ shape: id, position: 0 })} setupKey="chord" />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_strings_strum()} value={symbol} />
      <Stat label={m.music_strings_hearing()} value={listener.live.length ? listener.live.map(spell).join(" ") : m.music_strings_nothing_yet()} />
    {:else if phase === "results" && identified}
      <Stat label={m.music_strings_heard_as()} value={identified} tone={identified === symbol ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <p class="mb-3 font-display text-5xl font-bold leading-none">{symbol}</p>
    {#if !live && phase !== "results"}<div class="mb-3"><PositionPicker {positions} index={posIndex} {symbol} onchange={(i) => cfg.set({ position: i })} /></div>{/if}
    <div class="flex flex-col justify-end" data-dock="instrument"><ShapeBoard {shape} {tuning} show={mode === "practice" || phase === "results"} label={neckLabel(instr, symbol)} interactive={false} /></div>
    <div class="mt-4 grid gap-2">
      <p class="text-sm font-medium">{phase === "results" ? m.music_strings_strumid_held() : m.music_strings_chord_tones()}</p>
      <ToneMap expected={mode === "practice" || phase === "results" ? expected : []} heard={phase === "results" ? (heard?.pcs ?? []) : live ? listener.live : []} plain={phase === "ready"} label={m.music_strings_chord_tones_of({ symbol })} name={spell} />
    </div>
    <p class="mt-3 max-w-prose text-sm text-ws-stage-soft">
      {m.music_strings_strumid_mic_limits()}
    </p>
    <div class="mt-3"><MicPanel disabled={live} offer={phase !== "ready"} /></div>
  {/snippet}

  {#snippet results()}
    {#if ungraded}
      <article class="rounded-2xl border border-ws-line bg-ws-surface p-5 sm:p-6">
        <p class="font-display text-xl font-semibold leading-snug sm:text-2xl">{ungraded}</p>
        <p class="mt-1 text-sm text-ws-soft">{m.music_strings_nothing_scored()}</p>
      </article>
    {:else if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>
