<script lang="ts">
  import type { NarrationModel } from "@repo/pdf-core/domain";
  import type { HighlightStyle, ReadingFont } from "@repo/pdf-core/stores/settings";

  let {
    model,
    chapterIndex,
    chapterTitle,
    activeWordIndex,
    activeSentence,
    highlight,
    accent,
    font,
    fontSize,
    lineHeight,
    onword,
    scrollEl,
    showTitle = true,
  }: {
    model: NarrationModel;
    chapterIndex: number;
    chapterTitle: string;
    activeWordIndex: number;
    activeSentence: number;
    highlight: HighlightStyle;
    accent: string;
    font: ReadingFont;
    fontSize: number;
    lineHeight: number;
    onword: (index: number) => void;
    scrollEl?: HTMLElement | null;
    showTitle?: boolean;
  } = $props();

  // Words of the current chapter grouped by paragraph, with global token indices.
  const paras = $derived.by(() => {
    const map = new Map<number, { word: string; si: number; gi: number }[]>();
    model.tokens.forEach((t, gi) => {
      if (t.ci !== chapterIndex) return;
      let list = map.get(t.pi);
      if (!list) {
        list = [];
        map.set(t.pi, list);
      }
      list.push({ word: t.word, si: t.si, gi });
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, words]) => words);
  });

  // Keep the active word in the upper-middle of the scroll viewport.
  $effect(() => {
    void activeWordIndex;
    void chapterIndex;
    const sc = scrollEl;
    if (!sc) return;
    const el = sc.querySelector<HTMLElement>('[data-active="1"]');
    if (!el) return;
    sc.scrollTo({ top: el.offsetTop - sc.clientHeight * 0.4, behavior: "smooth" });
  });
</script>

<div
  class="text"
  style:--n-accent={accent}
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
  style:font-size="{fontSize}px"
  style:line-height={lineHeight}
>
  {#if showTitle}
    <div class="chapter-title" style:color={accent}>{chapterTitle}</div>
  {/if}
  {#each paras as words, pi (pi)}
    <p>
      {#each words as { word, si, gi } (gi)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span
          class="word {highlight}"
          class:read={gi < activeWordIndex}
          class:in-sentence={si === activeSentence}
          class:current={gi === activeWordIndex}
          data-active={gi === activeWordIndex ? "1" : "0"}
          onclick={() => onword(gi)}>{word}{" "}</span
        >
      {/each}
    </p>
  {/each}
</div>

<style>
  .chapter-title {
    font-family: var(--n-font-mono);
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }
  p {
    margin: 0 0 1.1em;
    color: inherit;
  }
  .word {
    transition:
      color 120ms var(--n-ease-out),
      background 120ms;
    border-radius: 4px;
    cursor: pointer;
    scroll-margin-top: 120px;
    color: var(--n-fg-3);
  }
  .word.read {
    color: var(--n-fg-1);
  }
  .word.in-sentence {
    color: var(--n-fg-0);
  }
  .word.current.underline {
    color: var(--n-fg-0);
    box-shadow: inset 0 -0.34em 0 color-mix(in srgb, var(--n-accent) 45%, transparent);
    font-weight: 500;
  }
  .word.current.fill {
    background: var(--n-accent);
    color: #fff;
    padding: 2px 5px;
    margin: 0 -2px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--n-accent) 40%, transparent);
    font-weight: 500;
  }
  .word.current.glow {
    color: var(--n-accent);
    text-shadow:
      0 0 20px color-mix(in srgb, var(--n-accent) 90%, transparent),
      0 0 6px color-mix(in srgb, var(--n-accent) 60%, transparent);
    font-weight: 600;
  }
</style>
