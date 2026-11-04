// The flows the council scores. Each panel shows Woodshed's capture flows for one job next
// to the strongest competitor screens for the matching competitor flows.
//   id: panel id; flow: the name judges see; job: what the screens are for (no app names);
//   shots: capture flow dirs under .ui-climb/shots/<round>/; comp: competitor flow ids.

const drill = (id, flow, job, shots, comp, states) => ({
  id,
  flow,
  job,
  shots,
  comp,
  states,
  alternate: true,
});
const DRILL_STATES = [
  "ready",
  "lesson",
  "question",
  "running",
  "feedback-right",
  "feedback-wrong",
  "feedback",
  "check",
  "results",
  "results-poor",
  "silent",
  "demo",
];

export const FLOWS = [
  // Hubs
  {
    id: "today",
    flow: "Home / today's practice plan",
    job: "The screen a musician opens each day: what to practise now, streak and progress at a glance, one obvious first action. Shown on a fresh profile and with practice history.",
    shots: ["today-fresh", "today-history"],
    comp: ["today"],
    states: ["home", "celebration", "home-full"],
  },
  {
    id: "browse",
    flow: "Browsing the exercise catalogue and search",
    job: "Finding an exercise to practise: the catalogue of drills grouped by skill, filtering by instrument, and a quick search.",
    shots: ["drills-tab", "palette"],
    comp: ["browse"],
    states: ["list", "filtered", "open", "typed"],
  },
  {
    id: "paths",
    flow: "Learning paths / curriculum map",
    job: "Structured courses: where you are in a path, what each level teaches, what is next.",
    shots: ["paths"],
    comp: ["paths"],
    states: ["list", "detail"],
  },
  {
    id: "progress",
    flow: "Progress: what next, skills, sessions",
    job: "Seeing how practice is going: what to work on next, mastery per skill, recent sessions; also the empty state before any practice.",
    shots: ["progress"],
    comp: ["progress"],
    states: ["what-next", "skills", "sessions", "empty"],
  },
  {
    id: "journal",
    flow: "Practice journal / session log",
    job: "The log of past practice sessions, with notes, and its empty state.",
    shots: ["journal"],
    comp: ["journal", "progress"],
    states: ["list", "entry", "edit", "empty"],
  },
  {
    id: "connect",
    flow: "Device setup: connecting MIDI instruments and the microphone",
    job: "Connecting a MIDI keyboard, drum pads, a wind controller and the microphone, and seeing that each one is heard.",
    shots: ["connect"],
    comp: ["device-setup"],
    states: ["rig", "empty"],
  },
  {
    id: "tuner",
    flow: "Tuner and drone",
    job: "Tuning an instrument from the microphone, and a drone for intonation practice.",
    shots: ["tuner"],
    comp: ["tuner"],
    states: ["listening", "drone", "ready"],
  },
  {
    id: "settings-guide",
    flow: "Settings and help guide",
    job: "App settings and a help guide explaining how the app works.",
    shots: ["settings", "guide"],
    comp: ["settings"],
    states: ["page"],
  },
  {
    id: "songs",
    flow: "Song library and song player",
    job: "A shelf of songs to learn, and playing along with one song.",
    shots: ["library", "song-studio"],
    comp: ["songs"],
    states: ["shelf", "reference", "ready", "running", "results", "import"],
  },
  {
    id: "create",
    flow: "Create: beat maker, piano roll, recorder",
    job: "Making music: a drum beat grid, a piano roll, drum kits, and recording yourself.",
    shots: ["create", "record"],
    comp: ["create"],
    states: ["beat-grid", "playing", "roll", "kits", "recording", "ready"],
  },
  // Ear training
  drill(
    "ear-intervals",
    "Ear training exercise: intervals",
    "Hearing two notes and naming the interval between them, with a lesson first, live answer feedback and a results summary.",
    ["ear-intervals"],
    ["ear-question", "results"],
    DRILL_STATES,
  ),
  drill(
    "ear-chords",
    "Ear training exercise: chord qualities",
    "Hearing a chord and naming its quality (major, minor and so on).",
    ["ear-chords"],
    ["ear-question", "results"],
    DRILL_STATES,
  ),
  drill(
    "ear-degrees",
    "Ear training exercise: scale degrees",
    "Hearing a note in a key and naming its scale degree.",
    ["ear-degrees"],
    ["ear-question", "results"],
    DRILL_STATES,
  ),
  drill(
    "ear-melody",
    "Ear training exercise: melody dictation",
    "Hearing a short melody and writing or playing it back.",
    ["ear-melody"],
    ["ear-question", "results"],
    DRILL_STATES,
  ),
  drill(
    "ear-mixed",
    "Ear training exercise: mixed review",
    "A mixed ear-training review across question types.",
    ["ear-mixed"],
    ["ear-question", "results"],
    DRILL_STATES,
  ),
  drill(
    "studio-ears",
    "Ear training for producers: studio listening",
    "Hearing production differences (EQ, levels, effects) and naming them.",
    ["studio-ears"],
    ["ear-question", "results"],
    DRILL_STATES,
  ),
  // Rhythm and reading
  drill(
    "rhythm-pulse",
    "Rhythm exercise: keeping the pulse",
    "Tapping or playing along with a click to keep steady time, graded on timing.",
    ["rhythm-pulse"],
    ["rhythm", "drill-running"],
    DRILL_STATES,
  ),
  drill(
    "rhythm-read",
    "Rhythm exercise: read and tap",
    "Reading rhythm notation and tapping it in time.",
    ["rhythm-read"],
    ["rhythm", "reading"],
    DRILL_STATES,
  ),
  drill(
    "rhythm-echo",
    "Rhythm exercise: echo",
    "Hearing a rhythm and tapping it back.",
    ["rhythm-echo"],
    ["rhythm", "ear-question"],
    DRILL_STATES,
  ),
  drill(
    "rhythm-dictation",
    "Rhythm exercise: rhythm and groove dictation",
    "Hearing a rhythm or drum groove and writing it down.",
    ["rhythm-dictation", "rhythm-groove"],
    ["rhythm", "ear-question"],
    DRILL_STATES,
  ),
  drill(
    "reading-flashcards",
    "Note reading: flashcards",
    "Naming or playing notes shown on a staff, one at a time.",
    ["reading-flashcards"],
    ["reading"],
    DRILL_STATES,
  ),
  drill(
    "reading-sight",
    "Sight-reading",
    "Playing a short phrase from notation at sight, in time, graded per note.",
    ["reading-sight"],
    ["reading", "drill-running"],
    DRILL_STATES,
  ),
  // Instruments
  drill(
    "scales",
    "Scales on piano and guitar",
    "Playing a scale in time on piano or guitar, with the notes and fingering shown.",
    ["scales-piano", "scales-guitar"],
    ["drill-running", "fretboard"],
    DRILL_STATES,
  ),
  drill(
    "two-hand",
    "Two-hand piano exercise",
    "Hand independence: both hands playing a pattern on the piano.",
    ["two-hand", "pedal"],
    ["drill-running", "reading"],
    DRILL_STATES,
  ),
  drill(
    "chords-strings",
    "Guitar and ukulele chords",
    "Changing between chord shapes on guitar or ukulele, with chord diagrams and the fretboard.",
    ["chords-guitar", "chords-ukulele"],
    ["fretboard", "drill-running"],
    [
      "ready",
      "lesson",
      "running",
      "changes-running",
      "results",
      "changes-results",
      "check",
      "silent",
      ...DRILL_STATES,
    ],
  ),
  drill(
    "fretboard",
    "Fretboard note finding",
    "Finding notes on the guitar or ukulele neck.",
    ["fretboard-guitar", "fretboard-ukulele"],
    ["fretboard"],
    [
      "finder-ready",
      "lesson",
      "finder-running",
      "running",
      "finder-results",
      "results",
      "finder-check",
      "silent",
      ...DRILL_STATES,
    ],
  ),
  drill(
    "strum",
    "Strumming patterns",
    "Strumming a rhythm pattern on guitar or ukulele in time.",
    ["strum"],
    ["fretboard", "rhythm"],
    DRILL_STATES,
  ),
  drill(
    "circle",
    "Circle of fifths",
    "Learning keys and key signatures on the circle of fifths.",
    ["circle"],
    ["lesson", "ear-question"],
    DRILL_STATES,
  ),
  drill(
    "pads-rudiments",
    "Finger drumming: rudiments",
    "Playing drum rudiments on MIDI pads in time.",
    ["pads-rudiments"],
    ["pads"],
    DRILL_STATES,
  ),
  drill(
    "pads-grooves",
    "Finger drumming: grooves and fills",
    "Playing drum grooves and fills on MIDI pads in time.",
    ["pads-grooves", "pads-fills"],
    ["pads"],
    DRILL_STATES,
  ),
  drill(
    "pads-chop",
    "Finger drumming: chopping samples",
    "Playing chopped sample pads in time.",
    ["pads-chop"],
    ["pads", "create"],
    DRILL_STATES,
  ),
  drill(
    "aerophone",
    "Wind controller practice",
    "Practising a saxophone-fingered MIDI wind controller: fingering, breath and notes.",
    ["aerophone"],
    ["drill-running", "lesson"],
    DRILL_STATES,
  ),
  drill(
    "voicings",
    "Piano chord voicings",
    "Playing jazz chord voicings on piano in a key.",
    ["voicings"],
    ["drill-running", "lesson"],
    DRILL_STATES,
  ),
  drill(
    "licks",
    "Jazz licks",
    "Learning and playing short jazz phrases in time.",
    ["licks"],
    ["drill-running", "songs"],
    DRILL_STATES,
  ),
  drill(
    "chord-scales",
    "Chord scales over changes",
    "Playing the right scale over each chord of a progression.",
    ["chord-scales"],
    ["drill-running", "lesson"],
    DRILL_STATES,
  ),
  drill(
    "comping",
    "Comping and accompaniment",
    "Accompanying a progression with chords in time, and playing along with a backing band.",
    ["comping", "accompany"],
    ["drill-running", "songs"],
    DRILL_STATES,
  ),
  drill(
    "jam",
    "Jamming and improvising over a backing track",
    "Improvising over chord changes with a backing track, with the chords scrolling by.",
    ["jam"],
    ["drill-running", "songs"],
    DRILL_STATES,
  ),
  drill(
    "call-response",
    "Call and response, playing by ear",
    "Hearing a phrase and playing it back on the instrument.",
    ["call-response", "by-ear"],
    ["ear-question", "drill-running"],
    DRILL_STATES,
  ),
  drill(
    "phrases",
    "Short phrases: melodies and licks to learn",
    "Learning popular short phrases by hearing them and playing them back, graded on notes and timing.",
    ["phrases"],
    ["drill-running", "songs"],
    DRILL_STATES,
  ),
];

/** Woodshed images for a panel: one per state, rotating viewport and theme, at most `max`. */
export function pickShots(available, flow, max = 8) {
  // available: [{ shotFlow, state, width, theme, path }]
  const combos = [
    ["desktop", "light"],
    ["phone", "dark"],
    ["desktop", "dark"],
    ["phone", "light"],
  ];
  const n = flow.shots.length;
  const pool = available.filter((a) => !a.full && flow.shots.includes(a.shotFlow));
  const states = [...flow.states];
  for (const a of pool) if (!states.includes(a.state)) states.push(a.state);
  const take = (sf, st, c) => {
    const here = pool.filter((a) => a.shotFlow === sf && a.state === st);
    if (!here.length) return null;
    for (let t = 0; t < combos.length; t++) {
      const [w, th] = combos[(c + t) % combos.length];
      const hit = here.find((a) => a.width === w && a.theme === th);
      if (hit) return hit;
    }
    return here[0];
  };
  const picks = [];
  if (flow.alternate && n > 1) {
    // Drill panels: one shot per state, taking the drills (or instruments) in turn, and
    // rotating width and theme so each drill gets both widths and both themes.
    let i = 0;
    for (const st of states) {
      let pick = null;
      for (let t = 0; t < n && !pick; t++)
        pick = take(flow.shots[(i + t) % n], st, (i + Math.floor(i / n)) % 4);
      if (!pick) continue;
      picks.push(pick);
      i++;
    }
  } else {
    // Hub panels: every shot flow's version of each state (fresh and with history, say).
    let i = 0;
    for (const st of states) {
      let any = false;
      flow.shots.forEach((sf, k) => {
        const pick = take(sf, st, (i + k) % 4);
        if (pick) {
          picks.push(pick);
          any = true;
        }
      });
      if (any) i++;
    }
  }
  // Make sure there are at least two phone shots and both themes.
  const sel = picks.slice(0, max);
  const need = (pred) => {
    if (sel.some(pred)) return;
    const add = pool.find(pred);
    if (add) sel.length >= max ? sel.splice(sel.length - 1, 1, add) : sel.push(add);
  };
  need((a) => a.width === "phone");
  need((a) => a.theme === "dark");
  need((a) => a.theme === "light");
  return sel;
}
