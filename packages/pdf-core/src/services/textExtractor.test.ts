import { describe, it, expect } from "vite-plus/test";
import type { PdfTextItem, PdfSentence } from "./types";

// Mock text items for testing
function createMockTextItem(text: string, x: number, y: number): PdfTextItem {
  return {
    text,
    x,
    y,
    width: text.length * 10,
    height: 12,
    fontName: "Arial",
    fontSize: 12,
    transform: [12, 0, 0, 12, x, y],
  };
}

describe("Text Extraction", () => {
  it("should create text items with correct properties", () => {
    const item = createMockTextItem("Hello", 10, 20);

    expect(item.text).toBe("Hello");
    expect(item.x).toBe(10);
    expect(item.y).toBe(20);
    expect(item.fontSize).toBe(12);
  });

  it("should handle sentence extraction", () => {
    const text = "This is sentence one. This is sentence two!";
    const sentences: PdfSentence[] = [];

    const sentenceRegex = /[^.!?]*[.!?]+\s*/g;
    let match: RegExpExecArray | null;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentenceText = match[0].trim();
      if (sentenceText.length > 3) {
        sentences.push({
          id: `test-${sentences.length}`,
          text: sentenceText,
          pageNumber: 1,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          items: [],
        });
      }
    }

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe("This is sentence one.");
    expect(sentences[1].text).toBe("This is sentence two!");
  });

  it("should clean text properly", () => {
    const cleanText = (text: string) => {
      return text.replace(/\s+/g, " ").replace(/- \n/g, "").replace(/\n+/g, "\n").trim();
    };

    const dirtyText = "Hello    world\n\n\nTest";
    const cleaned = cleanText(dirtyText);

    // The function normalizes all whitespace including newlines to single spaces
    expect(cleaned).toBe("Hello world Test");
  });
});
