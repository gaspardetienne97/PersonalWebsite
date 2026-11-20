<script lang="ts">
  // Per instrument: where input should come from and which on-screen surface
  // stands in. Scrolls inside its own box on a phone (the old one was 482 px).
  import { INSTRUMENTS, type InputSource, type Instrument, type PreferredSurface } from "@repo/music-core";
  import { defaultSurface } from "@repo/music-core/io/devices";
  import { INSTRUMENT_LABEL } from "#lib/music/bench.svelte.ts";
  import { INSTRUMENT_ICON } from "#lib/music/components/instrument-icons.ts";
  import { settings } from "#lib/music/runtime/index.ts";
  import Picker from "#lib/music/components/Picker.svelte";

  let { announce }: { announce: (text: string) => void } = $props();

  const SOURCES: { value: InputSource; label: string }[] = [
    { value: "midi", label: "MIDI" },
    { value: "audio", label: "Microphone" },
    { value: "onscreen", label: "On-screen" },
  ];
  const SURFACES: { value: PreferredSurface; label: string }[] = [
    { value: "keyboard", label: "Keyboard" },
    { value: "guitar", label: "Guitar neck" },
    { value: "ukulele", label: "Ukulele neck" },
    { value: "mpc", label: "Pads" },
  ];
  const defaultSource = (i: Instrument): InputSource => (i === "guitar" || i === "ukulele" || i === "voice" ? "audio" : "midi");

  function setSource(i: Instrument, v: InputSource) {
    void settings.update({ preferredSource: { ...settings.value.preferredSource, [i]: v } });
    announce(`${INSTRUMENT_LABEL[i]} prefers ${SOURCES.find((x) => x.value === v)?.label}.`);
  }
  function setSurface(i: Instrument, v: PreferredSurface) {
    void settings.update({ preferredSurface: { ...settings.value.preferredSurface, [i]: v } });
    announce(`${INSTRUMENT_LABEL[i]} falls back to the ${SURFACES.find((x) => x.value === v)?.label.toLowerCase()}.`);
  }
</script>

<div class="overflow-x-auto rounded-xl border border-ws-line" data-testid="routing">
  <table class="w-full min-w-[30rem] text-sm">
    <thead class="bg-ws-raised/60 text-left text-ws-soft">
      <tr>
        <th scope="col" class="px-3 py-2 font-medium">Instrument</th>
        <th scope="col" class="px-3 py-2 font-medium">Preferred source</th>
        <th scope="col" class="px-3 py-2 font-medium">On-screen surface</th>
      </tr>
    </thead>
    <tbody>
      {#each INSTRUMENTS as i (i)}
        {@const src = settings.value.preferredSource[i] ?? defaultSource(i)}
        {@const surf = settings.value.preferredSurface[i] ?? defaultSurface(i)}
        {@const Icon = INSTRUMENT_ICON[i]}
        <tr class="border-t border-ws-line" style:box-shadow="inset 4px 0 0 var(--hue-{i})">
          <th scope="row" class="px-3 py-2 text-left font-medium">
            <span class="flex items-center gap-2">
              <span class="grid size-7 shrink-0 place-items-center rounded-lg text-ws-stage" style:background="var(--hue-{i})" aria-hidden="true"><Icon class="size-4" /></span>
              {INSTRUMENT_LABEL[i]}
            </span>
          </th>
          <td class="px-3 py-1.5">
            <Picker label="{INSTRUMENT_LABEL[i]} preferred source" value={src} options={SOURCES} onchange={(v) => setSource(i, v as InputSource)} />
          </td>
          <td class="px-3 py-1.5">
            <Picker label="{INSTRUMENT_LABEL[i]} on-screen surface" value={surf} options={SURFACES} onchange={(v) => setSurface(i, v as PreferredSurface)} />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
