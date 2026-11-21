/** Sample library — public-domain texts seeded on first load so the reader
 * has something to narrate before any uploads. */

import { m } from "@repo/i18n/messages.js";

import { fmtLong } from "./model";
import type { NarratorDoc } from "./types";

export const SAMPLE_DOCS: NarratorDoc[] = [
  {
    id: "time-machine",
    title: "The Time Machine",
    author: "H. G. Wells",
    kind: "epub",
    accent: "#1291FA",
    meta: "Novel · 1895",
    voice: "",
    chapters: [
      {
        id: "tm-1",
        title: "The Inventor",
        paragraphs: [
          "The Time Traveller, for so it will be convenient to speak of him, was expounding a recondite matter to us.",
          "His pale grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights lit the bubbles that flashed and passed in our glasses.",
          "Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere when thought runs gracefully free of the trammels of precision.",
        ],
      },
      {
        id: "tm-2",
        title: "The Argument",
        paragraphs: [
          "You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted.",
          "The geometry, for instance, they taught you at school is founded on a misconception. Clearly any real body must have extension in four directions: it must have Length, Breadth, Thickness, and Duration.",
          "There is no difference between Time and any of the three dimensions of Space except that our consciousness moves along it. Some philosophical people have been asking why three dimensions particularly, and why not another at right angles to the other three.",
        ],
      },
      {
        id: "tm-3",
        title: "The Machine",
        paragraphs: [
          "I am afraid I cannot convey the peculiar sensations of time travelling. They are excessively unpleasant.",
          "There is a feeling exactly like that one has upon a switchback, of a helpless headlong motion. I felt the same horrible anticipation, too, of an imminent smash.",
          "As I put on pace, night followed day like the flapping of a black wing. The dim suggestion of the laboratory seemed presently to fall away from me, and I saw the sun hopping swiftly across the sky, leaping it every minute.",
        ],
      },
    ],
  },
  {
    id: "self-hosting",
    title: "Notes on Self-Hosting Everything",
    author: "Gaspard Etienne",
    kind: "paste",
    accent: "#A21FB8",
    meta: "Article · pasted",
    voice: "",
    chapters: [
      {
        id: "sh-1",
        title: "Why bother",
        paragraphs: [
          "I run my own little corner of the internet, and people keep asking me why.",
          "The honest answer is that I like understanding the things I depend on. When my photos live on my own disks, behind my own login, I know exactly what happens to them.",
          "It is slower to set up and it breaks in interesting ways, but every outage teaches me something a managed service would have hidden.",
        ],
      },
      {
        id: "sh-2",
        title: "The stack",
        paragraphs: [
          "Everything sits behind a single sign-on layer, so one login opens the whole house.",
          "Media streaming, photo backup, document sync, and a small language model all share the same front door. The dashboard ties them together into something that almost feels like a product.",
          "None of it is finished. That is rather the point: a homelab is a garden, not a monument.",
        ],
      },
    ],
  },
  {
    id: "meditations",
    title: "Meditations, Book II",
    author: "Marcus Aurelius",
    kind: "txt",
    accent: "#FF0C0D",
    meta: "Philosophy · 170 AD",
    voice: "",
    chapters: [
      {
        id: "me-1",
        title: "At Dawn",
        paragraphs: [
          "Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial.",
          "All these things happen to them by reason of their ignorance of what is good and evil. But I have seen the nature of the good that it is beautiful, and of the bad that it is ugly.",
          "I can neither be injured by any of them, for no one can fix on me what is ugly, nor can I be angry with my kinsman, nor hate him.",
        ],
      },
      {
        id: "me-2",
        title: "On Time",
        paragraphs: [
          "Do every act of thy life as if it were the last, laying aside all carelessness and passionate aversion from the commands of reason.",
          "Remember how long thou hast been putting off these things, and how often thou hast received an opportunity from the gods, and yet dost not use it.",
          "Thou must now at last perceive of what universe thou art a part, and of what administrator of the universe thy existence is an efflux.",
        ],
      },
    ],
  },
  {
    id: "ddia",
    title: "Designing Data-Intensive Apps — Ch. 1",
    author: "M. Kleppmann",
    kind: "pdf",
    accent: "#22C55E",
    meta: "Technical · PDF, OCR",
    voice: "",
    chapters: [
      {
        id: "dd-1",
        title: "Reliable, Scalable, Maintainable",
        paragraphs: [
          "Many applications today are data-intensive, as opposed to compute-intensive. Raw CPU power is rarely a limiting factor for these applications.",
          "Bigger problems are usually the amount of data, the complexity of data, and the speed at which it is changing.",
          "A data-intensive application is typically built from standard building blocks that provide commonly needed functionality: databases, caches, search indexes, stream processing, and batch processing.",
        ],
      },
    ],
  },
];

// By id, so a sample saved in a listener's library still follows the interface language.
const SAMPLE_KINDS: Record<string, () => string> = {
  "time-machine": () => m.narrator_sample_novel(),
  "self-hosting": () => m.narrator_sample_article(),
  meditations: () => m.narrator_sample_philosophy(),
  ddia: () => m.narrator_sample_technical(),
};

/** A sample that ships with Narrator, as opposed to a document the listener added. */
export function isSample(doc: NarratorDoc): boolean {
  return doc.id in SAMPLE_KINDS;
}

/** A sample's genre ("Novel"). A listener's own document has none. */
export function sampleGenre(doc: NarratorDoc): string | undefined {
  return SAMPLE_KINDS[doc.id]?.();
}

/** The short kind shown in the reader: "Novel", "PDF", "Plain text". */
export function kindLabel(doc: NarratorDoc): string {
  return sampleGenre(doc) ?? doc.meta.split(" · ")[0];
}

/** The format a document came in, one word. The same word on the cover and under the card. */
export function formatLabel(doc: NarratorDoc): string {
  if (doc.kind === "pdf") return "PDF";
  if (doc.kind === "epub") return "EPUB";
  return doc.kind === "txt" ? m.narrator_kind_text() : m.narrator_kind_pasted();
}

/**
 * Who wrote it, when the document says. A text file and pasted text name no author, and a PDF
 * or EPUB without one is given its format's name by the extractor. The card shows the format
 * already, so those count as no author.
 */
export function authorName(doc: NarratorDoc): string {
  if (isSample(doc)) return doc.author;
  const named =
    (doc.kind === "pdf" || doc.kind === "epub") && doc.author !== "PDF" && doc.author !== "EPUB";
  return named ? doc.author : "";
}

/** The line under a card's title: the author, with a sample's genre. Empty when the document names no author. */
export function byline(doc: NarratorDoc): string {
  const author = authorName(doc);
  const genre = sampleGenre(doc);
  return author && genre ? `${author} · ${genre}` : author;
}

/** Whether a search finds a document: in its title or in the line under it, whatever the case. */
export function matchesQuery(doc: NarratorDoc, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || [doc.title, byline(doc)].some((text) => text.toLowerCase().includes(q));
}

/** `text` cut around each place the search appears, so a card can mark the letters that matched. */
export function markMatches(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  // ponytail: lower-casing changes the length of a few letters (the Turkish İ), which would
  // shift the marks by one. Search with Intl.Collator if a library ever holds such titles.
  const lower = text.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: text.slice(i, i + q.length), hit: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

/**
 * How long a document is, said once: the whole length before it is started ("4 min"), what is
 * left of it after ("1 min left of 4 min"). Just started, both round to the same minutes, and
 * the whole length alone says it.
 */
export function lengthLine(total: number, progress: number): string {
  const whole = fmtLong(total);
  const left = fmtLong(total * (1 - progress));
  return progress > 0 && left !== whole
    ? m.narrator_library_left_of({ left, total: whole })
    : whole;
}
