interface Props {
	size?: number;
	class?: string;
}

export default function Spinner({ size = 16, class: className = '' }: Props) {
	const borderWidth = size <= 12 ? 1.5 : 2;

	return (
		<>
			<style href="spinner" precedence="default">{`
.spinner {
	display: inline-block;
	border-style: solid;
	border-color: var(--color-gray-300);
	border-top-color: var(--color-gray-600);
	border-radius: 624.9375rem;
	animation: spin 0.75s linear infinite;
	flex-shrink: 0;
}

.dark .spinner {
	border-color: var(--color-gray-700);
	border-top-color: var(--color-gray-400);
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
`}</style>
			<div
				className={`spinner ${className}`}
				style={{ width: `${size}px`, height: `${size}px`, borderWidth: `${borderWidth}px` }}
				role="status"
				aria-label="Loading"
			></div>
		</>
	);
}
