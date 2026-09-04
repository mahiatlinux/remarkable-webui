import { useEffect, useState, type MouseEvent } from 'react';
import type { LibraryItem } from '$shared/types';
import { activeDeviceId } from '$lib/stores';
import { useStore } from '$lib/store';

export function useLibrarySelection(parent: string, children: LibraryItem[]) {
	const device = useStore(activeDeviceId);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [anchor, setAnchor] = useState<string | null>(null);
	useEffect(() => {
		setSelected(new Set());
		setAnchor(null);
	}, [parent, device]);
	useEffect(() => {
		const ids = new Set(children.map((item) => item.id));
		setSelected((current) => {
			const next = new Set([...current].filter((id) => ids.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [children]);
	function select(item: LibraryItem, event: MouseEvent) {
		event.stopPropagation();
		const ids = children.map((entry) => entry.id);
		if (event.shiftKey && anchor && ids.includes(anchor)) {
			const from = ids.indexOf(anchor);
			const to = ids.indexOf(item.id);
			setSelected(new Set(ids.slice(Math.min(from, to), Math.max(from, to) + 1)));
			return;
		}
		setSelected((current) => {
			if (!(event.metaKey || event.ctrlKey)) return new Set([item.id]);
			const next = new Set(current);
			if (next.has(item.id)) next.delete(item.id);
			else next.add(item.id);
			return next;
		});
		setAnchor(item.id);
	}
	return { selected, setSelected, setAnchor, select };
}
