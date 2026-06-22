<script lang="ts">
  import { browser } from '$app/environment';
  import { Capability, type NoteEvent } from '@repo/music-core/domain';
  import { AnalyticsEngine } from '@repo/music-core/engines/analytics';
  import { runExerciseThroughPipeline } from '@repo/music-core/engines/exercise';
  import {
    midiCapabilities,
    type MidiDeviceSummary
  } from '@repo/music-core/engines/midi';
  import { ProgressEngine } from '@repo/music-core/engines/progress';
  import { seedCoreSkills, SkillGraphStore } from '@repo/music-core/engines/skills';
  import { PracticeStore } from '@repo/music-core/engines/store';
  import { chordNotes } from '@repo/music-core/engines/theory';
  import { intervalRecognitionExercise } from '@repo/music-core/exercises/interval-recognition';
  import { choiceAnswerEvent } from '@repo/music-core/exercises/ear-training';
  import { Button } from '@repo/ui/button';
  import * as Card from '@repo/ui/card';
  import { onDestroy } from 'svelte';

  import Drum from 'lucide-svelte/icons/drum';
  import Ear from 'lucide-svelte/icons/ear';
  import Guitar from 'lucide-svelte/icons/guitar';
  import Mic from 'lucide-svelte/icons/mic';
  import Music from 'lucide-svelte/icons/music';
  import Piano from 'lucide-svelte/icons/piano';
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';

  import InstrumentBadge from './_components/InstrumentBadge.svelte';
  import OnScreenKeyboard from './_components/OnScreenKeyboard.svelte';
  import PracticeActionCard from './_components/PracticeActionCard.svelte';
  import PracticeScreen from './_components/PracticeScreen.svelte';
  import PracticeScreenHeader from './_components/PracticeScreenHeader.svelte';
  import ProgressRing from './_components/ProgressRing.svelte';
  import SkillTreeGraph from './_components/SkillTreeGraph.svelte';
  import SourceReadout from './_components/SourceReadout.svelte';
  import WeekDots from './_components/WeekDots.svelte';
  import { useMusicRuntime } from './_runtime.svelte';

  const runtime = useMusicRuntime();
  const router = runtime.router;
  const sound = runtime.sound;
  const practiceStore = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(practiceStore);
  const analytics = new AnalyticsEngine(practiceStore);
  const progress = new ProgressEngine(practiceStore);
  const coreSkillSeed = seedCoreSkills();
  const midiEngine = runtime.midi;

  let lastEvent = $state<NoteEvent | undefined>();
  let midiEnabled = $state(false);
  let midiStatus = $state('MIDI permission has not been requested.');
  let midiDevices = $state<MidiDeviceSummary[]>([]);
  let midiEvents = $state<NoteEvent[]>([]);
  let activeSource = $state(router.activeSource);
  let inputConfidence = $state(router.confidence);
  let xp = $state(progress.state.xp);
  let streak = $state(progress.state.streakDays);
  let mastery = $state(skills.getMastery('pitch.interval.m6').mastery);
  let feedback = $state('Answer an interval prompt to move real mastery.');
  let skillRows = $state<ReturnType<typeof projectSkillRows>>([]);

  void Promise.all([skills.seed(coreSkillSeed), analytics.load(), progress.load()]).then(() => {
    xp = progress.state.xp;
    streak = progress.state.streakDays;
    mastery = skills.getMastery('pitch.interval.m6').mastery;
    skillRows = projectSkillRows();
  });

  const dailyXpGoal = 1000;
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  })();
  const todayDotIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const weekCompletedDays = $derived(
    Array.from({ length: todayDotIndex }, (_, index) => index)
  );

  const midi = $derived(midiCapabilities(browser ? navigator : {}));
  const cmaj7 = $derived(chordNotes('Cmaj7'));
  const sourceLabel = $derived(
    activeSource === 'midi' ? 'MIDI' : activeSource === 'audio' ? 'Audio' : 'On-screen'
  );
  const snapshotNodes = $derived(
    skillRows.slice(0, 5).map((skill) => ({ label: skill.name, percent: skill.mastery }))
  );
  const snapshotRoot = $derived({
    label: 'Musicality',
    percent:
      snapshotNodes.length > 0
        ? Math.round(
            snapshotNodes.reduce((total, node) => total + node.percent, 0) / snapshotNodes.length
          )
        : 0
  });

  const instruments = [
    { id: 'piano', name: 'Piano', icon: Piano },
    { id: 'guitar', name: 'Guitar', icon: Guitar },
    { id: 'ukulele', name: 'Ukulele', icon: Guitar },
    { id: 'aerophone', name: 'Aerophone', icon: Music },
    { id: 'mpc', name: 'MPC Pads', icon: Drum },
    { id: 'voice', name: 'Voice', icon: Mic }
  ] as const;

  function projectSkillRows() {
    return coreSkillSeed.skills.slice(0, 8).map((skill) => ({
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
    midiEvents = [event, ...midiEvents].slice(0, 8);
  });
  const unsubscribeMidiState = midiEngine.subscribeState((state) => {
    midiEnabled = state.enabled;
    midiDevices = [...state.inputs, ...state.outputs];
    midiStatus = state.enabled
      ? `${state.inputs.length} input${state.inputs.length === 1 ? '' : 's'} connected.`
      : (state.error ?? 'MIDI permission has not been requested.');
  });

  async function enableMidi() {
    await midiEngine.enable();
  }

  function playOnScreen(event: NoteEvent) {
    if (event.type === 'noteOn') sound.playNote(event.midiNote, 0.18, undefined, event.velocity);
  }

  async function answerInterval(correct: boolean) {
    const input = choiceAnswerEvent(correct ? 'm6' : 'P5', [
      'm2',
      'M2',
      'm3',
      'M3',
      'P4',
      'TT',
      'P5',
      'm6',
      'M6',
      'm7',
      'M7',
      'P8'
    ]);
    router.push(input);
    const outcome = await runExerciseThroughPipeline({
      exercise: intervalRecognitionExercise,
      input: [input],
      services: { skills, analytics, progress },
      sessionId: 'demo-session',
      runId: crypto.randomUUID(),
      context: { targetSkillIds: ['pitch.interval.m6'], difficulty: 0.6 }
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
    unsubscribeRouter();
    unsubscribeRouterState();
    unsubscribeMidi();
    unsubscribeMidiState();
  });
</script>

<svelte:head>
  <title>Musicianship OS</title>
  <meta
    name="description"
    content="A cross-instrument practice app for ear training, reading, rhythm, theory, and technique."
  />
</svelte:head>

<PracticeScreen>
    <PracticeScreenHeader
      title="Good {greeting} — welcome to Musicianship OS"
      subtitle="Keep the streak alive — one focused rep at a time."
    >
      {#snippet controls()}
        <SourceReadout label="Active input" device={sourceLabel} live={activeSource === 'midi'} />
        <span class="rounded-full border px-3 py-1 text-sm text-muted-foreground">
          {midiEnabled
            ? 'Web MIDI enabled'
            : midi.supported
              ? 'Web MIDI ready'
              : 'Web MIDI unavailable'}
        </span>
      {/snippet}
    </PracticeScreenHeader>

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

    <!-- Hero stats -->
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <!-- XP ring -->
      <div class="flex flex-col items-center gap-3 rounded-2xl border bg-card p-5">
        <span
          class="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >Today's XP</span
        >
        <ProgressRing value={xp} total={dailyXpGoal} label="Today's XP" size={140} gradient />
        <span class="text-xs text-muted-foreground">Daily goal · resets at midnight</span>
      </div>

      <!-- Streak -->
      <div class="flex flex-col items-center gap-3 rounded-2xl border bg-card p-5">
        <span
          class="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >Streak</span
        >
        <div class="text-4xl" aria-hidden="true">🔥</div>
        <span class="text-4xl font-bold leading-none tabular-nums">{streak}</span>
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >Day streak</span
        >
        <WeekDots completedDays={weekCompletedDays} todayIndex={todayDotIndex} />
      </div>

      <!-- Continue practice -->
      <div
        class="flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card sm:col-span-2"
        id="learn"
      >
        <!-- cover media -->
        <div
          class="relative flex h-20 items-end bg-gradient-to-br from-primary/30 via-primary/15 to-transparent p-4"
        >
          <span class="text-sm font-semibold text-primary/90">Today's guided practice</span>
          <span class="absolute right-4 top-4"><InstrumentBadge instrument="Piano" dot /></span>
        </div>
        <div class="flex flex-col gap-3 px-5 pb-5">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >Continue practice</span
        >
        <h2 class="text-lg font-bold tracking-tight">Daily mixed session</h2>
        <p class="text-sm text-muted-foreground">
          Ear training, note reading, rhythm, and technique in one logged session.
        </p>
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-lg border p-3 text-center">
            <span class="block text-2xl font-bold tabular-nums">{xp}</span>
            <small class="text-muted-foreground">XP</small>
          </div>
          <div class="rounded-lg border p-3 text-center">
            <span class="block text-2xl font-bold tabular-nums">{streak}</span>
            <small class="text-muted-foreground">streak</small>
          </div>
          <div class="rounded-lg border p-3 text-center">
            <span class="block text-2xl font-bold tabular-nums">{Math.round(mastery * 100)}%</span>
            <small class="text-muted-foreground">m6 mastery</small>
          </div>
        </div>
        <p class="text-sm text-muted-foreground" aria-live="polite">{feedback}</p>
        <div class="mt-auto flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onclick={() => answerInterval(false)}>
            Answer P5
          </Button>
          <Button type="button" onclick={() => answerInterval(true)}>Answer m6</Button>
          <a
            href="/music/routine"
            class="ml-auto inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {runtime.dailyRoutine?.status === "active" ? "Continue routine" : "Start daily routine"} →
          </a>
        </div>
        </div>
      </div>
    </div>

    <!-- Instrument strip -->
    <div class="rounded-2xl border bg-card p-5">
      <div class="mb-4 flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >Your instruments</span
        >
        <span class="text-xs text-muted-foreground">Tap to set the active instrument</span>
      </div>
      <div class="flex flex-wrap gap-3">
        {#each instruments as instrument}
          {@const Icon = instrument.icon}
          {@const active = runtime.activeInstrument === instrument.id}
          <button
            type="button"
            onclick={() => runtime.setActiveInstrument(instrument.id)}
            aria-pressed={active}
            class="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors {active
              ? 'border-primary bg-primary/10'
              : 'hover:bg-muted'}"
          >
            <span
              class="grid size-9 place-items-center rounded-lg {active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'}"
            >
              <Icon class="size-4" aria-hidden="true" />
            </span>
            <span class="text-sm font-semibold">{instrument.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Practice Lab -->
    <section>
      <div class="mb-4 flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >Today's routine · Practice Lab</span
        >
        <a href="/music/learn" class="text-sm text-muted-foreground hover:text-foreground"
          >View all →</a
        >
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PracticeActionCard
          title="Ear Training"
          description="Interval ID · listening & recognition."
          xp={150}
          href="/music/learn/ear"
        >
          {#snippet icon()}<Ear class="size-5" aria-hidden="true" />{/snippet}
        </PracticeActionCard>
        <PracticeActionCard
          title="Rhythm"
          description="16th-note groove · lock your timing."
          xp={120}
          href="/music/learn/rhythm"
        >
          {#snippet icon()}<Drum class="size-5" aria-hidden="true" />{/snippet}
        </PracticeActionCard>
        <PracticeActionCard
          title="Harmony"
          description="Shell voicings · chords & progressions."
          xp={200}
          href="/music/learn/theory"
        >
          {#snippet icon()}<Music class="size-5" aria-hidden="true" />{/snippet}
        </PracticeActionCard>
        <PracticeActionCard
          title="Technique"
          description="Major scales · speed & control."
          xp={120}
          href="/music/play/scales"
        >
          {#snippet icon()}<SlidersHorizontal class="size-5" aria-hidden="true" />{/snippet}
        </PracticeActionCard>
      </div>
    </section>

    <!-- Instrument hub: on-screen keyboard, MIDI devices, live events -->
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

    <!-- Skill snapshot (real mastery) + theory projection -->
    <div class="grid gap-6 lg:grid-cols-3">
      <Card.Root id="progress" class="lg:col-span-2">
        <Card.Header class="flex flex-row items-start justify-between gap-4">
          <div>
            <Card.Description>Skill tree snapshot</Card.Description>
            <Card.Title>Canonical mastery state</Card.Title>
          </div>
          <span class="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {Capability.Pitch} · {Capability.Rhythm} · {Capability.Harmony}
          </span>
        </Card.Header>
        <Card.Content>
          {#if snapshotNodes.length > 0}
            <SkillTreeGraph root={snapshotRoot} nodes={snapshotNodes} />
          {/if}
          <a
            href="/music/progress"
            class="mt-2 inline-flex text-sm text-muted-foreground hover:text-foreground"
            >Full skill tree →</a
          >
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
    </div>
</PracticeScreen>
