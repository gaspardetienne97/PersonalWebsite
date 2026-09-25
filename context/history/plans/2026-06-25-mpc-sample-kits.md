# MPC Sample Kits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent 16-pad browser sample kits to `/music/studio`, use them for MPC/on-screen audition and sequencer playback, and export the same assignments as an MPC Standalone 3.x drum program to a directory or ZIP.

**Architecture:** Framework-agnostic kit mapping, metadata/blob lifecycle, and MPC export live in `@repo/music-core`. `MusicRuntime` exposes one shared `SampleKitStore`; a browser-only Studio playback controller owns decode probing and object URLs while continuing to use the shared `SoundEngine`. The Studio route composes the panel, input-router subscription, hybrid sample/synth sequencer, and export adapters without adding database migrations or route-local audio engines.

**Tech Stack:** TypeScript, SvelteKit 2, Svelte 5 runes, VitePlus/Vitest, Tone.js, Dexie settings, OPFS, File System Access API, JSZip, `@repo/ui`, Playwright.

## Global Constraints

- Keep Music mounted under `/music` in the existing SvelteKit deployment.
- Use VitePlus workspace commands; do not add Turborepo.
- Use `@repo/ui` primitives and inherited theme tokens; do not introduce a Music-only palette.
- Keep `SoundEngine` as the only Tone owner and use the shared `MusicRuntime`.
- Store sample-kit metadata in the existing `music.sample-kits` settings record.
- Store sample blobs under `music.sample-kits/{kitId}/{sampleId}-{safeFileName}` in OPFS.
- Do not add a Dexie or server database migration.
- Support Bank A only: MIDI notes 36-51.
- Preserve original WAV/WAVE/AIF/AIFF/FLAC/MP3/OGG/OGA files without conversion.
- Browser-undecodable files remain available for MPC export and are marked `Export only`.
- Existing assignments win during auto-mapping; collisions and unknown names fill the next free Bank A pad in ascending order.
- Starting a sample loop replaces the previous sample loop; loading a kit disposes the previous Tone players and revokes prior object URLs.
- Hardware export targets MPC Standalone OS 3.x, Drum Program, XPM file version 2.1.
- Do not implement WebUSB, undocumented SysEx, direct MPC internal-storage transfer, Bank B-D, velocity layers, choke groups, or sample editing.
- Write focused failing tests before production changes.
- Run build and Playwright sequentially because both write `.svelte-kit`.
- Do not stage unrelated root deletions or local `.claude`, `.codex`, `.serena`, `.superpowers`, prototype, or planning directories.
- `docs/` is local development context unless the user explicitly requests tracking; update the handoff and implementation plan at the milestone without staging them by default.

---

## File Structure

### Core Kit Model

- Create `packages/music-core/src/engines/sample-kit/index.ts`
  - Types, validation, filename normalization, deterministic auto-mapping, assignment helpers, and cloning.
- Create `packages/music-core/src/engines/sample-kit/sample-kit.test.ts`
  - Validation, token mapping, collision, assignment, and cloning tests.
- Modify `packages/music-core/package.json`
  - Export `./engines/sample-kit`.

### Persistence

- Create `packages/music-core/src/engines/sample-kit/store.ts`
  - `SampleKitStore`, metadata persistence, transactional import, deletion, and blob resolution.
- Create `packages/music-core/src/engines/sample-kit/store.test.ts`
  - Repository/binary fakes and lifecycle tests.
- Modify `packages/music-core/src/engines/store/index.ts`
  - Resolve slash-delimited OPFS keys into nested directories.
- Modify `packages/music-core/src/engines/store/store.test.ts`
  - Nested put/get/delete/list tests.

### MPC Export

- Create `packages/music-core/src/engines/sample-kit/mpc-export.ts`
  - Safe names, validation, minimal XPM 2.1 XML, and export-file projection.
- Create `packages/music-core/src/engines/sample-kit/mpc-export.test.ts`
  - XML, pad, path, escaping, collision, and failure tests.
- Create `packages/music-core/src/engines/sample-kit/browser-export.ts`
  - Directory writer, ZIP builder, and browser capability projection.
- Create `packages/music-core/src/engines/sample-kit/browser-export.test.ts`
  - Fake directory handles and JSZip archive tests.

### Audio And Runtime

- Modify `packages/music-core/src/engines/sound/index.ts`
  - Pad-addressed drum samples and cancellable drum-pattern looping.
- Modify `packages/music-core/src/engines/sound/sound.test.ts`
  - Replacement, scheduling, velocity, and disposal tests.
- Create `src/routes/music/studio/_components/sample-kit-playback.ts`
  - Browser decode probing, object URL lifecycle, active-kit projection, and sample audition.
- Create `src/routes/music/studio/_components/sample-kit-playback.test.ts`
  - Playable/export-only/missing states and URL cleanup.
- Modify `src/routes/music/_runtime.svelte.ts`
  - Shared `SampleKitStore` attachment and availability.
- Modify `src/routes/music/_runtime.svelte.test.ts`
  - Storage attachment regression.

### Studio UI

- Create `src/routes/music/studio/_components/SampleKitPanel.svelte`
  - Kit CRUD, import, Bank A grid, assignment pool, activation, and export actions.
- Create `src/routes/music/studio/_components/SampleKitPanel.svelte.test.ts`
  - Component behavior and responsive overflow.
- Modify `src/routes/music/studio/+page.svelte`
  - Panel composition, router audition, hybrid loop scheduling, fallback, cleanup, and status.
- Modify `src/routes/music/studio/page.svelte.test.ts`
  - Active-kit, MIDI, sample-loop, fallback, and lifecycle tests.
- Modify `e2e/music-studio.spec.ts`
  - Persistent generated-WAV kit and ZIP export flow.

### Milestone Documentation

- Modify `IMPLEMENTATION_PLAN.md`
- Modify `docs/music-practice-lab-handoff.md`
- Modify `src/routes/music/AGENTS.md`

---

### Task 1: Sample Kit Model And Deterministic Bank A Mapping

**Files:**
- Create: `packages/music-core/src/engines/sample-kit/index.ts`
- Create: `packages/music-core/src/engines/sample-kit/sample-kit.test.ts`
- Modify: `packages/music-core/package.json`

**Interfaces:**
- Consumes: no browser or Svelte APIs.
- Produces:

```ts
export const MPC_BANK_A_MIDI = [
  36, 37, 38, 39, 40, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 50, 51,
] as const;

export type MpcPadMidi = (typeof MPC_BANK_A_MIDI)[number];

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

export const SAMPLE_KITS_SETTINGS_ID = "music.sample-kits";

export function isMpcPadMidi(value: number): value is MpcPadMidi;
export function validateSampleFile(file: Pick<File, "name" | "size" | "type">): void;
export function safeSampleFileName(fileName: string): string;
export function sampleBinaryKey(kitId: string, sampleId: string, fileName: string): string;
export function autoMapSamples(
  samples: SampleAsset[],
  existingAssignments?: SamplePadAssignment[],
): SamplePadAssignment[];
export function assignSample(
  kit: SampleKit,
  sampleId: string,
  midiNote: MpcPadMidi,
  now?: number,
): SampleKit;
export function unassignPad(kit: SampleKit, midiNote: MpcPadMidi, now?: number): SampleKit;
export function cloneSampleKit(kit: SampleKit): SampleKit;
```

- [ ] **Step 1: Write failing validation and mapping tests**

Add table-driven tests for all token families:

```ts
test.each([
  ["Fat Kick.wav", 36],
  ["BD_01.wav", 36],
  ["Bass Drum.aif", 36],
  ["808 one shot.wav", 36],
  ["Dry Snare.wav", 38],
  ["SD-02.wav", 38],
  ["Hand Clap.wav", 39],
  ["Side Stick.wav", 37],
  ["Closed-Hat.wav", 42],
  ["HHC 03.wav", 42],
  ["Open Hat.wav", 46],
  ["HHO.ogg", 46],
  ["Low Tom.wav", 41],
  ["Tom_Mid.wav", 45],
  ["High-Tom.wav", 48],
  ["Crash.wav", 49],
  ["Ride.wav", 51],
  ["Percussion.wav", 40],
])("maps %s to Bank A MIDI %i", (fileName, midiNote) => {
  expect(autoMapSamples([asset("sample-1", fileName)])).toEqual([
    expect.objectContaining({ sampleId: "sample-1", midiNote }),
  ]);
});
```

Also test:

```ts
test("preserves existing assignments and fills collisions in ascending order", () => {
  const samples = [
    asset("old", "old.wav"),
    asset("kick-2", "another kick.wav"),
    asset("unknown", "texture.wav"),
  ];
  expect(autoMapSamples(samples, [{ midiNote: 36, sampleId: "old", label: "Old" }])).toEqual([
    { midiNote: 36, sampleId: "old", label: "Old" },
    expect.objectContaining({ midiNote: 37, sampleId: "kick-2" }),
    expect.objectContaining({ midiNote: 38, sampleId: "unknown" }),
  ]);
});

test("leaves imports after the sixteenth sample unassigned", () => {
  const assignments = autoMapSamples(
    Array.from({ length: 18 }, (_, index) => asset(`s${index}`, `sample-${index}.wav`)),
  );
  expect(assignments).toHaveLength(16);
  expect(assignments.map(({ midiNote }) => midiNote)).toEqual(MPC_BANK_A_MIDI);
});
```

Validate empty names, zero-byte files, and unsupported extensions with exact errors from the approved design.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
vp test packages/music-core/src/engines/sample-kit/sample-kit.test.ts --run
```

Expected: FAIL because `@repo/music-core/engines/sample-kit` does not exist.

- [ ] **Step 3: Implement normalization and validation**

Use an extension allow-list and normalize matching tokens independently from stored names:

```ts
const SUPPORTED_SAMPLE_EXTENSIONS = new Set([
  "wav", "wave", "aif", "aiff", "flac", "mp3", "ogg", "oga",
]);

function normalizedTokens(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function validateSampleFile(file: Pick<File, "name" | "size" | "type">): void {
  if (file.name.trim().length === 0) throw new Error("Sample files need a name.");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!SUPPORTED_SAMPLE_EXTENSIONS.has(extension)) {
    throw new Error(`This file type is not supported by MPC sample kits: ${file.name}.`);
  }
  if (file.size <= 0) throw new Error(`The sample file is empty: ${file.name}.`);
}
```

`safeSampleFileName()` must preserve the supported extension, transliterate to ASCII with `normalize("NFKD")`, replace non-alphanumeric runs with `-`, trim separators, and use `sample` when the stem becomes empty.

- [ ] **Step 4: Implement deterministic auto-mapping**

Represent preferred tokens in precedence order, seed `usedPads` and `assignedSamples` from valid existing assignments, then process new samples in input order. A preferred occupied pad must fall back to `MPC_BANK_A_MIDI.find((pad) => !usedPads.has(pad))`.

Manual assignment must:

```ts
const assignments = kit.assignments.filter(
  (assignment) => assignment.midiNote !== midiNote && assignment.sampleId !== sampleId,
);
assignments.push({ midiNote, sampleId, label: sample.displayName });
assignments.sort((left, right) => left.midiNote - right.midiNote);
```

Throw `Sample not found: {sampleId}.` for an unknown sample.

- [ ] **Step 5: Export the package path and run checks**

Add:

```json
"./engines/sample-kit": "./src/engines/sample-kit/index.ts"
```

Run:

```bash
vp test packages/music-core/src/engines/sample-kit/sample-kit.test.ts --run
vp run @repo/music-core#check
```

Expected: sample-kit tests PASS and Music core type-checks.

- [ ] **Step 6: Commit**

```bash
git add packages/music-core/package.json packages/music-core/src/engines/sample-kit
git commit -m "feat(music): add MPC sample kit mapping"
```

---

### Task 2: Transactional Metadata And Nested OPFS Storage

**Files:**
- Create: `packages/music-core/src/engines/sample-kit/store.ts`
- Create: `packages/music-core/src/engines/sample-kit/store.test.ts`
- Modify: `packages/music-core/src/engines/sample-kit/index.ts`
- Modify: `packages/music-core/src/engines/store/index.ts`
- Modify: `packages/music-core/src/engines/store/store.test.ts`

**Interfaces:**
- Consumes: Task 1 types/helpers and existing `SettingsRecord`.
- Produces:

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

export interface ResolvedSample {
  asset: SampleAsset;
  blob?: Blob;
  status: "available" | "missing";
}

export interface ResolvedSampleKit {
  kit: SampleKit;
  samples: ResolvedSample[];
}

export interface SampleKitStoreOptions {
  repository: SampleKitRepository;
  binaries: SampleBinaryStore;
  createId?: () => string;
  now?: () => number;
}

export class SampleKitStore {
  constructor(options: SampleKitStoreOptions);
  load(): Promise<SampleKit[]>;
  create(name: string): Promise<SampleKit>;
  rename(kitId: string, name: string): Promise<SampleKit>;
  importFiles(kitId: string, files: File[]): Promise<SampleKit>;
  assign(kitId: string, sampleId: string, midiNote: MpcPadMidi): Promise<SampleKit>;
  unassign(kitId: string, midiNote: MpcPadMidi): Promise<SampleKit>;
  deleteSample(kitId: string, sampleId: string): Promise<SampleKit>;
  deleteKit(kitId: string): Promise<void>;
  resolvePlayback(kitId: string): Promise<ResolvedSampleKit>;
}
```

Re-export `SampleKitStore` and its public types from
`packages/music-core/src/engines/sample-kit/index.ts`.

- [ ] **Step 1: Write failing nested OPFS tests**

Extend `store.test.ts` with a nested key:

```ts
test("round-trips nested OPFS paths and prunes empty directories", async () => {
  if (!navigator.storage?.getDirectory) return;
  const key = `music.sample-kits/${crypto.randomUUID()}/sample-kick.wav`;
  await putBinary(key, new Blob(["kick"], { type: "audio/wav" }));
  await expect(getBinary(key).then((blob) => blob?.text())).resolves.toBe("kick");
  await expect(list("music.sample-kits/")).resolves.toContain(key);
  await deleteBinary(key);
  await expect(getBinary(key)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Implement slash-path OPFS resolution**

Replace direct root `getFileHandle(key)` calls with:

```ts
function pathParts(key: string): string[] {
  const parts = key.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Binary storage key is invalid.");
  }
  return parts;
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  key: string,
  create: boolean,
): Promise<{ directory: FileSystemDirectoryHandle; fileName: string; parents: string[] }> {
  const parts = pathParts(key);
  const fileName = parts.at(-1)!;
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return { directory, fileName, parents: parts.slice(0, -1) };
}
```

`list(prefix)` must recursively walk directories and return full slash-delimited keys. `deleteBinary()` removes the file and then attempts to remove empty parent directories from deepest to shallowest, ignoring only `NotFoundError` and `InvalidModificationError`.

- [ ] **Step 3: Run nested storage tests**

Run:

```bash
vp test packages/music-core/src/engines/store/store.test.ts --run
```

Expected: all store tests PASS, including the new nested-path case.

- [ ] **Step 4: Write failing `SampleKitStore` lifecycle tests**

Cover:

```ts
test("rolls back every blob when an import write fails", async () => {
  const binaries = fakeBinaries({ failPutAt: 2 });
  const store = sampleKitStore({ binaries });
  const kit = await store.create("Rollback");
  await expect(
    store.importFiles(kit.id, [audioFile("kick.wav"), audioFile("snare.wav")]),
  ).rejects.toThrow("write failed");
  expect(await store.load()).toEqual([kit]);
  expect(binaries.keys()).toEqual([]);
});

test("replaces pad assignments and removes deleted sample blobs", async () => {
  const store = sampleKitStore();
  const kit = await store.create("House");
  const imported = await store.importFiles(kit.id, [
    audioFile("kick.wav"),
    audioFile("snare.wav"),
  ]);
  const moved = await store.assign(imported.id, imported.samples[1]!.id, 36);
  expect(moved.assignments).toEqual([
    expect.objectContaining({ midiNote: 36, sampleId: imported.samples[1]!.id }),
  ]);
  const next = await store.deleteSample(moved.id, imported.samples[0]!.id);
  expect(next.samples).toHaveLength(1);
});

test("returns clones and marks missing playback blobs", async () => {
  const store = sampleKitStore();
  const kit = await store.create("Missing");
  const imported = await store.importFiles(kit.id, [audioFile("kick.wav")]);
  await binaries.delete(imported.samples[0]!.binaryKey);
  const resolved = await store.resolvePlayback(imported.id);
  expect(resolved.samples[0]?.status).toBe("missing");
  resolved.kit.name = "mutated";
  await expect(store.load()).resolves.toEqual([
    expect.objectContaining({ name: "Missing" }),
  ]);
});
```

Also test empty create/rename names, unknown kit/sample IDs, missing-blob deletion tolerance, metadata write failure after blob writes, and duplicate metadata IDs/binary keys on load.

- [ ] **Step 5: Implement `SampleKitStore`**

Persist one cloned array:

```ts
async #persist(kits: SampleKit[]): Promise<void> {
  await this.#repository.put({
    id: SAMPLE_KITS_SETTINGS_ID,
    value: kits.map(cloneSampleKit),
  });
}
```

For import:

1. Reject `files.length === 0` with `Choose at least one audio sample.`
2. Validate every file before writing.
3. Build all `SampleAsset`s and binary keys first.
4. Write blobs sequentially while collecting successful keys.
5. On any write or metadata failure, delete all newly written keys and rethrow.
6. Append samples, run `autoMapSamples(allSamples, existingAssignments)`, update timestamp, and persist once.

Translate the existing binary adapter's
`Local binary storage is unavailable.` failure to the feature-level message
`Sample storage is unavailable in this browser.` before it reaches the UI.

Deletion must persist metadata first, then delete unreferenced blobs. Missing
blobs are ignored by the binary adapter. If another cleanup failure occurs,
report it after metadata remains deleted; do not restore metadata that may now
reference blobs already removed earlier in the cleanup pass. Add a test that
locks this partial-cleanup behavior.

- [ ] **Step 6: Run focused persistence checks**

Run:

```bash
vp test packages/music-core/src/engines/sample-kit/store.test.ts packages/music-core/src/engines/store/store.test.ts --run
vp run @repo/music-core#check
```

Expected: both suites PASS and Music core type-checks.

- [ ] **Step 7: Commit**

```bash
git add packages/music-core/src/engines/sample-kit packages/music-core/src/engines/store
git commit -m "feat(music): persist sample kits in OPFS"
```

---

### Task 3: MPC XPM, Directory, And ZIP Export

**Files:**
- Create: `packages/music-core/src/engines/sample-kit/mpc-export.ts`
- Create: `packages/music-core/src/engines/sample-kit/mpc-export.test.ts`
- Create: `packages/music-core/src/engines/sample-kit/browser-export.ts`
- Create: `packages/music-core/src/engines/sample-kit/browser-export.test.ts`
- Modify: `packages/music-core/src/engines/sample-kit/index.ts`

**Interfaces:**
- Consumes: `SampleKit`, assignments, and resolved blobs.
- Produces:

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

export function buildMpcKitExport(
  kit: SampleKit,
  blobs: ReadonlyMap<string, Blob>,
): MpcKitExport;

export interface DirectoryExportResult {
  kind: "directory";
  folderName: string;
}

export interface ZipExportResult {
  kind: "zip";
  fileName: string;
  blob: Blob;
}

export function canExportToDirectory(scope?: Window & typeof globalThis): boolean;
export function writeMpcKitToDirectory(
  exportKit: MpcKitExport,
  root: FileSystemDirectoryHandle,
): Promise<DirectoryExportResult>;
export function buildMpcKitZip(exportKit: MpcKitExport): Promise<ZipExportResult>;
```

Re-export the pure and browser export contracts from
`packages/music-core/src/engines/sample-kit/index.ts`.

- [ ] **Step 1: Write failing pure export tests**

Create a kit containing `Kick & Bass.wav`, `Snare "Dry".wav`, one empty pad, and names that sanitize to the same stem. Assert:

```ts
test("builds a 16-pad XPM 2.1 drum program with relative sample references", async () => {
  const result = buildMpcKitExport(kitFixture(), blobMap());
  expect(result.folderName).toBe("My-Kit");
  expect(result.programFileName).toBe("My-Kit.xpm");
  expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
    "My-Kit.xpm",
    "Samples/036-Kick-Bass.wav",
    "Samples/038-Snare-Dry.wav",
  ]);
  const xml = await result.files[0]!.content.text();
  expect(xml).toContain("<File_Version>2.1</File_Version>");
  expect(xml).toContain('<Program type="Drum">');
  expect(xml).toContain("<ProgramName>My &amp; Kit</ProgramName>");
  expect(xml.match(/<Instrument number="/g)).toHaveLength(128);
  expect(xml).toContain("<SampleName>Samples/036-Kick-Bass</SampleName>");
});
```

Also reject:

- no assigned samples: `This kit has no assigned samples.`
- assignment to missing metadata: `A sample assigned to pad {midiNote} is missing.`
- missing blob with the same message;
- unsupported export extension;
- duplicate output path after sanitization.

- [ ] **Step 2: Implement safe export names and XPM projection**

The `.xpm` must be generated from code, not copied from the local MPC fixture. Use the fixture only as compatibility evidence. Generate:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MPCVObject>
  <Version>
    <File_Version>2.1</File_Version>
    <Application>MPC-V</Application>
    <Application_Version>3.0</Application_Version>
    <Platform>Standalone</Platform>
  </Version>
  <Program type="Drum">
    <ProgramName>...</ProgramName>
    <Program_Polyphony>0</Program_Polyphony>
    <Instruments>...</Instruments>
  </Program>
</MPCVObject>
```

Generate 128 `<Instrument number="N">` elements so Bank A is instruments 1-16 and maps MIDI 36-51. Each instrument has four layers; layer 1 contains the extensionless relative `SampleName` for assigned pads and layers 2-4 are empty:

```xml
<Instrument number="1">
  <Name>Kick</Name>
  <MidiNote>36</MidiNote>
  <MuteGroup>0</MuteGroup>
  <Layers>
    <Layer number="1">
      <Active>True</Active>
      <VelStart>0</VelStart>
      <VelEnd>127</VelEnd>
      <SampleName>Samples/036-Kick</SampleName>
    </Layer>
    ...
  </Layers>
</Instrument>
```

For instruments 17-128, emit empty names and layers with the corresponding MIDI note clamped to 0-127. XML-escape `& < > " '`. Limit stems to 64 ASCII characters before extensions and resolve collisions by appending `-2`, `-3`, and so on.

- [ ] **Step 3: Run pure export tests**

Run:

```bash
vp test packages/music-core/src/engines/sample-kit/mpc-export.test.ts --run
```

Expected: all XPM and validation tests PASS.

- [ ] **Step 4: Write failing browser export tests**

Use fake directory/file handles and JSZip:

```ts
test("writes the program and Samples directory to the selected root", async () => {
  const root = fakeDirectory();
  await writeMpcKitToDirectory(exportFixture(), root.handle);
  expect(root.text("My-Kit/My-Kit.xpm")).toContain("<MPCVObject>");
  expect(root.text("My-Kit/Samples/036-Kick.wav")).toBe("kick");
});

test("creates a ZIP with the identical folder structure", async () => {
  const result = await buildMpcKitZip(exportFixture());
  const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
  expect(Object.keys(archive.files).sort()).toEqual([
    "My-Kit/",
    "My-Kit/My-Kit.xpm",
    "My-Kit/Samples/",
    "My-Kit/Samples/036-Kick.wav",
  ]);
});
```

- [ ] **Step 5: Implement directory and ZIP adapters**

Directory writing must create the kit folder and nested handles from each `relativePath`, call `createWritable()`, write the blob, and close in `finally`. Convert cancellation to a result at the UI boundary; this low-level writer must propagate permission and write errors.

ZIP building must use the existing `jszip` dependency and return `{safeKitName}-mpc.zip`.

`canExportToDirectory()` returns true only when `isSecureContext === true` and `showDirectoryPicker` is a function.

- [ ] **Step 6: Run export checks**

Run:

```bash
vp test packages/music-core/src/engines/sample-kit/mpc-export.test.ts packages/music-core/src/engines/sample-kit/browser-export.test.ts --run
vp run @repo/music-core#check
```

Expected: export suites PASS and Music core type-checks.

- [ ] **Step 7: Commit**

```bash
git add packages/music-core/src/engines/sample-kit
git commit -m "feat(music): export sample kits for MPC"
```

---

### Task 4: Pad-Addressed Sound And Browser Playback Lifecycle

**Files:**
- Modify: `packages/music-core/src/engines/sound/index.ts`
- Modify: `packages/music-core/src/engines/sound/sound.test.ts`
- Create: `src/routes/music/studio/_components/sample-kit-playback.ts`
- Create: `src/routes/music/studio/_components/sample-kit-playback.test.ts`
- Modify: `src/routes/music/_runtime.svelte.ts`
- Modify: `src/routes/music/_runtime.svelte.test.ts`

**Interfaces:**
- Consumes: Task 2 `SampleKitStore`, shared `SoundEngine`, and browser blobs.
- Produces:

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

// SoundEngine additions
export type ToneTime = number | string;
loadDrumKit(samples: DrumPadSample[]): Promise<void>;
playDrum(padId: string, time?: ToneTime, velocity?: number): void;
playDrumPattern(steps: DrumPatternStep[], velocity?: number): void;
startDrumPatternLoop(
  steps: DrumPatternStep[],
  durationSec: number,
  velocity?: number,
): void;
stopDrumPatternLoop(): void;

export interface ActiveSamplePad {
  midiNote: MpcPadMidi;
  padId: string;
  sampleId: string;
  label: string;
  status: "playable" | "export-only" | "missing";
}

export interface ActiveSampleKit {
  kitId: string;
  name: string;
  pads: ActiveSamplePad[];
}

export interface SampleKitPlaybackOptions {
  sound: Pick<SoundEngine, "loadDrumKit" | "playDrum">;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  canDecode?: (blob: Blob) => Promise<boolean>;
}

export class SampleKitPlaybackController {
  constructor(options: SampleKitPlaybackOptions);
  activate(resolved: ResolvedSampleKit): Promise<ActiveSampleKit>;
  playMidi(midiNote: number, velocity?: number): boolean;
  padIdForMidi(midiNote: number): string | undefined;
  dispose(): void;
}
```

- [ ] **Step 1: Write failing sound tests**

Extend the Tone mock so each player name is observable. Test:

```ts
test("loads pad IDs, applies velocity, and disposes replaced players", async () => {
  const sound = enabledSound();
  await sound.loadDrumKit([{ padId: "pad-36", midiNote: 36, url: "blob:kick" }]);
  sound.playDrum("pad-36", 12, 0.4);
  expect(playerFor("pad-36").volume.value).toBe(gainToDb(0.4));
  expect(playerFor("pad-36").start).toHaveBeenCalledWith(12);

  await sound.loadDrumKit([{ padId: "pad-38", midiNote: 38, url: "blob:snare" }]);
  expect(firstPlayersDispose).toHaveBeenCalledOnce();
});

test("schedules one drum-loop start time and replaces the prior timer", async () => {
  vi.useFakeTimers();
  const sound = enabledSound({ now: () => 10 });
  sound.startDrumPatternLoop([
    { padIds: ["pad-36"], offsetSeconds: 0 },
    { padIds: ["pad-38"], offsetSeconds: 0.5 },
  ], 1);
  expect(playerFor("pad-36").start).toHaveBeenCalledWith(10);
  expect(playerFor("pad-38").start).toHaveBeenCalledWith(10.5);
  sound.startDrumPatternLoop([{ padIds: ["pad-36"], offsetSeconds: 0 }], 2);
  vi.advanceTimersByTime(1_000);
  expect(playerFor("pad-36").start).toHaveBeenCalledTimes(2);
});
```

Also assert invalid duration rejection, explicit stop, and `dispose()` cleanup.

- [ ] **Step 2: Implement sound changes**

Rename `DrumSample.name` to `DrumPadSample.padId`, keep `midiNote` for caller projections, and add a separate `#drumPatternLoopTimer`.

```ts
playDrumPattern(steps: DrumPatternStep[], velocity = 0.8): void {
  if (!this.enabled || !this.#tone || !this.#players) return;
  const startAt = this.#tone.now();
  for (const step of steps) {
    for (const padId of step.padIds) {
      this.playDrum(padId, startAt + step.offsetSeconds, velocity);
    }
  }
}
```

`loadDrumKit()` must be transactional with respect to the active players:

```ts
const previous = this.#players;
const next = new tone.Players(urls);
const connected = this.#master ? next.connect(this.#master) : next.toDestination();
try {
  await tone.loaded();
} catch (error) {
  connected.dispose();
  throw error;
}
this.#players = connected;
previous?.dispose();
```

This preserves the working kit when replacement decoding/loading fails.
`startDrumPatternLoop()` mirrors `startPatternLoop()` but controls only the drum
timer. `dispose()` stops both loop timers and disposes players.

- [ ] **Step 3: Run sound tests**

Run:

```bash
vp test packages/music-core/src/engines/sound/sound.test.ts --run
```

Expected: all sound tests PASS, including existing synth/metronome/drone cases.

- [ ] **Step 4: Write failing playback-controller tests**

Test one playable WAV, one decode failure, and one missing blob:

```ts
test("loads only playable pads and revokes the previous kit after replacement", async () => {
  const urls: string[] = [];
  const revoked: string[] = [];
  const controller = new SampleKitPlaybackController({
    sound,
    createObjectURL: () => {
      const url = `blob:${urls.length + 1}`;
      urls.push(url);
      return url;
    },
    revokeObjectURL: (url) => revoked.push(url),
    canDecode: async (blob) => (await blob.text()) !== "bad",
  });

  const active = await controller.activate(resolvedKit([
    available(36, "kick", "good"),
    available(38, "snare", "bad"),
    missing(42, "hat"),
  ]));
  expect(active.pads.map(({ status }) => status)).toEqual([
    "playable", "export-only", "missing",
  ]);
  expect(sound.loadDrumKit).toHaveBeenCalledWith([
    expect.objectContaining({ padId: "pad-36", midiNote: 36 }),
  ]);
  expect(controller.playMidi(36, 0.7)).toBe(true);
  expect(controller.playMidi(38, 0.7)).toBe(false);

  await controller.activate(resolvedKit([available(39, "clap", "good")]));
  expect(revoked).toHaveLength(1);
  controller.dispose();
  expect(revoked).toHaveLength(2);
});
```

- [ ] **Step 5: Implement the playback controller**

Default `canDecode()` creates a short-lived `AudioContext`, calls `decodeAudioData(await blob.arrayBuffer())`, and closes the context in `finally`. Probe each assigned sample independently so one bad file does not prevent other pads from loading.

Create object URLs only for playable assignments. Await `sound.loadDrumKit(nextSamples)` before revoking prior URLs; if loading fails, revoke only the newly created URLs and keep the prior active kit unchanged.

- [ ] **Step 6: Attach the store to `MusicRuntime`**

Add:

```ts
import { SampleKitStore } from "@repo/music-core/engines/sample-kit";
import { deleteBinary, getBinary, putBinary } from "@repo/music-core/engines/store";

sampleKits = $state.raw<SampleKitStore | undefined>(undefined);
```

Inside `attachStorage(settings)`:

```ts
this.sampleKits = new SampleKitStore({
  repository: settings,
  binaries: {
    put: putBinary,
    get: getBinary,
    delete: deleteBinary,
  },
});
```

Add a runtime test that passes a fake settings repository, calls `attachStorage()`, and verifies `runtime.sampleKits?.create("Runtime Kit")` persists to `music.sample-kits`.

- [ ] **Step 7: Validate Svelte/runtime code and run checks**

Run:

```bash
npx @sveltejs/mcp svelte-autofixer src/routes/music/_runtime.svelte.ts --svelte-version 5
vp test packages/music-core/src/engines/sound/sound.test.ts src/routes/music/studio/_components/sample-kit-playback.test.ts src/routes/music/_runtime.svelte.test.ts --run
vp run -r check
```

Expected: autofixer reports no blocking issue, focused tests PASS, and recursive check is clean apart from known warnings.

- [ ] **Step 8: Commit**

```bash
git add packages/music-core/src/engines/sound src/routes/music/_runtime.svelte.ts src/routes/music/_runtime.svelte.test.ts src/routes/music/studio/_components/sample-kit-playback.ts src/routes/music/studio/_components/sample-kit-playback.test.ts
git commit -m "feat(music): play persistent MPC sample kits"
```

---

### Task 5: Sample Kit Panel

**Files:**
- Create: `src/routes/music/studio/_components/SampleKitPanel.svelte`
- Create: `src/routes/music/studio/_components/SampleKitPanel.svelte.test.ts`

**Interfaces:**
- Consumes: `SampleKitStore`, `SampleKit`, `ActiveSampleKit`, Bank A constants, and export callbacks.
- Produces:

```ts
interface SampleKitPanelProps {
  store: SampleKitStore;
  activeKit?: ActiveSampleKit;
  onactivate: (kitId: string) => Promise<void>;
  onaudition: (midiNote: MpcPadMidi) => void;
  ondirectoryexport: (kitId: string) => Promise<void>;
  onzipexport: (kitId: string) => Promise<void>;
  directoryExportAvailable: boolean;
}
```

- [ ] **Step 1: Write failing component tests**

Use an in-memory `SampleKitStore`. Test:

```ts
test("creates a kit, imports files, and renders deterministic pad assignments", async () => {
  render(SampleKitPanel, { store, ...callbacks });
  await user.click(screen.getByRole("button", { name: "New kit" }));
  await user.type(screen.getByLabelText("Kit name"), "Live Set");
  await user.click(screen.getByRole("button", { name: "Create kit" }));
  await user.upload(screen.getByLabelText("Import samples"), [
    audioFile("kick.wav"),
    audioFile("snare.wav"),
    audioFile("closed-hat.wav"),
  ]);
  expect(screen.getByRole("button", { name: /Pad 1.*Kick/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /Pad 3.*Snare/i })).toBeVisible();
  expect(screen.getByRole("button", { name: /Pad 7.*Closed Hat/i })).toBeVisible();
});
```

Also test rename/delete confirmation, reassignment replacing an occupied pad, clear assignment, unassigned sample pool, activation loading state, export-only/missing badges, directory capability state, ZIP fallback, exact user-facing errors, and no document horizontal overflow at a 375px viewport.

Lock these feature messages in the tests:

```ts
[
  "Choose at least one audio sample.",
  "Sample storage is unavailable in this browser.",
  "The sample could not be decoded for browser playback. It remains available for MPC export.",
  "This kit has no assigned samples.",
  "Directory access was cancelled. Download a ZIP instead.",
]
```

- [ ] **Step 2: Implement reactive component state**

Use Svelte 5 runes:

```ts
let kits = $state.raw<SampleKit[]>([]);
let selectedKitId = $state<string>();
let busy = $state(false);
let message = $state("Create or select a kit.");
let error = $state<string>();
let selectedKit = $derived(kits.find((kit) => kit.id === selectedKitId));
```

Load in `onMount()`. All mutations call the store, replace `kits` with the returned fresh state, and preserve selection. Do not mutate a persisted kit object in place.

- [ ] **Step 3: Build the UI from `@repo/ui`**

Use existing `Button`, `Card`, `Dialog`, `Input`, `Label`, `Select`, `Badge`, and `Progress` exports. The panel contains:

- kit selector and CRUD controls;
- hidden multi-file input with an explicit button/label;
- 4x4 keyed Bank A grid ordered by `MPC_BANK_A_MIDI`;
- pad number, MIDI note, label, and playable/export-only/missing status;
- per-pad assign select and clear action;
- unassigned sample list;
- Activate button;
- directory export when supported and ZIP export always.

Every pad must remain a real button with an accessible name like `Pad 1, MIDI 36, Kick`. Use `min-w-0`, wrapping labels, and a four-column grid that remains inside its parent.

- [ ] **Step 4: Validate the component**

Run:

```bash
npx @sveltejs/mcp svelte-autofixer src/routes/music/studio/_components/SampleKitPanel.svelte --svelte-version 5
vp test src/routes/music/studio/_components/SampleKitPanel.svelte.test.ts --run
vp run -r check
```

Expected: autofixer has no blocking issue, component tests PASS, and recursive check passes.

- [ ] **Step 5: Commit**

```bash
git add src/routes/music/studio/_components/SampleKitPanel.svelte src/routes/music/studio/_components/SampleKitPanel.svelte.test.ts
git commit -m "feat(music): add Studio sample kit panel"
```

---

### Task 6: Studio MIDI Audition, Hybrid Sequencing, And Export Flow

**Files:**
- Modify: `src/routes/music/studio/+page.svelte`
- Modify: `src/routes/music/studio/page.svelte.test.ts`
- Modify: `e2e/music-studio.spec.ts`

**Interfaces:**
- Consumes: Tasks 3-5, shared runtime router/sound/store, and existing `StepSequencer`.
- Produces: complete `/music/studio` workflow.

- [ ] **Step 1: Write failing route tests**

Extend the runtime mock with `sampleKits`, `router.subscribe`, `sound.loadDrumKit`, `playDrum`, `startDrumPatternLoop`, and `stopDrumPatternLoop`.

Test:

```ts
test("auditions assigned MPC notes and ignores unrelated notes", async () => {
  render(Page, { runtime });
  await activateKit();
  routerListener(noteOn(36, 0.65, "midi"));
  routerListener(noteOn(60, 0.65, "midi"));
  expect(runtime.sound.playDrum).toHaveBeenCalledWith("pad-36", undefined, 0.65);
  expect(runtime.sound.playNote).not.toHaveBeenCalledWith(60, expect.anything());
});

test("loops assigned rows as samples and unassigned rows as synth fallback", async () => {
  render(Page, { runtime });
  await activateKitWithPads([36, 38]);
  await playbackSources[0]!.play();
  expect(runtime.sound.startDrumPatternLoop).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ padIds: ["pad-36"], offsetSeconds: 0 }),
    ]),
    expect.any(Number),
    0.9,
  );
  expect(runtime.sound.startPatternLoop).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ midiNotes: expect.arrayContaining([42]) }),
    ]),
    expect.any(Number),
    0.9,
  );
});

test("stops both playback paths and disposes sample URLs on route teardown", () => {
  const { unmount } = render(Page, { runtime });
  unmount();
  expect(runtime.sound.stopDrumPatternLoop).toHaveBeenCalled();
  expect(runtime.sound.stopPatternLoop).toHaveBeenCalled();
  expect(playbackController.dispose).toHaveBeenCalled();
  expect(routerUnsubscribe).toHaveBeenCalled();
});
```

Retain the existing pattern persistence assertions.

- [ ] **Step 2: Project hybrid pattern steps**

Keep `BOOM_BAP_KIT` row IDs and MIDI notes. Replace `patternSteps()` with:

```ts
interface StudioPatternProjection {
  drums: DrumPatternStep[];
  synth: SoundPatternStep[];
}

function projectPattern(rows = grid): StudioPatternProjection {
  const secondsPerStep = secondsPerSixteenth();
  const drums: DrumPatternStep[] = [];
  const synth: SoundPatternStep[] = [];

  for (let step = 0; step < STEPS; step += 1) {
    const activeRows = sequencer.rows.filter((_, rowIndex) => rows[rowIndex]?.[step] ?? false);
    const padIds = activeRows
      .map((row) => playback?.padIdForMidi(row.midi))
      .filter((padId): padId is string => padId !== undefined);
    const midiNotes = activeRows
      .filter((row) => playback?.padIdForMidi(row.midi) === undefined)
      .map((row) => row.midi);

    if (padIds.length > 0) drums.push({ padIds, offsetSeconds: step * secondsPerStep });
    if (midiNotes.length > 0) {
      synth.push({
        midiNotes,
        offsetSeconds: step * secondsPerStep,
        durationSeconds: Math.min(0.16, secondsPerStep * 0.9),
      });
    }
  }
  return { drums, synth };
}
```

Change the existing `808` row from MIDI 35 to a Bank A note only if the product label/mapping is deliberately changed; otherwise it remains synth fallback because Bank A support is strictly 36-51.

- [ ] **Step 3: Wire activation, audition, and shared transport**

At component initialization, create one playback controller and subscribe to
the router. Because the parent layout attaches storage from `onMount`, use an
effect that reacts once `runtime.sampleKits` becomes available rather than
reading it only in the child `onMount`:

```ts
const playback = new SampleKitPlaybackController({ sound: runtime.sound });
let initializedStore = $state<SampleKitStore>();

$effect(() => {
  const store = runtime.sampleKits;
  if (!store || initializedStore === store) return;
  initializedStore = store;
  void loadStudioKits(store);
});
```

Render `SampleKitPanel` only when `runtime.sampleKits` is defined; otherwise
render the existing card skeleton/status rather than constructing a second
store. Then:

- subscribe to `runtime.router`;
- for `noteOn` MIDI 36-51, call `playback.playMidi(event.midiNote, event.velocity)`;
- load the previously active kit ID from `music.studio.active-sample-kit`;
- activate it only after audio is enabled by a user action.

On-screen pads call one `auditionPad(midiNote)` function. It first enables audio, then plays the assigned sample, otherwise calls `runtime.sound.playNote()` for synth fallback.

The route's one `PlaybackSource` must call:

```ts
runtime.sound.startDrumPatternLoop(pattern.drums, durationSec, 0.9);
runtime.sound.startPatternLoop(pattern.synth, durationSec, 0.9);
```

Stop must always call both stop methods before resetting the indicator. Re-register the playback source when grid, BPM, or active kit changes.

- [ ] **Step 4: Wire directory and ZIP export**

For both paths:

1. Resolve the selected kit and its blobs from `SampleKitStore`.
2. Build `Map(binaryKey, blob)` and call `buildMpcKitExport()`.
3. Directory action calls `showDirectoryPicker({ mode: "readwrite" })` directly inside the click handler, then `writeMpcKitToDirectory()`.
4. If the picker throws `AbortError`, show `Directory access was cancelled. Download a ZIP instead.`
5. ZIP action calls `buildMpcKitZip()`, creates one temporary object URL, clicks
   an `<a download>`, and revokes the URL in a zero-delay timer after the click.
6. On partial directory failure show `The MPC export could not be written completely. Remove the partial folder before retrying.`

When directory capability is unavailable or permission is denied, show
`Choose an SD card or USB drive mounted on this computer.` and keep the ZIP
action enabled.

- [ ] **Step 5: Validate route Svelte and focused tests**

Run:

```bash
npx @sveltejs/mcp svelte-autofixer src/routes/music/studio/+page.svelte --svelte-version 5
vp test src/routes/music/studio/page.svelte.test.ts src/routes/music/studio/_components/SampleKitPanel.svelte.test.ts --run
vp run -r check
```

Expected: route/component tests PASS and recursive check succeeds.

- [ ] **Step 6: Add the end-to-end flow**

Generate valid one-frame PCM WAV buffers in `e2e/music-studio.spec.ts` rather than committing audio fixtures:

```ts
function wavFixture(sample: number): Buffer {
  const buffer = Buffer.alloc(46);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(38, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44_100, 24);
  buffer.writeUInt32LE(88_200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(2, 40);
  buffer.writeInt16LE(sample, 44);
  return buffer;
}
```

The E2E test must:

- create `E2E Kit`;
- upload `kick.wav`, `snare.wav`, and `closed-hat.wav` with `setInputFiles`;
- assert MIDI 36/38/42 labels;
- activate and click the Kick pad;
- toggle a step and start/stop playback;
- reload and verify kit metadata remains;
- download the ZIP;
- inspect it with JSZip for one `.xpm` and the expected sample paths;
- set viewport to 375x812 and assert `document.documentElement.scrollWidth <= innerWidth`.

- [ ] **Step 7: Run the Studio E2E**

Run only after the build/check process is idle:

```bash
./node_modules/.bin/playwright test e2e/music-studio.spec.ts
```

Expected: the existing sequencer test and new sample-kit flow PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/music/studio/+page.svelte src/routes/music/studio/page.svelte.test.ts e2e/music-studio.spec.ts
git commit -m "feat(music): wire MPC sample kits into Studio"
```

---

### Task 7: Milestone Gates, Documentation, And Deferred Hardware Verification

**Files:**
- Modify: `IMPLEMENTATION_PLAN.md`
- Modify: `docs/music-practice-lab-handoff.md`
- Modify: `src/routes/music/AGENTS.md`

**Interfaces:**
- Consumes: completed Tasks 1-6 and verification output.
- Produces: current implementation status and exact deferred MPC One+ checklist.

- [ ] **Step 1: Run the complete automated gate**

Run sequentially:

```bash
vp run -r check
vp test --run
vp run -r build
./node_modules/.bin/playwright test
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

Expected:

- recursive checks pass with only already-known warnings;
- all unit/component tests pass;
- production build succeeds;
- all Playwright specs pass;
- both domain harnesses complete successfully.

- [ ] **Step 2: Perform desktop/mobile browser verification**

At `/music/studio`:

- desktop: create/import/select/activate/rename/delete a kit;
- mobile 375px: confirm no page-level horizontal overflow and all 16 pads remain usable;
- verify an assigned sample and an unassigned synth fallback are audible;
- click Play repeatedly and confirm no overlapping duplicate loops;
- stop and navigate away; confirm audio stops;
- verify directory cancellation offers ZIP without losing the kit;
- inspect the ZIP folder names and `.xpm` text.

Record browser, OS, and exact outcomes in the handoff.

- [ ] **Step 3: Record physical MPC One+ verification as deferred**

Add this unchecked section to `docs/music-practice-lab-handoff.md`:

```markdown
### Deferred MPC One+ Sample-Kit Verification

- [ ] Use an exFAT SD card or USB drive.
- [ ] Export a kit containing kick, snare, closed hat, open hat, and one unassigned pad.
- [ ] Insert/connect the media to MPC One+ running the current MPC 3.x OS.
- [ ] Open Browser and load the exported `.xpm`.
- [ ] Verify Bank A pad 1-16 mapping, labels, original sample playback, and velocity response.
- [ ] Save the program on MPC, power-cycle/reopen it, and verify references remain valid.
- [ ] Record the exact MPC OS version and any XPM template changes required.
```

Do not claim hardware compatibility until this checklist is completed.

- [ ] **Step 4: Update implementation and agent guidance**

In `IMPLEMENTATION_PLAN.md`, mark the app-hosted sample-kit and MPC export slice complete, list deferred hardware verification, and keep Bank B-D/layers/choke groups as follow-ups.

In `src/routes/music/AGENTS.md`, add:

- sample-kit metadata belongs in `SampleKitStore`, not route local state;
- blobs belong in OPFS through shared store helpers;
- browser decode/object URLs belong in `sample-kit-playback.ts`;
- Tone ownership remains in `SoundEngine`;
- XPM compatibility changes require fixture-based tests and physical MPC verification;
- never copy or commit user-owned sample packs or the local MPC Bible fixture.

- [ ] **Step 5: Inspect the final diff and staged scope**

Run:

```bash
git status --short
git diff --stat
git diff -- packages/music-core src/routes/music e2e/music-studio.spec.ts
```

Confirm root deletions and tool directories remain untouched. Do not stage `docs/` or `IMPLEMENTATION_PLAN.md` unless the user explicitly requests tracking.

- [ ] **Step 6: Commit tracked guidance if appropriate**

If `src/routes/music/AGENTS.md` changed:

```bash
git add src/routes/music/AGENTS.md
git commit -m "docs(music): document sample kit architecture"
```

Keep the local handoff and implementation-plan updates available for the next session even when they remain untracked.

---

## Acceptance Checklist

- [ ] A user can create, rename, select, and delete a local sample kit.
- [ ] Supported one-shot files auto-map deterministically to Bank A MIDI 36-51.
- [ ] Existing/manual assignments survive later imports.
- [ ] Imports are transactional and do not leave orphan blobs after failure.
- [ ] Metadata and audio survive reload without a database migration.
- [ ] Browser-undecodable files remain exportable and do not break playable pads.
- [ ] Assigned on-screen and incoming MPC notes use samples through the shared runtime.
- [ ] Unassigned Studio rows retain synthesized fallback.
- [ ] Drum and synth loop playback start/stop together without duplicate overlapping loops.
- [ ] Replacing or leaving a kit disposes Tone players and revokes object URLs.
- [ ] MPC export contains one XPM 2.1 Drum Program and collision-free original sample files.
- [ ] Directory export writes to an explicitly selected mounted volume.
- [ ] ZIP fallback contains the identical folder structure.
- [ ] Desktop and 375px layouts have no page-level horizontal overflow.
- [ ] Full check, test, build, Playwright, and domain gates pass.
- [ ] MPC One+ physical verification remains explicitly deferred until completed on hardware.
