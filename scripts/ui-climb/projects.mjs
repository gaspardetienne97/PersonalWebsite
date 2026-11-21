// The projects the UI hill climb can run on. Every harness script takes
//   --project woodshed|site|narrator   (or the env UI_CLIMB_PROJECT)
// and reads its work dir, rubric, dimensions, flows and capture folder from here.
// With no project given it is Woodshed, exactly as the first climb ran.
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../..");

const WOODSHED_NOTES =
  "Harness notes: from round 1, panels that mix two drills caption each screen with its drill name (round 0 did not), so part of a round 1 gain on those panels may come from the caption, not the app. From round 2, drill panels take their two drills or instruments in turn with balanced widths and themes, and the captures add fretboard Note finder, chord Changes and the Create beat playing (features that existed but were never shown), so part of a round 2 gain on those flows may come from the panel, not the app. From round 4, captures close the session before switching to Check (round 3's chords, Note finder and voicings 'check' shots were really Practice), show Note finder on both fretted instruments, and give played notes a few ms of seeded jitter and timed answers a seeded think time, so round 4 movement on those flows is partly the harness. From round 5, the songs panel no longer includes the Create reference page, settings gets a phone shot, flashcards a phone running shot, phone ear feedback is shot without scrolling, and the good strum run plays the pattern's strokes instead of beats 1 and 3. GPT (astra) is limited by the account's Codex quota and runs at medium effort from round 1; it is missing where shown as '-'.";

export const PROJECTS = {
  woodshed: {
    key: "woodshed",
    /** The name used in the scoreboard and the report. */
    name: "Woodshed",
    /** What the judges are told each candidate is ("each from a different ..."). */
    each: "app",
    /** What kind of thing is judged, for titles and notes. */
    kind: "music learning app",
    /** Work dir (git-ignored), relative to the repo root. */
    work: ".ui-climb",
    rubric: "rubric.md",
    dims: [
      "visual",
      "clarity",
      "engagement",
      "teaching",
      "flow",
      "phone",
      "accessibility",
      "consistency",
    ],
    flows: "./flows.mjs",
    /** Folder of capture specs, relative to scripts/ui-climb/. */
    capture: "capture",
    /** The key of our own candidate in panels and verdicts. */
    candidate: "woodshed",
    /** Suffix for the scoreboard and report files ("" keeps scoreboard.md, report.html). */
    suffix: "",
    port: 5180,
    fableLabel: "Claude Fable 5.1",
    notes: WOODSHED_NOTES,
    /** Captions come from the file name (the first climb's way), not from sidecar files. */
    sidecarCaptions: false,
  },
  site: {
    key: "site",
    name: "The site",
    each: "website",
    kind: "personal website",
    work: ".ui-climb-site",
    rubric: "rubric-site.md",
    dims: [
      "visual",
      "clarity",
      "engagement",
      "content",
      "navigation",
      "phone",
      "accessibility",
      "consistency",
    ],
    flows: "./flows-site.mjs",
    capture: "capture-site",
    candidate: "site",
    suffix: "-site",
    port: 5181,
    fableLabel: "Claude Fable 5.2",
    notes:
      "Harness notes: from round 1 the sign-in screens come from a second server with sign-in switched on (round 0 could only show 'not set up'), so the panel shows the button, the cancelled state with Try again, and the page reached from the private area. The writing list panel shows the list in both themes in place of the filtered state, which no longer exists while every post shares its categories. The viewer panel gains the zoomed state and the About panel the opened 'How it's built' disclosure. Part of a round 1 change on those flows may come from the panel, not the site. From round 2 the panels follow the round's new states: home shows the reel after one press of its next arrow (in place of the page just after the intro, which is the same page); About shows the page index marking a section (in place of the desktop 'this website' screen); the article panel shows the French top, where the 'written in English' line now sits (in place of the French end); the viewer shows the zoomed drawing after a drag with its locator (in place of the viewer opened from the full wall); navigation shows the theme button's tip and the footer's replay hint (in place of the languages inside the phone menu and the plain desktop footer); sign-in shows the pointer over its button; and the not-found panel grows from five screens to eight with the mistyped address and the drawing under the pointer. Part of a round 2 change on those flows may come from the panel, not the site. From round 3: the viewer shows the pointer over the left arrow on the first piece with its tip (in place of the zoomed desktop drawing, since the dragged one still shows zoom), and its zoomed screens are taken before any drag with the hint showing; navigation shows keyboard focus on the two-part theme control (in place of the old theme button's tip, which no longer exists), and the phone footer is shot from its top edge; sign-in shows a failed sign-in on a phone (in place of the phone page reached from the private area); and not-found shows the drawing joined after a tap on a phone (in place of the phone mistyped address). Part of a round 3 change on those flows may come from the panel, not the site.",
    sidecarCaptions: true,
  },
  narrator: {
    key: "narrator",
    name: "Narrator",
    each: "app",
    kind: "read-aloud app",
    work: ".ui-climb-site",
    rubric: "rubric-narrator.md",
    dims: [
      "visual",
      "clarity",
      "engagement",
      "reading",
      "flow",
      "phone",
      "accessibility",
      "consistency",
    ],
    flows: "./flows-narrator.mjs",
    capture: "capture-narrator",
    candidate: "narrator",
    suffix: "-narrator",
    port: 5181,
    fableLabel: "Claude Fable 5.2",
    notes:
      "Harness notes: from round 1 the panels add states that did not exist in round 0: a first visit after a sample was played, the Undo notice after removing a document (in place of the card hover), a chapter list with a long title, and the notice when the voice filters hide every voice (in place of the damaged EPUB, which looks like the other failed files). The natural voice fallback is shot with the menu closed, showing its notice. Part of a round 1 change on those flows may come from the panel, not the app. From round 2 the panels follow the round's new states: the library shows a document's More menu on a phone (in place of the search with no match), and its remove and Undo screens are taken on the library of seven; adding shows the two-tab modal and the failed file on a phone (in place of the desktop parsing screen); the reader shows the first use of the view switch on a phone (in place of the desktop Document start), and its resume screens now show a real resume; chapters shows the pointer over the scrubber's ticks (in place of the desktop Document chapter), and the long title comes from a text file made for it; voices shows the reader's voice menu with a preview playing; and settings shows the reader panel's three tabs and the Serif face (in place of the desktop panel, the large text and the French panel). Part of a round 2 change on those flows may come from the panel, not the app. From round 3: the natural voice screens choose the smaller download first, so they all read the same size, and desktop settings screens scroll so no row sits half under the title bar; the failure panel shows the failed download on a phone (in place of a natural preview that failed, which can no longer happen: before the download a row has no preview); settings shows the panel with larger text, its value as a share of the default and Reset (in place of the phone Colour tab); and the view hint on a phone stays until the next press, so the captures close it before the next shot. Part of a round 3 change on those flows may come from the panel, not the app.",
    sidecarCaptions: true,
  },
};

/**
 * The project for this run: `--project x` (taken out of `args` when given), else the env
 * UI_CLIMB_PROJECT, else Woodshed. Adds the absolute work dir as `dir`.
 */
export function projectFrom(args = []) {
  let key = process.env.UI_CLIMB_PROJECT || "woodshed";
  const i = args.indexOf("--project");
  if (i >= 0) {
    key = args[i + 1];
    args.splice(i, 2);
  }
  const project = PROJECTS[key];
  if (!project)
    throw new Error(`unknown project "${key}"; use one of ${Object.keys(PROJECTS).join(", ")}`);
  return { ...project, dir: join(ROOT, project.work) };
}

/** The project's flows (see flows.mjs for the shape). */
export async function flowsOf(project) {
  return (await import(project.flows)).FLOWS;
}
