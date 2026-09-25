# MusicXML and OSMD Song Studio Design

## Goal

Add uncompressed MusicXML import and high-fidelity Song Studio rendering without
replacing the existing VexFlow path for MIDI and generated exercises.

## Architecture

The app owns one canonical `Score` model and two rendering adapters:

- `score-import` parses `.musicxml` and `.xml` text into the canonical `Score`
  used by playback, score following, projections, and practice logging.
- The original MusicXML text is persisted alongside the canonical score.
- `MusicXmlScore` lazy-loads OpenSheetMusicDisplay and renders the original XML.
- `StaffNotation` remains the VexFlow renderer for MIDI and generated scores.

OSMD is not a domain dependency. Song Studio may replace or upgrade its renderer
without changing score-following or persistence contracts.

## Import Contract

`parseMusicXmlScore(xml, { id, fallbackName })` supports uncompressed
`score-partwise` MusicXML with:

- part names and per-voice canonical score voices;
- divisions-based note and rest timing;
- chords through `<chord/>`;
- multi-voice movement through `<backup>` and `<forward>`;
- initial and changed time signatures;
- initial key signature;
- tempo markers from `<sound tempo>`;
- written pitch spelling and velocity defaults;
- basic harmony symbols and lyrics.

Malformed XML and unsupported root formats return explicit errors. Compressed
`.mxl` is deferred.

## Persistence

`SongRow` gains optional source data:

```ts
source?: {
  format: "musicxml";
  content: string;
}
```

This is a non-indexed field in the existing IndexedDB record, so no database
schema migration is required. `SongLibrary.saveScore()` accepts canonical scores
and optional source data. Existing MIDI imports remain compatible.

## UI

`/music/import` accepts `.mid`, `.midi`, `.musicxml`, and `.xml`:

- MIDI keeps the current piano-roll preview.
- MusicXML shows canonical metadata and saves the original XML.
- Both formats save to the same repertoire library.

`/music/songs/[id]` selects rendering by source:

- MusicXML source: lazy-loaded OSMD SVG renderer.
- No MusicXML source: existing VexFlow `StaffNotation`.

Playback and wait-mode follow-along always use the canonical score.

## Loading And Errors

OSMD is dynamically imported only when a MusicXML-backed song is opened. The
component exposes loading, rendered, and error states. Rendering failure does
not disable playback or follow-along; Song Studio shows the error and retains
the canonical controls.

## Testing

- Pure parser tests cover notes, chords, rests, multiple voices, tempo, time,
  key, harmony, lyrics, malformed XML, and unsupported roots.
- Persistence tests cover original XML retention.
- Import route tests cover MusicXML selection and saving.
- Renderer component tests cover lazy rendering and error reporting.
- Song Studio tests assert OSMD selection for MusicXML and VexFlow for MIDI.
- Playwright covers import, save, reopen, visible OSMD SVG, follow-along, and
  mobile overflow.

## Deferred

- Compressed `.mxl`
- `score-timewise`
- MusicXML export
- OSMD cursor synchronization with canonical score groups
- Performance-mode transport, looping, and part selection
