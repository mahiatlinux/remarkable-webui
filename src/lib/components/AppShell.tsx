import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { sidebarOpen } from '$lib/stores';
import type { SettingsTab } from './SettingsModal';
import Sidebar from './Sidebar';
import Titlebar from './Titlebar';

const SearchModal = lazy(() => import('./SearchModal'));
const SettingsModal = lazy(() => import('./SettingsModal'));

export default function AppShell({ children }: { children: ReactNode }) {
	const [search, setSearch] = useState(false);
	const [settings, setSettings] = useState<SettingsTab | null>(null);
	useEffect(() => {
		function keydown(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey)) return;
			if (event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setSearch((value) => !value);
			} else if (event.key === '\\') {
				event.preventDefault();
				sidebarOpen.set(!sidebarOpen.get());
			} else if (event.key === ',') {
				event.preventDefault();
				setSettings('general');
			}
		}
		window.addEventListener('keydown', keydown);
		return () => window.removeEventListener('keydown', keydown);
	}, []);
	return (
		<div className="app-theme app-page app-shell">
			<Titlebar onsearch={() => setSearch(true)} onsettings={() => setSettings('general')} />
			<div className="app-workspace">
				<Sidebar
					onsearch={() => setSearch(true)}
					onsettings={(tab = 'general') => setSettings(tab)}
				/>
				<div id="main-col" className="app-main">
					<main className="app-board">{children}</main>
				</div>
			</div>
			<Suspense fallback={null}>
				{search && <SearchModal open onclose={() => setSearch(false)} />}
				{settings && <SettingsModal initialTab={settings} onclose={() => setSettings(null)} />}
			</Suspense>
		</div>
	);
}
