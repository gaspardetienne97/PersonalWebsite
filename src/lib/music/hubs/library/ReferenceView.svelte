<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Chord and scale reference on the one keyboard, then the jazz tables.
  // Every section has an id; ?section=<id> (used by the Jazz Path reference
  // steps) scrolls to it and moves focus to its heading.
  import { onDestroy, tick } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import Picker from "#lib/music/components/Picker.svelte";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import { FLAT_NAMES, noteName, showMarked } from "@repo/music-core";
  import { chord, keyName, note } from "#lib/music/names.svelte.ts";
  import { JAZZ, type ChordScaleRow } from "@repo/music-core/data/index";
  import { SCALE_GROUPS, SCALE_KINDS, scaleSemitones } from "@repo/music-core/theory/scales";
  import { CHORD_TEMPLATES, parseChordSymbol } from "@repo/music-core/theory/chords";
  import Piano from "#lib/music/components/Piano.svelte";
  import Choice from "#lib/music/components/Choice.svelte";
  import type { CellMarks } from "#lib/music/components/feedback.svelte.ts";
  import { btn, btnStage } from "#lib/music/components/ui.ts";
  import { audio, type SequenceHandle } from "#lib/music/runtime/index.ts";
  import { chordVoicing } from "#lib/music/drills/jam/backing.ts";
  import CircleOfFifths from "#lib/music/components/CircleOfFifths.svelte";
  import ChordFinder from "./ChordFinder.svelte";
  import { scaleKindName } from "../drill-preview";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import Staff from "#lib/music/notation/Staff.svelte";
  import { accidentalCount, diatonicChords, keyAt, neighbour, opposite } from "@repo/music-core/theory/circle";
  import { functionChord } from "@repo/music-core/content/ear";
  import type { Score } from "@repo/music-core";

  let { onstatus }: { onstatus?: (s: string) => void } = $props();

  const SECTIONS = [
    { id: "explorer", label: m.music_hubs_ref_sec_explorer() },
    { id: "circle", label: m.music_hubs_ref_sec_circle() },
    { id: "fretted-chords", label: m.music_hubs_ref_sec_fretted() },
    { id: "vocabulary", label: m.music_hubs_ref_sec_vocabulary() },
    { id: "chord-scales", label: m.music_hubs_ref_sec_chord_scales() },
    { id: "voicings", label: m.music_hubs_ref_sec_voicings() },
    { id: "dominants", label: m.music_hubs_ref_sec_dominants() },
    { id: "upper-structures", label: m.music_hubs_ref_sec_upper() },
    { id: "cycle", label: m.music_hubs_ref_sec_cycle() },
    { id: "techniques", label: m.music_hubs_ref_sec_techniques() },
    { id: "repertoire", label: m.music_hubs_ref_sec_repertoire() },
    { id: "backing", label: m.music_hubs_ref_sec_backing() },
  ] as const;

  // Data text uses spaced dashes; render them as a colon.
  const tidy = (s: string) => showMarked(s.replace(/\s+[—–]\s+/g, ": "));
  const titleCase = (k: string) => k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  /** A scale named in words: "natural minor", "locrian #2". */
  const scaleWord = (k: string) => (k === "locrian #2" ? m.music_hubs_ref_scale_locrian_sharp2() : scaleKindName(k));

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
    kind === "scale" ? m.music_hubs_ref_scale_label({ tonic: keyName(FLAT_NAMES[tonicPc]), kind: scaleWord(scaleName) }) : chord(`${FLAT_NAMES[tonicPc]}${template.suffix}`),
  );

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    shown.forEach((midi, i) => {
      const semi = midi - tonic;
      const deg = kind === "scale" ? (semi === 6 && scaleSteps.includes(5) ? "#4" : semi === 8 && !scaleSteps.includes(9) && scaleSteps.includes(7) ? "b6" : SCALE_DEG[semi % 12]) : CHORD_DEG[semi] ?? CHORD_DEG[semi % 12];
      out[midi] = lit === i ? { demo: true } : { target: true, label: deg, role: kind === "chord" || semi % 12 === 0 ? "chord" : "scale" };
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
    onstatus?.(m.music_hubs_ref_playing({ label: shownLabel }));
    void h.done.then(() => {
      if (handle === h) stop();
    });
  }

  // ---- Circle of fifths ---------------------------------------------------
  let circleKey = $state(0);
  const ck = $derived(keyAt(circleKey));
  const ckChords = $derived(diatonicChords(circleKey));
  const TOKENS = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
  // The signature on a staff, with the tonic chord, spelled in the key.
  const ckScore = $derived<Score>({
    id: `circle-${circleKey}`,
    title: m.music_hubs_songs_key_major({ tonic: keyName(ck.major) }),
    bpm: 60,
    keyFifths: circleKey,
    meter: { beats: 4, beatUnit: 4 },
    voices: [{ id: "v", name: m.music_hubs_ref_tonic_chord(), notes: functionChord(ck.pc, "I").slice(1).map((midi) => ({ midi, startBeat: 0, durationBeats: 4 })) }],
    lengthBeats: 4,
  });
  async function hearCircle(what: "scale" | "cadence" | number) {
    stop();
    await audio.unlock();
    const tonic = 60 + ck.pc;
    const notes =
      what === "scale"
        ? [0, 2, 4, 5, 7, 9, 11, 12].map((s, i) => ({ midi: tonic + s, time: i * 0.3, duration: 0.28 }))
        : (what === "cadence" ? ["I", "IV", "V", "I"] : [TOKENS[what]]).flatMap((t, i) => functionChord(ck.pc, t).map((midi) => ({ midi, time: i * 0.8, duration: 0.75 })));
    audio.playSequence(notes);
    onstatus?.(
      what === "scale"
        ? m.music_hubs_ref_major_scale({ key: keyName(ck.major) })
        : what === "cadence"
          ? m.music_hubs_ref_cadence({ key: keyName(ck.major) })
          : m.music_hubs_ref_chord_of({ chord: chord(ckChords[what].name), numeral: ckChords[what].numeral, key: keyName(ck.major) }),
    );
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
    onstatus?.(m.music_hubs_ref_on_keyboard({ tonic: keyName(FLAT_NAMES[root]), label: r.label }));
    await tick();
    document.getElementById("explorer")?.scrollIntoView({ block: "start" });
  }

  const scaleOptions = $derived([
    ...[...SCALE_GROUPS.modes, ...SCALE_GROUPS.jazz].map((k) => ({ value: k as string, label: SCALE_GROUPS.jazz.includes(k) ? m.music_hubs_ref_jazz_option({ name: capital(scaleWord(k)) }) : capital(scaleWord(k)) })),
    ...((SCALE_KINDS as string[]).includes(scaleName) ? [] : [{ value: scaleName, label: capital(scaleWord(scaleName)) }]),
  ]);

  // ---- Playback of table rows -------------------------------------------
  function playNotes(midis: number[], label: string) {
    stop();
    void audio.unlock().then(() => {
      audio.playChord(midis, 1.6);
      onstatus?.(m.music_hubs_ref_playing({ label }));
    });
  }
  function playSymbol(symbol: string) {
    const v = chordVoicing(symbol);
    const c = parseChordSymbol(symbol);
    const ext = c ? c.intervals.filter((i) => i > 11).map((i) => 48 + c.rootPc + i) : [];
    playNotes([v.bass, ...v.upper, ...ext], chord(symbol));
  }

  const RECIPES = [
    { id: "rooted", name: m.music_hubs_ref_recipe_rooted(), degrees: "1 3 5 7", semis: [0, 4, 7, 11], use: m.music_hubs_ref_recipe_rooted_use() },
    { id: "shell", name: m.music_hubs_ref_recipe_shell(), degrees: "1 3 7", semis: [0, 4, 11], use: m.music_hubs_ref_recipe_shell_use() },
    { id: "rootless-a", name: m.music_hubs_ref_recipe_rootless_a(), degrees: "3 5 7 9", semis: [4, 7, 11, 14], use: m.music_hubs_ref_recipe_rootless_a_use() },
    { id: "rootless-b", name: m.music_hubs_ref_recipe_rootless_b(), degrees: "7 9 3 5", semis: [11, 14, 16, 19], use: m.music_hubs_ref_recipe_rootless_b_use() },
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
  <!-- Below lg the twelve sections are one "Jump to" list (nothing cut off); from lg a sticky side list. -->
  <nav aria-label={m.music_hubs_ref_nav()} class="min-w-0 lg:sticky lg:top-[calc(var(--ws-strip-h,3.5rem)+1rem)] lg:z-20 lg:self-start">
    <div class="flex items-center gap-2 text-sm lg:hidden">
      <span class="font-medium">{m.music_hubs_ref_jump_to()}</span>
      <Picker class="min-w-0 flex-1" label={m.music_hubs_ref_jump_label()} value={section ?? ""} placeholder={m.music_hubs_ref_sec_explorer()} options={SECTIONS.map((x) => ({ value: x.id, label: x.label }))} onchange={(id) => void goto(`?section=${id}`, { reset: false })} />
    </div>
    <ul class="hidden lg:flex lg:flex-col lg:gap-0.5">
      {#each SECTIONS as s (s.id)}
        <li>
          <a
            href="?section={s.id}"
            data-sveltekit-reset="false"
            aria-current={section === s.id ? "location" : undefined}
            class="flex min-h-11 shrink-0 items-center rounded-lg border border-ws-line px-3 text-sm whitespace-nowrap lg:border-transparent {section === s.id ? 'bg-instr-wash font-semibold text-instr-ink' : 'text-ws-soft hover:bg-ws-raised hover:text-ws-ink'}"
            >{s.label}</a
          >
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-10">
    <section id="explorer" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-explorer">
      <h2 id="h-explorer" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_explorer_title()}</h2>
      <p class="mt-1 max-w-prose text-ws-soft">{m.music_hubs_ref_explorer_intro()}</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Choice
          label={m.music_hubs_cf_show()}
          options={[
            { value: "scale", label: m.music_hubs_ref_scale() },
            { value: "chord", label: m.music_hubs_ref_chord() },
          ]}
          value={kind}
          onchange={(v) => {
            stop();
            kind = v as "scale" | "chord";
          }}
        />
        <div class="flex min-w-0 flex-col gap-1 text-sm">
          <span class="font-medium">{m.music_hubs_ref_tonic()}</span>
          <KeyPicker label={m.music_hubs_ref_tonic()} value={tonicPc} name={(p) => FLAT_NAMES[p]} onchange={(p) => (stop(), (tonicPc = p))} />
        </div>
        {#if kind === "scale"}
          <Choice label={m.music_hubs_ref_scale()} select options={scaleOptions} value={scaleName} onchange={(v) => (stop(), (scaleName = v))} />
        {:else}
          <Choice label={m.music_hubs_cf_quality()} select options={CHORD_TEMPLATES.map((t) => ({ value: t.quality as string, label: chord(`${FLAT_NAMES[tonicPc]}${t.suffix}`) }))} value={quality} onchange={(v) => (stop(), (quality = v))} />
        {/if}
      </div>

      <div class="stage mt-4 rounded-2xl p-3 sm:p-5">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <p class="min-w-0 flex-1 font-display text-2xl font-semibold">{shownLabel}</p>
          <button type="button" class={btnStage} aria-pressed={!!handle?.playing} onclick={hear}>
            {#if handle?.playing}<Square class="size-4" aria-hidden="true" />{m.music_hubs_stop()}{:else}<Play class="size-4" aria-hidden="true" />{m.music_hubs_ref_hear_it()}{/if}
          </button>
        </div>
        <Piano low={60} high={84} {marks} names="c" label={m.music_hubs_ref_keyboard({ label: shownLabel })} />
        <p class="mt-3 text-sm text-ws-stage-soft">
          {m.music_hubs_ref_notes({ notes: shown.map((midi) => note(noteName(midi, "flat", false))).join(" ") })}
          <span class="ml-1 inline-flex items-center gap-1.5"><span class="inline-block size-3 rounded-full" style:background="var(--tone-chord)" aria-hidden="true"></span>{kind === "chord" ? m.music_hubs_ref_chord_tones() : m.music_hubs_ref_the_tonic()}</span>
          {#if kind === "scale"}<span class="ml-2 inline-flex items-center gap-1.5"><span class="inline-block size-3 rounded-full" style:background="var(--tone-scale)" aria-hidden="true"></span>{m.music_hubs_ref_scale_tones()}</span>{/if}
        </p>
      </div>

      {#if kind === "chord" && matches.length}
        <div class="mt-4">
          <p class="text-sm font-medium">{m.music_hubs_ref_scales_fit({ label: shownLabel })}</p>
          <ul class="mt-2 flex flex-wrap gap-2">
            {#each matches as r (r.label)}
              <li>
                <button type="button" class={btn} onclick={() => showScale(r)}>
                  {#if r.recommended}<span class="rounded-full bg-instr px-2 py-0.5 text-[13px] font-semibold text-ws-stage">{m.music_hubs_ref_go_to()}</span>{/if}
                  {keyName(FLAT_NAMES[tonicPc])} {r.label}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>

    <section id="circle" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-circle">
      <h2 id="h-circle" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_circle()}</h2>
      <p class="mt-1 max-w-prose text-ws-soft">
        {m.music_hubs_ref_circle_intro()}
      </p>
      <div class="mt-4 grid items-start gap-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <CircleOfFifths selected={circleKey} onpick={(f) => (circleKey = f)} label={m.music_hubs_ref_circle_pick()} />
        <div class="min-w-0 space-y-4">
          <div>
            <p class="font-display text-2xl font-semibold">{m.music_hubs_songs_key_major({ tonic: keyName(ck.major) })} <span class="text-ws-soft">· {m.music_hubs_songs_key_minor({ tonic: keyName(ck.minor) })}</span></p>
            <p class="text-sm text-ws-soft">
              {accidentalCount(circleKey).replace(/^./, (c) => c.toUpperCase())}{ck.accidentals.length ? `: ${ck.accidentals.map((a) => keyName(a)).join(" ")}` : ""}.
              {#if circleKey > 0}{m.music_hubs_ref_last_sharp({ note: keyName(ck.accidentals.at(-1) ?? ""), key: keyName(ck.major) })}{:else if circleKey < -1}{m.music_hubs_ref_second_flat({ note: keyName(ck.accidentals.at(-2) ?? "") })}{/if}
            </p>
          </div>
          <div class="max-w-72 rounded-xl bg-ws-surface px-3 pb-1 text-ws-ink"><Staff score={ckScore} maxHeight="9rem" /></div>
          <div>
            <p class="text-sm font-medium">{m.music_hubs_ref_its_chords()}</p>
            <ul class="mt-1 flex flex-wrap gap-1.5">
              {#each ckChords as c, i (c.numeral)}
                <li><button type="button" class={btn} onclick={() => hearCircle(i)}><span class="text-[13px] text-ws-soft">{c.numeral}</span> {chord(c.name)}</button></li>
              {/each}
            </ul>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={btn} onclick={() => hearCircle("scale")}><Play class="size-4" aria-hidden="true" />{m.music_hubs_ref_scale()}</button>
            <button type="button" class={btn} onclick={() => hearCircle("cadence")}><Play class="size-4" aria-hidden="true" />I, IV, V, I</button>
          </div>
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt class="text-ws-soft">{m.music_hubs_ref_one_more_sharp()}</dt><dd>{circleKey < 7 ? m.music_hubs_ref_its_v({ key: keyName(neighbour(circleKey, 1).major) }) : m.music_hubs_ref_none_most()}</dd>
            <dt class="text-ws-soft">{m.music_hubs_ref_one_more_flat()}</dt><dd>{circleKey > -7 ? m.music_hubs_ref_its_iv({ key: keyName(neighbour(circleKey, -1).major) }) : m.music_hubs_ref_none_most()}</dd>
            <dt class="text-ws-soft">{m.music_hubs_ref_across()}</dt><dd>{m.music_hubs_ref_across_text({ key: keyName(opposite(circleKey).major), chord: chord(neighbour(circleKey, 1).major) })}</dd>
          </dl>
          <p class="text-sm">{@html m.music_hubs_ref_practise_circle({ link: `<a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/circle">${m.music_hubs_ref_practise_circle_link()}</a>` })}</p>
        </div>
      </div>
    </section>

    <section id="fretted-chords" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-fretted-chords">
      <h2 id="h-fretted-chords" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_fretted()}</h2>
      <p class="mt-1 max-w-prose text-ws-soft">
        {m.music_hubs_ref_fretted_intro()}
      </p>
      <div class="mt-4"><ChordFinder {onstatus} /></div>
    </section>

    <section id="vocabulary" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-vocabulary">
      <h2 id="h-vocabulary" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_vocabulary()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_vocabulary_intro({ c: note("C") })}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label={m.music_hubs_ref_vocabulary_table()} tabindex="0">
        <table>
          <thead><tr><th scope="col">{m.music_hubs_ref_chord()}</th><th scope="col">{m.music_hubs_ref_col_role()}</th><th scope="col">{m.music_hubs_ref_col_extensions()}</th></tr></thead>
          <tbody>
            {#each JAZZ.JAZZ_CHORD_TYPES as c (c.id)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playSymbol(c.symbol)} aria-label={m.music_hubs_ref_hear_named({ symbol: chord(c.symbol), name: c.name })}>
                    <Play class="size-3.5" aria-hidden="true" /><span class="font-display text-base">{chord(c.symbol)}</span>
                  </button>
                  <span class="block text-[13px] font-normal text-ws-soft">{c.name}</span>
                </th>
                <td>{c.role}</td>
                <td>
                  {#if c.extensions?.length}
                    <span class="flex flex-wrap gap-1">
                      {#each c.extensions as e (e)}<button type="button" class="chip" onclick={() => playSymbol(e)} aria-label={m.music_hubs_ref_hear_symbol({ symbol: chord(e) })}>{chord(e)}</button>{/each}
                    </span>
                  {:else}<span class="text-ws-soft">{m.music_hubs_skills_none()}</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <h3 class="mt-5 font-semibold">{m.music_hubs_ref_col_extensions()}</h3>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-2" role="region" aria-label={m.music_hubs_ref_extensions_table()} tabindex="0">
        <table>
          <thead><tr><th scope="col">{m.music_hubs_ref_col_symbol()}</th><th scope="col">{m.music_hubs_ref_col_semitones()}</th><th scope="col">{m.music_hubs_ref_col_what()}</th></tr></thead>
          <tbody>
            {#each JAZZ.CHORD_EXTENSIONS as e (e.symbol)}
              <tr><th scope="row" class="font-display">{chord(e.symbol)}</th><td class="tnum">{e.semitones}</td><td>{tidy(e.note)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section id="chord-scales" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-chord-scales">
      <h2 id="h-chord-scales" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_chord_scales()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_chord_scales_intro()}</p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        {#each [...new Set(JAZZ.CHORD_SCALE_MAP.map((r) => r.family))] as fam (fam)}
          {@const type = JAZZ.JAZZ_CHORD_TYPES.find((t) => t.family === fam)}
          <div class="rounded-xl border border-ws-line bg-ws-surface p-4">
            <p class="font-display text-lg font-semibold">{chord(type?.symbol ?? fam)} <span class="text-sm font-normal text-ws-soft">{type?.name}</span></p>
            <ul class="mt-2 divide-y divide-ws-line">
              {#each JAZZ.CHORD_SCALE_MAP.filter((r) => r.family === fam) as r (r.label)}
                <li class="flex items-center gap-3 py-2">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium">
                      {r.label}
                      {#if r.recommended}<span class="ml-1 rounded-full bg-instr-wash px-2 py-0.5 text-[13px] font-semibold text-instr-ink">{m.music_hubs_ref_go_to()}</span>{/if}
                    </p>
                    {#if r.hint}<p class="text-sm text-ws-soft">{tidy(r.hint)}</p>{/if}
                  </div>
                  <button type="button" class="{btn} shrink-0" onclick={() => showScale(r, 0)} aria-label={m.music_hubs_ref_show_scale({ tonic: keyName("C"), label: r.label, chord: chord(type?.symbol ?? fam) })}>{m.music_hubs_cf_show()}</button>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <section id="voicings" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-voicings">
      <h2 id="h-voicings" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_voicings()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_voicings_intro({ chord: chord("Cmaj7") })}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label={m.music_hubs_ref_voicings_table()} tabindex="0">
        <table>
          <thead><tr><th scope="col">{m.music_hubs_ref_col_voicing()}</th><th scope="col">{m.music_hubs_ref_col_degrees()}</th><th scope="col">{m.music_hubs_ref_col_when()}</th></tr></thead>
          <tbody>
            {#each RECIPES as r (r.id)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playNotes([...(r.id.startsWith("rootless") ? [48] : []), ...r.semis.map((s) => 60 + s)], `${r.name} ${chord("Cmaj7")}`)} aria-label={m.music_hubs_ref_hear_on_cmaj7({ name: r.name, chord: chord("Cmaj7") })}>
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

    <section id="dominants" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-dominants">
      <h2 id="h-dominants" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_dominants()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_dominants_intro({ chord: chord("G7"), g: note("G") })}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label={m.music_hubs_ref_dominants_table()} tabindex="0">
        <table>
          <thead><tr><th scope="col">{m.music_hubs_ref_col_voicing()}</th><th scope="col">{m.music_hubs_ref_col_above_root()}</th><th scope="col">{m.music_hubs_ref_col_sound()}</th></tr></thead>
          <tbody>
            {#each JAZZ.DOMINANT_VOICINGS as d (d.id)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playNotes([43, ...d.offsets.map((o) => 55 + o)], m.music_hubs_ref_on_g7({ label: d.label, chord: chord("G7") }))} aria-label={m.music_hubs_ref_hear_on_g7({ label: d.label, chord: chord("G7") })}>
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

    <section id="upper-structures" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-upper-structures">
      <h2 id="h-upper-structures" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_upper_title()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_upper_intro({ chord: chord("C7") })}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label={m.music_hubs_ref_upper_table()} tabindex="0">
        <table>
          <thead><tr><th scope="col">{m.music_hubs_ref_col_triad()}</th><th scope="col">{m.music_hubs_ref_col_adds()}</th><th scope="col">{m.music_hubs_ref_favourite()}</th></tr></thead>
          <tbody>
            {#each JAZZ.UPPER_STRUCTURES as u (u.id)}
              {@const triad = (u.quality === "maj" ? [0, 4, 7] : [0, 3, 7]).map((s) => 60 + u.triadRoot + s)}
              <tr>
                <th scope="row">
                  <button type="button" class="sym" onclick={() => playNotes([48, 52, 58, ...triad], m.music_hubs_ref_over_c7({ triad: u.triad, chord: chord("C7") }))} aria-label={m.music_hubs_ref_hear_over_c7({ triad: u.triad, chord: chord("C7") })}>
                    <Play class="size-3.5" aria-hidden="true" />{u.triad}
                  </button>
                  <span class="block text-[13px] font-normal text-ws-soft">{u.quality === "maj" ? m.music_hubs_ref_major_over_c7({ root: note(FLAT_NAMES[u.triadRoot]), chord: chord("C7") }) : m.music_hubs_ref_minor_over_c7({ root: note(FLAT_NAMES[u.triadRoot]), chord: chord("C7") })}</span>
                </th>
                <td class="tnum font-medium">{u.adds}</td>
                <td>{u.favorite ? m.music_hubs_ref_favourite() : ""}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section id="cycle" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-cycle">
      <h2 id="h-cycle" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_cycle_title()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_cycle_intro()}</p>
      <ol class="mt-3 flex flex-wrap gap-2">
        {#each JAZZ.TWELVE_KEY_CYCLE as k, i (k)}
          <li class="flex min-h-11 items-center gap-2 rounded-full border border-ws-line bg-ws-surface py-1 pl-1.5 pr-4">
            <span class="tnum grid size-8 place-items-center rounded-full bg-ws-raised text-[13px] text-ws-soft">{i + 1}</span>
            <span class="font-display text-lg font-semibold">{keyName(k)}</span>
          </li>
        {/each}
      </ol>
    </section>

    <section id="techniques" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-techniques">
      <h2 id="h-techniques" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_techniques()}</h2>
      <dl class="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {#each JAZZ.IMPROV_TECHNIQUES as t (t.id)}
          <div class="border-l-2 border-instr pl-3">
            <dt class="font-semibold">{t.name}</dt>
            <dd class="text-sm text-ws-soft">{tidy(t.summary)}</dd>
          </div>
        {/each}
      </dl>
      <p class="mt-4 text-sm">{@html m.music_hubs_ref_try_jam({ link: `<a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/changes/jam">${m.music_hubs_ref_try_jam_link()}</a>` })}</p>
    </section>

    <section id="repertoire" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-repertoire">
      <h2 id="h-repertoire" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_repertoire()}</h2>
      <p class="mt-1 text-ws-soft">{m.music_hubs_ref_standards({ count: JAZZ.JAZZ_REPERTOIRE.length })}</p>
      <div class="mt-3 grid gap-4 md:grid-cols-2">
        {#each repertoire as [feel, titles] (feel)}
          <div>
            <h3 class="font-semibold">{titleCase(feel)} <span class="font-normal text-ws-soft">({titles.length})</span></h3>
            <ul class="mt-2 columns-1 gap-6 text-sm sm:columns-2">
              {#each titles as t (t)}
                {@const b = trackFor(t)}
                <li class="break-inside-avoid py-1">
                  {t}{#if b}<span class="block text-[13px] text-ws-soft">{m.music_hubs_ref_backing_line({ style: b.style.replace("-", " "), bpm: b.bpm })}</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <section id="backing" class="scroll-mt-[calc(var(--ws-strip-h,3.5rem)+1rem)]" aria-labelledby="h-backing">
      <h2 id="h-backing" tabindex="-1" class="font-display text-2xl font-semibold">{m.music_hubs_ref_sec_backing()}</h2>
      <p class="mt-1 max-w-prose text-ws-soft">
        {@html m.music_hubs_ref_backing_intro({ link: `<a class="font-semibold text-instr-ink underline underline-offset-4" href="/music/changes/jam">Jam</a>` })}
      </p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable table must be reachable by keyboard -->
      <div class="table-wrap mt-3" role="region" aria-label={m.music_hubs_ref_backing_table()} tabindex="0">
        <table>
          <thead><tr><th scope="col">{m.music_hubs_ref_col_style()}</th><th scope="col">{m.music_hubs_import_tempo()}</th><th scope="col">{m.music_hubs_ref_col_suits()}</th></tr></thead>
          <tbody>
            {#each JAZZ.JAZZ_BACKING_TRACKS as b (b.id)}
              <tr>
                <th scope="row">{titleCase(b.style)}{b.bpm < 60 ? m.music_hubs_ref_slow() : ""}</th>
                <td class="tnum">{b.bpm} BPM</td>
                <td>{b.songs.length ? b.songs.join(", ") : m.music_hubs_ref_anything()}</td>
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
