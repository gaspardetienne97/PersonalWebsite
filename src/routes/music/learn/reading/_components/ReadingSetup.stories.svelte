<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { fn } from "storybook/test";

  import { curatedTunings } from "@repo/music-core/engines/tunings";

  import ReadingSetup, { type ReadingSetupValue } from "./ReadingSetup.svelte";

  const piano: ReadingSetupValue = {
    activity: "flashcards",
    instrument: "piano",
    clefs: ["treble"],
    keySignature: "C major",
    range: { lowestMidi: 48, highestMidi: 84 },
    difficulty: 0.4,
    promptKind: "single-note",
    answerMode: "choice",
    mode: "wait",
    bpm: 90,
    strictness: "normal",
    meter: "simple",
    measures: 2,
  };
  const guitar: ReadingSetupValue = {
    ...piano,
    activity: "sight-reading",
    instrument: "guitar",
    tuningId: "guitar.standard",
    clefs: ["treble"],
    answerMode: "play",
    mode: "performance",
    bpm: 120,
    strictness: "strict",
    meter: "compound",
  };
  const customUkulele = {
    ...curatedTunings("ukulele")[0]!,
    id: "custom.ukulele.story",
    name: "Story Low G",
    source: "custom" as const,
  };

  const { Story } = defineMeta({
    title: "Music/Reading/ReadingSetup",
    component: ReadingSetup,
    args: {
      ready: true,
      pending: false,
      status: "Ready.",
      onChange: fn(),
      onStart: fn(),
      onSaveTuning: fn(),
      onDeleteTuning: fn(),
    },
  });
</script>

<Story name="Single Treble Flashcard" args={{ value: piano, tunings: [] }} />

<Story
  name="Desktop Sight Reading"
  args={{ value: guitar, tunings: curatedTunings("guitar") }}
/>

<Story
  name="Custom Tuning Editor Validation"
  args={{
    value: { ...guitar, instrument: "ukulele", tuningId: customUkulele.id },
    tunings: [...curatedTunings("ukulele"), customUkulele],
  }}
/>
