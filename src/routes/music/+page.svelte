<script lang="ts">
  import { browser } from '$app/environment';
  import { Capability, monotonicMs, type NoteEvent } from '@repo/music-core/domain';
  import { AnalyticsEngine } from '@repo/music-core/engines/analytics';
  import { runExerciseThroughPipeline } from '@repo/music-core/engines/exercise';
  import {
    MidiEngine,
    midiCapabilities,
    type MidiDeviceSummary
  } from '@repo/music-core/engines/midi';
  import { ProgressEngine } from '@repo/music-core/engines/progress';
  import { seedCoreSkills, SkillGraphStore } from '@repo/music-core/engines/skills';
  import { PracticeStore } from '@repo/music-core/engines/store';
  import {
    createToneTransportEngine,
    scheduleMetronomeTicks,
    type TransportEngine
  } from '@repo/music-core/engines/transport';
  import { chordNotes } from '@repo/music-core/engines/theory';
  import { intervalRecognitionExercise } from '@repo/music-core/exercises/interval-recognition';
  import { Button } from '@repo/ui/button';
  import * as Card from '@repo/ui/card';
  import { Progress } from '@repo/ui/progress';
  import { Slider } from '@repo/ui/slider';
  import { onDestroy } from 'svelte';

  import OnScreenKeyboard from './_components/OnScreenKeyboard.svelte';
  import { useMusicRuntime } from './_runtime.svelte';

  const runtime = useMusicRuntime();
  const router = runtime.router;
  const sound = runtime.sound;
  const practiceStore = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(practiceStore);
  const analytics = new AnalyticsEngine(practiceStore);
  const progress = new ProgressEngine(practiceStore);
  const midiEngine = new MidiEngine();
  let transport: TransportEngine | undefined;
  let unsubscribeTransport: (() => void) | undefined;

  let metronomeRunning = $state(false);
  let activeBeat = $state(-1);
  let lastEvent = $state<NoteEvent | undefined>();
  let midiEnabled = $state(false);
  let midiStatus = $state('MIDI permission has not been requested.');
  let midiDevices = $state<MidiDeviceSummary[]>([]);
  let midiEvents = $state<NoteEvent[]>([]);
  let activeSource = $state(router.activeSource);
  let inputConfidence = $state(router.confidence);
  let bpmValue = $state([96]);
  let xp = $state(progress.state.xp);
  let streak = $state(progress.state.streakDays);
  let mastery = $state(skills.getMastery('pitch.interval.m6').mastery);
  let feedback = $state('Answer an interval prompt to move real mastery.');
  let skillRows = $state<ReturnType<typeof projectSkillRows>>([]);

  void Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]).then(() => {
    xp = progress.state.xp;
    streak = progress.state.streakDays;
    mastery = skills.getMastery('pitch.interval.m6').mastery;
    skillRows = projectSkillRows();
  });

  const midi = $derived(midiCapabilities(browser ? navigator : {}));
  const bpm = $derived(bpmValue[0] ?? 96);
  const cmaj7 = $derived(chordNotes('Cmaj7'));
  const ticks = $derived(scheduleMetronomeTicks({ bpm, numerator: 4 }, 0, 4));
  function projectSkillRows() {
    return skills.skills.slice(0, 8).map((skill) => ({
      ...skill,
      mastery: Math.round(skills.getMastery(skill.id).mastery * 100)
    }));
  }

  const unsubscribeRouter = router.subscribe((event) => {
    lastEvent = event;
  });
  const unsubscribeRouterState = router.subscribeState((state) => {
    activeSource = state.activeSource;
    inputConfidence = state.confidence;
  });
  const unsubscribeMidi = midiEngine.subscribe((event) => {
    router.push(event);
    midiEvents = [event, ...midiEvents].slice(0, 8);
  });
  const unsubscribeMidiState = midiEngine.subscribeState((state) => {
    midiEnabled = state.enabled;
    midiDevices = [...state.inputs, ...state.outputs];
    midiStatus = state.enabled
      ? `${state.inputs.length} input${state.inputs.length === 1 ? '' : 's'} connected.`
      : (state.error ?? 'MIDI permission has not been requested.');
  });

  $effect(() => {
    transport?.setBpm(bpm);
  });

  async function ensureTransport() {
    const audioEnabled = await runtime.enableAudio();
    if (!audioEnabled || transport) return;

    transport = await createToneTransportEngine({
      bpm,
      onMetronomeClick: (atSeconds, accented) => sound.playMetronomeClick(atSeconds, accented)
    });
    unsubscribeTransport = transport.subscribe((event) => {
      if (event.kind === 'beat') activeBeat = event.beat;
    });
  }

  async function toggleMetronome() {
    await ensureTransport();
    if (!transport) return;

    if (transport.state.running) {
      transport.stop();
      metronomeRunning = false;
      activeBeat = -1;
      return;
    }

    transport.setBpm(bpm);
    transport.start();
    metronomeRunning = true;
  }

  async function enableMidi() {
    await midiEngine.enable();
  }

  function playOnScreen(event: NoteEvent) {
    if (event.type === 'noteOn') sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
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
    skillRows = projectSkillRows();
    const confusions = analytics.confusions('pitch.interval.m6');
    feedback = outcome.event.correct
      ? `Correct. +${outcome.xp} XP; m6 mastery is now ${Math.round(mastery * 100)}%.`
      : `Logged confusion: m6 -> P5 (${confusions.P5 ?? 0}x).`;
  }

  onDestroy(() => {
    unsubscribeTransport?.();
    unsubscribeRouter();
    unsubscribeRouterState();
    unsubscribeMidi();
    unsubscribeMidiState();
    void midiEngine.disable();
    if (transport?.state.running) transport.stop();
  });
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
          {midiEnabled ? 'Web MIDI enabled' : midi.supported ? 'Web MIDI ready' : 'Web MIDI unavailable'}
        </span>
        <span>
          Active input: {activeSource} · confidence {Math.round(inputConfidence * 100)}%
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
        <Card.Header>
          <div>
            <Card.Description>Today</Card.Description>
            <Card.Title>Daily mixed session</Card.Title>
          </div>
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
          <div class="flex flex-wrap justify-end gap-2">
            <span class="rounded-full border px-3 py-1 text-sm text-muted-foreground">
              {lastEvent?.type ?? 'idle'}
            </span>
            <Button type="button" variant="outline" disabled={!midi.supported} onclick={enableMidi}>
              {midiEnabled ? 'MIDI enabled' : 'Enable MIDI'}
            </Button>
          </div>
        </Card.Header>
        <Card.Content class="space-y-4">
          <OnScreenKeyboard {router} onAccepted={playOnScreen} />
          <p class="text-sm text-muted-foreground">
            Last event:
            {#if lastEvent?.type === 'noteOn'}
              MIDI {lastEvent.midiNote} from {lastEvent.source}
            {:else}
              waiting for input
            {/if}
          </p>
          <p class="text-sm text-muted-foreground" aria-live="polite">{midiStatus}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <h3 class="text-sm font-medium">MIDI devices</h3>
              {#if midiDevices.length > 0}
                <ul class="grid gap-1 text-sm text-muted-foreground">
                  {#each midiDevices as device}
                    <li class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span class="truncate">{device.name}</span>
                      <span>{device.type}{device.instrument ? ` · ${device.instrument}` : ''}</span>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="text-sm text-muted-foreground">No MIDI devices detected.</p>
              {/if}
            </div>
            <div class="space-y-2">
              <h3 class="text-sm font-medium">Live MIDI events</h3>
              {#if midiEvents.length > 0}
                <ol class="grid gap-1 font-mono text-xs text-muted-foreground" aria-live="polite">
                  {#each midiEvents as event}
                    <li class="rounded-md border px-3 py-2">
                      {event.type} · ch {event.channel ?? '—'} · {Math.round(event.timestamp)}ms
                    </li>
                  {/each}
                </ol>
              {:else}
                <p class="text-sm text-muted-foreground">Waiting for a MIDI message.</p>
              {/if}
            </div>
          </div>
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
            <Slider type="multiple" min={60} max={180} step={1} bind:value={bpmValue} />
          </div>
          <div class="flex flex-wrap gap-2">
            {#each ticks as tick}
              <span
                class="grid size-10 place-items-center rounded-md border text-sm font-medium"
                class:bg-primary={activeBeat === tick.beat}
                class:text-primary-foreground={activeBeat === tick.beat}
              >
                {tick.beat + 1}
              </span>
            {/each}
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-muted-foreground" aria-live="polite">
              {metronomeRunning ? `Playing beat ${activeBeat + 1}` : 'Metronome stopped'}
            </span>
            <Button type="button" variant="secondary" onclick={toggleMetronome}>
              {metronomeRunning ? 'Stop metronome' : 'Start metronome'}
            </Button>
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
