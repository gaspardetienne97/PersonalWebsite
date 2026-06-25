import { describe, expect, test } from "vitest";

import { buildMpcKitExport } from "./mpc-export";
import type { SampleKit } from "./index";

function kitFixture(overrides: Partial<SampleKit> = {}): SampleKit {
  return {
    id: "k",
    name: "My & Kit",
    createdAt: 1,
    updatedAt: 1,
    samples: [
      {
        id: "a",
        fileName: "Kick & Bass.wav",
        displayName: "Kick & Bass",
        mimeType: "audio/wav",
        size: 1,
        binaryKey: "k/a",
      },
      {
        id: "b",
        fileName: 'Snare "Dry".wav',
        displayName: 'Snare "Dry"',
        mimeType: "audio/wav",
        size: 1,
        binaryKey: "k/b",
      },
    ],
    assignments: [
      { midiNote: 36, sampleId: "a", label: "Kick" },
      { midiNote: 38, sampleId: "b", label: "Snare" },
    ],
    ...overrides,
  };
}

function blobMap(
  entries: [string, string][] = [
    ["k/a", "kick"],
    ["k/b", "snare"],
  ],
): Map<string, Blob> {
  return new Map(entries.map(([key, text]) => [key, new Blob([text], { type: "audio/wav" })]));
}

describe("buildMpcKitExport", () => {
  test("builds a 16-pad XPM 2.1 drum program with relative sample references", async () => {
    const result = buildMpcKitExport(kitFixture(), blobMap());
    expect(result.folderName).toBe("My-Kit");
    expect(result.programFileName).toBe("My-Kit.xpm");
    expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
      "My-Kit.xpm",
      "Samples/036-Kick-Bass.wav",
      "Samples/038-Snare-Dry.wav",
    ]);

    const xml = await result.files[0]!.content.text();
    expect(xml).toContain("<File_Version>2.1</File_Version>");
    expect(xml).toContain('<Program type="Drum">');
    expect(xml).toContain("<ProgramName>My &amp; Kit</ProgramName>");
    expect(xml.match(/<Instrument number="/g)).toHaveLength(128);
    expect(xml).toContain("<SampleName>Samples/036-Kick-Bass</SampleName>");
  });

  test("resolves stem collisions with numeric suffixes", () => {
    const kit = kitFixture({
      samples: [
        {
          id: "a",
          fileName: "Clap A!.wav",
          displayName: "Clap A",
          mimeType: "",
          size: 1,
          binaryKey: "k/a",
        },
        {
          id: "b",
          fileName: "Clap A?.wav",
          displayName: "Clap A",
          mimeType: "",
          size: 1,
          binaryKey: "k/b",
        },
      ],
      assignments: [
        { midiNote: 39, sampleId: "a", label: "Clap" },
        { midiNote: 40, sampleId: "b", label: "Clap" },
      ],
    });
    const result = buildMpcKitExport(kit, blobMap());
    expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
      "My-Kit.xpm",
      "Samples/039-Clap-A.wav",
      "Samples/040-Clap-A-2.wav",
    ]);
  });

  test("rejects a kit with no assigned samples", () => {
    expect(() => buildMpcKitExport(kitFixture({ assignments: [] }), blobMap())).toThrow(
      "This kit has no assigned samples.",
    );
  });

  test("rejects an assignment whose sample metadata is missing", () => {
    const kit = kitFixture({
      assignments: [{ midiNote: 36, sampleId: "ghost", label: "Ghost" }],
    });
    expect(() => buildMpcKitExport(kit, blobMap())).toThrow(
      "A sample assigned to pad 36 is missing.",
    );
  });

  test("rejects an assignment whose blob is missing", () => {
    expect(() => buildMpcKitExport(kitFixture(), blobMap([["k/a", "kick"]]))).toThrow(
      "A sample assigned to pad 38 is missing.",
    );
  });

  test("rejects an unsupported export extension", () => {
    const kit = kitFixture({
      samples: [
        {
          id: "a",
          fileName: "loop.mid",
          displayName: "loop",
          mimeType: "",
          size: 1,
          binaryKey: "k/a",
        },
      ],
      assignments: [{ midiNote: 36, sampleId: "a", label: "Loop" }],
    });
    expect(() => buildMpcKitExport(kit, blobMap())).toThrow(
      "This file type cannot be exported to MPC: loop.mid.",
    );
  });
});
