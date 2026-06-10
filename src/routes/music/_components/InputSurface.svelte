<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { curatedTunings } from "@repo/music-core/engines/tunings";

  import FretboardInput from "../learn/reading/_components/FretboardInput.svelte";
  import MpcPadGrid from "./MpcPadGrid.svelte";
  import OnScreenKeyboard from "./OnScreenKeyboard.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  type Surface = "keyboard" | "guitar" | "ukulele" | "mpc";

  let {
    router,
    surface = $bindable("keyboard"),
    onAccepted,
  }: {
    router: InputRouter;
    surface?: Surface;
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
    onChange={(value) => (surface = value as Surface)}
  />

  {#if surface === "keyboard"}
    <OnScreenKeyboard {router} instrument="piano" {onAccepted} />
  {:else if surface === "guitar" && guitarTuning}
    <FretboardInput {router} tuning={guitarTuning} {onAccepted} />
  {:else if surface === "ukulele" && ukuleleTuning}
    <FretboardInput {router} tuning={ukuleleTuning} {onAccepted} />
  {:else if surface === "mpc"}
    <MpcPadGrid {router} {onAccepted} />
  {/if}
</div>
