import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { ScoreSelectionMap } from "@repo/music-core/engines/score-practice";

import MusicXmlScore from "./MusicXmlScore.svelte";

afterEach(() => vi.restoreAllMocks());

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

  test("emits canonical note-group ranges from OSMD pointer selection", async () => {
    mockSelectionRects();
    const onSelectionChange = vi.fn();
    render(MusicXmlScore, {
      xml: MUSIC_XML,
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "note-group",
      onSelectionChange,
    });

    const host = await scoreHost();
    drag(host, 15, 105);

    expect(onSelectionChange).toHaveBeenCalledWith({ startBeat: 0, endBeat: 8 });
  });

  test("supports measure tap selection and named range overlays in OSMD", async () => {
    mockSelectionRects();
    const onSelectionChange = vi.fn();
    render(MusicXmlScore, {
      xml: MUSIC_XML,
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "measure",
      highlightedRanges: [
        { id: "a", startBeat: 0, endBeat: 4 },
        { id: "b", startBeat: 4, endBeat: 8, active: true },
      ],
      onSelectionChange,
    });

    const host = await scoreHost();
    tap(host, 15);
    tap(host, 105);

    expect(onSelectionChange).toHaveBeenCalledWith({ startBeat: 0, endBeat: 8 });
    expect(document.querySelectorAll("[data-notation-highlight]")).toHaveLength(2);
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
  </measure>
  <measure number="2">
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
  </measure></part>
</score-partwise>`;

function selectionMap(): ScoreSelectionMap {
  return {
    measureBoundaries: [
      { id: "measure:0", beat: 0, kind: "score-start", measureIndex: 0 },
      { id: "measure:1", beat: 4, kind: "measure", measureIndex: 1 },
      { id: "measure:2", beat: 8, kind: "score-end", measureIndex: 1 },
    ],
    noteGroupBoundaries: [
      { id: "note:0", beat: 0, kind: "score-start", measureIndex: 0 },
      { id: "note:1", beat: 4, kind: "note-group", measureIndex: 1 },
      { id: "note:2", beat: 8, kind: "score-end", measureIndex: 1 },
    ],
  };
}

async function scoreHost(): Promise<HTMLElement> {
  await vi.waitFor(
    () => expect(document.querySelector('[aria-label="MusicXML score"] svg')).not.toBeNull(),
    { timeout: 5_000 },
  );
  return document.querySelector<HTMLElement>('[aria-label="MusicXML score"]')!;
}

function drag(host: HTMLElement, startX: number, endX: number): void {
  host.dispatchEvent(pointer("pointerdown", startX));
  host.dispatchEvent(pointer("pointermove", endX));
  host.dispatchEvent(pointer("pointerup", endX));
}

function tap(host: HTMLElement, x: number): void {
  host.dispatchEvent(pointer("pointerdown", x, "touch"));
  host.dispatchEvent(pointer("pointerup", x, "touch"));
}

function pointer(type: string, clientX: number, pointerType = "mouse"): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    clientX,
    clientY: 5,
    pointerId: 1,
    pointerType,
  });
}

function mockSelectionRects(): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const element = this as HTMLElement;
    const kind = element.dataset.selectionKind;
    const start = Number(element.dataset.startBeat ?? 0);
    if (kind === "measure" || kind === "note-group") {
      const left = start === 0 ? 10 : 100;
      return domRect(left, 0, left + 20, 10);
    }
    return domRect(0, 0, 200, 300);
  });
}

function domRect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  };
}
