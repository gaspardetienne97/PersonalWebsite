<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import {
    MPC_BANKS,
    type MpcPadMidi,
    type SampleKit,
    type SampleKitStore,
  } from "@repo/music-core/engines/sample-kit";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { cn } from "@repo/ui/utils";

  import { padLayoutFor, padNumber } from "../../_components/pad-labels";
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
  let pressedMidi = $state<number>();
  let assigningSampleId = $state<string>();
  let dragOverMidi = $state<number>();
  let pressTimer: ReturnType<typeof setTimeout> | undefined;

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
  // Visual pad order, A01 bottom-left as on the hardware (MpcPadGrid convention):
  // ascending notes chunked into rows of 4, rows rendered highest-row-first.
  const displayMidiNotes = $derived(reorderForDisplay(selectedBank.midiNotes));

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

  function reorderForDisplay<T>(midiNotes: readonly T[]): T[] {
    const rows: T[][] = [];
    for (let i = 0; i < midiNotes.length; i += 4) rows.push(midiNotes.slice(i, i + 4) as T[]);
    return rows.reverse().flat();
  }

  /**
   * `A05`-style pad label: bank id plus the pad's hardware position, from the
   * same `padNumber` helper `MpcPadGrid.svelte` uses, so the two surfaces
   * can't silently disagree on which pad a note is.
   */
  function padLabelForMidi(midiNote: number): string {
    const bank = MPC_BANKS.find((candidate) => candidate.midiNotes.includes(midiNote as never));
    if (!bank) return "";
    const position = padNumber(midiNote, padLayoutFor(bank.midiNotes));
    return `${bank.id}${String(position).padStart(2, "0")}`;
  }

  function assignedPadLabel(sampleId: string): string | undefined {
    const assignment = selectedKit?.assignments.find((entry) => entry.sampleId === sampleId);
    return assignment ? padLabelForMidi(assignment.midiNote) : undefined;
  }

  function auditionPad(midiNote: MpcPadMidi): void {
    pressedMidi = midiNote;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressedMidi = undefined;
    }, 140);
    onaudition(midiNote);
  }

  function onSampleDragStart(event: DragEvent, sampleId: string): void {
    event.dataTransfer?.setData("text/plain", sampleId);
  }

  function onSampleDragEnd(): void {
    // Drag ended (dropped elsewhere, or cancelled): clear any drop highlight.
    dragOverMidi = undefined;
  }

  function onPadDragOver(event: DragEvent, midiNote: MpcPadMidi): void {
    event.preventDefault();
    dragOverMidi = midiNote;
  }

  function onPadDragLeave(midiNote: MpcPadMidi): void {
    if (dragOverMidi === midiNote) dragOverMidi = undefined;
  }

  function onPadDrop(event: DragEvent, midiNote: MpcPadMidi): void {
    event.preventDefault();
    dragOverMidi = undefined;
    const sampleId = event.dataTransfer?.getData("text/plain");
    if (sampleId) void assignSampleToPad(sampleId, midiNote);
  }

  function assignFromPicker(sampleId: string, value: string): void {
    assigningSampleId = undefined;
    if (value !== "") void assignSampleToPad(sampleId, Number(value) as MpcPadMidi);
  }

  /** Moves focus into a control right after it appears (the pad-choice picker). */
  function focusOnMount(node: HTMLElement): void {
    node.focus();
  }

  onDestroy(() => clearTimeout(pressTimer));
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
      {#if error}
        <p class="text-sm text-destructive" role="alert">{error}</p>
      {/if}
      {#if selectedKit.samples.length === 0}
        <p class="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          This kit has no samples yet, so the pad menus below are disabled. Import WAV, AIFF,
          FLAC, MP3 or OGG files above; each one lands on the next free pad.
        </p>
      {/if}

      {#if selectedKit.samples.length > 0}
        <div class="grid gap-2">
          <p class="text-sm font-medium">Samples</p>
          <div class="grid gap-2">
            {#each selectedKit.samples as sample (sample.id)}
              {@const padLabel = assignedPadLabel(sample.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto_auto]"
                role="group"
                aria-label={`${sample.displayName}, ${padLabel ? `on pad ${padLabel}` : "not on a pad yet"}. Drag to a pad, or use Assign to pad.`}
                draggable={!busy}
                ondragstart={(event) => onSampleDragStart(event, sample.id)}
                ondragend={onSampleDragEnd}
              >
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
                <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
                  <span>{padLabel ? `Pad ${padLabel}` : "Not on a pad yet"}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    class="min-h-11"
                    disabled={busy}
                    aria-label={`Assign sample ${sample.id} to a pad`}
                    onclick={() =>
                      (assigningSampleId = assigningSampleId === sample.id ? undefined : sample.id)}
                  >
                    Assign to pad…
                  </Button>
                  {#if assigningSampleId === sample.id}
                    <label class="sr-only" for={`assign-pad-for-${sample.id}`}>
                      Choose a pad for {sample.displayName}
                    </label>
                    <select
                      id={`assign-pad-for-${sample.id}`}
                      class="min-h-11 min-w-0 rounded border bg-background px-1 text-xs"
                      value=""
                      use:focusOnMount
                      onchange={(event) =>
                        assignFromPicker(
                          sample.id,
                          (event.currentTarget as HTMLSelectElement).value,
                        )}
                    >
                      <option value="" disabled>Choose a pad…</option>
                      {#each selectedBank.midiNotes as midiNote (midiNote)}
                        <option value={midiNote}>Pad {padLabelForMidi(midiNote)}</option>
                      {/each}
                    </select>
                  {/if}
                </div>
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
        {#each displayMidiNotes as midiNote (midiNote)}
          {@const assignment = selectedKit.assignments.find((a) => a.midiNote === midiNote)}
          {@const status = padStatus(midiNote)}
          {@const padLabel = padLabelForMidi(midiNote)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class={cn(
              "grid min-w-0 gap-1 rounded-md border p-2",
              dragOverMidi === midiNote && "ring-2 ring-inset ring-primary",
            )}
            role="group"
            aria-label={`Pad ${padLabel} drop target`}
            ondragover={(event) => onPadDragOver(event, midiNote)}
            ondragleave={() => onPadDragLeave(midiNote)}
            ondrop={(event) => onPadDrop(event, midiNote)}
          >
            <button
              type="button"
              class={cn(
                "grid min-w-0 gap-0.5 rounded-[7px] p-1 text-left transition-[background-color,box-shadow,transform] duration-75",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-practice-accent",
                pressedMidi !== midiNote &&
                  "border border-white/10 bg-linear-to-b from-[color-mix(in_oklab,var(--stage-2)_88%,white)] to-stage-2 text-stage-muted shadow-[inset_0_1px_0_oklch(1_0_0/10%),inset_0_-3px_0_oklch(0_0_0/35%),0_1px_2px_oklch(0_0_0/40%)] hover:from-[color-mix(in_oklab,var(--stage-2)_78%,white)]",
                pressedMidi === midiNote &&
                  "translate-y-px border border-practice-accent bg-practice-accent text-practice-accent-foreground shadow-[inset_0_2px_6px_oklch(0_0_0/25%),0_0_18px_color-mix(in_oklab,var(--practice-accent)_60%,transparent)]",
              )}
              aria-label={`Pad ${padLabel} · ${midiNote} · ${assignment ? assignment.label : "Empty"}`}
              disabled={busy || !assignment}
              onclick={() => auditionPad(midiNote)}
            >
              <span class="text-xs opacity-80">Pad {padLabel} · {midiNote}</span>
              <span class="truncate text-sm font-medium"
                >{assignment ? assignment.label : "Empty"}</span
              >
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
