import type { DragEvent, MouseEvent } from 'react';
import type { LibraryItem } from '$shared/types';
import ItemCard from './ItemCard';

interface Props {
	items: LibraryItem[];
	view: 'grid' | 'list';
	thumbnails: boolean;
	selected: Set<string>;
	onselect: (item: LibraryItem, event: MouseEvent) => void;
	onopen: (item: LibraryItem) => void;
	oncontextmenu: (event: MouseEvent, item: LibraryItem) => void;
	ondragstart: (item: LibraryItem, event: DragEvent) => void;
	onmove: (ids: string[], target: string) => Promise<void>;
}

export default function LibraryItems({
	items,
	view,
	thumbnails,
	selected,
	onselect,
	onopen,
	oncontextmenu,
	ondragstart,
	onmove
}: Props) {
	function card(item: LibraryItem) {
		return (
			<ItemCard
				key={item.id}
				item={item}
				view={view}
				thumbnails={thumbnails}
				selected={selected.has(item.id)}
				onselect={(event) => onselect(item, event)}
				onopen={() => onopen(item)}
				oncontextmenu={(event) => oncontextmenu(event, item)}
				ondragstart={(event) => ondragstart(item, event)}
				ondropitems={(ids) => void onmove(ids, item.id)}
			/>
		);
	}
	if (view === 'list')
		return (
			<div className="p-3 min-w-[540px]">
				<div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem_6rem_5rem] gap-3 px-3 h-8 items-center text-[0.625rem] app-muted">
					<span>Name</span>
					<span>Type</span>
					<span>Pages</span>
					<span>Modified</span>
					<span className="text-right">Size</span>
				</div>
				{items.map(card)}
			</div>
		);
	const folders = items.filter((item) => item.type === 'folder');
	const documents = items.filter((item) => item.type !== 'folder');
	return (
		<div className="p-4 flex flex-col gap-5">
			{folders.length > 0 && (
				<section>
					<h2 className="library-section-label">
						Folders <span>{folders.length}</span>
					</h2>
					<div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
						{folders.map(card)}
					</div>
				</section>
			)}
			{documents.length > 0 && (
				<section>
					<h2 className="library-section-label">
						Documents <span>{documents.length}</span>
					</h2>
					<div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
						{documents.map(card)}
					</div>
				</section>
			)}
		</div>
	);
}
