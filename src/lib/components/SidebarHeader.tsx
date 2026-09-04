import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeDeviceId, devices } from '$lib/stores';
import { useStore } from '$lib/store';
import DropdownMenu from './DropdownMenu';
import Icon from './Icon';

const css = `
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

	return (
		<>
			<style href="sidebar-header-css" precedence="default">
				{css}
			</style>
			<div className="device-switcher">
				<button
					ref={buttonEl}
					className="device-switcher-trigger"
					aria-expanded={showMenu}
					aria-controls={showMenu ? 'device-switcher-menu' : undefined}
					onClick={() => setShowMenu((value) => !value)}
				>
					<span className={`status-dot ${current?.status ?? ''}`}></span>
					<span className="flex-1 min-w-0 text-left truncate">
						{current ? current.name : 'Select a device'}
					</span>
					<Icon name="chevron-down" size={12} class="device-switcher-chevron app-icon-muted" />
				</button>
			</div>
			{showMenu && buttonEl.current && (
				<DropdownMenu
					id="device-switcher-menu"
					className="device-switcher-menu"
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
						{ label: 'Manage devices', icon: 'sliders', onclick: () => navigate('/devices') }
					]}
					onclose={() => setShowMenu(false)}
				/>
			)}
		</>
	);
}
