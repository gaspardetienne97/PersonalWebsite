<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import { InputRouter } from "@repo/music-core/engines/input-router";
  import { curatedTunings } from "@repo/music-core/engines/tunings";

  import FretboardInput from "./FretboardInput.svelte";

  const router = new InputRouter({ now: () => 0 });
  const guitar = curatedTunings("guitar")[0]!;
  const ukulele = curatedTunings("ukulele")[0]!;

  const { Story } = defineMeta({
    title: "Music/Reading/FretboardInput",
    component: FretboardInput,
  });
</script>

<Story
  name="Guitar Targets"
  args={{
    tuning: guitar,
    router,
    targetMidiNotes: [40, 45, 52],
    activeMidiNotes: [45],
    visibleFrets: 5,
  }}
/>

<Story
  name="Ukulele Targets"
  args={{
    tuning: ukulele,
    router,
    targetMidiNotes: [60, 64, 67],
    wrongMidiNotes: [66],
    visibleFrets: 7,
  }}
/>
