<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Audio takes from the microphone. The mic starts only when armed, stops on
  // leaving; takes go to OPFS (music-take-<id>) with a row in db.audioTakes.
  // Playback gain never rewrites the recording.
  import { onDestroy, onMount, tick } from "svelte";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Mic from "@lucide/svelte/icons/mic";
  import Check from "@lucide/svelte/icons/check";
  import Download from "@lucide/svelte/icons/download";
  import FileMusic from "@lucide/svelte/icons/file-music";
  import Trash from "@lucide/svelte/icons/trash-2";
  import Dots from "@lucide/svelte/icons/ellipsis";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import * as Menu from "@repo/ui/dropdown-menu";
  import { LEVEL_FLOOR_DB, levelAdvice } from "@repo/music-core/signal/level";
  import { btn } from "#lib/music/components/ui.ts";
  import { inputName, micOptions } from "#lib/music/hubs/connect/rig.ts";
  import { audio, db, deleteBinary, getBinary, mic, putBinary, settings, type AudioTakeRow, type SequenceHandle } from "#lib/music/runtime/index.ts";
  import RecordButton from "./RecordButton.svelte";
  import { download } from "./files";
  import { autoGainDb, BOOST_RANGE, clipWarning, envelope, ENVELOPE_BUCKETS, extensionFor, GAIN_RANGE, peakDbOf, savedTakesLabel, signedDb, suggestedBoost, takeKey } from "./audioTakes";
  import { clock, fileStem, takeLength, TAKE_LIMIT_MS } from "#lib/music/takes.ts";
  import Picker from "#lib/music/components/Picker.svelte";

  let { announce }: { announce: (msg: string) => void } = $props();

  type Take = AudioTakeRow & { name: string; durationMs: number; envelope: number[]; mimeType: string; size: number };

  let takes = $state<Take[]>([]);
  let deviceId = $state(settings.value.audioInputDeviceId ?? "");
  let recording = $state(false);
  let elapsed = $state(0);
  let hold = $state(LEVEL_FLOOR_DB);
  let unsaved = $state<{ take: Take; blob: Blob; error: string } | null>(null);
  let player = $state<{ id: string; handle: SequenceHandle; durationMs: number } | null>(null);
  // Recording boost (dB before the encoder) and a clock for the playback cursor.
  let boost = $state(settings.value.recordBoostDb ?? 0);
  let now = $state(0);
  let confirmDelete = $state<string | null>(null);
  /** The take saved on this visit, marked in the list. */
  let latest = $state<string | null>(null);
  /** The live input as a scrolling trace: recent peaks, 0..1, newest last. */
  let trace = $state<number[]>([]);
  const TRACE = 96;
  let traceAt = 0;

  let rec: { stop(): Promise<Blob>; setBoost(db: number): void } | null = null;
  let t0 = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let holdAt = 0;

  onMount(() => {
    void db.audioTakes
      .orderBy("createdAt")
      .reverse()
      .toArray()
      .then((rows) => (takes = rows.filter((r) => Array.isArray(r.envelope)) as Take[]));
    void mic.refreshDevices();
    // Peak hold: the loudest recent peak, released after 1.5 s.
    let raf = requestAnimationFrame(function step() {
      const t = performance.now();
      now = t;
      if (mic.peak >= hold || t - holdAt > 1500) {
        hold = mic.peak;
        holdAt = t;
      }
      if (mic.state === "on" && t - traceAt > 50) {
        traceAt = t;
        trace = [...trace.slice(1 - TRACE), pct(mic.peak + boost) / 100];
      }
      raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  });

  async function arm() {
    if (mic.state === "on") {
      if (recording) await stopRecording();
      mic.stop();
      return announce(m.music_hubs_mic_off());
    }
    const ok = await mic.start(deviceId ? { deviceId } : {});
    announce(ok ? m.music_hubs_ar_mic_on() : mic.error);
  }

  async function toggle() {
    if (recording) return stopRecording();
    // Record arms the microphone itself (the browser asks the first time), then records.
    if (mic.state !== "on") {
      announce(m.music_hubs_tuner_starting());
      if (!(await mic.start(deviceId ? { deviceId } : {}))) return announce(mic.error || m.music_hubs_mic_failed());
    }
    await audio.unlock();
    stopPlayback();
    try {
      rec = mic.record(boost);
    } catch (e) {
      return announce((e as Error).message);
    }
    t0 = performance.now();
    elapsed = 0;
    trace = [];
    recording = true;
    timer = setInterval(() => {
      elapsed = performance.now() - t0;
      if (elapsed >= TAKE_LIMIT_MS) void stopRecording(m.music_hubs_mr_limit());
    }, 200);
    announce(m.music_hubs_ar_recording());
  }

  async function stopRecording(reason?: string) {
    if (!recording || !rec) return;
    recording = false;
    clearInterval(timer);
    const durationMs = Math.round(performance.now() - t0);
    const blob = await rec.stop();
    rec = null;
    let env: number[] = [];
    try {
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
      env = envelope(buf.getChannelData(0), ENVELOPE_BUCKETS);
    } catch {
      // Undecodable here (some containers): keep the take, draw a flat line.
    }
    const id = crypto.randomUUID();
    const take: Take = {
      id,
      createdAt: Date.now(),
      name: m.music_hubs_ar_take_n({ n: takes.length + 1 }),
      durationMs,
      envelope: env,
      mimeType: blob.type || "audio/webm",
      size: blob.size,
      // Start quiet takes at a -3 dB peak on playback; the file is untouched.
      gainDb: autoGainDb(peakDbOf(env)),
      note: "",
      instrument: settings.value.activeInstrument,
    };
    await save(take, blob, reason);
  }

  /** OPFS first, then the row, so a row never points at a missing file. */
  async function save(take: Take, blob: Blob, reason?: string) {
    try {
      await putBinary(takeKey(take.id), blob);
      await db.audioTakes.put(take);
    } catch (e) {
      unsaved = { take, blob, error: (e as Error).message };
      return announce(m.music_hubs_ar_not_saved({ reason: (e as Error).message }));
    }
    unsaved = null;
    takes = [take, ...takes];
    latest = take.id;
    announce(reason ?? m.music_hubs_ar_saved({ name: take.name, length: takeLength(take.durationMs) }));
    // Bring the new take, with its Transcribe and Download, into view above the tab bar.
    await tick();
    document.querySelector(`[data-audio-take="${take.id}"]`)?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function stopPlayback() {
    player?.handle.stop();
    player = null;
  }

  async function play(take: Take) {
    if (player?.id === take.id) {
      stopPlayback();
      return announce(m.music_hubs_ar_stopped({ name: take.name }));
    }
    stopPlayback();
    await audio.unlock();
    const blob = await getBinary(takeKey(take.id));
    if (!blob) return announce(m.music_hubs_ar_missing_storage({ name: take.name }));
    try {
      const handle = await audio.playBlob(blob, take.gainDb ?? 0);
      player = { id: take.id, handle, durationMs: take.durationMs };
      if (take.envelope.length < ENVELOPE_BUCKETS) void refine(take, blob);
      announce(m.music_hubs_ar_playing({ name: take.name, gain: signedDb(take.gainDb ?? 0) }));
      void handle.done.then(() => {
        if (player?.handle === handle) player = null;
      });
    } catch (e) {
      announce((e as Error).message);
    }
  }

  /** Older takes were drawn coarsely; redraw them finer the first time they play. */
  async function refine(take: Take, blob: Blob) {
    try {
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
      await patch(take, { envelope: envelope(buf.getChannelData(0), ENVELOPE_BUCKETS) });
    } catch {
      // Keep the coarse drawing.
    }
  }

  /** Live while dragging: the take that is sounding follows the slider. */
  function previewGain(take: Take, db: number) {
    takes = takes.map((t) => (t.id === take.id ? { ...t, gainDb: db } : t));
    if (player?.id === take.id) player.handle.setGain(db);
  }

  function setBoost(db: number) {
    boost = db;
    rec?.setBoost(db);
    void settings.update({ recordBoostDb: db });
  }

  const progress = (take: Take) =>
    player?.id === take.id ? Math.max(0, Math.min(1, (now - player.handle.startPerf) / Math.max(1, player.durationMs))) : null;

  async function patch(take: Take, change: Partial<Take>) {
    await db.audioTakes.update(take.id, change);
    takes = takes.map((t) => (t.id === take.id ? { ...t, ...change } : t));
  }

  async function downloadTake(take: Take) {
    const blob = await getBinary(takeKey(take.id));
    if (!blob) return announce(m.music_hubs_ar_missing({ name: take.name }));
    const name = `${fileStem(take.name)}.${extensionFor(take.mimeType)}`;
    download(blob, name);
    announce(m.music_hubs_mr_downloading({ name }));
  }

  async function remove(take: Take, e?: Event) {
    if (confirmDelete !== take.id) {
      e?.preventDefault(); // keep the menu open for the second tap
      return void (confirmDelete = take.id);
    }
    confirmDelete = null;
    if (player?.id === take.id) stopPlayback();
    await db.audioTakes.delete(take.id);
    await deleteBinary(takeKey(take.id)).catch(() => {});
    takes = takes.filter((t) => t.id !== take.id);
    announce(m.music_hubs_tracks_deleted({ name: take.name }));
  }

  const pct = (db: number) => Math.max(0, Math.min(100, ((db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB) * 100));
  const ADVICE: Record<string, string> = {
    clipping: m.music_hubs_ar_advice_clipping(),
    hot: m.music_hubs_ar_advice_hot(),
    good: m.music_hubs_ar_advice_good(),
    quiet: m.music_hubs_ar_advice_quiet(),
  };
  const live = $derived(mic.state === "on");
  // What the recording will actually get: the input plus the boost.
  const boostedPeak = $derived(mic.peak + boost);
  const boostedAdvice = $derived(levelAdvice(boostedPeak));
  const suggestion = $derived(live ? suggestedBoost(hold + boost, boost) : boost);

  onDestroy(() => {
    if (recording) void stopRecording();
    stopPlayback();
    mic.stop();
  });
</script>

<section class="stage relative flex flex-col gap-5 overflow-hidden rounded-3xl p-4 sm:p-6" aria-label={m.music_hubs_ar_label()}>
  <div class="flex flex-wrap items-end gap-3">
    {#if live}
      <p class="min-w-0 flex-1 basis-56 text-sm"><span class="text-ws-stage-soft">{m.music_hubs_ar_input_colon()}</span> <span class="font-medium">{inputName(settings.value.audioInputDeviceId, settings.value.audioInputLabel)}</span></p>
    {:else}
    <div class="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm">
      <span class="text-ws-stage-soft">{m.music_hubs_ar_input()}</span>
      <Picker
        tone="stage"
        label={m.music_hubs_ar_input()}
        value={deviceId}
        disabled={live}
        options={micOptions(mic.devices, settings.value.audioInputDeviceId, settings.value.audioInputLabel)}
        onchange={(v) => {
          deviceId = v;
          const d = mic.devices.find((x) => x.deviceId === v);
          void settings.update({ audioInputDeviceId: v || undefined, audioInputLabel: d?.label ?? "Default input" });
        }}
      />
    </div>
    {/if}
    <button type="button" class="flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold {live ? 'bg-ws-stage-ink text-ws-stage' : 'bg-ws-stage-ink/10 text-ws-stage-ink hover:bg-ws-stage-ink/20'}" aria-pressed={live} onclick={arm}>
      <Mic class="size-4" aria-hidden="true" />{live ? m.music_hubs_ar_mic_on_button() : mic.state === "starting" ? m.music_hubs_mic_starting() : m.music_hubs_ar_arm()}
    </button>
  </div>

  {#if mic.state === "denied" || mic.state === "error"}
    <p class="rounded-xl bg-destructive/15 px-3 py-2 text-sm" role="alert">{mic.error}</p>
  {/if}

  <div class="flex items-center gap-4 sm:gap-5">
    <RecordButton {recording} disabled={mic.state === "starting"} onclick={toggle} />
    <div class="min-w-0 flex-1">
      <p class="tnum font-display text-4xl font-semibold tracking-tight sm:text-6xl">{clock(recording ? elapsed : 0)}</p>
      <!-- During a take: where it is in bars, counted at the strip's tempo in 4/4 (no click plays). -->
      {#if recording}
        {@const beat = Math.floor(elapsed / (60000 / settings.value.bpm))}
        <p class="tnum mt-1 text-sm"><span class="font-semibold">{m.music_hubs_ar_bar_beat({ bar: Math.floor(beat / 4) + 1, beat: (beat % 4) + 1 })}</span> <span class="text-ws-stage-soft">{m.music_hubs_ar_at_bpm({ bpm: settings.value.bpm })}</span></p>
      {/if}
      <div class="meter mt-2" data-tone={live ? boostedAdvice.tone : undefined} aria-hidden="true">
        <span class="fill" style:width="{live ? pct(boostedPeak) : 0}%"></span>
        <span class="hold" style:left="{live ? pct(hold + boost) : 0}%"></span>
        {#each [-30, -6, -1] as mark (mark)}<span class="mark" style:left="{pct(mark)}%"></span>{/each}
      </div>
      <div class="mt-1 flex justify-between text-[0.8125rem] text-ws-stage-soft" aria-hidden="true"><span>−60 dB</span><span>−30</span><span>−6</span><span>0</span></div>
      <p class="mt-2 text-sm" data-testid="level-advice">
        {#if live}
          <!-- While a take runs, the line says so: "ready to record" would contradict the timer. -->
          {#if recording}{m.music_hubs_ar_recording_short()}{/if}
          <strong>{boostedAdvice.label}</strong>{#if recording && boostedAdvice.tone === "good"}.{:else}: {ADVICE[boostedAdvice.tone]}{/if} {m.music_hubs_ar_peak()} <span class="tnum">{Math.round(boostedPeak)}</span> {boost ? m.music_hubs_ar_db_boost({ boost: signedDb(boost) }) : m.music_hubs_ar_db()}
        {:else}
          <span class="text-ws-stage-soft">{m.music_hubs_ar_press_record()}</span>
        {/if}
      </p>
    </div>
  </div>
  {#if live}
    <!-- What the microphone hears right now, scrolling: it turns red while recording. -->
    <figure class="flex flex-col gap-1">
      <svg viewBox="0 0 {TRACE} 20" preserveAspectRatio="none" class="h-16 w-full rounded-lg bg-ws-stage-ink/5" aria-hidden="true">
        <line x1="0" x2={TRACE} y1="10" y2="10" class="mid" vector-effect="non-scaling-stroke" />
        {#each trace as p, k (k)}
          {@const h = Math.max(0.3, p * 9.5)}
          <rect x={TRACE - trace.length + k + 0.15} y={10 - h} width="0.7" height={2 * h} class={recording ? "live rec" : "live"} />
        {/each}
      </svg>
      <figcaption class="text-[0.8125rem] text-ws-stage-soft">{recording ? m.music_hubs_ar_trace_rec() : m.music_hubs_ar_trace_live()}</figcaption>
    </figure>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm">
          <span class="text-ws-stage-soft">{m.music_hubs_ar_boost()}</span>
          <input
            type="range"
            min={BOOST_RANGE.min}
            max={BOOST_RANGE.max}
            step="1"
            value={boost}
            class="min-h-11 w-40 accent-[var(--instr)]"
            aria-valuetext={signedDb(boost)}
            oninput={(e) => setBoost(e.currentTarget.valueAsNumber)}
          />
          <span class="tnum w-14 font-semibold">{signedDb(boost)}</span>
        </label>
        {#if live && suggestion > boost + 2}
          <button type="button" class="min-h-11 rounded-full bg-instr px-4 text-sm font-semibold text-ws-stage" onclick={() => setBoost(suggestion)}>
            {m.music_hubs_ar_boost_to({ db: signedDb(suggestion) })}
          </button>
        {/if}
  </div>

</section>

{#if unsaved}
  <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-warn p-4" role="alert">
    <p class="min-w-0 flex-1 text-sm">{m.music_hubs_ar_unsaved({ name: unsaved.take.name, reason: unsaved.error })}</p>
    <button type="button" class={btn} onclick={() => unsaved && save(unsaved.take, unsaved.blob)}>{m.music_hubs_ar_save_again()}</button>
    <button type="button" class={btn} onclick={() => unsaved && download(unsaved.blob, `${fileStem(unsaved.take.name)}.${extensionFor(unsaved.take.mimeType)}`)}>{m.music_hubs_ar_download_instead()}</button>
  </div>
{/if}

<section aria-labelledby="audio-takes" class="flex flex-col gap-3">
  <h2 id="audio-takes" class="font-display text-2xl font-semibold tracking-tight">{m.music_hubs_ar_takes()} <span class="tnum text-base font-normal text-ws-soft">{savedTakesLabel(takes.length)}</span></h2>
  <!-- The take being recorded sits apart from the saved list, so the count never disagrees with it. -->
  {#if recording}
    <p class="flex items-center gap-2 rounded-2xl border border-dashed border-ws-line p-4 font-medium"><span class="rec-dot shrink-0" aria-hidden="true"></span><span>{m.music_hubs_ar_recording_new()} <span class="tnum">{clock(elapsed)}</span>{m.music_hubs_ar_joins()}</span></p>
  {/if}
  {#if takes.length}
    <ul class="divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface">
      {#each takes as take (take.id)}
        {@const isPlaying = player?.id === take.id}
        {@const gain = take.gainDb ?? 0}
        {@const warn = clipWarning(peakDbOf(take.envelope), gain)}
        {@const pos = progress(take)}
        {@const n = Math.max(1, take.envelope.length)}
        <li class="flex flex-col gap-3 p-3 sm:p-4 {take.id === latest ? 'bg-instr-wash/40' : ''}" data-audio-take={take.id}>
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="grid size-12 shrink-0 place-items-center rounded-full {isPlaying ? 'bg-ws-ink text-ws-bg' : 'bg-instr text-ws-stage hover:brightness-105'}"
              aria-label={isPlaying ? m.music_hubs_ar_stop_name({ name: take.name }) : m.music_hubs_mr_play({ name: take.name })}
              aria-pressed={isPlaying}
              onclick={() => play(take)}
            >
              {#if isPlaying}<Square class="size-5" aria-hidden="true" />{:else}<Play class="size-5" aria-hidden="true" />{/if}
            </button>
            <input
              class="min-h-11 min-w-0 flex-1 basis-40 rounded-lg border border-transparent bg-transparent px-2 font-display text-lg font-semibold hover:border-ws-line focus:border-ws-line"
              value={take.name}
              aria-label={m.music_hubs_mr_take_name()}
              onchange={(e) => patch(take, { name: e.currentTarget.value.trim() || take.name })}
            />
            <span class="tnum text-sm text-ws-soft">{takeLength(take.durationMs)}</span>
            {#if take.id === latest}<span class="flex items-center gap-1 rounded-full bg-instr-wash px-2.5 py-1 text-[13px] font-semibold text-instr-ink"><Check class="size-3.5" aria-hidden="true" />{m.music_hubs_ar_just()}</span>{/if}
            <!-- The next step after listening: record it again, or turn it into notes. The rest waits in the menu. -->
            {#if take.id === latest && !recording}
              <button type="button" class="{btn} px-3" onclick={() => (scrollTo({ top: 0, behavior: "smooth" }), toggle())}><RotateCcw class="size-4" aria-hidden="true" />{m.music_hubs_ar_again()}</button>
            {/if}
            <a class="{btn} px-3" href="/music/studio?tab=import&from=audio&take={take.id}"><FileMusic class="size-4" aria-hidden="true" />{m.music_hubs_tv_transcribe()}</a>
            <Menu.Root onOpenChange={(open) => !open && confirmDelete === take.id && (confirmDelete = null)}>
              <Menu.Trigger class="grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink" aria-label={m.music_hubs_ar_more_for({ name: take.name })}><Dots class="size-5" aria-hidden="true" /></Menu.Trigger>
              <Menu.Content align="end" class="w-60">
                <Menu.Item onSelect={() => downloadTake(take)}><Download class="size-4" aria-hidden="true" />{m.music_hubs_ar_download()}</Menu.Item>
                <Menu.Item class={confirmDelete === take.id ? "text-destructive" : ""} onSelect={(e) => remove(take, e)}
                  ><Trash class="size-4" aria-hidden="true" />{confirmDelete === take.id ? m.music_hubs_ar_delete_tap({ name: take.name }) : m.music_hubs_mr_delete({ name: take.name })}</Menu.Item
                >
              </Menu.Content>
            </Menu.Root>
          </div>
          <svg viewBox="0 0 {n} 20" preserveAspectRatio="none" class="wave h-16 w-full rounded-lg" aria-hidden="true">
            {#each take.envelope as p, k (k)}
              {@const lifted = p * 10 ** (gain / 20)}
              {@const h = Math.min(1, lifted) * 9.5}
              <rect
                x={k + 0.1}
                y={10 - h}
                width="0.8"
                height={Math.max(0.25, 2 * h)}
                fill={lifted >= 0.89 ? "var(--destructive)" : `color-mix(in oklch, var(--hue-aerophone), var(--hue-mpc) ${Math.round(Math.min(1, lifted) * 100)}%)`}
                opacity={pos === null || k / n <= pos ? 1 : 0.45}
              />
            {/each}
            {#if pos !== null}<line x1={pos * n} x2={pos * n} y1="0" y2="20" class="cursor" vector-effect="non-scaling-stroke" />{/if}
          </svg>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label class="flex items-center gap-2 text-sm">
              <span class="text-ws-soft">{m.music_hubs_ar_gain()}</span>
              <input
                type="range"
                min={GAIN_RANGE.min}
                max={GAIN_RANGE.max}
                step="1"
                value={gain}
                class="min-h-11 w-40 accent-[var(--instr)]"
                aria-valuetext={signedDb(gain)}
                oninput={(e) => previewGain(take, e.currentTarget.valueAsNumber)}
                onchange={(e) => patch(take, { gainDb: e.currentTarget.valueAsNumber })}
              />
              <span class="tnum w-14 font-semibold">{signedDb(gain)}</span>
            </label>
            {#if gain > 0}<span class="text-sm text-ws-soft">{m.music_hubs_ar_louder({ db: gain })}</span>{:else if gain < 0}<span class="text-sm text-ws-soft">{m.music_hubs_ar_quieter({ db: -gain })}</span>{/if}
            <input
              class="min-h-11 min-w-0 flex-1 basis-48 rounded-lg border border-ws-line bg-transparent px-2 text-sm"
              value={take.note ?? ""}
              placeholder={m.music_hubs_ar_add_note()}
              aria-label={m.music_hubs_mr_note_for({ name: take.name })}
              onchange={(e) => patch(take, { note: e.currentTarget.value })}
            />
          </div>
          {#if warn}<p class="text-sm text-warn"><span aria-hidden="true">⚠</span> {warn}</p>{/if}
        </li>
      {/each}
    </ul>
    <p class="text-sm text-ws-soft">{m.music_hubs_ar_gain_hint()}</p>
  {:else if !recording}
    <p class="rounded-2xl border border-dashed border-ws-line p-5 text-ws-soft">{m.music_hubs_ar_none()}</p>
  {/if}
</section>

<style>
  .rec-dot {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 999px;
    background: var(--destructive);
  }
  .wave {
    background: var(--ws-stage);
  }
  .mid {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 20%, transparent);
    stroke-width: 1;
  }
  .live {
    fill: var(--success);
  }
  .live.rec {
    fill: var(--destructive);
  }
  .cursor {
    stroke: var(--ws-stage-ink);
    stroke-width: 2;
  }
  .meter {
    position: relative;
    height: 0.9rem;
    border-radius: 999px;
    background: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    background: var(--success);
    transition: width 60ms linear;
  }
  .meter[data-tone="quiet"] .fill {
    background: color-mix(in oklch, var(--ws-stage-ink) 45%, transparent);
  }
  .meter[data-tone="hot"] .fill {
    background: var(--warn);
  }
  .meter[data-tone="clipping"] .fill {
    background: var(--destructive);
  }
  .hold {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--ws-stage-ink);
  }
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in oklch, var(--ws-stage-ink) 35%, transparent);
  }
</style>
