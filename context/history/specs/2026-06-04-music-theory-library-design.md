# Music Theory Library Design

## Goal

Replace the `/music/learn` placeholder with a searchable chord and scale library that explains each item visually, plays it through the shared music runtime, and persists saved chords locally.

## Scope

- Browse and search a curated set of common chords and scales.
- Select an item to inspect notes, intervals, and a piano projection.
- Render curated guitar and ukulele voicings for chords with SVGuitar.
- Play the selected chord or scale through the existing `SoundEngine`.
- Save and remove chords through the existing `PracticeStore.chordLibrary` repository.
- Inherit the personal website's UI package, Tailwind tokens, and light/dark theme.

No database migrations, separate deployment, or custom music-only theme are required.

## Architecture

`packages/music-core/src/engines/library` owns the curated catalog, theory projections, string voicings, search, and saved-chord persistence. It depends on the existing theory and store engines and exposes plain TypeScript values that can be tested without Svelte.

`src/routes/music/learn` owns presentation and browser interaction. `PianoKeyboard.svelte` renders an accessible keyboard projection. `ChordDiagram.svelte` dynamically imports SVGuitar on mount so server rendering never evaluates browser-only drawing code. The page uses the shared music runtime for audio and shared UI package components for controls and layout.

## Data Model

Each catalog entry has a stable ID, kind, display name, theory query, aliases, and optional curated string voicings. The library engine projects that source entry into:

- normalized notes from the theory engine
- intervals measured from the root
- MIDI notes in a useful middle-register voicing
- saved state loaded from `PracticeStore.chordLibrary`

Saved chords use the existing `ChordLibraryRow` shape. The row stores the entry ID, symbol, projected notes, tags, and creation time.

## Interface

The route uses a responsive two-column layout:

- A searchable results rail with a Chords/Scales filter.
- A detail workspace with the selected item's title, save and playback actions, note and interval badges, piano keyboard, and chord diagrams.

On small screens the rail stacks above the detail workspace. Empty searches show a clear empty state. Scales omit string diagrams because the first ticket only requires curated chord voicings.

## Error Handling

- Audio state and failures remain owned by the shared `MusicRuntime`.
- Persistence failures leave the current selection usable and expose a short page-level status message.
- SVGuitar drawing failures do not block theory or playback content.
- Unsupported catalog data is caught by focused engine tests before it reaches the route.

## Verification

- Unit tests verify Cmaj7 notes, intervals, piano MIDI values, guitar and ukulele voicings, search, and save/remove persistence.
- Browser component tests verify piano-key highlighting and the route's search, selection, save, and playback wiring.
- Manual browser verification checks responsive layout, theme inheritance, SVGuitar rendering, audio, and reload persistence.

