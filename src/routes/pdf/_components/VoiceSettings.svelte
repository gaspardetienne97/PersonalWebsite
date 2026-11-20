<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Check from "@lucide/svelte/icons/check";
  import Cpu from "@lucide/svelte/icons/cpu";
  import Download from "@lucide/svelte/icons/download";
  import Mic from "@lucide/svelte/icons/mic";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Zap from "@lucide/svelte/icons/zap";
  import { onDestroy } from "svelte";

  import {
    clearKokoro,
    KOKORO_QUALITIES,
    KOKORO_VOICES,
    kokoroLoaded,
    kokoroSupported,
    loadKokoro,
    synthesize,
    webgpuAvailable,
    type KokoroQuality,
  } from "@repo/pdf-core";
  import { ReaderSettings, type VoiceEngine } from "@repo/pdf-core/stores/settings";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import logoUrl from "../logo-G.svg";

  const settings = new ReaderSettings();

  const SAMPLE =
    "The quick brown fox jumps over the lazy dog, and this is how this narrator voice sounds out loud.";

  const ENGINES: { value: VoiceEngine; label: string; hint: string }[] = [
    { value: "system", label: "System", hint: "Your device's built-in voices. Instant, no download." },
    {
      value: "natural",
      label: "Natural (neural)",
      hint: "A high-quality voice that runs in your browser. Downloaded once, then offline.",
    },
  ];

  const naturalAvailable = kokoroSupported();
  const onGpu = webgpuAvailable();

  // ---- preview state (shared between system + neural) ----
  let previewing = $state<string | null>(null);
  let previewError = $state<string | null>(null);
  let previewAudio: HTMLAudioElement | null = null;

  function stopPreview() {
    if (previewAudio) {
      previewAudio.pause();
      if (previewAudio.src) URL.revokeObjectURL(previewAudio.src);
      previewAudio = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    previewing = null;
  }

  function previewSystem(name: string) {
    const id = "sys:" + name;
    if (previewing === id) return stopPreview();
    stopPreview();
    previewError = null;
    const u = new SpeechSynthesisUtterance(SAMPLE);
    const v = voiceCatalog.voices.find((x) => x.name === name);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.onend = () => {
      if (previewing === id) previewing = null;
    };
    previewing = id;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  async function previewNatural(voiceId: string) {
    const id = "nat:" + voiceId;
    if (previewing === id) return stopPreview();
    stopPreview();
    previewError = null;
    previewing = id;
    if (!kokoroLoaded()) modelState = "downloading";
    try {
      const { url } = await synthesize(SAMPLE, voiceId, settings.modelQuality, (p) => (dlProgress = p.fraction));
      modelState = "ready";
      if (previewing !== id) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      previewAudio = audio;
      audio.onended = () => {
        if (previewing === id) previewing = null;
        URL.revokeObjectURL(url);
        if (previewAudio === audio) previewAudio = null;
      };
      await audio.play();
    } catch (e) {
      previewError = e instanceof Error ? e.message : "Couldn't synthesize a preview.";
      previewing = null;
      modelState = kokoroLoaded() ? "ready" : "idle";
    }
  }

  // ---- model download/manage ----
  type ModelState = "idle" | "downloading" | "ready" | "error";
  let modelState = $state<ModelState>(kokoroLoaded() ? "ready" : "idle");
  let dlProgress = $state(0);

  async function downloadModel() {
    modelState = "downloading";
    dlProgress = 0;
    try {
      await loadKokoro(settings.modelQuality, (p) => (dlProgress = p.fraction));
      modelState = "ready";
    } catch {
      modelState = "error";
    }
  }

  async function clearModel() {
    stopPreview();
    await clearKokoro();
    modelState = "idle";
    dlProgress = 0;
  }

  function setQuality(q: KokoroQuality) {
    if (q === settings.modelQuality) return;
    settings.update("modelQuality", q);
    // A different preset is a different model file.
    stopPreview();
    modelState = kokoroLoaded() ? "ready" : "idle";
  }

  // ---- system voice list ----
  let onlyLocal = $state(true);
  let onlyLang = $state(true);
  const uiLang = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  const systemVoices = $derived(
    voiceCatalog.voices
      .filter((v) => (!onlyLocal || v.localService) && (!onlyLang || v.lang.slice(0, 2) === uiLang))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  onDestroy(stopPreview);
</script>

<div class="narrator">
  <div class="wrap">
    <header class="head">
      <a class="back" href="/pdf" aria-label="Back to library"><ArrowLeft size={18} strokeWidth={1.5} /></a>
      <img src={logoUrl} width="28" height="28" alt="" />
      <div>
        <h1>Voice settings</h1>
        <p>Choose how the narrator reads aloud, preview voices, and manage downloads.</p>
      </div>
    </header>

    <!-- Engine -->
    <section class="card">
      <h2>Reading voice</h2>
      <div class="engine-grid">
        {#each ENGINES as e (e.value)}
          <button
            class="engine"
            class:on={settings.engine === e.value}
            disabled={e.value === "natural" && !naturalAvailable}
            onclick={() => settings.update("engine", e.value)}
          >
            <div class="engine-top">
              {#if e.value === "natural"}<Zap size={16} strokeWidth={1.5} />{:else}<Mic
                  size={16}
                  strokeWidth={1.5}
                />{/if}
              <span>{e.label}</span>
              {#if settings.engine === e.value}<Check size={15} strokeWidth={2} class="engine-check" />{/if}
            </div>
            <p>{e.hint}</p>
          </button>
        {/each}
      </div>
    </section>

    <!-- Natural -->
    {#if naturalAvailable}
      <section class="card">
        <div class="card-head">
          <h2>Natural voice</h2>
          <span class="badge">{onGpu ? "GPU accelerated" : "CPU"}</span>
        </div>

        <div class="sub">Model quality</div>
        <div class="quality">
          {#each KOKORO_QUALITIES as q (q.id)}
            <button class="quality-opt" class:on={settings.modelQuality === q.id} onclick={() => setQuality(q.id)}>
              <div class="quality-top">
                {#if q.id === "compact"}<Cpu size={15} strokeWidth={1.5} />{:else}<Zap
                    size={15}
                    strokeWidth={1.5}
                  />{/if}
                <strong>{q.label}</strong>
                {#if settings.modelQuality === q.id}<Check size={14} strokeWidth={2} />{/if}
              </div>
              <p>{q.detail}</p>
            </button>
          {/each}
        </div>

        <div class="model-row">
          {#if modelState === "ready"}
            <span class="model-state ok"><Check size={14} strokeWidth={2} /> Model ready</span>
            <button class="ghost danger" onclick={clearModel}><Trash2 size={14} strokeWidth={1.5} /> Clear download</button>
          {:else if modelState === "downloading"}
            <span class="model-state"><span class="spin"></span> Downloading… {Math.round(dlProgress * 100)}%</span>
          {:else if modelState === "error"}
            <span class="model-state err">Download failed</span>
            <button class="ghost" onclick={downloadModel}><Download size={14} strokeWidth={1.5} /> Retry</button>
          {:else}
            <button class="ghost" onclick={downloadModel}>
              <Download size={14} strokeWidth={1.5} /> Download model now
            </button>
            <span class="model-hint">Or just press preview / play — it downloads on first use.</span>
          {/if}
        </div>

        <div class="sub">Voices</div>
        <ul class="voices">
          {#each KOKORO_VOICES as v (v.id)}
            {@const active = settings.engine === "natural" && settings.naturalVoice === v.id}
            <li class:active>
              <button
                class="preview"
                class:playing={previewing === "nat:" + v.id}
                aria-label="Preview {v.label}"
                onclick={() => previewNatural(v.id)}
              >
                {#if previewing === "nat:" + v.id}<Pause size={15} strokeWidth={2} />{:else}<Play
                    size={15}
                    strokeWidth={2}
                  />{/if}
              </button>
              <div class="voice-meta">
                <span class="voice-name">{v.label}</span>
                <span class="voice-lang">{v.lang}</span>
              </div>
              <button
                class="choose"
                class:chosen={active}
                onclick={() => {
                  settings.update("naturalVoice", v.id);
                  settings.update("engine", "natural");
                }}
              >
                {#if active}<Check size={14} strokeWidth={2} /> Selected{:else}Use{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if previewError}<p class="error">{previewError}</p>{/if}
      </section>
    {/if}

    <!-- System -->
    <section class="card">
      <div class="card-head">
        <h2>System voices</h2>
        <div class="filters">
          <label><input type="checkbox" bind:checked={onlyLang} /> My language</label>
          <label><input type="checkbox" bind:checked={onlyLocal} /> On-device only</label>
        </div>
      </div>
      <p class="muted">
        These come from your operating system. Quality varies a lot — preview to find a good one. On macOS you can
        download better "premium" voices in System Settings → Accessibility → Spoken Content.
      </p>
      {#if systemVoices.length === 0}
        <p class="muted">No matching voices. Try unchecking the filters.</p>
      {:else}
        <ul class="voices">
          {#each systemVoices as v (v.voiceURI)}
            {@const active = settings.systemVoice === v.name}
            <li class:active>
              <button
                class="preview"
                class:playing={previewing === "sys:" + v.name}
                aria-label="Preview {v.name}"
                onclick={() => previewSystem(v.name)}
              >
                {#if previewing === "sys:" + v.name}<Pause size={15} strokeWidth={2} />{:else}<Play
                    size={15}
                    strokeWidth={2}
                  />{/if}
              </button>
              <div class="voice-meta">
                <span class="voice-name">{v.name}</span>
                <span class="voice-lang">{v.lang}{v.localService ? "" : " · network"}</span>
              </div>
              <button
                class="choose"
                class:chosen={active}
                onclick={() => {
                  settings.update("systemVoice", v.name);
                  settings.update("engine", "system");
                }}
              >
                {#if active}<Check size={14} strokeWidth={2} /> Selected{:else}Use{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  .wrap {
    max-width: 760px;
    margin: 0 auto;
    padding: clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 80px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .head h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--n-fg-0);
  }
  .head p {
    margin: 2px 0 0;
    font-size: 14px;
    color: var(--n-fg-2);
  }
  .back {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
  }
  .card {
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    border-radius: 16px;
    padding: 20px;
  }
  .card h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }
  .badge {
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-2);
    background: var(--n-bg-2);
    border: 1px solid var(--n-border-1);
    border-radius: 999px;
    padding: 3px 10px;
  }
  .sub {
    font-family: var(--n-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--n-fg-3);
    margin: 16px 0 8px;
  }
  .engine-grid,
  .quality {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .engine,
  .quality-opt {
    text-align: left;
    border-radius: 12px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-0);
    padding: 12px 14px;
    cursor: pointer;
    transition: all 160ms var(--n-ease-out);
    font-family: inherit;
  }
  .engine.on,
  .quality-opt.on {
    border-color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.08);
  }
  .engine:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .engine-top,
  .quality-top {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--n-fg-0);
    font-weight: 600;
    font-size: 14px;
  }
  .quality-top strong {
    flex: 1;
  }
  .engine-top :global(.engine-check) {
    margin-left: auto;
    color: var(--n-brand-blue);
  }
  .engine p,
  .quality-opt p {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--n-fg-2);
  }
  .model-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--n-border-1);
  }
  .model-state {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    color: var(--n-fg-1);
  }
  .model-state.ok {
    color: var(--n-success);
  }
  .model-state.err {
    color: var(--n-danger);
  }
  .model-hint {
    font-size: 12px;
    color: var(--n-fg-3);
  }
  .spin {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 2px solid var(--n-border-2);
    border-top-color: var(--n-brand-blue);
    animation: n-spin 0.8s linear infinite;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-1);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .ghost.danger:hover {
    color: var(--n-danger);
    border-color: var(--n-danger);
  }
  .voices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .voices li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid transparent;
  }
  .voices li.active {
    background: rgba(18, 145, 250, 0.07);
    border-color: rgba(18, 145, 250, 0.25);
  }
  .preview {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .preview.playing {
    background: var(--n-brand-blue);
    border-color: var(--n-brand-blue);
    color: #fff;
  }
  .voice-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .voice-name {
    font-size: 14px;
    color: var(--n-fg-0);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .voice-lang {
    font-family: var(--n-font-mono);
    font-size: 11px;
    color: var(--n-fg-3);
  }
  .choose {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-2);
    color: var(--n-fg-1);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    flex-shrink: 0;
  }
  .choose.chosen {
    border-color: var(--n-brand-blue);
    color: var(--n-brand-blue);
    background: rgba(18, 145, 250, 0.1);
  }
  .filters {
    display: flex;
    gap: 14px;
  }
  .filters label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--n-fg-2);
    cursor: pointer;
  }
  .filters input {
    accent-color: var(--n-brand-blue);
  }
  .muted {
    margin: 6px 0 12px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--n-fg-3);
  }
  .error {
    margin: 12px 0 0;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
    font-size: 13px;
  }
  @media (max-width: 560px) {
    .engine-grid,
    .quality {
      grid-template-columns: 1fr;
    }
  }
</style>
