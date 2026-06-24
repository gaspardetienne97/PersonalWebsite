import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicXmlScore from "./MusicXmlScore.svelte";

describe("MusicXmlScore", () => {
  test("lazy-renders MusicXML as an accessible OSMD SVG", async () => {
    const onError = vi.fn();
    render(MusicXmlScore, { xml: MUSIC_XML, onError });

    await vi.waitFor(
      () => expect(document.querySelector('[aria-label="MusicXML score"] svg')).not.toBeNull(),
      { timeout: 5_000 },
    );
    expect(onError).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Rendering MusicXML");
  });

  test("reports invalid MusicXML without throwing from the component", async () => {
    const onError = vi.fn();
    render(MusicXmlScore, {
      xml: "<score-partwise><part>",
      onError,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(document.body.textContent).toContain("MusicXML could not be rendered");
  });
});

const MUSIC_XML = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <key><fifths>0</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
  </measure></part>
</score-partwise>`;
