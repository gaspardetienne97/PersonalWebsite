<script lang="ts">
  // Jam (catalog 4.10): solo over a progression with every pitch class of the
  // current chord lit as chord tone, scale tone or avoid. Unscored: after each
  // chorus a report says where the notes landed, and the session is logged
  // with its notes saved as a take.
  import { onDestroy, onMount } from "svelte";
  import Music from "lucide-svelte/icons/music";
  import SkipForward from "lucide-svelte/icons/skip-forward";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Upload from "lucide-svelte/icons/upload";
  import { FLAT_NAMES, noteName, pc, type NoteEvent } from "@repo/music-core";
  import { JAM_GROUPS, JAM_TEMPO, JAM_TRANSPOSE, PROGRESSIONS, jamToneRoles, transposeProgression, chorusBars } from "@repo/music-core/content/jam";
  import { chorusReport, type ChorusReport } from "@repo/music-core/scoring/jam";
  import type { ToneRole } from "@repo/music-core/theory/chords";
  import { TUNINGS } from "@repo/music-core/data/index";
  import DrillShell, { type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Fretboard, { type FretMark } from "$lib/music/components/Fretboard.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import type { CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage, panel } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { capture, runInstrument, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, settings, type SequenceHandle } from "$lib/music/runtime";
  import { backingNotes, chordVoicing, degreeLabel, positionAt, BEATS_PER_BAR, type BackingMode } from "$lib/music/drills/jam/backing";
  import { importTrack, listTracks, playTrack, type BackingTrack } from "$lib/music/drills/jam/tracks";
  import { pairNotes, saveTake, takeToSequence, type MidiTake } from "$lib/music/takes";
  import Picker from "$lib/music/components/Picker.svelte";

  const cfg = new DrillSetup("jam", { progression: "ii-v-i", backing: "both", bpm: 0, transpose: 0, track: "" });
  const s = $derived(cfg.value);
  const base = $derived(PROGRESSIONS.find((p) => p.id === s.progression) ?? PROGRESSIONS[0]);
  const prog = $derived(transposeProgression(base, s.transpose));
  const bpm = $derived(Math.min(JAM_TEMPO.max, Math.max(JAM_TEMPO.min, s.bpm || base.bpm)));
  const beatMs = $derived(60000 / bpm);
  const backingMode = $derived(s.backing as BackingMode | "track");

  let phase = $state<Phase>("ready");
  let status = $state("");
  let chordIdx = $state(0);
  let chorus = $state(1);
  let beatInChord = $state(0);
  let backingOn = $state(false);
  let lastNote = $state<{ midi: number; role: ToneRole; label: string; symbol: string } | null>(null);
  let played = $state.raw<{ midi: number; at: number; chordIndex: number; chorus: number }[]>([]);
  let choruses = $state.raw<{ n: number; report: ChorusReport; startAt: number; endAt: number }[]>([]);
  let savedTake = $state.raw<MidiTake | null>(null);
  let tracks = $state.raw<BackingTrack[]>([]);
  let trackError = $state("");
  let cap: Capture | null = null;
  let seq: SequenceHandle | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let seg = { startPerf: 0, fromChord: 0, chorusBase: 1 };
  let runStart = 0;
  let chorusStart = 0;
  let review: SequenceHandle | null = $state(null);

  onMount(async () => {
    tracks = await listTracks().catch(() => []);
  });

  const chord = $derived(prog.chords[chordIdx]);
  const roles = $derived(jamToneRoles(chord));
  const instrument = $derived(settings.value.activeInstrument);
  const fretted = $derived(instrument === "guitar" || instrument === "ukulele");
  const tuning = $derived(
    instrument === "ukulele"
      ? (TUNINGS.ukulele.find((t) => t.id === settings.value.ukuleleTuningId) ?? TUNINGS.ukulele[0])
      : (TUNINGS.guitar.find((t) => t.id === settings.value.guitarTuningId) ?? TUNINGS.guitar[0]),
  );

  const pianoMarks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    for (let m = 48; m <= 84; m++) out[m] = { label: degreeLabel(chord.symbol, pc(m)), role: roles[pc(m)] };
    return out;
  });
  const fretMarks = $derived.by(() => {
    const out: FretMark[] = [];
    tuning.openStrings.forEach((open, i) => {
      for (let f = 0; f <= 12; f++) out.push({ string: i + 1, fret: f, label: degreeLabel(chord.symbol, pc(open + f)), role: roles[pc(open + f)] });
    });
    return out;
  });

  const ROLE_TEXT: Record<ToneRole, string> = { chord: "chord tone", scale: "scale tone", avoid: "avoid note" };
  const scaleName = (c: typeof chord) => `${FLAT_NAMES[c.scale.rootPc]} ${c.scale.name}`;

  // ---- Backing ------------------------------------------------------------
  function tick() {
    const pos = positionAt(prog, seg.fromChord, (performance.now() - seg.startPerf) / beatMs);
    const nextChorus = seg.chorusBase + pos.choruses;
    beatInChord = pos.beatInChord;
    if (nextChorus !== chorus) closeChorus();
    chordIdx = pos.chordIndex;
  }

  async function startBacking() {
    if (backingOn || backingMode === "none") return;
    await audio.unlock();
    try {
      if (backingMode === "track") {
        if (!s.track) throw new Error("Pick or import a backing track in the setup first.");
        seq = await playTrack(s.track);
      } else {
        seq = audio.playSequence(backingNotes(prog, { bpm, mode: backingMode, choruses: 64, fromChord: chordIdx }));
      }
    } catch (e) {
      status = (e as Error).message;
      return;
    }
    // The form clock starts with the audio, or now if the browser has no sound yet.
    seg = { startPerf: seq.playing ? seq.startPerf : performance.now(), fromChord: chordIdx, chorusBase: chorus };
    backingOn = true;
    ticker = setInterval(tick, 40);
    status = backingMode === "track" ? "Backing track playing. Chords follow the tempo you set." : `Backing playing at ${bpm} BPM.`;
  }

  function stopBacking() {
    clearInterval(ticker);
    seq?.stop();
    seq = null;
    if (backingOn) status = "Backing stopped. Move through the chords with Next chord.";
    backingOn = false;
    beatInChord = 0;
  }

  // ---- Run ----------------------------------------------------------------
  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    played = [...played, { midi: e.midi, at: e.at, chordIndex: chordIdx, chorus }];
    lastNote = { midi: e.midi, role: roles[pc(e.midi)], label: degreeLabel(chord.symbol, pc(e.midi)), symbol: chord.symbol };
  }

  function closeChorus() {
    const now = performance.now();
    const notes = played.filter((n) => n.chorus === chorus);
    const report = chorusReport(prog, notes);
    choruses = [...choruses, { n: chorus, report, startAt: chorusStart, endAt: now }];
    status = `Chorus ${chorus}: ${report.headline}`;
    chorus += 1;
    chorusStart = now;
  }

  function nextChord() {
    if (backingOn) return;
    const next = (chordIdx + 1) % prog.chords.length;
    if (next === 0) closeChorus();
    chordIdx = next;
  }

  function playChord() {
    void audio.unlock().then(() => {
      const v = chordVoicing(chord.symbol);
      audio.playChord([v.bass, ...v.upper], 1.4);
    });
  }

  async function start(ctx: RunContext) {
    stopReview();
    chordIdx = 0;
    chorus = 1;
    played = [];
    choruses = [];
    lastNote = null;
    savedTake = null;
    runStart = ctx.downbeat;
    chorusStart = ctx.downbeat;
    cap = capture(ctx.downbeat, (e) => (e.kind === "noteon" || e.kind === "noteoff") && onNote(e));
    status = backingMode === "none" ? "Play. Move to the next chord with Next chord (or N)." : "Play over the changes.";
    await startBacking();
  }

  async function stop() {
    stopBacking();
    cap?.stop();
    const endAt = performance.now();
    if (played.some((n) => n.chorus === chorus)) closeChorus();
    phase = "results";
    const events = cap?.notes ?? [];
    cap = null;
    const count = played.length;
    if (!count) {
      status = "Nothing was played, so nothing was saved.";
      return;
    }
    const inst = runInstrument(events);
    const headline = `${count} note${count === 1 ? "" : "s"} over ${choruses.length} chorus${choruses.length === 1 ? "" : "es"} of ${prog.name} in ${prog.key}`;
    const take: MidiTake = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      name: `Jam: ${prog.name} in ${prog.key}`,
      notes: pairNotes(events, runStart, endAt),
      durationMs: Math.round(endAt - runStart),
      instrument: inst,
      note: choruses.map((c) => `Chorus ${c.n}: ${c.report.headline}`).join("\n"),
    };
    await saveTake(take);
    savedTake = take;
    await practice.logSession(
      "jam",
      inst,
      {
        exerciseId: "jam.improv",
        setupKey: `${prog.id}|${s.transpose}|${s.backing}|${bpm}`,
        promptIds: [],
        skillIds: [],
        difficulty: base.difficulty === "advanced" ? 0.7 : base.difficulty === "intermediate" ? 0.5 : 0.3,
        instrument: inst,
        params: { progression: prog.id, key: prog.key, bpm, transpose: s.transpose, backing: s.backing, notes: count, choruses: choruses.length, takeId: take.id },
        startedAt: Date.now() - take.durationMs,
        endedAt: Date.now(),
        assistance: "guided",
        headline,
      },
      ["jam", prog.group],
    );
    status = `${headline}. Saved as a take and logged in your journal.`;
  }

  function stopReview() {
    review?.stop();
    review = null;
  }
  async function playChorus(c: { startAt: number; endAt: number }) {
    stopReview();
    if (!savedTake) return;
    await audio.unlock();
    const from = c.startAt - runStart;
    const to = c.endAt - runStart;
    const notes = takeToSequence({ ...savedTake, notes: savedTake.notes.filter((n) => n.startMs >= from && n.startMs < to).map((n) => ({ ...n, startMs: n.startMs - from })) });
    review = audio.playSequence(notes);
  }

  async function addTrack(file: File | undefined) {
    if (!file) return;
    trackError = "";
    try {
      const t = await importTrack(file);
      tracks = [t, ...tracks];
      cfg.set({ track: t.id, backing: "track" });
      status = `Imported ${t.name}. It plays as the backing.`;
    } catch (e) {
      trackError = (e as Error).message;
      status = trackError;
    }
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (e.code === "KeyN" && phase === "running" && !backingOn && !t?.closest("input, select, textarea")) {
      e.preventDefault();
      nextChord();
    }
  }

  onDestroy(() => {
    stopBacking();
    cap?.stop();
    stopReview();
  });

  const summaryLine = $derived(
    `${prog.name} in ${prog.key}, ${backingMode === "none" ? "no backing, chords by hand" : backingMode === "track" ? "your backing track" : backingMode === "both" ? "drums and chords" : backingMode}, ${bpm} BPM${s.transpose ? `, transposed ${s.transpose > 0 ? "+" : ""}${s.transpose}` : ""}`,
  );
  const barsTotal = $derived(chorusBars(prog));
  const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
</script>

<svelte:head><title>Jam | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<DrillShell
  title="Jam"
  hue={instrument}
  blurb="Solo over the changes. Every note is lit as a chord tone, a scale tone or an avoid note for the chord sounding now."
  summary={summaryLine}
  checkable={false}
  bind:phase
  bind:status
  progress={(prog.chords.slice(0, chordIdx).reduce((n, c) => n + c.bars, 0) + beatInChord / BEATS_PER_BAR) / barsTotal}
  startLabel="Start jamming"
  blocked={backingMode === "track" && !s.track ? "Pick or import a backing track in the setup first." : null}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="flex min-w-0 flex-col gap-1 text-sm">
        <span class="font-medium">Progression</span>
        <Picker label="Progression" value={s.progression} options={JAM_GROUPS.flatMap((g) => PROGRESSIONS.filter((p) => p.group === g.id).map((p) => ({ value: p.id, label: `${p.name} (${p.difficulty})`, group: g.label })))} onchange={(v) => cfg.set({ progression: v, bpm: 0 })} />
      </div>
      <Choice
        label="Backing"
        select
        options={[
          { value: "both", label: "Drums and chords" },
          { value: "drums", label: "Drums" },
          { value: "chords", label: "Chords" },
          { value: "track", label: "Your backing track" },
          { value: "none", label: "None, chords by hand" },
        ]}
        value={s.backing}
        onchange={(v) => cfg.set({ backing: v })}
      />
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Tempo ({JAM_TEMPO.min} to {JAM_TEMPO.max} BPM)</span>
        <input class="tnum min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" type="number" min={JAM_TEMPO.min} max={JAM_TEMPO.max} value={bpm} onchange={(e) => cfg.set({ bpm: Number(e.currentTarget.value) || 0 })} />
      </label>
      <Choice
        label="Transpose"
        select
        options={Array.from({ length: JAM_TRANSPOSE.max - JAM_TRANSPOSE.min + 1 }, (_, i) => i + JAM_TRANSPOSE.min).map((t) => ({ value: t, label: t === 0 ? "Written key" : `${t > 0 ? "+" : ""}${t} (${FLAT_NAMES[pc(base.keyPc + t)]})` }))}
        value={s.transpose}
        onchange={(v) => cfg.set({ transpose: v })}
      />
    </div>
    <div class="mt-4 border-t border-ws-line pt-4" id="backing-tracks">
      <p class="text-sm font-medium">Your backing tracks</p>
      <p class="text-sm text-ws-soft">Audio files you bring (the jazz tracks in the Reference aren't shipped). They stay in this browser.</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        {#if tracks.length}
          <Picker class="w-auto min-w-40" label="Backing track" placeholder="Choose a track" value={s.track} options={tracks.map((t) => ({ value: t.id, label: t.name }))} onchange={(v) => cfg.set({ track: v, backing: "track" })} />
        {/if}
        <label class="{btn} cursor-pointer focus-within:outline-2">
          <Upload class="size-4" aria-hidden="true" />Import a track
          <input class="sr-only" type="file" accept="audio/*" aria-label="Import a backing track" onchange={(e) => addTrack(e.currentTarget.files?.[0])} />
        </label>
        {#if trackError}<p role="alert" class="text-sm font-medium text-destructive">{trackError}</p>{/if}
      </div>
    </div>
  {/snippet}

  {#snippet hud()}
    <Stat label="Backing" value={phase === "running" ? (backingOn ? "Playing" : backingMode === "none" ? "By hand" : "Stopped") : backingMode === "none" ? "By hand" : "Ready"} />
    <Stat label="Tempo" value="{bpm} BPM" />
    {#if phase === "running" || phase === "results"}
      <Stat label="Notes recorded" value={played.length} />
      <Stat label="Chorus" value={phase === "results" ? choruses.length : chorus} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <ol class="mb-4 flex flex-wrap gap-1.5" aria-label="The form, {prog.name}">
      {#each prog.chords as c, i (i)}
        <li
          class="chord-cell flex min-h-11 items-center justify-center rounded-lg px-3 font-display font-semibold"
          class:now={i === chordIdx}
          style:flex-grow={c.bars}
          aria-current={i === chordIdx ? "step" : undefined}
        >
          {c.symbol}<span class="sr-only">, {c.bars} bar{c.bars > 1 ? "s" : ""}{i === chordIdx ? ", now" : ""}</span>
        </li>
      {/each}
    </ol>

    <div class="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div class="min-w-0">
        <p class="text-sm text-ws-stage-soft">Now</p>
        <p class="font-display text-5xl font-bold leading-none" data-testid="jam-chord">{chord.symbol}</p>
        <p class="mt-1 text-ws-stage-soft">{scaleName(chord)} fits. Next: {prog.chords[(chordIdx + 1) % prog.chords.length].symbol}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class={btnStage} onclick={playChord}><Music class="size-4" aria-hidden="true" />Play the chord</button>
        {#if phase === "running"}
          <button type="button" class={btnStage} disabled={backingOn} onclick={nextChord}><SkipForward class="size-4" aria-hidden="true" />Next chord <kbd class="text-xs opacity-60">N</kbd></button>
          {#if backingMode !== "none"}
            <button type="button" class={btnStage} aria-pressed={backingOn} onclick={() => (backingOn ? stopBacking() : startBacking())}>
              {#if backingOn}<Square class="size-4" aria-hidden="true" />Stop the backing{:else}<Play class="size-4" aria-hidden="true" />Play the backing{/if}
            </button>
          {/if}
        {/if}
      </div>
    </div>

    {#if fretted}
      <Fretboard openStrings={tuning.openStrings} from={0} to={12} marks={fretMarks} label="{tuning.name} fretboard, tone roles over {chord.symbol}" />
    {:else}
      <Piano low={48} high={84} marks={pianoMarks} names="c" label="Keyboard, tone roles over {chord.symbol}" />
    {/if}

    <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span class="flex items-center gap-2"><span class="legend fill" style:background="var(--tone-chord)" aria-hidden="true"></span>Chord tone (filled gold)</span>
      <span class="flex items-center gap-2"><span class="legend fill" style:background="var(--tone-scale)" aria-hidden="true"></span>Scale tone (filled blue)</span>
      <span class="flex items-center gap-2"><span class="legend ring" aria-hidden="true"></span>Avoid (dashed ring)</span>
      <span class="text-ws-stage-soft">Labels are degrees over the chord.</span>
    </div>

    {#if lastNote}
      <p class="mt-3 text-lg" data-testid="jam-last">
        <span class="font-display font-semibold">{noteName(lastNote.midi)}</span>
        <span class="role-pill" data-role={lastNote.role}>{lastNote.role === "chord" ? "●" : lastNote.role === "scale" ? "◐" : "○"} {ROLE_TEXT[lastNote.role]}</span>
        <span class="text-ws-stage-soft">({lastNote.label} of {lastNote.symbol})</span>
      </p>
    {/if}
    {#if phase === "running" && choruses.length}
      {@const c = choruses[choruses.length - 1]}
      <p class="mt-2 text-sm text-ws-stage-soft">Chorus {c.n}: {c.report.headline}</p>
    {/if}
  {/snippet}

  {#snippet results()}
    <article class="{panel} flex flex-col gap-4">
      <div class="flex flex-wrap items-start gap-4">
        <div class="min-w-0 flex-1 basis-72">
          <p class="font-display text-2xl font-semibold leading-snug">
            {played.length ? `${played.length} notes over ${choruses.length} chorus${choruses.length === 1 ? "" : "es"}.` : "Nothing was played this time."}
          </p>
          <p class="mt-1 text-sm text-ws-soft">Jam is not scored. The reports below describe where your notes landed, chorus by chorus.</p>
          {#if savedTake}<p class="mt-2 text-sm">Saved as a take. <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/record">Open it in Record</a></p>{/if}
        </div>
        {#if played.length}
          {@const t = choruses.reduce((a, c) => ({ chord: a.chord + c.report.chord, notes: a.notes + c.report.notes }), { chord: 0, notes: 0 })}
          <div class="text-right">
            <p class="tnum font-display text-5xl font-bold leading-none">{pctOf(t.chord, t.notes)}%</p>
            <p class="mt-1 text-sm text-ws-soft">on chord tones</p>
          </div>
        {/if}
      </div>
      {#if choruses.length}
        <ol class="flex flex-col gap-3" aria-label="Chorus reports">
          {#each choruses as c (c.n)}
            <li class="rounded-xl border border-ws-line p-3">
              <div class="flex flex-wrap items-center gap-3">
                <p class="min-w-0 flex-1"><span class="font-semibold">Chorus {c.n}.</span> {c.report.headline}</p>
                {#if savedTake && c.report.notes}
                  <button type="button" class={btn} onclick={() => playChorus(c)}><Play class="size-4" aria-hidden="true" />Hear this chorus</button>
                {/if}
              </div>
              {#if c.report.notes}
                <div class="share mt-2" role="img" aria-label="{pctOf(c.report.chord, c.report.notes)}% chord tones, {pctOf(c.report.scale, c.report.notes)}% scale tones, {pctOf(c.report.avoid, c.report.notes)}% avoid notes">
                  <span style:width="{pctOf(c.report.chord, c.report.notes)}%" style:background="var(--tone-chord)"></span>
                  <span style:width="{pctOf(c.report.scale, c.report.notes)}%" style:background="var(--tone-scale)"></span>
                  <span class="avoid" style:width="{pctOf(c.report.avoid, c.report.notes)}%"></span>
                </div>
                <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ws-soft">
                  {#each c.report.perChord as pc_ (pc_.index)}
                    <li><span class="font-medium text-ws-ink">{pc_.symbol}</span> {pc_.notes ? `${pc_.chord} chord, ${pc_.scale} scale, ${pc_.avoid} avoid` : "nothing played"}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </article>
  {/snippet}
</DrillShell>

<style>
  .chord-cell {
    flex-basis: 3.5rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    color: var(--ws-stage-soft);
  }
  .chord-cell.now {
    background: var(--instr);
    color: var(--ws-stage);
  }
  .legend {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
  }
  .legend.ring {
    border: 2px dashed var(--tone-avoid);
  }
  .role-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0 0.4rem;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ws-stage);
  }
  .role-pill[data-role="chord"] {
    background: var(--tone-chord);
  }
  .role-pill[data-role="scale"] {
    background: var(--tone-scale);
  }
  .role-pill[data-role="avoid"] {
    background: transparent;
    color: inherit;
    border: 2px dashed var(--tone-avoid);
  }
  .share {
    display: flex;
    height: 0.6rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--ws-raised);
  }
  .share .avoid {
    background: repeating-linear-gradient(90deg, var(--tone-avoid) 0 4px, transparent 4px 7px);
  }
</style>
