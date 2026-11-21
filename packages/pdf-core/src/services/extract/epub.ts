/** EPUB extraction — unzip with JSZip, walk the OPF spine, read each
 * XHTML document's block text as one chapter. */

import { m } from "@repo/i18n/messages.js";
import { formatNumber } from "@repo/i18n/format";
import JSZip from "jszip";

import type { NarratorChapter } from "../../domain/types";
import { paragraphsFromText, titleFromFilename, wordCount } from "./normalize";
import { ExtractError, type ExtractedContent, type ExtractProgress } from "./types";

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote";

export async function extractEpub(
  file: File,
  progress: ExtractProgress,
): Promise<ExtractedContent> {
  progress("read");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  progress("extract");
  const parser = new DOMParser();

  const containerXml = await readEntry(zip, "META-INF/container.xml");
  if (!containerXml) throw new ExtractError(m.narrator_extract_epub_unreadable());
  const container = parser.parseFromString(containerXml, "application/xml");
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new ExtractError(m.narrator_extract_epub_unreadable());

  const opfXml = await readEntry(zip, opfPath);
  if (!opfXml) throw new ExtractError(m.narrator_extract_epub_unreadable());
  const opf = parser.parseFromString(opfXml, "application/xml");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const title =
    opf.querySelector("metadata > title, title")?.textContent?.trim() ||
    titleFromFilename(file.name);
  const author = opf.querySelector("metadata > creator, creator")?.textContent?.trim() || "EPUB";

  const hrefById = new Map<string, string>();
  for (const item of opf.querySelectorAll("manifest > item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) hrefById.set(id, href);
  }
  const spineHrefs = [...opf.querySelectorAll("spine > itemref")]
    .map((ref) => ref.getAttribute("idref"))
    .map((id) => (id ? hrefById.get(id) : undefined))
    .filter((href): href is string => Boolean(href));
  if (spineHrefs.length === 0) throw new ExtractError(m.narrator_extract_epub_unreadable());

  progress("clean");
  progress("chapters");
  const chapters: NarratorChapter[] = [];
  for (const href of spineHrefs) {
    const xhtml = await readEntry(zip, resolvePath(opfDir, href));
    if (!xhtml) continue;
    const docHtml = parser.parseFromString(xhtml, "text/html");

    const headingEl = docHtml.querySelector("h1, h2, h3");
    const heading = headingEl?.textContent?.trim();
    const blocks = [...docHtml.body.querySelectorAll(BLOCK_SELECTOR)]
      .filter((el) => el !== headingEl) // the chapter title is not body text
      .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((t) => t.length > 0);
    const text = blocks.length > 0 ? blocks.join("\n\n") : (docHtml.body.textContent ?? "");
    const paragraphs = paragraphsFromText(text);
    if (paragraphs.length === 0) continue;

    chapters.push({
      id: "ch-" + (chapters.length + 1),
      title:
        heading ||
        docHtml.title?.trim() ||
        m.narrator_extract_chapter({ number: chapters.length + 1 }),
      paragraphs,
    });
  }
  if (chapters.length === 0) throw new ExtractError(m.narrator_extract_epub_no_text());

  return {
    title,
    author,
    meta: m.narrator_extract_epub_meta({ words: formatNumber(wordCount(chapters)) }),
    chapters,
  };
}

async function readEntry(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path) ?? zip.file(decodeURIComponent(path));
  return entry ? entry.async("text") : null;
}

/** Resolve href relative to the OPF directory, handling "../" segments. */
function resolvePath(baseDir: string, href: string): string {
  const parts = (baseDir + href).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}
