<script lang="ts">
  import BookOpen from "lucide-svelte/icons/book-open";
  import Ear from "lucide-svelte/icons/ear";
  import Gauge from "lucide-svelte/icons/gauge";
  import NotebookPen from "lucide-svelte/icons/notebook-pen";
  import Plug from "lucide-svelte/icons/plug";
  import WifiOff from "lucide-svelte/icons/wifi-off";

  import * as Card from "@repo/ui/card";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";

  const quickStart = [
    {
      title: "Enable audio",
      body: "Most screens have an “Enable audio” button — browsers only allow sound after a click. Tap it once per visit so prompts and the metronome can play.",
    },
    {
      title: "Connect an instrument (or use on-screen)",
      body: "Open Connect, press “Add device”, and allow Web MIDI to detect controllers. No hardware? Every screen falls back to an on-screen surface — keyboard, guitar/ukulele fretboard, or MPC pads.",
      href: "/music/connect",
      cta: "Open Connect",
    },
    {
      title: "Pick a drill",
      body: "Head to Learn and start an Ear Training, Note Reading, Rhythm, or Scales session. Choose how you answer (multiple choice or by playing the note).",
      href: "/music/learn",
      cta: "Open Learn",
    },
    {
      title: "Play through it",
      body: "Answer the prompts — getting some wrong is how the app learns what to drill next. The transport bar at the bottom plays whatever is on screen and runs the metronome.",
    },
    {
      title: "Finish & read your journal",
      body: "Completing a session awards XP, updates your streak, and writes an entry to the Journal automatically. Open Track to add notes or edit entries.",
      href: "/music/track",
      cta: "Open Journal",
    },
  ];

  const areas = [
    {
      icon: Ear,
      label: "Learn",
      body: "Skill-building drills: Chord Library, Ear Training, Note Reading, Rhythm, and Scales & Drills. Each run feeds your Skill Tree.",
      href: "/music/learn",
    },
    {
      icon: BookOpen,
      label: "Play",
      body: "Open-ended playing: the Practice Lab, Import & Play a MIDI file, Jam / Improv over a progression, the Studio step sequencer, and Recording.",
      href: "/music/play",
    },
    {
      icon: NotebookPen,
      label: "Track",
      body: "Your Practice Journal. Sessions land here automatically; add free-text notes and tags, or edit and delete entries.",
      href: "/music/track",
    },
    {
      icon: Gauge,
      label: "Progress",
      body: "The Skill Tree, capability coverage rings, streak calendar, and the confusion map showing which sounds you mix up.",
      href: "/music/progress",
    },
  ];
</script>

<svelte:head>
  <title>How to use the Music app | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="How to use Practice OS"
    subtitle="A two-minute tour: plug in (or play on-screen), run a drill, and watch your journal and skill tree fill in."
  />

  <!-- Quick start -->
  <section aria-label="Quick start" class="grid gap-3">
    <h2 class="eyebrow">
      Quick start
    </h2>
    <ol class="grid gap-3">
      {#each quickStart as step, i (step.title)}
        <li>
          <Card.Root>
            <Card.Content class="flex items-start gap-4 py-4">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div class="min-w-0 flex-1">
                <p class="font-semibold">{step.title}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
                {#if step.href}
                  <a
                    href={step.href}
                    class="mt-2 inline-flex text-sm font-semibold text-primary hover:underline"
                  >
                    {step.cta} →
                  </a>
                {/if}
              </div>
            </Card.Content>
          </Card.Root>
        </li>
      {/each}
    </ol>
  </section>

  <!-- The practice loop -->
  <section aria-label="The practice loop">
    <Card.Root>
      <Card.Header>
        <Card.Title>The practice loop</Card.Title>
        <Card.Description>How a session turns into progress.</Card.Description>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        <p>
          Every drill scores the notes you play through a shared input router, so MIDI, audio, and
          on-screen input all count the same. Finishing a session awards <strong
            class="text-foreground">XP</strong
          >, nudges the <strong class="text-foreground">mastery</strong> of the skills it exercised,
          and records what you confused for what. The
          <a href="/music/progress" class="font-semibold text-primary hover:underline">Skill Tree</a>
          then surfaces what to practice next, and the
          <a href="/music/track" class="font-semibold text-primary hover:underline">Journal</a>
          keeps the running history — all stored locally on your device.
        </p>
      </Card.Content>
    </Card.Root>
  </section>

  <!-- Areas of the app -->
  <section aria-label="Areas of the app" class="grid gap-3">
    <h2 class="eyebrow">
      Around the app
    </h2>
    <div class="grid gap-4 sm:grid-cols-2">
      {#each areas as area (area.label)}
        {@const Icon = area.icon}
        <Card.Root>
          <Card.Header class="flex-row items-center gap-3 space-y-0">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
            >
              <Icon class="size-5" aria-hidden="true" />
            </span>
            <Card.Title>{area.label}</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-2 text-sm text-muted-foreground">
            <p>{area.body}</p>
            <a href={area.href} class="font-semibold text-primary hover:underline">
              Open {area.label} →
            </a>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  </section>

  <!-- Transport bar + Connect -->
  <section aria-label="Transport and devices" class="grid gap-4 sm:grid-cols-2">
    <Card.Root>
      <Card.Header class="flex-row items-center gap-3 space-y-0">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Gauge class="size-5" aria-hidden="true" />
        </span>
        <Card.Title>The transport bar</Card.Title>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        <p>
          The bar pinned to the bottom is always live. <strong class="text-foreground">Play</strong>
          previews whatever is on screen — a melody, a take, an imported file. Set the
          <strong class="text-foreground">tempo</strong> and <strong class="text-foreground"
            >count-in</strong
          >, toggle the metronome, and (with a MIDI device) pick which instrument it listens to.
        </p>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="flex-row items-center gap-3 space-y-0">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Plug class="size-5" aria-hidden="true" />
        </span>
        <Card.Title>Devices & input surfaces</Card.Title>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        <p>
          In <a href="/music/connect" class="font-semibold text-primary hover:underline">Connect</a>
          you name your controllers, pick a preferred source per instrument (MIDI / audio /
          on-screen), and choose the on-screen surface — keyboard, fretboard, or MPC pads — that
          follows you into each drill.
        </p>
      </Card.Content>
    </Card.Root>
  </section>

  <!-- Offline -->
  <section aria-label="Offline use">
    <Card.Root>
      <Card.Header class="flex-row items-center gap-3 space-y-0">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <WifiOff class="size-5" aria-hidden="true" />
        </span>
        <Card.Title>Works offline</Card.Title>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        <p>
          Practice OS is a Progressive Web App. Install it from your browser and it runs offline —
          drills, audio, and the metronome all work without a connection. Your profile, journal, and
          progress live in your browser’s local storage, so nothing is uploaded and your history is
          waiting next time you open it.
        </p>
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
