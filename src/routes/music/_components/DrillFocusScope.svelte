<script lang="ts">
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";

  // Marks a drill run as the screen's focus. While `active`, the music layout
  // hides the sidebar/topbar and the site header/footer so the stage owns the
  // viewport (the floating practice controls stay — drills use them mid-run). Renders
  // nothing; the flag clears automatically when the run ends or the page
  // unmounts mid-run.
  let {
    active = false,
    runtime = useMusicRuntime(),
  }: {
    active?: boolean;
    runtime?: MusicRuntime;
  } = $props();

  $effect(() => {
    runtime.drillFocus = active;
    return () => {
      runtime.drillFocus = false;
    };
  });
</script>
