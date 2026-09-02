import type { MouseEvent } from 'react';

interface Props {
	value: boolean;
	onchange?: (value: boolean) => void;
	disabled?: boolean;
	ariaLabel?: string;
}

export default function ToggleSwitch({
	value,
	onchange,
	disabled = false,
	ariaLabel = 'Toggle'
}: Props) {
	function toggle(event: MouseEvent) {
		event.stopPropagation();
		onchange?.(!value);
	}

	return (
		<button
			type="button"
			className={`relative w-7 h-4 rounded-full transition-colors duration-150 shrink-0
			${value ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-gray-700'}`}
			onClick={toggle}
			disabled={disabled}
			role="switch"
			aria-checked={value}
			aria-label={ariaLabel}
		>
			<span
				className={`absolute top-[0.125rem] w-3 h-3 rounded-full transition-all duration-150
				${value ? 'left-[0.875rem] bg-white dark:bg-black' : 'left-[0.125rem] bg-white dark:bg-gray-500'}`}
			></span>
		</button>
	);
}
