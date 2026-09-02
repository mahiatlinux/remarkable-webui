import type { ReactNode } from 'react';
import { sidebarOpen } from '$lib/stores';
import { useStore } from '$lib/store';

interface Props {
	children: ReactNode;
}

export default function PageHeader({ children }: Props) {
	const open = useStore(sidebarOpen);
	return (
		<header
			className={`flex items-center gap-1.5 h-10 pr-2 shrink-0 border-b border-gray-200 dark:border-white/6 ${
				open ? 'pl-3' : 'pl-11'
			}`}
		>
			{children}
		</header>
	);
}

export function ToolButton({
	icon,
	label,
	onclick,
	active = false,
	disabled = false,
	ref
}: {
	icon: ReactNode;
	label: string;
	onclick?: () => void;
	active?: boolean;
	disabled?: boolean;
	ref?: React.Ref<HTMLButtonElement>;
}) {
	return (
		<button
			ref={ref}
			className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors duration-100 disabled:opacity-30 disabled:pointer-events-none ${
				active
					? 'bg-gray-200/50 dark:bg-white/8 text-gray-900 dark:text-white'
					: 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6'
			}`}
			onClick={onclick}
			aria-label={label}
			title={label}
			disabled={disabled}
		>
			{icon}
		</button>
	);
}

export function EmptyState({
	icon,
	title,
	hint
}: {
	icon: ReactNode;
	title: string;
	hint?: ReactNode;
}) {
	return (
		<div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
			<span className="app-icon-muted">{icon}</span>
			<span className="text-sm text-gray-700 dark:text-gray-300">{title}</span>
			{hint && <span className="text-xs text-gray-400 dark:text-gray-600 max-w-sm">{hint}</span>}
		</div>
	);
}
