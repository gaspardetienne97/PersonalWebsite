<script lang="ts">
  // Learn by ear from a recording you own: loop a stretch (A to B), slow it
  // down with the pitch kept, mark its sections, and play the part back with
  // what you play drawn over the loop. A Learn run is self-rated; Find home is
  // judged against the key the recording's chroma points to; Sing along grades
  // each sung note against what the recording sounds there. What you played or
  // sang can be saved as a lick and drilled in Phrases in any key.
  import { onDestroy, onMount } from "svelte";
  import { m } from "@repo/i18n/messages.js";
  import { intlLocale } from "@repo/i18n/format";
  import Upload from "@lucide/svelte/icons/upload";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";
  import { FLAT_NAMES, noteName, pc, type NoteEvent } from "@repo/music-core";
  import { homeTonics, rankKeys, regionChroma, type KeyGuess } from "@repo/music-core/signal/key";
  import { toMono } from "@repo/music-core/signal/chroma";
  import { gradeSingAlong, MIN_SUNG, type SingAlongResult, type SingPart } from "@repo/music-core/signal/sing-along";
  import { findHomeLesson } from "@repo/music-core/lessons/tier1";
  import DrillShell, { type Phase } from "#lib/music/components/DrillShell.svelte";
  import Results, { NOT_HEARD, silentRun, type RunSummary } from "#lib/music/components/Results.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import Picker from "#lib/music/components/Picker.svelte";
  import Stat from "#lib/music/components/Stat.svelte";
  import InstrumentStage from "#lib/music/components/InstrumentStage.svelte";
  import { Flashes } from "#lib/music/components/feedback.svelte.ts";
  import { btn, btnPrimary, btnStage, panel } from "#lib/music/components/ui.ts";
  import { DrillSetup } from "#lib/music/setup.svelte.ts";
  import { capture, pct, runInstrument, type Capture } from "#lib/music/drill.svelte.ts";
  import { practice } from "#lib/music/practice.svelte.ts";
  import { audio, db, getBinary, getSetting, mic, putSetting, settings, type EarPlayer } from "#lib/music/runtime/index.ts";
  import { estimateTempo } from "#lib/music/hubs/library/transcription.ts";
  import { saveUserLick, secondsToBeats } from "#lib/music/user-licks.ts";
  import { importTrack, listTracks, trackKey } from "#lib/music/drills/jam/tracks.ts";
  import { envelope, takeKey } from "#lib/music/hubs/create/audioTakes.ts";

  const cfg = new DrillSetup("by-ear", { mode: "learn", source: "", speed: "1", pitch: "0", part: "head" });
  const s = $derived(cfg.value);
  const mode = $derived(s.mode === "home" || s.mode === "sing" ? s.mode : "learn");
  /** Sing along: the tune (the head) or its roots. */
  const part = $derived<SingPart>(s.part === "roots" ? "roots" : "head");
  const PART_NAME: Record<SingPart, string> = {
    get head() {
      return m.music_drills_byear_part_tune();
    },
    get roots() {
      return m.music_drills_byear_part_roots();
    },
  };

  let phase = $state<Phase>("ready");
  let status = $state("");
  let sources = $state.raw<{ value: string; label: string }[]>([]);
  let importError = $state("");
  let player: EarPlayer | null = null;
  let loaded = $state("");
  let loading = $state(false);
  let duration = $state(0);
  let env = $state.raw<number[]>([]);
  let pos = $state(0);
  let playing = $state(false);
  let loop = $state<{ a: number; b: number } | null>(null);
  let sections = $state<{ at: number; name: string }[]>([]);
  let frame = 0;

  const sourceName = $derived(sources.find((x) => x.value === s.source)?.label ?? "");
  /** A file name as a title: "by-ear_desktop" reads "By ear desktop". Display only; saved runs keep the name. */
  const titled = (name: string) => name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  const sourceTitle = $derived(titled(sourceName));

  // Import, from the stage or from Start's place (the primary while no recording is picked).
  let fileInput = $state<HTMLInputElement>();
  let picked: (() => void) | null = null;
  /** Open the file picker; settles once a file is in (or the picker is closed). */
  const importFile = () =>
    new Promise<void>((resolve) => {
      picked = resolve;
      fileInput?.click();
    });
  async function onFile(input: HTMLInputElement) {
    await addFile(input.files?.[0]);
    input.value = "";
    picked?.();
    picked = null;
  }

  onMount(async () => {
    const [tracks, takes] = await Promise.all([listTracks().catch(() => []), db.audioTakes.orderBy("createdAt").reverse().toArray()]);
    sources = [
      ...tracks.map((t) => ({ value: `track:${t.id}`, label: t.name })),
      ...takes.map((t) => ({ value: `take:${t.id}`, label: m.music_drills_byear_recorded_take({ date: new Date(t.createdAt).toLocaleString(intlLocale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) }) })),
    ];
    const tick = () => {
      if (player) {
        pos = player.position();
        playing = player.playing;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });

  const sectionKey = (source: string) => `music.by-ear.sections.${source}`;

  /** Decode the picked recording (needs a tap: audio starts only after a gesture). */
  async function load(source = s.source): Promise<boolean> {
    if (!source) return false;
    if (loaded === source && player) return true;
    loading = true;
    try {
      await audio.unlock();
      const [kind, id] = source.split(":");
      const blob = await getBinary(kind === "take" ? takeKey(id) : trackKey(id));
      if (!blob) throw new Error(m.music_drills_byear_missing_file());
      player?.dispose();
      player = await audio.earPlayer(blob);
      player.set({ rate: Number(s.speed), semitones: Number(s.pitch) });
      duration = player.buffer.duration;
      env = envelope(player.buffer.getChannelData(0));
      loop = null;
      sections = await getSetting<{ at: number; name: string }[]>(sectionKey(source), []);
      loaded = source;
      status = sourceTitle ? m.music_drills_byear_loaded({ name: sourceTitle, length: clock(duration) }) : m.music_drills_byear_loaded_unnamed({ length: clock(duration) });
      return true;
    } catch (e) {
      status = (e as Error).message;
      return false;
    } finally {
      loading = false;
    }
  }

  async function pick(source: string) {
    player?.pause();
    cfg.set({ source });
    await load(source);
  }

  async function addFile(file: File | undefined) {
    if (!file) return;
    importError = "";
    try {
      const t = await importTrack(file);
      sources = [{ value: `track:${t.id}`, label: t.name }, ...sources];
      await pick(`track:${t.id}`);
    } catch (e) {
      importError = (e as Error).message;
    }
  }

  async function toggle() {
    if (!(await load())) return;
    if (player!.playing) player!.pause();
    else player!.play();
  }

  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}${t < 60 ? `.${Math.floor((t % 1) * 10)}` : ""}`;

  function setLoop(next: { a: number; b: number } | null) {
    loop = next && next.b - next.a >= 0.2 ? next : null;
    player?.set(loop ? { loop: true, a: loop.a, b: loop.b } : { loop: false });
    status = loop ? m.music_drills_byear_looping({ a: clock(loop.a), b: clock(loop.b) }) : m.music_drills_byear_loop_off();
  }
  const setA = () => setLoop({ a: pos, b: loop && loop.b > pos ? loop.b : Math.min(duration, pos + 4) });
  const setB = () => setLoop({ a: loop && loop.a < pos ? loop.a : Math.max(0, pos - 4), b: pos });

  function setSpeed(v: string) {
    cfg.set({ speed: v });
    player?.set({ rate: Number(v) });
  }
  function setPitch(v: string) {
    cfg.set({ pitch: v });
    player?.set({ semitones: Number(v) });
  }

  // ---------------------------------------------------------------------------
  // Sections

  const SECTION_NAMES = ["Intro", "Verse", "Chorus", "Bridge", "Solo", "A", "B", "Change", "Outro"];
  /** The names are saved with the marks, in English: shown in the current language. */
  const SECTION_LABEL: Record<string, () => string> = {
    Intro: m.music_drills_byear_section_intro,
    Verse: m.music_drills_byear_section_verse,
    Chorus: m.music_drills_byear_section_chorus,
    Bridge: m.music_drills_byear_section_bridge,
    Solo: m.music_drills_byear_section_solo,
    Change: m.music_drills_byear_section_change,
    Outro: m.music_drills_byear_section_outro,
  };
  const sectionLabel = (name: string) => SECTION_LABEL[name]?.() ?? name;
  async function mark(name: string) {
    if (!loaded) return;
    sections = [...sections.filter((x) => Math.abs(x.at - pos) > 0.25), { at: pos, name }].sort((a, b) => a.at - b.at);
    await putSetting(sectionKey(loaded), sections);
    status = m.music_drills_byear_marked({ name: sectionLabel(name), time: clock(pos) });
  }
  async function unmark(at: number) {
    sections = sections.filter((x) => x.at !== at);
    await putSetting(sectionKey(loaded), sections);
  }
  /** A section loops from its mark to the next one (or the end). */
  function loopSection(i: number) {
    const a = sections[i].at;
    setLoop({ a, b: sections[i + 1]?.at ?? duration });
    player?.seek(a);
  }

  // ---------------------------------------------------------------------------
  // Runs

  let cap: Capture | null = null;
  let t0 = 0;
  /** What you played, with where in the recording it fell. */
  let played = $state.raw<{ midi: number; at: number }[]>([]);
  let notes: NoteEvent[] = [];
  const flashes = new Flashes();
  let rated = $state<boolean | null>(null);
  let home = $state<{ answer: number; ranked: KeyGuess[]; tonics: number[] } | null>(null);
  let homeAnswered = false;
  /** Sing along: each sung note with where in the recording it fell, and its tuning. */
  let sung: { midi: number; at: number; cents: number }[] = [];
  let sing = $state<SingAlongResult | null>(null);
  let savedLick = $state("");
  /** A judged run (Find home, Sing along): the score and what to do next, as every drill shows it. */
  let summary = $state<RunSummary | null>(null);

  async function start() {
    rated = null;
    home = null;
    homeAnswered = false;
    played = [];
    notes = [];
    sung = [];
    sing = null;
    savedLick = "";
    summary = null;
    if (!(await load())) {
      phase = "ready";
      status = status || m.music_drills_byear_pick_first();
      return;
    }
    if (mode === "sing" && !(await mic.start())) {
      phase = "ready";
      status = mic.error || m.music_drills_byear_mic_failed();
      return;
    }
    t0 = performance.now();
    cap = capture(t0, (e) => {
      if (e.kind !== "noteon") return;
      // Sing along hears the voice only, so a keyboard can't answer for it.
      if (mode === "sing" && e.source !== "audio") return;
      notes.push(e);
      if (mode === "home") return answerHome(pc(e.midi));
      const at = player?.position() ?? 0;
      played = [...played.slice(-95), { midi: e.midi, at }];
      if (mode === "sing") sung.push({ midi: e.midi, at, cents: e.cents ?? 0 });
      flashes.add(e.midi, "correct");
    });
    player!.play(loop ? loop.a : pos);
    status =
      mode === "home"
        ? m.music_drills_byear_status_home()
        : mode === "sing"
          ? m.music_drills_byear_status_sing({ part: PART_NAME[part] })
          : loop
          ? m.music_drills_byear_status_looping()
          : m.music_drills_byear_status_playing();
  }

  function stop() {
    cap?.stop();
    cap = null;
    player?.pause();
    if (mode === "home" && !homeAnswered) {
      phase = "ready";
      status = m.music_drills_byear_stopped_early();
      return;
    }
    if (mode === "sing") {
      mic.stop();
      return void finishSing();
    }
    phase = "results";
    status = played.length ? m.music_drills_byear_notes_played_ask({ count: played.length }) : m.music_drills_byear_nothing_played();
  }

  /** The key the whole recording points to: home belongs to the song, not to the stretch looped. */
  function keyOfRecording(): KeyGuess[] {
    const b = player!.buffer;
    const mono = toMono(Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)));
    return rankKeys(regionChroma(mono, b.sampleRate));
  }

  async function answerHome(answer: number) {
    if (homeAnswered || mode !== "home" || phase !== "running") return;
    homeAnswered = true;
    const ranked = keyOfRecording();
    const tonics = homeTonics(ranked);
    home = { answer, ranked, tonics };
    const right = tonics.includes(answer);
    const run = practice.beginRun({
      exerciseId: "ear.find-home",
      setupKey: "by-ear|home",
      skillIds: ["ear.find-home"],
      capabilities: ["ear"],
      modality: "played",
      assistance: "independent",
      difficulty: 0.3,
      instrument: runInstrument(notes) ?? settings.value.activeInstrument,
      params: { mode: "home", recording: sourceName, from: Math.round(loop?.a ?? 0), to: Math.round(loop?.b ?? duration) },
    });
    await run.attempt({ promptId: `home-${loaded}`, correct: right, partialCredit: right ? 1 : 0, source: notes.length ? (notes[0].source ?? "click") : "click", target: FLAT_NAMES[tonics[0]], response: FLAT_NAMES[answer] });
    const fin = await run.finish({ score: right ? 1 : 0, correct: right, headline: right ? m.music_drills_byear_home_run_right({ note: FLAT_NAMES[answer] }) : m.music_drills_byear_home_run_wrong({ answer: FLAT_NAMES[answer], tonic: FLAT_NAMES[tonics[0]] }) });
    summary = {
      headline: right ? m.music_drills_byear_home_right({ note: FLAT_NAMES[answer] }) : m.music_drills_byear_home_wrong({ answer: FLAT_NAMES[answer], tonic: FLAT_NAMES[tonics[0]] }),
      metric: FLAT_NAMES[answer],
      metricLabel: right ? m.music_drills_byear_home_metric_right() : m.music_drills_byear_home_metric_wrong({ tonic: FLAT_NAMES[tonics[0]] }),
      score: right ? 1 : 0,
      clean: right,
      cleanMeans: m.music_drills_byear_home_clean_means(),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      next: right ? { label: m.music_drills_byear_mode_learn(), href: "/music/by-ear?mode=learn", reason: m.music_drills_byear_home_next_reason() } : undefined,
    };
    cap?.stop();
    cap = null;
    player?.pause();
    phase = "results";
    status = right ? m.music_drills_byear_home_status_right({ note: FLAT_NAMES[answer] }) : m.music_drills_byear_home_status_wrong({ answer: FLAT_NAMES[answer], key: keyName(ranked[0]) });
  }
  /** Grade what was sung against the recording, and record it as a judged run. */
  async function finishSing() {
    phase = "results";
    if (sung.length < MIN_SUNG) {
      status = !sung.length ? NOT_HEARD : m.music_drills_byear_sing_too_few({ count: sung.length, min: MIN_SUNG });
      return;
    }
    const b = player!.buffer;
    const mono = toMono(Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)));
    const r = gradeSingAlong({ mono, sampleRate: b.sampleRate, sung, part, shift: Number(s.pitch) });
    sing = r;
    const run = practice.beginRun({
      exerciseId: "ear.by-ear.sing",
      setupKey: `by-ear|sing|${part}|${loaded}`,
      skillIds: ["ear.by-ear"],
      capabilities: ["ear"],
      modality: "sung",
      assistance: "independent",
      difficulty: part === "roots" ? 0.6 : 0.5,
      instrument: "voice",
      params: { mode: "sing", part, recording: sourceName, from: Math.round(loop?.a ?? 0), to: Math.round(loop?.b ?? duration), speed: Number(s.speed), tune: 50 },
    });
    await run.attempt({ promptId: `sing-${part}-${loaded}`, correct: r.correct, partialCredit: r.score, source: "audio", target: part, response: sung.map((n) => n.midi) });
    const fin = await run.finish({ score: r.score, correct: r.correct, headline: m.music_drills_byear_sing_run({ right: r.right, total: r.total }) });
    summary = {
      headline: m.music_drills_byear_sing_headline({ right: r.right, total: r.total }),
      metric: pct(r.score),
      metricLabel: m.music_drills_byear_sing_metric(),
      clean: r.right === r.total,
      cleanMeans: m.music_drills_byear_sing_clean_means(),
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      next: r.correct && part === "head" ? { label: m.music_drills_byear_sing_next_label(), href: "/music/by-ear?mode=sing&part=roots", reason: m.music_drills_byear_sing_next_reason() } : undefined,
    };
    status = r.inTune < r.total ? m.music_drills_byear_sing_matched_out({ right: r.right, total: r.total, out: r.total - r.inTune }) : m.music_drills_byear_sing_matched({ right: r.right, total: r.total });
  }

  /** Save what was played or sung as a lick, at the tempo its notes sit on. */
  async function saveLick() {
    const line = played.slice(0, 32);
    const { bpm } = estimateTempo(line.map((n) => ({ midi: n.midi, start: n.at, duration: 0.2, amplitude: 1 })));
    const id = await saveUserLick({ title: m.music_drills_byear_lick_title({ name: sourceName || m.music_drills_byear_lick_default_name(), time: clock(line[0].at) }), from: "Learn by ear", bpm, notes: secondsToBeats(line, bpm) });
    savedLick = id ? m.music_drills_byear_lick_saved() : m.music_drills_byear_lick_nothing();
    status = savedLick;
  }

  const keyName = (k: KeyGuess) => (k.minor ? m.music_drills_ear_visual_key_minor : m.music_drills_ear_visual_key_major)({ note: FLAT_NAMES[k.tonicPc] });
  /** Results: hear a home note as its key's chord (minor when the recording's key is), to compare two homes. */
  const hearHome = (tonicPc: number) => {
    const minor = !!home?.ranked.find((k) => k.tonicPc === tonicPc)?.minor;
    void audio.unlock().then(() => audio.playChord([48 + tonicPc, 48 + tonicPc + (minor ? 3 : 4), 48 + tonicPc + 7], 1.2));
  };

  async function rate(got: boolean) {
    rated = got;
    const run = practice.beginRun({
      exerciseId: "ear.by-ear",
      setupKey: `by-ear|learn|${loaded}`,
      skillIds: ["ear.by-ear"],
      capabilities: ["ear"],
      modality: "played",
      assistance: "self-assessed",
      difficulty: 0.5,
      instrument: runInstrument(notes) ?? settings.value.activeInstrument,
      params: {
        mode: "learn",
        recording: sourceName,
        from: Math.round(loop?.a ?? 0),
        to: Math.round(loop?.b ?? duration),
        speed: Number(s.speed),
        notes: played.length,
        sections: sections.length,
      },
    });
    await run.finish({ score: got ? 1 : 0, correct: got, rated: true, headline: got ? m.music_drills_byear_rate_run_got() : m.music_drills_byear_rate_run_learning() });
    status = got ? m.music_drills_byear_rate_status_got() : m.music_drills_byear_rate_status_learning();
  }

  onDestroy(() => {
    cancelAnimationFrame(frame);
    cap?.stop();
    if (mode === "sing") mic.stop();
    player?.dispose();
  });

  // ---------------------------------------------------------------------------
  // The picture: the waveform, the loop, the marks, the playhead and your notes.

  const W = 400;
  const H = 72;
  const x = (t: number) => (duration ? (t / duration) * W : 0);
  const yOf = (m: number) => H - 6 - ((Math.max(36, Math.min(96, m)) - 36) / 60) * (H - 12);
  function seekAt(e: MouseEvent) {
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    player?.seek(((e.clientX - box.left) / box.width) * duration);
  }
  function seekKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") player?.seek(pos + 5);
    else if (e.key === "ArrowLeft") player?.seek(pos - 5);
    else return;
    e.preventDefault();
  }
  const SPEEDS = [
    { value: "0.5", label: "50%" },
    { value: "0.6", label: "60%" },
    { value: "0.75", label: "75%" },
    { value: "0.9", label: "90%" },
    { value: "1", label: "100%" },
  ];
  const PITCHES = [-2, -1, 0, 1, 2].map((n) => ({ value: String(n), label: n === 0 ? m.music_drills_byear_as_recorded() : `${n > 0 ? "+" : "−"}${Math.abs(n)}` }));
  const lastNotes = $derived(played.slice(-16));
  const summaryLine = $derived([
    { text: mode === "home" ? m.music_drills_byear_mode_home() : mode === "sing" ? m.music_drills_byear_summary_sing({ part: PART_NAME[part] }) : m.music_drills_byear_mode_learn(), focus: "mode" },
    // Quoted: it is the recording's own title (a file name), not one of the app's presets.
    { text: sourceTitle ? m.music_drills_byear_summary_from({ title: sourceTitle }) : m.music_drills_byear_summary_no_recording(), focus: "source" },
    { text: m.music_drills_byear_summary_speed({ pct: Math.round(Number(s.speed) * 100) }), focus: "speed" },
    ...(s.pitch !== "0" ? [{ text: m.music_drills_ear_visual_semitones_fallback({ n: s.pitch }), focus: "pitch" }] : []),
  ]);
</script>

<svelte:head><title>{m.music_drills_byear_title()} | Woodshed</title></svelte:head>

<DrillShell
  lesson={mode === "home" ? { lessons: [findHomeLesson()] } : null}
  title={m.music_drills_byear_title()}
  hue="ear"
  blurb={m.music_drills_byear_blurb()}
  summary={summaryLine}
  checkable={false}
  blocked={s.source ? null : m.music_drills_byear_pick_first()}
  unblock={{ label: m.music_drills_byear_import_recording(), run: importFile }}
  bind:phase
  bind:status
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice
        label={m.music_drills_byear_what_to_do()}
        setupKey="mode"
        options={[
          { value: "learn", label: m.music_drills_byear_mode_learn(), hint: m.music_drills_byear_mode_learn_hint() },
          { value: "home", label: m.music_drills_byear_mode_home(), hint: m.music_drills_byear_mode_home_hint() },
          { value: "sing", label: m.music_drills_byear_mode_sing(), hint: m.music_drills_byear_mode_sing_hint() },
        ]}
        value={mode}
        onchange={(v) => cfg.set({ mode: v })}
      />
      <div class="flex flex-col gap-1 text-sm" data-setup="source">
        <span class="font-medium">{m.music_drills_byear_recording()}</span>
        <div class="flex flex-wrap items-center gap-2">
          <Picker class="w-auto min-w-48" label={m.music_drills_byear_recording()} value={s.source} placeholder={m.music_drills_byear_pick_recording()} options={sources.map((o) => ({ ...o, label: titled(o.label) }))} onchange={(v) => pick(v)} />
          <label class="{btn} cursor-pointer focus-within:outline-2">
            <Upload class="size-4" aria-hidden="true" />{m.music_drills_byear_import()}
            <input class="sr-only" type="file" accept="audio/*" aria-label={m.music_drills_byear_import_recording()} onchange={(e) => addFile(e.currentTarget.files?.[0])} />
          </label>
        </div>
        <span class="text-ws-soft">{m.music_drills_byear_sources_hint()}</span>
        {#if importError}<p role="alert" class="font-medium text-destructive">{importError}</p>{/if}
      </div>
      {#if mode === "sing"}
        <Choice
          label={m.music_drills_byear_sing_label()}
          setupKey="part"
          options={[
            { value: "head", label: m.music_drills_byear_tune_label(), hint: m.music_drills_byear_tune_hint() },
            { value: "roots", label: m.music_drills_byear_roots_label(), hint: m.music_drills_byear_roots_hint() },
          ]}
          value={part}
          onchange={(v) => cfg.set({ part: v })}
        />
      {/if}
      <Choice label={m.music_drills_byear_speed()} setupKey="speed" options={SPEEDS} value={s.speed} onchange={setSpeed} />
      <Choice label={m.music_drills_byear_pitch()} setupKey="pitch" options={PITCHES} value={s.pitch} onchange={setPitch} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">{m.music_drills_byear_stretch_note()}</p>
  {/snippet}

  {#snippet hud()}
    <!-- On results the position, loop and speed sit in the result card instead. -->
    {#if loaded && phase !== "results"}
      <Stat label={m.music_drills_byear_position()} value={m.music_drills_byear_position_value({ pos: clock(pos), length: clock(duration) })} />
      {#if loop}<Stat label={m.music_drills_byear_loop()} value={m.music_drills_byear_range({ a: clock(loop.a), b: clock(loop.b) })} />{/if}
      <Stat label={m.music_drills_byear_speed()} value="{Math.round(Number(s.speed) * 100)}%" />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if !s.source}
      <!-- Import is the primary in Start's place; the file input it opens lives here. -->
      <div class="flex flex-col items-center gap-3 py-6 text-center">
        <Upload class="size-8 text-ws-stage-soft" aria-hidden="true" />
        <p class="font-display text-xl font-semibold">{m.music_drills_byear_empty_title()}</p>
        <p class="text-ws-stage-soft">{sources.length ? m.music_drills_byear_empty_with_sources() : m.music_drills_byear_empty_no_sources()}</p>
        {#if sources.length}
          <Picker class="w-auto min-w-56" label={m.music_drills_byear_recording()} value={s.source} placeholder={m.music_drills_byear_pick_recording()} options={sources.map((o) => ({ ...o, label: titled(o.label) }))} onchange={(v) => pick(v)} />
        {/if}
        <input bind:this={fileInput} class="sr-only" type="file" accept="audio/*" aria-label={m.music_drills_byear_import_file_aria()} tabindex="-1" onchange={(e) => onFile(e.currentTarget)} oncancel={() => (picked?.(), (picked = null))} />
        {#if importError}<p role="alert" class="font-medium text-destructive">{importError}</p>{/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3" data-loaded={loaded ? "yes" : "no"}>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class={btnStage} onclick={toggle} disabled={loading}>
            {#if playing}<Pause class="size-4" aria-hidden="true" />{m.music_drills_byear_pause()}{:else}<Play class="size-4" aria-hidden="true" />{loaded ? m.music_drills_byear_play() : loading ? m.music_drills_byear_loading() : m.music_drills_byear_load_and_play()}{/if}
          </button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={() => player?.seek(pos - 5)}>{m.music_drills_byear_back_5()}</button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={setA}>{m.music_drills_byear_start_loop()}</button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={setB}>{m.music_drills_byear_end_loop()}</button>
          {#if loop}<button type="button" class={btnStage} onclick={() => setLoop(null)}>{m.music_drills_byear_loop_off_button()}</button>{/if}
        </div>

        {#if loaded}
          <!-- Click to move the playhead; arrow keys skip 5 seconds. -->
          <svg class="wave w-full" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="slider" tabindex="0" aria-label={m.music_drills_byear_position_aria()} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(pos)} aria-valuetext={clock(pos)} onclick={seekAt} onkeydown={seekKey}>
            {#if loop}<rect class="loop" x={x(loop.a)} y="0" width={Math.max(1, x(loop.b) - x(loop.a))} height={H} />{/if}
            {#each env as v, i (i)}
              <rect class="bar" x={(i / env.length) * W} y={H / 2 - (v * H) / 2} width={Math.max(0.6, W / env.length - 0.3)} height={Math.max(0.5, v * H)} />
            {/each}
            {#each sections as sec (sec.at)}<line class="mark" x1={x(sec.at)} x2={x(sec.at)} y1="0" y2={H} />{/each}
            {#each played as n, i (i)}<circle class="note" cx={x(n.at)} cy={yOf(n.midi)} r="2.2" opacity={0.25 + (0.75 * (i + 1)) / played.length} />{/each}
            <line class="head" x1={x(pos)} x2={x(pos)} y1="0" y2={H} />
          </svg>

          <div class="flex flex-col gap-1.5" role="group" aria-label={m.music_drills_byear_sections()}>
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm text-ws-stage-soft">{m.music_drills_byear_mark_here()}</span>
              {#each SECTION_NAMES as name (name)}
                <button type="button" class="chip" onclick={() => mark(name)}>{sectionLabel(name)}</button>
              {/each}
            </div>
            {#if sections.length}
              <ol class="flex flex-wrap gap-1.5" aria-label={m.music_drills_byear_marked_sections()}>
                {#each sections as sec, i (sec.at)}
                  <li class="flex items-center rounded-full border border-ws-stage-ink/25">
                    <button type="button" class="px-3 py-1.5 text-sm" onclick={() => loopSection(i)} aria-label={m.music_drills_byear_loop_section({ name: sectionLabel(sec.name), time: clock(sec.at) })}>{sectionLabel(sec.name)} <span class="tnum text-ws-stage-soft">{clock(sec.at)}</span></button>
                    <button type="button" class="px-2 py-1.5 text-sm text-ws-stage-soft" onclick={() => unmark(sec.at)} aria-label={m.music_drills_byear_remove_section({ name: sectionLabel(sec.name), time: clock(sec.at) })}>✕</button>
                  </li>
                {/each}
              </ol>
              <p class="text-sm text-ws-stage-soft">{m.music_drills_byear_marks_count({ count: sections.length })}</p>
            {/if}
          </div>
        {/if}

        {#if phase === "running" && mode === "home"}
          <div role="group" aria-label={m.music_drills_byear_tonic()} class="grid grid-cols-6 gap-2 sm:grid-cols-12" data-dock="answers">
            {#each FLAT_NAMES as name, i (i)}
              <button type="button" class="choice min-h-12 rounded-xl font-display text-lg font-semibold" onclick={() => answerHome(i)}>{name}</button>
            {/each}
          </div>
        {:else if mode === "sing" && phase !== "results"}
          <p class="text-sm" aria-live="polite">
            <span class="text-ws-stage-soft">{mic.pitch ? m.music_drills_byear_hearing({ note: noteName(mic.pitch.midi, "flat") }) : m.music_drills_byear_no_pitch()}</span>
            <span class="tnum font-medium [word-spacing:0.4rem]">{lastNotes.length ? lastNotes.map((n) => noteName(n.midi, "flat")).join(" ") : "nothing yet"}</span>
          </p>
        {:else if mode === "learn" && phase !== "results"}
          <div data-dock="instrument"><InstrumentStage line={[48, 84]} {flashes} interactive={phase === "running"} /></div>
          <p class="text-sm" aria-live="polite">
            <span class="text-ws-stage-soft">{m.music_drills_byear_you_played()}</span>
            <span class="tnum font-medium [word-spacing:0.4rem]">{lastNotes.length ? lastNotes.map((n) => noteName(n.midi, "flat")).join(" ") : "nothing yet"}</span>
          </p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if mode === "sing" && !sing && !sung.length}
      <Results summary={silentRun()} />
    {:else}
    <!-- A judged run gets the score and the next step every drill shows, on a phone too; the detail follows. -->
    <div class="flex flex-col gap-3" role="group" aria-label={m.music_drills_byear_this_run()}>
    {#if summary}<Results {summary} />{/if}
    <article class="{panel} flex flex-col gap-3">
      {#if loaded}<p class="text-sm text-ws-soft">{loop ? m.music_drills_byear_result_loop({ a: clock(loop.a), b: clock(loop.b), pct: Math.round(Number(s.speed) * 100) }) : m.music_drills_byear_result_whole({ length: clock(duration), pct: Math.round(Number(s.speed) * 100) })}</p>{/if}
      {#if mode === "home" && home}
        {#if !home.tonics.includes(home.answer)}
          <!-- A miss becomes a comparison: the two homes, each as its chord. -->
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btn} onclick={() => hearHome(home!.tonics[0])}><Play class="size-4" aria-hidden="true" />{m.music_drills_byear_hear_note({ note: FLAT_NAMES[home.tonics[0]] })}</button>
            <button type="button" class={btn} onclick={() => hearHome(home!.answer)}><Play class="size-4" aria-hidden="true" />{m.music_drills_byear_hear_note({ note: FLAT_NAMES[home.answer] })}</button>
          </div>
        {/if}
        <p class="text-sm text-ws-soft">
          {home.tonics.length > 1 ? m.music_drills_byear_points_to_two({ key: keyName(home.ranked[0]), other: keyName(home.ranked.find((k) => k.tonicPc === home!.tonics[1] && k.minor !== home!.ranked[0].minor) ?? home.ranked[1]) }) : m.music_drills_byear_points_to({ key: keyName(home.ranked[0]) })}
          {m.music_drills_byear_key_caveat()}
        </p>
      {:else if mode === "sing"}
        {#if sing}
          <p class="text-sm text-ws-soft">
            {sing.correct ? m.music_drills_byear_sing_passes({ part: PART_NAME[part] }) : m.music_drills_byear_sing_fails({ count: sing.total - sing.inTune })}
            {part === "roots" ? m.music_drills_byear_sing_counts_bass() : m.music_drills_byear_sing_counts()}
          </p>
          <p class="text-sm">{sing.notes.slice(-24).map((n) => `${noteName(n.midi, "flat")}${n.ok ? "" : "?"}`).join(" ")}</p>
        {:else}
          <p class="font-display text-2xl font-semibold">{m.music_drills_byear_too_few()}</p>
        {/if}
        {#if played.length >= 4}<button type="button" class="{btn} self-start" onclick={saveLick} disabled={!!savedLick}>{m.music_drills_byear_save_lick()}</button>{/if}
        {#if savedLick}<p class="text-sm text-ws-soft" role="status">{savedLick}</p>{/if}
      {:else if mode === "learn"}
        <p class="font-display text-2xl font-semibold">{loop ? m.music_drills_byear_learn_played_loop({ count: played.length, a: clock(loop.a), b: clock(loop.b), pct: Math.round(Number(s.speed) * 100) }) : m.music_drills_byear_learn_played({ count: played.length, pct: Math.round(Number(s.speed) * 100) })}</p>
        {#if played.length}<p class="text-sm">{played.slice(-32).map((n) => noteName(n.midi, "flat")).join(" ")}</p>{/if}
        {#if rated === null}
          <!-- What you played on the keys beside the judgement, so you rate what you can see. -->
          <div class="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            {#if played.length}
              <div class="rounded-2xl bg-ws-stage p-2 text-ws-stage-ink">
                <InstrumentStage line={played.map((n) => n.midi)} marks={Object.fromEntries(played.slice(-32).map((n) => [n.midi, { target: true }]))} interactive={false} />
              </div>
            {/if}
            <div class="flex flex-col gap-2">
              <p class="text-sm text-ws-soft">{m.music_drills_byear_rate_prompt()}</p>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="{btnPrimary} min-h-12 px-6 text-base" onclick={() => rate(true)}>{m.music_drills_byear_got_it()}</button>
                <button type="button" class="{btn} min-h-12 px-6 text-base" onclick={() => rate(false)}>{m.music_drills_byear_not_yet()}</button>
              </div>
            </div>
          </div>
        {:else}
          <p class="text-sm text-ws-soft">{rated ? m.music_drills_byear_saved_got() : m.music_drills_byear_saved_learning()}</p>
          <!-- What to do next, the way a judged run says it. -->
          <p class="text-sm">
            {#if rated}{@html m.music_drills_byear_next_sing({ link: `<a class="font-semibold underline underline-offset-4" href="/music/by-ear?mode=sing">${m.music_drills_byear_next_sing_link()}</a>` })}{:else}{m.music_drills_byear_next_slower()}{/if}
          </p>
        {/if}
        {#if played.length >= 4}<button type="button" class="{btn} self-start" onclick={saveLick} disabled={!!savedLick}>{m.music_drills_byear_save_lick()}</button>{/if}
        {#if savedLick}<p class="text-sm text-ws-soft" role="status">{savedLick}</p>{/if}
      {/if}
      <!-- The looper waits behind this: the recording, its loop and its marks. -->
      <button type="button" class="{btn} self-start" onclick={() => (phase = "ready")}>{m.music_drills_byear_loop_this_part()}</button>
    </article>
    </div>
    {/if}
  {/snippet}
</DrillShell>

<style>
  .wave {
    height: 6rem;
    cursor: pointer;
    border-radius: 0.75rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 6%, transparent);
  }
  .bar {
    fill: color-mix(in oklch, var(--ws-stage-ink) 40%, transparent);
  }
  .loop {
    fill: color-mix(in oklch, var(--instr) 22%, transparent);
  }
  .mark {
    stroke: var(--instr);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .head {
    stroke: var(--ws-stage-ink);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .note {
    fill: var(--instr);
  }
  .chip {
    min-height: 2.25rem;
    padding: 0 0.75rem;
    border-radius: 999px;
    font-size: 0.875rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
  }
  .chip:hover,
  .choice:hover {
    background: color-mix(in oklch, var(--instr) 22%, transparent);
  }
  .choice {
    background: color-mix(in oklch, var(--ws-stage-ink) 9%, transparent);
  }
</style>
