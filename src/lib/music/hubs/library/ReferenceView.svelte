<script lang="ts">
  // Chord and scale reference on the one keyboard, then the jazz tables.
  // Every section has an id; ?section=<id> (used by the Jazz Path reference
  // steps) scrolls to it and moves focus to its heading.
  import { onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import { FLAT_NAMES, noteName } from "@repo/music-core";
  import { JAZZ, type ChordScaleRow } from "@repo/music-core/data/index";
  import { SCALE_GROUPS, SCALE_KINDS, scaleSemitones } from "@repo/music-core/theory/scales";
  import { CHORD_TEMPLATES, parseChordSymbol } from "@repo/music-core/theory/chords";
  import Piano from "$lib/music/components/Piano.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import type { CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { audio, type SequenceHandle } from "$lib/music/runtime";
  import { chordVoicing } from "$lib/music/drills/jam/backing";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();

  const SECTIONS = [
    { id: "explorer", label: "Chords and scales" },
    { id: "vocabulary", label: "Chord vocabulary" },
    { id: "chord-scales", label: "Chord-scale map" },
    { id: "voicings", label: "Voicing recipes" },
    { id: "dominants", label: "Dominant voicings" },
    { id: "upper-structures", label: "Upper structures" },
    { id: "cycle", label: "12-key cycle" },
    { id: "techniques", label: "Improv techniques" },
    { id: "repertoire", label: "Repertoire" },
    { id: "backing", label: "Backing tracks" },
  ] as const;

  // Data text uses spaced dashes; render them as a colon.
  const tidy = (s: string) => s.replace(/\s+[—–]\s+/g, ": ");
  const titleCase = (k: string) => k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

  // ---- Explorer ---------------------------------------------------------
  let kind = $state<"scale" | "chord">("scale");
  let tonicPc = $state(0);
  let scaleName = $state<string>("major");
  let quality = $state<string>("maj7");
  let lit = $state<number | null>(null);
  let handle: SequenceHandle | null = $state(null);

  const tonic = $derived(60 + tonicPc);
  const SCALE_DEG: Record<number, string> = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
  const CHORD_DEG: Record<number, string> = { 0: "R", 1: "b9", 2: "9", 3: "b3", 4: "3", 5: "11", 6: "b5", 7: "5", 8: "#5", 9: "6", 10: "b7", 11: "7", 14: "9" };
  const scaleSteps = $derived(scaleSemitones(scaleName) ?? [0, 2, 4, 5, 7, 9, 11, 12]);
  const template = $derived(CHORD_TEMPLATES.find((t) => t.quality === quality) ?? CHORD_TEMPLATES[0]);
  const chordSteps = $derived(template.intervals.map((i) => (template.intervals.length >= 5 && i === 2 ? 14 : i)));
  const shown = $derived(kind === "scale" ? scaleSteps.map((s) => tonic + s) : chordSteps.map((s) => tonic + s));
  const shownLabel = $derived(
    kind === "scale" ? `${FLAT_NAMES[tonicPc]} ${titleCase(scaleName).toLowerCase()}` : `${FLAT_NAMES[tonicPc]}${template.suffix}`,
  );

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    shown.forEach((m, i) => {
      const semi = m - tonic;
      const deg = kind === "scale" ? (semi === 6 && scaleSteps.includes(5) ? "#4" : semi === 8 && !scaleSteps.includes(9) && scaleSteps.includes(7) ? "b6" : SCALE_DEG[semi % 12]) : CHORD_DEG[semi] ?? CHORD_DEG[semi % 12];
      out[m] = lit === i ? { demo: true } : { target: true, label: deg, role: kind === "chord" || semi % 12 === 0 ? "chord" : "scale" };
    });
    return out;
  });

  function stop() {
    handle?.stop();
    handle = null;
    lit = null;
  }

  async function hear() {
    if (handle?.playing) return stop();
    await audio.unlock();
    const beat = 0.32;
    const seq =
      kind === "scale"
        ? [...shown, ...[...shown].reverse().slice(1)].map((midi, i) => ({ midi, time: i * beat, duration: beat * 0.9 }))
        : [...shown.map((midi, i) => ({ midi, time: i * beat, duration: beat * 0.9 })), ...shown.map((midi) => ({ midi, time: shown.length * beat, duration: 1.4 }))];
    const h = audio.playSequence(seq, {
      onNote: (i) => {
        const idx = shown.indexOf(seq[i].midi);
        lit = seq[i].time >= shown.length * beat && kind === "chord" ? null : idx;
      },
    });
    handle = h;
    onstatus?.(`Playing ${shownLabel}.`);
    void h.done.then(() => {
      if (handle === h) stop();
    });
  }

  // Chord-scale matches for the chord on show.
  const FAMILY: Record<string, string> = { maj7: "maj7", maj9: "maj7", m7: "m7", m9: "m7", "7": "dom7", "9": "dom7", "7sus4": "dom7", m7b5: "m7b5", dim7: "dim7", "6": "maj6", m6: "min6" };
  // The data files Locrian #2 under the altered scale id; its sound is locrian #2.
  const rowScale = (r: ChordScaleRow) => (r.label === "Locrian #2" ? "locrian #2" : r.scale);
  const matches = $derived(JAZZ.CHORD_SCALE_MAP.filter((r) => r.family === FAMILY[quality]));

  async function showScale(r: ChordScaleRow, root = tonicPc) {
    stop();
    kind = "scale";
    scaleName = rowScale(r);
    tonicPc = root;
    onstatus?.(`${FLAT_NAMES[root]} ${r.label} on the keyboard.`);
    await tick();
    document.getElementById("explorer")?.scrollIntoView({ block: "start" });
  }

  const scaleOptions = $derived([
    ...[...SCALE_GROUPS.modes, ...SCALE_GROUPS.jazz].map((k) => ({ value: k as string, label: titleCase(k) + (SCALE_GROUPS.jazz.includes(k) ? " (jazz)" : "") })),
    ...((SCALE_KINDS as string[]).includes(scaleName) ? [] : [{ value: scaleName, label: titleCase(scaleName.replace(/ /g, "-")) }]),
  ]);

  // ---- Playback of table rows -------------------------------------------
  function playNotes(midis: number[], label: string) {
    stop();
    void audio.unlock().then(() => {
      audio.playChord(midis, 1.6);
      onstatus?.(`Playing ${label}.`);
    });
  }
  function playSymbol(symbol: string) {
    const v = chordVoicing(symbol);
    const c = parseChordSymbol(symbol);
    const ext = c ? c.intervals.filter((i) => i > 11).map((i) => 48 + c.rootPc + i) : [];
    playNotes([v.bass, ...v.upper, ...ext], symbol);
  }

  const RECIPES = [
    { id: "rooted", name: "Rooted", degrees: "1 3 5 7", semis: [0, 4, 7, 11], use: "The plain chord, root at the bottom." },
    { id: "shell", name: "Shell", degrees: "1 3 7", semis: [0, 4, 11], use: "Just the root, 3rd and 7th: the sound of the chord with nothing extra." },
    { id: "rootless-a", name: "Rootless A", degrees: "3 5 7 9", semis: [4, 7, 11, 14], use: "Use when the melody note is the 9th. The left hand takes the root." },
    { id: "rootless-b", name: "Rootless B", degrees: "7 9 3 5", semis: [11, 14, 16, 19], use: "Use when the melody note is the 5th. The left hand takes the root." },
  ];

  const repertoire = $derived(
    Object.entries(
      JAZZ.JAZZ_REPERTOIRE.reduce<Record<string, string[]>>((acc, t) => ((acc[t.feel] ??= []).push(t.title), acc), {}),
    ),
  );
  const trackFor = (title: string) => JAZZ.JAZZ_BACKING_TRACKS.find((b) => b.songs.some((s) => s.toLowerCase() === title.toLowerCase()));

  // ---- ?section= --------------------------------------------------------
  const section = $derived(page.url.searchParams.get("section"));
  $effect(() => {
    const id = section;
    if (!id) return;
    // After layout: the section may sit below content that is still rendering.
    void tick().then(() => requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ block: "start" });
      el?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }));
  });

  onDestroy(stop);
</script>

<div class="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
  <nav aria-label="Reference sections" class="lg:sticky lg:top-24 lg:self-start">
    <ul class="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
      {#each SECTIONS as s (s.id)}
        <li>
          <a
            href="?tab=reference&section={s.id}"
            data-sveltekit-noscroll
            aria-current={section === s.id ? "location" : undefined}
            class="flex min-h-11 items-center rounded-lg border border-ws-line px-3 text-sm lg:border-transparent {section === s.id ? 'bg-instr-wash font-semibold text-instr-ink' : 'text-ws-soft hover:bg-ws-raised hover:text-ws-ink'}"
            >{s.label}</a
          >
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-10">
    <section id="explorer" class="scroll-mt-24" aria-labelledby="h-explorer">
      <h2 id="h-explorer" tabindex="-1" class="font-display text-2xl font-semibold">Chords and scales on the keyboard</h2>
      <p class="mt-1 max-w-prose text-ws-soft">All 17 scales and every chord quality, on any tonic. Labels are degrees from the tonic; tap Hear it to play it back, or play along.</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Choice
          label="Show"
          options={[
            { value: "scale", label: "Scale" },
            { value: "chord", label: "Chord" },
          ]}
          value={kind}
          onchange={(v) => {
            stop();
            kind = v as "scale" | "chord";
          }}
        />
        <Choice label="Tonic" select options={FLAT_NAMES.map((n, i) => ({ value: i, label: n }))} value={tonicPc} onchange={(v) => (stop(), (tonicPc = v))} />
        {#if kind === "scale"}
          <Choice label="Scale" select options={scaleOptions} value={scaleName} onchange={(v) => (stop(), (scaleName = v))} />
        {:else}
          <Choice label="Quality" select options={CHORD_TEMPLATES.map((t) => ({ value: t.quality as string, label: `${FLAT_NAMES[tonicPc]}${t.suffix}` }))} value={quality} onchange={(v) => (stop(), (quality = v))} />
        {/if}
      </div>

      <div class="stage mt-4 rounded-2xl p-3 sm:p-5">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <p class="min-w-0 flex-1 font-display text-2xl font-semibold">{shownLabel}</p>
          <button type="button" class={btnStage} aria-pressed={!!handle?.playing} onclick={hear}>
            {#if handle?.playing}<Square class="size-4" aria-hidden="true" />Stop{:else}<Play class="size-4" aria-hidden="true" />Hear it{/if}
          </button>
        </div>
        <Piano low={60} high={84} {marks} names="c" label="Keyboard showing {shownLabel}" />
        <p class="mt-3 text-sm text-ws-stage-soft">
          Notes: {shown.map((m) => noteName(m, "flat").replace(/-?\d+$/, "")).join(" ")}.
          <span class="ml-1 inline-flex items-center gap-1.5"><span class="inline-block size-3 rounded-full" style:background="var(--tone-chord)" aria-hidden="true"></span>{kind === "chord" ? "chord tones" : "the tonic"}</span>
          {#if kind === "scale"}<span class="ml-2 inline-flex items-center gap-1.5"><span class="inline-block size-3 rounded-full" style:background="var(--tone-scale)" aria-hidden="true"></span>scale tones</span>{/if}
        </p>
      </div>

      {#if kind === "chord" && matches.length}
        <div class="mt-4">
          <p class="text-sm font-medium">Scales that fit {shownLabel}</p>
          <ul class="mt-2 flex flex-wrap gap-2">
            {#each matches as r (r.label)}
              <li>
                <button type="button" class={btn} onclick={() => showScale(r)}>
                  {#if r.recommended}<span class="rounded-full bg-instr px-2 py-0.5 text-xs font-semibold text-ws-stage">Go-to</span>{/if}
                  {FLAT_NAMES[tonicPc]} {r.label}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>

    <section id="vocabulary" class="scroll-mt-24" aria-labelledby="h-vocabulary">
      <h2 id="h-vocabulary" tabindex="-1" class="font-display text-2xl font-semibold">Chord vocabulary</h2>
      <p class="mt-1 text-ws-soft">The eight jazz families, all on C, with the extensions each one takes.</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label="Chord vocabulary table" tabindex="0">
        <table>
          <thead><tr><th scope="col">Chord</th><th scope="col">Role</th><th scope="col">Extensions</th></tr></thead>
          <tbody>
            {#each JAZZ.JAZZ_CHORD_TYPES as c (c.id)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playSymbol(c.symbol)} aria-label="Play {c.symbol}, {c.name}">
                    <Play class="size-3.5" aria-hidden="true" /><span class="font-display text-base">{c.symbol}</span>
                  </button>
                  <span class="block text-xs font-normal text-ws-soft">{c.name}</span>
                </th>
                <td>{c.role}</td>
                <td>
                  {#if c.extensions?.length}
                    <span class="flex flex-wrap gap-1">
                      {#each c.extensions as e (e)}<button type="button" class="chip" onclick={() => playSymbol(e)} aria-label="Play {e}">{e}</button>{/each}
                    </span>
                  {:else}<span class="text-ws-soft">None</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <h3 class="mt-5 font-semibold">Extensions</h3>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-2" role="region" aria-label="Extensions table" tabindex="0">
        <table>
          <thead><tr><th scope="col">Symbol</th><th scope="col">Semitones</th><th scope="col">What it is</th></tr></thead>
          <tbody>
            {#each JAZZ.CHORD_EXTENSIONS as e (e.symbol)}
              <tr><th scope="row" class="font-display">{e.symbol}</th><td class="tnum">{e.semitones}</td><td>{tidy(e.note)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section id="chord-scales" class="scroll-mt-24" aria-labelledby="h-chord-scales">
      <h2 id="h-chord-scales" tabindex="-1" class="font-display text-2xl font-semibold">Chord-scale map</h2>
      <p class="mt-1 text-ws-soft">Which scales sound good over each chord family. Learn the go-to first; Show puts it on the keyboard above.</p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        {#each [...new Set(JAZZ.CHORD_SCALE_MAP.map((r) => r.family))] as fam (fam)}
          {@const type = JAZZ.JAZZ_CHORD_TYPES.find((t) => t.family === fam)}
          <div class="rounded-xl border border-ws-line bg-ws-surface p-4">
            <p class="font-display text-lg font-semibold">{type?.symbol ?? fam} <span class="text-sm font-normal text-ws-soft">{type?.name}</span></p>
            <ul class="mt-2 divide-y divide-ws-line">
              {#each JAZZ.CHORD_SCALE_MAP.filter((r) => r.family === fam) as r (r.label)}
                <li class="flex items-center gap-3 py-2">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium">
                      {r.label}
                      {#if r.recommended}<span class="ml-1 rounded-full bg-instr-wash px-2 py-0.5 text-xs font-semibold text-instr-ink">Go-to</span>{/if}
                    </p>
                    {#if r.hint}<p class="text-sm text-ws-soft">{tidy(r.hint)}</p>{/if}
                  </div>
                  <button type="button" class="{btn} shrink-0" onclick={() => showScale(r, 0)} aria-label="Show C {r.label} for {type?.symbol ?? fam} on the keyboard">Show</button>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <section id="voicings" class="scroll-mt-24" aria-labelledby="h-voicings">
      <h2 id="h-voicings" tabindex="-1" class="font-display text-2xl font-semibold">Voicing recipes</h2>
      <p class="mt-1 text-ws-soft">Four ways to stack a seventh chord. Play plays each on Cmaj7.</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label="Voicing recipes table" tabindex="0">
        <table>
          <thead><tr><th scope="col">Voicing</th><th scope="col">Degrees</th><th scope="col">When</th></tr></thead>
          <tbody>
            {#each RECIPES as r (r.id)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playNotes([...(r.id.startsWith("rootless") ? [48] : []), ...r.semis.map((s) => 60 + s)], `${r.name} Cmaj7`)} aria-label="Play {r.name} on Cmaj7">
                    <Play class="size-3.5" aria-hidden="true" />{r.name}
                  </button>
                </th>
                <td class="tnum font-medium">{r.degrees}</td>
                <td>{r.use}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section id="dominants" class="scroll-mt-24" aria-labelledby="h-dominants">
      <h2 id="h-dominants" tabindex="-1" class="font-display text-2xl font-semibold">Dominant voicings</h2>
      <p class="mt-1 text-ws-soft">Three colours for a V7, from plain to maximum tension. Play voices each on G7 over a G bass.</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label="Dominant voicings table" tabindex="0">
        <table>
          <thead><tr><th scope="col">Voicing</th><th scope="col">Semitones above the root</th><th scope="col">Sound</th></tr></thead>
          <tbody>
            {#each JAZZ.DOMINANT_VOICINGS as d (d.id)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playNotes([43, ...d.offsets.map((o) => 55 + o)], `${d.label} on G7`)} aria-label="Play {d.label} on G7">
                    <Play class="size-3.5" aria-hidden="true" />{d.label}
                  </button>
                </th>
                <td class="tnum">{d.offsets.join(", ")}</td>
                <td>{tidy(d.hint)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section id="upper-structures" class="scroll-mt-24" aria-labelledby="h-upper-structures">
      <h2 id="h-upper-structures" tabindex="-1" class="font-display text-2xl font-semibold">Upper structures over a V7</h2>
      <p class="mt-1 text-ws-soft">Left hand plays the shell (1 3 7), right hand a triad. Play voices each over C7.</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label="Upper structures table" tabindex="0">
        <table>
          <thead><tr><th scope="col">Triad</th><th scope="col">Adds</th><th scope="col">Favourite</th></tr></thead>
          <tbody>
            {#each JAZZ.UPPER_STRUCTURES as u (u.id)}
              {@const triad = (u.quality === "maj" ? [0, 4, 7] : [0, 3, 7]).map((s) => 60 + u.triadRoot + s)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playNotes([48, 52, 58, ...triad], `${u.triad} over C7`)} aria-label="Play {u.triad} over C7">
                    <Play class="size-3.5" aria-hidden="true" />{u.triad}
                  </button>
                  <span class="block text-xs font-normal text-ws-soft">{FLAT_NAMES[u.triadRoot]} {u.quality === "maj" ? "major" : "minor"} over C7</span>
                </th>
                <td class="tnum font-medium">{u.adds}</td>
                <td>{u.favorite ? "Favourite" : ""}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section id="cycle" class="scroll-mt-24" aria-labelledby="h-cycle">
      <h2 id="h-cycle" tabindex="-1" class="font-display text-2xl font-semibold">The 12-key cycle</h2>
      <p class="mt-1 text-ws-soft">The order the voicing drills walk through every key.</p>
      <ol class="mt-3 flex flex-wrap gap-2">
        {#each JAZZ.TWELVE_KEY_CYCLE as k, i (k)}
          <li class="flex min-h-11 items-center gap-2 rounded-full border border-ws-line bg-ws-surface py-1 pl-1.5 pr-4">
            <span class="tnum grid size-8 place-items-center rounded-full bg-ws-raised text-xs text-ws-soft">{i + 1}</span>
            <span class="font-display text-lg font-semibold">{k}</span>
          </li>
        {/each}
      </ol>
    </section>

    <section id="techniques" class="scroll-mt-24" aria-labelledby="h-techniques">
      <h2 id="h-techniques" tabindex="-1" class="font-display text-2xl font-semibold">Improv techniques</h2>
      <dl class="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {#each JAZZ.IMPROV_TECHNIQUES as t (t.id)}
          <div class="border-l-2 border-instr pl-3">
            <dt class="font-semibold">{t.name}</dt>
            <dd class="text-sm text-ws-soft">{tidy(t.summary)}</dd>
          </div>
        {/each}
      </dl>
      <p class="mt-4 text-sm"><a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/jam">Try them in Jam</a>, with the chord tones lit.</p>
    </section>

    <section id="repertoire" class="scroll-mt-24" aria-labelledby="h-repertoire">
      <h2 id="h-repertoire" tabindex="-1" class="font-display text-2xl font-semibold">Repertoire</h2>
      <p class="mt-1 text-ws-soft">{JAZZ.JAZZ_REPERTOIRE.length} standards to learn, swing first, then Latin.</p>
      <div class="mt-3 grid gap-4 md:grid-cols-2">
        {#each repertoire as [feel, titles] (feel)}
          <div>
            <h3 class="font-semibold">{titleCase(feel)} <span class="font-normal text-ws-soft">({titles.length})</span></h3>
            <ul class="mt-2 columns-1 gap-6 text-sm sm:columns-2">
              {#each titles as t (t)}
                {@const b = trackFor(t)}
                <li class="break-inside-avoid py-1">
                  {t}{#if b}<span class="block text-xs text-ws-soft">Backing: {b.style.replace("-", " ")}, {b.bpm} BPM</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <section id="backing" class="scroll-mt-24" aria-labelledby="h-backing">
      <h2 id="h-backing" tabindex="-1" class="font-display text-2xl font-semibold">Backing tracks</h2>
      <p class="mt-1 max-w-prose text-ws-soft">
        These recordings are not shipped with the app. If you have them (or any track you like), import the audio in
        <a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/jam">Jam</a> and it plays under your solo.
      </p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label="Backing tracks table" tabindex="0">
        <table>
          <thead><tr><th scope="col">Style</th><th scope="col">Tempo</th><th scope="col">Suits</th></tr></thead>
          <tbody>
            {#each JAZZ.JAZZ_BACKING_TRACKS as b (b.id)}
              <tr>
                <th scope="row">{titleCase(b.style)}{b.bpm < 60 ? ", slow" : ""}</th>
                <td class="tnum">{b.bpm} BPM</td>
                <td>{b.songs.length ? b.songs.join(", ") : "Anything at this tempo"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--ws-line);
    border-radius: 0.9rem;
    background: var(--ws-surface);
  }
  table {
    width: 100%;
    min-width: 32rem;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  th,
  td {
    padding: 0.6rem 0.9rem;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    font-weight: 500;
    color: var(--ws-soft);
    border-bottom: 1px solid var(--ws-line);
  }
  tbody tr + tr {
    border-top: 1px solid var(--ws-line);
  }
  tbody th {
    font-weight: 600;
  }
  .sym {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.4rem;
    margin: -0.5rem 0;
    font-weight: 600;
  }
  .sym:hover {
    color: var(--instr-ink);
  }
  .chip {
    min-height: 2.75rem;
    padding: 0 0.7rem;
    border-radius: 0.6rem;
    border: 1px solid var(--ws-line);
    background: var(--ws-bg);
  }
  .chip:hover {
    background: var(--ws-raised);
  }
</style>
