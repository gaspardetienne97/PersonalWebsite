/**
 * MPC export — projects a sample kit into an MPC Standalone 3.x "Drum Program"
 * (XPM file version 2.1) plus its referenced sample files. Pure and
 * framework-agnostic: it emits an in-memory file list; directory/ZIP writers
 * live in browser-export.ts. The XPM is generated from code, not copied from any
 * MPC fixture.
 */

import { MPC_BANK_A_MIDI, velocityLayersForAssignment, type SampleKit } from "./index";

export interface MpcExportFile {
  relativePath: string;
  content: Blob;
}

export interface MpcKitExport {
  folderName: string;
  programFileName: string;
  files: MpcExportFile[];
}

const EXPORTABLE_EXTENSIONS = new Set(["wav", "wave", "aif", "aiff", "flac", "mp3", "ogg", "oga"]);

export function buildMpcKitExport(kit: SampleKit, blobs: ReadonlyMap<string, Blob>): MpcKitExport {
  const assigned = [...kit.assignments].sort((left, right) => left.midiNote - right.midiNote);
  if (assigned.length === 0) throw new Error("This kit has no assigned samples.");

  const folderName = safeName(kit.name, "Kit");
  const programFileName = `${folderName}.xpm`;

  const usedStems = new Set<string>();
  const padsByMidi = new Map<
    number,
    {
      label: string;
      muteGroup: number;
      layers: { sampleName: string; minVelocity: number; maxVelocity: number }[];
    }
  >();
  const sampleFiles: MpcExportFile[] = [];

  for (const assignment of assigned) {
    const layers = velocityLayersForAssignment(assignment).map((layer) => {
      const sample = kit.samples.find((candidate) => candidate.id === layer.sampleId);
      const blob = sample ? blobs.get(sample.binaryKey) : undefined;
      if (!sample || !blob) {
        throw new Error(`A sample assigned to pad ${assignment.midiNote} is missing.`);
      }
      const extension = sample.fileName.split(".").at(-1)?.toLowerCase() ?? "";
      if (!EXPORTABLE_EXTENSIONS.has(extension)) {
        throw new Error(`This file type cannot be exported to MPC: ${sample.fileName}.`);
      }
      const stem = uniqueStem(safeName(stemOf(sample.fileName), "sample"), usedStems);
      const padded = String(assignment.midiNote).padStart(3, "0");
      const baseName = `${padded}-${stem}`;
      sampleFiles.push({ relativePath: `Samples/${baseName}.${extension}`, content: blob });
      return {
        sampleName: `Samples/${baseName}`,
        minVelocity: layer.minVelocity,
        maxVelocity: layer.maxVelocity,
      };
    });
    padsByMidi.set(assignment.midiNote, {
      label: assignment.label,
      muteGroup: assignment.chokeGroup ?? 0,
      layers,
    });
  }

  const xml = buildXpm(kit.name, padsByMidi);
  return {
    folderName,
    programFileName,
    files: [
      { relativePath: programFileName, content: new Blob([xml], { type: "application/xml" }) },
      ...sampleFiles,
    ],
  };
}

function stemOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function safeName(value: string, fallback: string): string {
  const safe = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return safe || fallback;
}

function uniqueStem(stem: string, used: Set<string>): string {
  let candidate = stem;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${stem}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildXpm(
  programName: string,
  padsByMidi: ReadonlyMap<
    number,
    {
      label: string;
      muteGroup: number;
      layers: { sampleName: string; minVelocity: number; maxVelocity: number }[];
    }
  >,
): string {
  const instruments: string[] = [];
  for (let number = 1; number <= 128; number += 1) {
    const midiNote = Math.min(127, MPC_BANK_A_MIDI[0] - 1 + number);
    instruments.push(instrumentXml(number, midiNote, padsByMidi.get(midiNote)));
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
    <ProgramName>${xmlEscape(programName)}</ProgramName>
    <Program_Polyphony>0</Program_Polyphony>
    <Instruments>
${instruments.join("\n")}
    </Instruments>
  </Program>
</MPCVObject>
`;
}

function instrumentXml(
  number: number,
  midiNote: number,
  pad:
    | {
        label: string;
        muteGroup: number;
        layers: { sampleName: string; minVelocity: number; maxVelocity: number }[];
      }
    | undefined,
): string {
  const layers = Array.from({ length: 4 }, (_, index) => {
    const layer = pad?.layers[index];
    return layer
      ? `        <Layer number="${index + 1}">
          <Active>True</Active>
          <VelStart>${velocityToMidi(layer.minVelocity)}</VelStart>
          <VelEnd>${velocityToMidi(layer.maxVelocity)}</VelEnd>
          <SampleName>${xmlEscape(layer.sampleName)}</SampleName>
        </Layer>`
      : emptyLayer(index + 1);
  }).join("\n");

  return `    <Instrument number="${number}">
      <Name>${pad ? xmlEscape(pad.label) : ""}</Name>
      <MidiNote>${midiNote}</MidiNote>
      <MuteGroup>${pad?.muteGroup ?? 0}</MuteGroup>
      <Layers>
${layers}
      </Layers>
    </Instrument>`;
}

function emptyLayer(number: number): string {
  return `        <Layer number="${number}"><Active>False</Active><SampleName></SampleName></Layer>`;
}

function velocityToMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value * 127)));
}
