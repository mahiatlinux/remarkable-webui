interface Props {
	text: string;
	class?: string;
}

export default function KeyPill({ text, class: className = '' }: Props) {
	return (
		<>
			<style href="key-pill" precedence="default">{`
.key-pill {
	background: var(--app-hover);
	color: var(--app-fg-muted);
}
`}</style>
			<span
				className={`key-pill inline-flex items-center justify-center h-[1.125rem] px-[0.3125rem] rounded-full text-[0.625rem] font-medium leading-none ${className}`}
			>
				{text}
			</span>
		</>
	);
}
