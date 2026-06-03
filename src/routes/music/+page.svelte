<script lang="ts">
  import { browser } from '$app/environment';
  import { Capability, monotonicMs, type NoteEvent } from '@repo/music-core/domain';
  import { AnalyticsEngine } from '@repo/music-core/engines/analytics';
  import { runExerciseThroughPipeline } from '@repo/music-core/engines/exercise';
  import { InputRouter } from '@repo/music-core/engines/input-router';
  import { midiCapabilities } from '@repo/music-core/engines/midi';
  import { ProgressEngine } from '@repo/music-core/engines/progress';
  import { seedCoreSkills, SkillGraphStore } from '@repo/music-core/engines/skills';
  import { scheduleMetronomeTicks } from '@repo/music-core/engines/transport';
  import { chordNotes, noteToMidi } from '@repo/music-core/engines/theory';
  import { intervalRecognitionExercise } from '@repo/music-core/exercises/interval-recognition';
  import { Button } from '@repo/ui/button';
  import * as Card from '@repo/ui/card';
  import { Progress } from '@repo/ui/progress';
  import { Slider } from '@repo/ui/slider';

  const router = new InputRouter();
  const skills = new SkillGraphStore();
  const analytics = new AnalyticsEngine();
  const progress = new ProgressEngine();
  void skills.seed(seedCoreSkills());

  let audioEnabled = $state(false);
  let lastEvent = $state<NoteEvent | undefined>();
  let bpmValue = $state([96]);
  let xp = $state(progress.state.xp);
  let streak = $state(progress.state.streakDays);
  let mastery = $state(skills.getMastery('pitch.interval.m6').mastery);
  let feedback = $state('Answer an interval prompt to move real mastery.');

  const midi = $derived(midiCapabilities(browser ? navigator : {}));
  const bpm = $derived(bpmValue[0] ?? 96);
  const cmaj7 = $derived(chordNotes('Cmaj7'));
  const ticks = $derived(scheduleMetronomeTicks({ bpm, numerator: 4 }, 0, 8));
  const skillRows = $derived(
    skills.skills.slice(0, 8).map((skill) => ({
      ...skill,
      mastery: Math.round(skills.getMastery(skill.id).mastery * 100)
    }))
  );

  router.subscribe((event) => {
    lastEvent = event;
  });

  async function enableAudio() {
    audioEnabled = true;
  }

  function playOnScreen(note: string) {
    router.push({
      type: 'noteOn',
      midiNote: noteToMidi(note),
      velocity: 1,
      source: 'onscreen',
      timestamp: monotonicMs(performance.now()),
      clock: 'performance',
      instrument: 'piano'
    });
  }

  async function answerInterval(correct: boolean) {
    const input: NoteEvent = {
      type: 'noteOn',
      midiNote: 0,
      velocity: 1,
      source: 'click',
      timestamp: monotonicMs(performance.now()),
      clock: 'performance',
      raw: { midiData1: correct ? 8 : 7 }
    };
    router.push(input);
    const outcome = await runExerciseThroughPipeline({
      exercise: intervalRecognitionExercise,
      input: [input],
      services: { skills, analytics, progress },
      sessionId: 'demo-session',
      runId: crypto.randomUUID()
    });
    xp = progress.state.xp;
    streak = progress.state.streakDays;
    mastery = skills.getMastery('pitch.interval.m6').mastery;
    const confusions = analytics.confusions('m6');
    feedback = outcome.event.correct
      ? `Correct. +${outcome.xp} XP; m6 mastery is now ${Math.round(mastery * 100)}%.`
      : `Logged confusion: m6 -> P5 (${confusions.P5 ?? 0}x).`;
  }
</script>

<svelte:head>
  <title>Musicianship OS</title>
  <meta
    name="description"
    content="A cross-instrument practice app for ear training, reading, rhythm, theory, and technique."
  />
</svelte:head>

<main class="min-h-screen bg-background text-foreground">
  <section class="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-8">
    <header class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div class="space-y-2">
        <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Phase 0 + Phase 1 core
        </p>
        <h1 class="text-4xl font-bold tracking-tight md:text-5xl">Musicianship OS</h1>
      </div>
      <div class="grid gap-2 text-sm text-muted-foreground md:justify-items-end">
        <span class="rounded-full border px-3 py-1 text-foreground">
          {midi.supported ? 'Web MIDI ready' : 'Web MIDI unavailable'}
        </span>
        <span>
          Active input: {router.activeSource} · confidence {Math.round(router.confidence * 100)}%
        </span>
      </div>
    </header>

    {#if !midi.supported}
      <Card.Root aria-live="polite">
        <Card.Content class="flex flex-col gap-2 p-4 text-sm text-muted-foreground md:flex-row">
          <strong class="text-foreground">Chromium recommended for MIDI.</strong>
          <span>
            {midi.reason} The on-screen keyboard remains available now; audio input is a Phase 2
            seam.
          </span>
        </Card.Content>
      </Card.Root>
    {/if}

    <section class="grid gap-6 lg:grid-cols-2">
      <Card.Root>
        <Card.Header class="flex flex-row items-start justify-between gap-4">
          <div>
            <Card.Description>Today</Card.Description>
            <Card.Title>Daily mixed session</Card.Title>
          </div>
          <Button type="button" onclick={enableAudio}>
            {audioEnabled ? 'Audio enabled' : 'Enable audio'}
          </Button>
        </Card.Header>
        <Card.Content class="space-y-6">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-md border p-4">
              <span class="block text-3xl font-bold">{xp}</span>
              <small class="text-muted-foreground">XP</small>
            </div>
            <div class="rounded-md border p-4">
              <span class="block text-3xl font-bold">{streak}</span>
              <small class="text-muted-foreground">day streak</small>
            </div>
            <div class="rounded-md border p-4">
              <span class="block text-3xl font-bold">{Math.round(mastery * 100)}%</span>
              <small class="text-muted-foreground">m6 mastery</small>
            </div>
          </div>
          <p class="text-sm text-muted-foreground">{feedback}</p>
          <div class="flex flex-wrap gap-2" id="learn">
            <Button type="button" variant="secondary" onclick={() => answerInterval(false)}>
              Answer P5
            </Button>
            <Button type="button" onclick={() => answerInterval(true)}>Answer m6</Button>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header class="flex flex-row items-start justify-between gap-4">
          <div>
            <Card.Description>Instrument Hub</Card.Description>
            <Card.Title>Input router</Card.Title>
          </div>
          <span class="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {lastEvent?.type ?? 'idle'}
          </span>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="flex flex-wrap gap-2" aria-label="On-screen keyboard">
            {#each ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] as note}
              <Button type="button" variant="outline" onclick={() => playOnScreen(note)}>
                {note}
              </Button>
            {/each}
          </div>
          <p class="text-sm text-muted-foreground">
            Last event:
            {#if lastEvent?.type === 'noteOn'}
              MIDI {lastEvent.midiNote} from {lastEvent.source}
            {:else}
              waiting for input
            {/if}
          </p>
        </Card.Content>
      </Card.Root>
    </section>

    <section class="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <Card.Root id="play">
        <Card.Header>
          <Card.Description>Transport</Card.Description>
          <Card.Title>Metronome scheduler</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span>BPM</span>
              <span class="font-medium">{bpm}</span>
            </div>
            <Slider min={60} max={180} step={1} bind:value={bpmValue} />
          </div>
          <div class="flex flex-wrap gap-2">
            {#each ticks as tick}
              <span
                class="grid size-10 place-items-center rounded-md border text-sm font-medium"
                class:bg-primary={tick.accented}
                class:text-primary-foreground={tick.accented}
              >
                {tick.beat + 1}
              </span>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Theory library</Card.Description>
          <Card.Title>Cmaj7 projection</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="flex flex-wrap gap-2">
            {#each cmaj7 as note}
              <span class="grid size-10 place-items-center rounded-md border text-sm font-medium">
                {note}
              </span>
            {/each}
          </div>
          <p class="text-sm text-muted-foreground">
            Chord notes feed piano, guitar, and ukulele projections from one theory engine.
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Reading</Card.Description>
          <Card.Title>Note flashcards</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="relative grid gap-2 py-4" aria-label="Staff preview">
            <span class="h-px bg-border"></span>
            <span class="h-px bg-border"></span>
            <span class="h-px bg-border"></span>
            <span class="h-px bg-border"></span>
            <span class="h-px bg-border"></span>
            <b class="absolute left-1/2 top-3 text-3xl text-primary">♩</b>
          </div>
          <p class="text-sm text-muted-foreground">
            VexFlow can replace this scaffold once the dependency is available in package metadata.
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Description>Rhythm</Card.Description>
          <Card.Title>Ahead / behind</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <Progress value={54} max={100} />
          <p class="text-sm text-muted-foreground">
            Streaming runs compare normalized note timestamps to the transport grid.
          </p>
        </Card.Content>
      </Card.Root>
    </section>

    <Card.Root id="progress">
      <Card.Header class="flex flex-row items-start justify-between gap-4">
        <div>
          <Card.Description>Skill Graph</Card.Description>
          <Card.Title>Canonical mastery state</Card.Title>
        </div>
        <span class="rounded-full border px-3 py-1 text-sm text-muted-foreground">
          {Capability.Pitch} · {Capability.Rhythm} · {Capability.Harmony}
        </span>
      </Card.Header>
      <Card.Content>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {#each skillRows as skill}
            <div class="grid gap-2 rounded-md border p-3">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span>{skill.name}</span>
                <span class="text-muted-foreground">{skill.mastery}%</span>
              </div>
              <Progress value={skill.mastery} max={100} />
            </div>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  </section>
</main>
