/** Text cleanup shared by all extractors. Pure functions — unit tested. */

import type { NarratorChapter } from "../../domain/types";

/** Join words hyphenated across line breaks and collapse stray whitespace. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/(\w)-\n(\w)/g, "$1$2") // re-join hyphenation at line breaks
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/** Split cleaned text into paragraphs; single newlines inside a paragraph are unwrapped. */
export function paragraphsFromText(text: string): string[] {
  return cleanText(text)
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\n+/g, " ").trim())
    .filter((p) => p.length > 0);
}

const MD_HEADING = /^(#{1,3})\s+(.+)$/;

/** Build chapters from markdown-style headings; falls back to one chapter. */
export function chaptersFromText(text: string, fallbackTitle: string): NarratorChapter[] {
  const lines = cleanText(text).split("\n");
  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = MD_HEADING.exec(line.trim());
    if (heading) {
      current = { title: heading[2].trim(), body: [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { title: fallbackTitle, body: [] };
        sections.push(current);
      }
      current.body.push(line);
    }
  }

  const chapters = sections
    .map((s, i) => ({
      id: "ch-" + (i + 1),
      title: s.title,
      paragraphs: paragraphsFromText(s.body.join("\n")),
    }))
    .filter((c) => c.paragraphs.length > 0);

  return chapters.length > 0
    ? chapters
    : [{ id: "ch-1", title: fallbackTitle, paragraphs: paragraphsFromText(text) }];
}

/** Word count across chapters, for the library meta line. */
export function wordCount(chapters: NarratorChapter[]): number {
  let count = 0;
  for (const ch of chapters) {
    for (const p of ch.paragraphs) count += p.split(/\s+/).filter(Boolean).length;
  }
  return count;
}

/** "Document.PDF" -> "Document" — title fallback from a filename. */
export function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim() || name
  );
}
