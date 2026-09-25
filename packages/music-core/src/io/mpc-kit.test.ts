import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  autoMapNote,
  autoMapSamples,
  bankOf,
  BANKS,
  buildKitFiles,
  kitZip,
  kitZipName,
  safeName,
  sampleFileError,
  VELOCITY_SPLIT,
  type SampleKit,
} from "./mpc-kit";

const bytes = (n: number) => new Uint8Array([n, n, n]);

describe("MPC kit naming", () => {
  it("normalises kit names", () => {
    expect(safeName("Café Beats!! Vol. 2")).toBe("Cafe-Beats-Vol-2");
    expect(safeName("  --  ")).toBe("Kit");
    expect(safeName("Ünïcödé")).toBe("Unicode");
    const long = safeName("a".repeat(63) + " b" + "c".repeat(10));
    expect(long).toBe("a".repeat(63));
    expect(safeName("x".repeat(80))).toHaveLength(64);
  });

  it("allows the eight audio extensions and names a refused file", () => {
    for (const f of ["a.wav", "a.WAVE", "a.aif", "a.aiff", "a.flac", "a.mp3", "a.ogg", "a.oga"])
      expect(sampleFileError(f)).toBeNull();
    expect(sampleFileError("loop.m4a")).toMatch(/^"loop\.m4a" is not a sample the MPC can load/);
    expect(sampleFileError("noext")).toMatch(/"noext"/);
  });

  it("knows the four banks", () => {
    expect(BANKS).toEqual({ A: [36, 51], B: [52, 67], C: [68, 83], D: [84, 99] });
    expect([36, 51, 52, 83, 84, 99, 100].map(bankOf)).toEqual([
      "A",
      "A",
      "B",
      "C",
      "D",
      "D",
      undefined,
    ]);
  });
});

describe("filename auto-mapping", () => {
  it("maps tokens to bank A, specific before general", () => {
    const cases: [string, number | null][] = [
      ["High Tom.wav", 48],
      ["HiTom_02.wav", 48],
      ["Mid_Tom.wav", 45],
      ["low-tom.aif", 41],
      ["Floor Tom 3.wav", 45],
      ["BD_01.wav", 36],
      ["Kick808.wav", 36],
      ["bassdrum.wav", 36],
      ["Snare Rim.wav", 38],
      ["SD 3.wav", 38],
      ["Clap.wav", 39],
      ["SideStick.wav", 37],
      ["Rimshot.wav", 37],
      ["Open Hat.wav", 46],
      ["HHO.wav", 46],
      ["Closed HiHat.wav", 42],
      ["hhc_2.wav", 42],
      ["HiHat.wav", 42],
      ["hh.wav", 42],
      ["Crash 1.wav", 49],
      ["Ride Bell.wav", 51],
      ["Perc Shaker.wav", 40],
      ["Bottom.wav", null],
      ["Custom.wav", null],
    ];
    for (const [name, note] of cases) expect([name, autoMapNote(name)]).toEqual([name, note]);
  });

  it("lets the first file keep a pad and gives the rest the next free one", () => {
    expect(autoMapSamples(["kick.wav", "kick2.wav", "weird.wav", "snare.wav"])).toEqual([
      36, 37, 39, 38,
    ]);
    const many = autoMapSamples(Array.from({ length: 17 }, (_, i) => `x${i}.wav`));
    expect(many.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => 36 + i));
    expect(many[16]).toBeNull();
  });
});

const kit: SampleKit = {
  name: "Café Kit",
  pads: [
    {
      note: 38,
      name: "Snare",
      layers: [
        { sampleId: "s1", velStart: VELOCITY_SPLIT.soft[0], velEnd: VELOCITY_SPLIT.soft[1] },
        { sampleId: "s2", velStart: VELOCITY_SPLIT.hard[0], velEnd: VELOCITY_SPLIT.hard[1] },
      ],
    },
    { note: 36, layers: [{ sampleId: "k", velStart: 0, velEnd: 1 }] },
    { note: 42, layers: [{ sampleId: "hc", velStart: 0, velEnd: 1 }], chokeGroup: 1 },
    { note: 46, layers: [{ sampleId: "ho", velStart: 0, velEnd: 1 }], chokeGroup: 1 },
  ],
};
const samples = [
  { id: "k", fileName: "Big Kick.WAV", data: bytes(1) },
  { id: "s1", fileName: "snare.wav", data: bytes(2) },
  { id: "s2", fileName: "snare.wav", data: bytes(3) },
  { id: "hc", fileName: "closed hat.aif", data: bytes(4) },
  { id: "ho", fileName: "open hat.flac", data: bytes(5) },
];

describe("kit files and the XPM", () => {
  const files = buildKitFiles(kit, samples);
  const xpm = files[0].data as string;
  const instruments = xpm.split("<Instrument ").slice(1);

  it("lays out <Kit>/<Kit>.xpm and Samples/ with padded notes and duplicate suffixes", () => {
    expect(files.map((f) => f.path)).toEqual([
      "Cafe-Kit/Cafe-Kit.xpm",
      "Cafe-Kit/Samples/036-Big-Kick.WAV",
      "Cafe-Kit/Samples/038-snare.wav",
      "Cafe-Kit/Samples/038-snare-2.wav",
      "Cafe-Kit/Samples/042-closed-hat.aif",
      "Cafe-Kit/Samples/046-open-hat.flac",
    ]);
    expect(files[3].data).toEqual(bytes(3));
  });

  it("writes an XPM 2.1 drum program with 128 instruments of 4 layers", () => {
    expect(xpm).toContain("<File_Version>2.1</File_Version>");
    expect(xpm).toContain('<Program type="Drum">');
    expect(xpm).toContain("<ProgramName>Cafe-Kit</ProgramName>");
    expect(instruments).toHaveLength(128);
    expect(instruments.every((i) => (i.match(/<Layer number=/g) ?? []).length === 4)).toBe(true);
    const note = (i: number) => Number(/<MidiNote>(\d+)</.exec(instruments[i])![1]);
    expect([note(0), note(1), note(91), note(92), note(127)]).toEqual([36, 37, 127, 127, 127]);
    expect(instruments[0]).toMatch(/^number="1">/);
    expect(instruments[127]).toMatch(/^number="128">/);
  });

  it("references samples without extension, splits velocity 0-80 / 81-127, and sets choke groups", () => {
    const kick = instruments[0];
    expect(kick).toContain("<Name>Big-Kick</Name>");
    expect(kick).toContain("<SampleName>Samples/036-Big-Kick</SampleName>");
    expect(kick).toContain("<VelStart>0</VelStart>\n            <VelEnd>127</VelEnd>");
    expect(kick).toContain(
      '<Layer number="2"><Active>False</Active><SampleName></SampleName></Layer>',
    );
    expect(kick).toContain("<MuteGroup>0</MuteGroup>");
    const snare = instruments[2];
    expect(snare).toContain("<Name>Snare</Name>");
    expect(snare).toMatch(
      /<VelStart>0<\/VelStart>\s*<VelEnd>80<\/VelEnd>\s*<SampleName>Samples\/038-snare</,
    );
    expect(snare).toMatch(
      /<VelStart>81<\/VelStart>\s*<VelEnd>127<\/VelEnd>\s*<SampleName>Samples\/038-snare-2</,
    );
    expect((snare.match(/<Active>True/g) ?? []).length).toBe(2);
    expect(instruments[6]).toContain("<MuteGroup>1</MuteGroup>");
    expect(instruments[10]).toContain("<MuteGroup>1</MuteGroup>");
    expect(instruments[1]).not.toContain("<Active>True");
  });

  it("refuses an unreadable format by name", () => {
    const bad = [...samples.slice(0, 4), { id: "ho", fileName: "open.m4a", data: bytes(0) }];
    expect(() => buildKitFiles(kit, bad)).toThrow(/"open\.m4a"/);
  });

  it("zips one top-level folder named for the kit", async () => {
    expect(kitZipName("Café Kit")).toBe("Cafe-Kit-mpc.zip");
    const zip = await JSZip.loadAsync(await kitZip(files, "Café Kit"));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names.sort()).toEqual(files.map((f) => f.path).sort());
    expect(await zip.file("Cafe-Kit/Cafe-Kit.xpm")!.async("string")).toBe(xpm);
    await expect(kitZip([{ path: "Other/x.wav", data: bytes(1) }], "Café Kit")).rejects.toThrow(
      /outside/,
    );
  });
});
