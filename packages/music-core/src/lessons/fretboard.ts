import { noteName } from "../theory/notes";
import { m } from "@repo/i18n/messages.js";
import { formatList } from "@repo/i18n/format";
import type { Lesson, LessonFigure, LessonStep } from "./types";

type Instrument = "guitar" | "ukulele";
type Mark = { string: number; fret: number; label: string };

const nameOf = (midi: number) => noteName(midi, "sharp", false);
/** A fret offset in words. */
const rel = (d: number) =>
  d === 0
    ? m.music_cards_fb_rel_same()
    : d > 0
      ? m.music_cards_fb_rel_higher({ count: d })
      : m.music_cards_fb_rel_lower({ count: -d });
const ROOT = 1;

/**
 * Lessons for the fretboard drills. Everything is worked out from the open strings
 * (string 1 = highest, as the data and Fretboard number them), so a custom tuning
 * still gets true examples.
 */
export function fretboardLessons(
  mode: "note-finder" | "interval-recall",
  instrument: Instrument,
  tuning: readonly number[],
): Lesson[] {
  const open = [...tuning];
  const name = (s: number) => nameOf(open[s - 1]);
  /** "E string", or "E string (string 6)" when another string has the same note name. */
  const sn = (s: number) =>
    open.filter((_, i) => name(i + 1) === name(s)).length > 1
      ? m.music_cards_fb_string_numbered({ name: name(s), n: s })
      : m.music_cards_fb_string({ name: name(s) });
  const fig = (marks: Mark[]): LessonFigure => ({
    kind: "fretboard",
    instrument,
    openStrings: open,
    marks, // callers keep every mark inside frets 0 to 5, the window the figure shows
  });

  // Strings that climb in pitch as the string number falls, ending at string 1.
  // A re-entrant string (ukulele high G) is not part of the run.
  const run = [1];
  for (let s = 2; s <= open.length && open[s - 1] < open[run[0] - 1]; s++) run.unshift(s);
  const reentrant = open.map((_, i) => i + 1).filter((s) => s > run[0]);
  const pairs = run
    .slice(0, -1)
    .map((lo, i) => ({ lo, hi: run[i + 1], gap: open[run[i + 1] - 1] - open[lo - 1] }));
  // ponytail: most neighbours are 5 apart; a tuning with none just takes its first gap.
  const common = pairs.some((p) => p.gap === 5) ? 5 : (pairs[0]?.gap ?? 5);
  const odd = pairs.filter((p) => p.gap !== common);
  const first = pairs.find((p) => p.gap === common) ?? pairs[0]; // the typical pair, for single examples

  /**
   * The root on string `lo` and the note n half steps up on string `hi`. The root starts at
   * `pref`, or the lowest fret that keeps both marks in the window; null when none does.
   */
  const upMarks = (
    lo: number,
    hi: number,
    n: number,
    label: string,
    pref = ROOT,
  ): Mark[] | null => {
    const off = n - (open[hi - 1] - open[lo - 1]);
    const root = [pref, 0, 1, 2, 3, 4, 5].find((r) => r <= 5 && r + off >= 0 && r + off <= 5);
    return root === undefined
      ? null
      : [
          { string: lo, fret: root, label: "R" },
          { string: hi, fret: root + off, label },
        ];
  };
  /** One step per pair of strings that fits the window, each with its own offset in words. */
  const stepsFor = (
    pairList: { lo: number; hi: number }[],
    n: number,
    label: string,
    text: (lo: string, hi: string, off: number) => string,
    pref = ROOT,
  ): LessonStep[] =>
    pairList.flatMap(({ lo, hi }) => {
      const m = upMarks(lo, hi, n, label, pref);
      const off = n - (open[hi - 1] - open[lo - 1]);
      return m ? [{ text: text(sn(lo), sn(hi), off), figure: fig(m) }] : [];
    });
  const fromTo = () => (lo: string, hi: string, off: number) =>
    m.music_cards_fb_from_to({ lo, hi, rel: rel(off) });
  const skip2 = run.slice(0, -2).map((lo, i) => ({ lo, hi: run[i + 2] }));
  const octaveSteps = (pref: number) => stepsFor(skip2, 12, "8", fromTo(), pref);
  type Pair = { lo: number; hi: number };
  /** Half steps between the open strings of a pair. */
  const span = (p: Pair) => open[p.hi - 1] - open[p.lo - 1];
  /** Frets higher from string lo to the note n half steps up on string hi. */
  const shift = (n: number) => (p: Pair) => n - span(p);
  /**
   * Every rule sentence names its exceptions through this, so it holds on any tuning: each pair
   * whose value is not the usual one, as "from the X to the Y it is <value>".
   */
  const differing = (ps: Pair[], value: (p: Pair) => number, usual: number, say = rel) =>
    ps
      .filter((p) => value(p) !== usual)
      .map((p) => m.music_cards_fb_differing({ lo: sn(p.lo), hi: sn(p.hi), value: say(value(p)) }))
      .join("; ");
  /** ", except ..." for an interval of n half steps on the next string up. */
  const except = (n: number) => {
    const d = differing(pairs, shift(n), n - common);
    return d ? m.music_cards_fb_except({ list: d }) : "";
  };
  /** The re-entrant string is left out of every shape rule. */
  const highNames = formatList(reentrant.map(name));
  const notHigh = reentrant.length ? m.music_cards_fb_not_high({ names: highNames }) : "";
  /** The regular case: both gaps are the usual one. */
  const regular = 12 - 2 * common;
  const ocFollows = skip2.some((p) => shift(12)(p) === regular);
  const ocDiff = differing(skip2, shift(12), regular);
  const ocRule = (): string =>
    (ocFollows
      ? m.music_cards_fb_oc_follows({ common, notHigh, rel: rel(regular) })
      : m.music_cards_fb_oc_none({ notHigh, common })) +
    (ocDiff
      ? ` ${(ocFollows ? m.music_cards_fb_oc_different : m.music_cards_fb_oc_pairs)({ list: ocDiff })}`
      : "");
  const highG = reentrant.length ? ` ${m.music_cards_fb_high_g({ names: highNames })}` : "";
  if (mode === "note-finder") {
    const low = run[0];
    const naturals = [0, 1, 2, 3, 4, 5]
      .map((f) => ({ string: low, fret: f, label: nameOf(open[low - 1] + f) }))
      .filter((m) => !m.label.includes("#"));
    const shown = pairs.filter((p) => p.gap <= 5); // a longer gap runs off the figure
    const matchSteps: LessonStep[] = shown.map((p) => ({
      text: m.music_cards_fb_match_step({ fret: p.gap, lo: sn(p.lo), hi: sn(p.hi) }),
      figure: fig([
        { string: p.lo, fret: p.gap, label: name(p.hi) },
        { string: p.hi, fret: 0, label: name(p.hi) },
      ]),
    }));
    const exception = odd.length
      ? ` ${m.music_cards_fb_irregular({
          count: odd.length,
          list: differing(pairs, span, common, (f) =>
            f > 5
              ? m.music_cards_fb_fret_n_past({ fret: f })
              : m.music_cards_fb_fret_n({ fret: f }),
          ),
        })}`
      : "";
    const ocPair = skip2.find((p) => shift(12)(p) === regular) ?? skip2[0];
    const oc =
      ocPair &&
      (upMarks(ocPair.lo, ocPair.hi, 12, name(ocPair.lo), 0)?.map((m) => ({
        ...m,
        label: name(ocPair.lo),
      })) ??
        null);
    return [
      {
        id: `fretboard.notes.${instrument}`,
        title: m.music_cards_fb_notes_title(),
        screens: [
          {
            title: m.music_cards_fb_open_title(),
            text:
              m.music_cards_fb_open_text({
                count: open.length,
                notes: [...open]
                  .reverse()
                  .map((x) => nameOf(x))
                  .join(" "),
              }) + highG,
            figure: fig(open.map((m, i) => ({ string: i + 1, fret: 0, label: nameOf(m) }))),
          },
          {
            title: m.music_cards_fb_naturals_title(),
            text: m.music_cards_fb_naturals_text({ name: name(low) }),
            figure: fig(naturals),
          },
          {
            title: m.music_cards_fb_markers_title(),
            text:
              instrument === "guitar"
                ? m.music_cards_fb_markers_guitar()
                : m.music_cards_fb_markers_ukulele(),
            ...(instrument === "guitar" ? { figure: fig([]) } : {}),
          },
          {
            title: m.music_cards_fb_next_title(),
            text: `${
              reentrant.length
                ? m.music_cards_fb_next_text_reentrant({
                    fret: common,
                    from: sn(run[0]),
                    names: highNames,
                  })
                : m.music_cards_fb_next_text({ fret: common })
            }${exception} ${m.music_cards_fb_tap_next_pair()}`,
            figure: fig([]),
            steps: matchSteps,
          },
          ...(oc
            ? [
                {
                  title: m.music_cards_fb_octave_shapes_title(),
                  text: `${m.music_cards_fb_octave_shapes_text()} ${ocRule()}`,
                  figure: fig(oc),
                },
              ]
            : []),
        ],
      },
    ];
  }

  return [
    {
      id: `fretboard.intervals.${instrument}`,
      title: m.music_cards_fb_intervals_title(),
      screens: [
        {
          title: m.music_cards_fb_half_title(),
          text: m.music_cards_fb_half_text(),
        },
        {
          title: m.music_cards_fb_fourth_title(),
          text:
            m.music_cards_fb_fourth_text({
              common,
              sep: notHigh || ",",
              rel: rel(5 - common),
              except: except(5),
            }) + highG,
          figure: fig((first && upMarks(first.lo, first.hi, 5, "4")) || []),
        },
        {
          title: m.music_cards_fb_fifth_title(),
          text: m.music_cards_fb_fifth_text({
            sep: notHigh || ",",
            rel: rel(7 - common),
            except: except(7),
          }),
          figure: fig([]),
          steps: stepsFor(pairs, 7, "5", fromTo()),
        },
        {
          title: m.music_cards_fb_thirds_title(),
          text: m.music_cards_fb_thirds_text({
            sep: notHigh || ",",
            rel: rel(4 - common),
            except: except(4),
          }),
          figure: fig([]),
          steps: first
            ? [
                {
                  text: m.music_cards_fb_major_third_step({ rel: rel(4 - first.gap) }),
                  figure: fig(upMarks(first.lo, first.hi, 4, "3", 2) ?? []),
                },
                {
                  text: m.music_cards_fb_minor_third_step({ rel: rel(3 - first.gap) }),
                  figure: fig(upMarks(first.lo, first.hi, 3, "m3", 2) ?? []),
                },
              ]
            : [],
        },
        ...(octaveSteps(ROOT).length
          ? [
              {
                title: m.music_cards_fb_octave_title(),
                text: `${m.music_cards_fb_octave_text()} ${ocRule()}${ocDiff ? "" : ` ${m.music_cards_fb_tap_next_pair()}`}`,
                figure: fig([]),
                steps: octaveSteps(ROOT),
              },
            ]
          : []),
        ...(odd.length
          ? [
              {
                title: m.music_cards_fb_irregular_title(),
                text: m.music_cards_fb_irregular_text({
                  count: odd.length,
                  list: formatList(
                    odd.map((p) =>
                      m.music_cards_fb_gap_item({ count: p.gap, lo: sn(p.lo), hi: sn(p.hi) }),
                    ),
                  ),
                  common,
                }),
                figure: fig([]),
                steps: stepsFor(odd, 7, "5", fromTo()),
              },
            ]
          : []),
      ],
    },
  ];
}
