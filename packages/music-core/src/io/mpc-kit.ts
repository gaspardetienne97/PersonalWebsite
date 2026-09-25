// MPC sample kit export (hardware notes §8): XPM 2.1 Drum Program plus Samples/.
import JSZip from "jszip";

export const BANKS = { A: [36, 51], B: [52, 67], C: [68, 83], D: [84, 99] } as const;
export type Bank = keyof typeof BANKS;
export const bankOf = (note: number): Bank | undefined =>
  (Object.keys(BANKS) as Bank[]).find((b) => note >= BANKS[b][0] && note <= BANKS[b][1]);

export const SAMPLE_EXTENSIONS = ["wav", "wave", "aif", "aiff", "flac", "mp3", "ogg", "oga"];
/** Soft / hard velocity split, stored normalised 0..1. */
export const VELOCITY_SPLIT = { soft: [0, 0.63], hard: [0.64, 1] } as const;

export interface KitLayer {
  sampleId: string;
  /** 0..1 */
  velStart: number;
  /** 0..1 */
  velEnd: number;
}
export interface KitPad {
  note: number;
  name?: string;
  /** Up to 4. */
  layers: KitLayer[];
  /** 1..16, same-group pads cut each other off; 0 or absent = none. */
  chokeGroup?: number;
}
export interface SampleKit {
  name: string;
  pads: KitPad[];
}
export interface KitSample {
  id: string;
  fileName: string;
  data: Uint8Array;
}
export interface KitFile {
  path: string;
  data: Uint8Array | string;
}

/** NFKD, diacritics stripped, non-alphanumeric runs to "-", trimmed, <= 64 chars. */
export function safeName(name: string, fallback = "Kit"): string {
  const s = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return s || fallback;
}

const splitName = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? { stem: fileName.slice(0, dot), ext: fileName.slice(dot) }
    : { stem: fileName, ext: "" };
};

/** Null when the MPC can read it, else a message naming the file. */
export function sampleFileError(fileName: string): string | null {
  const ext = splitName(fileName).ext.slice(1).toLowerCase();
  return SAMPLE_EXTENSIONS.includes(ext)
    ? null
    : `"${fileName}" is not a sample the MPC can load. Use ${SAMPLE_EXTENSIONS.join(", ")}.`;
}

// Filename tokens -> bank A note. First match wins, specific before general.
const MAP_RULES: [RegExp, number][] = [
  [/\bhi(gh)? ?tom/, 48],
  [/\bmid ?tom/, 45],
  [/\blow ?tom/, 41],
  [/\btoms?\b/, 45],
  [/\bkick|\bbass ?drum|\bbd\b|\b808\b/, 36],
  [/\bsnare|\bsd\b/, 38],
  [/\bclap/, 39],
  [/\bside ?stick|\brim ?shot|\brim\b|\bstick\b/, 37],
  [/\bopen ?(hi ?)?hat|\bhho\b/, 46],
  [/\bclosed ?(hi ?)?hat|\bhhc\b/, 42],
  [/\b(hi ?)?hat|\bhh\b/, 42],
  [/\bcrash/, 49],
  [/\bride/, 51],
  [/\bperc/, 40],
];

/** Bank A note a filename suggests, or null. "HiTom_02.wav" -> "hi tom 02". */
export function autoMapNote(fileName: string): number | null {
  const words = splitName(fileName)
    .stem.replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)|(\d)([A-Za-z])/g, "$1$3 $2$4")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase();
  return MAP_RULES.find(([re]) => re.test(words))?.[1] ?? null;
}

/**
 * Assign files to bank A pads: the first file to claim a suggested pad keeps it;
 * later matches and unrecognised names take the next free pad. Null once full.
 */
export function autoMapSamples(fileNames: string[]): (number | null)[] {
  const used = new Set<number>();
  const wanted = fileNames.map(autoMapNote);
  const out = wanted.map((n) => (n !== null && !used.has(n) ? (used.add(n), n) : undefined));
  return out.map((n) => {
    if (n !== undefined) return n;
    for (let m = BANKS.A[0]; m <= BANKS.A[1]; m++)
      if (!used.has(m)) {
        used.add(m);
        return m;
      }
    return null;
  });
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const vel = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 127);

/** The .xpm body. `layerNames` maps pad note -> sample base names (no extension), one per layer. */
export function buildXpm(
  programName: string,
  pads: KitPad[],
  layerNames: Map<number, string[]>,
): string {
  const byNote = new Map(pads.map((p) => [p.note, p]));
  const instruments: string[] = [];
  for (let n = 1; n <= 128; n++) {
    const note = Math.min(127, 35 + n);
    const pad = 35 + n <= 127 ? byNote.get(note) : undefined;
    const names = (pad && layerNames.get(note)) ?? [];
    const layers: string[] = [];
    for (let l = 0; l < 4; l++) {
      const layer = pad?.layers[l];
      layers.push(
        layer && names[l]
          ? `          <Layer number="${l + 1}">
            <Active>True</Active>
            <VelStart>${vel(layer.velStart)}</VelStart>
            <VelEnd>${vel(layer.velEnd)}</VelEnd>
            <SampleName>Samples/${esc(names[l])}</SampleName>
          </Layer>`
          : `          <Layer number="${l + 1}"><Active>False</Active><SampleName></SampleName></Layer>`,
      );
    }
    const choke =
      pad?.chokeGroup && pad.chokeGroup >= 1 && pad.chokeGroup <= 16 ? pad.chokeGroup : 0;
    instruments.push(`      <Instrument number="${n}">
        <Name>${esc(pad?.name ?? names[0]?.replace(/^\d{3}-/, "") ?? "")}</Name>
        <MidiNote>${note}</MidiNote>
        <MuteGroup>${choke}</MuteGroup>
        <Layers>
${layers.join("\n")}
        </Layers>
      </Instrument>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPCVObject>
  <Version>
    <File_Version>2.1</File_Version>
    <Application>MPC-V</Application>
    <Application_Version>3.0</Application_Version>
    <Platform>Standalone</Platform>
  </Version>
  <Program type="Drum">
    <ProgramName>${esc(programName)}</ProgramName>
    <Program_Polyphony>0</Program_Polyphony>
    <Instruments>
${instruments.join("\n")}
    </Instruments>
  </Program>
</MPCVObject>
`;
}

/**
 * Every file of the kit, paths starting with the kit folder:
 * `<Kit>/<Kit>.xpm` and `<Kit>/Samples/036-kick.wav`. Throws naming the first
 * sample with a format the MPC cannot read, or a layer whose sample is missing.
 */
export function buildKitFiles(kit: SampleKit, samples: KitSample[]): KitFile[] {
  const folder = safeName(kit.name);
  const byId = new Map(samples.map((s) => [s.id, s]));
  const taken = new Set<string>();
  const perPad = new Map<string, string>(); // `${note}:${sampleId}` -> base name
  const layerNames = new Map<number, string[]>();
  const files: KitFile[] = [];
  for (const pad of [...kit.pads].sort((a, b) => a.note - b.note)) {
    const names: string[] = [];
    for (const layer of pad.layers.slice(0, 4)) {
      const sample = byId.get(layer.sampleId);
      if (!sample) throw new Error(`Pad ${pad.note} points at a sample that is not in the kit.`);
      const err = sampleFileError(sample.fileName);
      if (err) throw new Error(err);
      const key = `${pad.note}:${sample.id}`;
      let base = perPad.get(key);
      if (!base) {
        const { stem, ext } = splitName(sample.fileName);
        const root = `${String(pad.note).padStart(3, "0")}-${safeName(stem, "sample")}`;
        base = root;
        for (let k = 2; taken.has(base.toLowerCase()); k++) base = `${root}-${k}`;
        taken.add(base.toLowerCase());
        perPad.set(key, base);
        files.push({ path: `${folder}/Samples/${base}${ext}`, data: sample.data });
      }
      names.push(base);
    }
    layerNames.set(pad.note, names);
  }
  return [
    { path: `${folder}/${folder}.xpm`, data: buildXpm(folder, kit.pads, layerNames) },
    ...files,
  ];
}

export const kitZipName = (kitName: string) => `${safeName(kitName)}-mpc.zip`;

/** ZIP (named `kitZipName(kitName)`) holding the one top-level kit folder. */
export async function kitZip(files: KitFile[], kitName: string): Promise<Uint8Array> {
  const folder = `${safeName(kitName)}/`;
  const zip = new JSZip();
  for (const f of files) {
    if (!f.path.startsWith(folder))
      throw new Error(`${f.path} is outside the kit folder ${folder}`);
    zip.file(f.path, f.data);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
