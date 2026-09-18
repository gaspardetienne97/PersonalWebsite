<script lang="ts">
  import { browser } from "$app/environment";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import BookOpen from "lucide-svelte/icons/book-open";
  import Disc3 from "lucide-svelte/icons/disc-3";
  import Ear from "lucide-svelte/icons/ear";
  import Gauge from "lucide-svelte/icons/gauge";
  import Plug from "lucide-svelte/icons/plug";
  import Settings2 from "lucide-svelte/icons/settings-2";
  import Waves from "lucide-svelte/icons/waves";
  import { onMount } from "svelte";

  import * as Card from "@repo/ui/card";

  import type { Hue } from "../_components/musicCatalog";
  import MusicToolCard from "../_components/MusicToolCard.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SectionHeading from "../_components/SectionHeading.svelte";
  import SetupChecklist, { type SetupItem } from "../_components/SetupChecklist.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const sessions = new PracticeSessionStore(store);

  let audioEnabled = $state(runtime.sound.enabled);
  let midi = $state(runtime.midi.state);
  let sessionCount = $state<number | undefined>(undefined);

  onMount(() => {
    const unsubscribe = runtime.midi.subscribeState((state) => (midi = state));
    void sessions.load().then(() => (sessionCount = sessions.all().length));
    return unsubscribe;
  });

  async function enableAudio(): Promise<void> {
    audioEnabled = await runtime.ensurePlaybackVoice();
    if (audioEnabled) runtime.sound.playNote(60, 0.3, undefined, 0.6);
  }

  const devices = $derived(midi.inputs?.length ?? 0);
  const setupItems = $derived<SetupItem[]>([
    {
      id: "audio",
      title: "Enable audio",
      detail: audioEnabled
        ? "Enabled · prompts and the metronome can play"
        : "Browsers only allow sound after a tap. Once per visit.",
      state: audioEnabled ? "ok" : "warn",
      action: { label: audioEnabled ? "Test sound" : "Enable audio", onclick: () => void enableAudio() },
    },
    {
      id: "instrument",
      title: "Connect an instrument, or play on-screen",
      detail:
        devices > 0
          ? `${devices} MIDI device${devices === 1 ? "" : "s"} connected`
          : "No hardware? Every drill has an on-screen keyboard, fretboard or pad grid.",
      state: devices > 0 ? "ok" : "off",
      action: { label: "Open Connect", href: "/music/connect" },
    },
    {
      id: "first-drill",
      title: "Run your first drill",
      detail:
        sessionCount === undefined
          ? "Reading your journal…"
          : sessionCount > 0
            ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} in your journal`
            : "Finishing one session awards XP, starts your streak and writes a journal entry.",
      state: sessionCount ? "ok" : "off",
      action: { label: "Open Practice", href: "/music" },
    },
  ]);

  const hubs: Array<{ title: string; href: string; hue: Hue; icon: typeof Ear; description: string }> = [
    { title: "Practice", href: "/music", hue: "ear", icon: Ear, description: "Drills and learning paths. Each run feeds your skill map." },
    { title: "Library", href: "/music/library", hue: "reading", icon: BookOpen, description: "Your songs, the chord and scale reference, and import." },
    { title: "Create", href: "/music/create", hue: "mpc", icon: Disc3, description: "Beat grid and piano roll. Recording is its own destination under Create." },
    { title: "Progress", href: "/music/progress", hue: "technique", icon: Gauge, description: "Today's XP, streak, mastery and what to practise next." },
    { title: "Connect", href: "/music/connect", hue: "piano", icon: Plug, description: "Devices, routing per instrument and the on-screen surfaces." },
    { title: "Tuner", href: "/music/tuner", hue: "voice", icon: Waves, description: "Tune, check intonation over time, or hold a drone." },
    { title: "Settings", href: "/music/settings", hue: "harmony", icon: Settings2, description: "Sound, input, latency, appearance and your data." },
  ];
</script>

<svelte:head>
  <title>How to use the Music app | Practice OS</title>
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="How to use Practice OS"
    subtitle="Plug in or play on-screen, run a drill, and watch your journal and skill map fill in."
  />

  <div class="grid grid-cols-[minmax(0,1fr)] gap-8">
    <section class="grid gap-3" aria-labelledby="guide-setup">
      <SectionHeading id="guide-setup" title="Get set up" eyebrow="Three steps" description="This list reads what is already done on this device." />
      <SetupChecklist items={setupItems} label="Get set up" />
    </section>

    <section aria-labelledby="guide-loop">
      <Card.Root class="min-w-0">
        <Card.Header>
          <SectionHeading id="guide-loop" title="The practice loop" eyebrow="How it works" description="How a session turns into progress." />
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground">
          <p>
            Every drill scores the notes you play through one input router, so MIDI, microphone and
            on-screen input count the same. Finishing a session awards
            <strong class="text-foreground">XP</strong>, nudges the
            <strong class="text-foreground">mastery</strong> of the skills it exercised and records
            what you confused for what. <a href="/music/progress" class="font-semibold text-primary hover:underline">Progress</a>
            then says what to practise next, and the
            <a href="/music/track" class="font-semibold text-primary hover:underline">Journal</a>
            keeps the history. Everything stays on your device.
          </p>
        </Card.Content>
      </Card.Root>
    </section>

    <section class="grid gap-3" aria-labelledby="guide-hubs">
      <SectionHeading id="guide-hubs" title="Around the app" eyebrow="Seven hubs" />
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="guide-hubs">
        {#each hubs as hub (hub.href)}
          <MusicToolCard
            href={hub.href}
            title={hub.title}
            description={hub.description}
            eyebrow="Hub"
            action={`Open ${hub.title}`}
            icon={hub.icon}
            hue={hub.hue}
          />
        {/each}
      </div>
    </section>

    <p class="text-xs text-muted-foreground">
      Practice OS is a Progressive Web App: install it from your browser and drills, audio and the
      metronome work offline. Your journal and progress live in this browser and are never uploaded.
    </p>
  </div>
</PracticeScreen>
