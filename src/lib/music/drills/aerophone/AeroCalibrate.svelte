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
  import DrillShell, { type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Results, { silentRun, type RunSummary } from "$lib/music/components/Results.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import { btn } from "$lib/music/components/ui";
  import { capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { settings } from "$lib/music/runtime";
  import BreathTrace from "./BreathTrace.svelte";
  import MidiStatus from "$lib/music/drills/pads/MidiStatus.svelte";

  let { modes, onmode }: { modes: readonly { id: string; label: string }[]; onmode: (m: string) => void } = $props();

  /** Written G4: the note every method starts on. */
  const WRITTEN = 67;
  /** How long the soft and loud notes are read, from their first note. */
  const HOLD_MS = 3000;
  /** A step with no note for this long ends the check. */
  const WAIT_MS = 20000;
  const STEPS = [
    { id: "key", label: "Key check", say: "Finger a written G4 and play it at any level." },
    { id: "soft", label: "Softest", say: "Now your softest steady note, any note: hold it 3 seconds." },
    { id: "loud", label: "Loudest", say: "Now as loud as you can, any note: hold it 3 seconds." },
  ] as const;

  const shift = $derived(writtenOffset("aerophone", settings.value));
  const keyLabel = $derived(AEROPHONE_READING_KEYS.find((k) => k.id === settings.value.aerophoneKey)?.label ?? "C");
  const name = (written: number) => fingeringFor(written)?.name ?? noteName(written);

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
        ? "No note arrived. The line under the stage says whether the Aerophone is connected."
        : !r.keyOk
          ? r.keyFits
            ? `Written G4 came in as concert ${noteName(received)}: the AE-20 reads as ${AEROPHONE_READING_KEYS.find((k) => k.id === r.keyFits)!.label}, the app as ${keyLabel}. Match one to the other.`
            : `Written G4 came in as concert ${noteName(received)}, which no reading key explains. Check the AE-20's transpose and octave settings.`
          : !r.breathSeen
            ? "The key matches, but no breath arrived (CC 2). Check the AE-20's breath output."
            : !r.floorOk
              ? `Your softest note read ${pct(r.floor ?? 0)}: aim for p or under (${pct(BREATH_LEVELS[1].band[1])}). Lower the AE-20's breath sensitivity, or blow softer.`
              : !r.ceilingOk
                ? r.clipped > 0.1
                  ? `The loud note pinned at the top for ${pct(r.clipped)} of it. Turn the AE-20's breath sensitivity down a step.`
                  : `Your loudest note reached ${pct(r.ceiling ?? 0)}, under f (${pct(BREATH_LEVELS[3].band[0])}). Turn the breath sensitivity up a step.`
                : "Set up: the key matches and the breath reaches from p to f without clipping.";
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
      metricLabel: "checks passed",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      clean: r.correct,
      assistance: "A set-up check: it does not change skill mastery.",
      rows: [
        { label: `Key: written G4 in ${keyLabel}`, value: r.keyOk ? 1 : 0, text: received === null ? "no note" : `${name(received + shift)} as read${r.keyOk ? ", right" : ""}` },
        { label: "Breath (CC 2) arrives", value: r.breathSeen ? 1 : 0, text: r.breathSeen ? "yes" : "no" },
        r.floor === null ? { label: "Softest note", notMeasured: true } : { label: "Softest note, p or under", value: r.floorOk ? 1 : 0, text: pct(r.floor) },
        r.ceiling === null ? { label: "Loudest note", notMeasured: true } : { label: "Loudest note, f without clipping", value: r.ceilingOk ? 1 : 0, text: `${pct(r.ceiling)}${r.clipped ? `, ${pct(r.clipped)} pinned` : ""}` },
        { label: "Bite (pitch bend)", text: bite ? "arrives, so vibrato can be read" : "none seen; set the bite to send pitch bend for vibrato" },
      ],
    };
    status = headline;
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
  });
</script>

<DrillShell
  title="Aerophone"
  hue="aerophone"
  blurb="Check the AE-20 set-up: the note it sends, the breath, and soft to loud without clipping."
  summary={[{ text: `Set-up check, reading in ${keyLabel}` }, { text: "a written G4, then softest and loudest" }]}
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
      On the AE-20: Sax mode and the scene you play. The app reads in {keyLabel}; change it on the strip's Reads in pill or in Settings. With the AE-20's transpose at C, read in C; at Eb (alto) or Bb (tenor), read in that key.
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Step" value={`${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`} />
      {#if received !== null}<Stat label="G4 came in as" value={name(received + shift)} />{/if}
    {:else if result}
      <Stat label="Checks" value={pct(result.score)} tone={result.correct ? "success" : "warn"} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="flex flex-col gap-3" data-testid="aero-calibrate" data-step={step}>
      <ol class="grid gap-2 sm:grid-cols-3" aria-label="Checks">
        {#each STEPS as st, i (st.id)}
          {@const now = phase === "running" && i === step}
          <li class="rounded-xl p-3 text-sm {now ? 'bg-instr-strong text-on-instr' : 'bg-ws-stage-ink/8'}" aria-current={now ? "step" : undefined}>
            <span class="font-semibold">{i + 1}. {st.label}</span>
            <span class="block {now ? '' : 'text-ws-stage-soft'}">{st.say}</span>
          </li>
        {/each}
      </ol>
      <BreathTrace values={breath} target={Array(64).fill(BREATH_LEVELS[3].band[0])} measured={breath.length > 0} label="Breath, last 64 samples; the dashed line is f" />
      {#if result && !result.keyOk && result.keyFits}
        {@const fits = result.keyFits}
        <button type="button" class={btn} onclick={() => void settings.update({ aerophoneKey: fits })}>Read in {AEROPHONE_READING_KEYS.find((k) => k.id === fits)!.label}</button>
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
