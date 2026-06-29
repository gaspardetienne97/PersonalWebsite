<script lang="ts">
  import Clock from "lucide-svelte/icons/clock";
  import Target from "lucide-svelte/icons/target";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Waves from "lucide-svelte/icons/audio-waveform";
  import { onDestroy } from "svelte";

  import {
    AudioPitchSource,
    centsBetween,
    frequencyToMidi,
    intonationZone,
    midiToFrequency,
    tunerReading,
    type AudioPitchState,
    type IntonationZone,
    type TunerReading,
  } from "@repo/music-core/engines/audio-in";
  import {
    IntonationSession,
    type IntonationStats,
  } from "@repo/music-core/engines/intonation-session";
  import { DRONE_TIMBRE_NAMES } from "@repo/music-core/engines/sound";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import CentsGauge from "../_components/CentsGauge.svelte";
  import CentsMeter from "../_components/CentsMeter.svelte";
  import HudTile from "../_components/HudTile.svelte";
  import PitchTrace from "../_components/PitchTrace.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../_components/PracticeStage.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();

  const A4_OPTIONS = [438, 439, 440, 441, 442] as const;
  const TUNER_TOLERANCE_CENTS = 5;
  const INTONATION_TOLERANCE_CENTS = 10;
  const TOOL_TABS = [
    { value: "tune", label: "Tune" },
    { value: "intonation", label: "Intonation" },
    { value: "drone", label: "Drone" },
  ];
  const INTONATION_MODES = [
    { value: "hold", label: "Hold the pitch" },
    { value: "scale", label: "Scale in tune" },
  ];
  // Drone tonics shown in the picker (pitch class -> name), octave 4 for the bed.
  const TONICS = [
    { pc: 0, name: "C" },
    { pc: 2, name: "D" },
    { pc: 4, name: "E" },
    { pc: 5, name: "F" },
    { pc: 7, name: "G" },
    { pc: 9, name: "A" },
  ] as const;

  const source = new AudioPitchSource();
  const supported = AudioPitchSource.supported;
  const session = new IntonationSession({ toleranceCents: INTONATION_TOLERANCE_CENTS });

  let state = $state<AudioPitchState>({ status: "idle" });
  let tool = $state("tune");
  let intonationMode = $state("hold");
  let a4 = $state(440);
  let tuner = $state<TunerReading | null>(null);
  let stats = $state<IntonationStats>(session.stats);
  let tonicPc = $state(9); // A
  let timbre = $state(DRONE_TIMBRE_NAMES[0]!);
  let level = $state(60);
  let droneOn = $state(false);

  // Current single-frame reading (note, cents, zone) for the intonation gauge.
  let note = $state<string | null>(null);
  let cents = $state(0);
  let zone = $state<IntonationZone>("in-tune");
  let frequency = $state(0);

  const running = $derived(state.status === "running");
  const tunerActive = $derived(running && tuner !== null);
  const intonationActive = $derived(running && note !== null);
  const tonicName = $derived(TONICS.find((t) => t.pc === tonicPc)?.name ?? "A");
  const droneMidi = $derived(60 + tonicPc); // C4 = 60
  const instrumentLabel = $derived(
    runtime.activeInstrument.charAt(0).toUpperCase() + runtime.activeInstrument.slice(1),
  );
  const tunerCentsLabel = $derived(
    tuner ? `${tuner.cents > 0 ? "+" : ""}${Math.round(tuner.cents)}¢` : "-",
  );
  const intonationCentsLabel = $derived(
    intonationActive ? `${cents > 0 ? "+" : ""}${Math.round(cents)} cents` : "-",
  );
  const zoneLabel = $derived(
    zone === "in-tune" ? "in tune" : zone === "flat" ? "flat" : "sharp",
  );

  /** Nearest MIDI note sharing pitch class `pc` to a fractional MIDI value. */
  function nearestPitchClassMidi(exactMidi: number, pc: number): number {
    const low = Math.floor(exactMidi);
    const base = low - (((low % 12) - pc + 12) % 12);
    const candidates = [base - 12, base, base + 12, base + 24];
    return candidates.reduce((best, c) =>
      Math.abs(c - exactMidi) < Math.abs(best - exactMidi) ? c : best,
    );
  }

  const unsubscribeState = source.subscribeState((next) => {
    state = next;
    if (next.status !== "running") {
      tuner = null;
      note = null;
      session.reset();
      stats = session.stats;
    }
  });

  const unsubscribeEvents = source.subscribeEvents((event) => {
    if (event.frequencyHz === undefined) return;
    const freq = event.frequencyHz;
    const clarity = event.confidence ?? 0;

    if (tool === "tune") {
      const next = tunerReading(
        { frequency: freq, clarity },
        { a4, toleranceCents: TUNER_TOLERANCE_CENTS },
      );
      if (next) tuner = next;
      return;
    }

    if (tool !== "intonation") return;
    if (intonationMode === "hold") {
      // Deviation from the drone tonic (any octave).
      const targetMidi = nearestPitchClassMidi(frequencyToMidi(freq), tonicPc);
      cents = centsBetween(freq, midiToFrequency(targetMidi));
      zone = intonationZone(cents, INTONATION_TOLERANCE_CENTS);
      note = TONICS.find((t) => t.pc === tonicPc)?.name ?? "-";
    } else {
      // Free intonation vs the nearest equal-tempered note.
      const reading = tunerReading(
        { frequency: freq, clarity },
        { toleranceCents: INTONATION_TOLERANCE_CENTS },
      );
      if (!reading) return;
      cents = reading.cents;
      zone = reading.zone;
      note = reading.note;
    }
    frequency = freq;
    session.push({ cents, clarity, t: event.timestamp });
    stats = session.stats;
  });

  onDestroy(() => {
    unsubscribeState();
    unsubscribeEvents();
    void source.stop();
    runtime.sound.stopDrone();
  });

  function toggleMic() {
    if (running || state.status === "requesting") {
      void source.stop();
    } else {
      void source.start();
    }
  }

  function changeTool(next: string) {
    tool = next;
    tuner = null;
    note = null;
    session.reset();
    stats = session.stats;
  }

  function changeIntonationMode(next: string) {
    intonationMode = next;
    session.reset();
    stats = session.stats;
  }

  function pickTonic(pc: number) {
    tonicPc = pc;
    if (droneOn) runtime.sound.setDroneNote(60 + pc);
    if (intonationMode === "hold") {
      session.reset();
      stats = session.stats;
    }
  }

  function pickTimbre(name: string) {
    timbre = name;
    runtime.sound.setDroneTimbre(name);
  }

  function setLevel(next: number) {
    level = next;
    runtime.sound.setDroneLevel(next / 100);
  }

  async function toggleDrone() {
    if (droneOn) {
      runtime.sound.stopDrone();
      droneOn = false;
      return;
    }
    if (!runtime.audioEnabled && !(await runtime.enableAudio())) return;
    runtime.sound.setDroneTimbre(timbre);
    runtime.sound.setDroneLevel(level / 100);
    runtime.sound.startDrone(droneMidi);
    droneOn = true;
  }
</script>

<svelte:head>
  <title>Tuner | Musicianship OS</title>
  <meta
    name="description"
    content="Tune, practice intonation, and play a tonic drone from one microphone-aware practice tool."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Tuner"
    subtitle="Tune a note, hold pitch against a tonic, or run a drone from one shared audio tool."
  >
    {#snippet controls()}
      <SegmentedControl
        options={TOOL_TABS}
        value={tool}
        onChange={changeTool}
        ariaLabel="Tuner tool"
      />
      {#if tool !== "drone"}
        <SourceReadout label="Listening to" device={instrumentLabel} live={running}>
          {#snippet icon()}<Waves size={18} />{/snippet}
        </SourceReadout>
        <Button variant={running ? "secondary" : "default"} onclick={toggleMic} disabled={!supported}>
          {#if state.status === "requesting"}
            Starting...
          {:else if running}
            Stop mic
          {:else if tool === "tune"}
            Start tuner
          {:else}
            Start mic
          {/if}
        </Button>
      {/if}
    {/snippet}
  </PracticeScreenHeader>

  {#if !supported}
    <Card.Root>
      <Card.Content class="py-8 text-center text-muted-foreground">
        Microphone audio input isn't available in this browser. Try a recent Chrome, Edge, or
        Safari over HTTPS.
      </Card.Content>
    </Card.Root>
  {:else if tool === "tune"}
    <PracticeStage class="flex flex-col items-center gap-6 px-6 py-10">
        <div class="flex flex-col items-center gap-1">
          <span
            class="text-7xl font-bold tabular-nums tracking-tight transition-colors {tunerActive
              ? tuner?.zone === 'in-tune'
                ? 'text-success'
                : 'text-foreground'
              : 'text-muted-foreground/40'}"
          >
            {tuner ? tuner.note : "-"}
          </span>
          <span class="text-sm text-muted-foreground">
            {#if tuner && tunerActive}
              {tuner.name} · {tuner.frequency.toFixed(1)} Hz
            {:else if running}
              Listening...
            {:else}
              Press start and play a note
            {/if}
          </span>
        </div>

        <div class="w-full max-w-md">
          <CentsMeter
            cents={tuner?.cents ?? 0}
            zone={tuner?.zone ?? "in-tune"}
            toleranceCents={TUNER_TOLERANCE_CENTS}
            active={tunerActive}
          />
          <div class="mt-2 text-center text-sm font-medium tabular-nums">
            <span
              class={tunerActive
                ? tuner?.zone === "in-tune"
                  ? "text-success"
                  : "text-primary"
                : "text-muted-foreground"}
            >
              {tunerCentsLabel}
            </span>
            {#if tunerActive && tuner}
              <span class="ml-2 text-muted-foreground">
                {tuner.zone === "in-tune" ? "in tune" : tuner.zone}
              </span>
            {/if}
          </div>
        </div>
    </PracticeStage>
  {:else if tool === "intonation"}
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <Card.Title class="text-sm">Intonation</Card.Title>
          <Card.Description>Track drift and steadiness while the mic listens.</Card.Description>
        </div>
        <SegmentedControl
          options={INTONATION_MODES}
          value={intonationMode}
          onChange={changeIntonationMode}
          ariaLabel="Intonation mode"
        />
      </Card.Header>
      <Card.Content class="flex flex-col items-center gap-5 py-8">
        <PracticeStage class="flex w-full flex-col items-center gap-5 px-6 py-8">
          <div class="w-full max-w-md">
            <CentsGauge
              cents={cents}
              zone={zone}
              toleranceCents={INTONATION_TOLERANCE_CENTS}
              active={intonationActive}
            />
          </div>

          <div class="flex flex-col items-center gap-1">
            <span
              class="text-6xl font-bold tabular-nums leading-none transition-colors {intonationActive
                ? zone === 'in-tune'
                  ? 'text-success'
                  : 'text-foreground'
                : 'text-muted-foreground/40'}"
            >
              {note ?? "-"}
            </span>
            <span
              class="text-sm font-semibold {intonationActive
                ? zone === 'in-tune'
                  ? 'text-success'
                  : 'text-primary'
                : 'text-muted-foreground'}"
            >
              {#if intonationActive}
                {intonationCentsLabel} · {zoneLabel}{#if frequency > 0}<span class="text-muted-foreground"> · {frequency.toFixed(1)} Hz</span>{/if}
              {:else if running}
                Listening...
              {:else}
                Start the mic and play a note
              {/if}
            </span>
          </div>
        </PracticeStage>

        <div class="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile label="In tune" value={Math.round(stats.inTunePercent)} unit="%" tone="good">
            {#snippet icon()}<Target size={12} />{/snippet}
          </HudTile>
          <HudTile label="Hold" value={stats.holdSeconds.toFixed(1)} unit="s" tone="accent">
            {#snippet icon()}<Clock size={12} />{/snippet}
          </HudTile>
          <HudTile label="Steadiness" value={Math.round(stats.steadiness)} unit="%" />
          <HudTile label="Avg drift" value={`+/-${Math.round(stats.avgDriftCents)}`} unit="¢" />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2 space-y-0">
        <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Pitch trace · last 10 s
        </span>
        <span class="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          Within +/-{INTONATION_TOLERANCE_CENTS}¢
        </span>
      </Card.Header>
      <Card.Content>
        <PitchTrace trace={stats.trace} toleranceCents={INTONATION_TOLERANCE_CENTS} />
      </Card.Content>
    </Card.Root>
  {:else}
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <Card.Title class="text-sm">Drone</Card.Title>
          <Card.Description>Play a sustained tonic while you tune by ear.</Card.Description>
        </div>
        <span class="rounded-full border px-2 py-0.5 text-xs font-semibold text-primary">
          {tonicName} · {midiToFrequency(droneMidi).toFixed(0)} Hz
        </span>
      </Card.Header>
      <Card.Content class="flex flex-col gap-4">
        <div class="grid grid-cols-6 gap-1.5">
          {#each TONICS as tonic (tonic.pc)}
            <button
              type="button"
              aria-pressed={tonicPc === tonic.pc}
              onclick={() => pickTonic(tonic.pc)}
              class="rounded-md border py-2.5 text-center font-bold transition-colors {tonicPc ===
              tonic.pc
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'bg-muted/40 hover:bg-muted'}"
            >
              {tonic.name}
            </button>
          {/each}
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted-foreground">Timbre</span>
            <SegmentedControl
              options={DRONE_TIMBRE_NAMES.map((name) => ({ value: name, label: name }))}
              value={timbre}
              onChange={pickTimbre}
              size="sm"
              ariaLabel="Drone timbre"
            />
          </div>
          <div class="flex items-center gap-3">
            <Volume2 size={18} class="text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="100"
              value={level}
              oninput={(e) => setLevel(e.currentTarget.valueAsNumber)}
              class="h-1.5 w-32 cursor-pointer accent-primary"
              aria-label="Drone volume"
            />
            <Button variant={droneOn ? "secondary" : "default"} size="sm" onclick={toggleDrone}>
              {droneOn ? "Stop drone" : "Play drone"}
            </Button>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2 text-sm">
      <span class="text-muted-foreground">Reference A4</span>
      <div class="flex overflow-hidden rounded-md border">
        {#each A4_OPTIONS as hz (hz)}
          <button
            type="button"
            class="px-2.5 py-1 text-sm tabular-nums transition-colors {a4 === hz
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'}"
            onclick={() => (a4 = hz)}
          >
            {hz}
          </button>
        {/each}
      </div>
    </div>
    {#if state.status === "denied" || state.status === "error"}
      <p class="text-sm text-destructive">{state.message}</p>
    {/if}
  </div>
</PracticeScreen>
