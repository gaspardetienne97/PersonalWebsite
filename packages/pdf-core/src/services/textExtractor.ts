import type { PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import type { PdfTextContent, PdfTextItem, PdfSentence, PdfParagraph } from "./types";

export async function extractTextFromPage(
  page: PDFPageProxy,
  pageNumber: number,
): Promise<PdfTextContent> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });

  const items: PdfTextItem[] = textContent.items
    .filter((item): item is TextItem => "str" in item && item.str.trim().length > 0)
    .map((item) => {
      const tx = item.transform;
      return {
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5], // Flip Y coordinate
        width: item.width || 0,
        height: item.height || Math.abs(tx[0]),
        fontName: item.fontName || "",
        fontSize: Math.abs(tx[0]),
        transform: tx,
      };
    });

  const fullText = reconstructText(items);
  const sentences = extractSentences(fullText, items, pageNumber);
  const paragraphs = groupIntoParagraphs(sentences, pageNumber);

  return {
    pageNumber,
    items,
    fullText,
    sentences,
    paragraphs,
  };
}

function reconstructText(items: PdfTextItem[]): string {
  if (items.length === 0) return "";

  // Sort items by Y position (top to bottom), then X (left to right)
  const sortedItems = [...items].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 5) return yDiff; // Different lines
    return a.x - b.x; // Same line, sort by X
  });

  let text = "";
  let lastY = sortedItems[0]?.y || 0;
  let lastEndX = 0;

  for (const item of sortedItems) {
    const yDiff = Math.abs(item.y - lastY);

    if (yDiff > 15) {
      // New line
      text += "\n";
      lastEndX = 0;
    } else if (item.x - lastEndX > 10) {
      // Gap between words
      text += " ";
    }

    text += item.text;
    lastY = item.y;
    lastEndX = item.x + item.width;
  }

  return cleanText(text);
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/- \n/g, "") // Join hyphenated words
    .replace(/\n+/g, "\n") // Normalize line breaks
    .trim();
}

function extractSentences(
  fullText: string,
  items: PdfTextItem[],
  pageNumber: number,
): PdfSentence[] {
  // Split text into sentences using regex
  const sentenceRegex = /[^.!?]*[.!?]+\s*/g;
  const sentences: PdfSentence[] = [];

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = sentenceRegex.exec(fullText)) !== null) {
    const text = match[0].trim();
    if (text.length < 3) continue; // Skip very short matches

    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    // Find corresponding text items for highlighting
    const sentenceItems = findItemsForRange(items, startIndex, endIndex, fullText);

    sentences.push({
      id: `${pageNumber}-${index}`,
      text,
      pageNumber,
      startIndex,
      endIndex,
      items: sentenceItems,
    });

    index++;
  }

  // Handle remaining text without sentence-ending punctuation
  const lastEndIndex = sentences.length > 0 ? sentences[sentences.length - 1].endIndex : 0;

  if (lastEndIndex < fullText.length) {
    const remainingText = fullText.slice(lastEndIndex).trim();
    if (remainingText.length > 0) {
      sentences.push({
        id: `${pageNumber}-${index}`,
        text: remainingText,
        pageNumber,
        startIndex: lastEndIndex,
        endIndex: fullText.length,
        items: findItemsForRange(items, lastEndIndex, fullText.length, fullText),
      });
    }
  }

  return sentences;
}

function findItemsForRange(
  items: PdfTextItem[],
  startIndex: number,
  endIndex: number,
  _fullText: string,
): PdfTextItem[] {
  const matchingItems: PdfTextItem[] = [];

  let currentIndex = 0;
  for (const item of items) {
    const itemEndIndex = currentIndex + item.text.length;

    if (currentIndex < endIndex && itemEndIndex > startIndex) {
      matchingItems.push(item);
    }

    currentIndex = itemEndIndex + 1; // +1 for space
  }

  return matchingItems;
}

function groupIntoParagraphs(sentences: PdfSentence[], pageNumber: number): PdfParagraph[] {
  const paragraphs: PdfParagraph[] = [];
  let currentParagraph: PdfSentence[] = [];

  for (let i = 0; i < sentences.length; i++) {
    currentParagraph.push(sentences[i]);

    // Check if this looks like end of paragraph
    const text = sentences[i].text;
    const isEndOfParagraph =
      text.endsWith("\n\n") ||
      (i < sentences.length - 1 && sentences[i + 1].startIndex - sentences[i].endIndex > 50);

    if (isEndOfParagraph || i === sentences.length - 1) {
      paragraphs.push({
        id: `para-${pageNumber}-${paragraphs.length}`,
        sentences: currentParagraph,
        pageNumber,
      });
      currentParagraph = [];
    }
  }

  return paragraphs;
}

export async function extractAllText(
  document: any,
  progressCallback?: (page: number, total: number) => void,
): Promise<Map<number, PdfTextContent>> {
  const textMap = new Map<number, PdfTextContent>();

  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const textContent = await extractTextFromPage(page, i);
    textMap.set(i, textContent);

    progressCallback?.(i, document.numPages);
  }

  return textMap;
}
