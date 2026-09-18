import type {
  PracticeSession,
  Score,
  ScoringEvent,
  Skill,
  SkillMastery,
} from "@repo/music-core/domain";

import { getBinary } from "./index";
import type {
  AudioTakeRow,
  ChordLibraryRow,
  ImportedBackingTrackRow,
  PracticeStore,
  SettingsRecord,
  SkillRelationshipRow,
  SongRow,
} from "./index";
import { TAKE_GAIN_DB_RANGE, withMediaLibraryMutationLock } from "../media-library/index";
import { TEMPO_LADDER_SETTINGS_ID } from "../technique-session/tempo-ladder";
import { validateTuning, type TuningProfile } from "../tunings/index";

export const MUSIC_DATA_BACKUP_MAX_BYTES = 50 * 1024 * 1024;

export interface MusicDataBackupTables {
  sessions: PracticeSession[];
  scoringEvents: ScoringEvent[];
  skillMastery: SkillMastery[];
  skills: Skill[];
  skillRelationships: SkillRelationshipRow[];
  chordLibrary: ChordLibraryRow[];
  songs: SongRow[];
  settings: SettingsRecord[];
  backingTracks: ImportedBackingTrackRow[];
  audioTakes: AudioTakeRow[];
}

/** Current data backup format. Version 1 (no take gain/note) still restores. */
export const MUSIC_DATA_BACKUP_VERSION = 2;

export type MusicDataBackupVersion = 1 | 2;

export interface MusicDataBackup {
  format: "practice-os-data-backup";
  version: MusicDataBackupVersion;
  exportedAt: string;
  tables: MusicDataBackupTables;
  media: {
    included: false;
    backingTrackFiles: number;
    audioTakeFiles: number;
    sampleFiles: number;
  };
}

/** @deprecated Kept for callers written against the first format version. */
export type MusicDataBackupV1 = MusicDataBackup;

export interface PreparedMusicDataBackup {
  backup: MusicDataBackup;
  json: string;
  byteSize: number;
  counts: Record<keyof MusicDataBackupTables, number>;
}

export interface RestoreOptions {
  getBinary?(key: string): Promise<Blob | undefined>;
  withMutationLock?<T>(operation: () => Promise<T>): Promise<T>;
}

const TABLE_NAMES = [
  "sessions",
  "scoringEvents",
  "skillMastery",
  "skills",
  "skillRelationships",
  "chordLibrary",
  "songs",
  "settings",
  "backingTracks",
  "audioTakes",
] as const;

const INSTRUMENTS = new Set(["piano", "guitar", "ukulele", "aerophone", "mpc", "voice"]);
const CAPABILITIES = new Set([
  "pitch",
  "rhythm",
  "harmony",
  "reading",
  "technique",
  "ear",
  "improv",
  "repertoire",
  "production",
]);
const INPUT_SOURCES = new Set(["midi", "audio", "onscreen", "click"]);
const MODALITIES = new Set(["played", "heard", "read", "sung", "written", "tapped", "recognized"]);

export async function prepareMusicDataBackup(
  store: PracticeStore,
  now: () => Date = () => new Date(),
): Promise<PreparedMusicDataBackup> {
  const database = store.database;
  const tables = await database.transaction(
    "r",
    TABLE_NAMES.map((name) => database[name]),
    async () => ({
      sessions: await database.sessions.toArray(),
      scoringEvents: await database.scoringEvents.toArray(),
      skillMastery: await database.skillMastery.toArray(),
      skills: await database.skills.toArray(),
      skillRelationships: await database.skillRelationships.toArray(),
      chordLibrary: await database.chordLibrary.toArray(),
      songs: await database.songs.toArray(),
      settings: await database.settings.toArray(),
      backingTracks: await database.backingTracks.toArray(),
      audioTakes: await database.audioTakes.toArray(),
    }),
  );
  const backup = validateMusicDataBackup({
    format: "practice-os-data-backup",
    version: MUSIC_DATA_BACKUP_VERSION,
    exportedAt: now().toISOString(),
    tables,
    media: {
      included: false,
      backingTrackFiles: tables.backingTracks.length,
      audioTakeFiles: tables.audioTakes.length,
      sampleFiles: sampleAssets(tables.settings).length,
    },
  });
  const json = JSON.stringify(backup, null, 2);
  return {
    backup,
    json,
    byteSize: new TextEncoder().encode(json).byteLength,
    counts: tableCounts(backup.tables),
  };
}

export function parseMusicDataBackup(json: string): MusicDataBackup {
  if (json.trim() === "") throw new Error("The data backup file is empty.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The data backup file is not valid JSON.");
  }
  return validateMusicDataBackup(parsed);
}

export function validateMusicDataBackup(input: unknown): MusicDataBackup {
  assertPlainObject(input, "backup");
  if (input.format !== "practice-os-data-backup") fail("backup.format", "is unsupported");
  if (input.version !== 1 && input.version !== MUSIC_DATA_BACKUP_VERSION)
    fail("backup.version", "is unsupported");
  assertString(input.exportedAt, "backup.exportedAt");
  if (!Number.isFinite(Date.parse(input.exportedAt)))
    fail("backup.exportedAt", "must be an ISO date");
  assertPlainObject(input.tables, "backup.tables");
  const keys = Object.keys(input.tables).sort();
  const expected = [...TABLE_NAMES].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("backup.tables", "must contain exactly the ten supported tables");
  }
  for (const name of TABLE_NAMES) assertArray(input.tables[name], `backup.tables.${name}`);

  validateRows(input.tables as unknown as Record<string, unknown[]>);
  assertPlainObject(input.media, "backup.media");
  if (input.media.included !== false) fail("backup.media.included", "must be false");
  assertInteger(input.media.backingTrackFiles, "backup.media.backingTrackFiles", 0);
  assertInteger(input.media.audioTakeFiles, "backup.media.audioTakeFiles", 0);
  assertInteger(input.media.sampleFiles, "backup.media.sampleFiles", 0);
  const rawTables = input.tables as unknown as MusicDataBackupTables;
  if (
    input.media.backingTrackFiles !== rawTables.backingTracks.length ||
    input.media.audioTakeFiles !== rawTables.audioTakes.length ||
    input.media.sampleFiles !== sampleAssets(rawTables.settings).length
  ) {
    fail("backup.media", "counts do not match the referenced media metadata");
  }

  const cloned = structuredClone(input) as unknown as MusicDataBackup;
  cloned.tables.settings = cloned.tables.settings.map((row) => ({
    id: row.id,
    value: row.value,
  }));
  return cloned;
}

export async function restoreMusicDataBackup(
  store: PracticeStore,
  input: unknown,
  options: RestoreOptions = {},
): Promise<void> {
  const backup = validateMusicDataBackup(structuredClone(input));
  const readBinary = options.getBinary ?? getBinary;
  const withLock = options.withMutationLock ?? withMediaLibraryMutationLock;

  await withLock(async () => {
    const before = await readCurrentMedia(store);
    assertCurrentMediaPreserved(before, backup.tables);
    await assertNoNewBinaryCollisions(before, backup.tables, readBinary);

    const database = store.database;
    await database.transaction(
      "rw",
      TABLE_NAMES.map((name) => database[name]),
      async () => {
        const current = await readCurrentMedia(store);
        assertCurrentMediaPreserved(current, backup.tables);
        for (const name of TABLE_NAMES) await database[name].clear();
        for (const name of TABLE_NAMES) {
          const rows = backup.tables[name];
          if (rows.length > 0) await database.table(name).bulkAdd(rows);
        }
      },
    );
  });
}

export function tableCounts(
  tables: MusicDataBackupTables,
): Record<keyof MusicDataBackupTables, number> {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, tables[name].length])) as Record<
    keyof MusicDataBackupTables,
    number
  >;
}

function validateRows(tables: Record<string, unknown[]>): void {
  for (const name of TABLE_NAMES) {
    const primaryKey = name === "skillMastery" ? "skillId" : "id";
    const seen = new Set<string>();
    tables[name]!.forEach((row, index) => {
      const path = `backup.tables.${name}[${index}]`;
      assertPlainObject(row, path);
      assertString(row[primaryKey], `${path}.${primaryKey}`, true);
      const key = row[primaryKey] as string;
      if (seen.has(key)) fail(path, `has duplicate ${primaryKey} '${key}'`);
      seen.add(key);
      if (name === "settings") {
        for (const [field, item] of Object.entries(row)) {
          if (field === "value" && item === undefined) continue;
          validateJsonValue(item, `${path}.${field}`);
        }
      } else {
        validateJsonValue(row, path);
      }
      validateRow(name, row, path);
    });
  }
  const backingIds = new Set(
    tables.backingTracks!.map((row) => (row as Record<string, unknown>).id as string),
  );
  tables.audioTakes!.forEach((value, index) => {
    const row = value as Record<string, unknown>;
    const path = `backup.tables.audioTakes[${index}]`;
    if (row.backingKind === "imported") {
      assertString(row.backingTrackId, `${path}.backingTrackId`, true);
      if (!backingIds.has(row.backingTrackId))
        fail(`${path}.backingTrackId`, "does not reference an imported backing track");
      if (row.generatedBacking !== undefined)
        fail(`${path}.generatedBacking`, "is not valid with an imported backing");
    } else if (row.backingKind === "generated") {
      if (row.backingTrackId !== undefined)
        fail(`${path}.backingTrackId`, "is not valid with generated backing");
      if (row.generatedBacking === undefined)
        fail(`${path}.generatedBacking`, "is required with generated backing");
    } else if (row.backingTrackId !== undefined || row.generatedBacking !== undefined) {
      fail(path, "cannot include backing data without backingKind");
    }
  });
}

function validateRow(
  name: (typeof TABLE_NAMES)[number],
  row: Record<string, unknown>,
  path: string,
): void {
  switch (name) {
    case "sessions":
      validateSession(row, path);
      break;
    case "scoringEvents":
      validateScoringEvent(row, path);
      break;
    case "skillMastery":
      numberIn(row.mastery, `${path}.mastery`, 0, 1);
      numberIn(row.confidence, `${path}.confidence`, 0, 1);
      numberIn(row.decayRate, `${path}.decayRate`, 0);
      assertInteger(row.observations, `${path}.observations`, 0);
      optionalNumber(row.lastPracticed, `${path}.lastPracticed`);
      break;
    case "skills":
      assertString(row.name, `${path}.name`, true);
      enumValue(row.capability, CAPABILITIES, `${path}.capability`);
      assertInteger(row.version, `${path}.version`, 0);
      optionalStringArray(row.instruments, `${path}.instruments`, INSTRUMENTS);
      optionalStringArray(row.tags, `${path}.tags`);
      optionalStringArray(row.replacedBy, `${path}.replacedBy`);
      break;
    case "skillRelationships":
      assertString(row.from, `${path}.from`, true);
      assertString(row.to, `${path}.to`, true);
      enumValue(row.kind, new Set(["prerequisite", "component", "related"]), `${path}.kind`);
      if (row.threshold !== undefined) numberIn(row.threshold, `${path}.threshold`, 0, 1);
      break;
    case "chordLibrary":
      assertString(row.symbol, `${path}.symbol`, true);
      optionalStringArray(row.notes, `${path}.notes`);
      optionalStringArray(row.tags, `${path}.tags`);
      optionalNumber(row.createdAt, `${path}.createdAt`);
      if (row.event !== undefined) validateChordEvent(row.event, `${path}.event`);
      break;
    case "songs":
      assertString(row.title, `${path}.title`, true);
      optionalNumber(row.createdAt, `${path}.createdAt`);
      optionalNumber(row.updatedAt, `${path}.updatedAt`);
      if (row.score !== undefined) validateScore(row.score, `${path}.score`);
      if (row.source !== undefined) {
        assertPlainObject(row.source, `${path}.source`);
        if (row.source.format !== "musicxml") fail(`${path}.source.format`, "must be musicxml");
        assertString(row.source.content, `${path}.source.content`);
      }
      break;
    case "settings":
      validateSetting(row, path);
      break;
    case "backingTracks":
      validateMediaRow(row, path);
      break;
    case "audioTakes":
      validateMediaRow(row, path);
      enumValue(row.instrument, INSTRUMENTS, `${path}.instrument`);
      numberIn(row.backingOffsetMs, `${path}.backingOffsetMs`, 0);
      optionalString(row.backingTrackId, `${path}.backingTrackId`);
      optionalString(row.note, `${path}.note`);
      if (row.gainDb !== undefined)
        numberIn(row.gainDb, `${path}.gainDb`, TAKE_GAIN_DB_RANGE.min, TAKE_GAIN_DB_RANGE.max);
      if (row.backingKind !== undefined)
        enumValue(row.backingKind, new Set(["generated", "imported"]), `${path}.backingKind`);
      if (row.generatedBacking !== undefined) {
        assertPlainObject(row.generatedBacking, `${path}.generatedBacking`);
        assertString(
          row.generatedBacking.progressionId,
          `${path}.generatedBacking.progressionId`,
          true,
        );
        numberIn(row.generatedBacking.bpm, `${path}.generatedBacking.bpm`, 1);
        assertBoolean(row.generatedBacking.loop, `${path}.generatedBacking.loop`);
      }
      break;
  }
}

function validateSession(value: Record<string, unknown>, path: string): void {
  numberIn(value.startTime, `${path}.startTime`, 0);
  optionalNumber(value.endTime, `${path}.endTime`);
  if (value.instrument !== undefined)
    enumValue(value.instrument, INSTRUMENTS, `${path}.instrument`);
  enumValue(
    value.source,
    new Set(["free-practice", "daily-routine", "song", "drill", "jam"]),
    `${path}.source`,
  );
  optionalString(value.routineId, `${path}.routineId`);
  optionalStringArray(value.goalIds, `${path}.goalIds`);
  optionalString(value.nextTime, `${path}.nextTime`);
  assertArray(value.runs, `${path}.runs`);
  value.runs.forEach((run, index) => {
    const runPath = `${path}.runs[${index}]`;
    assertPlainObject(run, runPath);
    assertString(run.id, `${runPath}.id`, true);
    assertString(run.exerciseId, `${runPath}.exerciseId`, true);
    numberIn(run.startedAt, `${runPath}.startedAt`, 0);
    optionalNumber(run.endedAt, `${runPath}.endedAt`);
    stringArray(run.promptIds, `${runPath}.promptIds`);
    stringArray(run.targetSkillIds, `${runPath}.targetSkillIds`);
    numberIn(run.difficulty, `${runPath}.difficulty`, 0, 1);
    if (run.instrument !== undefined)
      enumValue(run.instrument, INSTRUMENTS, `${runPath}.instrument`);
  });
  assertArray(value.scoringEvents, `${path}.scoringEvents`);
  value.scoringEvents.forEach((event, index) => {
    assertPlainObject(event, `${path}.scoringEvents[${index}]`);
    validateScoringEvent(event, `${path}.scoringEvents[${index}]`);
  });
  numberIn(value.xpEarned, `${path}.xpEarned`, 0);
  stringArray(value.tags, `${path}.tags`);
  optionalString(value.notes, `${path}.notes`);
}

function validateScoringEvent(value: Record<string, unknown>, path: string): void {
  for (const field of ["id", "sessionId", "exerciseId"] as const)
    assertString(value[field], `${path}.${field}`, true);
  stringArray(value.skillIds, `${path}.skillIds`);
  assertArray(value.capabilities, `${path}.capabilities`);
  value.capabilities.forEach((item, index) =>
    enumValue(item, CAPABILITIES, `${path}.capabilities[${index}]`),
  );
  numberIn(value.at, `${path}.at`, 0);
  assertBoolean(value.correct, `${path}.correct`);
  numberIn(value.partialCredit, `${path}.partialCredit`, 0, 1);
  numberIn(value.difficulty, `${path}.difficulty`, 0, 1);
  optionalNumber(value.latencyMs, `${path}.latencyMs`);
  optionalString(value.runId, `${path}.runId`);
  if (value.modality !== undefined) enumValue(value.modality, MODALITIES, `${path}.modality`);
  if (value.source !== undefined)
    enumValue(value.source, new Set([...INPUT_SOURCES, "mixed"]), `${path}.source`);
  if (value.instrument !== undefined)
    enumValue(value.instrument, INSTRUMENTS, `${path}.instrument`);
  if (value.assistance !== undefined)
    enumValue(
      value.assistance,
      new Set(["independent", "hinted", "guided", "self-assessed"]),
      `${path}.assistance`,
    );
  assertArray(value.metrics, `${path}.metrics`);
  value.metrics.forEach((metric, index) => validateMetric(metric, `${path}.metrics[${index}]`));
  if (value.target !== undefined) validateScoringTarget(value.target, `${path}.target`);
  if (value.response !== undefined) validateScoringResponse(value.response, `${path}.response`);
}

function validateMetric(value: unknown, path: string): void {
  assertPlainObject(value, path);
  assertString(value.kind, `${path}.kind`);
  const kinds = new Set([
    "pitch",
    "timing",
    "velocity",
    "choice",
    "chord",
    "voice-leading",
    "chord-changes",
    "breath",
  ]);
  if (!kinds.has(value.kind)) fail(`${path}.kind`, "is unsupported");
  if (value.kind === "pitch") {
    assertInteger(value.expectedMidi, `${path}.expectedMidi`, 0, 127);
    if (value.actualMidi !== undefined)
      assertInteger(value.actualMidi, `${path}.actualMidi`, 0, 127);
    optionalNumber(value.cents, `${path}.cents`);
  }
  if (value.kind === "timing") {
    for (const field of ["expectedMs", "actualMs", "errorMs"] as const)
      numberIn(value[field], `${path}.${field}`);
  }
  if (value.kind === "velocity") {
    numberIn(value.expected, `${path}.expected`, 0, 1);
    numberIn(value.actual, `${path}.actual`, 0, 1);
  }
  if (value.kind === "choice") {
    assertString(value.expected, `${path}.expected`);
    optionalString(value.actual, `${path}.actual`);
  }
  if (value.kind === "chord") {
    numberArray(value.expectedPitchClasses, `${path}.expectedPitchClasses`, undefined, 0, 11, true);
    numberArray(value.actualPitchClasses, `${path}.actualPitchClasses`, undefined, 0, 11, true);
    optionalNumberArray(value.missingPitchClasses, `${path}.missingPitchClasses`, 0, 11, true);
    optionalNumberArray(value.extraPitchClasses, `${path}.extraPitchClasses`, 0, 11, true);
    if (value.expectedBass !== undefined)
      assertInteger(value.expectedBass, `${path}.expectedBass`, 0, 11);
    if (value.actualBass !== undefined)
      assertInteger(value.actualBass, `${path}.actualBass`, 0, 11);
    if (value.inversionCorrect !== undefined)
      assertBoolean(value.inversionCorrect, `${path}.inversionCorrect`);
  }
  if (value.kind === "voice-leading") {
    numberArray(value.fromMidi, `${path}.fromMidi`, undefined, 0, 127, true);
    numberArray(value.actualMidi, `${path}.actualMidi`, undefined, 0, 127, true);
    numberArray(value.register, `${path}.register`, 2, 0, 127, true);
    assertBoolean(value.membershipCorrect, `${path}.membershipCorrect`);
    numberIn(value.minimumSemitones, `${path}.minimumSemitones`, 0);
    optionalNumber(value.actualSemitones, `${path}.actualSemitones`);
  }
  if (value.kind === "chord-changes") {
    for (const field of ["tuningId", "fromShapeId", "toShapeId"] as const)
      assertString(value[field], `${path}.${field}`, true);
    numberIn(value.durationSeconds, `${path}.durationSeconds`, 0);
    assertInteger(value.completedChanges, `${path}.completedChanges`, 0);
    assertInteger(value.cleanChanges, `${path}.cleanChanges`, 0);
    if (value.cleanChanges > value.completedChanges)
      fail(`${path}.cleanChanges`, "cannot exceed completedChanges");
    numberIn(value.changesPerMinute, `${path}.changesPerMinute`, 0);
    numberArray(value.fromMidiNotes, `${path}.fromMidiNotes`, undefined, 0, 127, true);
    numberArray(value.toMidiNotes, `${path}.toMidiNotes`, undefined, 0, 127, true);
  }
  if (value.kind === "breath") {
    numberIn(value.steadiness, `${path}.steadiness`, 0, 1);
    optionalNumberArray(value.targetCurve, `${path}.targetCurve`, 0, 1);
    optionalNumberArray(value.actualCurve, `${path}.actualCurve`, 0, 1);
  }
}

function validateScoringTarget(value: unknown, path: string): void {
  assertPlainObject(value, path);
  assertString(value.label, `${path}.label`);
  optionalNumberArray(value.midiNotes, `${path}.midiNotes`, 0, 127, true);
  optionalString(value.choice, `${path}.choice`);
}

function validateScoringResponse(value: unknown, path: string): void {
  assertPlainObject(value, path);
  optionalString(value.label, `${path}.label`);
  optionalNumberArray(value.midiNotes, `${path}.midiNotes`, 0, 127, true);
  optionalString(value.choice, `${path}.choice`);
}

function validateScore(value: unknown, path: string): asserts value is Score {
  assertPlainObject(value, path);
  assertString(value.id, `${path}.id`, true);
  optionalString(value.title, `${path}.title`);
  optionalString(value.keySignature, `${path}.keySignature`);
  enumValue(
    value.origin,
    new Set(["midi", "musicxml", "abc", "audio-transcription", "generated"]),
    `${path}.origin`,
  );
  assertArray(value.tempoMap, `${path}.tempoMap`);
  if (value.tempoMap.length === 0) fail(`${path}.tempoMap`, "must not be empty");
  value.tempoMap.forEach((item, index) => {
    assertPlainObject(item, `${path}.tempoMap[${index}]`);
    numberIn(item.atBeat, `${path}.tempoMap[${index}].atBeat`, 0);
    numberIn(item.bpm, `${path}.tempoMap[${index}].bpm`, 1);
  });
  assertArray(value.timeSignatures, `${path}.timeSignatures`);
  value.timeSignatures.forEach((item, index) => {
    assertPlainObject(item, `${path}.timeSignatures[${index}]`);
    numberIn(item.atBeat, `${path}.timeSignatures[${index}].atBeat`, 0);
    assertInteger(item.numerator, `${path}.timeSignatures[${index}].numerator`, 1);
    assertInteger(item.denominator, `${path}.timeSignatures[${index}].denominator`, 1);
  });
  assertArray(value.voices, `${path}.voices`);
  const voices = new Set<string>();
  value.voices.forEach((voice, index) => {
    assertPlainObject(voice, `${path}.voices[${index}]`);
    assertString(voice.id, `${path}.voices[${index}].id`, true);
    if (voices.has(voice.id)) fail(`${path}.voices[${index}].id`, "is duplicated");
    voices.add(voice.id);
    assertString(voice.name, `${path}.voices[${index}].name`);
    enumValue(
      voice.role,
      new Set(["melody", "harmony", "bass", "drums", "other"]),
      `${path}.voices[${index}].role`,
    );
  });
  for (const lane of ["notes", "chords", "sections", "markers"] as const)
    assertArray(value[lane], `${path}.${lane}`);
  const notes = value.notes as unknown[];
  const chords = value.chords as unknown[];
  const sections = value.sections as unknown[];
  const markers = value.markers as unknown[];
  notes.forEach((note, index) => {
    assertPlainObject(note, `${path}.notes[${index}]`);
    assertInteger(note.midiNote, `${path}.notes[${index}].midiNote`, 0, 127);
    numberIn(note.startBeat, `${path}.notes[${index}].startBeat`, 0);
    numberIn(note.durationBeats, `${path}.notes[${index}].durationBeats`, 0);
    numberIn(note.velocity, `${path}.notes[${index}].velocity`, 0, 1);
    assertString(note.voiceId, `${path}.notes[${index}].voiceId`, true);
    if (!voices.has(note.voiceId))
      fail(`${path}.notes[${index}].voiceId`, "does not reference a voice");
    optionalStringArray(note.articulations, `${path}.notes[${index}].articulations`);
    if (note.drumArticulation !== undefined)
      enumValue(
        note.drumArticulation,
        new Set([
          "kick",
          "snare",
          "closedHat",
          "openHat",
          "rim",
          "clap",
          "tom",
          "crash",
          "ride",
          "perc",
        ]),
        `${path}.notes[${index}].drumArticulation`,
      );
    if (note.writtenPitch !== undefined)
      validateWrittenPitch(note.writtenPitch, `${path}.notes[${index}].writtenPitch`);
    if (note.tie !== undefined) validateTie(note.tie, `${path}.notes[${index}].tie`);
    if (note.tuplet !== undefined) validateTuplet(note.tuplet, `${path}.notes[${index}].tuplet`);
  });
  if (value.rests !== undefined) {
    assertArray(value.rests, `${path}.rests`);
    value.rests.forEach((rest, index) => {
      const restPath = `${path}.rests[${index}]`;
      assertPlainObject(rest, restPath);
      numberIn(rest.startBeat, `${restPath}.startBeat`, 0);
      numberIn(rest.durationBeats, `${restPath}.durationBeats`, 0);
      assertString(rest.voiceId, `${restPath}.voiceId`, true);
      if (!voices.has(rest.voiceId)) fail(`${restPath}.voiceId`, "does not reference a voice");
      if (rest.tuplet !== undefined) validateTuplet(rest.tuplet, `${restPath}.tuplet`);
    });
  }
  chords.forEach((event, index) => validateChordEvent(event, `${path}.chords[${index}]`));
  sections.forEach((section, index) => {
    assertPlainObject(section, `${path}.sections[${index}]`);
    assertString(section.id, `${path}.sections[${index}].id`, true);
    assertString(section.name, `${path}.sections[${index}].name`);
    numberIn(section.startBeat, `${path}.sections[${index}].startBeat`, 0);
    numberIn(section.endBeat, `${path}.sections[${index}].endBeat`, section.startBeat as number);
  });
  assertUniqueObjectIds(sections, `${path}.sections`);
  markers.forEach((marker, index) => {
    assertPlainObject(marker, `${path}.markers[${index}]`);
    assertString(marker.id, `${path}.markers[${index}].id`, true);
    assertString(marker.label, `${path}.markers[${index}].label`);
    numberIn(marker.beat, `${path}.markers[${index}].beat`, 0);
    if (marker.endBeat !== undefined)
      numberIn(marker.endBeat, `${path}.markers[${index}].endBeat`, marker.beat as number);
    enumValue(
      marker.kind,
      new Set(["loop", "practice", "mistake", "annotation"]),
      `${path}.markers[${index}].kind`,
    );
  });
  assertUniqueObjectIds(markers, `${path}.markers`);
  if (value.lyrics !== undefined) {
    assertArray(value.lyrics, `${path}.lyrics`);
    value.lyrics.forEach((lyric, index) => {
      assertPlainObject(lyric, `${path}.lyrics[${index}]`);
      assertString(lyric.text, `${path}.lyrics[${index}].text`);
      numberIn(lyric.startBeat, `${path}.lyrics[${index}].startBeat`, 0);
    });
  }
}

function validateWrittenPitch(value: unknown, path: string): void {
  assertPlainObject(value, path);
  enumValue(value.step, new Set(["A", "B", "C", "D", "E", "F", "G"]), `${path}.step`);
  if (value.accidental !== undefined)
    enumValue(value.accidental, new Set(["bb", "b", "natural", "#", "##"]), `${path}.accidental`);
  assertInteger(value.octave, `${path}.octave`);
}

function validateTie(value: unknown, path: string): void {
  assertPlainObject(value, path);
  assertString(value.id, `${path}.id`, true);
  if (value.start !== undefined) assertBoolean(value.start, `${path}.start`);
  if (value.stop !== undefined) assertBoolean(value.stop, `${path}.stop`);
}

function validateTuplet(value: unknown, path: string): void {
  assertPlainObject(value, path);
  assertString(value.id, `${path}.id`, true);
  assertInteger(value.actual, `${path}.actual`, 1);
  assertInteger(value.normal, `${path}.normal`, 1);
}

function validateChordEvent(value: unknown, path: string): void {
  assertPlainObject(value, path);
  assertString(value.symbol, `${path}.symbol`, true);
  numberIn(value.startBeat, `${path}.startBeat`, 0);
  if (value.durationBeats !== undefined) numberIn(value.durationBeats, `${path}.durationBeats`, 0);
}

function validateMediaRow(row: Record<string, unknown>, path: string): void {
  assertString(row.name, `${path}.name`, true);
  assertString(row.mimeType, `${path}.mimeType`, true);
  numberIn(row.size, `${path}.size`, 0);
  numberIn(row.durationMs, `${path}.durationMs`, 0);
  numberIn(row.createdAt, `${path}.createdAt`, 0);
}

function validateSetting(row: Record<string, unknown>, path: string): void {
  if (!("value" in row) || row.value === undefined) return;
  const value = row.value;
  const settingPath = `${path} (${row.id})`;
  if (row.id === "music.settings") validatePartialMusicSettings(value, settingPath);
  else if (row.id === "music.recording.midi-takes") validateMidiTakes(value, settingPath);
  else if (row.id === "music.sample-kits") validateSampleKits(value, settingPath);
  else if (row.id === "music.piano-roll.score") validateScore(value, `${settingPath}.value`);
  else if (row.id === "music.piano-roll.pending-take-import") {
    assertPlainObject(value, `${settingPath}.value`);
    validateTake(value.take, `${settingPath}.value.take`);
    numberIn(value.bpm, `${settingPath}.value.bpm`, 1);
  } else if (row.id === "skills.processed-events.v1")
    uniqueStringArray(value, `${settingPath}.value`);
  else if (row.id === "progress.state.v1") validateProgress(value, settingPath);
  else if (row.id === "music.device-profiles") validateDeviceProfiles(value, settingPath);
  else if (row.id === "music.custom-tunings") validateCustomTunings(value, settingPath);
  else if (row.id === "music.studio.boom-bap") validateStudioPattern(value, settingPath);
  else if (row.id === "music.studio.active-sample-kit") assertString(value, `${settingPath}.value`);
  else if (row.id === TEMPO_LADDER_SETTINGS_ID) validateTempoLadder(value, settingPath);
}

/** Tempo ladder rungs: one unlocked BPM per drill variant key. */
function validateTempoLadder(value: unknown, path: string): void {
  assertPlainObject(value, `${path}.value`);
  for (const [variantKey, bpm] of Object.entries(value)) {
    numberIn(bpm, `${path}.value.${variantKey}`, 1);
  }
}

function validatePartialMusicSettings(value: unknown, path: string): void {
  assertPlainObject(value, `${path}.value`);
  for (const field of [
    "echoCancellation",
    "reduceMotion",
    "instrumentColorCoding",
    "muted",
    "metronomeEnabled",
  ] as const) {
    if (value[field] !== undefined) assertBoolean(value[field], `${path}.value.${field}`);
  }
  if (value.audioInputLabel !== undefined)
    assertString(value.audioInputLabel, `${path}.value.audioInputLabel`);
  for (const field of ["audioOffsetMs", "midiOffsetMs"] as const)
    if (value[field] !== undefined) numberIn(value[field], `${path}.value.${field}`);
  for (const field of ["playbackLevel", "metronomeLevel", "masterLevel"] as const)
    if (value[field] !== undefined) numberIn(value[field], `${path}.value.${field}`, 0, 1);
  if (
    value.countInBars !== undefined &&
    ![0, 1, 2, "0", "1", "2"].includes(value.countInBars as number | string)
  )
    fail(`${path}.value.countInBars`, "is invalid");
  if (value.activeInstrument !== undefined)
    enumValue(value.activeInstrument, INSTRUMENTS, `${path}.value.activeInstrument`);
  if (value.preferredPlaybackSound !== undefined)
    enumValue(
      value.preferredPlaybackSound,
      new Set(["salamander-piano", "warm-synth", "synth", "e-piano", "square", "saw"]),
      `${path}.value.preferredPlaybackSound`,
    );
  if (value.defaultSoundSet !== undefined)
    enumValue(
      value.defaultSoundSet,
      new Set(["Salamander Piano", "Warm Synth", "Synth", "E-Piano", "Square", "Saw"]),
      `${path}.value.defaultSoundSet`,
    );
  if (value.tempoByVariant !== undefined) {
    assertPlainObject(value.tempoByVariant, `${path}.value.tempoByVariant`);
    for (const [key, bpm] of Object.entries(value.tempoByVariant))
      numberIn(bpm, `${path}.value.tempoByVariant.${key}`, 20, 300);
  }
}

function validateMidiTakes(value: unknown, path: string): void {
  assertArray(value, `${path}.value`);
  const ids = new Set<string>();
  value.forEach((take, index) => {
    validateTake(take, `${path}.value[${index}]`);
    const id = (take as { id: string }).id;
    if (ids.has(id)) fail(`${path}.value[${index}].id`, "is duplicated");
    ids.add(id);
  });
}

function validateTake(value: unknown, path: string): void {
  assertPlainObject(value, path);
  assertString(value.id, `${path}.id`, true);
  assertString(value.name, `${path}.name`, true);
  enumValue(value.source, INPUT_SOURCES, `${path}.source`);
  numberIn(value.durationMs, `${path}.durationMs`, 0);
  assertArray(value.notes, `${path}.notes`);
  value.notes.forEach((note, index) => {
    assertPlainObject(note, `${path}.notes[${index}]`);
    assertInteger(note.midi, `${path}.notes[${index}].midi`, 0, 127);
    numberIn(note.atMs, `${path}.notes[${index}].atMs`, 0);
    numberIn(note.velocity, `${path}.notes[${index}].velocity`, 0, 1);
  });
}

function validateSampleKits(value: unknown, path: string): void {
  assertArray(value, `${path}.value`);
  const kitIds = new Set<string>();
  const binaryKeys = new Set<string>();
  value.forEach((kit, kitIndex) => {
    const kitPath = `${path}.value[${kitIndex}]`;
    assertPlainObject(kit, kitPath);
    assertString(kit.id, `${kitPath}.id`, true);
    if (kitIds.has(kit.id)) fail(`${kitPath}.id`, "is duplicated");
    kitIds.add(kit.id);
    assertString(kit.name, `${kitPath}.name`, true);
    numberIn(kit.createdAt, `${kitPath}.createdAt`, 0);
    numberIn(kit.updatedAt, `${kitPath}.updatedAt`, 0);
    assertArray(kit.samples, `${kitPath}.samples`);
    const sampleIds = new Set<string>();
    kit.samples.forEach((sample, index) => {
      const samplePath = `${kitPath}.samples[${index}]`;
      assertPlainObject(sample, samplePath);
      for (const field of ["id", "fileName", "displayName", "mimeType", "binaryKey"] as const)
        assertString(sample[field], `${samplePath}.${field}`, true);
      numberIn(sample.size, `${samplePath}.size`, 0);
      const sampleId = sample.id as string;
      const binaryKey = sample.binaryKey as string;
      if (sampleIds.has(sampleId)) fail(`${samplePath}.id`, "is duplicated");
      if (binaryKeys.has(binaryKey)) fail(`${samplePath}.binaryKey`, "is duplicated");
      sampleIds.add(sampleId);
      binaryKeys.add(binaryKey);
    });
    assertArray(kit.assignments, `${kitPath}.assignments`);
    const assignedPads = new Set<number>();
    kit.assignments.forEach((assignment, index) => {
      const assignmentPath = `${kitPath}.assignments[${index}]`;
      assertPlainObject(assignment, assignmentPath);
      assertInteger(assignment.midiNote, `${assignmentPath}.midiNote`, 36, 99);
      if (assignedPads.has(assignment.midiNote))
        fail(`${assignmentPath}.midiNote`, "is duplicated");
      assignedPads.add(assignment.midiNote);
      assertString(assignment.sampleId, `${assignmentPath}.sampleId`, true);
      if (!sampleIds.has(assignment.sampleId))
        fail(`${assignmentPath}.sampleId`, "does not reference a sample");
      assertString(assignment.label, `${assignmentPath}.label`);
      if (assignment.chokeGroup !== undefined)
        assertInteger(assignment.chokeGroup, `${assignmentPath}.chokeGroup`, 1, 16);
      if (assignment.velocityLayers !== undefined) {
        assertArray(assignment.velocityLayers, `${assignmentPath}.velocityLayers`);
        if (assignment.velocityLayers.length < 1 || assignment.velocityLayers.length > 4)
          fail(`${assignmentPath}.velocityLayers`, "must contain one to four layers");
        assignment.velocityLayers.forEach((layer, layerIndex) => {
          const layerPath = `${assignmentPath}.velocityLayers[${layerIndex}]`;
          assertPlainObject(layer, layerPath);
          assertString(layer.sampleId, `${layerPath}.sampleId`, true);
          if (!sampleIds.has(layer.sampleId))
            fail(`${layerPath}.sampleId`, "does not reference a sample");
          assertString(layer.label, `${layerPath}.label`);
          numberIn(layer.minVelocity, `${layerPath}.minVelocity`, 0, 1);
          numberIn(layer.maxVelocity, `${layerPath}.maxVelocity`, layer.minVelocity as number, 1);
        });
      }
    });
  });
}

function validateProgress(value: unknown, path: string): void {
  assertPlainObject(value, `${path}.value`);
  for (const field of ["xp", "level", "streakDays", "streakFreezes"] as const)
    if (value[field] !== undefined) numberIn(value[field], `${path}.value.${field}`, 0);
  for (const field of ["practicedDays", "frozenDays", "achievements", "processedEventIds"] as const)
    if (value[field] !== undefined) stringArray(value[field], `${path}.value.${field}`);
  if (value.lastScores !== undefined) {
    assertPlainObject(value.lastScores, `${path}.value.lastScores`);
    for (const [key, score] of Object.entries(value.lastScores))
      numberIn(score, `${path}.value.lastScores.${key}`, 0, 1);
  }
}

function validateDeviceProfiles(value: unknown, path: string): void {
  assertPlainObject(value, `${path}.value`);
  if (value.profiles !== undefined) {
    assertArray(value.profiles, `${path}.value.profiles`);
    value.profiles.forEach((profile, index) => {
      assertPlainObject(profile, `${path}.value.profiles[${index}]`);
      assertString(profile.id, `${path}.value.profiles[${index}].id`, true);
      optionalString(profile.alias, `${path}.value.profiles[${index}].alias`);
      if (profile.instrument !== undefined)
        enumValue(profile.instrument, INSTRUMENTS, `${path}.value.profiles[${index}].instrument`);
      if (profile.channel !== undefined)
        assertInteger(profile.channel, `${path}.value.profiles[${index}].channel`, 1, 16);
      if (profile.ignored !== undefined)
        assertBoolean(profile.ignored, `${path}.value.profiles[${index}].ignored`);
    });
  }
  if (value.preferences !== undefined) {
    assertPlainObject(value.preferences, `${path}.value.preferences`);
    for (const [instrument, source] of Object.entries(value.preferences)) {
      enumValue(instrument, INSTRUMENTS, `${path}.value.preferences.${instrument}`);
      enumValue(source, INPUT_SOURCES, `${path}.value.preferences.${instrument}`);
    }
  }
  if (value.surfaces !== undefined) {
    assertPlainObject(value.surfaces, `${path}.value.surfaces`);
    for (const [instrument, surface] of Object.entries(value.surfaces)) {
      enumValue(instrument, INSTRUMENTS, `${path}.value.surfaces.${instrument}`);
      enumValue(
        surface,
        new Set(["keyboard", "guitar", "ukulele", "mpc"]),
        `${path}.value.surfaces.${instrument}`,
      );
    }
  }
}

function validateCustomTunings(value: unknown, path: string): void {
  assertArray(value, `${path}.value`);
  const ids = new Set<string>();
  value.forEach((tuning, index) => {
    const tuningPath = `${path}.value[${index}]`;
    assertPlainObject(tuning, tuningPath);
    assertString(tuning.id, `${tuningPath}.id`, true);
    assertString(tuning.name, `${tuningPath}.name`, true);
    enumValue(tuning.instrument, new Set(["guitar", "ukulele"]), `${tuningPath}.instrument`);
    if (tuning.source !== "custom") fail(`${tuningPath}.source`, "must be custom");
    const expected = tuning.instrument === "guitar" ? 6 : 4;
    numberArray(tuning.openStrings, `${tuningPath}.openStrings`, expected, 0, 127, true);
    assertInteger(tuning.fretCount, `${tuningPath}.fretCount`, 1, 36);
    numberIn(tuning.notationTransposition, `${tuningPath}.notationTransposition`);
    if (ids.has(tuning.id)) fail(`${tuningPath}.id`, "is duplicated");
    ids.add(tuning.id);
    const validation = validateTuning(tuning as unknown as TuningProfile);
    const error = Object.values(validation.errors)[0];
    if (error) fail(tuningPath, error);
  });
}

function validateStudioPattern(value: unknown, path: string): void {
  assertPlainObject(value, `${path}.value`);
  if (value.steps !== 16) fail(`${path}.value.steps`, "must be 16");
  assertArray(value.rows, `${path}.value.rows`);
  const ids = new Set<string>();
  value.rows.forEach((row, index) => {
    assertPlainObject(row, `${path}.value.rows[${index}]`);
    assertString(row.id, `${path}.value.rows[${index}].id`, true);
    if (ids.has(row.id)) fail(`${path}.value.rows[${index}].id`, "is duplicated");
    ids.add(row.id);
    assertArray(row.steps, `${path}.value.rows[${index}].steps`);
    row.steps.forEach((step, stepIndex) =>
      assertInteger(step, `${path}.value.rows[${index}].steps[${stepIndex}]`, 0, 15),
    );
  });
}

interface CurrentMedia {
  backingTracks: ImportedBackingTrackRow[];
  audioTakes: AudioTakeRow[];
  samples: Array<{ kitId: string; asset: Record<string, unknown> }>;
}

async function readCurrentMedia(store: PracticeStore): Promise<CurrentMedia> {
  const [backingTracks, audioTakes, settings] = await Promise.all([
    store.database.backingTracks.toArray(),
    store.database.audioTakes.toArray(),
    store.database.settings.get("music.sample-kits"),
  ]);
  return { backingTracks, audioTakes, samples: sampleAssets(settings ? [settings] : []) };
}

function sampleAssets(
  settings: SettingsRecord[],
): Array<{ kitId: string; asset: Record<string, unknown> }> {
  const record = settings.find((row) => row.id === "music.sample-kits");
  if (!record || !Array.isArray(record.value)) return [];
  return record.value.flatMap((kit) => {
    if (!isPlainObject(kit) || !Array.isArray(kit.samples) || typeof kit.id !== "string") return [];
    return kit.samples.filter(isPlainObject).map((asset) => ({ kitId: kit.id as string, asset }));
  });
}

function assertCurrentMediaPreserved(current: CurrentMedia, incoming: MusicDataBackupTables): void {
  const incomingSamples = sampleAssets(incoming.settings);
  const backingConflicts = current.backingTracks.filter(
    (row) => !incoming.backingTracks.some((candidate) => deepEqual(row, candidate)),
  ).length;
  const takeConflicts = current.audioTakes.filter(
    (row) => !incoming.audioTakes.some((candidate) => deepEqual(row, candidate)),
  ).length;
  const sampleConflicts = current.samples.filter(
    (row) =>
      !incomingSamples.some(
        (candidate) => candidate.kitId === row.kitId && deepEqual(candidate.asset, row.asset),
      ),
  ).length;
  if (backingConflicts + takeConflicts + sampleConflicts > 0) {
    throw new Error(
      `Restore would change current local media (${backingConflicts} backing tracks, ${takeConflicts} audio takes, ${sampleConflicts} sample files). Choose a backup containing identical media metadata.`,
    );
  }
}

async function assertNoNewBinaryCollisions(
  current: CurrentMedia,
  incoming: MusicDataBackupTables,
  readBinary: (key: string) => Promise<Blob | undefined>,
): Promise<void> {
  for (const row of incoming.backingTracks) {
    if (
      !current.backingTracks.some((candidate) => deepEqual(candidate, row)) &&
      (await readBinary(`music-backing-${row.id}`))
    ) {
      throw new Error(
        `Local binary key music-backing-${row.id} already exists for different metadata.`,
      );
    }
  }
  for (const row of incoming.audioTakes) {
    if (
      !current.audioTakes.some((candidate) => deepEqual(candidate, row)) &&
      (await readBinary(`music-take-${row.id}`))
    ) {
      throw new Error(
        `Local binary key music-take-${row.id} already exists for different metadata.`,
      );
    }
  }
  const currentSamples = current.samples;
  for (const sample of sampleAssets(incoming.settings)) {
    if (
      !currentSamples.some(
        (candidate) => candidate.kitId === sample.kitId && deepEqual(candidate.asset, sample.asset),
      )
    ) {
      const key = sample.asset.binaryKey;
      if (typeof key === "string" && (await readBinary(key)))
        throw new Error(`Local binary key ${key} already exists for different metadata.`);
    }
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function validateJsonValue(value: unknown, path: string, ancestors = new WeakSet<object>()): void {
  if (value === undefined) {
    fail(path, "must be JSON-safe");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "must be finite");
    return;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail(path, "must be JSON-safe and acyclic");
    ancestors.add(value);
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return;
  }
  if (!isPlainObject(value)) fail(path, "must be JSON-safe");
  if (ancestors.has(value)) fail(path, "must be JSON-safe and acyclic");
  ancestors.add(value);
  for (const [key, item] of Object.entries(value))
    validateJsonValue(item, `${path}.${key}`, ancestors);
  ancestors.delete(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, "must be an object");
}
function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
}
function assertString(value: unknown, path: string, nonempty = false): asserts value is string {
  if (typeof value !== "string" || (nonempty && value.trim() === ""))
    fail(path, "must be a string");
}
function optionalString(value: unknown, path: string): void {
  if (value !== undefined) assertString(value, path);
}
function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
}
function numberIn(
  value: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    fail(path, "must be a finite number in range");
}
function optionalNumber(value: unknown, path: string): void {
  if (value !== undefined) numberIn(value, path);
}
function assertInteger(
  value: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
): asserts value is number {
  numberIn(value, path, min, max);
  if (!Number.isInteger(value)) fail(path, "must be an integer");
}
function enumValue(value: unknown, values: Set<string>, path: string): void {
  if (typeof value !== "string" || !values.has(value)) fail(path, "has an unsupported value");
}
function stringArray(value: unknown, path: string, values?: Set<string>): void {
  assertArray(value, path);
  value.forEach((item, index) => {
    assertString(item, `${path}[${index}]`);
    if (values && !values.has(item)) fail(`${path}[${index}]`, "has an unsupported value");
  });
}
function optionalStringArray(value: unknown, path: string, values?: Set<string>): void {
  if (value !== undefined) stringArray(value, path, values);
}
function uniqueStringArray(value: unknown, path: string): void {
  stringArray(value, path);
  if (new Set(value as string[]).size !== (value as string[]).length)
    fail(path, "contains duplicate values");
}
function numberArray(
  value: unknown,
  path: string,
  length?: number,
  min = -Infinity,
  max = Infinity,
  integers = false,
): void {
  assertArray(value, path);
  if (length !== undefined && value.length !== length) fail(path, `must contain ${length} values`);
  value.forEach((item, index) =>
    integers
      ? assertInteger(item, `${path}[${index}]`, min, max)
      : numberIn(item, `${path}[${index}]`, min, max),
  );
}
function optionalNumberArray(
  value: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
  integers = false,
): void {
  if (value !== undefined) numberArray(value, path, undefined, min, max, integers);
}
function assertUniqueObjectIds(values: unknown[], path: string): void {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    assertPlainObject(value, `${path}[${index}]`);
    assertString(value.id, `${path}[${index}].id`, true);
    if (ids.has(value.id)) fail(`${path}[${index}].id`, "is duplicated");
    ids.add(value.id);
  });
}
function fail(path: string, message: string): never {
  throw new Error(`${path} ${message}.`);
}
