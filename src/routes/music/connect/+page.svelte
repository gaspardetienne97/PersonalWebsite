<script lang="ts">
  import { browser } from "$app/environment";
  import Plug from "lucide-svelte/icons/plug";
  import X from "lucide-svelte/icons/x";

  import type { InputSource, InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import {
    DeviceProfileStore,
    MPC_PAD_NOTE_PRESETS,
    defaultSurfaceForInstrument,
    padNotePresetId,
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
          ? `Listening to ${listenedDevices.length} device${listenedDevices.length === 1 ? "" : "s"}${removedCount > 0 ? ` · ${removedCount} removed` : ""}`
          : "Not requested · needed for keyboards, pads and MIDI guitars",
      state: midiEnabled ? (listenedDevices.length > 0 ? "ok" : "warn") : "off",
      action: {
        label: midiEnabled ? "Rescan" : "Enable MIDI",
        onclick: () => void (midiEnabled ? rescanMidi() : enableMidi()),
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
    void learnPadFrom(event);
  });

  /**
   * Pad learning: the player hits A01 … A16 in order; the raw note each pad
   * sends becomes the device's pad map. Only note-ons from the device being
   * taught count, and a repeated note is ignored so a double hit cannot skip
   * a pad.
   */
  let learning = $state<{ deviceId: string; notes: number[] } | undefined>();
  const learningPad = $derived(learning ? learning.notes.length + 1 : 0);

  function startLearning(deviceId: string): void {
    learning = { deviceId, notes: [] };
    status = "Hit pad A01 on the device.";
  }

  function cancelLearning(): void {
    learning = undefined;
    status = "Pad learning cancelled; the saved map is unchanged.";
  }

  async function learnPadFrom(event: NoteEvent): Promise<void> {
    const session = learning;
    if (!session || event.type !== "noteOn" || event.deviceId !== session.deviceId) return;
    if (session.notes.includes(event.midiNote)) return;
    const notes = [...session.notes, event.midiNote];
    if (notes.length < 16) {
      learning = { ...session, notes };
      status = `Pad A${String(notes.length).padStart(2, "0")} sends note ${event.midiNote}. Hit pad A${String(notes.length + 1).padStart(2, "0")}.`;
      return;
    }
    learning = undefined;
    await updateProfile(session.deviceId, { padNotes: notes });
    status = "Pad map learned and saved. Exercises now follow your pads.";
  }

  async function applyPadPreset(deviceId: string, presetId: string): Promise<void> {
    const preset = MPC_PAD_NOTE_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    const current = profileFor(deviceId) ?? { id: deviceId };
    const { padNotes: _dropped, ...rest } = current;
    const next = await profiles.saveProfile(
      presetId === MPC_PAD_NOTE_PRESETS[0]!.id ? rest : { ...rest, padNotes: [...preset.notes] },
    );
    savedProfiles = next.profiles;
    await runtime.reloadMidiInstruments();
    status = `Pad map set to ${preset.label}.`;
  }

  function describeEvent(event: NoteEvent): string {
    // The MIDI engine already reports 1-based channels.
    const ch = "channel" in event && event.channel != null ? `ch ${event.channel}` : "ch —";
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

  /** Rescan lists every device again: removals are undone, then the ports are re-read. */
  async function rescanMidi(): Promise<void> {
    if (ready) {
      for (const profile of savedProfiles.filter((entry) => entry.ignored)) {
        const { ignored: _removed, ...rest } = profile;
        const next = await profiles.saveProfile(rest);
        savedProfiles = next.profiles;
      }
      await runtime.reloadMidiInstruments();
    }
    await runtime.midi.enable();
    status = midiEnabled ? "All devices listed again." : (midiError ?? "MIDI permission was declined.");
  }

  /** Remove a device: the app stops listening to it until the next Rescan. */
  async function removeDevice(id: string, name: string): Promise<void> {
    await updateProfile(id, { ignored: true });
    status = `${name} removed. Rescan lists it again.`;
  }

  const listenedDevices = $derived(midiDevices.filter((device) => !profileFor(device.id)?.ignored));
  const linkedOutputId = $derived(
    midiOutputs.find((output) => profileFor(output.id)?.controllerLink)?.id,
  );

  /** One linked MPC output at a time; the runtime keeps its handshake alive app-wide. */
  async function setControllerLink(outputId: string | undefined): Promise<void> {
    if (!ready) return;
    for (const profile of savedProfiles.filter((entry) => entry.controllerLink && entry.id !== outputId)) {
      const { controllerLink: _dropped, ...rest } = profile;
      savedProfiles = (await profiles.saveProfile(rest)).profiles;
    }
    if (outputId) {
      const current = profileFor(outputId) ?? { id: outputId };
      savedProfiles = (await profiles.saveProfile({ ...current, controllerLink: true })).profiles;
    }
    await runtime.reloadMidiInstruments();
    status = outputId
      ? "MPC linked. The app keeps it in Controller Mode on every page."
      : "MPC unlinked.";
  }
  const removedCount = $derived(midiDevices.length - listenedDevices.length);

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

  <!-- minmax(0,1fr) columns: the routing table scrolls inside its card instead of widening the page. -->
  <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <!-- Connected MIDI devices -->
      <section aria-label="Connected devices" class="grid gap-3">
        <SectionHeading title="MIDI devices" eyebrow={`${listenedDevices.length} listening${removedCount > 0 ? ` · ${removedCount} removed` : ""}`} />
        {#if removedCount > 0}
          <p class="text-sm text-muted-foreground">
            {removedCount} device{removedCount === 1 ? "" : "s"} removed. The app ignores {removedCount === 1 ? "it" : "them"} everywhere; Rescan lists every device again.
          </p>
        {/if}
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
            {#each listenedDevices as device (device.id)}
              {@const profile = profileFor(device.id)}
              <Card.Root>
                <Card.Header class="flex-row items-start justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      class="led [--led-color:var(--success)]"
                      aria-hidden="true"
                    ></span>
                    <div class="min-w-0">
                      <Card.Title class="truncate font-display">{profile?.alias || device.name}</Card.Title>
                      <Card.Description class="truncate">
                        {device.manufacturer ?? "USB-MIDI"}
                      </Card.Description>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Live</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="size-9"
                      aria-label="Remove {device.name}"
                      title="Remove: stop listening to this device until the next Rescan"
                      onclick={() => void removeDevice(device.id, profile?.alias || device.name)}
                    >
                      <X class="size-4" aria-hidden="true" />
                    </Button>
                  </div>
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
                  {#if profile?.instrument === "mpc"}
                    {@const presetId = padNotePresetId(profile.padNotes)}
                    <div class="grid gap-2 rounded-lg border border-dashed p-3" data-testid="pad-map-{device.id}">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p class="text-sm font-medium">Pad notes</p>
                          <p class="text-xs text-muted-foreground">
                            Which MIDI note each pad sends. Exercises grade pads, not note numbers, so this map has to match your program.
                          </p>
                        </div>
                        {#if learning?.deviceId === device.id}
                          <Button type="button" size="sm" variant="outline" onclick={cancelLearning}>
                            Cancel learning
                          </Button>
                        {:else}
                          <Button type="button" size="sm" variant="outline" onclick={() => startLearning(device.id)}>
                            Learn pads
                          </Button>
                        {/if}
                      </div>
                      {#if learning?.deviceId === device.id}
                        <div class="grid grid-cols-8 gap-1" aria-label="Pad learning progress">
                          {#each Array.from({ length: 16 }, (_, i) => i) as index (index)}
                            {@const learned = learning.notes[index]}
                            <span
                              class="grid h-8 place-items-center rounded border font-mono text-[0.625rem] tabular-nums {index + 1 === learningPad
                                ? 'border-practice-accent bg-practice-accent/15 text-foreground ring-1 ring-practice-accent'
                                : learned !== undefined
                                  ? 'bg-success/15 text-success'
                                  : 'text-muted-foreground'}"
                            >
                              {learned ?? `A${String(index + 1).padStart(2, "0")}`}
                            </span>
                          {/each}
                        </div>
                      {:else}
                        <label class="grid gap-1.5">
                          <span class="sr-only">Pad note map for {device.name}</span>
                          <select
                            aria-label="Pad note map for {device.name}"
                            class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            value={presetId}
                            onchange={(event) => void applyPadPreset(device.id, event.currentTarget.value)}
                          >
                            {#each MPC_PAD_NOTE_PRESETS as preset (preset.id)}
                              <option value={preset.id}>{preset.label}</option>
                            {/each}
                            <!-- Always present so a learned map selects itself; only choosable once learned. -->
                            <option value="custom" disabled={presetId !== "custom"}>Learned from this device</option>
                          </select>
                        </label>
                        {#if profile.padNotes}
                          <p class="font-mono text-xs text-muted-foreground tabular-nums">
                            A01–A16: {profile.padNotes.join(" ")}
                          </p>
                        {/if}
                      {/if}
                    </div>
                  {/if}
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
            linkedOutputId={linkedOutputId}
            onLink={setControllerLink}
          />
        {/key}
      </section>
    </div>

    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <!-- Per-instrument preferred source + on-screen surface, as one table. -->
      <section aria-label="Input routing" class="grid grid-cols-[minmax(0,1fr)] gap-3">
        <SectionHeading title="Preferred source per instrument" eyebrow="Routing" />
        <Card.Root class="min-w-0">
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
