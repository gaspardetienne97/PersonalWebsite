<script lang="ts">
  import { authorName, formatLabel, type NarratorDoc } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    doc,
    size = 120,
    radius = 14,
    playing = false,
  }: { doc: NarratorDoc; size?: number; radius?: number; playing?: boolean } = $props();

  // A thumbnail is too small for the title at a readable size: it carries the title's first
  // letter over the format, so two rows that start with the same letter still differ. The title
  // and author sit beside it in the row.
  const thumb = $derived(size < 90);
  const author = $derived(authorName(doc));

  // The title is set at the largest size at which its widest word fits the cover's width and
  // the whole title fits the room above the author, so no word and no line is cut.
  // ponytail: widths are estimated from four letter classes of the bold serif (in em, taken at
  // about 22px, since Fraunces sets wider at small sizes), not measured. Measure in the page if
  // covers ever take another typeface.
  const emWidth = (word: string) =>
    [...word].reduce(
      (sum, c) =>
        sum + (/[mwMW—]/.test(c) ? 1.08 : /[A-Z0-9]/.test(c) ? 0.8 : /[fijlt.,:;'’!-]/.test(c) ? 0.4 : 0.62),
      0,
    );
  const titleSize = $derived.by(() => {
    const widths = doc.title
      .split(/\s+|(?<=-)/)
      .filter(Boolean)
      .map(emWidth);
    const width = size * 0.74;
    const height = size * (author ? 0.56 : 0.8);
    const lines = (font: number) => {
      const room = width / font;
      let count = 1;
      let used = 0;
      for (const w of widths) {
        if (used && used + 0.25 + w > room) {
          count++;
          used = w;
        } else used += (used ? 0.25 : 0) + w;
      }
      return count;
    };
    const smallest = Math.max(12, size * 0.09);
    for (let font = size * 0.2; font > smallest; font -= 0.5) {
      if (Math.max(...widths, 1) * font <= width && lines(font) * font * 1.08 <= height) return font;
    }
    return smallest;
  });
</script>

<!-- Generated cover art — no external images. -->
<div
  class="cover"
  style:width="{size}px"
  style:height="{size * 1.32}px"
  style:border-radius="{radius}px"
  style:background="radial-gradient(120% 90% at 100% 0%, {doc.accent}38 0%, transparent 55%), linear-gradient(160deg, #0E1530 0%, #060B1E 100%)"
>
  {#if thumb}
    <div class="thumb" aria-hidden="true">
      <span class="initial" style:font-size="{size * 0.42}px">
        {[...doc.title.trim()][0]?.toUpperCase() ?? ""}
      </span>
      <span class="kind">{formatLabel(doc)}</span>
    </div>
  {:else}
    <div class="inner" style:padding="{size * 0.12}px">
      <div class="kind" style:font-size="{Math.max(12, size * 0.085)}px">{formatLabel(doc)}</div>
      <div>
        <div class="title" style:font-size="{titleSize}px">{doc.title}</div>
        {#if author}
          <div class="author" style:margin-top="{size * 0.05}px" style:font-size="{Math.max(12, size * 0.075)}px">
            {author}
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <div class="stripe" style:background={doc.accent}></div>
  {#if playing}
    <div class="eq" style:top="{size * 0.1}px" style:right="{size * 0.1}px">
      <Equalizer color={doc.accent} size={size * 0.16} />
    </div>
  {/if}
</div>

<style>
  .cover {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid var(--n-border-2);
    box-shadow:
      var(--n-shadow-md),
      inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }
  .inner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .thumb {
    position: absolute;
    inset: 0 0 3px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .initial {
    font-family: var(--n-font-serif);
    font-weight: 800;
    line-height: 1;
    color: var(--n-fg-0);
  }
  /* The format, said once per document, here. Neutral, so it reads on every cover colour;
     the document's own colour stays in the glow and the stripe. */
  .kind {
    font-family: var(--n-font-sans);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--n-fg-1);
  }
  .title {
    font-family: var(--n-font-serif);
    font-weight: 800;
    line-height: 1.05;
    color: var(--n-fg-0);
    letter-spacing: -0.02em;
    overflow-wrap: break-word;
  }
  .author {
    color: var(--n-fg-2);
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .stripe {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 3px;
    opacity: 0.9;
  }
  .eq {
    position: absolute;
  }
</style>
