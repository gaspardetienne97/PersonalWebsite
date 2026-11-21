<!--
  The circuit board behind every site page. It is the board the intro grew when
  there was one, otherwise a fresh one grown from the same ring, kept for the
  session so it doesn't change between pages. It runs at full strength in the side
  margins and shows faintly across the top of each page, then leaves the content alone.
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
    <!-- One board, drawn twice: fixed in the margins beside the page column, and once
         at the top of the page inside it, where it fades out and scrolls away. -->
    <div class="backdrop strips" aria-hidden="true" transition:fade={{ duration: 600 }}>
      <CircuitPaths board={site.board} />
    </div>
    <div class="backdrop band" aria-hidden="true" transition:fade={{ duration: 600 }}>
      <CircuitPaths board={site.board} />
    </div>
  {/key}
{/if}

<style>
  .strips,
  .band {
    inset: 0 0 auto;
    z-index: -1;
    height: 100lvh;
    pointer-events: none;
    opacity: 0.38;
  }
  :global(.dark) :is(.strips, .band) {
    opacity: 0.42;
  }
  /* At full strength in the margins beside the 76rem page column. It runs a little
     way into the column's own gutter (3rem of padding, where nothing is drawn) and
     is gone a rem before the content starts, so no trace sits behind content. */
  .strips {
    position: fixed;
    --edge: 38rem - 1rem;
    --stop: 38rem - 2.25rem;
    mask-image: linear-gradient(
      90deg,
      #000 calc(50% - (var(--edge))),
      transparent calc(50% - (var(--stop))),
      transparent calc(50% + (var(--stop))),
      #000 calc(50% + (var(--edge)))
    );
  }
  /* Inside the column the board shows under the header only: faint at the top of the
     page, gone before the first tabs, tiles or running text, and it scrolls away
     with the page. Text in the band still clears it (.gm-clear in site.css). */
  .band {
    position: absolute;
    mask-image:
      linear-gradient(rgb(0 0 0 / 0.45) 4rem, transparent min(45vh, 13rem)),
      linear-gradient(
        90deg,
        transparent calc(50% - (var(--edge))),
        #000 calc(50% - (var(--stop))),
        #000 calc(50% + (var(--stop))),
        transparent calc(50% + (var(--edge)))
      );
    mask-composite: intersect;
    --edge: 38rem - 1rem;
    --stop: 38rem - 2.25rem;
  }
  /* Under 1200px the column's gutter narrows and then the margins go, so the strips
     go too and the band alone carries the board, a little stronger and deeper. */
  @media (width < 1200px) {
    .strips {
      display: none;
    }
    .band {
      mask-image: linear-gradient(rgb(0 0 0 / 0.6) 4rem, transparent 45vh);
    }
  }
</style>
