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
    bytesToMb,
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
  import Btn from "./Btn.svelte";
  import { LANGUAGES, languageInSentence, languageName, sampleFor, sampleWords, wordAtChar, wordAtFraction } from "./languages";
  import Notice, { type NoticeAction } from "./Notice.svelte";

  const settings = new ReaderSettings();
  const locale = getLocale();

  const naturalAvailable = kokoroSupported();
  // Two different downloads exist only where the graphics card can be used. Elsewhere both
  // sizes are the same file, so the choice is not offered.
  const sizeChoice = webgpuAvailable();
  // Follows the chosen size: the smaller model runs on the processor even where a GPU exists.
  const onGpu = $derived(kokoroUsesGpu(settings.modelQuality));

  // Which engine's voices are listed. Only a view: "Use" on a voice is what sets the engine.
  let tab = $state<VoiceEngine>(settings.engine === "natural" && naturalAvailable ? "natural" : "system");

  const uiLang = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  // The tip names a macOS settings path. An iPad also reports "MacIntel", but has a touch screen.
  const isMac =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;

  // One line about a voice ("US English, female"). It may wrap after the comma, never inside a fact.
  const oneLine = (text: string) =>
    text
      .split(", ")
      .map((part) => part.replaceAll(" ", "\u00a0"))
      .join(", ");
  const naturalDetail = (v: KokoroVoice) => {
    const lang = languageName(v.lang, locale, true);
    return oneLine(v.gender === "male" ? m.narrator_settings_detail_male({ lang }) : m.narrator_settings_detail_female({ lang }));
  };
  const systemDetail = (v: SpeechSynthesisVoice) => {
    const lang = languageName(v.lang, locale, true);
    return oneLine(v.localService ? lang : m.narrator_settings_network({ lang }));
  };

  // ---- preview (one at a time, system or natural) ----
  // `id` is the place that started it: a voice's row ("sys:Alex", "nat:af_heart") or the summary ("cur").
  // `word` is the word being spoken (-1 until the voice says where it is).
  type Preview = {
    id: string;
    phase: "preparing" | "playing";
    progress: number;
    text: string;
    lang: string;
    word: number;
  };
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
    // Real progress where the voice reports its words. Network voices often do not: the ring
    // stays empty and no word is marked.
    u.onboundary = (e) => {
      if (!live()) return;
      preview = {
        ...preview!,
        phase: "playing",
        progress: Math.min(1, e.charIndex / text.length),
        word: wordAtChar(text, e.charIndex),
      };
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
    preview = { id, phase: "preparing", progress: 0, text, lang, word: -1 };
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
    const wasReady = kokoroStatus(quality) === "ready";
    preview = { id, phase: "preparing", progress: 0, text, lang: v.lang, word: -1 };
    if (!wasReady) startBar();
    try {
      const { url } = await synthesize(text, v.id, quality, onDownload);
      if (settings.modelQuality === quality) modelState = "ready";
      if (!live()) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      previewAudio = audio;
      // The engine sends no word events: the word follows the audio along the reader's own timeline.
      const follow = () => {
        if (!live() || previewAudio !== audio) return;
        if (audio.duration) {
          const progress = Math.min(1, audio.currentTime / audio.duration);
          preview = { ...preview!, progress, word: wordAtFraction(text, progress) };
        }
        requestAnimationFrame(follow);
      };
      audio.onended = () => {
        if (live()) stopPreview();
      };
      await audio.play();
      if (!live()) return;
      preview = { ...preview!, phase: "playing" };
      follow();
    } catch {
      // A preview that could not fetch the voices is a failed download: the page says so once, at the top.
      if (settings.modelQuality === quality) modelState = wasReady ? statusNow() : "error";
      if (!live()) return;
      stopPreview();
      // The cause ("Failed to fetch") means nothing to a listener: the notice says what to do instead.
      offline = isOffline();
      // One notice per cause: a download that failed is said once, by the download's own notice.
      if (wasReady) failed = { id, name: v.name, natural: true, retry: () => previewNatural(v, id) };
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
  const megabytes = (bytes: number) => formatNumber(bytesToMb(bytes));
  const ready = $derived(modelState === "ready");
  // The one size on the page: the button, the bar, the size choice and every notice read this.
  // It is the model file's size, and the loader's own total as soon as the download reports one.
  const downloadMb = $derived.by(() => {
    void dl.totalBytes;
    return kokoroDownloadMb(settings.modelQuality);
  });
  // Set where a smaller file than the chosen one exists: a failure can then offer it.
  const smallerMb = $derived(downloadMb > kokoroDownloadMb("compact") ? kokoroDownloadMb("compact") : 0);
  // A failed download's notice offers the smaller size itself, so the choice is not drawn twice.
  const showSize = $derived(modelState !== "error" || (sizeChoice && !smallerMb));

  function startBar() {
    modelState = "downloading";
    dl = { fraction: 0 };
  }

  async function downloadModel() {
    const quality = settings.modelQuality;
    failed = null;
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
    failed = null;
    dl = { fraction: 0 };
    modelState = statusNow();
  }

  // ---- choosing ----
  function useSystem() {
    settings.update("engine", "system");
    tab = "system";
    failed = null;
  }
  // Offered where the device has no voice of its own. Its label names the size, so it downloads.
  function useNatural(quality?: KokoroQuality) {
    if (quality) setQuality(quality);
    settings.update("engine", "natural");
    tab = "natural";
    if (modelState === "idle" || modelState === "error") void downloadModel();
  }

  // ---- system voice list ----
  // `null` means "not chosen": the list then follows what the device has, so it never opens empty.
  let langChoice = $state<boolean | null>(null);
  let networkChoice = $state<boolean | null>(null);
  const inMyLang = (v: SpeechSynthesisVoice) => v.lang.slice(0, 2) === uiLang;
  const hasMyLang = $derived(voiceCatalog.voices.some(inMyLang));
  const hasOtherLang = $derived(voiceCatalog.voices.some((v) => !inMyLang(v)));
  const hasLocal = $derived(voiceCatalog.voices.some((v) => v.localService));
  const onlyLang = $derived(hasMyLang && (langChoice ?? true));
  const langVoices = $derived(voiceCatalog.voices.filter((v) => !onlyLang || inMyLang(v)));
  // Voices that need the internet stay out of the list while the device has its own in this language.
  const networkCount = $derived(langVoices.filter((v) => !v.localService).length);
  const withNetwork = $derived(networkChoice ?? networkCount === langVoices.length);
  const systemVoices = $derived(
    langVoices.filter((v) => withNetwork || v.localService).sort((a, b) => a.name.localeCompare(b.name)),
  );
  // With nothing saved, the device's own default reads: that voice is the one in use.
  const systemInUse = $derived(voiceCatalog.inUse(settings.systemVoice));
  const naturalInUse = $derived(
    KOKORO_VOICES.find((v) => v.id === settings.naturalVoice) ?? KOKORO_VOICES[0],
  );

  const reason = $derived(offline ? m.narrator_settings_offline() : m.narrator_settings_check_connection());
  const retryDownload = $derived<NoticeAction>({
    label: m.narrator_settings_retry_size({ size: downloadMb }),
    onclick: downloadModel,
  });
  // The same three ways out at every width: again, the smaller file, or the system voice.
  const downloadFailedActions = $derived<NoticeAction[]>([
    { ...retryDownload, primary: true },
    ...(smallerMb
      ? [
          {
            label: m.narrator_settings_try_smaller({ size: smallerMb }),
            onclick: () => {
              setQuality("compact");
              void downloadModel();
            },
          },
        ]
      : []),
    { label: m.narrator_settings_use_system(), onclick: useSystem },
  ]);
  const noVoicesActions = $derived<NoticeAction[]>(
    naturalAvailable
      ? [
          { label: m.narrator_settings_use_natural({ size: downloadMb }), onclick: () => useNatural(), primary: true },
          ...(smallerMb
            ? [{ label: m.narrator_settings_try_smaller({ size: smallerMb }), onclick: () => useNatural("compact") }]
            : []),
        ]
      : [],
  );
  // The device's own default reads in another language than the listener's, and nothing was chosen.
  const defaultOtherLang = $derived(
    settings.engine === "system" &&
      !!systemInUse &&
      systemInUse.name !== settings.systemVoice &&
      !inMyLang(systemInUse) &&
      hasMyLang,
  );

  onDestroy(stopPreview);
</script>

<!-- The round button that plays a voice's sample: idle, preparing (spinner) or playing (a ring that fills).
     Only a voice that can speak has one. -->
{#snippet previewButton(id: string, name: string, start: () => void)}
  {@const mine = preview?.id === id ? preview : null}
  <button
    class="preview"
    class:preparing={mine?.phase === "preparing"}
    class:playing={mine?.phase === "playing"}
    aria-label={mine ? m.narrator_settings_stop_preview({ name }) : m.narrator_settings_preview({ name })}
    onclick={start}
  >
    {#if mine?.phase === "preparing"}
      <span class="spin"></span>
    {:else if mine}
      <svg class="arc" viewBox="0 0 48 48" aria-hidden="true">
        <circle class="track" cx="24" cy="24" r="21.5" />
        <circle class="done" cx="24" cy="24" r="21.5" pathLength="100" stroke-dashoffset={100 - mine.progress * 100} />
      </svg>
      <Pause size={16} strokeWidth={2} />
    {:else}
      <Play size={16} strokeWidth={2} />
    {/if}
  </button>
{/snippet}

<!-- What a row or the summary says under the name: the preview's state while it runs, else the detail. -->
{#snippet statusLine(id: string, detail: string)}
  {@const mine = preview?.id === id ? preview : null}
  <span class="voice-lang" class:live={mine} aria-live="polite">
    {#if mine?.phase === "preparing"}
      {m.narrator_settings_preparing()}
    {:else if mine}
      {m.narrator_settings_playing()}
    {:else}
      {detail}
    {/if}
  </span>
{/snippet}

<!-- Under a row or the summary: the sentence being read with its current word marked the way the
     reader marks it, or why the preview could not play. -->
{#snippet previewExtras(id: string)}
  {#if preview?.id === id && preview.phase === "playing"}
    {@const at = preview.word}
    <p class="sample" lang={preview.lang}>
      {#each sampleWords(preview.text) as word, i (i)}
        <span class="word {settings.highlight}" class:current={i === at} class:read={i < at}>{word}</span>{" "}
      {/each}
    </p>
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

<!-- One action per row. The check mark is for the voice that is speaking, and nothing else on the page. -->
{#snippet chooser(active: boolean, use: () => void, label: string)}
  {#if active}
    <span class="in-use"><Check size={15} strokeWidth={2.25} /> {m.narrator_settings_in_use()}</span>
  {:else}
    <button class="choose" onclick={use}>{label}</button>
  {/if}
{/snippet}

<!-- The steps to add voices to the device, behind a row. Written for the Mac only. -->
{#snippet addVoicesTip(label: string, note?: string)}
  <details class="tip">
    <summary class="extra">
      <span class="extra-text">
        <strong>{label}</strong>
        {#if note}<span>{note}</span>{/if}
      </span>
      <ChevronDown size={18} strokeWidth={1.75} />
    </summary>
    <p class="note">{m.narrator_settings_mac_tip()}</p>
  </details>
{/snippet}

<div class="narrator settings-page">
  <div class="wrap">
    <header class="head settings-head">
      <a class="back" href="/pdf" aria-label={m.narrator_back_to_library()}><ArrowLeft size={20} strokeWidth={1.75} /></a>
      <img class="mark" src={logoUrl} width="28" height="28" alt="" />
      <div>
        <h1>{m.narrator_settings_title()}</h1>
        <p>{m.narrator_settings_intro()}</p>
      </div>
    </header>

    <!-- Interface language: menus and messages only, never the voice that reads. Changing it reloads
         the page. First on the page, so someone who cannot read the current language finds it at once. -->
    <section class="card lang-card">
      <div class="lang-head">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
        </svg>
        <h2>{m.narrator_language()}</h2>
      </div>
      <div class="langs" role="group" aria-label={m.narrator_language()}>
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
      <p class="note">{m.narrator_language_note()}</p>
    </section>

    <section class="card">
      <h2>{m.narrator_settings_reading_voice()}</h2>

      <!-- The voice in use, whichever list is showing below. -->
      <div class="reading-with" class:pending={settings.engine === "natural" && !ready}>
        {#if settings.engine === "natural"}
          <div class="row">
            {#if ready}
              {@render previewButton("cur", naturalInUse.name, () => previewNatural(naturalInUse, "cur"))}
            {/if}
            <div class="voice-meta">
              {#if ready}
                <span class="caption"><Check size={14} strokeWidth={2.25} /> {m.narrator_settings_reading_with_natural()}</span>
              {:else}
                <!-- No check mark: it cannot speak yet. -->
                <span class="caption">{m.narrator_settings_chosen_later()}</span>
              {/if}
              <span class="current-name">{naturalInUse.name}</span>
              {@render statusLine("cur", naturalDetail(naturalInUse))}
            </div>
          </div>
        {:else if systemInUse}
          {@const v = systemInUse}
          <div class="row">
            {@render previewButton("cur", v.name, () => previewSystem(v.name, "cur"))}
            <div class="voice-meta">
              <span class="caption">
                <Check size={14} strokeWidth={2.25} />
                {v.name === settings.systemVoice
                  ? m.narrator_settings_reading_with_system()
                  : m.narrator_settings_reading_with_default()}
              </span>
              <span class="current-name">{v.name}</span>
              {@render statusLine("cur", systemDetail(v))}
            </div>
          </div>
          {#if defaultOtherLang}
            <p class="note why">{m.narrator_settings_default_other_lang({ lang: languageInSentence(uiLang) })}</p>
          {/if}
        {:else}
          <!-- A device with no voice of its own: the card stays and says so. The list below says what to do. -->
          <div class="voice-meta">
            <span class="caption">{m.narrator_settings_reading_with()}</span>
            <span class="current-name">{m.narrator_settings_no_voice_yet()}</span>
          </div>
        {/if}
        {@render previewExtras("cur")}
      </div>

      <!-- Which list shows below. Shown by a fill and a heavier name, never a check mark. -->
      <div class="switch" role="group" aria-label={m.narrator_settings_show_voices()}>
        <button class="seg" class:on={tab === "system"} aria-pressed={tab === "system"} onclick={() => (tab = "system")}>
          <strong>{m.narrator_engine_system()}</strong>
          <span class="seg-hint">{m.narrator_settings_engine_system_hint()}</span>
        </button>
        <button
          class="seg"
          class:on={tab === "natural"}
          aria-pressed={tab === "natural"}
          disabled={!naturalAvailable}
          onclick={() => (tab = "natural")}
        >
          <strong>{m.narrator_engine_natural()}</strong>
          <span class="seg-hint">
            {!naturalAvailable
              ? m.narrator_settings_natural_unavailable()
              : ready
                ? m.narrator_settings_engine_natural_ready()
                : m.narrator_settings_engine_natural_hint()}
          </span>
        </button>
      </div>

      {#if tab === "natural"}
        <h3>{m.narrator_natural_voice()}</h3>
        <p class="note">{m.narrator_settings_natural_intro()}</p>

        <div class="model-row">
          {#if ready}
            <span class="model-state ok" role="status"><Check size={16} strokeWidth={2.25} /> {m.narrator_settings_model_ready()}</span>
            <button class="remove" aria-label={m.narrator_settings_clear_download()} onclick={clearModel}>
              <Trash2 size={15} strokeWidth={1.75} />
              {m.narrator_settings_clear_download_short()}
            </button>
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
                <span class="bytes">
                  {m.narrator_settings_download_mb({
                    done: megabytes(dl.loadedBytes ?? 0),
                    total: dl.totalBytes ? megabytes(dl.totalBytes) : formatNumber(downloadMb),
                  })}
                </span>
              </div>
              <p class="hint">{m.narrator_settings_download_continues()}</p>
            </div>
          {:else if modelState === "error"}
            <!-- The one notice for a failed download, with the same ways out at every width. -->
            <Notice class="grow" title={m.narrator_settings_download_failed()} actions={downloadFailedActions}>
              {reason}
            </Notice>
          {:else}
            <Btn variant="primary" class="download-btn" onclick={downloadModel}>
              <Download size={16} strokeWidth={2} />
              {m.narrator_settings_download_now({ size: downloadMb })}
            </Btn>
          {/if}
        </div>

        <!-- The size, in one place: right under the button that names it. -->
        {#if showSize}
          {#if sizeChoice}
            <div class="sizes" role="group" aria-label={m.narrator_settings_model_quality()}>
              {#each KOKORO_QUALITIES as q (q.id)}
                <button
                  class="quality-opt"
                  class:on={settings.modelQuality === q.id}
                  aria-pressed={settings.modelQuality === q.id}
                  disabled={modelState === "downloading"}
                  onclick={() => setQuality(q.id)}
                >
                  <strong>{q.label}</strong>
                  <span>{m.narrator_settings_size_only({ size: kokoroDownloadMb(q.id) })}</span>
                </button>
              {/each}
            </div>
          {/if}
          <p class="hint">
            {onGpu
              ? m.narrator_settings_gpu_used()
              : sizeChoice
                ? m.narrator_settings_size_compact_note()
                : m.narrator_settings_gpu_unused()}
          </p>
        {/if}

        <!-- Said once, above the list, in place of a button on every row. -->
        {#if !ready}
          <p class="note list-note">{m.narrator_settings_one_download({ count: KOKORO_VOICES.length })}</p>
        {/if}

        <!-- Before the download a row is a name and "Choose". After it, a preview button and "Use".
             While the download has failed the rows wait: no action until it is tried again. -->
        <ul class="voices" class:quiet={modelState === "error"}>
          {#each KOKORO_VOICES as v (v.id)}
            {@const id = "nat:" + v.id}
            {@const chosen = settings.engine === "natural" && naturalInUse.id === v.id}
            <li class:active={chosen && ready} class:chosen={chosen && !ready} class:previewing={preview?.id === id}>
              <div class="row">
                {#if ready}
                  {@render previewButton(id, v.name, () => previewNatural(v))}
                {/if}
                <div class="voice-meta">
                  <span class="voice-name">{v.name}</span>
                  {@render statusLine(id, naturalDetail(v))}
                </div>
                {#if chosen && !ready}
                  <!-- The summary above says when it will read. No check mark: it cannot speak yet. -->
                  <span class="in-use">{m.narrator_settings_chosen()}</span>
                {:else if ready || modelState !== "error"}
                  {@render chooser(
                    chosen,
                    () => {
                      settings.update("naturalVoice", v.id);
                      settings.update("engine", "natural");
                    },
                    ready ? m.narrator_settings_use() : m.narrator_settings_choose(),
                  )}
                {/if}
              </div>
              {@render previewExtras(id)}
            </li>
          {/each}
        </ul>
      {:else}
        <h3>{m.narrator_settings_system_voices()}</h3>
        {#if voiceCatalog.voices.length === 0}
          <Notice tone="info" title={m.narrator_settings_no_voices_title()} actions={noVoicesActions}>
            {m.narrator_settings_no_voices()}
          </Notice>
          {#if isMac}
            <div class="extras">
              {@render addVoicesTip(m.narrator_settings_add_voices_how())}
            </div>
          {/if}
        {:else}
          <p class="note">{m.narrator_settings_system_note()}</p>
          <!-- Offered only where it changes the list: the device has voices in this language and in others. -->
          {#if hasMyLang && hasOtherLang}
            <div class="filters" role="group" aria-label={m.narrator_settings_filters_label()}>
              <button class="chip" class:on={onlyLang} aria-pressed={onlyLang} onclick={() => (langChoice = true)}>
                {languageName(uiLang)}
              </button>
              <button class="chip" class:on={!onlyLang} aria-pressed={!onlyLang} onclick={() => (langChoice = false)}>
                {m.narrator_settings_all_languages()}
              </button>
            </div>
          {/if}
          {#if systemVoices.length === 0}
            <!-- Only one thing can empty the list: internet voices hidden while this language has no other kind. -->
            <Notice
              tone="info"
              title={m.narrator_settings_none_local_title({ lang: languageInSentence(uiLang) })}
              actions={[
                { label: m.narrator_settings_show_network_all(), primary: true, onclick: () => (networkChoice = true) },
                { label: m.narrator_settings_show_all_languages(), onclick: () => (langChoice = false) },
              ]}
            >
              {m.narrator_settings_none_local({ lang: languageInSentence(uiLang) })}
            </Notice>
          {:else}
            <ul class="voices">
              {#each systemVoices as v (v.voiceURI)}
                {@const id = "sys:" + v.name}
                {@const active = settings.engine === "system" && systemInUse?.name === v.name}
                <li class:active class:previewing={preview?.id === id}>
                  <div class="row">
                    {@render previewButton(id, v.name, () => previewSystem(v.name))}
                    <div class="voice-meta">
                      <span class="voice-name">{v.name}</span>
                      {@render statusLine(id, systemDetail(v))}
                    </div>
                    {@render chooser(
                      active,
                      () => {
                        settings.update("systemVoice", v.name);
                        settings.update("engine", "system");
                      },
                      m.narrator_settings_use(),
                    )}
                  </div>
                  {@render previewExtras(id)}
                </li>
              {/each}
            </ul>
          {/if}
          <!-- Two rows under the list, each a name and a line that says what it does. -->
          {#if (systemVoices.length > 0 && networkCount > 0 && hasLocal) || isMac}
            <div class="extras">
              <!-- Voices that need the internet, where the device also has its own to fall back on. -->
              {#if systemVoices.length > 0 && networkCount > 0 && hasLocal}
                <button class="extra more" aria-expanded={withNetwork} onclick={() => (networkChoice = !withNetwork)}>
                  <span class="extra-text">
                    <strong>
                      {withNetwork
                        ? m.narrator_settings_hide_network()
                        : m.narrator_settings_show_network({ count: networkCount })}
                    </strong>
                    <span>{m.narrator_settings_network_note()}</span>
                  </span>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    {#if !withNetwork}<path d="M12 5v14" />{/if}
                  </svg>
                </button>
              {/if}
              {#if isMac}
                {@render addVoicesTip(m.narrator_settings_better_voices(), m.narrator_settings_better_voices_note())}
              {/if}
            </div>
          {/if}
        {/if}
      {/if}
    </section>
  </div>
</div>

<style>
  /* The title bar's line runs the width of the window. Clipped here, so it never adds a sideways scroll. */
  .settings-page {
    overflow-x: clip;
  }
  .wrap {
    /* The one accent for "in use" and progress. */
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

  /* ---- interface language: a labelled block ---- */
  .lang-card {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px 20px;
    padding-block: 16px;
  }
  .lang-head {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--n-fg-1);
  }
  .lang-card .note {
    grid-column: 1 / -1;
    margin: 0;
  }
  .langs {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
  }
  .lang {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-0);
    color: var(--n-fg-0);
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .lang:hover:not(.on) {
    background: var(--n-bg-2);
  }
  .lang.on {
    border-color: var(--acc-line);
    background: var(--acc-tint);
  }
  .lang.on :global(svg) {
    flex-shrink: 0;
    color: var(--acc);
  }

  /* ---- the voice in use ---- */
  /* Not named "current": that is the class of the word being read in a sample. */
  .reading-with {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--acc-line);
    background: var(--acc-tint);
  }
  /* Chosen, but it cannot read yet: the outline is there, the fill is not. */
  .reading-with.pending {
    border-style: dashed;
    background: transparent;
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
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--n-fg-1);
  }
  .caption :global(svg) {
    flex-shrink: 0;
    color: var(--acc);
  }
  .current-name {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--n-fg-0);
    overflow-wrap: anywhere;
  }
  .reading-with .why {
    margin-top: 8px;
    color: var(--n-fg-1);
  }

  /* ---- System or Natural ---- */
  .switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-top: 14px;
    padding: 4px;
    border-radius: 14px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  .seg {
    min-height: 56px;
    min-width: 0;
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
    font-weight: 600;
    color: var(--n-fg-1);
  }
  .seg-hint {
    font-size: 14px;
    line-height: 1.3;
    color: var(--n-fg-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .seg:hover:not(:disabled, .on) {
    background: var(--n-bg-1);
  }
  /* The list showing: a fill, a brighter edge and a heavier name. */
  .seg.on {
    background: var(--n-bg-3);
    border-color: var(--acc-line);
  }
  .seg.on strong {
    font-weight: 800;
    color: var(--n-fg-0);
  }
  .seg.on .seg-hint {
    color: var(--n-fg-1);
  }
  .seg:disabled {
    cursor: not-allowed;
  }
  .seg:disabled strong {
    color: var(--n-fg-2);
  }
  .seg:disabled .seg-hint {
    white-space: normal;
  }

  /* ---- the natural voices' download ---- */
  .model-row {
    display: flex;
    align-items: center;
    gap: 10px 14px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .model-row :global(.grow) {
    flex: 1 1 100%;
  }
  /* The button and the size choice under it share one width. */
  .model-row :global(.download-btn) {
    width: min(400px, 100%);
    font-size: 15px;
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
    white-space: nowrap;
  }
  .model-state.ok :global(svg) {
    flex-shrink: 0;
    color: var(--n-success);
  }
  /* Quiet beside the status it undoes: a bin and one word, 44 px tall. */
  .remove {
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .remove:hover {
    color: var(--n-danger);
  }
  .hint {
    margin: 8px 0 0;
    font-size: 14px;
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

  /* ---- the download's size: two options under the button, the chosen one filled ---- */
  .sizes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    max-width: 400px;
    margin-top: 10px;
    padding: 4px;
    border-radius: 12px;
    background: var(--n-bg-0);
    border: 1px solid var(--n-border-2);
  }
  .quality-opt {
    min-height: 44px;
    min-width: 0;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 14px;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .quality-opt strong {
    font-weight: 600;
  }
  .quality-opt:hover:not(:disabled, .on) {
    background: var(--n-bg-1);
  }
  .quality-opt.on {
    background: var(--n-bg-3);
    border-color: var(--acc-line);
    color: var(--n-fg-0);
  }
  .quality-opt.on strong {
    font-weight: 800;
  }
  .quality-opt:disabled {
    cursor: not-allowed;
  }
  /* Mid download the other size cannot be taken: it steps back, the one on its way stays whole. */
  .quality-opt:disabled:not(.on) {
    color: var(--n-fg-3);
  }
  .list-note {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
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
  .list-note + .voices {
    margin-top: 6px;
  }
  .voices li {
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid transparent;
  }
  .voices li .row {
    min-height: 44px;
  }
  /* The row being heard, whether or not it is the one in use. */
  .voices li.previewing {
    background: var(--n-bg-2);
    border-color: var(--n-border-2);
  }
  .voices li.active {
    background: var(--acc-tint);
    border-color: var(--acc-line);
  }
  /* Chosen before it can speak: the same dashed outline as the summary above. */
  .voices li.chosen {
    border: 1px dashed var(--acc-line);
  }
  /* The download failed: the rows wait, with nothing to press until it is tried again. */
  .voices.quiet .voice-name {
    font-weight: 500;
    color: var(--n-fg-1);
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
  .preview:hover {
    background: var(--n-bg-3);
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
    stroke-width: 4.5;
  }
  .arc .track {
    stroke: var(--n-border-3);
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
    font-size: 14px;
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
    white-space: nowrap;
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
    padding: 0 6px 0 10px;
    color: var(--n-fg-0);
  }
  .in-use :global(svg) {
    color: var(--acc);
  }
  /* The sentence being read. Words already spoken step back, the current one carries the reader's mark. */
  .sample {
    margin: 8px 0 4px 56px;
    padding-left: 12px;
    border-left: 2px solid var(--acc);
    font-size: 16px;
    line-height: 1.6;
    color: var(--n-fg-0);
  }
  .sample .read {
    color: var(--n-fg-2);
  }
  .card :global(.row-notice) {
    margin: 10px 0 4px;
  }
  .card :global(.notice:not(.row-notice, .grow)) {
    margin-top: 12px;
  }

  /* ---- system voices: which languages ---- */
  .filters {
    display: inline-flex;
    gap: 4px;
    margin-top: 12px;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid var(--n-border-2);
    background: var(--n-bg-0);
    max-width: 100%;
  }
  .chip {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--n-fg-1);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .chip:hover:not(.on) {
    color: var(--n-fg-0);
  }
  /* Which voices are listed: a fill and a heavier name, like the switch above. */
  .chip.on {
    border-color: var(--acc-line);
    background: var(--n-bg-3);
    color: var(--n-fg-0);
    font-weight: 800;
  }

  /* ---- rows under the system list: the voices that need the internet, and how to add voices ---- */
  .extras {
    margin-top: 12px;
    border-top: 1px solid var(--n-border-1);
  }
  .extra {
    width: 100%;
    min-height: 56px;
    padding: 8px 10px;
    border: 0;
    border-bottom: 1px solid var(--n-border-1);
    background: none;
    color: var(--n-fg-0);
    font: inherit;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    list-style: none;
  }
  .extra::-webkit-details-marker {
    display: none;
  }
  .extra:hover {
    background: var(--n-bg-2);
  }
  .extra-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .extra-text strong {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
  }
  .extra-text span {
    font-size: 14px;
    line-height: 1.4;
    color: var(--n-fg-2);
  }
  .extra :global(svg) {
    flex-shrink: 0;
    color: var(--n-fg-1);
    transition: transform var(--n-dur-2) var(--n-ease-out);
  }
  .tip[open] .extra :global(svg) {
    transform: rotate(180deg);
  }
  .tip .note {
    margin: 0;
    padding: 12px 10px 14px;
    border-bottom: 1px solid var(--n-border-1);
    color: var(--n-fg-1);
  }

  @media (min-width: 561px) {
    /* The title is a bar at the top of the window, at rest and while the lists scroll under it:
       a solid surface with a line under it. */
    .wrap {
      padding-top: 0;
    }
    .head {
      position: sticky;
      top: 0;
      z-index: 5;
      padding: 12px 0;
    }
    .head::before {
      content: "";
      position: absolute;
      inset: 0 calc(50% - 50vw);
      z-index: -1;
      background: var(--n-bg-0);
      border-bottom: 1px solid var(--n-border-2);
    }
    /* Anything scrolled or focused into view lands clear of the bar (77 px) with a little air. */
    :global(html:has(.settings-head)) {
      scroll-padding-top: 96px;
    }
  }

  @media (max-width: 560px) {
    .wrap {
      gap: 14px;
    }
    /* The ring is decoration: without it the title lines up beside the back button. */
    .mark,
    .head p {
      display: none;
    }
    .head h1 {
      font-size: 24px;
    }
    .card {
      position: relative;
      padding: 16px;
    }
    .card h3 + :is(.note, :global(.notice)) {
      margin-top: 14px;
    }
    /* The switch right above the list already names it, so its heading is read out and not shown. */
    .card h3 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    /* The name, then the four languages two by two, each whole, then what the choice changes. */
    .lang-card {
      display: block;
    }
    .langs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }
    .lang {
      min-height: 48px;
      padding: 0 12px;
      border-radius: 12px;
      justify-content: space-between;
    }
    .lang-card .note {
      margin-top: 8px;
    }
    .model-row :global(.download-btn) {
      flex: 1 1 100%;
    }
    .sizes {
      max-width: none;
    }
    .voices li {
      padding: 6px 4px;
    }
    .row {
      gap: 8px;
    }
    .choose {
      padding: 0 12px;
    }
    .sample {
      margin-left: 0;
    }
    .extra {
      padding-inline: 6px;
    }
    .tip .note {
      padding-inline: 6px;
    }
  }
</style>
