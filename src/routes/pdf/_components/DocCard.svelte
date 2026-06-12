<script lang="ts">
  import Clock from "lucide-svelte/icons/clock";
  import Trash2 from "lucide-svelte/icons/trash-2";

  import { fmt, type NarrationModel, type NarratorDoc } from "@repo/pdf-core/domain";

  import Cover from "./Cover.svelte";
  import Pill from "./Pill.svelte";
  import ProgressRing from "./ProgressRing.svelte";

  let {
    doc,
    model,
    progress,
    onopen,
    onremove,
  }: {
    doc: NarratorDoc;
    model: NarrationModel;
    progress: number;
    onopen: (id: string) => void;
    onremove: (id: string) => void;
  } = $props();

  let hover = $state(false);
  let confirming = $state(false);
</script>

<!-- The whole card is a convenience click target; the title button carries the
     accessible/keyboard affordance so nested buttons keep their roles. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="card"
  class:hover
  onclick={() => !confirming && onopen(doc.id)}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => {
    hover = false;
    confirming = false;
  }}
>
  <div style="position: relative">
    <Cover {doc} size={150} radius={12} playing={hover && !confirming} />
    <button
      class="trash"
      class:visible={hover && !confirming}
      title="Remove from library"
      aria-label="Remove {doc.title} from library"
      onclick={(e) => {
        e.stopPropagation();
        confirming = true;
      }}
    >
      <Trash2 size={15} strokeWidth={1.5} />
    </button>
  </div>
  <div class="meta">
    <div class="title-row">
      <button class="title" onclick={() => onopen(doc.id)}>{doc.title}</button>
      {#if progress > 0}
        <ProgressRing value={progress} size={26} stroke={2.5} color={doc.accent} />
      {/if}
    </div>
    <div class="author">{doc.author}</div>
    <div class="foot">
      <Pill class="kind-pill">{doc.meta.split(" · ")[0]}</Pill>
      <span class="duration"><Clock size={11} strokeWidth={1.5} />{fmt(model.total)}</span>
    </div>
  </div>

  {#if confirming}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="confirm" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-icon"><Trash2 size={20} strokeWidth={1.5} /></div>
      <div class="confirm-title">Remove this document?</div>
      <div class="confirm-sub">It will leave your library.</div>
      <div class="confirm-actions">
        <button class="cancel" onclick={() => (confirming = false)}>Cancel</button>
        <button class="remove" onclick={() => onremove(doc.id)}>Remove</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px;
    border-radius: 14px;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
    box-shadow: var(--n-shadow-sm);
  }
  .card.hover {
    transform: translateY(-3px);
    background: var(--n-bg-2);
    box-shadow: var(--n-shadow-md);
    border-color: var(--n-border-2);
  }
  .trash {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: rgba(2, 6, 24, 0.66);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-1);
    cursor: pointer;
    transition: opacity 160ms var(--n-ease-out);
    opacity: 0;
  }
  .trash.visible,
  .trash:focus-visible {
    opacity: 1;
  }
  .trash:hover {
    color: var(--n-danger);
    border-color: var(--n-danger);
  }
  .meta {
    width: 100%;
    text-align: left;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .title {
    font-weight: 700;
    font-size: 15px;
    color: var(--n-fg-0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    min-width: 0;
  }
  .author {
    color: var(--n-fg-2);
    font-size: 13px;
    margin-top: 2px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .foot :global(.kind-pill) {
    font-size: 10px;
    padding: 3px 8px;
  }
  .duration {
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-3);
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .confirm {
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 18px;
    background: rgba(8, 12, 28, 0.86);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--n-border-2);
  }
  .confirm-icon {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: rgba(239, 68, 68, 0.14);
    color: var(--n-danger);
  }
  .confirm-title {
    font-weight: 700;
    font-size: 14px;
    text-align: center;
  }
  .confirm-sub {
    font-size: 12px;
    color: var(--n-fg-2);
    text-align: center;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .cancel,
  .remove {
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--n-font-sans);
  }
  .cancel {
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-1);
  }
  .remove {
    border: 1px solid transparent;
    background: var(--n-danger);
    color: #fff;
  }
</style>
