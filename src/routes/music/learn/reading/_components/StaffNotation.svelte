<script lang="ts">
  import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";

  import {
    writtenPitchName,
    type NotationEvent,
    type NotationView,
  } from "@repo/music-core/engines/notation";

  let {
    view,
    activeEventIds = [],
    errorEventIds = [],
    onError = () => undefined,
  }: {
    view: NotationView;
    activeEventIds?: string[];
    errorEventIds?: string[];
    onError?: (message: string) => void;
  } = $props();

  let host = $state<HTMLDivElement>();

  $effect(() => {
    if (host) draw(host, view, activeEventIds, errorEventIds);
  });

  function draw(
    target: HTMLDivElement,
    notationView: NotationView,
    activeIds: string[],
    errorIds: string[],
  ): void {
    try {
      target.replaceChildren();
      const width = Math.max(420, target.clientWidth || 720);
      const rows = notationView.measures.length * Math.max(1, notationView.staves.length);
      const height = Math.max(150, rows * 130);
      const renderer = new Renderer(target, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const context = renderer.getContext();
      const renderedIds: string[] = [];

      for (const measure of notationView.measures) {
        for (const [staffIndex, staffView] of notationView.staves.entries()) {
          const row = measure.index * notationView.staves.length + staffIndex;
          const stave = new Stave(12, row * 130 + 18, width - 24);
          stave
            .addClef(staffView.clef)
            .addKeySignature(vexKey(notationView.keySignature))
            .addTimeSignature(
              `${notationView.timeSignature.numerator}/${notationView.timeSignature.denominator}`,
            )
            .setContext(context)
            .draw();

          const events = measure.events.filter(({ staff }) => staff === staffView.clef);
          if (events.length === 0) continue;
          const notes = events.map((event) => {
            renderedIds.push(event.id);
            return staveNote(event, staffView.clef);
          });
          const voice = new Voice({
            numBeats: measure.durationBeats,
            beatValue: 4,
          }).setMode(Voice.Mode.SOFT);
          voice.addTickables(notes);
          new Formatter().joinVoices([voice]).format([voice], width - 130);
          voice.draw(context, stave);
        }
      }

      const noteGroups = target.querySelectorAll<SVGGElement>(".vf-stavenote");
      noteGroups.forEach((group, index) => {
        const id = renderedIds[index];
        if (!id) return;
        group.dataset.eventId = id;
        group.classList.toggle("text-primary", activeIds.includes(id));
        group.classList.toggle("text-destructive", errorIds.includes(id));
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Notation could not be rendered.");
    }
  }

  function staveNote(event: NotationEvent, clef: "treble" | "bass"): StaveNote {
    const note = new StaveNote({
      clef,
      keys:
        event.kind === "rest"
          ? [clef === "bass" ? "d/3" : "b/4"]
          : event.pitches.map((pitch) => vexPitch(writtenPitchName(pitch, true))),
      duration: `${event.duration}${event.kind === "rest" ? "r" : ""}`,
    });
    if (event.kind === "note") {
      event.pitches.forEach((pitch, index) => {
        if (pitch.accidental && pitch.accidental !== "natural") {
          note.addModifier(new Accidental(pitch.accidental), index);
        } else if (pitch.accidental === "natural") {
          note.addModifier(new Accidental("n"), index);
        }
      });
    }
    for (let index = 0; index < event.dots; index += 1) Dot.buildAndAttach([note], { all: true });
    return note;
  }

  function vexPitch(note: string): string {
    const match = /^([A-Ga-g])(?:bb|b|##|#)?(-?\d+)$/.exec(note);
    if (!match) throw new Error(`Unsupported written pitch: ${note}`);
    return `${match[1]!.toLowerCase()}/${match[2]}`;
  }

  function vexKey(keySignature: string): string {
    return keySignature.replace(/\s+(major|minor)$/i, "");
  }
</script>

<div
  bind:this={host}
  class="min-h-40 w-full overflow-x-auto rounded-md border bg-background p-2 text-foreground [&_svg]:min-w-[420px]"
  role="img"
  aria-label="Staff notation"
></div>
