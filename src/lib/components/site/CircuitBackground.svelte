<!--
  The circuit board behind every site page. It is the board the intro grew when
  there was one, otherwise a fresh one grown from the same ring, kept for the
  session so it doesn't change between pages. It sits faintly behind the content
  and comes through more strongly in the side margins.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import CircuitPaths from "./CircuitPaths.svelte";
  import { growSiteBoard, randomSeed, site } from "./intro.svelte";

  const SEED_KEY = "gm.board.seed";

  /** Where the intro's logo sits for a viewport, matching its layout closely enough. */
  const ringFor = (width: number, height: number) => {
    const logo = Math.min(56 * 16, width * 0.88);
    return { cx: width / 2, cy: height * 0.4, r: 435 * (logo / 2100) + 6 };
  };

  function sessionSeed() {
    try {
      const stored = Number(sessionStorage.getItem(SEED_KEY));
      if (stored) return stored;
      const seed = randomSeed();
      sessionStorage.setItem(SEED_KEY, String(seed));
      return seed;
    } catch {
      return randomSeed();
    }
  }

  function regrow() {
    const width = innerWidth;
    const height = innerHeight;
    if (site.board && Math.abs(site.board.width - width) < 2 && Math.abs(site.board.height - height) < 2)
      return;
    const ring = ringFor(width, height);
    site.seed ||= sessionSeed();
    site.ring = ring;
    site.board = growSiteBoard(width, height, ring, site.seed);
  }

  onMount(() => {
    if (!site.board) regrow();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onresize = () => {
      clearTimeout(pending);
      pending = setTimeout(regrow, 200);
    };
    addEventListener("resize", onresize);
    return () => {
      removeEventListener("resize", onresize);
      clearTimeout(pending);
    };
  });
</script>

{#if site.board}
  {#key site.board}
    <div class="backdrop" aria-hidden="true" transition:fade={{ duration: 600 }}>
      <CircuitPaths board={site.board} />
    </div>
  {/key}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: 0.38;
    /* Faint behind the reading column, stronger in the margins. */
    mask-image: linear-gradient(
      90deg,
      #000 0%,
      rgb(0 0 0 / 0.35) 24%,
      rgb(0 0 0 / 0.2) 50%,
      rgb(0 0 0 / 0.35) 76%,
      #000 100%
    );
  }
  :global(.dark) .backdrop {
    opacity: 0.40;
  }
</style>
