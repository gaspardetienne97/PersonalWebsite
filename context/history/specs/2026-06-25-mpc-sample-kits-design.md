# MPC Sample Kits And Hardware Export Design

**Date:** 2026-06-25
**Status:** Approved
**Primary route:** `/music/studio`

## Objective

Add reusable 16-pad sample kits to the Music app and make the existing Studio
sequencer playable from imported one-shot samples. A kit must work with the
on-screen grid and incoming MPC MIDI notes, persist locally, and export as a
folder that an MPC One+ can load from SD or USB storage.

This milestone implements both requested paths:

1. **App-hosted kits:** audio remains in browser-local OPFS and is played by the
   shared `SoundEngine`.
2. **MPC hardware kits:** the app writes the original sample files plus an MPC
   drum-program `.xpm` file to a user-selected directory, with a ZIP download
   fallback.

Direct browser-to-MPC internal-storage transfer is excluded. Web MIDI carries
MIDI messages rather than audio, and Akai does not document a sample-transfer
SysEx protocol for MPC One+. MPC Controller Mode is an integration mode for MPC
desktop software, not a browser-visible file system.

## Research Findings

Akai's current MPC One+ product data and MPC Standalone OS 3.7 guide establish:

- MPC One+ has one USB-A port, one USB-B port, an SD-card slot, 16 GB internal
  storage, and more than 7.8 GB available for user storage.
- Standalone MPC supports AIF/AIFF, FLAC, MP3, OGG, and WAV audio files.
- The MPC Browser can read and write supported external storage, including USB
  drives and SD cards.
- Samples can be loaded into a Drum track and assigned to pads through Sample
  Assign.
- A Drum Program is saved as an `.xpm` file.
- MPC supports exFAT, FAT32, NTFS, and EXT4 read/write, with HFS+ read-only;
  Akai recommends exFAT for Windows/macOS interoperability.
- Web MIDI exposes MIDI input/output messages and optional SysEx access, but
  MIDI does not transmit audio.
- The File System Access API can write to a directory explicitly selected by
  the user. OPFS is origin-private and cannot itself expose files to the MPC.

The `.xpm` drum-program format is XML and can be generated from known compatible
program fixtures, but Akai does not publish a formal `.xpm` schema. Export is
therefore an explicitly versioned compatibility feature and remains pending
physical verification on the MPC One+.

### Sources

- [Akai MPC One+](https://www.akaipro.com/mpc-one-plus/)
- [MPC Standalone OS 3.7 User Guide](https://cdn.inmusicbrands.com/Software/37/MPC%20Standalone%20OS%20-%20User%20Guide%20-%20v3.7.pdf)
- [Web MIDI API](https://www.w3.org/TR/webmidi/)
- [File System Access API](https://wicg.github.io/file-system-access/)

## Scope

### Included

- Create, rename, select, and delete local 16-pad kits.
- Import one or more one-shot audio files.
- Deterministic filename-based auto-mapping to MPC Bank A MIDI notes 36-51.
- Manual reassignment of imported samples to Bank A pads.
- Local sample metadata in the existing settings repository.
- Original audio blobs in OPFS.
- Active-kit loading through the shared `SoundEngine`.
- Sample playback from Studio pad buttons and connected/on-screen MPC notes.
- Sample-backed Studio pattern playback and looping.
- Synth fallback when no playable sample is assigned.
- Export original samples plus an MPC 3.x `.xpm` Drum Program.
- Direct export to a user-selected directory through File System Access.
- ZIP fallback when directory writing is unavailable or declined.
- Automated engine, storage, sound, component, route, and E2E coverage.
- Deferred physical MPC One+ import verification in the handoff document.

### Excluded

- Writing directly to MPC internal storage.
- Sending audio over MIDI or undocumented SysEx.
- WebUSB device control.
- Controller Mode automation.
- Bank B-D editing.
- Velocity layers, round robins, choke groups, mute groups, envelopes, filters,
  effects, or per-pad tuning.
- Audio trimming, normalization, conversion, or destructive editing.
- Expansion-pack generation.
- Pad LED synchronization.
- Server uploads, cloud synchronization, or database migrations.

## User Workflow

### App-Hosted Kit

1. Open `/music/studio`.
2. Open the Sample Kit panel.
3. Create a kit or select an existing kit.
4. Choose one or more supported audio files.
5. The app auto-maps recognized names and fills remaining pads in file order.
6. Review the 4x4 Bank A mapping and manually move or clear assignments.
7. Activate the kit.
8. Tap an on-screen pad or play the connected MPC. Assigned pads play the
   imported samples.
9. Play the Studio pattern. Assigned rows use sample playback; unassigned rows
   retain the current synthesized fallback.
10. Kit metadata and blobs remain available offline.

### MPC Hardware Export

1. Select a complete or partial kit.
2. Choose **Export for MPC**.
3. The app validates names, sample availability, and supported file types.
4. If directory access is supported, choose a mounted SD card or USB drive.
5. The app creates a kit folder containing the `.xpm` and sample files.
6. If directory access is unavailable or cancelled, download the same folder as
   a ZIP archive.
7. Insert the media into MPC One+, open Browser, navigate to the exported
   folder, and load the `.xpm` Drum Program.

The export flow never claims the MPC is connected merely because a MIDI port is
present. MIDI connectivity and file destination are separate capabilities.

## Sample Kit Domain

Create a framework-agnostic engine:

`packages/music-core/src/engines/sample-kit/`

```ts
export type MpcPadMidi =
  | 36 | 37 | 38 | 39
  | 40 | 41 | 42 | 43
  | 44 | 45 | 46 | 47
  | 48 | 49 | 50 | 51;

export interface SampleAsset {
  id: string;
  fileName: string;
  displayName: string;
  mimeType: string;
  size: number;
  binaryKey: string;
}

export interface SamplePadAssignment {
  midiNote: MpcPadMidi;
  sampleId: string;
  label: string;
}

export interface SampleKit {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  samples: SampleAsset[];
  assignments: SamplePadAssignment[];
}
```

Kit IDs are stable local identifiers. A sample belongs to one kit in this
slice; duplicate imports create separate OPFS blobs rather than cross-kit
references. This keeps deletion and export deterministic.

`SampleKit` metadata is stored in one settings record:

```text
music.sample-kits
```

Audio blobs use:

```text
music.sample-kits/{kitId}/{sampleId}-{safeFileName}
```

No Dexie schema migration is required.

## Import Validation

The app accepts files only when:

- the file has a non-empty name;
- its extension is `.wav`, `.wave`, `.aif`, `.aiff`, `.flac`, `.mp3`, `.ogg`,
  or `.oga`;
- its size is greater than zero;
- the resulting kit does not contain duplicate sample IDs or duplicate binary
  keys.

The original file is retained without conversion. Browser playback attempts to
load every active assignment through Tone. A file that the browser cannot
decode remains exportable but is marked `Export only`; it does not break the
rest of the kit.

Import is transactional at the engine boundary:

1. validate all files;
2. write each blob;
3. persist metadata only after every write succeeds;
4. if a write fails, delete blobs written by that import attempt and leave the
   prior kit unchanged.

Deleting a kit removes its metadata and every referenced OPFS blob. A missing
blob during deletion is ignored; other storage errors are reported.

## Automatic Pad Mapping

Auto-mapping is pure and deterministic:

```ts
autoMapSamples(
  samples: SampleAsset[],
  existingAssignments?: SamplePadAssignment[],
): SamplePadAssignment[]
```

Existing assignments always win. New samples are processed in the user's file
selection order.

Recognized filename tokens map to preferred Bank A pads:

| Tokens | Preferred MIDI |
|---|---:|
| `kick`, `bd`, `bassdrum`, `808` | 36 |
| `snare`, `sd` | 38 |
| `clap` | 39 |
| `rim`, `stick`, `sidestick` | 37 |
| `closedhat`, `closed-hat`, `chh`, `hhc` | 42 |
| `openhat`, `open-hat`, `ohh`, `hho` | 46 |
| `lowtom`, `tom-low` | 41 |
| `midtom`, `tom-mid` | 45 |
| `hightom`, `tom-high` | 48 |
| `crash` | 49 |
| `ride` | 51 |
| `shaker`, `perc`, `percussion` | 40 |

Matching is case-insensitive and ignores spaces, underscores, and punctuation.
If a preferred pad is occupied, the sample uses the next free Bank A pad in
ascending MIDI order. Unrecognized names also use the next free pad. Imports
beyond 16 mapped samples remain in the kit's sample pool but are unassigned.

Manual assignment enforces one sample per pad. Assigning a sample to an occupied
pad replaces that assignment. The same sample cannot occupy multiple pads in
this slice.

## Sample Kit Store

`SampleKitStore` owns metadata and blob lifecycle. Its dependencies are
injected so the engine remains testable:

```ts
export interface SampleKitRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export interface SampleBinaryStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  delete(key: string): Promise<void>;
}
```

Public operations:

```ts
load(): Promise<SampleKit[]>;
create(name: string): Promise<SampleKit>;
rename(kitId: string, name: string): Promise<SampleKit>;
importFiles(kitId: string, files: File[]): Promise<SampleKit>;
assign(kitId: string, sampleId: string, midiNote: MpcPadMidi): Promise<SampleKit>;
unassign(kitId: string, midiNote: MpcPadMidi): Promise<SampleKit>;
deleteSample(kitId: string, sampleId: string): Promise<SampleKit>;
deleteKit(kitId: string): Promise<void>;
resolvePlayback(kitId: string): Promise<ResolvedSampleKit>;
```

Returned state is cloned. Callers cannot mutate persisted state by retaining a
reference.

## Sound Engine Integration

Keep `SoundEngine` as the only Tone owner.

Extend the public contract with pad-addressed playback:

```ts
export interface DrumPadSample {
  padId: string;
  midiNote: number;
  url: string;
}

export interface DrumPatternStep {
  padIds: string[];
  offsetSeconds: number;
}

loadDrumKit(samples: DrumPadSample[]): Promise<void>;
playDrum(padId: string, time?: ToneTime, velocity?: number): void;
startDrumPatternLoop(
  steps: DrumPatternStep[],
  durationSec: number,
  velocity?: number,
): void;
stopDrumPatternLoop(): void;
```

The sample-kit route adapter creates object URLs from OPFS blobs, passes them to
`loadDrumKit`, and revokes the prior kit's URLs after the replacement finishes
or the route is destroyed.

Drum-loop replacement semantics match `playPattern()`:

- starting a new drum loop stops the previous drum loop;
- stopping Studio playback clears its timer;
- loading a replacement kit disposes the prior `Tone.Players`;
- synth pattern, metronome, drone, and direct instrument voices remain
  independent.

## Studio Integration

Add a music-specific `SampleKitPanel.svelte` under
`src/routes/music/studio/_components/`.

The panel uses `@repo/ui` controls and contains:

- kit selector;
- create, rename, and delete actions;
- multi-file import;
- 4x4 Bank A assignment grid;
- per-pad sample label and playback state;
- unassigned sample pool;
- manual assign and clear controls;
- active-kit loading status;
- Export for MPC action.

The existing sequencer keeps `BOOM_BAP_KIT` row IDs and MIDI notes. Playback
chooses per row:

- assigned active-kit pad: sample playback;
- unassigned pad: existing synthesized MIDI fallback.

Incoming MPC `noteOn` events for MIDI 36-51 audition the active kit through the
shared runtime without advancing or interfering with unrelated exercises.
On-screen Studio pad buttons use the same route-level pad audition function.

The global transport source remains one Studio source. Starting it schedules
both sample-backed drum events and synth fallback events from the same
step-duration calculation. Stop cancels both paths.

## MPC Export Contract

Create a pure export module inside `engines/sample-kit`:

```ts
export interface MpcExportFile {
  relativePath: string;
  content: Blob;
}

export interface MpcKitExport {
  folderName: string;
  programFileName: string;
  files: MpcExportFile[];
}

buildMpcKitExport(
  kit: SampleKit,
  blobs: ReadonlyMap<string, Blob>,
): MpcKitExport;
```

The export folder contains:

```text
{safeKitName}/
  {safeKitName}.xpm
  Samples/
    036-{safeSampleName}.{ext}
    038-{safeSampleName}.{ext}
    ...
```

The `.xpm` references relative sample names and maps Bank A instruments 1-16 to
MIDI 36-51. Empty pads remain valid empty instruments. Program and pad names are
XML-escaped. File names are ASCII-safe, collision-free, and limited to 64
characters before the extension.

The generated program declares its compatibility target:

```text
MPC Standalone OS 3.x, Drum Program, XPM file version 2.1
```

This is not a general `.xpm` authoring library. The template contains only the
minimum fields required by known MPC 3.x drum-program fixtures and leaves
advanced pad/program parameters at neutral defaults.

Before export, the engine rejects:

- an empty kit;
- assignments referencing missing samples;
- missing blobs;
- duplicate output paths;
- unsupported hardware-export extensions.

## Directory And ZIP Export

The browser adapter has two implementations:

### Directory Export

Use `showDirectoryPicker({ mode: "readwrite" })` from a direct user action.
Create the kit directory, `Samples` directory, `.xpm`, and sample files through
file handles.

Directory export is available only when:

- `showDirectoryPicker` exists;
- the context is secure;
- the user grants read/write permission.

The app does not retain the directory handle in this slice.

### ZIP Export

Use the existing JSZip dependency to create the identical relative paths and
download `{safeKitName}-mpc.zip`.

Cancellation is not an error. Permission denial, write failure, and partial
directory export show an explicit status. The app cannot roll back arbitrary
external-directory writes, so it reports the destination folder and advises
the user to remove it before retrying.

## Error Handling

User-facing errors are stable and actionable:

- `Choose at least one audio sample.`
- `This file type is not supported by MPC sample kits: {fileName}.`
- `Sample storage is unavailable in this browser.`
- `The sample could not be decoded for browser playback. It remains available for MPC export.`
- `This kit has no assigned samples.`
- `A sample assigned to pad {midiNote} is missing.`
- `Choose an SD card or USB drive mounted on this computer.`
- `Directory access was cancelled. Download a ZIP instead.`
- `The MPC export could not be written completely. Remove the partial folder before retrying.`

Import and activation errors do not discard an existing working active kit.

## Testing

### Core Unit Tests

- Filename normalization and every semantic token family.
- Existing assignments win.
- Collisions use the next free Bank A pad.
- Unknown files fill in deterministic order.
- More than 16 imports leave extras unassigned.
- Manual replacement and unassignment.
- Metadata cloning and sanitization.
- Transactional import rollback.
- Kit/sample deletion and missing-blob behavior.
- Playback resolution marks undecodable/missing samples correctly.
- `.xpm` XML escaping, 16-pad mapping, relative sample references, empty pads,
  safe names, collisions, and validation failures.

### Sound Tests

- `loadDrumKit` maps pad IDs to object URLs.
- Pad playback applies velocity.
- Replacement disposes the prior players.
- Drum-loop scheduling uses one shared start time.
- A second loop replaces the first.
- Stop prevents later loop iterations.
- Existing synth, metronome, and drone tests remain green.

### Svelte Tests

- Create and select a kit.
- Auto-map imported fixtures.
- Reassign and clear a pad.
- Show export-only decode status.
- Active kit changes Studio pad audition.
- Sequencer uses sample-backed rows with synth fallback.
- Directory-export capability and ZIP fallback states.
- No horizontal overflow at 375 px.

### E2E

- Create a kit from generated WAV fixtures.
- Verify kick/snare/hat filename auto-mapping.
- Activate the kit and audition an assigned pad.
- Toggle a Studio step and start/stop sample-backed playback.
- Reload and verify metadata/blob persistence.
- Download an MPC ZIP and inspect the archive for one `.xpm` plus expected
  sample paths.

### Deferred Hardware Verification

On MPC One+:

1. Format or use an exFAT SD/USB device.
2. Export the test kit to that volume.
3. Insert/connect it to MPC One+.
4. In Browser, open the exported folder and load the `.xpm`.
5. Verify Bank A pad assignments, labels, sample playback, and velocity.
6. Save and reopen the program on the MPC.
7. Record any MPC OS compatibility changes required by the generated template.

No hardware-success claim is made until this checklist passes.

## Acceptance Criteria

- A user can import one-shot files and receive a deterministic Bank A mapping.
- Kit metadata and audio survive reload offline.
- MPC and on-screen Bank A notes play the assigned browser samples.
- Studio loops assigned samples without layering duplicate loop instances.
- Unassigned pads retain a working synthesized fallback.
- Export produces an `.xpm` and original audio files with valid relative paths.
- Directory export works to a user-selected mounted volume where supported.
- ZIP fallback contains the same folder structure.
- Existing Music routes and shared runtime behavior remain intact.
- Recursive check, unit/component tests, production build, relevant Playwright
  flows, and domain harnesses pass.

## Follow-Ups

- MPC One+ physical `.xpm` verification and template adjustments.
- Persisted directory handles for repeat export.
- Bank B-D editing.
- Velocity layers and round robin.
- Choke/mute groups and per-pad parameters.
- MIDI-output pad-color synchronization after device-specific capability
  research.
- Optional audio conversion to an MPC-optimized WAV profile.
