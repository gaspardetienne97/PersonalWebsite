<script lang="ts">
  import { browser } from "$app/environment";
  import Plug from "lucide-svelte/icons/plug";

  import type { InputSource, InstrumentId } from "@repo/music-core/domain";
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
  import { Input } from "@repo/ui/input";
  import { onDestroy } from "svelte";

  import InputSurface from "../_components/InputSurface.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
    { id: "piano", label: "Piano" },
    { id: "guitar", label: "Guitar" },
    { id: "ukulele", label: "Ukulele" },
    { id: "aerophone", label: "Aerophone" },
    { id: "mpc", label: "MPC / Pads" },
    { id: "voice", label: "Voice" },
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
  let midiError = $state(runtime.midi.state.error);

  const capabilities = $derived(midiCapabilities(browser ? navigator : {}));

  const unsubscribeMidi = runtime.midi.subscribeState((state) => {
    midiEnabled = state.enabled;
    midiDevices = state.inputs;
    midiError = state.error;
  });

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

  onDestroy(() => unsubscribeMidi());
</script>

<svelte:head>
  <title>Connect Instruments | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Connect Instruments"
    subtitle="MIDI-first, audio fallback. Name your devices and pick the most reliable source per instrument."
  >
    {#snippet controls()}
      <Button type="button" disabled={midiEnabled || !capabilities.supported} onclick={enableMidi}>
        <Plug class="size-4" aria-hidden="true" />
        {midiEnabled ? "MIDI active" : "Add device"}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  {#if !capabilities.supported}
    <div class="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <span class="font-semibold text-amber-700 dark:text-amber-400">Web MIDI unavailable.</span>
      <span class="text-muted-foreground">
        {capabilities.reason} Guitar &amp; uke can fall back to audio (Phase 2); everything else uses the
        on-screen keyboard below.
      </span>
    </div>
  {/if}

  <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>

  <!-- Connected MIDI devices -->
  <section aria-label="Connected devices">
    <h2 class="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      MIDI devices
    </h2>
    {#if midiDevices.length === 0}
      <Card.Root>
        <Card.Content class="py-6 text-sm text-muted-foreground">
          {midiEnabled
            ? "No MIDI inputs detected. Connect a device and it will appear here."
            : "Enable MIDI to detect connected controllers."}
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each midiDevices as device (device.id)}
          {@const profile = profileFor(device.id)}
          <Card.Root>
            <Card.Header class="flex-row items-start justify-between gap-2">
              <div class="min-w-0">
                <Card.Title class="truncate">{profile?.alias || device.name}</Card.Title>
                <Card.Description class="truncate">
                  {device.manufacturer ?? "USB-MIDI"}
                </Card.Description>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">
                <span class="size-1.5 rounded-full bg-current"></span>Live
              </span>
            </Card.Header>
            <Card.Content class="grid gap-3">
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
            </Card.Content>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Per-instrument preferred source + on-screen surface -->
  <section aria-label="Input routing">
    <h2 class="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      Preferred source per instrument
    </h2>
    <Card.Root>
      <Card.Content class="grid gap-4 py-5 sm:grid-cols-2">
        {#each INSTRUMENTS as instrument (instrument.id)}
          <div class="grid gap-2">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium">{instrument.label}</span>
              <SegmentedControl
                size="sm"
                options={SOURCE_OPTIONS}
                value={preferences[instrument.id] ?? "midi"}
                onChange={(source) => choosePreference(instrument.id, source)}
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-muted-foreground">On-screen surface</span>
              <SegmentedControl
                size="sm"
                ariaLabel={`On-screen surface for ${instrument.label}`}
                options={SURFACE_OPTIONS}
                value={surfaceFor(instrument.id)}
                onChange={(surface) => chooseSurface(instrument.id, surface)}
              />
            </div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  </section>

  <!-- On-screen fallback -->
  <section aria-label="On-screen fallback">
    <div class="mb-3 flex items-center gap-2">
      <h2 class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        On-screen fallback
      </h2>
      <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Always available
      </span>
    </div>
    <Card.Root>
      <Card.Content class="py-5">
        <InputSurface router={runtime.router} />
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
