import type { PracticeStore } from "@repo/music-core/engines/store";
import {
  chordNotes,
  intervalBetween,
  noteToMidi,
  scaleNotes,
} from "@repo/music-core/engines/theory";

export type TheoryItemKind = "chord" | "scale";
export type StringInstrument = "guitar" | "ukulele";
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
