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

export interface SkillSeed {
  skills: Skill[];
  relationships: SkillRelationship[];
}

export class SkillGraphStore {
  #skills = new Map<string, Skill>();
  #relationships: SkillRelationship[] = [];
  #mastery = new Map<string, SkillMastery>();

  get skills(): Skill[] {
    return [...this.#skills.values()];
  }

  get relationships(): SkillRelationship[] {
    return [...this.#relationships];
  }

  async seed(seed: SkillSeed): Promise<void> {
    for (const skill of seed.skills) {
      this.#skills.set(skill.id, skill);
      if (!this.#mastery.has(skill.id)) this.#mastery.set(skill.id, initialMastery(skill.id));
    }
    const keys = new Set<string>();
    this.#relationships = [...this.#relationships, ...seed.relationships].filter((rel) => {
      const key = `${rel.from}:${rel.kind}:${rel.to}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
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

  async ingest(event: ScoringEvent): Promise<void> {
    this.#mastery = applyScoringEventToSkillState(this.#mastery, event, initialMastery);
  }
}

export function seedCoreSkills(): SkillSeed {
  const skills: Skill[] = [
    skill("pitch.interval.m2", "Minor 2nd", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.M2", "Major 2nd", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.P5", "Perfect 5th", Capability.Pitch, "beginner", ["interval", "ear"]),
    skill("pitch.interval.m6", "Minor 6th", Capability.Pitch, "early-intermediate", [
      "interval",
      "ear",
    ]),
    skill("harmony.triad.major", "Major Triads", Capability.Harmony, "beginner", ["chord"]),
    skill("harmony.triad.minor", "Minor Triads", Capability.Harmony, "beginner", ["chord"]),
    skill("harmony.seventh.dominant", "Dominant 7th", Capability.Harmony, "early-intermediate", [
      "chord",
    ]),
    skill("harmony.ii-v-i", "ii-V-I", Capability.Harmony, "intermediate", ["jazz", "progression"]),
    skill("rhythm.quarter-pulse", "Quarter-Note Pulse", Capability.Rhythm, "beginner", ["timing"]),
    skill("rhythm.eighths", "Eighth Notes", Capability.Rhythm, "beginner", ["subdivision"]),
    skill("reading.treble.landmarks", "Treble Landmark Notes", Capability.Reading, "beginner", [
      "staff",
    ]),
    skill("reading.bass.landmarks", "Bass Landmark Notes", Capability.Reading, "beginner", [
      "staff",
    ]),
    skill("technique.scale.major", "Major Scale Fluency", Capability.Technique, "beginner", [
      "scale",
    ]),
  ];
  return {
    skills,
    relationships: [
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
    ],
  };
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
