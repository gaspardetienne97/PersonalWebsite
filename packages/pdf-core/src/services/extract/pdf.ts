/** PDF text extraction via pdf.js.
 *
 * Text is reconstructed page by page from positioned glyph runs (sorted
 * top-to-bottom, left-to-right; line gaps become paragraph breaks). Chapters
 * come from the PDF outline when present, otherwise pages are grouped.
 */

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type { NarratorChapter } from "../../domain/types";
import { paragraphsFromText, titleFromFilename } from "./normalize";
import type { ExtractedContent, ExtractProgress } from "./types";

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

const PAGES_PER_FALLBACK_CHAPTER = 8;

export async function extractPdf(file: File, progress: ExtractProgress): Promise<ExtractedContent> {
  progress("read");
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;

  progress("extract");
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(reconstructPage(content.items.filter(isTextItem)));
  }

  progress("clean");
  const info = await readInfo(doc);
  const title = info.title || titleFromFilename(file.name);
  const author = info.author || "PDF";

  progress("chapters");
  const ranges = (await outlineRanges(doc)) ?? fallbackRanges(doc.numPages);
  const chapters: NarratorChapter[] = [];
  for (const [index, range] of ranges.entries()) {
    const text = pageTexts.slice(range.from - 1, range.to).join("\n\n");
    const paragraphs = paragraphsFromText(text);
    if (paragraphs.length === 0) continue;
    chapters.push({ id: "ch-" + (index + 1), title: range.title, paragraphs });
  }
  if (chapters.length === 0) {
    throw new Error("No readable text found in this PDF — it may be a scan without a text layer.");
  }

  return {
    title,
    author,
    meta: `PDF · ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}`,
    chapters,
  };
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

/** Sort glyph runs into reading order and rebuild line/paragraph structure. */
function reconstructPage(items: TextItem[]): string {
  const runs = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      text: item.str,
      x: item.transform[4] as number,
      y: item.transform[5] as number,
      width: item.width || 0,
      height: Math.abs(item.transform[0] as number) || 10,
    }))
    .sort((a, b) => {
      const yDiff = b.y - a.y; // PDF y grows upward; read top-down
      if (Math.abs(yDiff) > 4) return yDiff > 0 ? -1 : 1;
      return a.x - b.x;
    });

  let text = "";
  let lastY: number | null = null;
  let lastEndX = 0;
  for (const run of runs) {
    if (lastY !== null) {
      const drop = lastY - run.y;
      if (drop > run.height * 1.8) {
        text += "\n\n"; // large vertical gap -> paragraph break
      } else if (drop > 4) {
        text += "\n"; // normal line break
      } else if (run.x - lastEndX > 1) {
        text += " ";
      }
    }
    text += run.text;
    lastY = run.y;
    lastEndX = run.x + run.width;
  }
  return text;
}

interface PageRange {
  title: string;
  from: number;
  to: number;
}

async function outlineRanges(doc: PDFDocumentProxy): Promise<PageRange[] | null> {
  try {
    const outline = await doc.getOutline();
    if (!outline || outline.length < 2) return null;

    const starts: { title: string; page: number }[] = [];
    for (const item of outline) {
      if (!item.dest) continue;
      const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
      if (!dest || typeof dest[0] !== "object") continue;
      const page = (await doc.getPageIndex(dest[0])) + 1;
      starts.push({ title: item.title || `Section ${starts.length + 1}`, page });
    }
    if (starts.length < 2) return null;

    starts.sort((a, b) => a.page - b.page);
    const ranges: PageRange[] = starts.map((s, i) => ({
      title: s.title,
      from: s.page,
      to: i + 1 < starts.length ? Math.max(s.page, starts[i + 1].page - 1) : doc.numPages,
    }));
    // Front matter before the first outline entry.
    if (ranges[0].from > 1) {
      ranges.unshift({ title: "Front matter", from: 1, to: ranges[0].from - 1 });
    }
    return ranges;
  } catch {
    return null;
  }
}

function fallbackRanges(numPages: number): PageRange[] {
  if (numPages <= PAGES_PER_FALLBACK_CHAPTER) {
    return [{ title: "Document", from: 1, to: numPages }];
  }
  const ranges: PageRange[] = [];
  for (let from = 1; from <= numPages; from += PAGES_PER_FALLBACK_CHAPTER) {
    const to = Math.min(from + PAGES_PER_FALLBACK_CHAPTER - 1, numPages);
    ranges.push({ title: `Pages ${from}–${to}`, from, to });
  }
  return ranges;
}

async function readInfo(doc: PDFDocumentProxy): Promise<{ title?: string; author?: string }> {
  try {
    const { info } = await doc.getMetadata();
    const record = info as Record<string, unknown>;
    return {
      title:
        typeof record.Title === "string" && record.Title.trim() ? record.Title.trim() : undefined,
      author:
        typeof record.Author === "string" && record.Author.trim()
          ? record.Author.trim()
          : undefined,
    };
  } catch {
    return {};
  }
}
