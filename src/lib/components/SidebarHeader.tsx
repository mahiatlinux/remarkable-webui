import { useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeDeviceId, devices, sidebarOpen } from '$lib/stores';
import { useStore } from '$lib/store';
import { tooltip } from '$lib/tooltip';
import DropdownMenu from './DropdownMenu';
import Icon from './Icon';

const css = `
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

.sidebar-icon-close {
	-webkit-mask-image: url('/icons/panel-left-close.svg');
	mask-image: url('/icons/panel-left-close.svg');
}

.status-dot {
	width: 0.375rem;
	height: 0.375rem;
	border-radius: 624.9375rem;
	background: var(--app-fg-faint);
	flex-shrink: 0;
}

.status-dot.connected {
	background: #3ba55d;
}

.status-dot.connecting {
	background: #d9a439;
	animation: status-pulse 1s ease-in-out infinite;
}

.status-dot.error {
	background: #d64545;
}

@keyframes status-pulse {
	50% {
		opacity: 0.3;
	}
}
`;

export default function SidebarHeader() {
	const navigate = useNavigate();
	const list = useStore(devices);
	const active = useStore(activeDeviceId);
	const current = list.find((device) => device.id === active);
	const [showMenu, setShowMenu] = useState(false);
	const buttonEl = useRef<HTMLButtonElement | null>(null);

	function goHome(e: MouseEvent<HTMLAnchorElement>) {
		e.preventDefault();
		navigate('/');
		if (window.innerWidth < 768) sidebarOpen.set(false);
	}

	return (
		<>
			<style href="sidebar-header-css" precedence="default">
				{css}
			</style>
			<div className="flex items-center justify-between h-9 pl-3.5 pr-1.5 shrink-0">
				<a
					href="/"
					className="flex items-center gap-1.5 text-sm font-extrabold tracking-tight text-gray-900 dark:text-white"
					onClick={goHome}
				>
					<Icon name="tablet" size={14} />
					reMarkable
				</a>
				<button
					className="flex items-center justify-center w-7 h-7 rounded-full text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors duration-100"
					onClick={() => sidebarOpen.set(false)}
					aria-label="Collapse sidebar"
					ref={tooltip('Collapse sidebar')}
				>
					<span className="sidebar-icon sidebar-icon-close" aria-hidden="true"></span>
				</button>
			</div>
			<div className="px-1.5 mb-1 shrink-0">
				<button
					ref={buttonEl}
					className="app-surface flex items-center gap-2 w-full h-8 px-3 rounded-full border text-xs transition-colors duration-100"
					onClick={() => setShowMenu((value) => !value)}
				>
					<span className={`status-dot ${current?.status ?? ''}`}></span>
					<span className="flex-1 min-w-0 text-left truncate">
						{current ? current.name : 'Select a device'}
					</span>
					<Icon name="chevron-down" size={12} class="app-icon-muted" />
				</button>
			</div>
			{showMenu && buttonEl.current && (
				<DropdownMenu
					anchor={buttonEl.current}
					matchWidth
					items={[
						...list.map((device) => ({
							label: device.name,
							tooltip: `${device.username}@${device.host}`,
							active: device.id === active,
							check: true,
							onclick: () => {
								activeDeviceId.set(device.id);
								navigate('/library');
							}
						})),
						...(list.length ? [{ divider: true, label: '', onclick: () => {} }] : []),
						{ label: 'Manage devices', icon: 'settings', onclick: () => navigate('/devices') }
					]}
					onclose={() => setShowMenu(false)}
				/>
			)}
		</>
	);
}
