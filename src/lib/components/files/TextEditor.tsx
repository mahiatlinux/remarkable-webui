import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { readText, writeText } from '$lib/apis/fs';
import Icon from '../Icon';
import Spinner from '../common/Spinner';

interface Props {
	path: string;
	onclose: () => void;
}

export default function TextEditor({ path, onclose }: Props) {
	const [text, setText] = useState<string | null>(null);
	const [original, setOriginal] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const dirty = text !== null && text !== original;

	useEffect(() => {
		let cancelled = false;
		readText(path)
			.then((content) => {
				if (cancelled) return;
				setText(content);
				setOriginal(content);
			})
			.catch((err: Error) => !cancelled && setError(err.message));
		return () => {
			cancelled = true;
		};
	}, [path]);

	async function save() {
		if (text === null) return;
		setSaving(true);
		try {
			await writeText(path, text);
			setOriginal(text);
			toast.success('Saved');
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setSaving(false);
		}
	}

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key === 's') {
				event.preventDefault();
				void save();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	return (
		<div className="absolute inset-0 z-10 flex flex-col app-theme">
			<div className="flex items-center gap-2 h-9 px-3 border-b border-gray-200 dark:border-white/6 shrink-0">
				<Icon name="page-text" size={14} class="app-icon-muted" />
				<span className="text-xs font-mono truncate min-w-0 text-gray-900 dark:text-white">
					{path}
				</span>
				{dirty && <span className="text-[0.625rem] app-muted">modified</span>}
				<div className="ml-auto flex items-center gap-1">
					<button
						className="app-button h-7 px-3 rounded-lg text-xs font-medium"
						disabled={!dirty || saving}
						onClick={save}
					>
						{saving ? 'Saving…' : 'Save'}
					</button>
					<button className="app-button-ghost h-7 px-3 rounded-lg text-xs" onClick={onclose}>
						Close
					</button>
				</div>
			</div>
			{error ? (
				<div className="flex-1 flex items-center justify-center text-xs text-gray-500">{error}</div>
			) : text === null ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner size={18} />
				</div>
			) : (
				<textarea
					className="flex-1 w-full resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none scrollbar-hover"
					value={text}
					spellCheck={false}
					onChange={(event) => setText(event.currentTarget.value)}
				/>
			)}
		</div>
	);
}
