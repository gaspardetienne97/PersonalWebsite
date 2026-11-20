<script lang="ts">
  import type { NarratorDoc } from "@repo/pdf-core/domain";

  import Equalizer from "./Equalizer.svelte";

  let {
    doc,
    size = 120,
    radius = 14,
    playing = false,
  }: { doc: NarratorDoc; size?: number; radius?: number; playing?: boolean } = $props();

  const kindLabel = $derived(
    ({ epub: "EPUB", pdf: "PDF", txt: "TXT", paste: "TEXT" as const })[doc.kind] ?? "DOC",
  );
</script>

<!-- Generated cover art — no external images. -->
<div
  class="cover"
  style:width="{size}px"
  style:height="{size * 1.32}px"
  style:border-radius="{radius}px"
  style:background="radial-gradient(120% 90% at 100% 0%, {doc.accent}38 0%, transparent 55%), linear-gradient(160deg, #0E1530 0%, #060B1E 100%)"
>
  <div class="inner" style:padding="{size * 0.12}px">
    <div class="kind" style:font-size="{Math.max(8, size * 0.085)}px" style:color={doc.accent}>
      {kindLabel}
    </div>
    <div>
      <div class="title" style:font-size="{size * 0.2}px">{doc.title}</div>
      <div class="author" style:margin-top="{size * 0.05}px" style:font-size="{Math.max(8, size * 0.075)}px">
        {doc.author}
      </div>
    </div>
  </div>
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
  .kind {
    font-family: var(--n-font-mono);
    letter-spacing: 0.12em;
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
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .author {
    color: var(--n-fg-2);
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
