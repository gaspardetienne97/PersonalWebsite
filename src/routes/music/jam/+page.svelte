<script lang="ts">
  import Circle from "lucide-svelte/icons/circle";
  import Play from "lucide-svelte/icons/play";
  import SkipForward from "lucide-svelte/icons/skip-forward";

  import type { NoteEvent } from "@repo/music-core/domain";
  import {
    JAM_PROGRESSIONS,
    JamSession,
    type JamProgression,
    type TargetTone,
  } from "@repo/music-core/engines/jam";
  import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { onDestroy } from "svelte";

  import OnScreenKeyboard from "../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import SourceReadout from "../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  // One octave starting at C; white/black layout for the target-tone keyboard.
  const WHITE = [
    { pc: 0, label: "C" },
    { pc: 2, label: "D" },
    { pc: 4, label: "E" },
    { pc: 5, label: "F" },
    { pc: 7, label: "G" },
    { pc: 9, label: "A" },
    { pc: 11, label: "B" },
  ];
  const BLACK = [
    { pc: 1, left: 10 },
    { pc: 3, left: 24 },
    { pc: 6, left: 52 },
    { pc: 8, left: 66 },
    { pc: 10, left: 80 },
  ];

  const runtime = useMusicRuntime();

  let progression = $state<JamProgression>(JAM_PROGRESSIONS[0]!);
  let session = $state(new JamSession(progression));
  let tones = $state<TargetTone[]>(session.targetTones());
  let currentIndex = $state(0);
  let recording = $state(false);
  let recordedCount = $state(0);

  const current = $derived(session.current);
  const next = $derived(session.next);
  const sourceLabel = $derived(
    runtime.activeSource === "midi" ? "MIDI" : runtime.activeSource === "audio" ? "Audio" : "On-screen",
  );

  function roleFor(pc: number): TargetTone["role"] {
    return tones.find((tone) => tone.pitchClass === pc)?.role ?? "avoid";
  }
  function roleClass(role: TargetTone["role"], black = false): string {
    if (role === "chord") return "bg-primary text-primary-foreground";
    if (role === "scale") return black ? "bg-primary/50 text-white" : "bg-primary/20 text-primary";
    return black ? "" : "";
  }

  const unsubscribe = runtime.router.subscribe((event) => {
    if (!recording || event.type !== "noteOn") return;
    session.record(event);
    recordedCount = session.recorded().length;
  });

  // The transport Play button plays the whole progression.
  $effect(() => {
    const chords = progression.chords;
    const steps = chords.map((chord, index) => ({
      midiNotes: chordNotes(chord.symbol).map((name) => 48 + pitchClass(name)),
      offsetSeconds: index * 1.2,
      durationSeconds: 1.1,
    }));
    runtime.setPlaybackSource({
      label: `${progression.name} progression`,
      durationSec: chords.length * 1.2,
      play: () => runtime.sound.playPattern(steps),
    });
  });

  function selectStyle(id: string): void {
    progression = JAM_PROGRESSIONS.find((entry) => entry.id === id) ?? JAM_PROGRESSIONS[0]!;
    session = new JamSession(progression);
    currentIndex = 0;
    tones = session.targetTones();
    recordedCount = 0;
  }

  function refresh(): void {
    currentIndex = session.index;
    tones = session.targetTones();
  }

  function advance(): void {
    session.advance();
    refresh();
  }

  async function playChord(): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    const midi = chordNotes(current.symbol).map((name) => 48 + pitchClass(name));
    runtime.sound.playChord(midi, 1.2);
  }

  function playSolo(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
    }
  }

  function toggleRecording(): void {
    recording = !recording;
    if (recording) {
      session.clearRecording();
      recordedCount = 0;
    }
  }

  onDestroy(() => {
    unsubscribe();
    runtime.setPlaybackSource(undefined);
  });
</script>

<svelte:head>
  <title>Jam / Improv | Musicianship OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Jam / Improv"
    subtitle="Backing changes play the progression — target tones light up on your instrument."
  >
    {#snippet controls()}
      <SourceReadout label="Soloing on" device={sourceLabel} live={runtime.activeSource === "midi"} />
      <Button type="button" variant={recording ? "default" : "outline"} onclick={toggleRecording}>
        <Circle class="size-4 {recording ? 'fill-current text-destructive' : ''}" aria-hidden="true" />
        {recording ? `Recording · ${recordedCount}` : "Record solo"}
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="grid gap-6">
      <!-- Now playing -->
      <Card.Root>
        <Card.Content class="flex flex-col items-center gap-2 py-8 text-center">
          <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Now playing · {current.roman} in {progression.key}
          </span>
          <span class="text-6xl font-bold tracking-tight text-primary">{current.symbol}</span>
          <span class="text-sm text-muted-foreground">{current.scale}</span>
          <div class="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs">
            <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-primary"></span>Chord tones</span>
            <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-primary/30"></span>Scale tones</span>
            <span class="flex items-center gap-1.5"><span class="size-3 rounded-full bg-muted"></span>Avoid</span>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Progression rail -->
      <Card.Root>
        <Card.Header class="flex-row items-center justify-between gap-2">
          <Card.Description>Progression · {progression.name}</Card.Description>
          <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {current.bars} bars each
          </span>
        </Card.Header>
        <Card.Content class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#each progression.chords as chord, index}
            <div
              class="rounded-xl border p-3 text-center {index === currentIndex
                ? 'border-primary bg-primary/10'
                : ''}"
            >
              <div class="text-lg font-bold">{chord.symbol}</div>
              <div class="text-xs text-muted-foreground">
                {chord.roman}{index === currentIndex ? " · now" : index === (currentIndex + 1) % progression.chords.length ? " · next" : ""}
              </div>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- Target tones keyboard -->
      <Card.Root>
        <Card.Header>
          <Card.Description>Target tones · {current.symbol} / {current.scale}</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="relative mx-auto h-32 max-w-md select-none">
            <div class="flex h-full gap-1">
              {#each WHITE as key}
                <div
                  class="flex flex-1 items-end justify-center rounded-b-md border pb-2 text-xs font-semibold {roleClass(
                    roleFor(key.pc),
                  ) || 'bg-background text-muted-foreground'}"
                >
                  {key.label}
                </div>
              {/each}
            </div>
            {#each BLACK as key}
              <div
                class="absolute top-0 h-20 w-[9%] rounded-b-md border border-foreground/20 {roleClass(
                  roleFor(key.pc),
                  true,
                ) || 'bg-foreground'}"
                style="left:{key.left}%"
              ></div>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Solo input -->
      <Card.Root>
        <Card.Header class="flex-row items-center justify-between gap-2">
          <Card.Description>Play your solo</Card.Description>
          <div class="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onclick={playChord}>
              <Play class="size-4" aria-hidden="true" />Play chord
            </Button>
            <Button type="button" variant="outline" size="sm" onclick={advance}>
              <SkipForward class="size-4" aria-hidden="true" />Next chord
            </Button>
          </div>
        </Card.Header>
        <Card.Content>
          <OnScreenKeyboard router={runtime.router} onAccepted={playSolo} />
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Backing controls -->
    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Backing track</Card.Description>
          <Card.Title>Style</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-3">
          <SegmentedControl
            class="w-full"
            options={JAM_PROGRESSIONS.map((entry) => ({ value: entry.id, label: entry.name }))}
            value={progression.id}
            onChange={selectStyle}
          />
          <div class="grid gap-1 text-sm">
            <div class="flex justify-between"><span class="text-muted-foreground">Key</span><span class="font-medium">{progression.key}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">Next</span><span class="font-medium">{next.symbol}</span></div>
            <div class="flex justify-between"><span class="text-muted-foreground">Recorded</span><span class="font-medium tabular-nums">{recordedCount} notes</span></div>
          </div>
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
