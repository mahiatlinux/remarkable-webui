import './app.css';

import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import Sidebar from '$lib/components/Sidebar';
import DevicesView from '$lib/components/DevicesView';
import LibraryView from '$lib/components/library/LibraryView';
import DocumentView from '$lib/components/document/DocumentView';
import FilesView from '$lib/components/files/FilesView';
import DeviceView from '$lib/components/device/DeviceView';
import TerminalView from '$lib/components/terminal/TerminalView';
import ScreenView from '$lib/components/screen/ScreenView';
import TemplatesView from '$lib/components/templates/TemplatesView';
import { connectDevice, refreshDevices } from '$lib/apis/devices';
import { connectEvents } from '$lib/apis/events';
import { loadLibrary } from '$lib/apis/library';
import { useStore } from '$lib/store';
import {
	activeDeviceId,
	borderContrast,
	devices,
	library,
	textScale,
	theme,
	themeConfig
} from '$lib/stores';
import { applyAppearance } from '$lib/utils/appearance';

function NotFound() {
	const location = useLocation();
	return (
		<div className="h-full flex items-center justify-center gap-3 text-sm">
			<span className="font-semibold">404</span>
			<span className="app-muted">Not found: {location.pathname}</span>
		</div>
	);
}

function RequireDevice({ children }: { children: React.ReactNode }) {
	const id = useStore(activeDeviceId);
	const list = useStore(devices);
	if (!id || !list.some((device) => device.id === id)) return <Navigate to="/" replace />;
	return <>{children}</>;
}

export default function App() {
	const active = useStore(activeDeviceId);
	const list = useStore(devices);
	const current = list.find((device) => device.id === active);
	const status = current?.status;

	useEffect(() => {
		const syncAppearance = () => {
			applyAppearance(theme.get(), themeConfig.get(), textScale.get(), borderContrast.get());
		};
		syncAppearance();
		const unsubscribers = [
			theme.subscribe(syncAppearance),
			themeConfig.subscribe(syncAppearance),
			textScale.subscribe(syncAppearance),
			borderContrast.subscribe(syncAppearance)
		];
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	}, []);

	useEffect(() => {
		refreshDevices().catch((error: Error) => toast.error(error.message));
		return connectEvents();
	}, []);

	useEffect(() => {
		if (!active || !current) return;
		if (status === 'disconnected') {
			connectDevice(active).catch((error: Error) => toast.error(error.message));
		} else if (status === 'connected') {
			void loadLibrary();
		} else if (status === 'error') {
			library.set(new Map());
		}
	}, [active, status]);

	return (
		<>
			<div className="app-theme app-page h-screen max-h-[100dvh] flex overflow-hidden font-sans antialiased">
				<Sidebar />

				<div
					id="main-col"
					className="app-gutter flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden"
					style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--app-gutter))' }}
				>
					<main className="app-board relative flex-1 min-h-0 overflow-hidden">
						<Routes>
							<Route
								path="/"
								element={current ? <Navigate to="/library" replace /> : <DevicesView />}
							/>
							<Route path="/devices" element={<DevicesView />} />
							<Route
								path="/library/:folderId?"
								element={
									<RequireDevice>
										<LibraryView />
									</RequireDevice>
								}
							/>
							<Route
								path="/doc/:id"
								element={
									<RequireDevice>
										<DocumentView />
									</RequireDevice>
								}
							/>
							<Route
								path="/files/*"
								element={
									<RequireDevice>
										<FilesView />
									</RequireDevice>
								}
							/>
							<Route
								path="/device"
								element={
									<RequireDevice>
										<DeviceView />
									</RequireDevice>
								}
							/>
							<Route
								path="/terminal"
								element={
									<RequireDevice>
										<TerminalView />
									</RequireDevice>
								}
							/>
							<Route
								path="/screen"
								element={
									<RequireDevice>
										<ScreenView />
									</RequireDevice>
								}
							/>
							<Route
								path="/templates"
								element={
									<RequireDevice>
										<TemplatesView />
									</RequireDevice>
								}
							/>
							<Route path="*" element={<NotFound />} />
						</Routes>
					</main>
				</div>
			</div>

			<Toaster
				position="top-right"
				theme="system"
				closeButton
				richColors
				toastOptions={{
					style: {
						fontSize: '0.75rem',
						fontFamily: 'var(--font-sans)',
						fontWeight: 700,
						borderRadius: '1rem'
					}
				}}
			/>
		</>
	);
}
