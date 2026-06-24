<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";

  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import ListMusic from "lucide-svelte/icons/list-music";
  import Play from "lucide-svelte/icons/play";

  import { notationView, type NotationView } from "@repo/music-core/engines/notation";
  import {
    createScoreFollower,
    expectedGroups,
    type ScoreFollowerLiveState,
    type ScoreFollowerRun,
  } from "@repo/music-core/engines/score-follower";
  import { scorePlaybackPattern, SongLibrary } from "@repo/music-core/engines/song-library";
  import { PracticeStore, type SongRow } from "@repo/music-core/engines/store";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import OnScreenKeyboard from "../../_components/OnScreenKeyboard.svelte";
  import MusicXmlScore from "../../_components/MusicXmlScore.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentProgress from "../../_components/SegmentProgress.svelte";
  import StaffNotation from "../../_components/StaffNotation.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../../_runtime.svelte";

  interface SongLibraryLike {
    get(id: string): Promise<SongRow | undefined>;
  }

  const {
    songId = page.params.id,
    runtime = useMusicRuntime(),
    library = browser ? new SongLibrary(new PracticeStore()) : undefined,
  }: {
    songId?: string;
    runtime?: MusicRuntime;
    library?: SongLibraryLike;
  } = $props();

  let song = $state.raw<SongRow>();
  let loading = $state(true);
  let status = $state("Loading score.");
  let practicing = $state(false);
  let completed = $state(false);
  let finishing = false;
  let follower: ScoreFollowerRun | undefined;
  let unsubscribeInput = () => undefined;
  let live = $state.raw<ScoreFollowerLiveState>();

  const score = $derived(song?.score);
  const groups = $derived(score ? expectedGroups(score) : []);
  const notation = $derived.by(() => notationProjection(score));
  const progressPercent = $derived(Math.round((live?.progress ?? 0) * 100));
  const expectedNames = $derived((live?.expectedMidiNotes ?? []).map((note) => midiToNote(note)));
  const keyboardNotes = $derived(
    score
      ? [...new Set(score.notes.map(({ midiNote }) => midiToNote(midiNote)))].slice(0, 16)
      : [],
  );

  onMount(() => {
    unsubscribeInput = runtime.router.subscribe((event) => {
      if (!practicing || !follower) return;
      follower.accept(event);
      live = follower.getLiveState();
      if (live.progress >= 1) void finishFollowAlong();
    });
    void loadSong();
  });

  $effect(() => {
    if (!song || !score) {
      runtime.setPlaybackSource(undefined);
      return;
    }
    const pattern = scorePlaybackPattern(score);
    runtime.setPlaybackSource({
      label: song.title,
      durationSec: pattern.reduce(
        (end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds),
        0,
      ),
      play: () => runtime.sound.playPattern(pattern),
    });
  });

  onDestroy(() => {
    unsubscribeInput();
    runtime.setPlaybackSource(undefined);
  });

  async function loadSong(): Promise<void> {
    if (!library || !songId) {
      loading = false;
      status = "Song storage is unavailable.";
      return;
    }
    try {
      song = await library.get(songId);
      status = song?.score ? "Score ready." : "This saved song has no score data.";
    } catch (error) {
      status = message(error, "Could not load the score.");
    } finally {
      loading = false;
    }
  }

  async function playPreview(): Promise<void> {
    if (!score || !(await runtime.enableAudio())) return;
    runtime.sound.playPattern(scorePlaybackPattern(score));
  }

  function startFollowAlong(): void {
    if (!score || groups.length === 0) return;
    follower = createScoreFollower(groups, {
      mode: "wait",
      bpm: score.tempoMap[0]?.bpm ?? 120,
      strictness: "normal",
    });
    live = follower.getLiveState();
    completed = false;
    practicing = true;
    status = "Follow the highlighted score. Timing is paused until you play the right notes.";
  }

  async function finishFollowAlong(): Promise<void> {
    if (!song || !follower || finishing) return;
    finishing = true;
    practicing = false;
    const result = follower.finish();
    completed = true;
    status = `Score complete · ${Math.round(result.score * 100)}% pitch progress.`;
    try {
      await runtime.recordPractice({
        source: "song",
        tags: ["song", song.id, "score-following"],
        xpEarned: Math.max(5, Math.round(result.score * 20)),
        note: `Score follow-along · ${song.title}`,
      });
    } catch (error) {
      status = message(error, "Score complete, but practice logging failed.");
    } finally {
      finishing = false;
    }
  }

  function notationProjection(
    value: SongRow["score"],
  ): { view?: NotationView; error?: string } {
    if (!value) return {};
    try {
      return { view: notationView(value) };
    } catch (error) {
      return {
        error: message(error, "This score cannot be rendered with the current notation engine."),
      };
    }
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
</script>

<svelte:head>
  <title>{song?.title ?? "Song Studio"} | Musicianship OS</title>
  <meta
    name="description"
    content="Preview a saved score and practice it with engine-backed follow-along."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title={song?.title ?? "Song Studio"}
    subtitle="Read, preview, and follow the canonical score with MIDI or on-screen input."
  >
    {#snippet controls()}
      <Button href="/music/songs" variant="outline" size="sm">
        <ArrowLeft class="size-4" aria-hidden="true" />
        Song Library
      </Button>
    {/snippet}
  </PracticeScreenHeader>

  {#if loading}
    <Card.Root>
      <Card.Content class="py-10 text-center text-sm text-muted-foreground">
        Loading score.
      </Card.Content>
    </Card.Root>
  {:else if !song || !score}
    <Card.Root>
      <Card.Content class="grid justify-items-center gap-3 py-10 text-center">
        <ListMusic class="size-8 text-muted-foreground" aria-hidden="true" />
        <p class="font-semibold">Score unavailable</p>
        <p class="text-sm text-muted-foreground">{status}</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <section class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="min-w-0 space-y-4">
        <Card.Root>
          <Card.Header class="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Card.Description>Canonical score</Card.Description>
              <Card.Title>{song.title}</Card.Title>
            </div>
            <Badge variant="secondary">{score.origin.toUpperCase()}</Badge>
          </Card.Header>
          <Card.Content class="grid gap-4">
            {#if song.source?.format === "musicxml"}
              <MusicXmlScore
                xml={song.source.content}
                onError={(message) => (status = message)}
              />
            {:else if notation.view}
              <StaffNotation view={notation.view} />
            {:else}
              <div class="rounded-md border p-4 text-sm text-muted-foreground">
                Staff preview unavailable: {notation.error}
              </div>
            {/if}
          </Card.Content>
          <Card.Footer class="flex-wrap gap-2">
            <Button type="button" onclick={playPreview}>
              <Play class="size-4" aria-hidden="true" />
              Play preview
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={practicing || groups.length === 0}
              onclick={startFollowAlong}
            >
              Start follow-along
            </Button>
          </Card.Footer>
        </Card.Root>

        {#if practicing || completed}
          <Card.Root>
            <Card.Header>
              <Card.Description>Wait mode</Card.Description>
              <Card.Title>{completed ? "Score complete" : `Play ${expectedNames.join(" + ")}`}</Card.Title>
            </Card.Header>
            <Card.Content class="grid gap-5">
              <SegmentProgress
                total={groups.length}
                current={live?.currentGroupIndex ?? 0}
                label="Score"
              />
              <Progress value={progressPercent} max={100} />
              {#if practicing}
                <OnScreenKeyboard router={runtime.router} notes={keyboardNotes} />
              {/if}
            </Card.Content>
          </Card.Root>
        {/if}
      </div>

      <aside class="grid content-start gap-4">
        <Card.Root>
          <Card.Header>
            <Card.Description>Score details</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3 text-sm">
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Key</span>
              <strong>{score.keySignature ?? "Unknown"}</strong>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Tempo</span>
              <strong>{Math.round(score.tempoMap[0]?.bpm ?? 120)} bpm</strong>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Voices</span>
              <strong>{score.voices.length}</strong>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">Note groups</span>
              <strong>{groups.length}</strong>
            </div>
          </Card.Content>
        </Card.Root>
        <p class="text-sm text-muted-foreground" role="status">{status}</p>
      </aside>
    </section>
  {/if}
</PracticeScreen>
