import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Modal from '../Modal';

interface ConfirmProps {
	title: string;
	message: ReactNode;
	confirmLabel?: string;
	danger?: boolean;
	onconfirm: () => void | Promise<void>;
	onclose: () => void;
}

export function ConfirmDialog({
	title,
	message,
	confirmLabel = 'Confirm',
	danger = false,
	onconfirm,
	onclose
}: ConfirmProps) {
	const [busy, setBusy] = useState(false);

	async function confirm() {
		setBusy(true);
		try {
			await onconfirm();
			onclose();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal onclose={onclose} class="w-full max-w-sm mx-4 p-4">
			<h2 className="text-sm text-gray-900 dark:text-white">{title}</h2>
			<div className="text-xs text-gray-500 mt-2 leading-relaxed">{message}</div>
			<div className="flex justify-end gap-1.5 mt-4">
				<button
					className="app-button-ghost h-7 px-3 rounded-full text-xs transition-colors"
					onClick={onclose}
				>
					Cancel
				</button>
				<button
					className={`${danger ? 'app-button-danger' : 'app-button'} h-7 px-3 rounded-full text-xs font-extrabold transition-colors`}
					onClick={confirm}
					disabled={busy}
					autoFocus
				>
					{confirmLabel}
				</button>
			</div>
		</Modal>
	);
}

interface PromptProps {
	title: string;
	label?: string;
	initial?: string;
	placeholder?: string;
	confirmLabel?: string;
	selectBase?: boolean;
	onsubmit: (value: string) => void | Promise<void>;
	onclose: () => void;
}

export function PromptDialog({
	title,
	label,
	initial = '',
	placeholder,
	confirmLabel = 'Save',
	selectBase = false,
	onsubmit,
	onclose
}: PromptProps) {
	const [value, setValue] = useState(initial);
	const [busy, setBusy] = useState(false);
	const inputEl = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		const input = inputEl.current;
		if (!input) return;
		input.focus();
		const dot = initial.lastIndexOf('.');
		if (selectBase && dot > 0) input.setSelectionRange(0, dot);
		else input.select();
	}, []);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		setBusy(true);
		try {
			await onsubmit(trimmed);
			onclose();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal onclose={onclose} class="w-full max-w-sm mx-4 p-4">
			<form onSubmit={submit}>
				<h2 className="text-sm text-gray-900 dark:text-white">{title}</h2>
				{label && <label className="block text-xs text-gray-500 mt-2">{label}</label>}
				<input
					ref={inputEl}
					value={value}
					placeholder={placeholder}
					className="app-input w-full h-8 px-3 mt-2 rounded-full text-xs"
					onChange={(event) => setValue(event.currentTarget.value)}
				/>
				<div className="flex justify-end gap-1.5 mt-4">
					<button
						type="button"
						className="app-button-ghost h-7 px-3 rounded-full text-xs transition-colors"
						onClick={onclose}
					>
						Cancel
					</button>
					<button
						type="submit"
						className="app-button h-7 px-3 rounded-full text-xs font-extrabold transition-colors"
						disabled={busy || !value.trim()}
					>
						{confirmLabel}
					</button>
				</div>
			</form>
		</Modal>
	);
}
