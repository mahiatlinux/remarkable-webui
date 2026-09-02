import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Background } from '$lib/rm';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.min.mjs',
	import.meta.url
).toString();

export type { PDFDocumentProxy };

export function openPdf(url: string): Promise<PDFDocumentProxy> {
	return pdfjs.getDocument({ url }).promise;
}

export async function renderPdfPage(
	doc: PDFDocumentProxy,
	pageIndex: number,
	paper: [number, number]
): Promise<Background> {
	const page = await doc.getPage(pageIndex + 1);
	const base = page.getViewport({ scale: 1 });
	const scale = Math.min(paper[0] / base.width, paper[1] / base.height);
	const viewport = page.getViewport({ scale: scale * 1.5 });
	const canvas = document.createElement('canvas');
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	const context = canvas.getContext('2d')!;
	await page.render({ canvasContext: context, canvas, viewport }).promise;
	const width = base.width * scale;
	const height = base.height * scale;
	return {
		href: canvas.toDataURL('image/png'),
		x: -width / 2,
		y: (paper[1] - height) / 2,
		width,
		height
	};
}
