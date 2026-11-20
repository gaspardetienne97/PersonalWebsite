<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Check from "@lucide/svelte/icons/check";
  import FileText from "@lucide/svelte/icons/file-text";
  import Mic from "@lucide/svelte/icons/mic";
  import Quote from "@lucide/svelte/icons/quote";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Type from "@lucide/svelte/icons/type";
  import X from "@lucide/svelte/icons/x";

  import { m } from "@repo/i18n/messages.js";
  import type { DocKind, NarratorDoc } from "@repo/pdf-core/domain";
  import {
    ACCEPT_BY_KIND,
    extractFile,
    extractPaste,
    kindForFile,
    type ExtractStage,
  } from "@repo/pdf-core/services/extract";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import Btn from "./Btn.svelte";
  import Equalizer from "./Equalizer.svelte";

  let { onclose, oncreate }: { onclose: () => void; oncreate: (doc: NarratorDoc) => void } = $props();

  // `drop` and `choose` label the file picker; the paste tab shows a text box instead.
  const TABS = [
    {
      id: "pdf",
      label: "PDF",
      icon: FileText,
      hint: m.narrator_add_hint_pdf(),
      drop: m.narrator_add_drop_pdf(),
      choose: m.narrator_add_choose_pdf(),
    },
    {
      id: "epub",
      label: "EPUB",
      icon: BookOpen,
      hint: m.narrator_add_hint_epub(),
      drop: m.narrator_add_drop_epub(),
      choose: m.narrator_add_choose_epub(),
    },
    {
      id: "txt",
      label: m.narrator_add_tab_txt(),
      icon: Type,
      hint: m.narrator_add_hint_txt(),
      drop: m.narrator_add_drop_txt(),
      choose: m.narrator_add_choose_txt(),
    },
    {
      id: "paste",
      label: m.narrator_kind_paste(),
      icon: Quote,
      hint: m.narrator_add_hint_paste(),
      drop: m.narrator_add_drop_txt(),
      choose: m.narrator_add_choose_txt(),
    },
  ] as const;

  const STAGES: { k: ExtractStage; label: string; sub: string }[] = [
    { k: "read", label: m.narrator_add_stage_read(), sub: m.narrator_add_stage_read_sub() },
    { k: "extract", label: m.narrator_add_stage_extract(), sub: m.narrator_add_stage_extract_sub() },
    { k: "clean", label: m.narrator_add_stage_clean(), sub: m.narrator_add_stage_clean_sub() },
    { k: "chapters", label: m.narrator_add_stage_chapters(), sub: m.narrator_add_stage_chapters_sub() },
    { k: "narration", label: m.narrator_add_stage_narration(), sub: m.narrator_add_stage_narration_sub() },
  ];

  let tab = $state<DocKind>("pdf");
  let voice = $state<string | undefined>(undefined);
  let text = $state("");
  let drag = $state(false);
  let busy = $state(false);
  let stageIndex = $state(0);
  let fileName = $state("");
  let error = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  const activeTab = $derived(TABS.find((t) => t.id === tab) ?? TABS[0]);
  const voiceChoices = $derived(voiceCatalog.shortList(5));
  const selectedVoice = $derived(voice ?? voiceCatalog.defaultName);

  async function handleFile(file: File) {
    if (busy) return;
    if (!kindForFile(file)) {
      error = m.narrator_add_unsupported({ name: file.name });
      return;
    }
    error = null;
    busy = true;
    fileName = file.name;
    stageIndex = 0;
    try {
      const doc = await extractFile(file, selectedVoice ?? "", (stage) => {
        stageIndex = STAGES.findIndex((s) => s.k === stage);
      });
      stageIndex = STAGES.length; // every step done
      setTimeout(() => oncreate(doc), 350);
    } catch (e) {
      busy = false;
      error = e instanceof Error ? e.message : m.narrator_add_read_failed();
    }
  }

  function startPaste() {
    const doc = extractPaste(text, selectedVoice ?? "");
    if (doc) oncreate(doc);
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label={m.narrator_add_dialog()}>
  <div class="sheet">
    <div class="glow"></div>
    <div class="content">
      <div class="head">
        <button class="icon-btn" onclick={onclose} aria-label={m.narrator_back()}><ArrowLeft size={18} strokeWidth={1.5} /></button>
        <div>
          <h2 class="n-gradient-text">{m.narrator_add_dialog()}</h2>
          <p>{m.narrator_add_subtitle()}</p>
        </div>
        <button class="icon-btn close" onclick={onclose} aria-label={m.narrator_close()}><X size={18} strokeWidth={1.5} /></button>
      </div>

      {#if busy}
        <div class="pipe">
          <div class="pipe-spinner">
            <Equalizer color="var(--n-brand-blue)" size={40} />
            <div class="ring"></div>
          </div>
          <h3>{m.narrator_add_building()}</h3>
          <p class="pipe-sub">{fileName}</p>
          <div class="steps">
            {#each STAGES as step, i (step.k)}
              {@const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "pending"}
              <div class="step {state}">
                <div class="dot {state}">
                  {#if state === "done"}
                    <Check size={13} strokeWidth={2.5} style="color: #04240f" />
                  {:else if state === "active"}
                    <div class="pulse"></div>
                  {/if}
                </div>
                <div class="step-body">
                  <div class="step-label">{step.label}</div>
                  {#if state === "active"}
                    <div class="step-sub">{step.sub}…</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="body">
          <div class="tabs" role="tablist">
            {#each TABS as t (t.id)}
              <button
                class="tab"
                class:active={tab === t.id}
                role="tab"
                aria-selected={tab === t.id}
                onclick={() => (tab = t.id)}
              >
                <t.icon size={16} strokeWidth={1.5} />
                {t.label}
              </button>
            {/each}
          </div>

          {#if tab === "paste"}
            <textarea
              bind:value={text}
              placeholder={m.narrator_add_paste_placeholder()}
              aria-label={m.narrator_add_paste_label()}
            ></textarea>
          {:else}
            <input
              bind:this={fileInput}
              type="file"
              accept={ACCEPT_BY_KIND[tab]}
              class="file-input"
              aria-label={activeTab.choose}
              onchange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void handleFile(file);
                e.currentTarget.value = "";
              }}
            />
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="drop"
              class:drag
              role="button"
              tabindex="0"
              onclick={() => fileInput?.click()}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInput?.click();
                }
              }}
              ondragover={(e) => {
                e.preventDefault();
                drag = true;
              }}
              ondragleave={() => (drag = false)}
              ondrop={(e) => {
                e.preventDefault();
                drag = false;
                const file = e.dataTransfer?.files?.[0];
                if (file) void handleFile(file);
              }}
            >
              <div class="drop-icon"><activeTab.icon size={28} strokeWidth={1.5} /></div>
              <div class="drop-title">{activeTab.drop}</div>
              <div class="drop-sub">{m.narrator_add_drop_or()} <span>{m.narrator_add_browse()}</span></div>
              <div class="drop-hint">{activeTab.hint}</div>
            </div>
          {/if}

          {#if error}
            <div class="error" role="alert">{error}</div>
          {/if}

          <div class="voice-row">
            <div class="voice-label">
              <Mic size={16} strokeWidth={1.5} style="color: var(--n-brand-blue)" /> {m.narrator_narrator_voice()}
            </div>
            <div class="voice-chips">
              {#if voiceChoices.length === 0}
                <span class="voice-chip active">{m.narrator_add_system_default()}</span>
              {:else}
                {#each voiceChoices as v (v.voiceURI)}
                  <button
                    class="voice-chip"
                    class:active={selectedVoice === v.name}
                    onclick={() => (voice = v.name)}
                  >
                    {v.name}
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          {#if tab === "paste"}
            <Btn variant="primary" class="narrate-btn" disabled={!text.trim()} onclick={startPaste}>
              <Sparkles size={16} strokeWidth={1.5} /> {m.narrator_add_narrate()}
            </Btn>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(2, 6, 24, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .sheet {
    width: min(560px, 100%);
    max-height: 92vh;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    background: var(--n-bg-1);
    border: 1px solid var(--n-glass-border);
    border-radius: 20px;
    box-shadow: var(--n-shadow-lg);
  }
  .glow {
    position: absolute;
    top: -30px;
    right: -30px;
    width: 230px;
    height: 180px;
    border-radius: 999px;
    background: var(--n-brand-gradient-soft);
    filter: blur(60px);
    pointer-events: none;
    z-index: 0;
  }
  .content {
    position: relative;
    z-index: 1;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 28px;
  }
  .head h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .head p {
    margin: 2px 0 0;
    color: var(--n-fg-2);
    font-size: 14px;
  }
  .icon-btn {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
    cursor: pointer;
  }
  .icon-btn.close {
    margin-left: auto;
  }
  .body {
    padding: 0 28px 28px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    padding: 4px;
    background: var(--n-bg-0);
    border-radius: 12px;
    margin-bottom: 20px;
    border: 1px solid var(--n-border-1);
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 10px 8px;
    border-radius: 9px;
    border: none;
    background: transparent;
    color: var(--n-fg-2);
    font-family: var(--n-font-sans);
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 200ms var(--n-ease-out);
  }
  .tab.active {
    background: rgba(18, 145, 250, 0.12);
    color: var(--n-fg-0);
    box-shadow: inset 0 0 0 1px rgba(18, 145, 250, 0.28);
  }
  .file-input {
    display: none;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 44px 24px;
    border: 1.5px dashed var(--n-border-2);
    border-radius: 16px;
    cursor: pointer;
    text-align: center;
    transition: all 200ms var(--n-ease-out);
    background: var(--n-bg-1);
  }
  .drop.drag {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.08);
  }
  .drop-icon {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: var(--n-brand-gradient);
    color: #fff;
    margin-bottom: 4px;
    box-shadow:
      var(--n-brand-glow),
      inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .drop-title {
    font-weight: 700;
    font-size: 17px;
  }
  .drop-sub {
    color: var(--n-fg-2);
    font-size: 14px;
  }
  .drop-sub span {
    color: var(--n-link);
  }
  .drop-hint {
    font-family: var(--n-font-mono);
    font-size: 12px;
    color: var(--n-fg-3);
    margin-top: 6px;
  }
  .error {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
    font-size: 13px;
  }
  textarea {
    width: 100%;
    min-height: 168px;
    resize: vertical;
    padding: 16px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
    font-family: var(--n-font-serif);
    font-size: 16px;
    line-height: 1.6;
    outline: none;
  }
  textarea::placeholder {
    color: var(--n-fg-3);
  }
  .voice-row {
    margin-top: 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .voice-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 600;
  }
  .voice-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .voice-chip {
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-1);
    color: var(--n-fg-1);
    font-size: 13px;
    cursor: pointer;
    font-family: var(--n-font-sans);
    transition: all 200ms var(--n-ease-out);
  }
  .voice-chip.active {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.1);
    color: var(--n-fg-0);
  }
  .body :global(.narrate-btn) {
    margin-top: 20px;
    width: 100%;
    padding: 13px;
  }
  .body :global(.narrate-btn:disabled) {
    opacity: 0.5;
    pointer-events: none;
  }
  .pipe {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 12px 28px 40px;
  }
  .pipe h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  .pipe-sub {
    color: var(--n-fg-2);
    margin: 2px 0 8px;
    font-size: 14px;
    font-family: var(--n-font-mono);
  }
  .pipe-spinner {
    position: relative;
    width: 64px;
    height: 64px;
    margin-bottom: 8px;
    display: grid;
    place-items: center;
  }
  .ring {
    position: absolute;
    inset: -10px;
    border-radius: 999px;
    border: 1.5px solid var(--n-border-1);
    border-top-color: var(--n-brand-blue);
    animation: n-spin 1s linear infinite;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    max-width: 380px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    transition: all 200ms var(--n-ease-out);
    text-align: left;
  }
  .step.active {
    background: var(--n-bg-2);
  }
  .step.pending {
    opacity: 0.4;
  }
  .dot {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 1.5px solid var(--n-border-2);
  }
  .dot.done {
    background: var(--n-success);
    border: none;
  }
  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--n-brand-blue);
    animation: n-pulse 1s ease-in-out infinite;
  }
  .step-body {
    flex: 1;
  }
  .step-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--n-fg-0);
  }
  .step.active .step-label {
    font-weight: 600;
  }
  .step.pending .step-label {
    color: var(--n-fg-3);
  }
  .step-sub {
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-3);
    margin-top: 2px;
  }
</style>
