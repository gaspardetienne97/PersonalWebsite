import * as Tone from "@tonejs/midi";
import type { Lesson, LessonNote } from "$lib/types/index.js";
const { Midi } = Tone;

export interface ParseOptions {
  trackIndex?: number; // Specific track to use (default: auto-detect drums)
  channel?: number; // Filter to specific channel (default: 10 for drums)
  quantize?: number; // Quantize to ms (optional)
}

export interface ParsedMidi {
  name: string;
  tempo: number;
  timeSignature: [number, number];
  duration: number;
  tracks: {
    index: number;
    name: string;
    channel: number;
    noteCount: number;
  }[];
  notes: LessonNote[];
}

export class MidiParser {
  /**
   * Parse MIDI file from ArrayBuffer
   */
  static async parse(buffer: ArrayBuffer, options: ParseOptions = {}): Promise<ParsedMidi> {
    const midi = new Midi(buffer);

    // Get tempo
    const tempo = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;

    // Get time signature
    const timeSignature: [number, number] =
      midi.header.timeSignatures.length > 0
        ? [
            midi.header.timeSignatures[0].timeSignature[0],
            midi.header.timeSignatures[0].timeSignature[1],
          ]
        : [4, 4];

    // Collect track info
    const tracks = midi.tracks.map((track: any, index: number) => ({
      index,
      name: track.name || `Track ${index + 1}`,
      channel: track.channel,
      noteCount: track.notes.length,
    }));

    // Find drum track(s)
    let targetTracks = midi.tracks;

    if (options.trackIndex !== undefined) {
      targetTracks = [midi.tracks[options.trackIndex]];
    } else if (options.channel !== undefined) {
      targetTracks = midi.tracks.filter((t: any) => t.channel === options.channel! - 1);
    } else {
      // Auto-detect: prefer channel 10 (drums), otherwise use all
      const drumTracks = midi.tracks.filter((t: any) => t.channel === 9);
      if (drumTracks.length > 0) {
        targetTracks = drumTracks;
      }
    }

    // Collect notes
    const notes: LessonNote[] = [];

    for (const track of targetTracks) {
      for (const note of track.notes) {
        let timeMs = note.time * 1000;

        // Optional quantization
        if (options.quantize) {
          timeMs = Math.round(timeMs / options.quantize) * options.quantize;
        }

        notes.push({
          time: Math.round(timeMs),
          note: note.midi,
          velocity: Math.round(note.velocity * 127),
          duration: Math.round(note.duration * 1000),
        });
      }
    }

    // Sort by time
    notes.sort((a, b) => a.time - b.time);

    // Calculate duration
    const duration =
      notes.length > 0 ? notes[notes.length - 1].time + notes[notes.length - 1].duration : 0;

    return {
      name: midi.name || "Untitled",
      tempo,
      timeSignature,
      duration,
      tracks,
      notes,
    };
  }

  /**
   * Load and parse MIDI file from URL
   */
  static async loadFromUrl(url: string, options?: ParseOptions): Promise<ParsedMidi> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load MIDI file: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return this.parse(buffer, options);
  }

  /**
   * Load and parse MIDI file from File input
   */
  static async loadFromFile(file: File, options?: ParseOptions): Promise<ParsedMidi> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const result = await this.parse(reader.result as ArrayBuffer, options);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Convert ParsedMidi to Lesson format
   */
  static toLesson(parsed: ParsedMidi, metadata: Partial<Lesson> = {}): Lesson {
    return {
      id: metadata.id || `imported-${Date.now()}`,
      version: 1,
      title: metadata.title || parsed.name,
      description: metadata.description || "Imported MIDI file",
      author: metadata.author || "Unknown",
      difficulty: metadata.difficulty || "intermediate",
      genre: metadata.genre || "unknown",
      tags: metadata.tags || ["imported"],
      bpm: parsed.tempo,
      timeSignature: parsed.timeSignature,
      duration: parsed.duration,
      tips: metadata.tips || [],
      notes: parsed.notes,
      ...metadata,
    };
  }
}
