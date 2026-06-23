<script lang="ts">
  import { browser } from "$app/environment";
  import Bookmark from "lucide-svelte/icons/bookmark";
  import BookmarkCheck from "lucide-svelte/icons/bookmark-check";
  import Play from "lucide-svelte/icons/play";
  import Search from "lucide-svelte/icons/search";

  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";
  import {
    chordVoicings,
    TheoryLibrary,
    type TheoryItemKind,
    type TheoryLibraryItem,
  } from "@repo/music-core/engines/library";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { cn } from "@repo/ui/utils";

  import InstrumentView from "../../_components/InstrumentView.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const library = new TheoryLibrary(browser ? new PracticeStore() : undefined);

  // Instruments the chord/scale views support, defaulting to the active one.
  let viewInstrument = $state<InstrumentId>(
    VIEWABLE_INSTRUMENTS.includes(runtime.activeInstrument) ? runtime.activeInstrument : "piano",
  );

  let query = $state("");
  let kind = $state<TheoryItemKind>("chord");
  let selectedId = $state("c-maj7");
  let voicingId = $state("root");
  let savedIds = $state<ReadonlySet<string>>(new Set());
  let status = $state("");
  let pending = $state(false);

  const results = $derived(library.search(query, kind));
  const selected = $derived.by(() => {
    const current = library.get(selectedId);
    if (current?.kind === kind && results.some((item) => item.id === current.id)) return current;
    return results[0];
  });

  // Chords expose root position + inversions + drop-2; scales are a single set.
  const voicings = $derived(selected?.kind === "chord" ? chordVoicings(selected.pianoMidi) : []);
  const activeVoicing = $derived(
    voicings.find((voicing) => voicing.id === voicingId) ?? voicings[0],
  );
  const viewMidi = $derived(
    selected ? (activeVoicing?.midi ?? selected.pianoMidi) : [],
  );

  void library.load().then(() => {
    savedIds = new Set(library.savedIds);
  });

  function selectKind(nextKind: TheoryItemKind): void {
    kind = nextKind;
    voicingId = "root";
    status = "";
  }

  function selectItem(item: TheoryLibraryItem): void {
    selectedId = item.id;
    voicingId = "root";
    status = "";
  }

  async function playSelected(): Promise<void> {
    if (!selected || !(await runtime.enableAudio())) return;
    runtime.sound.playChord(viewMidi.length > 0 ? viewMidi : selected.pianoMidi, 0.8);
    status = `Playing ${selected.symbol}${activeVoicing && selected.kind === "chord" ? ` — ${activeVoicing.label}` : ""}.`;
  }

  async function toggleSaved(): Promise<void> {
    if (!selected || selected.kind !== "chord" || pending) return;
    pending = true;

    try {
      if (savedIds.has(selected.id)) {
        await library.remove(selected.id);
        status = `Removed ${selected.symbol} from saved chords.`;
      } else {
        await library.save(selected.id);
        status = `Saved chord ${selected.symbol}.`;
      }
      savedIds = new Set(library.savedIds);
    } catch (error) {
      status = error instanceof Error ? error.message : "The chord could not be saved.";
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head>
  <title>Theory Library | Musicianship OS</title>
  <meta
    name="description"
    content="Explore, hear, and save chord and scale theory across piano, guitar, and ukulele."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Chord & Theory Library"
    subtitle="Every chord and scale, voiced for every instrument."
  />

  <section class="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <aside class="min-w-0 space-y-4" aria-label="Theory catalog">
      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder={`Search ${kind}s`}
          aria-label={`Search ${kind}s`}
          class="pl-9"
          bind:value={query}
        />
      </div>

      <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Theory item type">
        <Button
          type="button"
          size="sm"
          variant={kind === "chord" ? "secondary" : "ghost"}
          aria-pressed={kind === "chord"}
          onclick={() => selectKind("chord")}
        >
          Chords
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === "scale" ? "secondary" : "ghost"}
          aria-pressed={kind === "scale"}
          onclick={() => selectKind("scale")}
        >
          Scales
        </Button>
      </div>

      <div class="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span>{results.length} {kind}{results.length === 1 ? "" : "s"}</span>
        <span>{savedIds.size} saved</span>
      </div>

      <div class="grid max-h-[32rem] gap-2 overflow-y-auto pr-1">
        {#each results as item (item.id)}
          <button
            type="button"
            class={cn(
              "grid w-full gap-1 rounded-md border px-3 py-3 text-left transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              selected?.id === item.id && "border-primary bg-accent",
            )}
            aria-pressed={selected?.id === item.id}
            onclick={() => selectItem(item)}
          >
            <span class="font-semibold">{item.symbol}</span>
            <span class="truncate text-sm text-muted-foreground">{item.name}</span>
          </button>
        {:else}
          <div class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No {kind}s match "{query}".
          </div>
        {/each}
      </div>
    </aside>

    {#if selected}
      <article class="min-w-0 space-y-6">
        <Card.Root>
          <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
            <div class="space-y-2">
              <Card.Description>{selected.kind === "chord" ? "Chord" : "Scale"}</Card.Description>
              <Card.Title class="text-3xl">{selected.name}</Card.Title>
              <p class="text-sm text-muted-foreground">
                {selected.kind === "chord"
                  ? "Chord tones arranged from the root."
                  : `${selected.name.replace(/^[A-G][#b]? /, "")} mode`}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              {#if selected.kind === "chord"}
                <Button
                  type="button"
                  variant={savedIds.has(selected.id) ? "secondary" : "outline"}
                  disabled={pending}
                  onclick={toggleSaved}
                >
                  {#if savedIds.has(selected.id)}
                    <BookmarkCheck aria-hidden="true" />
                    Saved chord
                  {:else}
                    <Bookmark aria-hidden="true" />
                    Save chord
                  {/if}
                </Button>
              {/if}
              <Button type="button" onclick={playSelected}>
                <Play aria-hidden="true" />
                Play {selected.symbol}
              </Button>
            </div>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <h2 class="text-sm font-semibold">Notes</h2>
                <div class="flex flex-wrap gap-2">
                  {#each selected.notes as note}
                    <Badge variant="secondary">{note}</Badge>
                  {/each}
                </div>
              </div>
              <div class="space-y-2">
                <h2 class="text-sm font-semibold">Intervals</h2>
                <div class="flex flex-wrap gap-2">
                  {#each selected.intervals as interval}
                    <Badge variant="outline">{interval}</Badge>
                  {/each}
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  {selected.kind === "chord" ? "Voicing" : "Scale"} on {INSTRUMENT_LABELS[
                    viewInstrument
                  ]}
                </h2>
                <SegmentedControl
                  size="sm"
                  ariaLabel="Instrument"
                  options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
                  value={viewInstrument}
                  onChange={(v) => (viewInstrument = v as InstrumentId)}
                />
              </div>

              {#if selected.kind === "chord" && voicings.length > 1}
                <div class="flex flex-wrap gap-1.5" role="group" aria-label="Voicing / inversion">
                  {#each voicings as voicing (voicing.id)}
                    <Button
                      type="button"
                      size="sm"
                      variant={activeVoicing?.id === voicing.id ? "secondary" : "ghost"}
                      aria-pressed={activeVoicing?.id === voicing.id}
                      onclick={() => (voicingId = voicing.id)}
                    >
                      {voicing.label}
                    </Button>
                  {/each}
                </div>
              {/if}

              <InstrumentView midi={viewMidi} instrument={viewInstrument} router={runtime.router} />

              {#if viewInstrument === "aerophone" && selected.kind === "chord"}
                <p class="text-xs text-muted-foreground">
                  The Aerophone is monophonic — the chord is shown as an arpeggio to play one note
                  at a time.
                </p>
              {/if}
            </div>

            {#if status}
              <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
            {/if}
          </Card.Content>
        </Card.Root>
      </article>
    {/if}
  </section>
</PracticeScreen>
