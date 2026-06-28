import { describe, expect, test } from "vitest";

import {
  MPC_BANKS,
  MPC_PAD_MIDI,
  assignSample,
  autoMapSamples,
  cloneSampleKit,
  isMpcPadMidi,
  safeSampleFileName,
  sampleBinaryKey,
  sampleForPadVelocity,
  renameSample,
  setPadChokeGroup,
  setPadVelocityLayers,
  unassignPad,
  validateSampleFile,
  type SampleAsset,
  type SampleKit,
} from "./index";

function asset(id: string, fileName: string): SampleAsset {
  return {
    id,
    fileName,
    displayName: fileName.replace(/\.[^.]+$/, ""),
    mimeType: "audio/wav",
    size: 2,
    binaryKey: `music.sample-kits/kit/${id}-${fileName}`,
  };
}

function kitWith(samples: SampleAsset[]): SampleKit {
  return {
    id: "kit",
    name: "Kit",
    createdAt: 1,
    updatedAt: 1,
    samples,
    assignments: autoMapSamples(samples),
  };
}

describe("sample-kit/auto-mapping", () => {
  test.each([
    ["Fat Kick.wav", 36],
    ["BD_01.wav", 36],
    ["Bass Drum.aif", 36],
    ["808 one shot.wav", 36],
    ["Dry Snare.wav", 38],
    ["SD-02.wav", 38],
    ["Hand Clap.wav", 39],
    ["Side Stick.wav", 37],
    ["Closed-Hat.wav", 42],
    ["HHC 03.wav", 42],
    ["Open Hat.wav", 46],
    ["HHO.ogg", 46],
    ["Low Tom.wav", 41],
    ["Tom_Mid.wav", 45],
    ["High-Tom.wav", 48],
    ["Crash.wav", 49],
    ["Ride.wav", 51],
    ["Percussion.wav", 40],
  ])("maps %s to Bank A MIDI %i", (fileName, midiNote) => {
    expect(autoMapSamples([asset("sample-1", fileName)])).toEqual([
      expect.objectContaining({ sampleId: "sample-1", midiNote }),
    ]);
  });

  test("preserves existing assignments and fills collisions in ascending order", () => {
    const samples = [
      asset("old", "old.wav"),
      asset("kick-2", "another kick.wav"),
      asset("unknown", "texture.wav"),
    ];
    expect(autoMapSamples(samples, [{ midiNote: 36, sampleId: "old", label: "Old" }])).toEqual([
      { midiNote: 36, sampleId: "old", label: "Old" },
      expect.objectContaining({ midiNote: 37, sampleId: "kick-2" }),
      expect.objectContaining({ midiNote: 38, sampleId: "unknown" }),
    ]);
  });

  test("leaves imports after the sixteenth sample unassigned", () => {
    const assignments = autoMapSamples(
      Array.from({ length: 18 }, (_, index) => asset(`s${index}`, `sample-${index}.wav`)),
    );
    expect(assignments).toHaveLength(18);
    expect(assignments.map(({ midiNote }) => midiNote)).toEqual(MPC_PAD_MIDI.slice(0, 18));
  });

  test("maps overflow imports into banks B-D after Bank A fills", () => {
    const assignments = autoMapSamples(
      Array.from({ length: 64 }, (_, index) => asset(`s${index}`, `sample-${index}.wav`)),
    );

    expect(MPC_BANKS.map((bank) => bank.id)).toEqual(["A", "B", "C", "D"]);
    expect(assignments).toHaveLength(64);
    expect(assignments.map(({ midiNote }) => midiNote)).toEqual(MPC_PAD_MIDI);
    expect(assignments[16]).toMatchObject({ midiNote: 52, sampleId: "s16" });
    expect(assignments[63]).toMatchObject({ midiNote: 99, sampleId: "s63" });
  });

  test("does not reassign a sample already placed by an existing assignment", () => {
    const samples = [asset("kick", "kick.wav")];
    expect(autoMapSamples(samples, [{ midiNote: 40, sampleId: "kick", label: "Kick" }])).toEqual([
      { midiNote: 40, sampleId: "kick", label: "Kick" },
    ]);
  });
});

describe("sample-kit/validation", () => {
  test("rejects empty names", () => {
    expect(() => validateSampleFile({ name: "   ", size: 10, type: "" })).toThrow(
      "Sample files need a name.",
    );
  });

  test("rejects unsupported extensions", () => {
    expect(() => validateSampleFile({ name: "loop.mid", size: 10, type: "" })).toThrow(
      "This file type is not supported by MPC sample kits: loop.mid.",
    );
  });

  test("rejects zero-byte files", () => {
    expect(() => validateSampleFile({ name: "kick.wav", size: 0, type: "audio/wav" })).toThrow(
      "The sample file is empty: kick.wav.",
    );
  });

  test("accepts every supported extension", () => {
    for (const ext of ["wav", "wave", "aif", "aiff", "flac", "mp3", "ogg", "oga"]) {
      expect(() => validateSampleFile({ name: `s.${ext}`, size: 4, type: "" })).not.toThrow();
    }
  });
});

describe("sample-kit/names and keys", () => {
  test("isMpcPadMidi guards Banks A-D", () => {
    expect(isMpcPadMidi(36)).toBe(true);
    expect(isMpcPadMidi(99)).toBe(true);
    expect(isMpcPadMidi(35)).toBe(false);
    expect(isMpcPadMidi(100)).toBe(false);
  });

  test("safeSampleFileName keeps the extension and transliterates the stem", () => {
    expect(safeSampleFileName("Kick & Bass.wav")).toBe("Kick-Bass.wav");
    expect(safeSampleFileName("Crème Brûlée.AIFF")).toBe("Creme-Brulee.aiff");
    expect(safeSampleFileName("___.wav")).toBe("sample.wav");
  });

  test("sampleBinaryKey nests under the settings id", () => {
    expect(sampleBinaryKey("kit-1", "s-1", "Kick & Bass.wav")).toBe(
      "music.sample-kits/kit-1/s-1-Kick-Bass.wav",
    );
  });
});

describe("sample-kit/assignment", () => {
  test("moves a sample to a pad and clears the previous occupant", () => {
    const kit = kitWith([asset("kick", "kick.wav"), asset("snare", "snare.wav")]);
    const moved = assignSample(kit, "snare", 52, 99);
    expect(moved.assignments).toContainEqual(
      expect.objectContaining({ midiNote: 52, sampleId: "snare" }),
    );
    expect(moved.assignments.filter((a) => a.midiNote === 52)).toHaveLength(1);
    expect(moved.updatedAt).toBe(99);
    expect(kit.assignments).not.toBe(moved.assignments);
  });

  test("throws for an unknown sample", () => {
    const kit = kitWith([asset("kick", "kick.wav")]);
    expect(() => assignSample(kit, "ghost", 40)).toThrow("Sample not found: ghost.");
  });

  test("renames a sample and updates assignment labels", () => {
    const kit = setPadVelocityLayers(
      kitWith([asset("soft", "kick-soft.wav"), asset("hard", "kick-hard.wav")]),
      36,
      [
        { sampleId: "soft", minVelocity: 0, maxVelocity: 0.49 },
        { sampleId: "hard", minVelocity: 0.5, maxVelocity: 1 },
      ],
    );

    const renamed = renameSample(kit, "hard", "Layer Slam", 222);

    expect(renamed.samples.find((sample) => sample.id === "hard")?.displayName).toBe("Layer Slam");
    expect(renamed.assignments[0]?.velocityLayers?.[1]).toMatchObject({
      sampleId: "hard",
      label: "Layer Slam",
    });
    expect(renamed.updatedAt).toBe(222);
  });

  test("rejects empty sample display names", () => {
    const kit = kitWith([asset("kick", "kick.wav")]);
    expect(() => renameSample(kit, "kick", "   ")).toThrow("Sample names cannot be empty.");
  });

  test("unassignPad removes the pad and keeps assignments sorted", () => {
    const kit = kitWith([asset("kick", "kick.wav"), asset("snare", "snare.wav")]);
    const cleared = unassignPad(kit, 36, 5);
    expect(cleared.assignments.some((a) => a.midiNote === 36)).toBe(false);
    expect(cleared.updatedAt).toBe(5);
  });

  test("sets and resolves velocity layers for one pad", () => {
    const kit = kitWith([
      asset("soft", "kick-soft.wav"),
      asset("hard", "kick-hard.wav"),
      asset("ghost", "ghost.wav"),
    ]);
    const layered = setPadVelocityLayers(
      kit,
      36,
      [
        { sampleId: "soft", minVelocity: 0, maxVelocity: 0.49 },
        { sampleId: "hard", minVelocity: 0.5, maxVelocity: 1 },
      ],
      123,
    );
    const assignment = layered.assignments.find((entry) => entry.midiNote === 36)!;

    expect(assignment).toMatchObject({ midiNote: 36, sampleId: "soft", label: "kick-soft" });
    expect(assignment.velocityLayers).toEqual([
      { sampleId: "soft", label: "kick-soft", minVelocity: 0, maxVelocity: 0.49 },
      { sampleId: "hard", label: "kick-hard", minVelocity: 0.5, maxVelocity: 1 },
    ]);
    expect(sampleForPadVelocity(assignment, 0.2)).toMatchObject({ sampleId: "soft" });
    expect(sampleForPadVelocity(assignment, 0.9)).toMatchObject({ sampleId: "hard" });
    expect(layered.updatedAt).toBe(123);
  });

  test("rejects invalid velocity layers", () => {
    const kit = kitWith([asset("soft", "kick-soft.wav")]);

    expect(() => setPadVelocityLayers(kit, 36, [])).toThrow(
      "A pad needs at least one velocity layer.",
    );
    expect(() =>
      setPadVelocityLayers(kit, 36, [{ sampleId: "soft", minVelocity: 0.8, maxVelocity: 0.2 }]),
    ).toThrow("Velocity layer 1 must start before it ends.");
    expect(() =>
      setPadVelocityLayers(kit, 36, [{ sampleId: "missing", minVelocity: 0, maxVelocity: 1 }]),
    ).toThrow("Sample not found: missing.");
  });

  test("sets and clears a pad choke group", () => {
    const kit = kitWith([asset("closed", "closed-hat.wav"), asset("open", "open-hat.wav")]);
    const grouped = setPadChokeGroup(kit, 42, 1, 99);
    const cleared = setPadChokeGroup(grouped, 42, undefined, 100);

    expect(grouped.assignments.find((entry) => entry.midiNote === 42)).toMatchObject({
      chokeGroup: 1,
    });
    expect(grouped.updatedAt).toBe(99);
    expect(cleared.assignments.find((entry) => entry.midiNote === 42)?.chokeGroup).toBeUndefined();
    expect(cleared.updatedAt).toBe(100);
  });

  test("rejects invalid choke group numbers", () => {
    const kit = kitWith([asset("closed", "closed-hat.wav")]);

    expect(() => setPadChokeGroup(kit, 42, 0)).toThrow("Choke group must be 1-16.");
    expect(() => setPadChokeGroup(kit, 42, 17)).toThrow("Choke group must be 1-16.");
  });

  test("cloneSampleKit deep-copies samples and assignments", () => {
    const kit = setPadVelocityLayers(
      kitWith([asset("soft", "kick-soft.wav"), asset("hard", "kick-hard.wav")]),
      36,
      [
        { sampleId: "soft", minVelocity: 0, maxVelocity: 0.49 },
        { sampleId: "hard", minVelocity: 0.5, maxVelocity: 1 },
      ],
    );
    const clone = cloneSampleKit(kit);
    expect(clone).toEqual(kit);
    expect(clone.samples).not.toBe(kit.samples);
    expect(clone.assignments).not.toBe(kit.assignments);
    expect(clone.assignments[0]?.velocityLayers).not.toBe(kit.assignments[0]?.velocityLayers);
  });
});
