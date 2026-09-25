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
    selection = $bindable(null),
    ...rest
  }: FrameProps & {
    score: Score;
    voiceIds?: string[] | null;
    /** Draw only the bars this range touches. Group indices follow `scoreGroups(score, voiceIds, range)`. */
    range?: BeatRange | null;
    /** Note names under the notes (off by default: the staff is the prompt). */
    revealLabels?: boolean;
  } = $props();
</script>

<NotationFrame
  {...rest}
  bind:selection
  label="Staff notation, {score.title}"
  scoreBpm={score.bpm}
  draw={(VF, host, width) => drawStaff(VF, host, { score, voiceIds, range, width, revealLabels })}
  fallback={(reason) => `The staff can't draw this score: ${reason}. Waterfall shows every note.`}
/>
