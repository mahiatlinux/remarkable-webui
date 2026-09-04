import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';
import { desktop, macOS } from '$lib/desktop';
import { useStore } from '$lib/store';
import { activeDeviceId, sidebarOpen } from '$lib/stores';
import { tooltip } from '$lib/tooltip';
import Icon from './Icon';

export default function Titlebar({
	onsearch,
	onsettings
}: {
	onsearch: () => void;
	onsettings: () => void;
}) {
	const open = useStore(sidebarOpen);
	const active = useStore(activeDeviceId);
	const navigate = useNavigate();
	const location = useLocation();
	const [maximized, setMaximized] = useState(false);
	const [focused, setFocused] = useState(true);

	useEffect(() => {
		if (!desktop) return;
		const window = getCurrentWindow();
		let disposed = false;
		const update = () => window.isMaximized().then((value) => !disposed && setMaximized(value));
		void update();
		const resized = window.onResized(() => void update());
		const focus = window.onFocusChanged(({ payload }) => setFocused(payload));
		return () => {
			disposed = true;
			void resized.then((unlisten) => unlisten());
			void focus.then((unlisten) => unlisten());
		};
	}, []);

	function control(action: 'minimize' | 'toggleMaximize' | 'close') {
		void getCurrentWindow()
			[action]()
			.catch((error: unknown) => toast.error(String(error)));
	}

	return (
		<header className={`titlebar ${macOS ? 'macos' : ''} ${focused ? '' : 'unfocused'}`}>
			<div className="titlebar-actions">
				<button
					className="titlebar-button sidebar-toggle"
					onClick={() => sidebarOpen.set(!open)}
					aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
					aria-expanded={open}
					aria-controls="app-sidebar"
					ref={tooltip('Toggle sidebar (⌘ / Ctrl + \\)')}
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<rect
							className="sidebar-toggle-rail"
							x="3"
							y="4.5"
							width="5"
							height="15"
							rx="2"
							fill="currentColor"
						/>
						<rect x="11" y="4.5" width="10" height="15" rx="2" fill="currentColor" opacity="0.25" />
					</svg>
				</button>
				<button
					className="titlebar-button"
					onClick={() => navigate(-1)}
					disabled={!window.history.state?.idx}
					aria-label="Go back"
					ref={tooltip('Go back')}
					key={location.key}
				>
					<Icon name="chevron-left" size={16} strokeWidth={1.7} />
				</button>
			</div>
			<div className="titlebar-drag" data-tauri-drag-region={desktop || undefined}>
				<span className="titlebar-brand" data-tauri-drag-region={desktop || undefined}>
					reMarkable
				</span>
			</div>
			<div className="titlebar-actions">
				<button
					className="titlebar-button"
					onClick={onsearch}
					disabled={!active}
					aria-label="Search documents"
					ref={tooltip('Search documents')}
				>
					<Icon name="search" size={16} strokeWidth={1.7} />
				</button>
				<button
					className="titlebar-button"
					onClick={onsettings}
					aria-label="Settings"
					ref={tooltip('Settings')}
				>
					<Icon name="sliders" size={16} strokeWidth={1.7} />
				</button>
			</div>
			{desktop && !macOS && (
				<div className="window-controls">
					<button onClick={() => control('minimize')} aria-label="Minimize window">
						<Icon name="minus" size={16} strokeWidth={1.7} />
					</button>
					<button
						onClick={() => control('toggleMaximize')}
						aria-label={maximized ? 'Restore window' : 'Maximize window'}
					>
						<Icon
							name={maximized ? 'window-restore' : 'window-maximize'}
							size={15}
							strokeWidth={1.7}
						/>
					</button>
					<button
						className="window-close"
						onClick={() => control('close')}
						aria-label="Close window"
					>
						<Icon name="xmark" size={16} strokeWidth={1.7} />
					</button>
				</div>
			)}
		</header>
	);
}
