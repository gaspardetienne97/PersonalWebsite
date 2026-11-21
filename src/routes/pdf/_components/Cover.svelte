<script lang="ts">
  import { authorName, formatLabel, type NarratorDoc } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    doc,
    size = 120,
    radius = 14,
    playing = false,
  }: { doc: NarratorDoc; size?: number; radius?: number; playing?: boolean } = $props();

  // A thumbnail is too small for words at a readable size: it carries the title's first letter,
  // and the title, author and format sit beside it in the row.
  const thumb = $derived(size < 90);
  const author = $derived(authorName(doc));

  // The title is set as large as its widest word allows, so no word is cut at the cover's edge.
  // ponytail: a word's width is estimated from four letter classes of the bold serif (in em,
  // taken at about 22px, since Fraunces sets wider at small sizes), not measured. A word too
  // wide even at the smallest size wraps (overflow-wrap) instead of being clipped. Measure in
  // the page if covers ever take another typeface.
  const emWidth = (word: string) =>
    [...word].reduce(
      (sum, c) =>
        sum + (/[mwMW—]/.test(c) ? 1.08 : /[A-Z0-9]/.test(c) ? 0.8 : /[fijlt.,:;'’!-]/.test(c) ? 0.4 : 0.62),
      0,
    );
  const titleSize = $derived.by(() => {
    const widest = Math.max(...doc.title.split(/\s+|(?<=-)/).map(emWidth), 1);
    return Math.max(12, size * 0.11, Math.min(size * 0.2, (size * 0.74) / widest));
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
    <div class="initial" style:font-size="{size * 0.5}px" aria-hidden="true">
      {[...doc.title.trim()][0]?.toUpperCase() ?? ""}
    </div>
  {:else}
    <div class="inner" style:padding="{size * 0.12}px">
      <div class="kind" style:font-size="{Math.max(12, size * 0.085)}px" style:color={doc.accent}>
        {formatLabel(doc)}
      </div>
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
  .initial {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--n-font-serif);
    font-weight: 800;
    line-height: 1;
    color: var(--n-fg-0);
  }
  .kind {
    font-family: var(--n-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.95;
    font-weight: 600;
  }
  .title {
    font-family: var(--n-font-serif);
    font-weight: 800;
    line-height: 1.05;
    color: var(--n-fg-0);
    letter-spacing: -0.02em;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
