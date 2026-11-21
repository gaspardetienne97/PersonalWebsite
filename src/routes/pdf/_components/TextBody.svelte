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
    font: ReadingFont;
    fontSize: number;
    lineHeight: number;
    onword: (index: number) => void;
    scrollEl?: HTMLElement | null;
    showTitle?: boolean;
  } = $props();

  type Sentence = { si: number; words: { word: string; gi: number }[] };

  // The current chapter as paragraphs of sentences of words, with global token indices.
  const paras = $derived.by(() => {
    const out: { pi: number; sentences: Sentence[] }[] = [];
    const chapter = model.chapters[chapterIndex];
    if (!chapter) return out;
    for (let gi = chapter.wordStart; gi <= chapter.wordEnd; gi++) {
      const t = model.tokens[gi];
      let para = out[out.length - 1];
      if (!para || para.pi !== t.pi) out.push((para = { pi: t.pi, sentences: [] }));
      let sentence = para.sentences[para.sentences.length - 1];
      if (!sentence || sentence.si !== t.si) para.sentences.push((sentence = { si: t.si, words: [] }));
      sentence.words.push({ word: t.word, gi });
    }
    return out;
  });

  // Keep the active word in the upper-middle of the scroll viewport. How it gets there
  // (smoothly or at once) is the scroll area's own scroll-behavior.
  function follow() {
    const sc = scrollEl;
    const el = sc?.querySelector<HTMLElement>('[data-active="1"]');
    if (!sc || !el) return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    sc.scrollTo({ top: top - sc.clientHeight * 0.4 });
  }
  $effect(() => {
    void activeWordIndex;
    void chapterIndex;
    void fontSize;
    void lineHeight;
    follow();
  });
  // The reading area changes height when the settings sheet opens under it: stay on the word.
  $effect(() => {
    if (!scrollEl) return;
    const resized = new ResizeObserver(follow);
    resized.observe(scrollEl);
    return () => resized.disconnect();
  });
</script>

<div
  class="text"
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
  style:font-size="{fontSize}px"
  style:line-height={lineHeight}
>
  {#if showTitle}
    <h2 class="chapter-title">{chapterTitle}</h2>
  {/if}
  {#each paras as para (para.pi)}
    <!-- The paragraph being read carries a bar in the margin, its sentence a tint. -->
    <p class:now={para.sentences.some((s) => s.si === activeSentence)}>
      {#each para.sentences as sentence (sentence.si)}
        <span class="sentence" class:read={sentence.si < activeSentence} class:current={sentence.si === activeSentence}>
          {#each sentence.words as { word, gi }, i (gi)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span
              class="word {highlight}"
              class:current={gi === activeWordIndex}
              data-active={gi === activeWordIndex ? "1" : "0"}
              onclick={() => onword(gi)}>{word}</span
            >{#if i < sentence.words.length - 1}{" "}{/if}
          {/each}
        </span>{" "}
      {/each}
    </p>
  {/each}
</div>

<style>
  .chapter-title {
    font-family: var(--n-font-mono);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 18px;
    color: var(--n-accent-text);
  }
  p {
    position: relative;
    margin: 0 0 1.1em;
  }
  p.now::before {
    content: "";
    position: absolute;
    left: -14px;
    top: 0.4em;
    bottom: 0.4em;
    width: 3px;
    border-radius: 2px;
    background: var(--n-accent);
  }
  .sentence {
    color: var(--n-fg-1);
    transition: color 200ms var(--n-ease-out);
  }
  .sentence.read {
    color: var(--n-fg-2);
  }
  .sentence.current {
    color: var(--n-fg-0);
    background: color-mix(in srgb, var(--n-accent) 16%, transparent);
    border-radius: 5px;
    padding: 0.14em 0.2em;
    margin: 0 -0.2em;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  .word {
    cursor: pointer;
  }
</style>
