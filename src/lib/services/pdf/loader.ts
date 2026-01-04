import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocument, PdfMetadata, PdfOutlineItem } from './types';

// Configure worker
if (typeof window !== 'undefined') {
	pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
}

export async function loadPdfFromFile(file: File): Promise<PdfDocument> {
	const arrayBuffer = await file.arrayBuffer();
	const document = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

	return createPdfDocument(file.name, document);
}

export async function loadPdfFromUrl(url: string): Promise<PdfDocument> {
	const document = await pdfjsLib.getDocument(url).promise;
	const name = url.split('/').pop() || 'document.pdf';

	return createPdfDocument(name, document);
}

async function createPdfDocument(name: string, document: PDFDocumentProxy): Promise<PdfDocument> {
	const metadata = await extractMetadata(document);
	const outline = await extractOutline(document);

	return {
		id: crypto.randomUUID(),
		name,
		document,
		numPages: document.numPages,
		metadata,
		outline
	};
}

async function extractMetadata(document: PDFDocumentProxy): Promise<PdfMetadata> {
	try {
		const metadata = await document.getMetadata();
		const info = metadata.info as Record<string, any>;

		return {
			title: info?.Title,
			author: info?.Author,
			subject: info?.Subject,
			creationDate: info?.CreationDate ? parseDate(info.CreationDate) : undefined,
			modificationDate: info?.ModDate ? parseDate(info.ModDate) : undefined
		};
	} catch {
		return {};
	}
}

async function extractOutline(document: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
	try {
		const outline = await document.getOutline();
		if (!outline) return [];

		return parseOutlineItems(outline, document);
	} catch {
		return [];
	}
}

async function parseOutlineItems(
	items: any[],
	document: PDFDocumentProxy
): Promise<PdfOutlineItem[]> {
	const result: PdfOutlineItem[] = [];

	for (const item of items) {
		let pageNumber = 1;

		if (item.dest) {
			try {
				const dest = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;

				if (dest) {
					const pageRef = dest[0];
					const pageIndex = await document.getPageIndex(pageRef);
					pageNumber = pageIndex + 1;
				}
			} catch {
				// Keep default page number
			}
		}

		result.push({
			title: item.title,
			pageNumber,
			children: item.items ? await parseOutlineItems(item.items, document) : []
		});
	}

	return result;
}

function parseDate(dateString: string): Date | undefined {
	try {
		// PDF date format: D:YYYYMMDDHHmmSS
		const match = dateString.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
		if (match) {
			const [, year, month, day, hour = '0', min = '0', sec = '0'] = match;
			return new Date(
				parseInt(year),
				parseInt(month) - 1,
				parseInt(day),
				parseInt(hour),
				parseInt(min),
				parseInt(sec)
			);
		}
	} catch {
		// Return undefined on parse failure
	}
	return undefined;
}
