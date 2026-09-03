import { useEffect, type ReactNode } from 'react';

interface Props {
	onclose: () => void;
	class?: string;
	overlayClass?: string;
	children: ReactNode;
}

export default function Modal({
	onclose,
	class: className = '',
	overlayClass = 'bg-black/50 items-center justify-center',
	children
}: Props) {
	useEffect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') onclose();
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	}, [onclose]);

	return (
		<div
			className={`fixed inset-0 z-[100] flex ${overlayClass}`}
			onMouseDown={onclose}
			onKeyDown={() => {}}
		>
			<div
				className={`app-theme app-surface app-shell-radius border overflow-visible shadow-2xl ${className}`}
				onMouseDown={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				{children}
			</div>
		</div>
	);
}
