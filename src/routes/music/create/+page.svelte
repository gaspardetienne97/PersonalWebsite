<script lang="ts">
  import { page } from "$app/stores";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";
  import PianoRollPanel from "./_components/PianoRollPanel.svelte";
  import RecorderPanel from "./_components/RecorderPanel.svelte";
  import StudioPanel from "./_components/StudioPanel.svelte";

  type CreateMode = "beat" | "piano-roll" | "recorder";

  const modes = [
    { value: "beat", label: "Beat grid" },
    { value: "piano-roll", label: "Piano roll" },
    { value: "recorder", label: "Recorder" },
  ];

  let { runtime = useMusicRuntime() }: { runtime?: MusicRuntime } = $props();
  let mode = $state<CreateMode>("beat");

  $effect(() => {
    mode = normalizeMode($page.url?.searchParams.get("mode") ?? null);
  });

  function normalizeMode(value: string | null): CreateMode {
    return value === "piano-roll" || value === "recorder" ? value : "beat";
  }
</script>

<svelte:head>
  <title>Create | Musicianship OS</title>
  <meta
    name="description"
    content="Make music with one Create workspace: beat grid, piano roll, and recorder."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Create"
    subtitle="Make music — sketch a beat, sequence a part, and capture takes in one workspace."
  >
    {#snippet controls()}
      <SegmentedControl
        options={modes}
        value={mode}
        onChange={(value) => (mode = value as CreateMode)}
        ariaLabel="Create mode"
      />
    {/snippet}
  </PracticeScreenHeader>

  {#if mode === "beat"}
    <StudioPanel {runtime} />
  {:else if mode === "piano-roll"}
    <PianoRollPanel {runtime} />
  {:else}
    <RecorderPanel {runtime} />
  {/if}
</PracticeScreen>
