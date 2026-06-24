import { Midi } from "@tonejs/midi";
import { describe, expect, test } from "vitest";

import type { ImportedSong } from "@repo/music-core/engines/import";

import { parseMidiScore, parseMusicXmlScore, scoreFromImportedSong } from "./index";

describe("scoreFromImportedSong", () => {
  test("preserves beat-native timing maps and classifies track roles", () => {
    const song = {
      name: "Tempo Study",
      durationSec: 4,
      bpm: 120,
      timeSignature: [4, 4],
      tempoMap: [
        { atBeat: 0, bpm: 120 },
        { atBeat: 4, bpm: 90 },
      ],
      timeSignatures: [
        { atBeat: 0, numerator: 4, denominator: 4 },
        { atBeat: 8, numerator: 3, denominator: 4 },
      ],
      totalNotes: 2,
      tracks: [
        {
          name: "Lead",
          notes: [
            {
              midi: 60,
              time: 0,
              duration: 0.5,
              velocity: 0.8,
              startBeat: 0,
              durationBeats: 1,
            },
          ],
        },
        {
          name: "Bass",
          notes: [
            {
              midi: 36,
              time: 2,
              duration: 1,
              velocity: 0.7,
              startBeat: 4,
              durationBeats: 2,
            },
          ],
        },
      ],
    } satisfies ImportedSong;

    const score = scoreFromImportedSong(song, "score-1");

    expect(score.tempoMap).toEqual(song.tempoMap);
    expect(score.timeSignatures).toEqual(song.timeSignatures);
    expect(score.voices.map(({ role }) => role)).toEqual(["melody", "bass"]);
    expect(
      score.notes.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats })),
    ).toEqual([
      { startBeat: 0, durationBeats: 1 },
      { startBeat: 4, durationBeats: 2 },
    ]);
    expect(score.sections[0]?.endBeat).toBe(6);
  });

  test("converts legacy second timing using the starting tempo", () => {
    const score = scoreFromImportedSong(
      {
        name: "Legacy Import",
        durationSec: 2,
        bpm: 120,
        timeSignature: [4, 4],
        totalNotes: 1,
        tracks: [
          {
            name: "Piano",
            notes: [{ midi: 60, time: 0.5, duration: 1, velocity: 0.8 }],
          },
        ],
      },
      "legacy",
    );

    expect(score.notes[0]).toMatchObject({ startBeat: 1, durationBeats: 2 });
    expect(score.sections[0]?.endBeat).toBe(4);
  });

  test("accepts reactive proxy timing arrays from UI state", () => {
    const tempoMap = new Proxy([{ atBeat: 0, bpm: 100 }], {});
    const timeSignatures = new Proxy([{ atBeat: 0, numerator: 4, denominator: 4 }], {});

    expect(() =>
      scoreFromImportedSong(
        {
          name: "Reactive Import",
          durationSec: 1,
          bpm: 100,
          timeSignature: [4, 4],
          tempoMap,
          timeSignatures,
          totalNotes: 0,
          tracks: [],
        },
        "reactive",
      ),
    ).not.toThrow();
  });
});

describe("parseMidiScore", () => {
  test("parses raw MIDI directly into the canonical Score model", () => {
    const midi = new Midi();
    midi.name = "Direct Import";
    midi.header.setTempo(96);
    const track = midi.addTrack();
    track.name = "Melody";
    track.addNote({ midi: 64, ticks: 0, durationTicks: midi.header.ppq, velocity: 0.75 });

    const score = parseMidiScore(new Uint8Array(midi.toArray()).buffer as ArrayBuffer, {
      id: "direct",
      fallbackName: "Fallback",
    });

    expect(score).toMatchObject({
      id: "direct",
      title: "Direct Import",
      origin: "midi",
      voices: [{ name: "Melody", role: "melody" }],
      notes: [{ midiNote: 64, startBeat: 0, durationBeats: 1 }],
    });
    expect(score.notes[0]?.velocity).toBeCloseTo(0.75, 2);
  });
});

describe("parseMusicXmlScore", () => {
  test("parses score-partwise notation into the canonical practice model", () => {
    const score = parseMusicXmlScore(MUSIC_XML, {
      id: "musicxml-1",
      fallbackName: "Fallback",
    });

    expect(score).toMatchObject({
      id: "musicxml-1",
      title: "MusicXML Study",
      origin: "musicxml",
      keySignature: "F major",
      tempoMap: [{ atBeat: 0, bpm: 96 }],
      timeSignatures: [
        { atBeat: 0, numerator: 4, denominator: 4 },
        { atBeat: 4, numerator: 3, denominator: 4 },
      ],
    });
    expect(score.voices).toEqual([
      { id: "P1:voice:1", name: "Piano · Voice 1", role: "other" },
      { id: "P1:voice:2", name: "Piano · Voice 2", role: "other" },
      { id: "P2:voice:1", name: "Bass · Voice 1", role: "bass" },
    ]);
    expect(score.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          midiNote: 60,
          writtenPitch: { step: "C", octave: 4 },
          startBeat: 0,
          durationBeats: 1,
          voiceId: "P1:voice:1",
        }),
        expect.objectContaining({
          midiNote: 64,
          startBeat: 0,
          durationBeats: 1,
          voiceId: "P1:voice:1",
        }),
        expect.objectContaining({
          midiNote: 55,
          startBeat: 0,
          durationBeats: 2,
          voiceId: "P1:voice:2",
        }),
        expect.objectContaining({
          midiNote: 41,
          startBeat: 0,
          durationBeats: 4,
          voiceId: "P2:voice:1",
        }),
        expect.objectContaining({
          midiNote: 62,
          startBeat: 4,
          durationBeats: 1,
          voiceId: "P1:voice:1",
        }),
      ]),
    );
    expect(score.rests).toContainEqual({
      startBeat: 1,
      durationBeats: 1,
      voiceId: "P1:voice:1",
    });
    expect(score.chords).toContainEqual({
      symbol: "Fmaj7",
      startBeat: 0,
    });
    expect(score.lyrics).toContainEqual({ text: "La", startBeat: 0 });
    expect(score.sections[0]?.endBeat).toBe(7);
  });

  test("rejects malformed XML and unsupported score roots", () => {
    expect(() => parseMusicXmlScore("<score-partwise><part>", { id: "broken" })).toThrow(
      "MusicXML could not be parsed",
    );
    expect(() => parseMusicXmlScore('<score-timewise version="4.0"/>', { id: "timewise" })).toThrow(
      "Only score-partwise MusicXML is supported",
    );
  });
});

const MUSIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>MusicXML Study</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>-1</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo="96"/></direction>
      <harmony>
        <root><root-step>F</root-step></root>
        <kind text="maj7">major-seventh</kind>
      </harmony>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice>
        <lyric><text>La</text></lyric>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice>
      </note>
      <note><rest/><duration>4</duration><voice>1</voice></note>
      <backup><duration>8</duration></backup>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>8</duration><voice>2</voice>
      </note>
    </measure>
    <measure number="2">
      <attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice>
      </note>
      <forward><duration>8</duration></forward>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>F</step><octave>2</octave></pitch>
        <duration>16</duration><voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>12</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;
