import { useMemo, useState } from 'react';
import type { LibraryItem } from '$shared/types';
import Icon from '../Icon';
import Modal from '../Modal';

interface Props {
	items: Map<string, LibraryItem>;
	moving: string[];
	current: string;
	onmove: (parent: string) => Promise<void>;
	onclose: () => void;
}

interface Row {
	id: string;
	name: string;
	depth: number;
}

export default function MoveDialog({ items, moving, current, onmove, onclose }: Props) {
	const [target, setTarget] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const rows = useMemo((): Row[] => {
		const excluded = new Set(moving);
		const grow = (id: string) => {
			for (const item of items.values()) {
				if (item.parent === id && !excluded.has(item.id)) {
					excluded.add(item.id);
					grow(item.id);
				}
			}
		};
		for (const id of moving) grow(id);
		const result: Row[] = [{ id: '', name: 'My files', depth: 0 }];
		const walk = (parent: string, depth: number) => {
			const folders = [...items.values()]
				.filter(
					(item) => item.type === 'folder' && item.parent === parent && !excluded.has(item.id)
				)
				.sort((a, b) => a.name.localeCompare(b.name));
			for (const folder of folders) {
				result.push({ id: folder.id, name: folder.name, depth });
				walk(folder.id, depth + 1);
			}
		};
		walk('', 1);
		return result;
	}, [items, moving]);

	async function move(destination = target) {
		if (destination === null) return;
		setBusy(true);
		try {
			await onmove(destination);
			onclose();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal onclose={onclose} class="w-full max-w-sm mx-4 flex flex-col max-h-[70vh]">
			<div className="px-4 pt-4 pb-2">
				<h2 className="text-sm font-medium text-gray-900 dark:text-white">
					Move {moving.length === 1 ? 'item' : `${moving.length} items`}
				</h2>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover px-2">
				{rows.map((row) => {
					const disabled = row.id === current;
					return (
						<button
							key={row.id}
							className={`flex items-center gap-2 w-full h-7 rounded-lg text-xs text-left transition-colors duration-75 disabled:opacity-40 ${
								target === row.id
									? 'bg-gray-200/60 dark:bg-white/10 text-gray-900 dark:text-white'
									: 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
							}`}
							style={{ paddingLeft: `${0.5 + row.depth * 0.9}rem` }}
							disabled={disabled}
							onClick={() => setTarget(row.id)}
							onDoubleClick={() => !disabled && move(row.id)}
						>
							<Icon name={row.id ? 'folder' : 'home'} size={13} />
							<span className="truncate">{row.name}</span>
							{disabled && <span className="ml-auto pr-2 text-[0.625rem]">current</span>}
						</button>
					);
				})}
			</div>
			<div className="flex justify-end gap-1.5 p-4">
				<button className="app-button-ghost h-7 px-3 rounded-lg text-xs" onClick={onclose}>
					Cancel
				</button>
				<button
					className="app-button h-7 px-3 rounded-lg text-xs font-medium"
					disabled={target === null || busy}
					onClick={() => move()}
				>
					Move here
				</button>
			</div>
		</Modal>
	);
}
