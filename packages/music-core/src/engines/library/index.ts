import type { PracticeStore } from "@repo/music-core/engines/store";
import {
  chordNotes,
  intervalBetween,
  noteToMidi,
  scaleNotes,
} from "@repo/music-core/engines/theory";

export type TheoryItemKind = "chord" | "scale";
export type StringInstrument = "guitar" | "ukulele";

/** An instrument-agnostic named pitch set (a way to voice a chord). */
export interface ChordVoicing {
  id: string;
  label: string;
  /** Ascending MIDI notes. */
  midi: number[];
}

/**
 * Generate the standard ways to voice a chord — root position, every inversion,
 * and (for 4-note chords) drop-2 — as instrument-agnostic pitch sets. An
 * {@link InstrumentView} then renders the chosen set on whatever instrument is
 * selected (keyboard, fretboard, Aerophone fingering, …).
 */
export function chordVoicings(pianoMidi: number[]): ChordVoicing[] {
  const base = [...pianoMidi].sort((a, b) => a - b);
  if (base.length === 0) return [];

  const inversionLabels = ["Root position", "1st inversion", "2nd inversion", "3rd inversion"];
  const voicings: ChordVoicing[] = base.map((_, k) => ({
    id: k === 0 ? "root" : `inv-${k}`,
    label: inversionLabels[k] ?? `${k}th inversion`,
    midi: invert(base, k),
  }));

  if (base.length === 4) {
    // Drop-2: take the 2nd-from-top voice down an octave.
    const dropped = [...base];
    dropped[base.length - 2] = dropped[base.length - 2]! - 12;
    voicings.push({ id: "drop-2", label: "Drop 2", midi: dropped.sort((a, b) => a - b) });
  }

  return voicings;
}

function invert(ascending: number[], k: number): number[] {
  const raised = ascending.map((midi, index) => (index < k ? midi + 12 : midi));
  return raised.sort((a, b) => a - b);
}
export type StringFingering = readonly [string: number, fret: number | "x", label?: string];

export interface StringBarre {
  fromString: number;
  toString: number;
  fret: number;
  text?: string;
}

export interface StringVoicing {
  id: string;
  label: string;
  instrument: StringInstrument;
  strings: number;
  tuning: string[];
  fingers: StringFingering[];
  barres?: StringBarre[];
  position?: number;
}

interface TheoryCatalogSource {
  id: string;
  kind: TheoryItemKind;
  name: string;
  symbol: string;
  query: string;
  aliases: string[];
  voicings?: Partial<Record<StringInstrument, StringVoicing[]>>;
}

export interface TheoryLibraryItem extends Omit<
  TheoryCatalogSource,
  "query" | "aliases" | "voicings"
> {
  aliases: string[];
  notes: string[];
  intervals: string[];
  pianoMidi: number[];
  voicings: Record<StringInstrument, StringVoicing[]>;
}

const GUITAR_TUNING = ["E", "A", "D", "G", "B", "E"];
const UKULELE_TUNING = ["G", "C", "E", "A"];

const catalog: TheoryCatalogSource[] = [
  {
    id: "c-maj7",
    kind: "chord",
    name: "C major seventh",
    symbol: "Cmaj7",
    query: "Cmaj7",
    aliases: ["c major 7", "c major seven", "c maj7"],
    voicings: {
      guitar: [
        {
          id: "c-maj7-guitar-open",
          label: "Open position",
          instrument: "guitar",
          strings: 6,
          tuning: GUITAR_TUNING,
          fingers: [
            [6, "x"],
            [5, 3, "3"],
            [4, 2, "2"],
            [3, 0],
            [2, 0],
            [1, 0],
          ],
        },
      ],
      ukulele: [
        {
          id: "c-maj7-ukulele-open",
          label: "Open position",
          instrument: "ukulele",
          strings: 4,
          tuning: UKULELE_TUNING,
          fingers: [
            [4, 0],
            [3, 0],
            [2, 0],
            [1, 2, "1"],
          ],
        },
      ],
    },
  },
  {
    id: "c-major",
    kind: "chord",
    name: "C major",
    symbol: "C",
    query: "C",
    aliases: ["c major"],
  },
  {
    id: "a-minor",
    kind: "chord",
    name: "A minor",
    symbol: "Am",
    query: "Am",
    aliases: ["a minor"],
  },
  {
    id: "d-minor-7",
    kind: "chord",
    name: "D minor seventh",
    symbol: "Dm7",
    query: "Dm7",
    aliases: ["d minor 7", "d minor seven"],
  },
  {
    id: "g-dominant-7",
    kind: "chord",
    name: "G dominant seventh",
    symbol: "G7",
    query: "G7",
    aliases: ["g dominant 7", "g dominant seven"],
  },
  {
    id: "c-major-scale",
    kind: "scale",
    name: "C major",
    symbol: "C major",
    query: "C major",
    aliases: ["ionian", "c ionian"],
  },
  {
    id: "a-minor-scale",
    kind: "scale",
    name: "A natural minor",
    symbol: "A minor",
    query: "A minor",
    aliases: ["aeolian", "a aeolian", "natural minor"],
  },
  {
    id: "d-dorian",
    kind: "scale",
    name: "D Dorian",
    symbol: "D dorian",
    query: "D dorian",
    aliases: ["dorian mode"],
  },
  {
    id: "g-mixolydian",
    kind: "scale",
    name: "G Mixolydian",
    symbol: "G mixolydian",
    query: "G mixolydian",
    aliases: ["mixolydian mode"],
  },

  // --- Jazz chord vocabulary (Julian Bradley "Ultimate Guide to Jazz Piano") ---
  {
    id: "c-dominant-7",
    kind: "chord",
    name: "C dominant seventh",
    symbol: "C7",
    query: "C7",
    aliases: ["c7", "c dominant", "v7 chord"],
  },
  {
    id: "c-half-diminished",
    kind: "chord",
    name: "C half-diminished",
    symbol: "Cm7b5",
    query: "Cm7b5",
    aliases: ["c half diminished", "c min7b5", "minor ii-V ii chord"],
  },
  {
    id: "c-diminished-7",
    kind: "chord",
    name: "C diminished seventh",
    symbol: "Cdim7",
    query: "Cdim7",
    aliases: ["c dim7", "c diminished", "passing chord"],
  },
  {
    id: "c-minor-major-7",
    kind: "chord",
    name: "C minor-major seventh",
    symbol: "CmMaj7",
    query: "CmMaj7",
    aliases: ["c min maj7", "james bond chord", "minor i chord"],
  },
  {
    id: "c-major-6",
    kind: "chord",
    name: "C major sixth",
    symbol: "C6",
    query: "C6",
    aliases: ["c6", "c major 6"],
  },
  {
    id: "c-minor-6",
    kind: "chord",
    name: "C minor sixth",
    symbol: "Cm6",
    query: "Cm6",
    aliases: ["c min6", "c minor 6", "tonic minor", "minor i chord"],
  },
  {
    id: "c-six-nine",
    kind: "chord",
    name: "C six-nine",
    symbol: "C6/9",
    query: "C6/9",
    aliases: ["c 6/9", "c six nine"],
  },
  {
    id: "c-major-9",
    kind: "chord",
    name: "C major ninth",
    symbol: "Cmaj9",
    query: "Cmaj9",
    aliases: ["c maj9"],
  },
  {
    id: "c-minor-9",
    kind: "chord",
    name: "C minor ninth",
    symbol: "Cm9",
    query: "Cm9",
    aliases: ["c min9"],
  },
  {
    id: "c-dominant-9",
    kind: "chord",
    name: "C dominant ninth",
    symbol: "C9",
    query: "C9",
    aliases: ["c9"],
  },
  {
    id: "c-7b9",
    kind: "chord",
    name: "C7 flat-nine",
    symbol: "C7b9",
    query: "C7b9",
    aliases: ["c7 b9", "altered dominant"],
  },
  {
    id: "c-7sharp9",
    kind: "chord",
    name: "C7 sharp-nine",
    symbol: "C7#9",
    query: "C7#9",
    aliases: ["c7 #9", "hendrix chord"],
  },
  {
    id: "c-7sharp11",
    kind: "chord",
    name: "C7 sharp-eleven",
    symbol: "C7#11",
    query: "C7#11",
    aliases: ["c7 #11", "lydian dominant chord"],
  },
  {
    id: "c-13",
    kind: "chord",
    name: "C thirteenth",
    symbol: "C13",
    query: "C13",
    aliases: ["c13"],
  },
  {
    id: "c-7alt",
    kind: "chord",
    name: "C7 altered",
    symbol: "C7alt",
    query: "C7alt",
    aliases: ["c7 altered", "c7 b13"],
  },
  {
    id: "c-7sus4",
    kind: "chord",
    name: "C7 suspended fourth",
    symbol: "C7sus4",
    query: "C7sus4",
    aliases: ["c7 sus4", "c sus"],
  },
  {
    id: "c-minor-11",
    kind: "chord",
    name: "C minor eleventh",
    symbol: "Cm11",
    query: "Cm11",
    aliases: ["c min11"],
  },

  // --- Jazz scales (chord/scale relationships, JT4) ---
  {
    id: "c-lydian",
    kind: "scale",
    name: "C Lydian",
    symbol: "C lydian",
    query: "C lydian",
    aliases: ["lydian", "maj7 scale", "#11 scale"],
  },
  {
    id: "c-mixolydian",
    kind: "scale",
    name: "C Mixolydian",
    symbol: "C mixolydian",
    query: "C mixolydian",
    aliases: ["mixolydian", "dominant scale"],
  },
  {
    id: "c-lydian-dominant",
    kind: "scale",
    name: "C Lydian dominant",
    symbol: "C lydian dominant",
    query: "C lydian dominant",
    aliases: ["lydian dominant", "mixolydian #11", "acoustic scale"],
  },
  {
    id: "c-altered",
    kind: "scale",
    name: "C Altered",
    symbol: "C altered",
    query: "C altered",
    aliases: ["altered scale", "super locrian", "diminished whole tone", "db melodic minor"],
  },
  {
    id: "c-whole-tone",
    kind: "scale",
    name: "C Whole-tone",
    symbol: "C whole tone",
    query: "C whole tone",
    aliases: ["whole tone", "7#5 scale"],
  },
  {
    id: "c-locrian",
    kind: "scale",
    name: "C Locrian",
    symbol: "C locrian",
    query: "C locrian",
    aliases: ["locrian", "half-diminished scale", "m7b5 scale"],
  },
  {
    id: "c-melodic-minor",
    kind: "scale",
    name: "C Melodic minor",
    symbol: "C melodic minor",
    query: "C melodic minor",
    aliases: ["melodic minor", "jazz minor", "minmaj7 scale"],
  },
  {
    id: "c-diminished-wh",
    kind: "scale",
    name: "C Diminished (whole-half)",
    symbol: "C whole-half diminished",
    query: "C whole-half diminished",
    aliases: ["diminished scale", "dim7 scale", "whole half diminished"],
  },
  {
    id: "c-diminished-hw",
    kind: "scale",
    name: "C Diminished (half-whole)",
    symbol: "C half-whole diminished",
    query: "C half-whole diminished",
    aliases: ["dominant diminished", "v7 diminished scale", "half whole diminished"],
  },
  {
    id: "c-major-pentatonic",
    kind: "scale",
    name: "C major pentatonic",
    symbol: "C major pentatonic",
    query: "C major pentatonic",
    aliases: ["major pentatonic"],
  },
  {
    id: "c-minor-pentatonic",
    kind: "scale",
    name: "C minor pentatonic",
    symbol: "C minor pentatonic",
    query: "C minor pentatonic",
    aliases: ["minor pentatonic"],
  },
  {
    id: "c-major-blues",
    kind: "scale",
    name: "C major blues",
    symbol: "C major blues",
    query: "C major blues",
    aliases: ["major blues"],
  },
  {
    id: "c-minor-blues",
    kind: "scale",
    name: "C minor blues",
    symbol: "C minor blues",
    query: "C minor blues",
    aliases: ["minor blues", "blues scale"],
  },
  {
    id: "c-bebop-dominant",
    kind: "scale",
    name: "C dominant bebop",
    symbol: "C bebop",
    query: "C bebop",
    aliases: ["dominant bebop", "bebop scale"],
  },
  {
    id: "c-bebop-major",
    kind: "scale",
    name: "C major bebop",
    symbol: "C bebop major",
    query: "C bebop major",
    aliases: ["major bebop"],
  },
];

export class TheoryLibrary {
  readonly items = catalog.map(projectItem);
  readonly #savedIds = new Set<string>();

  constructor(private readonly store?: PracticeStore) {}

  get savedIds(): ReadonlySet<string> {
    return this.#savedIds;
  }

  get(id: string): TheoryLibraryItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  search(query = "", kind?: TheoryItemKind): TheoryLibraryItem[] {
    const normalized = query.trim().toLowerCase();
    return this.items.filter((item) => {
      if (kind && item.kind !== kind) return false;
      if (!normalized) return true;
      return [item.name, item.symbol, ...item.aliases].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });
  }

  async load(): Promise<void> {
    if (!this.store) return;
    const rows = await this.store.chordLibrary.all();
    this.#savedIds.clear();
    rows.forEach((row) => this.#savedIds.add(row.id));
  }

  isSaved(id: string): boolean {
    return this.#savedIds.has(id);
  }

  async save(id: string): Promise<void> {
    const item = this.requireChord(id);
    await this.store?.chordLibrary.put({
      id: item.id,
      symbol: item.symbol,
      notes: item.notes,
      tags: ["theory-library"],
      createdAt: Date.now(),
    });
    this.#savedIds.add(id);
  }

  async remove(id: string): Promise<void> {
    await this.store?.chordLibrary.delete(id);
    this.#savedIds.delete(id);
  }

  private requireChord(id: string): TheoryLibraryItem {
    const item = this.get(id);
    if (!item) throw new Error(`Unknown theory library item: ${id}`);
    if (item.kind !== "chord") throw new Error(`Only chords can be saved: ${id}`);
    return item;
  }
}

function projectItem(source: TheoryCatalogSource): TheoryLibraryItem {
  const notes = source.kind === "chord" ? chordNotes(source.query) : scaleNotes(source.query);
  const pianoMidi = ascendingMidi(notes);
  const rootMidi = pianoMidi[0] ?? 60;

  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    symbol: source.symbol,
    aliases: [...source.aliases],
    notes,
    intervals: pianoMidi.map((midi) => intervalBetween(rootMidi, midi)),
    pianoMidi,
    voicings: {
      guitar: source.voicings?.guitar ?? [],
      ukulele: source.voicings?.ukulele ?? [],
    },
  };
}

function ascendingMidi(notes: string[]): number[] {
  let previous = Number.NEGATIVE_INFINITY;
  return notes.map((note) => {
    let midi = noteToMidi(`${note}4`);
    while (midi <= previous) midi += 12;
    previous = midi;
    return midi;
  });
}
