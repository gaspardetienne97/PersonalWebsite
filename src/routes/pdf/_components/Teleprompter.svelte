<script lang="ts">
  import type { NarrationModel } from "@repo/pdf-core/domain";
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
    /** Shown above the lines, unless one of them is the chapter's own heading. */
    chapterTitle?: string;
  } = $props();

  let el: HTMLDivElement | undefined = $state();

  const charsOf = (s: { wordStart: number; wordEnd: number }) => {
    let chars = 0;
    for (let i = s.wordStart; i <= s.wordEnd; i++) chars += model.tokens[i].word.length + 1;
    return chars;
  };

  // The current sentence with one before and one or two after, all from its own chapter: a
  // chapter opens on its first sentence, right under the chapter's name.
  const lines = $derived.by(() => {
    const at = model.sentences.findIndex((s) => s.si === activeSentence);
    const current = model.sentences[at];
    if (!current) return [];
    const chars = charsOf(current);
    // A long sentence steps its size down so it stays on the stage, and leaves room for one
    // coming sentence only.
    const size = chars > 420 ? "xs" : chars > 260 ? "s" : chars > 140 ? "m" : "l";
    return (size === "l" ? [at - 1, at, at + 1, at + 2] : [at - 1, at, at + 1])
      .map((i) => model.sentences[i])
      .filter((s) => s && s.ci === current.ci)
      .map((s) => {
        const words = [];
        for (let i = s.wordStart; i <= s.wordEnd; i++) words.push({ word: model.tokens[i].word, gi: i });
        const kind = s.si === activeSentence ? "current" : s.si < activeSentence ? "before" : "after";
        return { si: s.si, words, kind, size };
      });
  });

  const plain = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  // The chapter's name shows once: not above its own heading while that heading is on the stage.
  const showChapter = $derived(
    chapterTitle !== "" &&
      !lines.some((line) => plain(line.words.map((w) => w.word).join(" ")) === plain(chapterTitle)),
  );

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
</script>

<div
  class="prompter"
  bind:this={el}
  style:--n-scale={scale}
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
>
  {#if showChapter}
    <h2 class="chapter">{chapterTitle}</h2>
  {/if}
  {#each lines as line (line.si)}
    <p class="{line.kind} {line.size}">
      <span class="inner">
        {#each line.words as { word, gi } (gi)}
          {#if line.kind === "current"}
            <span class="word {highlight}" class:current={gi === activeWordIndex} class:read={gi < activeWordIndex}
              >{word}</span
            >{" "}
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
  p + p {
    margin-top: 22px;
  }
  /* The chapter's name, straight above its lines. */
  .chapter {
    margin: 0 0 14px;
    flex-shrink: 0;
    font-family: var(--n-font-sans);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--n-fg-2);
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
  /* The sentence just read keeps its last two lines. */
  p.before {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    max-height: 2.7em;
    overflow: hidden;
  }
  p.current {
    font-weight: 600;
    color: var(--n-fg-0);
  }
  p.current.l {
    font-size: calc(clamp(26px, 3.4vw, 40px) * var(--n-scale));
  }
  p.current.m {
    font-size: calc(clamp(22px, 2.8vw, 32px) * var(--n-scale));
  }
  p.current.s {
    font-size: calc(clamp(19px, 2.2vw, 26px) * var(--n-scale));
  }
  p.current.xs {
    font-size: calc(clamp(17px, 1.8vw, 21px) * var(--n-scale));
  }
</style>
