import {
	useEffect,
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
	activeDeviceId,
	devices,
	library,
	libraryError,
	libraryLoading,
	librarySort,
	libraryView,
	showThumbnails,
	type LibrarySort
} from '$lib/stores';
import {
	createFolder,
	createNotebook,
	exportUrl,
	loadLibrary,
	moveItems,
	pinItem,
	purgeItems,
	renameItem,
	restartXochitl,
	restoreItems,
	trashItems,
	uploadDocuments
} from '$lib/apis/library';
import { downloadUrl } from '$lib/apis/client';
import DropdownMenu from '../DropdownMenu';
import Icon from '../Icon';
import PageHeader, { EmptyState, ToolButton } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import { ConfirmDialog, PromptDialog } from '../common/Dialog';
import ItemCard, { ITEMS_MIME } from './ItemCard';
import MoveDialog from './MoveDialog';
import NewNotebookDialog from './NewNotebookDialog';

type Dialog =
	| { kind: 'rename'; item: LibraryItem }
	| { kind: 'new-folder' }
	| { kind: 'new-notebook' }
	| { kind: 'move'; ids: string[] }
	| { kind: 'purge'; ids: string[] };

const SORT_LABEL: Record<LibrarySort, string> = {
	name: 'Name',
	modified: 'Last modified',
	opened: 'Last opened',
	size: 'Size'
};

function compareItems(sort: LibrarySort) {
	return (a: LibraryItem, b: LibraryItem) => {
		if ((a.type === 'folder') !== (b.type === 'folder')) return a.type === 'folder' ? -1 : 1;
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		if (sort === 'name') return a.name.localeCompare(b.name);
		if (sort === 'size') return b.sizeKb - a.sizeKb || a.name.localeCompare(b.name);
		if (sort === 'opened') return b.lastOpened - a.lastOpened || a.name.localeCompare(b.name);
		return b.lastModified - a.lastModified || a.name.localeCompare(b.name);
	};
}

export default function LibraryView() {
	const { folderId = '' } = useParams();
	const navigate = useNavigate();
	const items = useStore(library);
	const loading = useStore(libraryLoading);
	const error = useStore(libraryError);
	const view = useStore(libraryView);
	const sort = useStore(librarySort);
	const thumbnails = useStore(showThumbnails);
	const deviceList = useStore(devices);
	const activeId = useStore(activeDeviceId);
	const device = deviceList.find((entry) => entry.id === activeId);

	const inTrash = folderId === 'trash';
	const folder = inTrash || !folderId ? null : items.get(folderId);
	const parent = inTrash ? 'trash' : folderId;

	const children = useMemo(
		() => [...items.values()].filter((item) => item.parent === parent).sort(compareItems(sort)),
		[items, parent, sort]
	);

	const crumbs = useMemo(() => {
		const chain: LibraryItem[] = [];
		let current = folder;
		while (current) {
			chain.unshift(current);
			current = items.get(current.parent);
		}
		return chain;
	}, [items, folder]);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [anchor, setAnchor] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [showSort, setShowSort] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const sortButton = useRef<HTMLButtonElement | null>(null);
	const newButton = useRef<HTMLButtonElement | null>(null);
	const fileInput = useRef<HTMLInputElement | null>(null);
	const container = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setSelected(new Set());
		setAnchor(null);
	}, [parent]);

	useEffect(() => {
		setSelected((current) => {
			const next = new Set([...current].filter((id) => items.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [items]);

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

	function select(item: LibraryItem, event: MouseEvent) {
		event.stopPropagation();
		if (event.shiftKey && anchor) {
			const ids = children.map((entry) => entry.id);
			const from = ids.indexOf(anchor);
			const to = ids.indexOf(item.id);
			const [start, end] = from < to ? [from, to] : [to, from];
			setSelected(new Set(ids.slice(start, end + 1)));
			return;
		}
		if (event.metaKey || event.ctrlKey) {
			const next = new Set(selected);
			if (next.has(item.id)) next.delete(item.id);
			else next.add(item.id);
			setSelected(next);
		} else {
			setSelected(new Set([item.id]));
		}
		setAnchor(item.id);
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
					`Uploaded ${result.created.length} document${result.created.length === 1 ? '' : 's'}`,
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
			<PageHeader>
				<nav className="flex items-center gap-0.5 min-w-0 text-xs">
					<button
						className={`flex items-center gap-1 h-7 px-1.5 rounded-lg transition-colors ${
							!folderId ? 'text-gray-900 dark:text-white font-medium' : 'app-button-ghost'
						}`}
						onClick={() => navigate('/library')}
						onDragOver={(event) =>
							event.dataTransfer.types.includes(ITEMS_MIME) && event.preventDefault()
						}
						onDrop={(event) => {
							const ids = JSON.parse(event.dataTransfer.getData(ITEMS_MIME) || '[]') as string[];
							if (ids.length) void moveTo(ids, '');
						}}
					>
						<Icon name="home" size={13} />
						My files
					</button>
					{inTrash && (
						<>
							<Icon name="chevron-right" size={12} class="app-icon-muted" />
							<span className="px-1.5 text-gray-900 dark:text-white font-medium">Trash</span>
						</>
					)}
					{crumbs.map((crumb, index) => (
						<span key={crumb.id} className="flex items-center gap-0.5 min-w-0">
							<Icon name="chevron-right" size={12} class="app-icon-muted" />
							<button
								className={`h-7 px-1.5 rounded-lg truncate max-w-[12rem] transition-colors ${
									index === crumbs.length - 1
										? 'text-gray-900 dark:text-white font-medium'
										: 'app-button-ghost'
								}`}
								onClick={() => navigate(`/library/${crumb.id}`)}
								onDragOver={(event) =>
									event.dataTransfer.types.includes(ITEMS_MIME) && event.preventDefault()
								}
								onDrop={(event) => {
									const ids = JSON.parse(
										event.dataTransfer.getData(ITEMS_MIME) || '[]'
									) as string[];
									if (ids.length) void moveTo(ids, crumb.id);
								}}
							>
								{crumb.name}
							</button>
						</span>
					))}
				</nav>
				<div className="ml-auto flex items-center gap-0.5">
					{loading && <Spinner size={12} class="mr-1" />}
					{selected.size > 0 && (
						<span className="text-[0.6875rem] app-muted mr-1 tabular-nums">
							{selected.size} selected
						</span>
					)}
					<ToolButton
						ref={sortButton}
						icon={<Icon name="sort" size={14} />}
						label={`Sort: ${SORT_LABEL[sort]}`}
						onclick={() => setShowSort(true)}
					/>
					<ToolButton
						icon={<Icon name={view === 'grid' ? 'list' : 'grid'} size={14} />}
						label={view === 'grid' ? 'List view' : 'Grid view'}
						onclick={() => libraryView.set(view === 'grid' ? 'list' : 'grid')}
					/>
					<ToolButton
						icon={<Icon name="refresh" size={14} />}
						label="Refresh"
						onclick={() => void loadLibrary()}
					/>
					{inTrash ? (
						<button
							className="app-button-ghost flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs"
							disabled={children.length === 0}
							onClick={() => setDialog({ kind: 'purge', ids: children.map((item) => item.id) })}
						>
							<Icon name="trash" size={13} />
							Empty trash
						</button>
					) : (
						<button
							ref={newButton}
							className="app-button flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium ml-1"
							onClick={() => setShowNew(true)}
						>
							<Icon name="plus" size={13} />
							New
						</button>
					)}
				</div>
			</PageHeader>

			{device?.pendingRestart && !device.autoRestart && (
				<div className="flex items-center gap-2 px-4 h-8 text-[0.6875rem] bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-white/6">
					<Icon name="warning" size={12} />
					<span className="flex-1">
						Changes are saved but the tablet shows them after xochitl restarts.
					</span>
					<button
						className="text-gray-900 dark:text-white hover:underline"
						onClick={() => run(() => restartXochitl(), 'xochitl restarted')}
					>
						Restart now
					</button>
				</div>
			)}

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
				) : view === 'grid' ? (
					<div className="grid gap-1 p-3 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
						{children.map((item) => (
							<ItemCard
								key={item.id}
								item={item}
								view="grid"
								thumbnails={thumbnails}
								selected={selected.has(item.id)}
								onselect={(event) => select(item, event)}
								onopen={() => open(item)}
								oncontextmenu={(event) => contextMenu(event, item)}
								ondragstart={(event) => startDrag(item, event)}
								ondropitems={(ids) => void moveTo(ids, item.id)}
							/>
						))}
					</div>
				) : (
					<div className="p-2">
						<div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem_6rem_5rem] gap-3 px-2 h-7 items-center text-[0.625rem] text-gray-400 dark:text-gray-600">
							<span>Name</span>
							<span>Type</span>
							<span>Pages</span>
							<span>Modified</span>
							<span className="text-right">Size</span>
						</div>
						{children.map((item) => (
							<ItemCard
								key={item.id}
								item={item}
								view="list"
								thumbnails={thumbnails}
								selected={selected.has(item.id)}
								onselect={(event) => select(item, event)}
								onopen={() => open(item)}
								oncontextmenu={(event) => contextMenu(event, item)}
								ondragstart={(event) => startDrag(item, event)}
								ondropitems={(ids) => void moveTo(ids, item.id)}
							/>
						))}
					</div>
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

			{showSort && sortButton.current && (
				<DropdownMenu
					anchor={sortButton.current}
					align="end"
					items={(Object.keys(SORT_LABEL) as LibrarySort[]).map((key) => ({
						label: SORT_LABEL[key],
						active: sort === key,
						check: true,
						onclick: () => librarySort.set(key)
					}))}
					onclose={() => setShowSort(false)}
				/>
			)}

			{showNew && newButton.current && (
				<DropdownMenu
					anchor={newButton.current}
					align="end"
					items={[
						{
							label: 'Folder',
							icon: 'folder-plus',
							onclick: () => setDialog({ kind: 'new-folder' })
						},
						{
							label: 'Notebook',
							icon: 'page-plus',
							onclick: () => setDialog({ kind: 'new-notebook' })
						},
						{ divider: true, label: '', onclick: () => {} },
						{
							label: 'Upload PDF, EPUB or rmdoc',
							icon: 'upload',
							onclick: () => fileInput.current?.click()
						}
					]}
					onclose={() => setShowNew(false)}
				/>
			)}

			{dialog?.kind === 'rename' && (
				<PromptDialog
					title="Rename"
					initial={dialog.item.name}
					confirmLabel="Rename"
					onsubmit={(name) => run(() => renameItem(dialog.item.id, name), 'Renamed')}
					onclose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === 'new-folder' && (
				<PromptDialog
					title="New folder"
					placeholder="Folder name"
					confirmLabel="Create"
					onsubmit={(name) => run(() => createFolder(name, folderId), 'Folder created')}
					onclose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === 'new-notebook' && (
				<NewNotebookDialog
					onsubmit={(name, template) =>
						run(
							() => createNotebook(name, folderId, template.filename, template.landscape),
							'Notebook created'
						)
					}
					onclose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === 'move' && (
				<MoveDialog
					items={items}
					moving={dialog.ids}
					current={parent}
					onmove={(target) => moveTo(dialog.ids, target)}
					onclose={() => setDialog(null)}
				/>
			)}
			{dialog?.kind === 'purge' && (
				<ConfirmDialog
					title={`Delete ${dialog.ids.length === 1 ? 'this item' : `${dialog.ids.length} items`} permanently?`}
					message="The files are removed from the tablet. This cannot be undone."
					confirmLabel="Delete"
					danger
					onconfirm={() => run(() => purgeItems(dialog.ids), 'Deleted')}
					onclose={() => setDialog(null)}
				/>
			)}
		</div>
	);
}
