import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { TemplateInfo } from '$shared/types';
import { getTemplates } from '$lib/apis/system';
import Modal from '../Modal';
import Spinner from '../common/Spinner';
import TemplatePreview from '../templates/TemplatePreview';

interface Props {
	onsubmit: (name: string, template: TemplateInfo) => Promise<void>;
	onclose: () => void;
}

const BLANK: TemplateInfo = {
	name: 'Blank',
	filename: 'Blank',
	iconCode: '',
	categories: [],
	landscape: false,
	file: null
};

export default function NewNotebookDialog({ onsubmit, onclose }: Props) {
	const [name, setName] = useState('Notebook');
	const [templates, setTemplates] = useState<TemplateInfo[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [landscape, setLandscape] = useState(false);
	const [category, setCategory] = useState('all');
	const [selected, setSelected] = useState<TemplateInfo>(BLANK);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		getTemplates()
			.then((list) => setTemplates(list.filter((template) => !template.id)))
			.catch((err: Error) => {
				setTemplates([]);
				setError(err.message);
			});
	}, []);

	const categories = useMemo(
		() => [...new Set((templates ?? []).flatMap((template) => template.categories))].sort(),
		[templates]
	);

	const visible = useMemo(() => {
		const list = (templates ?? []).filter(
			(template) =>
				template.landscape === landscape &&
				(category === 'all' || template.categories.includes(category))
		);
		const blank = list.find((template) => template.filename === 'Blank') ?? {
			...BLANK,
			landscape
		};
		return [blank, ...list.filter((template) => template.filename !== 'Blank')];
	}, [templates, landscape, category]);

	useEffect(() => {
		if (!visible.some((template) => template === selected)) setSelected(visible[0]);
	}, [visible, selected]);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setBusy(true);
		try {
			await onsubmit(trimmed, selected);
			onclose();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal onclose={onclose} class="w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
			<form onSubmit={submit} className="flex flex-col min-h-0">
				<div className="flex items-center gap-2 px-4 pt-4 pb-3 shrink-0">
					<h2 className="text-sm text-gray-900 dark:text-white shrink-0">New notebook</h2>
					<input
						autoFocus
						value={name}
						placeholder="Notebook name"
						className="app-input flex-1 min-w-0 h-8 px-3 rounded-full text-xs"
						onFocus={(event) => event.currentTarget.select()}
						onChange={(event) => setName(event.currentTarget.value)}
					/>
					<div className="flex gap-0.5 shrink-0">
						{[false, true].map((value) => (
							<button
								key={String(value)}
								type="button"
								className={`h-7 px-2 rounded-full text-xs transition-colors ${
									landscape === value
										? 'bg-gray-200/50 dark:bg-white/8 text-gray-900 dark:text-white font-medium'
										: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
								}`}
								onClick={() => setLandscape(value)}
							>
								{value ? 'Landscape' : 'Portrait'}
							</button>
						))}
					</div>
				</div>
				<div className="flex gap-1 px-4 pb-3 shrink-0 overflow-x-auto scrollbar-none">
					{['all', ...categories].map((entry) => (
						<button
							key={entry}
							type="button"
							className={`h-6 px-2 rounded-full text-[0.6875rem] shrink-0 transition-colors ${
								category === entry
									? 'bg-gray-100 dark:bg-white/6 text-gray-900 dark:text-white font-medium'
									: 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
							}`}
							onClick={() => setCategory(entry)}
						>
							{entry === 'all' ? 'All' : entry}
						</button>
					))}
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover px-4 pt-1 pb-4">
					{templates === null ? (
						<div className="flex items-center justify-center h-32">
							<Spinner size={18} />
						</div>
					) : (
						<div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
							{visible.map((template) => {
								const active = template === selected;
								return (
									<button
										key={`${template.filename}-${template.landscape}`}
										type="button"
										className={`flex flex-col gap-1.5 p-2 rounded-xl border text-left transition-colors ${
											active
												? 'bg-gray-200/60 dark:bg-white/10 ring-1 ring-gray-300 dark:ring-white/15'
												: 'hover:bg-gray-100 dark:hover:bg-white/5'
										}`}
										onMouseDown={(event) => event.preventDefault()}
										onClick={() => setSelected(template)}
										onDoubleClick={(event) => {
											setSelected(template);
											void submit(event);
										}}
									>
										<div
											className={`page-paper w-full overflow-hidden rounded-md ${
												template.landscape ? 'aspect-[4/3]' : 'aspect-[3/4]'
											}`}
										>
											<TemplatePreview template={template} className="w-full h-full" />
										</div>
										<span className="text-[0.6875rem] text-gray-700 dark:text-gray-300 truncate w-full">
											{template.name}
										</span>
									</button>
								);
							})}
						</div>
					)}
					{error && <p className="text-[0.6875rem] text-gray-400 mt-2">{error}</p>}
				</div>
				<div className="flex items-center gap-2 px-4 py-3 shrink-0 border-t border-gray-200 dark:border-white/6">
					<span className="text-xs app-muted truncate flex-1">Template: {selected.name}</span>
					<button
						type="button"
						className="app-button-ghost h-7 px-3 rounded-full text-xs"
						onClick={onclose}
					>
						Cancel
					</button>
					<button
						type="submit"
						className="app-button h-7 px-3 rounded-full text-xs font-extrabold"
						disabled={busy || !name.trim()}
					>
						Create
					</button>
				</div>
			</form>
		</Modal>
	);
}
