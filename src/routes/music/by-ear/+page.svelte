<script lang="ts">
  // Learn by ear from a recording you own: loop a stretch (A to B), slow it
  // down with the pitch kept, mark its sections, and play the part back with
  // what you play drawn over the loop. A Learn run is self-rated; Find home is
  // judged against the key the recording's chroma points to.
  import { onDestroy, onMount } from "svelte";
  import Upload from "lucide-svelte/icons/upload";
  import Play from "lucide-svelte/icons/play";
  import Pause from "lucide-svelte/icons/pause";
  import { FLAT_NAMES, noteName, pc, type NoteEvent } from "@repo/music-core";
  import { homeTonics, rankKeys, regionChroma, type KeyGuess } from "@repo/music-core/signal/key";
  import { toMono } from "@repo/music-core/signal/chroma";
  import DrillShell, { type Phase } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Picker from "$lib/music/components/Picker.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import InstrumentStage from "$lib/music/components/InstrumentStage.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary, btnStage, panel } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { capture, runInstrument, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, db, getBinary, getSetting, putSetting, settings, type EarPlayer } from "$lib/music/runtime";
  import { importTrack, listTracks, trackKey } from "$lib/music/drills/jam/tracks";
  import { envelope, takeKey } from "$lib/music/hubs/create/audioTakes";

  const cfg = new DrillSetup("by-ear", { mode: "learn", source: "", speed: "1", pitch: "0" });
  const s = $derived(cfg.value);
  const mode = $derived(s.mode === "home" ? "home" : "learn");

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
      if (!blob) throw new Error("That recording's audio is missing from this browser.");
      player?.dispose();
      player = await audio.earPlayer(blob);
      player.set({ rate: Number(s.speed), semitones: Number(s.pitch) });
      duration = player.buffer.duration;
      env = envelope(player.buffer.getChannelData(0));
      loop = null;
      sections = await getSetting<{ at: number; name: string }[]>(sectionKey(source), []);
      loaded = source;
      status = `Loaded ${sourceName || "the recording"}: ${clock(duration)}.`;
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

  async function start() {
    rated = null;
    home = null;
    homeAnswered = false;
    played = [];
    notes = [];
    if (!(await load())) {
      phase = "ready";
      status = status || "Pick or import a recording first.";
      return;
    }
    t0 = performance.now();
    cap = capture(t0, (e) => {
      if (e.kind !== "noteon") return;
      notes.push(e);
      if (mode === "home") return answerHome(pc(e.midi));
      played = [...played.slice(-95), { midi: e.midi, at: player?.position() ?? 0 }];
      flashes.add(e.midi, "correct");
    });
    player!.play(loop ? loop.a : pos);
    status =
      mode === "home"
        ? "Listen. Play or sing the note that sounds like home, or pick it below."
        : loop
          ? "Looping. Play the part along with it; your notes show over the loop."
          : "Playing. Set A and B to loop a stretch; your notes show over the recording.";
  }

  function stop() {
    cap?.stop();
    cap = null;
    player?.pause();
    if (mode === "home" && !homeAnswered) {
      phase = "ready";
      status = "Stopped before an answer: nothing recorded.";
      return;
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
    await run.finish({ score: right ? 1 : 0, correct: right, headline: right ? `Home is ${FLAT_NAMES[answer]}` : `Heard ${FLAT_NAMES[answer]}, home is ${FLAT_NAMES[tonics[0]]}` });
    cap?.stop();
    cap = null;
    player?.pause();
    phase = "results";
    status = right ? `Right: ${FLAT_NAMES[answer]} is home.` : `${FLAT_NAMES[answer]} is not home here. The recording points to ${keyName(ranked[0])}.`;
  }
  const keyName = (k: KeyGuess) => `${FLAT_NAMES[k.tonicPc]} ${k.minor ? "minor" : "major"}`;

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
    await run.finish({ score: got ? 1 : 0, correct: got, headline: got ? "Got the part by ear" : "Still learning the part" });
    status = got ? "Saved: you rated it got. Try it at a faster speed next." : "Saved as still learning. Loop a shorter stretch or slow it down.";
  }

  onDestroy(() => {
    cancelAnimationFrame(frame);
    cap?.stop();
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
    { text: mode === "home" ? "Find home" : "Learn a part", focus: "mode" },
    { text: sourceName || "no recording yet", focus: "source" },
    { text: `${Math.round(Number(s.speed) * 100)}% speed`, focus: "speed" },
    ...(s.pitch !== "0" ? [{ text: `${s.pitch} semitones`, focus: "pitch" }] : []),
  ]);
</script>

<svelte:head><title>Learn by ear | Woodshed</title></svelte:head>

<DrillShell
  title="Learn by ear"
  hue="ear"
  blurb="Load a recording you own, loop a stretch, slow it down without changing its pitch and play the part back. Find home names the note the music rests on."
  summary={summaryLine}
  checkable={false}
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
          { value: "home", label: "Find home", hint: "Name the note the music rests on. Judged against the recording's key." },
        ]}
        value={mode}
        onchange={(v) => cfg.set({ mode: v })}
      />
      <div class="flex flex-col gap-1 text-sm" data-setup="source">
        <span class="font-medium">Recording</span>
        <div class="flex flex-wrap items-center gap-2">
          <Picker class="w-auto min-w-48" label="Recording" value={s.source} placeholder="Pick a recording" options={sources} onchange={(v) => pick(v)} />
          <label class="{btn} cursor-pointer focus-within:outline-2">
            <Upload class="size-4" aria-hidden="true" />Import
            <input class="sr-only" type="file" accept="audio/*" aria-label="Import a recording" onchange={(e) => addFile(e.currentTarget.files?.[0])} />
          </label>
        </div>
        <span class="text-ws-soft">Files you own, your backing tracks and your takes from Record. They stay in this browser.</span>
        {#if importError}<p role="alert" class="font-medium text-destructive">{importError}</p>{/if}
      </div>
      <Choice label="Speed" setupKey="speed" options={SPEEDS} value={s.speed} onchange={setSpeed} />
      <Choice label="Pitch" setupKey="pitch" options={PITCHES} value={s.pitch} onchange={setPitch} />
    </div>
    <p class="mt-3 text-sm text-ws-soft">Below 100% the pitch stays where it is (granular time stretch, a little grainy). A pitch change keeps the speed.</p>
  {/snippet}

  {#snippet hud()}
    {#if loaded}
      <Stat label="Position" value="{clock(pos)} of {clock(duration)}" />
      {#if loop}<Stat label="Loop" value="{clock(loop.a)} to {clock(loop.b)}" />{/if}
      <Stat label="Speed" value="{Math.round(Number(s.speed) * 100)}%" />
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if !s.source}
      <div class="py-6 text-center">
        <p class="font-display text-xl font-semibold">Pick a recording to learn from.</p>
        <p class="mt-1 text-ws-stage-soft">Import a file you own, or use a take from Record or a backing track.</p>
        <label class="{btnPrimary} mt-4 cursor-pointer focus-within:outline-2">
          <Upload class="size-4" aria-hidden="true" />Import a recording
          <input class="sr-only" type="file" accept="audio/*" aria-label="Import a recording file" onchange={(e) => addFile(e.currentTarget.files?.[0])} />
        </label>
      </div>
    {:else}
      <div class="flex flex-col gap-3" data-loaded={loaded ? "yes" : "no"}>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class={btnStage} onclick={toggle} disabled={loading}>
            {#if playing}<Pause class="size-4" aria-hidden="true" />Pause{:else}<Play class="size-4" aria-hidden="true" />{loaded ? "Play" : loading ? "Loading" : "Load and play"}{/if}
          </button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={() => player?.seek(pos - 5)}>Back 5 s</button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={setA}>Set A</button>
          <button type="button" class={btnStage} disabled={!loaded} onclick={setB}>Set B</button>
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
              <p class="text-sm text-ws-stage-soft">{sections.length} marks. Tap one to loop it up to the next.</p>
            {/if}
          </div>
        {/if}

        {#if phase === "running" && mode === "home"}
          <div role="group" aria-label="Home note" class="grid grid-cols-6 gap-2 sm:grid-cols-12">
            {#each FLAT_NAMES as name, i (i)}
              <button type="button" class="choice min-h-12 rounded-xl font-display text-lg font-semibold" onclick={() => answerHome(i)}>{name}</button>
            {/each}
          </div>
        {:else if mode === "learn" && phase !== "results"}
          <InstrumentStage line={[48, 84]} {flashes} interactive={phase === "running"} />
          <p class="text-sm" aria-live="polite">
            <span class="text-ws-stage-soft">You played:</span>
            <span class="tnum font-medium [word-spacing:0.4rem]">{lastNotes.length ? lastNotes.map((n) => noteName(n.midi, "flat")).join(" ") : "nothing yet"}</span>
          </p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet results()}
    <article class="{panel} flex flex-col gap-3" aria-label="This run">
      {#if mode === "home" && home}
        {@const right = home.tonics.includes(home.answer)}
        <p class="font-display text-2xl font-semibold">{right ? `Right: home is ${FLAT_NAMES[home.answer]}.` : `You picked ${FLAT_NAMES[home.answer]}; home sounds like ${FLAT_NAMES[home.tonics[0]]}.`}</p>
        <p class="text-sm text-ws-soft">
          The recording's notes point to {keyName(home.ranked[0])}{home.tonics.length > 1 ? `, with ${keyName(home.ranked.find((k) => k.tonicPc === home!.tonics[1] && k.minor !== home!.ranked[0].minor) ?? home.ranked[1])} close behind, so either tonic counts` : ""}.
          The key is worked out from the whole recording; a song that changes key or sits long away from home can fool it.
        </p>
      {:else if mode === "learn"}
        <p class="font-display text-2xl font-semibold">{played.length} notes played{loop ? ` over ${clock(loop.a)} to ${clock(loop.b)}` : ""} at {Math.round(Number(s.speed) * 100)}%.</p>
        {#if played.length}<p class="text-sm">{played.slice(-32).map((n) => noteName(n.midi, "flat")).join(" ")}</p>{/if}
        {#if rated === null}
          <p class="text-sm text-ws-soft">The app can't hear the part inside the recording, so you judge it: could you play it with the record?</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btnPrimary} onclick={() => rate(true)}>I got it</button>
            <button type="button" class={btn} onclick={() => rate(false)}>Not yet</button>
          </div>
        {:else}
          <p class="text-sm text-ws-soft">Saved as {rated ? "got it" : "still learning"}, self-rated, in your journal.</p>
        {/if}
      {/if}
    </article>
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
