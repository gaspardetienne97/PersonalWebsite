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

  let textEl: HTMLDivElement | undefined = $state();

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

  const plain = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  // Many files open a chapter with its own heading as the first paragraph. Then that paragraph
  // is the heading, and the chapter's name is not printed a second time above it.
  const ownHeading = $derived(
    plain(
      paras[0]?.sentences
        .flatMap((s) => s.words)
        .map((w) => w.word)
        .join(" ") ?? "",
    ) === plain(chapterTitle),
  );

  // Where a line's box starts: a word's own box sits inside its line with the leading split
  // above and below it.
  const lineOf = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const height = parseFloat(getComputedStyle(el).lineHeight) || rect.height;
    return { top: rect.top - (height - rect.height) / 2, height };
  };

  // The sentence being read starts one whole line under the top edge, so the line before it (or
  // the space above its paragraph) is in view and nothing is cut by the top bar. A chapter's
  // heading stays in view while the word is still in the upper part of the screen. A sentence
  // longer than the screen is followed by its word, which is kept in the upper third. How it
  // gets there (smoothly or at once) is the scroll area's own scroll-behavior.
  function follow() {
    const sc = scrollEl;
    const word = sc?.querySelector<HTMLElement>('[data-active="1"]');
    const first = word?.closest(".sentence")?.querySelector<HTMLElement>(".word");
    if (!sc || !word || !first) return;
    const edge = sc.getBoundingClientRect().top - sc.scrollTop;
    const at = lineOf(word);
    const wordTop = at.top - edge;
    let top = 0;
    if (wordTop + at.height > sc.clientHeight * 0.7) {
      top = lineOf(first).top - edge - at.height;
      if (wordTop - top > sc.clientHeight * 0.55) top = wordTop - sc.clientHeight * 0.3;
    }
    sc.scrollTo({ top: Math.max(0, top) });
    trim();
  }

  // The reading area ends on whole lines: a line that the top or the bottom edge would cut
  // through its letters is hidden until all of it is in view. The scroll area's mask reads the
  // two lengths. Lines are found by the paragraph under each edge and its line height.
  function trim() {
    const sc = scrollEl;
    if (!sc) return;
    const box = sc.getBoundingClientRect();
    const x = (textEl?.getBoundingClientRect().left ?? box.left) + 24;
    const cut = (edge: number, fromTop: boolean) => {
      const probe = fromTop ? edge + 1 : edge - 1;
      const block = document
        .elementsFromPoint(x, probe)
        .find((el) => textEl?.contains(el) && el !== textEl)
        ?.closest<HTMLElement>("p, h2");
      if (!block) return 0;
      const rect = block.getBoundingClientRect();
      const height = parseFloat(getComputedStyle(block).lineHeight);
      if (!height) return 0;
      // How far the paragraph runs past the edge, and from there to its next line boundary.
      const past = fromTop ? edge - rect.top : rect.bottom - edge;
      return Math.max(0, Math.min(height, Math.ceil(past / height - 0.02) * height - past));
    };
    sc.style.setProperty("--n-cut-top", `${cut(box.top, true)}px`);
    sc.style.setProperty("--n-cut-bottom", `${cut(box.bottom, false)}px`);
  }

  $effect(() => {
    void activeWordIndex;
    void chapterIndex;
    void fontSize;
    void lineHeight;
    void font;
    follow();
  });
  // The reading area changes height when the settings sheet opens under it: stay on the word.
  // A scroll by hand moves the lines under the two edges.
  $effect(() => {
    const sc = scrollEl;
    if (!sc) return;
    const resized = new ResizeObserver(follow);
    resized.observe(sc);
    let frame = 0;
    const scrolled = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(trim);
    };
    sc.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      resized.disconnect();
      cancelAnimationFrame(frame);
      sc.removeEventListener("scroll", scrolled);
    };
  });
</script>

<div
  class="text"
  bind:this={textEl}
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
  style:font-size="{fontSize}px"
  style:line-height={lineHeight}
  style:--lh={lineHeight}
  style:--box={font === "serif" ? 1.23 : 1.26}
>
  {#if showTitle && !ownHeading}
    <h2 class="chapter-title">{chapterTitle}</h2>
  {/if}
  {#each paras as para, i (para.pi)}
    {@const heading = i === 0 && ownHeading}
    <!-- The paragraph being read carries a bar in the margin, its sentence a tint. -->
    <p
      class:chapter-title={heading}
      class:now={para.sentences.some((s) => s.si === activeSentence)}
      role={heading ? "heading" : undefined}
      aria-level={heading ? 2 : undefined}
    >
      {#each para.sentences as sentence (sentence.si)}
        <span class="sentence" class:read={sentence.si < activeSentence} class:current={sentence.si === activeSentence}>
          {#each sentence.words as { word, gi }, i (gi)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span
              class="word {highlight}"
              class:current={gi === activeWordIndex}
              class:short={word.replace(/[^\p{L}\p{N}]/gu, "").length < 3}
              class:one={word.replace(/[^\p{L}\p{N}]/gu, "").length === 1}
              class:read={sentence.si === activeSentence && gi < activeWordIndex}
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
  /* The chapter's name, once, in the reading face. */
  .chapter-title {
    font-size: 1.3em;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    margin: 0 0 0.9em;
  }
  h2.chapter-title {
    color: var(--n-fg-0);
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
    color: var(--n-fg-read);
  }
  /* One shape for the sentence being read: a light tint, since the bar in the margin and the
     word's own mark say where the voice is. The padding fills the space between its lines (the
     line height less the letters' own box, which --box gives for the reading face), and the
     fill is opaque so the lines' boxes meet without a seam. */
  .sentence.current {
    color: var(--n-fg-0);
    background: color-mix(in srgb, var(--n-accent) 9%, var(--n-bg-0));
    border-radius: 0.3em;
    padding: calc((var(--lh) - var(--box)) * 0.5em + 0.75px) 0.28em;
    margin: 0 -0.28em;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  .word {
    cursor: pointer;
  }
</style>
