<script lang="ts">
  // Per instrument: where input should come from and which on-screen surface
  // stands in. Scrolls inside its own box on a phone (the old one was 482 px).
  import { INSTRUMENTS, type InputSource, type Instrument, type PreferredSurface } from "@repo/music-core";
  import { defaultSurface } from "@repo/music-core/io/devices";
  import { INSTRUMENT_LABEL } from "$lib/music/bench.svelte";
  import { settings } from "$lib/music/runtime";

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
        <tr class="border-t border-ws-line">
          <th scope="row" class="px-3 py-2 text-left font-medium">{INSTRUMENT_LABEL[i]}</th>
          <td class="px-3 py-1.5">
            <select class="min-h-11 w-full rounded-lg border border-ws-line bg-ws-surface px-2" aria-label="{INSTRUMENT_LABEL[i]} preferred source" onchange={(e) => setSource(i, e.currentTarget.value as InputSource)}>
              {#each SOURCES as o (o.value)}<option value={o.value} selected={o.value === src}>{o.label}</option>{/each}
            </select>
          </td>
          <td class="px-3 py-1.5">
            <select class="min-h-11 w-full rounded-lg border border-ws-line bg-ws-surface px-2" aria-label="{INSTRUMENT_LABEL[i]} on-screen surface" onchange={(e) => setSurface(i, e.currentTarget.value as PreferredSurface)}>
              {#each SURFACES as o (o.value)}<option value={o.value} selected={o.value === surf}>{o.label}</option>{/each}
            </select>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
