import { useState, type DragEvent, type MouseEvent } from 'react';
import type { LibraryItem } from '$shared/types';
import { thumbnailUrl } from '$lib/apis/library';
import { formatBytes, formatRelative } from '$lib/utils/format';
import Icon, { itemIcon } from '../Icon';

export const ITEMS_MIME = 'application/x-rm-items';

interface Props {
	item: LibraryItem;
	selected: boolean;
	view: 'grid' | 'list';
	thumbnails: boolean;
	onselect: (event: MouseEvent) => void;
	onopen: () => void;
	oncontextmenu: (event: MouseEvent) => void;
	ondragstart: (event: DragEvent) => void;
	ondropitems: (ids: string[]) => void;
}

function FolderGlyph() {
	return (
		<svg viewBox="0 0 64 52" className="w-9 shrink-0" style={{ color: 'var(--app-fg-subtle)' }}>
			<path
				d="M0 10a4 4 0 0 1 4-4h17a4 4 0 0 1 2.8 1.2L28 12h32a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z"
				fill="currentColor"
				opacity="0.7"
			/>
			<rect y="18" width="64" height="32" rx="4" fill="currentColor" />
		</svg>
	);
}

const TYPE_LABEL: Record<LibraryItem['type'], string> = {
	folder: 'Folder',
	notebook: 'Notebook',
	pdf: 'PDF',
	epub: 'EPUB'
};

export default function ItemCard({
	item,
	selected,
	view,
	thumbnails,
	onselect,
	onopen,
	oncontextmenu,
	ondragstart,
	ondropitems
}: Props) {
	const [thumbFailed, setThumbFailed] = useState(false);
	const [dropping, setDropping] = useState(false);
	const isFolder = item.type === 'folder';
	const showThumb = thumbnails && !isFolder && item.coverPageId && !thumbFailed;
	const modified = item.lastModified ? ` · ${formatRelative(item.lastModified)}` : '';

	function allowDrop(event: DragEvent) {
		if (!isFolder || !event.dataTransfer.types.includes(ITEMS_MIME)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setDropping(true);
	}

	function drop(event: DragEvent) {
		if (!isFolder) return;
		event.preventDefault();
		setDropping(false);
		const ids = JSON.parse(event.dataTransfer.getData(ITEMS_MIME) || '[]') as string[];
		if (ids.length && !ids.includes(item.id)) ondropitems(ids);
	}

	const selectedClass = selected
		? 'bg-gray-200/60 dark:bg-white/10 ring-1 ring-gray-300 dark:ring-white/15'
		: 'hover:bg-gray-100 dark:hover:bg-white/5';
	const dropClass = dropping ? 'ring-2 ring-gray-400 dark:ring-white/40' : '';
	const itemProps = {
		draggable: true,
		onDragStart: ondragstart,
		onDragOver: allowDrop,
		onDragLeave: () => setDropping(false),
		onDrop: drop,
		onClick: onselect,
		onDoubleClick: onopen,
		onContextMenu: oncontextmenu,
		'data-item-id': item.id,
		'data-selected': selected
	};

	if (view === 'list') {
		return (
			<div
				className={`library-row group grid grid-cols-[minmax(0,1fr)_5rem_4rem_6rem_5rem] items-center gap-3 h-10 px-3 rounded-xl text-xs cursor-default select-none ${selectedClass} ${dropClass}`}
				{...itemProps}
			>
				<span className="flex items-center gap-2 min-w-0">
					<Icon name={itemIcon(item.type)} size={14} class="app-icon-muted" />
					<span className="truncate text-gray-900 dark:text-white">{item.name}</span>
					{item.pinned && <Icon name="pin" size={11} class="app-icon-muted" />}
				</span>
				<span className="app-muted truncate">{TYPE_LABEL[item.type]}</span>
				<span className="app-muted tabular-nums">{isFolder ? '' : item.pageCount || ''}</span>
				<span className="app-muted tabular-nums">{formatRelative(item.lastModified)}</span>
				<span className="app-muted tabular-nums text-right">
					{item.sizeKb ? formatBytes(item.sizeKb * 1024) : ''}
				</span>
			</div>
		);
	}

	if (isFolder) {
		return (
			<div
				className={`library-card library-folder group flex items-center gap-3 cursor-default select-none ${dropClass}`}
				{...itemProps}
			>
				<FolderGlyph />
				<div className="min-w-0 flex-1 mt-1.5">
					<div className="text-xs text-gray-900 dark:text-white truncate" title={item.name}>
						{item.name}
					</div>
					<div className="text-[0.625rem] text-gray-400 dark:text-gray-600 truncate">
						Folder{modified}
					</div>
				</div>
				{item.pinned && <Icon name="pin" size={11} class="app-icon-muted" />}
			</div>
		);
	}

	return (
		<div
			className={`library-card library-document group flex flex-col gap-1.5 cursor-default select-none ${dropClass}`}
			{...itemProps}
		>
			<div
				className={`relative w-full aspect-[3/4] rounded-lg overflow-hidden ${showThumb ? 'page-paper' : 'bg-gray-100 dark:bg-white/5'}`}
			>
				{showThumb ? (
					<img
						src={thumbnailUrl(item.id, item.coverPageId!)}
						alt=""
						loading="lazy"
						draggable={false}
						className="w-full h-full object-contain"
						onError={() => setThumbFailed(true)}
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
						<Icon name={itemIcon(item.type)} size={22} />
					</div>
				)}
				{item.pinned && (
					<span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-black/50 text-white">
						<Icon name="pin" size={10} />
					</span>
				)}
			</div>
			<div className="min-w-0 px-0.5">
				<div
					className="text-xs text-gray-900 dark:text-white leading-tight line-clamp-2 break-words"
					title={item.name}
				>
					{item.name}
				</div>
				<div className="text-[0.625rem] text-gray-400 dark:text-gray-600 mt-0.5 truncate">
					{item.pageCount || '–'} pages{modified}
				</div>
			</div>
		</div>
	);
}
