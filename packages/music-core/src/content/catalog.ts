// The drill registry every hub reads. Routes follow TASKS.md "Architecture".
// exerciseId is what a drill records on its runs and scoring events; ids named by
// the learning-path data are used exactly as written there.

import { INSTRUMENTS, type Capability, type Instrument, type Modality } from "../types";
import { EAR_DRILLS } from "./ear";
import { STUDIO_EXERCISES } from "./studio";
import { CIRCLE_MODES } from "./circle";
import { TOPICS, topicSkill } from "./pads-repertoire";
import { RHYTHM_PATTERNS, rhythmSkills } from "./rhythm";
import { LICK_CATEGORIES, LICK_CATEGORY_LABEL, lickSkills } from "./piano";
import { chordShapeSkills } from "./technique";
import { aerophoneSkills, GROOVES, grooveSkills } from "./winds-pads";
import { m } from "@repo/i18n/messages.js";

export interface DrillMode {
  id: string;
  label: string;
  exerciseId: string;
  skillIds: string[];
}

export interface CatalogEntry {
  id: string;
  /** The default mode's exerciseId when the entry has modes. */
  exerciseId: string;
  route: string;
  title: string;
  /** One plain sentence: what you will hear or play. */
  blurb: string;
  instruments: Instrument[];
  capability: Capability;
  skillIds: string[];
  modality: Modality;
  modes: DrillMode[];
}

const uniq = (ids: string[]) => [...new Set(ids)];
const mode = (
  id: string,
  label: string,
  exerciseId: string,
  skillIds: string[] = [],
): DrillMode => ({
  id,
  label,
  exerciseId,
  skillIds,
});
const entry = (
  e: Omit<CatalogEntry, "exerciseId" | "skillIds" | "modes"> & Partial<CatalogEntry>,
): CatalogEntry => {
  const modes = e.modes ?? [];
  return {
    ...e,
    modes,
    exerciseId: e.exerciseId ?? modes[0].exerciseId,
    skillIds: e.skillIds ?? uniq(modes.flatMap((m) => m.skillIds)),
  };
};

const EAR_EXERCISE: Record<string, string> = {
  intervals: "ear.intervals",
  "interval-compare": "ear.interval-compare",
  "chord-qualities": "ear.chord-qualities",
  cadences: "ear.cadences",
  "chord-functions": "ear.chord-functions",
  progressions: "ear.progressions",
  "song-loops": "ear.song-loops",
  scales: "ear.scales",
  inversions: "ear.inversions",
  "bass-lines": "ear.bass-lines",
  "fine-pitch": "ear.fine-pitch",
  "wrong-note": "ear.error-detection",
  "scale-degrees": "ear.scale-degree-recognition",
  "melody-dictation": "ear.melody-dictation",
  "repertoire-transfer": "ear.repertoire-transfer",
  mixed: "ear.mixed",
};
const EAR_MODE_LABEL: Record<string, string> = {
  choice: m.music_content_catalog_mode_choice(),
  "play-back": m.music_content_catalog_mode_play_it_back(),
  voice: m.music_content_catalog_mode_sing_it(),
  listen: m.music_content_catalog_mode_pocket_recall(),
  "listen-along": m.music_content_catalog_mode_listen_along(),
};
const EAR_BLURB: Record<string, string> = {
  intervals: m.music_content_catalog_ear_intervals_blurb(),
  "interval-compare": m.music_content_catalog_ear_interval_compare_blurb(),
  "chord-qualities": m.music_content_catalog_ear_chord_qualities_blurb(),
  cadences: m.music_content_catalog_ear_cadences_blurb(),
  "chord-functions": m.music_content_catalog_ear_chord_functions_blurb(),
  progressions:
    m.music_content_catalog_ear_progressions_blurb(),
  "song-loops": m.music_content_catalog_ear_song_loops_blurb(),
  scales: m.music_content_catalog_ear_scales_blurb(),
  inversions: m.music_content_catalog_ear_inversions_blurb(),
  "bass-lines": m.music_content_catalog_ear_bass_lines_blurb(),
  "fine-pitch": m.music_content_catalog_ear_fine_pitch_blurb(),
  "wrong-note": m.music_content_catalog_ear_wrong_note_blurb(),
  "scale-degrees": m.music_content_catalog_ear_scale_degrees_blurb(),
  "melody-dictation": m.music_content_catalog_ear_melody_dictation_blurb(),
  "repertoire-transfer": m.music_content_catalog_ear_repertoire_transfer_blurb(),
  mixed: m.music_content_catalog_ear_mixed_blurb(),
};

const earEntries = EAR_DRILLS.map((d) =>
  entry({
    id: `ear-${d.slug}`,
    exerciseId: EAR_EXERCISE[d.slug],
    route: d.route,
    title: d.title,
    blurb: EAR_BLURB[d.slug],
    instruments: [...INSTRUMENTS],
    capability: "ear",
    skillIds: d.skillIds,
    modality: "heard",
    // Answer modes are modalities of one exercise, so they share its exerciseId.
    modes: d.answerModes.map((m) => mode(m, EAR_MODE_LABEL[m], EAR_EXERCISE[d.slug], d.skillIds)),
  }),
);

const GUITAR_UKE: Instrument[] = ["guitar", "ukulele"];

export const CATALOG: CatalogEntry[] = [
  ...earEntries,
  entry({
    id: "reading",
    route: "/music/reading",
    title: m.music_content_catalog_reading_title(),
    blurb: m.music_content_catalog_reading_blurb(),
    instruments: ["piano", "guitar", "ukulele", "aerophone"],
    capability: "reading",
    modality: "read",
    modes: [
      mode("flashcards", m.music_content_catalog_mode_flashcards(), "reading.flashcard.note-id", [
        "reading.treble",
        "reading.treble.landmarks",
        "reading.bass",
        "reading.bass.landmarks",
        "reading.polyphonic",
      ]),
      mode("sight-reading", m.music_content_catalog_mode_sight_reading(), "reading.sight-reading", [
        "reading.treble",
        "reading.treble.stepwise",
        "reading.bass",
        "reading.bass.stepwise",
        "reading.rhythm.compound",
      ]),
    ],
  }),
  entry({
    id: "rhythm",
    route: "/music/rhythm",
    title: m.music_content_catalog_rhythm_title(),
    blurb: m.music_content_catalog_rhythm_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "rhythm",
    modality: "tapped",
    modes: [
      mode("pulse", m.music_content_catalog_mode_pulse(), "rhythm.pulse", rhythmSkills("pulse")),
      mode(
        "read-and-tap",
        m.music_content_catalog_mode_read_and_tap(),
        rhythmExerciseId("quarter-pulse"),
        uniq(RHYTHM_PATTERNS.flatMap((p) => rhythmSkills(p.id))),
      ),
      mode("echo", m.music_content_catalog_mode_echo(), "rhythm.echo", ["rhythm.subdivisions", "ear.rhythm-echo"]),
      mode("groove", m.music_content_catalog_mode_groove_dictation(), "rhythm.groove-dictation", [
        "rhythm.subdivisions",
        "ear.groove-dictation",
      ]),
      mode("dictation", m.music_content_catalog_mode_dictation(), "rhythm.dictation", [
        "rhythm.subdivisions",
        "ear.rhythm-dictation",
      ]),
    ],
  }),
  entry({
    id: "scales",
    route: "/music/scales",
    title: m.music_content_catalog_scales_title(),
    blurb: m.music_content_catalog_scales_blurb(),
    instruments: ["piano", "guitar", "ukulele", "aerophone"],
    capability: "technique",
    modality: "played",
    exerciseId: "technique.scale",
    skillIds: [
      "technique.scales",
      "technique.scale.major",
      "technique.scale.natural-minor",
      "technique.scale.harmonic-minor",
      "technique.scale.melodic-minor",
      "technique.scale.major-pentatonic",
      "technique.scale.minor-pentatonic",
    ],
  }),
  entry({
    id: "two-hand",
    route: "/music/two-hand",
    title: m.music_content_catalog_two_hand_title(),
    blurb:
      m.music_content_catalog_two_hand_blurb(),
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    exerciseId: "technique.piano.two-hand-independence",
    skillIds: ["technique.piano.two-hand-independence", "technique.piano.independence.shell-line"],
  }),
  entry({
    id: "pedal",
    route: "/music/pedal",
    title: m.music_content_catalog_pedal_title(),
    blurb:
      m.music_content_catalog_pedal_blurb(),
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    exerciseId: "technique.pedal",
    skillIds: ["technique.pedal"],
  }),
  entry({
    id: "comping",
    route: "/music/changes/comping",
    title: m.music_content_catalog_comping_title(),
    blurb: m.music_content_catalog_comping_blurb(),
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    exerciseId: "comping",
    skillIds: ["technique.piano.comping"],
  }),
  entry({
    id: "accompany",
    route: "/music/changes/accompany",
    title: m.music_content_catalog_accompany_title(),
    blurb:
      m.music_content_catalog_accompany_blurb(),
    instruments: ["piano"],
    capability: "technique",
    modality: "played",
    modes: [
      mode("patterns", m.music_content_catalog_mode_patterns(), "technique.piano.accompaniment", [
        "technique.piano.two-hand-independence",
      ]),
      mode("comping", m.music_content_catalog_comping_title(), "technique.piano.comping-changes", ["technique.piano.comping"]),
      mode("lead-sheet", m.music_content_catalog_mode_lead_sheet(), "technique.piano.lead-sheet", [
        "technique.piano.two-hand-independence",
      ]),
    ],
  }),
  entry({
    id: "voicings",
    route: "/music/changes/voicings",
    title: m.music_content_catalog_voicings_title(),
    blurb: m.music_content_catalog_voicings_blurb(),
    instruments: ["piano"],
    capability: "harmony",
    modality: "played",
    modes: [
      mode("major", m.music_content_catalog_mode_major(), "voicing-drill", ["harmony.ii-v-i", "harmony.ii-v-i.voicings.major"]),
      mode("minor", m.music_content_catalog_mode_minor(), "voicing-drill", ["harmony.ii-v-i", "harmony.ii-v-i.voicings.minor"]),
      mode("altered", m.music_content_catalog_mode_altered(), "voicing-drill", [
        "harmony.ii-v-i",
        "harmony.ii-v-i.voicings.altered",
      ]),
      mode("inversions", m.music_content_catalog_mode_voice_leading(), "voicing-drill", [
        "harmony.ii-v-i",
        "harmony.ii-v-i.voice-leading",
      ]),
      mode("cadence", m.music_content_catalog_mode_cadences(), "voicing-drill", ["harmony.keyboard-cadences"]),
      mode("cadence-minor", m.music_content_catalog_mode_minor_cadences(), "voicing-drill", ["harmony.keyboard-cadences"]),
      mode("jazz", m.music_content_catalog_mode_jazz_types(), "voicing-drill", [
        "harmony.voicings.diatonic-sevenths",
        "harmony.voicings.quartal",
        "harmony.voicings.two-handed",
        "harmony.voicings.block-chords",
      ]),
    ],
  }),
  entry({
    id: "licks",
    route: "/music/changes/licks",
    title: m.music_content_catalog_licks_title(),
    blurb: m.music_content_catalog_licks_blurb(),
    instruments: ["piano", "guitar", "ukulele", "aerophone"],
    capability: "harmony",
    modality: "played",
    modes: LICK_CATEGORIES.map((c) =>
      mode(c, LICK_CATEGORY_LABEL[c] ?? c, "jazz.lick.playback", lickSkills(c)),
    ),
  }),
  entry({
    id: "phrases",
    route: "/music/phrases",
    title: m.music_content_catalog_phrases_title(),
    blurb:
      m.music_content_catalog_phrases_blurb(),
    instruments: ["piano", "guitar", "ukulele", "aerophone", "mpc"],
    capability: "technique",
    modality: "played",
    exerciseId: "repertoire.phrases.piano",
    skillIds: [
      ...(["piano", "guitar", "ukulele", "aerophone"] as const).map(
        (i) => `repertoire.phrases.${i}`,
      ),
      "technique.mpc.phrases",
    ],
  }),
  entry({
    id: "chord-scales",
    route: "/music/changes/chord-scales",
    title: m.music_content_catalog_chord_scales_title(),
    blurb: m.music_content_catalog_chord_scales_blurb(),
    instruments: ["piano", "guitar", "ukulele", "aerophone"],
    capability: "harmony",
    modality: "played",
    modes: [
      mode("major", m.music_content_catalog_mode_major_ii_v_i(), "jazz.chord-scales", ["harmony.ii-v-i.chord-scales.major"]),
      mode("minor", m.music_content_catalog_mode_minor_ii_v_i(), "jazz.chord-scales", ["harmony.ii-v-i.chord-scales.minor"]),
    ],
  }),
  entry({
    id: "fretboard",
    route: "/music/fretboard",
    title: m.music_content_catalog_fretboard_title(),
    blurb: m.music_content_catalog_fretboard_blurb(),
    instruments: GUITAR_UKE,
    capability: "technique",
    modality: "played",
    modes: [
      mode("spider", m.music_content_catalog_mode_spider(), "technique.guitar.spider", [
        "technique.strings.spider",
        "technique.strings.spider.permutations",
        "technique.guitar.spider",
        "technique.ukulele.spider",
      ]),
      mode("positions", m.music_content_catalog_mode_positions(), "technique.guitar.positions", [
        "technique.strings.spider",
        "technique.guitar.spider",
      ]),
      mode("note-finder", m.music_content_catalog_mode_note_finder(), "technique.guitar.note-finder", [
        "technique.strings.note-finder",
        "technique.guitar.note-finder",
        "technique.ukulele.note-finder",
      ]),
      mode("interval-recall", m.music_content_catalog_mode_interval_recall(), "technique.guitar.interval-recall", [
        "technique.guitar.intervals",
        "technique.guitar.intervals.3",
        "technique.guitar.intervals.4",
        "technique.guitar.intervals.7",
        "technique.guitar.intervals.12",
      ]),
      mode("legato", m.music_content_catalog_mode_legato(), "technique.guitar.legato", ["technique.legato"]),
      mode("bends", m.music_content_catalog_mode_bends(), "technique.guitar.bends", [
        "technique.bends",
        "technique.vibrato",
      ]),
      mode("harmonics", m.music_content_catalog_mode_harmonics(), "technique.guitar.harmonics", ["technique.strings"]),
    ],
  }),
  entry({
    id: "chords",
    route: "/music/chords",
    title: m.music_content_catalog_chords_title(),
    blurb: m.music_content_catalog_chords_blurb(),
    instruments: GUITAR_UKE,
    capability: "technique",
    modality: "played",
    modes: [
      mode("build", m.music_content_catalog_mode_build(), "technique.guitar.chord-perfect", [
        ...chordShapeSkills("guitar", "build"),
        "technique.ukulele.chord-perfect",
      ]),
      mode("pick", m.music_content_catalog_mode_pick(), "technique.guitar.chord-pick", [
        ...chordShapeSkills("guitar", "pick"),
        "technique.ukulele.chord-perfect",
      ]),
      mode("strum", m.music_content_catalog_mode_strum_identify(), "technique.guitar.open-chord-id", [
        ...chordShapeSkills("guitar", "strum"),
        "technique.ukulele.open-chord-id",
      ]),
      mode("changes", m.music_content_catalog_mode_changes(), "technique.guitar.chord-changes", [
        ...chordShapeSkills("guitar", "changes"),
        "technique.ukulele.chord-changes",
      ]),
      mode("fingerpick", m.music_content_catalog_mode_fingerpicking(), "technique.fingerpicking", ["technique.fingerpicking"]),
    ],
  }),
  entry({
    id: "strum",
    route: "/music/strum",
    title: m.music_content_catalog_strum_title(),
    blurb: m.music_content_catalog_strum_blurb(),
    instruments: GUITAR_UKE,
    capability: "harmony",
    modality: "played",
    // No mastery claim: the progression follower writes a journal entry only.
    exerciseId: "technique.guitar.strum-progression",
    skillIds: [],
  }),
  entry({
    id: "pads",
    route: "/music/pads",
    title: m.music_content_catalog_pads_title(),
    blurb:
      m.music_content_catalog_pads_blurb(),
    instruments: ["mpc"],
    capability: "technique",
    modality: "played",
    modes: [
      // The path data records every rudiment (singles, sixteenths, paradiddles) under this id.
      mode("rudiment", m.music_content_catalog_mode_technique(), "technique.mpc.single-strokes", [
        "technique.mpc",
        "technique.mpc.single-strokes",
        "technique.mpc.paradiddles",
        "technique.mpc.rolls",
        "technique.mpc.accents",
      ]),
      mode(
        "groove",
        m.music_content_catalog_mode_grooves(),
        "technique.mpc.groove",
        uniq([...GROOVES.flatMap((g) => grooveSkills(g.value)), ...TOPICS.map(topicSkill)]),
      ),
      mode("steady", m.music_content_catalog_mode_hold_tempo(), "technique.mpc.steadiness", [
        "technique.mpc",
        "technique.mpc.steadiness",
      ]),
      mode("dynamics", m.music_content_catalog_mode_dynamics(), "technique.mpc.dynamics", [
        "technique.mpc",
        "technique.mpc.dynamics",
      ]),
      mode("fills", m.music_content_catalog_mode_fills(), "technique.mpc.fills", ["technique.mpc", "technique.mpc.fills"]),
      mode("echo", m.music_content_catalog_mode_play_it_back(), "technique.mpc.echo", ["technique.mpc", "technique.mpc.echo"]),
      mode("ostinato", m.music_content_catalog_mode_ostinato(), "technique.mpc.ostinato", [
        "technique.mpc",
        "technique.mpc.independence",
      ]),
      mode("orchestrate", m.music_content_catalog_mode_orchestrate(), "technique.mpc.orchestrate", [
        "technique.mpc",
        "technique.mpc.orchestration",
      ]),
      mode("improvise", m.music_content_catalog_mode_improvise(), "technique.mpc.improvise", [
        "technique.mpc",
        "technique.mpc.improvise",
      ]),
      mode("chop", m.music_content_catalog_mode_chop(), "technique.mpc.chop", ["technique.mpc", "technique.mpc.chop"]),
      mode("repeat", m.music_content_catalog_mode_note_repeat(), "technique.mpc.repeat", [
        "technique.mpc",
        "technique.mpc.repeat",
      ]),
      mode("song", m.music_content_catalog_mode_song_form(), "technique.mpc.song", ["technique.mpc", "technique.mpc.song"]),
    ],
  }),
  entry({
    id: "aerophone",
    route: "/music/aerophone",
    title: "Aerophone",
    blurb:
      m.music_content_catalog_aerophone_blurb(),
    instruments: ["aerophone"],
    capability: "technique",
    modality: "played",
    modes: [
      mode("fingering", m.music_content_catalog_mode_fingering(), "technique.aerophone.fingering", aerophoneSkills("fingering")),
      mode("long-tone", m.music_content_catalog_mode_long_tone(), "technique.aerophone.long-tone", aerophoneSkills("long-tone")),
      mode("swell", m.music_content_catalog_mode_swell(), "technique.aerophone.swell", aerophoneSkills("swell")),
      mode(
        "articulation",
        m.music_content_catalog_mode_articulation(),
        "technique.aerophone.articulation",
        aerophoneSkills("articulation"),
      ),
      mode(
        "interval-landing",
        m.music_content_catalog_mode_interval_landing(),
        "technique.aerophone.interval-landing",
        aerophoneSkills("interval-landing"),
      ),
      mode(
        "scales",
        m.music_content_catalog_mode_scales_arpeggios(),
        "technique.aerophone.scales",
        aerophoneSkills("scales"),
      ),
      mode(
        "tonguing",
        m.music_content_catalog_mode_tonguing(),
        "technique.aerophone.tonguing",
        aerophoneSkills("tonguing"),
      ),
      mode(
        "register",
        m.music_content_catalog_mode_register(),
        "technique.aerophone.register",
        aerophoneSkills("register"),
      ),
      mode("trills", m.music_content_catalog_mode_trills(), "technique.aerophone.trills", aerophoneSkills("trills")),
      mode("vibrato", m.music_content_catalog_mode_bite_vibrato(), "technique.aerophone.vibrato", aerophoneSkills("vibrato")),
      mode("swing", m.music_content_catalog_mode_swing(), "technique.aerophone.swing", aerophoneSkills("swing")),
      mode(
        "long-scale",
        m.music_content_catalog_mode_long_scale(),
        "technique.aerophone.long-scale",
        aerophoneSkills("long-scale"),
      ),
      mode(
        "calibrate",
        m.music_content_catalog_mode_setup_check(),
        "technique.aerophone.calibrate",
        aerophoneSkills("calibrate"),
      ),
    ],
  }),
  entry({
    id: "circle",
    route: "/music/circle",
    title: m.music_content_catalog_circle_title(),
    blurb: m.music_content_catalog_circle_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "reading",
    modality: "recognized",
    modes: CIRCLE_MODES.map((m) =>
      mode(m.id, m.title, `theory.circle.${m.id}`, ["theory.circle", m.skillId]),
    ),
  }),
  entry({
    id: "listening",
    route: "/music/ear/studio",
    title: m.music_content_catalog_listening_title(),
    blurb:
      m.music_content_catalog_listening_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "ear",
    modality: "heard",
    modes: STUDIO_EXERCISES.map((e) =>
      mode(e.id, e.title, `studio.${e.id}`, ["studio.ears", e.skillId]),
    ),
  }),
  entry({
    id: "by-ear",
    route: "/music/by-ear",
    title: m.music_content_catalog_by_ear_title(),
    blurb:
      m.music_content_catalog_by_ear_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "ear",
    modality: "played",
    modes: [
      mode("learn", m.music_content_catalog_mode_learn_part(), "ear.by-ear", ["ear.by-ear"]),
      mode("home", m.music_content_catalog_mode_find_tonic(), "ear.find-home", ["ear.find-home"]),
      mode("sing", m.music_content_catalog_mode_sing_along(), "ear.by-ear.sing", ["ear.by-ear"]),
    ],
  }),
  entry({
    id: "call-response",
    route: "/music/changes/call-response",
    title: m.music_content_catalog_call_response_title(),
    blurb:
      m.music_content_catalog_call_response_blurb(),
    instruments: ["piano", "guitar", "ukulele", "aerophone"],
    capability: "ear",
    modality: "played",
    modes: [
      mode("echo", m.music_content_catalog_mode_echo_call(), "ear.call-response.echo", ["ear.call-response"]),
      mode("answer", m.music_content_catalog_mode_answer(), "ear.call-response.answer", ["ear.call-response"]),
    ],
  }),
  entry({
    id: "ear-feel",
    route: "/music/ear/feel",
    title: m.music_content_catalog_feel_title(),
    blurb: m.music_content_catalog_feel_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "ear",
    modality: "heard",
    exerciseId: "ear.rhythm-feel",
    skillIds: ["rhythm.subdivisions"],
  }),
  entry({
    id: "lab",
    route: "/music/lab",
    title: m.music_content_catalog_lab_title(),
    blurb: m.music_content_catalog_lab_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "technique",
    modality: "played",
    exerciseId: "lab.free-play",
    skillIds: [],
  }),
  entry({
    id: "jam",
    route: "/music/changes/jam",
    title: m.music_content_catalog_jam_title(),
    blurb: m.music_content_catalog_jam_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "harmony",
    modality: "played",
    exerciseId: "jam.improv",
    skillIds: [],
  }),
  entry({
    id: "song-studio",
    // Song practice lives at /music/songs/[id]; the library is where a song is picked.
    route: "/music/library?tab=songs",
    title: m.music_content_catalog_song_title(),
    blurb: m.music_content_catalog_song_blurb(),
    instruments: [...INSTRUMENTS],
    capability: "reading",
    modality: "played",
    exerciseId: "song.studio",
    // Imported songs never write mastery.
    skillIds: [],
  }),
];

export const catalogEntry = (id: string) => CATALOG.find((e) => e.id === id);

/** Rhythm read-and-tap runs record the pattern: rhythm.pattern.<patternId>. */
export function rhythmExerciseId(patternId: string): string {
  return `rhythm.pattern.${patternId}`;
}

/** Fretted exercise ids are written for guitar; this swaps in the instrument (ukulele). */
export const exerciseIdFor = (exerciseId: string, instrument: Instrument) =>
  exerciseId.replace(/^technique\.guitar\./, `technique.${instrument}.`);
