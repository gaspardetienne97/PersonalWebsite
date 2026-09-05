<script lang="ts">
  import { page } from "$app/stores";

  import { JAZZ_CHORD_TYPES, scalesForFamily } from "@repo/music-core/engines/jazz";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { readRouteTab, writeRouteTab } from "../_components/route-state";
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

  const LIBRARY_TABS: LibraryTab[] = ["songs", "reference", "import"];
  const IMPORT_TABS: ImportTab[] = ["score", "transcribe"];

  const initialSearch = typeof window === "undefined" ? "" : window.location.search;
  let tab = $state<LibraryTab>(readRouteTab(initialSearch, "tab", LIBRARY_TABS, "songs"));
  let importTab = $state<ImportTab>(readRouteTab(initialSearch, "mode", IMPORT_TABS, "score"));

  // The tab lives in the URL (?tab=, ?mode= for the import sub-mode) so a
  // bookmark or a back gesture lands on the same view.
  $effect(() => {
    const params = $page.url?.searchParams;
    if (!params) return;
    tab = readRouteTab(params, "tab", LIBRARY_TABS, "songs");
    importTab = readRouteTab(params, "mode", IMPORT_TABS, "score");
  });

  function selectTab(value: string): void {
    tab = readRouteTab(new URLSearchParams({ tab: value }), "tab", LIBRARY_TABS, "songs");
    writeRouteTab("tab", tab, tab === "import" ? {} : { drop: ["mode"] });
  }

  function selectImportTab(value: string): void {
    importTab = readRouteTab(new URLSearchParams({ mode: value }), "mode", IMPORT_TABS, "score");
    writeRouteTab("mode", importTab);
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
        onChange={selectTab}
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
          onChange={selectImportTab}
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
