<script lang="ts">
  import type { NarrationModel } from "@repo/pdf-core/domain";
  import type { HighlightStyle, ReadingFont } from "@repo/pdf-core/stores/settings";

  let {
    model,
    activeSentence,
    activeWordIndex,
    accent,
    highlight,
    font,
  }: {
    model: NarrationModel;
    activeSentence: number;
    activeWordIndex: number;
    accent: string;
    highlight: HighlightStyle;
    font: ReadingFont;
  } = $props();

  // Current sentence plus one before and two after, for prompter context.
  const lines = $derived.by(() => {
    const sIdx = model.sentences.findIndex((s) => s.si === activeSentence);
    return [sIdx - 1, sIdx, sIdx + 1, sIdx + 2]
      .map((i) => model.sentences[i])
      .filter(Boolean)
      .map((s) => {
        const words = [];
        for (let i = s.wordStart; i <= s.wordEnd; i++) {
          words.push({ word: model.tokens[i].word, gi: i });
        }
        return { si: s.si, words, current: s.si === activeSentence };
      });
  });
</script>

<div
  class="prompter"
  style:--n-accent={accent}
  style:font-family={font === "serif" ? "var(--n-font-serif)" : "var(--n-font-sans)"}
>
  {#each lines as line (line.si)}
    <p class:current={line.current}>
      {#each line.words as { word, gi } (gi)}
        {#if line.current}
          <span class="word {highlight}" class:current={gi === activeWordIndex}>{word}{" "}</span>
        {:else}
          <span>{word}{" "}</span>
        {/if}
      {/each}
    </p>
  {/each}
</div>

<style>
  .prompter {
    display: flex;
    flex-direction: column;
    gap: 26px;
    justify-content: center;
    height: 100%;
    padding: 0 8px;
  }
  p {
    margin: 0;
    font-size: clamp(17px, 2vw, 22px);
    line-height: 1.35;
    font-weight: 500;
    color: var(--n-fg-3);
    opacity: 0.6;
    transition: all 320ms var(--n-ease-out);
    letter-spacing: -0.01em;
  }
  p.current {
    font-size: clamp(26px, 3.4vw, 40px);
    font-weight: 600;
    color: var(--n-fg-0);
    opacity: 1;
  }
  .word {
    transition:
      color 120ms var(--n-ease-out),
      background 120ms;
    border-radius: 4px;
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
