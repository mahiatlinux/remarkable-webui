import './app.css';

import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import AppShell from '$lib/components/AppShell';
import Spinner from '$lib/components/common/Spinner';
const DevicesView = lazy(() => import('$lib/components/DevicesView'));
const LibraryView = lazy(() => import('$lib/components/library/LibraryView'));
const DocumentView = lazy(() => import('$lib/components/document/DocumentView'));
const FilesView = lazy(() => import('$lib/components/files/FilesView'));
const DeviceView = lazy(() => import('$lib/components/device/DeviceView'));
const TerminalView = lazy(() => import('$lib/components/terminal/TerminalView'));
const ScreenView = lazy(() => import('$lib/components/screen/ScreenView'));
const TemplatesView = lazy(() => import('$lib/components/templates/TemplatesView'));
import { connectDevice, refreshDevices } from '$lib/apis/devices';
import { connectEvents } from '$lib/apis/events';
import { loadLibrary } from '$lib/apis/library';
import { useStore } from '$lib/store';
import { activeDeviceId, devices, devicesLoaded, library, theme } from '$lib/stores';

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
	const loaded = useStore(devicesLoaded);
	if (!loaded) return null;
	if (!id || !list.some((device) => device.id === id)) return <Navigate to="/" replace />;
	return <>{children}</>;
}

export default function App() {
	const active = useStore(activeDeviceId);
	const list = useStore(devices);
	const loaded = useStore(devicesLoaded);
	const current = list.find((device) => device.id === active);
	const status = current?.status;
	const appearance = useStore(theme);

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
			<AppShell>
				<Suspense
					fallback={
						<div className="route-loading" role="status" aria-label="Loading view">
							<Spinner size={20} />
						</div>
					}
				>
					<Routes>
						<Route
							path="/"
							element={
								!loaded ? null : current ? <Navigate to="/library" replace /> : <DevicesView />
							}
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
				</Suspense>
			</AppShell>

			<Toaster
				position="top-right"
				theme={appearance}
				closeButton
				richColors
				toastOptions={{
					style: {
						fontSize: '0.75rem',
						fontFamily: 'var(--font-sans)',
						fontWeight: 550,
						borderRadius: '1rem'
					}
				}}
			/>
		</>
	);
}
