<script lang="ts">
  import Play from "lucide-svelte/icons/play";

  import {
    CHORD_EXTENSIONS,
    DOMINANT_VOICINGS,
    IMPROV_TECHNIQUES,
    JAZZ_BACKING_TRACKS,
    JAZZ_CHORD_TYPES,
    JAZZ_LICKS,
    JAZZ_REPERTOIRE,
    LICK_PHRASES,
    lickTimeline,
    realizeDominantVoicing,
    realizeUpperStructure,
    scalesForFamily,
    UPPER_STRUCTURES,
    type DominantVoicingId,
    type LickCategory,
  } from "@repo/music-core/engines/jazz";
  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import InstrumentView from "../../_components/InstrumentView.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();

  type Tab = "theory" | "voicings" | "licks" | "repertoire";
  let tab = $state<Tab>("theory");
  const tabs = [
    { value: "theory", label: "Chords & scales" },
    { value: "voicings", label: "Voicings" },
    { value: "licks", label: "Licks" },
    { value: "repertoire", label: "Repertoire" },
  ];

  // --- Chords & scales tab ---
  let selectedFamily = $state(JAZZ_CHORD_TYPES[0]!.id);
  const selectedChord = $derived(JAZZ_CHORD_TYPES.find((c) => c.id === selectedFamily)!);
  const selectedScales = $derived(scalesForFamily(selectedChord.family));

  // Advanced V7 voicings demonstrated over G7 (G4 = 67).
  const G7_ROOT = 67;

  // The advanced voicings can be viewed on any instrument (the 12-key drill stays
  // a piano exercise — JT9 is explicitly a two-hand piano drill).
  let voicingInstrument = $state<InstrumentId>(
    VIEWABLE_INSTRUMENTS.includes(runtime.activeInstrument) ? runtime.activeInstrument : "piano",
  );

  async function playUpperStructure(id: string): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    const us = realizeUpperStructure(G7_ROOT, id);
    runtime.sound.playChord([G7_ROOT - 12, ...us.lh, ...us.rh], 1.8);
  }

  async function playDominantVoicing(id: DominantVoicingId): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    const v = realizeDominantVoicing(G7_ROOT, id);
    runtime.sound.playChord([(v.bassMidi ?? G7_ROOT) - 12, ...v.midi], 1.6);
  }

  // --- Licks tab: play the transcribed melody at a steady practice tempo ---
  const LICK_BPM = 150;
  async function playLick(lickNumber: number): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    const phrase = LICK_PHRASES[lickNumber];
    if (!phrase) return;
    const secondsPerBeat = 60 / LICK_BPM;
    for (const note of lickTimeline(phrase)) {
      runtime.sound.playNote(
        note.midi,
        note.beats * secondsPerBeat * 0.96,
        `+${note.offsetBeats * secondsPerBeat}`,
        0.85,
      );
    }
  }

  function voicingMidi(midi: number[], bass?: number): number[] {
    return bass === undefined ? midi : [bass, ...midi];
  }

  // --- Licks tab ---
  let lickCategory = $state<LickCategory>("major-ii-V-I");
  const lickCategories = [
    { value: "major-ii-V-I", label: "Major ii-V-I" },
    { value: "major-ii-V-I-VI", label: "ii-V-I-VI" },
    { value: "minor-ii-V-i", label: "Minor ii-V-i" },
    { value: "minor-chord", label: "Minor chord" },
  ];
  const visibleLicks = $derived(JAZZ_LICKS.filter((l) => l.category === lickCategory));
</script>

<svelte:head>
  <title>Jazz Piano | Practice OS</title>
  <meta
    name="description"
    content="Learn jazz piano: chord symbols, chord-scale theory, rootless ii-V-I voicings, 29 licks, and a repertoire of standards."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Jazz Piano"
    subtitle="Chord symbols, chord-scale theory, rootless voicings, licks, and standards — from the ground up."
  >
    {#snippet controls()}
      <SegmentedControl
        options={tabs}
        value={tab}
        onChange={(v) => (tab = v as Tab)}
        ariaLabel="Jazz section"
        size="sm"
      />
    {/snippet}
  </PracticeScreenHeader>

  <div
    class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-2.5"
  >
    <p class="text-sm text-muted-foreground">
      Reference material. Want it in order, tracked by your progress?
    </p>
    <Button href="/music/learn/path" size="sm" variant="outline">Open the Jazz Path →</Button>
  </div>

  {#if tab === "theory"}
    <section class="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]" aria-label="Chords and scales">
      <div class="grid max-h-[34rem] gap-2 overflow-y-auto pr-1" role="listbox" aria-label="Chord types">
        {#each JAZZ_CHORD_TYPES as chord (chord.id)}
          <button
            type="button"
            class="grid w-full gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-accent {selectedFamily ===
            chord.id
              ? 'border-primary bg-accent'
              : ''}"
            aria-pressed={selectedFamily === chord.id}
            onclick={() => (selectedFamily = chord.id)}
          >
            <span class="font-semibold">{chord.symbol}</span>
            <span class="text-sm text-muted-foreground">{chord.name}</span>
          </button>
        {/each}
      </div>

      <article class="min-w-0 space-y-6">
        <Card.Root>
          <Card.Header class="gap-2">
            <Card.Description>{selectedChord.name}</Card.Description>
            <Card.Title class="text-3xl">{selectedChord.symbol}</Card.Title>
            <p class="text-sm text-muted-foreground">{selectedChord.role}</p>
          </Card.Header>
          <Card.Content class="space-y-5">
            <div class="space-y-2">
              <h2 class="text-sm font-semibold">Go-to scales (recommended first)</h2>
              <div class="grid gap-2">
                {#each selectedScales as scale}
                  <div class="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                    <span class="font-medium">{scale.label}</span>
                    {#if scale.recommended}
                      <Badge>Julian's pick</Badge>
                    {/if}
                    {#if scale.hint}
                      <span class="text-sm text-muted-foreground">— {scale.hint}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
            {#if selectedChord.extensions?.length}
              <div class="space-y-2">
                <h2 class="text-sm font-semibold">Common extensions</h2>
                <div class="flex flex-wrap gap-2">
                  {#each selectedChord.extensions as ext}
                    <Badge variant="secondary">{ext}</Badge>
                  {/each}
                </div>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title class="text-lg">Building extensions (9, 11, 13)</Card.Title>
            <Card.Description>
              Always counted up the major scale from the chord root — then sharpen/flatten if altered.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="grid gap-1.5 sm:grid-cols-2">
              {#each CHORD_EXTENSIONS as ext}
                <div class="flex items-baseline gap-2 rounded-md border px-3 py-2 text-sm">
                  <span class="w-10 font-mono font-semibold">{ext.symbol}</span>
                  <span class="text-muted-foreground">{ext.note}</span>
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      </article>
    </section>
  {:else if tab === "voicings"}
    <section class="space-y-4" aria-label="Rootless ii-V-I voicings">
      <Card.Root>
        <Card.Header class="gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <Card.Title class="text-lg">Rootless ii-V-I drill preview</Card.Title>
            <Card.Description>
              The full 12-key reference now lives inside the graded drill, so the preview,
              instrument view, and scoring targets stay in one place.
            </Card.Description>
          </div>
          <div class="flex flex-wrap items-center gap-2 md:justify-end">
            <Button href="/music/play/voicings?variant=major" size="sm">Practice major →</Button>
            <Button href="/music/play/voicings?variant=minor" size="sm" variant="outline">Practice minor →</Button>
            <Button href="/music/play/voicings?variant=altered" size="sm" variant="outline">Practice altered →</Button>
          </div>
        </Card.Header>
      </Card.Root>

      <Card.Root>
        <Card.Header class="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Card.Title class="text-lg">Altered V7 voicings (JT10–11)</Card.Title>
            <Card.Description>
              Rootless dominant voicings over G7, getting more "outside" as the tension builds.
            </Card.Description>
          </div>
          <SegmentedControl
            size="sm"
            ariaLabel="Voicing instrument"
            options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
            value={voicingInstrument}
            onChange={(v) => (voicingInstrument = v as InstrumentId)}
          />
        </Card.Header>
        <Card.Content class="grid gap-3 sm:grid-cols-3">
          {#each DOMINANT_VOICINGS as voicing (voicing.id)}
            {@const v = realizeDominantVoicing(G7_ROOT, voicing.id)}
            <div class="space-y-1.5 rounded-md border p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold">{voicing.label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onclick={() => playDominantVoicing(voicing.id)}
                >
                  <Play aria-hidden="true" />
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">{voicing.hint}</p>
              <InstrumentView
                midi={voicingMidi(v.midi, v.bassMidi)}
                instrument={voicingInstrument}
                router={runtime.router}
              />
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title class="text-lg">Upper structures (JT12)</Card.Title>
          <Card.Description>
            Play the V7's 1–3–7 in the left hand, then a triad on top. Julian's three most-used are
            marked. Shown over G7 on {INSTRUMENT_LABELS[voicingInstrument]}.
          </Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {#each UPPER_STRUCTURES as structure (structure.id)}
            {@const us = realizeUpperStructure(G7_ROOT, structure.id)}
            <div class="space-y-1.5 rounded-md border p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold"
                  >G7 + {midiToNote(us.rh[0]!, true).replace(/\d+$/, "")}
                  {structure.quality}</span
                >
                <div class="flex items-center gap-1">
                  {#if structure.favorite}
                    <Badge>top 3</Badge>
                  {/if}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onclick={() => playUpperStructure(structure.id)}
                  >
                    <Play aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <p class="text-xs text-muted-foreground">Adds {structure.adds}</p>
              <InstrumentView
                midi={voicingMidi([...us.lh, ...us.rh])}
                instrument={voicingInstrument}
                router={runtime.router}
              />
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    </section>
  {:else if tab === "licks"}
    <section class="space-y-4" aria-label="Jazz licks">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          29 licks (Julian Bradley). Encoded as the progression, scales, and techniques behind each line.
        </p>
        <SegmentedControl
          options={lickCategories}
          value={lickCategory}
          onChange={(v) => (lickCategory = v as LickCategory)}
          ariaLabel="Lick category"
          size="sm"
        />
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        {#each visibleLicks as lick (lick.number)}
          <Card.Root>
            <Card.Header class="gap-1.5 pb-3">
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <Badge variant="outline">#{lick.number}</Badge>
                  <span class="truncate font-semibold">{lick.progression.join(" · ")}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onclick={() => playLick(lick.number)}
                >
                  <Play aria-hidden="true" />
                  Play
                </Button>
              </div>
              <p class="text-sm text-muted-foreground">{lick.tip}</p>
            </Card.Header>
            <Card.Content class="flex flex-wrap gap-2">
              {#each lick.scales as scale}
                <Badge variant="secondary">{scale}</Badge>
              {/each}
              {#each lick.techniques as technique}
                {@const t = IMPROV_TECHNIQUES.find((x) => x.id === technique)}
                {#if t}
                  <Badge>{t.name}</Badge>
                {/if}
              {/each}
            </Card.Content>
          </Card.Root>
        {/each}
      </div>

      <Card.Root>
        <Card.Header>
          <Card.Title class="text-lg">Improv techniques</Card.Title>
          <Card.Description>The ideas behind the licks — apply them to any standard.</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-2 sm:grid-cols-2">
          {#each IMPROV_TECHNIQUES as technique (technique.id)}
            <div class="space-y-0.5 rounded-md border px-3 py-2">
              <p class="text-sm font-semibold">{technique.name}</p>
              <p class="text-sm text-muted-foreground">{technique.summary}</p>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    </section>
  {:else}
    <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" aria-label="Repertoire">
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-lg">33 standards ideal for learning</Card.Title>
          <Card.Description>Build a repertoire from a Real Book. Swing first, then Latin.</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-2 sm:grid-cols-2">
          {#each JAZZ_REPERTOIRE as song (song.title)}
            <div class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span class="min-w-0 truncate">{song.title}</span>
              <Badge variant={song.feel === "latin" ? "secondary" : "outline"}>{song.feel}</Badge>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root class="self-start">
        <Card.Header>
          <Card.Title class="text-base">Backing tracks</Card.Title>
          <Card.Description>Import the drum tracks into your media library to practice with.</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          {#each JAZZ_BACKING_TRACKS as track (track.id)}
            <div class="space-y-0.5 rounded-md border px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold capitalize">{track.style.replace("-", " ")}</span>
                <Badge variant="outline">{track.bpm} bpm</Badge>
              </div>
              {#if track.songs.length}
                <p class="text-xs text-muted-foreground">{track.songs.join(", ")}</p>
              {/if}
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    </section>
  {/if}
</PracticeScreen>
