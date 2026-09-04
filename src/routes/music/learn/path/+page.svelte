<script lang="ts">
  import { browser } from "$app/environment";

  import { INSTRUMENT_LABELS, VIEWABLE_INSTRUMENTS, type InstrumentId } from "@repo/music-core/domain";
  import { buildJazzPath } from "@repo/music-core/engines/jazz";
  import { SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";

  import LearningPathScreen from "../../_components/LearningPathScreen.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  // The Jazz Path: ten ordered steps, each opening the drill (or reference page)
  // that practises it, rendered on the same screen as the Ear Training Path.
  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);

  let instrument = $state<InstrumentId>(
    VIEWABLE_INSTRUMENTS.includes(runtime.activeInstrument) ? runtime.activeInstrument : "piano",
  );
  let ready = $state(false);

  void skills.load().then(() => (ready = true));

  const path = $derived.by(() => {
    void ready;
    return buildJazzPath({
      instrument,
      mastery: ready ? (id) => skills.getMastery(id).mastery : undefined,
    });
  });
</script>

<svelte:head>
  <title>Jazz Path | Practice OS</title>
  <meta
    name="description"
    content="An ordered jazz learning path that threads ear training, theory, chord-scales, voicings, the graded ii-V-I drill, licks and improv, tracked by real skill progress."
  />
</svelte:head>

<LearningPathScreen
  title="Jazz Path"
  subtitle="Learn it in order. Each step opens one drill with its setup; progress comes from your actual practice."
  {path}
  testId="jazz-path"
>
  {#snippet controls()}
    <SegmentedControl
      size="sm"
      ariaLabel="Instrument"
      options={VIEWABLE_INSTRUMENTS.map((id) => ({ value: id, label: INSTRUMENT_LABELS[id] }))}
      value={instrument}
      onChange={(v) => (instrument = v as InstrumentId)}
    />
  {/snippet}
</LearningPathScreen>
