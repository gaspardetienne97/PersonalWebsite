<script lang="ts">
  import { onMount } from "svelte";

  import type { StringVoicing } from "@repo/music-core/engines/library";

  let { voicing }: { voicing: StringVoicing } = $props();
  let container: HTMLDivElement | undefined = $state();
  let chart: import("svguitar").SVGuitarChord | undefined;

  onMount(() => {
    let cancelled = false;

    void import("svguitar").then(({ SVGuitarChord }) => {
      if (cancelled || !container?.isConnected) return;
      chart = new SVGuitarChord(container);
      draw(voicing);
    });

    return () => {
      cancelled = true;
      chart?.remove();
      chart = undefined;
    };
  });

  $effect(() => {
    draw(voicing);
  });

  function draw(currentVoicing: StringVoicing): void {
    if (!chart) return;

    chart
      .configure({
        strings: currentVoicing.strings,
        tuning: currentVoicing.tuning,
        color: "currentColor",
        backgroundColor: "none",
        svgTitle: `${currentVoicing.instrument} ${currentVoicing.label} chord diagram`,
      })
      .chord({
        title: currentVoicing.label,
        position: currentVoicing.position,
        fingers: currentVoicing.fingers.map(([string, fret, label]) =>
          label === undefined ? [string, fret] : [string, fret, label],
        ),
        barres: currentVoicing.barres?.map((barre) => ({ ...barre })) ?? [],
      })
      .draw();
  }
</script>

<div
  bind:this={container}
  class="mx-auto w-full max-w-56 text-foreground [&_svg]:h-auto [&_svg]:w-full"
  data-instrument={voicing.instrument}
  aria-label={`${voicing.instrument} chord diagram`}
></div>
