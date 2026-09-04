import type { LibraryItem } from '$shared/types';
import type { LibrarySort } from '$lib/stores';

export function compareItems(sort: LibrarySort) {
	return (a: LibraryItem, b: LibraryItem) => {
		if ((a.type === 'folder') !== (b.type === 'folder')) return a.type === 'folder' ? -1 : 1;
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		if (sort === 'name') return a.name.localeCompare(b.name);
		if (sort === 'size') return b.sizeKb - a.sizeKb || a.name.localeCompare(b.name);
		if (sort === 'opened') return b.lastOpened - a.lastOpened || a.name.localeCompare(b.name);
		return b.lastModified - a.lastModified || a.name.localeCompare(b.name);
	};
}

export function folderCrumbs(items: Map<string, LibraryItem>, folderId: string): LibraryItem[] {
	const chain: LibraryItem[] = [];
	const visited = new Set<string>();
	let current = items.get(folderId);
	while (current && !visited.has(current.id)) {
		visited.add(current.id);
		chain.unshift(current);
		current = items.get(current.parent);
	}
	return chain;
}
