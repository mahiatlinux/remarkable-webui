import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { activeDeviceId, appVersion, devices } from '$lib/stores';
import { useStore } from '$lib/store';
import { connectDevice, disconnectDevice } from '$lib/apis/devices';
import { restartXochitl } from '$lib/apis/library';
import DropdownMenu from './DropdownMenu';
import Icon from './Icon';
import type { SettingsTab } from './SettingsModal';

interface Props {
	onsettings: (tab?: SettingsTab) => void;
}

export default function SidebarFooter({ onsettings }: Props) {
	const navigate = useNavigate();
	const list = useStore(devices);
	const active = useStore(activeDeviceId);
	const version = useStore(appVersion);
	const current = list.find((device) => device.id === active);
	const [showMenu, setShowMenu] = useState(false);
	const menuButtonEl = useRef<HTMLButtonElement | null>(null);

	async function restart() {
		try {
			await restartXochitl();
			toast.success('xochitl restarted');
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	const statusLabel = !current
		? 'No device'
		: current.status === 'connected'
			? (current.model ?? 'Connected')
			: current.status === 'connecting'
				? 'Connecting…'
				: current.status === 'error'
					? 'Connection failed'
					: 'Disconnected';

	return (
		<>
			{current?.pendingRestart && (
				<div className="mx-1.5 mb-1 px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-[0.6875rem] text-gray-600 dark:text-gray-400">
					<div className="flex items-center gap-1.5">
						<Icon name="warning" size={12} />
						<span className="flex-1">Changes not yet visible on the tablet</span>
					</div>
					<button className="mt-1 text-gray-900 dark:text-white hover:underline" onClick={restart}>
						Restart xochitl now
					</button>
				</div>
			)}
			<div className="relative mt-auto px-1 pb-0.5 shrink-0">
				<button
					ref={menuButtonEl}
					className="flex items-center gap-2 w-full h-8 px-2 pr-10 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-100"
					onClick={() => setShowMenu((value) => !value)}
				>
					<span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-white/10 shrink-0">
						<Icon name="tablet" size={12} />
					</span>
					<span className="truncate">{statusLabel}</span>
				</button>
				{version && (
					<span className="absolute right-2 top-1/2 -translate-y-1/2 text-[0.625rem] text-gray-400 dark:text-gray-600 font-mono">
						v{version}
					</span>
				)}
			</div>
			{showMenu && menuButtonEl.current && (
				<DropdownMenu
					anchor={menuButtonEl.current}
					matchWidth
					preferAbove
					items={[
						...(current
							? [
									current.status === 'connected'
										? {
												label: 'Disconnect',
												icon: 'cloud-off',
												onclick: () =>
													disconnectDevice(current.id).catch((error: Error) =>
														toast.error(error.message)
													)
											}
										: {
												label: 'Connect',
												icon: 'link',
												onclick: () =>
													connectDevice(current.id).catch((error: Error) =>
														toast.error(error.message)
													)
											},
									{
										label: 'Restart xochitl',
										icon: 'refresh',
										onclick: restart
									},
									{ divider: true, label: '', onclick: () => {} }
								]
							: []),
						{ label: 'Devices', icon: 'tablet', onclick: () => navigate('/devices') },
						{ label: 'Settings', icon: 'settings', onclick: () => onsettings() }
					]}
					onclose={() => setShowMenu(false)}
				/>
			)}
		</>
	);
}
