<script lang="ts">
  import type { InstrumentId } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { curatedTunings } from "@repo/music-core/engines/tunings";

  import FretboardInput from "../learn/reading/_components/FretboardInput.svelte";
  import PianoKeyboard from "../learn/theory/_components/PianoKeyboard.svelte";
  import AerophoneFingering from "./AerophoneFingering.svelte";
  import PracticeStage from "./PracticeStage.svelte";

  let {
    midi,
    instrument,
    router,
  }: {
    /** The pitch set to display (a chord voicing, scale, or arpeggio). */
    midi: number[];
    instrument: InstrumentId;
    /** Required for fretted instruments so taps can sound the note. */
    router?: InputRouter;
  } = $props();

  // Aerophone is monophonic: render the pitches as an ascending arpeggio mapped
  // into the instrument's range, one fingering diagram per note.
  const AEROPHONE_LOW = 58;
  const arpeggio = $derived(
    [...new Set(midi.map((m) => ((m % 12) + 12) % 12))]
      .map((pc) => AEROPHONE_LOW + ((((pc - AEROPHONE_LOW) % 12) + 12) % 12))
      .sort((a, b) => a - b),
  );

  const noteNames = $derived(midi.map((m) => midiToNote(m, true)));
  const tuning = $derived(
    instrument === "guitar" || instrument === "ukulele"
      ? curatedTunings(instrument)[0]
      : undefined,
  );
</script>

<PracticeStage {instrument} class="overflow-x-auto p-4">
  {#if (instrument === "guitar" || instrument === "ukulele") && tuning && router}
    <FretboardInput {tuning} {router} targetMidiNotes={midi} visibleFrets={12} />
  {:else if instrument === "aerophone"}
    <div class="flex flex-wrap items-end gap-3" role="group" aria-label="Aerophone arpeggio">
      {#each arpeggio as note, index (`${note}-${index}`)}
        <AerophoneFingering midi={note} size={88} />
      {/each}
    </div>
  {:else}
    <!-- Piano (and any pitched fallback). -->
    <PianoKeyboard notes={noteNames} />
  {/if}
</PracticeStage>
