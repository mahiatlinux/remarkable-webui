import { useEffect, useState } from 'react';
import type { DocumentDetail, DocumentPage } from '$shared/types';
import { getPageLines, thumbnailUrl } from '$lib/apis/library';
import { getTemplateDocument, templateFileUrl } from '$lib/apis/system';
import { emptyScene, parseScene, renderScene, type Background, type Rendered } from '$lib/rm';
import { renderTemplate } from '$lib/templates/render';
import Spinner from '../common/Spinner';
import Icon from '../Icon';
import { renderPdfPage, type PDFDocumentProxy } from './pdf';

export type ViewMode = 'vector' | 'thumbnail';

interface Props {
	detail: DocumentDetail;
	page: DocumentPage;
	mode: ViewMode;
	pdf: PDFDocumentProxy | null;
	width: number;
	onrendered: (rendered: Rendered | null) => void;
}

const cache = new Map<string, Promise<Rendered>>();

export function clearRenderCache(docId: string) {
	for (const key of cache.keys()) if (key.startsWith(`${docId}/`)) cache.delete(key);
}

interface Backdrop {
	background: Background | null;
	backgroundMarkup: string | null;
}

async function backdrop(
	detail: DocumentDetail,
	page: DocumentPage,
	pdf: PDFDocumentProxy | null,
	paper: [number, number]
): Promise<Backdrop> {
	if (detail.item.type === 'pdf') {
		return {
			background:
				pdf && page.pdfPage !== null ? await renderPdfPage(pdf, page.pdfPage, paper) : null,
			backgroundMarkup: null
		};
	}
	if (detail.item.type === 'notebook' && page.template && page.template !== 'Blank') {
		try {
			const template = await getTemplateDocument(page.template);
			return { background: null, backgroundMarkup: renderTemplate(template, paper[0], paper[1]) };
		} catch {
			return {
				background: {
					href: templateFileUrl(page.template, 'svg'),
					x: -paper[0] / 2,
					y: 0,
					width: paper[0],
					height: paper[1]
				},
				backgroundMarkup: null
			};
		}
	}
	return { background: null, backgroundMarkup: null };
}

function render(
	detail: DocumentDetail,
	page: DocumentPage,
	pdf: PDFDocumentProxy | null
): Promise<Rendered> {
	const key = `${detail.item.id}/${page.id}/${pdf ? 'pdf' : 'plain'}`;
	let pending = cache.get(key);
	if (!pending) {
		pending = (async () => {
			const scene = page.hasLines
				? parseScene(await getPageLines(detail.item.id, page.id))
				: emptyScene();
			const paper = scene.paperSize ?? detail.paperSize;
			return renderScene(scene, {
				paperSize: paper,
				...(await backdrop(detail, page, pdf, paper))
			});
		})();
		pending.catch(() => cache.delete(key));
		cache.set(key, pending);
	}
	return pending;
}

export default function PageCanvas({ detail, page, mode, pdf, width, onrendered }: Props) {
	const [rendered, setRendered] = useState<Rendered | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (mode !== 'vector') {
			onrendered(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		render(detail, page, pdf)
			.then((result) => {
				if (cancelled) return;
				setRendered(result);
				onrendered(result);
			})
			.catch((err: Error) => !cancelled && setError(err.message))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [detail, page, pdf, mode]);

	if (mode === 'thumbnail') {
		const [paperWidth, paperHeight] = detail.paperSize;
		return (
			<img
				src={thumbnailUrl(detail.item.id, page.id)}
				alt={`Page ${page.id}`}
				className="page-paper block"
				style={{ width, height: (width * paperHeight) / paperWidth }}
				draggable={false}
			/>
		);
	}

	if (error) {
		return (
			<div
				className="page-paper flex flex-col items-center justify-center gap-2 text-xs text-gray-500"
				style={{ width, height: width * 1.33 }}
			>
				<Icon name="warning" size={20} />
				{error}
			</div>
		);
	}

	if (!rendered) {
		return (
			<div
				className="page-paper flex items-center justify-center"
				style={{ width, height: width * 1.33 }}
			>
				{loading && <Spinner size={18} />}
			</div>
		);
	}

	return (
		<div
			className="page-paper relative"
			style={{ width, height: (width * rendered.height) / rendered.width }}
		>
			<div
				className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full"
				dangerouslySetInnerHTML={{ __html: rendered.svg }}
			/>
			{loading && (
				<div className="absolute top-2 right-2">
					<Spinner size={12} />
				</div>
			)}
		</div>
	);
}
