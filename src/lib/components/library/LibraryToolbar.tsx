import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LibraryItem } from '$shared/types';
import { useStore } from '$lib/store';
import { libraryLoading, librarySort, libraryView, type LibrarySort } from '$lib/stores';
import { loadLibrary } from '$lib/apis/library';
import DropdownMenu from '../DropdownMenu';
import Icon from '../Icon';
import PageHeader, { ToolButton } from '../common/PageHeader';
import Spinner from '../common/Spinner';
import { ITEMS_MIME } from './ItemCard';
import type { LibraryDialog } from './LibraryDialogs';

const SORT_LABEL: Record<LibrarySort, string> = {
	name: 'Name',
	modified: 'Last modified',
	opened: 'Last opened',
	size: 'Size'
};

export default function LibraryToolbar({
	folderId,
	crumbs,
	selectedCount,
	children,
	setDialog,
	moveTo,
	onupload
}: {
	folderId: string;
	crumbs: LibraryItem[];
	selectedCount: number;
	children: LibraryItem[];
	setDialog: (dialog: LibraryDialog) => void;
	moveTo: (ids: string[], target: string) => Promise<void>;
	onupload: () => void;
}) {
	const navigate = useNavigate();
	const inTrash = folderId === 'trash';
	const view = useStore(libraryView);
	const sort = useStore(librarySort);
	const loading = useStore(libraryLoading);
	const [showSort, setShowSort] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const sortButton = useRef<HTMLButtonElement | null>(null);
	const newButton = useRef<HTMLButtonElement | null>(null);
	return (
		<>
			<PageHeader>
				<nav className="flex items-center gap-0.5 min-w-0 text-xs">
					<button
						className={`flex items-center gap-1 h-7 px-1.5 rounded-full transition-colors ${
							!folderId ? 'page-title' : 'app-button-ghost'
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
							<span className="px-1.5 page-title">Trash</span>
						</>
					)}
					{crumbs.map((crumb, index) => (
						<span key={crumb.id} className="flex items-center gap-0.5 min-w-0">
							<Icon name="chevron-right" size={12} class="app-icon-muted" />
							<button
								className={`h-7 px-1.5 rounded-full truncate max-w-[12rem] transition-colors ${
									index === crumbs.length - 1 ? 'page-title' : 'app-button-ghost'
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
					{selectedCount > 0 && (
						<span className="text-[0.6875rem] app-muted mr-1 tabular-nums">
							{selectedCount} selected
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
							className="app-button-ghost flex items-center gap-1.5 h-7 px-2 rounded-full text-xs"
							disabled={children.length === 0}
							onClick={() => setDialog({ kind: 'purge', ids: children.map((item) => item.id) })}
						>
							<Icon name="trash" size={13} />
							Empty trash
						</button>
					) : (
						<button
							ref={newButton}
							className="app-button flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-extrabold ml-1"
							onClick={() => setShowNew(true)}
						>
							<Icon name="plus" size={13} />
							New
						</button>
					)}
				</div>
			</PageHeader>
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
							onclick: onupload
						}
					]}
					onclose={() => setShowNew(false)}
				/>
			)}
		</>
	);
}
