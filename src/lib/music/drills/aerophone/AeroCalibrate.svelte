<script lang="ts">
  // Set-up check (path step 1.1): is the AE-20 sending the note the app reads
  // in its reading key, does CC 2 arrive, and does the breath reach from p to
  // f without pinning at the top? Three prompts in a row, each waiting for a
  // note: a written G4, the softest steady note, the loudest.
  import { onDestroy } from "svelte";
  import type { ControlEvent, NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { fingeringFor } from "@repo/music-core/content/winds-pads";
  import { BREATH_LEVELS, gradeCalibration, type CalibrationResult } from "@repo/music-core/content/aero-skills";
  import { AEROPHONE_READING_KEYS, writtenOffset } from "@repo/music-core/theory/transposition";
  import DrillShell, { type Phase, type RunContext } from "#lib/music/components/DrillShell.svelte";
  import Results, { silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import { btn } from "#lib/music/components/ui.ts";
  import { capture, pct, runInstrument, runSource, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import BreathTrace from "./BreathTrace.svelte";
  import { namedKeys } from "./names";
  import { keyName, note } from "#lib/music/names.svelte.ts";
  import MidiStatus from "#lib/music/drills/pads/MidiStatus.svelte";
  import { m } from "@repo/i18n/messages.js";

  let { modes, onmode }: { modes: readonly { id: string; label: string }[]; onmode: (m: string) => void } = $props();

  /** Written G4: the note every method starts on. */
  const WRITTEN = 67;
  /** How long the soft and loud notes are read, from their first note. */
  const HOLD_MS = 3000;
  /** A step with no note for this long ends the check. */
  const WAIT_MS = 20000;
  const STEPS = [
    { id: "key", label: m.music_winds_cal_key_check(), say: m.music_winds_cal_key_say({ note: note(noteName(WRITTEN)) }) },
    { id: "soft", label: m.music_winds_cal_softest(), say: m.music_winds_cal_soft_say() },
    { id: "loud", label: m.music_winds_cal_loudest(), say: m.music_winds_cal_loud_say() },
  ] as const;

  const shift = $derived(writtenOffset("aerophone", settings.value));
  /** A reading key's label ("C", "Alto Eb") with its key named as the user reads note names. */
  const readingKey = (id: string) => namedKeys(AEROPHONE_READING_KEYS.find((k) => k.id === id)?.label ?? "C");
  const keyLabel = $derived(readingKey(settings.value.aerophoneKey));
  const name = (written: number) => note(fingeringFor(written)?.name ?? noteName(written));
  /** Written G4, as the user reads note names. */
  const g4 = $derived(name(WRITTEN));

  let phase = $state<Phase>("ready");
  let status = $state("");
  let summary = $state<RunSummary | null>(null);
  let result = $state<CalibrationResult | null>(null);
  let step = $state(0);
  let received = $state<number | null>(null);
  let breath = $state<number[]>([]);
  let bite = $state(false);
  let soft: number[] = [];
  let loud: number[] = [];
  let holdFrom: number | null = null;
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;

  function wait() {
    clearTimeout(timer);
    timer = setTimeout(() => void finish(), WAIT_MS);
  }

  function next() {
    step++;
    holdFrom = null;
    if (step >= STEPS.length) return void finish();
    status = STEPS[step].say;
    wait();
  }

  function onEvent(e: NoteEvent | ControlEvent) {
    if (e.kind === "pitchbend") bite = true;
    if (e.kind === "cc" && e.controller === 2) {
      breath = [...breath.slice(-63), e.value];
      if (holdFrom !== null && e.at >= holdFrom && e.at <= holdFrom + HOLD_MS) (step === 1 ? soft : loud).push(e.value);
    }
    if (e.kind !== "noteon") return;
    if (step === 0) {
      if (received !== null) return;
      received = e.midi;
      clearTimeout(timer);
      // Read the next two notes after this one has had a moment.
      timer = setTimeout(next, 600);
    } else if (holdFrom === null) {
      holdFrom = e.at;
      clearTimeout(timer);
      timer = setTimeout(next, HOLD_MS + 150);
    }
  }

  function start(ctx: RunContext) {
    summary = null;
    result = null;
    step = 0;
    received = null;
    soft = [];
    loud = [];
    holdFrom = null;
    bite = false;
    breath = [];
    run = practice.beginRun({
      exerciseId: "technique.aerophone.calibrate",
      setupKey: `calibrate:${settings.value.aerophoneKey}`,
      skillIds: [],
      capabilities: ["technique"],
      modality: "played",
      // Nothing to hide: a check of the set-up stands on its own.
      assistance: "independent",
      difficulty: 0.1,
      instrument: "aerophone",
      params: { mode: "calibrate", key: settings.value.aerophoneKey },
    });
    status = STEPS[0].say;
    cap = capture(ctx.downbeat, (e) => onEvent(e as NoteEvent | ControlEvent));
    wait();
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    cap?.stop();
    phase = "results";
    const r = gradeCalibration({ writtenTarget: WRITTEN, shift, received, soft, loud });
    result = r;
    const notes = cap?.notes ?? [];
    await run!.attempt({ promptId: "calibrate", correct: r.correct, partialCredit: r.score, metrics: [], source: runSource(notes), instrument: runInstrument(notes, "aerophone") ?? null });
    const headline =
      received === null
        ? m.music_winds_aero_no_note()
        : !r.keyOk
          ? r.keyFits
            ? m.music_winds_cal_head_key_fits({ note: g4, received: note(noteName(received)), fits: readingKey(r.keyFits), key: keyLabel })
            : m.music_winds_cal_head_key_unknown({ note: g4, received: note(noteName(received)) })
          : !r.breathSeen
            ? m.music_winds_cal_head_no_breath()
            : !r.floorOk
              ? m.music_winds_cal_head_floor({ floor: pct(r.floor ?? 0), target: pct(BREATH_LEVELS[1].band[1]) })
              : !r.ceilingOk
                ? r.clipped > 0.1
                  ? m.music_winds_cal_head_clipped({ pct: pct(r.clipped) })
                  : m.music_winds_cal_head_ceiling({ ceiling: pct(r.ceiling ?? 0), target: pct(BREATH_LEVELS[3].band[0]) })
                : m.music_winds_cal_head_ok();
    const fin = await run!.finish({
      score: r.score,
      correct: r.correct,
      headline,
      params: { ...(received !== null ? { received } : {}), ...(r.floor !== null ? { floor: Math.round(r.floor * 100) / 100 } : {}), ...(r.ceiling !== null ? { ceiling: Math.round(r.ceiling * 100) / 100 } : {}) },
    });
    if (!fin.heard) {
      summary = silentRun();
      status = summary.headline;
      return;
    }
    summary = {
      headline,
      metric: pct(r.score),
      metricLabel: m.music_winds_cal_checks_passed(),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: r.correct,
      cleanMeans: m.music_winds_cal_every_check(),
      assistance: m.music_winds_cal_assistance(),
      rows: [
        { label: m.music_winds_cal_row_key({ note: g4, key: keyLabel }), value: r.keyOk ? 1 : 0, text: received === null ? m.music_winds_cal_no_note() : (r.keyOk ? m.music_winds_cal_as_read_right : m.music_winds_cal_as_read)({ note: name(received + shift) }) },
        { label: m.music_winds_cal_row_breath(), value: r.breathSeen ? 1 : 0, text: r.breathSeen ? m.music_winds_yes() : m.music_winds_no() },
        r.floor === null ? { label: m.music_winds_cal_row_softest(), notMeasured: true } : { label: m.music_winds_cal_row_softest_p(), value: r.floorOk ? 1 : 0, text: pct(r.floor) },
        r.ceiling === null ? { label: m.music_winds_cal_row_loudest(), notMeasured: true } : { label: m.music_winds_cal_row_loudest_f(), value: r.ceilingOk ? 1 : 0, text: r.clipped ? m.music_winds_cal_pinned({ pct: pct(r.ceiling), pinned: pct(r.clipped) }) : pct(r.ceiling) },
        { label: m.music_winds_cal_row_bite(), text: bite ? m.music_winds_cal_bite_yes() : m.music_winds_cal_bite_no() },
      ],
    };
    status = headline;
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    phase = "ready";
    status = m.music_winds_nothing_saved();
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
  });
</script>

<DrillShell
  title={m.music_winds_aerophone_title()}
  hue="aerophone"
  blurb={m.music_winds_cal_blurb()}
  summary={[{ text: m.music_winds_cal_sum_reading({ key: keyLabel }) }, { text: m.music_winds_cal_sum_steps({ note: g4 }) }]}
  tabs={modes}
  tab="calibrate"
  ontab={onmode}
  checkable={false}
  bind:phase
  bind:status
  progress={phase === "results" ? 1 : step / STEPS.length}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <p class="text-sm text-ws-soft">
      {m.music_winds_cal_setup_help({ key: keyLabel, c: keyName("C"), eb: keyName("Eb"), bb: keyName("Bb") })}
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label={m.music_winds_cal_step()} value={m.music_winds_chop_of({ n: Math.min(step + 1, STEPS.length), total: STEPS.length })} />
      {#if received !== null}<Stat label={m.music_winds_cal_g4_came_in({ note: g4 })} value={name(received + shift)} />{/if}
    {:else if result}
      <Stat label={m.music_winds_cal_checks()} value={pct(result.score)} tone={result.correct ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-3" data-testid="aero-calibrate" data-step={step}>
      <ol class="grid gap-2 sm:grid-cols-3" aria-label={m.music_winds_cal_checks()}>
        {#each STEPS as st, i (st.id)}
          {@const now = phase === "running" && i === step}
          <li class="rounded-xl p-3 text-sm {now ? 'bg-instr-strong text-on-instr' : 'bg-ws-stage-ink/8'}" aria-current={now ? "step" : undefined}>
            <span class="font-semibold">{i + 1}. {st.label}</span>
            <span class="block {now ? '' : 'text-ws-stage-soft'}">{st.say}</span>
          </li>
        {/each}
      </ol>
      <BreathTrace values={breath} target={Array(64).fill(BREATH_LEVELS[3].band[0])} measured={breath.length > 0} label={m.music_winds_cal_breath_label()} />
      {#if result && !result.keyOk && result.keyFits}
        {@const fits = result.keyFits}
        <button type="button" class={btn} onclick={() => void settings.update({ aerophoneKey: fits })}>{m.music_winds_cal_read_in({ key: readingKey(fits) })}</button>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}<Results {summary} />{/if}
  {/snippet}

  {#snippet actions()}
    <div class="w-full"><MidiStatus instrument="aerophone" /></div>
  {/snippet}
</DrillShell>
