// MusicXML (score-partwise) and compressed .mxl -> canonical score.
// Beats are quarter notes, like MIDI; the source XML is kept for engraving.
import JSZip from "jszip";
import type { Score, ScoreNote, ScoreVoice } from "../types";

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : (ENTITIES[e] ?? m),
  );

/** Minimal XML reader: elements, attributes, text, CDATA; skips prolog, comments, DOCTYPE. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  /** Index just past `token`, searching from `from`; unterminated markup is an error. */
  const past = (token: string, from: number) => {
    const at = xml.indexOf(token, from);
    if (at < 0) throw new Error(`Malformed XML: missing "${token}" after character ${from}`);
    return at + token.length;
  };
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) stack.at(-1)!.text += decode(xml.slice(i, lt));
    if (xml.startsWith("<!--", lt)) i = past("-->", lt);
    else if (xml.startsWith("<![CDATA[", lt)) {
      i = past("]]>", lt);
      stack.at(-1)!.text += xml.slice(lt + 9, i - 3);
    } else if (xml.startsWith("<?", lt)) i = past("?>", lt);
    else if (xml.startsWith("<!", lt)) {
      const bracket = xml.indexOf("[", lt);
      i = bracket >= 0 && bracket < past(">", lt) ? past("]>", bracket) : past(">", lt);
    } else if (xml[lt + 1] === "/") {
      stack.pop();
      i = past(">", lt);
    } else {
      const m = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(
        xml.slice(lt, lt + 4096),
      );
      if (!m) throw new Error(`Malformed XML near character ${lt}`);
      const node: XmlNode = { name: m[1], attrs: {}, children: [], text: "" };
      for (const a of m[2].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
        node.attrs[a[1]] = decode(a[2] ?? a[3]);
      stack.at(-1)!.children.push(node);
      if (!m[3]) stack.push(node);
      i = lt + m[0].length;
    }
  }
  const el = root.children[0];
  if (!el) throw new Error("Empty XML document");
  return el;
}

const kid = (n: XmlNode | undefined, name: string) => n?.children.find((c) => c.name === name);
const kids = (n: XmlNode | undefined, name: string) =>
  n?.children.filter((c) => c.name === name) ?? [];
const txt = (n: XmlNode | undefined, name: string) => kid(n, name)?.text.trim() ?? "";
const num = (n: XmlNode | undefined, name: string) => Number(txt(n, name)) || 0;

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const UNIT_QUARTERS: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  "16th": 0.25,
  "32nd": 0.125,
};
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Quarter-note BPM from <sound tempo> or <metronome>, if this node carries one. */
function tempoOf(n: XmlNode): number | undefined {
  const sound = n.name === "sound" ? n : kid(n, "sound");
  if (sound?.attrs.tempo) return Number(sound.attrs.tempo);
  const metro = kids(n, "direction-type")
    .map((d) => kid(d, "metronome"))
    .find(Boolean);
  const unit = UNIT_QUARTERS[txt(metro, "beat-unit")];
  const perMinute = num(metro, "per-minute");
  if (unit && perMinute) return perMinute * unit * (kid(metro, "beat-unit-dot") ? 1.5 : 1);
}

export function parseMusicXml(xml: string): Score {
  const doc = parseXml(xml);
  if (doc.name === "score-timewise")
    throw new Error(
      "Timewise MusicXML is not supported. Export as score-partwise (the usual default).",
    );
  if (doc.name !== "score-partwise") throw new Error("This file is not a MusicXML score.");

  const partNames = new Map(
    kids(kid(doc, "part-list"), "score-part").map((p) => [
      p.attrs.id,
      txt(p, "part-name") || p.attrs.id,
    ]),
  );
  let bpm: number | undefined;
  let meter: Score["meter"] | undefined;
  let keyFifths: number | undefined;
  let keyMode: Score["keyMode"];
  const voices: ScoreVoice[] = [];
  let lengthBeats = 0;

  for (const part of kids(doc, "part")) {
    const partId = part.attrs.id;
    const partName = partNames.get(partId) ?? partId;
    let divisions = 1;
    let beats = 4;
    let beatUnit = 4;
    let staves = 1;
    const clefs = new Map<number, "treble" | "bass">();
    const byVoice = new Map<string, { notes: ScoreNote[]; staves: number[] }>();
    let measureStart = 0;

    kids(part, "measure").forEach((measure, index) => {
      let pos = 0;
      let maxPos = 0;
      let lastStart = 0;
      for (const el of measure.children) {
        if (el.name === "attributes") {
          if (kid(el, "divisions")) divisions = num(el, "divisions") || 1;
          if (kid(el, "staves")) staves = num(el, "staves") || 1;
          const key = kid(el, "key");
          if (key && keyFifths === undefined) {
            keyFifths = num(key, "fifths");
            keyMode = txt(key, "mode") === "minor" ? "minor" : "major";
          }
          const time = kid(el, "time");
          if (time && kid(time, "beats")) {
            beats = num(time, "beats") || 4;
            beatUnit = num(time, "beat-type") || 4;
            meter ??= { beats, beatUnit };
          }
          for (const clef of kids(el, "clef")) {
            const sign = txt(clef, "sign");
            if (sign === "G" || sign === "F")
              clefs.set(Number(clef.attrs.number) || 1, sign === "G" ? "treble" : "bass");
          }
        } else if (el.name === "direction" || el.name === "sound") {
          bpm ??= tempoOf(el);
        } else if (el.name === "backup") {
          pos -= num(el, "duration");
        } else if (el.name === "forward") {
          pos += num(el, "duration");
        } else if (el.name === "note") {
          if (kid(el, "grace") || kid(el, "cue")) continue;
          const dur = num(el, "duration");
          const chord = !!kid(el, "chord");
          const start = chord ? lastStart : pos;
          const pitch = kid(el, "pitch");
          if (pitch && !kid(el, "rest")) {
            const voice = txt(el, "voice") || "1";
            const entry = byVoice.get(voice) ?? { notes: [], staves: [] };
            byVoice.set(voice, entry);
            entry.staves.push(num(el, "staff") || 1);
            const note: ScoreNote = {
              midi:
                (num(pitch, "octave") + 1) * 12 +
                STEP_PC[txt(pitch, "step")] +
                Math.round(Number(txt(pitch, "alter")) || 0),
              startBeat: round4(measureStart + start / divisions),
              durationBeats: round4(dur / divisions),
            };
            const ties = [...kids(el, "tie"), ...kids(kid(el, "notations"), "tied")];
            if (ties.some((t) => t.attrs.type === "stop")) note.tieFrom = true;
            entry.notes.push(note);
          }
          if (!chord) {
            lastStart = pos;
            pos += dur;
          }
          maxPos = Math.max(maxPos, start + dur);
        }
        maxPos = Math.max(maxPos, pos);
      }
      const nominal = (beats * 4) / beatUnit;
      const content = maxPos / divisions;
      // A pickup: marked implicit, or an opening bar shorter than its time signature.
      const pickup =
        measure.attrs.implicit === "yes" || (index === 0 && content > 0 && content < nominal);
      measureStart = round4(measureStart + (pickup ? content : Math.max(nominal, content)));
    });

    lengthBeats = Math.max(lengthBeats, measureStart);
    const many = byVoice.size > 1;
    for (const [voice, { notes, staves: used }] of byVoice) {
      const staff = mode(used);
      voices.push({
        id: `${partId}-v${voice}`,
        name: many ? `${partName} voice ${voice}` : partName,
        partId,
        clef: clefs.get(staff) ?? (staff === 2 ? "bass" : "treble"),
        ...(staves === 2 && { hand: staff === 1 ? ("right" as const) : ("left" as const) }),
        notes: notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi),
      });
    }
  }

  const creator = kids(kid(doc, "identification"), "creator").find(
    (c) => c.attrs.type === "composer",
  );
  return {
    id: crypto.randomUUID(),
    title: txt(kid(doc, "work"), "work-title") || txt(doc, "movement-title") || "Untitled",
    ...(creator && { composer: creator.text.trim() }),
    bpm: Math.round(bpm ?? 120),
    meter: meter ?? { beats: 4, beatUnit: 4 },
    ...(keyFifths !== undefined && { keyFifths, keyMode }),
    voices,
    lengthBeats,
    source: { kind: "musicxml", xml },
  };
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
}

/** Compressed MusicXML: the root file named by META-INF/container.xml. */
export async function parseMxl(bytes: Uint8Array): Promise<Score> {
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const path =
    (container && kid(kid(parseXml(container), "rootfiles"), "rootfile")?.attrs["full-path"]) ||
    Object.keys(zip.files).find((f) => !f.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(f));
  const xml = path && (await zip.file(path)?.async("string"));
  if (!xml) throw new Error("This .mxl file has no MusicXML score inside.");
  return parseMusicXml(xml);
}
