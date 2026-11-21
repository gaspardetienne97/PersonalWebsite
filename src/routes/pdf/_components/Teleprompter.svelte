<script lang="ts">
  import { chapterHeading, type NarrationModel } from "@repo/pdf-core/domain";
  import type { HighlightStyle, ReadingFont } from "@repo/pdf-core/stores/settings";

  let {
    model,
    activeSentence,
    activeWordIndex,
    highlight,
    font,
    scale = 1,
    chapterTitle = "",
  }: {
    model: NarrationModel;
    activeSentence: number;
    activeWordIndex: number;
    highlight: HighlightStyle;
    font: ReadingFont;
    /** Follows the reader's text size setting. */
    scale?: number;
    /** The chapter's name, shown above the lines as their title. */
    chapterTitle?: string;
  } = $props();

  let el: HTMLDivElement | undefined = $state();

  const wordsOf = (span: { wordStart: number; wordEnd: number }) => {
    const words = [];
    for (let i = span.wordStart; i <= span.wordEnd; i++) words.push({ word: model.tokens[i].word, gi: i });
    return words;
  };
  // What is on the stage. The chapter's name is its title, above the lines. Many files open a
  // chapter with that name as their first paragraph: then the paragraph is the title, never the
  // sentence in focus. While it is spoken the title carries the word mark, and the first
  // sentence of the text is already in focus under it, so every document opens the same way.
  const stage = $derived.by(() => {
    const at = model.sentences.findIndex((s) => s.si === activeSentence);
    const active = model.sentences[at];
    if (!active) return { title: null, lines: [] };
    const heading = chapterHeading(model, active.ci);
    const inHeading = (s: { wordStart: number }) => heading !== null && s.wordStart <= heading.wordEnd;

    const spoken = inHeading(active);
    const focusAt = spoken ? model.sentences.findIndex((s) => s.ci === active.ci && !inHeading(s)) : at;
    const focus = model.sentences[focusAt];
    // A long sentence leaves room for one coming sentence only.
    const long = focus.end - focus.start > 12_000;
    const lines = (long ? [focusAt - 1, focusAt, focusAt + 1] : [focusAt - 1, focusAt, focusAt + 1, focusAt + 2])
      .map((i) => model.sentences[i])
      .filter((s) => s && s.ci === active.ci && !inHeading(s))
      .map((s) => ({
        si: s.si,
        words: wordsOf(s),
        kind: s.si === focus.si ? "current" : s.si < focus.si ? "before" : "after",
        // The word mark is drawn on the sentence being spoken, which is not always the one in focus.
        marked: s.si === activeSentence,
      }));
    const title = heading
      ? { words: wordsOf(heading), marked: spoken }
      : chapterTitle !== ""
        ? { words: [{ word: chapterTitle, gi: -1 }], marked: false }
        : null;
    return { title, lines };
  });

  // A sentence taller than the stage: keep its current word in sight.
  $effect(() => {
    void activeWordIndex;
    const word = el?.querySelector<HTMLElement>(".word.current");
    if (!el || !word) return;
    const top = word.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (top < el.scrollTop || top + word.offsetHeight > el.scrollTop + el.clientHeight - 48) {
      el.scrollTop = Math.max(0, top - el.clientHeight * 0.4);
    }
  });

  // The coming sentences end on a whole line, clear of the stage's foot: one that would run
  // into it keeps the lines that fit and ends in an ellipsis, or is left out.
  const FOOT = 44;
  function fit() {
    if (!el) return;
    // A line keeps its element when it moves from coming to in focus: clear every line first.
    for (const p of el.querySelectorAll<HTMLElement>("p")) {
      p.style.removeProperty("--lines");
      delete p.dataset.out;
    }
    const coming = [...el.querySelectorAll<HTMLElement>("p.after")];
    const before = el.querySelector<HTMLElement>("p.before");
    const foot = el.getBoundingClientRect().bottom - FOOT;
    let cut = false;
    for (const p of coming) {
      const rect = p.getBoundingClientRect();
      if (!cut && rect.bottom <= foot) continue;
      // Shorter lines give the spare room back above them too, so they move down a little.
      const lines = cut ? 0 : Math.floor((foot - FOOT - rect.top) / parseFloat(getComputedStyle(p).lineHeight));
      cut = true;
      if (lines > 0) p.style.setProperty("--lines", String(lines));
      else p.dataset.out = "";
    }
    // The sentence in focus comes first: when it still does not end above the foot (measured
    // once the coming lines are settled, since they change the room above it), the sentence
    // before it gives up its two lines.
    const current = el.querySelector<HTMLElement>("p.current");
    if (before && current && current.getBoundingClientRect().bottom > foot) before.dataset.out = "";
  }
  $effect(() => {
    void stage;
    void scale;
    void font;
    fit();
  });
  $effect(() => {
    if (!el) return;
    const resized = new ResizeObserver(fit);
    resized.observe(el);
    return () => resized.disconnect();
  });
</script>

<!-- A word of the sentence being spoken. One or two letters get a wider pill (see narrator.css). -->
{#snippet spoken(word: string, gi: number)}
  <span
    class="word {highlight}"
    class:current={gi === activeWordIndex}
    class:short={word.replace(/[^\p{L}\p{N}]/gu, "").length < 3}
    class:one={word.replace(/[^\p{L}\p{N}]/gu, "").length === 1}
    class:read={gi < activeWordIndex}>{word}</span
  >
{/snippet}

<!-- A line that has just become the one in focus grows into its size: fit the rest again then. -->
<div
  class="prompter"
  bind:this={el}
  ontransitionend={(e) => {
    if (e.propertyName === "font-size") fit();
  }}
  style:--n-scale={scale}
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
>
  {#if stage.title}
    <h2 class="chapter">
      {#each stage.title.words as { word, gi } (gi)}
        {#if stage.title.marked}
          {@render spoken(word, gi)}{" "}
        {:else}
          {word}{" "}
        {/if}
      {/each}
    </h2>
  {/if}
  {#each stage.lines as line (line.si)}
    <p class={line.kind}>
      <span class="inner">
        {#each line.words as { word, gi } (gi)}
          {#if line.marked}
            {@render spoken(word, gi)}{" "}
          {:else}
            {word}{" "}
          {/if}
        {/each}
      </span>
    </p>
  {/each}
</div>

<style>
  .prompter {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 14px 8px 0;
    overflow: hidden;
    /* A soft edge at the top for a sentence taller than the stage, and a clean fade at the foot. */
    mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 44px), transparent);
  }
  /* The lines sit in the upper third when they fit: one part of the spare room above them, two
     below. When they do not fit they start at the top and lose their end, never their start. */
  .prompter::before,
  .prompter::after {
    content: "";
  }
  .prompter::before {
    flex: 1 1 0;
  }
  .prompter::after {
    flex: 2 1 0;
  }
  /* A wide screen has more spare room: the lines sit in its upper middle. */
  @media (min-width: 900px) {
    .prompter::before {
      flex: 3 1 0;
    }
    .prompter::after {
      flex: 4 1 0;
    }
  }
  p + p {
    margin-top: 22px;
  }
  /* The chapter's name, straight above its lines. It carries the word mark while it is spoken. */
  .chapter {
    margin: 0 0 16px;
    flex-shrink: 0;
    font-family: var(--n-font-sans);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--n-fg-1);
  }
  p {
    margin: 0;
    flex-shrink: 0;
    font-size: calc(clamp(17px, 2vw, 22px) * var(--n-scale));
    line-height: 1.35;
    font-weight: 500;
    color: var(--n-fg-2);
    transition:
      font-size 320ms var(--n-ease-out),
      color 320ms var(--n-ease-out);
    letter-spacing: -0.01em;
  }
  p.before {
    color: var(--n-fg-read);
  }
  .inner {
    display: block;
  }
  p.after .inner {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--lines, none);
    line-clamp: var(--lines, none);
    overflow: hidden;
  }
  .prompter p:global([data-out]) {
    display: none;
  }
  /* The sentence just read keeps its last two lines. */
  p.before {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    max-height: 2.7em;
    overflow: hidden;
  }
  /* The sentence in focus: one size for a screen's width, whatever the sentence's length. One
     too long for the stage scrolls inside it (see the effect above) and is never set smaller. */
  p.current {
    font-size: calc(clamp(24px, 2.7vw, 34px) * var(--n-scale));
    font-weight: 600;
    color: var(--n-fg-0);
  }
</style>
