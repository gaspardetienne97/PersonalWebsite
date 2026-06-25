import JSZip from "jszip";

const CONTAINER_PATH = "META-INF/container.xml";

export async function extractCompressedMusicXml(data: ArrayBuffer): Promise<string> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(data);
  } catch {
    throw new Error("Compressed MusicXML archive could not be opened.");
  }

  const container = archive.file(CONTAINER_PATH);
  const scorePath = container
    ? rootScorePath(await container.async("string"))
    : fallbackScorePath(archive);
  const score = archive.file(scorePath);
  if (!score) throw new Error("MXL container score file was not found.");
  return score.async("string");
}

function rootScorePath(containerXml: string): string {
  const document = new DOMParser().parseFromString(containerXml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("MXL container could not be parsed.");
  }

  const rootfile = document.getElementsByTagNameNS("*", "rootfile")[0];
  const path = rootfile?.getAttribute("full-path")?.trim();
  if (!path) throw new Error("MXL container does not declare a root score.");
  return validateArchivePath(path);
}

function fallbackScorePath(archive: JSZip): string {
  const path = Object.values(archive.files)
    .filter(
      (entry) =>
        !entry.dir &&
        !entry.name.toUpperCase().startsWith("META-INF/") &&
        /\.(musicxml|xml)$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()[0];
  if (!path) throw new Error("Compressed MusicXML archive does not contain a score.");
  return validateArchivePath(path);
}

function validateArchivePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error("MXL container references an unsafe score path.");
  }
  return normalized;
}
