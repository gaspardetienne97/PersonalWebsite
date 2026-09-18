<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";

  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";
  import { buildJazzPath } from "@repo/music-core/engines/jazz";
  import {
    INSTRUMENT_PATHS,
    buildInstrumentPath,
    hasInstrumentPath,
  } from "@repo/music-core/engines/learning-path";
  import { PracticeStore } from "@repo/music-core/engines/store";

  import LearningPathScreen from "../../_components/LearningPathScreen.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  // Two kinds of ordered path on one screen: the instrument progression
  // (guitar, piano, MPC — each step unlocks the next) and the Jazz Path, which
  // still covers every viewable instrument. Both open one drill per step with
  // its setup; progress comes from real practice.
  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;

  const INSTRUMENTS: InstrumentId[] = [...VIEWABLE_INSTRUMENTS, "mpc"];

  // `?path=jazz` opens the Jazz Path directly, so the entry points that mean
  // jazz can say so; anything else opens the instrument progression. The MPC
  // has no jazz progression, so a jazz link lands on the piano instead of
  // silently showing the MPC path.
  const wantsJazz = page.url.searchParams.get("path") === "jazz";
  const preferred = INSTRUMENTS.includes(runtime.activeInstrument)
    ? runtime.activeInstrument
    : "piano";

  let instrument = $state<InstrumentId>(
    wantsJazz && !VIEWABLE_INSTRUMENTS.includes(preferred) ? "piano" : preferred,
  );
  let view = $state<"instrument" | "jazz">(wantsJazz ? "jazz" : "instrument");
  let events = $state<import("@repo/music-core/domain").ScoringEvent[]>([]);

  void store?.scoringEvents.all().then((loaded) => (events = loaded));

  // Jazz covers the viewable instruments only; the MPC has its own path alone.
  const jazzAvailable = $derived(VIEWABLE_INSTRUMENTS.includes(instrument));
  const ownPathId = $derived(
    (view === "instrument" || !jazzAvailable) && hasInstrumentPath(instrument)
      ? instrument
      : undefined,
  );

  const path = $derived.by(() =>
    ownPathId ? buildInstrumentPath(ownPathId, { instrument, events }) : buildJazzPath({ instrument, events }),
  );

  const title = $derived(ownPathId ? INSTRUMENT_PATHS[ownPathId].title : "Jazz Path");
  const subtitle = $derived(
    ownPathId
      ? INSTRUMENT_PATHS[ownPathId].subtitle
      : "Learn it in order. Each step opens one drill with its setup; progress comes from your actual practice.",
  );
</script>

<svelte:head>
  <title>{title} | Practice OS</title>
  <meta
    name="description"
    content="Ordered learning paths: a guitar, piano and MPC progression whose steps unlock one another, plus the jazz path that threads ear training, theory, chord-scales, voicings, licks and improv."
  />
</svelte:head>

<LearningPathScreen {title} {subtitle} {path} testId={ownPathId ? "instrument-path" : "jazz-path"}>
  {#snippet controls()}
    <SegmentedControl
      size="sm"
      ariaLabel="Instrument"
      options={INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
      value={instrument}
      onChange={(v) => (instrument = v as InstrumentId)}
    />
    {#if hasInstrumentPath(instrument) && jazzAvailable}
      <SegmentedControl
        size="sm"
        ariaLabel="Path"
        options={[
          { value: "instrument", label: INSTRUMENT_LABELS[instrument] },
          { value: "jazz", label: "Jazz" },
        ]}
        value={view}
        onChange={(v) => (view = v as "instrument" | "jazz")}
      />
    {/if}
  {/snippet}
</LearningPathScreen>
