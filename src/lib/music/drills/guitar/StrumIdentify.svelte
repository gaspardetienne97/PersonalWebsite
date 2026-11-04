<script lang="ts">
  // Strum & identify: one strum through the microphone. The 600 ms after the
  // attack becomes a chroma reading, the pitch classes are named against 18
  // chord templates on 12 roots, and the reading is checked against the shape.
  // score = confidence x 0.35 + verification x 0.65 (gradeStrumIdentify).
  import { onDestroy } from "svelte";
  import { conceptCard } from "@repo/music-core/lessons/cards";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { chordPerfectTargets, shapePcs } from "@repo/music-core/content/technique";
  import { identifyChord } from "@repo/music-core/theory/chords";
  import { gradeStrumIdentify } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "$lib/music/components/Results.svelte";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { nextRun } from "$lib/music/advance.svelte";
  import { assistanceFor, assistanceText, pct } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic } from "$lib/music/runtime";
  import { exerciseFor, skillsFor } from "./fretted";
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
    status = `Listen: ${symbol}. The microphone is not listening to this.`;
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
    status = `Play ${symbol} as one strum and let it ring.`;
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
        ? "No strum was heard in eight seconds. Strum a little harder, close to the microphone."
        : n === 0
          ? "The strum was too quiet to read any tones. Nothing was recorded; move closer and strum again."
          : `Not enough tones to name a chord: heard ${n === 1 ? "only one tone" : "two tones"} (${h.pcs.map(spell).join(", ")}). ${symbol} needs ${need}, so nothing was recorded.`;
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
    const fin = await run.finish({ score: g.score, correct: g.correct, headline: `Heard ${g.identified ?? "nothing"} for ${symbol}` });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const v = g.verification;
    summary = {
      headline: g.correct
        ? `That rang as ${symbol}: every target tone, nothing extra.`
        : g.identified && g.identified !== symbol
          ? `That read as ${g.identified}, not ${symbol}. ${v.missing.length ? `Missing ${v.missing.map(spell).join(", ")}.` : ""} ${v.extra.length ? `Extra ${v.extra.map(spell).join(", ")}.` : ""}`.trim()
          : `Named ${symbol}, but ${v.missing.length ? `${v.missing.map(spell).join(", ")} did not come through` : `${v.extra.map(spell).join(", ")} rang as well`}.`,
      metric: pct(g.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: g.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Chord named", value: g.identified === symbol ? 1 : 0, text: g.identified ?? "None" },
        { label: "Target tones heard", value: v.coverage, text: `${expected.length - v.missing.length} of ${expected.length}` },
        { label: "Extra tones", text: v.extra.length ? v.extra.map(spell).join(", ") : "None" },
        { label: "Identifier confidence", value: g.confidence },
        { label: "Which strings rang", notMeasured: true },
        { label: "Tone cleanliness", notMeasured: true },
      ],
      // The chord's positions up the neck, low to high.
      advance: await nextRun(`${instr}.chords.strum.${baseId}`, { steps: positions.map((p) => ({ label: `${symbol}, ${p.positionLabel}` })), step: posIndex }, { score: g.score, correct: g.correct }, ({ step }) => step !== undefined && cfg.set({ position: step })),
    };
    status = summary.headline;
  }

  function stop() {
    halt();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    halt();
    demo?.stop();
    mic.stop();
  });
</script>

<DrillShell
  lesson={{ lessons: conceptCard("tips.strum", { tuning }), trigger: "check" }}
  title="Strum and identify"
  hue={instr}
  blurb="Strum the chord once into the microphone. The app names what it heard and checks each chord tone."
  summary={[{ text: symbol, focus: "chord" }, { text: shape.positionLabel ?? "Open position" }, { text: "one strum" }]}
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
  startLabel="Listen for a strum"
  blocked={mic.state === "on" ? null : "Turn on the microphone first."}
  unblock={micUnblock}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <ChordPicker label="Chord" instrument={instr} value={baseId} onchange={(id) => cfg.set({ shape: id, position: 0 })} setupKey="chord" />
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Strum" value={symbol} />
      <Stat label="Hearing" value={listener.live.length ? listener.live.map(spell).join(" ") : "Nothing yet"} />
    {:else if phase === "results" && identified}
      <Stat label="Heard as" value={identified} tone={identified === symbol ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <p class="mb-3 font-display text-5xl font-bold leading-none">{symbol}</p>
    {#if !live && phase !== "results"}<div class="mb-3"><PositionPicker {positions} index={posIndex} {symbol} onchange={(i) => cfg.set({ position: i })} /></div>{/if}
    <div class="flex flex-col justify-end" data-dock="instrument"><ShapeBoard {shape} {tuning} show={mode === "practice" || phase === "results"} label="{symbol} on the {instr} neck" interactive={false} /></div>
    <div class="mt-4 grid gap-2">
      <p class="text-sm font-medium">{phase === "results" ? "What the strum held" : "Chord tones"}</p>
      <ToneMap expected={mode === "practice" || phase === "results" ? expected : []} heard={phase === "results" ? (heard?.pcs ?? []) : live ? listener.live : []} plain={phase === "ready"} label="Chord tones of {symbol}" name={spell} />
    </div>
    <p class="mt-3 max-w-prose text-sm text-ws-stage-soft">
      The microphone hears which notes ring, not which string rang them or how clean each one was. Inversions read as the same chord.
    </p>
    <div class="mt-3"><MicPanel disabled={live} offer={phase !== "ready"} /></div>
  {/snippet}

  {#snippet results()}
    {#if ungraded}
      <article class="rounded-2xl border border-ws-line bg-ws-surface p-5 sm:p-6">
        <p class="font-display text-xl font-semibold leading-snug sm:text-2xl">{ungraded}</p>
        <p class="mt-1 text-sm text-ws-soft">Nothing was graded, so no score, XP or mastery changed. Strum again when you are ready.</p>
      </article>
    {:else if summary}<Results {summary} />{/if}
  {/snippet}
</DrillShell>
