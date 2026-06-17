import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { extractFile, extractPaste, kindForFile } from "./index";

const noProgress = () => {};

describe("kindForFile", () => {
  it("detects kinds by extension", () => {
    expect(kindForFile(new File([""], "a.pdf"))).toBe("pdf");
    expect(kindForFile(new File([""], "a.epub"))).toBe("epub");
    expect(kindForFile(new File([""], "a.md"))).toBe("txt");
    expect(kindForFile(new File([""], "a.docx"))).toBe(null);
  });
});

describe("extractFile — text", () => {
  it("builds a narratable doc from a markdown file", async () => {
    const file = new File(
      ["# The Title\n\nIntro paragraph.\n\n## Part One\n\nBody text here. More of it."],
      "the-title.md",
      { type: "text/markdown" },
    );
    const stages: string[] = [];
    const doc = await extractFile(file, "Test Voice", (s) => stages.push(s));

    expect(doc.title).toBe("The Title");
    expect(doc.kind).toBe("txt");
    expect(doc.voice).toBe("Test Voice");
    expect(doc.chapters.map((c) => c.title)).toEqual(["The Title", "Part One"]);
    expect(stages).toEqual(["read", "extract", "clean", "chapters", "narration"]);
  });

  it("rejects unsupported files", async () => {
    await expect(extractFile(new File([""], "a.docx"), "v", noProgress)).rejects.toThrow(
      /Unsupported file type/,
    );
  });
});

describe("extractFile — epub", () => {
  it("walks the spine and extracts chapters", async () => {
    const zip = new JSZip();
    zip.file("META-INF/container.xml", containerXml("OEBPS/content.opf"));
    zip.file(
      "OEBPS/content.opf",
      opfXml({
        title: "Test Book",
        creator: "Test Author",
        items: [
          { id: "c1", href: "ch1.xhtml" },
          { id: "c2", href: "ch2.xhtml" },
        ],
      }),
    );
    zip.file("OEBPS/ch1.xhtml", xhtml("Letter I", ["First paragraph.", "Second paragraph."]));
    zip.file("OEBPS/ch2.xhtml", xhtml("Letter II", ["Third paragraph."]));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "test-book.epub", { type: "application/epub+zip" });

    const doc = await extractFile(file, "v", noProgress);

    expect(doc.title).toBe("Test Book");
    expect(doc.author).toBe("Test Author");
    expect(doc.chapters.map((c) => c.title)).toEqual(["Letter I", "Letter II"]);
    expect(doc.chapters[0].paragraphs).toEqual(["First paragraph.", "Second paragraph."]);
  });
});

describe("extractPaste", () => {
  it("titles the doc from the first sentence", () => {
    const doc = extractPaste("Hello there world. The rest of it.\n\nNext para.", "v");
    expect(doc?.title).toBe("Hello there world");
    expect(doc?.chapters[0].paragraphs).toHaveLength(2);
  });

  it("returns null for empty input", () => {
    expect(extractPaste("   \n  ", "v")).toBeNull();
  });
});

function containerXml(opfPath: string): string {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

function opfXml(opts: {
  title: string;
  creator: string;
  items: { id: string; href: string }[];
}): string {
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${opts.title}</dc:title>
    <dc:creator>${opts.creator}</dc:creator>
  </metadata>
  <manifest>
    ${opts.items.map((i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`).join("\n    ")}
  </manifest>
  <spine>
    ${opts.items.map((i) => `<itemref idref="${i.id}"/>`).join("\n    ")}
  </spine>
</package>`;
}

function xhtml(heading: string, paragraphs: string[]): string {
  return `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${heading}</title></head>
<body><h2>${heading}</h2>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</body></html>`;
}
