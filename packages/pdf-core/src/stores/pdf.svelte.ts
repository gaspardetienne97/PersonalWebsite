import { loadPdfFromFile } from "../services/loader";
import { extractTextFromPage, extractAllText } from "../services/textExtractor";
import type { PdfDocument, PdfTextContent } from "../services/types";

class PdfStore {
  document = $state<PdfDocument | null>(null);
  currentPage = $state(1);
  scale = $state(1.5);
  rotation = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);
  textContent = $state(new Map<number, PdfTextContent>());
  isTextExtracting = $state(false);
  textExtractionProgress = $state(0);

  async loadFromFile(file: File) {
    this.isLoading = true;
    this.error = null;

    try {
      const doc = await loadPdfFromFile(file);

      this.document = doc;
      this.currentPage = 1;
      this.isLoading = false;
      this.textContent = new Map();

      // Start text extraction in background
      void this.extractAllText();
    } catch (err) {
      this.isLoading = false;
      this.error = err instanceof Error ? err.message : "Failed to load PDF";
    }
  }

  async extractAllText() {
    if (!this.document) return;

    this.isTextExtracting = true;
    this.textExtractionProgress = 0;

    try {
      const textMap = await extractAllText(this.document.document, (page, total) => {
        this.textExtractionProgress = Math.round((page / total) * 100);
      });

      this.textContent = textMap;
      this.isTextExtracting = false;
      this.textExtractionProgress = 100;
    } catch {
      this.isTextExtracting = false;
      this.error = "Failed to extract text";
    }
  }

  async getPageText(pageNumber: number): Promise<PdfTextContent | null> {
    if (this.textContent.has(pageNumber)) {
      return this.textContent.get(pageNumber)!;
    }

    if (!this.document) return null;

    try {
      const page = await this.document.document.getPage(pageNumber);
      const textContent = await extractTextFromPage(page, pageNumber);

      const newMap = new Map(this.textContent);
      newMap.set(pageNumber, textContent);
      this.textContent = newMap;

      return textContent;
    } catch {
      return null;
    }
  }

  goToPage(pageNumber: number) {
    if (!this.document) return;

    this.currentPage = Math.max(1, Math.min(pageNumber, this.document.numPages));
  }

  nextPage() {
    if (!this.document) return;
    if (this.currentPage >= this.document.numPages) return;

    this.currentPage++;
  }

  previousPage() {
    if (this.currentPage <= 1) return;

    this.currentPage--;
  }

  setScale(newScale: number) {
    this.scale = Math.max(0.25, Math.min(4, newScale));
  }

  zoomIn() {
    this.scale = Math.min(4, this.scale + 0.25);
  }

  zoomOut() {
    this.scale = Math.max(0.25, this.scale - 0.25);
  }

  rotate() {
    this.rotation = (this.rotation + 90) % 360;
  }

  reset() {
    this.document = null;
    this.currentPage = 1;
    this.scale = 1.5;
    this.rotation = 0;
    this.isLoading = false;
    this.error = null;
    this.textContent = new Map();
    this.isTextExtracting = false;
    this.textExtractionProgress = 0;
  }
}

export const pdfStore = new PdfStore();
