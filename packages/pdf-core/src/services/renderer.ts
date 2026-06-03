import type { PDFPageProxy } from "pdfjs-dist";
import type { RenderOptions } from "./types";

export interface RenderResult {
  canvas: HTMLCanvasElement;
  viewport: any;
}

export async function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  options: RenderOptions = { scale: 1.5, rotation: 0 },
): Promise<RenderResult> {
  const { scale, rotation } = options;

  const viewport = page.getViewport({ scale, rotation });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to get canvas 2D context");
  }

  // Set canvas dimensions
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // Render PDF page
  const renderContext = {
    canvasContext: context,
    viewport,
    canvas,
  };

  await page.render(renderContext).promise;

  return { canvas, viewport };
}

export function calculateFitScale(
  page: PDFPageProxy,
  containerWidth: number,
  containerHeight: number,
  padding: number = 40,
): number {
  const viewport = page.getViewport({ scale: 1 });

  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  const scaleX = availableWidth / viewport.width;
  const scaleY = availableHeight / viewport.height;

  return Math.min(scaleX, scaleY, 2); // Cap at 2x
}

export function calculateFitWidthScale(
  page: PDFPageProxy,
  containerWidth: number,
  padding: number = 40,
): number {
  const viewport = page.getViewport({ scale: 1 });
  const availableWidth = containerWidth - padding * 2;

  return Math.min(availableWidth / viewport.width, 2);
}
