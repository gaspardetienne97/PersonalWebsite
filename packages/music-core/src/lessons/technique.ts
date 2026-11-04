import { BREATH_LEVELS, REGISTER_PAIRS } from "../content/aero-skills";
import {
  AEROPHONE_CHART,
  AEROPHONE_MODES,
  LANDING_HOLD_MS,
  LANDING_INTERVALS,
  PALM_FINGERINGS,
  aerophoneKeyLabel,
  fingeringFor,
  landingTarget,
} from "../content/winds-pads";
import { PEDAL_PROGRESSIONS, pedalChords } from "../content/piano";
import { TUNINGS } from "../data";
import { BEND, BEND_PROMPT_MS, BEND_SETTLE_MS } from "../scoring/bends";
import { ARTICULATION_TARGET, ATTACK } from "../scoring/aerophone";
import { PEDAL } from "../scoring/piano";
import { noteName } from "../theory/notes";
import { keys } from "./tier1";
import type { Lesson, LessonFigure, LessonSound } from "./types";

const name = (midi: number) => noteName(midi, "sharp", false);
const pct = (x: number) => Math.round(x * 100);
const secs = (ms: number) => ms / 1000;
/** A note held for `dur` seconds, at `velocity` (0 to 1) when given. */
const held = (midi: number, dur: number, velocity?: number): LessonSound => ({
  notes: [{ midi: [midi], at: 0, dur, ...(velocity ? { velocity } : {}) }],
});

// ---------------------------------------------------------------------------
// Aerophone

export type AeroLessonMode = "long-tone" | "articulation" | "interval-landing" | "register";

/** The register crossings that slide a little finger between keys, and those that reach for the palm keys. */
const pinkyPairs = () => REGISTER_PAIRS.filter((p) => p.detail.includes("pinky"));
const palmPairs = () =>
  REGISTER_PAIRS.filter((p) => p.notes.some((m) => fingeringFor(m)?.keys.includes("C1")));
const registerGroup = (pairId: string) =>
  pinkyPairs().some((p) => p.id === pairId)
    ? "pinky"
    : palmPairs().some((p) => p.id === pairId)
      ? "palm"
      : null;

/** The lowest chart note that needs the +1 octave key, and the lowest that needs a palm key. */
export const firstOctaveNote = () => AEROPHONE_CHART.find((f) => f.octave)!;
export const firstPalmNote = () => AEROPHONE_CHART.find((f) => f.keys.includes("C1"))!;
/** Every key the chart's palm fingerings use, in the order they first appear. */
const palmKeys = () => [...new Set(Object.values(PALM_FINGERINGS).flatMap((f) => f.keys))];
const andList = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;

/** The key names of a written note's chart fingering, as the drill's labels have them. */
const fingerKeys = (written: number) => {
  const f = fingeringFor(written)!;
  const ids = [...(f.octave ? ["octave"] : []), ...f.keys];
  return ids.length ? ids.map(aerophoneKeyLabel).join(", ") : "all keys open";
};

/**
 * The two notes of a crossing as steps, each with the AE-20's fingering drawn and its keys named,
 * then the keys that change. Written notes, as the chart has them; the picture takes concert pitch.
 */
const crossingSteps = (pairId: string | undefined, shift: number) => {
  const pair = REGISTER_PAIRS.find((p) => p.id === pairId) ?? REGISTER_PAIRS[0];
  const [a, b] = pair.notes.map((m) => fingeringFor(m)!);
  const idsOf = (f: typeof a) => new Set([...(f.octave ? ["octave"] : []), ...f.keys]);
  const [ia, ib] = [idsOf(a), idsOf(b)];
  const changes = [...new Set([...ia, ...ib])].filter((id) => ia.has(id) !== ib.has(id));
  const step = (f: typeof a) => ({
    text: `${f.name}${f.verified ? "" : " (best-effort)"}: ${fingerKeys(f.midi)}.`,
    figure: { kind: "aerophone", midi: f.midi - shift } as LessonFigure,
  });
  return [
    step(a),
    step(b),
    { text: `Keys that change: ${changes.map(aerophoneKeyLabel).join(", ")}.` },
  ];
};

const longTone = (): Lesson => ({
  id: "aerophone.long-tone",
  title: "Long tone",
  screens: [
    {
      title: "One note, one even breath",
      figure: { kind: "aerophone", midi: 67 },
      text: "A long tone is a single note held for the whole time, with the air as even as you can keep it. The Aerophone's breath sensor tells the app how hard you blow, and the drill scores how still that stays.",
    },
    {
      title: "What you hear here",
      text: "Hear it plays a note at one fixed loudness for three seconds. The app cannot play your breath, so this shows the pitch and the length, not how your air should feel. The breath sensor reads from 0 for no air to 1 for full (it arrives as MIDI CC 2).",
      sound: held(67, 3),
    },
    {
      title: "What the drill checks",
      text: `Tap the note on the chart, pick a hold of ${andList2(holdSeconds())} seconds, and play. The hold starts at your first target note and passes with the right pitch, the full length and a steady breath, where drifting up or down counts against you as much as shaking. Without the breath sensor, only the pitch and the length are measured.`,
    },
  ],
});

const holdSeconds = () =>
  (AEROPHONE_MODES.find((m) => m.id === "long-tone")!.seconds as readonly number[]).map(String);
const andList2 = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} or ${a.at(-1)}`;

/** The drill's level bands as "pp 0.1 to 0.28". */
const bandText = (l: (typeof BREATH_LEVELS)[number]) => `${l.id} ${l.band[0]} to ${l.band[1]}`;

const breathLevels = (): Lesson => ({
  id: "aerophone.long-tone.levels",
  title: "Breath levels",
  screens: [
    {
      title: "Hold at a loudness",
      text: `A level asks you to hold at one loudness, from pp to f, by keeping the breath reading inside a band: ${BREATH_LEVELS.map(bandText).join(", ")}. The ${BREATH_LEVELS[0].id} and ${BREATH_LEVELS[1].id} bands overlap a little.`,
    },
    {
      title: "Hear the four loudnesses",
      text: "Each button plays a note at the middle of its band, louder for a higher level. The drill reads your breath, not the loudness of a note, and the app cannot play a breath, so this is only a picture of soft to loud.",
      options: BREATH_LEVELS.map((l) => ({
        label: l.id,
        sound: held(67, 2, (l.band[0] + l.band[1]) / 2),
      })),
    },
    {
      title: "How a level is scored",
      text: "In practice mode the breath trace shows a dashed line at the middle of the band. Half the score is the share of the hold with your breath inside the band, and the hold passes only when most of it is. These bands are starting values, so where soft and loud land depends on your sensor and how you blow.",
    },
  ],
});

const STACCATO = ARTICULATION_TARGET.staccato;
const LEGATO = ARTICULATION_TARGET.legato;

const articulation = (): Lesson => {
  const beat = 0.6;
  const run = (fraction: number): LessonSound => ({
    notes: Array.from({ length: 4 }, (_, i) => ({
      midi: [67],
      at: i * beat,
      dur: beat * fraction,
    })),
  });
  return {
    id: "aerophone.articulation",
    title: "Articulation",
    screens: [
      {
        title: "One tongue a beat",
        figure: { kind: "aerophone", midi: 67 },
        sound: run((STACCATO + LEGATO) / 2),
        text: "The drill plays a click at the practice strip's tempo. You tongue the same note once on each click, for as many notes as you set.",
      },
      {
        title: "Staccato and legato",
        text: `Staccato lets each note sound about ${pct(STACCATO)} percent of the beat, and legato about ${pct(LEGATO)} percent. Tap each style to hear it at 100 beats a minute.`,
        options: [
          { label: "Staccato", sound: run(STACCATO) },
          { label: "Legato", sound: run(LEGATO) },
        ],
      },
      {
        title: "Tonguing on a breath sensor",
        text: `A tongued note stops the air for a moment, so the breath dips. The drill counts a dip under ${pct(ATTACK.dip)} percent of your usual breath as a tongue stop, and the rise after it as the attack, because the instrument may keep sounding and send no new note.`,
      },
      {
        title: "What the drill checks",
        text: `It checks that every note is the target, how long each sounds against the style, and how close each attack lands to its click: within ${ATTACK.windowMs} ms, or a quarter of the beat if that is less. Note length needs the Aerophone's own note-offs, so the on-screen chart cannot measure it.`,
      },
    ],
  };
};

/** The drill's drones are written notes; the example uses the highest, so both directions stay on the chart. */
const WRITTEN_DRONE = 72;
const landing = (shift: number): Lesson => {
  const concert = (written: number) => written - shift;
  const drone = fingeringFor(WRITTEN_DRONE)!.name;
  return {
    id: "aerophone.interval-landing",
    title: "Interval landing",
    screens: [
      {
        title: "Land on the interval",
        figure: keys({ [concert(WRITTEN_DRONE)]: "drone", [concert(WRITTEN_DRONE - 7)]: "land" }),
        text: `A drone sounds, and you land the note an interval above or below it: ${LANDING_INTERVALS.map((i) => i.label.toLowerCase()).join(", ")}. You set the interval, the direction and the drone.`,
      },
      {
        title: `Hear it on a ${drone} drone`,
        text: "Tap an interval and direction to hear the drone alone, then the landing note joining it. Notes are named as written, in your reading key, and the picture shows both notes.",
        options: LANDING_INTERVALS.flatMap((i) =>
          (["up", "down"] as const).flatMap((dir) => {
            const target = landingTarget(WRITTEN_DRONE, i.semitones, dir);
            if (target === undefined) return [];
            return [
              {
                label: `${i.label} ${dir}`,
                sound: {
                  notes: [
                    { midi: [concert(WRITTEN_DRONE)], at: 0, dur: 3.5 },
                    { midi: [concert(target)], at: 1, dur: 2.5 },
                  ],
                },
                figure: keys({
                  [concert(WRITTEN_DRONE)]: "drone",
                  [concert(target)]: "land",
                }),
              },
            ];
          }),
        ),
      },
      {
        title: "Hearing it against the drone",
        text: "Listen to the drone, think of the note an interval away, then finger it and play. The drill checks that the note your keys send is the target, not fine tuning, and the bite can bend pitch without changing the note.",
      },
      {
        title: "What the drill checks",
        text: `Play the target and hold it for ${secs(LANDING_HOLD_MS)} seconds. The hold starts at your first target note, so a wrong fingering first costs nothing. It passes with the right pitch, the full hold and a steady breath, and an interval that would leave the chart's range asks you for another drone or direction.`,
      },
    ],
  };
};

const palmName = () => firstPalmNote().name;
const octaveName = () => firstOctaveNote().name;
const pairLabels = (ps: readonly { label: string }[]) => ps.map((p) => p.label).join(", ");

const register = (pairId: string | undefined, shift: number): Lesson => ({
  id: "aerophone.register",
  title: "Register crossings",
  screens: [
    {
      title: "Across the break",
      figure: { kind: "aerophone", midi: firstOctaveNote().midi - shift },
      text: `A crossing goes back and forth between two notes whose fingerings differ, in eighths, with no stray note in between. On the chart, each note from ${octaveName()} up to the top of the octave uses the fingering of the note an octave below with the +1 key under the left thumb added.`,
    },
    {
      title: "Move everything together",
      text: "The common slip is a stray note between the two, because the keys did not all change at the same moment. Step through this crossing's two fingerings and change only the keys that differ, all at once.",
      steps: crossingSteps(pairId, shift),
    },
    {
      title: "What the drill checks",
      text: "It scores the notes that are right, how even the spacing is, and the stray notes between the two. Names here are written notes, as on the chart.",
    },
    {
      title: "Your instrument comes first",
      text: "Many of the chart's fingerings are best-effort and not yet checked on a real AE-20. Where the chart disagrees with your instrument, trust the instrument.",
    },
  ],
});

const registerPinky = (pairId: string, shift: number): Lesson => ({
  id: "aerophone.register.pinky",
  title: "Pinky keys",
  screens: [
    {
      title: "Sliding a little finger",
      text: `These crossings are ${pairLabels(pinkyPairs())}: a little finger changes from one pinky key to another. The chart shows which other keys change with it.`,
    },
    {
      title: "Change together",
      text: "Change the pinky key at the same moment as any other key that differs. A key that moves early or late sounds as a stray note between the two.",
      steps: crossingSteps(pairId, shift),
    },
    {
      title: "What the drill counts",
      text: "A note that is neither of the two is a stray, and the drill counts them. Several of the chart's fingerings for these low notes are best-effort until checked on your instrument.",
    },
  ],
});

const registerPalm = (pairId: string, shift: number): Lesson => ({
  id: "aerophone.register.palm",
  title: "Palm keys",
  screens: [
    {
      title: "Reaching for the palm keys",
      text: `The chart starts the palm keys at ${palmName()}, with the ${palmKeys()[0]} key, and higher notes add ${andList(palmKeys().slice(1))}. These crossings are ${pairLabels(palmPairs())}.`,
    },
    {
      title: "Change together",
      text: "Where a fingering adds palm keys, press them at the same moment as the other keys change. A key that moves early or late sounds as a stray note between the two.",
      steps: crossingSteps(pairId, shift),
    },
    {
      title: "What the drill counts",
      text: "A note that is neither of the two is a stray, and the drill counts them. The chart's palm fingerings are best-effort until checked on your AE-20.",
    },
  ],
});

/**
 * Lessons for the Aerophone drills, in the order they show. `item` is the setup's own choice that
 * can add one: the long tone's level id, or the register crossing's id.
 */
export function aeroLessons(mode: AeroLessonMode, item?: string, shift = 0): Lesson[] {
  if (mode === "long-tone")
    return [longTone(), ...(BREATH_LEVELS.some((l) => l.id === item) ? [breathLevels()] : [])];
  if (mode === "articulation") return [articulation()];
  if (mode === "interval-landing") return [landing(shift)];
  const group = item ? registerGroup(item) : null;
  return [
    register(item, shift),
    ...(item && group === "pinky"
      ? [registerPinky(item, shift)]
      : item && group === "palm"
        ? [registerPalm(item, shift)]
        : []),
  ];
}

// ---------------------------------------------------------------------------
// Guitar and ukulele bends

/**
 * The bends drill's lesson. The examples sit on the second string at frets 2, 3 and 4, inside the
 * figure's window on any tuning; the drill lets you pick any string and fret.
 */
export function bendLesson(
  instrument: "guitar" | "ukulele" = "guitar",
  openStrings: readonly number[] = TUNINGS.guitar[0].openStrings,
): Lesson {
  const string = 2;
  const open = openStrings[string - 1];
  const FROM = 2;
  const at = (fret: number) => open + fret;
  const mark = (fret: number, label: string) => ({ string, fret, label });
  const fig = (...marks: { string: number; fret: number; label: string }[]): LessonFigure => ({
    kind: "fretboard",
    instrument,
    openStrings: [...openStrings],
    marks,
  });
  const pair = (steps: number): LessonSound => ({
    notes: [
      { midi: [at(FROM)], at: 0, dur: 1 },
      { midi: [at(FROM + steps)], at: 1.2, dur: 1.5 },
    ],
  });
  const to = (steps: number) =>
    fig(mark(FROM, name(at(FROM))), mark(FROM + steps, name(at(FROM + steps))));
  return {
    id: "guitar.bends",
    title: "Bends",
    screens: [
      {
        title: "A whole step is two frets",
        text: "A bend pushes a fretted string across the neck to raise its pitch. A half step bend reaches the note 1 fret higher on the same string, and a whole step bend the note 2 frets higher.",
        steps: [
          {
            text: `Start on the fretted note, here ${name(at(FROM))} on string ${string}.`,
            figure: fig(mark(FROM, name(at(FROM)))),
          },
          {
            text: `A half step bend aims for ${name(at(FROM + 1))}, 1 fret up.`,
            figure: to(1),
          },
          {
            text: `A whole step bend aims for ${name(at(FROM + 2))}, 2 frets up.`,
            figure: to(2),
          },
        ],
      },
      {
        title: "Hear the target first",
        text: "The drill shows your string and fret, names the target note and draws it as a dashed line. To hear it first, fret the target on the same string, 1 fret up for a half step or 2 for a whole step. The app cannot bend, so each button plays the two frets one after the other.",
        options: [
          { label: "Half step", sound: pair(1), figure: to(1) },
          { label: "Whole step", sound: pair(2), figure: to(2) },
        ],
      },
      {
        title: "Push with the ring finger",
        text: "Bend with the ring finger, and put the first and second fingers on the same string behind it when the fret leaves room, so all three push together. Turn the wrist and forearm to push the string across the neck, not just the fingertip.",
      },
      {
        title: "When it judges",
        text: `The microphone judges where the bend settles. It does so once you have held it steady for ${BEND_SETTLE_MS} ms, or after ${secs(BEND_PROMPT_MS)} seconds if you never do, and a bend counts as held after ${BEND.holdMs} ms steady.`,
      },
      {
        title: "What the drill checks",
        text: `A whole step is 200 cents and a half step 100. In tune is within ${BEND.inTune} cents of the target and close within ${BEND.close}, and past that it says flat, so push further, or sharp, so ease off.`,
      },
      {
        title: "Even vibrato",
        text: `In the vibrato exercise you hold a ${instrument === "ukulele" ? "ukulele" : "guitar"} note and rock the string a little, evenly. A try counts when the drill hears vibrato, and it shows the rate, the width in cents and how even it was without judging them. The app cannot play vibrato either.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Piano pedal

/** A worked change the pedal drill grades as clean: the chord, a lift just after it, then straight back down. */
export const PEDAL_EXAMPLE = { liftMs: 150, downMs: 250, barMs: 2000 } as const;

const bar = (chord: { leftHand: number; rightHand: number[] }, at: number, dur: number) =>
  [chord.leftHand, ...chord.rightHand].map((m) => ({ midi: [m], at, dur }));

export function pedalLesson(): Lesson {
  const prog = PEDAL_PROGRESSIONS[0];
  const [a, b] = pedalChords(0, prog.id);
  const marksOf = (c: typeof a) =>
    Object.fromEntries([c.leftHand, ...c.rightHand].map((m) => [m, name(m)]));
  const span = [a, b].flatMap((c) => [c.leftHand, ...c.rightHand]);
  const second = PEDAL_EXAMPLE.barMs / 1000;
  // The app cannot press a pedal, so each case is the first chord's ring: how long it lasts.
  const change = (ring: number): LessonSound => ({
    notes: [...bar(a, 0, ring), ...bar(b, second, second)],
  });
  return {
    id: "piano.pedal",
    title: "Pedalling a chord change",
    screens: [
      {
        title: "Pedal after the chord",
        text: "The sustain pedal keeps notes ringing after you let go of the keys. Play the chord, then press the pedal, and the chord keeps sounding while your hands move. Tap Next to hear both.",
        figure: keys(marksOf(a), span),
        sound: { notes: bar(a, 0, second) },
        steps: [
          {
            text: `Play ${a.symbol} and let go, with no pedal: it stops when your hands leave the keys.`,
            figure: keys(marksOf(a), span),
            sound: { notes: bar(a, 0, 0.35) },
          },
          {
            text: `Play ${a.symbol}, then press the pedal just after it sounds: it keeps ringing after you let go.`,
            figure: keys(marksOf(a), span),
            sound: { notes: bar(a, 0, 2 * second) },
          },
        ],
      },
      {
        title: "Up and down at the change",
        text: `At the next chord, play it, then lift the pedal just after it sounds and press straight back down. The old chord stops and the new one rings. Here that is ${a.symbol} to ${b.symbol}.`,
        figure: keys(marksOf(b), span),
        steps: [
          { text: `Play ${a.symbol} and press the pedal.`, figure: keys(marksOf(a), span) },
          {
            text: `Play ${b.symbol}, then lift the pedal just after it sounds.`,
            figure: keys(marksOf(b), span),
          },
          { text: "Press the pedal straight back down, so the new chord rings." },
        ],
      },
      {
        title: "Why the order matters",
        text: "Lifting before the new chord leaves a gap, and holding the pedal through the change blurs the two chords together. The app cannot press a pedal, so each button changes how long the first chord rings instead.",
        options: [
          { label: "Lifted early: a gap", sound: change(0.9) },
          { label: "Lift just after: clean", sound: change(second + PEDAL_EXAMPLE.liftMs / 1000) },
          { label: "Held through: a blur", sound: change(2 * second) },
        ],
      },
      {
        title: "What the drill checks",
        text: `After each new chord the pedal must lift within ${PEDAL.liftWithinMs} ms of the chord's first note and be down again within ${PEDAL.repressWithinMs} ms. A lift up to ${PEDAL.earlyToleranceMs} ms before the chord still counts, and an earlier one is early. On the first chord the pedal only needs to be down within ${PEDAL.repressWithinMs} ms.`,
      },
      {
        title: "A clean change",
        text: `Lift ${PEDAL_EXAMPLE.liftMs} ms after the chord and be down again ${PEDAL_EXAMPLE.downMs} ms after it, and the change is clean. The drill reads a sustain pedal's CC 64 over MIDI, and counts the pedal as down from ${pct(PEDAL.downAt)} percent. With no pedal arriving, nothing is measured.`,
      },
    ],
  };
}
