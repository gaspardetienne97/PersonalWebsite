import {
  Capability,
  SkillRelationKind,
  applyScoringEventToSkillState,
  initialMastery,
  type ScoringEvent,
  type Skill,
  type SkillMastery,
  type SkillRelationship,
} from "@repo/music-core/domain";
import { PracticeStore, skillRelationshipRow } from "@repo/music-core/engines/store";

export interface SkillSeed {
  skills: Skill[];
  relationships: SkillRelationship[];
}

const PROCESSED_EVENT_IDS = "skills.processed-events.v1";

export class SkillGraphStore {
  #skills = new Map<string, Skill>();
  #relationships: SkillRelationship[] = [];
  #mastery = new Map<string, SkillMastery>();
  #processedEventIds = new Set<string>();
  #loaded = false;
  #operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store?: PracticeStore) {}

  get skills(): Skill[] {
    return [...this.#skills.values()];
  }

  get relationships(): SkillRelationship[] {
    return [...this.#relationships];
  }

  load(): Promise<void> {
    return this.#enqueue(() => this.#load());
  }

  seed(seed: SkillSeed): Promise<void> {
    return this.#enqueue(async () => {
      await this.#load();

      const newMastery: SkillMastery[] = [];
      for (const skill of seed.skills) {
        this.#skills.set(skill.id, skill);
        if (!this.#mastery.has(skill.id)) {
          const mastery = initialMastery(skill.id);
          this.#mastery.set(skill.id, mastery);
          newMastery.push(mastery);
        }
      }
      this.#relationships = dedupeRelationships([...this.#relationships, ...seed.relationships]);

      if (this.store) {
        await Promise.all([
          ...seed.skills.map((skill) => this.store!.skills.put(skill)),
          ...this.#relationships.map((relationship) =>
            this.store!.skillRelationships.put(skillRelationshipRow(relationship)),
          ),
          ...newMastery.map((mastery) => this.store!.skillMastery.put(mastery)),
        ]);
      }
    });
  }

  getMastery(skillId: string): SkillMastery {
    return this.#mastery.get(skillId) ?? initialMastery(skillId);
  }

  unlockedSkills(): Skill[] {
    return this.skills.filter((skill) => {
      const prereqs = this.#relationships.filter(
        (rel) => rel.kind === SkillRelationKind.Prerequisite && rel.to === skill.id,
      );
      return prereqs.every((rel) => this.getMastery(rel.from).mastery >= (rel.threshold ?? 0.6));
    });
  }

  ingest(event: ScoringEvent): Promise<void> {
    return this.#enqueue(async () => {
      await this.#load();
      if (this.#processedEventIds.has(event.id)) return;

      const nextMastery = applyScoringEventToSkillState(this.#mastery, event, initialMastery);
      const nextEventIds = [...this.#processedEventIds, event.id];

      if (this.store) {
        await Promise.all(
          [
            [...new Set(event.skillIds)].map((skillId) =>
              this.store!.skillMastery.put(nextMastery.get(skillId) ?? initialMastery(skillId)),
            ),
            this.store.settings.put({ id: PROCESSED_EVENT_IDS, value: nextEventIds }),
          ].flat(),
        );
      }

      this.#mastery = nextMastery;
      this.#processedEventIds.add(event.id);
    });
  }

  async #load(): Promise<void> {
    if (this.#loaded) return;

    if (!this.store) {
      this.#loaded = true;
      return;
    }

    const [skills, relationships, mastery, processed] = await Promise.all([
      this.store.skills.all(),
      this.store.skillRelationships.all(),
      this.store.skillMastery.all(),
      this.store.settings.get(PROCESSED_EVENT_IDS),
    ]);
    this.#skills = new Map(skills.map((skill) => [skill.id, skill]));
    this.#relationships = relationships.map(({ id: _id, ...relationship }) => relationship);
    this.#mastery = new Map(mastery.map((state) => [state.skillId, state]));
    this.#processedEventIds = new Set(stringArray(processed?.value));
    this.#loaded = true;
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#operationQueue.then(operation, operation);
    this.#operationQueue = result.catch(() => undefined);
    return result;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function seedCoreSkills(): SkillSeed {
  const skills: Skill[] = [
    skill("pitch.intervals", "Intervals", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.m2", "Minor 2nd", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.M2", "Major 2nd", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.m3", "Minor 3rd", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.M3", "Major 3rd", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.P4", "Perfect 4th", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.TT", "Tritone", Capability.Pitch, "early-intermediate", [
      "interval",
      "ear",
    ]),
    skill("pitch.interval.P5", "Perfect 5th", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.m6", "Minor 6th", Capability.Pitch, "early-intermediate", [
      "interval",
      "ear",
    ]),
    skill("pitch.interval.M6", "Major 6th", Capability.Pitch, "early-intermediate", [
      "interval",
      "ear",
    ]),
    skill("pitch.interval.m7", "Minor 7th", Capability.Pitch, "early-intermediate", [
      "interval",
      "ear",
    ]),
    skill("pitch.interval.M7", "Major 7th", Capability.Pitch, "intermediate", ["interval", "ear"]),
    skill("pitch.interval.P8", "Perfect Octave", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.scale-degrees", "Functional Scale Degrees", Capability.Pitch, "beginner", [
      "scale-degree",
      "ear",
    ]),
    ...[
      ["1", "Tonic"],
      ["2", "Supertonic"],
      ["b3", "Flat 3rd"],
      ["3", "Mediant"],
      ["4", "Subdominant"],
      ["5", "Dominant"],
      ["b6", "Flat 6th"],
      ["6", "Submediant"],
      ["b7", "Flat 7th"],
      ["7", "Leading Tone"],
    ].map(([degree, name]) =>
      skill(`pitch.scale-degree.${degree}`, `${degree} - ${name}`, Capability.Pitch, "beginner", [
        "scale-degree",
        "ear",
      ]),
    ),
    skill("harmony.triads", "Triad Qualities", Capability.Harmony, "beginner", ["chord"]),
    skill("harmony.triad.major", "Major Triads", Capability.Harmony, "beginner", ["chord"]),
    skill("harmony.triad.minor", "Minor Triads", Capability.Harmony, "beginner", ["chord"]),
    skill(
      "harmony.triad.diminished",
      "Diminished Triads",
      Capability.Harmony,
      "early-intermediate",
      ["chord"],
    ),
    skill("harmony.triad.augmented", "Augmented Triads", Capability.Harmony, "early-intermediate", [
      "chord",
    ]),
    skill("harmony.sevenths", "Seventh Chords", Capability.Harmony, "early-intermediate", [
      "chord",
    ]),
    skill("harmony.seventh.major", "Major 7th", Capability.Harmony, "early-intermediate", [
      "chord",
    ]),
    skill("harmony.seventh.dominant", "Dominant 7th", Capability.Harmony, "early-intermediate", [
      "chord",
    ]),
    skill("harmony.seventh.minor", "Minor 7th", Capability.Harmony, "early-intermediate", [
      "chord",
    ]),
    skill(
      "harmony.seventh.half-diminished",
      "Half-Diminished 7th",
      Capability.Harmony,
      "intermediate",
      ["chord"],
    ),
    skill("harmony.seventh.diminished", "Diminished 7th", Capability.Harmony, "intermediate", [
      "chord",
    ]),
    skill("harmony.ii-v-i", "ii-V-I", Capability.Harmony, "intermediate", ["jazz", "progression"]),
    skill("rhythm.subdivisions", "Rhythm Subdivisions", Capability.Rhythm, "beginner", [
      "timing",
      "subdivision",
    ]),
    skill("rhythm.quarter-pulse", "Quarter-Note Pulse", Capability.Rhythm, "beginner", ["timing"]),
    skill("rhythm.eighths", "Eighth Notes", Capability.Rhythm, "beginner", ["subdivision"]),
    skill("rhythm.triplets", "Triplets", Capability.Rhythm, "early-intermediate", ["subdivision"]),
    skill("rhythm.sixteenths", "Sixteenth Notes", Capability.Rhythm, "early-intermediate", [
      "subdivision",
    ]),
    skill("reading.treble", "Treble Clef Reading", Capability.Reading, "beginner", ["staff"]),
    skill("reading.treble.landmarks", "Treble Landmark Notes", Capability.Reading, "beginner", [
      "staff",
    ]),
    skill("reading.treble.stepwise", "Treble Stepwise Reading", Capability.Reading, "beginner", [
      "staff",
    ]),
    skill("reading.bass", "Bass Clef Reading", Capability.Reading, "beginner", ["staff"]),
    skill("reading.bass.landmarks", "Bass Landmark Notes", Capability.Reading, "beginner", [
      "staff",
    ]),
    skill("reading.bass.stepwise", "Bass Stepwise Reading", Capability.Reading, "beginner", [
      "staff",
    ]),
    skill("reading.polyphonic", "Polyphonic Reading", Capability.Reading, "intermediate", [
      "staff",
      "chord",
    ]),
    skill("reading.rhythm.compound", "Compound-Meter Reading", Capability.Reading, "intermediate", [
      "rhythm",
    ]),
    skill("technique.scales", "Scale Fluency", Capability.Technique, "beginner", ["scale"]),
    skill("technique.scale.major", "Major Scale Fluency", Capability.Technique, "beginner", [
      "scale",
    ]),
    skill(
      "technique.scale.natural-minor",
      "Natural Minor Scale Fluency",
      Capability.Technique,
      "beginner",
      ["scale"],
    ),
    skill(
      "technique.scale.harmonic-minor",
      "Harmonic Minor Scale Fluency",
      Capability.Technique,
      "early-intermediate",
      ["scale"],
    ),
    skill(
      "technique.scale.melodic-minor",
      "Melodic Minor Scale Fluency",
      Capability.Technique,
      "intermediate",
      ["scale"],
    ),
    skill(
      "technique.scale.major-pentatonic",
      "Major Pentatonic Fluency",
      Capability.Technique,
      "beginner",
      ["scale"],
    ),
    skill(
      "technique.scale.minor-pentatonic",
      "Minor Pentatonic Fluency",
      Capability.Technique,
      "beginner",
      ["scale"],
    ),
    skill("technique.aerophone", "Aerophone Technique", Capability.Technique, "beginner", [
      "aerophone",
      "breath",
    ]),
    skill(
      "technique.aerophone.breath-steadiness",
      "Aerophone Breath Steadiness",
      Capability.Technique,
      "beginner",
      ["aerophone", "breath", "long-tone"],
    ),
    skill(
      "technique.aerophone.dynamic-control",
      "Aerophone Dynamic Control",
      Capability.Technique,
      "beginner",
      ["aerophone", "breath", "swell", "dynamics"],
    ),
    skill(
      "technique.aerophone.articulation",
      "Aerophone Articulation",
      Capability.Technique,
      "beginner",
      ["aerophone", "breath", "articulation", "staccato", "legato"],
    ),
    skill("technique.strings", "String Instrument Technique", Capability.Technique, "beginner", [
      "guitar",
      "ukulele",
      "fretting",
    ]),
    skill("technique.strings.spider", "Chromatic Spider Drill", Capability.Technique, "beginner", [
      "guitar",
      "ukulele",
      "spider",
      "chromatic",
    ]),
    skill("technique.guitar.spider", "Guitar Spider Drill", Capability.Technique, "beginner", [
      "guitar",
      "spider",
      "chromatic",
    ]),
    skill("technique.ukulele.spider", "Ukulele Spider Drill", Capability.Technique, "beginner", [
      "ukulele",
      "spider",
      "chromatic",
    ]),
    skill(
      "technique.strings.chord-perfect",
      "Chord-Perfect Drill",
      Capability.Technique,
      "beginner",
      ["guitar", "ukulele", "chords", "fretting"],
    ),
    skill(
      "technique.guitar.chord-perfect",
      "Guitar Chord-Perfect",
      Capability.Technique,
      "beginner",
      ["guitar", "chords", "fretting"],
    ),
    skill(
      "technique.ukulele.chord-perfect",
      "Ukulele Chord-Perfect",
      Capability.Technique,
      "beginner",
      ["ukulele", "chords", "fretting"],
    ),
    skill("technique.piano", "Piano Technique", Capability.Technique, "beginner", [
      "piano",
      "keys",
      "hands",
    ]),
    skill(
      "technique.piano.two-hand-independence",
      "Two-Hand Independence",
      Capability.Technique,
      "beginner",
      ["piano", "independence", "coordination", "hands"],
    ),
    skill("technique.mpc", "MPC Technique", Capability.Technique, "beginner", [
      "mpc",
      "pads",
      "finger-drumming",
    ]),
    skill(
      "technique.mpc.single-strokes",
      "MPC Alternating Single Strokes",
      Capability.Technique,
      "beginner",
      ["mpc", "pads", "rudiment", "single-strokes"],
    ),
  ];

  const components: Record<string, string[]> = {
    "pitch.intervals": skills
      .filter((item) => item.id.startsWith("pitch.interval."))
      .map((item) => item.id),
    "pitch.scale-degrees": skills
      .filter((item) => item.id.startsWith("pitch.scale-degree."))
      .map((item) => item.id),
    "harmony.triads": skills
      .filter((item) => item.id.startsWith("harmony.triad."))
      .map((item) => item.id),
    "harmony.sevenths": skills
      .filter((item) => item.id.startsWith("harmony.seventh."))
      .map((item) => item.id),
    "rhythm.subdivisions": [
      "rhythm.quarter-pulse",
      "rhythm.eighths",
      "rhythm.triplets",
      "rhythm.sixteenths",
    ],
    "reading.treble": ["reading.treble.landmarks", "reading.treble.stepwise"],
    "reading.bass": ["reading.bass.landmarks", "reading.bass.stepwise"],
    "technique.scales": skills
      .filter((item) => item.id.startsWith("technique.scale."))
      .map((item) => item.id),
    "technique.aerophone": [
      "technique.aerophone.breath-steadiness",
      "technique.aerophone.dynamic-control",
      "technique.aerophone.articulation",
    ],
    "technique.strings": ["technique.strings.spider", "technique.strings.chord-perfect"],
    "technique.strings.spider": ["technique.guitar.spider", "technique.ukulele.spider"],
    "technique.strings.chord-perfect": [
      "technique.guitar.chord-perfect",
      "technique.ukulele.chord-perfect",
    ],
    "technique.piano": ["technique.piano.two-hand-independence"],
    "technique.mpc": ["technique.mpc.single-strokes"],
  };

  return {
    skills,
    relationships: [
      ...Object.entries(components).flatMap(([from, children]) =>
        children.map((to) => ({ from, to, kind: SkillRelationKind.Component })),
      ),
      {
        from: "harmony.triad.major",
        to: "harmony.seventh.dominant",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
      {
        from: "harmony.seventh.dominant",
        to: "harmony.ii-v-i",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.6,
      },
      {
        from: "rhythm.quarter-pulse",
        to: "rhythm.eighths",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
      {
        from: "rhythm.eighths",
        to: "rhythm.sixteenths",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
      {
        from: "reading.treble.stepwise",
        to: "reading.polyphonic",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
      {
        from: "reading.bass.stepwise",
        to: "reading.polyphonic",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
      {
        from: "rhythm.eighths",
        to: "reading.rhythm.compound",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
      {
        from: "technique.scale.major",
        to: "technique.scale.natural-minor",
        kind: SkillRelationKind.Prerequisite,
        threshold: 0.5,
      },
    ],
  };
}

function dedupeRelationships(relationships: SkillRelationship[]): SkillRelationship[] {
  const unique = new Map<string, SkillRelationship>();
  for (const relationship of relationships) {
    unique.set(relationshipKey(relationship), relationship);
  }
  return [...unique.values()];
}

function relationshipKey(relationship: SkillRelationship): string {
  return `${relationship.from}:${relationship.kind}:${relationship.to}`;
}

function skill(
  id: string,
  name: string,
  capability: Capability,
  level: Skill["level"],
  tags: string[],
): Skill {
  return { id, name, capability, level, tags, version: 1 };
}
