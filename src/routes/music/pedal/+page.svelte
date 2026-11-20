<script lang="ts">
  // Legato (syncopated) pedalling: a chord a bar, the sustain pedal lifted just
  // after each new chord sounds and pressed straight down again. Each change is
  // judged from CC 64 against the chord's first note; the line under the chart
  // draws what the pedal did.
  import { onDestroy } from "svelte";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import type { InputEvent, NoteEvent } from "@repo/music-core";
  import { FLAT_NAMES, noteName, pc } from "@repo/music-core";
  import { PEDAL_PROGRESSIONS, pedalChords } from "@repo/music-core/content/piano";
  import { gradePedal, PEDAL, type PedalResult, type PedalVerdict } from "@repo/music-core/scoring/piano";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import { pedalLesson } from "@repo/music-core/lessons/technique";
  import Piano from "#lib/music/components/Piano.svelte";
  import StaffFold from "#lib/music/notation/StaffFold.svelte";
  import LineNotation from "#lib/music/notation/LineNotation.svelte";
  import { signatureFor } from "@repo/music-core/theory/circle";
  import Choice from "#lib/music/components/Choice.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import type { SetupClause } from "#lib/music/components/DrillShell.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { benchFromUrl, sounding, spanOf, Transport, type TimedNote } from "#lib/music/drills/piano/transport.svelte.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import { nextRun, tempoAnd } from "#lib/music/advance.svelte.ts";
  import { m } from "@repo/i18n/messages.js";
  import { chord, keyName, note, useNamingKey } from "#lib/music/names.svelte.ts";

  const TEMPO = { min: 40, max: 120 };
  let mode = $state<DrillMode>(benchFromUrl(TEMPO));
  const cfg = new DrillSetup("pedal", { key: 0, progression: "I-vi-IV-V" as string, rounds: 2 });
  const s = $derived(cfg.value);
  const bpm = $derived(Math.min(TEMPO.max, Math.max(TEMPO.min, settings.value.bpm)));
  const beatMs = $derived(60000 / bpm);
  const barMs = $derived(4 * beatMs);
  const progression = $derived(PEDAL_PROGRESSIONS.find((p) => p.id === s.progression) ?? PEDAL_PROGRESSIONS[0]);
  const once = $derived(pedalChords(pc(s.key), progression.id));
  const bars = $derived(Array.from({ length: Math.max(1, Math.min(4, s.rounds)) }, () => once).flat());

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state.raw<PedalResult | null>(null);
  let chordOk = $state<boolean[]>([]);
  let downbeat = $state(0);
  let now = $state(0);
  let pedalDown = $state(false);
  let pedalTrace = $state.raw<{ at: number; value: number }[]>([]);
  const flashes = new Flashes();
  const transport = new Transport();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raf = 0;
  let stopClockRef: (() => void) | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;

  const barIndex = $derived(phase === "running" && now >= downbeat ? Math.min(bars.length - 1, Math.floor((now - downbeat) / barMs)) : null);
  /** Beside Stop on a phone: the chord now and the move ("Chord 2 of 4: F, then lift"). */
  const cue = $derived(barIndex === null ? "" : (mode === "practice" ? m.music_winds_pedal_cue_practice : m.music_winds_pedal_cue)({ n: barIndex + 1, total: bars.length, chord: chord(bars[barIndex].symbol) }));
  const current = $derived(barIndex === null ? (phase === "ready" ? bars[0] : null) : bars[barIndex]);
  /** The chart as timed notes, for Hear it first: each chord held for its bar. */
  const demoNotes = $derived<TimedNote[]>(bars.flatMap((b, k) => [b.leftHand, ...b.rightHand].map((midi, i) => ({ midi, beat: k * 4, dur: 4, hand: i === 0 ? ("left" as const) : ("right" as const) }))));
  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    if (transport.playing) {
      for (const n of sounding(demoNotes, transport.beat)) out[n.midi] = { demo: true, label: n.hand === "left" ? m.music_winds_stick_left() : m.music_winds_stick_right(), role: n.hand };
      return out;
    }
    if (mode !== "practice" || phase === "results" || !current) return out;
    out[current.leftHand] = { target: true, label: m.music_winds_stick_left(), role: "left" };
    for (const midi of current.rightHand) out[midi] = { target: true, label: m.music_winds_stick_right(), role: "right" };
    return out;
  });

  const tonic = $derived(FLAT_NAMES[pc(s.key)]);
  // Movable do counts from the key the chords are in (every progression here is major).
  useNamingKey(() => ({ tonic }));
  /** The chords written out, a bar each: the root in the left hand, the chord in the right. */
  const written = $derived(bars.flatMap((b, k) => [{ midi: b.leftHand, startBeat: k * 4, durationBeats: 4, hand: "left" as const }, ...b.rightHand.map((midi) => ({ midi, startBeat: k * 4, durationBeats: 4, hand: "right" as const }))]));
  const summaryLine = $derived<SetupClause[]>([{ text: m.music_winds_pedal_summary({ progression: progression.label, key: keyName(tonic) }), focus: "progression" }, { text: m.music_winds_pedal_chords({ count: bars.length }), focus: "rounds" }, { text: m.music_winds_pedal_a_chord_a_bar() }]);
  const keys = $derived(spanOf(once.flatMap((b) => [b.leftHand, ...b.rightHand])));
  const tight = $derived(spanOf(once.flatMap((b) => [b.leftHand, ...b.rightHand]), 0, false));

  function onEvent(e: InputEvent) {
    if (e.kind === "cc" && e.controller === 64) {
      pedalDown = e.value >= PEDAL.downAt;
      pedalTrace = [...pedalTrace, { at: e.at, value: e.value }];
    } else if (e.kind === "noteon" && mode === "practice" && barIndex !== null) {
      const want = [bars[barIndex].leftHand, ...bars[barIndex].rightHand].map(pc);
      flashes.add(e.midi, want.includes(pc(e.midi)) ? "correct" : "wrong", 400);
    }
  }

  async function playDemo() {
    if (transport.playing) return transport.stop();
    status = m.music_winds_pedal_demo();
    await transport.demo(demoNotes, bpm);
  }

  function start(ctx: RunContext) {
    transport.stop();
    summary = null;
    result = null;
    chordOk = [];
    pedalTrace = [];
    flashes.clear();
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    run = practice.beginRun({
      exerciseId: "technique.pedal",
      setupKey: `pedal:${progression.id}:${pc(s.key)}:${bars.length}`,
      skillIds: ["technique.pedal"],
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: 0.4 + (bpm - 40) / 400,
      instrument: "piano",
      params: { key: pc(s.key), progression: progression.id, bars: bars.length, bpm },
    });
    // A pedal pressed before the downbeat counts toward the first chord.
    cap = capture(ctx.downbeat - barMs, onEvent);
    timer = setTimeout(() => void finish(), ctx.downbeat - performance.now() + bars.length * barMs + beatMs / 2);
    const tick = () => {
      now = performance.now();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /** Each bar's chord: its first note (the onset the pedal is judged from) and whether every chord tone was played. */
  function chordsPlayed(notes: NoteEvent[]) {
    return bars.map((b, k) => {
      const from = downbeat + k * barMs - beatMs / 2;
      const ons = notes.filter((n) => n.kind === "noteon" && n.at >= from && n.at < from + barMs);
      const pcs = new Set(ons.map((n) => pc(n.midi)));
      return {
        at: ons.length ? Math.min(...ons.map((n) => n.at)) : undefined,
        ok: [b.leftHand, ...b.rightHand].every((midi) => pcs.has(pc(midi))),
      };
    });
  }

  const VERDICT: Record<PedalVerdict, () => string> = {
    clean: m.music_winds_pedal_v_clean,
    early: m.music_winds_pedal_v_early,
    blurred: m.music_winds_pedal_v_blurred,
    late: m.music_winds_pedal_v_late,
    "no-chord": m.music_winds_pedal_v_no_chord,
  };

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const played = chordsPlayed(notes);
    chordOk = played.map((p) => p.ok);
    const pedal = (cap?.controls ?? []).filter((c) => c.kind === "cc" && c.controller === 64).map((c) => ({ at: c.at, value: c.value }));
    const r = gradePedal({ chordOnsets: played.map((p) => p.at), pedal });
    result = r;
    phase = "results";
    const measured = !r.notMeasured.length;
    const chords = chordOk.filter(Boolean).length / bars.length;
    const score = measured ? r.score * 0.8 + chords * 0.2 : chords * 0.2;
    const correct = measured && r.correct && chords >= 0.9;
    await run!.attempt({
      promptId: `pedal:${progression.id}:${pc(s.key)}`,
      correct,
      partialCredit: score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: runInstrument(notes) ?? null,
      target: bars.flatMap((b) => [b.leftHand, ...b.rightHand]),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score, correct, headline: m.music_winds_pedal_fin_headline({ clean: r.clean, total: bars.length }) });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    const count = (v: PedalVerdict) => r.verdicts.filter((x) => x === v).length;
    const lifts = r.liftMs.filter((x): x is number => x !== null).sort((a, b) => a - b);
    const worst = (["early", "blurred", "late"] as const).map((v) => [v, count(v)] as const).sort((a, b) => b[1] - a[1])[0];
    summary = {
      headline: !measured
        ? m.music_winds_pedal_head_no_pedal()
        : correct
          ? m.music_winds_pedal_head_ok()
          : worst[1] === 0
            ? m.music_winds_pedal_head_clean({ clean: r.clean, total: bars.length })
            : worst[0] === "early"
              ? m.music_winds_pedal_head_early({ clean: r.clean, total: bars.length, count: worst[1] })
              : worst[0] === "blurred"
                ? m.music_winds_pedal_head_blurred({ clean: r.clean, total: bars.length, count: worst[1] })
                : m.music_winds_pedal_head_late({ clean: r.clean, total: bars.length, count: worst[1] }),
      metric: measured ? `${r.clean}/${bars.length}` : pct(score),
      metricLabel: measured ? m.music_winds_pedal_changes_clean() : m.music_winds_score(),
      delta: fin.delta,
      best: fin.best,
      clean: correct && mode === "check",
      xp: fin.xp,
      mode,
      cleanMeans: m.music_winds_pedal_clean_means(),
      rows: [
        measured
          ? { label: m.music_winds_pedal_row_clean(), value: r.score, text: m.music_winds_chop_of({ n: r.clean, total: bars.length }) }
          : { label: m.music_winds_pedal_row_none(), notMeasured: true },
        ...(measured
          ? [
              // One row each, so a count never wraps away from its name.
              { label: m.music_winds_pedal_row_early(), text: m.music_winds_chop_of({ n: count("early"), total: bars.length }) },
              { label: m.music_winds_pedal_row_blurred(), text: m.music_winds_chop_of({ n: count("blurred"), total: bars.length }) },
              { label: m.music_winds_pedal_row_late(), text: m.music_winds_chop_of({ n: count("late"), total: bars.length }) },
              { label: m.music_winds_pedal_row_lift(), text: lifts.length ? m.music_winds_stick_ms({ value: Math.round(lifts[Math.floor(lifts.length / 2)]) }) : m.music_winds_skills_none() },
            ]
          : []),
        { label: m.music_winds_pedal_row_chords(), value: chords, text: m.music_winds_chop_of({ n: chordOk.filter(Boolean).length, total: bars.length }) },
      ],
      // Ungraded without a pedal: nothing to climb.
      advance: measured
        ? await nextRun(`pedal.${pc(s.key)}.${bars.length}`, { bpm, tempo: { min: TEMPO.min, goal: 90, max: TEMPO.max }, steps: PEDAL_PROGRESSIONS.map((p) => ({ label: p.label })), step: Math.max(0, PEDAL_PROGRESSIONS.indexOf(progression)) }, { score, correct }, tempoAnd((i) => cfg.set({ progression: PEDAL_PROGRESSIONS[i].id })))
        : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
    phase = "ready";
    status = m.music_winds_nothing_saved();
  }

  onDestroy(() => {
    transport.stop();
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    cap?.stop();
  });

  /** The bar the demo is sounding, lit on the chart. */
  const demoBar = $derived(transport.playing && transport.beat !== null ? Math.floor(transport.beat / 4) : null);

  // The pedal line: down is a low line, up a gap, with a tick at each bar.
  const W = 640;
  const H = 44;
  const span = $derived(bars.length * barMs);
  const xOf = (at: number) => Math.max(0, Math.min(W, ((at - downbeat) / span) * W));
  const segments = $derived.by(() => {
    const out: { from: number; to: number }[] = [];
    const end = phase === "running" ? now : downbeat + span;
    let open: number | null = null;
    for (const p of pedalTrace) {
      if (p.value >= PEDAL.downAt && open === null) open = p.at;
      else if (p.value < PEDAL.downAt && open !== null) {
        out.push({ from: open, to: p.at });
        open = null;
      }
    }
    if (open !== null) out.push({ from: open, to: end });
    return out.filter((g) => g.to > downbeat);
  });
</script>

<svelte:head><title>{m.music_winds_pedal_head_title()}</title></svelte:head>

<DrillShell
  title={m.music_winds_pedal_title()}
  lesson={{ lessons: [pedalLesson()] }}
  hue="piano"
  blurb={m.music_winds_pedal_blurb()}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={barIndex === null ? 0 : (barIndex + 1) / bars.length}
  clock={{ bpm, beatsPerBar: 4 }}
  onstart={start}
  onstop={stop}
  {cue}
  ondemo={playDemo}
  demoPlaying={transport.playing}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-3">
      <Choice label={m.music_winds_pedal_progression()} setupKey="progression" options={PEDAL_PROGRESSIONS.map((p) => ({ value: p.id, label: p.label }))} value={progression.id} onchange={(v) => cfg.set({ progression: v })} />
      <div class="flex min-w-0 flex-col gap-1 text-sm" data-setup="key">
        <span class="font-medium">{m.music_winds_key()}</span>
        <KeyPicker label={m.music_winds_key()} value={pc(s.key)} name={(p) => keyName(FLAT_NAMES[p])} onchange={(p) => cfg.set({ key: p })} />
      </div>
      <Choice label={m.music_winds_pedal_times_through()} setupKey="rounds" options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} value={s.rounds} onchange={(v) => cfg.set({ rounds: v })} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      {m.music_winds_pedal_setup_help({ min: TEMPO.min, max: TEMPO.max, lift: PEDAL.liftWithinMs, repress: PEDAL.repressWithinMs })}
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_winds_pedal_chord()} value={barIndex === null ? m.music_winds_pedal_count_in() : m.music_winds_chop_of({ n: barIndex + 1, total: bars.length })} />
      <Stat label={m.music_winds_pedal_pedal()} value={pedalDown ? m.music_winds_pedal_down() : m.music_winds_pedal_up()} tone={pedalDown ? "success" : undefined} />
    {/if}
  {/snippet}

  {#snippet stage()}
    {@render chart()}
    {#if mode === "practice" || phase === "results"}
      <StaffFold live={phase === "running" || phase === "countin"}><LineNotation maxZoom={1.1} notes={written} title="pedal-{progression.id}-{pc(s.key)}-{bars.length}" cursorBeat={transport.playing ? transport.beat : barIndex === null ? null : (now - downbeat) / beatMs} keyFifths={signatureFor(pc(s.key), "major")} /></StaffFold>
    {/if}
    {#if phase !== "ready"}{@render pedalLine()}{/if}
    <div class="flex flex-col justify-end" data-dock="instrument">
      <Piano low={keys.low} high={keys.high} fit={tight} {marks} {flashes} fill={phase === "running" || phase === "countin"} label={m.music_winds_pedal_piano_label({ low: note(noteName(keys.low)), high: note(noteName(keys.high)) })} />
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} {figure} />
    {/if}
  {/snippet}
</DrillShell>

<!-- The chord chart, a chord a bar; after a run each card says how its change went. -->
{#snippet chart()}
  <!-- After a run a phone shows the cards two by two, so each verdict stays on its own card. Before one, a laptop or
       a tablet keeps a longer chart on one row, so the staff, the pedal line and the keys share the view. -->
  <ol class="mb-3 grid gap-2 {result ? 'grid-cols-2 sm:grid-cols-4' : bars.length > 4 ? 'grid-cols-4 lg:grid-cols-8' : 'grid-cols-4'}" aria-label={m.music_winds_pedal_chart()}>
    {#each bars as b, k (k)}
      {@const v = result?.verdicts[k]}
      <li class="flex min-h-14 min-w-0 flex-col justify-center rounded-lg border px-3 py-1.5 {barIndex === k || demoBar === k ? 'border-instr bg-instr/20' : 'border-ws-stage-ink/15'}" aria-current={barIndex === k || demoBar === k ? "step" : undefined}>
        <span class="font-display text-xl font-semibold">{chord(b.symbol)}</span>
        {#if v}
          <span class="flex items-center gap-1.5 text-sm text-ws-stage-ink">
            <span class="grid size-5 shrink-0 place-items-center rounded-full {v === 'clean' ? 'bg-success text-success-foreground' : 'bg-destructive text-[color:var(--on-destructive)]'}" aria-hidden="true">
              {#if v === "clean"}<Check class="size-4" strokeWidth={3} />{:else}<X class="size-4" strokeWidth={3} />{/if}
            </span>
            <span class="min-w-0">{VERDICT[v]()}</span>
          </span>
          <!-- The chord's own check, apart from the pedal's. "No chord" already says it. -->
          {#if chordOk[k] === false && v !== "no-chord"}<span class="text-sm text-ws-stage-soft">{m.music_winds_pedal_incomplete()}</span>{/if}
        {:else}
          <span class="text-sm text-ws-stage-soft">{b.roman}</span>
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

{#snippet pedalLine()}
  <figure class="mb-3">
    <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-11 w-full" role="img" aria-label={m.music_winds_pedal_line_aria()}>
      {#each bars as _, k (k)}
        <line x1={(k / bars.length) * W} x2={(k / bars.length) * W} y1="4" y2={H - 4} class="bar" vector-effect="non-scaling-stroke" />
      {/each}
      <!-- Drawn as a pedal bracket is printed: a tick where it goes down, the line while held, a tick where it lifts. -->
      {#each segments as g, i (i)}
        <line x1={xOf(g.from)} x2={xOf(g.from)} y1={H - 26} y2={H - 12} class="ped tick" vector-effect="non-scaling-stroke" />
        <line x1={xOf(g.from)} x2={xOf(g.to)} y1={H - 12} y2={H - 12} class="ped" vector-effect="non-scaling-stroke" />
        <line x1={xOf(g.to)} x2={xOf(g.to)} y1={H - 26} y2={H - 12} class="ped tick" vector-effect="non-scaling-stroke" />
      {/each}
    </svg>
    <figcaption class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ws-stage-soft">
      <!-- The pedal's state now is in the HUD; the line here is its history. -->
      <span>{m.music_winds_pedal_line_caption()}</span>
    </figcaption>
  </figure>
{/snippet}

<!-- The run drawn: each change's verdict on the chart, and the pedal line under it. -->
{#snippet figure()}
  {#if result}
    <div class="stage rounded-2xl p-3">
      {@render chart()}
      {@render pedalLine()}
    </div>
  {/if}
{/snippet}

<style>
  .bar {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 30%, transparent);
    stroke-width: 1;
  }
  .ped {
    stroke: var(--instr);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .ped.tick {
    stroke-width: 3;
  }
</style>
