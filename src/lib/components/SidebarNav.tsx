import { useEffect, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { activeDeviceId, developerNavOpen, library, sidebarOpen } from '$lib/stores';
import { useStore } from '$lib/store';
import Icon, { itemIcon } from './Icon';

const css = `
kbd.sidebar-nav-kbd {
	border-radius: 0.35rem;
	background: var(--app-hover);
	padding: 0.12rem 0.3rem;
	font-family: var(--font-mono);
	font-size: 0.62rem;
	color: var(--app-fg-subtle);
}

.sidebar-nav-link {
	color: var(--app-fg-muted);
}

.sidebar-nav-link:hover {
	color: var(--app-fg);
}

.sidebar-nav-link.active {
	color: var(--app-fg);
	background: var(--app-surface);
	box-shadow: inset 0 0 0 1px var(--app-border);
}
`;

const NAV = [
	{ path: '/library', label: 'Library', icon: 'notebook' },
	{ path: '/device', label: 'Device', icon: 'tablet' },
	{ path: '/screen', label: 'Screen', icon: 'monitor' },
	{ path: '/templates', label: 'Templates', icon: 'grid' }
];

const DEVELOPER_NAV = [
	{ path: '/files', label: 'Files', icon: 'folder' },
	{ path: '/terminal', label: 'Terminal', icon: 'terminal' }
];

interface Props {
	onopensearch: () => void;
}

export default function SidebarNav({ onopensearch }: Props) {
	const navigate = useNavigate();
	const location = useLocation();
	const active = useStore(activeDeviceId);
	const items = useStore(library);
	const developerOpen = useStore(developerNavOpen);
	const inDeveloper = DEVELOPER_NAV.some((entry) => location.pathname.startsWith(entry.path));
	useEffect(() => {
		if (inDeveloper) developerNavOpen.set(true);
	}, [inDeveloper]);
	const pinned = [...items.values()]
		.filter((item) => item.pinned && item.parent !== 'trash')
		.sort((a, b) => a.name.localeCompare(b.name));

	function go(path: string) {
		return (e: MouseEvent<HTMLAnchorElement>) => {
			e.preventDefault();
			navigate(path);
			if (window.innerWidth < 768) sidebarOpen.set(false);
		};
	}

	const linkClass =
		'sidebar-nav-link flex items-center gap-1.5 w-full h-7 px-2 rounded-full text-xs transition-colors duration-100 no-underline';

	return (
		<>
			<style href="sidebar-nav-css" precedence="default">
				{css}
			</style>
			<div className="px-1.5 mt-1 shrink-0">
				<button
					className="group flex items-center gap-1.5 w-full h-7 px-2 rounded-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-100"
					onClick={onopensearch}
					disabled={!active}
				>
					<Icon name="search" size={14} />
					<span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">
						Search
					</span>
					<kbd className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 sidebar-nav-kbd">
						⌘K
					</kbd>
				</button>
			</div>
			<div className="px-1.5 shrink-0 flex flex-col gap-px">
				{NAV.map((entry) => (
					<a
						key={entry.path}
						href={entry.path}
						className={`${linkClass} ${location.pathname.startsWith(entry.path) ? 'active' : ''} ${
							active ? '' : 'opacity-40 pointer-events-none'
						}`}
						onClick={go(entry.path)}
					>
						<Icon name={entry.icon} size={14} />
						<span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">
							{entry.label}
						</span>
					</a>
				))}
			</div>
			<div className="px-1.5 mt-2 shrink-0">
				<button
					className={`sidebar-nav-link flex items-center gap-1 w-full h-6 px-2 rounded-full text-[0.625rem] transition-colors duration-100 ${
						active ? '' : 'opacity-40 pointer-events-none'
					}`}
					onClick={() => developerNavOpen.set(!developerOpen)}
					aria-expanded={developerOpen}
				>
					<Icon name={developerOpen ? 'chevron-down' : 'chevron-right'} size={11} />
					<span className="flex-1 text-left">Developer</span>
				</button>
				{developerOpen && (
					<div className="flex flex-col gap-px mt-px">
						{DEVELOPER_NAV.map((entry) => (
							<a
								key={entry.path}
								href={entry.path}
								className={`${linkClass} ${location.pathname.startsWith(entry.path) ? 'active' : ''} ${
									active ? '' : 'opacity-40 pointer-events-none'
								}`}
								onClick={go(entry.path)}
							>
								<Icon name={entry.icon} size={14} />
								<span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">
									{entry.label}
								</span>
							</a>
						))}
					</div>
				)}
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-hover px-1.5 mt-3">
				{pinned.length > 0 && (
					<>
						<div className="px-2 mb-1 text-[0.625rem] text-gray-400 dark:text-gray-600">Pinned</div>
						<div className="flex flex-col gap-px">
							{pinned.map((item) => {
								const path = item.type === 'folder' ? `/library/${item.id}` : `/doc/${item.id}`;
								return (
									<a
										key={item.id}
										href={path}
										className={`${linkClass} ${location.pathname === path ? 'active' : ''}`}
										onClick={go(path)}
										title={item.name}
									>
										<Icon name={itemIcon(item.type)} size={13} />
										<span className="flex-1 text-left truncate">{item.name}</span>
									</a>
								);
							})}
						</div>
					</>
				)}
				{active && (
					<a
						href="/library/trash"
						className={`${linkClass} mt-3 ${location.pathname === '/library/trash' ? 'active' : ''}`}
						onClick={go('/library/trash')}
					>
						<Icon name="trash" size={13} />
						<span className="flex-1 text-left">Trash</span>
					</a>
				)}
			</div>
		</>
	);
}
