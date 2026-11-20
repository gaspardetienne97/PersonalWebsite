<script lang="ts">
  // A chord as root and quality: the common five qualities as buttons, the rest
  // a tap away. The value is a shape id: the curated shape when one sounds this
  // chord, else a generated one ("gen.guitar.11.m7").
  import { m } from "@repo/i18n/messages.js";
  import Choice from "#lib/music/components/Choice.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import { chordId, chordLabel, chordRef, COMMON_QUALITIES, qualityLabel, rootName, SHELL_QUALITIES, type ChordRef } from "./chords";
  import type { Fretted } from "./fretted";
  import { chord, keyName } from "#lib/music/names.svelte.ts";

  let { label, instrument, value, onchange, setupKey }: { label: string; instrument: Fretted; value: string; onchange: (id: string) => void; setupKey?: string } = $props();

  const GROUPS: [string, string[]][] = [
    [m.music_strings_chordpicker_group_triads(), ["maj", "m", "dim", "aug", "sus2", "sus4", "5"]],
    [m.music_strings_chordpicker_group_sevenths(), ["6", "m6", "maj7", "m7", "7", "7sus4", "m7b5", "dim7"]],
    [m.music_strings_chordpicker_group_added(), ["add9", "9", "maj9", "m9"]],
  ];
  const ref = $derived(chordRef(value) ?? { root: 0, quality: "maj" });
  const common = $derived(COMMON_QUALITIES.includes(ref.quality));
  let more = $state(false);
  const set = (c: ChordRef) => onchange(chordId(instrument, c));
  /** Guitar 7th chords can be played as shells (root, 3rd and 7th). */
  const shellable = $derived(instrument === "guitar" && SHELL_QUALITIES.includes(ref.quality));
  const options = (qs: string[]) => qs.map((q) => ({ value: q, label: qualityLabel(q) }));
</script>

<div class="flex min-w-0 flex-col gap-2 sm:col-span-2" role="group" aria-label={label} data-setup={setupKey}>
  <p class="text-sm font-medium">{label}: <span class="font-display text-base font-semibold">{chord(chordLabel(ref))}</span></p>
  <div class="grid items-start gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
    <div class="flex min-w-0 flex-col gap-1 text-sm">
      <span class="font-medium">{m.music_strings_chordpicker_root()}</span>
      <KeyPicker label={m.music_strings_chordpicker_root_label({ label })} value={ref.root} name={(pc) => keyName(rootName(pc, ref.quality))} onchange={(root) => set({ ...ref, root })} />
    </div>
    <div class="flex min-w-0 flex-col gap-2">
      {#if more || !common}
        {#each GROUPS as [group, qs] (group)}
          <Choice label={group} options={options(qs)} value={ref.quality} onchange={(quality) => set({ ...ref, quality })} />
        {/each}
      {:else}
        <Choice label={m.music_strings_chordpicker_quality()} options={options(COMMON_QUALITIES)} value={ref.quality} onchange={(quality) => set({ ...ref, quality })} />
      {/if}
      {#if shellable}
        <Choice
          label={m.music_strings_chordpicker_voicing()}
          options={[
            { value: "full", label: m.music_strings_chordpicker_full() },
            { value: "shell", label: m.music_strings_chordpicker_shell(), hint: m.music_strings_chordpicker_shell_hint() },
          ]}
          value={ref.shell ? "shell" : "full"}
          onchange={(v) => set({ ...ref, shell: v === "shell" })}
        />
      {/if}
      {#if more || common}
        <button type="button" class="self-start text-sm font-medium text-instr-ink underline underline-offset-4" aria-expanded={more} onclick={() => (more = !more)}>{more ? m.music_strings_chordpicker_fewer() : m.music_strings_chordpicker_more()}</button>
      {/if}
    </div>
  </div>
</div>
