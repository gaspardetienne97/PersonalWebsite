import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export interface PdfDocument {
  id: string;
  name: string;
  document: PDFDocumentProxy;
  numPages: number;
  metadata: PdfMetadata;
  outline: PdfOutlineItem[];
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface PdfOutlineItem {
  title: string;
  pageNumber: number;
  children: PdfOutlineItem[];
}

export interface PdfPage {
  pageNumber: number;
  page: PDFPageProxy;
  viewport: any;
  textContent: PdfTextContent;
}

export interface PdfTextContent {
  pageNumber: number;
  items: PdfTextItem[];
  fullText: string;
  sentences: PdfSentence[];
  paragraphs: PdfParagraph[];
}

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  transform: number[];
}

export interface PdfSentence {
  id: string;
  text: string;
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  items: PdfTextItem[]; // For highlighting
}

export interface PdfParagraph {
  id: string;
  sentences: PdfSentence[];
  pageNumber: number;
}

export interface RenderOptions {
  scale: number;
  rotation: number;
}
