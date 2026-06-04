<script lang="ts">
  import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";
  import {
    curatedTunings,
    validateTuning,
    type StringInstrumentId,
    type TuningProfile,
    type TuningValidation,
  } from "@repo/music-core/engines/tunings";
  import { Button } from "@repo/ui/button";
  import * as Dialog from "@repo/ui/dialog";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";

  let {
    instrument,
    profile,
    onSave = () => undefined,
    onDelete = () => undefined,
  }: {
    instrument: StringInstrumentId;
    profile?: TuningProfile;
    onSave?: (profile: TuningProfile) => void;
    onDelete?: (id: string) => void;
  } = $props();

  let name = $state("");
  let fretCount = $state(1);
  let stringNotes = $state<string[]>([]);
  let validation = $state<TuningValidation>({ valid: true, errors: {} });

  $effect(() => {
    const defaults = profile ?? curatedTunings(instrument)[0]!;
    name = defaults.name;
    fretCount = defaults.fretCount;
    stringNotes = defaults.openStrings.map((midi) => midiToNote(midi));
    validation = { valid: true, errors: {} };
  });

  function save(): void {
    let openStrings: number[];
    try {
      openStrings = stringNotes.map(noteToMidi);
    } catch {
      validation = {
        valid: false,
        errors: { openStrings: "Every string needs a valid note with octave." },
      };
      return;
    }

    const next: TuningProfile = {
      id: profile?.source === "custom" ? profile.id : customId(instrument, name),
      name,
      instrument,
      openStrings,
      fretCount: Number(fretCount),
      notationTransposition: instrument === "guitar" ? -12 : 0,
      source: "custom",
    };
    validation = validateTuning(next);
    if (validation.valid) onSave(next);
  }

  function updateString(index: number, value: string): void {
    stringNotes[index] = value;
    stringNotes = [...stringNotes];
  }

  function customId(value: StringInstrumentId, label: string): string {
    const slug = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `custom.${value}.${slug || "tuning"}`;
  }
</script>

<Dialog.Root>
  <Dialog.Trigger>
    <Button type="button" variant="outline">
      {profile ? `Edit ${profile.name}` : "New custom tuning"}
    </Button>
  </Dialog.Trigger>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>{profile ? `Edit ${profile.name}` : `New ${instrument} tuning`}</Dialog.Title>
      <Dialog.Description>
        Strings use conventional numbering with string 1 first.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-4">
      <div class="grid gap-2">
        <Label for="tuning-name">Name</Label>
        <Input id="tuning-name" aria-label="Tuning name" bind:value={name} />
        {#if validation.errors.name}
          <p class="text-sm text-destructive">{validation.errors.name}</p>
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="tuning-frets">Frets</Label>
        <Input
          id="tuning-frets"
          aria-label="Fret count"
          type="number"
          min="1"
          max="36"
          bind:value={fretCount}
        />
        {#if validation.errors.fretCount}
          <p class="text-sm text-destructive">{validation.errors.fretCount}</p>
        {/if}
      </div>

      <fieldset class="grid gap-3">
        <legend class="text-sm font-medium">Open strings</legend>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each stringNotes as note, index}
            <div class="grid gap-1">
              <Label for={`tuning-string-${index}`}>String {index + 1}</Label>
              <Input
                id={`tuning-string-${index}`}
                aria-label={`String ${index + 1} note`}
                value={note}
                oninput={(event) => updateString(index, event.currentTarget.value)}
              />
            </div>
          {/each}
        </div>
        {#if validation.errors.openStrings}
          <p class="text-sm text-destructive">{validation.errors.openStrings}</p>
        {/if}
      </fieldset>
    </div>

    <Dialog.Footer class="gap-2 sm:justify-between">
      {#if profile?.source === "custom"}
        <Button
          type="button"
          variant="destructive"
          data-testid="delete-tuning"
          onclick={() => onDelete(profile.id)}
        >
          Delete tuning
        </Button>
      {/if}
      <Button type="button" data-testid="save-tuning" onclick={save}>Save tuning</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
