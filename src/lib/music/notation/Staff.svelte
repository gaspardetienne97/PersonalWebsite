<script lang="ts">
  import type { Score } from "@repo/music-core";
  import type { BeatRange } from "./groups";
  import { drawStaff } from "./engrave";
  import NotationFrame, { type FrameProps } from "./NotationFrame.svelte";

  let {
    score,
    voiceIds,
    range,
    revealLabels = false,
    grand = false,
    fill = false,
    time = true,
    oneRow = false,
    selection = $bindable(null),
    ...rest
  }: FrameProps & {
    score: Score;
    voiceIds?: string[] | null;
    /** Draw only the bars this range touches. Group indices follow `scoreGroups(score, voiceIds, range)`. */
    range?: BeatRange | null;
    /** Note names under the notes (off by default: the staff is the prompt). */
    revealLabels?: boolean;
    /** Always treble and bass, split at middle C. */
    grand?: boolean;
    /** Spread a short line across the whole width, or centre it. */
    fill?: boolean | "center";
    /** Draw the time signature (off for a lone flashcard). */
    time?: boolean;
    /** Every bar on one system: the frame scrolls it, the cursor kept near the middle. */
    oneRow?: boolean;
  } = $props();
</script>

<NotationFrame
  {...rest}
  bind:selection
  label="Staff notation, {score.title}"
  scoreBpm={score.bpm}
  draw={(VF, host, width) => drawStaff(VF, host, { score, voiceIds, range, width, revealLabels, grand, fill, time, oneRow })}
  fallback={(reason) => `The staff can't draw this score: ${reason}. Falling notes shows every note.`}
/>
