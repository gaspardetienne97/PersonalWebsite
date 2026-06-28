<script lang="ts">
  import { onMount } from "svelte";

  import {
    MPC_BANKS,
    type MpcPadMidi,
    type SampleKit,
    type SampleKitStore,
  } from "@repo/music-core/engines/sample-kit";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import type { ActiveSampleKit } from "./sample-kit-playback";

  const {
    store,
    activeKit,
    onactivate,
    onaudition,
    ondirectoryexport,
    onzipexport,
    directoryExportAvailable,
  }: {
    store: SampleKitStore;
    activeKit?: ActiveSampleKit;
    onactivate: (kitId: string) => Promise<void>;
    onaudition: (midiNote: MpcPadMidi) => void;
    ondirectoryexport: (kitId: string) => Promise<void>;
    onzipexport: (kitId: string) => Promise<void>;
    directoryExportAvailable: boolean;
  } = $props();

  let kits = $state.raw<SampleKit[]>([]);
  let selectedKitId = $state<string>();
  let busy = $state(false);
  let message = $state("Create or select a kit.");
  let error = $state<string>();
  let creating = $state(false);
  let newKitName = $state("");
  let renaming = $state(false);
  let renameName = $state("");
  let confirmingDelete = $state(false);
  let selectedBankId = $state<(typeof MPC_BANKS)[number]["id"]>("A");
  let sampleNameDrafts = $state<Record<string, string>>({});

  const selectedKit = $derived(kits.find((kit) => kit.id === selectedKitId));
  const selectedBank = $derived(
    MPC_BANKS.find((bank) => bank.id === selectedBankId) ?? MPC_BANKS[0],
  );
  const unassigned = $derived(
    selectedKit
      ? selectedKit.samples.filter(
          (sample) => !selectedKit.assignments.some((a) => a.sampleId === sample.id),
        )
      : [],
  );

  onMount(async () => {
    kits = await store.load();
    selectedKitId = kits[0]?.id;
  });

  async function run(action: () => Promise<void>): Promise<void> {
    busy = true;
    error = undefined;
    try {
      await action();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }

  async function reload(selectId?: string): Promise<void> {
    kits = await store.load();
    if (selectId) selectedKitId = selectId;
  }

  function createKit(): Promise<void> {
    return run(async () => {
      const kit = await store.create(newKitName);
      await reload(kit.id);
      creating = false;
      newKitName = "";
      message = `Created ${kit.name}.`;
    });
  }

  function renameKit(): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.rename(kitId, renameName);
      await reload(kit.id);
      renaming = false;
      message = `Renamed to ${kit.name}.`;
    });
  }

  function deleteKit(): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      await store.deleteKit(kitId);
      await reload();
      selectedKitId = kits[0]?.id;
      confirmingDelete = false;
      message = "Kit deleted.";
    });
  }

  function importSamples(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files ? [...input.files] : [];
    input.value = "";
    if (!selectedKit || files.length === 0) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.importFiles(kitId, files);
      await reload(kit.id);
      message = `Imported ${files.length} sample${files.length === 1 ? "" : "s"}.`;
    });
  }

  function assignSampleToPad(sampleId: string, midiNote: MpcPadMidi): Promise<void> {
    if (!selectedKit || !sampleId) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.assign(kitId, sampleId, midiNote);
      await reload(kit.id);
    });
  }

  function assignHardLayer(assignment: { sampleId: string }, sampleId: string, midiNote: MpcPadMidi): Promise<void> {
    if (!selectedKit || !sampleId) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.setVelocityLayers(kitId, midiNote, [
        { sampleId: assignment.sampleId, minVelocity: 0, maxVelocity: 0.63 },
        { sampleId, minVelocity: 0.64, maxVelocity: 1 },
      ]);
      await reload(kit.id);
    });
  }

  function assignChokeGroup(midiNote: MpcPadMidi, value: string): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    const chokeGroup = value === "" ? undefined : Number(value);
    return run(async () => {
      const kit = await store.setChokeGroup(kitId, midiNote, chokeGroup);
      await reload(kit.id);
    });
  }

  function sampleNameDraft(sampleId: string, fallback: string): string {
    return sampleNameDrafts[sampleId] ?? fallback;
  }

  function updateSampleNameDraft(sampleId: string, value: string): void {
    sampleNameDrafts = { ...sampleNameDrafts, [sampleId]: value };
  }

  function renameImportedSample(sampleId: string, displayName: string): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.renameSample(kitId, sampleId, displayName);
      sampleNameDrafts = { ...sampleNameDrafts, [sampleId]: displayName.trim() };
      await reload(kit.id);
      message = "Sample renamed.";
    });
  }

  function deleteImportedSample(sampleId: string): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.deleteSample(kitId, sampleId);
      const remainingDrafts = { ...sampleNameDrafts };
      delete remainingDrafts[sampleId];
      sampleNameDrafts = remainingDrafts;
      await reload(kit.id);
      message = "Sample deleted.";
    });
  }

  function clearPad(midiNote: MpcPadMidi): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(async () => {
      const kit = await store.unassign(kitId, midiNote);
      await reload(kit.id);
    });
  }

  function activate(): Promise<void> {
    if (!selectedKit) return Promise.resolve();
    const kitId = selectedKit.id;
    return run(() => onactivate(kitId));
  }

  function sampleLabel(sampleId: string): string {
    return selectedKit?.samples.find((sample) => sample.id === sampleId)?.displayName ?? "";
  }

  function padStatus(midiNote: number): "playable" | "export-only" | "missing" | undefined {
    if (!activeKit || activeKit.kitId !== selectedKitId) return undefined;
    return activeKit.pads.find((pad) => pad.midiNote === midiNote)?.status;
  }
</script>

<Card.Root class="min-w-0">
  <Card.Header>
    <Card.Description>Sample kits</Card.Description>
    <Card.Title>MPC pads</Card.Title>
  </Card.Header>
  <Card.Content class="grid min-w-0 gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" for="kit-select">Selected kit</label>
      <select
        id="kit-select"
        class="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
        bind:value={selectedKitId}
        disabled={busy || kits.length === 0}
      >
        {#each kits as kit (kit.id)}
          <option value={kit.id}>{kit.name}</option>
        {/each}
      </select>
      <Button type="button" size="sm" disabled={busy} onclick={() => (creating = !creating)}>
        New kit
      </Button>
      {#if selectedKit}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onclick={() => {
            renaming = !renaming;
            renameName = selectedKit?.name ?? "";
          }}
        >
          Rename
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onclick={() => (confirmingDelete = true)}
        >
          Delete
        </Button>
      {/if}
    </div>

    {#if creating}
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm font-medium" for="new-kit-name">Kit name</label>
        <input
          id="new-kit-name"
          class="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          bind:value={newKitName}
        />
        <Button type="button" size="sm" disabled={busy} onclick={createKit}>Create kit</Button>
      </div>
    {/if}

    {#if renaming && selectedKit}
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm font-medium" for="rename-kit-name">Rename kit</label>
        <input
          id="rename-kit-name"
          class="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          bind:value={renameName}
        />
        <Button type="button" size="sm" disabled={busy} onclick={renameKit}>Save name</Button>
      </div>
    {/if}

    {#if confirmingDelete && selectedKit}
      <div class="flex flex-wrap items-center gap-2 rounded-md border border-destructive p-2">
        <span class="text-sm">Delete “{selectedKit.name}” and its samples?</span>
        <Button type="button" size="sm" variant="destructive" disabled={busy} onclick={deleteKit}>
          Confirm delete
        </Button>
        <Button type="button" size="sm" variant="outline" onclick={() => (confirmingDelete = false)}>
          Cancel
        </Button>
      </div>
    {/if}

    {#if selectedKit}
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm font-medium" for="import-samples">Import samples</label>
        <input
          id="import-samples"
          type="file"
          multiple
          accept=".wav,.wave,.aif,.aiff,.flac,.mp3,.ogg,.oga"
          class="text-sm"
          disabled={busy}
          onchange={importSamples}
        />
      </div>

      {#if selectedKit.samples.length > 0}
        <div class="grid gap-2">
          <p class="text-sm font-medium">Samples</p>
          <div class="grid gap-2">
            {#each selectedKit.samples as sample (sample.id)}
              <div class="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto_auto]">
                <label class="sr-only" for={`sample-name-${sample.id}`}>
                  Sample name for {sample.fileName}
                </label>
                <input
                  id={`sample-name-${sample.id}`}
                  class="h-8 min-w-0 rounded border bg-background px-2 text-xs"
                  value={sampleNameDraft(sample.id, sample.displayName)}
                  disabled={busy}
                  oninput={(event) =>
                    updateSampleNameDraft(
                      sample.id,
                      (event.currentTarget as HTMLInputElement).value,
                    )}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Save sample ${sample.id}`}
                  onclick={() =>
                    renameImportedSample(
                      sample.id,
                      sampleNameDraft(sample.id, sample.displayName),
                    )}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Delete sample ${sample.id}`}
                  onclick={() => deleteImportedSample(sample.id)}
                >
                  Delete
                </Button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap gap-1" aria-label="Pad bank">
        {#each MPC_BANKS as bank (bank.id)}
          <button
            type="button"
            class="rounded-md border px-3 py-1 text-xs font-medium aria-pressed:bg-muted"
            aria-pressed={selectedBankId === bank.id}
            onclick={() => (selectedBankId = bank.id)}
          >
            {bank.label}
          </button>
        {/each}
      </div>

      <div class="grid grid-cols-4 gap-2" aria-label={`${selectedBank.label} pads`}>
        {#each selectedBank.midiNotes as midiNote, index (midiNote)}
          {@const assignment = selectedKit.assignments.find((a) => a.midiNote === midiNote)}
          {@const status = padStatus(midiNote)}
          <div class="grid min-w-0 gap-1 rounded-md border p-2">
            <button
              type="button"
              class="grid min-w-0 gap-0.5 text-left"
              aria-label={`Pad ${selectedBank.id}${index + 1}, MIDI ${midiNote}, ${assignment ? assignment.label : "empty"}`}
              disabled={busy || !assignment}
              onclick={() => onaudition(midiNote)}
            >
              <span class="text-xs text-muted-foreground"
                >Pad {selectedBank.id}{index + 1} · {midiNote}</span
              >
              <span class="truncate text-sm font-medium">{assignment ? assignment.label : "—"}</span>
            </button>
            {#if status}
              <Badge variant={status === "playable" ? "secondary" : "outline"}>{status}</Badge>
            {/if}
            <div class="flex min-w-0 items-center gap-1">
              <label class="sr-only" for={`assign-${midiNote}`}>Assign pad {midiNote}</label>
              <select
                id={`assign-${midiNote}`}
                class="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-xs"
                disabled={busy || selectedKit.samples.length === 0}
                value={assignment?.sampleId ?? ""}
                onchange={(event) =>
                  assignSampleToPad((event.currentTarget as HTMLSelectElement).value, midiNote)}
              >
                <option value="">—</option>
                {#each selectedKit.samples as sample (sample.id)}
                  <option value={sample.id}>{sample.displayName}</option>
                {/each}
              </select>
              {#if assignment}
                <button
                  type="button"
                  class="text-xs text-muted-foreground hover:text-destructive"
                  aria-label={`Clear pad ${midiNote}`}
                  disabled={busy}
                  onclick={() => clearPad(midiNote)}
                >
                  ✕
                </button>
              {/if}
            </div>
            {#if assignment && selectedKit.samples.length > 1}
              {@const hardLayer = assignment.velocityLayers?.[1]}
              <div class="grid gap-1">
                <label class="text-[0.7rem] text-muted-foreground" for={`hard-layer-${midiNote}`}>
                  Hard layer
                </label>
                <select
                  id={`hard-layer-${midiNote}`}
                  class="h-7 min-w-0 rounded border bg-background px-1 text-xs"
                  disabled={busy}
                  value={hardLayer?.sampleId ?? ""}
                  onchange={(event) =>
                    assignHardLayer(
                      assignment,
                      (event.currentTarget as HTMLSelectElement).value,
                      midiNote,
                    )}
                >
                  <option value="">None</option>
                  {#each selectedKit.samples.filter((sample) => sample.id !== assignment.sampleId) as sample (sample.id)}
                    <option value={sample.id}>{sample.displayName}</option>
                  {/each}
                </select>
                {#if hardLayer}
                  <p class="truncate text-[0.7rem] text-muted-foreground">
                    Hard layer: {hardLayer.label}
                  </p>
                {/if}
              </div>
            {/if}
            {#if assignment}
              <div class="grid gap-1">
                <label class="text-[0.7rem] text-muted-foreground" for={`choke-group-${midiNote}`}>
                  Choke group
                </label>
                <select
                  id={`choke-group-${midiNote}`}
                  class="h-7 min-w-0 rounded border bg-background px-1 text-xs"
                  disabled={busy}
                  value={assignment.chokeGroup?.toString() ?? ""}
                  onchange={(event) =>
                    assignChokeGroup(midiNote, (event.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="">None</option>
                  {#each Array.from({ length: 16 }, (_, group) => group + 1) as group}
                    <option value={group}>{group}</option>
                  {/each}
                </select>
                {#if assignment.chokeGroup}
                  <p class="truncate text-[0.7rem] text-muted-foreground">
                    Choke group {assignment.chokeGroup}
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      {#if unassigned.length > 0}
        <div class="grid gap-1">
          <p class="text-sm font-medium">Unassigned samples</p>
          <ul class="flex flex-wrap gap-2">
            {#each unassigned as sample (sample.id)}
              <li class="rounded border px-2 py-1 text-xs">{sample.displayName}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onclick={activate}>
          {busy ? "Working…" : "Activate kit"}
        </Button>
        {#if directoryExportAvailable}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onclick={() => run(() => ondirectoryexport(selectedKit!.id))}
          >
            Export to drive
          </Button>
        {/if}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onclick={() => run(() => onzipexport(selectedKit!.id))}
        >
          Download ZIP
        </Button>
      </div>
    {/if}

    <p class="text-sm text-muted-foreground" role="status">{error ?? message}</p>
  </Card.Content>
</Card.Root>
