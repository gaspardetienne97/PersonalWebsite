<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import type { Score } from "@repo/music-core/domain";
  import { notationView } from "@repo/music-core/engines/notation";

  import StaffNotation from "./StaffNotation.svelte";

  const trebleScore: Score = {
    id: "story-treble",
    origin: "generated",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 90 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "right-hand", name: "Right Hand", role: "melody" }],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "right-hand" },
      { midiNote: 62, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "right-hand" },
      { midiNote: 64, startBeat: 2, durationBeats: 1, velocity: 0.8, voiceId: "right-hand" },
      { midiNote: 65, startBeat: 3, durationBeats: 1, velocity: 0.8, voiceId: "right-hand" },
    ],
    chords: [],
    sections: [],
    markers: [],
  };
  const grandStaffScore: Score = {
    ...trebleScore,
    id: "story-grand-staff",
    voices: [
      { id: "right-hand", name: "Right Hand", role: "melody" },
      { id: "left-hand", name: "Left Hand", role: "bass" },
    ],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "right-hand" },
      { midiNote: 64, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "right-hand" },
      { midiNote: 48, startBeat: 0, durationBeats: 1, velocity: 0.7, voiceId: "left-hand" },
      { midiNote: 62, startBeat: 1, durationBeats: 0.5, velocity: 0.8, voiceId: "right-hand" },
      { midiNote: 50, startBeat: 1, durationBeats: 0.5, velocity: 0.7, voiceId: "left-hand" },
    ],
  };

  const { Story } = defineMeta({
    title: "Music/Reading/StaffNotation",
    component: StaffNotation,
  });
</script>

<Story name="Single Treble Flashcard" args={{ view: notationView(trebleScore) }} />

<Story
  name="Piano Grand Staff Active Group"
  args={{
    view: notationView(grandStaffScore),
    activeEventIds: ["note:right-hand:0:1", "note:left-hand:0:1"],
  }}
/>
