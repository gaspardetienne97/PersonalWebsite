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
  }: {
    model: NarrationModel;
    activeSentence: number;
    activeWordIndex: number;
    highlight: HighlightStyle;
    font: ReadingFont;
    /** Follows the reader's text size setting. */
    scale?: number;
  } = $props();

  let el: HTMLDivElement | undefined = $state();

  // The current sentence with one before and two after, all from its own chapter: a chapter
  // opens on its first sentence, right under the chapter's name.
  const lines = $derived.by(() => {
    const at = model.sentences.findIndex((s) => s.si === activeSentence);
    const current = model.sentences[at];
    if (!current) return [];
    return [at - 1, at, at + 1, at + 2]
      .map((i) => model.sentences[i])
      .filter((s) => s && s.ci === current.ci)
      .map((s) => {
        const words = [];
        let chars = 0;
        for (let i = s.wordStart; i <= s.wordEnd; i++) {
          words.push({ word: model.tokens[i].word, gi: i });
          chars += model.tokens[i].word.length + 1;
        }
        const kind = s.si === activeSentence ? "current" : s.si < activeSentence ? "before" : "after";
        // A long sentence steps its size down so its first line stays on the stage.
        const size = chars > 260 ? "s" : chars > 140 ? "m" : "l";
        return { si: s.si, words, kind, size };
      });
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
</script>

<div
  class="prompter"
  bind:this={el}
  style:--n-scale={scale}
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
>
  {#each lines as line (line.si)}
    <p class="{line.kind} {line.size}">
      <span class="inner">
        {#each line.words as { word, gi } (gi)}
          {#if line.kind === "current"}
            <span class="word {highlight}" class:current={gi === activeWordIndex}>{word}</span>{" "}
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
    gap: 22px;
    /* Centred when it fits. When it does not, it starts at the top and loses its end, never its start. */
    justify-content: safe center;
    height: 100%;
    padding: 0 8px;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent);
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
</style>
