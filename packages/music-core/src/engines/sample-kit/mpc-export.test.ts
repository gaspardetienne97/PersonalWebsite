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

  test("exports assignments from banks B-D with their MIDI note sample names", async () => {
    const kit = kitFixture({
      samples: [
        {
          id: "a",
          fileName: "Bank D Hit.wav",
          displayName: "Bank D Hit",
          mimeType: "audio/wav",
          size: 1,
          binaryKey: "k/a",
        },
      ],
      assignments: [{ midiNote: 99, sampleId: "a", label: "Bank D Hit" }],
    });

    const result = buildMpcKitExport(kit, blobMap([["k/a", "hit"]]));
    expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
      "My-Kit.xpm",
      "Samples/099-Bank-D-Hit.wav",
    ]);

    const xml = await result.files[0]!.content.text();
    expect(xml).toContain("<MidiNote>99</MidiNote>");
    expect(xml).toContain("<SampleName>Samples/099-Bank-D-Hit</SampleName>");
  });

  test("exports velocity layers with MPC 0-127 velocity ranges", async () => {
    const kit = kitFixture({
      samples: [
        {
          id: "a",
          fileName: "Kick Soft.wav",
          displayName: "Kick Soft",
          mimeType: "audio/wav",
          size: 1,
          binaryKey: "k/a",
        },
        {
          id: "b",
          fileName: "Kick Hard.wav",
          displayName: "Kick Hard",
          mimeType: "audio/wav",
          size: 1,
          binaryKey: "k/b",
        },
      ],
      assignments: [
        {
          midiNote: 36,
          sampleId: "a",
          label: "Kick",
          velocityLayers: [
            { sampleId: "a", label: "Kick Soft", minVelocity: 0, maxVelocity: 0.49 },
            { sampleId: "b", label: "Kick Hard", minVelocity: 0.5, maxVelocity: 1 },
          ],
        },
      ],
    });

    const result = buildMpcKitExport(
      kit,
      blobMap([
        ["k/a", "soft"],
        ["k/b", "hard"],
      ]),
    );
    expect(result.files.map(({ relativePath }) => relativePath)).toEqual([
      "My-Kit.xpm",
      "Samples/036-Kick-Soft.wav",
      "Samples/036-Kick-Hard.wav",
    ]);

    const xml = await result.files[0]!.content.text();
    expect(xml).toContain('<Layer number="1">');
    expect(xml).toContain("<VelStart>0</VelStart>");
    expect(xml).toContain("<VelEnd>62</VelEnd>");
    expect(xml).toContain("<SampleName>Samples/036-Kick-Soft</SampleName>");
    expect(xml).toContain('<Layer number="2">');
    expect(xml).toContain("<VelStart>64</VelStart>");
    expect(xml).toContain("<VelEnd>127</VelEnd>");
    expect(xml).toContain("<SampleName>Samples/036-Kick-Hard</SampleName>");
  });

  test("exports choke groups as MPC mute groups", async () => {
    const kit = kitFixture({
      assignments: [
        { midiNote: 42, sampleId: "a", label: "Closed Hat", chokeGroup: 1 },
        { midiNote: 46, sampleId: "b", label: "Open Hat", chokeGroup: 1 },
      ],
    });

    const result = buildMpcKitExport(kit, blobMap());
    const xml = await result.files[0]!.content.text();

    expect(xml).toMatch(/<MidiNote>42<\/MidiNote>\s*<MuteGroup>1<\/MuteGroup>/);
    expect(xml).toMatch(/<MidiNote>46<\/MidiNote>\s*<MuteGroup>1<\/MuteGroup>/);
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
