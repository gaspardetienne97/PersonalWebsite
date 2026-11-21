<script lang="ts">
  import { authorName, byline, coverHue, formatLabel, markMatches, type NarratorDoc } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    doc,
    size = 120,
    radius = 14,
    playing = false,
    wide = false,
    query = "",
    progress,
  }: {
    doc: NarratorDoc;
    /** The width of an upright cover. For a wide one, its height. */
    size?: number;
    radius?: number;
    playing?: boolean;
    /** A library card's cover: as wide as the card, and the one place the title is written. */
    wide?: boolean;
    /** The library search, so the letters that matched are marked on a wide cover. */
    query?: string;
    /** Draws how far listening got along the bottom edge (0 to 1). Left out, no bar is drawn. */
    progress?: number;
  } = $props();

  // A thumbnail is too small for the title at a readable size: it carries the title's first
  // letter over the format, so two rows that start with the same letter still differ. The title
  // and author sit beside it in the row.
  const thumb = $derived(!wide && size < 90);
  const author = $derived(authorName(doc));
  const hue = $derived(coverHue(doc.title));

  // A wide cover has one size rule, by the title's length: two steps, at most three lines.
  const wideSize = $derived(doc.title.length <= 24 ? 22 : 18);

  // An upright cover sets the title at the largest size at which its widest word fits the
  // cover's width and the whole title fits the room above the author, so no word and no line
  // is cut.
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

{#snippet marked(text: string)}
  {#each markMatches(text, query) as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
{/snippet}

<!-- Generated cover art, no external images. Each takes one of six quiet hues from its title. -->
<div
  class="cover hue-{hue}"
  class:wide
  style:width={wide ? "100%" : `${size}px`}
  style:height="{wide ? size : size * 1.32}px"
  style:border-radius={wide ? `${radius}px ${radius}px 0 0` : `${radius}px`}
>
  {#if thumb}
    <div class="thumb" aria-hidden="true">
      <span class="initial" style:font-size="{size * 0.42}px">
        {[...doc.title.trim()][0]?.toUpperCase() ?? ""}
      </span>
      <span class="kind">{formatLabel(doc)}</span>
    </div>
  {:else if wide}
    <div class="inner wide-inner">
      <div class="kind">{formatLabel(doc)}</div>
      <div class="words">
        <div class="title wide-title" style:font-size="{wideSize}px">{@render marked(doc.title)}</div>
        {#if byline(doc)}
          <div class="author wide-author">{@render marked(byline(doc))}</div>
        {/if}
      </div>
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
  {#if progress !== undefined}
    <!-- Decoration: the words beside the cover say how much is left. -->
    <div class="track" aria-hidden="true"><div style:width="{Math.min(1, Math.max(0, progress)) * 100}%"></div></div>
  {/if}
  {#if playing}
    <div class="eq" style:top="{size * 0.1}px" style:right="{size * 0.1}px">
      <Equalizer color={doc.accent} size={size * 0.16} />
    </div>
  {/if}
</div>

<style>
  /* The six cover hues. ponytail: kept here, where they are drawn. Move them to narrator.css
     as --n-cover-* tokens if anything else ever needs a document's cover colour. */
  .hue-0 {
    --cover-hue: 216;
  }
  .hue-1 {
    --cover-hue: 268;
  }
  .hue-2 {
    --cover-hue: 338;
  }
  .hue-3 {
    --cover-hue: 14;
  }
  .hue-4 {
    --cover-hue: 152;
  }
  .hue-5 {
    --cover-hue: 46;
  }
  /* Dark enough everywhere that the title (--n-fg-0) passes 7:1 and the small text 4.5:1. */
  .cover {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    background:
      radial-gradient(120% 95% at 100% 0%, hsl(var(--cover-hue) 52% 36% / 0.6) 0%, transparent 62%),
      linear-gradient(160deg, hsl(var(--cover-hue) 40% 21%) 0%, hsl(var(--cover-hue) 46% 10%) 100%);
    border: 1px solid hsl(var(--cover-hue) 34% 46% / 0.45);
    box-shadow:
      var(--n-shadow-md),
      inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }
  /* A card's cover is the card's top: the card draws the edge and the shadow. */
  .cover.wide {
    border: none;
    border-bottom: 1px solid hsl(var(--cover-hue) 34% 46% / 0.35);
    box-shadow: none;
  }
  .inner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .wide-inner {
    padding: 12px 14px 14px;
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
  /* The format, said once per document, here. */
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
  /* At most three lines of about the same length. */
  .wide-title {
    line-height: 1.12;
    text-wrap: balance;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    /* Room for the descenders of the last line inside the clip. */
    padding-bottom: 0.08em;
  }
  .author {
    color: var(--n-fg-1);
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .wide-author {
    margin-top: 3px;
    font-size: 14px;
    line-height: 1.3;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  /* The letters a search matched: bright text on a filled mark, with an underline, so not by
     colour alone. The fill is the accent darkened until white on it passes 4.5:1. */
  mark {
    background: color-mix(in srgb, var(--n-accent-app, var(--n-brand-blue)) 72%, #000);
    color: var(--n-on-accent, #fff);
    border-radius: 3px;
    padding: 0 1px;
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
  }
  /* How far listening got. One colour for progress everywhere. */
  .track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.16);
  }
  .track div {
    height: 100%;
    background: var(--n-accent-app, var(--n-brand-blue));
  }
  .eq {
    position: absolute;
  }
</style>
