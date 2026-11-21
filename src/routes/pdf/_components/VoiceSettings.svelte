<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { onDestroy } from "svelte";

  import { formatNumber } from "@repo/i18n/format";
  import { m } from "@repo/i18n/messages.js";
  import { getLocale, setLocale } from "@repo/i18n/runtime.js";

  import {
    clearKokoro,
    KOKORO_QUALITIES,
    KOKORO_VOICES,
    kokoroDownloadMb,
    kokoroStatus,
    kokoroSupported,
    kokoroUsesGpu,
    loadKokoro,
    synthesize,
    webgpuAvailable,
    type KokoroLoadProgress,
    type KokoroQuality,
    type KokoroVoice,
  } from "@repo/pdf-core/services/tts";
  import { ReaderSettings, type VoiceEngine } from "@repo/pdf-core/stores/settings";
  import { voiceCatalog } from "@repo/pdf-core/stores/voices";

  import logoUrl from "../logo-G.svg";
  import { LANGUAGES, languageName, sampleFor } from "./languages";
  import Notice, { type NoticeAction } from "./Notice.svelte";

  const settings = new ReaderSettings();
  const locale = getLocale();

  const naturalAvailable = kokoroSupported();
  // Two different downloads exist only where the graphics card can be used. Elsewhere both
  // sizes are the same file, so the choice is not offered.
  const sizeChoice = webgpuAvailable();
  // Follows the chosen size: the smaller model runs on the processor even where a GPU exists.
  const onGpu = $derived(kokoroUsesGpu(settings.modelQuality));
  const downloadMb = $derived(kokoroDownloadMb(settings.modelQuality));

  // Which engine's voices are listed. Only a view: "Use" on a voice is what sets the engine.
  let tab = $state<VoiceEngine>(settings.engine === "natural" && naturalAvailable ? "natural" : "system");

  const uiLang = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  // The tip names a macOS settings path. An iPad also reports "MacIntel", but has a touch screen.
  const isMac =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;

  const voiceType = (v: KokoroVoice) =>
    v.gender === "male" ? m.narrator_settings_voice_male() : m.narrator_settings_voice_female();
  // A line of short facts about a voice. It may wrap between two facts, never inside one.
  const facts = (...parts: string[]) =>
    parts
      .flatMap((p) => p.split(" · "))
      .map((p) => p.replaceAll(" ", "\u00a0"))
      .join(" · ");
  const naturalDetail = (v: KokoroVoice) => facts(languageName(v.lang), voiceType(v));
  const systemDetail = (v: SpeechSynthesisVoice) =>
    facts(v.localService ? languageName(v.lang) : m.narrator_settings_network({ lang: languageName(v.lang) }));

  // ---- preview (one at a time, system or natural) ----
  // `id` is the place that started it: a voice's row ("sys:Alex", "nat:af_heart") or the summary ("cur").
  type Preview = { id: string; phase: "preparing" | "playing"; progress: number; text: string; lang: string };
  type Failed = { id: string; name: string; natural: boolean; retry: () => void };
  let preview = $state<Preview | null>(null);
  let failed = $state<Failed | null>(null);
  let previewAudio: HTMLAudioElement | null = null;
  // Bumped on every start and stop, so a late event from an older preview is ignored.
  let previewRun = 0;

  function stopPreview() {
    previewRun++;
    if (previewAudio) {
      previewAudio.pause();
      if (previewAudio.src) URL.revokeObjectURL(previewAudio.src);
      previewAudio = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    preview = null;
  }

  function previewSystem(name: string, id = "sys:" + name) {
    if (preview?.id === id) return stopPreview();
    stopPreview();
    failed = null;
    const run = previewRun;
    const live = () => run === previewRun && preview !== null;
    const v = voiceCatalog.voices.find((x) => x.name === name);
    const lang = v?.lang ?? uiLang;
    const text = sampleFor(lang);
    const u = new SpeechSynthesisUtterance(text);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.onstart = () => {
      if (live()) preview = { ...preview!, phase: "playing" };
    };
    // Real progress where the voice reports its words. Network voices often do not: the ring stays empty.
    u.onboundary = (e) => {
      if (live()) preview = { ...preview!, phase: "playing", progress: Math.min(1, e.charIndex / text.length) };
    };
    u.onend = () => {
      if (live()) preview = null;
    };
    u.onerror = (e) => {
      if (!live()) return;
      preview = null;
      // Stopping a preview also arrives here. Only a real failure is reported.
      if (e.error !== "interrupted" && e.error !== "canceled")
        failed = { id, name, natural: false, retry: () => previewSystem(name, id) };
    };
    preview = { id, phase: "preparing", progress: 0, text, lang };
    speechSynthesis.speak(u);
  }

  async function previewNatural(v: KokoroVoice, id = "nat:" + v.id) {
    if (preview?.id === id) return stopPreview();
    stopPreview();
    failed = null;
    const run = previewRun;
    const live = () => run === previewRun && preview !== null;
    const text = sampleFor(v.lang);
    const quality = settings.modelQuality;
    preview = { id, phase: "preparing", progress: 0, text, lang: v.lang };
    if (kokoroStatus(quality) !== "ready") startBar();
    try {
      const { url } = await synthesize(text, v.id, quality, onDownload);
      if (settings.modelQuality === quality) modelState = "ready";
      if (!live()) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      previewAudio = audio;
      audio.ontimeupdate = () => {
        if (live() && audio.duration)
          preview = { ...preview!, progress: Math.min(1, audio.currentTime / audio.duration) };
      };
      audio.onended = () => {
        if (live()) stopPreview();
      };
      await audio.play();
      if (live()) preview = { ...preview!, phase: "playing" };
    } catch {
      if (settings.modelQuality === quality) modelState = statusNow();
      if (!live()) return;
      stopPreview();
      // The cause ("Failed to fetch") means nothing to a listener: the notice says what to do instead.
      offline = isOffline();
      failed = { id, name: v.name, natural: true, retry: () => previewNatural(v, id) };
    }
  }

  // ---- the natural voices' download ----
  type ModelState = "idle" | "downloading" | "ready" | "error";
  const statusNow = (): ModelState => {
    const s = kokoroStatus(settings.modelQuality);
    return s === "loading" ? "downloading" : s;
  };
  const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  let modelState = $state<ModelState>(statusNow());
  let dl = $state<KokoroLoadProgress>({ fraction: 0 });
  let offline = $state(false);
  const onDownload = (p: KokoroLoadProgress) => (dl = p);
  const percent = $derived(Math.round(dl.fraction * 100));
  const megabytes = (bytes: number) => formatNumber(Math.round(bytes / 1_000_000));

  function startBar() {
    modelState = "downloading";
    dl = { fraction: 0 };
  }

  async function downloadModel() {
    const quality = settings.modelQuality;
    startBar();
    try {
      await loadKokoro(quality, onDownload);
      if (settings.modelQuality === quality) modelState = "ready";
    } catch {
      if (settings.modelQuality !== quality) return;
      offline = isOffline();
      modelState = "error";
    }
  }
  // A download already on its way (started in the reader, or before leaving this page) keeps its bar.
  if (statusNow() === "downloading") void downloadModel();

  async function clearModel() {
    stopPreview();
    await clearKokoro();
    modelState = "idle";
    dl = { fraction: 0 };
  }

  function setQuality(q: KokoroQuality) {
    if (q === settings.modelQuality) return;
    settings.update("modelQuality", q);
    // A different size is a different model file.
    stopPreview();
    modelState = statusNow();
  }

  // ---- choosing ----
  function useSystem() {
    settings.update("engine", "system");
    tab = "system";
    failed = null;
  }
  function useNatural() {
    settings.update("engine", "natural");
    tab = "natural";
  }

  // ---- system voice list ----
  let onlyLocal = $state(true);
  let onlyLang = $state(true);
  const systemVoices = $derived(
    voiceCatalog.voices
      .filter((v) => (!onlyLocal || v.localService) && (!onlyLang || v.lang.slice(0, 2) === uiLang))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  // With nothing saved, the device's own default reads: that voice is the one in use.
  const systemInUse = $derived(voiceCatalog.inUse(settings.systemVoice));
  const naturalInUse = $derived(
    KOKORO_VOICES.find((v) => v.id === settings.naturalVoice) ?? KOKORO_VOICES[0],
  );

  const reason = $derived(offline ? m.narrator_settings_offline() : m.narrator_settings_check_connection());
  const downloadFailedActions = $derived<NoticeAction[]>([
    { label: m.narrator_settings_retry(), onclick: downloadModel, primary: true },
    ...(downloadMb > kokoroDownloadMb("compact")
      ? [
          {
            label: m.narrator_settings_try_smaller(),
            onclick: () => {
              setQuality("compact");
              void downloadModel();
            },
          },
        ]
      : []),
    { label: m.narrator_settings_use_system_now(), onclick: useSystem },
  ]);

  onDestroy(stopPreview);
</script>

<!-- The round button that plays a voice's sample: idle, preparing (spinner) or playing (a ring that fills). -->
{#snippet previewButton(id: string, name: string, start: () => void, waiting = false)}
  {@const mine = preview?.id === id ? preview : null}
  <button
    class="preview"
    class:preparing={mine?.phase === "preparing"}
    class:playing={mine?.phase === "playing"}
    aria-label={mine ? m.narrator_settings_stop_preview({ name }) : m.narrator_settings_preview({ name })}
    disabled={waiting && !mine}
    onclick={start}
  >
    {#if mine?.phase === "preparing"}
      <span class="spin"></span>
    {:else if mine}
      <svg class="arc" viewBox="0 0 48 48" aria-hidden="true">
        <circle class="track" cx="24" cy="24" r="22" />
        <circle class="done" cx="24" cy="24" r="22" pathLength="100" stroke-dashoffset={100 - mine.progress * 100} />
      </svg>
      <Pause size={16} strokeWidth={2} />
    {:else}
      <Play size={16} strokeWidth={2} />
    {/if}
  </button>
{/snippet}

<!-- What a row or the summary says under the name: the preview's state while it runs, else the detail. -->
{#snippet statusLine(id: string, detail: string, waiting = false)}
  {@const mine = preview?.id === id ? preview : null}
  <span class="voice-lang" class:live={mine} aria-live="polite">
    {#if mine?.phase === "preparing"}
      {m.narrator_settings_preparing()}
    {:else if mine}
      {m.narrator_settings_playing()}
    {:else if waiting}
      {m.narrator_settings_after_download()}
    {:else}
      {detail}
    {/if}
  </span>
{/snippet}

<!-- Under a row or the summary: the sentence being read, or why the preview could not play. -->
{#snippet previewExtras(id: string)}
  {#if preview?.id === id && preview.phase === "playing"}
    <p class="sample" lang={preview.lang}>{preview.text}</p>
  {/if}
  {#if failed?.id === id}
    <Notice
      class="row-notice"
      title={m.narrator_settings_preview_failed_title({ name: failed.name })}
      actions={[
        { label: m.narrator_settings_retry(), onclick: failed.retry, primary: true },
        ...(failed.natural ? [{ label: m.narrator_settings_use_system(), onclick: useSystem }] : []),
      ]}
    >
      {failed.natural ? reason : m.narrator_settings_preview_failed_system()}
    </Notice>
  {/if}
{/snippet}

{#snippet chooser(active: boolean, use: () => void)}
  {#if active}
    <span class="in-use"><Check size={15} strokeWidth={2.25} /> {m.narrator_settings_in_use()}</span>
  {:else}
    <button class="choose" onclick={use}>{m.narrator_settings_use()}</button>
  {/if}
{/snippet}

<div class="narrator">
  <div class="wrap">
    <header class="head">
      <a class="back" href="/pdf" aria-label={m.narrator_back_to_library()}><ArrowLeft size={20} strokeWidth={1.75} /></a>
      <img class="mark" src={logoUrl} width="28" height="28" alt="" />
      <div>
        <h1>{m.narrator_settings_title()}</h1>
        <p>{m.narrator_settings_intro()}</p>
      </div>
    </header>

    <section class="card">
      <h2>{m.narrator_settings_reading_voice()}</h2>

      <!-- The voice in use, whichever list is showing below. A device with no voice has none to name:
           the notice in the list says so. -->
      {#if settings.engine === "natural" || systemInUse}
      <div class="current">
        {#if settings.engine === "natural"}
          <div class="row">
            {@render previewButton("cur", naturalInUse.name, () => previewNatural(naturalInUse, "cur"), modelState === "downloading")}
            <div class="voice-meta">
              <span class="caption"><Check size={14} strokeWidth={2.25} /> {m.narrator_settings_reading_with()}</span>
              <span class="current-name">{naturalInUse.name}</span>
              {@render statusLine("cur", facts(languageName(naturalInUse.lang), voiceType(naturalInUse), m.narrator_natural_voice()))}
            </div>
          </div>
        {:else if systemInUse}
          {@const v = systemInUse}
          <div class="row">
            {@render previewButton("cur", v.name, () => previewSystem(v.name, "cur"))}
            <div class="voice-meta">
              <span class="caption"><Check size={14} strokeWidth={2.25} /> {m.narrator_settings_reading_with()}</span>
              <span class="current-name">{v.name}</span>
              {@render statusLine(
                "cur",
                facts(
                  systemDetail(v),
                  v.name === settings.systemVoice ? m.narrator_system_voice() : m.narrator_settings_device_default(),
                ),
              )}
            </div>
          </div>
        {/if}
        {@render previewExtras("cur")}
      </div>
      {/if}

      <div class="switch" role="group" aria-label={m.narrator_settings_show_voices()}>
        <button class="seg" class:on={tab === "system"} aria-pressed={tab === "system"} onclick={() => (tab = "system")}>
          <strong>{m.narrator_engine_system()}</strong>
          <span>{m.narrator_settings_engine_system_hint()}</span>
        </button>
        <button
          class="seg"
          class:on={tab === "natural"}
          aria-pressed={tab === "natural"}
          disabled={!naturalAvailable}
          onclick={() => (tab = "natural")}
        >
          <strong>{m.narrator_engine_natural()}</strong>
          <span>{naturalAvailable ? m.narrator_settings_engine_natural_hint() : m.narrator_settings_natural_unavailable()}</span>
        </button>
      </div>

      {#if tab === "natural"}
        <h3>{m.narrator_natural_voice()}</h3>
        <p class="note">{m.narrator_settings_natural_intro()}</p>

        <div class="model-row">
          {#if modelState === "ready"}
            <span class="model-state ok" role="status"><Check size={16} strokeWidth={2.25} /> {m.narrator_settings_model_ready()}</span>
            <button class="btn danger" onclick={clearModel}><Trash2 size={15} strokeWidth={1.75} /> {m.narrator_settings_clear_download()}</button>
          {:else if modelState === "downloading"}
            <!-- No Cancel: the loader cannot stop a download once it has started. -->
            <div class="download">
              <div
                class="bar"
                role="progressbar"
                aria-label={m.narrator_natural_voice()}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={percent}
              >
                <span style:width="{percent}%"></span>
              </div>
              <div class="bar-text">
                <span class="model-state">{m.narrator_settings_downloading({ percent })}</span>
                {#if dl.totalBytes && dl.loadedBytes !== undefined}
                  <span class="bytes">
                    {m.narrator_settings_download_mb({ done: megabytes(dl.loadedBytes), total: megabytes(dl.totalBytes) })}
                  </span>
                {/if}
              </div>
            </div>
          {:else if modelState === "error"}
            <Notice class="grow" title={m.narrator_settings_download_failed()} actions={downloadFailedActions}>
              {reason}
            </Notice>
          {:else}
            <button class="btn primary" onclick={downloadModel}>
              <Download size={16} strokeWidth={2} />
              {m.narrator_settings_download_now({ size: downloadMb })}
            </button>
            <span class="hint">{m.narrator_settings_download_hint()}</span>
          {/if}
        </div>

        <details class="size">
          <summary>
            <span>{m.narrator_settings_model_quality()}</span>
            <ChevronDown size={18} strokeWidth={1.75} />
          </summary>
          {#if sizeChoice}
            <div class="quality">
              {#each KOKORO_QUALITIES as q (q.id)}
                <button
                  class="quality-opt"
                  class:on={settings.modelQuality === q.id}
                  aria-pressed={settings.modelQuality === q.id}
                  disabled={modelState === "downloading"}
                  onclick={() => setQuality(q.id)}
                >
                  <span class="quality-top">
                    <strong>{q.label}</strong>
                    {#if settings.modelQuality === q.id}<Check size={16} strokeWidth={2.25} />{/if}
                  </span>
                  <span class="quality-detail">{q.detail}</span>
                </button>
              {/each}
            </div>
          {:else}
            <p class="note">{m.narrator_settings_one_size({ size: downloadMb })}</p>
          {/if}
          <p class="note">{onGpu ? m.narrator_settings_gpu_used() : m.narrator_settings_gpu_unused()}</p>
        </details>

        <ul class="voices">
          {#each KOKORO_VOICES as v (v.id)}
            {@const id = "nat:" + v.id}
            {@const active = settings.engine === "natural" && naturalInUse.id === v.id}
            {@const waiting = modelState === "downloading"}
            <li class:active>
              <div class="row">
                {@render previewButton(id, v.name, () => previewNatural(v), waiting)}
                <div class="voice-meta">
                  <span class="voice-name">{v.name}</span>
                  {@render statusLine(id, naturalDetail(v), waiting)}
                </div>
                {@render chooser(active, () => {
                  settings.update("naturalVoice", v.id);
                  settings.update("engine", "natural");
                })}
              </div>
              {@render previewExtras(id)}
            </li>
          {/each}
        </ul>
      {:else}
        <h3>{m.narrator_settings_system_voices()}</h3>
        {#if voiceCatalog.voices.length === 0}
          <Notice
            tone="info"
            actions={naturalAvailable
              ? [{ label: m.narrator_settings_use_natural(), onclick: useNatural, primary: true }]
              : []}
          >
            {m.narrator_settings_no_voices()}
          </Notice>
        {:else}
          <p class="note">
            {m.narrator_settings_system_note()}
            {#if isMac}{m.narrator_settings_mac_tip()}{/if}
          </p>
          <div class="filters" role="group" aria-label={m.narrator_settings_filters_label()}>
            <button class="chip" class:on={onlyLang} aria-pressed={onlyLang} onclick={() => (onlyLang = !onlyLang)}>
              {#if onlyLang}<Check size={15} strokeWidth={2.25} />{/if}
              {m.narrator_settings_my_language()}
            </button>
            <button class="chip" class:on={onlyLocal} aria-pressed={onlyLocal} onclick={() => (onlyLocal = !onlyLocal)}>
              {#if onlyLocal}<Check size={15} strokeWidth={2.25} />{/if}
              {m.narrator_settings_on_device()}
            </button>
          </div>
          {#if systemVoices.length === 0}
            <Notice
              tone="info"
              actions={[
                {
                  label: m.narrator_settings_clear_filters(),
                  primary: true,
                  onclick: () => {
                    onlyLang = false;
                    onlyLocal = false;
                  },
                },
              ]}
            >
              {m.narrator_settings_filters_hide_all()}
            </Notice>
          {:else}
            <ul class="voices">
              {#each systemVoices as v (v.voiceURI)}
                {@const id = "sys:" + v.name}
                {@const active = settings.engine === "system" && systemInUse?.name === v.name}
                <li class:active>
                  <div class="row">
                    {@render previewButton(id, v.name, () => previewSystem(v.name))}
                    <div class="voice-meta">
                      <span class="voice-name">{v.name}</span>
                      {@render statusLine(id, systemDetail(v))}
                    </div>
                    {@render chooser(active, () => {
                      settings.update("systemVoice", v.name);
                      settings.update("engine", "system");
                    })}
                  </div>
                  {@render previewExtras(id)}
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      {/if}
    </section>

    <!-- Interface language: menus and messages only, never the voice that reads. Changing it reloads the page. -->
    <section class="card">
      <h2>{m.narrator_language()}</h2>
      <p class="note">{m.narrator_language_note()}</p>
      <div class="langs">
        {#each LANGUAGES as l (l.locale)}
          <button
            class="lang"
            class:on={locale === l.locale}
            aria-pressed={locale === l.locale}
            lang={l.locale}
            onclick={() => setLocale(l.locale)}
          >
            {l.name}
            {#if locale === l.locale}<Check size={16} strokeWidth={2.25} />{/if}
          </button>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .wrap {
    /* The one accent for "in use" and progress. WP4 defines --n-accent-app; the brand blue until then. */
    --acc: var(--n-accent-app, var(--n-brand-blue));
    --acc-tint: color-mix(in srgb, var(--acc) 10%, transparent);
    --acc-line: color-mix(in srgb, var(--acc) 45%, transparent);
    max-width: 720px;
    margin: 0 auto;
    padding: clamp(16px, 4vw, 40px) clamp(16px, 4vw, 32px) 80px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .wrap :is(button, a, summary):focus-visible {
    outline: 2px solid var(--n-fg-0);
    outline-offset: 2px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .head h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--n-fg-0);
  }
  .head p {
    margin: 2px 0 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--n-fg-2);
  }
  .back {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-2);
    color: var(--n-fg-0);
  }
  .back:hover {
    background: var(--n-bg-2);
  }

  .card {
    background: var(--n-bg-1);
    border: 1px solid var(--n-border-1);
    border-radius: 16px;
    padding: 20px;
  }
  .card h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .card h3 {
    margin: 20px 0 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .note {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--n-fg-2);
  }

  /* ---- the voice in use ---- */
  .current {
    margin-top: 14px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid var(--acc-line);
    background: var(--acc-tint);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .caption {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    font-weight: 600;
    color: var(--n-fg-1);
  }
  .current-name {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--n-fg-0);
    overflow-wrap: anywhere;
  }

  /* ---- System or Natural ---- */
  .switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-top: 16px;
    padding: 4px;
    border-radius: 14px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  .seg {
    min-height: 56px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    transition: background var(--n-dur-1) var(--n-ease-out);
  }
  .seg strong {
    font-size: 15px;
    font-weight: 700;
    color: var(--n-fg-0);
  }
  .seg span {
    font-size: 13px;
    line-height: 1.3;
    color: var(--n-fg-2);
  }
  .seg:hover:not(:disabled, .on) {
    background: var(--n-bg-1);
  }
  .seg.on {
    background: var(--n-bg-3);
    border-color: var(--n-border-3);
  }
  .seg.on span {
    color: var(--n-fg-1);
  }
  .seg:disabled {
    cursor: not-allowed;
  }
  .seg:disabled strong {
    color: var(--n-fg-2);
  }

  /* ---- the natural voices' download ---- */
  .model-row {
    display: flex;
    align-items: center;
    gap: 10px 14px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .model-row :global(.grow) {
    flex: 1 1 100%;
  }
  .model-state {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 14px;
    color: var(--n-fg-0);
  }
  .model-state.ok {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }
  .model-state.ok :global(svg) {
    flex-shrink: 0;
    color: var(--n-success);
  }
  .hint {
    flex: 1 1 200px;
    font-size: 13px;
    line-height: 1.4;
    color: var(--n-fg-2);
  }
  .download {
    flex: 1 1 100%;
  }
  .bar {
    height: 10px;
    border-radius: 999px;
    background: var(--n-bg-3);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    min-width: 10px;
    border-radius: 999px;
    background: var(--acc);
    transition: width 300ms linear;
  }
  .bar-text {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    font-variant-numeric: tabular-nums;
  }
  .bytes {
    font-size: 14px;
    color: var(--n-fg-1);
  }
  .btn {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid var(--n-border-3);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--n-bg-3);
  }
  .btn.primary {
    border-color: transparent;
    background: var(--n-brand-gradient);
    font-size: 15px;
  }
  .btn.primary:hover {
    filter: brightness(1.1);
  }
  .btn.danger:hover {
    border-color: var(--n-danger);
  }

  .size {
    margin-top: 12px;
    border-top: 1px solid var(--n-border-1);
    border-bottom: 1px solid var(--n-border-1);
  }
  .size summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--n-fg-1);
    cursor: pointer;
    list-style: none;
  }
  .size summary::-webkit-details-marker {
    display: none;
  }
  .size[open] summary :global(svg) {
    transform: rotate(180deg);
  }
  .size[open] {
    padding-bottom: 14px;
  }
  .quality {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .quality-opt {
    min-height: 44px;
    text-align: left;
    border-radius: 12px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-0);
    padding: 12px 14px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .quality-opt.on {
    border-color: var(--acc-line);
    background: var(--acc-tint);
  }
  .quality-opt:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .quality-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--n-fg-0);
    font-size: 15px;
  }
  .quality-detail {
    font-size: 13px;
    line-height: 1.45;
    color: var(--n-fg-2);
  }

  /* ---- voice rows ---- */
  .voices {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .voices li {
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid transparent;
  }
  .voices li .row {
    min-height: 44px;
  }
  .voices li.active {
    background: var(--acc-tint);
    border-color: var(--acc-line);
  }
  .preview {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--n-border-3);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .preview:hover:not(:disabled) {
    background: var(--n-bg-3);
  }
  .preview:disabled {
    cursor: default;
    color: var(--n-fg-2);
    border-color: var(--n-border-1);
    background: transparent;
  }
  .preview.playing {
    border-color: transparent;
    background: var(--n-bg-3);
  }
  /* Drawn over the button's own border: a track, and the part of the sample already read.
     Not named "ring": that is a Tailwind utility and would draw a box around it. */
  .arc {
    position: absolute;
    inset: -1px;
    width: calc(100% + 2px);
    height: calc(100% + 2px);
    transform: rotate(-90deg);
    pointer-events: none;
  }
  .arc circle {
    fill: none;
    stroke-width: 3;
  }
  .arc .track {
    stroke: var(--n-border-2);
  }
  .arc .done {
    stroke: var(--acc);
    stroke-linecap: round;
    stroke-dasharray: 100;
    transition: stroke-dashoffset 250ms linear;
  }
  .spin {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid var(--n-border-3);
    border-top-color: var(--n-fg-0);
    animation: n-spin 0.8s linear infinite;
  }
  .voice-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .voice-name {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--n-fg-0);
    overflow-wrap: anywhere;
  }
  .voice-lang {
    font-size: 13px;
    line-height: 1.4;
    color: var(--n-fg-2);
  }
  .voice-lang.live {
    font-weight: 600;
    color: var(--n-fg-0);
  }
  .choose,
  .in-use {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .choose {
    border: 1px solid var(--n-border-3);
    background: var(--n-bg-2);
    color: var(--n-fg-0);
    cursor: pointer;
  }
  .choose:hover {
    background: var(--n-bg-3);
  }
  .in-use {
    padding-right: 6px;
    color: var(--n-fg-0);
  }
  .in-use :global(svg) {
    color: var(--acc);
  }
  .sample {
    margin: 8px 0 4px 56px;
    padding-left: 12px;
    border-left: 2px solid var(--acc);
    font-size: 15px;
    line-height: 1.5;
    color: var(--n-fg-1);
  }
  .card :global(.row-notice) {
    margin: 10px 0 4px;
  }
  .card :global(.notice:not(.row-notice, .grow)) {
    margin-top: 12px;
  }

  /* ---- system voice filters ---- */
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .chip {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--n-border-3);
    background: transparent;
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .chip.on {
    border-color: var(--acc-line);
    background: var(--acc-tint);
    color: var(--n-fg-0);
  }

  /* ---- interface language ---- */
  .langs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }
  .lang {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-0);
    color: var(--n-fg-0);
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
  }
  .lang:hover:not(.on) {
    background: var(--n-bg-2);
  }
  .lang.on {
    border-color: var(--acc-line);
    background: var(--acc-tint);
  }

  @media (max-width: 560px) {
    /* The ring is decoration: without it the title lines up beside the back button. */
    .mark {
      display: none;
    }
    .head h1 {
      font-size: 24px;
    }
    .card {
      padding: 16px;
    }
    .quality {
      grid-template-columns: 1fr;
    }
    .model-row .btn.primary {
      flex: 1 1 100%;
      justify-content: center;
    }
    .sample {
      margin-left: 0;
    }
  }
</style>
