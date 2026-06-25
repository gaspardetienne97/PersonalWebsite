import type {
  ChordEvent,
  LyricEvent,
  Score,
  ScoreNote,
  ScoreRest,
  ScoreVoice,
  TimeSignatureMarker,
  WrittenAccidental,
  WrittenPitch,
} from "@repo/music-core/domain";
import { noteToMidi } from "@repo/music-core/engines/theory";

export interface ParseMusicXmlScoreOptions {
  id: string;
  fallbackName?: string;
}

export function filterMusicXmlParts(xml: string, partIds: string[]): string {
  if (partIds.length === 0) throw new Error("Select at least one MusicXML part");
  const document = parseMusicXmlDocument(xml);
  const selected = new Set(partIds);
  const known = new Set(
    descendants(document.documentElement, "score-part").map(
      (part) => part.getAttribute("id") ?? "",
    ),
  );
  const unknown = partIds.find((id) => !known.has(id));
  if (unknown) throw new Error(`Unknown MusicXML part: ${unknown}`);

  for (const declaration of descendants(document.documentElement, "score-part")) {
    if (!selected.has(declaration.getAttribute("id") ?? "")) declaration.remove();
  }
  for (const part of children(document.documentElement, "part")) {
    if (!selected.has(part.getAttribute("id") ?? "")) part.remove();
  }
  return new XMLSerializer().serializeToString(document);
}

export function parseMusicXmlScore(xml: string, options: ParseMusicXmlScoreOptions): Score {
  const document = parseMusicXmlDocument(xml);
  const root = document.documentElement;
  if (root.localName !== "score-partwise") {
    throw new Error("Only score-partwise MusicXML is supported.");
  }

  const partNames = new Map(
    descendants(root, "score-part").map((part) => [
      part.getAttribute("id") ?? "",
      text(child(part, "part-name")) || "Part",
    ]),
  );
  const voices = new Map<string, ScoreVoice>();
  const notes: ScoreNote[] = [];
  const rests: ScoreRest[] = [];
  const chords: ChordEvent[] = [];
  const lyrics: LyricEvent[] = [];
  const tempoMap: Score["tempoMap"] = [];
  const timeSignatures: TimeSignatureMarker[] = [];
  let keySignature: string | undefined;
  let endBeat = 0;

  for (const part of children(root, "part")) {
    const partId = part.getAttribute("id") || `P${voices.size + 1}`;
    const partName = partNames.get(partId) ?? partId;
    const role = roleForPart(partName);
    let divisions = 1;
    let measureStart = 0;
    let currentTime = { numerator: 4, denominator: 4 };

    for (const measure of children(part, "measure")) {
      let cursor = measureStart;
      let furthestBeat = measureStart;
      const lastNoteStart = new Map<string, number>();

      for (const item of Array.from(measure.children)) {
        if (item.localName === "attributes") {
          divisions = positiveNumber(text(child(item, "divisions"))) ?? divisions;
          const parsedTime = parseTime(item);
          if (parsedTime) {
            currentTime = parsedTime;
            addUniqueTimeSignature(timeSignatures, {
              atBeat: measureStart,
              numerator: parsedTime.numerator,
              denominator: parsedTime.denominator,
            });
          }
          keySignature ??= parseKey(item);
          continue;
        }

        if (item.localName === "direction") {
          const tempo = positiveNumber(descendants(item, "sound")[0]?.getAttribute("tempo") ?? "");
          if (tempo) addUniqueTempo(tempoMap, { atBeat: cursor, bpm: tempo });
          continue;
        }

        if (item.localName === "harmony") {
          const symbol = harmonySymbol(item);
          if (symbol) chords.push({ symbol, startBeat: round(cursor) });
          continue;
        }

        if (item.localName === "backup" || item.localName === "forward") {
          const duration = durationBeats(item, divisions);
          cursor += item.localName === "backup" ? -duration : duration;
          furthestBeat = Math.max(furthestBeat, cursor);
          continue;
        }

        if (item.localName !== "note") continue;

        const voiceNumber = text(child(item, "voice")) || "1";
        const voiceId = `${partId}:voice:${voiceNumber}`;
        if (!voices.has(voiceId)) {
          voices.set(voiceId, {
            id: voiceId,
            name: `${partName} · Voice ${voiceNumber}`,
            role,
          });
        }

        const duration = durationBeats(item, divisions);
        const isChord = child(item, "chord") !== undefined;
        const startBeat = isChord ? (lastNoteStart.get(voiceNumber) ?? cursor) : cursor;

        if (child(item, "rest")) {
          rests.push({
            startBeat: round(startBeat),
            durationBeats: round(duration),
            voiceId,
          });
        } else {
          const writtenPitch = parseWrittenPitch(item);
          if (writtenPitch) {
            notes.push({
              midiNote: writtenPitchToMidi(writtenPitch),
              writtenPitch,
              startBeat: round(startBeat),
              durationBeats: round(duration),
              velocity: noteVelocity(item),
              voiceId,
            });
            lastNoteStart.set(voiceNumber, startBeat);
            const lyric = text(
              descendants(item, "lyric")[0] && child(descendants(item, "lyric")[0]!, "text"),
            );
            if (lyric) lyrics.push({ text: lyric, startBeat: round(startBeat) });
          }
        }

        if (!isChord) cursor += duration;
        furthestBeat = Math.max(furthestBeat, startBeat + duration, cursor);
      }

      const measureDuration = currentTime.numerator * (4 / currentTime.denominator);
      measureStart = Math.max(furthestBeat, measureStart + measureDuration);
    }

    endBeat = Math.max(endBeat, measureStart);
  }

  if (tempoMap.length === 0) tempoMap.push({ atBeat: 0, bpm: 120 });
  if (timeSignatures.length === 0) {
    timeSignatures.push({ atBeat: 0, numerator: 4, denominator: 4 });
  }

  return {
    id: options.id,
    title:
      text(descendants(root, "work-title")[0]) ||
      text(descendants(root, "movement-title")[0]) ||
      options.fallbackName ||
      "Untitled",
    origin: "musicxml",
    keySignature,
    tempoMap: tempoMap.sort((left, right) => left.atBeat - right.atBeat),
    timeSignatures: timeSignatures.sort((left, right) => left.atBeat - right.atBeat),
    voices: [...voices.values()],
    notes,
    rests,
    chords,
    sections: [
      {
        id: "full-song",
        name: "Full song",
        startBeat: 0,
        endBeat: round(endBeat),
      },
    ],
    markers: [],
    lyrics,
  };
}

function parseMusicXmlDocument(xml: string): XMLDocument {
  if (typeof DOMParser === "undefined") {
    throw new Error("MusicXML parsing requires a DOMParser.");
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("MusicXML could not be parsed.");
  }
  return document;
}

function parseTime(attributes: Element):
  | {
      numerator: number;
      denominator: number;
    }
  | undefined {
  const time = child(attributes, "time");
  if (!time) return undefined;
  const numerator = positiveNumber(text(child(time, "beats")));
  const denominator = positiveNumber(text(child(time, "beat-type")));
  return numerator && denominator ? { numerator, denominator } : undefined;
}

function parseKey(attributes: Element): string | undefined {
  const key = child(attributes, "key");
  if (!key) return undefined;
  const fifths = Number(text(child(key, "fifths")));
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) return undefined;
  const mode = text(child(key, "mode")).toLowerCase() === "minor" ? "minor" : "major";
  const names =
    mode === "minor"
      ? ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"]
      : ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  return `${names[fifths + 7]} ${mode}`;
}

function parseWrittenPitch(note: Element): WrittenPitch | undefined {
  const pitch = child(note, "pitch");
  if (!pitch) return undefined;
  const step = text(child(pitch, "step")).toUpperCase();
  const octave = Number(text(child(pitch, "octave")));
  if (!/^[A-G]$/.test(step) || !Number.isInteger(octave)) return undefined;
  const alter = Number(text(child(pitch, "alter")) || "0");
  const accidental = accidentalFor(alter);
  return {
    step: step as WrittenPitch["step"],
    ...(accidental ? { accidental } : {}),
    octave,
  };
}

function accidentalFor(alter: number): WrittenAccidental | undefined {
  return (
    {
      [-2]: "bb",
      [-1]: "b",
      [0]: undefined,
      [1]: "#",
      [2]: "##",
    } as Record<number, WrittenAccidental | undefined>
  )[alter];
}

function writtenPitchToMidi(pitch: WrittenPitch): number {
  const accidental = pitch.accidental === "natural" ? "" : (pitch.accidental ?? "");
  return noteToMidi(`${pitch.step}${accidental}${pitch.octave}`);
}

function harmonySymbol(harmony: Element): string | undefined {
  const root = child(harmony, "root");
  const step = text(root && child(root, "root-step"));
  if (!step) return undefined;
  const alter = Number(text(root && child(root, "root-alter")) || "0");
  const accidental = accidentalFor(alter) ?? "";
  const kind = child(harmony, "kind");
  const suffix =
    kind?.getAttribute("text") ||
    {
      major: "",
      minor: "m",
      "major-seventh": "maj7",
      "minor-seventh": "m7",
      dominant: "7",
      diminished: "dim",
      augmented: "aug",
    }[text(kind)] ||
    text(kind);
  return `${step}${accidental}${suffix}`;
}

function noteVelocity(note: Element): number {
  const raw = positiveNumber(text(child(note, "velocity")));
  return raw ? Math.min(1, raw / 100) : 0.8;
}

function durationBeats(element: Element, divisions: number): number {
  const duration = Number(text(child(element, "duration")));
  return Number.isFinite(duration) && duration >= 0 ? duration / Math.max(1, divisions) : 0;
}

function roleForPart(name: string): ScoreVoice["role"] {
  const normalized = name.toLowerCase();
  if (normalized.includes("bass")) return "bass";
  if (normalized.includes("drum") || normalized.includes("perc")) return "drums";
  if (normalized.includes("melody") || normalized.includes("lead")) return "melody";
  return "other";
}

function addUniqueTempo(map: Score["tempoMap"], marker: Score["tempoMap"][number]): void {
  if (!map.some(({ atBeat, bpm }) => atBeat === marker.atBeat && bpm === marker.bpm)) {
    map.push(marker);
  }
}

function addUniqueTimeSignature(map: TimeSignatureMarker[], marker: TimeSignatureMarker): void {
  if (
    !map.some(
      ({ atBeat, numerator, denominator }) =>
        atBeat === marker.atBeat &&
        numerator === marker.numerator &&
        denominator === marker.denominator,
    )
  ) {
    map.push(marker);
  }
}

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((item) => item.localName === name);
}

function child(element: Element | undefined, name: string): Element | undefined {
  return element ? Array.from(element.children).find((item) => item.localName === name) : undefined;
}

function descendants(element: Element, name: string): Element[] {
  return Array.from(element.getElementsByTagNameNS("*", name));
}

function text(element: Element | undefined): string {
  return element?.textContent?.trim() ?? "";
}

function positiveNumber(value: string): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
