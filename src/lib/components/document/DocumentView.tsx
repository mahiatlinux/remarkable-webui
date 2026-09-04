import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { DocumentDetail } from '$shared/types';
import { useStore } from '$lib/store';
import { library } from '$lib/stores';
import { documentFileUrl, exportUrl, getDocument, thumbnailUrl } from '$lib/apis/library';
import { downloadUrl, openDocumentUrl } from '$lib/apis/client';
import type { Rendered } from '$lib/rm';
import DropdownMenu from '../DropdownMenu';
import Icon from '../Icon';
import PageHeader, { EmptyState, ToolButton } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import PageCanvas, { clearRenderCache, type ViewMode } from './PageCanvas';
import { openPdf, type PDFDocumentProxy } from './pdf';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

function PageThumb({ src, ratio }: { src: string; ratio: number }) {
	const [aspect, setAspect] = useState(ratio);
	return (
		<div className="page-paper w-full overflow-hidden" style={{ aspectRatio: aspect }}>
			<img
				src={src}
				alt=""
				loading="lazy"
				draggable={false}
				className="w-full h-full object-contain"
				onLoad={(event) =>
					setAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)
				}
				onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
			/>
		</div>
	);
}

export default function DocumentView() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const items = useStore(library);
	const [detail, setDetail] = useState<DocumentDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [index, setIndex] = useState(0);
	const [mode, setMode] = useState<ViewMode>('vector');
	const [zoom, setZoom] = useState<number | 'fit'>('fit');
	const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
	const [rendered, setRendered] = useState<Rendered | null>(null);
	const [containerWidth, setContainerWidth] = useState(800);
	const [showDownload, setShowDownload] = useState(false);
	const downloadButton = useRef<HTMLButtonElement | null>(null);
	const scroller = useRef<HTMLDivElement | null>(null);
	const strip = useRef<HTMLDivElement | null>(null);

	const name = items.get(id)?.name ?? detail?.item.name ?? '';

	useEffect(() => {
		let cancelled = false;
		setDetail(null);
		setError(null);
		setPdf(null);
		setRendered(null);
		clearRenderCache(id);
		getDocument(id)
			.then((result) => {
				if (cancelled) return;
				setDetail(result);
				setIndex(result.currentPage);
				setMode(result.item.type === 'epub' ? 'thumbnail' : 'vector');
				if (result.item.type === 'pdf') {
					openPdf(documentFileUrl(id))
						.then((doc) => !cancelled && setPdf(doc))
						.catch((err: Error) => toast.error(`PDF background unavailable: ${err.message}`));
				}
			})
			.catch((err: Error) => !cancelled && setError(err.message));
		return () => {
			cancelled = true;
		};
	}, [id]);

	useLayoutEffect(() => {
		const element = scroller.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
		observer.observe(element);
		return () => observer.disconnect();
	}, [detail]);

	useEffect(() => {
		strip.current
			?.querySelector<HTMLElement>(`[data-page-index="${index}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}, [index]);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (!detail) return;
			const target = event.target as HTMLElement;
			if (target.tagName === 'INPUT') return;
			if (event.key === 'ArrowRight' || event.key === 'PageDown') go(index + 1);
			else if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(index - 1);
			else if (event.key === 'Home') go(0);
			else if (event.key === 'End') go(detail.pages.length - 1);
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function go(next: number) {
		if (!detail) return;
		setIndex(Math.max(0, Math.min(detail.pages.length - 1, next)));
	}

	function zoomBy(direction: 1 | -1) {
		const current = zoom === 'fit' ? fitScale() : zoom;
		const next =
			direction > 0
				? ZOOM_STEPS.find((step) => step > current + 0.01)
				: [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01);
		if (next) setZoom(next);
	}

	function fitScale(): number {
		const base = rendered?.width ?? detail?.paperSize[0] ?? 1404;
		return Math.max(0.05, (containerWidth - 32) / base);
	}

	function downloadSvg() {
		if (!rendered || !detail) return;
		const blob = new Blob([rendered.svg], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		downloadUrl(url, `${name} - page ${index + 1}.svg`);
		URL.revokeObjectURL(url);
	}

	if (error) {
		return (
			<div className="h-full flex flex-col">
				<PageHeader>
					<ToolButton
						icon={<Icon name="arrow-left" size={14} />}
						label="Back"
						onclick={() => navigate(-1)}
					/>
				</PageHeader>
				<EmptyState
					icon={<Icon name="warning" size={28} />}
					title="Could not open document"
					hint={error}
				/>
			</div>
		);
	}

	if (!detail) {
		return (
			<div className="h-full flex items-center justify-center">
				<Spinner size={20} />
			</div>
		);
	}

	const page = detail.pages[index];
	const scale = zoom === 'fit' ? fitScale() : zoom;
	const pageWidth = (rendered?.width ?? detail.paperSize[0]) * scale;
	const canVector = detail.item.type !== 'epub' || page?.hasLines;

	return (
		<div className="h-full flex flex-col">
			<PageHeader>
				<ToolButton
					icon={<Icon name="arrow-left" size={14} />}
					label="Back to library"
					onclick={() =>
						navigate(`/library/${detail.item.parent === 'trash' ? 'trash' : detail.item.parent}`)
					}
				/>
				<span className="page-title truncate min-w-0" title={name}>
					{name}
				</span>
				<div className="ml-auto flex items-center gap-0.5">
					<div className="flex items-center gap-0.5 mr-2">
						<ToolButton
							icon={<Icon name="chevron-left" size={14} />}
							label="Previous page"
							onclick={() => go(index - 1)}
							disabled={index === 0}
						/>
						<span className="text-xs tabular-nums app-muted min-w-[4rem] text-center">
							{detail.pages.length ? `${index + 1} / ${detail.pages.length}` : 'No pages'}
						</span>
						<ToolButton
							icon={<Icon name="chevron-right" size={14} />}
							label="Next page"
							onclick={() => go(index + 1)}
							disabled={index >= detail.pages.length - 1}
						/>
					</div>
					<ToolButton
						icon={<Icon name="zoom-out" size={14} />}
						label="Zoom out"
						onclick={() => zoomBy(-1)}
					/>
					<button
						className="app-button-ghost h-7 px-1.5 rounded-full text-[0.6875rem] tabular-nums min-w-[3rem]"
						onClick={() => setZoom('fit')}
						title="Fit width"
					>
						{zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`}
					</button>
					<ToolButton
						icon={<Icon name="zoom-in" size={14} />}
						label="Zoom in"
						onclick={() => zoomBy(1)}
					/>
					<span className="w-px h-4 mx-1 app-divider"></span>
					<ToolButton
						icon={<Icon name="image" size={14} />}
						label={mode === 'vector' ? 'Show tablet rendering' : 'Show vector rendering'}
						active={mode === 'thumbnail'}
						onclick={() => setMode(mode === 'vector' ? 'thumbnail' : 'vector')}
						disabled={!canVector && mode === 'thumbnail'}
					/>
					{detail.item.type !== 'notebook' && (
						<ToolButton
							icon={<Icon name="external-link" size={14} />}
							label={`Open source ${detail.item.type.toUpperCase()}`}
							onclick={() => openDocumentUrl(documentFileUrl(id), `${name}.${detail.item.type}`)}
						/>
					)}
					<ToolButton
						ref={downloadButton}
						icon={<Icon name="download" size={14} />}
						label="Download"
						onclick={() => setShowDownload(true)}
					/>
				</div>
			</PageHeader>

			<div className="flex-1 min-h-0 flex">
				<div
					ref={strip}
					className="w-[7.5rem] shrink-0 overflow-y-auto scrollbar-hover border-r border-gray-200 dark:border-white/6 p-2 flex flex-col gap-2 hidden sm:flex"
				>
					{detail.pages.map((entry, i) => (
						<button
							key={entry.id}
							data-page-index={i}
							className={`flex flex-col items-center gap-1 p-1 rounded-xl transition-colors ${
								i === index
									? 'bg-gray-200/60 dark:bg-white/10'
									: 'hover:bg-gray-100 dark:hover:bg-white/5'
							}`}
							onClick={() => setIndex(i)}
						>
							<PageThumb
								src={thumbnailUrl(id, entry.id)}
								ratio={detail.paperSize[0] / detail.paperSize[1]}
							/>
							<span className="text-[0.625rem] app-muted tabular-nums">{i + 1}</span>
						</button>
					))}
				</div>

				<div ref={scroller} className="app-page flex-1 min-w-0 overflow-auto scrollbar-hover">
					{page ? (
						<div className="min-h-full flex items-start justify-center p-4">
							<PageCanvas
								detail={detail}
								page={page}
								mode={mode}
								pdf={pdf}
								width={pageWidth}
								onrendered={setRendered}
							/>
						</div>
					) : (
						<EmptyState
							icon={<Icon name="page" size={28} />}
							title="This document has no pages yet"
						/>
					)}
				</div>
			</div>

			{showDownload && downloadButton.current && (
				<DropdownMenu
					anchor={downloadButton.current}
					align="end"
					items={[
						{
							label: 'PDF (rendered by tablet)',
							icon: 'pdf',
							tooltip: 'Needs the USB web interface enabled on the tablet',
							onclick: () => downloadUrl(exportUrl(id, 'pdf', name))
						},
						{
							label: 'rmdoc archive',
							icon: 'archive',
							onclick: () => downloadUrl(exportUrl(id, 'rmdoc', name))
						},
						...(rendered && mode === 'vector'
							? [{ label: 'This page as SVG', icon: 'code', onclick: downloadSvg }]
							: []),
						...(detail.item.type !== 'notebook'
							? [
									{
										label: `Original ${detail.item.type.toUpperCase()}`,
										icon: 'file',
										onclick: () => downloadUrl(documentFileUrl(id), `${name}.${detail.item.type}`)
									}
								]
							: [])
					]}
					onclose={() => setShowDownload(false)}
				/>
			)}
		</div>
	);
}
