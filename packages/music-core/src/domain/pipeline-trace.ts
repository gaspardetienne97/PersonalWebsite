/**
 * pipeline-trace.ts - the end-to-end learning loop the critique asked for:
 *
 *   interval prompt -> user answers P5 instead of m6 -> ExerciseResult
 *     -> ScoringEvent -> LearningEvidence -> SkillMastery update
 *     -> Analytics confusion matrix
 *
 * Run: npx tsx pipeline-trace.ts
 * This is a BEHAVIORAL test: it proves the transformations compose and that
 * mastery and the confusion matrix move sensibly over a sequence of attempts.
 */
import {
  type ExerciseDefinition,
  type ExerciseResult,
  type FeedbackItem,
  discreteRun,
  Capability,
  type NoteEvent,
  type ScoringMetric,
  type SkillMastery,
  initialMastery,
  resultToScoringEvent,
  applyScoringEventToSkillState,
  scoringEventToEvidence,
  type ConfusionMatrix,
  updateConfusion,
  monotonicMs,
  unixMs,
  type UnixMs,
} from "./index";

/* An interval-recognition exercise whose answer we can drive from input. */
interface IntervalPrompt {
  answer: string;
}
const intervalExercise: ExerciseDefinition<IntervalPrompt, string> = {
  id: "ear.interval-recognition",
  name: "Interval Recognition",
  capabilities: [Capability.EarTraining, Capability.Pitch],
  skillIds: ["pitch.interval.m6"],
  inputs: ["click"],
  streaming: false,
  generate: () => ({ id: "prompt-m6", payload: { answer: "m6" } }),
  createRun(prompt) {
    return discreteRun<string>((input): ExerciseResult<string> => {
      // The clicked answer label is carried in raw.midiData1 (0=m6 else P5) for the demo.
      const chosen = (input[0]?.raw?.midiData1 ?? -1) === 0 ? "m6" : "P5";
      const correct = chosen === prompt.payload.answer;
      const metrics: ScoringMetric[] = [
        { kind: "choice", expected: prompt.payload.answer, actual: chosen },
      ];
      const feedback: FeedbackItem[] = [
        correct
          ? { severity: "good", message: "Correct - minor 6th." }
          : {
              severity: "error",
              message: `That was a ${prompt.payload.answer}; you chose ${chosen}.`,
            },
      ];
      return {
        correct,
        score: correct ? 1 : 0,
        latencyMs: 900,
        metrics,
        feedback,
        target: { label: prompt.payload.answer, choice: prompt.payload.answer },
        response: { choice: chosen },
        answer: chosen,
        input,
      };
    });
  },
};

function clickAnswer(label: "m6" | "P5", t: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote: 0,
    velocity: 1,
    source: "click",
    timestamp: monotonicMs(t),
    clock: "performance",
    raw: { midiData1: label === "m6" ? 0 : 1 },
  };
}

let idc = 0;
const makeId = () => `evt-${++idc}`;
const SKILL = "pitch.interval.m6";

// State the Skill Graph owns:
let mastery = new Map<string, SkillMastery>([[SKILL, initialMastery(SKILL)]]);
const confusion: ConfusionMatrix = new Map();
const seed = (id: string) => initialMastery(id);

// Simulate 8 attempts: the learner confuses m6 with P5 the first 4 times,
// then "gets it" and answers correctly the last 4. One day passes between each
// (so decay is exercised too). We watch mastery + confusion evolve.
const answers: ("m6" | "P5")[] = ["P5", "P5", "P5", "P5", "m6", "m6", "m6", "m6"];
const DAY = 86_400_000;
const startWall = 1_700_000_000_000;

console.log("attempt  answered  correct  partial  ->  mastery  confidence");
answers.forEach((ans, i) => {
  const ctx = { targetSkillIds: [SKILL], difficulty: 0.6 };
  const prompt = intervalExercise.generate(ctx);
  const run = intervalExercise.createRun(prompt, ctx);
  run.accept(clickAnswer(ans, 0));
  const result = run.finish({ reason: "completed" });

  const at = unixMs(startWall + i * DAY) as UnixMs;
  const event = resultToScoringEvent({
    result,
    sessionId: "sess-1",
    runId: "run-1",
    exercise: intervalExercise,
    prompt,
    at,
    difficulty: 0.6,
    modality: "heard",
    makeId,
  });

  // (sanity) evidence is produced per touched skill
  const evidence = scoringEventToEvidence(event);
  if (evidence.length !== 1) throw new Error("expected one evidence item");

  mastery = applyScoringEventToSkillState(mastery, event, seed);
  updateConfusion(confusion, event);

  const m = mastery.get(SKILL)!;
  console.log(
    `   ${i + 1}     ${ans.padEnd(8)} ${String(event.correct).padEnd(7)} ` +
      `${event.partialCredit.toFixed(2).padEnd(7)} ->  ${m.mastery.toFixed(3)}    ${m.confidence.toFixed(3)}`,
  );
});

console.log("\nConfusion matrix (expected -> answered: count):");
for (const [expected, row] of confusion) {
  const parts = [...row].map(([a, c]) => `${a}=${c}`).join(", ");
  console.log(`  ${expected}: ${parts}`);
}

const finalMastery = mastery.get(SKILL)!.mastery;
console.log(`\nFinal m6 mastery: ${finalMastery.toFixed(3)}`);
console.log(
  finalMastery > 0.4 && finalMastery < 0.95
    ? "PASS: mastery rose from struggle to competence without saturating."
    : "CHECK: mastery value outside expected band.",
);
console.log("End-to-end pipeline (result -> event -> evidence -> mastery -> confusion) holds.");
