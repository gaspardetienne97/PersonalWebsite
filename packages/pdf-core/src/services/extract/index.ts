/** File → NarratorDoc extraction entry point. */

import { m } from "@repo/i18n/messages.js";
import { formatNumber } from "@repo/i18n/format";
import type { DocKind, NarratorDoc } from "../../domain/types";
import { extractEpub } from "./epub";
import { paragraphsFromText, wordCount } from "./normalize";
import { extractPdf } from "./pdf";
import { extractTxt } from "./txt";
import { ExtractError, type ExtractedContent, type ExtractProgress, type ExtractStage } from "./types";

export type { ExtractedContent, ExtractProgress, ExtractStage };
export {
  chaptersFromText,
  cleanText,
  paragraphsFromText,
  titleFromFilename,
  wordCount,
} from "./normalize";

const ACCENTS = ["#1291FA", "#A21FB8", "#FF0C0D", "#22C55E", "#F59E0B"];

export function kindForFile(file: File): DocKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".epub") || file.type === "application/epub+zip") return "epub";
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) return "txt";
  if (file.type.startsWith("text/")) return "txt";
  return null;
}

export const ACCEPT_BY_KIND: Record<Exclude<DocKind, "paste">, string> = {
  pdf: ".pdf,application/pdf",
  epub: ".epub,application/epub+zip",
  txt: ".txt,.md,.markdown,text/plain,text/markdown",
};

const UNREADABLE: Record<Exclude<DocKind, "paste">, () => string> = {
  pdf: () => m.narrator_extract_pdf_unreadable(),
  epub: () => m.narrator_extract_epub_unreadable(),
  txt: () => m.narrator_add_read_failed(),
};

/** Parse an uploaded file into a ready-to-narrate document. */
export async function extractFile(
  file: File,
  voice: string,
  progress: ExtractProgress,
): Promise<NarratorDoc> {
  const kind = kindForFile(file);
  if (!kind) {
    throw new ExtractError(m.narrator_extract_unsupported({ name: file.name }));
  }

  const extractor = kind === "pdf" ? extractPdf : kind === "epub" ? extractEpub : extractTxt;
  const content = await extractor(file, progress).catch((e: unknown) => {
    // What pdf.js, JSZip or the parser throw is written for developers ("Invalid PDF
    // structure."). The listener gets what happened and what to do next instead.
    throw e instanceof ExtractError ? e : new ExtractError(UNREADABLE[kind]());
  });

  progress("narration");
  return toDoc(content, kind, voice);
}

/** Build a document from pasted text. */
export function extractPaste(text: string, voice: string): NarratorDoc | null {
  const paragraphs = paragraphsFromText(text);
  if (paragraphs.length === 0) return null;
  const title =
    paragraphs[0].split(/[.!?]/)[0].slice(0, 48).trim() || m.narrator_extract_pasted_text();
  const chapters = [{ id: "ch-1", title: m.narrator_extract_pasted_text(), paragraphs }];
  return toDoc(
    {
      title,
      author: m.narrator_extract_pasted_text(),
      meta: m.narrator_extract_paste_meta({ words: formatNumber(wordCount(chapters)) }),
      chapters,
    },
    "paste",
    voice,
  );
}

function toDoc(content: ExtractedContent, kind: DocKind, voice: string): NarratorDoc {
  return {
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: content.title,
    author: content.author,
    kind,
    accent: accentFor(content.title),
    meta: content.meta,
    voice,
    chapters: content.chapters,
  };
}

function accentFor(title: string): string {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}
