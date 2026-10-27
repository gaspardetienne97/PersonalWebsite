import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseMusicXml, parseMxl } from "./musicxml";

const pitch = (step: string, octave: number, alter = 0) =>
  `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;

/** Piano (two staves, chords, a tie across the barline, backup/forward) plus a flute part. */
const DUO = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Tom &amp; Jerry</work-title></work>
  <identification><creator type="composer">A. Writer</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Flute</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>-1</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><direction-type><words>Gently</words></direction-type><sound tempo="72"/></direction>
      <!-- right hand: C5+E5 half chord, then G4 tied over the bar -->
      <note>${pitch("C", 5)}<duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/>${pitch("E", 5)}<duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note>${pitch("G", 4)}<duration>2</duration><tie type="start"/><voice>1</voice><staff>1</staff><notations><tied type="start"/></notations></note>
      <backup><duration>6</duration></backup>
      <note>${pitch("C", 3)}<duration>6</duration><voice>5</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note>${pitch("G", 4)}<duration>2</duration><tie type="stop"/><voice>1</voice><staff>1</staff><notations><tied type="stop"/></notations></note>
      <note><rest/><duration>2</duration><voice>1</voice><staff>1</staff></note>
      <note><grace/>${pitch("C", 5)}<voice>1</voice><staff>1</staff></note>
      <note>${pitch("B", 4, -1)}<duration>2</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      <forward><duration>4</duration></forward>
      <note>${pitch("F", 3)}<duration>2</duration><voice>5</voice><staff>2</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign></clef></attributes>
      <note>${pitch("E", 5)}<duration>3</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note>${pitch("F", 5)}<duration>1</duration><voice>1</voice></note>
      <note><rest/><duration>2</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

/** Single-voice melody in G with a one-beat pickup and a half-note metronome mark. */
const PICKUP = `<?xml version="1.0"?>
<score-partwise>
  <movement-title>Pickup tune</movement-title>
  <part-list><score-part id="M"><part-name>Melody</part-name></score-part></part-list>
  <part id="M">
    <measure number="0" implicit="yes">
      <attributes><divisions>4</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><metronome><beat-unit>half</beat-unit><per-minute>40</per-minute></metronome></direction-type></direction>
      <note>${pitch("D", 4)}<duration>4</duration><voice>1</voice></note>
    </measure>
    <measure number="1">
      <note>${pitch("G", 4)}<duration>4</duration><voice>1</voice></note>
      <note>${pitch("A", 4)}<duration>4</duration><voice>1</voice></note>
      <note>${pitch("B", 4)}<duration>8</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note>${pitch("F", 4, 1)}<duration>8</duration><voice>1</voice></note>
      <note>${pitch("G", 4)}<duration>8</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

const flat = (
  notes: { midi: number; startBeat: number; durationBeats: number; tieFrom?: boolean }[],
) => notes.map((n) => [n.midi, n.startBeat, n.durationBeats, ...(n.tieFrom ? ["tie"] : [])]);

/** A MuseScore-style drum set: kick and snare in voice 2, hats in voice 1, <midi-unpitched> 1-based. */
const DRUMS = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Back beat</work-title></work>
  <part-list>
    <score-part id="P1">
      <part-name>Drumset</part-name>
      <score-instrument id="P1-I36"><instrument-name>Bass Drum 1</instrument-name></score-instrument>
      <score-instrument id="P1-I38"><instrument-name>Acoustic Snare</instrument-name></score-instrument>
      <score-instrument id="P1-I42"><instrument-name>Closed Hi-Hat</instrument-name></score-instrument>
      <midi-instrument id="P1-I36"><midi-channel>10</midi-channel><midi-unpitched>37</midi-unpitched></midi-instrument>
      <midi-instrument id="P1-I38"><midi-channel>10</midi-channel><midi-unpitched>39</midi-unpitched></midi-instrument>
      <midi-instrument id="P1-I42"><midi-channel>10</midi-channel><midi-unpitched>43</midi-unpitched></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign></clef></attributes>
      <sound tempo="100"/>
      ${[0, 1, 2, 3]
        .map(
          () =>
            `<note><unpitched><display-step>G</display-step><display-octave>5</display-octave></unpitched><duration>2</duration><instrument id="P1-I42"/><voice>1</voice><type>quarter</type><notehead>x</notehead></note>`,
        )
        .join("")}
      <backup><duration>8</duration></backup>
      <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>2</duration><instrument id="P1-I36"/><voice>2</voice><type>quarter</type></note>
      <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>2</duration><instrument id="P1-I38"/><voice>2</voice><type>quarter</type></note>
      <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration><instrument id="P1-I36"/><voice>2</voice><type>eighth</type></note>
      <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration><voice>2</voice><type>eighth</type></note>
      <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>2</duration><instrument id="P1-I38"/><voice>2</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

describe("MusicXML", () => {
  it("reads a two-part piano piece: chords, a tie, backup/forward, staves, clefs, key, tempo", () => {
    const s = parseMusicXml(DUO);
    expect(s).toMatchObject({
      title: "Tom & Jerry",
      composer: "A. Writer",
      bpm: 72,
      meter: { beats: 3, beatUnit: 4 },
      keyFifths: -1,
      keyMode: "major",
      lengthBeats: 6,
    });
    expect(s.source).toEqual({ kind: "musicxml", xml: DUO });
    expect(s.voices.map((v) => [v.id, v.name, v.partId, v.clef, v.hand])).toEqual([
      ["P1-v1", "Piano voice 1", "P1", "treble", "right"],
      ["P1-v5", "Piano voice 5", "P1", "bass", "left"],
      ["P2-v1", "Flute", "P2", "treble", undefined],
    ]);
    expect(flat(s.voices[0].notes)).toEqual([
      [72, 0, 2],
      [76, 0, 2],
      [67, 2, 1],
      [67, 3, 1, "tie"],
      [70, 5, 1],
    ]);
    expect(flat(s.voices[1].notes)).toEqual([
      [48, 0, 3],
      [53, 5, 1],
    ]);
    expect(flat(s.voices[2].notes)).toEqual([
      [76, 0, 3],
      [77, 3, 1],
    ]);
  });

  it("reads a pickup bar, a converted metronome mark and a sharp", () => {
    const s = parseMusicXml(PICKUP);
    expect(s).toMatchObject({
      title: "Pickup tune",
      bpm: 80,
      keyFifths: 1,
      keyMode: "major",
      lengthBeats: 9,
    });
    expect(s.voices).toHaveLength(1);
    expect(s.voices[0]).toMatchObject({ id: "M-v1", name: "Melody", clef: "treble" });
    expect(flat(s.voices[0].notes)).toEqual([
      [62, 0, 1],
      [67, 1, 1],
      [69, 2, 1],
      [71, 3, 2],
      [66, 5, 2],
      [67, 7, 2],
    ]);
    // An opening bar shorter than its time signature is a pickup even without implicit="yes".
    expect(parseMusicXml(PICKUP.replace(' implicit="yes"', "")).lengthBeats).toBe(9);
  });

  it("reads a transposing part at concert pitch", () => {
    // An alto sax part in written A major sounds a major sixth lower, in C.
    const alto = PICKUP.replace(
      "<key><fifths>1</fifths></key>",
      "<key><fifths>3</fifths></key><transpose><diatonic>-5</diatonic><chromatic>-9</chromatic></transpose>",
    );
    const s = parseMusicXml(alto);
    expect(s.keyFifths).toBe(0);
    expect(s.voices[0].notes[0].midi).toBe(62 - 9);
    // A guitar written in treble with an octave-change sounds an octave down.
    const guitar = PICKUP.replace(
      "<key><fifths>1</fifths></key>",
      "<key><fifths>1</fifths></key><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>",
    );
    expect(parseMusicXml(guitar).voices[0].notes[0].midi).toBe(62 - 12);
    expect(parseMusicXml(guitar).keyFifths).toBe(1);
  });

  it("reads a percussion part as drum voices of General MIDI numbers", () => {
    const s = parseMusicXml(DRUMS);
    expect(s.bpm).toBe(100);
    expect(s.voices.map((v) => [v.id, v.drums, v.clef])).toEqual([
      ["P1-v1", true, undefined],
      ["P1-v2", true, undefined],
    ]);
    expect(s.voices[0].notes.map((n) => [n.midi, n.startBeat])).toEqual([
      [42, 0],
      [42, 1],
      [42, 2],
      [42, 3],
    ]);
    // The note with no <instrument> is placed by its staff position (F4: the kick).
    expect(s.voices[1].notes.map((n) => [n.midi, n.startBeat, n.durationBeats])).toEqual([
      [36, 0, 1],
      [38, 1, 1],
      [36, 2, 0.5],
      [36, 2.5, 0.5],
      [38, 3, 1],
    ]);
  });

  it("refuses timewise and non-MusicXML documents with a message", () => {
    expect(() => parseMusicXml("<score-timewise/>")).toThrow(/Timewise/);
    expect(() => parseMusicXml("<html></html>")).toThrow(/not a MusicXML/);
    expect(() => parseMusicXml("<score-partwise><part")).toThrow(/Malformed/);
  });

  it("opens .mxl through META-INF/container.xml", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score/tune.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`,
    );
    zip.file("score/tune.musicxml", PICKUP);
    zip.file("score/other.xml", DUO);
    const s = await parseMxl(await zip.generateAsync({ type: "uint8array" }));
    expect(s.title).toBe("Pickup tune");
    const empty = new JSZip();
    empty.file("readme.txt", "no score");
    await expect(parseMxl(await empty.generateAsync({ type: "uint8array" }))).rejects.toThrow(
      /no MusicXML/,
    );
  });
});
