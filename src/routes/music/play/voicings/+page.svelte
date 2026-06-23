<script lang="ts">
  import { browser } from "$app/environment";
  import Check from "lucide-svelte/icons/check";
  import { onDestroy } from "svelte";

  import {
    INSTRUMENT_LABELS,
    isMonophonic,
    VIEWABLE_INSTRUMENTS,
    type InstrumentId,
    type NoteEvent,
  } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import type { DrillVariant, RootlessPosition } from "@repo/music-core/engines/jazz";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    VoicingDrillSession,
    type VoicingDrillState,
  } from "@repo/music-core/engines/voicing-drill-session";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import InstrumentView from "../../_components/InstrumentView.svelte";
  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import RoutineContinueAction from "../../_components/RoutineContinueAction.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  const { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const variantLabels: Record<DrillVariant, string> = {
    major: "Rootless ii-V-I",
    minor: "Minor ii-V-i",
    altered: "Altered V7",
  };

  let instrument = $state<InstrumentId>("piano");
  let variant = $state<DrillVariant>("major");
  let startPosition = $state<RootlessPosition>("A");
  // Grading: lenient (any note played, beginner/on-screen) vs held-together
  // (true chord detection, best with a MIDI instrument). Auto-advance moves on as
  // soon as the target is matched, so no manual "Check" is needed.
  let strict = $state(false);
  let autoAdvance = $state(true);

  let ready = $state(false);
  let session = $state<VoicingDrillSession | undefined>();
  let drillState = $state<VoicingDrillState | undefined>();
  let status = $state("Loading your harmony progress…");
  let pending = $state(false);
  let liveTick = $state(0);
  let captured = false;
  let unsubscribeSession: (() => void) | undefined;

  const live = $derived.by(() => {
    void liveTick;
    return Math.round((session?.liveProgress ?? 0) * 100);
  });
  const mono = $derived(isMonophonic(instrument));
  const variantLabel = $derived(variantLabels[variant]);

  void initialize();

  $effect(() => {
    if (session) return;
    instrument = VIEWABLE_INSTRUMENTS.includes(runtime.activeInstrument)
      ? runtime.activeInstrument
      : "piano";
  });

  // Recompute live progress as input arrives during an active chord, and
  // auto-advance the moment the target voicing is matched. The check is deferred
  // to a microtask so the exercise host (a later router subscriber) has already
  // fed it this event before we read `liveProgress`.
  $effect(() => {
    const unsubscribe = runtime.router.subscribe((event) => {
      if (drillState?.status !== "active") return;
      if (event.type === "noteOn") liveTick += 1;
      if (!autoAdvance) return;
      queueMicrotask(() => {
        if (!pending && drillState?.status === "active" && (session?.liveProgress ?? 0) >= 1) {
          void check();
        }
      });
    });
    return () => unsubscribe();
  });

  async function initialize(): Promise<void> {
    await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
    ready = true;
    status = "Pick an instrument and start the ii-V-I drill.";
  }

  function startDrill(): void {
    if (!ready || pending) return;
    unsubscribeSession?.();
    session?.dispose();
    captured = false;
    session = new VoicingDrillSession({
      router: runtime.router,
      services: { skills, analytics, progress },
      instrument,
      variant,
      startPosition,
      strict,
    });
    unsubscribeSession = session.subscribe((next) => {
      drillState = next;
      if (next.status === "summary" && !captured) {
        captured = true;
        void runtime.recordPractice({
          source: "drill",
          instrument,
          tags: ["jazz", "voicings", "ii-v-i"],
          scoringEvents: next.results.map((result) => result.event),
          xpEarned: next.xp,
          note: `${variantLabel} · ${Math.round(next.accuracy * 100)}% across ${next.total} chords`,
        });
      }
    });
    session.start();
    status = autoAdvance
      ? "Play the voicing — it advances on its own."
      : "Play the voicing, then press Check.";
  }

  async function check(): Promise<void> {
    if (!session || drillState?.status !== "active" || pending) return;
    pending = true;
    try {
      if (!(await runtime.enableAudio())) {
        // Audio is optional; grading still works without it.
      }
      const step = await session.submit();
      status = step.correct
        ? `${step.target.symbol} ✓ +${step.xp} XP`
        : `${step.target.symbol}: ${Math.round(step.score * 100)}% — keep going.`;
    } finally {
      pending = false;
    }
  }

  function playInput(event: NoteEvent): void {
    if (event.type === "noteOn" && runtime.audioEnabled) {
      runtime.sound.playNote(event.midiNote, 0.2, undefined, event.velocity);
    }
  }

  onDestroy(() => {
    unsubscribeSession?.();
    session?.dispose();
  });
</script>

<svelte:head>
  <title>ii-V-I Voicing Drill | Musicianship OS</title>
  <meta
    name="description"
    content="Play rootless, minor, and altered dominant jazz voicings through all 12 keys, graded on any instrument."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="ii-V-I Voicing Drill"
    subtitle="Play rootless, minor, and altered dominant voicings through all 12 keys. Graded on your instrument — XP feeds the ii-V-I skill."
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
            <Card.Description>Drill</Card.Description>
            <Card.Title>
              {variantLabel} · all 12 keys
            </Card.Title>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              ariaLabel="Instrument"
              options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
              value={instrument}
              onChange={(v) => (instrument = v as InstrumentId)}
            />
            <SegmentedControl
              size="sm"
              ariaLabel="Drill variant"
              options={[
                { value: "major", label: "Major" },
                { value: "minor", label: "Minor" },
                { value: "altered", label: "Altered V7" },
              ]}
              value={variant}
              onChange={(v) => (variant = v as DrillVariant)}
            />
            {#if variant === "major"}
              <SegmentedControl
                size="sm"
                ariaLabel="Start position"
                options={[
                  { value: "A", label: "A-B-A" },
                  { value: "B", label: "B-A-B" },
                ]}
                value={startPosition}
                onChange={(v) => (startPosition = v as RootlessPosition)}
              />
            {/if}
            {#if !mono}
              <SegmentedControl
                size="sm"
                ariaLabel="Grading"
                options={[
                  { value: "lenient", label: "Lenient" },
                  { value: "held", label: "Held" },
                ]}
                value={strict ? "held" : "lenient"}
                onChange={(v) => (strict = v === "held")}
              />
            {/if}
            <SegmentedControl
              size="sm"
              ariaLabel="Advance"
              options={[
                { value: "auto", label: "Auto" },
                { value: "manual", label: "Manual" },
              ]}
              value={autoAdvance ? "auto" : "manual"}
              onChange={(v) => (autoAdvance = v === "auto")}
            />
          </div>
        </Card.Header>

        <Card.Content class="space-y-5">
          {#if drillState && drillState.status !== "idle"}
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold">{drillState.current?.symbol ?? "Done"}</span>
                {#if drillState.current}
                  <Badge variant="secondary">{mono ? "arpeggio" : "chord"}</Badge>
                {/if}
              </div>
              <span class="text-sm text-muted-foreground tabular-nums">
                {drillState.index + (drillState.status === "summary" ? 0 : 1)} / {drillState.total}
              </span>
            </div>

            {#if drillState.current?.displayMidi}
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Target voicing
                </p>
                <InstrumentView
                  midi={drillState.current.displayMidi}
                  {instrument}
                  router={runtime.router}
                />
              </div>
            {/if}

            {#if drillState.status === "active"}
              <div class="space-y-1.5">
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>Notes matched</span><span>{live}%</span>
                </div>
                <Progress value={live} max={100} />
              </div>
            {/if}
          {/if}

          {#if drillState?.status === "summary"}
            <div class="rounded-md border border-primary/30 bg-primary/5 p-4">
              <p class="font-semibold">Drill complete</p>
              <p class="text-sm text-muted-foreground">
                {Math.round(drillState.accuracy * 100)}% accuracy · +{drillState.xp} XP across {drillState.total} chords.
              </p>
            </div>
            <RoutineContinueAction routine={runtime.dailyRoutine} />
          {/if}

          {#if mono}
            <p class="text-xs text-muted-foreground">
              The Aerophone is monophonic — play the voicing as an ascending arpeggio.
            </p>
          {/if}

          <!-- On-screen input fallback; MIDI input is graded the same way. -->
          <OnScreenKeyboard router={runtime.router} onAccepted={playInput} />
        </Card.Content>

        <Card.Footer class="flex-wrap gap-3">
          {#if !drillState || drillState.status === "idle" || drillState.status === "summary"}
            <Button type="button" disabled={!ready || pending} onclick={startDrill}>
              {drillState?.status === "summary" ? "Restart drill" : "Start drill"}
            </Button>
          {:else if autoAdvance}
            <Button type="button" variant="outline" disabled={pending} onclick={check}>
              Skip chord
            </Button>
          {:else}
            <Button type="button" disabled={pending} onclick={check}>
              <Check aria-hidden="true" />
              Check chord
            </Button>
          {/if}
          <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </Card.Footer>
      </Card.Root>
    </div>

    <aside class="grid content-start gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Progress</Card.Description>
          <Card.Title>{drillState ? `${drillState.results.length} / ${drillState.total}` : `0 / 36`}</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Accuracy</span>
            <span class="font-medium tabular-nums">{Math.round((drillState?.accuracy ?? 0) * 100)}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">XP earned</span>
            <span class="font-medium tabular-nums">{drillState?.xp ?? 0}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Skill</span>
            <span class="font-medium">ii-V-I (Harmony)</span>
          </div>
        </Card.Content>
      </Card.Root>
    </aside>
  </section>
</PracticeScreen>
