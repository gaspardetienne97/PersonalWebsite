<script lang="ts">
  // Learn by ear from a recording you own: loop a stretch (A to B), slow it
  // down with the pitch kept, mark its sections, and play the part back with
  // what you play drawn over the loop. A Learn run is self-rated; Find home is
  // judged against the key the recording's chroma points to; Sing along grades
  // each sung note against what the recording sounds there. What you played or
  // sang can be saved as a lick and drilled in Phrases in any key.
  import { onDestroy, onMount } from "svelte";
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
  const PART_NAME: Record<SingPart, string> = { head: "the tune", roots: "the roots" };

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
      ...takes.map((t) => ({ value: `take:${t.id}`, label: `Recorded take, ${new Date(t.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` })),
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
      if (!blob) throw new Error("That recording's file is missing from this browser. Import it again.");
      player?.dispose();
      player = await audio.earPlayer(blob);
      player.set({ rate: Number(s.speed), semitones: Number(s.pitch) });
      duration = player.buffer.duration;
      env = envelope(player.buffer.getChannelData(0));
      loop = null;
      sections = await getSetting<{ at: number; name: string }[]>(sectionKey(source), []);
      loaded = source;
      status = `Loaded ${sourceTitle || "the recording"}: ${clock(duration)}.`;
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
    status = loop ? `Looping ${clock(loop.a)} to ${clock(loop.b)}.` : "Loop off: plays through.";
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
  async function mark(name: string) {
    if (!loaded) return;
    sections = [...sections.filter((x) => Math.abs(x.at - pos) > 0.25), { at: pos, name }].sort((a, b) => a.at - b.at);
    await putSetting(sectionKey(loaded), sections);
    status = `${name} marked at ${clock(pos)}.`;
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
      status = status || "Pick or import a recording first.";
      return;
    }
    if (mode === "sing" && !(await mic.start())) {
      phase = "ready";
      status = mic.error || "The microphone didn't start. Allow it in the browser to sing along.";
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
        ? "Listen. Play or sing the tonic, the note that sounds like home, or pick it below."
        : mode === "sing"
          ? `Sing ${PART_NAME[part]} with the recording. Headphones keep the recording out of the microphone.`
          : loop
          ? "Looping. Play the part along with it. Your notes show over the loop."
          : "Playing. Start loop and End loop mark a stretch to repeat. Your notes show over the recording.";
  }

  function stop() {
    cap?.stop();
    cap = null;
    player?.pause();
    if (mode === "home" && !homeAnswered) {
      phase = "ready";
      status = "Stopped before an answer. Nothing saved.";
      return;
    }
    if (mode === "sing") {
      mic.stop();
      return void finishSing();
    }
    phase = "results";
    status = played.length ? `${played.length} notes played. Did you get the part?` : "Nothing was played. Rate it anyway, or start again.";
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
    const fin = await run.finish({ score: right ? 1 : 0, correct: right, headline: right ? `The tonic is ${FLAT_NAMES[answer]}` : `Heard ${FLAT_NAMES[answer]}, the tonic is ${FLAT_NAMES[tonics[0]]}` });
    summary = {
      headline: right ? `Right: the tonic is ${FLAT_NAMES[answer]}.` : `You picked ${FLAT_NAMES[answer]}. The tonic sounds like ${FLAT_NAMES[tonics[0]]}.`,
      metric: FLAT_NAMES[answer],
      metricLabel: right ? "is the tonic" : `the tonic is ${FLAT_NAMES[tonics[0]]}`,
      score: right ? 1 : 0,
      clean: right,
      cleanMeans: "the tonic named",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      next: right ? { label: "Learn a part", href: "/music/by-ear?mode=learn", reason: "loop a stretch of this recording and play it back" } : undefined,
    };
    cap?.stop();
    cap = null;
    player?.pause();
    phase = "results";
    status = right ? `Right: ${FLAT_NAMES[answer]} is the tonic.` : `${FLAT_NAMES[answer]} isn't the tonic here. The recording points to ${keyName(ranked[0])}.`;
  }
  /** Grade what was sung against the recording, and record it as a judged run. */
  async function finishSing() {
    phase = "results";
    if (sung.length < MIN_SUNG) {
      status = !sung.length ? NOT_HEARD : `Only ${sung.length} sung notes were heard: sing at least ${MIN_SUNG} with the recording. Nothing saved.`;
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
    const fin = await run.finish({ score: r.score, correct: r.correct, headline: `${r.right} of ${r.total} sung notes with the recording` });
    summary = {
      headline: `${r.right} of ${r.total} sung notes with the recording.`,
      metric: pct(r.score),
      metricLabel: `sung with the recording, 75% passes`,
      clean: r.right === r.total,
      cleanMeans: "every sung note with the recording",
      delta: fin.delta,
      best: fin.best,
      xp: fin.xp,
      next: r.correct && part === "head" ? { label: "Sing the roots", href: "/music/by-ear?mode=sing&part=roots", reason: "the bass note under each chord" } : undefined,
    };
    status = `${r.right} of ${r.total} sung notes matched the recording${r.inTune < r.total ? `; ${r.total - r.inTune} were more than 50 cents out` : ""}.`;
  }

  /** Save what was played or sung as a lick, at the tempo its notes sit on. */
  async function saveLick() {
    const line = played.slice(0, 32);
    const { bpm } = estimateTempo(line.map((n) => ({ midi: n.midi, start: n.at, duration: 0.2, amplitude: 1 })));
    const id = await saveUserLick({ title: `${sourceName || "Recording"} at ${clock(line[0].at)}`, from: "Learn by ear", bpm, notes: secondsToBeats(line, bpm) });
    savedLick = id ? "Saved. Find it in Phrases under Your licks, and take it through the keys." : "Nothing to save yet.";
    status = savedLick;
  }

  const keyName = (k: KeyGuess) => `${FLAT_NAMES[k.tonicPc]} ${k.minor ? "minor" : "major"}`;
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
    await run.finish({ score: got ? 1 : 0, correct: got, rated: true, headline: got ? "Got the part by ear" : "Still learning the part" });
    status = got ? "Saved: you rated it got. Try it at a faster speed next." : "Saved as still learning. Loop a shorter stretch or slow it down.";
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
  const PITCHES = [-2, -1, 0, 1, 2].map((n) => ({ value: String(n), label: n === 0 ? "As recorded" : `${n > 0 ? "+" : "−"}${Math.abs(n)}` }));
  const lastNotes = $derived(played.slice(-16));
  const summaryLine = $derived([
    { text: mode === "home" ? "Find the tonic" : mode === "sing" ? `Sing ${PART_NAME[part]}` : "Learn a part", focus: "mode" },
    // Quoted: it is the recording's own title (a file name), not one of the app's presets.
    { text: sourceTitle ? `from “${sourceTitle}”` : "no recording yet", focus: "source" },
    { text: `${Math.round(Number(s.speed) * 100)}% speed`, focus: "speed" },
    ...(s.pitch !== "0" ? [{ text: `${s.pitch} semitones`, focus: "pitch" }] : []),
  ]);
</script>

<svelte:head><title>Learn by ear | Woodshed</title></svelte:head>

<DrillShell
  lesson={mode === "home" ? { lessons: [findHomeLesson()] } : null}
  title="Learn by ear"
  hue="ear"
  blurb="Loop a stretch of a recording, slow it down at the same pitch, and play the part back."
  summary={summaryLine}
  checkable={false}
  blocked={s.source ? null : "Pick or import a recording first."}
  unblock={{ label: "Import a recording", run: importFile }}
  bind:phase
  bind:status
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice
        label="What to do"
        setupKey="mode"
        options={[
          { value: "learn", label: "Learn a part", hint: "Loop, slow down, mark sections, play it back. You rate the run." },
          { value: "home", label: "Find the tonic", hint: "Name the tonic, the home note the music rests on. Scored against the recording's key." },
          { value: "sing", label: "Sing along", hint: "Sing the tune, or its roots, with the recording. Each sung note is scored against what the recording sounds then." },
        ]}
        value={mode}
        onchange={(v) => cfg.set({ mode: v })}
      />
      <div class="flex flex-col gap-1 text-sm" data-setup="source">
        <span class="font-medium">Recording</span>
        <div class="flex flex-wrap items-center gap-2">
          <Picker class="w-auto min-w-48" label="Recording" value={s.source} placeholder="Pick a recording" options={sources.map((o) => ({ ...o, label: titled(o.label) }))} onchange={(v) => pick(v)} />
          <label class="{btn} cursor-pointer focus-within:outline-2">
            <Upload class="size-4" aria-hidden="true" />Import
            <input class="sr-only" type="file" accept="audio/*" aria-label="Import a recording" onchange={(e) => addFile(e.currentTarget.files?.[0])} />
          </label>
        </div>
        <span class="text-ws-soft">Files you own, your backing tracks and your takes from Record. They stay in this browser.</span>
        {#if importError}<p role="alert" class="font-medium text-destructive">{importError}</p>{/if}
      </div>
      {#if mode === "sing"}
        <Choice
          label="Sing"
          setupKey="part"
          options={[
            { value: "head", label: "The tune", hint: "The head: the melody, in any octave." },
            { value: "roots", label: "The roots", hint: "Each chord's root, the bass note, in any octave." },
          ]}
          value={part}
          onchange={(v) => cfg.set({ part: v })}
        />
      {/if}
      <Choice label="Speed" setupKey="speed" options={SPEEDS} value={s.speed} onchange={setSpeed} />
      <Choice label="Pitch" setupKey="pitch" options={PITCHES} value={s.pitch} onchange={setPitch} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">Below 100% the pitch stays where it is (granular time stretch, a little grainy). A pitch change keeps the speed.</p>
  {/snippet}

  {#snippet hud()}
    <!-- On results the position, loop and speed sit in the result card instead. -->
    {#if loaded && phase !== "results"}
      <Stat label="Position" value="{clock(pos)} of {clock(duration)}" />
      {#if loop}<Stat label="Loop" value="{clock(loop.a)} to {clock(loop.b)}" />{/if}
      <Stat label="Speed" value="{Math.round(Number(s.speed) * 100)}%" />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if !s.source}
      <!-- Import is the primary in Start's place; the file input it opens lives here. -->
      <div class="flex flex-col items-center gap-3 py-6 text-center">
        <Upload class="size-8 text-ws-stage-soft" aria-hidden="true" />
        <p class="font-display text-xl font-semibold">Pick a recording to learn from.</p>
        <p class="text-ws-stage-soft">Import a file you own{sources.length ? ", or pick one you have: a take from Record or a backing track" : ". It stays in this browser"}.</p>
        {#if sources.length}
          <Picker class="w-auto min-w-56" label="Recording" value={s.source} placeholder="Pick a recording" options={sources.map((o) => ({ ...o, label: titled(o.label) }))} onchange={(v) => pick(v)} />
        {/if}
        <input bind:this={fileInput} class="sr-only" type="file" accept="audio/*" aria-label="Import a recording file" tabindex="-1" onchange={(e) => onFile(e.currentTarget)} oncancel={() => (picked?.(), (picked = null))} />
        {#if importError}<p role="alert" class="font-medium text-destructive">{importError}</p>{/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3" data-loaded={loaded ? "yes" : "no"}>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class={btnStage} onclick={toggle} disabled={loading}>
            {#if playing}<Pause class="size-4" aria-hidden="true" />Pause{:else}<Play class="size-4" aria-hidden="true" />{loaded ? "Play" : loading ? "Loading…" : "Load and play"}{/if}
          </button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={() => player?.seek(pos - 5)}>Back 5 s</button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={setA}>Start loop</button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={setB}>End loop</button>
          {#if loop}<button type="button" class={btnStage} onclick={() => setLoop(null)}>Loop off</button>{/if}
        </div>

        {#if loaded}
          <!-- Click to move the playhead; arrow keys skip 5 seconds. -->
          <svg class="wave w-full" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="slider" tabindex="0" aria-label="Position in the recording" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(pos)} aria-valuetext={clock(pos)} onclick={seekAt} onkeydown={seekKey}>
            {#if loop}<rect class="loop" x={x(loop.a)} y="0" width={Math.max(1, x(loop.b) - x(loop.a))} height={H} />{/if}
            {#each env as v, i (i)}
              <rect class="bar" x={(i / env.length) * W} y={H / 2 - (v * H) / 2} width={Math.max(0.6, W / env.length - 0.3)} height={Math.max(0.5, v * H)} />
            {/each}
            {#each sections as m (m.at)}<line class="mark" x1={x(m.at)} x2={x(m.at)} y1="0" y2={H} />{/each}
            {#each played as n, i (i)}<circle class="note" cx={x(n.at)} cy={yOf(n.midi)} r="2.2" opacity={0.25 + (0.75 * (i + 1)) / played.length} />{/each}
            <line class="head" x1={x(pos)} x2={x(pos)} y1="0" y2={H} />
          </svg>

          <div class="flex flex-col gap-1.5" role="group" aria-label="Sections">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm text-ws-stage-soft">Mark here:</span>
              {#each SECTION_NAMES as name (name)}
                <button type="button" class="chip" onclick={() => mark(name)}>{name}</button>
              {/each}
            </div>
            {#if sections.length}
              <ol class="flex flex-wrap gap-1.5" aria-label="Marked sections">
                {#each sections as m, i (m.at)}
                  <li class="flex items-center rounded-full border border-ws-stage-ink/25">
                    <button type="button" class="px-3 py-1.5 text-sm" onclick={() => loopSection(i)} aria-label="Loop {m.name} at {clock(m.at)}">{m.name} <span class="tnum text-ws-stage-soft">{clock(m.at)}</span></button>
                    <button type="button" class="px-2 py-1.5 text-sm text-ws-stage-soft" onclick={() => unmark(m.at)} aria-label="Remove {m.name} at {clock(m.at)}">✕</button>
                  </li>
                {/each}
              </ol>
              <p class="text-sm text-ws-stage-soft">{sections.length} {sections.length === 1 ? "mark" : "marks"}. Tap one to loop it up to the next.</p>
            {/if}
          </div>
        {/if}

        {#if phase === "running" && mode === "home"}
          <div role="group" aria-label="Tonic" class="grid grid-cols-6 gap-2 sm:grid-cols-12" data-dock="answers">
            {#each FLAT_NAMES as name, i (i)}
              <button type="button" class="choice min-h-12 rounded-xl font-display text-lg font-semibold" onclick={() => answerHome(i)}>{name}</button>
            {/each}
          </div>
        {:else if mode === "sing" && phase !== "results"}
          <p class="text-sm" aria-live="polite">
            <span class="text-ws-stage-soft">{mic.pitch ? `Hearing ${noteName(mic.pitch.midi, "flat")}.` : "No pitch yet."} You sang:</span>
            <span class="tnum font-medium [word-spacing:0.4rem]">{lastNotes.length ? lastNotes.map((n) => noteName(n.midi, "flat")).join(" ") : "nothing yet"}</span>
          </p>
        {:else if mode === "learn" && phase !== "results"}
          <div data-dock="instrument"><InstrumentStage line={[48, 84]} {flashes} interactive={phase === "running"} /></div>
          <p class="text-sm" aria-live="polite">
            <span class="text-ws-stage-soft">You played:</span>
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
    <div class="flex flex-col gap-3" role="group" aria-label="This run">
    {#if summary}<Results {summary} />{/if}
    <article class="{panel} flex flex-col gap-3">
      {#if loaded}<p class="text-sm text-ws-soft">{loop ? `Loop ${clock(loop.a)} to ${clock(loop.b)}` : `Whole recording, ${clock(duration)}`}, at {Math.round(Number(s.speed) * 100)}% speed.</p>{/if}
      {#if mode === "home" && home}
        {#if !home.tonics.includes(home.answer)}
          <!-- A miss becomes a comparison: the two homes, each as its chord. -->
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btn} onclick={() => hearHome(home!.tonics[0])}><Play class="size-4" aria-hidden="true" />Hear {FLAT_NAMES[home.tonics[0]]}</button>
            <button type="button" class={btn} onclick={() => hearHome(home!.answer)}><Play class="size-4" aria-hidden="true" />Hear {FLAT_NAMES[home.answer]}</button>
          </div>
        {/if}
        <p class="text-sm text-ws-soft">
          The recording's notes point to {keyName(home.ranked[0])}{home.tonics.length > 1 ? `, with ${keyName(home.ranked.find((k) => k.tonicPc === home!.tonics[1] && k.minor !== home!.ranked[0].minor) ?? home.ranked[1])} close behind, so either tonic counts` : ""}.
          Woodshed works the key out from the whole recording. A song that changes key or sits long away from the tonic can fool it.
        </p>
      {:else if mode === "sing"}
        {#if sing}
          <p class="text-sm text-ws-soft">
            {sing.correct ? `That passes: ${PART_NAME[part]} in tune with the recording.` : `75% passes. ${sing.total - sing.inTune} notes were more than 50 cents out. The rest missed what the recording sounds there.`}
            A note counts when its pitch class sounds strongly in the recording at that moment{part === "roots" ? ", in the bass" : ""}, in any octave.
          </p>
          <p class="text-sm">{sing.notes.slice(-24).map((n) => `${noteName(n.midi, "flat")}${n.ok ? "" : "?"}`).join(" ")}</p>
        {:else}
          <p class="font-display text-2xl font-semibold">Too few notes to score.</p>
        {/if}
        {#if played.length >= 4}<button type="button" class="{btn} self-start" onclick={saveLick} disabled={!!savedLick}>Save as a lick</button>{/if}
        {#if savedLick}<p class="text-sm text-ws-soft" role="status">{savedLick}</p>{/if}
      {:else if mode === "learn"}
        <p class="font-display text-2xl font-semibold">{played.length} notes played{loop ? ` over ${clock(loop.a)} to ${clock(loop.b)}` : ""} at {Math.round(Number(s.speed) * 100)}%.</p>
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
              <p class="text-sm text-ws-soft">Woodshed can't hear the part inside the recording, so you rate it: could you play it with the recording?</p>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="{btnPrimary} min-h-12 px-6 text-base" onclick={() => rate(true)}>I got it</button>
                <button type="button" class="{btn} min-h-12 px-6 text-base" onclick={() => rate(false)}>Not yet</button>
              </div>
            </div>
          </div>
        {:else}
          <p class="text-sm text-ws-soft">Saved as {rated ? "got it" : "still learning"}, self-rated, in your journal.</p>
          <!-- What to do next, the way a judged run says it. -->
          <p class="text-sm">
            Next up:
            {#if rated}<a class="font-semibold underline underline-offset-4" href="/music/by-ear?mode=sing">sing along with it</a>, so the recording scores you.{:else}loop a shorter stretch, or slow it to 75%.{/if}
          </p>
        {/if}
        {#if played.length >= 4}<button type="button" class="{btn} self-start" onclick={saveLick} disabled={!!savedLick}>Save as a lick</button>{/if}
        {#if savedLick}<p class="text-sm text-ws-soft" role="status">{savedLick}</p>{/if}
      {/if}
      <!-- The looper waits behind this: the recording, its loop and its marks. -->
      <button type="button" class="{btn} self-start" onclick={() => (phase = "ready")}>Loop this part</button>
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
