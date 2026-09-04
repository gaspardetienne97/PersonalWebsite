<script lang="ts">
  import { earTrainingDrillBySlug } from "@repo/music-core/engines/ear-training";
  import type { ComponentProps } from "svelte";

  import EarTrainingDrillRoute from "../_components/EarTrainingDrillRoute.svelte";

  const definition = earTrainingDrillBySlug("intervals")!;
  let rest: Omit<ComponentProps<typeof EarTrainingDrillRoute>, "definition"> = $props();
</script>

<EarTrainingDrillRoute {definition} {...rest} />
