<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import { syncRouteQuery } from "../_components/route-state";
  import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";
  import PianoRollPanel from "./_components/PianoRollPanel.svelte";
  import StudioPanel from "./_components/StudioPanel.svelte";

  type CreateMode = "beat" | "piano-roll";

  const modes = [
    { value: "beat", label: "Beat grid" },
    { value: "piano-roll", label: "Piano roll" },
  ];

  let {
    runtime = useMusicRuntime(),
    navigate = goto,
  }: {
    runtime?: MusicRuntime;
    navigate?: (href: string, options?: { replaceState?: boolean }) => unknown;
  } = $props();
  let mode = $state<CreateMode>("beat");

  $effect(() => {
    // Shallow updates retain page.url; the address bar owns the current mode.
    const pageUrl = $page.url;
    const search = typeof window === "undefined" ? pageUrl?.search ?? "" : window.location.search;
    const params = new URLSearchParams(search);
    const requested = params.get("mode");
    // The recorder is its own destination now; the old mode still routes there,
    // carrying every other param (a bookmarked ?mode=recorder&bpm=132 keeps its
    // tempo) and dropping only the mode that no longer exists here.
    if (requested === "recorder") {
      params.delete("mode");
      const query = params.toString();
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      void navigate(`/music/record${query ? `?${query}` : ""}${hash}`, { replaceState: true });
      return;
    }
    mode = normalizeMode(requested);
  });

  function normalizeMode(value: string | null): CreateMode {
    return value === "piano-roll" ? value : "beat";
  }

  function selectMode(value: string): void {
    mode = normalizeMode(value);
    syncModeUrl(mode);
  }

  function syncModeUrl(nextMode: CreateMode): void {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("mode", nextMode);
    const href = `${url.pathname}${url.search}${url.hash}`;
    syncRouteQuery(href);
  }
</script>

<svelte:head>
  <title>Create | Practice OS</title>
  <meta
    name="description"
    content="Make music with one Create workspace: beat grid and piano roll."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Create"
    subtitle="Make music — sketch a beat and sequence a part in one workspace."
  >
    {#snippet controls()}
      <SegmentedControl
        options={modes}
        value={mode}
        onChange={selectMode}
        ariaLabel="Create mode"
      />
    {/snippet}
  </PracticeScreenHeader>

  {#if mode === "piano-roll"}
    <PianoRollPanel {runtime} />
  {:else}
    <StudioPanel {runtime} />
  {/if}
</PracticeScreen>
