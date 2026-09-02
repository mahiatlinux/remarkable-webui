import {
	useEffect,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent
} from 'react';
import { sidebarOpen, sidebarWidth } from '$lib/stores';
import { useStore } from '$lib/store';
import SidebarFooter from './SidebarFooter';
import SidebarHeader from './SidebarHeader';
import SidebarNav from './SidebarNav';
import SearchModal from './SearchModal';
import SettingsModal, { type SettingsTab } from './SettingsModal';
import { tooltip } from '$lib/tooltip';

const css = `
.sidebar {
	position: fixed;
	left: 0;
	top: 0;
	bottom: 0;
	width: var(--sw, 220px);
	max-width: 100vw;
	z-index: 50;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	background: var(--app-sidebar);
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
	border-right-color: transparent;
}

.sidebar-content {
	display: flex;
	flex: 1 0 auto;
	flex-direction: column;
	width: var(--sw, 220px);
	min-width: var(--sw, 220px);
	min-height: 0;
	opacity: 1;
	filter: blur(0);
	transition:
		opacity 140ms 60ms ease,
		filter 180ms 40ms ease;
}

.sidebar.closed .sidebar-content {
	opacity: 0;
	filter: blur(3px);
	transition:
		opacity 90ms ease,
		filter 120ms ease;
}

.sidebar-backdrop {
	background: rgb(0 0 0 / 0.42);
	animation: sidebar-backdrop-in 140ms linear both;
}

.sidebar-reopen {
	position: fixed;
	left: max(0.75rem, env(safe-area-inset-left, 0px));
	top: calc(env(safe-area-inset-top, 0px) + 0.25rem);
	z-index: 60;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.75rem;
	height: 1.75rem;
	padding: 0;
	border: 0;
	border-radius: 0.75rem;
	background: transparent;
	color: var(--app-fg-subtle);
	cursor: pointer;
	animation: sidebar-reopen-in 120ms ease-out both;
	transition:
		color 120ms ease,
		background-color 120ms ease,
		opacity 120ms ease;
}

.sidebar-icon {
	display: block;
	width: 0.875rem;
	height: 0.875rem;
	background-color: currentColor;
	-webkit-mask-position: center;
	mask-position: center;
	-webkit-mask-repeat: no-repeat;
	mask-repeat: no-repeat;
	-webkit-mask-size: contain;
	mask-size: contain;
}

.sidebar-icon-open {
	-webkit-mask-image: url('/icons/panel-left-open.svg');
	mask-image: url('/icons/panel-left-open.svg');
}

.sidebar-reopen:hover {
	background: var(--app-hover);
	color: var(--app-fg);
}

.sidebar-reopen:active {
	opacity: 0.68;
}

@keyframes sidebar-backdrop-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@keyframes sidebar-reopen-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.dark .sidebar:not(.closed) {
	border-right-color: var(--app-border);
}

@media (min-width: 768px) {
	.sidebar {
		position: relative;
		z-index: auto;
		width: var(--sw, 220px);
		flex: 0 0 var(--sw, 220px);
		transform: translateX(0);
		transition:
			width 180ms cubic-bezier(0.16, 1, 0.3, 1),
			flex-basis 180ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.sidebar.closed {
		width: 0;
		flex-basis: 0;
		border-right-width: 0;
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
	.sidebar-reopen,
	.sidebar button:not(:disabled),
	.sidebar a {
		transition: none;
		animation: none;
	}
}
`;

export default function Sidebar() {
	const open = useStore(sidebarOpen);
	const width = useStore(sidebarWidth);

	const [showSearch, setShowSearch] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');

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

	function openSettings(tab: SettingsTab = 'general') {
		setSettingsTab(tab);
		setShowSettings(true);
	}

	useEffect(() => {
		function handleKeydown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const typing =
				target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
			if (typing && !(event.metaKey || event.ctrlKey)) return;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setShowSearch((value) => !value);
			}
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	}, []);

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
					<SidebarNav onopensearch={() => setShowSearch(true)} />
					<SidebarFooter onsettings={openSettings} />
				</div>
			</aside>

			{!open && (
				<button
					className="sidebar-reopen"
					onClick={() => sidebarOpen.set(true)}
					aria-label="Open sidebar"
					ref={tooltip('Open sidebar')}
				>
					<span className="sidebar-icon sidebar-icon-open" aria-hidden="true"></span>
				</button>
			)}

			{showSettings && (
				<SettingsModal initialTab={settingsTab} onclose={() => setShowSettings(false)} />
			)}

			<SearchModal open={showSearch} onclose={() => setShowSearch(false)} />
		</>
	);
}
