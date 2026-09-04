import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { sidebarOpen, sidebarWidth } from '$lib/stores';
import { useStore } from '$lib/store';
import SidebarFooter from './SidebarFooter';
import SidebarHeader from './SidebarHeader';
import SidebarNav from './SidebarNav';
import type { SettingsTab } from './SettingsModal';

const css = `
.sidebar {
	position: fixed;
	left: 0;
	top: var(--app-titlebar-height);
	bottom: 0;
	width: var(--sw, 220px);
	max-width: 100vw;
	z-index: 50;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	background: var(--app-page);
	color: var(--app-fg);
	border-right: 1px solid var(--app-border);
	padding-top: env(safe-area-inset-top, 0);
	transform: translateX(0);
	transition:
		width 180ms cubic-bezier(0.16, 1, 0.3, 1),
		flex-basis 180ms cubic-bezier(0.16, 1, 0.3, 1),
		transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
	will-change: width, flex-basis, transform;
}

.sidebar.closed {
	transform: translateX(-100%);
	pointer-events: none;
}

.sidebar-content {
	display: flex;
	flex: 1 0 auto;
	box-sizing: border-box;
	flex-direction: column;
	width: var(--sw, 220px);
	min-width: var(--sw, 220px);
	min-height: 0;
	opacity: 1;
	transition:
	opacity 120ms ease;
}

.sidebar.closed .sidebar-content {
	opacity: 0;
	transition:
	opacity 90ms ease;
}

.sidebar-backdrop {
	background: rgb(0 0 0 / 0.42);
}

@media (min-width: 768px) {
	.sidebar {
		position: relative;
		top: 0;
		z-index: auto;
		width: var(--sw, 220px);
		flex: 0 0 var(--sw, 220px);
		border-right: 0;
		transform: translateX(0);
		transition:
			width 180ms cubic-bezier(0.16, 1, 0.3, 1),
			flex-basis 180ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.sidebar.closed {
		width: 0;
		flex-basis: 0;
		transform: translateX(0);
	}
}

.resize-handle {
	display: none;
}

@media (min-width: 768px) {
	.resize-handle {
		display: block;
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 0.25rem;
		cursor: col-resize;
		z-index: 10;
		transition: background 0.15s;
	}

	.resize-handle:hover,
	.resize-handle.active {
		background: var(--app-active);
	}
}

@media (prefers-reduced-motion: reduce) {
	.sidebar,
	.sidebar-content,
	.sidebar button:not(:disabled),
	.sidebar a {
		transition: none;
		animation: none;
	}
}
`;

export default function Sidebar({
	onsearch,
	onsettings
}: {
	onsearch: () => void;
	onsettings: (tab?: SettingsTab) => void;
}) {
	const open = useStore(sidebarOpen);
	const width = useStore(sidebarWidth);

	const MIN_WIDTH = 160;
	const MAX_WIDTH = 400;
	const [isResizing, setIsResizing] = useState(false);

	function startResize(e: ReactPointerEvent) {
		if (window.innerWidth < 768) return;
		e.preventDefault();
		setIsResizing(true);
		const startX = e.clientX;
		const startWidth = sidebarWidth.get();

		function onMove(ev: PointerEvent) {
			const delta = ev.clientX - startX;
			sidebarWidth.set(Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))));
		}

		function onUp() {
			setIsResizing(false);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		}

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}

	return (
		<>
			<style href="sidebar-css" precedence="default">
				{css}
			</style>

			{open && (
				<button
					className="sidebar-backdrop fixed inset-0 z-40 cursor-default md:hidden"
					onClick={() => sidebarOpen.set(false)}
					aria-label="Close sidebar"
				></button>
			)}

			<aside
				id="app-sidebar"
				inert={!open}
				className={`sidebar ${!open ? 'closed' : ''}`}
				style={{ '--sw': `${width}px` } as CSSProperties}
				aria-hidden={!open}
			>
				<div
					className={`resize-handle ${isResizing ? 'active' : ''}`}
					role="separator"
					aria-orientation="vertical"
					onPointerDown={startResize}
					onDoubleClick={() => sidebarWidth.set(220)}
				></div>
				<div className="sidebar-content">
					<SidebarHeader />
					<SidebarNav onopensearch={onsearch} />
					<SidebarFooter onsettings={onsettings} />
				</div>
			</aside>
		</>
	);
}
