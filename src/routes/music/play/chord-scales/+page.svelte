<script lang="ts">
  import Play from "lucide-svelte/icons/play";
  import { onDestroy } from "svelte";

  import type { NoteEvent } from "@repo/music-core/domain";
  import { gradeLickSequence, type LickGrade } from "@repo/music-core/engines/jazz";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import {
    scaleSemitones,
    type ScalePatternKind,
  } from "@repo/music-core/exercises/scale-pattern";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  const SCALE_BPM = 132;

  // The go-to scale for each chord as a ii-V-I moves — the relationship the Jazz
  // Guide teaches as reference, here drilled by ear and hand. Roots in C; scale
  // kinds reuse the J5 scale set so notes come straight from scaleSemitones().
  interface Change {
    symbol: string;
    rootMidi: number;
    scale: ScalePatternKind;
    scaleLabel: string;
  }
  interface Changes {
    id: string;
    label: string;
    chords: Change[];
  }
  const ALL_CHANGES: Changes[] = [
    {
      id: "major",
      label: "Major ii-V-I",
      chords: [
        { symbol: "Dm7", rootMidi: 62, scale: "dorian", scaleLabel: "D Dorian" },
        { symbol: "G7", rootMidi: 67, scale: "mixolydian", scaleLabel: "G Mixolydian" },
        { symbol: "Cmaj7", rootMidi: 60, scale: "major", scaleLabel: "C Major" },
      ],
    },
    {
      id: "minor",
      label: "Minor ii-V-i",
      chords: [
        { symbol: "Dm7♭5", rootMidi: 62, scale: "locrian", scaleLabel: "D Locrian" },
        { symbol: "G7alt", rootMidi: 67, scale: "altered", scaleLabel: "G Altered" },
        { symbol: "Cm7", rootMidi: 60, scale: "dorian", scaleLabel: "C Dorian" },
      ],
    },
  ];
  const changesOptions = ALL_CHANGES.map((entry) => ({ value: entry.id, label: entry.label }));

  let changesId = $state("major");
  let chordIndex = $state(0);
  let phase = $state<"idle" | "listening" | "graded">("idle");
  let played = $state<number[]>([]);
  let grades = $state<LickGrade[]>([]);
  let status = $state("Hear the scale for each chord, then play it back.");
  let captured = false;
  let unsubscribe: (() => void) | undefined;

  const changes = $derived(ALL_CHANGES.find((entry) => entry.id === changesId) ?? ALL_CHANGES[0]);
  const chord = $derived(changes.chords[chordIndex]);
  const scaleMidi = $derived(scaleSemitones(chord.scale).map((semitones) => chord.rootMidi + semitones));
  const scaleNotes = $derived(scaleMidi.map((midi) => midiToNote(midi, true)).join("  "));
  const done = $derived(grades.length === changes.chords.length);
  const overall = $derived(
    grades.length === 0
      ? 0
      : Math.round((grades.reduce((sum, g) => sum + g.accuracy, 0) / grades.length) * 100),
  );

  function reset(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    chordIndex = 0;
    phase = "idle";
    played = [];
    grades = [];
    captured = false;
    status = "Hear the scale for each chord, then play it back.";
  }

  function selectChanges(id: string): void {
    changesId = id;
    reset();
  }

  async function hearScale(): Promise<void> {
    if (!(await runtime.enableAudio())) return;
    const secondsPerBeat = 60 / SCALE_BPM;
    scaleMidi.forEach((midi, step) => {
      runtime.sound.playNote(midi, secondsPerBeat * 0.9, `+${step * secondsPerBeat * 0.5}`, 0.85);
    });
  }

  function startAttempt(): void {
    unsubscribe?.();
    phase = "listening";
    played = [];
    status = `Play ${chord.scaleLabel} over ${chord.symbol}…`;
    unsubscribe = runtime.router.subscribe((event: NoteEvent) => {
      if (phase !== "listening" || event.type !== "noteOn") return;
      if (runtime.audioEnabled) {
        runtime.sound.playNote(event.midiNote, 0.16, undefined, event.velocity);
      }
      played = [...played, event.midiNote];
      if (played.length >= scaleMidi.length) gradeChord();
    });
  }

  function gradeChord(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    const grade = gradeLickSequence(scaleMidi, played);
    grades = [...grades, grade];
    if (chordIndex < changes.chords.length - 1) {
      phase = "idle";
      chordIndex += 1;
      status = `${Math.round(grade.accuracy * 100)}% — next chord: ${changes.chords[chordIndex].symbol}.`;
    } else {
      phase = "graded";
      finish();
    }
  }

  function finish(): void {
    status = `Done — ${overall}% across ${changes.chords.length} chords.`;
    if (!captured) {
      captured = true;
      const xp = Math.round((overall / 100) * 30);
      void runtime.recordPractice({
        source: "drill",
        instrument: "piano",
        tags: ["jazz", "chord-scales"],
        xpEarned: xp,
        note: `${changes.label} chord-scales · ${overall}%`,
      });
    }
  }

  onDestroy(() => unsubscribe?.());
</script>

<svelte:head>
  <title>Chord-Scale Drill | Musicianship OS</title>
  <meta
    name="description"
    content="Play the go-to scale for each chord as a ii-V-I moves — Dorian, Mixolydian, Ionian — graded note-by-note."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Chord-Scale Drill"
    subtitle="As the ii-V-I moves, play the go-to scale for each chord. Graded note-by-note; XP feeds your jazz vocabulary."
  >
    {#snippet controls()}
      <SourceReadout
        label="Playing on"
        device={runtime.activeSource === "midi" ? "MIDI" : "On-screen"}
        live={runtime.activeSource === "midi"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="min-w-0 space-y-4">
      <Card.Root>
        <Card.Header class="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Card.Description>Changes</Card.Description>
            <Card.Title>{changes.label} · {changes.chords.map((c) => c.symbol).join(" ")}</Card.Title>
          </div>
          <SegmentedControl
            size="sm"
            ariaLabel="Changes"
            options={changesOptions}
            value={changesId}
            onChange={selectChanges}
          />
        </Card.Header>

        <Card.Content class="space-y-5">
          <!-- The three chords; the current one is highlighted. -->
          <div class="grid gap-2 sm:grid-cols-3" role="list" aria-label="Chord changes">
            {#each changes.chords as entry, index (entry.symbol)}
              <div
                role="listitem"
                class="rounded-lg border p-3 transition-colors {index === chordIndex && !done
                  ? 'border-practice-accent bg-practice-accent/5'
                  : grades[index]
                    ? 'bg-muted/40'
                    : ''}"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-lg font-bold">{entry.symbol}</span>
                  {#if grades[index]}
                    <Badge variant="secondary">{Math.round(grades[index].accuracy * 100)}%</Badge>
                  {/if}
                </div>
                <span class="text-sm text-muted-foreground">{entry.scaleLabel}</span>
              </div>
            {/each}
          </div>

          {#if !done}
            <div class="space-y-2 rounded-lg border bg-muted/30 p-4">
              <p class="eyebrow">Play this · {chord.scaleLabel} over {chord.symbol}</p>
              <p class="font-mono text-sm tabular-nums">{scaleNotes}</p>
            </div>
          {/if}

          {#if phase === "listening"}
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs text-muted-foreground">
                <span>Notes played</span>
                <span class="tabular-nums">{played.length} / {scaleMidi.length}</span>
              </div>
              <Progress value={Math.min(played.length, scaleMidi.length)} max={scaleMidi.length} />
            </div>
          {/if}

          {#if done}
            <div class="rounded-md border border-practice-accent/30 bg-practice-accent/5 p-4">
              <p class="font-semibold">{overall}% across {changes.chords.length} chords</p>
              <p class="text-sm text-muted-foreground">
                Hear each scale again and match it note-for-note over its chord.
              </p>
            </div>
            <RoutineContinueAction routine={runtime.dailyRoutine} />
          {/if}

          <OnScreenKeyboard router={runtime.router} />
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          {#if done}
            <Button type="button" onclick={reset}>Restart</Button>
          {:else}
            <Button type="button" variant="outline" onclick={hearScale}>
              <Play aria-hidden="true" />
              Hear scale
            </Button>
            <Button type="button" onclick={startAttempt}>Play it back</Button>
          {/if}
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    </div>

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Why this drill</Card.Description>
          <Card.Title class="text-base">Chord → scale</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2 text-sm text-muted-foreground">
          <p>Every chord implies a scale. Internalising which scale fits which chord is the core of jazz improv.</p>
          <p>Hear the go-to scale, then play it back over each chord of the progression.</p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>This run</Card.Description>
          <Card.Title>{grades.length > 0 ? `${overall}%` : "—"}</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Chords graded</span>
            <span class="font-medium tabular-nums">{grades.length} / {changes.chords.length}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Skill</span>
            <span class="font-medium">Jazz vocabulary</span>
          </div>
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
