/** Plain text / Markdown extraction. */

import { m } from "@repo/i18n/messages.js";
import { formatNumber } from "@repo/i18n/format";
import { chaptersFromText, cleanText, titleFromFilename, wordCount } from "./normalize";
import type { ExtractedContent, ExtractProgress } from "./types";

export async function extractTxt(file: File, progress: ExtractProgress): Promise<ExtractedContent> {
  progress("read");
  const text = await file.text();

  progress("extract");
  progress("clean");
  let title = titleFromFilename(file.name);
  // A markdown H1 on the first line names the document.
  const firstLine = cleanText(text).split("\n", 1)[0]?.trim() ?? "";
  const h1 = /^#\s+(.+)$/.exec(firstLine);
  if (h1) title = h1[1].trim();

  progress("chapters");
  const chapters = chaptersFromText(text, title);

  return {
    title,
    author: m.narrator_extract_txt_author(),
    meta: m.narrator_extract_txt_meta({ words: formatNumber(wordCount(chapters)) }),
    chapters,
  };
}
