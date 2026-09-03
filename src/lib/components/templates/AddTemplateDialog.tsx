import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { TemplateInput } from '$shared/types';
import Icon from '../Icon';
import Modal from '../Modal';

interface Props {
	onsubmit: (input: TemplateInput) => Promise<void>;
	onclose: () => void;
}

interface Draft {
	source: string;
	filename: string;
}

interface ParsedTemplate {
	name?: unknown;
	categories?: unknown;
	orientation?: unknown;
	items?: unknown;
}

const field = 'app-input w-full h-8 px-3 rounded-full text-xs';
const labelClass = 'block text-[0.6875rem] text-gray-400 dark:text-gray-600 mb-1';

export default function AddTemplateDialog({ onsubmit, onclose }: Props) {
	const [draft, setDraft] = useState<Draft | null>(null);
	const [name, setName] = useState('');
	const [categories, setCategories] = useState('Custom');
	const [landscape, setLandscape] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const fileInput = useRef<HTMLInputElement | null>(null);

	async function pick(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		const source = await file.text();
		let doc: ParsedTemplate;
		try {
			doc = JSON.parse(source) as ParsedTemplate;
		} catch {
			setError(`${file.name} is not valid JSON`);
			return;
		}
		if (!doc || !Array.isArray(doc.items)) {
			setError(`${file.name} has no items array`);
			return;
		}
		setError(null);
		setDraft({ source, filename: file.name });
		setName(
			typeof doc.name === 'string' && doc.name ? doc.name : file.name.replace(/\.[^.]+$/, '')
		);
		if (Array.isArray(doc.categories) && doc.categories.length) {
			setCategories(doc.categories.join(', '));
		}
		setLandscape(doc.orientation === 'landscape');
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!draft || !name.trim()) return;
		setBusy(true);
		try {
			await onsubmit({
				name: name.trim(),
				categories: categories
					.split(',')
					.map((entry) => entry.trim())
					.filter(Boolean),
				landscape,
				source: draft.source
			});
			onclose();
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal onclose={onclose} class="w-full max-w-sm mx-4 p-4">
			<form onSubmit={submit} className="flex flex-col gap-3">
				<h2 className="text-sm text-gray-900 dark:text-white">Add template</h2>
				<button
					type="button"
					className="app-button-ghost flex items-center gap-2 h-10 px-4 rounded-2xl border border-dashed text-xs"
					onClick={() => fileInput.current?.click()}
				>
					<Icon name={draft ? 'page-text' : 'upload'} size={14} />
					<span className="truncate">{draft ? draft.filename : 'Choose a .template file'}</span>
				</button>
				<input
					ref={fileInput}
					type="file"
					accept=".template,.json,application/json"
					className="hidden"
					onChange={pick}
				/>
				<div>
					<label className={labelClass}>Name</label>
					<input
						className={field}
						value={name}
						placeholder="My template"
						onChange={(event) => setName(event.currentTarget.value)}
					/>
				</div>
				<div>
					<label className={labelClass}>Categories</label>
					<input
						className={field}
						value={categories}
						placeholder="Custom, Grids"
						onChange={(event) => setCategories(event.currentTarget.value)}
					/>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-[0.6875rem] text-gray-400 dark:text-gray-600">Orientation</span>
					<div className="flex gap-0.5">
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
				<p className="text-[0.6875rem] text-gray-400 dark:text-gray-600 leading-relaxed">
					Vector template JSON as the tablet uses since firmware 3.17. It is stored with the
					notebooks and survives software updates. PNG and SVG images cannot be installed this way.
				</p>
				{error && <p className="text-[0.6875rem] text-red-500">{error}</p>}
				<div className="flex justify-end gap-1.5">
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
						disabled={busy || !draft || !name.trim()}
					>
						{busy ? 'Adding…' : 'Add'}
					</button>
				</div>
			</form>
		</Modal>
	);
}
