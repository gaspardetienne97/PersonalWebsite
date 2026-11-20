<script lang="ts">
  // Curated tunings plus the player's own, with a small form to add one
  // (validated by validateCustomTuning: custom. id, 6 or 4 strings, 1 to 36 frets).
  import { m } from "@repo/i18n/messages.js";
  import Choice from "#lib/music/components/Choice.svelte";
  import { btn } from "#lib/music/components/ui.ts";
  import { customTuningId, parseTuningNotes, tuningName, tuningNotes, type Fretted } from "./fretted";
  import { keyName } from "#lib/music/names.svelte.ts";
  import { tunings } from "./instrument.svelte";

  let { instrument, value, onchange }: { instrument: Fretted; value: string; onchange: (id: string) => void } = $props();

  let adding = $state(false);
  let name = $state("");
  let notes = $state("");
  let frets = $state(0);
  let problem = $state("");

  const options = $derived(tunings.for(instrument).map((t) => ({ value: t.id, label: t.source === "custom" ? m.music_strings_tuning_yours({ name: t.name }) : tuningName(t) })));
  const current = $derived(tunings.pick(value, instrument));
  const spelled = $derived(tuningNotes(current));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const open = parseTuningNotes(notes);
    if (typeof open === "string") return void (problem = open);
    const t = {
      id: customTuningId(name || notes),
      name: name.trim() || notes.trim(),
      instrument,
      openStrings: open,
      fretCount: frets || (instrument === "guitar" ? 22 : 15),
      notationTransposition: instrument === "guitar" ? -12 : 0,
      source: "custom" as const,
    };
    const err = await tunings.add(t);
    if (err) return void (problem = err);
    problem = "";
    adding = false;
    onchange(t.id);
  }
</script>

<div class="flex min-w-0 flex-col gap-2">
  <Choice label={m.music_strings_tuning_label()} select {options} value={current.id} onchange={onchange} />
  <p class="text-sm text-ws-soft">{m.music_strings_tuning_summary({ notes: spelled, frets: current.fretCount })}</p>
  <div class="flex flex-wrap gap-2">
    <button type="button" class={btn} aria-expanded={adding} onclick={() => (adding = !adding)}>{adding ? m.music_strings_cancel() : m.music_strings_tuning_add()}</button>
    {#if current.source === "custom"}
      <button type="button" class={btn} onclick={() => void tunings.remove(current.id).then(() => onchange(""))}>{m.music_strings_remove_name({ name: current.name })}</button>
    {/if}
  </div>
  {#if adding}
    <form class="grid gap-2 rounded-lg border border-ws-line p-3" onsubmit={save}>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">{m.music_strings_tuning_name()}</span>
        <input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={name} placeholder={m.music_strings_tuning_n_open({ note: keyName("D") })} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">{m.music_strings_tuning_open_strings({ count: instrument === "guitar" ? 6 : 4 })}</span>
        <input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" bind:value={notes} placeholder={instrument === "guitar" ? "D2 A2 D3 F#3 A3 D4" : "G4 C4 E4 A4"} required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">{m.music_strings_tuning_frets()}</span>
        <input class="min-h-11 w-28 rounded-lg border border-ws-line bg-ws-surface px-3" type="number" min="1" max="36" bind:value={frets} placeholder={instrument === "guitar" ? "22" : "15"} />
      </label>
      {#if problem}<p class="text-sm text-destructive" role="alert">{problem}</p>{/if}
      <button type="submit" class="{btn} justify-self-start">{m.music_strings_tuning_save()}</button>
    </form>
  {/if}
</div>
