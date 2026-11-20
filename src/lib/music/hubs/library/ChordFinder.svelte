<script lang="ts">
  // Every voicing of any chord on guitar or ukulele, generated (theory/voicings):
  // open position first, then up the neck, each marked open, barre or closed,
  // and whether it needs a barre to be playable at all. Hear it, or open it in
  // the Build drill at that position.
  import Play from "@lucide/svelte/icons/play";
  import { FLAT_NAMES } from "@repo/music-core";
  import { TUNINGS } from "@repo/music-core/data/index";
  import { chordName, chordVoicings, generatedChordId, QUALITY_NAMES, VOICING_QUALITIES } from "@repo/music-core/theory/voicings";
  import Choice from "#lib/music/components/Choice.svelte";
  import ChordDiagram from "#lib/music/components/ChordDiagram.svelte";
  import { chordId, positionsOn } from "#lib/music/drills/guitar/chords.ts";
  import { btn } from "#lib/music/components/ui.ts";
  import { audio, settings } from "#lib/music/runtime/index.ts";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();

  let instrument = $state<"guitar" | "ukulele">(settings.value.activeInstrument === "ukulele" ? "ukulele" : "guitar");
  let root = $state(0);
  let quality = $state("maj");
  let show = $state<"all" | "barre" | "no-barre">("all");

  const tuning = $derived(TUNINGS[instrument][0]);
  const q = $derived(VOICING_QUALITIES.find((x) => x.quality === quality) ?? VOICING_QUALITIES[0]);
  const name = $derived(chordName(root, q.suffix));
  const voicings = $derived(chordVoicings(tuning, root, q.intervals));
  const shown = $derived(voicings.map((v, i) => ({ v, i })).filter(({ v }) => (show === "barre" ? v.kind === "barre" : show === "no-barre" ? v.kind !== "barre" : true)));
  const id = $derived(generatedChordId(instrument, root, quality));

  async function hear(frets: (number | null)[]) {
    await audio.unlock();
    // Strummed low to high, as a pick would.
    const notes = frets
      .map((f, i) => (f === null ? null : tuning.openStrings[i] + f))
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b)
      .map((midi, k) => ({ midi, time: k * 0.035, duration: 1.6 }));
    audio.playSequence(notes);
    onstatus?.(`${name} on ${instrument}.`);
  }
  /** The Build drill on this exact voicing: the curated shape's position when it has one, else the generated list's. */
  function practise(frets: (number | null)[], i: number) {
    const target = chordId(instrument, { root, quality });
    const at = positionsOn(target, tuning).findIndex((p) => p.frets.join() === frets.join());
    return at >= 0 ? `/music/chords?mode=build&shape=${target}&position=${at}&instrument=${instrument}` : `/music/chords?mode=build&shape=${id}&position=${i}&instrument=${instrument}`;
  }
  const lowToHigh = (frets: (number | null)[]) => [...frets].reverse().map((f) => (f === null ? "x" : f)).join(" ");
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <Choice label="Instrument" options={[{ value: "guitar", label: "Guitar" }, { value: "ukulele", label: "Ukulele" }]} value={instrument} onchange={(v) => (instrument = v as "guitar" | "ukulele")} />
  <Choice label="Root" select options={FLAT_NAMES.map((n, p) => ({ value: p, label: n }))} value={root} onchange={(v) => (root = v)} />
  <Choice label="Quality" select options={VOICING_QUALITIES.map((x) => ({ value: x.quality, label: `${chordName(root, x.suffix)}, ${QUALITY_NAMES[x.quality] ?? x.quality}` }))} value={quality} onchange={(v) => (quality = v)} />
  <Choice
    label="Show"
    options={[
      { value: "all", label: "All" },
      { value: "no-barre", label: "No barre" },
      { value: "barre", label: "Barre" },
    ]}
    value={show}
    onchange={(v) => (show = v as typeof show)}
  />
</div>
<p class="mt-3 max-w-prose text-sm text-ws-soft">
  {voicings.length} voicing{voicings.length === 1 ? "" : "s"} of {name} on {instrument === "guitar" ? "guitar (standard tuning)" : "ukulele (high G)"}, open position first, then up the neck. Each sounds every note of the chord{instrument === "guitar" ? " with the root lowest" : ""}, fits under four fingers within four frets, and is marked when it needs a barre.
</p>
<ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Voicings of {name}" data-chord={id}>
  {#each shown as { v, i } (i)}
    <li class="flex flex-col gap-2 rounded-xl border border-ws-line bg-ws-surface p-3" data-voicing={lowToHigh(v.frets)}>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-sm font-semibold">{v.label}</span>
        <span class="text-xs text-ws-soft">{lowToHigh(v.frets)}</span>
      </div>
      <div class="mx-auto w-full max-w-32">
        <ChordDiagram frets={v.frets} fingers={v.fingers} barre={v.barre} label="{name}, {v.label}: {lowToHigh(v.frets)}, low string first" />
      </div>
      <p class="text-xs text-ws-soft">
        {v.needsBarre ? "Needs a barre: more notes than fingers." : v.kind === "barre" ? "Easier with a barre." : v.kind === "open" ? "Open strings ring." : "No barre needed."}{v.omitsFifth ? " The 5th is left out." : ""}
      </p>
      <div class="mt-auto flex flex-wrap gap-1.5">
        <button type="button" class="{btn} min-h-9 px-2.5 text-xs" onclick={() => hear(v.frets)}><Play class="size-3.5" aria-hidden="true" />Hear</button>
        <a class="{btn} min-h-9 px-2.5 text-xs" href={practise(v.frets, i)}>Practise</a>
      </div>
    </li>
  {:else}
    <li class="text-sm text-ws-soft">None of {name}'s voicings {show === "barre" ? "use" : "avoid"} a barre.</li>
  {/each}
</ul>
