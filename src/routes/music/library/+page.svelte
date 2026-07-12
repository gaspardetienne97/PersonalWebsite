<script lang="ts">
  import { page } from "$app/stores";

  import { JAZZ_CHORD_TYPES, scalesForFamily } from "@repo/music-core/engines/jazz";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import ImportView from "./_components/ImportView.svelte";
  import SongsView from "./_components/SongsView.svelte";
  import TheoryReference from "./_components/TheoryReference.svelte";
  import TranscribeView from "./_components/TranscribeView.svelte";

  type LibraryTab = "songs" | "reference" | "import";
  type ImportTab = "score" | "transcribe";

  const tabs = [
    { value: "songs", label: "Songs" },
    { value: "reference", label: "Reference" },
    { value: "import", label: "Import" },
  ];
  const importTabs = [
    { value: "score", label: "Score import" },
    { value: "transcribe", label: "Transcribe audio" },
  ];

  let tab = $state<LibraryTab>("songs");
  let importTab = $state<ImportTab>("score");

  $effect(() => {
    const params = $page.url?.searchParams;
    const next = normalizeTab(params?.get("tab") ?? null);
    tab = next;
    if (params?.get("mode") === "transcribe") importTab = "transcribe";
  });

  function normalizeTab(value: string | null): LibraryTab {
    return value === "reference" || value === "import" ? value : "songs";
  }
</script>

<svelte:head>
  <title>Library | Practice OS</title>
  <meta
    name="description"
    content="Your repertoire, reference, imports, and transcription workflows in one Music library."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Library"
    subtitle="Saved songs, chord and scale reference, score import, and transcription in one place."
  >
    {#snippet controls()}
      <SegmentedControl
        options={tabs}
        value={tab}
        onChange={(value) => (tab = value as LibraryTab)}
        ariaLabel="Library section"
      />
    {/snippet}
  </PracticeScreenHeader>

  {#if tab === "songs"}
    <SongsView />
  {:else if tab === "reference"}
    <section class="space-y-6" aria-label="Unified reference">
      <TheoryReference />

      <Card.Root>
        <Card.Header class="flex-row items-start justify-between gap-3 space-y-0">
          <div class="space-y-1.5">
            <Card.Description>Jazz reference</Card.Description>
            <Card.Title>Jazz chord-scale matches</Card.Title>
          </div>
          <Button href="/music/learn/jazz" size="sm" variant="outline">Full Jazz Piano Guide →</Button>
        </Card.Header>
        <Card.Content class="grid gap-2 md:grid-cols-2">
          {#each JAZZ_CHORD_TYPES as chord (chord.id)}
            <div class="space-y-2 rounded-md border p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{chord.symbol}</span>
                <span class="text-sm text-muted-foreground">{chord.name}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                {#each scalesForFamily(chord.family) as scale (scale.label)}
                  <Badge variant={scale.recommended ? "default" : "outline"}>
                    {scale.label}
                  </Badge>
                {/each}
              </div>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    </section>
  {:else}
    <section class="space-y-5" aria-label="Import and transcribe">
      <div class="flex justify-end">
        <SegmentedControl
          options={importTabs}
          value={importTab}
          onChange={(value) => (importTab = value as ImportTab)}
          ariaLabel="Import mode"
        />
      </div>

      {#if importTab === "score"}
        <ImportView />
      {:else}
        <TranscribeView />
      {/if}
    </section>
  {/if}
</PracticeScreen>
