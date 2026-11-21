<!--
  The circuit board behind every site page. It is the board the intro grew when
  there was one, otherwise a fresh one grown from the same ring, kept for the
  session so it doesn't change between pages. It is drawn as a band at the top of
  each page: it hangs from the header's lower edge and runs down the margins for the
  first part of the screen, fading out before it reaches anything to read. On a
  screen wide enough to have real margins it also runs down them the whole way.
  The footer draws the same board along its own top edge (Footer.svelte).
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
    <!-- One board, drawn twice: once at the top of the page, where it scrolls away,
         and once fixed in the margins of a wide screen. -->
    <div class="backdrop band" aria-hidden="true" transition:fade={{ duration: 600 }}>
      <CircuitPaths board={site.board} />
    </div>
    <div class="backdrop strips" aria-hidden="true" transition:fade={{ duration: 600 }}>
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
    /* Where the page's content starts, measured from the screen's edge: the margin
       beside the 76rem column plus the column's own padding. Traces are gone half a
       rem before it, after fading over --soft. */
    --inner: calc(max(0px, (100% - 76rem) / 2) + clamp(1rem, 4vw, 3rem) - 0.5rem);
    --soft: 3rem;
    --margins: linear-gradient(
      90deg,
      #000 calc(var(--inner) - var(--soft)),
      transparent var(--inner),
      transparent calc(100% - var(--inner)),
      #000 calc(100% - var(--inner) + var(--soft))
    );
    /* The pastel traces need more strength on white than the bright ones on navy. */
    opacity: 0.85;
  }
  :global(.dark) :is(.strips, .band) {
    opacity: 0.8;
  }
  /* The band: the board hangs from the header (the first 4rem of the page sit under
     it) as a fringe across the whole width that is gone within 2rem, before any
     page's title, and it runs down the margins beside the content for the first
     45vh. Everything fades out, so no trace ends on a cut. It scrolls away with
     the page, and nothing is drawn behind or beside content below it. */
  .band {
    position: absolute;
    mask-image:
      linear-gradient(#000 calc(4rem + 12vh), transparent calc(4rem + 45vh)),
      var(--margins),
      linear-gradient(#000 4rem, transparent 6rem);
    /* Read bottom up: the fringe and the margins add, then the fade cuts both. The
       last layer's operator is spelled out, since a repeated "intersect" there
       leaves Chrome with an empty mask. */
    mask-composite: intersect, add, add;
  }
  /* Under 1200px the margin beside the content is too narrow to hold more than a
     stray pad, so the band is the fringe alone. */
  @media (width < 1200px) {
    .band {
      mask-image: linear-gradient(#000 4rem, transparent 6rem);
      mask-composite: add;
    }
  }
  /* From 1536px each margin is 160px or more: room for the board to run down the
     whole screen beside the page, with a soft inner edge. The band keeps its fringe. */
  .strips {
    display: none;
  }
  @media (width >= 1536px) {
    .strips {
      display: block;
      position: fixed;
      /* Further from the content than the band's short run, and a longer fade. */
      --inner: calc((100% - 76rem) / 2 + 1.5rem);
      --soft: 4rem;
      mask-image: var(--margins);
      /* Quieter than the band: it stays beside the page all the way down. */
      opacity: 0.55;
    }
    .band {
      mask-image: linear-gradient(#000 4rem, transparent 6rem);
      mask-composite: add;
    }
  }
</style>
