import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { LibraryItem } from '$shared/types';
import { library } from '$lib/stores';
import { useStore } from '$lib/store';
import { formatRelative } from '$lib/utils/format';
import Icon, { itemIcon } from './Icon';

const css = `
kbd.search-modal-kbd {
	margin-right: 3px;
	border: 1px solid var(--app-border);
	border-radius: 4px;
	padding: 1px 3px;
	font-family: var(--font-mono);
	font-size: 9px;
	color: var(--app-fg-subtle);
}

.search-modal-input::placeholder {
	color: var(--app-fg-subtle);
}

.search-modal-result {
	color: var(--app-fg-muted);
}

.search-modal-result:hover,
.search-modal-result-selected {
	color: var(--app-fg);
}

.search-modal-result:hover {
	background: var(--app-hover);
}

.search-modal-result-selected {
	background: var(--app-active);
	box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--app-fg) 9%, transparent);
	font-weight: 500;
}

.search-modal-backdrop {
	animation: search-modal-backdrop-in 120ms ease-out both;
}

.search-modal-panel {
	animation: search-modal-panel-in 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes search-modal-backdrop-in {
	from {
		opacity: 0;
	}
}

@keyframes search-modal-panel-in {
	from {
		opacity: 0;
		transform: translateY(-5px) scale(0.985);
	}
}

@media (prefers-reduced-motion: reduce) {
	.search-modal-backdrop,
	.search-modal-panel {
		animation: none;
	}
}
`;

interface Props {
	open: boolean;
	onclose: () => void;
}

type Ranked = { item: LibraryItem; score: number; path: string };

export function itemPath(items: Map<string, LibraryItem>, item: LibraryItem): string {
	const names: string[] = [];
	let parent = item.parent;
	while (parent && parent !== 'trash') {
		const folder = items.get(parent);
		if (!folder) break;
		names.unshift(folder.name);
		parent = folder.parent;
	}
	if (item.parent === 'trash') names.unshift('Trash');
	return names.join(' / ');
}

export default function SearchModal({ open, onclose }: Props) {
	const navigate = useNavigate();
	const items = useStore(library);
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState(0);
	const inputEl = useRef<HTMLInputElement | null>(null);
	const listEl = useRef<HTMLDivElement | null>(null);

	const results = useMemo((): Ranked[] => {
		const normalized = query.trim().toLowerCase();
		const all = [...items.values()];
		if (!normalized) {
			return all
				.sort((a, b) => b.lastModified - a.lastModified)
				.slice(0, 50)
				.map((item) => ({ item, score: 0, path: itemPath(items, item) }));
		}
		const terms = normalized.split(/\s+/).filter(Boolean);
		return all
			.map((item) => {
				const name = item.name.toLowerCase();
				const path = itemPath(items, item);
				const searchable = `${name} ${path.toLowerCase()} ${item.tags.join(' ').toLowerCase()}`;
				let score = 0;
				for (const term of terms) {
					if (!searchable.includes(term)) return null;
					if (name.includes(term)) score += 12;
					if (path.toLowerCase().includes(term)) score += 4;
				}
				if (name === normalized) score += 40;
				else if (name.startsWith(normalized)) score += 10;
				return { item, score, path };
			})
			.filter((entry): entry is Ranked => entry !== null)
			.sort((a, b) => b.score - a.score || b.item.lastModified - a.item.lastModified);
	}, [query, items]);

	useEffect(() => {
		if (!open) return;
		setQuery('');
		setSelected(0);
		inputEl.current?.focus();
	}, [open]);

	useEffect(() => {
		const count = results.length;
		if (count === 0) {
			setSelected(0);
			return;
		}
		const next = selected >= count ? count - 1 : selected;
		if (next !== selected) setSelected(next);
		listEl.current?.querySelector<HTMLElement>(`[data-search-index="${next}"]`)?.scrollIntoView({
			block: 'nearest'
		});
	}, [results, selected]);

	function openItem(item: LibraryItem) {
		onclose();
		navigate(item.type === 'folder' ? `/library/${item.id}` : `/doc/${item.id}`);
	}

	function handleKeydown(event: ReactKeyboardEvent<HTMLInputElement>) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (results.length) setSelected((selected + 1) % results.length);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (results.length) setSelected((selected - 1 + results.length) % results.length);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const result = results[selected];
			if (result) openItem(result.item);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	return (
		<>
			<style href="search-modal-css" precedence="default">
				{css}
			</style>
			{open && (
				<div
					className="search-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-[12px]"
					role="presentation"
					onClick={onclose}
				>
					<div
						className="search-modal-panel app-theme app-surface app-popover-radius flex w-full max-w-[520px] flex-col overflow-hidden border shadow-xl"
						role="dialog"
						aria-modal="true"
						tabIndex={-1}
						aria-label="Search"
						onClick={(event) => event.stopPropagation()}
						onKeyDown={() => {}}
					>
						<div className="flex h-[42px] items-center gap-[8px] px-[8px]">
							<Icon name="search" size={16} class="shrink-0 app-icon-muted" />
							<input
								ref={inputEl}
								value={query}
								onChange={(event) => setQuery(event.currentTarget.value)}
								onKeyDown={handleKeydown}
								className="search-modal-input min-w-0 flex-1 bg-transparent text-[13px] outline-none"
								placeholder="Search documents and folders"
								aria-label="Search documents and folders"
							/>
							{query && (
								<button
									className="app-icon-muted app-interactive flex size-[20px] shrink-0 items-center justify-center rounded-md transition-colors"
									onClick={() => {
										setQuery('');
										inputEl.current?.focus();
									}}
									aria-label="Clear search"
								>
									<Icon name="xmark" size={12} />
								</button>
							)}
						</div>

						<div className="app-divider h-px w-full"></div>

						<div
							ref={listEl}
							className="max-h-[50vh] overflow-y-auto p-[4px] scrollbar-hover"
							role="listbox"
							aria-label="Results"
						>
							{results.length === 0 ? (
								<div className="app-muted px-[10px] py-[32px] text-center text-[12px]">
									No results
								</div>
							) : (
								results.map((result, index) => (
									<button
										key={result.item.id}
										data-search-index={index}
										className={`search-modal-result flex h-[30px] w-full items-center gap-[6px] rounded-[7px] px-[8px] text-left transition-colors duration-75 ${
											index === selected ? 'search-modal-result-selected' : ''
										}`}
										onMouseEnter={() => setSelected(index)}
										onClick={() => openItem(result.item)}
										role="option"
										aria-selected={index === selected}
									>
										<Icon name={itemIcon(result.item.type)} size={14} class="app-icon-muted" />
										<span className="min-w-0 flex-1 flex items-baseline gap-2">
											<span className="truncate text-[13px]">{result.item.name}</span>
											{result.path && (
												<span className="app-icon-muted truncate text-[10px]">{result.path}</span>
											)}
										</span>
										<span className="app-icon-muted shrink-0 text-[10px] tabular-nums">
											{formatRelative(result.item.lastModified)}
										</span>
									</button>
								))
							)}
						</div>

						<div className="app-divider h-px w-full"></div>
						<div className="app-icon-muted flex h-[28px] items-center justify-between px-[12px] text-[10px]">
							<span>{results.length} items</span>
							<span className="hidden items-center gap-[10px] sm:flex">
								<span>
									<kbd className="search-modal-kbd">↑↓</kbd> navigate
								</span>
								<span>
									<kbd className="search-modal-kbd">↵</kbd> open
								</span>
								<span>
									<kbd className="search-modal-kbd">esc</kbd> close
								</span>
							</span>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
