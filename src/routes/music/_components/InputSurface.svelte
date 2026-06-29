<script lang="ts">
  import type { InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import type { InputSurfaceId } from "@repo/music-core/engines/device-profiles";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { curatedTunings } from "@repo/music-core/engines/tunings";

  import FretboardInput from "../learn/reading/_components/FretboardInput.svelte";
  import MpcPadGrid from "./MpcPadGrid.svelte";
  import OnScreenKeyboard from "./OnScreenKeyboard.svelte";
  import PracticeStage from "./PracticeStage.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  let {
    router,
    surface = $bindable("keyboard"),
    instrument = "piano",
    notes,
    onAccepted,
  }: {
    router: InputRouter;
    surface?: InputSurfaceId;
    instrument?: InstrumentId;
    notes?: string[];
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  const SURFACES = [
    { value: "keyboard", label: "Keyboard" },
    { value: "guitar", label: "Guitar" },
    { value: "ukulele", label: "Ukulele" },
    { value: "mpc", label: "MPC" },
  ];

  const guitarTuning = curatedTunings("guitar")[0];
  const ukuleleTuning = curatedTunings("ukulele")[0];
</script>

<div class="grid gap-3">
  <SegmentedControl
    size="sm"
    options={SURFACES}
    value={surface}
    onChange={(value) => (surface = value as InputSurfaceId)}
  />

  <PracticeStage {instrument} class="overflow-x-auto p-4">
    {#if surface === "keyboard"}
      <OnScreenKeyboard {router} {instrument} {notes} {onAccepted} />
    {:else if surface === "guitar" && guitarTuning}
      <FretboardInput {router} tuning={guitarTuning} {onAccepted} />
    {:else if surface === "ukulele" && ukuleleTuning}
      <FretboardInput {router} tuning={ukuleleTuning} {onAccepted} />
    {:else if surface === "mpc"}
      <MpcPadGrid {router} {onAccepted} />
    {/if}
  </PracticeStage>
</div>
