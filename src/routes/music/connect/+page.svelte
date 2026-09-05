<script lang="ts">
  import { browser } from "$app/environment";
  import Plug from "lucide-svelte/icons/plug";

  import type { InputSource, InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import {
    DeviceProfileStore,
    defaultSurfaceForInstrument,
    type DeviceProfile,
    type InputSurfaceId,
    type InstrumentSurfacePreferences,
  } from "@repo/music-core/engines/device-profiles";
  import { midiCapabilities, type MidiDeviceSummary } from "@repo/music-core/engines/midi";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Empty } from "@repo/ui/empty";
  import { Input } from "@repo/ui/input";
  import { onDestroy } from "svelte";

  import InputSurface from "../_components/InputSurface.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SectionHeading from "../_components/SectionHeading.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import SetupChecklist, { type SetupItem } from "../_components/SetupChecklist.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";
  import MpcHardwareDiagnostic from "./_components/MpcHardwareDiagnostic.svelte";

  // Literal hue classes so Tailwind emits them.
  const INSTRUMENTS: { id: InstrumentId; label: string; hue: string }[] = [
    { id: "piano", label: "Piano", hue: "bg-instr-piano" },
    { id: "guitar", label: "Guitar", hue: "bg-instr-guitar" },
    { id: "ukulele", label: "Ukulele", hue: "bg-instr-ukulele" },
    { id: "aerophone", label: "Aerophone", hue: "bg-instr-aerophone" },
    { id: "mpc", label: "MPC / Pads", hue: "bg-instr-mpc" },
    { id: "voice", label: "Voice", hue: "bg-instr-voice" },
  ];
  const SOURCE_OPTIONS = [
    { value: "midi", label: "MIDI" },
    { value: "audio", label: "Audio" },
    { value: "onscreen", label: "On-screen" },
  ];
  const SURFACE_OPTIONS = [
    { value: "keyboard", label: "Keys" },
    { value: "guitar", label: "Guitar" },
    { value: "ukulele", label: "Uke" },
    { value: "mpc", label: "MPC" },
  ];

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const profiles = new DeviceProfileStore(store?.settings);

  let ready = $state(false);
  let status = $state("Loading device profiles.");
  let savedProfiles = $state<DeviceProfile[]>([]);
  let preferences = $state<Partial<Record<InstrumentId, InputSource>>>({});
  let surfaces = $state<InstrumentSurfacePreferences>({});
  let midiEnabled = $state(runtime.midi.state.enabled);
  let midiDevices = $state<MidiDeviceSummary[]>(runtime.midi.state.inputs ?? []);
  let midiOutputs = $state<MidiDeviceSummary[]>(runtime.midi.state.outputs ?? []);
  let sysexEnabled = $state(runtime.midi.state.sysexEnabled);
  let midiError = $state(runtime.midi.state.error);
  let liveEventSeq = 0;
  let liveEvents = $state<Array<{ id: string; event: NoteEvent }>>([]);
  let showFallback = $state(false);
  let audioEnabled = $state(runtime.sound.enabled);

  // What is ready on this device, one row each with the action that fixes it.
  const setupItems = $derived<SetupItem[]>([
    {
      id: "audio",
      title: "Audio",
      detail: audioEnabled ? "Enabled · prompts and the metronome can play" : runtime.audioMessage,
      state: audioEnabled ? "ok" : "warn",
      action: { label: audioEnabled ? "Test sound" : "Enable audio", onclick: () => void testAudio() },
    },
    {
      id: "midi",
      title: "MIDI",
      detail: !capabilities.supported
        ? capabilities.reason
        : midiEnabled
          ? `${midiDevices.length} device${midiDevices.length === 1 ? "" : "s"} connected`
          : "Not requested · needed for keyboards, pads and MIDI guitars",
      state: midiEnabled ? (midiDevices.length > 0 ? "ok" : "warn") : "off",
      action: {
        label: midiEnabled ? "Rescan" : "Enable MIDI",
        onclick: () => void enableMidi(),
        disabled: !capabilities.supported,
      },
    },
    {
      id: "microphone",
      title: "Microphone",
      detail: "Asked for when you start the tuner or a voice answer · used for acoustic guitar and singing",
      state: "off",
      action: { label: "Open Tuner", href: "/music/tuner" },
    },
  ]);

  async function testAudio(): Promise<void> {
    audioEnabled = await runtime.ensurePlaybackVoice();
    if (audioEnabled) runtime.sound.playNote(60, 0.3, undefined, 0.6);
  }

  const capabilities = $derived(midiCapabilities(browser ? navigator : {}));

  const unsubscribeMidi = runtime.midi.subscribeState((state) => {
    midiEnabled = state.enabled;
    midiDevices = state.inputs;
    midiOutputs = state.outputs;
    sysexEnabled = state.sysexEnabled;
    midiError = state.error;
  });

  // Live activity monitor — confirms messages actually flow from a connected device.
  const unsubscribeEvents = runtime.midi.subscribe((event) => {
    liveEventSeq += 1;
    liveEvents = [{ id: `${event.timestamp}-${liveEventSeq}`, event }, ...liveEvents].slice(0, 10);
  });

  function describeEvent(event: NoteEvent): string {
    const ch = "channel" in event && event.channel != null ? `ch ${event.channel + 1}` : "ch —";
    const note = "midiNote" in event && event.midiNote != null ? ` · note ${event.midiNote}` : "";
    return `${event.type} · ${ch}${note} · ${Math.round(event.timestamp)}ms`;
  }

  void initialize();

  async function initialize(): Promise<void> {
    try {
      const state = await profiles.load();
      savedProfiles = state.profiles;
      preferences = state.preferences;
      surfaces = state.surfaces;
      ready = true;
      status = midiEnabled ? "Devices connected." : "Enable MIDI to detect devices.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Device profiles could not be loaded.";
    }
  }

  function profileFor(id: string): DeviceProfile | undefined {
    return savedProfiles.find((profile) => profile.id === id);
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
    status = midiEnabled ? "Devices connected." : (midiError ?? "MIDI permission was declined.");
  }

  async function updateProfile(id: string, patch: Partial<DeviceProfile>): Promise<void> {
    if (!ready) return;
    const current = profileFor(id) ?? { id };
    const next = await profiles.saveProfile({ ...current, ...patch });
    savedProfiles = next.profiles;
    await runtime.reloadMidiInstruments();
    status = "Saved.";
  }

  async function choosePreference(instrument: InstrumentId, source: string): Promise<void> {
    if (!ready) return;
    const next = await profiles.setPreference(instrument, source as InputSource);
    preferences = next.preferences;
    await runtime.reloadMidiInstruments();
    status = "Preference saved.";
  }

  function surfaceFor(instrument: InstrumentId): InputSurfaceId {
    return surfaces[instrument] ?? defaultSurfaceForInstrument(instrument);
  }

  async function chooseSurface(instrument: InstrumentId, surface: string): Promise<void> {
    if (!ready) return;
    const next = await profiles.setSurface(instrument, surface as InputSurfaceId);
    surfaces = next.surfaces;
    await runtime.reloadMidiInstruments();
    status = "On-screen surface saved.";
  }

  onDestroy(() => {
    unsubscribeMidi();
    unsubscribeEvents();
  });
</script>

<svelte:head>
  <title>Connect Instruments | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Connect Instruments"
    subtitle="Name your devices and pick the most reliable source per instrument. MIDI first, audio fallback, on-screen always."
  >
    {#snippet controls()}
      <Button type="button" disabled={midiEnabled || !capabilities.supported} onclick={enableMidi}>
        <Plug class="size-4" aria-hidden="true" />
        {midiEnabled ? "MIDI active" : "Add device"}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  {#if !capabilities.supported}
    <div class="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm">
      <span class="font-semibold text-warn">Web MIDI unavailable.</span>
      <span class="text-muted-foreground">
        {capabilities.reason} Guitar and ukulele can use the microphone; everything else uses the
        on-screen surfaces.
      </span>
    </div>
  {/if}

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>

  <section aria-label="Setup" class="grid gap-3">
    <SectionHeading title="What is ready" eyebrow="Setup" />
    <SetupChecklist items={setupItems} />
  </section>

  <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
    <div class="grid gap-6">
      <!-- Connected MIDI devices -->
      <section aria-label="Connected devices" class="grid gap-3">
        <SectionHeading title="MIDI devices" eyebrow={`${midiDevices.length} detected`} />
        {#if midiDevices.length === 0}
          <Empty
            title={midiEnabled ? "No MIDI inputs detected" : "No devices connected"}
            description={midiEnabled
              ? "Connect a controller and it will appear here automatically."
              : "Enable MIDI to detect connected controllers."}
          >
            {#snippet icon()}<Plug aria-hidden="true" />{/snippet}
            {#if !midiEnabled}
              <Button
                type="button"
                variant="outline"
                disabled={!capabilities.supported}
                onclick={enableMidi}
              >
                Enable MIDI
              </Button>
            {/if}
          </Empty>
        {:else}
          <div class="grid gap-3">
            {#each midiDevices as device (device.id)}
              {@const profile = profileFor(device.id)}
              {@const ignored = profile?.ignored ?? false}
              <Card.Root class={ignored ? "opacity-60" : ""}>
                <Card.Header class="flex-row items-start justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      class="led {ignored ? '[--led-color:var(--muted-foreground)]' : '[--led-color:var(--success)]'}"
                      aria-hidden="true"
                    ></span>
                    <div class="min-w-0">
                      <Card.Title class="truncate font-display">{profile?.alias || device.name}</Card.Title>
                      <Card.Description class="truncate">
                        {device.manufacturer ?? "USB-MIDI"}
                      </Card.Description>
                    </div>
                  </div>
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {ignored
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-success/15 text-success'}"
                  >
                    {ignored ? "Ignored" : "Live"}
                  </span>
                </Card.Header>
                <Card.Content class="grid gap-3">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="grid gap-1.5">
                      <span class="text-xs font-medium text-muted-foreground">Alias</span>
                      <Input
                        aria-label="Alias for {device.name}"
                        value={profile?.alias ?? ""}
                        placeholder={device.name}
                        oninput={(event) => updateProfile(device.id, { alias: event.currentTarget.value })}
                      />
                    </label>
                    <label class="grid gap-1.5">
                      <span class="text-xs font-medium text-muted-foreground">Instrument</span>
                      <select
                        aria-label="Instrument for {device.name}"
                        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={profile?.instrument ?? ""}
                        onchange={(event) =>
                          updateProfile(device.id, {
                            instrument: (event.currentTarget.value || undefined) as InstrumentId,
                          })}
                      >
                        <option value="">Unassigned</option>
                        {#each INSTRUMENTS as instrument (instrument.id)}
                          <option value={instrument.id}>{instrument.label}</option>
                        {/each}
                      </select>
                    </label>
                  </div>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      class="size-4"
                      aria-label="Ignore input from {device.name}"
                      checked={ignored}
                      onchange={(event) =>
                        updateProfile(device.id, { ignored: event.currentTarget.checked })}
                    />
                    <span class="text-muted-foreground">
                      Ignore this input (drop its notes; e.g. an MPC control port)
                    </span>
                  </label>
                </Card.Content>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Live MIDI activity monitor: the signal line under the devices. -->
      <section aria-label="Live MIDI activity" class="grid gap-3">
        <SectionHeading title="Live activity" eyebrow="Signal" level={3} />
        <Card.Root>
          <Card.Content class="py-4">
            {#if liveEvents.length === 0}
              <p class="flex items-center gap-3 text-sm text-muted-foreground">
                <span class="led" aria-hidden="true"></span>
                {midiEnabled
                  ? "Waiting for a MIDI message. Play a note to confirm the connection."
                  : "Enable MIDI, then play a note to see live messages here."}
              </p>
            {:else}
              <!-- Not a live region: announcing every MIDI message would talk over the page status. -->
              <ol class="grid gap-1 font-mono text-xs text-muted-foreground">
                {#each liveEvents as entry, index (entry.id)}
                  <li class="flex items-center gap-3 rounded-md border px-3 py-2 {index === 0 ? 'text-foreground' : ''}">
                    {#if index === 0}<span class="led [--led-color:var(--instr)]" aria-hidden="true"></span>{/if}
                    {describeEvent(entry.event)}
                  </li>
                {/each}
              </ol>
            {/if}
          </Card.Content>
        </Card.Root>
      </section>

      <section aria-label="MPC hardware diagnostic" class="grid gap-3">
        <SectionHeading title="MPC hardware" eyebrow="Pad LEDs over SysEx" level={3} />
        {#key midiOutputs.map((output) => output.id).join("|")}
          <MpcHardwareDiagnostic
            outputs={midiOutputs}
            {sysexEnabled}
            send={(outputId, data) => runtime.midi.send(outputId, data)}
            subscribeRaw={(listener) => runtime.midi.subscribeRaw(listener)}
          />
        {/key}
      </section>
    </div>

    <div class="grid gap-6">
      <!-- Per-instrument preferred source + on-screen surface, as one table. -->
      <section aria-label="Input routing" class="grid gap-3">
        <SectionHeading title="Preferred source per instrument" eyebrow="Routing" />
        <Card.Root>
          <Card.Content class="overflow-x-auto py-4">
            <table class="w-full min-w-[26rem] text-sm">
              <thead>
                <tr class="text-left">
                  <th scope="col" class="pb-2 eyebrow">Instrument</th>
                  <th scope="col" class="pb-2 eyebrow">Source</th>
                  <th scope="col" class="pb-2 eyebrow">On-screen surface</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {#each INSTRUMENTS as instrument (instrument.id)}
                  <tr>
                    <th scope="row" class="py-2.5 pr-3 text-left font-medium">
                      <span class="flex items-center gap-2">
                        <span class="size-2 rounded-sm {instrument.hue}" aria-hidden="true"></span>
                        {instrument.label}
                      </span>
                    </th>
                    <td class="py-2.5 pr-3">
                      <SegmentedControl
                        size="sm"
                        ariaLabel={`Source for ${instrument.label}`}
                        options={SOURCE_OPTIONS}
                        value={preferences[instrument.id] ?? "midi"}
                        onChange={(source) => choosePreference(instrument.id, source)}
                      />
                    </td>
                    <td class="py-2.5">
                      <SegmentedControl
                        size="sm"
                        ariaLabel={`On-screen surface for ${instrument.label}`}
                        options={SURFACE_OPTIONS}
                        value={surfaceFor(instrument.id)}
                        onChange={(surface) => chooseSurface(instrument.id, surface)}
                      />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </Card.Content>
        </Card.Root>
      </section>

      <!-- On-screen fallback, collapsed until asked for. -->
      <section aria-label="On-screen fallback" class="grid gap-3">
        <SectionHeading title="On-screen fallback" eyebrow="Always available" level={3}>
          {#snippet action()}
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showFallback}
              onclick={() => (showFallback = !showFallback)}
            >
              {showFallback ? "Hide the on-screen surface" : "Try the on-screen surface"}
            </Button>
          {/snippet}
        </SectionHeading>
        {#if showFallback}
          <Card.Root>
            <Card.Content class="py-5">
              <InputSurface router={runtime.router} />
            </Card.Content>
          </Card.Root>
        {/if}
      </section>
    </div>
  </div>
</PracticeScreen>
