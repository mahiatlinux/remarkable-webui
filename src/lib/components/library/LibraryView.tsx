import LibraryItems from './LibraryItems';
import LibraryToolbar from './LibraryToolbar';
import LibraryDialogs, { type LibraryDialog } from './LibraryDialogs';
import { useLibrarySelection } from './useLibrarySelection';
import { compareItems, folderCrumbs } from './contents';
import {
	useMemo,
	useRef,
	useState,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { LibraryItem } from '$shared/types';
import { useStore } from '$lib/store';
import {
	library,
	libraryError,
	libraryLoading,
	librarySort,
	libraryView,
	showThumbnails
} from '$lib/stores';
import {
	exportUrl,
	loadLibrary,
	moveItems,
	pinItem,
	restoreItems,
	trashItems,
	uploadDocuments
} from '$lib/apis/library';
import { downloadUrl } from '$lib/apis/client';
import DropdownMenu from '../DropdownMenu';
import Icon from '../Icon';
import { EmptyState } from '../common/PageHeader';
import { ITEMS_MIME } from './ItemCard';

export default function LibraryView() {
	const { folderId = '' } = useParams();
	const navigate = useNavigate();
	const items = useStore(library);
	const loading = useStore(libraryLoading);
	const error = useStore(libraryError);
	const view = useStore(libraryView);
	const sort = useStore(librarySort);
	const thumbnails = useStore(showThumbnails);

	const inTrash = folderId === 'trash';
	const folder = inTrash || !folderId ? null : items.get(folderId);
	const parent = inTrash ? 'trash' : folderId;

	const children = useMemo(
		() => [...items.values()].filter((item) => item.parent === parent).sort(compareItems(sort)),
		[items, parent, sort]
	);

	const crumbs = useMemo(() => folderCrumbs(items, folderId), [items, folderId]);
	const { selected, setSelected, setAnchor, select } = useLibrarySelection(parent, children);
	const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
	const [dialog, setDialog] = useState<LibraryDialog | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const fileInput = useRef<HTMLInputElement | null>(null);
	const container = useRef<HTMLDivElement | null>(null);

	async function run(action: () => Promise<unknown>, success?: string) {
		try {
			await action();
			if (success) toast.success(success);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			void loadLibrary();
		}
	}

	function open(item: LibraryItem) {
		navigate(item.type === 'folder' ? `/library/${item.id}` : `/doc/${item.id}`);
	}

	function contextMenu(event: MouseEvent, item?: LibraryItem) {
		event.preventDefault();
		event.stopPropagation();
		if (item && !selected.has(item.id)) {
			setSelected(new Set([item.id]));
			setAnchor(item.id);
		}
		if (!item) setSelected(new Set());
		setMenu({ x: event.clientX, y: event.clientY });
	}

	function startDrag(item: LibraryItem, event: DragEvent) {
		const ids = selected.has(item.id) ? [...selected] : [item.id];
		if (!selected.has(item.id)) setSelected(new Set([item.id]));
		event.dataTransfer.setData(ITEMS_MIME, JSON.stringify(ids));
		event.dataTransfer.effectAllowed = 'move';
	}

	function moveTo(ids: string[], target: string) {
		return run(
			() => moveItems(ids, target),
			`Moved ${ids.length === 1 ? 'item' : `${ids.length} items`}`
		);
	}

	function upload(files: File[]) {
		if (files.length === 0) return;
		const id = toast.loading(
			`Uploading ${files.length === 1 ? files[0].name : `${files.length} files`}…`
		);
		uploadDocuments(inTrash ? '' : folderId, files, (fraction) => {
			toast.loading(`Uploading… ${Math.round(fraction * 100)}%`, { id });
		})
			.then((result) => {
				toast.success(
					`Uploaded ${result.uploaded.length} document${result.uploaded.length === 1 ? '' : 's'}`,
					{
						id
					}
				);
			})
			.catch((err: Error) => toast.error(err.message, { id }))
			.finally(() => void loadLibrary());
	}

	function onDragOver(event: DragEvent) {
		if (!event.dataTransfer.types.includes('Files')) return;
		event.preventDefault();
		setDragOver(true);
	}

	function onDrop(event: DragEvent) {
		setDragOver(false);
		if (!event.dataTransfer.types.includes('Files')) return;
		event.preventDefault();
		upload([...event.dataTransfer.files]);
	}

	function onKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT') return;
		const ids = [...selected];
		if (event.key === 'Escape') setSelected(new Set());
		else if (event.key === 'Enter' && ids.length === 1) {
			const item = items.get(ids[0]);
			if (item) open(item);
		} else if ((event.key === 'Delete' || event.key === 'Backspace') && ids.length) {
			event.preventDefault();
			if (inTrash) setDialog({ kind: 'purge', ids });
			else void run(() => trashItems(ids), 'Moved to trash');
		} else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			setSelected(new Set(children.map((item) => item.id)));
		}
	}

	function menuItems() {
		const ids = [...selected];
		const single = ids.length === 1 ? items.get(ids[0]) : undefined;
		if (ids.length === 0) {
			if (inTrash) {
				return [
					{
						label: 'Empty trash',
						icon: 'trash',
						onclick: () => setDialog({ kind: 'purge', ids: children.map((item) => item.id) })
					}
				];
			}
			return [
				{
					label: 'New folder',
					icon: 'folder-plus',
					onclick: () => setDialog({ kind: 'new-folder' })
				},
				{
					label: 'New notebook',
					icon: 'page-plus',
					onclick: () => setDialog({ kind: 'new-notebook' })
				},
				{ label: 'Upload files', icon: 'upload', onclick: () => fileInput.current?.click() },
				{ divider: true, label: '', onclick: () => {} },
				{ label: 'Refresh', icon: 'refresh', onclick: () => void loadLibrary() }
			];
		}
		if (inTrash) {
			return [
				{
					label: 'Restore',
					icon: 'restore',
					onclick: () => run(() => restoreItems(ids), 'Restored')
				},
				{ divider: true, label: '', onclick: () => {} },
				{
					label: 'Delete permanently',
					icon: 'trash',
					onclick: () => setDialog({ kind: 'purge', ids })
				}
			];
		}
		const document = single && single.type !== 'folder' ? single : undefined;
		return [
			...(single ? [{ label: 'Open', icon: 'eye', onclick: () => open(single) }] : []),
			...(single
				? [
						{
							label: 'Rename',
							icon: 'pencil',
							onclick: () => setDialog({ kind: 'rename', item: single })
						}
					]
				: []),
			{ label: 'Move to…', icon: 'folder', onclick: () => setDialog({ kind: 'move', ids }) },
			...(single
				? [
						{
							label: single.pinned ? 'Unpin' : 'Pin',
							icon: 'pin',
							onclick: () => run(() => pinItem(single.id, !single.pinned))
						}
					]
				: []),
			...(document
				? [
						{ divider: true, label: '', onclick: () => {} },
						{
							label: 'Download PDF',
							icon: 'download',
							onclick: () => downloadUrl(exportUrl(document.id, 'pdf', document.name))
						},
						{
							label: 'Download rmdoc',
							icon: 'archive',
							onclick: () => downloadUrl(exportUrl(document.id, 'rmdoc', document.name))
						}
					]
				: []),
			{ divider: true, label: '', onclick: () => {} },
			{
				label: 'Move to trash',
				icon: 'trash',
				onclick: () => run(() => trashItems(ids), 'Moved to trash')
			}
		];
	}

	const missingFolder = folderId && !inTrash && !folder && !loading && items.size > 0;

	return (
		<div
			ref={container}
			className="h-full flex flex-col outline-none relative"
			tabIndex={0}
			onKeyDown={onKeyDown}
			onDragOver={onDragOver}
			onDragLeave={() => setDragOver(false)}
			onDrop={onDrop}
		>
			<LibraryToolbar
				folderId={folderId}
				crumbs={crumbs}
				selectedCount={selected.size}
				children={children}
				setDialog={setDialog}
				moveTo={moveTo}
				onupload={() => fileInput.current?.click()}
			/>

			<div
				className="flex-1 min-h-0 overflow-y-auto scrollbar-hover"
				onClick={() => setSelected(new Set())}
				onContextMenu={(event) => contextMenu(event)}
			>
				{error ? (
					<EmptyState
						icon={<Icon name="warning" size={28} />}
						title="Could not read the library"
						hint={error}
					/>
				) : missingFolder ? (
					<EmptyState icon={<Icon name="folder" size={28} />} title="Folder not found" />
				) : children.length === 0 && !loading ? (
					<EmptyState
						icon={<Icon name={inTrash ? 'trash' : 'folder'} size={28} />}
						title={inTrash ? 'Trash is empty' : 'Nothing here yet'}
						hint={inTrash ? undefined : 'Drop PDF, EPUB or rmdoc files anywhere to upload them.'}
					/>
				) : (
					<LibraryItems
						items={children}
						view={view}
						thumbnails={thumbnails}
						selected={selected}
						onselect={select}
						onopen={open}
						oncontextmenu={contextMenu}
						ondragstart={startDrag}
						onmove={moveTo}
					/>
				)}
			</div>

			{dragOver && (
				<div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
					<div className="app-surface app-shell-radius border px-6 py-4 flex items-center gap-2 text-sm shadow-2xl">
						<Icon name="upload" size={18} />
						Drop to upload to {inTrash ? 'My files' : (folder?.name ?? 'My files')}
					</div>
				</div>
			)}

			<input
				ref={fileInput}
				type="file"
				multiple
				accept=".pdf,.epub,.rmdoc,.zip,application/pdf,application/epub+zip"
				className="hidden"
				onChange={(event) => {
					upload([...(event.currentTarget.files ?? [])]);
					event.currentTarget.value = '';
				}}
			/>

			{menu && <DropdownMenu anchor={menu} items={menuItems()} onclose={() => setMenu(null)} />}

			<LibraryDialogs
				dialog={dialog}
				onclose={() => setDialog(null)}
				items={items}
				parent={parent}
				run={run}
				moveTo={moveTo}
			/>
		</div>
	);
}
