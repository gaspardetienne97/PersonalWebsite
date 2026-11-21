#!/usr/bin/env node
// Fixture documents for the Narrator captures, written to .ui-climb-site/fixtures/ (git-ignored):
// a small PDF with an outline, an EPUB with three chapters, a Markdown text file, and the broken
// files the error states need. Public-domain excerpts, plain ASCII. The capture specs call
// `ensureFixtures()` themselves; run this file to rebuild them by hand:
//   node scripts/ui-climb/fixtures.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PROJECTS, ROOT } from "./projects.mjs";

export const FIXTURES = join(ROOT, PROJECTS.narrator.work, "fixtures");
export const FILES = {
  pdf: join(FIXTURES, "walden.pdf"),
  epub: join(FIXTURES, "alice-in-wonderland.epub"),
  txt: join(FIXTURES, "the-tell-tale-heart.md"),
  /** Not a PDF at all: pdf.js rejects it. */
  brokenPdf: join(FIXTURES, "quarterly-report.pdf"),
  /** A valid PDF with no text layer, like a scan. */
  scannedPdf: join(FIXTURES, "scanned-letter.pdf"),
  /** A zip with no EPUB container inside. */
  brokenEpub: join(FIXTURES, "novel-draft.epub"),
  /** A kind Narrator does not read. */
  unsupported: join(FIXTURES, "meeting-notes.docx"),
};

const WALDEN = [
  {
    title: "Economy",
    paragraphs: [
      "When I wrote the following pages, or rather the bulk of them, I lived alone, in the woods, a mile from any neighbor, in a house which I had built myself, on the shore of Walden Pond, in Concord, Massachusetts, and earned my living by the labor of my hands only. I lived there two years and two months. At present I am a sojourner in civilized life again.",
      "I should not obtrude my affairs so much on the notice of my readers if very particular inquiries had not been made by my townsmen concerning my mode of life, which some would call impertinent, though they do not appear to me at all impertinent, but, considering the circumstances, very natural and pertinent. Some have asked what I got to eat; if I did not feel lonesome; if I was not afraid; and the like.",
      "The mass of men lead lives of quiet desperation. What is called resignation is confirmed desperation. From the desperate city you go into the desperate country, and have to console yourself with the bravery of minks and muskrats. A stereotyped but unconscious despair is concealed even under what are called the games and amusements of mankind. There is no play in them, for this comes after work. But it is a characteristic of wisdom not to do desperate things.",
    ],
  },
  {
    title: "Where I Lived, and What I Lived For",
    paragraphs: [
      "I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary. I wanted to live deep and suck out all the marrow of life, to live so sturdily and Spartan-like as to put to rout all that was not life, to cut a broad swath and shave close, to drive life into a corner, and reduce it to its lowest terms.",
      "Our life is frittered away by detail. An honest man has hardly need to count more than his ten fingers, or in extreme cases he may add his ten toes, and lump the rest. Simplicity, simplicity, simplicity! I say, let your affairs be as two or three, and not a hundred or a thousand; instead of a million count half a dozen, and keep your accounts on your thumb-nail.",
      "Time is but the stream I go a-fishing in. I drink at it; but while I drink I see the sandy bottom and detect how shallow it is. Its thin current slides away, but eternity remains. I would drink deeper; fish in the sky, whose bottom is pebbly with stars.",
    ],
  },
  {
    title: "Reading",
    paragraphs: [
      "With a little more deliberation in the choice of their pursuits, all men would perhaps become essentially students and observers, for certainly their nature and destiny are interesting to all alike. In accumulating property for ourselves or our posterity, in founding a family or a state, or acquiring fame even, we are mortal; but in dealing with truth we are immortal, and need fear no change nor accident.",
      "To read well, that is, to read true books in a true spirit, is a noble exercise, and one that will task the reader more than any exercise which the customs of the day esteem. It requires a training such as the athletes underwent, the steady intention almost of the whole life to this object. Books must be read as deliberately and reservedly as they were written.",
      "How many a man has dated a new era in his life from the reading of a book. The book exists for us perchance which will explain our miracles and reveal new ones.",
    ],
  },
];

const ALICE = [
  {
    title: "Down the Rabbit-Hole",
    paragraphs: [
      "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice, 'without pictures or conversations?'",
      "So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.",
      "There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!' But when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.",
      "In another moment down went Alice after it, never once considering how in the world she was to get out again.",
    ],
  },
  {
    title: "The Pool of Tears",
    paragraphs: [
      "'Curiouser and curiouser!' cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English); 'now I'm opening out like the largest telescope that ever was! Good-bye, feet!' (for when she looked down at her feet, they seemed to be almost out of sight, they were getting so far off).",
      "'Oh, my poor little feet, I wonder who will put on your shoes and stockings for you now, dears? I'm sure I shan't be able! I shall be a great deal too far off to trouble myself about you: you must manage the best way you can.'",
      "Just then her head struck against the roof of the hall: in fact she was now more than nine feet high, and she at once took up the little golden key and hurried off to the garden door.",
    ],
  },
  {
    title: "A Caucus-Race and a Long Tale",
    paragraphs: [
      "They were indeed a queer-looking party that assembled on the bank, the birds with draggled feathers, the animals with their fur clinging close to them, and all dripping wet, cross, and uncomfortable.",
      "The first question of course was, how to get dry again: they had a consultation about this, and after a few minutes it seemed quite natural to Alice to find herself talking familiarly with them, as if she had known them all her life.",
      "'What I was going to say,' said the Dodo in an offended tone, 'was, that the best thing to get us dry would be a Caucus-race.'",
      "'What is a Caucus-race?' said Alice; not that she wanted much to know, but the Dodo had paused as if it thought that somebody ought to speak, and no one else seemed inclined to say anything.",
    ],
  },
];

const TELL_TALE = `# The Tell-Tale Heart

True! Nervous, very, very dreadfully nervous I had been and am; but why will you say that I am mad? The disease had sharpened my senses, not destroyed, not dulled them. Above all was the sense of hearing acute. I heard all things in the heaven and in the earth. I heard many things in hell. How, then, am I mad? Hearken! and observe how healthily, how calmly I can tell you the whole story.

## The Idea

It is impossible to say how first the idea entered my brain; but once conceived, it haunted me day and night. Object there was none. Passion there was none. I loved the old man. He had never wronged me. He had never given me insult. For his gold I had no desire. I think it was his eye! Yes, it was this! He had the eye of a vulture, a pale blue eye, with a film over it.

Whenever it fell upon me, my blood ran cold; and so by degrees, very gradually, I made up my mind to take the life of the old man, and thus rid myself of the eye forever.

## The Eighth Night

Upon the eighth night I was more than usually cautious in opening the door. A watch's minute hand moves more quickly than did mine. Never before that night had I felt the extent of my own powers, of my sagacity. I could scarcely contain my feelings of triumph.

To think that there I was, opening the door, little by little, and he not even to dream of my secret deeds or thoughts. I fairly chuckled at the idea; and perhaps he heard me; for he moved on the bed suddenly, as if startled.
`;

// ---- PDF (hand-written: Helvetica text, one outline entry per chapter) ----

const pdfString = (s) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;

function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** One page per chapter: the chapter title, then its paragraphs with a clear gap between them. */
function pageStream(chapter) {
  const out = ["BT", "/F1 18 Tf", "72 720 Td", `${pdfString(chapter.title)} Tj`, "/F1 12 Tf"];
  let drop = 40;
  for (const para of chapter.paragraphs) {
    for (const line of wrap(para, 84)) {
      out.push(`0 -${drop} Td`, `${pdfString(line)} Tj`);
      drop = 16;
    }
    drop = 34;
  }
  out.push("ET");
  return out.join("\n");
}

function buildPdf({ title, author, chapters, textless = false }) {
  const objects = []; // 1-based object bodies
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add("");
  const pages = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const chapter of chapters) {
    const stream = textless
      ? "0.92 g 72 300 468 420 re f" // a grey block where a scanned page image would be
      : pageStream(chapter);
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[pages - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let outlines = "";
  if (!textless && chapters.length > 1) {
    const root = objects.length + 1;
    const first = root + 1;
    add("");
    chapters.forEach((chapter, i) => {
      const id = first + i;
      add(
        `<< /Title ${pdfString(chapter.title)} /Parent ${root} 0 R /Dest [${pageIds[i]} 0 R /Fit]` +
          (i > 0 ? ` /Prev ${id - 1} 0 R` : "") +
          (i < chapters.length - 1 ? ` /Next ${id + 1} 0 R` : "") +
          " >>",
      );
    });
    objects[root - 1] =
      `<< /Type /Outlines /First ${first} 0 R /Last ${first + chapters.length - 1} 0 R /Count ${chapters.length} >>`;
    outlines = ` /Outlines ${root} 0 R`;
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R${outlines} >>`;
  const info = add(`<< /Title ${pdfString(title)} /Author ${pdfString(author)} >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ---- EPUB ----

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function buildEpub({ title, author, chapters }) {
  // jszip belongs to pdf-core, so resolve it from there.
  const require = createRequire(join(ROOT, "packages/pdf-core/package.json"));
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const ids = chapters.map((_, i) => `ch${i + 1}`);
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">ui-climb-fixture</dc:identifier><dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator><dc:language>en</dc:language></metadata><manifest>${ids
      .map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
      .join(
        "",
      )}</manifest><spine>${ids.map((id) => `<itemref idref="${id}"/>`).join("")}</spine></package>`,
  );
  chapters.forEach((chapter, i) =>
    zip.file(
      `OEBPS/${ids[i]}.xhtml`,
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xml(chapter.title)}</title></head><body><h2>${xml(chapter.title)}</h2>${chapter.paragraphs
        .map((p) => `<p>${xml(p)}</p>`)
        .join("")}</body></html>`,
    ),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildBrokenEpub() {
  const require = createRequire(join(ROOT, "packages/pdf-core/package.json"));
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("draft.txt", "This zip holds a text file and nothing an EPUB reader can open.");
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Write the fixtures once (or again with `force`). */
export async function ensureFixtures(force = false) {
  if (!force && Object.values(FILES).every((f) => existsSync(f))) return FILES;
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(
    FILES.pdf,
    buildPdf({ title: "Walden", author: "Henry David Thoreau", chapters: WALDEN }),
  );
  writeFileSync(
    FILES.epub,
    await buildEpub({
      title: "Alice's Adventures in Wonderland",
      author: "Lewis Carroll",
      chapters: ALICE,
    }),
  );
  writeFileSync(FILES.txt, TELL_TALE);
  writeFileSync(FILES.brokenPdf, "This file was renamed to .pdf by mistake. It is plain text.\n");
  writeFileSync(
    FILES.scannedPdf,
    buildPdf({ title: "Scanned letter", author: "", chapters: [{}, {}], textless: true }),
  );
  writeFileSync(FILES.brokenEpub, await buildBrokenEpub());
  writeFileSync(FILES.unsupported, "PK fixture: a word-processor file Narrator cannot read.\n");
  return FILES;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await ensureFixtures(true);
  console.log(`fixtures in ${FIXTURES}`);
}
