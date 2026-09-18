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
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { curatedTunings } from "@repo/music-core/engines/tunings";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import ArcGauge from "../_components/ArcGauge.svelte";
  import HudTile from "../_components/HudTile.svelte";
  import PitchTrace from "../_components/PitchTrace.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../_components/PracticeStage.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import StringStrip from "../_components/StringStrip.svelte";
  import { DEGREE_CLASS } from "../_components/degree-classes";
  import { readRouteTab, writeRouteTab } from "../_components/route-state";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();

  const A4_OPTIONS = [438, 439, 440, 441, 442] as const;
  const TUNER_TOLERANCE_CENTS = 5;
  // Noise, a decaying string or rumble leaves frames unaccepted; after this long
  // without one the readout goes back to idle rather than freezing on a note
  // that is no longer being played.
  const STALE_READING_MS = 1500;
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
    { pc: 1, name: "C#" },
    { pc: 2, name: "D" },
    { pc: 3, name: "D#" },
    { pc: 4, name: "E" },
    { pc: 5, name: "F" },
    { pc: 6, name: "F#" },
    { pc: 7, name: "G" },
    { pc: 8, name: "G#" },
    { pc: 9, name: "A" },
    { pc: 10, name: "A#" },
    { pc: 11, name: "B" },
  ] as const;

  const source = new AudioPitchSource();
  const supported = AudioPitchSource.supported;
  const session = new IntonationSession({ toleranceCents: INTONATION_TOLERANCE_CENTS });

  let state = $state<AudioPitchState>({ status: "idle" });
  const TOOL_IDS = ["tune", "intonation", "drone"] as const;
  // The mode lives in the URL (?mode=) so Tune, Intonation and Drone are linkable.
  let tool = $state<string>(
    typeof window === "undefined"
      ? "tune"
      : readRouteTab(window.location.search, "mode", TOOL_IDS, "tune"),
  );
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

  // Fretted instruments get a string strip; a targeted string makes the gauge read against it.
  const fretted = $derived(
    runtime.activeInstrument === "guitar" || runtime.activeInstrument === "ukulele",
  );
  const tunings = $derived(fretted ? curatedTunings(runtime.activeInstrument as "guitar" | "ukulele") : []);
  let tuningId = $state<string | undefined>();
  const tuning = $derived(tunings.find((profile) => profile.id === tuningId) ?? tunings[0]);
  let targetMidi = $state<number | undefined>();
  const nearestStringMidi = $derived.by(() => {
    if (!tuning || !tuner) return undefined;
    return tuning.openStrings.reduce((best, midi) =>
      Math.abs(midi - tuner!.midi) < Math.abs(best - tuner!.midi) ? midi : best,
    );
  });
  // The reading shown: against the targeted string when there is one, else the nearest note.
  const shown = $derived.by(() => {
    if (!tuner) return null;
    if (targetMidi === undefined) return tuner;
    const target = midiToFrequency(targetMidi, a4);
    const relative = centsBetween(tuner.frequency, target);
    const name = midiToNote(targetMidi);
    return {
      ...tuner,
      midi: targetMidi,
      note: name.replace(/\d+$/, ""),
      octave: Number(name.match(/\d+$/)?.[0] ?? tuner.octave),
      cents: relative,
      zone: intonationZone(relative, TUNER_TOLERANCE_CENTS),
    };
  });
  const direction = $derived(
    !shown ? "" : shown.zone === "in-tune" ? "In tune" : shown.zone === "flat" ? "Tune up" : "Tune down",
  );
  const neighbors = $derived(
    shown
      ? {
          flat: midiToNote(shown.midi - 1).replace(/\d+$/, ""),
          sharp: midiToNote(shown.midi + 1).replace(/\d+$/, ""),
        }
      : { flat: undefined, sharp: undefined },
  );
  const running = $derived(state.status === "running");
  const tunerActive = $derived(running && tuner !== null);
  const intonationActive = $derived(running && note !== null);
  const tonicName = $derived(TONICS.find((t) => t.pc === tonicPc)?.name ?? "A");
  const droneMidi = $derived(60 + tonicPc); // C4 = 60
  const instrumentLabel = $derived(
    runtime.activeInstrument.charAt(0).toUpperCase() + runtime.activeInstrument.slice(1),
  );
  const tunerCentsLabel = $derived(
    shown ? `${shown.cents > 0 ? "+" : ""}${Math.round(shown.cents)} cents` : "",
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

  let staleTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Restart the idle countdown; the next accepted frame restarts it again.
   * Covers both readouts: Tune's note and Intonation's, which read from the
   * same frames and would otherwise freeze on the last one just as badly.
   */
  function holdReading() {
    clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      tuner = null;
      note = null;
    }, STALE_READING_MS);
  }

  const unsubscribeState = source.subscribeState((next) => {
    state = next;
    if (next.status !== "running") {
      clearTimeout(staleTimer);
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
      if (next) {
        tuner = next;
        holdReading();
      }
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
    holdReading();
    session.push({ cents, clarity, t: event.timestamp });
    stats = session.stats;
  });

  onDestroy(() => {
    clearTimeout(staleTimer);
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
    tool = readRouteTab(new URLSearchParams({ mode: next }), "mode", TOOL_IDS, "tune");
    writeRouteTab("mode", tool);
    clearTimeout(staleTimer);
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
  <title>Tuner | Practice OS</title>
  <meta
    name="description"
    content="Tune, practice intonation, and play a tonic drone from one microphone-aware practice tool."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Tuner" compact>
    {#snippet controls()}
      <SegmentedControl options={TOOL_TABS} value={tool} onChange={changeTool} ariaLabel="Tuner tool" />
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
    <PracticeStage instrument={runtime.activeInstrument} class="grid gap-6 p-5 sm:p-7">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <SourceReadout label="Listening to" device={instrumentLabel} live={running}>
          {#snippet icon()}<Waves size={18} />{/snippet}
        </SourceReadout>
        <Button variant={running ? "secondary" : "default"} onclick={toggleMic}>
          {#if state.status === "requesting"}
            Starting...
          {:else if running}
            Stop microphone
          {:else}
            Start tuner
          {/if}
        </Button>
      </div>

      <div class="grid items-center gap-6 md:grid-cols-2">
        <!-- The readout is the page: note, cents, direction, then the numbers. -->
        <div class="flex flex-col items-center gap-1 text-center">
          <span
            class="font-display text-[7rem] font-semibold leading-[0.9] tracking-[-0.04em] transition-colors sm:text-[8rem] {tunerActive
              ? shown?.zone === 'in-tune'
                ? 'text-success'
                : 'text-stage-foreground'
              : 'text-stage-muted/50'}"
            aria-live="off"
          >
            {shown ? shown.note : "–"}<span class="text-[2.5rem] text-stage-muted">{shown ? shown.octave : ""}</span>
          </span>
          <span
            class="font-mono text-2xl font-bold tabular-nums {tunerActive
              ? shown?.zone === 'in-tune'
                ? 'text-success'
                : 'text-practice-accent'
              : 'text-stage-muted'}"
          >
            {tunerActive ? tunerCentsLabel : running ? "Listening..." : "Pluck or play a note"}
          </span>
          {#if tunerActive && shown}
            <span class="text-base font-bold {shown.zone === 'in-tune' ? 'text-success' : 'text-practice-accent'}" data-testid="tuner-direction">
              {direction}
            </span>
            <span class="font-mono text-xs text-stage-muted">
              {shown.frequency.toFixed(1)} Hz · target {midiToFrequency(shown.midi, a4).toFixed(2)} Hz · A4 = {a4}
            </span>
          {/if}
        </div>
        <ArcGauge
          cents={shown?.cents ?? 0}
          zone={shown?.zone ?? "in-tune"}
          toleranceCents={TUNER_TOLERANCE_CENTS}
          active={tunerActive}
          flatNeighbor={neighbors.flat}
          sharpNeighbor={neighbors.sharp}
          class="justify-self-center"
        />
      </div>

      {#if fretted && tuning}
        <StringStrip
          openStrings={tuning.openStrings}
          nearestMidi={nearestStringMidi}
          {targetMidi}
          onTarget={(midi) => (targetMidi = midi)}
        />
      {/if}
    </PracticeStage>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Reference A4</span>
        <div class="flex overflow-hidden rounded-md border" role="group" aria-label="Reference A4">
          {#each A4_OPTIONS as hz (hz)}
            <button
              type="button"
              aria-pressed={a4 === hz}
              class="px-2.5 py-1 font-mono text-sm tabular-nums transition-colors {a4 === hz
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'}"
              onclick={() => (a4 = hz)}
            >
              {hz}
            </button>
          {/each}
        </div>
      </div>
      {#if fretted && tunings.length > 1}
        <SegmentedControl
          size="sm"
          ariaLabel="Tuning"
          options={tunings.map((profile) => ({ value: profile.id, label: profile.name }))}
          value={tuning?.id ?? ""}
          onChange={(id) => {
            tuningId = id;
            targetMidi = undefined;
          }}
        />
      {/if}
      {#if state.status === "denied" || state.status === "error"}
        <span class="text-sm text-destructive">{state.message}</span>
      {/if}
    </div>
  {:else if tool === "intonation"}
    <PracticeStage instrument={runtime.activeInstrument} class="grid gap-5 p-5 sm:p-7">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={INTONATION_MODES}
          value={intonationMode}
          onChange={changeIntonationMode}
          ariaLabel="Intonation mode"
        />
        <div class="flex items-center gap-2">
          <SourceReadout label="Listening to" device={instrumentLabel} live={running}>
            {#snippet icon()}<Waves size={18} />{/snippet}
          </SourceReadout>
          <Button variant={running ? "secondary" : "default"} onclick={toggleMic}>
            {#if state.status === "requesting"}Starting...{:else if running}Stop microphone{:else}Start mic{/if}
          </Button>
        </div>
      </div>
      <p class="text-sm text-stage-muted">Track drift and steadiness while the mic listens.</p>
      <div class="grid items-center gap-6 md:grid-cols-2">
        <div class="flex flex-col items-center gap-1 text-center">
          <span
            class="font-display text-[6rem] font-semibold leading-[0.9] tracking-[-0.04em] transition-colors {intonationActive
              ? zone === 'in-tune'
                ? 'text-success'
                : 'text-stage-foreground'
              : 'text-stage-muted/50'}"
          >
            {note ?? "–"}
          </span>
          <span
            class="font-mono text-xl font-bold {intonationActive
              ? zone === 'in-tune'
                ? 'text-success'
                : 'text-practice-accent'
              : 'text-stage-muted'}"
          >
            {#if intonationActive}
              {intonationCentsLabel} · {zoneLabel}{#if frequency > 0}<span class="text-stage-muted"> · {frequency.toFixed(1)} Hz</span>{/if}
            {:else if running}
              Listening...
            {:else}
              Start the mic and play a note
            {/if}
          </span>
        </div>
        <ArcGauge {cents} {zone} toleranceCents={INTONATION_TOLERANCE_CENTS} active={intonationActive} class="justify-self-center" />
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HudTile size="sm" label="In tune" value={Math.round(stats.inTunePercent)} unit="%" tone="good">
          {#snippet icon()}<Target size={12} />{/snippet}
        </HudTile>
        <HudTile size="sm" label="Hold" value={stats.holdSeconds.toFixed(1)} unit="s" tone="accent">
          {#snippet icon()}<Clock size={12} />{/snippet}
        </HudTile>
        <HudTile size="sm" label="Steadiness" value={Math.round(stats.steadiness)} unit="%" />
        <HudTile size="sm" label="Avg drift" value={`+/-${Math.round(stats.avgDriftCents)}`} unit="¢" />
      </div>
    </PracticeStage>

    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2 space-y-0">
        <span class="eyebrow">Pitch trace · last 10 s</span>
        <span class="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          Within +/-{INTONATION_TOLERANCE_CENTS}¢
        </span>
      </Card.Header>
      <Card.Content>
        <PitchTrace trace={stats.trace} toleranceCents={INTONATION_TOLERANCE_CENTS} />
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Drone: no microphone, no reference row. One tonic, one timbre, one Play. -->
    <PracticeStage instrument={runtime.activeInstrument} class="grid gap-6 p-5 sm:p-7">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="eyebrow text-stage-muted">Drone · {tonicName} · {midiToFrequency(droneMidi).toFixed(0)} Hz{droneOn ? " · playing" : ""}</p>
        <Button variant={droneOn ? "secondary" : "default"} onclick={toggleDrone}>
          {droneOn ? "Stop drone" : "Play drone"}
        </Button>
      </div>
      <div class="grid place-items-center py-2">
        <div class="relative grid size-56 place-items-center">
          {#each [224, 176, 128] as size (size)}
            <span class="absolute rounded-full border border-stage-line {droneOn ? 'opacity-100' : 'opacity-50'}" style={`width: ${size}px; height: ${size}px;`} aria-hidden="true"></span>
          {/each}
          <span class="font-display text-[6rem] font-semibold leading-none">{tonicName}</span>
        </div>
      </div>
      <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-12" role="group" aria-label="Drone tonic">
        {#each TONICS as tonic (tonic.pc)}
          <button
            type="button"
            aria-pressed={tonicPc === tonic.pc}
            onclick={() => pickTonic(tonic.pc)}
            class={[
              "rounded-md border py-2.5 text-center font-mono text-sm font-bold transition-colors",
              tonicPc === tonic.pc
                ? `${DEGREE_CLASS["1"]} text-degree-foreground`
                : "border-stage-line bg-stage-2 text-stage-foreground hover:bg-stage-2/70",
            ]}
          >
            {tonic.name}
          </button>
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-sm text-stage-muted">Timbre</span>
          <SegmentedControl
            options={DRONE_TIMBRE_NAMES.map((name) => ({ value: name, label: name }))}
            value={timbre}
            onChange={pickTimbre}
            size="sm"
            ariaLabel="Drone timbre"
          />
        </div>
        <div class="flex items-center gap-3">
          <Volume2 size={18} class="text-stage-muted" />
          <input
            type="range"
            min="0"
            max="100"
            value={level}
            oninput={(e) => setLevel(e.currentTarget.valueAsNumber)}
            class="h-1.5 w-32 cursor-pointer accent-primary"
            aria-label="Drone volume"
          />
        </div>
      </div>
    </PracticeStage>
  {/if}
</PracticeScreen>
